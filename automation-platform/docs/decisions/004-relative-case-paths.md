# Relative Case Folder Paths

## Status

Accepted

## Context

Case records store the folder each case lives in. If that path were stored
absolute, moving or renaming the workspace would invalidate every record at
once — a supported operation the application is built around.

## Decision

Store each case's `folder_path` relative to the workspace root (the child
folder's name, e.g. `DC8842.01 Fairfax County`). Resolve it against the current
workspace root only at read time, in the Rust layer.

## Consequences

- Moving or renaming the workspace leaves every stored path valid.
- The absolute path is derived, not persisted, so it is always correct for the
  workspace's current location.
- Resolution stays in the backend; the frontend sees the resolved path via
  `absolutePath` and never does path arithmetic itself.
