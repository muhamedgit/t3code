import {
  BOARD_COLUMNS,
  BOARD_PRIORITIES,
  boardColumn,
  boardColumns,
  boardDropPosition,
  boardLabels,
  boardScopeCounts,
  boardSprints,
  resolveBoardScope,
  type BoardScope,
} from "@t3tools/client-runtime/state/board";
import type {
  BoardState,
  EnvironmentId,
  Ticket,
  TicketPriority,
  TicketStatus,
} from "@t3tools/contracts";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { T, useGT, useMessages } from "gt-react";
import {
  ArchiveIcon,
  CheckIcon,
  EllipsisIcon,
  FilterIcon,
  SquareKanbanIcon,
  MessageSquareIcon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
} from "lucide-react";
import { useState, type DragEvent, type ReactNode } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { boardEnvironment } from "~/state/board";
import { useProjects, useThreadShells } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { PullRequestSearchInput } from "../pullRequest/PullRequestListFilters";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  SPRINT_STATE_LABELS,
  TICKET_PRIORITY_PRESENTATION,
  TICKET_STATUS_PRESENTATION,
} from "./boardPresentation";
import type { BoardSearch } from "./boardSearch.logic";
import { SprintDialog, TicketDialog, type TicketDraft } from "./TicketDialog";

const DRAG_TYPE = "application/x-sentineldev-ticket";

interface DropTarget {
  readonly status: TicketStatus;
  /** Position among the column's shown tickets other than the one being dragged. */
  readonly index: number;
}

export function BoardPage() {
  const gt = useGT();
  const resolve = useMessages();
  const search = useSearch({ from: "/_chat/board" });
  const navigate = useNavigate({ from: "/board" });
  const projects = useProjects();
  const project =
    projects.find(
      (candidate) =>
        candidate.environmentId === search.boardEnvironmentId &&
        candidate.id === search.boardProjectId,
    ) ??
    projects.find((candidate) => candidate.isScratch !== true) ??
    projects[0];
  const query = useEnvironmentQuery(
    project === undefined
      ? null
      : boardEnvironment.state({
          environmentId: project.environmentId,
          input: { projectId: project.id },
        }),
    resolve,
  );

  const updateSearch = (patch: Partial<BoardSearch>) =>
    void navigate({ search: (current) => ({ ...current, ...patch }), replace: true });

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <WorkspacePageHeader electron={isElectron} className="relative bg-background">
          <WorkspaceBreadcrumb ariaLabel={gt("Board breadcrumb")}>
            <WorkspaceBreadcrumbItem current>
              <h1 className="truncate">
                <T context="page title, scrum board">Board</T>
              </h1>
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
          <div className="min-w-0 flex-1" />
          {projects.length > 0 && project !== undefined ? (
            <Select
              value={JSON.stringify([project.environmentId, project.id])}
              onValueChange={(value) => {
                const next = projects.find(
                  (candidate) => JSON.stringify([candidate.environmentId, candidate.id]) === value,
                );
                if (next !== undefined) {
                  updateSearch({
                    boardEnvironmentId: next.environmentId,
                    boardProjectId: next.id,
                    sprint: undefined,
                    ticket: undefined,
                  });
                }
              }}
            >
              <SelectTrigger
                aria-label={gt("Project")}
                className="w-48 [-webkit-app-region:no-drag]"
                size="sm"
              >
                <SelectValue>{project.title}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {projects.map((candidate) => (
                  <SelectItem
                    key={JSON.stringify([candidate.environmentId, candidate.id])}
                    value={JSON.stringify([candidate.environmentId, candidate.id])}
                  >
                    {candidate.title}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
        </WorkspacePageHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <WorkspacePageContainer width="expanded" className="min-h-full gap-4">
            {project === undefined ? (
              <BoardEmpty
                title={gt("No projects yet")}
                description={gt("Add a project to start its board.")}
              />
            ) : query.data === null ? (
              query.error === null ? (
                <BoardSkeleton />
              ) : (
                <BoardEmpty title={gt("The board could not be loaded")} description={query.error} />
              )
            ) : (
              <BoardView
                environmentId={project.environmentId}
                state={query.data}
                search={search}
                updateSearch={updateSearch}
              />
            )}
          </WorkspacePageContainer>
        </div>
      </div>
    </SidebarInset>
  );
}

function BoardView({
  environmentId,
  state,
  search,
  updateSearch,
}: {
  readonly environmentId: EnvironmentId;
  readonly state: BoardState;
  readonly search: BoardSearch;
  readonly updateSearch: (patch: Partial<BoardSearch>) => void;
}) {
  const gt = useGT();
  const resolve = useMessages();
  const navigate = useNavigate();
  const threads = useThreadShells();
  const createTicket = useAtomCommand(boardEnvironment.createTicket);
  const updateTicket = useAtomCommand(boardEnvironment.updateTicket);
  const moveTicket = useAtomCommand(boardEnvironment.moveTicket);
  const archiveTicket = useAtomCommand(boardEnvironment.archiveTicket);
  const createSprint = useAtomCommand(boardEnvironment.createSprint);
  const updateSprint = useAtomCommand(boardEnvironment.updateSprint);

  const [creating, setCreating] = useState<TicketStatus | null>(null);
  const [planningSprint, setPlanningSprint] = useState(false);
  const [dragging, setDragging] = useState<Ticket["id"] | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const scope = resolveBoardScope(state, search.sprint);
  const sprints = boardSprints(state);
  const sprint = scope === "backlog" ? undefined : sprints.find((s) => s.id === scope);
  const counts = boardScopeCounts(state);
  const filter = { query: search.q, priorities: search.priority, labels: search.label };
  const columns = boardColumns(state, scope, filter);
  const labels = boardLabels(state);
  const openTicket = state.tickets.find((ticket) => ticket.id === search.ticket);
  const filtered = (search.priority?.length ?? 0) + (search.label?.length ?? 0) > 0;

  const scopeName = (target: BoardScope) =>
    target === "backlog"
      ? gt("Backlog")
      : (sprints.find((s) => s.id === target)?.name ?? gt("Sprint"));

  const move = (
    ticket: Ticket,
    patch: { status?: TicketStatus; sprint?: BoardScope; order?: number },
  ) =>
    void moveTicket({
      environmentId,
      input: {
        ticketId: ticket.id,
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.sprint === undefined
          ? {}
          : { sprintId: patch.sprint === "backlog" ? null : patch.sprint }),
        ...(patch.order === undefined ? {} : { order: patch.order }),
      },
    });

  const dropIndex = (event: DragEvent<HTMLElement>) => {
    const cards = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[data-ticket-card]"),
    ].filter((card) => card.dataset.ticketCard !== dragging);
    const index = cards.findIndex((card) => {
      const box = card.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });
    return index === -1 ? cards.length : index;
  };

  const drop = (status: TicketStatus, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const ticketId = event.dataTransfer.getData(DRAG_TYPE) || dragging;
    const ticket = state.tickets.find((candidate) => candidate.id === ticketId);
    setDragging(null);
    setDropTarget(null);
    if (ticket === undefined) return;
    const order = boardDropPosition(
      boardColumn(state, scope, status),
      columns.get(status) ?? [],
      dropIndex(event),
      ticket.id,
    );
    if (ticket.status === status && boardColumn(state, scope, status).indexOf(ticket) === order) {
      return;
    }
    move(ticket, { status, order });
  };

  const submitNew = async (status: TicketStatus, draft: TicketDraft) => {
    const result = await createTicket({
      environmentId,
      input: {
        boardId: state.board.id,
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        labels: draft.labels,
        status,
        sprintId: scope === "backlog" ? null : scope,
      },
    });
    return result._tag === "Success";
  };

  const submitEdit = async (ticket: Ticket, draft: TicketDraft) => {
    const result = await updateTicket({
      environmentId,
      input: {
        ticketId: ticket.id,
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        labels: draft.labels,
      },
    });
    return result._tag === "Success";
  };

  const togglePriority = (priority: TicketPriority) => {
    const current = search.priority ?? [];
    const next = current.includes(priority)
      ? current.filter((p) => p !== priority)
      : [...current, priority];
    updateSearch({ priority: next.length === 0 ? undefined : next });
  };
  const toggleLabel = (label: string) => {
    const current = search.label ?? [];
    const next = current.includes(label) ? current.filter((l) => l !== label) : [...current, label];
    updateSearch({ label: next.length === 0 ? undefined : next });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select<string>
          value={scope}
          onValueChange={(value) => {
            if (value !== null) updateSearch({ sprint: value, ticket: undefined });
          }}
        >
          <SelectTrigger aria-label={gt("Sprint")} className="w-56" size="sm">
            <SelectValue>{scopeName(scope)}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {sprints.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                <span className="text-muted-foreground text-xs">
                  {resolve(SPRINT_STATE_LABELS[option.state])} · {counts.get(option.id) ?? 0}
                </span>
              </SelectItem>
            ))}
            <SelectItem value="backlog">
              <span className="min-w-0 flex-1 truncate">
                <T>Backlog</T>
              </span>
              <span className="text-muted-foreground text-xs">{counts.get("backlog") ?? 0}</span>
            </SelectItem>
          </SelectPopup>
        </Select>
        {sprint !== undefined && sprint.state !== "closed" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void updateSprint({
                environmentId,
                input: {
                  sprintId: sprint.id,
                  state: sprint.state === "planned" ? "active" : "closed",
                },
              })
            }
          >
            {sprint.state === "planned" ? (
              <>
                <PlayIcon aria-hidden className="size-3.5" />
                <T>Start sprint</T>
              </>
            ) : (
              <>
                <SquareIcon aria-hidden className="size-3.5" />
                <T>Complete sprint</T>
              </>
            )}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setPlanningSprint(true)}>
          <PlusIcon aria-hidden className="size-3.5" />
          <T>Sprint</T>
        </Button>
        <div className="min-w-48 flex-1">
          <PullRequestSearchInput
            value={search.q ?? ""}
            label={gt("Search tickets")}
            placeholder={gt("Search tickets")}
            onChange={(q) => updateSearch({ q: q || undefined })}
            onSubmit={(q) => updateSearch({ q: q || undefined })}
          />
        </div>
        <Menu>
          <MenuTrigger
            render={
              <Button size="sm" variant={filtered ? "secondary" : "outline"}>
                <FilterIcon aria-hidden className="size-3.5" />
                <T>Filter</T>
              </Button>
            }
          />
          <MenuPopup align="end">
            <MenuGroupLabel>
              <T>Priority</T>
            </MenuGroupLabel>
            {BOARD_PRIORITIES.map((priority) => (
              <MenuCheckboxItem
                key={priority}
                checked={search.priority?.includes(priority) ?? false}
                onCheckedChange={() => togglePriority(priority)}
              >
                {resolve(TICKET_PRIORITY_PRESENTATION[priority].label)}
              </MenuCheckboxItem>
            ))}
            {labels.length > 0 ? (
              <>
                <MenuSeparator />
                <MenuGroupLabel>
                  <T>Labels</T>
                </MenuGroupLabel>
                {labels.map((label) => (
                  <MenuCheckboxItem
                    key={label}
                    checked={search.label?.includes(label) ?? false}
                    onCheckedChange={() => toggleLabel(label)}
                  >
                    {label}
                  </MenuCheckboxItem>
                ))}
              </>
            ) : null}
          </MenuPopup>
        </Menu>
        <Button size="sm" onClick={() => setCreating("todo")}>
          <PlusIcon aria-hidden className="size-3.5" />
          <T>Ticket</T>
        </Button>
      </div>

      {sprint?.goal ? <p className="text-muted-foreground text-sm">{sprint.goal}</p> : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((status) => {
          const presentation = TICKET_STATUS_PRESENTATION[status];
          const tickets = columns.get(status) ?? [];
          const target = dropTarget?.status === status ? dropTarget.index : null;
          let shownIndex = 0;
          return (
            <section
              key={status}
              aria-label={resolve(presentation.label)}
              className={cn(
                "flex min-h-48 flex-col gap-2 rounded-xl border bg-muted/30 p-2 transition-colors",
                target !== null && "border-primary/60 bg-primary/5",
              )}
              onDragOver={(event) => {
                if (dragging === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const index = dropIndex(event);
                if (dropTarget?.status !== status || dropTarget.index !== index) {
                  setDropTarget({ status, index });
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropTarget((current) => (current?.status === status ? null : current));
                }
              }}
              onDrop={(event) => drop(status, event)}
            >
              <header className="flex items-center gap-2 px-1.5 pt-1">
                <presentation.Icon
                  aria-hidden
                  className={cn("size-3.5", presentation.toneClassName)}
                />
                <h2 className="font-medium text-sm">{resolve(presentation.label)}</h2>
                <span className="text-muted-foreground text-xs">{tickets.length}</span>
                <div className="flex-1" />
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={gt("Add a ticket to {column}", {
                    column: resolve(presentation.label),
                  })}
                  onClick={() => setCreating(status)}
                >
                  <PlusIcon aria-hidden className="size-3.5" />
                </Button>
              </header>
              {tickets.map((ticket) => {
                const index = ticket.id === dragging ? null : shownIndex++;
                return (
                  <div key={ticket.id} className="flex flex-col gap-2">
                    {target !== null && index === target ? <DropLine /> : null}
                    <TicketCard
                      ticket={ticket}
                      dragging={ticket.id === dragging}
                      threadCount={ticket.links.threads.length}
                      onOpen={() => updateSearch({ ticket: ticket.id })}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(DRAG_TYPE, ticket.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragging(ticket.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                      menu={
                        <TicketMenu
                          ticket={ticket}
                          scope={scope}
                          scopes={[
                            ...sprints.filter((s) => s.state !== "closed").map((s) => s.id),
                            "backlog",
                          ]}
                          scopeName={scopeName}
                          onMove={(patch) => move(ticket, patch)}
                          onArchive={() =>
                            void archiveTicket({
                              environmentId,
                              input: { ticketId: ticket.id, archived: true },
                            })
                          }
                        />
                      }
                    />
                  </div>
                );
              })}
              {target !== null && target >= shownIndex ? <DropLine /> : null}
              {tickets.length === 0 && target === null ? (
                <p className="px-1.5 py-4 text-center text-muted-foreground text-xs">
                  <T>No tickets</T>
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

      {creating !== null ? (
        <TicketDialog
          onSubmit={(draft) => submitNew(creating, draft)}
          onClose={() => setCreating(null)}
        />
      ) : null}
      {openTicket !== undefined ? (
        <TicketDialog
          key={openTicket.id}
          ticket={openTicket}
          onSubmit={(draft) => submitEdit(openTicket, draft)}
          onClose={() => updateSearch({ ticket: undefined })}
        >
          {openTicket.links.threads.length > 0 || openTicket.links.pullRequests.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="font-medium text-sm">
                <T>Linked</T>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {openTicket.links.threads.map((threadId) => {
                  const thread = threads.find(
                    (candidate) =>
                      candidate.id === threadId && candidate.environmentId === environmentId,
                  );
                  return (
                    <Button
                      key={threadId}
                      size="xs"
                      variant="outline"
                      disabled={thread === undefined}
                      onClick={() =>
                        void navigate({
                          to: "/$environmentId/$threadId",
                          params: { environmentId, threadId },
                        })
                      }
                    >
                      <MessageSquareIcon aria-hidden className="size-3" />
                      <span className="max-w-48 truncate">{thread?.title ?? threadId}</span>
                    </Button>
                  );
                })}
                {openTicket.links.pullRequests.map((pr) => (
                  <Badge key={`${pr.host}/${pr.repository}#${pr.number}`} variant="outline">
                    {pr.repository}#{pr.number}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </TicketDialog>
      ) : null}
      {planningSprint ? (
        <SprintDialog
          onClose={() => setPlanningSprint(false)}
          onSubmit={async (draft) => {
            const result = await createSprint({
              environmentId,
              input: {
                boardId: state.board.id,
                name: draft.name,
                ...(draft.goal ? { goal: draft.goal } : {}),
              },
            });
            if (result._tag === "Success") updateSearch({ sprint: result.value.id });
            return result._tag === "Success";
          }}
        />
      ) : null}
    </>
  );
}

function DropLine() {
  return <div aria-hidden className="h-0.5 rounded-full bg-primary" />;
}

function TicketCard({
  ticket,
  dragging,
  threadCount,
  menu,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  readonly ticket: Ticket;
  readonly dragging: boolean;
  readonly threadCount: number;
  readonly menu: ReactNode;
  readonly onOpen: () => void;
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void;
  readonly onDragEnd: () => void;
}) {
  const resolve = useMessages();
  const priority = TICKET_PRIORITY_PRESENTATION[ticket.priority];
  return (
    <article
      data-ticket-card={ticket.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex cursor-grab flex-col gap-1.5 rounded-lg border bg-background p-2.5 shadow-xs transition-opacity active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left font-medium text-sm hover:underline"
          onClick={onOpen}
        >
          {ticket.title}
        </button>
        {menu}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
        <span className="font-mono">{ticket.key}</span>
        {ticket.priority === "none" ? null : (
          <span className={cn("flex items-center gap-0.5", priority.toneClassName)}>
            <priority.Icon aria-hidden className="size-3" />
            {resolve(priority.label)}
          </span>
        )}
        {threadCount > 0 ? (
          <span className="flex items-center gap-0.5">
            <MessageSquareIcon aria-hidden className="size-3" />
            {threadCount}
          </span>
        ) : null}
        {ticket.links.pullRequests.length > 0 ? (
          <span className="flex items-center gap-0.5">
            <PullRequestGlyph.pullRequest aria-hidden className="size-3" />
            {ticket.links.pullRequests.length}
          </span>
        ) : null}
        {ticket.labels.map((label) => (
          <Badge key={label} size="sm" variant="secondary">
            {label}
          </Badge>
        ))}
      </div>
    </article>
  );
}

function TicketMenu({
  ticket,
  scope,
  scopes,
  scopeName,
  onMove,
  onArchive,
}: {
  readonly ticket: Ticket;
  readonly scope: BoardScope;
  readonly scopes: ReadonlyArray<BoardScope>;
  readonly scopeName: (scope: BoardScope) => string;
  readonly onMove: (patch: { status?: TicketStatus; sprint?: BoardScope }) => void;
  readonly onArchive: () => void;
}) {
  const gt = useGT();
  const resolve = useMessages();
  return (
    // Shown on hover or focus so a resting board stays quiet; kept while its menu is open.
    <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-data-popup-open:opacity-100">
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={gt("Actions for {ticket}", { ticket: ticket.key })}
            >
              <EllipsisIcon aria-hidden className="size-3.5" />
            </Button>
          }
        />
        <MenuPopup align="end">
          <MenuGroupLabel>
            <T>Move to</T>
          </MenuGroupLabel>
          {BOARD_COLUMNS.map((status) => {
            const presentation = TICKET_STATUS_PRESENTATION[status];
            return (
              <MenuItem
                key={status}
                disabled={status === ticket.status}
                onClick={() => onMove({ status })}
              >
                <presentation.Icon
                  aria-hidden
                  className={cn("size-3.5", presentation.toneClassName)}
                />
                {resolve(presentation.label)}
                {status === ticket.status ? (
                  <CheckIcon aria-hidden className="ml-auto size-3.5" />
                ) : null}
              </MenuItem>
            );
          })}
          <MenuSeparator />
          <MenuSub>
            <MenuSubTrigger>
              <T>Move to sprint</T>
            </MenuSubTrigger>
            <MenuSubPopup>
              {scopes.map((target) => (
                <MenuItem
                  key={target}
                  disabled={target === scope}
                  onClick={() => onMove({ sprint: target })}
                >
                  {scopeName(target)}
                </MenuItem>
              ))}
            </MenuSubPopup>
          </MenuSub>
          <MenuSeparator />
          <MenuItem onClick={onArchive}>
            <ArchiveIcon aria-hidden className="size-3.5" />
            <T>Archive</T>
          </MenuItem>
        </MenuPopup>
      </Menu>
    </span>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {BOARD_COLUMNS.map((status) => (
        <div key={status} className="flex flex-col gap-2 rounded-xl border p-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

function BoardEmpty({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SquareKanbanIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
