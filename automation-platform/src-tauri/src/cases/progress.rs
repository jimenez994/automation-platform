//! Progress reporting and cancellation for a scan.
//!
//! The scanner pushes progress into a [`ProgressSink`] rather than knowing
//! anything about Tauri events. The application plugs in a sink that emits
//! events to the frontend; the tests plug in one that records everything, which
//! is what makes the phase transitions testable without a running application.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;

use crate::util::now_iso8601;

/// Stage a scan is in. Reported to the frontend so it can show the checklist.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScanPhase {
    Initializing,
    DiscoveringCases,
    ScanningDocuments,
    UpdatingDatabase,
    Finalizing,
    Completed,
    Cancelled,
    Failed,
}

impl ScanPhase {
    /// Human-readable label, used in the activity log.
    pub fn label(self) -> &'static str {
        match self {
            ScanPhase::Initializing => "Initializing",
            ScanPhase::DiscoveringCases => "Discovering Cases",
            ScanPhase::ScanningDocuments => "Scanning Documents",
            ScanPhase::UpdatingDatabase => "Updating Database",
            ScanPhase::Finalizing => "Finalizing",
            ScanPhase::Completed => "Completed",
            ScanPhase::Cancelled => "Cancelled",
            ScanPhase::Failed => "Failed",
        }
    }

    /// True once the scan has stopped, whatever the reason.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            ScanPhase::Completed | ScanPhase::Cancelled | ScanPhase::Failed
        )
    }
}

/// A snapshot of an in-flight scan.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub phase: ScanPhase,
    /// Folder currently being read, once one is.
    pub current_case: Option<String>,
    /// How many case folders have been processed.
    pub current_index: i64,
    /// How many were discovered. Zero until discovery finishes.
    pub total_cases: i64,
    /// Running total of documents counted so far.
    pub files_discovered: i64,
    pub created: i64,
    pub updated: i64,
    pub unchanged: i64,
    pub skipped: i64,
    pub warnings: i64,
    pub errors: i64,
    pub elapsed_ms: u64,
    /// Null until there is enough information for an honest estimate; the UI
    /// shows "Calculating remaining time..." rather than a made-up number.
    pub estimated_remaining_ms: Option<u64>,
}

impl ScanProgress {
    pub fn initial() -> Self {
        Self {
            phase: ScanPhase::Initializing,
            current_case: None,
            current_index: 0,
            total_cases: 0,
            files_discovered: 0,
            created: 0,
            updated: 0,
            unchanged: 0,
            skipped: 0,
            warnings: 0,
            errors: 0,
            elapsed_ms: 0,
            estimated_remaining_ms: None,
        }
    }

    /// Fraction of the work done, 0.0 to 1.0. `None` while the total is still
    /// unknown, so the UI can show an indeterminate bar instead of a fake one.
    pub fn fraction(&self) -> Option<f64> {
        if self.total_cases <= 0 {
            return None;
        }

        Some((self.current_index as f64 / self.total_cases as f64).clamp(0.0, 1.0))
    }

    /// Estimates the remaining time from the average so far.
    ///
    /// Deliberately returns `None` until a few folders are done: the first
    /// folders are not representative, and a wildly wrong ETA is worse than no
    /// ETA at all.
    pub fn estimate_remaining(&mut self) {
        const MIN_SAMPLES: i64 = 3;

        if self.current_index < MIN_SAMPLES || self.total_cases <= 0 {
            self.estimated_remaining_ms = None;
            return;
        }

        let remaining = self.total_cases - self.current_index;
        if remaining <= 0 {
            self.estimated_remaining_ms = Some(0);
            return;
        }

        let per_case = self.elapsed_ms as f64 / self.current_index as f64;
        self.estimated_remaining_ms = Some((per_case * remaining as f64).round() as u64);
    }
}

/// Severity of an activity line.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActivityLevel {
    Info,
    Warning,
    Error,
}

/// One line of the live activity log shown under "Show Details".
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityLine {
    pub timestamp: String,
    pub level: ActivityLevel,
    pub message: String,
}

impl ActivityLine {
    pub fn new(level: ActivityLevel, message: impl Into<String>) -> Self {
        Self {
            timestamp: now_iso8601(),
            level,
            message: message.into(),
        }
    }

    pub fn info(message: impl Into<String>) -> Self {
        Self::new(ActivityLevel::Info, message)
    }

    pub fn warning(message: impl Into<String>) -> Self {
        Self::new(ActivityLevel::Warning, message)
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self::new(ActivityLevel::Error, message)
    }
}

/// Where a scan sends its progress.
pub trait ProgressSink: Send {
    fn progress(&mut self, progress: &ScanProgress);
    fn activity(&mut self, line: &ActivityLine);
}

/// Discards everything. Used by callers that only want the final report.
pub struct NoopSink;

impl ProgressSink for NoopSink {
    fn progress(&mut self, _progress: &ScanProgress) {}
    fn activity(&mut self, _line: &ActivityLine) {}
}

/// Records everything, for tests.
#[derive(Debug, Default)]
pub struct RecordingSink {
    pub phases: Vec<ScanPhase>,
    pub updates: Vec<ScanProgress>,
    pub activity: Vec<ActivityLine>,
}

impl ProgressSink for RecordingSink {
    fn progress(&mut self, progress: &ScanProgress) {
        if self.phases.last() != Some(&progress.phase) {
            self.phases.push(progress.phase);
        }
        self.updates.push(progress.clone());
    }

    fn activity(&mut self, line: &ActivityLine) {
        self.activity.push(line.clone());
    }
}

/// Cooperative cancellation.
///
/// The scanner checks this between case folders, so cancelling never
/// interrupts a folder half-way; the work already done is valid and is kept.
#[derive(Debug, Clone, Default)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }

    /// Clears the flag so the token can be reused for the next scan.
    pub fn reset(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
