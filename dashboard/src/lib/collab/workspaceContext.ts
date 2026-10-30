import { createContext, useContext } from "react";
import type { Actor, Op, Snapshot } from "./types";

export interface Workspace {
  /** False without a provider or when the gateway is unreachable: every collaboration control hides. */
  enabled: boolean;
  ws: string | null;
  snapshot: Snapshot | null;
  identity: Actor | null;
  /** A short plain-English message about the last failed write or load, or null. */
  error: string | null;
  clearError: () => void;
  /** Opens the name and role dialog (also from the header chip). */
  editIdentity: () => void;
  /** Applies a write optimistically, asking who is writing and creating the workspace first when needed. Resolves false if it did not go through. */
  write: (op: Op, body: Record<string, unknown>) => Promise<boolean>;
  /** Makes sure a workspace exists, then returns the current URL with `ws` (and whether it was copied). */
  share: () => Promise<{ url: string | null; copied: boolean }>;
}

export const OFF: Workspace = {
  enabled: false, ws: null, snapshot: null, identity: null, error: null,
  clearError: () => undefined, editIdentity: () => undefined, write: async () => false, share: async () => ({ url: null, copied: false }),
};

export const WorkspaceContext = createContext<Workspace>(OFF);
/** The shared team workspace; inert (enabled: false) outside a provider so pages render the same without one. */
export const useWorkspace = (): Workspace => useContext(WorkspaceContext);
