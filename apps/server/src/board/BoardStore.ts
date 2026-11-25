import {
  Board,
  BoardId,
  IsoDateTime,
  ProjectId,
  Sprint,
  SprintId,
  Ticket,
  TicketId,
  TicketLabel,
  TicketLinks,
} from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlSchema from "effect/sql/SqlSchema";

export class BoardStoreError extends Schema.TaggedError<BoardStoreError>()("BoardStoreError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Board store operation '${this.operation}' failed.`;
  }
}

export const BoardRow = Schema.Struct({
  ...Board.fields,
  deletedAt: Schema.NullOr(IsoDateTime),
});
export type BoardRow = typeof BoardRow.Type;

export const SprintRow = Schema.Struct({
  ...Sprint.fields,
  deletedAt: Schema.NullOr(IsoDateTime),
});
export type SprintRow = typeof SprintRow.Type;

// A ticket row is exactly a contract Ticket (it already carries `archivedAt`).
export const TicketRow = Schema.Struct({ ...Ticket.fields });
export type TicketRow = typeof TicketRow.Type;

const BoardDbRow = Schema.Struct({ ...BoardRow.fields });
const SprintDbRow = Schema.Struct({ ...SprintRow.fields });
const TicketDbRow = Schema.Struct({
  ...TicketRow.fields,
  labels: Schema.fromJsonString(Schema.Array(TicketLabel)),
  links: Schema.fromJsonString(TicketLinks),
});

function toBoard(row: BoardRow): Board {
  const { deletedAt, ...board } = row;
  void deletedAt;
  return board;
}

function toSprint(row: SprintRow): Sprint {
  const { deletedAt, ...sprint } = row;
  void deletedAt;
  return sprint;
}

export class BoardStore extends Context.Service<
  BoardStore,
  {
    readonly getBoard: (
      boardId: BoardId,
    ) => Effect.Effect<Option.Option<BoardRow>, BoardStoreError>;
    readonly getBoardByProject: (
      projectId: ProjectId,
    ) => Effect.Effect<Option.Option<BoardRow>, BoardStoreError>;
    readonly upsertBoard: (row: BoardRow) => Effect.Effect<void, BoardStoreError>;
    readonly toBoard: (row: BoardRow) => Board;
    readonly getSprint: (
      sprintId: SprintId,
    ) => Effect.Effect<Option.Option<SprintRow>, BoardStoreError>;
    readonly listSprints: (
      boardId: BoardId,
    ) => Effect.Effect<ReadonlyArray<SprintRow>, BoardStoreError>;
    readonly upsertSprint: (row: SprintRow) => Effect.Effect<void, BoardStoreError>;
    readonly toSprint: (row: SprintRow) => Sprint;
    readonly getTicket: (
      ticketId: TicketId,
    ) => Effect.Effect<Option.Option<TicketRow>, BoardStoreError>;
    readonly listTickets: (
      boardId: BoardId,
      options?: { readonly includeArchived?: boolean },
    ) => Effect.Effect<ReadonlyArray<TicketRow>, BoardStoreError>;
    readonly upsertTicket: (row: TicketRow) => Effect.Effect<void, BoardStoreError>;
  }
>()("t3/board/BoardStore") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const encodeTicket = Schema.encodeEffect(TicketDbRow);

  const mapError =
    (operation: string) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.mapError((cause) => new BoardStoreError({ operation, cause })));

  const selectBoards = SqlSchema.findAll({
    Request: Schema.Struct({
      boardId: Schema.optional(BoardId),
      projectId: Schema.optional(ProjectId),
    }),
    Result: BoardDbRow,
    execute: (request) => sql`
      SELECT
        board_id AS "id",
        project_id AS "projectId",
        name,
        key_prefix AS "keyPrefix",
        next_key_seq AS "nextKeySeq",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt"
      FROM scrum_boards
      WHERE ${sql.and([
        sql`deleted_at IS NULL`,
        ...(request.boardId === undefined ? [] : [sql`board_id = ${request.boardId}`]),
        ...(request.projectId === undefined ? [] : [sql`project_id = ${request.projectId}`]),
      ])}
      ORDER BY created_at ASC, board_id ASC
    `,
  });

  const upsertBoardRow = (row: BoardRow) => sql`
    INSERT INTO scrum_boards (
      board_id, project_id, name, key_prefix, next_key_seq, created_at, updated_at, deleted_at
    )
    VALUES (
      ${row.id}, ${row.projectId}, ${row.name}, ${row.keyPrefix}, ${row.nextKeySeq},
      ${row.createdAt}, ${row.updatedAt}, ${row.deletedAt}
    )
    ON CONFLICT (board_id) DO UPDATE SET
      name = excluded.name,
      key_prefix = excluded.key_prefix,
      next_key_seq = excluded.next_key_seq,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at
  `;

  const getBoard = (boardId: BoardId) =>
    selectBoards({ boardId }).pipe(
      NodeSqliteClient.readOnly,
      Effect.map((rows) => Option.fromUndefinedOr(rows[0])),
      mapError("getBoard"),
    );

  const getBoardByProject = (projectId: ProjectId) =>
    selectBoards({ projectId }).pipe(
      NodeSqliteClient.readOnly,
      Effect.map((rows) => Option.fromUndefinedOr(rows[0])),
      mapError("getBoardByProject"),
    );

  const selectSprints = SqlSchema.findAll({
    Request: Schema.Struct({
      boardId: Schema.optional(BoardId),
      sprintId: Schema.optional(SprintId),
      includeDeleted: Schema.Boolean,
    }),
    Result: SprintDbRow,
    execute: (request) => sql`
      SELECT
        sprint_id AS "id",
        board_id AS "boardId",
        name,
        goal,
        state,
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        sort_order AS "order",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt"
      FROM scrum_sprints
      WHERE ${sql.and([
        ...(request.includeDeleted ? [] : [sql`deleted_at IS NULL`]),
        ...(request.boardId === undefined ? [] : [sql`board_id = ${request.boardId}`]),
        ...(request.sprintId === undefined ? [] : [sql`sprint_id = ${request.sprintId}`]),
      ])}
      ORDER BY sort_order ASC, created_at ASC
    `,
  });

  const upsertSprintRow = (row: SprintRow) => sql`
    INSERT INTO scrum_sprints (
      sprint_id, board_id, name, goal, state, starts_at, ends_at, sort_order,
      created_at, updated_at, deleted_at
    )
    VALUES (
      ${row.id}, ${row.boardId}, ${row.name}, ${row.goal}, ${row.state},
      ${row.startsAt}, ${row.endsAt}, ${row.order}, ${row.createdAt}, ${row.updatedAt},
      ${row.deletedAt}
    )
    ON CONFLICT (sprint_id) DO UPDATE SET
      name = excluded.name,
      goal = excluded.goal,
      state = excluded.state,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at
  `;

  const getSprint = (sprintId: SprintId) =>
    selectSprints({ sprintId, includeDeleted: true }).pipe(
      NodeSqliteClient.readOnly,
      Effect.map((rows) => Option.fromUndefinedOr(rows[0])),
      mapError("getSprint"),
    );

  const listSprints = (boardId: BoardId) =>
    selectSprints({ boardId, includeDeleted: false }).pipe(
      NodeSqliteClient.readOnly,
      mapError("listSprints"),
    );

  const selectTickets = SqlSchema.findAll({
    Request: Schema.Struct({
      boardId: Schema.optional(BoardId),
      ticketId: Schema.optional(TicketId),
      includeArchived: Schema.Boolean,
    }),
    Result: TicketDbRow,
    execute: (request) => sql`
      SELECT
        ticket_id AS "id",
        board_id AS "boardId",
        ticket_key AS "key",
        title,
        description,
        status,
        priority,
        labels_json AS "labels",
        sprint_id AS "sprintId",
        sort_order AS "order",
        links_json AS "links",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        archived_at AS "archivedAt"
      FROM scrum_tickets
      WHERE ${sql.and([
        ...(request.includeArchived ? [] : [sql`archived_at IS NULL`]),
        ...(request.boardId === undefined ? [] : [sql`board_id = ${request.boardId}`]),
        ...(request.ticketId === undefined ? [] : [sql`ticket_id = ${request.ticketId}`]),
      ])}
      ORDER BY sort_order ASC, created_at ASC
    `,
  });

  const upsertTicketRow = (row: TicketRow) =>
    encodeTicket(row).pipe(
      Effect.flatMap(
        (encoded) => sql`
          INSERT INTO scrum_tickets (
            ticket_id, board_id, ticket_key, title, description, status, priority,
            labels_json, sprint_id, sort_order, links_json, created_at, updated_at, archived_at
          )
          VALUES (
            ${encoded.id}, ${encoded.boardId}, ${encoded.key}, ${encoded.title},
            ${encoded.description}, ${encoded.status}, ${encoded.priority}, ${encoded.labels},
            ${encoded.sprintId}, ${encoded.order}, ${encoded.links}, ${encoded.createdAt},
            ${encoded.updatedAt}, ${encoded.archivedAt}
          )
          ON CONFLICT (ticket_id) DO UPDATE SET
            ticket_key = excluded.ticket_key,
            title = excluded.title,
            description = excluded.description,
            status = excluded.status,
            priority = excluded.priority,
            labels_json = excluded.labels_json,
            sprint_id = excluded.sprint_id,
            sort_order = excluded.sort_order,
            links_json = excluded.links_json,
            updated_at = excluded.updated_at,
            archived_at = excluded.archived_at
        `,
      ),
      mapError("upsertTicket"),
    );

  const getTicket = (ticketId: TicketId) =>
    selectTickets({ ticketId, includeArchived: true }).pipe(
      NodeSqliteClient.readOnly,
      Effect.map((rows) => Option.fromUndefinedOr(rows[0])),
      mapError("getTicket"),
    );

  const listTickets = (boardId: BoardId, options?: { readonly includeArchived?: boolean }) =>
    selectTickets({ boardId, includeArchived: options?.includeArchived === true }).pipe(
      NodeSqliteClient.readOnly,
      mapError("listTickets"),
    );

  return BoardStore.of({
    getBoard,
    getBoardByProject,
    upsertBoard: Effect.fn("BoardStore.upsertBoard")(function* (row: BoardRow) {
      yield* upsertBoardRow(row).pipe(mapError("upsertBoard"));
    }),
    toBoard,
    getSprint,
    listSprints,
    upsertSprint: Effect.fn("BoardStore.upsertSprint")(function* (row: SprintRow) {
      yield* upsertSprintRow(row).pipe(mapError("upsertSprint"));
    }),
    toSprint,
    getTicket,
    listTickets,
    upsertTicket: Effect.fn("BoardStore.upsertTicket")(function* (row: TicketRow) {
      yield* upsertTicketRow(row);
    }),
  });
});

export const layer = Layer.effect(BoardStore, make);
