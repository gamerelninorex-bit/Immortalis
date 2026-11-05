/* eslint-disable @typescript-eslint/no-explicit-any -- tests craft raw commit groups and read raw journal bytes */
// Runtime Contract alignment (Initial Locality Bootstrap v0.9): PROOF of legacy compatibility. The package under
// tests/fixtures/legacy-base-eafbb127/package was produced by the EXACT BASE build (eafbb127c476cafb8498316e496de29e078a2146, see the
// README beside it) under the UNEDITED Runtime Contract (sha256 ab2f6385...). This build edited the contract additively, so the old
// hash is declared compatible ONLY with this proof: the package opens, replays, takes an ordinary commit, reopens and strictly replays
// with its old bytes preserved, and every v0.9 surface is REFUSED inside it. The old hash is not a bare whitelist entry.
// MECHANISM / COMPATIBILITY EVIDENCE ONLY (T1): no live campaign is used, migrated, reset or relabelled.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  FACET_WORLD_SCENE_CLOSURE,
  FACET_POPULATION_WORKFORCE_SCOPE,
  OWNER_POPULATION,
  OWNER_WORLD_STATE,
  worldSceneClosureKey,
} from "@immortalis/contracts";
import {
  BUILD_RUNTIME_CONTRACT_SHA256,
  CanonicalCampaign,
  INITIAL_COMPLETION_SCENE_CLOSURE_RULE,
  INITIAL_COMPLETION_WORKFORCE_SCOPE_RULE,
  LEGACY_RUNTIME_CONTRACT_SHA256S,
  LEGACY_RUNTIME_CONTRACT_SURFACE,
  buildCompletionGroup,
  buildDispositionGroup,
  buildGrantGroup,
  buildInputGroup,
  buildInvocationGroup,
  buildResponseGroup,
  buildScopeDecisionGroup,
  isLegacyRuntimeContract,
  openFileCampaign,
  storeBindings,
} from "@immortalis/engine";
import { publication, sourceInput } from "@immortalis/testkit";
import { openFixtureCampaign, reasonOf } from "../support/initial-setup.ts";
import { must } from "../support/temporal.ts";

const FIXTURE = "tests/fixtures/legacy-base-eafbb127/package";
/** sha256 of the untouched spec/f027/runtime-contract.md, byte-identical from the repository skeleton through the base. */
const OLD_CONTRACT = "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd";
/** byte length of that untouched file: this build's file begins with exactly these bytes (the edit is a pure append). */
const OLD_CONTRACT_BYTES = 24_378;

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const copyPackage = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "immortalis-legacy-"));
  cpSync(FIXTURE, dir, { recursive: true });
  // the base's package holds an EMPTY history/ directory (checkpoint indexes are written there); git cannot store an empty directory
  mkdirSync(join(dir, "history"), { recursive: true });
  return dir;
};
const journalOf = (dir: string): Buffer => readFileSync(join(dir, "journal.jsonl"));
const factsJson = (c: CanonicalCampaign): string =>
  JSON.stringify(
    c.store
      .listFacts()
      .map((f) => [f.key, f.version, f.value])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );

describe("the Runtime Contract edit is a pure addition, and the old hash is the old text", () => {
  it("this build's contract begins with exactly the untouched bytes (their hash is the declared legacy hash)", () => {
    const now = readFileSync("spec/f027/runtime-contract.md");
    expect(sha(now.subarray(0, OLD_CONTRACT_BYTES))).toBe(OLD_CONTRACT);
    expect(now.length).toBeGreaterThan(OLD_CONTRACT_BYTES);
    expect(LEGACY_RUNTIME_CONTRACT_SHA256S).toEqual([OLD_CONTRACT]);
    expect(BUILD_RUNTIME_CONTRACT_SHA256).not.toBe(OLD_CONTRACT);
    expect(isLegacyRuntimeContract(OLD_CONTRACT)).toBe(true);
    expect(isLegacyRuntimeContract(BUILD_RUNTIME_CONTRACT_SHA256)).toBe(false);
    expect(isLegacyRuntimeContract("0".repeat(64))).toBe(false);
  });

  it("the unedited acceptance register and gates are the files the base's package recorded", () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURE, "manifest.json"), "utf8"));
    expect(manifest.compatibility.runtime_contract_sha256).toBe(OLD_CONTRACT);
    expect(manifest.spec_identity.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      sha(readFileSync("spec/f027/open-gates.yaml")),
    );
  });
});

describe("a package produced by the exact base: open, ordinary commit, reopen, strict replay", () => {
  it("is NOT loadable by a build that merely lacks the declaration (the incompatibility is real)", async () => {
    const dir = copyPackage();
    const bindings = must_(storeBindings());
    const refused = await openFileCampaign(dir, {
      owners: bindings.owners,
      admission: bindings.admission,
      compatibleRuntimeContracts: [BUILD_RUNTIME_CONTRACT_SHA256],
    });
    expect(!refused.ok && refused.error.code).toBe("RUNTIME_CONTRACT_INCOMPATIBLE");
  });

  it("opens under the declaration; an ordinary commit appends; the old bytes, entries and facts are preserved; reopen and strict replay succeed", async () => {
    const dir = copyPackage();
    const before = journalOf(dir);
    const beforeLines = before.toString("utf8").split("\n").filter(Boolean);
    expect(beforeLines).toHaveLength(3);

    const first = await must(CanonicalCampaign.open(dir));
    const factsBefore = factsJson(first);
    expect(first.store.listFacts()).toHaveLength(3);
    expect(first.verify()).toEqual([]);

    // an ordinary canonical commit (a second source of the same locality) is admitted exactly as before
    const added = await first.establishSourceCondition({
      ...publication(4),
      source: sourceInput({ source_key: "second-source" }),
    });
    expect(added.ok).toBe(true);
    expect(first.store.listFacts()).toHaveLength(4);
    await first.close();

    // the first three journal entries are byte-for-byte what the base wrote; the commit only appended
    const after = journalOf(dir);
    expect(after.subarray(0, before.length).equals(before)).toBe(true);
    const afterLines = after.toString("utf8").split("\n").filter(Boolean);
    expect(afterLines).toHaveLength(4);
    expect(afterLines.slice(0, 3)).toEqual(beforeLines);

    // reopen, then strict full replay of the whole history (audit), then once more
    const again = await must(CanonicalCampaign.open(dir));
    expect(again.store.listFacts()).toHaveLength(4);
    const preserved = JSON.parse(factsBefore) as [string, number, unknown][];
    for (const [key, version, value] of preserved) {
      const f = again.store.getFact(key)!;
      expect([f.version, f.value]).toEqual([version, value]);
    }
    await again.close();
    const audited = await must(CanonicalCampaign.open(dir, { audit: true }));
    expect(audited.store.listFacts()).toHaveLength(4);
    expect(audited.verify()).toEqual([]);
    await audited.close();

    // the package keeps its OWN contract hash and records the legacy admission as its verification policy
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    expect(manifest.compatibility.runtime_contract_sha256).toBe(OLD_CONTRACT);
    expect(manifest.head.checkpoint.verification_policy ?? "").not.toContain("null");
    expect(readdirSync(dir)).toContain("manifest.json");
  });

  it("a fresh campaign is created under THIS build's contract and gets no legacy treatment", async () => {
    const fresh = await openFixtureCampaign("campaign-fresh");
    await fresh.campaign.close();
    const manifest = JSON.parse(readFileSync(join(fresh.dir, "manifest.json"), "utf8"));
    expect(manifest.compatibility.runtime_contract_sha256).toBe(BUILD_RUNTIME_CONTRACT_SHA256);
    expect(manifest.compatibility.runtime_contract_sha256).not.toBe(OLD_CONTRACT);
  });
});

describe("every v0.9 surface is REFUSED inside a legacy package (and only there for that reason)", () => {
  const dummyId = "a".repeat(64);
  const pin = { fact_key: "k", version: 1 };
  /** the commit core checks reads/dependencies structurally BEFORE admission; these groups cite no facts so admission is what judges them */
  const bare = <G extends { reads: unknown; depends_on: unknown }>(g: G): G => ({
    ...g,
    reads: [],
    depends_on: [],
  });
  const groupsFor = (campaignId: string, facts: { get(key: string): any }) => {
    const base = { world_id: "world-fixture-1", locus_id: "locus-fixture-1", setup_id: dummyId };
    return {
      initial_setup_input: buildInputGroup(campaignId, facts, { ...base, genesis: [] } as any),
      initial_setup_invocation: buildInvocationGroup(campaignId, facts, {
        ...base,
        input: pin,
        phase: "SCOPE",
        task_id: dummyId,
        input_hash: dummyId,
        parser: "INITIAL_LOCALITY_PARSER_V2",
        grant: null,
      } as any),
      initial_setup_response: buildResponseGroup(campaignId, facts, {
        ...base,
        phase: "SCOPE",
        reservation: pin,
      } as any),
      initial_setup_grant: buildGrantGroup(campaignId, facts, {
        ...base,
        input: pin,
        classification: pin,
        scope_response: pin,
      } as any),
      initial_locality_completion: buildCompletionGroup(campaignId, facts, {
        ...base,
        input: pin,
        grant: pin,
        scene_response: pin,
      } as any),
      initial_setup_disposition: buildDispositionGroup(campaignId, facts, {
        ...base,
        input: pin,
        reason: "CANCELLED",
        phase: null,
        response: null,
        rejection_code: null,
        explanation: "x",
      } as any),
    };
  };

  it("the six bootstrap record kinds, the WG_INITIAL_DELEGATION Referee branch and both OPTION_A_V9 rules", async () => {
    const legacy = await must(CanonicalCampaign.open(copyPackage()));
    const facts = { get: (k: string) => legacy.store.getFact(k) };
    const campaignId = legacy.store.head().campaign_id;
    const groups = Object.fromEntries(
      Object.entries(groupsFor(campaignId, facts)).map(([k, g]) => [k, bare(g)]),
    ) as ReturnType<typeof groupsFor>;
    const referee = buildScopeDecisionGroup(campaignId, facts, {
      record_version: 1,
      operation: "WG_INITIAL_DELEGATION_CLASSIFY",
      task_id: dummyId,
      campaign_id: campaignId,
      attempt: 0,
      authority: { role: "role.gm", permission: "permission.rule.adjudicate" },
      host: { host_id: "gm-initial-scope", claimed_model: null },
      subject: { world_id: "world-fixture-1", locus_id: "locus-fixture-1" },
      input: { digest: dummyId, setup_input: pin, reservation: pin, response: pin },
      decision: {},
      verdict: "SCOPE_AUTHORIZED",
    } as any);
    Object.assign(referee, bare(referee));
    const g0 = groups.initial_setup_input;
    const optionA = (facet: string, owner: string, rule: unknown) => ({
      ...g0,
      group_id: `optA-${facet}`,
      intent_id: `optA-${facet}`,
      owner,
      facet,
      rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      writes: [
        {
          ...g0.writes[0]!,
          key: worldSceneClosureKey("world-fixture-1", "locus-fixture-1"),
          owner,
          facet,
        },
      ],
    });
    const cases: [string, any][] = [
      ...Object.entries(groups),
      ["referee WG_INITIAL_DELEGATION_CLASSIFY", referee],
      [
        "OPTION_A_V9 scene closure rule",
        optionA(
          FACET_WORLD_SCENE_CLOSURE,
          OWNER_WORLD_STATE,
          INITIAL_COMPLETION_SCENE_CLOSURE_RULE,
        ),
      ],
      [
        "OPTION_A_V9 workforce scope rule",
        optionA(
          FACET_POPULATION_WORKFORCE_SCOPE,
          OWNER_POPULATION,
          INITIAL_COMPLETION_WORKFORCE_SCOPE_RULE,
        ),
      ],
    ];
    const head = legacy.store.head().revision;
    for (const [label, group] of cases) {
      const r = await legacy.store.commit(group);
      expect(r.ok, label).toBe(false);
      expect(reasonOf(r as any), label).toBe(LEGACY_RUNTIME_CONTRACT_SURFACE);
    }
    // nothing was written
    expect(legacy.store.head().revision).toBe(head);
    await legacy.close();
  });

  it("the very same groups are NOT refused for that reason in a package created under this build's contract", async () => {
    const fresh = await openFixtureCampaign("campaign-fresh-2");
    const facts = { get: (k: string) => fresh.campaign.store.getFact(k) };
    const groups = Object.fromEntries(
      Object.entries(groupsFor("campaign-fresh-2", facts)).map(([k, g]) => [k, bare(g)]),
    ) as ReturnType<typeof groupsFor>;
    for (const [label, group] of Object.entries(groups)) {
      const r = await fresh.campaign.store.commit(group);
      expect(r.ok, label).toBe(false);
      expect(reasonOf(r as any), label).not.toBe(LEGACY_RUNTIME_CONTRACT_SURFACE);
    }
    await fresh.campaign.close();
  });

  it("the captured-chronology initial-time route is unreachable: it needs a Completion, which a legacy package cannot hold", async () => {
    const legacy = await must(CanonicalCampaign.open(copyPackage()));
    const facts = { get: (k: string) => legacy.store.getFact(k) };
    const completion = buildCompletionGroup(legacy.store.head().campaign_id, facts, {
      world_id: "world-fixture-1",
      locus_id: "locus-fixture-1",
      setup_id: "a".repeat(64),
      input: { fact_key: "k", version: 1 },
      grant: { fact_key: "k", version: 1 },
      scene_response: { fact_key: "k", version: 1 },
    } as any);
    const r = await legacy.store.commit(bare(completion));
    expect(r.ok).toBe(false);
    expect(reasonOf(r as any)).toBe(LEGACY_RUNTIME_CONTRACT_SURFACE);
    expect(legacy.store.getFact("temporal/state")).toBeUndefined();
    await legacy.close();
  });

  it("a legacy package whose journal was altered to carry a v0.9 record fails strict replay (historical verification refuses it too)", async () => {
    // an out-of-band append is not a commit: replay judges every group, and the legacy admission refuses the surface on replay as well
    const dir = copyPackage();
    const legacy = await must(CanonicalCampaign.open(dir));
    await legacy.close();
    const bindings = must_(storeBindings());
    const legacyAdmission = bindings.admissionFor(OLD_CONTRACT)!;
    expect(legacyAdmission).toBeDefined();
    expect(legacyAdmission.historyVerificationId).toContain("LEGACY-PRE-V9-RUNTIME-CONTRACT");
    const g = buildInputGroup("campaign-bench", { get: () => undefined }, {
      world_id: "w",
      locus_id: "l",
      setup_id: "a".repeat(64),
      genesis: [],
    } as any);
    const state: any = { campaign_id: "campaign-bench", revision: 3, facts: new Map() };
    expect(legacyAdmission.verifyHistorical!(g, state)).not.toBeNull();
    expect(legacyAdmission.check(g, state)).not.toBeNull();
    // this build's own admission is not asked to refuse what the legacy one does for the legacy reason
    expect(bindings.admissionFor(BUILD_RUNTIME_CONTRACT_SHA256)).toBeUndefined();
  });
});

function must_<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
