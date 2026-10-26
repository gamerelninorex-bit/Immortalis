// Reconstruct the sanitized artifacts emitted by the exercised A2 integration test.
// Input is a downloaded CI job log; this script never runs or mutates a campaign.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [log, destination] = process.argv.slice(2);
if (!log || !destination)
  throw new Error("usage: extract-a2-evidence.ts <job.log> <output-directory>");
const names = [
  "transcript-accepted",
  "transcript-r5",
  "transcript-resumed",
  "measurements",
  "recovery-measurements",
];
const groups = new Map<string, { total: number; parts: Map<number, string> }>();
for (const match of readFileSync(log, "utf8").matchAll(
  /A2_EVIDENCE ([a-z0-9-]+) (\d+)\/(\d+) ([A-Za-z0-9+/=]+)/g,
)) {
  const name = match[1]!,
    index = Number(match[2]),
    total = Number(match[3]),
    part = match[4]!;
  if (!names.includes(name) || index < 1 || index > total || total > 1000)
    throw new Error("invalid evidence frame");
  const group = groups.get(name) ?? { total, parts: new Map<number, string>() };
  if (group.total !== total || (group.parts.has(index) && group.parts.get(index) !== part))
    throw new Error("conflicting evidence frames");
  group.parts.set(index, part);
  groups.set(name, group);
}
// Validate every complete record before writing anything: a partially exercised test
// cannot be mistaken for the complete due evidence.
const records = names.map((name) => {
  const g = groups.get(name);
  if (!g || g.parts.size !== g.total) throw new Error(`incomplete evidence: ${name}`);
  const encoded = Array.from({ length: g.total }, (_, i) => g.parts.get(i + 1)!).join("");
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  // Also sanitize older exercised frames: no one-time test challenge belongs in
  // the committed evidence, even when its operation has already finished.
  const value = JSON.parse(
    decoded.replace(
      /(?:establish-locality|keep-character|place-character|establish-character-locus|initialize-time|accept-clarification|prepare-collection|declare-closed-setting) [0-9a-f]{12}/g,
      "<human-only challenge>",
    ),
  ) as Record<string, unknown>;
  if (
    !/^[0-9a-f]{40}$/.test(String(value["base"])) ||
    !/^[0-9a-f]{40}$/.test(String(value["head"]))
  )
    throw new Error("missing exact evidence commits");
  return { name, value };
});
mkdirSync(destination, { recursive: true });
for (const { name, value } of records) {
  writeFileSync(join(destination, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
  if (name.startsWith("transcript-")) {
    const entries = value["transcript"];
    if (!Array.isArray(entries) || !entries.every((t) => typeof t === "string"))
      throw new Error("invalid transcript");
    const body = [
      `# A2 exercised ${name.slice("transcript-".length)} conversation`,
      "Scripted authenticated host, scripted test-human and scripted referee; real service/operator/owners. Mechanism evidence only. Human-only challenges/replies and digests are redacted. No actual-client, real-human or genuine AI-interpretation claim.",
      `Base: ${value["base"]}\n\nExecuted commit: ${value["head"]}`,
      ...entries.map((t) => `\`\`\`\`text\n${t}\n\`\`\`\``),
    ].join("\n\n");
    writeFileSync(join(destination, `${name}.md`), `${body}\n`);
  }
}
process.stdout.write(`Extracted ${records.length} complete A2 records.\n`);
