interface Props {
  tone?: "error" | "info";
  children: React.ReactNode;
}

/** Inline message used for command failures and short explanations. */
export function Notice({ tone = "info", children }: Props) {
  const styles =
    tone === "error"
      ? "border-app-error/50 bg-app-error/10 text-app-error"
      : "border-app-border bg-app-panel text-app-subtext";

  return (
    <p
      className={`rounded-md border px-4 py-3 text-sm ${styles}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}
