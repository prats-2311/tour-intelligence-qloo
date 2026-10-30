import { LIMITS, ROLES, type Actor, type Role } from "./types";

const KEY = "collabIdentity";

export function loadIdentity(): Actor | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Actor> | null;
    if (v && typeof v.name === "string" && v.name.trim() && v.name.length <= LIMITS.name && ROLES.includes(v.role as Role)) return { name: v.name.trim(), role: v.role as Role };
  } catch { /* unreadable or blocked storage */ }
  return null;
}

export function saveIdentity(a: Actor): void {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage blocked: the name lasts for this tab only */ }
}
