import { useSearchParams } from "react-router-dom";
import { setShowcaseVariant, showcaseParam } from "./showcase";

/**
 * Points the showcase accessors at the recording the URL asks for (`?showcase=routing` for the recorded routing, otherwise the main
 * example). It sets a module variable during render on purpose: every page below reads the recording through those accessors in the same
 * render pass, so it must be in place before they run. Idempotent, so App and each showcase-aware page can all call it.
 */
export function useShowcaseVariant(): void {
  const [params] = useSearchParams();
  setShowcaseVariant(showcaseParam(params.get("showcase")) === "routing" ? "routing" : "main");
}
