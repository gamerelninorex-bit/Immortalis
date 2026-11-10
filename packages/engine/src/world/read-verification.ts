import { sha256Canonical } from "../hash.ts";
import type { FileCampaignStore } from "../persistence/file-package.ts";

/**
 * Disposable dependencies of ONE actual owner-verification pass. Retains hashes and addressed
 * read functions, never facts, journal records or index nodes. Reuse re-executes those reads:
 * in particular historical lookups still authenticate today's backing bytes. A full facts read
 * covers same-head mutation and absent/new facts, not just the manifest's claimed head.
 *
 * Internal to CanonicalCampaign's opt-in read scope; this object is never host input or canon.
 */
export class ReadVerification {
  readonly #reads = new Map<string, { hash: string; read: () => unknown }>();
  #active = true;
  readonly view: FileCampaignStore;

  constructor(store: FileCampaignStore) {
    const record = <T>(key: string, read: () => T): T => {
      if (!this.#active) throw new Error("verification dependencies were released");
      const value = read();
      if (!this.#reads.has(key)) this.#reads.set(key, { hash: hash(value), read });
      return value;
    };
    const checked = () => {
      const source = store.ruleCheckedGroupIds?.();
      if (!source) return undefined;
      const all = () => record("checked:values", () => [...store.ruleCheckedGroupIds!()]);
      const view: ReadonlySet<string> = {
        has: (id) => record(`checked:has:${id}`, () => store.ruleCheckedGroupIds!().has(id)),
        get size() {
          return record("checked:size", () => store.ruleCheckedGroupIds!().size);
        },
        values: () => all().values(),
        keys: () => all().values(),
        [Symbol.iterator]: () => all().values(),
        *entries(): Generator<[string, string], undefined> {
          for (const id of all()) yield [id, id] as [string, string];
          return undefined;
        },
        forEach(fn, arg) {
          for (const id of all()) fn.call(arg, id, id, view);
        },
      };
      return view;
    };
    this.view = new Proxy(store, {
      get(_target, name) {
        switch (name) {
          case "head":
          case "listFacts":
            return () => record(name, () => store[name]());
          case "getFact":
          case "lookupReceipt":
          case "committedGroup":
            return (id: string) => record(`${name}:${id}`, () => store[name](id));
          case "committedGroupById":
            return store.committedGroupById
              ? (id: string) => record(`${name}:${id}`, () => store.committedGroupById!(id))
              : undefined;
          case "ruleCheckedGroupIds":
            return store.ruleCheckedGroupIds ? checked : undefined;
          case "descriptor":
          case "residue":
          case "provenanceDrift":
            return record(name, () => store[name]);
          default:
            throw new Error(`unsupported verification read: ${String(name)}`);
        }
      },
    });
    // Even an empty campaign must be tied to its exact store/head and complete facts, not absence
    // of an owner-specific proof. No caller can supply these values or an empty-success flag.
    record("head", () => store.head());
    record("listFacts", () => store.listFacts());
  }

  unchanged(): boolean {
    if (!this.#active) return false;
    try {
      for (const { hash: expected, read } of this.#reads.values())
        if (hash(read()) !== expected) {
          this.release();
          return false;
        }
      return true;
    } catch {
      this.release();
      return false;
    }
  }

  release(): void {
    this.#active = false;
    this.#reads.clear();
  }
}

// Preserve undefined versus null without depending on JSON's root-undefined behavior.
const hash = (value: unknown) =>
  sha256Canonical(value === undefined ? ["undefined"] : ["value", value]);
