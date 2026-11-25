import {
  type Board,
  BoardEnsureInput,
  BoardId,
  type BoardState,
  type ProjectId,
  DEFAULT_TICKET_KEY_PREFIX,
  type Sprint,
  SprintCreateInput,
  SprintId,
  SprintUpdateInput,
  type Ticket,
  TicketArchiveInput,
  TicketCreateInput,
  TicketId,
  TicketKey,
  TicketLinkInput,
  TicketMoveInput,
  type TicketLinks,
  TicketUpdateInput,
  ThreadId,
  type ThreadPullRequestKey,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Random from "effect/Random";
import * as Schema from "effect/Schema";

import * as BoardStoreMod from "./BoardStore.ts";
import type { BoardRow, TicketRow } from "./BoardStore.ts";

/** 128 bits of randomness as hex, for an id suffix. Uses Effect's Random, not node:crypto. */
const randomToken = Effect.map(
  Effect.all(Array.from({ length: 16 }, () => Random.nextIntBetween(0, 256, { halfOpen: true }))),
  (bytes) => bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(""),
);

export class BoardNotFoundError extends Schema.TaggedError<BoardNotFoundError>()(
  "BoardNotFoundError",
  { boardId: BoardId },
) {
  override get message(): string {
    return `No board ${this.boardId}.`;
  }
}

export class TicketNotFoundError extends Schema.TaggedError<TicketNotFoundError>()(
  "TicketNotFoundError",
  { ticketId: TicketId },
) {
  override get message(): string {
    return `No ticket ${this.ticketId}.`;
  }
}

export class SprintNotFoundError extends Schema.TaggedError<SprintNotFoundError>()(
  "SprintNotFoundError",
  { sprintId: SprintId },
) {
  override get message(): string {
    return `No sprint ${this.sprintId}.`;
  }
}

export type BoardServiceError =
  | BoardStoreMod.BoardStoreError
  | BoardNotFoundError
  | TicketNotFoundError
  | SprintNotFoundError;

function samePr(a: ThreadPullRequestKey, b: ThreadPullRequestKey): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeLinks(
  current: TicketLinks,
  input: {
    readonly addThreads?: ReadonlyArray<ThreadId> | undefined;
    readonly removeThreads?: ReadonlyArray<ThreadId> | undefined;
    readonly addPullRequests?: ReadonlyArray<ThreadPullRequestKey> | undefined;
    readonly removePullRequests?: ReadonlyArray<ThreadPullRequestKey> | undefined;
  },
): TicketLinks {
  const removeThreads = new Set(input.removeThreads ?? []);
  const threads = Array.from(
    new Set([...current.threads.filter((t) => !removeThreads.has(t)), ...(input.addThreads ?? [])]),
  );
  const removePrs = input.removePullRequests ?? [];
  const keptPrs = current.pullRequests.filter((p) => !removePrs.some((r) => samePr(r, p)));
  const pullRequests: ThreadPullRequestKey[] = [...keptPrs];
  for (const pr of input.addPullRequests ?? []) {
    if (!pullRequests.some((p) => samePr(p, pr))) pullRequests.push(pr);
  }
  return { threads, pullRequests };
}

/** Column order: position first, then age, so tickets that share a position keep a stable order. */
function byColumnOrder(a: TicketRow, b: TicketRow): number {
  return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
}

/** End-of-column order: one past the current maximum, so a new ticket lands last. */
function nextOrder(rows: ReadonlyArray<{ readonly order: number }>): number {
  return rows.reduce((max, row) => Math.max(max, row.order + 1), 0);
}

export class BoardService extends Context.Service<
  BoardService,
  {
    readonly ensureBoard: (input: BoardEnsureInput) => Effect.Effect<Board, BoardServiceError>;
    readonly getState: (
      boardId: BoardId,
    ) => Effect.Effect<Option.Option<BoardState>, BoardServiceError>;
    readonly getStateByProject: (
      projectId: BoardEnsureInput["projectId"],
    ) => Effect.Effect<Option.Option<BoardState>, BoardServiceError>;
    readonly projectOf: (
      boardId: BoardId,
    ) => Effect.Effect<Option.Option<ProjectId>, BoardServiceError>;
    readonly createTicket: (input: TicketCreateInput) => Effect.Effect<Ticket, BoardServiceError>;
    readonly updateTicket: (input: TicketUpdateInput) => Effect.Effect<Ticket, BoardServiceError>;
    readonly moveTicket: (input: TicketMoveInput) => Effect.Effect<Ticket, BoardServiceError>;
    readonly linkTicket: (input: TicketLinkInput) => Effect.Effect<Ticket, BoardServiceError>;
    readonly archiveTicket: (input: TicketArchiveInput) => Effect.Effect<Ticket, BoardServiceError>;
    readonly createSprint: (input: SprintCreateInput) => Effect.Effect<Sprint, BoardServiceError>;
    readonly updateSprint: (input: SprintUpdateInput) => Effect.Effect<Sprint, BoardServiceError>;
  }
>()("t3/board/BoardService") {}

const make = Effect.gen(function* () {
  const store = yield* BoardStoreMod.BoardStore;

  const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

  const buildState = Effect.fn("BoardService.buildState")(function* (boardRow: BoardRow) {
    const sprints = yield* store.listSprints(boardRow.id);
    const tickets = yield* store.listTickets(boardRow.id);
    return {
      board: store.toBoard(boardRow),
      sprints: sprints.map(store.toSprint),
      tickets,
    } satisfies BoardState;
  });

  const requireTicket = (ticketId: TicketId) =>
    store.getTicket(ticketId).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(new TicketNotFoundError({ ticketId })),
          onSome: (row: TicketRow) => Effect.succeed(row),
        }),
      ),
    );

  const requireBoard = (boardId: BoardId) =>
    store.getBoard(boardId).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(new BoardNotFoundError({ boardId })),
          onSome: (row: BoardRow) => Effect.succeed(row),
        }),
      ),
    );

  const projectOf = (boardId: BoardId) =>
    store.getBoard(boardId).pipe(Effect.map(Option.map((row) => row.projectId)));

  const ensureBoard = Effect.fn("BoardService.ensureBoard")(function* (input: BoardEnsureInput) {
    const existing = yield* store.getBoardByProject(input.projectId);
    if (Option.isSome(existing)) return store.toBoard(existing.value);
    const now = yield* nowIso;
    const token = yield* randomToken;
    const row: BoardRow = {
      id: BoardId.make(`board_${token}`),
      projectId: input.projectId,
      name: input.name ?? TrimmedNonEmptyString.make("Board"),
      keyPrefix: input.keyPrefix ?? TrimmedNonEmptyString.make(DEFAULT_TICKET_KEY_PREFIX),
      nextKeySeq: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    yield* store.upsertBoard(row);
    return store.toBoard(row);
  });

  const getState = Effect.fn("BoardService.getState")(function* (boardId: BoardId) {
    const boardRow = yield* store.getBoard(boardId);
    if (Option.isNone(boardRow)) return Option.none<BoardState>();
    return Option.some(yield* buildState(boardRow.value));
  });

  const getStateByProject = Effect.fn("BoardService.getStateByProject")(function* (
    projectId: BoardEnsureInput["projectId"],
  ) {
    const boardRow = yield* store.getBoardByProject(projectId);
    if (Option.isNone(boardRow)) return Option.none<BoardState>();
    return Option.some(yield* buildState(boardRow.value));
  });

  const createTicket = Effect.fn("BoardService.createTicket")(function* (input: TicketCreateInput) {
    const boardRow = yield* requireBoard(input.boardId);
    const now = yield* nowIso;
    const token = yield* randomToken;
    const existing = yield* store.listTickets(input.boardId, { includeArchived: true });
    const ticket: TicketRow = {
      id: TicketId.make(`ticket_${token}`),
      boardId: input.boardId,
      key: TicketKey.make(`${boardRow.keyPrefix}-${boardRow.nextKeySeq}`),
      title: input.title,
      description: input.description ?? "",
      status: input.status ?? "todo",
      priority: input.priority ?? "none",
      labels: input.labels ?? [],
      sprintId: input.sprintId ?? null,
      order: nextOrder(existing),
      links: { threads: [], pullRequests: [] },
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    yield* store.upsertTicket(ticket);
    yield* store.upsertBoard({ ...boardRow, nextKeySeq: boardRow.nextKeySeq + 1, updatedAt: now });
    return ticket;
  });

  const updateTicket = Effect.fn("BoardService.updateTicket")(function* (input: TicketUpdateInput) {
    const current = yield* requireTicket(input.ticketId);
    const now = yield* nowIso;
    const next: TicketRow = {
      ...current,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.labels === undefined ? {} : { labels: input.labels }),
      updatedAt: now,
    };
    yield* store.upsertTicket(next);
    return next;
  });

  /**
   * A column is one status within one sprint (or the backlog). `order` is the ticket's position in
   * its destination column; that column is renumbered so positions stay dense. A ticket moved to
   * another column without a position lands last.
   */
  const moveTicket = Effect.fn("BoardService.moveTicket")(function* (input: TicketMoveInput) {
    const current = yield* requireTicket(input.ticketId);
    const status = input.status ?? current.status;
    const sprintId = input.sprintId === undefined ? current.sprintId : input.sprintId;
    const changesColumn = status !== current.status || sprintId !== current.sprintId;
    if (input.order === undefined && !changesColumn) return current;
    const now = yield* nowIso;
    const siblings = (yield* store.listTickets(current.boardId))
      .filter((t) => t.id !== current.id && t.status === status && t.sprintId === sprintId)
      .toSorted(byColumnOrder);
    const index = Math.min(input.order ?? siblings.length, siblings.length);
    const moved: TicketRow = { ...current, status, sprintId, order: index, updatedAt: now };
    const column = [...siblings.slice(0, index), moved, ...siblings.slice(index)];
    for (const [order, ticket] of column.entries()) {
      if (ticket === moved || ticket.order !== order)
        yield* store.upsertTicket({ ...ticket, order });
    }
    return moved;
  });

  const linkTicket = Effect.fn("BoardService.linkTicket")(function* (input: TicketLinkInput) {
    const current = yield* requireTicket(input.ticketId);
    const now = yield* nowIso;
    const next: TicketRow = { ...current, links: mergeLinks(current.links, input), updatedAt: now };
    yield* store.upsertTicket(next);
    return next;
  });

  const archiveTicket = Effect.fn("BoardService.archiveTicket")(function* (
    input: TicketArchiveInput,
  ) {
    const current = yield* requireTicket(input.ticketId);
    const now = yield* nowIso;
    const next: TicketRow = {
      ...current,
      archivedAt: input.archived ? now : null,
      updatedAt: now,
    };
    yield* store.upsertTicket(next);
    return next;
  });

  const createSprint = Effect.fn("BoardService.createSprint")(function* (input: SprintCreateInput) {
    yield* requireBoard(input.boardId);
    const now = yield* nowIso;
    const token = yield* randomToken;
    const existing = yield* store.listSprints(input.boardId);
    const sprint = {
      id: SprintId.make(`sprint_${token}`),
      boardId: input.boardId,
      name: input.name,
      goal: input.goal ?? null,
      state: "planned" as const,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      order: nextOrder(existing),
      createdAt: now,
      updatedAt: now,
    };
    yield* store.upsertSprint({ ...sprint, deletedAt: null });
    return sprint;
  });

  const updateSprint = Effect.fn("BoardService.updateSprint")(function* (input: SprintUpdateInput) {
    const current = yield* store.getSprint(input.sprintId);
    if (Option.isNone(current)) {
      return yield* new SprintNotFoundError({ sprintId: input.sprintId });
    }
    const now = yield* nowIso;
    const next = {
      ...current.value,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.goal === undefined ? {} : { goal: input.goal }),
      ...(input.state === undefined ? {} : { state: input.state }),
      ...(input.startsAt === undefined ? {} : { startsAt: input.startsAt }),
      ...(input.endsAt === undefined ? {} : { endsAt: input.endsAt }),
      ...(input.order === undefined ? {} : { order: input.order }),
      updatedAt: now,
    };
    yield* store.upsertSprint(next);
    return store.toSprint(next);
  });

  return BoardService.of({
    ensureBoard,
    getState,
    getStateByProject,
    projectOf,
    createTicket,
    updateTicket,
    moveTicket,
    linkTicket,
    archiveTicket,
    createSprint,
    updateSprint,
  });
});

export const layer = Layer.effect(BoardService, make).pipe(Layer.provide(BoardStoreMod.layer));
