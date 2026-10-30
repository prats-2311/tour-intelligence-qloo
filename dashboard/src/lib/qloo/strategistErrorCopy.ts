export const STRATEGIST_OFFLINE = "The live strategist isn't available right now. Recorded answers still work.";

/**
 * Plain-language copy for a failed strategist turn. Transport and service failures (HTTP_5xx, "not configured", fetch/connection text, model
 * unavailable) read as one calm sentence; a deliberate message from the service (for example the daily budget) is kept as written.
 */
export function strategistErrorCopy(code: string | undefined, message: string | undefined): string {
  const m = message ?? "";
  // The sample and showcase notes ("needs a live run") are deliberate copy that arrives with code UNAVAILABLE; keep them.
  if (/live run/i.test(m)) return m;
  const internal = /^HTTP_\d+$/.test(code ?? "") || ["UNAVAILABLE", "INTERNAL", "NO_SAMPLE", "TRANSPORT", "UNKNOWN"].includes(code ?? "")
    || /not configured|gateway|upstream|econn|enotfound|fetch failed|request failed|failed to fetch|network|timed? ?out|typeerror|undefined/i.test(m)
    || m.trim() === "";
  return internal ? STRATEGIST_OFFLINE : m;
}
