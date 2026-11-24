import {
  BoundaryIndexSchema,
  OWNER_EPISTEMIC_ACCESS,
  PcStandingLedgerHeadSchema,
  PcStandingLedgerVersionSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TemporalObjectSchema,
  accessEventKey,
  compareTime,
  temporalObjectKey,
  type CanonicalTime,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  GmWaitCatalogueManifestV2Schema,
  catalogueDigest,
  validateManifest,
  verifySuppliedDigest,
  type DigestAuthority,
  type GmWaitCatalogueManifestV2,
} from "../../packages/engine/src/gm-wait-catalogue.ts";
import {
  NEGATIVE_TWIN_CLASSES,
  NO_HEALTH_OWNER_AUTHORITY,
  NO_PROVEN_FIRST_OPTION_AUTHORITY,
  P7_STATUS,
  isIssuedProofClosed,
  providerId,
  readCandidateKnowledge,
  readOwnerFact,
  type AbilityAuthority,
  type EvidenceLedger,
  type FirstOptionAuthority,
  type MemberVerdict,
  type OwnerFactRef,
} from "./proof.ts";
import {
  isObservationEarnedFact,
  packetOfKey,
} from "../../packages/engine/src/epistemic/declaration.ts";

/**
 * F-014B P-7 E0 - the pure internal candidate evaluator of the earliest genuine PC choice and the PC's actual knowledge time
 * (Temporal Kernel v2 section 10: Event Time, Observation Time, Report/Transmission Time, actor-specific Knowledge Time, the earliest
 * Actionable Knowledge Time, standing policies; BLUE final decision N9.3; Two-Blocker v0.3 section 8.1(2)-(3)).
 *
 * MECHANISM ONLY and NON-WRITING. It reads typed, source-qualified evidence from a read-only ledger and returns an INTERNAL, PRIVATE
 * candidate. It is never a verdict: `certified` is the literal `false`, nothing is written, and the result is not reachable from any
 * player or GM surface (`gmFacingProjection` discloses nothing). It is called by nobody: the protected Temporal coordinator does not
 * consult it (see `P7_INTEGRATION_SEAM_STATEMENT`).
 *
 * WHAT IT NEVER DOES. It does not predict a future scene, query a future boundary index entry beyond the single current index fact,
 * decide comprehension, significance or standing-contingency coverage (those stay the GM's write-once verdict, Two-Blocker 8.1(3)),
 * invent a player decision, normalise Health, or push time past the earliest possible choice. Anything unknown, unproved or
 * contradictory is NOT_PROVEN, privately. A positive candidate additionally requires every route member to be a PROOF_CLOSED_CANDIDATE
 * verdict ISSUED by the checker (a forged verdict object is refused).
 */

export const EVALUATOR_REASONS = [
  "MANIFEST_INVALID",
  "CATALOGUE_NOT_CURRENT",
  "WINDOW_INVALID",
  "DUE_OBJECT_INVALID",
  "ROUTE_MEMBER_UNKNOWN",
  "ROUTE_MEMBER_NOT_PROOF_CLOSED",
  "EVENT_NOT_IN_WINDOW",
  "BOUNDARY_INDEX_ABSENT",
  "SAME_INSTANT_ENTRY_UNVERIFIED",
  "CANDIDATE_OMITTED",
  "SAME_INSTANT_UNORDERED_COMPETITOR",
  "CANDIDATE_UNVERIFIED",
  "PACKET_PRECEDES_ACCESS",
  "ABILITY_UNKNOWN",
  "FIRST_OPTION_UNPROVEN",
  "FIRST_OPTION_AFTER_TARGET",
  "STANDING_POLICY_UNKNOWN",
  "STANDING_POLICY_REQUIRES_ADJUDICATION",
  "EARLIER_CHOICE_NOT_EXCLUDED",
] as const;
export type EvaluatorReason = (typeof EVALUATOR_REASONS)[number];

export interface CandidateRef {
  /** the committed access event (the Epistemic owner's own fact) */
  readonly event: OwnerFactRef;
  /** the original Temporal object that declares the packet-formation stage for it; null only for an event-only BROADCAST_EXPOSURE */
  readonly packet_object: OwnerFactRef | null;
}

export interface TwinExclusion {
  readonly twin: (typeof NEGATIVE_TWIN_CLASSES)[number];
  readonly ledger_id: string;
  readonly key: string;
}

export interface EarliestChoiceInput {
  /** the opening basis and the unresolved target of the open transaction X; the evaluator is only called for a boundary X actually crosses */
  readonly window: { readonly from: CanonicalTime; readonly to: CanonicalTime };
  readonly pc: { readonly entity_id: string };
  /** the original owner's committed Temporal object whose earned boundary is the owner event I under test */
  readonly due: OwnerFactRef;
  /** every candidate PC access route the cut offers (a candidate is not a prediction: its event fact is committed) */
  readonly candidates: readonly CandidateRef[];
  /** the checker's ISSUED verdicts for the members on this route; a missing or unissued one refuses */
  readonly route_proofs: readonly MemberVerdict[];
  /** the PC's committed standing-instruction ledger (head and its current version), or null when none was read */
  readonly standing: { readonly head: OwnerFactRef; readonly version: OwnerFactRef } | null;
  /** negative-history twins for the earlier possibilities (N9.3), each proved absent in a separately committed twin ledger */
  readonly exclusions: readonly TwinExclusion[];
}

export interface EvaluatorContext {
  readonly manifest: unknown;
  readonly authority: DigestAuthority;
  readonly ledger: EvidenceLedger;
  readonly twins?: ReadonlyMap<string, EvidenceLedger>;
  readonly abilityAuthority?: AbilityAuthority;
  readonly firstOptionAuthority?: FirstOptionAuthority;
}

interface ResultBase {
  readonly status: typeof P7_STATUS;
  /** never certified: this evaluator is not accepted, not integrated and not a classification */
  readonly certified: false;
  /** the evaluator performs no canonical write of any kind */
  readonly writes: readonly [];
  readonly visibility: "PRIVATE_INTERNAL";
  /** a result that depended on a labelled test-double authority can support nothing but a fixture */
  readonly fixture_dependent: boolean;
}

export type EarliestChoiceResult =
  | (ResultBase & {
      readonly result: "NOT_PROVEN";
      readonly reasons: readonly { readonly code: EvaluatorReason; readonly detail: string }[];
    })
  | (ResultBase & {
      readonly result: "CANDIDATE_NO_ACTIONABLE_KNOWLEDGE";
      readonly instant: CanonicalTime;
    })
  | (ResultBase & {
      readonly result: "CANDIDATE_EARLIEST_CHOICE";
      readonly instant: CanonicalTime;
      readonly basis: {
        /** Event Time of the owner stage under test (Temporal section 10) */
        readonly owner_event_instant: CanonicalTime;
        /** F-014D access-established basis time: when lawful access to the payload became available to the recipient */
        readonly access_established_at: CanonicalTime;
        /** the Temporal boundary at which the packet-formation stage resolves (transmission/reception into the recipient's hands) */
        readonly packet_formed_at: CanonicalTime;
        /** the recipient's knowledge time: the later of the two above; never earlier than the packet exists */
        readonly knowledge_time: CanonicalTime;
        /** comprehension, significance and standing-contingency coverage are the GM's write-once verdict (Two-Blocker 8.1(3)), never derived here */
        readonly comprehension: "NOT_EVALUATED_GM_WRITE_ONCE_VERDICT_REQUIRED";
        readonly first_option_at: CanonicalTime;
        readonly event_key: string;
        /** the earliest genuine choice against the owner event under test: an earlier feasible choice wins over a later event */
        readonly relation_to_owner_event: "BEFORE" | "AT" | "AFTER";
      };
    });

const notProven = (
  reasons: { code: EvaluatorReason; detail: string }[],
  fixture = false,
): EarliestChoiceResult => ({
  status: P7_STATUS,
  certified: false,
  writes: [],
  visibility: "PRIVATE_INTERNAL",
  fixture_dependent: fixture,
  result: "NOT_PROVEN",
  reasons,
});

const cmpTime = (a: CanonicalTime, b: CanonicalTime): number => compareTime(a, b) ?? Number.NaN;
const laterOf = (a: CanonicalTime, b: CanonicalTime): CanonicalTime => (cmpTime(a, b) >= 0 ? a : b);

/** Every produced fact key a stage declares, and every key it reads (for the causal-precedence test of Temporal section 15). */
function producedKeys(o: TemporalObject): Set<string> {
  return new Set(o.dependencies.flatMap((d) => d.produces));
}
function readKeys(o: TemporalObject): Set<string> {
  return new Set(o.dependencies.flatMap((d) => d.reads.map((r) => r.source.fact_key)));
}
const intersects = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => {
  for (const x of a) if (b.has(x)) return true;
  return false;
};

export function evaluateEarliestChoice(
  input: EarliestChoiceInput,
  ctx: EvaluatorContext,
): EarliestChoiceResult {
  const reasons: { code: EvaluatorReason; detail: string }[] = [];
  const refuse = (code: EvaluatorReason, detail: string): void => {
    reasons.push({ code, detail });
  };
  // 1. the catalogue: a verified, current, well-formed manifest (identity only; never evidence of a proof)
  const parsed = GmWaitCatalogueManifestV2Schema.safeParse(ctx.manifest);
  if (!parsed.success || validateManifest(parsed.data).length > 0)
    return notProven([{ code: "MANIFEST_INVALID", detail: "manifest" }]);
  const m: GmWaitCatalogueManifestV2 = parsed.data;
  const digest = catalogueDigest(m);
  const verdict = verifySuppliedDigest(digest, ctx.authority);
  if (verdict !== "OK_CURRENT")
    return notProven([{ code: "CATALOGUE_NOT_CURRENT", detail: verdict }]);
  // 2. the window
  const w = input.window;
  const wc = compareTime(w.from, w.to);
  if (wc === null || wc !== -1)
    return notProven([{ code: "WINDOW_INVALID", detail: "from must precede to in one unit" }]);
  // 3. the due owner event I: a committed original owner object whose earned boundary lies inside the window
  const dueRead = readOwnerFact(input.due, ctx.ledger, m);
  if (!dueRead.ok) return notProven([{ code: "DUE_OBJECT_INVALID", detail: dueRead.reason }]);
  const dueParsed = TemporalObjectSchema.safeParse(dueRead.fact.value);
  if (!dueParsed.success || dueParsed.data.next_boundary === null)
    return notProven([{ code: "DUE_OBJECT_INVALID", detail: "no earned boundary" }]);
  const due = dueParsed.data;
  const I = due.next_boundary!.at;
  const afterFrom = compareTime(w.from, I);
  const atOrBeforeTo = compareTime(I, w.to);
  if (afterFrom !== -1 || atOrBeforeTo === null || atOrBeforeTo === 1)
    return notProven([{ code: "EVENT_NOT_IN_WINDOW", detail: "the boundary is not crossed by X" }]);
  // 4. the route members: every stage provider the due object declares, the packet provider and the applicable Epistemic route
  const required = new Set<string>();
  for (const d of due.dependencies) {
    const key = providerId(d.stage.owner_operation);
    if (!m.providers.some((p) => providerId(p) === key))
      refuse("ROUTE_MEMBER_UNKNOWN", `PROVIDER:${key}`);
    required.add(`PROVIDER:${key}`);
  }
  required.add("PROVIDER:epistemic_access|epistemic-form-accessible-packet");
  // 5. the candidates: derived through the Epistemic owner's own pure derivation (receipt and intelligibility), never asserted
  type Knowing = {
    readonly event_key: string;
    /** access-established basis time (F-014D) and packet-formation boundary (Temporal): distinct stages, kept distinct */
    readonly E: CanonicalTime;
    readonly P: CanonicalTime;
    readonly K: CanonicalTime;
    readonly channel: "PERCEPTION" | "SPEECH";
  };
  const knowing: Knowing[] = [];
  const nonReceiving: string[] = [];
  const packetObjects: string[] = [];
  for (const c of input.candidates) {
    let obj: TemporalObject | null = null;
    if (c.packet_object !== null) {
      const objRead = readOwnerFact(c.packet_object, ctx.ledger, m);
      const parsedObj = objRead.ok ? TemporalObjectSchema.safeParse(objRead.fact.value) : null;
      if (!objRead.ok || parsedObj === null || !parsedObj.success) {
        refuse("CANDIDATE_UNVERIFIED", c.packet_object.key);
        continue;
      }
      obj = parsedObj.data;
      packetObjects.push(obj.object_id);
    }
    const k = readCandidateKnowledge(m, ctx.ledger, c.event, input.pc.entity_id, obj);
    if (!k.ok) {
      // a definite non-receipt for THIS PC is not knowledge; every other failure is unknown and refuses
      if (k.reason === "BROADCAST_NOT_RECEIPT" || k.reason === "WRONG_RECIPIENT") {
        nonReceiving.push(c.event.key);
        required.add(
          k.reason === "BROADCAST_NOT_RECEIPT"
            ? "EPISTEMIC_ROUTE:BROADCAST_EXPOSURE"
            : "EPISTEMIC_ROUTE:NON_OBSERVATION_ACCESS",
        );
      } else refuse("CANDIDATE_UNVERIFIED", `${c.event.key}: ${k.reason}`);
      continue;
    }
    // a receiving candidate must name its packet-formation stage and that stage must carry an earned boundary
    const P = obj?.next_boundary?.at;
    if (P === undefined) {
      refuse("CANDIDATE_UNVERIFIED", `${c.event.key}: no packet-formation boundary`);
      continue;
    }
    const eventFact = ctx.ledger.get(c.event.key)!;
    required.add(
      "EPISTEMIC_ROUTE:" +
        (isObservationEarnedFact(eventFact) ? "DIRECT_OBSERVATION" : "NON_OBSERVATION_ACCESS"),
    );
    // a packet cannot form before the access it renders was established; knowledge time is the later of the two
    const order = compareTime(P, k.established_at);
    if (order === null || order === -1) {
      refuse("PACKET_PRECEDES_ACCESS", c.event.key);
      continue;
    }
    const channel = (eventFact.value as { channel: "PERCEPTION" | "SPEECH" }).channel;
    knowing.push({
      event_key: k.event_key,
      E: k.established_at,
      P,
      K: laterOf(k.established_at, P),
      channel,
    });
  }
  for (const key of required) {
    const v = input.route_proofs.find((x) => x.member === key);
    if (v === undefined || !isIssuedProofClosed(v) || v.catalogue_sha256 !== digest)
      refuse("ROUTE_MEMBER_NOT_PROOF_CLOSED", key);
  }
  // 6. the active boundary index, read once, bounded to the window: (a) every packet formation it schedules inside the window must be a
  //    candidate the caller named (an omitted earlier candidate cannot be hidden), and (b) every other entry due at I must be causally
  //    ordered against the due object (Temporal section 15). Entries outside the window are never read.
  const indexFact = ctx.ledger.get(TEMPORAL_BOUNDARY_INDEX_KEY);
  const indexParsed =
    indexFact === undefined ? null : BoundaryIndexSchema.safeParse(indexFact.value);
  if (indexParsed === null || !indexParsed.success)
    refuse("BOUNDARY_INDEX_ABSENT", TEMPORAL_BOUNDARY_INDEX_KEY);
  else {
    const named = new Set(input.candidates.map((c) => c.event.key));
    for (const e of indexParsed.data.entries) {
      const afterFromE = compareTime(w.from, e.at);
      const beforeToE = compareTime(e.at, w.to);
      if (afterFromE !== -1 || beforeToE === null || beforeToE === 1) continue;
      const isDue = e.object_id === due.object_id;
      const other = isDue ? undefined : ctx.ledger.get(temporalObjectKey(e.object_id));
      const otherParsed =
        isDue || other === undefined ? null : TemporalObjectSchema.safeParse(other.value);
      if (!isDue && (otherParsed === null || !otherParsed.success)) {
        refuse("SAME_INSTANT_ENTRY_UNVERIFIED", e.object_id);
        continue;
      }
      const entryObject: TemporalObject = isDue ? due : otherParsed!.data!;
      for (const d of entryObject.dependencies) {
        if (d.stage.owner_operation.owner !== OWNER_EPISTEMIC_ACCESS) continue;
        const target = packetOfKey(d.stage.prospective_result_id);
        if (target !== null && !named.has(accessEventKey(target.eventId)))
          refuse("CANDIDATE_OMITTED", accessEventKey(target.eventId));
      }
      if (isDue || compareTime(e.at, I) !== 0 || packetObjects.includes(e.object_id)) continue;
      const ordered =
        intersects(producedKeys(due), readKeys(entryObject)) ||
        intersects(producedKeys(entryObject), readKeys(due));
      if (!ordered) refuse("SAME_INSTANT_UNORDERED_COMPETITOR", e.object_id);
    }
  }
  // 7. the PC: ability to receive, standing instructions, the first native option (each from its own authority; defaults refuse)
  const ability = ctx.abilityAuthority ?? NO_HEALTH_OWNER_AUTHORITY;
  const firstOption = ctx.firstOptionAuthority ?? NO_PROVEN_FIRST_OPTION_AUTHORITY;
  let fixture = false;
  const actionable: {
    event_key: string;
    E: CanonicalTime;
    P: CanonicalTime;
    K: CanonicalTime;
    F: CanonicalTime;
    A: CanonicalTime;
  }[] = [];
  for (const c of knowing) {
    const q = { pc_id: input.pc.entity_id, modality: c.channel, at: c.K } as const;
    const a = ability.read(q, ctx.ledger);
    fixture ||= a.fixture;
    if (a.state === "UNKNOWN") {
      refuse("ABILITY_UNKNOWN", `${c.event_key} via ${a.authority_id}`);
      continue;
    }
    if (a.state === "IMPAIRED") {
      // a source-qualified impairment: the PC does not actually receive; this candidate yields no knowledge
      nonReceiving.push(c.event_key);
      continue;
    }
    const f = firstOption.read(q, ctx.ledger);
    fixture ||= f.fixture;
    if (f.state !== "AVAILABLE_AT") {
      refuse("FIRST_OPTION_UNPROVEN", `${c.event_key} via ${f.authority_id}`);
      continue;
    }
    const A = laterOf(c.K, f.at);
    if (compareTime(A, w.to) === 1) {
      refuse("FIRST_OPTION_AFTER_TARGET", c.event_key);
      continue;
    }
    actionable.push({ event_key: c.event_key, E: c.E, P: c.P, K: c.K, F: f.at, A });
  }
  if (actionable.length > 0 || knowing.length > 0) {
    if (input.standing === null)
      refuse("STANDING_POLICY_UNKNOWN", "no standing-instruction ledger read");
    else {
      const head = readOwnerFact(input.standing.head, ctx.ledger, m);
      const ver = readOwnerFact(input.standing.version, ctx.ledger, m);
      const headParsed = head.ok ? PcStandingLedgerHeadSchema.safeParse(head.fact.value) : null;
      const verParsed = ver.ok ? PcStandingLedgerVersionSchema.safeParse(ver.fact.value) : null;
      if (
        headParsed === null ||
        !headParsed.success ||
        verParsed === null ||
        !verParsed.success ||
        headParsed.data.pc_id !== input.pc.entity_id ||
        verParsed.data.pc_id !== input.pc.entity_id ||
        headParsed.data.current.fact_key !== input.standing.version.key
      )
        // an instruction is present or the ledger is not the PC's: whether it covers the discretion is the GM's write-once verdict
        refuse("STANDING_POLICY_REQUIRES_ADJUDICATION", input.standing.head.key);
    }
  }
  // 8. earlier possibilities: complete negative-history twins, each absent in a separately committed twin ledger
  for (const cls of NEGATIVE_TWIN_CLASSES) {
    const ex = input.exclusions.filter((x) => x.twin === cls);
    const ok =
      ex.length > 0 &&
      ex.every((x) => {
        const twin = ctx.twins?.get(x.ledger_id);
        return (
          twin !== undefined && ctx.ledger.get(x.key) !== undefined && twin.get(x.key) === undefined
        );
      });
    if (!ok) refuse("EARLIER_CHOICE_NOT_EXCLUDED", cls);
  }
  if (reasons.length > 0) return notProven(reasons, fixture);
  const base = {
    status: P7_STATUS,
    certified: false,
    writes: [],
    visibility: "PRIVATE_INTERNAL",
    fixture_dependent: fixture,
  } as const;
  if (actionable.length === 0)
    return { ...base, result: "CANDIDATE_NO_ACTIONABLE_KNOWLEDGE", instant: I };
  const earliest = actionable.reduce((a, b) => (cmpTime(b.A, a.A) < 0 ? b : a));
  return {
    ...base,
    result: "CANDIDATE_EARLIEST_CHOICE",
    instant: earliest.A,
    basis: {
      owner_event_instant: I,
      access_established_at: earliest.E,
      packet_formed_at: earliest.P,
      knowledge_time: earliest.K,
      comprehension: "NOT_EVALUATED_GM_WRITE_ONCE_VERDICT_REQUIRED",
      first_option_at: earliest.F,
      event_key: earliest.event_key,
      relation_to_owner_event: (["BEFORE", "AT", "AFTER"] as const)[
        (compareTime(earliest.A, I) ?? 0) + 1
      ]!,
    },
  };
}

/**
 * The GM-facing and player-facing projection of ANY candidate result. It is a constant: the evaluator's output is source-private
 * (event identity, instants, reasons, candidate keys), and nothing is disclosed before the protected engine result. The GM's lawful
 * privileged knowledge is a separate, owner-qualified read and is not served from this internal candidate. NPK presentation is
 * recipient-qualified by F-014D and happens only after the owner-bound writers record what occurred.
 */
export function gmFacingProjection(result: EarliestChoiceResult): {
  readonly kind: "WITHHELD_PENDING_PROTECTED_RESULT";
} {
  void result;
  return { kind: "WITHHELD_PENDING_PROTECTED_RESULT" };
}
