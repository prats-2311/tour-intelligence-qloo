import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { SAMPLE_PLAYBOOK_CITY_IDS, samplePlaybookEvents, sampleThisWeek } from "@/lib/qloo/fixtures/lumenValePlaybooks";

/** The Lumen Vale placeholder recording. Tests that depend on its cities pin showcase.json to this, so a real recording never breaks them. */
export const PLACEHOLDER_SHOWCASE = {
  recordedAt: null,
  artist: SAMPLE_BRIEF.artist,
  brief: SAMPLE_BRIEF,
  boardEvents: LUMEN_VALE_SAMPLE,
  playbooks: Object.fromEntries(SAMPLE_PLAYBOOK_CITY_IDS.map((id) => [id, samplePlaybookEvents(id)])),
  thisWeek: Object.fromEntries(SAMPLE_PLAYBOOK_CITY_IDS.map((id) => [id, sampleThisWeek(id)])),
};
