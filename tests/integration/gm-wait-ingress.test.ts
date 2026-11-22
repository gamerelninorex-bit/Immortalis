/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw refusal details */
// F-014B A1-2a (BLUE v6.2 pinned brief, 22 Nov 2026): the authenticated configured-GM waiting INGRESS, at the operator boundary. T1 MECHANISM ONLY.
//
// Every campaign here is built only by the shipped commands (tests/support/observation.ts: an original character authored, kept, bound and
// placed through the existing setup path, with canonical time established by the Temporal owner). The scripted referee host there is
// PLUMBING ONLY. Nothing below asserts a verdict as an upstream fact: the host enrollment is made by the shipped bind action, the verdict is
// whatever `verifyGmWaitIngress` returns, and the one source of the character is the existing keep and binding. No test mutates a live campaign.
//
// The brief's falsifiers are named in the test titles: P01-P03 positive, A03-A16 negative at this boundary (A01, A02, A11 grant cases and the
// session/transport cases live in gm-wait-tool.test.ts, where the real OAuth ledger and MCP transport are).
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { nodeFs, type FsOps } from "@immortalis/engine";
import {
  bindGmWaitClient,
  bindGmWaitHost,
  gmWaitDir,
  gmWaitSecretPath,
  readGmWaitSecretFile,
} from "../../packages/operator/src/gm-wait-exchange.ts";
import { runGmWaitBindCli } from "../../packages/operator/src/gm-wait-cli.ts";
import { parseGmWaitRequest } from "../../packages/contracts/src/temporal-gm-wait.ts";
import {
  GM_WAIT_REQUEST_REFUSED,
  GM_WAIT_UNAVAILABLE,
  verifyGmWaitIngress as verifyIngress,
  type GmWaitRequestParser,
  type GmWaitTransport,
} from "../../packages/operator/src/gm-wait-ingress.ts";
import { observeRequestSecretPath } from "../../packages/operator/src/observe-request-exchange.ts";
import { runObserveRequestBindCli } from "../../packages/operator/src/observe-request-cli.ts";
import { LOCALITY_CAMPAIGN, type LocalityDirs } from "../support/locality.ts";
import { BASIS, PC_ID, observationCampaign } from "../support/observation.ts";
import { copyDirs } from "../support/player-view.ts";
import { treeOf } from "../support/tree.ts";

vi.setConfig({ testTimeout: 120_000 });

/** The ingress with the UNCHANGED strict B0 parser, exactly as the phone service hands it in. */
const verifyGmWaitIngress = (
  p: Parameters<typeof verifyIngress>[0],
  t: GmWaitTransport,
  r: unknown,
  parse: GmWaitRequestParser = parseGmWaitRequest,
) => verifyIngress(p, t, r, parse);

const HOST = "gm-wait-1";
const UID = process.getuid!();
const TRANSPORT: GmWaitTransport = {
  client: "client-1",
  grant: "grant-1",
  session: "session-1",
  requestId: "1",
};
const SHA = "a".repeat(64);

/** "Bob waits two minutes": INITIAL, 2 minutes = 120 canonical seconds from the observed basis. No `context`: the trusted side states it. */
const initial = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  transaction_id: "gm-wait-tx-1",
  cause: "cause-gm-wait-1",
  trigger: { kind: "GM_INTERPRETED_PC_WAIT", ref: "ref-gm-wait-1" },
  continues: null,
  requested: { target: { unit: BASIS.unit, value: BASIS.value + 120 }, condition: null },
  publication: { basis: "basis-label-1", secrecy: "secrecy-label-1" },
  gm_wait: {
    phase: "INITIAL",
    duration_value: 2,
    duration_unit: "minute",
    observed_basis: BASIS,
    interpretation_mode: "GM_ROUTINE_ESTIMATE",
    conversion_rule_version: "SI_SUBDAY_V1",
    catalogue_sha256: SHA,
  },
  ...over,
});
/** a copy of `value` without the named member (the one omission the specimen is about) */
const without = (value: object, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));
const continuation = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  transaction_id: "gm-wait-tx-2",
  cause: "cause-gm-wait-2",
  trigger: { kind: "GM_INTERPRETED_PC_WAIT", ref: "ref-gm-wait-2" },
  continues: "gm-wait-tx-1",
  requested: { target: { unit: BASIS.unit, value: BASIS.value + 240 }, condition: null },
  publication: { basis: "basis-label-1", secrecy: "secrecy-label-1" },
  gm_wait: { phase: "CONTINUATION", from_transaction: "gm-wait-tx-1" },
  ...over,
});

let base: LocalityDirs;
beforeAll(async () => {
  base = (await observationCampaign()).dirs;
}, 240_000);

/** An independent copy of the campaign, with the GM waiting host enrolled by the SHIPPED bind action. */
async function enrolled(hostId = HOST) {
  const dirs = copyDirs(base);
  const out: string[] = [];
  const code = await runGmWaitBindCli(
    [
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
      "--host-id",
      hostId,
      "--operator-dir",
      dirs.operatorDir,
    ],
    { out: (l) => out.push(l), error: (l) => out.push(l) },
  );
  expect(code, out.join("\n")).toBe(0);
  // the operator authorizes the OAuth client that will call this host (BLUE A1R-01): without one the host is unusable
  const authorized = await bindGmWaitClient({
    stateDir: dirs.operatorDir,
    campaignId: LOCALITY_CAMPAIGN,
    operatorUid: UID,
    hostId,
    client: TRANSPORT.client,
    mode: "add",
  });
  expect(authorized.ok).toBe(true);
  const secretFile = gmWaitSecretPath(
    { stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN },
    hostId,
  );
  return { dirs, secretFile, secret: readGmWaitSecretFile(secretFile)! };
}

const params = (
  dirs: LocalityDirs,
  secret: string,
  over: Partial<Parameters<typeof verifyGmWaitIngress>[0]> = {},
) => ({
  campaignDir: dirs.campaignDir,
  campaignId: LOCALITY_CAMPAIGN,
  stateDir: dirs.operatorDir,
  hostId: HOST,
  secret,
  ...over,
});

/** Everything on disk that is the campaign or the operator's retained state, before and after: the zero-write witness. */
const disk = (dirs: LocalityDirs) => ({
  campaign: treeOf(dirs.campaignDir),
  operator: treeOf(dirs.operatorDir),
});

const UNAVAILABLE = {
  code: GM_WAIT_UNAVAILABLE,
  message: "no GM waiting readiness can be established",
};

describe("[A1-2a] [mechanism only] the enrolled GM host, a bound character and a strict request: noncanonical readiness", () => {
  it("[A1-2a] [mechanism only] P01 an enrolled host, the kept and placed character and a strict INITIAL request yield readiness, and ZERO bytes of the campaign or the retained state change", async () => {
    const { dirs, secret } = await enrolled();
    const before = disk(dirs);
    const r = await verifyGmWaitIngress(params(dirs, secret), TRANSPORT, initial());
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    const v = r.value;
    expect(v.status).toBe("GM_WAIT_REQUEST_READY");
    // BLUE Q2: the GM-supplied transaction identity, cause and publication are unqualified syntax, and the verdict says so
    expect(v.message).toMatch(/unqualified syntax, not a canonical identity/);
    expect(v.canonical).toBe(false);
    expect(v.effects).toBe("NONE");
    // the trusted side stated the one existing GM pair; the host did not
    expect(v.request.context).toEqual({
      role: "role.gm",
      permission: "permission.rule.adjudicate",
    });
    expect(v.source).toMatchObject({
      operation: "GM_INTERPRETED_PC_WAIT",
      role: "role.gm",
      permission: "permission.rule.adjudicate",
      campaign_id: LOCALITY_CAMPAIGN,
      pc_id: PC_ID,
      host_id: HOST,
    });
    expect(v.source.binding.version).toBeGreaterThan(0);
    // the verdict names what it does NOT establish
    expect(v.unqualified).toEqual(
      expect.arrayContaining([
        "catalogue_sha256",
        "continuation_link",
        "transaction_identity",
        "temporal_admission",
        "player_choice",
      ]),
    );
    expect(disk(dirs)).toEqual(before);
  });

  it("[A1-2a] [mechanism only] P01 a strict CONTINUATION is accepted as a SYNTAX only and is not adjudicated; the schemas are not extended", async () => {
    const { dirs, secret } = await enrolled();
    const before = disk(dirs);
    const r = await verifyGmWaitIngress(params(dirs, secret), TRANSPORT, continuation());
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.value.request.gm_wait).toEqual({
      phase: "CONTINUATION",
      from_transaction: "gm-wait-tx-1",
    });
    expect(r.value.unqualified).toContain("continuation_link");
    expect(disk(dirs)).toEqual(before);
  });

  it("[A1-2a] [mechanism only] A12 the only write-class file operations are the package's own single-writer lock, taken and released; the retained-state seam sees none, and the read cost is a bounded constant", async () => {
    const { dirs, secret } = await enrolled();
    const WRITE_OPS = [
      "mkdirp",
      "writeFileDurable",
      "appendDurable",
      "truncate",
      "remove",
      "createExclusive",
    ];
    /** records (operation, path) of every call through a seam */
    const seam = () => {
      const calls: string[] = [];
      const wrapped: Record<string, unknown> = {};
      for (const [name, fn] of Object.entries(nodeFs))
        wrapped[name] = (...args: unknown[]) => {
          calls.push(`${name} ${String(args[0])}`);
          return (fn as (...a: unknown[]) => unknown).apply(nodeFs, args);
        };
      return { fs: wrapped as unknown as FsOps, calls };
    };
    const count = async () => {
      const campaign = seam();
      const ledger = seam();
      const r = await verifyGmWaitIngress(
        params(dirs, secret, { campaignFs: campaign.fs, ledgerFs: ledger.fs }),
        TRANSPORT,
        initial(),
      );
      expect(r.ok).toBe(true);
      return { campaign: campaign.calls, ledger: ledger.calls };
    };
    const first = await count();
    const writes = (calls: string[]) => calls.filter((c) => WRITE_OPS.includes(c.split(" ")[0]!));
    expect(writes(first.ledger)).toEqual([]);
    // the open of the package takes and releases its single-writer lock (the boundary every read transport already rests on): nothing else
    const lock = join(dirs.campaignDir, "LOCK");
    expect(writes(first.campaign).map((c) => c.replace(/claim\.[0-9a-f-]+/, "claim.<id>"))).toEqual(
      [
        `createExclusive ${lock}`,
        `createExclusive ${lock}.claim.<id>`,
        `remove ${lock}`,
        `remove ${lock}.claim.<id>`,
      ],
    );
    // the same call again costs exactly the same operations: no accumulation, no retained state of its own
    const second = await count();
    const shape = (c: { campaign: string[]; ledger: string[] }) => ({
      campaign: c.campaign.map((x) => x.replace(/claim\.[0-9a-f-]+/, "claim.<id>")),
      ledger: c.ledger,
    });
    expect(shape(second)).toEqual(shape(first));
    expect(first.campaign.length).toBeGreaterThan(0);
    expect(first.ledger.length).toBeGreaterThan(0);
  });

  it("[A1-2a] [mechanism only] P03 the exact same request is re-read as often as asked: the same verdict, no second commit, because none was made", async () => {
    const { dirs, secret } = await enrolled();
    const before = disk(dirs);
    const first = await verifyGmWaitIngress(params(dirs, secret), TRANSPORT, initial());
    const again = await verifyGmWaitIngress(params(dirs, secret), TRANSPORT, initial());
    const other = await verifyGmWaitIngress(
      params(dirs, secret),
      { ...TRANSPORT, session: "session-2", requestId: "9" },
      initial(),
    );
    for (const r of [first, again, other]) expect(r.ok).toBe(true);
    if (!first.ok || !again.ok || !other.ok) return;
    expect(again.value).toEqual(first.value);
    // A15: the same request in an unrelated session is its own read: same request digest, a different transport reference, no state kept
    expect(other.value.request_sha256).toBe(first.value.request_sha256);
    expect(other.value.transport_ref_sha256).not.toBe(first.value.transport_ref_sha256);
    expect(disk(dirs)).toEqual(before);
  });

  it("[A1-2a] [mechanism only] P02 a sparse ordinary wait needs one request and no micro-detail: only the interpretation the GM made is supplied", async () => {
    const { dirs, secret } = await enrolled();
    // "Bob waits two minutes and looks around": the GM supplies the whole number, the unit and its mode; no eye, posture, direction or step
    const request = initial();
    expect(Object.keys(request).sort()).toEqual(
      [
        "cause",
        "continues",
        "gm_wait",
        "publication",
        "requested",
        "transaction_id",
        "trigger",
      ].sort(),
    );
    const r = await verifyGmWaitIngress(params(dirs, secret), TRANSPORT, request);
    expect(r.ok).toBe(true);
    // a material constraint is not smoothed over by the ingress: a duration that is not the SI derivation of the observed basis refuses
    const bad = await verifyGmWaitIngress(
      params(dirs, secret),
      TRANSPORT,
      initial({
        requested: { target: { unit: BASIS.unit, value: BASIS.value + 121 }, condition: null },
      }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe(GM_WAIT_REQUEST_REFUSED);
  });
});

describe("[A1-2a] [mechanism only] A03-A16 refusals at the operator boundary, each without a single byte written", () => {
  const refuses = async (
    name: string,
    run: (e: Awaited<ReturnType<typeof enrolled>>) => Promise<{ ok: boolean; error?: any }>,
    expected: "UNAVAILABLE" | "REFUSED",
    setup?: (e: Awaited<ReturnType<typeof enrolled>>) => Promise<void> | void,
  ) => {
    const e = await enrolled();
    // the operator's own arrangement of the case happens BEFORE the snapshot: only the ingress's call is held to zero writes
    await setup?.(e);
    const before = disk(e.dirs);
    const r = await run(e);
    expect(r.ok, name).toBe(false);
    if (expected === "UNAVAILABLE") expect(r.error, name).toEqual(UNAVAILABLE);
    else expect(r.error.code, name).toBe(GM_WAIT_REQUEST_REFUSED);
    expect(disk(e.dirs), `${name}: no write`).toEqual(before);
    return r;
  };

  it("[A1-2a] [mechanism only] A03 a referee host with no waiting enrollment, a wrong secret and an unknown host are the one opaque refusal", async () => {
    await refuses(
      "referee host id",
      (e) =>
        verifyGmWaitIngress(params(e.dirs, e.secret, { hostId: "gm-scene" }), TRANSPORT, initial()),
      "UNAVAILABLE",
    );
    await refuses(
      "wrong secret",
      (e) => verifyGmWaitIngress(params(e.dirs, "0".repeat(64)), TRANSPORT, initial()),
      "UNAVAILABLE",
    );
    await refuses(
      "empty secret",
      (e) => verifyGmWaitIngress(params(e.dirs, ""), TRANSPORT, initial()),
      "UNAVAILABLE",
    );
    // another lane's real credential opens nothing here: a bound observation-request host holding the same host identity
    let other = "";
    await refuses(
      "another lane's secret",
      (e) => verifyGmWaitIngress(params(e.dirs, other), TRANSPORT, initial()),
      "UNAVAILABLE",
      async (e) => {
        const out: string[] = [];
        const code = await runObserveRequestBindCli(
          [
            "--campaign",
            e.dirs.campaignDir,
            "--campaign-id",
            LOCALITY_CAMPAIGN,
            "--host-id",
            HOST,
            "--operator-dir",
            e.dirs.operatorDir,
          ],
          { out: (l) => out.push(l) },
        );
        expect(code).toBe(0);
        other = readFileSync(
          observeRequestSecretPath(
            { stateDir: e.dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN },
            HOST,
          ),
          "utf8",
        ).trim();
        expect(other).not.toBe(e.secret);
      },
    );
  });

  it("[A1-2a] [mechanism only] A04 a model-supplied role, permission, context, host, campaign or character is an over-claim: refused, never silently overwritten", async () => {
    for (const forged of [
      { context: { role: "role.gm", permission: "permission.rule.adjudicate" } },
      { context: { role: "role.player", permission: "permission.player_choice.commit" } },
      { role: "role.gm" },
      { permission: "permission.rule.adjudicate" },
      { host_id: "gm-scene" },
      { campaign_id: "campaign-other" },
      { pc_id: "pc-other" },
      { client: "client-x", grant: "grant-x", session: "session-x" },
    ]) {
      const r = await refuses(
        `over-claim ${Object.keys(forged).join(",")}`,
        (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, initial(forged)),
        "REFUSED",
      );
      expect((r as any).error.details.reason).toBe("OVERCLAIM");
    }
  });

  it("[A1-2a] [mechanism only] A05 a character that is not the canonical operative one (replaced, stale or never kept) is the one opaque refusal", async () => {
    const configOf = (e: Awaited<ReturnType<typeof enrolled>>) =>
      join(
        gmWaitDir({ stateDir: e.dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
        "config.json",
      );
    // the enrollment names a character that canon does not hold as the operative one: the proof of the character fails
    await refuses(
      "enrollment names another pc",
      (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, initial()),
      "UNAVAILABLE",
      (e) => {
        const text = readFileSync(configOf(e), "utf8");
        expect(text).toContain(PC_ID);
        writeFileSync(configOf(e), text.replace(PC_ID, "pc-replaced"));
        chmodSync(configOf(e), 0o600);
      },
    );
    // the operator's trusted bind function, handed a character that was never kept, binds only what it is handed: canon still refuses
    let secret = "";
    await refuses(
      "bind of a never-kept character",
      (e) =>
        verifyGmWaitIngress(params(e.dirs, secret, { hostId: "gm-wait-2" }), TRANSPORT, initial()),
      "UNAVAILABLE",
      async (e) => {
        const bound = await bindGmWaitHost({
          stateDir: e.dirs.operatorDir,
          campaignId: LOCALITY_CAMPAIGN,
          operatorUid: UID,
          hostId: "gm-wait-2",
          pcId: "pc-never-kept",
        });
        expect(bound.ok).toBe(true);
        secret = readGmWaitSecretFile(
          gmWaitSecretPath(
            { stateDir: e.dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN },
            "gm-wait-2",
          ),
        )!;
      },
    );
  });

  it("[A1-2a] [mechanism only] A06 another campaign or another operator's binding is the one opaque refusal", async () => {
    await refuses(
      "wrong campaign id",
      (e) =>
        verifyGmWaitIngress(
          params(e.dirs, e.secret, { campaignId: "campaign-other" }),
          TRANSPORT,
          initial(),
        ),
      "UNAVAILABLE",
    );
    await refuses(
      "config of another operator",
      (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, initial()),
      "UNAVAILABLE",
      (e) => {
        const path = join(
          gmWaitDir({ stateDir: e.dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
          "config.json",
        );
        writeFileSync(
          path,
          readFileSync(path, "utf8").replace(
            `"operator_uid": ${UID}`,
            `"operator_uid": ${UID + 1}`,
          ),
        );
        chmodSync(path, 0o600);
      },
    );
  });

  it("[A1-2a] [mechanism only] A07 mixed player and GM origin: a player trigger kind, an empty or reused trigger and a player context are refused", async () => {
    for (const trigger of [
      { kind: "player-advance-choice", ref: "ref-x" },
      { kind: "operator-progression-choice", ref: "ref-x" },
      { kind: "gm_interpreted_pc_wait", ref: "ref-x" },
      { kind: "GM_INTERPRETED_PC_WAIT" },
    ])
      await refuses(
        `trigger ${JSON.stringify(trigger)}`,
        (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, initial({ trigger })),
        "REFUSED",
      );
    await refuses(
      "a player context",
      (e) =>
        verifyGmWaitIngress(
          params(e.dirs, e.secret),
          TRANSPORT,
          initial({
            context: { role: "role.player", permission: "permission.player_choice.commit" },
          }),
        ),
      "REFUSED",
    );
  });

  it("[A1-2a] [mechanism only] A08 a malformed trigger, an extra B0 field, a missing or foreign member and INITIAL/CONTINUATION confusion are refused with the B0 reason", async () => {
    const gm = (over: Record<string, unknown>) => ({ ...(initial().gm_wait as object), ...over });
    const specimens: Record<string, Record<string, unknown>> = {
      "an extra top-level field": initial({ gm_override: true }),
      "an extra INITIAL member": initial({ gm_wait: gm({ evaluator_version: 1 }) }),
      "a CONTINUATION member on an INITIAL": initial({
        gm_wait: gm({ from_transaction: "gm-wait-tx-0" }),
      }),
      "an INITIAL member on a CONTINUATION": continuation({
        gm_wait: { phase: "CONTINUATION", from_transaction: "gm-wait-tx-1", duration_value: 2 },
      }),
      "a CONTINUATION whose continues differs": continuation({ continues: "gm-wait-tx-9" }),
      "a CONTINUATION that is its own held transaction": continuation({
        transaction_id: "gm-wait-tx-1",
      }),
      "an INITIAL that continues": initial({ continues: "gm-wait-tx-0" }),
      "a third phase": initial({ gm_wait: { phase: "RESUME" } }),
      "a plural unit": initial({ gm_wait: gm({ duration_unit: "minutes" }) }),
      "a zero duration": initial({ gm_wait: gm({ duration_value: 0 }) }),
      "a fractional duration": initial({ gm_wait: gm({ duration_value: 1.5 }) }),
      "a target that is not the derivation": initial({
        requested: { target: BASIS, condition: null },
      }),
      "a non-null condition": initial({
        requested: { target: { unit: BASIS.unit, value: BASIS.value + 120 }, condition: "x" },
      }),
      "a missing digest": initial({
        gm_wait: without(gm({}), "catalogue_sha256"),
      }),
      "a missing gm_wait": without(initial(), "gm_wait"),
    };
    for (const [name, specimen] of Object.entries(specimens)) {
      const r = await refuses(
        name,
        (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, specimen),
        "REFUSED",
      );
      expect((r as any).error.details.reason, name).toBe("INVALID_B0_REQUEST");
    }
    for (const notAnObject of [null, "wait", 7, [], undefined]) {
      const r = await refuses(
        `not an object: ${JSON.stringify(notAnObject)}`,
        (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, notAnObject),
        "REFUSED",
      );
      expect((r as any).error.details.reason).toBe("NOT_AN_OBJECT");
    }
    const huge = initial({ cause: "c".repeat(9000) });
    const r = await refuses(
      "oversized",
      (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, huge),
      "REFUSED",
    );
    expect((r as any).error.details.reason).toBe("TOO_LARGE");
  });

  it("[A1-2a] [mechanism only] A09 a genuine enrolled GM label cannot carry setup Input or an original-message claim: such members are over-claims and nothing is attested", async () => {
    for (const claim of [
      { original_message: "Bob waits two minutes" },
      { original_text: "Bob waits two minutes" },
      { setup_input: { kind: "CORE_V9" } },
      { attestation: "ORIGINAL_MESSAGE_VERIFIED" },
    ]) {
      const r = await refuses(
        `claim ${Object.keys(claim)[0]}`,
        (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, initial(claim)),
        "REFUSED",
      );
      expect((r as any).error.details.reason).toBe("OVERCLAIM");
    }
    // and a ready verdict attests no words, no setup input and no human principal
    const { dirs, secret } = await enrolled();
    const ready = await verifyGmWaitIngress(params(dirs, secret), TRANSPORT, initial());
    expect(JSON.stringify(ready)).not.toMatch(
      /ORIGINAL_MESSAGE_VERIFIED|PLAYER_AUTHORED|setup_input|attestation/,
    );
  });

  it("[A1-2a] [mechanism only] A10 a new consequential player decision is not a member of the request: any such member is refused, so the GM cannot author a player choice through the ingress", async () => {
    for (const choice of [
      { player_choice: "accept shelter" },
      { abandon_wait: true },
      { action: { kind: "attack" } },
      { consent: true },
    ])
      await refuses(
        `choice ${Object.keys(choice)[0]}`,
        (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, initial(choice)),
        "REFUSED",
      );
  });

  it("[A1-2a] [mechanism only] A11 an enrollment that changes between the first proof and the handoff is no authorization", async () => {
    const e = await enrolled();
    const before = disk(e.dirs);
    // a ledger seam that lets the first read of the enrollment through and removes the host's authorization before the second
    let reads = 0;
    const flipping: FsOps = {
      ...nodeFs,
      readFile: async (path: string) => {
        const data = await nodeFs.readFile(path);
        if (/gm-wait-[0-9a-f]{32}\/config\.json$/.test(path)) {
          reads += 1;
          if (reads === 2) {
            const rewritten = JSON.parse(data.toString("utf8"));
            rewritten.hosts = [];
            return Buffer.from(JSON.stringify(rewritten));
          }
        }
        return data;
      },
    };
    const r = await verifyGmWaitIngress(
      params(e.dirs, e.secret, { ledgerFs: flipping }),
      TRANSPORT,
      initial(),
    );
    expect(reads).toBe(2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual(UNAVAILABLE);
    expect(disk(e.dirs)).toEqual(before);
  });

  it("[A1-2a] [mechanism only] A1R-01 a host is usable only by the OAuth client the operator authorized for it: another client, an unauthorized host, a withdrawn client and a tampered binding are the one opaque refusal", async () => {
    // another valid client presenting the very same host and secret
    await refuses(
      "another client",
      (e) =>
        verifyGmWaitIngress(
          params(e.dirs, e.secret),
          { ...TRANSPORT, client: "client-B" },
          initial(),
        ),
      "UNAVAILABLE",
    );
    // a client authorized for ANOTHER enrolled host only
    let second = "";
    await refuses(
      "client authorized for another host",
      (e) =>
        verifyGmWaitIngress(params(e.dirs, second, { hostId: "gm-wait-2" }), TRANSPORT, initial()),
      "UNAVAILABLE",
      async (e) => {
        const bound = await bindGmWaitHost({
          stateDir: e.dirs.operatorDir,
          campaignId: LOCALITY_CAMPAIGN,
          operatorUid: UID,
          hostId: "gm-wait-2",
          pcId: PC_ID,
        });
        expect(bound.ok).toBe(true);
        second = readGmWaitSecretFile(
          gmWaitSecretPath(
            { stateDir: e.dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN },
            "gm-wait-2",
          ),
        )!;
        await bindGmWaitClient({
          stateDir: e.dirs.operatorDir,
          campaignId: LOCALITY_CAMPAIGN,
          operatorUid: UID,
          hostId: HOST,
          client: "client-B",
          mode: "add",
        });
      },
    );
    // an enrolled host with NO authorized client at all is unusable (default deny)
    await refuses(
      "no authorized client",
      (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, initial()),
      "UNAVAILABLE",
      async (e) => {
        await bindGmWaitClient({
          stateDir: e.dirs.operatorDir,
          campaignId: LOCALITY_CAMPAIGN,
          operatorUid: UID,
          hostId: HOST,
          client: TRANSPORT.client,
          mode: "remove",
        });
      },
    );
    // the operator's binding names the client by digest only; a file of another operator or campaign is no binding
    for (const [name, tamper] of [
      [
        "another operator",
        (t: string) => t.replace(`"operator_uid": ${UID}`, `"operator_uid": ${UID + 1}`),
      ],
      ["another campaign", (t: string) => t.replace(LOCALITY_CAMPAIGN, "campaign-other")],
      ["not JSON", () => "{"],
    ] as const)
      await refuses(
        `client binding of ${name}`,
        (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, initial()),
        "UNAVAILABLE",
        (e) => {
          const path = join(
            gmWaitDir({ stateDir: e.dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
            "clients.json",
          );
          const text = readFileSync(path, "utf8");
          expect(text).not.toContain(TRANSPORT.client);
          expect(text).toMatch(/"client_sha256s"/);
          writeFileSync(path, tamper(text));
          chmodSync(path, 0o600);
        },
      );
    // the authorized client itself still passes, and a second authorized client is independent of the first
    const { dirs, secret } = await enrolled();
    await bindGmWaitClient({
      stateDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: UID,
      hostId: HOST,
      client: "client-B",
      mode: "add",
    });
    for (const client of [TRANSPORT.client, "client-B"])
      expect(
        (await verifyGmWaitIngress(params(dirs, secret), { ...TRANSPORT, client }, initial())).ok,
      ).toBe(true);
    expect(
      (
        await verifyGmWaitIngress(
          params(dirs, secret),
          { ...TRANSPORT, client: "client-C" },
          initial(),
        )
      ).ok,
    ).toBe(false);
    // a client is authorized per host, at most four per host, and only for a host that is enrolled
    const add = (client: string) =>
      bindGmWaitClient({
        stateDir: dirs.operatorDir,
        campaignId: LOCALITY_CAMPAIGN,
        operatorUid: UID,
        hostId: HOST,
        client,
        mode: "add",
      });
    // the authorized client and client-B are two; two more fill the four, and a fifth is refused without changing the file
    expect((await add("c1")).ok).toBe(true);
    expect((await add("c2")).ok).toBe(true);
    const full = readFileSync(
      join(
        gmWaitDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
        "clients.json",
      ),
      "utf8",
    );
    const fifth = await add("c3");
    expect(fifth.ok).toBe(false);
    expect(
      readFileSync(
        join(
          gmWaitDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
          "clients.json",
        ),
        "utf8",
      ),
    ).toBe(full);
    const unenrolled = await bindGmWaitClient({
      stateDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: UID,
      hostId: "gm-unknown",
      client: "c1",
      mode: "add",
    });
    expect(unenrolled.ok).toBe(false);
  });

  it("[A1-2a] [mechanism only] A1R-01 the client authorization changing between the first proof and the handoff is no authorization", async () => {
    const e = await enrolled();
    const before = disk(e.dirs);
    let reads = 0;
    const flipping: FsOps = {
      ...nodeFs,
      readFile: async (path: string) => {
        const data = await nodeFs.readFile(path);
        if (/gm-wait-[0-9a-f]{32}\/clients\.json$/.test(path)) {
          reads += 1;
          if (reads === 2)
            return Buffer.from(JSON.stringify({ ...JSON.parse(data.toString("utf8")), hosts: [] }));
        }
        return data;
      },
    };
    const r = await verifyGmWaitIngress(
      params(e.dirs, e.secret, { ledgerFs: flipping }),
      TRANSPORT,
      initial(),
    );
    expect(reads).toBe(2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual(UNAVAILABLE);
    expect(disk(e.dirs)).toEqual(before);
  });

  it("[A1-2a] [mechanism only] A14 an absent or unknown original owner setup or binding yields no enrollment and no readiness", async () => {
    // no kept character: the shipped bind action refuses and writes nothing
    const dirs = copyDirs(base);
    for (const f of Object.keys(treeOf(dirs.operatorDir)).filter((n) =>
      n.startsWith("character-keep-"),
    ))
      rmSync(join(dirs.operatorDir, f));
    const out: string[] = [];
    const code = await runGmWaitBindCli(
      [
        "--campaign",
        dirs.campaignDir,
        "--campaign-id",
        LOCALITY_CAMPAIGN,
        "--host-id",
        HOST,
        "--operator-dir",
        dirs.operatorDir,
      ],
      { out: (l) => out.push(l) },
    );
    expect(code).toBe(69);
    expect(out.join("\n")).toContain("GM_WAIT_HOST_NOT_ENROLLED");
    expect(Object.keys(treeOf(dirs.operatorDir)).some((n) => n.startsWith("gm-wait-"))).toBe(false);
    // an enrollment made while the keep existed, then the keep gone: the proof of the character fails closed
    const { dirs: later, secret } = await enrolled();
    for (const f of Object.keys(treeOf(later.operatorDir)).filter((n) =>
      n.startsWith("character-keep-"),
    ))
      rmSync(join(later.operatorDir, f));
    const before = disk(later);
    const r = await verifyGmWaitIngress(params(later, secret), TRANSPORT, initial());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual(UNAVAILABLE);
    expect(disk(later)).toEqual(before);
  });

  it("[A1-2a] [mechanism only] a permissive parser handed in cannot widen the verdict: a player context, another trigger or a third phase is still the one opaque refusal", async () => {
    const lax =
      (over: Record<string, unknown>): GmWaitRequestParser =>
      (raw) => {
        const real = parseGmWaitRequest(raw);
        if (!real.ok) throw new Error("the specimen itself must be a valid request");
        return { ok: true, value: { ...real.value, ...over } as never };
      };
    for (const over of [
      { context: { role: "role.player", permission: "permission.player_choice.commit" } },
      { context: { role: "role.player", permission: "permission.rule.adjudicate" } },
      { context: { role: "role.gm", permission: "permission.scene_event.propose" } },
      { trigger: { kind: "player-advance-choice", ref: "ref-x" } },
      { gm_wait: { phase: "RESUME" } },
    ])
      await refuses(
        `lax parser ${Object.keys(over)[0]}`,
        (e) => verifyGmWaitIngress(params(e.dirs, e.secret), TRANSPORT, initial(), lax(over)),
        "UNAVAILABLE",
      );
  });

  it("[A1-2a] [mechanism only] A13 the verdict discloses no secret, no retained keep, no binding internals and no sealed provenance", async () => {
    const { dirs, secret } = await enrolled();
    const r = await verifyGmWaitIngress(params(dirs, secret), TRANSPORT, initial());
    expect(r.ok).toBe(true);
    const text = JSON.stringify(r);
    expect(text).not.toContain(secret);
    expect(text).not.toContain(dirs.campaignDir);
    expect(text).not.toContain(dirs.operatorDir);
    expect(text).not.toMatch(/secret_sha256|seed|keep|provenance|journal|state_sha256/);
    expect(text).not.toContain(TRANSPORT.grant);
    expect(text).not.toContain(TRANSPORT.session);
    expect(text).not.toContain(TRANSPORT.client);
    if (r.ok)
      expect(Object.keys(r.value).sort()).toEqual(
        [
          "canonical",
          "effects",
          "message",
          "request",
          "request_sha256",
          "source",
          "status",
          "transport_ref_sha256",
          "unqualified",
        ].sort(),
      );
  });

  it("[A1-2a] [mechanism only] a malformed transport identity (an empty or oversized client, grant, session or request) is the one opaque refusal", async () => {
    for (const bad of [
      { ...TRANSPORT, client: "" },
      { ...TRANSPORT, grant: "" },
      { ...TRANSPORT, session: "s".repeat(600) },
      { ...TRANSPORT, requestId: "" },
    ])
      await refuses(
        `transport ${JSON.stringify(bad).slice(0, 40)}`,
        (e) => verifyGmWaitIngress(params(e.dirs, e.secret), bad, initial()),
        "UNAVAILABLE",
      );
  });
});
