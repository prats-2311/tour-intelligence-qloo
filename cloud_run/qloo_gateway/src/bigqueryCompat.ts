import type { BigQuery } from "@google-cloud/bigquery";
import type { BigQueryLike } from "./cache.js";
// Compile-time check: the real client must satisfy the cache's interface.
export const assertBigQueryCompat = (bq: BigQuery): BigQueryLike => bq;
