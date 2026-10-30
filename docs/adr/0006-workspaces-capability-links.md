# 6. Team workspaces as capability links

Date: 2026-10-31. Status: accepted.

## Context
A tour plan is a team decision: a manager, a booking agent and a brand team each have a view. We want shared
statuses, notes, overrides and sponsor leads in a hackathon-sized product, with no accounts to build and no sign-in
wall in front of a judge.

## Decision
- A workspace is one Firestore document at `collab_workspaces/<ws>` (in memory when running locally). The id is 16
  characters from 96 random bits. Whoever holds the link can read and write. There is no sign-in.
- A teammate picks a display name and one of five roles (Manager, Booking agent, Promoter, Brand team, Other). The
  name lives in that browser's `localStorage`. It is a label, not an identity.
- Every workspace expires 30 days after creation (`expiresAt`). Reads ignore expired documents. The operator must
  also enable a Firestore TTL policy on `expiresAt` so they are deleted.
- The recorded example gives each visitor their own private workspace, seeded with a short discussion between
  fictional teammates. The seeded entries are stamped `demo` and shown as "Demo teammate". Two visitors never share
  a demo workspace.
- Writes go through transactions, so concurrent writers are last-write-wins per field. Overrides need a reason and
  keep the value Qloo suggested next to the new one.
- Limits: text 1,000 characters, name 40, 500 messages, 200 activity events (oldest dropped), 100 leads, 900 KB per
  document; 30 writes a minute per workspace, 40 a minute per session, 10 creates an hour per session.
- Text is stored as plain text and rendered as text.

## Consequences
- Anyone with the link can read and write, and can edit under any name. Do not put anything in a workspace that you
  would not give to everyone holding the link. The product says so where the link is shown.
- No audit of who did what beyond the label the writer typed. The activity log is a convenience, not evidence.
- Rate limits are counted per server instance, not across instances.
- Losing the link loses the workspace for that person. There is no recovery.
- The MCP tool `get_team_notes` and the WebMCP tools can read a workspace from its link. Read access is the same as
  any browser with the link.
