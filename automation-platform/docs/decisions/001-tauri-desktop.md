# Tauri 2 for the Desktop Application

## Status

Accepted

## Context

The application must run as a native desktop app on macOS and Windows, with a
Rust backend for local resources (filesystem, SQLite) and a web frontend for
the UI. The alternatives were Electron (Node runtime, large bundles, heavier
memory use) and a fully native toolkit per platform (two codebases).

## Decision

Use Tauri 2 with a Rust core and a React + TypeScript + Vite frontend.

Platform-specific behaviour — the native application menu, opening a folder in
the file manager — is isolated behind Tauri's native APIs (`menu.rs`,
`filesystem/reveal.rs`), so the rest of the code stays cross-platform.

## Consequences

- Small binaries and low memory footprint compared to Electron.
- One Rust backend shared across macOS and Windows.
- Native menu and file-manager integration come from Tauri, not hand-rolled
  per-OS code.
- The macOS bundle is currently unsigned; notarization is deferred.
- Requires the Rust toolchain and Xcode Command Line Tools on macOS.
