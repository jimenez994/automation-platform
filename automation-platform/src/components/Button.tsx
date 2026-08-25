import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-app-accent text-app-on-accent hover:bg-app-accent-hover disabled:hover:bg-app-accent",
  secondary:
    "bg-app-raised text-app-text border border-app-border hover:border-app-border-strong disabled:hover:border-app-border",
  ghost:
    "border border-app-border text-app-subtext hover:bg-app-raised disabled:hover:bg-transparent",
  danger:
    "border border-app-error/50 text-app-error hover:bg-app-error/10 disabled:hover:bg-transparent",
};

/** Shared button styling, so the variants stay consistent across the screens. */
export function Button({ variant = "secondary", className = "", ...props }: Props) {
  return (
    <button
      {...props}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}
