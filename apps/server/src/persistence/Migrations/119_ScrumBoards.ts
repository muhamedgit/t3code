import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// SentinelDev scrum board: one board per project, with sprints and tickets. Durable, synced.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS scrum_boards (
      board_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      next_key_seq INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `;
  // One active board per project.
  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scrum_boards_project
      ON scrum_boards (project_id) WHERE deleted_at IS NULL
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS scrum_sprints (
      sprint_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      name TEXT NOT NULL,
      goal TEXT,
      state TEXT NOT NULL DEFAULT 'planned',
      starts_at TEXT,
      ends_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_scrum_sprints_board ON scrum_sprints (board_id)`;

  yield* sql`
    CREATE TABLE IF NOT EXISTS scrum_tickets (
      ticket_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      ticket_key TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'none',
      labels_json TEXT NOT NULL DEFAULT '[]',
      sprint_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      links_json TEXT NOT NULL DEFAULT '{"threads":[],"pullRequests":[]}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_scrum_tickets_board ON scrum_tickets (board_id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_scrum_tickets_sprint ON scrum_tickets (sprint_id)`;
  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scrum_tickets_key
      ON scrum_tickets (board_id, ticket_key)
  `;
});
