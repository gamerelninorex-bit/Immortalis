// Mechanism-only compatibility probe. Never prints its private callback capability or receipt key.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const fixture = JSON.parse(readFileSync(process.argv[3]!, "utf8"));
const { HumanReviews } = await import(
  pathToFileURL(`${process.argv[2]}/apps/phone/src/reviews.ts`).href
);
const reviews = new HumanReviews(fixture.config);
const base = { say: () => undefined, ask: async () => null, close: () => undefined };
const promise = reviews
  .terminal(base, { ...fixture.context, active: () => true })
  .review(fixture.request);
const result = await reviews.decorate(
  { content: [{ type: "text", text: "pending" }] },
  fixture.context.authority,
);
const view = result._meta.review;
reviews.submit(
  {
    proposal_id: view.proposal_id,
    digest: view.digest,
    capability: view.capability,
    decision: "accept",
  },
  fixture.context.authority,
);
await promise;
process.stdout.write(JSON.stringify({ material: view.material }));
