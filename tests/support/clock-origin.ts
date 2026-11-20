// TEST SUPPORT for the F-014B A0 clock-origin mechanism (CAL-TIME T-1; T1 MECHANISM ONLY). Everything signed or "verified" here is a
// labelled fixture double (the reserved `fixture:` namespace); nothing is, or can be reported as, original-message authenticity, an
// authentic production capture (A1) or a named-client result. The builders here create UPSTREAM SETUP RECORDS (a v2 chronology capture
// and the Input that carries it) only: no builder asserts a Temporal origin, a Temporal state or a downstream verdict. Those are
// written solely by the real captured writer and judged solely by the real admission and historical verifier.
import {
  CANON_WRITE_AUTHORITY,
  CAPTURED_CHRONOLOGY_BASIS,
  CHRONOLOGY_CAPTURE_FORMAT,
  InitialLocalityCompletionSchema,
  InitialSetupInputSchema,
  CHRONOLOGY_DOCUMENT_FORMAT,
  SI_SCALE_DECLARATION,
  TEMPORAL_ORIGIN_KEY,
  TEMPORAL_STATE_KEY,
  deriveTemporalOrigin,
  initialLocalityCompletionKey,
  initialSetupInputKey,
  type AuthoredEvidence,
  type CommitGroup,
  type SourceRef,
  type TemporalOrigin,
  type AuthoredGrade,
  type ChronologyCapture,
  type ChronologyCaptureV2,
  type ChronologyDocument,
  type ChronologyDocumentV2,
  type ChronologyEvidence,
  type InitialSetupInput,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  InitialSetupPublisher,
  TEMPORAL_CAPTURED_V2_GENESIS_RULE,
  buildInputGroup,
  chronologyCaptureHash,
  chronologyDocumentHash,
  fixtureCanonicalAdmission,
  genesisProjection,
  openFileCampaign,
  scanInitialSetup,
  scopeFingerprintOf,
  setupIdOf,
  setupMessageHash,
  sha256Canonical,
  type CampaignState,
  type WriteAdmission,
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
  /** the chronology capture arm of the default capture (default 2) */
  readonly arm?: 1 | 2;
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

/** Builds (does not publish) an Input exactly as the trusted intake does, carrying `over.capture` (default a strict v2 capture). */
export function buildInput(h: Harness, over: InputOptions = {}): InitialSetupInput {
  const request = over.request ?? "1";
  const message = over.message ?? FIXTURE_SETUP_MESSAGE;
  const author =
    over.author ??
    h.verifier.authoredEvidence({ message, request_ref: `fixture:request:${request}` });
  const captureOptions = {
    campaignId: h.campaignId,
    message,
    request,
    captureRef: `fixture:capture:${request}`,
    client: author.client,
    oauthGrant: author.oauth_grant,
    requestRef: author.request_ref,
    ...over.captureOver,
  };
  const capture =
    over.capture ??
    (over.arm === 1
      ? v1Capture(captureOptions as CaptureOptions)
      : v2Capture(captureOptions as CaptureOptions));
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
  return over.edit ? over.edit(built) : built;
}

/** Builds and publishes an Input through the original publisher (the route and arm select its citation). */
export async function admitInput(h: Harness, over: InputOptions = {}): Promise<AdmittedInput> {
  const input = buildInput(h, over);
  const published = await new InitialSetupPublisher(h.store, over.route).input(input);
  return { ok: published.ok, setup_id: input.setup_id, input, published };
}

/** The Input group the original publisher would build, with its governing rule replaced (cross-wiring falsifiers). */
export function inputGroupWithRule(
  h: Harness,
  input: InitialSetupInput,
  rule: SourceRef,
  route?: "MS",
): CommitGroup {
  return {
    ...buildInputGroup(h.campaignId, { get: (k) => h.store.getFact(k) }, input, route),
    rule,
  };
}

/** `{ ok, code, reason }` of a commit result, for refusal assertions. */
export function refusal(r: { ok: boolean; error?: { code?: string; details?: unknown } }): {
  ok: boolean;
  code: string | undefined;
  reason: string | undefined;
} {
  return {
    ok: r.ok,
    code: r.error?.code,
    reason: (r.error?.details as { reason?: string } | undefined)?.reason,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Forged Temporal genesis groups. These build RAW groups for the falsifiers: each is judged by the real admission (live) or the real
// historical verifier (a hash-valid journal), never by this module. A forged group derives from the committed records and then
// changes exactly the one thing the test names.
// ---------------------------------------------------------------------------------------------------------------------

type Write = CommitGroup["writes"][number];

export interface PairOptions {
  readonly tag?: string;
  readonly order?: "state-first" | "origin-first";
  readonly rule?: SourceRef;
  /** the origin value, edited from the lawful derivation */
  readonly origin?: (lawful: TemporalOrigin) => unknown;
  /** the origin value, replaced wholesale (needed where no lawful derivation exists, e.g. a v1 chronology) */
  readonly originValue?: unknown;
  readonly state?: (lawful: unknown) => unknown;
  readonly stateWrite?: Partial<Write>;
  readonly originWrite?: Partial<Write>;
  readonly extraWrites?: readonly Write[];
  readonly omit?: "state" | "origin";
  readonly reads?: CommitGroup["reads"];
  readonly depends_on?: CommitGroup["depends_on"];
  readonly group?: Partial<CommitGroup>;
}

/** The committed governing records of a session that reached its Completion. */
export function governing(h: Harness) {
  const facts = factsOf(h.store);
  const completion = scanInitialSetup(facts).completion;
  if (!completion) throw new Error("no Completion is committed");
  const c = InitialLocalityCompletionSchema.parse(completion.value);
  const inputFact = facts.get(c.input.fact_key)!;
  const input = InitialSetupInputSchema.parse(inputFact.value);
  return {
    facts,
    completion,
    inputFact,
    input,
    completionKey: completion.key,
    inputKey: inputFact.key,
  };
}

export function pairGroup(h: Harness, o: PairOptions = {}): CommitGroup {
  const g = governing(h);
  const tag = o.tag ?? "forged";
  const lawful = deriveTemporalOrigin(
    h.campaignId,
    g.input,
    { fact_key: g.completion.key, version: g.completion.version },
    { fact_key: g.inputFact.key, version: g.inputFact.version },
  );
  if (!lawful && o.originValue === undefined)
    throw new Error("the governing Input has no derivable origin (not a qualified v2 capture)");
  const basis =
    CAPTURED_CHRONOLOGY_BASIS[g.input.chronology.grade as keyof typeof CAPTURED_CHRONOLOGY_BASIS];
  const meta = {
    owner: "temporal_kernel",
    facet: "temporal_coordination",
    unit: null,
    basis,
    secrecy: "engine-internal" as const,
    expected_version: 0,
  };
  const lawfulState = {
    canonical_time: g.input.chronology.document.time,
    last_transaction: null,
    continuation: null,
  };
  const stateW: Write = {
    key: TEMPORAL_STATE_KEY,
    value: (o.state ? o.state(lawfulState) : lawfulState) as Write["value"],
    ...meta,
    ...o.stateWrite,
  };
  const originW: Write = {
    key: TEMPORAL_ORIGIN_KEY,
    value: (o.originValue !== undefined
      ? o.originValue
      : o.origin
        ? o.origin(lawful!)
        : lawful) as Write["value"],
    ...meta,
    ...o.originWrite,
  };
  const picked = [
    ...(o.omit === "state" ? [] : [stateW]),
    ...(o.omit === "origin" ? [] : [originW]),
  ];
  const writes = [
    ...(o.order === "origin-first" ? picked.reverse() : picked),
    ...(o.extraWrites ?? []),
  ];
  return {
    campaign_id: h.campaignId,
    group_id: `forged-pair:${tag}:group`,
    intent_id: `forged-pair:${tag}:intent`,
    owner: "temporal_kernel",
    facet: "temporal_coordination",
    cause: `forged-pair:${tag}:cause`,
    rule: o.rule ?? TEMPORAL_CAPTURED_V2_GENESIS_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: o.reads ?? [
      { key: g.completionKey, version: g.completion.version },
      { key: g.inputKey, version: g.inputFact.version },
    ],
    depends_on: o.depends_on ?? [g.completion.provenance.group_id, g.inputFact.provenance.group_id],
    writes,
    ...o.group,
  };
}

export interface TracedStep {
  readonly group: CommitGroup;
  readonly before: CampaignState;
  readonly after: CampaignState;
}

/**
 * The shipped fixture admission with a recorder: the REAL bound incremental states the core judged each group against. A group can
 * then be handed to `admission.check` or `admission.verifyHistorical` with the exact pre-state it would have met (a copied map is
 * rejected by the C5 fence view first, so only the core's own state objects are used).
 */
export function tracedAdmission(base: WriteAdmission = fixtureCanonicalAdmission) {
  const trace: TracedStep[] = [];
  const admission: WriteAdmission = {
    ...base,
    committedView(before, after, group) {
      base.committedView?.(before, after, group);
      trace.push({ group, before, after });
    },
  };
  return { admission, trace };
}

/** A schema-valid origin naming pins that need not exist: for prefixes with no bootstrap record, where nothing real can be attested. */
export const syntheticOrigin = (campaignId: string): TemporalOrigin => ({
  format: "immortalis-temporal-origin",
  format_version: 1,
  campaign_id: campaignId,
  origin: { unit: CLOCK_UNIT, value: 0 },
  scale: SI_SCALE_DECLARATION,
  chronology: {
    capture_format_version: 2,
    capture_ref: "fixture:capture:synthetic",
    capture_hash: "a".repeat(64),
    document_hash: "b".repeat(64),
    grade: "ORIGINAL_MESSAGE_VERIFIED",
  },
  governing: {
    completion: { fact_key: "synthetic/completion", version: 1 },
    input: { fact_key: "synthetic/input", version: 1 },
  },
});

/** A pair group with no governing records at all (a never-bootstrap prefix): the writes are well-formed, the claim has no support. */
export function syntheticPairGroup(h: Harness, o: PairOptions = {}): CommitGroup {
  const meta = {
    owner: "temporal_kernel",
    facet: "temporal_coordination",
    unit: null,
    basis: CAPTURED_CHRONOLOGY_BASIS.ORIGINAL_MESSAGE_VERIFIED,
    secrecy: "engine-internal" as const,
    expected_version: 0,
  };
  const stateW: Write = {
    key: TEMPORAL_STATE_KEY,
    value: {
      canonical_time: { unit: CLOCK_UNIT, value: 0 },
      last_transaction: null,
      continuation: null,
    },
    ...meta,
    ...o.stateWrite,
  };
  const originW: Write = {
    key: TEMPORAL_ORIGIN_KEY,
    value: (o.originValue ?? syntheticOrigin(h.campaignId)) as Write["value"],
    ...meta,
    ...o.originWrite,
  };
  const tag = o.tag ?? "synthetic";
  return {
    campaign_id: h.campaignId,
    group_id: `forged-pair:${tag}:group`,
    intent_id: `forged-pair:${tag}:intent`,
    owner: "temporal_kernel",
    facet: "temporal_coordination",
    cause: `forged-pair:${tag}:cause`,
    rule: o.rule ?? TEMPORAL_CAPTURED_V2_GENESIS_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: o.reads ?? [],
    depends_on: o.depends_on ?? [],
    writes: [
      ...(o.omit === "state" ? [] : [stateW]),
      ...(o.omit === "origin" ? [] : [originW]),
      ...(o.extraWrites ?? []),
    ],
    ...o.group,
  };
}

/**
 * Commits raw groups through a store with NO owner admission (a permissive store lets forged groups reach the journal; the hash chain
 * stays valid), then closes it. The campaign must be closed first. The journal is then judged only by a strict replay.
 */
export async function commitPermissively(dir: string, groups: readonly CommitGroup[]) {
  const opened = await openFileCampaign(dir, {
    owners: CANONICAL_OWNER_REGISTRY,
    admission: { check: () => null },
  });
  if (!opened.ok) throw new Error(JSON.stringify(opened.error));
  const results = [];
  for (const g of groups) results.push(await opened.value.commit(g));
  await opened.value.close();
  return results;
}

/** Opens a closed fixture campaign under the shipped fixture admission: with no usable checkpoint this is a strict historical replay. */
export const strictReopen = (dir: string, admission: WriteAdmission = fixtureCanonicalAdmission) =>
  CanonicalCampaign.open(dir, { testkitFixtureAdmission: admission });
