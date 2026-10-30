import type { Showcase } from "@/lib/qloo/showcase";
import { loadTasteLoop, EXAMPLE_PROFILE } from "@/lib/v2/tasteLoop";
import type { TourStep } from "./tourSteps";

export const V2_ROUTE = "/v2";
export const V2_TOUR_STEP_COUNT = 10;

/** The v2 tour: one step per section of /v2. Names come from the recording, so the copy follows the page. */
export function buildV2TourSteps(show: Showcase): TourStep[] {
  const d = loadTasteLoop(show);
  const place = d.topPlace?.name ?? "the top place";
  const brand = d.topBrand?.name ?? "the top brand";
  const crossed = d.brands.find((b) => b.noGo)?.name;
  const mk = (id: string, title: string, body: string): TourStep => ({ id, title, body, route: V2_ROUTE, targets: [`v2-${id}`] });
  return [
    mk("hero", "A concept, not a product", "This is a future version we haven't built. The artist below is a made-up example; the places and brands are real Qloo data."),
    mk("profile", "1. Profile", `The artist says what they play, who they sound like (${EXAMPLE_PROFILE.soundsLike}) and what they won't work with. Every field here is a fictional example.`),
    mk("venues", "2. Venue profiles", `Venues would claim a profile: open to collabs, room size, free nights. The places are real LA venues from the recording; their answers are left blank, since only a venue can give them.`),
    mk("match", "3. Match", `Real data: places and brands that fans of ${EXAMPLE_PROFILE.soundsLike} rank far above ${d.city}'s own list.${crossed ? ` ${crossed} is crossed out because it's on the artist's no-go list.` : ""}`),
    mk("act", "4. Act", `One suggestion built from the top match, ${place}, and ${brand}. The outreach text is a draft the manager edits and sends.`),
    mk("experiences", "Experiences fans could book", "Each experience starts from a real Qloo signal, like a top place or a film these fans love. Fans go from discovery to \"I was there\" in one tap, with no account."),
    mk("rsvp", "6. Fans prove it", "Fans would get one link with three taps: Going, Waitlist or I was there. No fan accounts. This card is a mock and does nothing."),
    mk("outcome", "7. Results", "After the event v2 would record RSVPs, show-ups and whether the venue and artist would do it again. Nothing is measured yet, so every box says so."),
    mk("loop", "8. The loop", "Results are written back to both profiles, and the next tour's plan learns from them. That outcome record is data no LLM has read."),
    mk("compare", "9. V1 vs V2", "Today's app is v1. This table lists what would change, and the limits below it are the honest part: venues must opt in, and nothing is proven until real events happen."),
  ];
}
