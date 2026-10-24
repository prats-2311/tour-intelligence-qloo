import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { usePreloadWhenVisible } from "@/lib/routePreload";

/** A link to the next journey step. Once on screen it loads that route's JS chunk (chunk only, never data or a Qloo call). */
export function NextStepLink({ to, ...rest }: LinkProps & { to: string }) {
  const ref = usePreloadWhenVisible(to);
  return <Link ref={ref} to={to} {...rest} />;
}

/** A button whose action leads to `leads` (a path): same preload-on-visible behaviour as NextStepLink. */
export function NextStepButton({ leads, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { leads: string }) {
  const ref = usePreloadWhenVisible(leads);
  return <button ref={ref} type="button" {...rest} />;
}
