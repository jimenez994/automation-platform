# Automation Platform

A local-first desktop application for managing case/project folders. Everything
runs on the user's machine: there is no server, no account and no cloud
dependency.

You point the application at a folder full of case folders — the **workspace** —
and it keeps a local database of what is in there.

```text
Kastle Cases/                         ← the workspace (any folder, anywhere)
├── .automation-platform/             ← created by the application
│   ├── automation.db
│   └── workspace.json
├── DC8842.01 Fairfax County/
├── DC8839.01 Fairfax County/
└── DC6530.04.05 Fairfax County/
```

The database lives inside the workspace, so the whole thing can be moved to
another folder, another drive or another machine and still work.

This repository contains **milestones 1, 2 and 2A**. The automation features
the project is named after have not been built yet; see
[What is not implemented yet](#what-is-not-implemented-yet).

## Technology stack

| Layer         | Choice                               |
| ------------- | ------------------------------------ |
| Desktop shell | Tauri 2                              |
| Native layer  | Rust (edition 2021)                  |
| Database      | SQLite via `rusqlite` (bundled)      |
| Frontend      | React 19 + TypeScript                |
| Build tooling | Vite 7                               |
| Styling       | Tailwind CSS 4 (`@tailwindcss/vite`) |

No state-management library and no router: the screens are a small state machine
in `App.tsx` and do not need them. The theme colours come from Catppuccin and are
the only colour definitions in the codebase.

## Requirements

- **Node.js** 18 or newer (developed against 26.x) and npm
- **Rust** stable toolchain (developed against 1.94) — install via [rustup](https://rustup.rs)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)

Tauri's own prerequisites are listed at <https://tauri.app/start/prerequisites/>.

## Install dependencies

```bash
cd automation-platform
npm install
```

Rust crates are fetched on the first build. `rusqlite` uses the `bundled`
feature, so SQLite is compiled from source and no system SQLite is required —
which makes the first build noticeably slower than later ones.

## Run the development application

```bash
npm run tauri dev
```

Starts the Vite dev server on port 1420 and opens the desktop window with hot
reload for the frontend. Changes to Rust sources trigger a rebuild and restart.

`npm run dev` alone serves the UI in a browser, but the Tauri commands are not
available there, so no workspace can be opened.

## Build the application

```bash
npm run tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`:

- `macos/Automation Platform.app`
- `dmg/Automation Platform_<version>_<arch>.dmg`

The bundle is unsigned. macOS Gatekeeper warns on first launch of a copied
build; open it from Finder with right-click → Open.

## Tests

```bash
npm test          # cargo test: 68 tests
```

Covers migrations, the case queries, workspace creation/loading/relocation, the
preferences file, the scanner, and an end-to-end lifecycle test that walks the
whole select → scan → edit → move → reconnect path. Everything runs against
in-memory SQLite and temporary directories; no test touches a real workspace.

## Where data is stored

There are two levels, and they are kept strictly separate.

### Workspace data — inside the workspace folder

```text
<workspace>/.automation-platform/
├── automation.db     # cases
└── workspace.json    # workspace id, name, versions
```

This is the only place the application writes inside a workspace. It never
modifies, moves, renames or deletes your case folders or documents.

`workspace.json` carries a `workspace_id` that is generated once and never
changes. That id is what identifies a workspace after it has been renamed or
moved.

### Application data — in the OS application data directory

Only `preferences.json`: the recent workspaces and which one was open last. No
case data is stored here.

| OS      | Path                                                                    |
| ------- | ----------------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/com.automationplatform.app/`             |
| Linux   | `~/.local/share/com.automationplatform.app/`                            |
| Windows | `%APPDATA%\com.automationplatform.app\`                                 |

> Milestone 1 kept a single `automation.db` in this directory. It is no longer
> read or written, and milestone 2 does not delete it. If you have one from an
> early build you can remove it by hand.

To inspect a workspace database:

```bash
sqlite3 "/path/to/workspace/.automation-platform/automation.db" \
  ".schema cases" "SELECT case_number, name, status FROM cases;"
```

## Database schema

`database/migrations/` is the authoritative schema; see
[database/README.md](database/README.md) for the tables and the migration rules.
Migrations are tracked with SQLite's `user_version` pragma and applied when a
workspace is opened, so an existing database is upgraded rather than recreated.

## Native application menu

A real menu bar — the global one on macOS, a window menu elsewhere — built with
Tauri's native menu API. There is no HTML menu.

| Menu                    | Contents |
| ----------------------- | -------- |
| **Automation Platform** (macOS) | About, Preferences, Services, Hide/Show, Quit |
| **File**                | New Workspace, Open Workspace, Open Recent, Change Workspace, Reveal Workspace, Scan Current Workspace, Close Workspace, Quit (non-macOS) |
| **Edit**                | Undo, Redo, Cut, Copy, Paste, Select All (all native) |
| **View**                | Dashboard, Cases, Refresh, Toggle Sidebar, Theme ▸ System/Light/Dark |
| **Window**              | Minimize, Maximize, Full Screen, Close |
| **Help**                | Documentation, Keyboard Shortcuts, About (non-macOS) |

Workspace commands are authoritative here; the dashboard keeps its own buttons
as shortcuts. Items are enabled and disabled from application state — a scan
greys out *Scan* and *Change Workspace*, no workspace greys out *Scan* and
*Close Workspace* — so an invalid action is never on offer.

Shortcuts: ⌘N select, ⌘O open, ⇧⌘O change, ⇧⌘R scan, ⇧⌘W close, ⌘R refresh,
⌘1/⌘2 dashboard/cases, ⌘B toggle sidebar, ⌘, preferences (`Cmd` becomes `Ctrl`
on Windows and Linux).

## Themes

Three themes — **System**, **Light** and **Dark** — selected from View → Theme or
the Preferences overlay, persisted in the application preferences, and applied
through a single set of CSS variables in
[src/index.css](automation-platform/src/index.css).

- **Dark** is Catppuccin **Frappé**, the official palette.
- **Light** is Catppuccin **Latte**, Frappé's light sibling, so it is a pair by
  construction rather than an inversion.

Components name semantic tokens (`bg-app-panel`, `text-app-subtext`, …), never a
palette colour, so every surface — buttons, tables, inputs, scrollbars, badges,
progress bars — follows the active theme. `System` tracks the operating-system
appearance live while the application is open.

## How it works

### Workspaces

On launch the application reads `preferences.json` and reopens the last
workspace if its folder is still there and still contains
`.automation-platform/workspace.json`. If the folder is gone it shows a recovery
screen instead of failing — you can locate the workspace at its new path, pick a
different one, or forget it. Locating it reads the `workspace_id` from the
folder, matches it to the remembered entry and updates the stored path, so no
second database or duplicate entry is created.

A workspace whose folder is missing is marked **Unavailable** in the recent
list. It is never removed automatically.

### Scanning

A workspace is scanned **automatically** when it is opened — on first selection,
on launch, on opening a recent workspace and after relocating a moved one — so
the dashboard is never shown stale. The scan runs on its own thread and reports
real progress through events: the current phase, the case being read, the count
done versus discovered, documents found, elapsed time and an estimate of the
time remaining (once enough folders are done to make it honest; before that the
loading screen says "Calculating remaining time…").

A loading screen shows the phase checklist and a live activity log, and a
completion screen summarises the result before the dashboard. A scan can be
cancelled; it stops at the next folder boundary, keeps what it already wrote,
and never deletes a case record.

`Scan Cases` reads the immediate child directories of the workspace root. Each
one is a candidate case; files sitting directly in the root are ignored, as are
hidden directories.

A folder name is split into `<case number> <name>`:

```text
DC8842.01 Fairfax County   →   case_number = DC8842.01
                               name        = Fairfax County
```

A folder whose first word contains no digit (`Random Folder`) is skipped with a
warning rather than failing the scan. `jurisdiction` is deliberately left empty:
the trailing text is often a jurisdiction but nothing guarantees it, and a wrong
guess is hard to spot later.

The scan is read-only with respect to your documents — it lists directories and
counts files, nothing more. One unreadable folder produces a warning and the
scan carries on.

### What the scanner may and may not change

| Field                                        | Owner      |
| -------------------------------------------- | ---------- |
| `folder_path`, `document_count`, `last_scanned_at` | scanner    |
| `status`, `priority`, `jurisdiction`         | you        |
| `name`                                       | scanner, until you edit it |

Set a case to `Waiting` / `High`, rescan, and it stays `Waiting` / `High`. Once
you edit a case's name by hand, the scanner stops deriving it from the folder.

Cases whose folder is not found during a scan are **reported, not deleted** — a
folder can be missing because a drive is not mounted.

## Project structure

```text
automation-platform/
├── database/
│   ├── migrations/             # authoritative schema, applied in order
│   └── README.md
├── docs/
│   └── architecture.md
├── src/                        # React frontend
│   ├── components/             # presentational pieces
│   ├── pages/                  # one per screen
│   ├── services/               # Tauri command wrappers + formatting
│   ├── types/                  # shared TypeScript types
│   ├── App.tsx                 # which screen is showing
│   ├── index.css
│   └── main.tsx
├── src-tauri/                  # Rust / native layer
│   ├── src/
│   │   ├── cases/              # folder-name parsing, CaseSyncService
│   │   ├── commands/           # functions callable from the frontend
│   │   ├── database/           # connections, migrations, models, queries
│   │   ├── filesystem/         # read-only scanning, file-manager launching
│   │   ├── workspace/          # workspace metadata and preferences
│   │   ├── state.rs            # shared application state
│   │   ├── util.rs
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── tests/                  # database, workspace, scanner, lifecycle
│   ├── capabilities/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html
├── package.json
├── vite.config.ts
├── .env.example
└── README.md
```

## What is implemented so far

**Workspaces**

- Select any folder on the machine as a workspace, via the native folder picker
- `.automation-platform/` with `workspace.json` and `automation.db` created on
  first use
- Stable `workspace_id` that survives renaming and moving the folder
- Last workspace reopened automatically on launch
- Recovery screen when the workspace folder has moved, with locate / choose
  another / forget
- Recent workspaces list, with unavailable ones clearly marked
- Schema migrations, so an existing database is upgraded, never recreated

**Cases**

- `CaseSyncService`: scans child directories, parses folder names, creates and
  updates case records, counts documents recursively, records scan timestamps
- Warnings for malformed names, duplicate case numbers and unreadable folders;
  one bad folder never aborts a scan
- Scan summary with counts and inspectable warnings
- Dashboard with the workspace header, status summary, sortable case table and
  search over case number and name
- Case detail view with edit (name, jurisdiction, status, priority)
- `Open Case Folder` / `Open Workspace` in the OS file manager, on macOS and
  Windows

## What is not implemented yet

Deliberately out of scope:

- Reading document contents (PDFs and the like are counted, never opened)
- Browser automation
- Outlook / Microsoft 365 integration
- Workflow engine and scheduling
- AI agents and local Ollama models
- Logging and history beyond stdout/stderr
- Authentication, cloud services and sync
- Creating or deleting cases from the UI
- Code signing and notarization of the macOS bundle
