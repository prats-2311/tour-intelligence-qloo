import { SAMPLE_CITIES } from "./lumenVale";
import type { GatewayEvent, WithoutQloo } from "../types";

// Fictional, labelled showcase conversations. Every number in an answer exists in the scripted
// tool-result data, the sample playbooks or SAMPLE_CITIES (enforced by strategistSample.test.ts).
export const SAMPLE_QUESTIONS: readonly string[] = [
  "Why is Guadalajara a hidden goldmine?",
  "Who should open in São Paulo?",
  "Is Los Angeles worth it?",
];

const finish = (text: string, toolCalls: number, rounds: number): GatewayEvent[] => [
  { type: "strategist_message", text, unsupportedNumbers: [], stoppedEarly: false, model: "sample" },
  { type: "done", summary: { rounds, toolCalls, forcedFinal: false } },
];

const call = (id: string, name: string, args: Record<string, unknown>, summary: string): GatewayEvent[] => [
  { type: "strategist_tool_call", id, name, args },
  { type: "strategist_tool_result", id, name, status: "ok", summary, cached: true },
];

const SCRIPTS: Record<string, () => GatewayEvent[]> = {
  [SAMPLE_QUESTIONS[0]!]: () => [
    ...call("sample-1", "get_city_playbook", { city: "Guadalajara", country: "MX" }, "7 cards"),
    { type: "strategist_thinking", summary: "Compared fan heat with activation inputs for Guadalajara." },
    ...finish("Guadalajara has moderate fan heat (62) but strong activation (82): sponsor fit is high (Cerro Alto Mezcal 0.91), 38% of in-city fan heat sits in Colonia Americana, and C3 Stage fits the crowd at 0.91. That combination is what the Hidden goldmine verdict means.", 1, 2),
  ],
  [SAMPLE_QUESTIONS[1]!]: () => [
    ...call("sample-1", "qloo_recommend", { target_type: "artist", signal_location: "São Paulo, BR" }, "2 results"),
    ...call("sample-2", "qloo_compare_audiences", { group_a: ["Lumen Vale"], group_b: ["Céu Aberto"] }, "shared taste 0.28"),
    ...finish("Céu Aberto: 0.28 shared taste with Lumen Vale and 0.78 city fit, the best support act in São Paulo.", 2, 3),
  ],
  [SAMPLE_QUESTIONS[2]!]: () => finish("Los Angeles has the fans (fan heat 88) but little to activate (40), so it is a De-risk market: book it only with a sponsor or co-headliner already in hand.", 0, 1),
};

export function sampleStrategistEvents(question: string): GatewayEvent[] {
  const script = SCRIPTS[question];
  if (script) return script();
  return [
    { type: "strategist_error", code: "UNAVAILABLE", message: "The live strategist needs a live run. In the showcase, try a suggested question." },
    { type: "done", summary: {} },
  ];
}

const RANK = ["Mexico City", "Los Angeles", "São Paulo", "Rio de Janeiro", "Austin", "Guadalajara", "Monterrey", "Chicago", "Curitiba", "Belo Horizonte"];
export const SAMPLE_WITHOUT_QLOO: WithoutQloo = {
  status: "ok",
  model: "sample",
  cached: true,
  ranked: RANK.map((name) => ({ name, country: SAMPLE_CITIES.find((c) => c.name === name)!.country })),
};
