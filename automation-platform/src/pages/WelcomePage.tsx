import { useState } from "react";

import { Button } from "../components/Button";
import { Notice } from "../components/Notice";

interface Props {
  busy: boolean;
  error: string | null;
  onSelect: () => void;
}

/**
 * First launch: no workspace has ever been configured.
 *
 * Shown instead of an empty dashboard, because an empty dashboard reads as
 * "you have no cases" rather than "you have not chosen a folder yet".
 */
export function WelcomePage({ busy, error, onSelect }: Props) {
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <h1 className="text-app-text text-3xl font-semibold">Welcome to Automation Platform</h1>
        <p className="text-app-subtext">
          Your workspace is the folder that contains all of your case/project folders.
        </p>
      </header>

      <pre className="border-app-border bg-app-panel text-app-subtext overflow-x-auto rounded-lg border p-4 font-mono text-xs">
        {`Cases/
├── DC8842.01 Fairfax County/
├── DC8839.01 Fairfax County/
└── DC6530.04.05 Fairfax County/`}
      </pre>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" disabled={busy} onClick={onSelect}>
          Select Workspace
        </Button>
        <Button variant="ghost" onClick={() => setShowMore((open) => !open)}>
          {showMore ? "Hide" : "Learn More"}
        </Button>
      </div>

      {showMore ? (
        <section className="border-app-border bg-app-panel text-app-subtext space-y-3 rounded-lg border p-4 text-sm">
          <p>
            Pick any folder on this computer — it does not need to be called{" "}
            <span className="text-app-text font-mono">Cases</span>, and it can live on an external
            drive.
          </p>
          <p>
            A folder named{" "}
            <span className="text-app-text font-mono">.automation-platform</span> is created inside
            it to hold this workspace's database. Nothing else in the folder is changed: your case
            folders and documents are only ever read.
          </p>
          <p>
            Because the database lives inside the workspace, you can move or rename the folder
            later and reconnect to it without losing anything.
          </p>
        </section>
      ) : null}
    </div>
  );
}
