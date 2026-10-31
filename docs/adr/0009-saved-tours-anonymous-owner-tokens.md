# 9. Saved tours with gateway-issued anonymous owner tokens

Date: 2026-10-31. Status: accepted.

## Context
Planning a tour takes a few minutes of live Qloo calls. People want to come back to it, search their past tours and
mark one as confirmed, without paying for the same calls again. We also keep the rule that nothing in the product
sits behind a sign-in wall (judges and first-time visitors), and the gateway already fronts Firestore for workspaces
([ADR 0006](0006-workspaces-capability-links.md)). Firebase Auth is not configured in this project.

## Decision
- The gateway issues an anonymous owner token: `POST /v1/owners` returns a random token once. The browser
  keeps it in `localStorage` under `tiq.owner` and sends it as the `x-tiq-owner` header. The gateway stores only
  `sha256(token)` as the document id in `tour_owners`.
- The dashboard BFF forwards `/api/owners` and `/api/tours*` to the gateway's `/v1/owners` and `/v1/tours*` with its
  own identity token, passing the owner header through. The gateway stays IAM-private.
- A tour is `user_tours/<id>`: a summary (title, artist, regions, cities), folded search text, status
  (`draft` or `final`), timestamps and `expiresAt` = `updatedAt` + 45 days (the same 45 days as the Qloo cache). The finished run is stored as
  `user_tours/<id>/chunks/<n>`, at most 700,000 characters each, at most 4 million characters in all.
- A live board that finishes is saved as a draft. The recorded example and the synthetic showcase are never saved.
- `/tours/mine` lists the owner's tours with search (accent-insensitive, every word must match), a Drafts and
  Final filter, Open, Mark final or draft, and Delete. Open is `?saved=<id>` and replays the stored run, so the board
  makes no new Qloo calls.
- Only the owner can read, change or delete a tour. Any other token, a missing token or an expired tour gets a 404,
  so a tour id does not confirm that it exists.
- Limits: 50 tours per owner (409 beyond), 60 saves an hour per owner, 40 MB of stored runs per owner in total, and owner creation is rate-limited per client and per instance.
- Idle owners expire 90 days after last use (`lastSeenAt`), so abandoned tokens and their tours are cleaned up.

## Alternatives considered
- **Firebase Anonymous Auth.** The standard answer, and it can later link to Google sign-in. Rejected for now:
  Firebase Auth is not enabled in the project, adding it means a client SDK, a second identity path and
  token verification in the gateway, and the gateway already mediates every Firestore write.
- **`localStorage` only.** No server, no privacy question. Rejected: runs can be megabytes, browsers cap and evict
  it, it cannot be searched across devices later, and a tour could not be reopened without the board's data.
- **Capability links per tour** (as workspaces). Rejected: a tour list needs one handle for all of an owner's
  tours, and a link per tour is shareable by accident.

## Consequences
- Clearing site data, a private window or a different browser loses access to the tours. There is no recovery, and
  the page says that. The tours themselves expire 45 days after their last change.
- Anyone who gets the token (for example by reading the browser's storage) has the owner's tours. It is a bearer
  secret, like a session cookie, and is never put in a URL.
- Migration path: add Firebase Auth later, link the anonymous owner to a Google sign-in, and map
  `sha256(token)` to the new uid in `tour_owners` so existing tours carry over.
- Cost is bounded: 50 tours, 4 million characters per run, 40 MB and 60 saves an hour per owner, and a Firestore TTL policy on `expiresAt`
  for collection groups `user_tours` and `chunks` (the operator enables it; it is not run from code).

## Security notes
- The server never stores the token, so a database leak does not yield working tokens. Tokens are long values of
  randomness, so they cannot be guessed.
- Responses that issue a token are `cache-control: no-store`. The owner header travels BFF to gateway over the
  IAM-authenticated hop only.
- Nothing about a tour is sent to Qloo to save, list, search or reopen it. Analytics log counts only, as before.
- Test traffic carries the existing test flag and is excluded from stats.
