import type { SVGProps } from "react";

interface PaperclipLockupProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  decorative?: boolean;
  title?: string;
}

/**
 * Octopus lockup — mark plus wordmark. Kept under the historical
 * PaperclipLockup export name so existing imports keep working.
 */
export function PaperclipLockup({
  decorative = false,
  title = "Octopus",
  className,
  ...rest
}: PaperclipLockupProps) {
  return (
    <svg
      {...rest}
      className={className}
      viewBox="0 0 120 28"
      fill="currentColor"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="14" cy="11" rx="7" ry="6" />
        <path d="M7.2 15.2c-2.2 1.6-3.8 3.8-3.8 5.8M14 16.5c0 2-.2 4-.2 5.8M20.8 15.2c2.2 1.6 3.8 3.8 3.8 5.8M10.2 16.2c-.7 2-1.2 3.8-1.2 5.5M17.8 16.2c.7 2 1.2 3.8 1.2 5.5" />
      </g>
      <circle cx="11.5" cy="10.2" r="1.1" />
      <circle cx="16.5" cy="10.2" r="1.1" />
      <text
        x="34"
        y="19"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="16"
        fontWeight="600"
        fill="currentColor"
      >
        Octopus
      </text>
    </svg>
  );
}
