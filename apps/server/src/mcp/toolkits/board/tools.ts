import {
  BoardRpcError,
  BoardState,
  McpCapabilityUnavailableError,
  OrchestratorMcpFailure,
  ProjectId,
  Sprint,
  SprintUpdateInput,
  Ticket,
  TicketId,
  TicketLabel,
  TicketLinkInput,
  TicketMoveInput,
  TicketPriority,
  TicketStatus,
  TicketUpdateInput,
  IsoDateTime,
  SprintId,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Tool from "effect/ai/Tool";
import * as Toolkit from "effect/ai/Toolkit";

import * as BoardHub from "../../../board/BoardHub.ts";
import * as Orchestrator from "../../../orchestration-v2/Orchestrator.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../../../project/ProjectService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  Orchestrator.OrchestratorV2,
  ProjectService.ProjectService,
  BoardHub.BoardHub,
];

const ProjectTargetInput = Schema.Struct({
  projectId: Schema.optional(
    ProjectId.annotate({ description: "Defaults to this thread's project." }),
  ),
});

export class BoardProjectRequiredError extends Schema.TaggedError<BoardProjectRequiredError>()(
  "BoardProjectRequiredError",
  {},
) {
  override get message(): string {
    return "Pass projectId: this MCP client is not running inside a T3 thread.";
  }
}

export class BoardProjectNotFoundError extends Schema.TaggedError<BoardProjectNotFoundError>()(
  "BoardProjectNotFoundError",
  { projectId: Schema.String },
) {
  override get message(): string {
    return `Project ${this.projectId} was not found.`;
  }
}

export class BoardLinkTargetRequiredError extends Schema.TaggedError<BoardLinkTargetRequiredError>()(
  "BoardLinkTargetRequiredError",
  {},
) {
  override get message(): string {
    return "Pass threads or pull requests to link: this MCP client is not running inside a T3 thread.";
  }
}

const BoardToolError = Schema.Union([
  OrchestratorMcpFailure,
  McpCapabilityUnavailableError,
  BoardProjectRequiredError,
  BoardProjectNotFoundError,
  BoardLinkTargetRequiredError,
  BoardRpcError,
]);

const ReadBoardTool = Tool.make("read_board", {
  description:
    "Read a project's scrum board: its sprints and open tickets with status, priority, labels and links. Creates the board if the project has none.",
  parameters: ProjectTargetInput,
  success: BoardState,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Read board")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const CreateTicketTool = Tool.make("create_ticket", {
  description:
    "Add a ticket to a project's board. It goes to the backlog unless sprintId is given.",
  parameters: Schema.Struct({
    ...ProjectTargetInput.fields,
    title: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
    description: Schema.optional(Schema.String.check(Schema.isMaxLength(65_536))),
    status: Schema.optional(TicketStatus.annotate({ description: "Defaults to todo." })),
    priority: Schema.optional(TicketPriority.annotate({ description: "Defaults to none." })),
    labels: Schema.optional(Schema.Array(TicketLabel).check(Schema.isMaxLength(20))),
    sprintId: Schema.optional(Schema.NullOr(SprintId)),
  }),
  success: Ticket,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Create ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

const UpdateTicketTool = Tool.make("update_ticket", {
  description: "Change a ticket's title, description, priority or labels.",
  parameters: TicketUpdateInput,
  success: Ticket,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Update ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const MoveTicketTool = Tool.make("move_ticket", {
  description:
    "Move a ticket to another status column, into a sprint or back to the backlog (sprintId null), or to a new position.",
  parameters: TicketMoveInput,
  success: Ticket,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Move ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const LinkTicketTool = Tool.make("link_ticket", {
  description:
    "Link threads or pull requests to a ticket, or remove links. With nothing to add or remove, links this thread.",
  parameters: TicketLinkInput,
  success: Ticket,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Link ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const ArchiveTicketTool = Tool.make("archive_ticket", {
  description: "Take a ticket off the board, or restore it with archived false.",
  parameters: Schema.Struct({
    ticketId: TicketId,
    archived: Schema.optional(Schema.Boolean.annotate({ description: "Defaults to true." })),
  }),
  success: Ticket,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Archive ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const CreateSprintTool = Tool.make("create_sprint", {
  description: "Plan a sprint on a project's board.",
  parameters: Schema.Struct({
    ...ProjectTargetInput.fields,
    name: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
    goal: Schema.optional(Schema.String.check(Schema.isMaxLength(4_096))),
    startsAt: Schema.optional(IsoDateTime),
    endsAt: Schema.optional(IsoDateTime),
  }),
  success: Sprint,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Create sprint")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

const UpdateSprintTool = Tool.make("update_sprint", {
  description:
    "Rename, reschedule or reorder a sprint, or set its state. One sprint can be active at a time. Closing moves tickets not done to carryOverTo, or the backlog.",
  parameters: SprintUpdateInput,
  success: Sprint,
  failure: BoardToolError,
  dependencies,
})
  .annotate(Tool.Title, "Update sprint")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const BoardToolkit = Toolkit.make(
  ReadBoardTool,
  CreateTicketTool,
  UpdateTicketTool,
  MoveTicketTool,
  LinkTicketTool,
  ArchiveTicketTool,
  CreateSprintTool,
  UpdateSprintTool,
);
