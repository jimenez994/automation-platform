import { useEffect } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Simple modal panel used by the Help and Preferences menu items. */
export function Overlay({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="border-app-border bg-app-panel w-full max-w-lg rounded-lg border p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-app-text text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-app-muted hover:text-app-text"
          >
            ✕
          </button>
        </div>

        <div className="text-app-subtext space-y-3 text-sm">{children}</div>
      </div>
    </div>
  );
}
