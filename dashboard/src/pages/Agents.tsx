import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { buildExampleReport } from "@/lib/agents/exampleReport";
import { MCP_TOOLS } from "@/lib/agents/mcpTools";
import { SHOWCASE } from "@/lib/qloo/showcase";

export const MCP_URL = "https://tour-intel-mcp-public-602700957663.us-central1.run.app/mcp";
export const PLUGIN_ADD = "/plugin marketplace add prats-2311/tour-intelligence-qloo";
export const PLUGIN_INSTALL = "/plugin install tour-intel@tour-intelligence-qloo";
export const CLAUDE_MCP_ADD = `claude mcp add --transport http tour-intel ${MCP_URL}`;
export const MCP_JSON = `{
  "mcpServers": {
    "tour-intel": {
      "type": "http",
      "url": "${MCP_URL}"
    }
  }
}`;

export { MCP_TOOLS };

export const IN_PAGE_TOOLS: readonly string[] = [
  "get_tour_board", "get_city_playbook", "open_city", "set_comparison_mode", "build_tour_from_shortlist", "open_tour_book",
  "get_sponsors_by_age", "get_advance_risks", "get_team_notes", "add_team_note", "set_city_status",
];

const PROMPTS = [
  "Plan where Mac DeMarco should tour in Mexico and the US, and give me a sponsor report.",
  "Which brands do 25–29-year-old fans of <artist> rank highly in Austin?",
  "Summarise where my team landed on LA: <workspace link>",
];

const LIMITS = [
  "30 requests per 10 minutes per IP address.",
  "2 regions and 3 stops per board.",
  "A shared daily Qloo budget, so a busy day can run out.",
  "Results are affinity signals from aggregate taste data, not ticket forecasts.",
  "Workspace links are readable by anyone who has them.",
  "No personal data is sent to Qloo.",
];

const META = "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted tabular-nums";

/** Copies with the async clipboard API, falling back to a hidden textarea and execCommand where it is missing or blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* blocked or insecure context: fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    setState((await copyText(code)) ? "copied" : "failed");
    setTimeout(() => setState("idle"), 2000);
  };
  return (
    <div className="relative min-w-0 rounded-[10px] bg-canvas">
      <pre tabIndex={0} aria-label={label} className="max-w-full overflow-x-auto p-3 pr-20 font-mono text-[13px] leading-[1.5] text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"><code>{code}</code></pre>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy: ${label}`}
        className="absolute right-1.5 top-1.5 inline-flex h-9 min-w-[4.5rem] items-center justify-center rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}</span>
      </button>
    </div>
  );
}

function Section({ meta, title, children }: { meta: string; title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0 rounded-[18px] bg-paper p-4 md:p-5">
      <p className={META}>{meta}</p>
      <h2 className="font-title mt-1 text-[22px] leading-tight text-canvas-text">{title}</h2>
      <div className="mt-3 flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="max-w-[64ch] text-[15px] leading-[1.5] text-canvas-muted [text-wrap:pretty]">{children}</p>;
const Mono = ({ children }: { children: ReactNode }) => <code className="break-words rounded bg-canvas px-1 py-0.5 font-mono text-[13px] text-canvas-text">{children}</code>;

export default function Agents() {
  const report = useMemo(() => buildExampleReport(SHOWCASE), []);
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1000px] flex-col gap-5 pb-10">
      <header data-tour="agents-top" className="rounded-[18px] bg-paper p-5 md:p-6">
        <h1 className="font-title text-[32px] leading-[1.1] text-bone [text-wrap:balance] lg:text-[44px]">Use Tour Intelligence from your AI agent</h1>
        <p className="mt-3 max-w-[60ch] text-[16px] leading-[1.5] text-canvas-muted [text-wrap:pretty]">
          The same Qloo-backed tools that power this app are available to any MCP client: Claude Code, Claude Desktop, Cursor and others.
        </p>
      </header>

      <Section meta="1 · Recommended" title="Claude Code plugin">
        <CodeBlock code={PLUGIN_ADD} label="Add the plugin marketplace" />
        <CodeBlock code={PLUGIN_INSTALL} label="Install the plugin" />
        <P>Installs the MCP connection and a plan-tour skill.</P>
      </Section>

      <Section meta="2 · Or connect directly" title="Add the MCP server">
        <CodeBlock code={CLAUDE_MCP_ADD} label="Add the MCP server to Claude Code" />
        <P>Claude Desktop, Cursor and other MCP clients that support HTTP servers:</P>
        <CodeBlock code={MCP_JSON} label="MCP client JSON configuration" />
      </Section>

      <Section meta="3 · What your agent can call" title="Tools">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-[14px]">
            <caption className="sr-only">Public MCP tools</caption>
            <thead><tr className="text-[12px] text-canvas-muted"><th scope="col" className="py-1.5 pr-3 font-medium">Tool</th><th scope="col" className="py-1.5 font-medium">What you get</th></tr></thead>
            <tbody>
              {MCP_TOOLS.map((t) => (
                <tr key={t.name} className="border-t border-canvas-line align-top">
                  <th scope="row" className="py-2 pr-3 font-mono text-[13px] font-semibold text-canvas-text"><span className="break-all">{t.name}</span></th>
                  <td className="py-2 text-canvas-muted">{t.gets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>Prompts: <Mono>plan_tour</Mono>, <Mono>brief_for_sponsor_meeting</Mono></P>
        <P>Resource: <Mono>tour-intel://about</Mono></P>
      </Section>

      <Section meta="4 · Examples" title="Try asking">
        <ul className="flex flex-col gap-2">
          {PROMPTS.map((q) => <li key={q} className="rounded-[10px] bg-canvas px-3 py-2 text-[15px] leading-[1.45] text-canvas-text">{q}</li>)}
        </ul>
      </Section>

      <Section meta="5 · Example output" title="A tour report">
        <p data-testid="report-label" className="inline-flex w-fit max-w-full rounded-full bg-gold px-3 py-1 text-[13px] font-semibold text-on-gold">{report.label}</p>
        <CodeBlock code={report.markdown} label="Example get_tour_report markdown" />
      </Section>

      <Section meta="6 · In this page" title="WebMCP">
        <P>In Chrome with WebMCP enabled, an agent in the page can read the board, open cities, check sponsors by age, read advance risks, and add team notes.</P>
        <ul data-testid="webmcp-tools" className="flex flex-wrap gap-1.5">
          {IN_PAGE_TOOLS.map((n) => <li key={n} className="rounded-full bg-canvas px-2.5 py-1 font-mono text-[12px] text-canvas-text">{n}</li>)}
        </ul>
      </Section>

      <Section meta="7 · Good to know" title="Limits and privacy">
        <ul className="flex max-w-[64ch] list-disc flex-col gap-1.5 pl-5 text-[15px] leading-[1.5] text-canvas-muted marker:text-canvas-line">
          {LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </Section>

      <Link to="/" className="flex min-h-11 w-fit items-center text-[14px] text-canvas-text underline decoration-canvas-muted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Back to the start</Link>
    </div>
  );
}
