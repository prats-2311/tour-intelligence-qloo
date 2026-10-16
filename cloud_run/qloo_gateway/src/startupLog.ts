// Logs the Qloo endpoint the harness will use. URLs only, never credentials.
export function logQlooBaseUrl(env: Record<string, string | undefined>, log: (line: string) => void = console.log): void {
  const base = env.QLOO_BASE_URL;
  const trusted = env.QLOO_TRUSTED_BASE_URL;
  const mismatch = base && base !== trusted ? ` (QLOO_TRUSTED_BASE_URL ${trusted ?? "unset"} does not match; harness will not send credentials)` : "";
  log(`qloo_gateway Qloo base URL: ${base ?? "harness default"}${mismatch}`);
}
