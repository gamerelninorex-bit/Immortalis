import { loadConfig } from "./config.ts";
import { preflightA, preflightB, type PreflightReport } from "./preflight.ts";
import { createPhoneServer } from "./server.ts";
import { prepareChat } from "./prepare-chat.ts";

/**
 * The phone bridge's entry point. It reads its configuration once, refuses to start on any problem and never prints a secret.
 *
 *   main.ts                     serve (phase A of the preflight is run first and its findings are logged; they never stop the service)
 *   main.ts preflight [--phase A|B|all] [--verbatim] [--probe]
 *                               the operator's read-only preflight (exit 0 all clear, 1 a defect, 3 busy); the same environment as the service
 */
const config = loadConfig(process.env);
if (!config.ok) {
  process.stderr.write(
    `immortalis-phone: refusing to start\n${config.problems.map((p) => `  - ${p}`).join("\n")}\n`,
  );
  process.exit(2);
}

const show = (r: PreflightReport, sink: (line: string) => void) => {
  for (const f of r.findings) sink(`[${f.severity}] ${f.phase}/${f.id} ${f.message}`);
};

if (process.argv[2] === "prepare-chat") {
  const args = process.argv.slice(3);
  if (args.length !== 2 || args[0] !== "--scenario" || !args[1]) {
    process.stderr.write("usage: main.ts prepare-chat --scenario <owned-seven-key-json-file>\n");
    process.exit(64);
  }
  const prepared = await prepareChat(config.value, args[1]);
  for (const message of prepared.messages) process.stdout.write(`${message}\n`);
  process.exit(prepared.ok ? 0 : 1);
}

if (process.argv[2] === "preflight") {
  const args = process.argv.slice(3);
  const phaseAt = args.indexOf("--phase");
  const phase = phaseAt >= 0 ? (args[phaseAt + 1] ?? "") : "all";
  const bad = args.filter(
    (a, i) =>
      !["--verbatim", "--probe", "--phase"].includes(a) && !(phaseAt >= 0 && i === phaseAt + 1),
  );
  if (!["A", "B", "all"].includes(phase) || bad.length > 0) {
    process.stderr.write("usage: main.ts preflight [--phase A|B|all] [--verbatim] [--probe]\n");
    process.exit(64);
  }
  const opts = { verbatim: args.includes("--verbatim"), probe: args.includes("--probe") };
  const out = (line: string) => process.stdout.write(`${line}\n`);
  let busy = false;
  let failed = false;
  if (phase === "A" || phase === "all") {
    const a = await preflightA(config.value, opts);
    show(a, out);
    failed ||= !a.ok;
  }
  if (phase === "B" || phase === "all") {
    const b = await preflightB(config.value, opts);
    show(b, out);
    busy ||= b.findings.some((f) => f.severity === "BUSY");
    failed ||= b.findings.some((f) => f.severity === "FAIL");
  }
  process.exit(failed ? 1 : busy ? 3 : 0);
}

// the operator's log only: a cause that the player and the assistant are deliberately never told (each distinct line once)
const noted = new Set<string>();
const note = (message: string) => {
  if (noted.has(message)) return;
  noted.add(message);
  process.stderr.write(`immortalis-phone: ${message}\n`);
};
if (config.value.publicUrl !== null) {
  const boot = await preflightA(config.value);
  show(boot, (line) => {
    if (!line.startsWith("[PASS]")) note(`preflight ${line}`);
  });
}
const app = createPhoneServer(config.value, { chat: { note } });
const port = await app.listen();
process.stdout.write(
  `immortalis-phone: listening on ${config.value.bindHost}:${port} (${config.value.transport}); campaign ${config.value.campaignId}\n`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
