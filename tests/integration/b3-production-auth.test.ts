import { createPrivateKey, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { OwnerFact } from "@immortalis/contracts";
import { generateFixtureRunnerKeys } from "@immortalis/testkit";
import {
  WORKSHOP_NOTICE_CLASS,
  type WorkshopNoticeBinding,
} from "../../packages/contracts/src/workshop-opening.ts";
import { gmWaitX } from "../../packages/engine/src/gm-wait-identity.ts";
import { sha256Bytes } from "../../packages/engine/src/initial-setup/identity.ts";
import {
  createWorkshopAuthentication,
  productionWorkshopAuthentication,
  type WorkshopRetainedOriginals,
} from "../../packages/engine/src/owners/workshop/production-auth.ts";
import {
  workshopRef,
  type WorkshopView,
} from "../../packages/engine/src/owners/workshop/publication.ts";
import { WORKSHOP_NOTICE_RULE } from "../../packages/engine/src/owners/workshop/source.ts";
import { workshopRawProfile } from "../support/b3-opening.ts";

function signedArchive() {
  const keys = generateFixtureRunnerKeys();
  const key = createPrivateKey({
    key: Buffer.from(keys.privateKeyPkcs8Base64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const profile = { id: "test-only-originals-profile", raw: workshopRawProfile("glassbell") };
  const campaign = "workshop-auth-test";
  const history = "test-only-originals";
  const originals = new Map<string, NonNullable<ReturnType<WorkshopRetainedOriginals["read"]>>>();
  const archive = {
    read: vi.fn((ref: string) => originals.get(ref)),
    prepare: vi.fn<WorkshopRetainedOriginals["prepare"]>(() => []),
    atBoundary: vi.fn<WorkshopRetainedOriginals["atBoundary"]>(() => []),
    recipient: vi.fn<WorkshopRetainedOriginals["recipient"]>(() => []),
  };
  const base = {
    domain: "IMMORTALIS:WORKSHOP:PRODUCTION:1",
    campaign,
    profile_sha256: sha256Bytes(profile.raw),
    source: WORKSHOP_NOTICE_RULE,
  };
  const add = (message: object, signature?: Uint8Array) => {
    const bytes = Buffer.from(JSON.stringify({ ...base, ...message }));
    const ref = sha256Bytes(bytes);
    originals.set(ref, { bytes, signature: signature ?? sign(null, bytes, key) });
    return ref;
  };
  const pins = (
    [
      "GM_INITIAL",
      "C54_COVERAGE",
      "OFFICE_REVOCATION",
      "NOTICE_RECIPIENT",
      "PLAYER_CHOICE",
    ] as const
  ).map((purpose) => ({
    purpose,
    source: WORKSHOP_NOTICE_RULE,
    publicKeySpkiBase64: keys.publicKeySpkiBase64,
  }));
  const adopted = [
    {
      profile: profile.id,
      profile_sha256: base.profile_sha256,
      history_verification_id: history,
      pins,
    },
  ];
  const auth = createWorkshopAuthentication(adopted, [profile.id], profile, campaign, archive)!;
  const session = "original-gm-session";
  const rpc_id_serialized = '"original-message-id"';
  const derived = gmWaitX(session, rpc_id_serialized);
  if (!derived.ok) throw new Error("invalid test request identity");
  const gm = {
    ...base,
    purpose: "GM_INITIAL",
    x: derived.x,
    session,
    rpc_id_serialized,
    authenticated_host: "authenticated-test-host",
    request_sha256: "1".repeat(64),
  };
  return { add, adopted, archive, auth, base, gm, history, profile };
}

function fact(key: string, value: OwnerFact["value"] = null): OwnerFact {
  return {
    key,
    value,
    owner: "world_state",
    facet: "world_locus",
    version: 1,
    unit: null,
    basis: "retained-original-test",
    secrecy: "sealed",
    provenance: {
      group_id: "group-" + key,
      intent_id: "intent-" + key,
      cause: "retained-original-test",
      rule: WORKSHOP_NOTICE_RULE,
    },
  };
}

describe("B3 production original-message authentication", () => {
  it("verifies exact GM initials and refuses mismatched bytes, keys, purpose, scope and X", () => {
    const { adopted, add, archive, auth, base, gm, profile } = signedArchive();
    const ref = add(gm);
    expect(auth.originalGm(ref)).toEqual(gm);
    for (const patch of [
      { x: "0".repeat(64) },
      { campaign: "other-campaign" },
      { profile_sha256: "2".repeat(64) },
      { source: { ...gm.source, native_pin: "unadopted-pin" } },
      {
        purpose: "OFFICE_REVOCATION",
        instruction: workshopRef(fact("test-instruction")),
        witnesses: [workshopRef(fact("test-witness"))],
      },
      { domain: "fixture:GM" },
    ])
      expect(auth.originalGm(add({ ...gm, ...patch }))).toBeUndefined();

    const original = archive.read(ref)!;
    const forged = add({ ...gm, request_sha256: "3".repeat(64) }, original.signature);
    expect(auth.originalGm(forged)).toBeUndefined();
    archive.read.mockReturnValueOnce({ ...original, bytes: Buffer.from("changed") });
    expect(auth.originalGm(ref)).toBeUndefined();
    expect(auth.originalGm("0".repeat(64))).toBeUndefined();

    const pin = adopted[0]!.pins[0]!;
    for (const pins of [
      [],
      [pin, pin],
      [{ ...pin, publicKeySpkiBase64: generateFixtureRunnerKeys().publicKeySpkiBase64 }],
    ]) {
      const gate = createWorkshopAuthentication(
        [{ ...adopted[0]!, pins }],
        [profile.id],
        profile,
        base.campaign,
        archive,
      )!;
      expect(gate.originalGm(ref)).toBeUndefined();
    }
    expect(
      createWorkshopAuthentication(
        adopted,
        [profile.id],
        { ...profile, raw: Buffer.from("other profile bytes") },
        base.campaign,
        archive,
      ),
    ).toBeUndefined();
  });

  it("composes C54 preparation and earned-boundary proofs with exact, unique current originals", () => {
    const { add, archive, auth, base, gm, history } = signedArchive();
    const duty = fact("duty");
    const witness = fact("witness");
    const dutyRef = workshopRef(duty);
    const witnessRef = workshopRef(witness);
    const facts = new Map([
      [duty.key, duty],
      [witness.key, witness],
    ]);
    const view: WorkshopView = {
      campaign_id: base.campaign,
      revision: 2,
      get: (key) => facts.get(key),
    };
    const preparation = {
      purpose: "C54_COVERAGE",
      x: gm.x,
      duty: duty.key,
      phase: "PREPARATION",
      request_sha256: "4".repeat(64),
      proposal_sha256: "5".repeat(64),
      preparation_sha256: null,
      witnesses: [witnessRef],
    };
    const preparationRef = add(preparation);
    const boundary = {
      ...preparation,
      phase: "EARNED_BOUNDARY",
      preparation_sha256: preparationRef,
    };
    const boundaryRef = add(boundary);
    const binding: WorkshopNoticeBinding = {
      schema_version: 1,
      class: WORKSHOP_NOTICE_CLASS,
      campaign_id: base.campaign,
      x: gm.x,
      notice_id: "6".repeat(64),
      world_id: "world",
      locus_id: "locus",
      attendant_id: "attendant",
      pc_id: "pc",
      report: "COMPLETION_CONFIRMED",
      policy: {
        source_rule_ref: WORKSHOP_NOTICE_RULE,
        history_verification_id: history,
        catalogue_sha256: "7".repeat(64),
      },
      pc_binding: witnessRef,
      world: witnessRef,
      locus: witnessRef,
      cue_operation: witnessRef,
      acceptance_key: "acceptance",
      duty: dutyRef,
      root_request_sha256: preparation.request_sha256,
      proposal_sha256: preparation.proposal_sha256,
      t0_witness_sha256: preparationRef,
    };
    const source = auth.noticeSource;
    const prepare = () => source.prepare(view, gm.x, duty.key);
    const earn = () => source.atBoundary(view, binding);
    archive.prepare.mockReturnValue([preparationRef]);
    archive.atBoundary.mockReturnValue([boundaryRef]);
    expect(source.verificationId).toBe(history);
    expect(prepare()).toEqual({
      rootRequestSha256: preparation.request_sha256,
      proposalSha256: preparation.proposal_sha256,
      t0WitnessSha256: preparationRef,
      refs: [witness],
    });
    expect(earn()).toEqual([witness]);
    expect(archive.prepare).toHaveBeenCalledWith(base.campaign, gm.x, duty.key);
    expect(archive.atBoundary).toHaveBeenCalledWith(base.campaign, gm.x, preparationRef);
    const foreign = { ...view, campaign_id: "another-campaign" };
    expect(source.prepare(foreign, gm.x, duty.key)).toBeUndefined();
    expect(source.atBoundary(foreign, binding)).toBeUndefined();
    expect(
      source.atBoundary(view, { ...binding, campaign_id: foreign.campaign_id }),
    ).toBeUndefined();
    for (const patch of [
      { x: "0".repeat(64) },
      { duty: "other-duty" },
      { phase: "EARNED_BOUNDARY" },
      { preparation_sha256: "8".repeat(64) },
    ]) {
      archive.prepare.mockReturnValueOnce([add({ ...preparation, ...patch })]);
      expect(prepare()).toBeUndefined();
    }
    for (const patch of [
      { x: "0".repeat(64) },
      { duty: "other-duty" },
      { phase: "PREPARATION" },
      { preparation_sha256: "8".repeat(64) },
      { request_sha256: "8".repeat(64) },
      { proposal_sha256: "8".repeat(64) },
    ]) {
      archive.atBoundary.mockReturnValueOnce([add({ ...boundary, ...patch })]);
      expect(earn()).toBeUndefined();
    }
    archive.prepare.mockReturnValueOnce([]);
    expect(prepare()).toBeUndefined();
    archive.atBoundary.mockReturnValueOnce(["0".repeat(64)]);
    expect(earn()).toBeUndefined();
    archive.prepare.mockReturnValueOnce([preparationRef, preparationRef]);
    expect(prepare()?.t0WitnessSha256).toBe(preparationRef);
    archive.prepare.mockReturnValueOnce([
      preparationRef,
      add({ ...preparation, witnesses: [dutyRef] }),
    ]);
    expect(prepare()).toBeUndefined();
    archive.atBoundary.mockReturnValueOnce([
      boundaryRef,
      add({ ...boundary, witnesses: [dutyRef] }),
    ]);
    expect(earn()).toBeUndefined();
    facts.set(witness.key, { ...witness, version: witness.version + 1 });
    expect(prepare()).toBeUndefined();
    expect(earn()).toBeUndefined();
  });

  it("verifies revocation, recipient and choice against their own signed bindings", () => {
    const { add, archive, auth, base, gm, history } = signedArchive();
    const witness = fact("witness");
    const original = fact("instruction");
    const other = fact("other-instruction");
    const occurrence = fact("occurrence", { pc_id: "designated-pc" });
    const witnessRef = workshopRef(witness);
    const occurrenceRef = workshopRef(occurrence);
    const view: WorkshopView = {
      campaign_id: base.campaign,
      revision: 2,
      get: (key) => (key === witness.key ? witness : undefined),
    };
    const revocation = add({
      purpose: "OFFICE_REVOCATION",
      instruction: workshopRef(original),
      witnesses: [witnessRef],
    });
    expect(auth.noticeSource.revocationSource!.authorize(view, original, revocation)).toEqual([
      witness,
    ]);
    expect(auth.noticeSource.revocationSource!.authorize(view, other, revocation)).toBeUndefined();
    const recipient = {
      purpose: "NOTICE_RECIPIENT",
      occurrence: occurrenceRef,
      recipient: "designated-pc",
      witnesses: [witnessRef],
    };
    const recipientProof = add(recipient);
    const recipientSource = auth.noticeSource.recipientSource!;
    archive.recipient.mockReturnValue([recipientProof]);
    expect(recipientSource.recipient(view, occurrence)).toEqual({
      witnesses: [witness],
      capability: null,
    });
    expect(archive.recipient).toHaveBeenCalledWith(base.campaign, occurrenceRef);
    const wrongRecipient = add({ ...recipient, recipient: "foreign-pc" });
    archive.recipient.mockReturnValueOnce([wrongRecipient]);
    expect(recipientSource.recipient(view, occurrence)).toBeUndefined();
    archive.recipient.mockReturnValueOnce([recipientProof, wrongRecipient]);
    expect(recipientSource.recipient(view, occurrence)).toBeUndefined();
    archive.recipient.mockReturnValueOnce([]);
    expect(recipientSource.recipient(view, occurrence)).toBeUndefined();
    expect(recipientSource.recipient(view, { ...occurrence, version: 2 })).toBeUndefined();

    const opportunity = {
      x: gm.x,
      campaign: base.campaign,
      pc: recipient.recipient,
      seal: witnessRef,
      clock: witnessRef,
      binding: witnessRef,
      packet: witnessRef,
    };
    const decision = {
      purpose: "CONTINUE_INTERRUPTED_WORKSHOP_WAIT",
      choice: "CONTINUE",
      confirmation: "9".repeat(64),
      opportunity,
    };
    expect(auth.choiceSource.verificationId).toBe(history);
    expect(auth.choiceSource.read(add({ purpose: "PLAYER_CHOICE", decision }))).toEqual(decision);
    expect(
      auth.choiceSource.read(
        add({
          purpose: "PLAYER_CHOICE",
          decision: { ...decision, opportunity: { ...opportunity, campaign: "other-campaign" } },
        }),
      ),
    ).toBeUndefined();
  });

  it("denies production Profiles and fixture campaigns before consulting the archive", () => {
    const { adopted, archive, base, profile } = signedArchive();
    expect(
      createWorkshopAuthentication(adopted, [profile.id], profile, "fixture:claimed-live", archive),
    ).toBeUndefined();
    for (const mode of ["quiet", "glassbell"] as const) {
      const knownProfile = {
        id: "workshop-opening-" + mode + "-v4",
        raw: workshopRawProfile(mode),
      };
      expect(
        productionWorkshopAuthentication(knownProfile, base.campaign, archive),
      ).toBeUndefined();
      expect(
        productionWorkshopAuthentication(knownProfile, "fixture:claimed-live", archive),
      ).toBeUndefined();
    }
    for (const lookup of Object.values(archive)) expect(lookup).not.toHaveBeenCalled();
  });
});
