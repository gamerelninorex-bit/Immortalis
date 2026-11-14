import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  economyDestinationAdequacyKey,
  economyFreightWithdrawalKey,
} from "@immortalis/contracts";
import { freightPublication as pub, quarryWorksFixture, textileWorkshopFixture } from "@immortalis/testkit";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  FREIGHT_ECONOMY_RULE,
  FREIGHT_FACT_KIND_IDS,
  groupOfPlan,
  openFileCampaign,
  resolveKey,
} from "@immortalis/engine";
import {
  createFreightCampaign,
  foundationThroughFixation,
  keysOf,
  openFreightCampaign,
  outcome,
  reopenFreightCampaign,
  throughDeliveryAndAdequacy,
  type Freight,
} from "../support/freight.ts";

let dir: string;
let open: Freight[] = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "imm-freight-replay-"));
  open = [];
});
afterEach(async () => {
  for (const f of open) await f.campaign.close().catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
});

describe("PO-3 — replay re-derives every first-profile group against its true pre-state: a fabricated journal cannot reopen", () => {
  it("a caller-selected adequacy conclusion and a caller-selected withdrawal, written past the owner's rule, are rejected on reopen", async () => {
    // golden, lawful values from an independent complete run of the same world
    const golden = await createFreightCampaign(join(dir, "golden"), quarryWorksFixture());
    open.push(golden);
    const goldenRef = await throughDeliveryAndAdequacy(golden);
    const adequacy = golden.economy.destinationAdequacy(goldenRef)!.value;

    // a campaign that has only reached the fixed request
    const target = await createFreightCampaign(join(dir, "target"), quarryWorksFixture());
    const ref = await foundationThroughFixation(target);
    const fx = target.fx;
    await target.campaign.close();

    // a store with NO owner admission at all lets the forged groups commit (the hash chain stays valid)
    const permissive = await openFileCampaign(join(dir, "target"), {
      owners: CANONICAL_OWNER_REGISTRY,
      admission: { check: () => null },
    });
    if (!permissive.ok) throw new Error(JSON.stringify(permissive.error));
    const store = permissive.value;
    const forged = [
      groupOfPlan(store, pub("forged", 1), "economy", "economy_state", FREIGHT_ECONOMY_RULE, {
        reads: [],
        writes: [{ key: economyDestinationAdequacyKey(ref), value: adequacy, expected_version: 0 }],
      }),
    ];
    const accepted = await store.commit(forged[0]!);
    expect(accepted.ok, "the permissive store accepted the forgery: only replay can catch it").toBe(true);
    await store.close();

    const reopened = await CanonicalCampaign.open(join(dir, "target"), { buildId: "replay-check" });
    expect(reopened.ok).toBe(false);
    if (!reopened.ok) expect(JSON.stringify(reopened.error)).toMatch(/historical verification|not a valid transition|REPLAY_MISMATCH/);

    // and a forged cancellation (no owner-admitted trigger exists at that cut)
    const target2 = await createFreightCampaign(join(dir, "target2"), textileWorkshopFixture());
    const ref2 = await foundationThroughFixation(target2);
    const fx2 = target2.fx;
    await target2.campaign.close();
    const permissive2 = await openFileCampaign(join(dir, "target2"), {
      owners: CANONICAL_OWNER_REGISTRY,
      admission: { check: () => null },
    });
    if (!permissive2.ok) throw new Error(JSON.stringify(permissive2.error));
    const withdrawal = {
      request: { fact_key: `economy/freight-request/${ref2}`, request_ref: ref2, version: 1 },
      act: "withdrawal-pending",
      cause: {
        kind: "W3",
        reason: "OWNER_ADMITTED_CESSATION_OR_MISMATCH_OF_AN_EXACT_PINNED_DEPENDENCY",
        dependency: "site_condition",
        pinned: { fact_key: "x", version: 1 },
        observed: { fact_key: "x", version: 2 },
      },
      entity: { fact_key: `world/${fx2.worldId}/entity/${keysOf(fx2).entityId}`, entity_id: keysOf(fx2).entityId },
      logistics_guard: {
        branch: "NO_SERVICE_FOR_THIS_REQUEST",
        commitment: { fact_key: "logistics/commitment/x/y", version: 0 },
        transfer: { fact_key: "logistics/transfer/x/y", version: 0 },
      },
      cut_basis_revision: 0,
      admitted_at: fx2.t0,
      effect: "PROTECTION_ONLY_RELEASES_NOTHING_CLOSES_NOTHING",
    };
    const g = groupOfPlan(permissive2.value, pub("forged", 2), "economy", "economy_state", FREIGHT_ECONOMY_RULE, {
      reads: [],
      writes: [{ key: economyFreightWithdrawalKey(ref2), value: withdrawal, expected_version: 0 }],
    });
    expect((await permissive2.value.commit(g)).ok).toBe(true);
    await permissive2.value.close();
    const again = await CanonicalCampaign.open(join(dir, "target2"), { buildId: "replay-check" });
    expect(again.ok).toBe(false);
  });

  it("a lawful journal reopens; the lawful state is identical after a second independent reopen", async () => {
    const f = await createFreightCampaign(join(dir, "ok"), quarryWorksFixture());
    open.push(f);
    await throughDeliveryAndAdequacy(f);
    const head = f.campaign.store.head();
    const again = await reopenFreightCampaign(f);
    open.push(again);
    expect(again.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(again.campaign.verify()).toEqual([]);
    const third = await openFreightCampaign(join(dir, "ok"), again.fx).catch(() => undefined);
    expect(third).toBeUndefined(); // the writer lock is held by the open campaign: one writer at a time
  });
});

describe("PO-6 — GM-authored original setting only: honest provenance, no fabricated player choice, no new disclosure path", () => {
  it("every first-profile fact is archivist-committed from GM-authored premises; no player authority or character exists anywhere", async () => {
    const f = await createFreightCampaign(join(dir, "gm"), textileWorkshopFixture());
    open.push(f);
    await throughDeliveryAndAdequacy(f);
    const facts = f.campaign.store.listFacts().filter((x) => FREIGHT_FACT_KIND_IDS.includes(resolveKey(x.key)!.kind.id as never));
    expect(facts.length).toBeGreaterThan(20);
    for (const fact of facts) {
      const group = f.campaign.store.committedGroup(fact.provenance.intent_id)!;
      expect(group.authority).toEqual({ role: "role.archivist", permission: "permission.canon.write" });
      expect(JSON.stringify(fact.value), fact.key).not.toMatch(/role\.player|player_choice|permission\.player/);
    }
    // the GM's premise is attested under the GM's adjudication authority and is explicitly NOT a player choice
    const attestation = f.world.attestation(f.fx.worldId)!.value;
    expect(attestation.setup_operation.authored_under).toEqual({ role: "role.gm", permission: "permission.rule.adjudicate" });
    expect(attestation.setup_operation.authorship).toBe("GM_AUTHORED_ORIGINAL_SETTING_PREMISES_NOT_PLAYER_CHOICE");
    expect(attestation.mode).toBe("ORIGINAL_WORLD_NULL_PC");
    // NULL-PC throughout: no binding, no PC existence, no player-owned fact
    expect(f.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toBeUndefined();
    expect(f.campaign.store.listFacts().filter((x) => x.owner === "pc_existence" || x.owner === "role_registry")).toEqual([]);
  });

  it("the GM's ordinary prose is preserved verbatim beside its typed lowering, and survives a reopen unchanged", async () => {
    const f = await createFreightCampaign(join(dir, "prose"), quarryWorksFixture());
    open.push(f);
    await throughDeliveryAndAdequacy(f);
    const authored = new Map(f.fx.opening.slices.map((s) => [s.slice_id, s.statement]));
    const check = (ff: Freight) => {
      for (const s of ff.world.attestation(ff.fx.worldId)!.value.envelope.slices)
        expect(s.statement, s.slice_id).toBe(authored.get(s.slice_id));
    };
    check(f);
    const again = await reopenFreightCampaign(f);
    open.push(again);
    check(again);
    // a premise the GM did not author is not invented: the typed premises carry exactly the authored totals
    expect(again.productionFreight.materialSpecification(f.fx.specification.specification_id)!.value.quantity).toEqual(
      f.fx.specification.quantity,
    );
  });

  it("the engine adds no privileged read or player-facing disclosure path: no projection, epistemic, referee or protocol code names the freight kinds", async () => {
    const { readFile, readdir } = await import("node:fs/promises");
    const names = [...FREIGHT_FACT_KIND_IDS, "freight/"];
    const roots = ["packages/engine/src/projection", "packages/engine/src/presentation", "packages/engine/src/epistemic", "packages/engine/src/referee", "packages/protocol/src", "apps/phone/src"];
    for (const root of roots) {
      for (const entry of await readdir(join(process.cwd(), root), { recursive: true })) {
        if (!String(entry).endsWith(".ts")) continue;
        const text = await readFile(join(process.cwd(), root, String(entry)), "utf8");
        for (const n of names) expect(text.includes(n), `${root}/${String(entry)} names ${n}`).toBe(false);
      }
    }
    expect((await outcome(Promise.resolve({ ok: true as const, value: { replayed: false } }))).code).toBe("OK");
  });
});
