# Toast inventory

Every user action in the dashboard that changes state, copies, saves, fails or runs in the background, and whether it gets a toast.
The system is `src/components/ui/Toast.tsx` (`useToast()`, mounted once in `AppShell`): bottom centre, fixed (never moves layout), `role="status"` /
`aria-live="polite"`, errors `role="alert"`, 5 s auto-dismiss (paused on hover and focus), 44 px close button, max 3 stacked, reduced motion respected.
Copy lives at the call site. Rules: sentence case, plain English, the privacy reminder only on share, and no inline duplicate of a toast.

"Status" is `done` (implemented and tested), `no toast` (decision) or `not done` (wanted, not built, reason given).

| Action | File | Feedback before | Decision | Toast text | Status |
|---|---|---|---|---|---|
| Share with your team (header, sidebar, drawer) | `collab/TeamBar.tsx`, `AppShell.tsx` | inline paragraph in the header row / fixed pill | toast | "Link copied. Anyone with this link can see and add notes. Don't post contracts, fees or personal details." | done |
| Share, clipboard refused | same, `collab/useCollabWrite.ts` | inline input in the header row | alert toast, link selectable in the toast (15 s) | "Couldn't copy automatically. Copy this link. ..." | done |
| Share, no workspace | same | inline error | alert toast | workspace error, else "Could not create a link." | done |
| Share (Tour Book) | `pages/TourBook.tsx` | inline "Link copied" | toast; clipboard failure is an alert toast with the link selectable | "Link copied." | done |
| Share via the OS share sheet (`navigator.share`) | `pages/TourBook.tsx` | the OS sheet | no toast, the OS confirms | | n/a |
| Copy as text (pitch sheet) | `pages/PitchSheet.tsx` | button label changed to "Copied" | toast; the label stays "Copy as text" so the button never changes width | "Pitch sheet copied as text." / alert "Couldn't copy the pitch sheet. Your browser blocked the clipboard." | done |
| Copy as CSV (budget) | `pages/TourBudget.tsx` | inline status paragraph | toast / alert | "CSV copied." / "Couldn't copy the CSV. Your browser blocked the clipboard." | done |
| Copy on a code block (/agents) | `pages/Agents.tsx` | label "Copied" plus `aria-live` | toast; the in-button label stays (absolutely positioned, fixed width, no shift) but no longer announces | "Copied to clipboard." / alert with the code selectable | done |
| Calendar (.ics) download | `pages/TourBook.tsx` | inline status paragraph | toast | "Calendar file downloaded." | done |
| Print / Download PDF | `pages/TourBook.tsx`, `PitchSheet.tsx` | the print dialog | no toast | | n/a |
| Post a note | `collab/Notes.tsx` | note appears in the thread | toast (the sheet may be closed by the time it lands; failures keep the in-sheet alert, no duplicate) | "Note posted." | done |
| Mark thread resolved / reopen | `collab/Notes.tsx` | button label flips | toast | "Thread marked resolved." / "Thread reopened." | done |
| Change a city's status | `collab/Status.tsx` | select value changes, chip appears elsewhere | toast; failure is an alert | "Status set to On hold." / "Couldn't save that. Try again." | done |
| Save a team value (override) | `collab/Overrides.tsx` | tile text changes | toast | "Team value saved." | done |
| Revert to Qloo | `collab/Overrides.tsx` | tile text changes | toast | "Back to Qloo's value." | done |
| Add / remove a sponsor lead | `collab/SponsorLeads.tsx` | list row appears / goes | toast | "Sponsor lead added." / "Sponsor lead removed." | done |
| Save answer to team notes | `strategist/SaveToNotes.tsx` | inline "Saved to team notes." replacing the button | toast; the button returns | "Saved to team notes." | done |
| Write failure (any of the above) | `collab/useCollabWrite.ts` | silent outside the notes sheet | alert toast | "Couldn't save that. Try again." | done |
| Set the name and role (identity dialog) | `collab/IdentityDialog.tsx` | dialog closes and the original action carries on | no toast; the action's own toast follows | | n/a |
| Budget: Clear budget | `pages/TourBudget.tsx` | fields empty | toast | "Budget cleared." | done |
| Budget: Load example | `pages/TourBudget.tsx` | fields fill, banner shows | toast | "Example budget loaded. The figures are fictional." | done |
| Budget: copy this city's values to all cities | `pages/TourBudget.tsx` | other cities' fields change off-screen | toast | "Copied Guadalajara's values to every city." | done |
| Budget: typing a figure (autosave to the browser) | `pages/TourBudget.tsx` | none | no toast, fires on every keystroke | | n/a |
| Add to tour / Remove from tour (playbook) | `pages/CityPlaybook.tsx` | button swaps | toast | "Added Los Angeles to the tour." / "Removed Los Angeles from the tour." | done |
| Hold or release a city in the Holds sheet | `pages/TourBoard.tsx` | checkbox ticks | toast | same two lines | done |
| Documents: add | `lib/docs/useDocuments.ts` | chip appears | toast per file | "Added recap.txt." | done |
| Documents: remove | same | chip disappears | toast | "Removed recap.txt." | done |
| Documents: cut to the limits | same, `strategist/DocumentsBar.tsx` | inline status notes | toast, inline block removed | "Only the first 40 pages of long.pdf were read." | done |
| Documents: refused (type, scanned PDF, over the limit) | same | inline status notes | alert toast (errors) or toast (limits) | "Only .pdf, .txt, .md and .csv files can be added" etc. | done |
| Documents: sample file missing | same | inline note | alert toast | "Could not load the sample file." | done |
| By age group finished | `playbook/cards/SponsorSegments.tsx` | chips replace the button | toast; failures and timeouts are alerts (the inline retry stays, no longer `role="alert"`) | "Age groups are ready." / "Couldn't load age groups. Try again from the sponsors card." | done |
| Age matrix finished (Charts) | `tourInsights/AgeMatrix.tsx` | progress line, then the table | toast on completion; the running progress line stays (it is state, not confirmation) | "Age groups loaded for 5 cities." / "... for 3 of 5 cities. Retry the rest in the table." | done |
| Advance & risks lookups finished | `pages/CityPlaybook.tsx` | skeletons fill in | toast only when the reader has switched tab by then; silent when watching | "Advance & risks are ready for Los Angeles." / alert "Couldn't load Advance & risks for ..." | done |
| Without Qloo ranking arrives | `pages/TourBoard.tsx` | skeleton, then the list | toast on landing and on failure | "Generic ranking is ready." / "Couldn't get the generic ranking." | done |
| v2 RSVP prototype tap | `pages/V2Preview.tsx` | reserved inline line "Counted. Thanks." | toast, inline line removed | "Counted. Thanks." / alert "That tap did not go through. Try again in a moment." | done |
| Ask: a live answer finishes while the panel is closed | `strategist/StrategistLauncher.tsx`, `lib/qloo/useStrategist.ts` | none | wanted | would be "Your answer is ready." | not done: the phone sheet unmounts the panel, which owns the stream state, so there is no answer left to announce. Needs the strategist state lifted above the sheet |
| Ask: send a question, stop, streaming answer, tool chips | `strategist/*` | in-place streaming | no toast | | n/a |
| Tour board run: start, Stop, Replay the agent, New brief | `pages/TourBoard.tsx` | in-place streaming | no toast, obvious in-place state | | n/a |
| Guided tour: start, next, skip, Done | `tour/*` | the popover itself | no toast; the last step already says what is next and Done is its own confirmation | | n/a |
| Navigation, tabs, sheets, menus, filters, sidebar collapse, mode chips | many | in-place selection | no toast | | n/a |
| Strategist panel open / close | `strategist/StrategistLauncher.tsx` | in-place | no toast | | n/a |
| WebMCP tools called by an outside agent | `QlooWebMcpTools.tsx` | returns a result to the agent | no toast | | n/a |
