import { useState } from "react";
import { Sheet } from "@/components/qloo/Sheet";
import { LIMITS, ROLES, SHARE_NOTICE, type Actor, type Role } from "@/lib/collab/types";
import { collabInput } from "./ui";

export function IdentityForm({ current, onSave }: { current: Actor | null; onSave: (a: Actor) => void }) {
  const [name, setName] = useState(current?.name ?? "");
  const [role, setRole] = useState<Role | null>(current?.role ?? null);
  const ok = name.trim().length > 0 && role !== null;
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (ok) onSave({ name: name.trim().replace(/\s+/g, " "), role }); }}>
      <label className="flex flex-col gap-1 text-[13px] font-medium text-canvas-text">
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.name} autoComplete="nickname" className={collabInput} placeholder="First name is fine" />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-medium text-canvas-text">Your role</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <label key={r} className={`inline-flex min-h-11 cursor-pointer items-center rounded-[8px] px-3 text-[13px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold ${role === r ? "bg-gold text-on-gold" : "bg-paper-raised text-canvas-text hover:bg-[#3a3932]"}`}>
              <input type="radio" name="collab-role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-[13px] text-canvas-muted">{SHARE_NOTICE}</p>
      <button type="submit" disabled={!ok} className="btn-gold inline-flex h-12 items-center justify-center rounded-[10px] px-5 text-[15px] font-semibold disabled:opacity-50 lg:h-10">Save</button>
    </form>
  );
}

/** Asked the first time someone writes; reopened from the header chip. Stored on this device only. */
export function IdentityDialog({ open, current, onClose, onSave }: { open: boolean; current: Actor | null; onClose: () => void; onSave: (a: Actor) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={current ? "Change your name or role" : "Who's writing?"}>
      <IdentityForm current={current} onSave={onSave} />
    </Sheet>
  );
}
