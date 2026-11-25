import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ThreadPullRequestKey } from "./threadPullRequest.ts";

/**
 * SentinelDev scrum board: a native, writable board per project. Unlike `issue.ts` (external
 * trackers, read-mostly, keyed by URL), these records live in SentinelDev's own durable store and
 * sync to every client. One board per project; tickets move across columns and in and out of sprints.
 */

export const BoardId = TrimmedNonEmptyString.pipe(Schema.brand("BoardId"));
export type BoardId = typeof BoardId.Type;

export const SprintId = TrimmedNonEmptyString.pipe(Schema.brand("SprintId"));
export type SprintId = typeof SprintId.Type;

export const TicketId = TrimmedNonEmptyString.pipe(Schema.brand("TicketId"));
export type TicketId = typeof TicketId.Type;

/** A human handle for a ticket, such as `SENT-12`. Unique within a board. */
export const TicketKey = TrimmedNonEmptyString.pipe(Schema.brand("TicketKey"));
export type TicketKey = typeof TicketKey.Type;

/** A free-form label, trimmed and non-empty. */
export const TicketLabel = TrimmedNonEmptyString.pipe(Schema.brand("TicketLabel"));
export type TicketLabel = typeof TicketLabel.Type;

const TICKET_STATUSES = ["todo", "doing", "done", "blocked"] as const;
export const TicketStatus = Schema.Literals(TICKET_STATUSES);
export type TicketStatus = typeof TicketStatus.Type;

const TICKET_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export const TicketPriority = Schema.Literals(TICKET_PRIORITIES);
export type TicketPriority = typeof TicketPriority.Type;

const SPRINT_STATES = ["planned", "active", "closed"] as const;
export const SprintState = Schema.Literals(SPRINT_STATES);
export type SprintState = typeof SprintState.Type;

/** Default ticket key prefix for a new board (the owner can override per board). */
export const DEFAULT_TICKET_KEY_PREFIX = "SENT";

/** What a ticket points at. Threads and pull requests are linked, never owned. */
export const TicketLinks = Schema.Struct({
  threads: Schema.Array(ThreadId),
  pullRequests: Schema.Array(ThreadPullRequestKey),
});
export type TicketLinks = typeof TicketLinks.Type;

export const Sprint = Schema.Struct({
  id: SprintId,
  boardId: BoardId,
  name: TrimmedNonEmptyString,
  goal: Schema.NullOr(Schema.String),
  state: SprintState,
  startsAt: Schema.NullOr(IsoDateTime),
  endsAt: Schema.NullOr(IsoDateTime),
  /** Sort order among a board's sprints. */
  order: NonNegativeInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Sprint = typeof Sprint.Type;

export const Ticket = Schema.Struct({
  id: TicketId,
  boardId: BoardId,
  key: TicketKey,
  title: TrimmedNonEmptyString,
  description: Schema.String,
  status: TicketStatus,
  priority: TicketPriority,
  labels: Schema.Array(TicketLabel),
  /** `null` means the ticket is in the backlog rather than a sprint. */
  sprintId: Schema.NullOr(SprintId),
  /** Sort order within its column/backlog. */
  order: NonNegativeInt,
  links: TicketLinks,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /** Non-null once archived; archived tickets stay off the board but are recoverable. */
  archivedAt: Schema.NullOr(IsoDateTime),
});
export type Ticket = typeof Ticket.Type;

export const Board = Schema.Struct({
  id: BoardId,
  projectId: ProjectId,
  name: TrimmedNonEmptyString,
  /** Prefix for generated ticket keys, e.g. `SENT`. */
  keyPrefix: TrimmedNonEmptyString,
  /** Next sequence number for a generated ticket key. */
  nextKeySeq: NonNegativeInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Board = typeof Board.Type;

/** The full board a client subscribes to. Trimmed per view where a subscription needs less. */
export const BoardState = Schema.Struct({
  board: Board,
  sprints: Schema.Array(Sprint),
  tickets: Schema.Array(Ticket),
});
export type BoardState = typeof BoardState.Type;

export const BoardEnsureInput = Schema.Struct({
  projectId: ProjectId,
  name: Schema.optional(TrimmedNonEmptyString),
  keyPrefix: Schema.optional(TrimmedNonEmptyString),
});
export type BoardEnsureInput = typeof BoardEnsureInput.Type;

export const TicketCreateInput = Schema.Struct({
  boardId: BoardId,
  title: TrimmedNonEmptyString,
  description: Schema.optional(Schema.String),
  status: Schema.optional(TicketStatus),
  priority: Schema.optional(TicketPriority),
  labels: Schema.optional(Schema.Array(TicketLabel)),
  /** Omit or `null` to put the ticket in the backlog. */
  sprintId: Schema.optional(Schema.NullOr(SprintId)),
});
export type TicketCreateInput = typeof TicketCreateInput.Type;

export const TicketUpdateInput = Schema.Struct({
  ticketId: TicketId,
  title: Schema.optional(TrimmedNonEmptyString),
  description: Schema.optional(Schema.String),
  priority: Schema.optional(TicketPriority),
  labels: Schema.optional(Schema.Array(TicketLabel)),
});
export type TicketUpdateInput = typeof TicketUpdateInput.Type;

/** Move a ticket across columns and in/out of a sprint, and reorder it. */
export const TicketMoveInput = Schema.Struct({
  ticketId: TicketId,
  status: Schema.optional(TicketStatus),
  sprintId: Schema.optional(Schema.NullOr(SprintId)),
  order: Schema.optional(
    NonNegativeInt.annotate({
      description: "Position in the destination column, 0 first. Omit to keep it, or go last.",
    }),
  ),
});
export type TicketMoveInput = typeof TicketMoveInput.Type;

export const TicketLinkInput = Schema.Struct({
  ticketId: TicketId,
  addThreads: Schema.optional(Schema.Array(ThreadId)),
  removeThreads: Schema.optional(Schema.Array(ThreadId)),
  addPullRequests: Schema.optional(Schema.Array(ThreadPullRequestKey)),
  removePullRequests: Schema.optional(Schema.Array(ThreadPullRequestKey)),
});
export type TicketLinkInput = typeof TicketLinkInput.Type;

export const TicketArchiveInput = Schema.Struct({
  ticketId: TicketId,
  archived: Schema.Boolean,
});
export type TicketArchiveInput = typeof TicketArchiveInput.Type;

export const SprintCreateInput = Schema.Struct({
  boardId: BoardId,
  name: TrimmedNonEmptyString,
  goal: Schema.optional(Schema.String),
  startsAt: Schema.optional(IsoDateTime),
  endsAt: Schema.optional(IsoDateTime),
});
export type SprintCreateInput = typeof SprintCreateInput.Type;

export const SprintUpdateInput = Schema.Struct({
  sprintId: SprintId,
  name: Schema.optional(TrimmedNonEmptyString),
  goal: Schema.optional(Schema.NullOr(Schema.String)),
  state: Schema.optional(SprintState),
  startsAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  endsAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  order: Schema.optional(NonNegativeInt),
});
export type SprintUpdateInput = typeof SprintUpdateInput.Type;

/** Subscribe to a project's board (one board per project; created on first subscribe). */
export const BoardSubscribeInput = Schema.Struct({ projectId: ProjectId });
export type BoardSubscribeInput = typeof BoardSubscribeInput.Type;

const BOARD_RPC_ERROR_KINDS = ["not_found", "failed"] as const;

/** The wire error for board RPCs; server-side service errors map onto it. */
export class BoardRpcError extends Schema.TaggedError<BoardRpcError>()("BoardRpcError", {
  kind: Schema.Literals(BOARD_RPC_ERROR_KINDS),
  reason: Schema.String,
}) {
  override get message(): string {
    return this.reason;
  }
}
