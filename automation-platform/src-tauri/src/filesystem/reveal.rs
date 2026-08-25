//! Opening a folder in the operating system's file manager.
//!
//! This is the only place in the codebase that knows which OS it is running on.
//! Callers use [`reveal_in_file_manager`], which has the same signature
//! everywhere.

use std::path::Path;
use std::process::Command;

/// Opens `folder` in the platform's file manager: Finder on macOS, File
/// Explorer on Windows, the XDG default elsewhere.
///
/// Only ever opens directories, and never passes the path through a shell, so a
/// folder name containing shell metacharacters is handled as a plain argument.
pub fn reveal_in_file_manager(folder: &Path) -> Result<(), String> {
    if !folder.exists() {
        return Err(format!("`{}` no longer exists", folder.display()));
    }

    if !folder.is_dir() {
        return Err(format!("`{}` is not a folder", folder.display()));
    }

    open_directory(folder)
}

#[cfg(target_os = "macos")]
fn open_directory(folder: &Path) -> Result<(), String> {
    let status = Command::new("open")
        .arg(folder)
        .status()
        .map_err(|e| format!("could not launch Finder: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Finder exited with status {status}"))
    }
}

#[cfg(target_os = "windows")]
fn open_directory(folder: &Path) -> Result<(), String> {
    // `explorer.exe` routinely returns a non-zero exit code even when it has
    // opened the window, so the status is deliberately not checked here.
    Command::new("explorer")
        .arg(folder)
        .spawn()
        .map_err(|e| format!("could not launch File Explorer: {e}"))?;

    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn open_directory(folder: &Path) -> Result<(), String> {
    let status = Command::new("xdg-open")
        .arg(folder)
        .status()
        .map_err(|e| format!("could not launch the file manager: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("the file manager exited with status {status}"))
    }
}
