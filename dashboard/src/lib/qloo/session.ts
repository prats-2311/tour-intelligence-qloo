const KEY = "qlooSessionId";

export function getSessionId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 1 && existing.length <= 128) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}
