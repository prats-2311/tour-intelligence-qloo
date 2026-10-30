const KEY = "qlooSessionId";
const TEST_KEY = "tiq.test";

/**
 * Test traffic (our own e2e specs and smoke runs) is marked so the gateway's analytics leave it out: `localStorage["tiq.test"] === "1"` or `?e2e=1` in the URL
 * (remembered for the tab in sessionStorage, since in-app navigation drops the query). The gateway also treats session ids starting `e2e-` as test traffic.
 */
export function isTestTraffic(): boolean {
  try { if (localStorage.getItem(TEST_KEY) === "1") return true; } catch { /* storage blocked */ }
  try {
    if (sessionStorage.getItem(TEST_KEY) === "1") return true;
    if (new URLSearchParams(window.location.search).get("e2e") === "1") {
      try { sessionStorage.setItem(TEST_KEY, "1"); } catch { /* not remembered */ }
      return true;
    }
  } catch { /* no window */ }
  return false;
}

export function getSessionId(): string {
  const prefix = isTestTraffic() ? "e2e-" : "";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 1 && existing.length <= 128 && (!prefix || existing.startsWith(prefix))) return existing;
    const fresh = prefix + crypto.randomUUID();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return prefix + crypto.randomUUID();
  }
}

/** Headers for every /api/qloo request: the session id, plus `x-tiq-test: 1` for test traffic. */
export function sessionHeaders(): Record<string, string> {
  return { "x-session-id": getSessionId(), ...(isTestTraffic() ? { "x-tiq-test": "1" } : {}) };
}
