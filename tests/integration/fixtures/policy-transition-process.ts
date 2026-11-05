// Runs in its OWN operating-system process: an independent fresh-process readback of a package whose history-verification
// policy was replaced by a first open. Prints the head, a few exact historical lookups and the strict-replay entry count.
// usage: node --experimental-strip-types policy-transition-process.ts <dir> <policy-id> <probe-count>
import { CampaignCore, openFileCampaign } from "@immortalis/engine";
import { TEST_OWNERS } from "@immortalis/testkit";

const [dir, policyId, probes] = process.argv.slice(2);
if (!dir || !policyId || !probes) throw new Error("usage: <dir> <policy-id> <probe-count>");

let replayed = 0;
const replay = CampaignCore.prototype.replay;
CampaignCore.prototype.replay = function (...args) {
  replayed++;
  return replay.apply(this, args);
};
let judged = 0;
const opened = await openFileCampaign(dir, {
  owners: TEST_OWNERS,
  admission: {
    historyVerificationId: policyId,
    check: () => null,
    verifyHistorical: () => {
      judged++;
      return null;
    },
  },
});
if (!opened.ok) throw new Error(JSON.stringify(opened.error));
const store = opened.value;
const count = Number(probes);
const sample = [1, Math.ceil(count / 2), count];
// every historical identity, resolved through this fresh process's own hash-directed lookups
let exact = 0;
let mismatches = 0;
for (let i = 1; i <= count; i++) {
  const receipt = store.lookupReceipt(`intent-${i}`);
  const byGroup = store.committedGroupById?.(`group-${i}`);
  const byIntent = store.committedGroup(`intent-${i}`);
  if (
    receipt?.revision === i &&
    byGroup?.intent_id === `intent-${i}` &&
    byIntent?.group_id === `group-${i}`
  )
    exact++;
  else mismatches++;
}
console.log(
  JSON.stringify({
    head: store.head(),
    replayed,
    judged,
    residue: store.residue,
    exact,
    mismatches,
    receipts: sample.map((n) => store.lookupReceipt(`intent-${n}`)),
    groups: sample.map((n) => store.committedGroupById?.(`group-${n}`) ?? null),
  }),
);
await store.close();
