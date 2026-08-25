//! Tauri commands exposed to the React frontend.
//!
//! Registration happens in `lib.rs` using the full `commands::<module>::<fn>`
//! paths, which is what `tauri::generate_handler!` requires: it expands each
//! path into macro-generated items that sit next to the command, so a
//! re-export cannot be used there.

pub mod app;
pub mod cases;
pub mod inspector;
pub mod scan;
pub mod workspace;
