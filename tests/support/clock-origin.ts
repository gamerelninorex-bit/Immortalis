// TEST SUPPORT for the F-014B A0 clock-origin mechanism (CAL-TIME T-1; T1 MECHANISM ONLY). Everything signed or "verified" here is a
// labelled fixture double (the reserved `fixture:` namespace); nothing is, or can be reported as, original-message authenticity, an
// authentic production capture (A1) or a named-client result. The builders here create UPSTREAM SETUP RECORDS (a v2 chronology capture
// and the Input that carries it) only: no builder asserts a Temporal origin, a Temporal state or a downstream verdict. Those are
// written solely by the real captured writer and judged solely by the real admission and historical verifier.
import {
  CHRONOLOGY_CAPTURE_FORMAT,
  CHRONOLOGY_DOCUMENT_FORMAT,
  SI_SCALE_DECLARATION,
  type AuthoredEvidence,
  type AuthoredGrade,
  type ChronologyCapture,
  type ChronologyCaptureV2,
  type ChronologyDocument,
  type ChronologyDocumentV2,
  type ChronologyEvidence,
  type InitialSetupInput,
} from "@immortalis/contracts";
import {
  InitialSetupPublisher,
  chronologyCaptureHash,
  chronologyDocumentHash,
  genesisProjection,
  scopeFingerprintOf,
  setupIdOf,
  setupMessageHash,
  sha256Canonical,
} from "@immortalis/engine";
import {
  FIXTURE_MESSAGE_METHOD,
  FIXTURE_SETUP_MESSAGE,
  fixtureProofHash,
} from "@immortalis/testkit";
import { factsOf, type Harness } from "./initial-setup.ts";

export const CLOCK_UNIT = "seconds";

export const V1_DOCUMENT: ChronologyDocument = {
  format: CHRONOLOGY_DOCUMENT_FORMAT,
  format_version: 1,
  time: { unit: CLOCK_UNIT, value: 0 },
  statement: "SYNTHETIC FIXTURE: the first light of the first morning",
};
export const V2_DOCUMENT: ChronologyDocumentV2 = {
  format: CHRONOLOGY_DOCUMENT_FORMAT,
  format_version: 2,
  time: { unit: CLOCK_UNIT, value: 0 },
  statement: "SYNTHETIC FIXTURE: the first light of the first morning",
  scale: SI_SCALE_DECLARATION,
};

export interface CaptureOptions {
  readonly campaignId: string;
  readonly captureRef?: string;
  readonly grade?: AuthoredGrade;
  readonly message?: string;
  readonly request?: string;
  readonly methodId?: string;
  readonly originalMessageHash?: string | null;
  readonly client?: string;
  readonly oauthGrant?: string;
  readonly requestRef?: string;
}

const sourceOf = (o: CaptureOptions) => {
  const message = o.message ?? FIXTURE_SETUP_MESSAGE;
  const hash = setupMessageHash(message);
  return {
    client: o.client ?? "fixture:client:1",
    oauth_grant: o.oauthGrant ?? "fixture:grant:1",
    request_ref: o.requestRef ?? `fixture:request:${o.request ?? "1"}`,
    original_message_hash: o.originalMessageHash === undefined ? hash : o.originalMessageHash,
    method_id: o.methodId ?? FIXTURE_MESSAGE_METHOD,
    attestation_hash: fixtureProofHash(hash),
  };
};

/** A strict v1 capture with correct hashes (the shape the shipped operator capture store produces). */
export function v1Capture(
  o: CaptureOptions & { readonly document?: ChronologyDocument },
): ChronologyCapture {
  const document = o.document ?? V1_DOCUMENT;
  const head = {
    format: CHRONOLOGY_CAPTURE_FORMAT as typeof CHRONOLOGY_CAPTURE_FORMAT,
    format_version: 1 as const,
    capture_ref: o.captureRef ?? `fixture:capture:${o.request ?? "1"}`,
    campaign_id: o.campaignId,
    document,
    document_hash: chronologyDocumentHash(document),
    grade: o.grade ?? "ORIGINAL_MESSAGE_VERIFIED",
    source: sourceOf(o),
  };
  return { ...head, capture_hash: chronologyCaptureHash(head) };
}

/** A strict v2 capture with correct hashes. A FIXTURE UPSTREAM RECORD: the authentic v2 capture path is A1. */
export function v2Capture(
  o: CaptureOptions & { readonly document?: ChronologyDocumentV2 },
): ChronologyCaptureV2 {
  const document = o.document ?? V2_DOCUMENT;
  const head = {
    format: CHRONOLOGY_CAPTURE_FORMAT as typeof CHRONOLOGY_CAPTURE_FORMAT,
    format_version: 2 as const,
    capture_ref: o.captureRef ?? `fixture:capture:${o.request ?? "1"}`,
    campaign_id: o.campaignId,
    document,
    document_hash: chronologyDocumentHash(document),
    grade: o.grade ?? "ORIGINAL_MESSAGE_VERIFIED",
    source: sourceOf(o),
  };
  return { ...head, capture_hash: chronologyCaptureHash(head) };
}

/** Rehashes a capture after a field of it was changed (the hashes of a forged-but-self-consistent capture are valid). */
export function rehash<T extends ChronologyCapture | ChronologyCaptureV2>(c: T): T {
  const { capture_hash: _drop, ...rest } = c;
  const withDoc = { ...rest, document_hash: chronologyDocumentHash(c.document) };
  return { ...withDoc, capture_hash: chronologyCaptureHash(withDoc as never) } as T;
}

// ---------------------------------------------------------------------------------------------------------------------
// The upstream setup chain through the ORIGINAL fixture publication path.
//
// The shipped operator intake (`InitialSetupService.intake`) parses a capture with the strict v1 schema and is deliberately untouched
// by A0; reaching it with a v2 capture is A1. So the Input is built here exactly as the service builds it and published through the
// engine's real `InitialSetupPublisher`, whose group builder and the owner admission judge it like any other Input. Everything after
// the Input (SCOPE, Referee classification, Grant, SCENE, Completion) is the unchanged `InitialSetupService.advance`.
// ---------------------------------------------------------------------------------------------------------------------

export interface InputOptions {
  readonly request?: string;
  readonly message?: string;
  readonly route?: "MS";
  /** replaces the chronology capture (default: a strict, correctly hashed v2 capture of the fixture author's own source) */
  readonly capture?: ChronologyEvidence;
  readonly captureOver?: Partial<CaptureOptions> & { readonly document?: ChronologyDocumentV2 };
  readonly author?: AuthoredEvidence;
  /** a last edit of the Input before it is published (falsifiers): whatever the test edits stays in force */
  readonly edit?: (input: InitialSetupInput) => InitialSetupInput;
}

export interface AdmittedInput {
  readonly ok: boolean;
  readonly setup_id: string;
  readonly input: InitialSetupInput;
  readonly published: Awaited<ReturnType<InitialSetupPublisher["input"]>>;
}

/** Builds and publishes an Input exactly as the trusted intake does, but carrying `over.capture` (default a strict v2 capture). */
export async function admitInput(h: Harness, over: InputOptions = {}): Promise<AdmittedInput> {
  const request = over.request ?? "1";
  const message = over.message ?? FIXTURE_SETUP_MESSAGE;
  const author =
    over.author ??
    h.verifier.authoredEvidence({ message, request_ref: `fixture:request:${request}` });
  const capture =
    over.capture ??
    v2Capture({
      campaignId: h.campaignId,
      message,
      request,
      captureRef: `fixture:capture:${request}`,
      client: author.client,
      oauthGrant: author.oauth_grant,
      requestRef: author.request_ref,
      ...over.captureOver,
    });
  const projection = genesisProjection(factsOf(h.store));
  if (!projection.ok)
    throw new Error(`genesis projection unavailable: ${projection.error.message}`);
  const p = projection.value;
  const head = h.store.head();
  const built: InitialSetupInput = {
    format: "immortalis-initial-setup-input",
    format_version: 1,
    world_id: p.world_id,
    locus_id: p.locus_id,
    source: p.source,
    pc: p.pc,
    setup_id: setupIdOf({
      campaign_id: h.campaignId,
      client: author.client,
      oauth_grant: author.oauth_grant,
      authenticated_setup_request_id: `fixture:setup-request:${request}`,
    }),
    scope_fingerprint: scopeFingerprintOf({
      world_id: p.world_id,
      locus_id: p.locus_id,
      setup_message_hash: setupMessageHash(message),
      projection_hash: p.projection_hash,
      chronology_document_hash: capture.document_hash,
    }),
    setup_message: message,
    author,
    chronology: capture,
    genesis: [...p.pins],
    projection_hash: p.projection_hash,
    pre_state: {
      head: `revision:${head.revision}`,
      basis_hash: sha256Canonical({ projection: p.projection_hash, revision: head.revision }),
    },
    runner: h.runner.pin,
    parser: h.runner.parser,
  };
  const input = over.edit ? over.edit(built) : built;
  const published = await new InitialSetupPublisher(h.store, over.route).input(input);
  return { ok: published.ok, setup_id: input.setup_id, input, published };
}
