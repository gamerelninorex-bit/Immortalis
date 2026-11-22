// F-014B B1 - the GM-wait catalogue census, manifest builder and byte-custody generator.
//
//   node --disable-warning=ExperimentalWarning --experimental-strip-types tools/gen-gm-wait-catalogue.ts --check   (default; fails on drift)
//   node --disable-warning=ExperimentalWarning --experimental-strip-types tools/gen-gm-wait-catalogue.ts --write   (writes the digest-named manifest and the current-digest module)
//   node --disable-warning=ExperimentalWarning --experimental-strip-types tools/gen-gm-wait-catalogue.ts --print   (prints digest, byte length and counts)
//
// MECHANISM ONLY. The census is measured from the ACTUAL declarations by two independent methods that must agree: runtime
// reflection over the exports of every module under the reflection roots, and a TypeScript-compiler AST scan of the declared source
// roots. Nothing here is a typed allow-list of providers, registrations or Closes. Every entry it produces is `UNDECLARED`; no
// capability is classified safe and no positive production verdict exists (see packages/engine/src/gm-wait-catalogue.ts).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import * as contracts from "@immortalis/contracts";
import {
  type CatalogueCensusV2,
  type GmWaitCatalogueManifest,
  type GmWaitCatalogueManifestV2,
  GM_WAIT_CATALOGUE_MANIFEST_VERSION,
  GmWaitCatalogueManifestV2Schema,
  catalogueCanonicalBytes,
  catalogueCoverageViolations,
  normalizeManifest,
  valueSchemaFingerprint,
} from "../packages/engine/src/gm-wait-catalogue.ts";
import { sha256Canonical, sha256Text } from "../packages/engine/src/hash.ts";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
} from "../packages/engine/src/owners/registry.ts";
import {
  storeBindings,
  type StageOwnerExtension,
} from "../packages/engine/src/owners/extension.ts";
import {
  canonicalAdmission,
  legacyContractAdmission,
  msCanonicalAdmission,
} from "../packages/engine/src/owners/admission.ts";
import { AUDIENCE_FACT_KIND_IDS } from "../packages/engine/src/epistemic/derive.ts";
import { inputBasisViolation } from "../packages/engine/src/culture/derive.ts";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_DIR = "packages/engine/gm-wait-catalogue/manifests";
export const CURRENT_MODULE = "packages/engine/src/gm-wait-catalogue-current.ts";
const V1_ARCHIVE_SHA256 = "f3393ad446efcd3915ecf081c5ce35fd041a5952a1a38848f9da1a8bf5c56062";
/** Roots the AST scan covers (production sources only: the testkit and the tests are fixtures, not production certification). */
export const AST_ROOTS = [
  "apps",
  "packages/contracts/src",
  "packages/engine/src",
  "packages/operator/src",
  "packages/protocol/src",
] as const;
/** Roots whose modules are imported and reflected (the operator and the apps hold executable bins, so they are AST-only). */
export const REFLECTION_ROOTS = [
  "packages/contracts/src",
  "packages/engine/src",
  "packages/protocol/src",
] as const;
export const EXCLUDED_ROOTS = ["packages/testkit", "tests"] as const;

// ---------------------------------------------------------------------------------------------
// The adopted inputs: pages the policy binds that no registered rule names. A closed constant, each natively verified.
// ---------------------------------------------------------------------------------------------

export interface AdoptedInput {
  readonly page_uuid: string;
  readonly native_pin: string;
  readonly label: string;
  readonly clauses: readonly string[];
  readonly ratification: { readonly page_uuid: string; readonly native_pin: string } | null;
  /** the recorded native verification: the page's `page_last_edited_at` read by a native page fetch on the date below */
  readonly verification: {
    readonly observed_page_last_edited_at: string;
    readonly verified_on: string;
  };
}

const verified = (pin: string, on = "2026-11-21") => ({
  observed_page_last_edited_at: pin,
  verified_on: on,
});
const P = {
  prospective: ["41a20af9-01e0-811f-9c75-d404f82674cc", "2026-11-16T15:18:44.683Z"],
  prospectiveRat: ["41a20af9-01e0-8129-b485-df13b56a38e5", "2026-11-16T15:29:12.183Z"],
  t1: ["41c20af9-01e0-817c-a9e8-dcb392e3b0d7", "2026-11-18T22:23:26.085Z"],
  t1Rat: ["41c20af9-01e0-81ba-9fd4-db4da81c8526", "2026-11-18T22:38:52.341Z"],
  calTime: ["41b20af9-01e0-81f3-9e42-d6c9cf596dbb", "2026-11-17T07:32:49.446Z"],
  calTimeRat: ["41c20af9-01e0-8183-91bc-cf32042552cb", "2026-11-18T15:23:20.223Z"],
  consolidated: ["41520af9-01e0-81f6-b8d5-ec29df56296e", "2026-11-11T00:34:47.360Z"],
  twoBlocker: ["41520af9-01e0-817e-bc38-fd479338b87c", "2026-11-11T02:29:27.464Z"],
  am3Rat: ["41a20af9-01e0-81ec-bd92-fefe3a524dc4", "2026-11-16T06:58:35.373Z"],
  terminalRed: ["42020af9-01e0-81ba-9830-d14070ec9789", "2026-11-22T13:02:53.745Z"],
  terminalRat: ["42020af9-01e0-81f6-9ab3-e6c32e4f19e7", "2026-11-22T13:06:43.623Z"],
} as const;
const ref = (p: readonly [string, string]) => ({ page_uuid: p[0], native_pin: p[1] });

export const ADOPTED_INPUTS: readonly AdoptedInput[] = [
  {
    ...ref(P.prospective),
    label: "BLUE F-014B Prospective Source Replacement v0.4 (T0-T5, E0-E5)",
    clauses: ["E0", "E1", "E2", "E3", "E4", "E5", "T0", "T1", "T2", "T3", "T4", "T5"],
    ratification: ref(P.prospectiveRat),
    verification: verified(P.prospective[1]),
  },
  {
    ...ref(P.prospectiveRat),
    label: "Sovereign ratification: F-014B Two Prospective Source Imports (BLUE v0.4 exact pin)",
    clauses: ["whole-ratification-record"],
    ratification: null,
    verification: verified(P.prospectiveRat[1]),
  },
  {
    ...ref(P.t1),
    label: "BLUE CAL-TIME T-1 Unified Clock-Origin Source v1.0",
    clauses: ["grant-1", "grant-2", "grant-3", "grant-4", "grant-5"],
    ratification: ref(P.t1Rat),
    verification: verified(P.t1[1]),
  },
  {
    ...ref(P.t1Rat),
    label: "Sovereign ratification: CAL-TIME T-1 Unified Clock-Origin Source v1.0 (five grants)",
    clauses: ["whole-ratification-record"],
    ratification: null,
    verification: verified(P.t1Rat[1]),
  },
  {
    ...ref(P.calTime),
    label: "BLUE CAL-TIME v0.4 calendar semantics",
    clauses: ["A", "B", "C", "D", "E", "F", "G.1", "G.2", "G.5"],
    ratification: ref(P.calTimeRat),
    verification: verified(P.calTime[1]),
  },
  {
    ...ref(P.calTimeRat),
    label: "Sovereign ratification: CAL-TIME v0.4 calendar semantics A-F, G.1, G.2, G.5",
    clauses: ["whole-ratification-record"],
    ratification: null,
    verification: verified(P.calTimeRat[1]),
  },
  {
    ...ref(P.consolidated),
    label: "F-014B GM-Mediated Passive Waiting Consolidated v0.6",
    clauses: ["section-3", "section-4", "section-5", "section-6", "section-10"],
    ratification: null,
    verification: verified(P.consolidated[1]),
  },
  {
    ...ref(P.twoBlocker),
    label: "F-014B Two-Blocker Resolution v0.3 (Sovereign ratified design addendum)",
    clauses: ["whole-ratified-addendum"],
    ratification: null,
    verification: verified(P.twoBlocker[1]),
  },
  {
    ...ref(P.am3Rat),
    label: "Sovereign ratification: AM-3.1, AM-3.2, AM-3.3, AM-3.P",
    clauses: ["AM-3.1", "AM-3.2", "AM-3.3", "AM-3.P"],
    ratification: null,
    verification: verified(P.am3Rat[1]),
  },
  {
    ...ref(P.terminalRed),
    label: "F-014B Terminal RED controlling riders (bounded design and prerequisites)",
    clauses: ["R-3", "R-5", "R-6", "R-7e", "R-8", "R-9", "R-E.1", "R-H.1 (prerequisite only)"],
    ratification: ref(P.terminalRat),
    verification: verified(P.terminalRed[1], "2026-11-22"),
  },
  {
    ...ref(P.terminalRat),
    label: "Sovereign ratification: F-014B Terminal RED (design only)",
    clauses: [
      "D1",
      "D2",
      "D3(a)",
      "D4(c)",
      "D4(e)",
      "R-E with R-E.1",
      "N8",
      "R-9 (controlling reading)",
    ],
    ratification: null,
    verification: verified(P.terminalRat[1], "2026-11-22"),
  },
];

/** Fails the build if an adopted input is not recorded as natively verified at exactly its pin, or names an unlisted ratification. */
export function assertAdoptedInputsVerified(
  inputs: readonly AdoptedInput[] = ADOPTED_INPUTS,
): void {
  const listed = new Set(inputs.map((i) => `${i.page_uuid}@${i.native_pin}`));
  for (const i of inputs) {
    if (i.verification.observed_page_last_edited_at !== i.native_pin)
      throw new Error(
        `adopted input ${i.page_uuid}: native pin ${i.native_pin} is not the recorded native verification (${i.verification.observed_page_last_edited_at})`,
      );
    if (i.ratification && !listed.has(`${i.ratification.page_uuid}@${i.ratification.native_pin}`))
      throw new Error(
        `adopted input ${i.page_uuid}: its ratification is not itself a verified input`,
      );
  }
}

// ---------------------------------------------------------------------------------------------
// Source access (filesystem or an in-memory overlay, so the AST negatives are hermetic)
// ---------------------------------------------------------------------------------------------

export interface SourceFiles {
  /** repo-relative path -> text */
  readonly files: ReadonlyMap<string, string>;
}

const walkTs = (abs: string): string[] =>
  existsSync(abs)
    ? readdirSync(abs, { withFileTypes: true }).flatMap((e) =>
        e.name === "node_modules" || e.name === ".git"
          ? []
          : e.isDirectory()
            ? walkTs(join(abs, e.name))
            : e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")
              ? [join(abs, e.name)]
              : [],
      )
    : [];

export function readSourceFiles(root: string, roots: readonly string[]): SourceFiles {
  const files = new Map<string, string>();
  for (const r of roots)
    for (const abs of walkTs(join(root, r)).sort())
      files.set(relative(root, abs).split("\\").join("/"), readFileSync(abs, "utf8"));
  return { files };
}

const sourceFingerprints = new Map<string, { text: string; sha256: string }>();

/**
 * Bind the source of predicates and their helpers even when reflection reports an identical shape.
 * Tree structure retains parsing decisions (including automatic semicolon insertion), and leaf text
 * retains literal content. Comments and spacing between tokens carry no identity. The generated
 * current pointer is excluded to avoid a digest depending on itself.
 */
function sourcePolicy(files: ReadonlyMap<string, string>): CatalogueCensusV2["source_policy"] {
  return {
    algorithm: "TS_SYNTAX_TREE_SHA256_V1",
    unproven_declarations: "DENY",
    files: [...files]
      .filter(([path]) => path !== CURRENT_MODULE)
      .sort(([a], [b]) => cmp(a, b))
      .map(([path, text]) => {
        const previous = sourceFingerprints.get(path);
        if (previous?.text === text) return { path, sha256: previous.sha256 };
        const source = ts.createSourceFile(path, text, ts.ScriptTarget.ES2023, true);
        const syntax: (number | string)[] = [];
        const visit = (node: ts.Node): void => {
          const children = node.getChildren(source).filter((child) => !ts.isJSDoc(child));
          syntax.push(node.kind, children.length);
          if (children.length === 0) syntax.push(node.getText(source));
          else children.forEach(visit);
        };
        visit(source);
        const sha256 = sha256Canonical(syntax);
        sourceFingerprints.set(path, { text, sha256 });
        return { path, sha256 };
      }),
  };
}

// ---------------------------------------------------------------------------------------------
// AST scan
// ---------------------------------------------------------------------------------------------

export interface AstFacts {
  readonly providerDecls: readonly { file: string; name: string; exported: boolean }[];
  readonly registrySites: readonly {
    site_id: string;
    members: readonly string[];
    opaque: boolean;
  }[];
  readonly registerCalls: readonly number[];
  readonly closeDecls: readonly { name_expr: string }[];
  readonly eventTriggerDecls: number;
  readonly objectRoutes: readonly {
    route_id: string;
    kind: "OBJECT_LITERAL" | "REGISTER_OBJECT_CALL" | "PRODUCES_EXPRESSION";
    fp: string | null;
  }[];
  readonly extensionReturns: readonly string[];
  readonly counts: GmWaitCatalogueManifest["scope"]["ast_counts"];
}

const PREFILTER =
  /StageProvider|declares_close|eventTrigger|storeBindings|registerObject|owning_ref|compute|produces|\.register\(/;

const hasExport = (n: ts.Node): boolean => {
  const stmt = n.parent?.parent;
  return (
    !!stmt &&
    ts.canHaveModifiers(stmt) &&
    !!ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
};

export function scanAst(files: ReadonlyMap<string, string>): AstFacts {
  const providerDecls: { file: string; name: string; exported: boolean }[] = [];
  const registrySites: { site_id: string; members: string[]; opaque: boolean }[] = [];
  const closeDecls: { name_expr: string }[] = [];
  const objectRoutes: AstFacts["objectRoutes"][number][] = [];
  let producesExpressions = 0;
  let registerCalls = 0;
  let eventTriggerDecls = 0;
  let objectLiterals = 0;
  let registerObjectCalls = 0;
  let extensionReturns: string[] = [];
  const printer = ts.createPrinter({ removeComments: true });
  const norm = (sf: ts.SourceFile, n: ts.Node): string =>
    printer.printNode(ts.EmitHint.Unspecified, n, sf).replace(/\s+/g, " ").trim();

  for (const [file, text] of [...files].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (!PREFILTER.test(text)) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true);
    const enclosing = (n: ts.Node): string => {
      for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
        if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name)
          return p.name.getText(sf);
        if (
          ts.isVariableDeclaration(p) &&
          p.initializer &&
          (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))
        )
          return p.name.getText(sf);
      }
      return "<module>";
    };
    const ordinals = new Map<string, number>();
    const uniq = (id: string): string => {
      const k = (ordinals.get(id) ?? 0) + 1;
      ordinals.set(id, k);
      return k === 1 ? id : `${id}@${k}`;
    };
    const propNames = (o: ts.ObjectLiteralExpression): Set<string> =>
      new Set(o.properties.flatMap((p) => (p.name ? [p.name.getText(sf)] : [])));

    const visit = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n)) {
        const typed =
          n.type &&
          ts.isTypeReferenceNode(n.type) &&
          n.type.typeName.getText(sf) === "StageProvider";
        const shaped =
          n.initializer &&
          ts.isObjectLiteralExpression(n.initializer) &&
          propNames(n.initializer).has("operation") &&
          propNames(n.initializer).has("compute");
        if (typed || shaped)
          providerDecls.push({ file, name: n.name.getText(sf), exported: hasExport(n) });
      } else if (
        ts.isObjectLiteralExpression(n) &&
        !(n.parent && ts.isVariableDeclaration(n.parent)) &&
        propNames(n).has("operation") &&
        propNames(n).has("compute")
      ) {
        providerDecls.push({ file, name: `<literal@${enclosing(n)}>`, exported: false });
      }
      if (ts.isNewExpression(n) && n.expression.getText(sf) === "StageProviderRegistry") {
        const arg = n.arguments?.[0];
        const members: string[] = [];
        let opaque = false;
        if (arg === undefined) {
          /* an empty registry */
        } else if (ts.isArrayLiteralExpression(arg)) {
          for (const e of arg.elements) {
            if (ts.isIdentifier(e)) members.push(e.text);
            else {
              members.push(`<expr:${norm(sf, e).slice(0, 40)}>`);
              opaque = true;
            }
          }
        } else {
          opaque = true;
        }
        registrySites.push({ site_id: uniq(`${file}#${enclosing(n)}`), members, opaque });
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const name = n.expression.name.text;
        const recv = n.expression.expression.getText(sf);
        if (name === "register") {
          const a = n.arguments[0];
          const looksProvider =
            /registry|provider/i.test(recv) ||
            (a !== undefined && ts.isIdentifier(a) && /Provider$/.test(a.text)) ||
            (a !== undefined &&
              ts.isObjectLiteralExpression(a) &&
              propNames(a).has("operation") &&
              propNames(a).has("compute"));
          if (looksProvider) {
            registerCalls++;
            registrySites.push({
              site_id: uniq(`${file}#${enclosing(n)}:register`),
              members: a !== undefined && ts.isIdentifier(a) ? [a.text] : ["<expr>"],
              opaque: true,
            });
          }
        }
        if (name === "registerObject") {
          registerObjectCalls++;
          objectRoutes.push({
            route_id: uniq(`register_object@${file}#${enclosing(n)}`),
            kind: "REGISTER_OBJECT_CALL",
            fp: null,
          });
        }
      }
      if (ts.isPropertyAssignment(n)) {
        const pn = n.name.getText(sf);
        if (pn === "declares_close" && ts.isObjectLiteralExpression(n.initializer)) {
          const nameProp = n.initializer.properties.find(
            (p): p is ts.PropertyAssignment =>
              ts.isPropertyAssignment(p) && p.name.getText(sf) === "name",
          );
          if (nameProp) closeDecls.push({ name_expr: nameProp.initializer.getText(sf) });
        }
        if (pn === "eventTrigger") eventTriggerDecls++;
        if (pn === "owning_ref" && ts.isObjectLiteralExpression(n.initializer)) {
          objectLiterals++;
          objectRoutes.push({
            route_id: uniq(`object_literal@${file}`),
            kind: "OBJECT_LITERAL",
            fp: null,
          });
        }
        // a generated-key path: the keys a declared stage says its owner operation writes (a zod schema member of that name is not one)
        if (pn === "produces" && !/^z\./.test(n.initializer.getText(sf))) {
          producesExpressions++;
          objectRoutes.push({
            route_id: uniq(`produces@${file}#${enclosing(n)}`),
            kind: "PRODUCES_EXPRESSION",
            fp: sha256Text(norm(sf, n.initializer)),
          });
        }
      }
      if (ts.isShorthandPropertyAssignment(n) && n.name.text === "produces") {
        producesExpressions++;
        objectRoutes.push({
          route_id: uniq(`produces@${file}#${enclosing(n)}`),
          kind: "PRODUCES_EXPRESSION",
          fp: sha256Text("produces"),
        });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);

    if (file.endsWith("owners/extension.ts")) {
      const returns: string[] = [];
      const inStoreBindings = (n: ts.Node): void => {
        if (ts.isFunctionDeclaration(n) && n.name?.text === "storeBindings" && n.body) {
          const collect = (m: ts.Node, method: string | null): void => {
            const name =
              (ts.isMethodDeclaration(m) || ts.isPropertyAssignment(m)) && m.name
                ? m.name.getText(sf)
                : null;
            const next = name === "check" || name === "verifyHistorical" ? name : method;
            if (ts.isReturnStatement(m) && next !== null) returns.push(`${next}: ${norm(sf, m)}`);
            ts.forEachChild(m, (c) => collect(c, next));
          };
          collect(n.body, null);
        }
        ts.forEachChild(n, inStoreBindings);
      };
      inStoreBindings(sf);
      extensionReturns = returns;
    }
  }
  const dedupedDecls = [
    ...new Map(providerDecls.map((d) => [`${d.file}#${d.name}`, d] as const)).values(),
  ].sort((a, b) => (`${a.file}#${a.name}` < `${b.file}#${b.name}` ? -1 : 1));
  return {
    providerDecls: dedupedDecls,
    registrySites,
    registerCalls: Array.from({ length: registerCalls }, (_, i) => i),
    closeDecls,
    eventTriggerDecls,
    objectRoutes,
    extensionReturns,
    counts: {
      provider_declarations: dedupedDecls.length,
      registry_sites: registrySites.filter((s) => !s.site_id.includes(":register")).length,
      register_calls: registerCalls,
      close_declarations: closeDecls.length,
      event_trigger_declarations: eventTriggerDecls,
      object_literals: objectLiterals,
      register_object_calls: registerObjectCalls,
      produces_expressions: producesExpressions,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Reflection
// ---------------------------------------------------------------------------------------------

interface ReflectedProvider {
  readonly value: Record<string, unknown>;
  readonly hits: { file: string; name: string }[];
}
export interface ReflectionFacts {
  readonly providers: readonly ReflectedProvider[];
  readonly stringConstants: ReadonlyMap<string, string | null>;
  readonly importedFiles: number;
}

const isProviderShape = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Record<string, unknown>)["owner"] === "string" &&
  typeof (v as Record<string, unknown>)["operation"] === "string" &&
  typeof (v as Record<string, unknown>)["compute"] === "function";

export async function reflectModules(
  root: string,
  roots: readonly string[],
): Promise<ReflectionFacts> {
  const byIdentity = new Map<object, ReflectedProvider>();
  const constants = new Map<string, string | null>();
  const failures: string[] = [];
  let imported = 0;
  for (const r of roots) {
    for (const abs of walkTs(join(root, r)).sort()) {
      const file = relative(root, abs).split("\\").join("/");
      let mod: Record<string, unknown>;
      try {
        mod = (await import(pathToFileURL(abs).href)) as Record<string, unknown>;
      } catch (e) {
        failures.push(`${file}: ${String(e).slice(0, 120)}`);
        continue;
      }
      imported++;
      for (const [name, v] of Object.entries(mod)) {
        if (typeof v === "string") {
          const prior = constants.get(name);
          constants.set(name, prior === undefined || prior === v ? v : null);
        }
        if (isProviderShape(v)) {
          const entry = byIdentity.get(v) ?? { value: v, hits: [] };
          entry.hits.push({ file, name });
          byIdentity.set(v, entry);
        }
      }
    }
  }
  if (failures.length > 0)
    throw new Error(`reflection could not import: ${failures.slice(0, 5).join("; ")}`);
  return {
    providers: [...byIdentity.values()],
    stringConstants: constants,
    importedFiles: imported,
  };
}

// ---------------------------------------------------------------------------------------------
// Census
// ---------------------------------------------------------------------------------------------

export interface CensusOptions {
  readonly root?: string;
  /** extra in-memory files (repo-relative path -> text) added to the AST scan only */
  readonly overlay?: ReadonlyMap<string, string>;
  /** extra directories (absolute) added to both the AST scan and the reflection (a throwaway "added provider" tree) */
  readonly extraRoots?: readonly string[];
  /** an owner extension a build supplies beside the canonical registry (production supplies none) */
  readonly extension?: StageOwnerExtension;
}

const notionUuid = (artifact: string): string => {
  const m = /([0-9a-f]{32})(?:[?#].*)?$/.exec(artifact);
  if (!m) throw new Error(`rule artifact is not a Notion page URL: ${artifact}`);
  const h = m[1] as string;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

type RuleSourceRef = GmWaitCatalogueManifest["rules"][number]["source_ref"];
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export async function buildCensus(opts: CensusOptions = {}): Promise<CatalogueCensusV2> {
  const root = opts.root ?? REPO_ROOT;
  const astFiles = new Map(readSourceFiles(root, AST_ROOTS).files);
  for (const x of opts.extraRoots ?? [])
    for (const abs of walkTs(x))
      astFiles.set(`extra:${relative(x, abs)}`, readFileSync(abs, "utf8"));
  for (const [p, t] of opts.overlay ?? []) astFiles.set(p, t);
  const ast = scanAst(astFiles);
  const reflection = await reflectModules(root, REFLECTION_ROOTS);
  const extra = (
    await Promise.all(
      (opts.extraRoots ?? []).map(async (x) => {
        const out: { value: Record<string, unknown>; name: string; file: string }[] = [];
        for (const abs of walkTs(x).sort()) {
          const mod = (await import(pathToFileURL(abs).href)) as Record<string, unknown>;
          for (const [name, v] of Object.entries(mod))
            if (isProviderShape(v)) out.push({ value: v, name, file: `extra:${relative(x, abs)}` });
        }
        return out;
      }),
    )
  ).flat();

  // --- rules (interned) -------------------------------------------------------------------
  const rules = new Map<string, RuleSourceRef>();
  const intern = (r: contracts.SourceRef): string => {
    const source_ref: RuleSourceRef = {
      artifact: r.artifact,
      native_pin: r.native_pin,
      clause: r.clause,
      authority_lineage: [...r.authority_lineage],
      effective_basis: r.effective_basis,
      supersedes: r.supersedes,
    };
    const id = sha256Canonical(source_ref);
    rules.set(id, source_ref);
    return id;
  };

  // --- kinds ------------------------------------------------------------------------------
  const kinds = ALL_FACT_KINDS.map((k) => ({
    id: k.id as string,
    owner: k.owner,
    facet: k.facet,
    im: k.im,
    rc: [...k.rc],
    lifecycle: k.lifecycle,
    key_pattern: { source: k.keyPattern.source, flags: k.keyPattern.flags },
    value_schema_fp: valueSchemaFingerprint(k.valueSchema),
    rule_ref: intern(k.rule),
    legacy_refs: k.legacyRule ? [intern(k.legacyRule.rule)] : [],
    later_legacy_refs: (k.laterLegacyRules ?? []).map((l) => intern(l.rule)),
    alternate_refs: (k.alternateRules ?? []).map((a) => intern(a.rule)),
    disposition: "UNDECLARED" as const,
  }));

  // --- providers --------------------------------------------------------------------------
  const declKeys = new Set(ast.providerDecls.map((d) => `${d.file}#${d.name}`));
  const reflected = [
    ...reflection.providers.map((p) => ({ value: p.value, hits: p.hits })),
    ...extra.map((e) => ({ value: e.value, hits: [{ file: e.file, name: e.name }] })),
  ];
  const matchedDecls = new Set<string>();
  const providerMeta = reflected.map((p) => {
    const matched = p.hits.filter((h) => declKeys.has(`${h.file}#${h.name}`));
    for (const m of matched) matchedDecls.add(`${m.file}#${m.name}`);
    const v = p.value;
    const owner = v["owner"] as string;
    const facet = typeof v["facet"] === "string" ? (v["facet"] as string) : "";
    const operation = v["operation"] as string;
    const trigger = v["eventTrigger"] as { kind?: unknown } | undefined;
    return { p, owner, facet, operation, matched, trigger, names: p.hits.map((h) => h.name) };
  });
  const unresolved = ast.providerDecls
    .map((d) => `${d.file}#${d.name}`)
    .filter((k) => !matchedDecls.has(k));

  // --- sites ------------------------------------------------------------------------------
  const keyOfIdent = new Map<string, string>();
  for (const m of providerMeta)
    for (const n of m.names) keyOfIdent.set(n, `${m.owner}|${m.operation}`);
  const sites = ast.registrySites
    .map((s) => ({
      site_id: s.site_id,
      members: s.members.map((x) => keyOfIdent.get(x) ?? `UNRESOLVED:${x}`),
      opaque: s.opaque,
    }))
    .sort((a, b) => cmp(a.site_id, b.site_id));
  const siteIdsOf = (key: string): string[] =>
    sites.filter((s) => s.members.includes(key)).map((s) => s.site_id);

  const providers = providerMeta
    .map((m) => {
      const key = `${m.owner}|${m.operation}`;
      const site_ids = siteIdsOf(key);
      const found_by: ("AST_DECL" | "REFLECTION")[] =
        m.matched.length > 0 ? ["AST_DECL", "REFLECTION"] : ["REFLECTION"];
      return {
        owner: m.owner,
        facet: m.facet,
        operation: m.operation,
        rule_ref: intern(m.p.value["rule"] as contracts.SourceRef),
        event_trigger: typeof m.trigger?.kind === "string" ? m.trigger.kind : null,
        effect_kind_ids: ALL_FACT_KINDS.filter((k) => k.owner === m.owner && k.facet === m.facet)
          .map((k) => k.id as string)
          .sort(cmp),
        status: site_ids.length > 0 ? ("REGISTERED" as const) : ("DORMANT" as const),
        site_ids,
        found_by,
        disposition: "UNDECLARED" as const,
      };
    })
    .sort((a, b) => cmp(`${a.owner}|${a.operation}`, `${b.owner}|${b.operation}`));

  // --- closes, triggers, routes -----------------------------------------------------------
  const closes = [...new Map(ast.closeDecls.map((c) => [c.name_expr, c] as const)).values()]
    .map((c) => ({
      name_expr: c.name_expr,
      name_value: /^["'`].*["'`]$/.test(c.name_expr)
        ? c.name_expr.slice(1, -1)
        : (reflection.stringConstants.get(c.name_expr) ?? null),
    }))
    .sort((a, b) => cmp(a.name_expr, b.name_expr));
  const event_triggers = providers.flatMap((p) =>
    p.event_trigger === null
      ? []
      : [{ kind: p.event_trigger, provider: `${p.owner}|${p.operation}` }],
  );
  const object_routes = [...ast.objectRoutes].sort((a, b) => cmp(a.route_id, b.route_id));

  // --- extension dispatch -----------------------------------------------------------------
  const bindings = storeBindings(opts.extension);
  if (!bindings.ok)
    throw new Error(`storeBindings refused the supplied extension: ${bindings.error.message}`);
  const extension_owners = [...bindings.value.owners.keys()]
    .filter((o) => !CANONICAL_OWNER_REGISTRY.has(o))
    .sort(cmp);
  const extension_dispatch = {
    function: "storeBindings" as const,
    structure_sha256: sha256Canonical(ast.extensionReturns),
    early_return_count: ast.extensionReturns.length,
    extension_owners,
    historical_verification_of_extension_groups: "SKIPPED" as const,
  };

  // --- culture conditional route ----------------------------------------------------------
  const cultureKey = providers.find((p) => p.owner === contracts.OWNER_CULTURE);
  const probe = (basis: string) =>
    inputBasisViolation({
      owner: "world_state",
      fact_key: "world/a/profile",
      read: { basis },
    } as never);
  const culture_route = {
    provider: cultureKey ? `${cultureKey.owner}|${cultureKey.operation}` : "ABSENT",
    provider_registered_in_production: cultureKey?.status === "REGISTERED",
    declared_close_basis_message_sha256: sha256Text(probe("AS-OF-DECLARED-CLOSE") ?? ""),
    as_of_now_basis_accepted: probe("AS-OF-NOW") === null,
  };

  // --- policy (observed) ------------------------------------------------------------------
  const canonicalId = canonicalAdmission.historyVerificationId ?? "";
  const legacyId = legacyContractAdmission(canonicalAdmission).historyVerificationId ?? "";
  if (!legacyId.startsWith(canonicalId))
    throw new Error("legacy admission identity does not extend the canonical one");
  for (const needed of [
    "CAL-TIME-T1-CLOCK-ORIGIN@2026-11-18T22:23:26.085Z",
    "MS-V3-CLOCK-STEP-B2-ORIGIN",
  ])
    if (!canonicalId.includes(needed))
      throw new Error(
        `the canonical historical-verification identity lacks the T-1 segment ${needed}`,
      );
  const accessClasses = Object.entries(contracts)
    .filter(([n, v]) => n.startsWith("ACCESS_CLASS_") && typeof v === "string")
    .map(([, v]) => v as string)
    .sort(cmp);

  // --- sources (code-derived) -------------------------------------------------------------
  const byPage = new Map<string, { page_uuid: string; native_pin: string; rule_ids: string[] }>();
  for (const [id, r] of rules) {
    const uuid = notionUuid(r.artifact);
    const k = `${uuid}|${r.native_pin}`;
    const e = byPage.get(k) ?? { page_uuid: uuid, native_pin: r.native_pin, rule_ids: [] };
    e.rule_ids.push(id);
    byPage.set(k, e);
  }
  const sources = [...byPage.values()].map((s) => ({
    origin: "CODE_RULE" as const,
    page_uuid: s.page_uuid,
    native_pin: s.native_pin,
    rule_ids: [...s.rule_ids].sort(cmp),
  }));

  return {
    source_policy: sourcePolicy(astFiles),
    historical_verification: {
      canonical_id: canonicalId,
      legacy_contract_suffix: legacyId.slice(canonicalId.length),
      ms_same_id: msCanonicalAdmission({} as never).historyVerificationId === canonicalId,
    },
    owner_policy: {
      owners: [...CANONICAL_OWNER_REGISTRY]
        .map(([owner, facets]) => ({ owner, facets: [...facets].sort(cmp) }))
        .sort((a, b) => cmp(a.owner, b.owner)),
    },
    audience_projection: {
      audience_fact_kind_ids: [...AUDIENCE_FACT_KIND_IDS].sort(cmp),
      access_classes: accessClasses,
    },
    sources,
    rules: [...rules].map(([rule_id, source_ref]) => ({ rule_id, source_ref })),
    kinds,
    providers,
    unresolved_declarations: unresolved,
    sites,
    closes,
    event_triggers,
    object_routes,
    extension_dispatch,
    culture_route,
    scope: {
      ast_roots: [...AST_ROOTS],
      reflection_roots: [...REFLECTION_ROOTS],
      excluded_roots: [...EXCLUDED_ROOTS],
      census_methods: ["REFLECTION", "TS_AST"],
      ast_counts: ast.counts,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Manifest assembly
// ---------------------------------------------------------------------------------------------

export function buildManifest(
  census: CatalogueCensusV2,
  adopted: readonly AdoptedInput[] = ADOPTED_INPUTS,
): GmWaitCatalogueManifestV2 {
  assertAdoptedInputsVerified(adopted);
  const m: GmWaitCatalogueManifestV2 = {
    manifest_version: GM_WAIT_CATALOGUE_MANIFEST_VERSION,
    format: "immortalis-gm-wait-catalogue",
    policy: {
      epistemic: "ACTIONABLE_OR_UNSAFE",
      default_disposition: "UNDECLARED",
      value_schema_fp_scope: "STRUCTURAL_ONLY",
      enforcement_boundary:
        "BUILD_TEST_TIME_COVERAGE_ONLY_RUNTIME_ENFORCEMENT_AND_ENROLMENT_ADMISSION_REMAIN_S4_SECTION_10_SOURCE_GATES",
      evaluator: { id: "NONE_SECTION_10_NOT_ACCEPTED" },
      live_admission: { id: "NOT_INSTALLED_NO_GM_WRITER" },
      historical_verification: census.historical_verification,
      owner_policy: census.owner_policy,
      audience_projection: census.audience_projection,
      source_policy: census.source_policy,
      conversion: {
        rule: "SI_SUBDAY_V1",
        factors: { second: 1, minute: 60, hour: 3600 },
        qualification: "TEMPORAL_ORIGIN_V2_WITNESS_ONLY",
      },
    },
    sources: [
      ...census.sources,
      ...adopted.map((a) => ({
        origin: "ADOPTED_INPUT" as const,
        page_uuid: a.page_uuid,
        native_pin: a.native_pin,
        label: a.label,
        clauses: [...a.clauses],
        ratification: a.ratification,
      })),
    ],
    rules: census.rules,
    kinds: census.kinds,
    providers: census.providers,
    unresolved_declarations: census.unresolved_declarations,
    sites: census.sites,
    closes: census.closes,
    event_triggers: census.event_triggers,
    object_routes: census.object_routes,
    extension_dispatch: { ...census.extension_dispatch, historical_coverage: "UNRETIRED_DENY" },
    culture_route: census.culture_route,
    scope: census.scope,
  };
  return normalizeManifest(GmWaitCatalogueManifestV2Schema.parse(m));
}

// ---------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------

export const currentModuleText = (digest: string, retained: readonly string[]): string =>
  `// GENERATED by tools/gen-gm-wait-catalogue.ts --write. Do not edit: a drift fails \`--check\` and the S2 conformance suite.\n` +
  `// The digest names the build's current GM-wait catalogue manifest (packages/engine/gm-wait-catalogue/manifests/<digest>.json).\n` +
  `export const GM_WAIT_CATALOGUE_CURRENT_SHA256 =\n  "${digest}";\n\n` +
  `/** Every retained manifest, by digest. Only the current identity qualifies for a fresh INITIAL digest check. */\n` +
  `export const GM_WAIT_CATALOGUE_RETAINED_SHA256: readonly string[] = [\n${retained.map((d) => `  "${d}",\n`).join("")}];\n`;

export const retainedDigests = (
  root: string = REPO_ROOT,
  manifestDir: string = MANIFEST_DIR,
): string[] => {
  const dir = join(root, manifestDir);
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /^[0-9a-f]{64}\.json$/.test(f))
        .map((f) => f.slice(0, -5))
        .sort(cmp)
    : [];
};

export interface Generated {
  readonly manifest: GmWaitCatalogueManifestV2;
  readonly bytes: string;
  readonly digest: string;
  readonly byteLength: number;
}

export async function generate(opts: CensusOptions = {}): Promise<Generated> {
  const census = await buildCensus(opts);
  const manifest = buildManifest(census);
  const violations = catalogueCoverageViolations(census, manifest);
  if (violations.length > 0)
    throw new Error(
      `the manifest just built does not cover its own census: ${JSON.stringify(violations.slice(0, 3))}`,
    );
  const bytes = catalogueCanonicalBytes(manifest);
  return {
    manifest,
    bytes,
    digest: sha256Text(bytes),
    byteLength: Buffer.byteLength(bytes, "utf8"),
  };
}

export interface DriftLocations {
  readonly root: string;
  readonly manifestDir: string;
  readonly currentModule: string;
}
export const defaultLocations = (root: string = REPO_ROOT): DriftLocations => ({
  root,
  manifestDir: MANIFEST_DIR,
  currentModule: CURRENT_MODULE,
});

function retainedArchiveProblems(loc: DriftLocations, retained: readonly string[]): string[] {
  const problems: string[] = [];
  if (!retained.includes(V1_ARCHIVE_SHA256))
    problems.push(`missing required v1 archive ${V1_ARCHIVE_SHA256}.json`);
  for (const digest of retained) {
    try {
      const bytes = readFileSync(join(loc.root, loc.manifestDir, `${digest}.json`), "utf8");
      if (sha256Text(bytes) === digest && catalogueCanonicalBytes(JSON.parse(bytes)) === bytes)
        continue;
    } catch {
      // Report an unreadable or invalid archive by its digest, the same as a byte mismatch.
    }
    problems.push(`invalid retained manifest ${digest}.json`);
  }
  return problems;
}

/** What differs between the freshly measured manifest and the files at `loc`; an empty list means no drift. */
export function checkDrift(g: Generated, loc: DriftLocations = defaultLocations()): string[] {
  const problems: string[] = [];
  const manifestPath = join(loc.root, loc.manifestDir, `${g.digest}.json`);
  if (!existsSync(manifestPath))
    problems.push(`no retained manifest ${loc.manifestDir}/${g.digest}.json`);
  else if (readFileSync(manifestPath, "utf8") !== g.bytes)
    problems.push("the retained manifest bytes differ from the census");
  const onDisk = retainedDigests(loc.root, loc.manifestDir);
  problems.push(
    ...retainedArchiveProblems(
      loc,
      onDisk.filter((d) => d !== g.digest),
    ),
  );
  const retained = [...new Set([...onDisk, g.digest])].sort(cmp);
  const currentPath = join(loc.root, loc.currentModule);
  if (
    !existsSync(currentPath) ||
    readFileSync(currentPath, "utf8") !== currentModuleText(g.digest, retained)
  )
    problems.push(`${loc.currentModule} is not the current-digest module for ${g.digest}`);
  return problems;
}

async function main(): Promise<number> {
  const mode = process.argv[2] ?? "--check";
  const g = await generate();
  if (mode === "--print") {
    console.log(`digest ${g.digest}\nbytes ${g.byteLength}`);
    console.log(
      `kinds ${g.manifest.kinds.length} providers ${g.manifest.providers.length} sites ${g.manifest.sites.length}`,
    );
    return 0;
  }
  if (mode === "--write") {
    const retained = retainedDigests();
    const archiveProblems = retainedArchiveProblems(defaultLocations(), retained);
    if (archiveProblems.length > 0) throw new Error(archiveProblems.join("\n"));
    const manifestPath = join(REPO_ROOT, MANIFEST_DIR, `${g.digest}.json`);
    mkdirSync(dirname(manifestPath), { recursive: true });
    if (!retained.includes(g.digest)) writeFileSync(manifestPath, g.bytes, { flag: "wx" });
    const indexed = [...new Set([...retained, g.digest])].sort(cmp);
    writeFileSync(join(REPO_ROOT, CURRENT_MODULE), currentModuleText(g.digest, indexed));
    console.log(
      `wrote ${relative(REPO_ROOT, manifestPath)} (${g.byteLength} bytes) and ${CURRENT_MODULE}`,
    );
    return 0;
  }
  if (mode !== "--check") {
    console.error(`unknown mode ${mode}`);
    return 2;
  }
  const problems = checkDrift(g);
  if (problems.length > 0) {
    console.error(
      `DRIFT: expected digest ${g.digest} (${g.byteLength} bytes)\n - ${problems.join("\n - ")}\nrun --write after review`,
    );
    return 1;
  }
  console.log(`OK ${g.digest} ${g.byteLength} bytes`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e);
      process.exit(2);
    },
  );
}
