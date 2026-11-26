import {
  ECONOMY_OPERATION_REALIZE_ACCESS,
  OWNER_ECONOMY,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  PRODUCTION_OPERATION_COMPLETE,
  WORLD_OPERATION_ACCEPT_FALLBACK,
  type TemporalObject,
} from "@immortalis/contracts";

const supported: ReadonlyMap<string, string> = new Map([
  [`${OWNER_PRODUCTION}:${PRODUCTION_OPERATION_COMPLETE}`, "DEFERRED(IF-6b)"],
  [`${OWNER_WORLD_STATE}:${WORLD_OPERATION_ACCEPT_FALLBACK}`, "DEFERRED(IF-6b)"],
  [`${OWNER_ECONOMY}:${ECONOMY_OPERATION_REALIZE_ACCESS}`, "DEFERRED(OWNER_ENROLMENT)"],
] as const);

export function workshopProductionStages(object: TemporalObject) {
  const result: { stage: string; laneX: string }[] = [];
  for (const { stage } of object.dependencies) {
    const { owner, operation } = stage.owner_operation;
    const key = `${owner}:${operation}`;
    const laneX = supported.get(key);
    if (!laneX || result.some(({ stage }) => stage === key)) return undefined;
    result.push({ stage: key, laneX });
  }
  return result.length === supported.size ? result : undefined;
}
