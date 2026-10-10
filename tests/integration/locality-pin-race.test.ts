// BLUE F60-R2: two operators confirming DIFFERENT valid setups for the same new campaign, forced onto the harmful interleaving — both
// have passed every read of the retained setup identity (all of which saw it absent) before either has committed a pin. The first
// durably retained identity must be immutable, the other writer must conflict safely, and the retained setup must still complete and
// reopen the standard campaign. A test that merely serialised the writers would prove nothing, so the harness forces the overlap.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalitySetupSchema, localitySetupId } from "@immortalis/operator";
import { instrumentFs } from "@immortalis/testkit";
import { nodeFs } from "@immortalis/engine";
import { pinFileName, readPin, writePin } from "../../packages/operator/src/locality-pin.ts";
import {
  LOCALITY_CAMPAIGN,
  establish,
  freshDirs,
  headOf,
  openOrdinary,
  pinRace,
  setupDoc,
  writeSetup,
} from "../support/locality.ts";

const docB = () => {
  const d = setupDoc();
  d.world.premise = "A walled orchard town above a dry river.";
  d.source.quantity.amount = 40;
  d.source.access_facts = [{ aspect: "terrain", statement: "Reached by the orchard stair." }];
  return d;
};
const idOf = (doc: unknown) => localitySetupId(LOCALITY_CAMPAIGN, LocalitySetupSchema.parse(doc));
const UID = process.getuid!();

/** The log proves the overlap was real: both writers read the pin absent and arrived at their first mutation before any mutation began. */
function expectForcedOverlap(log: string[]) {
  const firstStart = log.findIndex((l) => / start$/.test(l));
  const before = log.slice(0, firstStart);
  for (const who of ["A", "B"]) {
    expect(before, `${who} observed absent`).toContain(`${who} observed the pin absent`);
    expect(
      before.some((l) => l.startsWith(`${who} arrives at`)),
      `${who} arrived`,
    ).toBe(true);
  }
}

describe("F60-R2 writePin: simultaneous first writers cannot replace one another", () => {
  for (const order of [
    ["A", "B"],
    ["B", "A"],
  ] as const) {
    it(`both writers pass an observed-absent read before either commits; the first (${order[0]}) is retained, the other conflicts`, async () => {
      const dir = freshDirs().operatorDir;
      const { mkdirSync } = await import("node:fs");
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const race = pinRace(order);
      const p = (who: string) => ({
        dir,
        campaignId: LOCALITY_CAMPAIGN,
        operatorUid: UID,
        fs: race.fs(who),
      });
      const a = "a".repeat(32);
      const b = "b".repeat(32);
      // both observe the pin absent first, exactly as the precheck of two consoles does
      expect(await readPin(p("A"))).toMatchObject({ ok: true, value: null });
      expect(await readPin(p("B"))).toMatchObject({ ok: true, value: null });
      const [ra, rb] = await Promise.all([
        writePin({ ...p("A"), setupId: a }),
        writePin({ ...p("B"), setupId: b }),
      ]);
      expectForcedOverlap(race.log);

      const winner = order[0] === "A" ? a : b;
      const [won, lost] = order[0] === "A" ? [ra, rb] : [rb, ra];
      expect(won.ok).toBe(true);
      expect(!lost.ok && lost.error.code).toBe("PIN_CONFLICT");
      // the retained identity is the first writer's, immutable, and a later write of either identity cannot change it
      expect(await readPin({ dir, campaignId: LOCALITY_CAMPAIGN, operatorUid: UID })).toMatchObject(
        {
          ok: true,
          value: winner,
        },
      );
      const other = winner === a ? b : a;
      const again = await writePin({
        dir,
        campaignId: LOCALITY_CAMPAIGN,
        operatorUid: UID,
        setupId: other,
      });
      expect(!again.ok && again.error.code).toBe("PIN_CONFLICT");
      expect(
        JSON.parse(readFileSync(join(dir, pinFileName(LOCALITY_CAMPAIGN)), "utf8")).setup_id,
      ).toBe(winner);
    });
  }

  it("the loser performs no write at all: it only attempts the exclusive create and reads", async () => {
    const dir = freshDirs().operatorDir;
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const race = pinRace(["A", "B"]);
    await Promise.all([
      writePin({
        dir,
        campaignId: LOCALITY_CAMPAIGN,
        operatorUid: UID,
        fs: race.fs("A"),
        setupId: "a".repeat(32),
      }),
      writePin({
        dir,
        campaignId: LOCALITY_CAMPAIGN,
        operatorUid: UID,
        fs: race.fs("B"),
        setupId: "b".repeat(32),
      }),
    ]);
    const bOps = race.log.filter((l) => l.startsWith("B ") && l.endsWith(" start"));
    expect(bOps).toEqual(["B createExclusive start"]);
  });
});

describe("F60-R2 establishLocality: two consoles, two different confirmed setups, one new campaign", () => {
  for (const order of [
    ["A", "B"],
    ["B", "A"],
  ] as const) {
    it(`forced overlap, first writer ${order[0]}: it completes and reopens the standard campaign; the other conflicts and never replaces it`, async () => {
      const dirs = freshDirs();
      const docs = { A: setupDoc(), B: docB() };
      const files = { A: writeSetup(docs.A), B: writeSetup(docs.B) };
      const win = order[0];
      const lose = win === "A" ? "B" : "A";
      const race = pinRace(order);

      const run = (who: "A" | "B") =>
        establish(dirs, files[who], ["confirm"], { ledgerFs: race.fs(who) });
      const [ra, rb] = await Promise.all([run("A"), run("B")]);
      expectForcedOverlap(race.log);

      const [won, lost] = win === "A" ? [ra, rb] : [rb, ra];
      expect(won.result.status).toBe("LOCALITY_READY");
      expect(lost.result.status).toBe("SETUP_CONFLICT");

      // exactly one identity is retained, immutably: the first writer's
      const pinned = await readPin({
        dir: dirs.operatorDir,
        campaignId: LOCALITY_CAMPAIGN,
        operatorUid: UID,
      });
      expect(pinned).toMatchObject({ ok: true, value: idOf(docs[win]) });

      // the standard campaign holds the winner's setup and not one fact of the other
      const c = await openOrdinary(dirs.campaignDir);
      expect(c.verify()).toEqual([]);
      expect(c.world(docs[win].world.world_id)!.value).toEqual(docs[win].world);
      expect(c.store.listFacts()).toHaveLength(3);
      expect(
        c.sourceCondition(docs[win].world.world_id, docs[win].source.source_key)!.value.recoverable
          .amount,
      ).toBe(docs[win].source.quantity.amount);
      await c.close();

      // the loser cannot get in afterwards, and the winner's setup re-verifies without being asked again
      const retryLose = await establish(dirs, files[lose], ["confirm"]);
      expect(retryLose.result.status).toBe("SETUP_CONFLICT");
      expect(retryLose.terminal.asked()).toBe(0);
      const retryWin = await establish(dirs, files[win]);
      expect(retryWin.result.status).toBe("LOCALITY_READY");
      expect(retryWin.terminal.asked()).toBe(0);

      // and it is the very campaign an uninterrupted run of the winner's setup produces
      const reference = freshDirs();
      expect((await establish(reference, files[win])).result.status).toBe("LOCALITY_READY");
      expect(await headOf(dirs.campaignDir)).toEqual(await headOf(reference.campaignDir));
    }, 180_000);
  }

  it("the first writer is interrupted right after winning the pin: the loser conflicts, and the winner's rerun completes the package", async () => {
    const dirs = freshDirs();
    const files = { A: writeSetup(setupDoc()), B: writeSetup(docB()) };
    const race = pinRace(["A", "B"]);
    // A's package creation fails at its very first operation (after A has won the pin); B has nothing to say about it
    const failing = instrumentFs(nodeFs, { failAt: 1, when: "before" });
    const [ra, rb] = await Promise.all([
      establish(dirs, files.A, ["confirm"], { ledgerFs: race.fs("A"), campaignFs: failing.fs }),
      establish(dirs, files.B, ["confirm"], { ledgerFs: race.fs("B") }),
    ]);
    expectForcedOverlap(race.log);
    expect(ra.result.status).not.toBe("LOCALITY_READY");
    expect(rb.result.status).toBe("SETUP_CONFLICT");
    expect(
      existsSync(dirs.campaignDir)
        ? ((await openOrdinary(dirs.campaignDir).catch(() => undefined))?.store.listFacts()
            .length ?? 0)
        : 0,
    ).toBe(0);

    // B still cannot take the campaign; A, the retained identity, completes it
    expect((await establish(dirs, files.B, ["confirm"])).result.status).toBe("SETUP_CONFLICT");
    const resumed = await establish(dirs, files.A, ["confirm"]);
    expect(resumed.result.status).toBe("LOCALITY_READY");
    const reference = freshDirs();
    expect((await establish(reference, files.A)).result.status).toBe("LOCALITY_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(await headOf(reference.campaignDir));
  }, 180_000);
});
