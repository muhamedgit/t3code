import type { SVGProps } from "react";

/** The SentinelDev mark: a watchful eye whose pupil is a text cursor. Draws in `currentColor`. */
export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 100 64" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 32C24 3 76 3 94 32C76 61 24 61 6 32Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinejoin="round"
      />
      <rect x="44.5" y="18" width="11" height="28" rx="2.5" fill="currentColor" />
    </svg>
  );
}
