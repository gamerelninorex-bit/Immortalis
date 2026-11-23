/* eslint-disable @typescript-eslint/no-explicit-any -- raw groups and store wrappers */
// F-014B B2-T03 — the authenticated operation identity X and the keys it addresses (BLUE N5 / RED R-7e(3), RED T91). SCRIPTED TESTKIT MECHANISM ONLY:
// the session and request-id texts below are hand-written doubles of what the trusted transport already produced.
//
// X is the lowercase hex SHA-256 of a domain-separated, length-delimited encoding of the GM-wait namespace, the verified ORIGINAL session id and the
// exact `JSON.stringify` text of the ORIGINAL JSON-RPC id, which the transport has ALREADY produced and which is hashed AS TEXT, never serialized again.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  temporalGmWaitByPcKey,
  temporalGmWaitMarkerKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  GM_WAIT_X_NAMESPACE,
  GmWaitCustody,
  buildMarkerGroup,
  factKind,
  gmWaitCause,
  gmWaitMarkerGroupId,
  gmWaitRefSha256,
  gmWaitTransactionId,
  gmWaitX,
  resolveKey,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_ADMISSION,
  FIXTURE_PC_ID,
  HOST,
  NOW_SHA,
  RPC_NUMERIC_1,
  RPC_STRING_1,
  SESSION,
  at,
  custodyPolicy,
  lifecycle,
  markerInput,
  must,
  proofOf,
  seededRig,
  tempDir,
} from "./b2-support.ts";

const x = (session: string, rpc: string): string => {
  const r = gmWaitX(session, rpc);
  if (!r.ok) throw new Error("x");
  return r.x;
};
/** An INDEPENDENT re-statement of the encoding, so a change of the production encoding is a visible failure, not a silent re-derivation. */
const reference = (...parts: string[]): string => {
  const chunks: Buffer[] = [];
  for (const p of [GM_WAIT_X_NAMESPACE, ...parts]) {
    const b = Buffer.from(p, "utf8");
    const len = Buffer.alloc(8);
    len.writeBigUInt64BE(BigInt(b.length));
    chunks.push(len, b);
  }
  return createHash("sha256").update(Buffer.concat(chunks)).digest("hex");
};

describe("B2-T03 the identity function", () => {
  it("[control] it is the independently stated length-delimited SHA-256, lowercase hex, of (namespace, session id, serialized request id)", () => {
    expect(x(SESSION, RPC_NUMERIC_1)).toBe(reference(SESSION, RPC_NUMERIC_1));
    expect(x(SESSION, RPC_NUMERIC_1)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('the numeric id 1 (text `1`) and the string id "1" (text `"1"`) are DIFFERENT X, and a repeat is the SAME X', () => {
    expect(x(SESSION, RPC_NUMERIC_1)).not.toBe(x(SESSION, RPC_STRING_1));
    expect(x(SESSION, RPC_NUMERIC_1)).toBe(x(SESSION, RPC_NUMERIC_1));
    // the id text is hashed AS TEXT and never serialized a second time: the string id is the 3-character text `"1"`, not the 5-character `"\"1\""`
    expect(x(SESSION, RPC_STRING_1)).toBe(reference(SESSION, '"1"'));
    expect(x(SESSION, RPC_STRING_1)).not.toBe(reference(SESSION, JSON.stringify('"1"')));
  });
  it("a different session is a different X: it is never silently the same one", () => {
    expect(x("session-original-2", RPC_NUMERIC_1)).not.toBe(x(SESSION, RPC_NUMERIC_1));
  });
  it("the encoding is unambiguous: moving a character across the part boundary, or embedding delimiters, cannot collide", () => {
    const seen = new Set<string>();
    const pairs: [string, string][] = [
      ["ab", "c"],
      ["a", "bc"],
      ["abc", ""],
      ["", "abc"],
      ["a\u0000b", "c"],
      ["a", "\u0000bc"],
      ["a:b", "c"],
      ["a", "b:c"],
      ["a|b", "c"],
    ].filter(([a, b]) => a!.length > 0 && b!.length > 0) as [string, string][];
    for (const [a, b] of pairs) seen.add(x(a, b));
    expect(seen.size).toBe(pairs.length);
  });
  it("[negative] an input that does not survive UTF-8 unchanged is refused rather than hashed (a lone surrogate would collide with U+FFFD)", () => {
    expect(gmWaitX("\ud800", "1").ok).toBe(false);
    expect(gmWaitX(SESSION, "\udc00").ok).toBe(false);
    expect(
      gmWaitX(SESSION, "�").ok,
      "the real replacement character is itself well-formed and distinct",
    ).toBe(true);
    expect(x(SESSION, "�")).not.toBe(x(SESSION, "1"));
  });
  it("[negative] an empty or non-string input is refused", () => {
    for (const bad of ["", undefined, null, 1, {}] as unknown[]) {
      expect(gmWaitX(bad, "1").ok).toBe(false);
      expect(gmWaitX(SESSION, bad).ok).toBe(false);
    }
  });
  it("no other input exists: a body transaction_id, a target, a time, a notice id or a renewed OAuth grant is not a parameter of X", () => {
    // X takes exactly the session and the already-serialized request id; nothing a body, a clock or a later grant can carry enters it
    expect(gmWaitX.length).toBe(2);
    // a renewed OAuth grant changes the HOST reference, which is a different, non-identity digest: the same session and request id give the same X
    expect(x(SESSION, RPC_NUMERIC_1)).toBe(x(SESSION, RPC_NUMERIC_1));
    expect(gmWaitRefSha256("authenticated-host", HOST)).not.toBe(
      gmWaitRefSha256("authenticated-host", "renewed-host-grant-2"),
    );
  });
});

describe("B2-T03 the keys: a raw id, a slash or a quote never reaches a key", () => {
  it("an id whose text contains quotes, slashes and backslashes yields a key that is only the namespace and 64 lowercase hex", () => {
    for (const rpc of ['"a/b\\"c"', '"../../x"', '"\\"\\""', "12345678901234567890"]) {
      const key = temporalGmWaitMarkerKey(x(SESSION, rpc));
      expect(key).toMatch(/^temporal\/gm-wait\/marker\/[0-9a-f]{64}$/);
      expect(resolveKey(key)?.kind.id).toBe("temporal_gm_wait_marker");
    }
  });
  it("[negative] a PC id with a slash or a quote, a marker key that is not 64 lowercase hex, and an extra path segment resolve to NO registered key space", () => {
    for (const key of [
      "temporal/gm-wait/by-pc/pc/../marker/x",
      "temporal/gm-wait/by-pc/pc/1",
      'temporal/gm-wait/by-pc/pc"1',
      "temporal/gm-wait/by-pc/",
      `temporal/gm-wait/marker/${"A".repeat(64)}`,
      `temporal/gm-wait/marker/${"a".repeat(63)}`,
      `temporal/gm-wait/marker/${"a".repeat(64)}/extra`,
      `temporal/gm-wait/marker/"1"`,
      "temporal/gm-wait/other/x",
    ]) {
      expect(resolveKey(key), key).toBeNull();
    }
    expect(resolveKey(temporalGmWaitByPcKey("pc-1"))?.kind.id).toBe("temporal_gm_wait_pc_index");
  });
  it("[negative] a raw group that writes such a key is refused by the store whatever else is correct, and the lawful group is accepted", async () => {
    const rig = await seededRig(tempDir());
    const built = buildMarkerGroup(
      { get: (k) => rig.store.getFact(k) },
      {
        ...markerInput(rig),
        campaignId: rig.store.head().campaign_id,
        policy: {
          catalogueSha256: NOW_SHA,
          historyVerificationId: FIXTURE_ADMISSION.historyVerificationId!,
        },
      },
    );
    if (!built.ok) throw new Error("built");
    const escaped: CommitGroup = {
      ...built.value.group,
      writes: built.value.group.writes.map((w) =>
        w.key.includes("by-pc") ? { ...w, key: 'temporal/gm-wait/by-pc/pc"1' } : w,
      ),
    };
    const r = await rig.store.commit(escaped);
    expect(r.ok).toBe(false);
    expect((r as any).error.code).toBe("KEY_NOT_ADMITTED");
    expect(rig.store.listFacts().some((f) => f.key.startsWith("temporal/gm-wait/"))).toBe(false);
  });
  it("the identities of every group are derived from X alone", () => {
    const id = x(SESSION, RPC_NUMERIC_1);
    expect(gmWaitMarkerGroupId(id)).toBe(`gm-wait-marker-group:${id}`);
    expect(gmWaitCause(id)).toBe(`gm-wait:${id}`);
    expect(gmWaitTransactionId(id)).toBe(`gm-wait:${id}`);
  });
});

describe("B2-T03 the writer: repeat, conflict, slot and renewed grant, on a real campaign", () => {
  it("a repeat of the exact original request is the SAME X and returns the original receipt: nothing is written, the slot state is reported", async () => {
    const rig = await seededRig(tempDir());
    const first = await must(rig.custody.publishMarker(markerInput(rig)));
    const head = rig.store.head();
    const again = await must(rig.custody.publishMarker(markerInput(rig)));
    expect(again.replayed).toBe(true);
    expect(again.x).toBe(first.x);
    expect(again.receipt).toEqual(first.receipt);
    expect(rig.store.head()).toEqual(head);
  });

  it("[negative] a colliding X with changed semantic contents CONFLICTS: a changed target, publication, request digest, preparation or cause never opens a second wait", async () => {
    const rig = await seededRig(tempDir());
    await must(rig.custody.publishMarker(markerInput(rig)));
    const head = rig.store.head();
    const changes: Record<string, Parameters<typeof markerInput>[1]> = {
      target: {
        request: {
          cause: "gm-wait-cause-1",
          triggerRef: "trigger-ref-1",
          target: at(161),
          publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
        },
      },
      "publication label": {
        request: {
          cause: "gm-wait-cause-1",
          triggerRef: "trigger-ref-1",
          target: at(160),
          publication: { basis: "other-basis", secrecy: "fixture-visibility" },
        },
      },
      cause: {
        request: {
          cause: "another-cause",
          triggerRef: "trigger-ref-1",
          target: at(160),
          publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
        },
      },
      "trigger ref": {
        request: {
          cause: "gm-wait-cause-1",
          triggerRef: "another-ref",
          target: at(160),
          publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
        },
      },
      "request digest": { initialRequestSha256: "b".repeat(64) },
      "preparation digest": { preparation: { ...rig.prep, digest: "c".repeat(64) } },
    };
    for (const [what, over] of Object.entries(changes)) {
      const r = await rig.custody.publishMarker(markerInput(rig, over));
      expect(r.ok, what).toBe(false);
      expect((r as any).error.code, what).toBe("GM_WAIT_X_CONFLICT");
      expect(rig.store.head(), `${what}: a conflict writes nothing`).toEqual(head);
    }
  });

  it("[negative] a changed policy or a changed PC binding conflicts too (the binding is read through a store whose binding fact has moved)", async () => {
    const rig = await seededRig(tempDir());
    await must(rig.custody.publishMarker(markerInput(rig)));
    const head = rig.store.head();
    const otherPolicy = new GmWaitCustody(rig.store, {
      ...custodyPolicy(),
      catalogueSha256: "d".repeat(64),
    });
    const policy = await otherPolicy.publishMarker(markerInput(rig));
    expect((policy as any).error.code).toBe("GM_WAIT_X_CONFLICT");
    const moved: CampaignStore = new Proxy(rig.store, {
      get(target, prop, receiver) {
        if (prop === "getFact")
          return (key: string) => {
            const f = target.getFact(key);
            return key === PLAYER_CHARACTER_BINDING_KEY && f
              ? {
                  ...f,
                  version: f.version + 1,
                  provenance: { ...f.provenance, group_id: "a-later-binding-group" },
                }
              : f;
          };
        const v = Reflect.get(target, prop, receiver);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const binding = await new GmWaitCustody(moved, custodyPolicy()).publishMarker(markerInput(rig));
    expect((binding as any).error.code).toBe("GM_WAIT_X_CONFLICT");
    expect(rig.store.head()).toEqual(head);
  });

  it("a renewed OAuth grant is not an extra X dimension: the same session and request id with a renewed host reference is the same X and the original receipt", async () => {
    const rig = await seededRig(tempDir());
    const first = await must(rig.custody.publishMarker(markerInput(rig)));
    const renewed = proofOf(SESSION, RPC_NUMERIC_1, "renewed-host-grant-2");
    const again = await must(rig.custody.publishMarker(markerInput({ ...rig, proof: renewed })));
    expect(again.x).toBe(first.x);
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    // and the renewed grant, which independently verified the same original session and request, can carry the wait forward
    await must(rig.custody.open(renewed));
  });

  it('[negative] a different session, a different request id (a reconnect), or the string id "1" is a DIFFERENT X and cannot take an occupied slot; once the wait is terminal the next X takes it at the NEXT version', async () => {
    const rig = await seededRig(tempDir());
    const { x: first } = await lifecycle(rig, "marker");
    for (const [s, r] of [
      ["session-original-2", RPC_NUMERIC_1],
      [SESSION, "2"],
      [SESSION, RPC_STRING_1],
    ] as const) {
      const attempt = await rig.custody.publishMarker(
        markerInput({ ...rig, proof: proofOf(s, r) }),
      );
      expect(attempt.ok, `${s}/${r}`).toBe(false);
      expect((attempt as any).error.details.reason).toBe("GM_WAIT_SLOT_OCCUPIED");
    }
    expect(rig.custody.status(FIXTURE_PC_ID)).toEqual({ state: "MARKED" });
    // finish the first wait; the slot becomes terminal and another X may take the SAME index key at the next expected version
    await must(rig.custody.open(rig.proof));
    await must(rig.custody.sealOwn(first));
    await must(rig.custody.reconcile(rig.proof));
    const indexVersion = rig.store.getFact(temporalGmWaitByPcKey(FIXTURE_PC_ID))!.version;
    const second = await must(
      rig.custody.publishMarker(
        markerInput(
          { ...rig, proof: proofOf(SESSION, RPC_STRING_1) },
          {
            request: {
              cause: "gm-wait-cause-2",
              triggerRef: "trigger-ref-2",
              target: at(200),
              publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
            },
          },
        ),
      ),
    );
    expect(second.x).not.toBe(first);
    expect(rig.store.getFact(temporalGmWaitByPcKey(FIXTURE_PC_ID))!.version).toBe(indexVersion + 1);
    expect(
      rig.store.getFact(temporalGmWaitMarkerKey(first))!.version,
      "the first wait's marker is immutable history",
    ).toBe(1);
    expect(factKind("temporal_gm_wait_pc_index").lifecycle).toBe("ADVANCING");
  });
});
