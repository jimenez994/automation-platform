//! Case-level logic: reading folder names and keeping the database in step with
//! the workspace folder.

pub mod parser;
pub mod progress;
pub mod sync;

pub use parser::{parse_folder_name, ParseOutcome};
pub use progress::{
    ActivityLevel, ActivityLine, CancelToken, NoopSink, ProgressSink, RecordingSink, ScanPhase,
    ScanProgress,
};
pub use sync::{CaseSyncService, ScanOutcome, ScanReport, ScanWarning};
