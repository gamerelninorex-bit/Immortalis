import { z } from "zod";

/** Plain JSON data. Numbers must be finite; `undefined` and non-plain objects are not JSON. */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().refine(Number.isFinite, "numbers must be finite"),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

/**
 * Deterministic serialization: object keys sorted by UTF-16 code unit, no insignificant whitespace.
 * Throws on anything that is not plain finite JSON so that non-canonical data never gets hashed.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new TypeError("canonicalJson: only plain objects are supported");
      }
      const record = value as Record<string, unknown>;
      const parts = Object.keys(record)
        .sort()
        .map((k) => {
          if (record[k] === undefined) throw new TypeError(`canonicalJson: undefined at "${k}"`);
          return `${JSON.stringify(k)}:${canonicalJson(record[k])}`;
        });
      return `{${parts.join(",")}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
}
