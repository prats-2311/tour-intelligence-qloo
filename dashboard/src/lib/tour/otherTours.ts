import { MCP_TOOLS } from "@/lib/agents/mcpTools";
import { showcaseQuery, type Showcase } from "@/lib/qloo/showcase";
import { BOARD, short, tourFacts, type TourStep } from "./tourSteps";

/** Routes and shared facts for the three follow-on tours. Names and counts are read from the recording, like the essentials. */
function context(show: Showcase) {
  const f = tourFacts(show);
  const q = showcaseQuery(false);
  const pc = f.playbookCity;
  return {
    f,
    q,
    where: pc ? short(pc.name) : "the top city",
    playbook: pc ? `/tours/playbook/${pc.id}${q}` : BOARD,
  };
}

/** Plan the tour: charts, risks, budget, documents and the model-without-Qloo comparison. */
export function planTourSteps(show: Showcase): TourStep[] {
  const { f, q, where, playbook } = context(show);
  const win = show.brief.dateWindow;
  return [
    {
      id: "age-matrix", title: "Age groups, city by city", route: `/tours/insights${q}`, targets: ["age-matrix"],
      body: `Each cell is a city's top brand for one age group, shown as how far that group over-indexes against the average audience, not a share. It loads on request, so this tour only points at it.`,
    },
    {
      id: "filters", title: "Filters and the quadrant", route: `/tours/insights${q}`, targets: ["charts-filters", "quadrant"],
      body: `The quadrant plots each of the ${f.markets} cities by fan heat and activation, and the filters narrow it by country and verdict. Use them to see which cities sit apart from the pack.`,
    },
    {
      id: "advance", title: "Advance and risks", route: playbook, targets: ["tab-advance"],
      body: `This tab covers weather, holidays, visas and customs for ${where}${win ? ` between ${win.start} and ${win.end}` : ""}. It is looked up only when opened, so the tour points at the tab and does not click it.`,
    },
    {
      id: "budget", title: "Budget", route: `/tours/budget${q}`, targets: ["budget-header"],
      body: `You type every amount and the page works out the distances, travel days and totals for ${f.artist}. It is saved in this browser only.`,
    },
    {
      id: "chat", title: "Your documents and a city plan", route: playbook, targets: ["chat-tools", "ask"], opens: "ask",
      body: `Add your documents lets you ask about a contract or a rider, and Draft a city plan writes one for ${where}. Files stay in this tab and nothing is sent to Qloo.`,
    },
    {
      id: "compare", title: "Compare: the same model, without Qloo", route: playbook, targets: ["sponsors-compare"],
      body: `Gemini alone picks five brands, and each is placed on Qloo's own fan ranking. It measures how far the model strays from Qloo's ranking, not whether Qloo is right, and it runs only when opened.`,
    },
    {
      id: "saved", title: "Your saved tours", route: playbook, targets: ["nav-mine", "nav-menu"],
      body: "Every tour you plan is saved here as a draft. Search by artist or city, reopen it instantly, and mark it final when it's confirmed.",
    },
  ];
}

/** Work as a team: needs the private demo workspace, so the nav only lists it when collaboration is on. */
export function teamTourSteps(show: Showcase): TourStep[] {
  const { f, q, where, playbook } = context(show);
  return [
    {
      id: "workspace", title: "A private demo workspace", route: BOARD, targets: ["team-bar"],
      body: `This workspace is private to you, and its teammates are fictional. Nothing is shared until you share the link for ${f.artist}'s tour.`,
    },
    {
      id: "status", title: "Status chips", route: BOARD, targets: ["status-chip", "team-bar"],
      body: "Each city row can carry a chip: Considering, Confirmed, On hold or Dropped. It shows who set it and when, so the team sees where each city stands.",
    },
    {
      id: "notes", title: "City and card notes", route: playbook, targets: ["city-notes", "team-bar"],
      body: `Notes hold the team's discussion on ${where} or on a single card. The demo seeds a discussion between fictional teammates, so open City notes to read it.`,
    },
    {
      id: "override", title: "Team overrides", route: playbook, targets: ["override-team", "advance-tiles"],
      body: "The team can replace the Top zone, Best room or Support tile with its own value. “Qloo suggested” stays underneath, so the evidence is never lost.",
    },
    {
      id: "share", title: "Share link and team activity", route: playbook, targets: ["team-share", "team-bar"],
      body: "Share with your team copies a link to this workspace, and Team activity lists every status, note and edit with who made it. Anyone with the link can see and add notes.",
    },
    {
      id: "decisions", title: "Decisions in the Tour Book", route: `/tours/book${q}`, targets: ["chapter-team", "book-cover"],
      body: "A resolved note becomes a decision in that city's chapter, next to its status and any sponsor leads. It prints with the book.",
    },
  ];
}

/** Trust and agents: the proof page, the agent plugin and the concept page. */
export function trustTourSteps(show: Showcase): TourStep[] {
  const { f, q } = context(show);
  return [
    {
      id: "proof", title: "Pre-registered tests", route: "/proof", targets: ["proof-test", "proof-top"],
      body: "The tests were written down before they were run, and the page keeps the ones where Qloo-backed ranking lost. A loss stays on the page.",
    },
    {
      id: "catch", title: "Checker catch rates and live numbers", route: "/proof", targets: ["proof-checkers", "live-stats", "proof-top"],
      body: "Catch rates show how often each claim checker finds a planted error. The live numbers count the checks run on real playbooks since launch.",
    },
    {
      id: "agents", title: "Use it from your AI agent", route: `/agents${q}`, targets: ["agents-top"],
      body: `A Claude Code plugin and ${MCP_TOOLS.length} MCP tools bring the same data to any agent. The page ends with an example report built from ${f.artist}'s tour.`,
    },
    {
      id: "v2", title: "What's next", route: "/v2", targets: ["v2-hero"],
      body: "This is a concept page, not a product. It shows how venues, artists and fans could close the loop after a show.",
    },
  ];
}
