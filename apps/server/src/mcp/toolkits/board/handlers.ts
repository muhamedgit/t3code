import { BoardRpcError, type ProjectId, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as BoardHub from "../../../board/BoardHub.ts";
import * as Orchestrator from "../../../orchestration-v2/Orchestrator.ts";
import * as ProjectService from "../../../project/ProjectService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import {
  BoardLinkTargetRequiredError,
  BoardProjectNotFoundError,
  BoardProjectRequiredError,
  BoardToolkit,
} from "./tools.ts";

const make = Effect.gen(function* () {
  const engine = yield* Orchestrator.OrchestratorV2;
  const projects = yield* ProjectService.ProjectService;
  const hub = yield* BoardHub.BoardHub;

  const requireBoard = McpInvocationContext.requireMcpCapability("board");

  /** The project named, or the caller's thread's; checked to exist so no stray board is made. */
  const resolveProject = Effect.fn("BoardToolkit.resolveProject")(function* (
    requested: ProjectId | undefined,
  ) {
    const scope = yield* requireBoard;
    const callerProject =
      requested !== undefined || scope.thread === undefined
        ? undefined
        : (yield* engine
            .getThreadShell(scope.thread.threadId)
            .pipe(Effect.orElseSucceed(() => null)))?.projectId;
    const projectId = requested ?? callerProject;
    if (projectId === undefined) return yield* new BoardProjectRequiredError();
    const shell = yield* projects
      .getShell(projectId)
      .pipe(Effect.orElseSucceed(() => Option.none()));
    if (Option.isNone(shell)) return yield* new BoardProjectNotFoundError({ projectId });
    return { projectId, title: shell.value.title };
  });

  const boardOf = (
    project: { readonly projectId: ProjectId; readonly title: string },
    options?: { readonly includeArchived?: boolean },
  ) =>
    hub
      .read(project.projectId, { title: project.title }, options)
      .pipe(Effect.mapError(BoardHub.toBoardRpcError));

  /** Threads named to link must exist; a typo would otherwise link nothing. */
  const requireThreads = Effect.fn("BoardToolkit.requireThreads")(function* (
    threadIds: ReadonlyArray<ThreadId>,
  ) {
    for (const threadId of threadIds) {
      const shell = yield* engine.getThreadShell(threadId).pipe(Effect.orElseSucceed(() => null));
      if (shell === null) {
        return yield* new BoardRpcError({ kind: "not_found", reason: `No thread ${threadId}.` });
      }
    }
  });

  /** A board change by id: the capability is checked first, since no project is resolved. */
  const change = <A, E>(effect: Effect.Effect<A, E>) => requireBoard.pipe(Effect.andThen(effect));

  return {
    read_board: McpToolAccess.reads((input) =>
      resolveProject(input.projectId).pipe(
        Effect.flatMap((project) =>
          boardOf(project, { includeArchived: input.includeArchived === true }),
        ),
      ),
    ),
    create_ticket: McpToolAccess.writesWithCapability(({ projectId, ...ticket }) =>
      Effect.gen(function* () {
        const { board } = yield* boardOf(yield* resolveProject(projectId));
        return yield* hub
          .createTicket({ ...ticket, boardId: board.id })
          .pipe(Effect.mapError(BoardHub.toBoardRpcError));
      }),
    ),
    update_ticket: McpToolAccess.writesWithCapability((input) =>
      change(hub.updateTicket(input).pipe(Effect.mapError(BoardHub.toBoardRpcError))),
    ),
    move_ticket: McpToolAccess.writesWithCapability((input) =>
      change(hub.moveTicket(input).pipe(Effect.mapError(BoardHub.toBoardRpcError))),
    ),
    link_ticket: McpToolAccess.writesWithCapability((input) =>
      Effect.gen(function* () {
        const scope = yield* requireBoard;
        const named = [
          input.addThreads,
          input.removeThreads,
          input.addPullRequests,
          input.removePullRequests,
        ].some((links) => links !== undefined && links.length > 0);
        if (!named && scope.thread === undefined) return yield* new BoardLinkTargetRequiredError();
        yield* requireThreads(input.addThreads ?? []);
        const links =
          named || scope.thread === undefined
            ? input
            : { ticketId: input.ticketId, addThreads: [scope.thread.threadId] };
        return yield* hub.linkTicket(links).pipe(Effect.mapError(BoardHub.toBoardRpcError));
      }),
    ),
    archive_ticket: McpToolAccess.writesWithCapability((input) =>
      change(
        hub
          .archiveTicket({ ticketId: input.ticketId, archived: input.archived ?? true })
          .pipe(Effect.mapError(BoardHub.toBoardRpcError)),
      ),
    ),
    create_sprint: McpToolAccess.writesWithCapability(({ projectId, ...sprint }) =>
      Effect.gen(function* () {
        const { board } = yield* boardOf(yield* resolveProject(projectId));
        return yield* hub
          .createSprint({ ...sprint, boardId: board.id })
          .pipe(Effect.mapError(BoardHub.toBoardRpcError));
      }),
    ),
    update_sprint: McpToolAccess.writesWithCapability((input) =>
      change(hub.updateSprint(input).pipe(Effect.mapError(BoardHub.toBoardRpcError))),
    ),
  } satisfies McpToolAccess.Handlers<typeof BoardToolkit.tools>;
});

export const layer = McpToolAccess.toLayer(BoardToolkit, make);
