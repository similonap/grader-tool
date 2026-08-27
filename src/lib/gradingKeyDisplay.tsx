import { Fragment, type ReactNode } from "react";

/** Shared visual language for anywhere a grading key's sections are rendered (the key itself, a solution's report). */
export const ACCENT_RAMP = ["#8a97a0", "#3f7d7a", "#3f6f8f", "#5a6bab", "#8a5aab", "#c2508f", "#d85a1f"];

export function fmtPts(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** Renders `code`-quoted spans of a criterion description with the same inline-code styling used everywhere else. */
export function renderDescription(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
