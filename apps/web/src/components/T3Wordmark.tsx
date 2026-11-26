import type { SVGProps } from "react";

/**
 * The SentinelDev mark ("sonar eye"): code brackets around a watchful pupil whose slot is a text
 * cursor. A one-colour cut of `assets/sentineldev/icon.svg`; draws in `currentColor`.
 */
export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 100 64" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M25 10L7 32L25 54M75 10L93 32L75 54"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M37 32a13 13 0 1 0 26 0a13 13 0 1 0 -26 0ZM47.75 24.5v15h4.5v-15Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}
