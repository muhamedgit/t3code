import { describe, expect, it } from "@effect/vitest";
import {
  BoardId,
  type BoardState,
  ProjectId,
  type Sprint,
  SprintId,
  type Ticket,
  TicketId,
  TicketKey,
  TicketLabel,
} from "@t3tools/contracts";

import {
  boardColumn,
  boardColumns,
  boardDropPosition,
  boardLabels,
  boardScopeCounts,
  resolveBoardScope,
} from "./board.ts";

const BOARD_ID = BoardId.make("board_1");
const AT = "2026-11-01T00:00:00.000Z";

const ticket = (id: string, overrides: Partial<Ticket> = {}): Ticket => ({
  id: TicketId.make(id),
  boardId: BOARD_ID,
  key: TicketKey.make(`SENT-${id}`),
  title: `Ticket ${id}`,
  description: "",
  status: "todo",
  priority: "none",
  labels: [],
  sprintId: null,
  order: 0,
  links: { threads: [], pullRequests: [] },
  createdAt: AT,
  updatedAt: AT,
  archivedAt: null,
  ...overrides,
});

const sprint = (id: string, state: Sprint["state"], order: number): Sprint => ({
  id: SprintId.make(id),
  boardId: BOARD_ID,
  name: id,
  goal: null,
  state,
  startsAt: null,
  endsAt: null,
  order,
  createdAt: AT,
  updatedAt: AT,
});

const board = (
  tickets: ReadonlyArray<Ticket>,
  sprints: ReadonlyArray<Sprint> = [],
): BoardState => ({
  board: {
    id: BOARD_ID,
    projectId: ProjectId.make("project-1"),
    name: "Board",
    keyPrefix: "SENT",
    nextKeySeq: tickets.length + 1,
    createdAt: AT,
    updatedAt: AT,
  },
  sprints,
  tickets,
});

describe("board state helpers", () => {
  it("opens on the requested sprint, else the active one, else the backlog", () => {
    const state = board([], [sprint("s1", "closed", 0), sprint("s2", "active", 1)]);
    expect(resolveBoardScope(state, "s1")).toBe("s1");
    expect(resolveBoardScope(state, "missing")).toBe("s2");
    expect(resolveBoardScope(state, "backlog")).toBe("backlog");
    expect(resolveBoardScope(board([]), undefined)).toBe("backlog");
  });

  it("groups one scope's tickets by status in column order", () => {
    const sprintId = SprintId.make("s1");
    const state = board([
      ticket("a", { order: 1 }),
      ticket("b", { order: 0 }),
      ticket("c", { status: "doing" }),
      ticket("d", { sprintId }),
    ]);
    const columns = boardColumns(state, "backlog", {});
    expect(columns.get("todo")?.map((t) => t.id)).toEqual(["b", "a"]);
    expect(columns.get("doing")?.map((t) => t.id)).toEqual(["c"]);
    expect(columns.get("done")).toEqual([]);
    expect(boardColumn(state, sprintId, "todo").map((t) => t.id)).toEqual(["d"]);
  });

  it("filters by text, priority and label", () => {
    const state = board([
      ticket("a", { title: "Fix login", priority: "high", labels: [TicketLabel.make("auth")] }),
      ticket("b", { title: "Write docs", order: 1 }),
    ]);
    const shown = (filter: Parameters<typeof boardColumns>[2]) =>
      boardColumns(state, "backlog", filter)
        .get("todo")
        ?.map((t) => t.id);
    expect(shown({ query: "login" })).toEqual(["a"]);
    expect(shown({ query: "SENT-b" })).toEqual(["b"]);
    expect(shown({ priorities: ["high"] })).toEqual(["a"]);
    expect(shown({ labels: ["auth"] })).toEqual(["a"]);
    expect(boardLabels(state)).toEqual(["auth"]);
  });

  it("counts tickets per scope", () => {
    const counts = boardScopeCounts(
      board([ticket("a"), ticket("b", { sprintId: SprintId.make("s1") })]),
    );
    expect(counts.get("backlog")).toBe(1);
    expect(counts.get(SprintId.make("s1"))).toBe(1);
  });

  it("places a drop before the same ticket in the whole column when a filter hides some", () => {
    const column = ["a", "b", "c", "d"].map((id, order) => ticket(id, { order }));
    const [a, , c, d] = column;
    // b is hidden; dropping d between a and c lands before c.
    const shown = [a!, c!, d!];
    expect(boardDropPosition(column, shown, 1, d!.id)).toBe(2);
    expect(boardDropPosition(column, shown, 0, d!.id)).toBe(0);
    // Past the last shown ticket other than the moving one: last.
    expect(boardDropPosition(column, shown, 2, a!.id)).toBe(3);
  });
});
