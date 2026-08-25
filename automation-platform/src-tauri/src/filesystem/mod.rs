//! Filesystem access, kept separate from the database and the case logic.
//!
//! Everything here is read-only with respect to the user's documents. The only
//! writes the application performs inside a workspace happen in
//! `<workspace>/.automation-platform/`, and they live in the `workspace` module.

pub mod reveal;
pub mod scan;

pub use reveal::reveal_in_file_manager;
pub use scan::{
    count_documents, list_case_directories, list_files, CandidateFolder, CaseFile, DocumentCount,
};
