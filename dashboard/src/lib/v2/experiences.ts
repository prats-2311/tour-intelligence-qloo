import type { TasteLoopData } from "./tasteLoop";

/** One fan experience type for the /v2 concept. Wording is illustrative; `example` is a real recorded item when one exists. */
export interface Experience {
  id: string;
  name: string;
  /** The Qloo signal this type starts from, in words. */
  signal: string;
  /** A real item from the recording that fills the signal, or null when the recording has none. */
  example: string | null;
  suits: string;
  cost: "Free" | "Paid (price set by artist and venue)";
  journey: readonly [string, string, string, string, string, string];
}

export const JOURNEY_LABELS = ["Discover", "Book", "Before", "On the day", "After", "What the artist learns"] as const;

const BOOK_FREE = "One tap to reserve a spot, no account. Nothing to pay.";
const BOOK_PAID = "One tap, no account, then the venue's or artist's own checkout. We never hold the payment.";
const AFTER = "The fan taps \"I was there\" and gets a small perk, such as early merch access or a presale code.";

export function buildExperiences(d: TasteLoopData): Experience[] {
  const place = d.topPlace?.name ?? null;
  const brand = d.topBrand?.name ?? null;
  return [
    {
      id: "listening", name: place ? `Listening session at ${place}` : "Listening session at a place fans love",
      signal: "A place these fans rank above the city", example: place,
      suits: "Fans who like small rooms and hearing songs before anyone else",
      cost: "Free",
      journey: [
        "The artist posts about it, or it goes in the newsletter.",
        BOOK_FREE,
        "A reminder, a shared playlist of the older songs and a note on when doors open.",
        "The artist plays new songs in a small room, then talks about them. Fans can ask questions between songs.",
        AFTER,
        "Feeds RSVP rate and show-up rate; the venue says whether it would rebook, and the artist whether they would repeat.",
      ],
    },
    {
      id: "popup", name: brand ? `Brand pop-up with ${brand}` : "Brand pop-up with a brand fans love",
      signal: "A brand these fans rank above the city, not on the artist's no-go list", example: brand,
      suits: "Fans who buy merch and follow the brands they love",
      cost: "Paid (price set by artist and venue)",
      journey: [
        "A QR code at the show and a post show the co-designed drop.",
        BOOK_PAID,
        "A reminder with the pick-up place and what to bring.",
        "The drop is sold at a fan-loved shop or the venue. The artist stops by to sign things. This is a pitch to the brand; nothing here says it has agreed.",
        AFTER,
        "Feeds RSVP rate and show-up rate, and shows whether fans come back for a second drop.",
      ],
    },
    {
      id: "film", name: d.film ? `Film night: ${d.film.name}` : "Film night",
      signal: `A ${d.film?.kind === "tv_show" ? "TV show" : "film"} these fans love here`, example: d.film?.name ?? null,
      suits: "Fans who love film and want to talk to the artist about it",
      cost: "Free",
      journey: [
        "The artist's post names the film and why it matters to the music.",
        BOOK_FREE,
        "A reminder, a playlist that fits the film and a note that screening rights are needed before this can go ahead.",
        "A short screening, then a Q&A with the artist. The room stays small so everyone can talk.",
        AFTER,
        "Feeds RSVP rate and show-up rate, and whether fans want another night like it.",
      ],
    },
    {
      id: "opener", name: d.coBill ? `Opening-act night with ${d.coBill}` : "Opening-act night",
      signal: "An act these fans also rank above the city", example: d.coBill,
      suits: "Fans who want more than one act and a first look at the show",
      cost: "Paid (price set by artist and venue)",
      journey: [
        "A newsletter note and a QR code at the show announce a small bonus show the night before.",
        BOOK_PAID,
        "A reminder, a shared playlist with both acts and a note on set times.",
        "Both acts play a short set the night before the main show. It is a small room and a relaxed night.",
        AFTER,
        "Feeds RSVP rate and show-up rate, and whether the venue would rebook the pair.",
      ],
    },
    {
      id: "walk", name: d.zone ? `Neighbourhood walk in ${d.zone}` : "Neighbourhood walk",
      signal: "A promo zone where these fans cluster", example: d.zone,
      suits: "Fans who like to explore a city and meet the artist outside the venue",
      cost: "Free",
      journey: [
        "The artist posts a map of favourite spots and a meeting point.",
        BOOK_FREE,
        "A reminder, a playlist for the walk and a note about comfortable shoes.",
        "A small group walks the artist's favourite spots. The walk ends at a pop-up merch stop.",
        AFTER,
        "Feeds RSVP rate and show-up rate, and shows which part of town fans turn up for.",
      ],
    },
    {
      id: "soundcheck", name: "Soundcheck access and meet-up",
      signal: "Fans who rank small rooms and the artist's own taste above the city", example: null,
      suits: "Superfans who want to see how a show is made",
      cost: "Paid (price set by artist and venue)",
      journey: [
        "A QR code at the show and a pinned post on the artist's channels.",
        BOOK_PAID,
        "A reminder with the arrival time and a shared playlist.",
        "A small group watches soundcheck at the main venue, then says hello to the artist. Nothing is promised about a real venue until it agrees.",
        AFTER,
        "Feeds RSVP rate and show-up rate; the venue says whether it would host this again.",
      ],
    },
    {
      id: "dinner", name: d.foodPlace ? `Fan dinner at ${d.foodPlace}` : "Fan dinner at a place these fans love",
      signal: "A place these fans love, matched to the artist's Loves: tacos", example: d.foodPlace,
      suits: "Fans who like food and a long chat with the artist",
      cost: "Paid (price set by artist and venue)",
      journey: [
        "The artist posts about the dinner, or it goes in the newsletter.",
        BOOK_PAID,
        "A reminder, a shared playlist and a note to say about any food needs.",
        "A shared table for a small group, with tacos on the menu. The artist sits with the fans and the talk stays informal.",
        AFTER,
        "Feeds RSVP rate and show-up rate; the venue says whether it would rebook, and the artist whether they would repeat.",
      ],
    },
  ];
}
