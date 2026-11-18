/** RP-1 Stage 2 implementation identities for the two request binders and three retained records. */
export const RP1_STAGE2_BASE = "cdc865f9477146775c25cfdf1dbff78d1e07a723";
export const RP1_STAGE2_BASE_TREE = "da1128c9cafb6d5c37bb9dc58f4829f91ce5cb74";
export const RP1_STAGE2_DELTAS = {
  "apps/phone/src/goal-record.ts": {
    base: "a24f0a989ecf1850cb56eccae05b75d3981e7ccf5d3c0fc537d86bd46746c266",
    head: "3bbc750b4e7b180fab9357e3e3bff09be946f5ac39e6b2fb5e8256d36511bee2",
  },
  "apps/phone/src/recovery.ts": {
    base: "a9c2b9f6c2e2e3ef32bc6c2eb1daa4951d03e3edc1eaa0106899b9a06f5d6c7c",
    head: "8c9db227db3956ea9117d9300c94571d629dd0bf2629a91b1e2e29b52ac3604a",
  },
  "apps/phone/src/retained-file.ts": {
    base: null,
    head: "b7c0787b6d35aa25a388e6bb519ae339577b535759a3edcab791977bb062f453",
  },
  "apps/phone/src/route-record.ts": {
    base: "64e979f1304930f6016711f2ab353c4d8bffa0360cc4617235cf0c393167df08",
    head: "c40c3dd029b86a6a33f52148729089cce1a9a556c96e54782bf494fad2d2f626",
  },
  "packages/operator/src/advance-request-exchange.ts": {
    base: "f4877db7a45c379fb02aed6983012f6084f365c4bf34f462c979ed54b96f2124",
    head: "1ae4c5b07370356aad58ab4b48d9f75b5c2e37b672694c6a8a1db3000881e3f5",
  },
  "packages/operator/src/observe-request-exchange.ts": {
    base: "e92b96cd575b4e6f63dff8c1a0d4888a207a0b01a14e131b123eecafe8d5bb54",
    head: "6576f38bebfd7111f8f5e00ff9206b53cb58ffee21325f0b72b0d12ff182f537",
  },
  "packages/operator/src/request-host-binding.ts": {
    base: null,
    head: "b8eb9b800e90810d899f29d87db3bce0f76ab6fde43de4e89b19a911d6c0d742",
  },
} as const;

export const RP1_STAGE2_PACKAGE_PATHS = Object.keys(RP1_STAGE2_DELTAS).filter((path) =>
  path.startsWith("packages/"),
);
