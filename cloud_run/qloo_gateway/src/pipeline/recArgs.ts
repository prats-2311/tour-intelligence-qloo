/** The exact recommend requests the playbook makes, shared with the backtest so both ask Qloo the same question. */
export type RecTarget = "brand" | "artist";

export const artistTasteArgs = (target: RecTarget, artistId: string, where: string, limit: number) =>
  ({ target_type: target, signals: [artistId], signal_location: where, limit });

export const cityPopularityArgs = (target: RecTarget, where: string, limit: number) =>
  ({ target_type: target, signal_location: where, limit });

/** City-popular artists considered by the playbook before re-ranking by taste fit. */
export const LOCAL_ACT_POOL = 10;

/** Re-rank candidate artists (by entity id) by taste fit with the headliner in this city. */
export const localActRankArgs = (artistId: string, where: string, ids: string[]) =>
  ({ options: ids.slice(0, 10), option_type: "artist" as const, signals: [artistId], signal_location: where });
