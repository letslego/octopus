import type { SVGProps } from "react";
import { cn } from "../lib/utils";

/** Animated Octopus mark used for loading/thinking affordances. */
export function AnimatedPaperclipIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("paperclip-thinking-icon", className)}
      aria-hidden="true"
      {...props}
    >
      <g
        className="paperclip-thinking-icon-path"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse cx="12" cy="9" rx="5.2" ry="4.4" />
        <path d="M7.2 12.2c-1.8 1.4-3.2 3.4-3.2 5.3M12 13.2c0 1.8-.2 3.6-.2 5.4M16.8 12.2c1.8 1.4 3.2 3.4 3.2 5.3M9.2 13c-.6 1.8-1.1 3.5-1.1 5.1M14.8 13c.6 1.8 1.1 3.5 1.1 5.1" />
      </g>
      <circle cx="10.2" cy="8.6" r="0.9" fill="currentColor" />
      <circle cx="13.8" cy="8.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** Full-page loading state: a large, centered, muted animated Octopus mark. */
export function PaperclipLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex min-h-dvh w-full items-center justify-center", className)}
    >
      <AnimatedPaperclipIcon className="h-24 w-24 text-muted-foreground" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
