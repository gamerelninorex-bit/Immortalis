import { isIP } from "node:net";

/**
 * The phone bridge's configuration, read ONCE from the environment by `main.ts` and passed in as data. There are no defaults for
 * anything secret and no weak fallback: a missing, short, duplicated or malformed secret makes the service REFUSE TO START. Tokens are
 * never logged, never placed in a URL and never echoed back.
 */
export interface PhoneConfig {
  readonly campaignDir: string;
  readonly campaignId: string;
  readonly operatorDir: string;
  /** the PLAYER lane's secret: whoever holds it can make the player's choices and typed confirmations */
  readonly playerToken: string;
  /** the REFEREE lane's separate secret: whoever holds it can read bound tasks and give readings; it is a different lane, not a role of the player */
  readonly refereeToken: string;
  /** the referee host identities the referee lane may serve (each bound by the operator; at most 8) */
  readonly refereeHostIds: readonly string[];
  readonly bindHost: string;
  readonly port: number;
  /** `proxy`: TLS ends at the platform's edge and every non-health request must say so (`x-forwarded-proto: https`); `insecure-loopback`: plain HTTP on 127.0.0.1 for local development only */
  readonly transport: "proxy" | "insecure-loopback";
  readonly trustProxy: boolean;
  /** where the pasted setting files are written for one command (owner-only; removed afterwards) */
  readonly setupDir: string;
}

export type ConfigResult =
  | { readonly ok: true; readonly value: PhoneConfig }
  | { readonly ok: false; readonly problems: readonly string[] };

const ID = /^[A-Za-z0-9._:-]{1,64}$/;
const TOKEN = /^[\x21-\x7e]{32,256}$/; // printable, no whitespace, 32+ characters
const PATH = /^\/[^\0\n\r]{1,512}$/;

export function loadConfig(env: Readonly<Record<string, string | undefined>>): ConfigResult {
  const problems: string[] = [];
  const need = (name: string): string => {
    const v = env[name];
    if (v === undefined || v === "") problems.push(`${name} is required`);
    return v ?? "";
  };
  const campaignDir = need("IMMORTALIS_CAMPAIGN_DIR");
  const campaignId = need("IMMORTALIS_CAMPAIGN_ID");
  const operatorDir = need("IMMORTALIS_OPERATOR_DIR");
  const playerToken = need("IMMORTALIS_PLAYER_TOKEN");
  const refereeToken = need("IMMORTALIS_REFEREE_TOKEN");
  const hostIds = need("IMMORTALIS_REFEREE_HOST_IDS")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  for (const [name, v] of [
    ["IMMORTALIS_CAMPAIGN_DIR", campaignDir],
    ["IMMORTALIS_OPERATOR_DIR", operatorDir],
  ] as const)
    if (v !== "" && !PATH.test(v)) problems.push(`${name} must be an absolute path`);
  if (campaignId !== "" && !ID.test(campaignId))
    problems.push("IMMORTALIS_CAMPAIGN_ID is not a valid identity");
  if (playerToken !== "" && !TOKEN.test(playerToken))
    problems.push("IMMORTALIS_PLAYER_TOKEN must be 32 to 256 printable characters, no spaces");
  if (refereeToken !== "" && !TOKEN.test(refereeToken))
    problems.push("IMMORTALIS_REFEREE_TOKEN must be 32 to 256 printable characters, no spaces");
  if (playerToken !== "" && playerToken === refereeToken)
    problems.push("the player and referee tokens must differ: they are separate lanes");
  if (hostIds.length === 0 || hostIds.length > 8 || new Set(hostIds).size !== hostIds.length)
    problems.push("IMMORTALIS_REFEREE_HOST_IDS must list 1 to 8 distinct host identities");
  if (hostIds.some((h) => !ID.test(h))) problems.push("a referee host identity is not valid");
  const transportRaw = env["IMMORTALIS_TRANSPORT"] ?? "proxy";
  if (transportRaw !== "proxy" && transportRaw !== "insecure-loopback")
    problems.push("IMMORTALIS_TRANSPORT must be proxy or insecure-loopback");
  const transport = transportRaw === "insecure-loopback" ? "insecure-loopback" : "proxy";
  const bindHost = env["IMMORTALIS_BIND_HOST"] ?? (transport === "proxy" ? "0.0.0.0" : "127.0.0.1");
  if (isIP(bindHost) === 0) problems.push("IMMORTALIS_BIND_HOST must be an IP address");
  if (transport === "insecure-loopback" && bindHost !== "127.0.0.1" && bindHost !== "::1")
    problems.push("plain HTTP is allowed only on a loopback address");
  const portRaw = env["PORT"] ?? "8080";
  const port = /^[0-9]{1,5}$/.test(portRaw) ? Number(portRaw) : -1;
  if (port < 1 || port > 65535) problems.push("PORT is not a valid port");
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      campaignDir,
      campaignId,
      operatorDir,
      playerToken,
      refereeToken,
      refereeHostIds: hostIds,
      bindHost,
      port,
      transport,
      trustProxy: transport === "proxy" && env["IMMORTALIS_TRUST_PROXY"] !== "0",
      setupDir: env["IMMORTALIS_SETUP_DIR"] ?? `${operatorDir}/phone-setup`,
    },
  };
}
