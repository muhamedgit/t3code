import { ProjectId, type Ticket } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as BoardService from "./BoardService.ts";

const PROJECT_ID = ProjectId.make("project-1");

const layer = BoardService.layer.pipe(Layer.provide(SqlitePersistence.layerMemory));

const column = (tickets: ReadonlyArray<Ticket>, status: Ticket["status"]) =>
  tickets
    .filter((ticket) => ticket.status === status && ticket.sprintId === null)
    .toSorted((a, b) => a.order - b.order)
    .map((ticket) => ticket.title);

describe("BoardService", () => {
  it.effect("makes one board per project and numbers ticket keys from it", () =>
    Effect.gen(function* () {
      const service = yield* BoardService.BoardService;
      const board = yield* service.ensureBoard({ projectId: PROJECT_ID });
      expect((yield* service.ensureBoard({ projectId: PROJECT_ID })).id).toBe(board.id);
      const first = yield* service.createTicket({ boardId: board.id, title: "One" });
      const second = yield* service.createTicket({ boardId: board.id, title: "Two" });
      expect([first.key, second.key]).toEqual(["SENT-1", "SENT-2"]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("moves a ticket to a position and keeps each column dense", () =>
    Effect.gen(function* () {
      const service = yield* BoardService.BoardService;
      const board = yield* service.ensureBoard({ projectId: PROJECT_ID });
      const [a, b, c] = yield* Effect.forEach(["A", "B", "C"], (title) =>
        service.createTicket({ boardId: board.id, title }),
      );
      const state = () =>
        service.getState(board.id).pipe(Effect.map((s) => Option.getOrThrow(s).tickets));

      yield* service.moveTicket({ ticketId: c!.id, order: 0 });
      expect(column(yield* state(), "todo")).toEqual(["C", "A", "B"]);

      // Another column without a position: last there.
      yield* service.moveTicket({ ticketId: a!.id, status: "doing" });
      yield* service.moveTicket({ ticketId: b!.id, status: "doing" });
      expect(column(yield* state(), "doing")).toEqual(["A", "B"]);
      expect(column(yield* state(), "todo")).toEqual(["C"]);

      yield* service.moveTicket({ ticketId: c!.id, status: "doing", order: 1 });
      const tickets = yield* state();
      expect(column(tickets, "doing")).toEqual(["A", "C", "B"]);
      expect(
        tickets
          .filter((t) => t.status === "doing")
          .map((t) => t.order)
          .toSorted(),
      ).toEqual([0, 1, 2]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("moves a ticket into a sprint and back to the backlog", () =>
    Effect.gen(function* () {
      const service = yield* BoardService.BoardService;
      const board = yield* service.ensureBoard({ projectId: PROJECT_ID });
      const sprint = yield* service.createSprint({ boardId: board.id, name: "Sprint 1" });
      const ticket = yield* service.createTicket({ boardId: board.id, title: "Plan" });
      expect(
        (yield* service.moveTicket({ ticketId: ticket.id, sprintId: sprint.id })).sprintId,
      ).toBe(sprint.id);
      expect((yield* service.moveTicket({ ticketId: ticket.id, sprintId: null })).sprintId).toBe(
        null,
      );
    }).pipe(Effect.provide(layer)),
  );
});
