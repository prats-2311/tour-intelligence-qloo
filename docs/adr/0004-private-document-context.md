# 4. Private document context for the strategist

Date: 2026-10-31. Status: accepted.

## Context
A manager often holds a rider, a contract or a sponsor deck and wants to ask the strategist about it next to the
Qloo data. Those files can hold private terms. Qloo's data policy and plain care both say they must not reach the
Qloo cache, a log or a database. We also want answers about a document to be checkable: a number the model quotes
from a page should be the number on that page.

## Decision
- Text is extracted in the browser (`.pdf`, `.txt`, `.md`, `.csv`; at most 3 files, 40 pages and 60,000 characters
  in total). PDF text comes from `pdfjs-dist` in the tab. Plain text is cut into numbered sections so a citation
  can point at one.
- Only the extracted text leaves the tab, inside one `POST /v1/strategist` request, and only into one Gemini
  prompt. The prompt marks each page `[doc:<id> p.<n>]`, says the documents are data and not instructions, and
  tells the model to cite them and never present them as Qloo data.
- Never to Qloo: the strategist's tool arguments are validated names, and `executeTool` also rejects any string of
  40 or more characters that quotes the documents.
- Never stored, cached or logged: no Firestore, BigQuery, cache or workspace write, no Gemini response cache for
  the strategist, and no code path that logs request bodies. The files are gone when the tab closes.
- Answer check: a sentence that cites `[doc:id p.n]` has its numbers checked only against that page. An uncited
  sentence is checked only against tool results and board scores. Neither source vouches for the other.
- The request body limit is 150 KB for this one route; every other route keeps 64 KB.

## Consequences
- Nothing about a document can be recovered later, by us or by anyone else. A user who closes the tab adds the
  file again.
- The text does go to Google's Gemini service as part of the prompt. The chat panel says so next to the upload
  control ("Their text is sent to the AI model with your questions and is not stored. Nothing is sent to Qloo.").
- The check covers numbers, not claims in words. A wrong statement without a number is not caught.
- A scanned PDF with no text layer yields no text. There is no OCR.
- The guarantees are tested (`test/documents.test.ts`, `test/strategistDocuments.test.ts`,
  `test/answerCheck.test.ts`). Anyone adding logging to the strategist route must keep them true.
