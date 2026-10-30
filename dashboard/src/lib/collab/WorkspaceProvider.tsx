import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { IdentityDialog } from "@/components/collab/IdentityDialog";
import { isRoutingBrief, showcaseAvailable, showcaseParam } from "../qloo/showcase";
import { useTourBoard } from "../qloo/TourBoardProvider";
import { CollabHttpError, createWorkspace, fetchWorkspace, writeWorkspace, type Seed } from "./api";
import { loadIdentity, saveIdentity } from "./identity";
import { applyLocal } from "./optimistic";
import { demoSeedFromRecording } from "./demoSeed";
import { emptySnapshot, LIMITS, WS_ID, type Actor, type Op, type Snapshot } from "./types";
import { WorkspaceContext, type Workspace } from "./workspaceContext";

type Scope = "showcase" | "routing" | "live";

const messageFor = (e: unknown): string => {
  const s = e instanceof CollabHttpError ? e.status : 0;
  if (s === 429) return "Too many changes at once. Wait a moment and try again.";
  if (s === 404) return "This workspace has expired. Share a new link to start a fresh one.";
  if (s === 409) return e instanceof Error ? e.message : "This workspace is full.";
  if (s === 400 && e instanceof Error) return e.message;
  return "Couldn't save that. Check your connection and try again.";
};

/**
 * Team workspace for the tour in view. The id lives in the URL (`?ws=`) so a copied link opens the same workspace, and is kept
 * on every page the same way the `showcase` flag is. The recorded example gets its own private, seeded workspace per visitor;
 * a live tour gets one on the first write. Polls every 10 s while the tab is visible; writes are optimistic, last write wins per field.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const { state } = useTourBoard();
  const showParam = showcaseParam(params.get("showcase"));
  const routing = showParam === "routing" || (showParam === null && state.source === "showcase" && isRoutingBrief(state.brief));
  const scope: Scope = routing ? "routing" : showParam === "main" || state.source === "showcase" ? "showcase" : "live";

  const [byScope, setByScope] = useState<Partial<Record<Scope, string>>>({});
  const dead = useRef(new Set<string>());
  const rawUrlWs = params.get("ws");
  const urlWs = rawUrlWs && WS_ID.test(rawUrlWs) && !dead.current.has(rawUrlWs) ? rawUrlWs : null;
  // A workspace id left in the URL by another example (leaving the recording for a live tour) is not adopted for this one.
  const foreign = urlWs !== null && (Object.entries(byScope) as Array<[Scope, string]>).some(([k, v]) => v === urlWs && k !== scope);
  const ws = (urlWs && !foreign ? urlWs : null) ?? byScope[scope] ?? null;

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Actor | null>(() => loadIdentity());
  const [ask, setAsk] = useState<{ done: (a: Actor | null) => void } | null>(null);
  const wsRef = useRef<string | null>(ws);
  wsRef.current = ws;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const pending = useRef(0);
  const creating = useRef<Promise<Snapshot> | null>(null);
  const autoTries = useRef(0);

  const adopt = useCallback((s: Snapshot, forScope: Scope) => {
    setByScope((m) => ({ ...m, [forScope]: s.ws }));
    setSnap(s);
    snapRef.current = s;
    wsRef.current = s.ws;
  }, []);
  const forget = useCallback((id: string) => {
    dead.current.add(id);
    setByScope((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== id)));
    setSnap((cur) => (cur?.ws === id ? null : cur));
  }, []);

  /** One create at a time; `seed` only for the recorded example. */
  const ensure = useCallback(async (seed?: Seed): Promise<Snapshot> => {
    const have = snapRef.current;
    if (have && have.ws === wsRef.current) return have;
    if (!creating.current) {
      const forScope = scopeRef.current;
      creating.current = createWorkspace(seed).then((s) => { adopt(s, forScope); return s; }).finally(() => { creating.current = null; });
    }
    return creating.current;
  }, [adopt]);

  // Keep the id in the URL on every page (replace, so Back still works); drop it when this tour has none.
  useEffect(() => {
    if ((params.get("ws") ?? null) === ws) return;
    setParams((p) => { const n = new URLSearchParams(p); if (ws) n.set("ws", ws); else n.delete("ws"); return n; }, { replace: true });
  }, [ws, params, setParams]);

  // Load the workspace in the URL (or remembered for this tour).
  useEffect(() => {
    if (!ws || snapRef.current?.ws === ws) return;
    let off = false;
    fetchWorkspace(ws).then((s) => { if (!off) { setSnap(s); setByScope((m) => (m[scopeRef.current] === s.ws ? m : { ...m, [scopeRef.current]: s.ws })); } }, (e: unknown) => {
      if (off) return;
      if (e instanceof CollabHttpError && e.status === 404) { forget(ws); setError("That workspace has expired or doesn't exist. A fresh one starts when someone adds a note."); } else setUnavailable(true);
    });
    return () => { off = true; };
  }, [ws, forget]);

  // The recorded example opens a private, seeded workspace for each visitor (never the same one for two people).
  useEffect(() => {
    if (scope !== "showcase" || ws || unavailable || autoTries.current >= 2 || !showcaseAvailable()) return;
    autoTries.current += 1;
    ensure(demoSeedFromRecording() ?? undefined).catch(() => setUnavailable(true));
  }, [scope, ws, unavailable, ensure, state.source]);

  // Poll every 10 s while the tab is visible; skip while a write is in flight so the screen never jumps back.
  useEffect(() => {
    if (!ws) return;
    const tick = async () => {
      if (document.visibilityState !== "visible" || pending.current > 0) return;
      try {
        const s = await fetchWorkspace(ws);
        if (pending.current === 0 && wsRef.current === ws) setSnap((cur) => (cur && cur.ws === s.ws && cur.rev === s.rev ? cur : s));
      } catch (e) { if (e instanceof CollabHttpError && e.status === 404) forget(ws); }
    };
    const id = setInterval(() => void tick(), LIMITS.pollMs);
    const onVisible = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [ws, forget]);

  const askIdentity = useCallback((): Promise<Actor | null> => identityRef.current ? Promise.resolve(identityRef.current) : new Promise((resolve) => setAsk({ done: resolve })), []);
  const write = useCallback(async (op: Op, body: Record<string, unknown>): Promise<boolean> => {
    const who = await askIdentity();
    if (!who) return false;
    let id = wsRef.current;
    if (!id) {
      try { id = (await ensure()).ws; } catch { setError("Team notes aren't available right now."); return false; }
    }
    const full = { ...body, ...who };
    pending.current += 1;
    setError(null);
    setSnap((cur) => applyLocal(cur ?? emptySnapshot(id), op, full, who, Date.now(), `tmp-${Math.random().toString(36).slice(2)}`));
    try {
      const s = await writeWorkspace(id, op, full);
      pending.current -= 1;
      if (pending.current === 0 && wsRef.current === id) setSnap(s);
      return true;
    } catch (e) {
      pending.current -= 1;
      setError(messageFor(e));
      if (e instanceof CollabHttpError && e.status === 404) forget(id);
      else void fetchWorkspace(id).then((s) => { if (pending.current === 0) setSnap(s); }, () => undefined); // put the real state back
      return false;
    }
  }, [askIdentity, ensure, forget]);

  const share = useCallback(async () => {
    try { await ensure(); } catch { setError("Team notes aren't available right now."); return { url: null, copied: false }; }
    const u = new URL(window.location.href);
    u.searchParams.set("ws", wsRef.current!);
    try { await navigator.clipboard.writeText(u.toString()); return { url: u.toString(), copied: true }; } catch { return { url: u.toString(), copied: false }; }
  }, [ensure]);

  const value = useMemo<Workspace>(() => ({
    enabled: !unavailable, ws, snapshot: snap && snap.ws === ws ? snap : null, identity, error,
    clearError: () => setError(null), identify: (a: Actor) => { saveIdentity(a); setIdentity(a); identityRef.current = a; }, editIdentity: () => setAsk({ done: () => undefined }), write, share,
  }), [unavailable, ws, snap, identity, error, write, share]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      <IdentityDialog open={ask !== null} current={identity} onClose={() => { ask?.done(null); setAsk(null); }} onSave={(a) => { saveIdentity(a); setIdentity(a); identityRef.current = a; ask?.done(a); setAsk(null); }} />
    </WorkspaceContext.Provider>
  );
}
