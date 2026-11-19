/** Git identities for the four production files in the BLUE RP-2 brief. */
export const RP2_BASE = "063c106247c385ea11e65d3ad948c9b172a09e65";
export const RP2_BASE_TREE = "f4d7a63b866c12303472876e7a4d4a01d2f6940a";
export const RP2_SOURCE_DELTAS = {
  "apps/phone/src/chat-tools.ts": {
    base: "5fc050ca933dda52879d87d622587d76a5d01e16",
    head: "56e3f6f0b68ad5e126392143665e787dc5339166",
  },
  "packages/operator/src/referee-exchange.ts": {
    base: "47989cb102c11b74ec76ec3b87e4fbc69a18425d",
    head: "28865fa84782f4593a7498457e05ff241b880cb2",
  },
  "packages/engine/src/population/derive.ts": {
    base: "16896fbd6bf5892b2088fb62c3558fb98228bb5c",
    head: "6c6e9735aade26b0c5779e6233de4ac29b9332f4",
  },
  "packages/contracts/src/json.ts": {
    base: "66f4d819d936abf61c8ad534ee77edce86446363",
    head: "334d305425d49a1cf1a2e0085b476c285d712422",
  },
} as const;

export const RP2_PACKAGE_PATHS = Object.keys(RP2_SOURCE_DELTAS).filter((path) =>
  path.startsWith("packages/"),
);
