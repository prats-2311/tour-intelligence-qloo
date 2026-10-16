/** The exact recommend requests the playbook makes, shared with the backtest so both ask Qloo the same question. */
export type RecTarget = "brand" | "artist";

export const artistTasteArgs = (target: RecTarget, artistId: string, where: string, limit: number) =>
  ({ target_type: target, signals: [artistId], signal_location: where, limit });

export const cityPopularityArgs = (target: RecTarget, where: string, limit: number) =>
  ({ target_type: target, signal_location: where, limit });
