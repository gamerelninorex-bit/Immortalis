import { createHash, generateKeyPairSync } from "node:crypto";
import {
  FIXTURE_NAMESPACE_PREFIX,
  canonicalJson,
  type AuthoredEvidence,
  type Pin,
  type Selection,
  type SetupPhase,
} from "@immortalis/contracts";
import {
  inputHashOfDelivered,
  selectionLeafPaths,
  setupMessageHash,
  sha256Bytes,
} from "@immortalis/engine";

/**
 * T1 FIXTURES for the Initial Locality Bootstrap v0.9 — TESTKIT ONLY. Everything here is synthetic and carries the reserved
 * `fixture:` namespace; production capture/Input verification, serving startup, load and replay reject that namespace. Nothing here
 * is, or can be reported as, original-message authenticity, a genuine isolation-capable model driver or a named client: those are
 * the T2/T3 prerequisites this handoff does not select (OB-030). Signing keys are generated per test run; there are no secrets in
 * this repository.
 */
export const FIXTURE_DRIVER_ID = `${FIXTURE_NAMESPACE_PREFIX}driver:scripted-1`;
export const FIXTURE_KEY_ID = `${FIXTURE_NAMESPACE_PREFIX}key:runner-1`;
export const FIXTURE_MESSAGE_METHOD = `${FIXTURE_NAMESPACE_PREFIX}method:original-message-1`;
export const FIXTURE_OPERATOR_METHOD = `${FIXTURE_NAMESPACE_PREFIX}method:operator-record-only-1`;

const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

export interface FixtureRunnerKeys {
  readonly keyId: string;
  readonly privateKeyPkcs8Base64: string;
  readonly publicKeySpkiBase64: string;
}

/** A fresh Ed25519 key pair for ONE test run. */
export function generateFixtureRunnerKeys(keyId = FIXTURE_KEY_ID): FixtureRunnerKeys {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    keyId,
    privateKeyPkcs8Base64: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
    publicKeySpkiBase64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  };
}

/** The deterministic proof hash a fixture method "attests" for a message: a synthetic double, not a human-authorship proof. */
export const fixtureProofHash = (messageHash: string): string =>
  sha(`fixture-proof:${messageHash}`);

export interface FixtureClaim {
  readonly method_id: string;
  readonly original_message_hash: string | null;
  readonly attestation_hash: string;
  readonly message_hash: string;
}

/**
 * The explicitly testkit-only FixtureEvidenceVerifier. It accepts only fixture-namespaced methods whose attestation is the
 * deterministic synthetic double, and reports tier T1. The production service cannot select it through MCP, an input flag or
 * deployment configuration: nothing outside tests/testkit imports this module (a static security test enforces it).
 */
export class FixtureEvidenceVerifier {
  readonly tier = "T1_DOUBLE" as const;
  readonly report =
    "T1 mechanism evidence only: a synthetic proof double, not original human-message authenticity" as const;

  verifyOriginalMessage = async (claim: FixtureClaim): Promise<boolean> =>
    claim.method_id.startsWith(FIXTURE_NAMESPACE_PREFIX) &&
    claim.original_message_hash === claim.message_hash &&
    claim.attestation_hash === fixtureProofHash(claim.message_hash);

  /** A qualifying-looking Input.author for a message (still fixture-labelled). */
  authoredEvidence(args: {
    readonly message: string;
    readonly client?: string;
    readonly oauth_grant?: string;
    readonly request_ref?: string;
  }): AuthoredEvidence {
    const messageHash = setupMessageHash(args.message);
    return {
      grade: "ORIGINAL_MESSAGE_VERIFIED",
      client: args.client ?? "fixture:client:1",
      oauth_grant: args.oauth_grant ?? "fixture:grant:1",
      request_ref: args.request_ref ?? "fixture:request:1",
      original_message_hash: messageHash,
      method_id: FIXTURE_MESSAGE_METHOD,
      proof_hash: fixtureProofHash(messageHash),
    };
  }
}

export interface ScriptedAnswers {
  /** returns the SCOPE output (without the echo fields, which the driver adds from the dispatch header) */
  readonly scope: (input: Record<string, unknown>) => Record<string, unknown>;
  /** returns the SCENE output body: {kind:"SELECTION",selection} or {kind:"UNRESOLVED",reason,explanation} */
  readonly scene: (input: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * A SCRIPTED isolated driver double. It sees exactly the fixed instructions and the engine-built producer-input bytes — and records
 * them so a test can compare complete producer input bytes across later-goal variants. It is not a model and proves no isolation.
 */
export class ScriptedIsolatedDriver {
  readonly driver_id: string;
  readonly config_hash: string;
  readonly calls: { phase: SetupPhase; instructions: string; producerInput: Uint8Array }[] = [];
  readonly #answers: ScriptedAnswers;
  readonly #behaviour: {
    throwAfterSend: boolean | readonly SetupPhase[];
    rawOverride: Partial<Record<SetupPhase, Uint8Array>>;
  };

  constructor(
    answers: ScriptedAnswers,
    options: {
      driverId?: string;
      /** crash after the send window opened, for the given phases (or all, when true) */
      throwAfterSend?: boolean | readonly SetupPhase[];
      /** return these exact raw bytes instead of the scripted object (invalid-output / duplicate-key falsifiers) */
      rawOverride?: Partial<Record<SetupPhase, Uint8Array>>;
    } = {},
  ) {
    this.driver_id = options.driverId ?? FIXTURE_DRIVER_ID;
    this.config_hash = sha(`fixture-driver-config:${this.driver_id}`);
    this.#answers = answers;
    this.#behaviour = {
      throwAfterSend: options.throwAfterSend ?? false,
      rawOverride: options.rawOverride ?? {},
    };
  }

  async run(args: {
    readonly phase: SetupPhase;
    readonly instructions: string;
    readonly producerInput: Uint8Array;
  }): Promise<{ raw: Uint8Array; context_manifest_hash: string }> {
    this.calls.push({
      phase: args.phase,
      instructions: args.instructions,
      producerInput: args.producerInput,
    });
    const crash = this.#behaviour.throwAfterSend;
    if (crash === true || (Array.isArray(crash) && crash.includes(args.phase)))
      throw new Error("driver crashed after the send window opened");
    const override = this.#behaviour.rawOverride[args.phase];
    if (override)
      return { raw: override, context_manifest_hash: sha256Bytes(Buffer.from(args.producerInput)) };
    const input = JSON.parse(Buffer.from(args.producerInput).toString("utf8")) as Record<
      string,
      unknown
    >;
    const echo = {
      task_id: input["task_id"],
      input_hash: inputHashOfDelivered(args.producerInput),
    };
    const body = args.phase === "SCOPE" ? this.#answers.scope(input) : this.#answers.scene(input);
    return {
      raw: Buffer.from(canonicalJson({ ...body, ...echo }), "utf8"),
      context_manifest_hash: sha256Bytes(
        Buffer.from(
          canonicalJson({
            instructions: args.instructions,
            producer_input_sha: sha256Bytes(args.producerInput),
          }),
          "utf8",
        ),
      ),
    };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Canonical scripted judgments (the fixture's authored-and-delegated interpretation; NOT a prewritten closure or verdict)
// ---------------------------------------------------------------------------------------------------------------------

export const FIXTURE_SETUP_MESSAGE =
  "Make a woodlot where collection is possible. Fill in whatever else the place needs.";
export const FIXTURE_DELEGATION_QUOTE = "Fill in whatever else the place needs.";

const FACETS = [
  "DOMAIN_BOUNDARY",
  "ACTOR_COVERAGE",
  "SOURCE_CLAIMS",
  "WORKFORCE_COVERAGE",
] as const;

/** A SCOPE judgment delegating every missing facet with an exact quote from the accepted instruction. */
export const delegatingScope = (
  over: Partial<Record<string, unknown>> = {},
): ((input: Record<string, unknown>) => Record<string, unknown>) => {
  return () => ({
    kind: "SCOPE",
    message_use: "SETUP_AUTHORSHIP_ONLY",
    facets: FACETS.map((facet) => ({
      facet,
      mode: "DELEGATED",
      evidence_quotes: [FIXTURE_DELEGATION_QUOTE],
      source_refs: [],
    })),
    restrictions: [],
    unhandled_constraints: [],
    clarification: null,
    ...over,
  });
};

export interface SelectionOptions {
  readonly horizonSeconds?: number;
  readonly actors?: Selection["actors"];
  readonly claimKind?: "NONE_ESTABLISHED" | "CLAIM_REQUIRED" | "UNRESOLVED";
  readonly claimant?: string | null;
  readonly closure?: Selection["closure"]["kind"];
}

/** The lawful positive selection: a CLOSED domain with no non-PC actor and no established source claim. */
export function delegatedSelection(
  input: Record<string, unknown>,
  options: SelectionOptions = {},
): Selection {
  const chronology = input["chronology"] as {
    time: { unit: string; value: number };
    statement: string;
  };
  const genesis = input["genesis"] as { fact_key: string; version: number }[];
  const source = genesis.find((g) => g.fact_key.includes("/source/"))!;
  const grant = input["grant"] as Pin;
  const kind = options.claimKind ?? "NONE_ESTABLISHED";
  const base: Omit<Selection, "provenance"> = {
    domain: { designation: "the woodlot", topology: "a single cleared stand" },
    closure: { kind: options.closure ?? "CLOSED", ground: "bounded by the stand's edge" },
    actors: options.actors ?? {
      kind: "NONE_IN_DOMAIN",
      constraints: [],
      ground: "no non-PC actor is in the domain",
    },
    source_claims: [
      {
        source: { fact_key: source.fact_key, version: source.version },
        kind,
        claimant: kind === "CLAIM_REQUIRED" ? (options.claimant ?? "the sawyer") : null,
        ground: kind === "NONE_ESTABLISHED" ? "no claim is established" : "a claim is owed",
      },
    ],
    workforce: { scope_statement: "no standing workforce works the woodlot" },
    coverage: {
      start: { ...chronology.time },
      end: {
        unit: chronology.time.unit,
        value: chronology.time.value + (options.horizonSeconds ?? 7200),
      },
      ground: "the opening hours of the scene",
    },
  };
  const provisional: Selection = { ...base, provenance: [] };
  const provenance = selectionLeafPaths(provisional).map((path) =>
    path === "coverage.start"
      ? {
          path,
          origin: "PLAYER_AUTHORED" as const,
          source_refs: [],
          evidence_quotes: [chronology.statement],
          grant: null,
        }
      : { path, origin: "PLAYER_DELEGATED" as const, source_refs: [], evidence_quotes: [], grant },
  );
  return { ...base, provenance };
}

export const delegatingScene =
  (options: SelectionOptions = {}) =>
  (input: Record<string, unknown>): Record<string, unknown> => ({
    kind: "SELECTION",
    selection: delegatedSelection(input, options),
  });
