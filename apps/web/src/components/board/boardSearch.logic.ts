import { BOARD_PRIORITIES } from "@t3tools/client-runtime/state/board";
import type { EnvironmentId, ProjectId, TicketPriority } from "@t3tools/contracts";

export interface BoardSearch {
  readonly boardEnvironmentId?: EnvironmentId | undefined;
  readonly boardProjectId?: ProjectId | undefined;
  /** A sprint id, or `backlog`. Absent opens the active sprint. */
  readonly sprint?: string | undefined;
  readonly q?: string | undefined;
  readonly priority?: ReadonlyArray<TicketPriority> | undefined;
  readonly label?: ReadonlyArray<string> | undefined;
  /** The ticket whose details are open. */
  readonly ticket?: string | undefined;
}

// The router reads a bare `q=42` as a number.
const text = (value: unknown): string | undefined => {
  const raw = typeof value === "number" ? String(value) : value;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed ? trimmed.slice(0, 200) : undefined;
};

const list = (value: unknown): ReadonlyArray<string> =>
  (Array.isArray(value) ? value : [value]).flatMap((item) => text(item) ?? []).slice(0, 20);

const isPriority = (value: string): value is TicketPriority =>
  (BOARD_PRIORITIES as ReadonlyArray<string>).includes(value);

// Every key is an own key, even when undefined: the router lays these over the parent route's
// unvalidated search, where a key left out would keep its raw value.
export const boardSearchFromUrl = (raw: Record<string, unknown>): BoardSearch => {
  const priority = list(raw.priority).filter(isPriority);
  const label = list(raw.label);
  return {
    boardEnvironmentId: text(raw.boardEnvironmentId) as EnvironmentId | undefined,
    boardProjectId: text(raw.boardProjectId) as ProjectId | undefined,
    sprint: text(raw.sprint),
    q: text(raw.q),
    priority: priority.length === 0 ? undefined : priority,
    label: label.length === 0 ? undefined : label,
    ticket: text(raw.ticket),
  };
};
