export const MCP_TOOLS: ReadonlyArray<{ name: string; gets: string }> = [
  { name: "find_tour_markets", gets: "Scored cities for an artist across up to 2 regions, each with a Play, Hidden goldmine, De-risk, Consider or Skip verdict." },
  { name: "get_city_playbook", gets: "One city's sponsors, venues, co-billing acts and promo zones, with claim checks." },
  { name: "suggest_support_acts", gets: "Support acts ranked by shared taste with the headliner and how much the city likes them." },
  { name: "rank_venues", gets: "Venues in a city ranked by taste fit with the artist's fans." },
  { name: "get_local_moment", gets: "Films, TV, places and acts these fans rank highly in a city." },
  { name: "get_sponsors_by_age", gets: "Brands that each age group of fans ranks highly in a city." },
  { name: "get_advance_risks", gets: "Typical weather, holidays, visa and customs notes and equipment rules for a city and date window." },
  { name: "get_team_notes", gets: "A shared workspace's city statuses, open threads and decisions, from its link." },
  { name: "get_tour_report", gets: "A markdown report for a sponsor meeting: the board plus a playbook for the top cities." },
];
