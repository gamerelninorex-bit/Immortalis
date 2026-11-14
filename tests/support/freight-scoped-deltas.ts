// ROADBED R3-T25 (first-profile institutional freight, Foundation F + Integration I): the predecessor source files this slice changed, as scoped
// deltas. `base` is the SHA-256 the file carried at the recorded base commit; `head` is the SHA-256 at the freight slice head. Older conformance
// suites no longer pin these paths (their pins were removed with a comment, as the M-S and PR #94 slices did); THIS table is where they are pinned,
// by tests/conformance/freight-profile-conformance.test.ts. A later change to any of them updates this table only.
//
// Not listed here, by design: the files whose present-day identity is stated in exactly one other place, which no other test file may repeat
// (historical-pin-provenance-conformance and current-look-lowering-conformance enforce it) -- the five files of
// tests/support/present-day-identities.ts that this slice also changed, and packages/engine/src/owners/registry.ts (current-look-lowering-conformance).
export const FREIGHT_BASE_COMMIT = "b9c4dcb0266ae7ed43c385092c6937fa5aa3a825";

export const FREIGHT_SCOPED_DELTAS: Readonly<
  Record<string, { readonly base: string; readonly head: string }>
> = {
  "packages/contracts/src/logistics.ts": {
    base: "2030cb9ad580464eebd52ec26d44fd8dfdddeb5e75fe171db69db3b881786df1",
    head: "9c6744c01ba779ef794fbe48f5215fd046989a976f603b5e3997193c094d2dec",
  },
  "packages/engine/src/economy/integrity.ts": {
    base: "93548d9357bc317fe9dd253956353ee840424ac69eaa41e2287a0f7825e2145b",
    head: "4a5735aecccb687b8268fb859e377287550af161bfe54035491b650afcb3a029",
  },
  "packages/engine/src/initial-setup/sunset-guard.ts": {
    base: "f45f110a406a4dce14ae006afc00a6e3729ee90e712014bc24124a84256c4a91",
    head: "f3089c76a12eb817bf35e08033f00fdb2ed6865586b21b0f52ea0905501faf8e",
  },
  "packages/engine/src/initial-setup/sunset-policy.ts": {
    base: "a7d5b557d7af974e24a75bb334535b8d0d7cf7eef3909d9c223cfc64bd5b1c8f",
    head: "4fbace8468c8318749f964b346c05ccd474717fb60bd24f759462fa0304a02c9",
  },
  "packages/engine/src/logistics/admission.ts": {
    base: "3c3c1a577e274139c26c266781ac2839e7123b76e545d24fcceb4b798df67bcd",
    head: "46c236d52a7b7996e8d3a771d89f532b467ef2f87a41c7cfd97dd9f61e786e1b",
  },
  "packages/engine/src/logistics/declaration.ts": {
    base: "275092dad76b75a328ad35462cbce3fab272c9e76f450c6aac322ccb6c2e18a3",
    head: "ba0e773b757ce18a6b2fa9022b445144a179463541c89fed4d8c598ceb4bbf1e",
  },
  "packages/engine/src/logistics/derive.ts": {
    base: "fb9e3e55e9549c9048f2aabae36e3c622245efb0d82bb62b1348f91bd5b5a6f4",
    head: "68e251d9772a2bb1632d64e529b9a59a86eec5971f08bb60f9b9822da5502969",
  },
  "packages/engine/src/logistics/integrity.ts": {
    base: "4eb298089ebfd930f40d80a1ea6fb433bfc4308f7aef2454c469f1ae773f1fef",
    head: "db8eaef49cbd6e80392b14216c597757e706c9c85238275b0fda497ed9ec7b4e",
  },
  "packages/engine/src/logistics/provider.ts": {
    base: "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
    head: "11db33085db3a2cd25fa0b7be06f2702f96956bcba18d0bc0c6915ea77a32c94",
  },
  "packages/engine/src/persistence/checkpoint-package.ts": {
    base: "658f771731e19322c6cb9ce3edf3c0d6b2f3310c99640f04bad346fb31d2b81a",
    head: "ba5e848e6d625f17a9a108f2e248e6b2e430185d80ed3d251fa630b648b53ebe",
  },
  "packages/engine/src/persistence/file-package.ts": {
    base: "50d5a2bd7bc0940f43212ee494d24b3b71d6aef658f645fb59aea2565754a9ea",
    head: "218a095c6d01afa04fe9298f2f6a9da0f36c425b2e0c80cac44d1990b66149a0",
  },
  "packages/engine/src/persistence/store.ts": {
    base: "2405d8f8d8afa44bcb63e6a5ef73a476b1a3632f63c307c5d615ef7b063f4ff1",
    head: "c0e03ec9395db692620289f035f8ae1fbc83a614710138ff0cfb127e34576fa3",
  },
  "packages/engine/src/production/admission.ts": {
    base: "00a008aaccdb38a48bda1f101327ff5edbc31be67ea545127d2719fe12aac8b6",
    head: "643166b1a7a3cb1df6fec2b22aefa1a2967145a2f31041b3cbe6dc470bbf5989",
  },
  "packages/engine/src/temporal/admission.ts": {
    base: "3990ae27fd762da31553118d3c9502b60fa74c4c4fc334399be2a5d6f132620d",
    head: "fc7bb7ff4d03a082c46ef4d52ce5ba3ad51f37b22f612175d5be3a9a86d09667",
  },
  "packages/engine/src/temporal/coordinator.ts": {
    base: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
    head: "36b5115b2721ba6999bbbe2d812cadb8990acd5afd933a31371e30a45c5cfcde",
  },
  "packages/testkit/src/index.ts": {
    base: "14f3cfccee2169ded1fdd345597b018b7544c27dd90ea085251bfa47aaebc47b",
    head: "1dfc93956984f690557b1d537d9f49b5faf25bdb8f123634682d608466cc168e",
  },
};
