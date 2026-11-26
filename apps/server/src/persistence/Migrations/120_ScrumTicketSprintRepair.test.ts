import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" })));

layer("120_ScrumTicketSprintRepair", (it) => {
  it.effect("sends tickets whose sprint is missing or on another board to the backlog", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 119 });

      const at = "2026-11-26T00:00:00.000Z";
      yield* sql`
        INSERT INTO scrum_sprints (sprint_id, board_id, name, created_at, updated_at)
        VALUES ('sprint-own', 'board-a', 'Own', ${at}, ${at}),
               ('sprint-other', 'board-b', 'Other', ${at}, ${at})
      `;
      yield* sql`
        INSERT INTO scrum_tickets (ticket_id, board_id, ticket_key, title, sprint_id, created_at, updated_at)
        VALUES ('kept', 'board-a', 'A-1', 'Kept', 'sprint-own', ${at}, ${at}),
               ('missing', 'board-a', 'A-2', 'Missing', 'sprint-nope', ${at}, ${at}),
               ('crossed', 'board-a', 'A-3', 'Crossed', 'sprint-other', ${at}, ${at}),
               ('backlog', 'board-a', 'A-4', 'Backlog', NULL, ${at}, ${at})
      `;

      yield* runMigrations({ toMigrationInclusive: 120 });

      const rows = yield* sql<{ readonly ticketId: string; readonly sprintId: string | null }>`
        SELECT ticket_id AS "ticketId", sprint_id AS "sprintId" FROM scrum_tickets ORDER BY ticket_id
      `;
      assert.deepStrictEqual(rows, [
        { ticketId: "backlog", sprintId: null },
        { ticketId: "crossed", sprintId: null },
        { ticketId: "kept", sprintId: "sprint-own" },
        { ticketId: "missing", sprintId: null },
      ]);
    }),
  );
});
