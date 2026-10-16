CREATE TABLE IF NOT EXISTS `{{DATASET}}.qloo_tours` (
  campaign_id STRING NOT NULL, artist STRING NOT NULL, artist_entity_id STRING NOT NULL,
  regions ARRAY<STRING>, date_window_start DATE, date_window_end DATE,
  cities_json STRING, board_json STRING, created_at TIMESTAMP
);
ALTER TABLE `{{DATASET}}.city_briefs` ADD COLUMN IF NOT EXISTS qloo_evidence_json STRING;
