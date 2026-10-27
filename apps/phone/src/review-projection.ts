import { ExistenceContractSchema } from "@immortalis/contracts";
import { LocalitySetupSchema } from "../../../packages/operator/src/locality.ts";
import { mirrorItems } from "../../../packages/operator/src/original-pc.ts";
import type { ReviewRequest } from "../../../packages/operator/src/review-evidence.ts";
import type { OpeningSources } from "./reviews.ts";
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const words = (v: unknown): string => (typeof v === "string" ? v : "");
const phrase = (v: unknown): string => words(v).replaceAll("_", " ").replaceAll("-", " ");
const unit = (v: unknown): string => words(v);
const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(record) : []);
const statement = (v: unknown): string => (record(v) ? words(v.statement) : words(v));
function chronology(v: unknown): string[] {
  if (!record(v)) return [];
  const t = record(v.time) ? v.time : v;
  return [
    "Starting moment",
    words(v.statement),
    `Your authored time coordinate: ${String(t.value)} ${unit(t.unit)}. Establishing it passes no time.`,
  ];
}
function declaration(v: unknown): string[] {
  if (!record(v)) return [];
  return [
    "The scene you authored",
    words(v.domain_designation) || (record(v.domain) ? words(v.domain.designation) : ""),
    words(v.domain_topology) || (record(v.domain) ? words(v.domain.topology) : ""),
    words(v.closure_statement) || statement(v.closure),
    ...(v.source_ground
      ? [words(v.source_ground)]
      : rows(v.source_rights).map((r) => words(r.ground))),
    words(v.workforce_statement) || statement(v.workforce_scope),
    "Who and what is present comes from the existing world and population records. A change in those facts requires a current declaration; this grants no unestablished claim, cooperation or elapsed time.",
  ];
}
function preparation(v: unknown): string[] {
  if (!record(v)) return [];
  // These are quotations of already accepted claims; identities and the owner recipe are retained privately.
  return [
    "Your accepted handling claims",
    words(v.actuator_quote),
    words(v.traversal_quote),
    words(v.cycle_quote),
    ...(typeof v.reserve_condition === "string"
      ? [`The local reserve starts empty and keeps gathered material ${v.reserve_condition}.`]
      : []),
    "Preparation adds no material, right, labour, observation or elapsed time. The referee must establish what these claims support.",
  ];
}
function findings(v: unknown, labels = new Map<string, string>()): string[] {
  if (!record(v)) return [];
  const result: string[] = [];
  for (const i of rows(v.items)) {
    const text = labels.get(words(i.item_id)) ?? "";
    const accepted = ["INTRINSIC_PC", "ENTRY_ENVELOPE_FINITE"].includes(words(i.class));
    result.push(
      `${i.class === "ENTRY_ENVELOPE_FINITE" ? "Accepted as a finite starting-envelope claim" : accepted ? "Accepted as part of your character" : i.class === "UNRESOLVED_PC" ? "Still open" : "Not accepted as your own"}${text ? `: ${text}` : "."}`,
    );
    if (i.grounds) result.push(words(i.grounds));
    if (i.evidence_quote) result.push(`The words being read: ${words(i.evidence_quote)}`);
    if (i.intrinsic_excerpt)
      result.push(`Only this part concerns your character: ${words(i.intrinsic_excerpt)}`);
    if (i.clarification) result.push(words(i.clarification));
  }
  for (const [key, label] of [
    ["reading", "Starting presence"],
    ["embodiment", "Physical form"],
    ["presence", "Physical presence"],
  ]) {
    const reading = v[key!];
    if (!record(reading)) continue;
    const modes: Record<string, string> = {
      NATIVE_ALREADY_THERE: "originally, already present here",
      SINGLE_MATERIAL_BODY: "one material body",
      NATIVE_AT_THIS_LOCUS: "originally present at this place",
      AMBIGUOUS: "not yet clear",
    };
    result.push(
      `${label}: ${modes[words(reading.mode)] ?? phrase(reading.mode)}.`,
      words(reading.grounds),
    );
    if (reading.evidence_quote) result.push(`Your words: ${words(reading.evidence_quote)}`);
  }
  for (const a of rows(v.assessments))
    if (a.relation !== "NOT_RELEVANT") result.push(words(a.grounds), words(a.evidence_quote));
  for (const a of rows(v.external_claims))
    result.push(`Not established as a world fact: ${words(a.evidence_quote)}`, words(a.grounds));
  if (v.clarification) result.push(words(v.clarification));
  return result.length ? ["The referee’s findings", ...result] : [];
}
/** Human semantic projection only. The exact subject, source recipe, actor and basis stay in the private receipt/digest. */
export function projectReview(request: ReviewRequest, source: OpeningSources): string {
  const s: unknown = JSON.parse(request.subject);
  if (!record(s)) throw new Error("review projection unavailable");
  let lines: string[];
  if (request.verb === "establish-locality") {
    const parsed = LocalitySetupSchema.safeParse(request.proposal);
    if (!parsed.success) throw new Error("complete setting projection unavailable");
    const { world, locus, source: material } = parsed.data;
    lines = [
      "Review the setting",
      world.premise,
      world.reference_causal_basis.established_canon,
      "Material world-law departures",
      ...(world.material_world_law_departures.length
        ? world.material_world_law_departures
        : ["None authored."]),
      ...world.insertion_supporting_constraints.map((c) => `${c.aspect}: ${c.statement}`),
      locus.designation,
      ...locus.constraints.map((c) => `${c.aspect}: ${c.statement}`),
      material.statement,
      `Exactly ${material.quantity.amount} ${unit(material.quantity.unit)} of ${material.material_class} at the ${material.dimension}; nothing has been gathered.`,
      ...material.access_facts.map((a) => `${a.aspect}: ${a.statement}`),
      ...chronology(source.setting?.chronology),
      ...declaration(source.setting?.declaration),
      ...(source.setting?.reserve_condition
        ? [
            `Gathered material will be kept ${source.setting.reserve_condition}; the reserve starts empty.`,
          ]
        : []),
      "These are physical setting premises. They create no character, perception or knowledge, grant no extraction permission and pass no time.",
    ];
  } else if (request.verb === "keep-character") {
    const parsed = ExistenceContractSchema.safeParse(s.contract);
    if (parsed.success) {
      const items = mirrorItems(parsed.data);
      let section = "";
      lines = [
        "Review your character",
        "You retain the character’s consequential choices; this review grants no standing delegation.",
        ...request.shown
          .filter((line) => line.includes("IMPORTANT - take a moment"))
          .map((line) => line.replace(/^\|\s*/, "")),
      ];
      for (const item of items) {
        if (item.section !== section) {
          section = item.section;
          lines.push(section);
        }
        lines.push(`${item.label}: ${item.text}`);
      }
      lines.push(...findings(request.interpretation, new Map(items.map((i) => [i.id, i.text]))));
      // Older trusted terminals may omit structured findings. Preserve their material words, never their console IDs or enum labels.
      if (!request.interpretation)
        lines.push(
          ...request.shown
            .filter((l) => l.startsWith("|   ["))
            .map((l) =>
              l
                .replace(/^\|\s*\[accepted as yours: [^\]]+\]\s*/, "Accepted as your own: ")
                .replace(/^\|\s*\[NOT accepted: [^\]]+\]\s*/, "Not accepted as your own: "),
            ),
        );
    } else lines = [...request.shown]; // simple trusted test/adapter subjects; no raw schema structure is projected
    if (source.generation?.presence)
      lines.push(
        "Where you begin",
        source.generation.presence,
        "The same reviewed presence may establish native binding and stationary physical location only if the referee and owners support it. This grants no perception, action, movement, rights or time.",
      );
    lines.push(...preparation(source.generation?.preparation));
  } else if (request.verb === "declare-closed-setting") lines = [...declaration(s.declaration)];
  else if (request.verb === "initialize-time") lines = chronology(s.chronology);
  else if (request.verb === "prepare-collection") {
    const setup = record(s.setup) ? s.setup : {};
    const mechanism = record(setup.mechanism) ? setup.mechanism : {};
    const reserve = record(setup.reserve) ? setup.reserve : {};
    const basis = record(setup.extraction_basis) ? setup.extraction_basis : {};
    lines = [
      "Review the accepted-claim preparation",
      statement(mechanism.actuator),
      statement(mechanism.traversal),
      words(mechanism.cycle_quote),
      `The reserve starts empty and keeps gathered ${words(reserve.material_class)} ${words(reserve.condition)}.`,
      statement(basis.relies_on),
      "These are projections of already accepted claims and physical access facts. Preparation adds no material, right, workforce, knowledge or time. A separate referee reading must establish the supported handling cycle.",
    ];
  } else if (request.verb === "place-character" || request.verb === "establish-character-locus")
    lines = [
      "Review your starting presence",
      words(s.statement),
      ...findings(request.interpretation),
      "This establishes only the supported starting presence. It grants no perception, action, capability, rights, cooperation or elapsed time.",
    ];
  else
    lines = request.shown
      .map((l) => l.replace(/^\|\s*/, ""))
      .filter((l) => !/^\+---|^OOC DEVELOPMENT|^character:|^campaign:|^operator:/.test(l));
  return lines.filter((l) => l.length > 0).join("\n\n");
}
