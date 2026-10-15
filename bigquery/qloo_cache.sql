CREATE TABLE IF NOT EXISTS `liifecalling-academy.tour_intelligence_qloo.qloo_cache` (
  cache_key STRING NOT NULL,
  tool STRING NOT NULL,
  envelope STRING NOT NULL,
  created_at_ms INT64 NOT NULL
)
CLUSTER BY cache_key;
