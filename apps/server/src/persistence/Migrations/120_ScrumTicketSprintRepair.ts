import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// Tickets written before sprint validation could name a sprint that doesn't exist or belongs to
// another board. Such a ticket shows in no sprint and not in the backlog; send it to the backlog.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    UPDATE scrum_tickets
    SET sprint_id = NULL
    WHERE sprint_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM scrum_sprints
        WHERE scrum_sprints.sprint_id = scrum_tickets.sprint_id
          AND scrum_sprints.board_id = scrum_tickets.board_id
          AND scrum_sprints.deleted_at IS NULL
      )
  `;
});
