//! Native application menu.
//!
//! Built with Tauri's menu API, so it is a real menu bar: the global one on
//! macOS and a window menu on Windows and Linux. There is no HTML menu.
//!
//! Menu items do not act on the application directly. Each one maps to a
//! [`MenuAction`] which is emitted to the frontend, which then calls the same
//! commands its own buttons call. That keeps one code path per action, and it
//! makes routing testable without a running application: [`action_for`] is a
//! pure function over the item id.

use serde::Serialize;
use tauri::menu::{
    AboutMetadata, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::state::AppState;
use crate::workspace::preferences::ThemePreference;

/// Event the frontend listens on for menu activations.
pub const MENU_EVENT: &str = "menu://action";

/// Menu item ids. Constants so construction and routing cannot drift apart.
pub mod ids {
    pub const SELECT_WORKSPACE: &str = "workspace.select";
    pub const OPEN_WORKSPACE: &str = "workspace.open";
    pub const CHANGE_WORKSPACE: &str = "workspace.change";
    pub const SCAN_WORKSPACE: &str = "workspace.scan";
    pub const CLOSE_WORKSPACE: &str = "workspace.close";
    pub const REVEAL_WORKSPACE: &str = "workspace.reveal";
    /// Prefix for the dynamic entries under File → Open Recent.
    pub const RECENT_PREFIX: &str = "workspace.recent.";

    pub const VIEW_DASHBOARD: &str = "view.dashboard";
    pub const VIEW_CASES: &str = "view.cases";
    pub const VIEW_REFRESH: &str = "view.refresh";

    pub const THEME_SYSTEM: &str = "theme.system";
    pub const THEME_LIGHT: &str = "theme.light";
    pub const THEME_DARK: &str = "theme.dark";

    pub const PREFERENCES: &str = "app.preferences";
    pub const DOCUMENTATION: &str = "help.documentation";
    pub const SHORTCUTS: &str = "help.shortcuts";
}

/// What a menu item means to the rest of the application.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MenuAction {
    SelectWorkspace,
    OpenWorkspace,
    ChangeWorkspace,
    ScanWorkspace,
    CloseWorkspace,
    RevealWorkspace,
    #[serde(rename_all = "camelCase")]
    OpenRecent {
        workspace_id: String,
    },
    ShowDashboard,
    ShowCases,
    Refresh,
    #[serde(rename_all = "camelCase")]
    SetTheme {
        theme: ThemePreference,
    },
    ShowPreferences,
    ShowDocumentation,
    ShowShortcuts,
}

/// Maps a menu item id to the action it performs.
///
/// Returns `None` for ids the application does not own — predefined items such
/// as Copy or Quit are handled by the operating system.
pub fn action_for(id: &str) -> Option<MenuAction> {
    if let Some(workspace_id) = id.strip_prefix(ids::RECENT_PREFIX) {
        if workspace_id.is_empty() {
            return None;
        }

        return Some(MenuAction::OpenRecent {
            workspace_id: workspace_id.to_string(),
        });
    }

    let action = match id {
        ids::SELECT_WORKSPACE => MenuAction::SelectWorkspace,
        ids::OPEN_WORKSPACE => MenuAction::OpenWorkspace,
        ids::CHANGE_WORKSPACE => MenuAction::ChangeWorkspace,
        ids::SCAN_WORKSPACE => MenuAction::ScanWorkspace,
        ids::CLOSE_WORKSPACE => MenuAction::CloseWorkspace,
        ids::REVEAL_WORKSPACE => MenuAction::RevealWorkspace,
        ids::VIEW_DASHBOARD => MenuAction::ShowDashboard,
        ids::VIEW_CASES => MenuAction::ShowCases,
        ids::VIEW_REFRESH => MenuAction::Refresh,
        ids::THEME_SYSTEM => MenuAction::SetTheme {
            theme: ThemePreference::System,
        },
        ids::THEME_LIGHT => MenuAction::SetTheme {
            theme: ThemePreference::Light,
        },
        ids::THEME_DARK => MenuAction::SetTheme {
            theme: ThemePreference::Dark,
        },
        ids::PREFERENCES => MenuAction::ShowPreferences,
        ids::DOCUMENTATION => MenuAction::ShowDocumentation,
        ids::SHORTCUTS => MenuAction::ShowShortcuts,
        _ => return None,
    };

    Some(action)
}

/// The id of the recent-workspace entry for a workspace.
pub fn recent_id(workspace_id: &str) -> String {
    format!("{}{workspace_id}", ids::RECENT_PREFIX)
}

/// One entry under File → Open Recent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecentEntry {
    pub workspace_id: String,
    pub label: String,
    /// False when the folder is missing; the entry is shown but not selectable.
    pub available: bool,
}

/// The state the menu reflects.
///
/// Kept as plain data so the enable/disable rules can be checked without
/// building a real menu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MenuContext {
    pub has_workspace: bool,
    pub scanning: bool,
    pub theme: ThemePreference,
    pub recent: Vec<RecentEntry>,
}

impl Default for MenuContext {
    fn default() -> Self {
        Self {
            has_workspace: false,
            scanning: false,
            theme: ThemePreference::System,
            recent: Vec::new(),
        }
    }
}

impl MenuContext {
    /// Scanning needs a workspace, and only one scan may run at a time.
    pub fn can_scan(&self) -> bool {
        self.has_workspace && !self.scanning
    }

    /// Switching workspaces mid-scan would pull the database out from under
    /// the running scan, so it waits until the scan has stopped.
    pub fn can_change_workspace(&self) -> bool {
        !self.scanning
    }

    pub fn can_close_workspace(&self) -> bool {
        self.has_workspace && !self.scanning
    }

    /// Selecting a different workspace is always possible unless a scan holds
    /// the current one.
    pub fn can_select_workspace(&self) -> bool {
        !self.scanning
    }

    pub fn can_refresh(&self) -> bool {
        self.has_workspace
    }

    pub fn can_reveal_workspace(&self) -> bool {
        self.has_workspace
    }
}

fn about_metadata() -> AboutMetadata<'static> {
    AboutMetadata {
        name: Some("Automation Platform".to_string()),
        version: Some(env!("CARGO_PKG_VERSION").to_string()),
        comments: Some(
            "A local-first desktop workspace for managing case and project folders.".to_string(),
        ),
        ..Default::default()
    }
}

/// Builds the menu for the given state and installs it.
///
/// The whole menu is rebuilt rather than individual items being mutated: the
/// Open Recent list and the theme checkmarks change shape, not just enablement,
/// and one construction path is easier to keep correct than two.
pub fn install<R: Runtime>(app: &AppHandle<R>, context: &MenuContext) -> tauri::Result<()> {
    let scan = MenuItemBuilder::with_id(ids::SCAN_WORKSPACE, "Scan Current Workspace")
        .accelerator("CmdOrCtrl+Shift+R")
        .enabled(context.can_scan())
        .build(app)?;

    let select = MenuItemBuilder::with_id(ids::SELECT_WORKSPACE, "New Workspace…")
        .accelerator("CmdOrCtrl+N")
        .enabled(context.can_select_workspace())
        .build(app)?;

    let open = MenuItemBuilder::with_id(ids::OPEN_WORKSPACE, "Open Workspace…")
        .accelerator("CmdOrCtrl+O")
        .enabled(context.can_select_workspace())
        .build(app)?;

    let change = MenuItemBuilder::with_id(ids::CHANGE_WORKSPACE, "Change Workspace…")
        .accelerator("CmdOrCtrl+Shift+O")
        .enabled(context.can_change_workspace())
        .build(app)?;

    let reveal = MenuItemBuilder::with_id(ids::REVEAL_WORKSPACE, "Reveal Workspace in File Manager")
        .enabled(context.can_reveal_workspace())
        .build(app)?;

    let close = MenuItemBuilder::with_id(ids::CLOSE_WORKSPACE, "Close Workspace")
        .accelerator("CmdOrCtrl+Shift+W")
        .enabled(context.can_close_workspace())
        .build(app)?;

    // Open Recent is rebuilt from the preferences each time so it always
    // matches the list the selection screen shows.
    let mut recent_menu = SubmenuBuilder::new(app, "Open Recent");
    if context.recent.is_empty() {
        recent_menu = recent_menu.item(
            &MenuItemBuilder::with_id("workspace.recent.empty", "No Recent Workspaces")
                .enabled(false)
                .build(app)?,
        );
    } else {
        for entry in &context.recent {
            let label = if entry.available {
                entry.label.clone()
            } else {
                format!("{} (unavailable)", entry.label)
            };

            recent_menu = recent_menu.item(
                &MenuItemBuilder::with_id(recent_id(&entry.workspace_id), label)
                    .enabled(entry.available && context.can_select_workspace())
                    .build(app)?,
            );
        }
    }
    let recent_menu = recent_menu.build()?;

    let preferences = MenuItemBuilder::with_id(ids::PREFERENCES, "Preferences…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let documentation = MenuItemBuilder::with_id(ids::DOCUMENTATION, "Documentation").build(app)?;
    let shortcuts = MenuItemBuilder::with_id(ids::SHORTCUTS, "Keyboard Shortcuts").build(app)?;

    // ---- File
    let file = SubmenuBuilder::new(app, "File")
        .item(&select)
        .item(&open)
        .item(&recent_menu)
        .separator()
        .item(&change)
        .item(&reveal)
        .separator()
        .item(&scan)
        .separator()
        .item(&close);

    // Windows and Linux have no application menu, so the items macOS puts
    // there live in File and Help instead.
    #[cfg(not(target_os = "macos"))]
    let file = file.separator().item(&preferences).separator().quit();

    #[cfg(target_os = "macos")]
    let file = file.separator().close_window();

    let file = file.build()?;

    // ---- Edit: all predefined, so each platform behaves the way it should.
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // ---- View
    let view = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id(ids::VIEW_DASHBOARD, "Dashboard")
                .accelerator("CmdOrCtrl+1")
                .enabled(context.has_workspace)
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id(ids::VIEW_CASES, "Cases")
                .accelerator("CmdOrCtrl+2")
                .enabled(context.has_workspace)
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id(ids::VIEW_REFRESH, "Refresh")
                .accelerator("CmdOrCtrl+R")
                .enabled(context.can_refresh())
                .build(app)?,
        )
        .separator()
        .item(
            &SubmenuBuilder::new(app, "Theme")
                .item(
                    &CheckMenuItemBuilder::with_id(ids::THEME_SYSTEM, "System")
                        .checked(context.theme == ThemePreference::System)
                        .build(app)?,
                )
                .item(
                    &CheckMenuItemBuilder::with_id(ids::THEME_LIGHT, "Light")
                        .checked(context.theme == ThemePreference::Light)
                        .build(app)?,
                )
                .item(
                    &CheckMenuItemBuilder::with_id(ids::THEME_DARK, "Dark")
                        .checked(context.theme == ThemePreference::Dark)
                        .build(app)?,
                )
                .build()?,
        )
        .build()?;

    // ---- Window: predefined items, so macOS gets its standard behaviour.
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .fullscreen()
        .separator()
        .close_window()
        .build()?;

    // ---- Help
    let help = SubmenuBuilder::new(app, "Help")
        .item(&documentation)
        .item(&shortcuts);

    // macOS puts About in the application menu; every other platform expects it
    // at the bottom of Help. Both use the predefined item, so the dialog is the
    // native one.
    #[cfg(not(target_os = "macos"))]
    let help = help.separator().about(Some(about_metadata()));

    let help = help.build()?;

    let mut menu = MenuBuilder::new(app);

    // On macOS the first submenu is the application menu.
    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "Automation Platform")
            .about(Some(about_metadata()))
            .separator()
            .item(&preferences)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;

        menu = menu.item(&app_menu);
    }

    let menu = menu
        .item(&file)
        .item(&edit)
        .item(&view)
        .item(&window)
        .item(&help)
        .build()?;

    app.set_menu(menu)?;
    Ok(())
}

/// Reads the current application state and rebuilds the menu from it.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let context = context_from_state(app);
    install(app, &context)
}

/// Derives the menu state from [`AppState`].
pub fn context_from_state<R: Runtime>(app: &AppHandle<R>) -> MenuContext {
    let Some(state) = app.try_state::<AppState>() else {
        return MenuContext::default();
    };

    let recent = state
        .recent_workspaces()
        .unwrap_or_default()
        .into_iter()
        .map(|entry| RecentEntry {
            workspace_id: entry.workspace_id,
            label: entry.workspace_name,
            available: entry.available,
        })
        .collect();

    MenuContext {
        has_workspace: state.has_workspace(),
        scanning: state.is_scanning(),
        theme: state.theme().unwrap_or_default(),
        recent,
    }
}

/// Wires menu activations to the frontend.
///
/// A theme choice is applied here as well as forwarded, so the preference is
/// stored and the checkmarks move even before the frontend responds.
pub fn handle_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let Some(action) = action_for(id) else {
        return;
    };

    if let MenuAction::SetTheme { theme } = action {
        if let Some(state) = app.try_state::<AppState>() {
            if let Err(error) = state.set_theme(theme) {
                eprintln!("[automation-platform] could not save the theme: {error}");
            }
        }

        if let Err(error) = refresh(app) {
            eprintln!("[automation-platform] could not refresh the menu: {error}");
        }
    }

    if let Err(error) = app.emit(MENU_EVENT, &action) {
        eprintln!("[automation-platform] could not deliver the menu action: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_workspace_items() {
        assert_eq!(
            action_for(ids::SCAN_WORKSPACE),
            Some(MenuAction::ScanWorkspace)
        );
        assert_eq!(
            action_for(ids::CLOSE_WORKSPACE),
            Some(MenuAction::CloseWorkspace)
        );
        assert_eq!(
            action_for(ids::CHANGE_WORKSPACE),
            Some(MenuAction::ChangeWorkspace)
        );
        assert_eq!(
            action_for(ids::SELECT_WORKSPACE),
            Some(MenuAction::SelectWorkspace)
        );
    }

    #[test]
    fn routes_view_and_theme_items() {
        assert_eq!(action_for(ids::VIEW_REFRESH), Some(MenuAction::Refresh));
        assert_eq!(
            action_for(ids::THEME_DARK),
            Some(MenuAction::SetTheme {
                theme: ThemePreference::Dark
            })
        );
        assert_eq!(
            action_for(ids::THEME_SYSTEM),
            Some(MenuAction::SetTheme {
                theme: ThemePreference::System
            })
        );
    }

    #[test]
    fn routes_recent_workspaces_by_id() {
        let id = recent_id("b4e6ed97-4808-4c43-8f9c-e692fdfadff5");

        assert_eq!(
            action_for(&id),
            Some(MenuAction::OpenRecent {
                workspace_id: "b4e6ed97-4808-4c43-8f9c-e692fdfadff5".to_string()
            })
        );
    }

    #[test]
    fn ignores_unknown_and_predefined_items() {
        assert_eq!(action_for("quit"), None);
        assert_eq!(action_for("copy"), None);
        assert_eq!(action_for(""), None);
        // The placeholder shown when there are no recent workspaces.
        assert_eq!(action_for("workspace.recent."), None);
    }

    #[test]
    fn nothing_workspace_related_is_available_without_a_workspace() {
        let context = MenuContext::default();

        assert!(!context.can_scan());
        assert!(!context.can_close_workspace());
        assert!(!context.can_refresh());
        assert!(!context.can_reveal_workspace());
        // Choosing a workspace is how you get out of this state.
        assert!(context.can_select_workspace());
        assert!(context.can_change_workspace());
    }

    #[test]
    fn an_open_workspace_enables_its_actions() {
        let context = MenuContext {
            has_workspace: true,
            ..MenuContext::default()
        };

        assert!(context.can_scan());
        assert!(context.can_close_workspace());
        assert!(context.can_change_workspace());
        assert!(context.can_refresh());
    }

    #[test]
    fn a_running_scan_blocks_conflicting_actions() {
        let context = MenuContext {
            has_workspace: true,
            scanning: true,
            ..MenuContext::default()
        };

        // No second scan, and no pulling the workspace out from under this one.
        assert!(!context.can_scan());
        assert!(!context.can_change_workspace());
        assert!(!context.can_close_workspace());
        assert!(!context.can_select_workspace());
        // Reading is still fine.
        assert!(context.can_refresh());
    }
}
