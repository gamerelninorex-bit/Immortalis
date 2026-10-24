import { z } from "zod";
import {
  EntityId,
  FactRefSchema,
  Text,
  worldLocusKey,
  worldProfileKey,
} from "./world-foundation.ts";

/**
 * World-State physical corridor (edge) — executable contract.
 *
 * Governing source (exact pin lives in the owner registry and spec/f027/spec-lock.json): WG Working Operational Draft v1,
 * native pin 2026-09-25T13:44:22.668Z — "Geography / Traversal" and "Edge / Corridor State" (a connection between nodes or regions
 * may carry independent causal state without becoming a World-State Node: "Nodes own consequential domains; edges/corridors may own
 * consequential access and transit between them"), and "Ownership Guards — World Generation May Own: World-State topology;
 * world-side environmental, geographic, topological and other general world-state facts not owned by a more specific subsystem".
 *
 * ONE corridor is the topological fact that one established locus is connected TO another established locus of the same world, in
 * that order, as the scenario author stated it. It is that and nothing else: every schema here is strict, so there is no field in
 * which a distance, travel time, speed, throughput, capacity, passability, access right, hazard verdict, route cost, carrier,
 * traversal outcome or "usable" claim could be stored, and the source prescribes no vocabulary for one. It is not a statement that
 * any entity, actor, vehicle or request can traverse it, and not a delivery. It is directed: the reverse connection is a different
 * fact that exists only if it is independently authored; no reverse edge, intermediate locus or absence of hazard is inferred.
 *
 * Keys and the owner/facet are technical encodings; the corridor is World-State's own topology fact (the existing owner and the
 * existing locus facet), never a Location/Movement owner or a Logistics fact.
 */

export const worldCorridorKey = (worldId: string, fromLocusId: string, toLocusId: string): string =>
  `world/${worldId}/corridor/${fromLocusId}/${toLocusId}`;

export const WorldCorridorSchema = z
  .strictObject({
    /** the world both loci belong to (reference, not a copy) */
    world: FactRefSchema,
    /** the locus the connection leaves (reference to an established locus; not a copy) */
    from: FactRefSchema,
    /** the locus the connection reaches (reference to an established, distinct locus; not a copy) */
    to: FactRefSchema,
    /** the connection as authored, preserved verbatim; free prose, never interpreted */
    statement: Text,
  })
  .superRefine((c, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (c.world.fact_key !== worldProfileKey(c.world.entity_id))
      bad("the world reference is the world's own key", ["world"]);
    if (c.from.fact_key !== worldLocusKey(c.world.entity_id, c.from.entity_id))
      bad("the origin is an established locus of the world, by its own key", ["from"]);
    if (c.to.fact_key !== worldLocusKey(c.world.entity_id, c.to.entity_id))
      bad("the destination is an established locus of the world, by its own key", ["to"]);
    if (c.from.entity_id === c.to.entity_id) bad("a corridor connects two distinct loci", ["to"]);
  });
export type WorldCorridor = z.infer<typeof WorldCorridorSchema>;

/**
 * What a corridor publication names: identities and the authored statement only. The fact references are derived, never authored,
 * and there is no version, owner, duration, rate, access or outcome field.
 */
export const EstablishCorridorInputSchema = z.strictObject({
  world_id: EntityId,
  from_locus_id: EntityId,
  to_locus_id: EntityId,
  statement: Text,
});
export type EstablishCorridorInput = z.infer<typeof EstablishCorridorInputSchema>;

/** The corridor value exactly as the World-State owner establishes it from an authored input: references derived, nothing added. */
export const corridorOfInput = (i: EstablishCorridorInput): WorldCorridor => ({
  world: { fact_key: worldProfileKey(i.world_id), entity_id: i.world_id },
  from: { fact_key: worldLocusKey(i.world_id, i.from_locus_id), entity_id: i.from_locus_id },
  to: { fact_key: worldLocusKey(i.world_id, i.to_locus_id), entity_id: i.to_locus_id },
  statement: i.statement,
});
