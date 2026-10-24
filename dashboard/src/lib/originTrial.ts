/**
 * WebMCP origin-trial tokens are per-origin. VITE_WEBMCP_OT_TOKEN may hold several tokens separated by spaces (commas would break
 * `gcloud --set-build-env-vars`); each one becomes its own <meta http-equiv="origin-trial">. No token, no meta.
 */
export function injectOriginTrial(html: string, tokens: string | undefined): string {
  const list = (tokens ?? "").replace(/"/g, "").split(/\s+/).filter(Boolean);
  if (list.length === 0) return html;
  return html.replace("</head>", `${list.map((t) => `  <meta http-equiv="origin-trial" content="${t}">\n`).join("")}</head>`);
}
