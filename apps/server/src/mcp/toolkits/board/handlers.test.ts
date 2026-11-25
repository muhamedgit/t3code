import {
  EnvironmentId,
  type OrchestrationProjectShell,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TicketId,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import type { Tool } from "effect/ai";

import * as BoardHub from "../../../board/BoardHub.ts";
import * as Orchestrator from "../../../orchestration-v2/Orchestrator.ts";
import * as SqlitePersistence from "../../../persistence/Sqlite.ts";
import * as ProjectService from "../../../project/ProjectService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as McpToolAccessTestkit from "../../McpToolAccess.testkit.ts";
import * as BoardHandlers from "./handlers.ts";
import { BoardToolkit } from "./tools.ts";

// The testkit's live thread shell belongs to this project.
const PROJECT_ID = ProjectId.make("project:mcp-test");
const THREAD_ID = ThreadId.make("thread-1");

const invocation = (
  capabilities: ReadonlyArray<McpInvocationContext.McpCapability>,
): McpInvocationContext.McpInvocationScope => ({
  environmentId: EnvironmentId.make("environment-1"),
  requestNamespace: "provider-session-1",
  thread: {
    threadId: THREAD_ID,
    providerSessionId: "provider-session-1",
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
  capabilities: new Set(capabilities),
  issuedAt: 1,
});

const project: OrchestrationProjectShell = {
  id: PROJECT_ID,
  title: "Project",
  workspaceRoot: "/workspace/project",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

/** A real hub over an in-memory database, so a tool call is checked end to end. */
const makeHarness = Effect.fn("makeBoardToolkitHarness")(function* () {
  const hubContext = yield* Layer.build(
    BoardHub.layer.pipe(Layer.provide(SqlitePersistence.layerMemory)),
  );
  const hub = Context.get(hubContext, BoardHub.BoardHub);
  const layerDependencies = Layer.mergeAll(
    Layer.succeed(BoardHub.BoardHub, hub),
    Layer.mock(ProjectService.ProjectService)({
      getShell: (id) => Effect.succeed(id === PROJECT_ID ? Option.some(project) : Option.none()),
    }),
    Layer.mock(Orchestrator.OrchestratorV2)({
      getThreadShell: (id) => Effect.succeed(McpToolAccessTestkit.liveThreadShell(id)),
    }),
    McpToolAccessTestkit.liveThreadsLayer,
  );
  const toolkit = yield* BoardToolkit.pipe(
    Effect.provide(
      McpToolAccess.HandlersLayer.layer(BoardHandlers.layer).pipe(Layer.provide(layerDependencies)),
    ),
  );
  const call = <Name extends keyof typeof BoardToolkit.tools>(
    name: Name,
    params: Parameters<typeof toolkit.handle<Name>>[1],
    capabilities: ReadonlyArray<McpInvocationContext.McpCapability> = ["board"],
  ) =>
    toolkit.handle(name, params).pipe(
      Stream.unwrap,
      Stream.runCollect,
      Effect.map(
        (chunk) => chunk.at(-1)!.result as Tool.Success<(typeof BoardToolkit.tools)[Name]>,
      ),
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation(capabilities)),
      Effect.provide(layerDependencies),
    );
  return { hub, call };
});

describe("board toolkit handlers", () => {
  it.effect("creates a ticket on the thread's project board and publishes it to watchers", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { hub, call } = yield* makeHarness();
        const subscribed = yield* Deferred.make<void>();
        const watcher = yield* hub.watch(PROJECT_ID).pipe(
          Stream.tap(() => Deferred.succeed(subscribed, undefined)),
          Stream.take(2),
          Stream.runCollect,
          Effect.forkScoped,
        );
        yield* Deferred.await(subscribed);

        const ticket = yield* call("create_ticket", { title: "Wire the board UI" });
        expect(ticket).toMatchObject({
          key: "SENT-1",
          title: "Wire the board UI",
          status: "todo",
          priority: "none",
          sprintId: null,
        });

        const [initial, updated] = yield* Fiber.join(watcher);
        expect(initial!.tickets).toEqual([]);
        expect(updated!.tickets.map((t) => t.id)).toEqual([ticket.id]);

        const board = yield* call("read_board", {});
        expect(board.board.projectId).toBe(PROJECT_ID);
        expect(board.tickets.map((t) => t.key)).toEqual(["SENT-1"]);
      }),
    ),
  );

  it.effect("plans a sprint and moves a ticket into it", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { call } = yield* makeHarness();
        const sprint = yield* call("create_sprint", { name: "Sprint 1" });
        const ticket = yield* call("create_ticket", { title: "Ship it", priority: "high" });
        const moved = yield* call("move_ticket", {
          ticketId: ticket.id,
          status: "doing",
          sprintId: sprint.id,
        });
        expect(moved).toMatchObject({ status: "doing", sprintId: sprint.id, priority: "high" });

        const active = yield* call("update_sprint", { sprintId: sprint.id, state: "active" });
        expect(active.state).toBe("active");

        const backlog = yield* call("move_ticket", { ticketId: ticket.id, sprintId: null });
        expect(backlog.sprintId).toBeNull();
      }),
    ),
  );

  it.effect("links the caller's thread when nothing else is named, and archives", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { call } = yield* makeHarness();
        const ticket = yield* call("create_ticket", { title: "Track this thread" });
        const linked = yield* call("link_ticket", { ticketId: ticket.id });
        expect(linked.links.threads).toEqual([THREAD_ID]);

        const archived = yield* call("archive_ticket", { ticketId: ticket.id });
        expect(archived.archivedAt).not.toBeNull();
        expect((yield* call("read_board", {})).tickets).toEqual([]);

        const restored = yield* call("archive_ticket", { ticketId: ticket.id, archived: false });
        expect(restored.archivedAt).toBeNull();
      }),
    ),
  );

  it.effect("refuses a credential without the board capability", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { call } = yield* makeHarness();
        const refused = { _tag: "McpCapabilityUnavailableError", capability: "board" };
        expect(yield* call("read_board", {}, ["issues"]).pipe(Effect.flip)).toMatchObject(refused);
        // Naming a ticket outright must not skip the check.
        expect(
          yield* call("update_ticket", { ticketId: TicketId.make("ticket_x"), title: "x" }, [
            "issues",
          ]).pipe(Effect.flip),
        ).toMatchObject(refused);
      }),
    ),
  );

  it.effect("reports an unknown project or ticket", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { call } = yield* makeHarness();
        expect(
          yield* call("read_board", { projectId: ProjectId.make("project:missing") }).pipe(
            Effect.flip,
          ),
        ).toMatchObject({ _tag: "BoardProjectNotFoundError" });
        expect(
          yield* call("move_ticket", {
            ticketId: TicketId.make("ticket_missing"),
            status: "done",
          }).pipe(Effect.flip),
        ).toMatchObject({ _tag: "BoardRpcError", kind: "not_found" });
      }),
    ),
  );
});
