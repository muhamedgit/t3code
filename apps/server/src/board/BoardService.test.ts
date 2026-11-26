import { ProjectId, type Ticket } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

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

  it.effect("numbers a new ticket by its place in its own column", () =>
    Effect.gen(function* () {
      const service = yield* BoardService.BoardService;
      const board = yield* service.ensureBoard({ projectId: PROJECT_ID });
      const sprint = yield* service.createSprint({ boardId: board.id, name: "Sprint 1" });
      yield* service.createTicket({ boardId: board.id, title: "A" });
      yield* service.createTicket({ boardId: board.id, title: "B" });
      const inSprint = yield* service.createTicket({
        boardId: board.id,
        title: "C",
        sprintId: sprint.id,
      });
      const doing = yield* service.createTicket({ boardId: board.id, title: "D", status: "doing" });
      const third = yield* service.createTicket({ boardId: board.id, title: "E" });
      expect([inSprint.order, doing.order, third.order]).toEqual([0, 0, 2]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("records sprint dates and allows one active sprint", () =>
    Effect.gen(function* () {
      const service = yield* BoardService.BoardService;
      const board = yield* service.ensureBoard({ projectId: PROJECT_ID });
      const first = yield* service.createSprint({ boardId: board.id, name: "Sprint 1" });
      const second = yield* service.createSprint({ boardId: board.id, name: "Sprint 2" });

      const started = yield* service.updateSprint({ sprintId: first.id, state: "active" });
      expect(started.startsAt).not.toBeNull();
      expect(started.endsAt).toBeNull();

      const refused = yield* Effect.flip(
        service.updateSprint({ sprintId: second.id, state: "active" }),
      );
      expect(refused._tag).toBe("SprintConflictError");

      const closed = yield* service.updateSprint({ sprintId: first.id, state: "closed" });
      expect(closed.endsAt).not.toBeNull();
      expect(closed.startsAt).toBe(started.startsAt);
      expect((yield* service.updateSprint({ sprintId: second.id, state: "active" })).state).toBe(
        "active",
      );
    }).pipe(Effect.provide(layer)),
  );

  it.effect("closing a sprint moves tickets not done to the backlog or the next sprint", () =>
    Effect.gen(function* () {
      const service = yield* BoardService.BoardService;
      const board = yield* service.ensureBoard({ projectId: PROJECT_ID });
      const sprintOf = (title: string) =>
        service
          .getState(board.id)
          .pipe(
            Effect.map(
              (s) => Option.getOrThrow(s).tickets.find((t) => t.title === title)?.sprintId,
            ),
          );

      const first = yield* service.createSprint({ boardId: board.id, name: "Sprint 1" });
      yield* service.createTicket({ boardId: board.id, title: "Waiting" });
      for (const [title, status] of [
        ["Shipped", "done"],
        ["Working", "doing"],
        ["Stuck", "blocked"],
      ] as const) {
        yield* service.createTicket({ boardId: board.id, title, status, sprintId: first.id });
      }
      yield* service.updateSprint({ sprintId: first.id, state: "active" });
      yield* service.updateSprint({ sprintId: first.id, state: "closed" });
      expect(yield* sprintOf("Shipped")).toBe(first.id);
      expect(yield* sprintOf("Working")).toBeNull();
      expect(yield* sprintOf("Stuck")).toBeNull();

      const second = yield* service.createSprint({ boardId: board.id, name: "Sprint 2" });
      const third = yield* service.createSprint({ boardId: board.id, name: "Sprint 3" });
      const ticket = yield* service.createTicket({
        boardId: board.id,
        title: "Carried",
        sprintId: second.id,
      });
      expect(
        (yield* Effect.flip(
          service.updateSprint({ sprintId: second.id, state: "closed", carryOverTo: first.id }),
        ))._tag,
      ).toBe("SprintConflictError");
      yield* service.updateSprint({ sprintId: second.id, state: "closed", carryOverTo: third.id });
      expect(yield* sprintOf(ticket.title)).toBe(third.id);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("moves the board's updatedAt with ticket changes", () =>
    Effect.gen(function* () {
      const service = yield* BoardService.BoardService;
      const board = yield* service.ensureBoard({ projectId: PROJECT_ID });
      const ticket = yield* service.createTicket({ boardId: board.id, title: "A" });
      const before = Option.getOrThrow(yield* service.getState(board.id)).board.updatedAt;
      yield* TestClock.adjust("1 second");
      yield* service.moveTicket({ ticketId: ticket.id, status: "doing" });
      const after = Option.getOrThrow(yield* service.getState(board.id)).board.updatedAt;
      expect(after > before).toBe(true);
    }).pipe(Effect.provide(layer)),
  );
});
