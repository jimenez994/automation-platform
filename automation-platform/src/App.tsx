import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "./components/Button";
import { Notice } from "./components/Notice";
import { Overlay } from "./components/Overlay";
import { ThemeToggle } from "./components/ThemeToggle";
import { useTheme } from "./hooks/useTheme";
import { Inspector } from "./inspector/Inspector";
import { CaseDetailPage } from "./pages/CaseDetailPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ScanCompletePage } from "./pages/ScanCompletePage";
import { WelcomePage } from "./pages/WelcomePage";
import { WorkspaceLoadingPage } from "./pages/WorkspaceLoadingPage";
import { WorkspaceMissingPage } from "./pages/WorkspaceMissingPage";
import { WorkspaceSelectPage } from "./pages/WorkspaceSelectPage";
import { errorMessage } from "./services/format";
import { onMenuAction } from "./services/menu";
import { cancelScan, onScanActivity, onScanFinished, onScanProgress, startScan } from "./services/scan";
import {
  chooseWorkspaceFolder,
  closeWorkspace,
  currentWorkspace,
  listRecentWorkspaces,
  openRecentWorkspace,
  openWorkspace,
  openWorkspaceFolder,
  removeRecentWorkspace,
  workspaceStartup,
} from "./services/workspace";
import {
  THEME_LABELS,
  THEME_PREFERENCES,
  type ActivityLine,
  type MenuAction,
  type RecentWorkspace,
  type ScanFinished,
  type ScanProgress,
  type ScanReport,
  type WorkspaceState,
} from "./types";

/**
 * Which screen is showing.
 *
 * A workspace must be open before the dashboard is reachable, and a freshly
 * opened workspace goes through `scanning` first, so an empty case list is
 * never mistaken for "no cases".
 */
type Phase =
  | "loading"
  | "welcome"
  | "select"
  | "missing"
  | "scanning"
  | "scanComplete"
  | "dashboard"
  | "case";

type OverlayKind = "preferences" | "documentation" | "shortcuts" | null;

/** A scan this quick is not worth a screen of its own — as long as it was clean. */
const AUTO_CONTINUE_MS = 1200;

/** Keeps the activity log bounded on a very large workspace. */
const MAX_ACTIVITY_LINES = 500;

const SHORTCUTS: Array<[string, string]> = [
  ["New Workspace", "⌘N / Ctrl+N"],
  ["Open Workspace", "⌘O / Ctrl+O"],
  ["Change Workspace", "⇧⌘O / Ctrl+Shift+O"],
  ["Scan Current Workspace", "⇧⌘R / Ctrl+Shift+R"],
  ["Close Workspace", "⇧⌘W / Ctrl+Shift+W"],
  ["Refresh", "⌘R / Ctrl+R"],
  ["Dashboard", "⌘1 / Ctrl+1"],
  ["Cases", "⌘2 / Ctrl+2"],
  ["Toggle Sidebar", "⌘B / Ctrl+B"],
  ["Preferences", "⌘, / Ctrl+,"],
];

export default function App() {
  const { preference: theme, resolved: resolvedTheme, chooseTheme, adoptTheme } = useTheme();

  const [phase, setPhase] = useState<Phase>("loading");
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [recent, setRecent] = useState<RecentWorkspace[]>([]);
  const [missing, setMissing] = useState<RecentWorkspace | null>(null);
  const [caseId, setCaseId] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [activity, setActivity] = useState<ActivityLine[]>([]);
  const [finished, setFinished] = useState<ScanFinished | null>(null);
  const [lastReport, setLastReport] = useState<ScanReport | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [refreshToken, setRefreshToken] = useState(0);
  const [overlay, setOverlay] = useState<OverlayKind>(null);

  const scanning = phase === "scanning";

  const refreshWorkspace = useCallback(async () => {
    try {
      const current = await currentWorkspace();
      if (current) setWorkspace(current);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  /** Starts a scan and switches to the loading screen. */
  const beginScan = useCallback(async () => {
    setProgress(null);
    setActivity([]);
    setFinished(null);
    setCancelling(false);
    setError(null);
    setPhase("scanning");

    try {
      await startScan();
    } catch (cause) {
      // Rejected because one is already running, or there is no workspace.
      setError(errorMessage(cause));
      setPhase("dashboard");
    }
  }, []);

  /**
   * Opens a folder as a workspace and scans it.
   *
   * `expectedId` is set when the user is relocating a specific workspace: the
   * folder they pick carries its own id, so a mismatch means they chose a
   * different workspace. That is allowed — a folder never seen before is a
   * valid choice — but it is worth saying out loud.
   */
  const open = useCallback(
    async (path: string, expectedId?: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);

      try {
        const opened = await openWorkspace(path);

        if (expectedId && opened.workspaceId !== expectedId) {
          setNotice(
            `“${opened.workspaceName}” is a different workspace than the one that was missing. It has been opened, and the missing workspace is still in your recent list.`,
          );
        }

        setWorkspace(opened);
        setMissing(null);
        setRecent(await listRecentWorkspaces());
        await beginScan();
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    },
    [beginScan],
  );

  const pickFolder = useCallback(
    async (expectedId?: string) => {
      setError(null);
      try {
        const path = await chooseWorkspaceFolder();
        if (path) await open(path, expectedId);
      } catch (cause) {
        setError(errorMessage(cause));
      }
    },
    [open],
  );

  const openRecent = useCallback(
    async (workspaceId: string) => {
      setBusy(true);
      setError(null);
      try {
        const opened = await openRecentWorkspace(workspaceId);
        setWorkspace(opened);
        setMissing(null);
        setRecent(await listRecentWorkspaces());
        await beginScan();
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    },
    [beginScan],
  );

  const leaveWorkspace = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await closeWorkspace();
      setWorkspace(null);
      setLastReport(null);
      const entries = await listRecentWorkspaces();
      setRecent(entries);
      setPhase(entries.length > 0 ? "select" : "welcome");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const forget = useCallback(
    async (target: RecentWorkspace) => {
      setBusy(true);
      setError(null);
      try {
        const entries = await removeRecentWorkspace(target.workspaceId);
        setRecent(entries);

        if (missing?.workspaceId === target.workspaceId) {
          setMissing(null);
          setPhase(entries.length > 0 ? "select" : "welcome");
        }
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    },
    [missing],
  );

  const revealWorkspace = useCallback(async () => {
    try {
      await openWorkspaceFolder();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  const stopScan = useCallback(async () => {
    setCancelling(true);
    try {
      await cancelScan();
    } catch (cause) {
      setCancelling(false);
      setError(errorMessage(cause));
    }
  }, []);

  // Flips the effective theme Light ↔ Dark and stores the explicit choice. In
  // System mode the flip resolves the current system appearance first, so the
  // toggle always lands on a concrete theme rather than cycling through system.
  const toggleTheme = useCallback(() => {
    void chooseTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [chooseTheme, resolvedTheme]);

  // ---- Startup: reopen the last workspace, or ask for one.
  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const startup = await workspaceStartup();
        if (cancelled) return;

        setRecent(startup.recent);
        setError(startup.error);

        if (startup.status === "loaded" && startup.workspace) {
          setWorkspace(startup.workspace);
          // A loaded workspace always scans: the folder may have changed while
          // the application was closed.
          await beginScan();
        } else if (startup.status === "missing" && startup.missingWorkspace) {
          setMissing(startup.missingWorkspace);
          setPhase("missing");
        } else {
          setPhase(startup.recent.length > 0 ? "select" : "welcome");
        }
      } catch (cause) {
        if (cancelled) return;
        setError(errorMessage(cause));
        setPhase("welcome");
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, [beginScan]);

  // ---- Scan events.
  useEffect(() => {
    const unlisten: Array<Promise<() => void>> = [
      onScanProgress(setProgress),
      onScanActivity((line) =>
        setActivity((lines) => {
          const next = [...lines, line];
          return next.length > MAX_ACTIVITY_LINES
            ? next.slice(next.length - MAX_ACTIVITY_LINES)
            : next;
        }),
      ),
      onScanFinished((result) => {
        setFinished(result);
        setCancelling(false);
        setLastReport(result.outcome?.report ?? null);
        void refreshWorkspace();

        const report = result.outcome?.report;
        const trivial =
          result.status === "completed" &&
          report !== undefined &&
          report.durationMs < AUTO_CONTINUE_MS &&
          report.warnings.length === 0 &&
          report.errors === 0;

        // A quick, clean scan goes straight through. Anything with warnings,
        // errors or a cancellation stops so the user actually sees it.
        setPhase(trivial ? "dashboard" : "scanComplete");
      }),
    ];

    return () => {
      unlisten.forEach((pending) => void pending.then((stop) => stop()));
    };
  }, [refreshWorkspace]);

  // ---- Native menu.
  //
  // The handler is held in a ref so the listener is registered once but always
  // sees current state, instead of being torn down and rebuilt on every change.
  const handleMenuAction = useCallback(
    (action: MenuAction) => {
      switch (action.kind) {
        case "selectWorkspace":
        case "openWorkspace":
          void pickFolder();
          break;
        case "changeWorkspace":
          if (workspace) void leaveWorkspace();
          else void pickFolder();
          break;
        case "openRecent":
          void openRecent(action.workspaceId);
          break;
        case "scanWorkspace":
          if (workspace && !scanning) void beginScan();
          break;
        case "closeWorkspace":
          if (workspace) void leaveWorkspace();
          break;
        case "revealWorkspace":
          void revealWorkspace();
          break;
        case "showDashboard":
        case "showCases":
          if (workspace && !scanning) {
            setCaseId(null);
            setPhase("dashboard");
          }
          break;
        case "refresh":
          if (workspace && !scanning) {
            setRefreshToken((token) => token + 1);
            void refreshWorkspace();
          }
          break;
        case "setTheme":
          // Rust has already stored it; this only mirrors the choice.
          adoptTheme(action.theme);
          break;
        case "showPreferences":
          setOverlay("preferences");
          break;
        case "showDocumentation":
          setOverlay("documentation");
          break;
        case "showShortcuts":
          setOverlay("shortcuts");
          break;
      }
    },
    [
      adoptTheme,
      beginScan,
      leaveWorkspace,
      openRecent,
      pickFolder,
      refreshWorkspace,
      revealWorkspace,
      scanning,
      workspace,
    ],
  );

  const menuHandler = useRef(handleMenuAction);
  menuHandler.current = handleMenuAction;

  useEffect(() => {
    const pending = onMenuAction((action) => menuHandler.current(action));
    return () => {
      void pending.then((stop) => stop());
    };
  }, []);

  return (
    <main className="bg-app-bg text-app-text min-h-screen px-8 py-10">
      <div className="pointer-events-none fixed top-4 right-4 z-50">
        <div className="pointer-events-auto">
          <ThemeToggle resolved={resolvedTheme} onToggle={toggleTheme} />
        </div>
      </div>

      {notice ? (
        <div className="mx-auto mb-6 max-w-5xl">
          <Notice>{notice}</Notice>
        </div>
      ) : null}

      {phase === "loading" ? <p className="text-app-muted mx-auto max-w-2xl text-sm">Loading…</p> : null}

      {phase === "welcome" ? (
        <WelcomePage busy={busy} error={error} onSelect={() => void pickFolder()} />
      ) : null}

      {phase === "select" ? (
        <WorkspaceSelectPage
          recent={recent}
          busy={busy}
          error={error}
          onSelect={() => void pickFolder()}
          onOpen={(target) => void openRecent(target.workspaceId)}
          onLocate={(target) => void pickFolder(target.workspaceId)}
          onRemove={(target) => void forget(target)}
        />
      ) : null}

      {phase === "missing" && missing ? (
        <WorkspaceMissingPage
          workspace={missing}
          busy={busy}
          error={error}
          onLocate={() => void pickFolder(missing.workspaceId)}
          onChooseAnother={() => void pickFolder()}
          onRemove={() => void forget(missing)}
        />
      ) : null}

      {phase === "scanning" && workspace ? (
        <WorkspaceLoadingPage
          workspace={workspace}
          progress={progress}
          activity={activity}
          cancelling={cancelling}
          error={error}
          onCancel={() => void stopScan()}
        />
      ) : null}

      {phase === "scanComplete" && workspace && finished ? (
        <ScanCompletePage
          workspace={workspace}
          finished={finished}
          activity={activity}
          onContinue={() => setPhase("dashboard")}
          onRetry={() => void beginScan()}
        />
      ) : null}

      {phase === "dashboard" && workspace ? (
        <DashboardPage
          workspace={workspace}
          lastReport={lastReport}
          refreshToken={refreshToken}
          onOpenCase={(id) => {
            setCaseId(id);
            setPhase("case");
          }}
        />
      ) : null}

      {phase === "case" && caseId !== null ? (
        <CaseDetailPage
          caseId={caseId}
          onBack={() => {
            setCaseId(null);
            setPhase("dashboard");
            setRefreshToken((token) => token + 1);
            void refreshWorkspace();
          }}
        />
      ) : null}

      {overlay === "preferences" ? (
        <Overlay title="Preferences" onClose={() => setOverlay(null)}>
          <fieldset className="space-y-2">
            <legend className="text-app-text mb-1 font-medium">Theme</legend>
            {THEME_PREFERENCES.map((option) => (
              <label key={option} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="theme"
                  value={option}
                  checked={theme === option}
                  onChange={() => void chooseTheme(option)}
                />
                <span className={theme === option ? "text-app-text" : undefined}>
                  {THEME_LABELS[option]}
                </span>
              </label>
            ))}
            <p className="text-app-muted text-xs">
              System follows your operating system appearance, and changes with it while the
              application is open. Also available under View → Theme.
            </p>
          </fieldset>
        </Overlay>
      ) : null}

      {overlay === "documentation" ? (
        <Overlay title="Documentation" onClose={() => setOverlay(null)}>
          <p>
            Full documentation has not been written yet. What exists today lives in the project's
            <span className="text-app-text font-mono"> README.md</span> and
            <span className="text-app-text font-mono"> docs/architecture.md</span>.
          </p>
          <p>
            In short: pick a folder that contains your case folders, and the application keeps a
            local database of what is in it. Your documents are only ever read.
          </p>
        </Overlay>
      ) : null}

      {overlay === "shortcuts" ? (
        <Overlay title="Keyboard Shortcuts" onClose={() => setOverlay(null)}>
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5">
            {SHORTCUTS.map(([label, keys]) => (
              <div key={label} className="contents">
                <dt>{label}</dt>
                <dd className="text-app-text font-mono text-xs">{keys}</dd>
              </div>
            ))}
          </dl>
        </Overlay>
      ) : null}

      {notice ? (
        <div className="mx-auto mt-6 max-w-5xl">
          <Button variant="ghost" onClick={() => setNotice(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <Inspector workspaceId={workspace?.workspaceId ?? null} />
    </main>
  );
}
