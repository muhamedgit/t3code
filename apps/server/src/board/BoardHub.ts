import {
  type Board,
  type BoardEnsureInput,
  type BoardId,
  type BoardState,
  type ProjectId,
  type Sprint,
  type SprintCreateInput,
  type SprintUpdateInput,
  type Ticket,
  type TicketArchiveInput,
  type TicketCreateInput,
  type TicketLinkInput,
  type TicketMoveInput,
  type TicketUpdateInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

import * as BoardServiceMod from "./BoardService.ts";

type Err = BoardServiceMod.BoardServiceError;

interface BoardChange {
  readonly projectId: ProjectId;
  readonly state: BoardState;
}

/**
 * The board's write + live-sync facade. A client subscribes with `watch(projectId)` and receives
 * the current board (created if the project has none) followed by every change. Every mutation
 * writes through `BoardService` and then republishes, so all subscribers converge.
 */
export class BoardHub extends Context.Service<
  BoardHub,
  {
    readonly watch: (projectId: ProjectId) => Stream.Stream<BoardState, Err>;
    readonly ensureBoard: (input: BoardEnsureInput) => Effect.Effect<Board, Err>;
    readonly createTicket: (input: TicketCreateInput) => Effect.Effect<Ticket, Err>;
    readonly updateTicket: (input: TicketUpdateInput) => Effect.Effect<Ticket, Err>;
    readonly moveTicket: (input: TicketMoveInput) => Effect.Effect<Ticket, Err>;
    readonly linkTicket: (input: TicketLinkInput) => Effect.Effect<Ticket, Err>;
    readonly archiveTicket: (input: TicketArchiveInput) => Effect.Effect<Ticket, Err>;
    readonly createSprint: (input: SprintCreateInput) => Effect.Effect<Sprint, Err>;
    readonly updateSprint: (input: SprintUpdateInput) => Effect.Effect<Sprint, Err>;
  }
>()("t3/board/BoardHub") {}

const make = Effect.gen(function* () {
  const service = yield* BoardServiceMod.BoardService;
  const pubsub = yield* PubSub.unbounded<BoardChange>();

  const publish = (projectId: ProjectId) =>
    service.getStateByProject(projectId).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.void,
          onSome: (state) => PubSub.publish(pubsub, { projectId, state }).pipe(Effect.asVoid),
        }),
      ),
    );

  const publishForBoard = (boardId: BoardId) =>
    service
      .projectOf(boardId)
      .pipe(
        Effect.flatMap(
          Option.match({ onNone: () => Effect.void, onSome: (projectId) => publish(projectId) }),
        ),
      );

  const watch = (projectId: ProjectId) => {
    const initial = Stream.fromEffect(
      service.ensureBoard({ projectId }).pipe(
        Effect.flatMap(() => service.getStateByProject(projectId)),
        Effect.map(Option.getOrUndefined),
      ),
    ).pipe(Stream.filter((state): state is BoardState => state !== undefined));
    const updates = Stream.fromPubSub(pubsub).pipe(
      Stream.filter((change) => change.projectId === projectId),
      Stream.map((change) => change.state),
    );
    return Stream.concat(initial, updates);
  };

  const ensureBoard = (input: BoardEnsureInput) =>
    service.ensureBoard(input).pipe(Effect.tap((board) => publish(board.projectId)));
  const createTicket = (input: TicketCreateInput) =>
    service.createTicket(input).pipe(Effect.tap((ticket) => publishForBoard(ticket.boardId)));
  const updateTicket = (input: TicketUpdateInput) =>
    service.updateTicket(input).pipe(Effect.tap((ticket) => publishForBoard(ticket.boardId)));
  const moveTicket = (input: TicketMoveInput) =>
    service.moveTicket(input).pipe(Effect.tap((ticket) => publishForBoard(ticket.boardId)));
  const linkTicket = (input: TicketLinkInput) =>
    service.linkTicket(input).pipe(Effect.tap((ticket) => publishForBoard(ticket.boardId)));
  const archiveTicket = (input: TicketArchiveInput) =>
    service.archiveTicket(input).pipe(Effect.tap((ticket) => publishForBoard(ticket.boardId)));
  const createSprint = (input: SprintCreateInput) =>
    service.createSprint(input).pipe(Effect.tap((sprint) => publishForBoard(sprint.boardId)));
  const updateSprint = (input: SprintUpdateInput) =>
    service.updateSprint(input).pipe(Effect.tap((sprint) => publishForBoard(sprint.boardId)));

  return BoardHub.of({
    watch,
    ensureBoard,
    createTicket,
    updateTicket,
    moveTicket,
    linkTicket,
    archiveTicket,
    createSprint,
    updateSprint,
  });
});

export const layer = Layer.effect(BoardHub, make).pipe(Layer.provide(BoardServiceMod.layer));
