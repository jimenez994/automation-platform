//! Starting, watching and cancelling a workspace scan.
//!
//! A scan runs on its own thread with its own database connection, so it never
//! holds the application lock and the UI stays responsive. WAL mode is what
//! makes the second connection safe.

use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::cases::{ActivityLine, CaseSyncService, ProgressSink, ScanOutcome, ScanPhase, ScanProgress};
use crate::database;
use crate::menu;
use crate::state::{AppState, ScanStatus};

/// Progress snapshots. Throttled, because a fast workspace would otherwise
/// deliver thousands of these.
pub const SCAN_PROGRESS: &str = "scan://progress";
/// One line of the live activity log.
pub const SCAN_ACTIVITY: &str = "scan://activity";
/// Fired exactly once per scan, whatever the outcome.
pub const SCAN_FINISHED: &str = "scan://finished";

/// Payload of [`SCAN_FINISHED`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanFinished {
    /// `completed`, `cancelled` or `failed`.
    pub status: ScanPhase,
    pub outcome: Option<ScanOutcome>,
    pub error: Option<String>,
}

/// Forwards scanner progress to the frontend as Tauri events.
struct EventSink<R: Runtime> {
    app: AppHandle<R>,
    last_emit: Instant,
    last_phase: Option<ScanPhase>,
}

impl<R: Runtime> EventSink<R> {
    fn new(app: AppHandle<R>) -> Self {
        Self {
            app,
            // Far enough in the past that the first update always goes out.
            last_emit: Instant::now() - Duration::from_secs(1),
            last_phase: None,
        }
    }
}

/// Minimum gap between progress events within a phase.
const EMIT_INTERVAL: Duration = Duration::from_millis(50);

impl<R: Runtime> ProgressSink for EventSink<R> {
    fn progress(&mut self, progress: &ScanProgress) {
        // A phase change and the final update always go out; the rest are
        // rate-limited so a workspace that scans in milliseconds does not
        // flood the frontend with updates it cannot render.
        let phase_changed = self.last_phase != Some(progress.phase);
        let due = self.last_emit.elapsed() >= EMIT_INTERVAL;

        if !phase_changed && !due && !progress.phase.is_terminal() {
            return;
        }

        self.last_phase = Some(progress.phase);
        self.last_emit = Instant::now();

        if let Err(error) = self.app.emit(SCAN_PROGRESS, progress) {
            eprintln!("[automation-platform] could not emit scan progress: {error}");
        }
    }

    fn activity(&mut self, line: &ActivityLine) {
        if let Err(error) = self.app.emit(SCAN_ACTIVITY, line) {
            eprintln!("[automation-platform] could not emit scan activity: {error}");
        }
    }
}

/// Starts a scan of the open workspace.
///
/// Returns as soon as the scan has started; progress arrives as events. Calling
/// it while a scan is running is rejected rather than queued — two scans would
/// be two writers racing over the same rows.
#[tauri::command]
pub fn start_scan(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let session = state.begin_scan()?;

    // The menu reflects the new state immediately, so Scan and Change Workspace
    // grey out for the duration.
    if let Err(error) = menu::refresh(&app) {
        eprintln!("[automation-platform] could not refresh the menu: {error}");
    }

    let worker = app.clone();
    std::thread::spawn(move || {
        let mut sink = EventSink::new(worker.clone());

        let finished = match database::open(&session.database_path) {
            Ok(mut conn) => {
                match CaseSyncService::scan_workspace_reporting(
                    &session.root,
                    &mut conn,
                    &mut sink,
                    &session.cancel,
                ) {
                    Ok(outcome) => ScanFinished {
                        status: outcome.status,
                        outcome: Some(outcome),
                        error: None,
                    },
                    Err(error) => {
                        eprintln!("[automation-platform] scan failed: {error}");
                        ScanFinished {
                            status: ScanPhase::Failed,
                            outcome: None,
                            error: Some(error),
                        }
                    }
                }
            }
            Err(error) => {
                eprintln!("[automation-platform] scan could not open the database: {error}");
                ScanFinished {
                    status: ScanPhase::Failed,
                    outcome: None,
                    error: Some(error),
                }
            }
        };

        // The running flag is cleared before the event goes out, so a frontend
        // that reacts by starting another scan is not rejected for a scan that
        // has already ended.
        worker
            .state::<AppState>()
            .finish_scan(finished.outcome.clone());

        if let Err(error) = menu::refresh(&worker) {
            eprintln!("[automation-platform] could not refresh the menu: {error}");
        }

        if let Err(error) = worker.emit(SCAN_FINISHED, &finished) {
            eprintln!("[automation-platform] could not emit the scan result: {error}");
        }
    });

    Ok(())
}

/// Asks the running scan to stop.
///
/// The scanner stops at the next folder boundary and keeps what it has already
/// written; no record is deleted and nothing is left half-written.
#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>) -> Result<(), String> {
    state.cancel_scan()
}

/// Whether a scan is running, and the result of the last one.
#[tauri::command]
pub fn scan_status(state: State<'_, AppState>) -> Result<ScanStatus, String> {
    state.scan_status()
}
