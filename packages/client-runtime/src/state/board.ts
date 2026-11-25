import {
  type BoardState,
  type Sprint,
  type SprintId,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
  WS_METHODS,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

/**
 * A project's scrum board per environment. One subscription carries the whole board and the server
 * pushes every change, so commands need no refresh: the next board arrives on the stream.
 */
export function createBoardEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  // Moves renumber a column, so one environment's board edits run in order.
  const concurrency = {
    mode: "serial" as const,
    key: ({ environmentId }: { readonly environmentId: string }) => environmentId,
  };
  const command = <Tag extends BoardCommandTag>(label: string, tag: Tag) =>
    createEnvironmentRpcCommand(runtime, {
      label: `environment-data:board:${label}`,
      tag,
      scheduler,
      concurrency,
    });
  return {
    state: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:board:state",
      tag: WS_METHODS.boardSubscribe,
    }),
    createTicket: command("create-ticket", WS_METHODS.boardTicketCreate),
    updateTicket: command("update-ticket", WS_METHODS.boardTicketUpdate),
    moveTicket: command("move-ticket", WS_METHODS.boardTicketMove),
    linkTicket: command("link-ticket", WS_METHODS.boardTicketLink),
    archiveTicket: command("archive-ticket", WS_METHODS.boardTicketArchive),
    createSprint: command("create-sprint", WS_METHODS.boardSprintCreate),
    updateSprint: command("update-sprint", WS_METHODS.boardSprintUpdate),
  };
}

type BoardCommandTag =
  | typeof WS_METHODS.boardTicketCreate
  | typeof WS_METHODS.boardTicketUpdate
  | typeof WS_METHODS.boardTicketMove
  | typeof WS_METHODS.boardTicketLink
  | typeof WS_METHODS.boardTicketArchive
  | typeof WS_METHODS.boardSprintCreate
  | typeof WS_METHODS.boardSprintUpdate;

/** Columns left to right. */
export const BOARD_COLUMNS: ReadonlyArray<TicketStatus> = ["todo", "doing", "blocked", "done"];

/** Most urgent first, for sorting and pickers. */
export const BOARD_PRIORITIES: ReadonlyArray<TicketPriority> = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];

/** Which tickets a board view shows: one sprint's, or the backlog's (tickets in no sprint). */
export type BoardScope = SprintId | "backlog";

/** Sprints in board order, open ones before closed ones. */
export function boardSprints(state: BoardState): ReadonlyArray<Sprint> {
  const rank = (sprint: Sprint) => (sprint.state === "closed" ? 1 : 0);
  return [...state.sprints].sort((a, b) => rank(a) - rank(b) || a.order - b.order);
}

/** The scope a board opens on: the requested sprint if it exists, the active one, or the backlog. */
export function resolveBoardScope(state: BoardState, requested: string | undefined): BoardScope {
  if (requested === "backlog") return "backlog";
  const named = state.sprints.find((sprint) => sprint.id === requested);
  if (named !== undefined) return named.id;
  return boardSprints(state).find((sprint) => sprint.state === "active")?.id ?? "backlog";
}

export interface BoardFilter {
  readonly query?: string | undefined;
  readonly priorities?: ReadonlyArray<TicketPriority> | undefined;
  readonly labels?: ReadonlyArray<string> | undefined;
}

function ticketMatchesFilter(ticket: Ticket, filter: BoardFilter): boolean {
  const query = filter.query?.trim().toLowerCase();
  if (
    query &&
    !ticket.title.toLowerCase().includes(query) &&
    !ticket.key.toLowerCase().includes(query) &&
    !ticket.description.toLowerCase().includes(query)
  ) {
    return false;
  }
  if (filter.priorities?.length && !filter.priorities.includes(ticket.priority)) return false;
  if (
    filter.labels?.length &&
    !filter.labels.some((label) => ticket.labels.some((own) => own === label))
  ) {
    return false;
  }
  return true;
}

const byColumnOrder = (a: Ticket, b: Ticket) =>
  a.order - b.order || a.createdAt.localeCompare(b.createdAt);

/** Every ticket of one column in the scope, in board order, filters ignored. */
export function boardColumn(
  state: BoardState,
  scope: BoardScope,
  status: TicketStatus,
): ReadonlyArray<Ticket> {
  const sprintId = scope === "backlog" ? null : scope;
  return state.tickets
    .filter((ticket) => ticket.status === status && ticket.sprintId === sprintId)
    .sort(byColumnOrder);
}

/** The shown columns for a scope and filter. */
export function boardColumns(
  state: BoardState,
  scope: BoardScope,
  filter: BoardFilter,
): ReadonlyMap<TicketStatus, ReadonlyArray<Ticket>> {
  return new Map(
    BOARD_COLUMNS.map((status) => [
      status,
      boardColumn(state, scope, status).filter((ticket) => ticketMatchesFilter(ticket, filter)),
    ]),
  );
}

/** Every label in use on the board, sorted. */
export function boardLabels(state: BoardState): ReadonlyArray<string> {
  return [...new Set(state.tickets.flatMap((ticket) => ticket.labels))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Ticket counts per sprint and for the backlog, for a sprint switcher. */
export function boardScopeCounts(state: BoardState): ReadonlyMap<BoardScope, number> {
  const counts = new Map<BoardScope, number>();
  for (const ticket of state.tickets) {
    const scope = ticket.sprintId ?? "backlog";
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }
  return counts;
}

/**
 * The server position for a drop. `shownIndex` counts the shown tickets other than the moving one.
 * The view may hide tickets behind a filter, so a drop before a shown ticket lands before that same
 * ticket in the whole column; a drop past the last shown ticket lands last.
 */
export function boardDropPosition(
  column: ReadonlyArray<Ticket>,
  shown: ReadonlyArray<Ticket>,
  shownIndex: number,
  movingId: Ticket["id"],
): number {
  const rest = column.filter((ticket) => ticket.id !== movingId);
  const before = shown.filter((ticket) => ticket.id !== movingId)[shownIndex];
  if (before === undefined) return rest.length;
  const index = rest.findIndex((ticket) => ticket.id === before.id);
  return index === -1 ? rest.length : index;
}
