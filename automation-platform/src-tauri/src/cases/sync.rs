//! `CaseSyncService` — reconciles the workspace folder with the database.
//!
//! The filesystem is authoritative for filesystem-derived fields
//! (`folder_path`, `document_count`, `last_scanned_at`, and the name until the
//! user edits it). It is never authoritative for `status`, `priority` or
//! `jurisdiction`: those belong to the user and the scanner does not write
//! them.
//!
//! The scan is read-only with respect to the user's documents. It lists
//! directories and counts files; it never opens, moves, renames or deletes
//! anything.

use std::collections::HashSet;
use std::path::Path;
use std::time::Instant;

use rusqlite::Connection;
use serde::Serialize;

use crate::database::cases::{self, UpsertOutcome};
use crate::database::meta;
use crate::database::models::ScannedCase;
use crate::filesystem::{count_documents, list_case_directories, CandidateFolder};
use crate::util::now_iso8601;

use super::parser::{parse_folder_name, ParseOutcome};
use super::progress::{
    ActivityLine, CancelToken, NoopSink, ProgressSink, ScanPhase, ScanProgress,
};

/// A problem with one folder. Warnings never abort a scan.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanWarning {
    /// Folder the warning is about, when it relates to a specific one.
    pub folder: Option<String>,
    pub message: String,
}

/// What a scan did, shown to the user when it finishes.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub scanned_at: String,
    pub duration_ms: u64,
    /// Child directories inspected.
    pub folders_found: i64,
    /// Directories that parsed as a case.
    pub cases_found: i64,
    pub created: i64,
    pub updated: i64,
    pub unchanged: i64,
    /// Folders that did not look like a case and were skipped.
    pub skipped: i64,
    /// Cases in the database whose folder was not seen during this scan.
    ///
    /// They are reported, never deleted — a folder can be missing because a
    /// drive is not mounted, and silently dropping the user's records over that
    /// would be destructive.
    pub missing: i64,
    /// Documents counted across every case folder in this scan.
    pub documents_found: i64,
    /// Cases that could not be written. The scan continues past them.
    pub errors: i64,
    pub warnings: Vec<ScanWarning>,
}

impl ScanReport {
    fn new(scanned_at: String) -> Self {
        Self {
            scanned_at,
            ..Default::default()
        }
    }

    fn warn(&mut self, folder: Option<&str>, message: impl Into<String>) {
        self.warnings.push(ScanWarning {
            folder: folder.map(str::to_string),
            message: message.into(),
        });
    }
}

/// How a scan ended, and what it did.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanOutcome {
    /// `completed` or `cancelled`.
    pub status: ScanPhase,
    pub report: ScanReport,
}

impl ScanOutcome {
    pub fn was_cancelled(&self) -> bool {
        self.status == ScanPhase::Cancelled
    }
}

/// A folder that parsed as a case, before its documents have been counted.
struct PendingCase {
    folder: CandidateFolder,
    case_number: String,
    name: String,
}

/// Synchronises a workspace folder with its database.
pub struct CaseSyncService;

impl CaseSyncService {
    /// Scans every case folder in the workspace, without progress reporting.
    pub fn scan_workspace(root: &Path, conn: &mut Connection) -> Result<ScanReport, String> {
        Self::scan_workspace_with_cancel_check(
            root,
            conn,
            &mut NoopSink,
            &CancelToken::new(),
            &mut |cancel, _index| cancel.is_cancelled(),
        )
        .map(|outcome| outcome.report)
    }

    /// Scans every immediate child directory of the workspace root, reporting
    /// progress as it goes and stopping cleanly if `cancel` is triggered.
    ///
    /// Discovery is a separate pass so the total is known before the slow part
    /// starts: without it the progress bar would have no honest denominator.
    ///
    /// The writes run in one transaction. Cancelling commits what has already
    /// been scanned — those rows are complete and correct — but does not record
    /// the scan as finished, so nothing is left half-updated and no record is
    /// ever deleted.
    pub fn scan_workspace_reporting(
        root: &Path,
        conn: &mut Connection,
        sink: &mut dyn ProgressSink,
        cancel: &CancelToken,
    ) -> Result<ScanOutcome, String> {
        Self::scan_workspace_with_cancel_check(
            root,
            conn,
            sink,
            cancel,
            &mut |cancel, _index| cancel.is_cancelled(),
        )
    }

    /// Test helper: the scan loop with an injected cancellation check, so tests
    /// can cancel on a specific folder rather than a timer.
    #[doc(hidden)]
    pub fn scan_workspace_with_cancel_check_for_test(
        root: &Path,
        conn: &mut Connection,
        sink: &mut dyn ProgressSink,
        cancel: &CancelToken,
        should_cancel: &mut dyn FnMut(&CancelToken, usize) -> bool,
    ) -> Result<ScanOutcome, String> {
        Self::scan_workspace_with_cancel_check(root, conn, sink, cancel, &mut |_cancel, index| {
            should_cancel(cancel, index)
        })
    }

    /// The scan loop, with the cancellation check injected.
    ///
    /// The production paths pass a check that reads the cancel token; the tests
    /// pass one that fires on a specific folder, which makes mid-scan
    /// cancellation deterministic instead of timing-dependent.
    fn scan_workspace_with_cancel_check(
        root: &Path,
        conn: &mut Connection,
        sink: &mut dyn ProgressSink,
        cancel: &CancelToken,
        should_cancel: &mut dyn FnMut(&CancelToken, usize) -> bool,
    ) -> Result<ScanOutcome, String> {
        let started = Instant::now();
        let scanned_at = now_iso8601();
        let mut report = ScanReport::new(scanned_at.clone());
        let mut progress = ScanProgress::initial();

        let emit = |sink: &mut dyn ProgressSink, progress: &mut ScanProgress, started: &Instant| {
            progress.elapsed_ms = started.elapsed().as_millis() as u64;
            progress.estimate_remaining();
            sink.progress(progress);
        };

        // ---- Initializing
        sink.activity(&ActivityLine::info(format!(
            "Scanning {}",
            root.display()
        )));
        emit(sink, &mut progress, &started);

        // ---- Discovering cases
        progress.phase = ScanPhase::DiscoveringCases;
        emit(sink, &mut progress, &started);

        let (folders, listing_warnings) = list_case_directories(root)?;
        report.folders_found = folders.len() as i64;
        for message in listing_warnings {
            report.warn(None, message.clone());
            sink.activity(&ActivityLine::warning(message));
        }

        let mut seen: HashSet<String> = HashSet::new();
        let mut pending: Vec<PendingCase> = Vec::new();

        for folder in folders {
            match parse_folder_name(&folder.folder_name) {
                ParseOutcome::Case { case_number, name } => {
                    // Two folders can carry the same case number; `case_number`
                    // is unique, so the second is reported rather than allowed
                    // to fail the insert.
                    if !seen.insert(case_number.clone()) {
                        report.skipped += 1;
                        let message = format!(
                            "case number `{case_number}` is already used by another folder"
                        );
                        report.warn(Some(&folder.folder_name), message.clone());
                        sink.activity(&ActivityLine::warning(format!(
                            "{}: {message}",
                            folder.folder_name
                        )));
                        continue;
                    }

                    pending.push(PendingCase {
                        folder,
                        case_number,
                        name,
                    });
                }
                ParseOutcome::Unrecognised { reason } => {
                    report.skipped += 1;
                    report.warn(Some(&folder.folder_name), reason.clone());
                    sink.activity(&ActivityLine::warning(format!(
                        "{}: {reason}",
                        folder.folder_name
                    )));
                }
            }
        }

        progress.total_cases = pending.len() as i64;
        progress.skipped = report.skipped;
        progress.warnings = report.warnings.len() as i64;
        sink.activity(&ActivityLine::info(format!(
            "Found {} case {}",
            pending.len(),
            if pending.len() == 1 { "folder" } else { "folders" }
        )));
        emit(sink, &mut progress, &started);

        let known_before: HashSet<String> = cases::all_case_numbers(conn)?.into_iter().collect();

        // ---- Scanning documents / updating records
        progress.phase = ScanPhase::ScanningDocuments;
        emit(sink, &mut progress, &started);

        let tx = conn
            .transaction()
            .map_err(|e| format!("could not start the scan transaction: {e}"))?;

        let mut cancelled = false;
        let mut scanned_numbers: HashSet<String> = HashSet::new();
        let mut processed: usize = 0;

        for case in pending {
            // Checked between folders, so a folder is never left half-scanned.
            if should_cancel(cancel, processed) {
                cancelled = true;
                sink.activity(&ActivityLine::warning("Scan cancelled by the user"));
                break;
            }

            progress.current_case = Some(case.folder.folder_name.clone());
            emit(sink, &mut progress, &started);

            let counted = count_documents(&case.folder.path);
            for message in counted.warnings {
                report.warn(Some(&case.folder.folder_name), message.clone());
                sink.activity(&ActivityLine::warning(format!(
                    "{}: {message}",
                    case.folder.folder_name
                )));
            }

            report.documents_found += counted.files;
            progress.files_discovered = report.documents_found;

            let scanned = ScannedCase {
                case_number: case.case_number.clone(),
                name: case.name,
                folder_path: case.folder.folder_name.clone(),
                document_count: counted.files,
            };

            // A row that cannot be written is reported and skipped; one bad
            // case must not throw away the rest of the scan.
            match cases::upsert_scanned(&tx, &scanned, &scanned_at) {
                Ok(outcome) => {
                    match outcome {
                        UpsertOutcome::Created => report.created += 1,
                        UpsertOutcome::Updated => report.updated += 1,
                        UpsertOutcome::Unchanged => report.unchanged += 1,
                    }
                    report.cases_found += 1;
                    scanned_numbers.insert(case.case_number.clone());

                    sink.activity(&ActivityLine::info(format!(
                        "{} — {} {}",
                        case.case_number,
                        counted.files,
                        if counted.files == 1 { "document" } else { "documents" }
                    )));
                }
                Err(error) => {
                    report.errors += 1;
                    report.warn(Some(&case.folder.folder_name), error.clone());
                    sink.activity(&ActivityLine::error(error));
                }
            }

            processed += 1;
            progress.current_index = processed as i64;
            progress.created = report.created;
            progress.updated = report.updated;
            progress.unchanged = report.unchanged;
            progress.warnings = report.warnings.len() as i64;
            progress.errors = report.errors;
            emit(sink, &mut progress, &started);
        }

        // ---- Committing
        progress.phase = ScanPhase::UpdatingDatabase;
        progress.current_case = None;
        emit(sink, &mut progress, &started);

        // A cancelled scan is not a completed one, so the workspace keeps its
        // previous "last scanned" time.
        if !cancelled {
            meta::set(&tx, meta::LAST_SCAN_AT, &scanned_at)?;
        }

        tx.commit()
            .map_err(|e| format!("could not commit the scan: {e}"))?;

        // ---- Finalizing
        progress.phase = ScanPhase::Finalizing;
        emit(sink, &mut progress, &started);

        // Only a full scan can tell whether a case is missing; a cancelled one
        // simply did not look at the rest.
        if !cancelled {
            for case_number in known_before.difference(&scanned_numbers) {
                report.missing += 1;
                let message =
                    format!("`{case_number}` is in the database but its folder was not found");
                report.warn(None, message.clone());
                sink.activity(&ActivityLine::warning(message));
            }
        }

        report.duration_ms = started.elapsed().as_millis() as u64;

        progress.phase = if cancelled {
            ScanPhase::Cancelled
        } else {
            ScanPhase::Completed
        };
        progress.warnings = report.warnings.len() as i64;
        emit(sink, &mut progress, &started);

        sink.activity(&ActivityLine::info(if cancelled {
            "Scan cancelled".to_string()
        } else {
            format!("Scan complete in {} ms", report.duration_ms)
        }));

        Ok(ScanOutcome {
            status: progress.phase,
            report,
        })
    }

    /// Rescans a single case folder, leaving every other case alone.
    pub fn scan_case(root: &Path, conn: &Connection, case_id: i64) -> Result<ScanReport, String> {
        let started = Instant::now();
        let scanned_at = now_iso8601();
        let mut report = ScanReport::new(scanned_at.clone());

        let case = cases::find_by_id(conn, case_id)?
            .ok_or_else(|| format!("case {case_id} no longer exists"))?;

        let Some(folder_path) = case.folder_path.clone() else {
            report.missing = 1;
            report.warn(
                None,
                format!(
                    "`{}` has no folder recorded yet; run a workspace scan",
                    case.case_number
                ),
            );
            report.duration_ms = started.elapsed().as_millis() as u64;
            return Ok(report);
        };

        let absolute = root.join(&folder_path);
        if !absolute.is_dir() {
            report.missing = 1;
            report.warn(
                Some(&folder_path),
                format!("`{}` no longer exists", absolute.display()),
            );
            report.duration_ms = started.elapsed().as_millis() as u64;
            return Ok(report);
        }

        report.folders_found = 1;
        report.cases_found = 1;

        let counted = count_documents(&absolute);
        for message in counted.warnings {
            report.warn(Some(&folder_path), message);
        }
        report.documents_found = counted.files;

        // The folder name is re-parsed so a rename is picked up, but the case
        // number recorded in the database stays authoritative for the row being
        // updated.
        let name = match parse_folder_name(&folder_path) {
            ParseOutcome::Case { name, .. } => name,
            ParseOutcome::Unrecognised { .. } => case.name.clone(),
        };

        let scanned = ScannedCase {
            case_number: case.case_number.clone(),
            name,
            folder_path,
            document_count: counted.files,
        };

        match cases::upsert_scanned(conn, &scanned, &scanned_at)? {
            UpsertOutcome::Created => report.created += 1,
            UpsertOutcome::Updated => report.updated += 1,
            UpsertOutcome::Unchanged => report.unchanged += 1,
        }

        report.duration_ms = started.elapsed().as_millis() as u64;
        Ok(report)
    }
}
