//! Read-only inspection of a workspace folder.
//!
//! Nothing in this module writes, moves, renames or deletes anything. It only
//! lists directories and counts files.

use std::fs::DirEntry;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// A directory found directly inside the workspace root.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandidateFolder {
    /// Folder name, which is also the path relative to the workspace root.
    pub folder_name: String,
    pub path: PathBuf,
}

/// Result of counting the files inside one case folder.
#[derive(Debug, Clone, Default)]
pub struct DocumentCount {
    pub files: i64,
    /// Sub-paths that could not be read. One unreadable directory never aborts
    /// the count.
    pub warnings: Vec<String>,
}

/// Directories deeper than this are not descended into. A workspace should
/// never be this deep; the limit exists so a pathological tree (or a symlink
/// loop that slipped through) cannot spin forever.
const MAX_DEPTH: usize = 32;

/// True for names the scanner ignores: the workspace's own internal directory
/// and anything else hidden by convention.
fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

/// Lists the immediate child directories of the workspace root.
///
/// Files sitting directly in the root are ignored, as are hidden directories —
/// which is what keeps `.automation-platform` out of the case list. Symlinks
/// are not followed.
pub fn list_case_directories(root: &Path) -> Result<(Vec<CandidateFolder>, Vec<String>), String> {
    if !root.exists() {
        return Err(format!("`{}` does not exist", root.display()));
    }

    if !root.is_dir() {
        return Err(format!("`{}` is not a directory", root.display()));
    }

    let entries = std::fs::read_dir(root)
        .map_err(|e| format!("could not read `{}`: {e}", root.display()))?;

    let mut folders = Vec::new();
    let mut warnings = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(e) => {
                warnings.push(format!("could not read an entry in `{}`: {e}", root.display()));
                continue;
            }
        };

        let file_name = entry.file_name();
        let Some(folder_name) = file_name.to_str() else {
            warnings.push(format!(
                "skipped `{}` because its name is not valid UTF-8",
                entry.path().display()
            ));
            continue;
        };

        if is_hidden(folder_name) {
            continue;
        }

        // `file_type` does not follow symlinks, so a symlinked directory is
        // reported as a symlink and skipped: following it could lead outside
        // the workspace or into a loop.
        match entry.file_type() {
            Ok(file_type) if file_type.is_dir() => folders.push(CandidateFolder {
                folder_name: folder_name.to_string(),
                path: entry.path(),
            }),
            // Files directly inside the root are ignored, quietly and by design.
            Ok(file_type) if file_type.is_file() => {}
            Ok(_) => warnings.push(format!("skipped `{folder_name}` because it is a symbolic link")),
            Err(e) => warnings.push(format!("could not inspect `{folder_name}`: {e}")),
        }
    }

    folders.sort_by(|a, b| a.folder_name.cmp(&b.folder_name));

    Ok((folders, warnings))
}

/// What the walk hands its visitor. Default methods are no-ops, so a consumer
/// implements only the events it cares about.
trait WalkVisitor {
    /// A regular file was reached.
    fn file(&mut self, _entry: &DirEntry) {}
    /// An unreadable directory or entry, or one whose type could not be read.
    fn error(&mut self, _message: String) {}
    /// A directory that sat at the depth cap and was not descended into.
    fn too_deep(&mut self, _path: &Path) {}
}

/// The canonical folder walk.
///
/// Every traversal goes through this one loop, so the rules live in one place:
/// hidden files and symlinks are skipped, nothing is descended past
/// [`MAX_DEPTH`], and one unreadable entry never aborts the walk. The visitor
/// decides what to keep; the walk decides how to move through the tree.
fn walk(folder: &Path, visitor: &mut impl WalkVisitor) {
    let mut stack = vec![(folder.to_path_buf(), 0usize)];

    while let Some((current, depth)) = stack.pop() {
        if depth >= MAX_DEPTH {
            visitor.too_deep(&current);
            continue;
        }

        let entries = match std::fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(e) => {
                visitor.error(format!("could not read `{}`: {e}", current.display()));
                continue;
            }
        };

        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(e) => {
                    visitor.error(format!(
                        "could not read an entry in `{}`: {e}",
                        current.display()
                    ));
                    continue;
                }
            };

            let name = entry.file_name();
            if name.to_str().is_none_or(is_hidden) {
                continue;
            }

            match entry.file_type() {
                Ok(file_type) if file_type.is_dir() => stack.push((entry.path(), depth + 1)),
                Ok(file_type) if file_type.is_file() => visitor.file(&entry),
                // Symlinks are neither descended nor reported.
                Ok(_) => {}
                Err(e) => visitor.error(format!(
                    "could not inspect `{}`: {e}",
                    entry.path().display()
                )),
            }
        }
    }
}

/// Counts files, collecting the same warnings the walk reports.
struct CountVisitor<'a> {
    count: &'a mut DocumentCount,
}

impl WalkVisitor for CountVisitor<'_> {
    fn file(&mut self, _entry: &DirEntry) {
        self.count.files += 1;
    }

    fn error(&mut self, message: String) {
        self.count.warnings.push(message);
    }

    fn too_deep(&mut self, path: &Path) {
        self.count.warnings.push(format!(
            "stopped at `{}`: more than {MAX_DEPTH} levels deep",
            path.display()
        ));
    }
}

/// Counts the files inside a case folder, recursively.
///
/// Hidden files (`.DS_Store`, `Thumbs.db` equivalents) are excluded — they are
/// not documents. Symlinks are not followed. Directories that cannot be read
/// produce a warning and are skipped rather than failing the whole count.
pub fn count_documents(folder: &Path) -> DocumentCount {
    let mut count = DocumentCount::default();
    walk(folder, &mut CountVisitor { count: &mut count });
    count
}

/// A single file found inside a case folder.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseFile {
    pub name: String,
    /// Path relative to the case folder.
    pub path: String,
    pub size: i64,
}

/// Collects every file with its path relative to the case folder and its size.
struct ListVisitor<'a> {
    root: &'a Path,
    files: Vec<CaseFile>,
}

impl WalkVisitor for ListVisitor<'_> {
    fn file(&mut self, entry: &DirEntry) {
        let path = entry.path();
        let relative = path.strip_prefix(self.root).unwrap_or(&path).to_path_buf();

        self.files.push(CaseFile {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: relative.to_string_lossy().into_owned(),
            size: entry.metadata().map(|m| m.len() as i64).unwrap_or(0),
        });
    }
}

/// Lists every file inside a case folder, recursively, in path order.
///
/// Hidden files are excluded and symlinks are not followed, matching the
/// document counting rules. Unreadable directories are skipped.
pub fn list_files(folder: &Path) -> Vec<CaseFile> {
    let mut visitor = ListVisitor {
        root: folder,
        files: Vec::new(),
    };
    walk(folder, &mut visitor);
    visitor.files.sort_by(|a, b| a.path.cmp(&b.path));
    visitor.files
}
