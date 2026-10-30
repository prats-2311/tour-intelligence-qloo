import { isLoopbackUrl } from "./qlooProxy.js";

/** One console line per optional backend: on or off, and what still works. Names and URLs only, never secrets. */
export function bffStatus(env) {
  const lines = [];
  const gw = env.QLOO_GATEWAY_URL;
  if (!gw) lines.push("QLOO_GATEWAY_URL not set: live runs, strategist and team workspaces are off; the sample tour still works");
  else lines.push(isLoopbackUrl(gw) ? `Qloo gateway: ${gw} (local, no Google auth)` : `Qloo gateway: ${gw} (sends a Google identity token; needs Cloud Run or gcloud)`);
  if (env.RECORDINGS_DIR) lines.push(`Recordings: ${env.RECORDINGS_DIR}`);
  else if (env.RECORDINGS_BUCKET) lines.push(`Recordings: bucket ${env.RECORDINGS_BUCKET}`);
  else lines.push("RECORDINGS_DIR and RECORDINGS_BUCKET not set: the recorded example is private; the synthetic Lumen Vale sample is used (expect two 503s on /api/recordings/* in the console)");
  if (!env.TOUR_DATA_API_URL) lines.push("TOUR_DATA_API_URL not set: the legacy tour_data_api routes answer 503 (not needed for the Qloo tour)");
  return lines;
}
