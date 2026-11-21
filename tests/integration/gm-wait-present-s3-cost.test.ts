/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts */
// F-014B B1 S3/S2 engineering acceptance (BLUE v6.2 section 5, "Engineering Acceptance"): the runtime T0 read is a fixed, constant addressed
// scope, not a world scan; the catalogue digest check hashes retained bytes only; the build-time census is a bounded traversal. MECHANISM ONLY.
//
// The ASSERTIONS are structural (read counts and keys identical as unrelated worlds and history grow). The TIMINGS are measurements, written
// to the file named by GM_WAIT_MEASURE_OUT when it is set (docs/evidence/f014b-s2s3/measurements.json) and never asserted on: this runner
// is not a benchmark host, so a wall-clock figure is evidence, not a threshold.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_LOCUS_ID } from "@immortalis/testkit";
import {
  catalogueCanonicalBytes,
  verifySuppliedDigest,
} from "../../packages/engine/src/gm-wait-catalogue.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import {
  S3_MAX_READS,
  classifyPresentBasis,
  makeSyntheticTestPolicy,
  testPreconditionAtPureOracleBoundary,
  type PolicyInput,
} from "../../packages/engine/src/gm-wait-present-reader.ts";
import {
  MANIFEST_DIR,
  REPO_ROOT,
  buildCensus,
  generate,
} from "../../tools/gen-gm-wait-catalogue.ts";
import { FIXTURE_CAMPAIGN, PC } from "../support/pc-movement.ts";
import { T0, collectionCampaign } from "../support/pc-collection.ts";
import { addLedger, advanceTo, resident } from "../support/pc-lapse.ts";
import { tripwire } from "../support/b1-s3-facts.ts";

const OUT = process.env["GM_WAIT_MEASURE_OUT"];
const pct = (xs: number[], p: number): number =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] as number;
const policy: PolicyInput = makeSyntheticTestPolicy("closed-test-policy-cost", {
  accept_complete_gip: true,
  accept_complete_freight: true,
  no_pc_known_time_commitments: true,
});
const results: Record<string, unknown> = {};

describe("[S3] [mechanism only] the T0 read scope is constant as unrelated worlds and prior history grow", () => {
  it("[S3] [mechanism only] the keys read, their versions and their count are identical for 0, 20 and 60 unrelated Population ledgers and after earlier history", async () => {
    const s = await collectionCampaign();
    try {
      const store = s.campaign.store;
      const classify = () => {
        const t = tripwire(store, (k) => k === "temporal/boundary-index");
        const state = (s.coordinator.state() as any).value.canonical_time;
        const t0 = performance.now();
        const r = classifyPresentBasis(
          testPreconditionAtPureOracleBoundary({ campaign_id: FIXTURE_CAMPAIGN, pc_id: PC }),
          {
            phase: "INITIAL",
            transaction_id: "tx-cost",
            from_transaction: null,
            observed_basis: state,
            catalogue_sha256: null,
          },
          t.source,
          policy,
        );
        const us = (performance.now() - t0) * 1000;
        expect(t.calls).toEqual(r.witnesses.map((w) => w.key));
        return { r, us };
      };
      const series: {
        n: number;
        facts: number;
        reads: number;
        cold_us: number;
        warm_p50_us: number;
        warm_p95_us: number;
      }[] = [];
      let baseline: string[] | null = null;
      let added = 0;
      for (const n of [0, 20, 60]) {
        for (; added < n; added++)
          await addLedger(
            s,
            `ledger-cost-${added}`,
            [resident(`unit-cost-${added}`, FIXTURE_LOCUS_ID)],
            960 + added,
          );
        if (n === 20) await advanceTo(s, T0.value + 5, "tx-history");
        const cold = classify();
        const warm: number[] = [];
        for (let i = 0; i < 200; i++) warm.push(classify().us);
        const sig = cold.r.witnesses.map((w) => `${w.key}@${w.version}`);
        // the unrelated facts do not change what is read; only the clock-bearing history may move a version, never the key set
        const keys = cold.r.witnesses.map((w) => w.key);
        baseline ??= keys;
        expect(keys, `n=${n}`).toEqual(baseline);
        expect(sig.length).toBeLessThanOrEqual(S3_MAX_READS);
        series.push({
          n,
          facts: store.listFacts().length,
          reads: sig.length,
          cold_us: Math.round(cold.us),
          warm_p50_us: Math.round(pct(warm, 0.5)),
          warm_p95_us: Math.round(pct(warm, 0.95)),
        });
      }
      expect(new Set(series.map((x) => x.reads)).size).toBe(1);
      expect(series[2]!.facts).toBeGreaterThan(series[0]!.facts + 50);
      results["t0_reads_vs_world_size"] = series;
    } finally {
      await s.campaign.close();
    }
  });
});

describe("[S2] [mechanism only] hashing and build-time traversal costs", () => {
  it("[S2] [mechanism only] hashing the retained manifest and checking a supplied digest cost one hash of the retained bytes; the census traversal is bounded", async () => {
    const dir = join(REPO_ROOT, MANIFEST_DIR);
    const bytes = readFileSync(join(dir, `${GM_WAIT_CATALOGUE_CURRENT_SHA256}.json`), "utf8");
    const hashUs: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      createHash("sha256").update(bytes, "utf8").digest("hex");
      hashUs.push((performance.now() - t0) * 1000);
    }
    const authority = {
      current: GM_WAIT_CATALOGUE_CURRENT_SHA256,
      retained: new Map([[GM_WAIT_CATALOGUE_CURRENT_SHA256, bytes]]),
    };
    const verifyUs: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      expect(verifySuppliedDigest(GM_WAIT_CATALOGUE_CURRENT_SHA256, authority)).toBe("OK_CURRENT");
      verifyUs.push((performance.now() - t0) * 1000);
    }
    const g0 = performance.now();
    const cold = await generate();
    const coldMs = performance.now() - g0;
    const warmMs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await buildCensus();
      warmMs.push(performance.now() - t0);
    }
    const c0 = performance.now();
    catalogueCanonicalBytes(cold.manifest);
    const canonMs = performance.now() - c0;
    expect(cold.digest).toBe(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    expect(cold.byteLength).toBe(Buffer.byteLength(bytes, "utf8"));
    results["hashing_and_build"] = {
      manifest_bytes: cold.byteLength,
      sha256_us: { p50: Math.round(pct(hashUs, 0.5)), p95: Math.round(pct(hashUs, 0.95)) },
      verify_supplied_digest_us: {
        p50: Math.round(pct(verifyUs, 0.5)),
        p95: Math.round(pct(verifyUs, 0.95)),
      },
      generate_cold_in_process_ms: Math.round(coldMs),
      census_warm_ms: { p50: Math.round(pct(warmMs, 0.5)), max: Math.round(Math.max(...warmMs)) },
      canonical_bytes_ms: Math.round(canonMs * 10) / 10,
      census_counts: {
        kinds: cold.manifest.kinds.length,
        providers: cold.manifest.providers.length,
        sites: cold.manifest.sites.length,
        ...cold.manifest.scope.ast_counts,
      },
    };
    if (OUT) {
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(
        OUT,
        `${JSON.stringify({ node: process.version, platform: process.platform, ...results }, null, 2)}\n`,
      );
    }
  });
});
