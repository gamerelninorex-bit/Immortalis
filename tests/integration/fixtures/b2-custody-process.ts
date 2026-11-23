// F-014B B2-T05 process fixture. Runs in its OWN operating-system process against ONE campaign directory shared with sibling processes, so the
// serialized-writer exclusion (the `O_EXCL` LOCK of the file package) is exercised for real, not simulated in one event loop.
//   node --experimental-strip-types --no-warnings b2-custody-process.ts <config.json>
// config: { role, dir, go, out, session, rpc, host, admission, target }
// Every process waits for the barrier file `go` (so the contenders start together), opens the package (retrying only on LOCKED, and counting how
// many times it lost the lock), performs ONE role action, and writes one JSON result. It imports no test framework.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  GmWaitCustody,
  buildMarkerGroup,
  factKind,
  fixtureCanonicalAdmission,
  gmWaitOriginProof,
  openFileCampaign,
  sha256Canonical,
  storeBindings,
  type CampaignStore,
  type WriteAdmission,
} from "@immortalis/engine";
import { SYNTH_EXTENSION, SYNTH_OWNER, at } from "@immortalis/testkit";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../../packages/engine/src/gm-wait-catalogue-current.ts";

interface Config {
  readonly role: "marker" | "open" | "noopen" | "status" | "raw-marker" | "open-only";
  readonly dir: string;
  readonly go: string;
  readonly out: string;
  readonly session: string;
  readonly rpc: string;
  readonly host: string;
  /** fixture: the testkit fixture admission; none: no admission at all; wrapped: an admission without the W2 custody verifier */
  readonly admission: "fixture" | "none" | "wrapped";
  readonly target: number;
}

const config = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as Config;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const result: Record<string, unknown> = { role: config.role, pid: process.pid };

const finish = (extra: Record<string, unknown>) => {
  Object.assign(result, extra);
  writeFileSync(config.out, JSON.stringify(result));
  console.log(JSON.stringify(result));
};

const deadline = Date.now() + 60_000;
while (!existsSync(config.go)) {
  if (Date.now() > deadline) throw new Error("the start barrier never appeared");
  await sleep(2);
}

const proof = (() => {
  const p = gmWaitOriginProof({
    sessionId: config.session,
    rpcIdSerialized: config.rpc,
    authenticatedHostRef: config.host,
  });
  if (!p.ok) throw new Error("proof");
  return p.value;
})();

/** Opens the package, retrying ONLY on a contended writer lock. Any other refusal is the result. */
async function open(): Promise<
  | { ok: true; store: CampaignStore; close: () => Promise<void>; lockedAttempts: number }
  | { ok: false; error: { code: string; message: string }; lockedAttempts: number }
> {
  let lockedAttempts = 0;
  for (;;) {
    let outcome:
      | { ok: true; store: CampaignStore; close: () => Promise<void> }
      | { ok: false; error: { code: string; message: string } };
    if (config.admission === "fixture") {
      const r = await CanonicalCampaign.open(config.dir, {
        buildId: `b2-process-${process.pid}`,
        extension: SYNTH_EXTENSION,
        testkitFixtureAdmission: fixtureCanonicalAdmission,
      });
      outcome = r.ok
        ? { ok: true, store: r.value.store, close: () => r.value.close() }
        : { ok: false, error: r.error as { code: string; message: string } };
    } else {
      const bindings = storeBindings(SYNTH_EXTENSION);
      if (!bindings.ok) throw new Error("bindings");
      const admission: WriteAdmission | undefined =
        config.admission === "wrapped"
          ? { check: () => null, verifyHistorical: () => null }
          : undefined;
      const r = await openFileCampaign(config.dir, {
        buildId: `b2-process-${process.pid}`,
        owners: bindings.value.owners,
        ...(admission ? { admission } : {}),
      });
      outcome = r.ok
        ? { ok: true, store: r.value, close: () => r.value.close() }
        : { ok: false, error: r.error as { code: string; message: string } };
    }
    if (outcome.ok || outcome.error.code !== "LOCKED") return { ...outcome, lockedAttempts };
    lockedAttempts++;
    if (Date.now() > deadline) return { ...outcome, lockedAttempts };
    await sleep(10 + Math.floor(Math.random() * 15));
  }
}

const opened = await open();
if (!opened.ok) {
  finish({ opened: false, openError: opened.error, lockedAttempts: opened.lockedAttempts });
} else {
  const { store, close, lockedAttempts } = opened;
  const prepFact = store.getFact("synthetic/source/1");
  const custody = new GmWaitCustody(store, {
    catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
    historyVerificationId: fixtureCanonicalAdmission.historyVerificationId!,
    kernelRule: factKind("temporal_state").rule,
  });
  const markerInput = {
    proof,
    initialRequestSha256: "a".repeat(64),
    request: {
      cause: "gm-wait-cause-1",
      triggerRef: "trigger-ref-1",
      target: at(config.target),
      publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
    },
    preparation: {
      kind: "OWNER_PENDING_ENROLMENT" as const,
      owner: SYNTH_OWNER,
      fact: {
        key: "synthetic/source/1",
        version: prepFact?.version ?? 1,
        group_id: prepFact?.provenance.group_id ?? "none",
      },
      digest: sha256Canonical(prepFact?.value ?? null),
    },
  };
  const summarize = (r: {
    ok: boolean;
    value?: { receipt: { revision: number; group_sha256: string }; replayed: boolean; x: string };
    error?: { code: string; message: string; details?: unknown };
  }) =>
    r.ok
      ? {
          committed: true,
          replayed: r.value!.replayed,
          revision: r.value!.receipt.revision,
          group_sha256: r.value!.receipt.group_sha256,
          x: r.value!.x,
        }
      : {
          committed: false,
          error: {
            code: r.error!.code,
            reason: (r.error!.details as { reason?: string } | undefined)?.reason ?? null,
          },
        };
  let step: Record<string, unknown>;
  switch (config.role) {
    case "marker":
      step = summarize(await custody.publishMarker(markerInput));
      break;
    case "open":
    case "open-only":
      step = summarize(await custody.open(proof));
      break;
    case "noopen":
      step = summarize(await custody.markNoOpen(proof));
      break;
    case "raw-marker": {
      // a raw `store.commit` of a lawful, well-shaped marker group, from a store that may have no (or a foreign) admission installed
      const built = buildMarkerGroup(
        { get: (k) => store.getFact(k) },
        {
          ...markerInput,
          campaignId: store.head().campaign_id,
          policy: {
            catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
            historyVerificationId: fixtureCanonicalAdmission.historyVerificationId!,
          },
        },
      );
      if (!built.ok) {
        step = { committed: false, error: { code: built.error.code, reason: "BUILD" } };
      } else {
        const r = await store.commit(built.value.group);
        step = r.ok
          ? { committed: true, revision: r.value.receipt.revision }
          : {
              committed: false,
              error: {
                code: r.error.code,
                reason: (r.error.details as { reason?: string } | undefined)?.reason ?? null,
              },
            };
      }
      break;
    }
    default:
      step = {};
  }
  const head = store.head();
  const facts = new Map(store.listFacts().map((f) => [f.key, f.version]));
  const indexKeys = [...facts.keys()].filter((k) => k.startsWith("temporal/gm-wait/by-pc/"));
  const index =
    indexKeys.length === 1
      ? (store.getFact(indexKeys[0]!)!.value as { state: string; x: string })
      : null;
  void CANONICAL_OWNER_REGISTRY;
  finish({
    opened: true,
    lockedAttempts,
    step,
    head: { revision: head.revision, journal_head_sha256: head.journal_head_sha256 },
    slot: index ? { state: index.state, x: index.x, version: facts.get(indexKeys[0]!) } : null,
  });
  await close();
}
