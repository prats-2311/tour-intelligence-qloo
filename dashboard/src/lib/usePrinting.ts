import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

/**
 * True while the page is being printed (or the print media is emulated). The print edition is mounted only then, so the on-screen book
 * never carries a second copy of its text. `beforeprint` is handled synchronously so the print layout exists when Chrome measures pages.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
    const on = () => flushSync(() => setPrinting(true));
    const off = () => setPrinting(false);
    const isPrint = () => !!mq && mq.media === "print" && mq.matches; // a query stub that answers "true" to everything is not print
    const change = () => setPrinting(isPrint());
    if (isPrint()) setPrinting(true);
    mq?.addEventListener?.("change", change);
    window.addEventListener("beforeprint", on);
    window.addEventListener("afterprint", off);
    return () => { mq?.removeEventListener?.("change", change); window.removeEventListener("beforeprint", on); window.removeEventListener("afterprint", off); };
  }, []);
  return printing;
}
