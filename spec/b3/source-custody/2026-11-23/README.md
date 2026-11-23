# IMMORTALIS B3 — C0 SOURCE-BYTE CUSTODY (UNADOPTED)

**Status:** ARCHIVAL CANDIDATE; QV-1 FAIL; no effective source grant, no Builder/production activation, no merge authorization. This non-merge branch exists only to make the exact original BLUE archive independently retrievable. Do not treat the file as an adopted opening Profile.

- Source branch: `blue/b3-c0-evidence-custody-20261123`, created from `main@728104565662fece3e76be5b94c28f3c4201dbb7`.
- `immortalis_B3_FULL_construction_handoff_2026-11-23.zip.base64.txt`: Base64 encoding of the byte-identical **original ZIP**, one line plus trailing LF, 54,805 UTF-8 bytes; SHA-256 `405438ee58f69f741be3cc667ebcd38f10fc7bfbf4722c261ac8c86c16dc031c`; Git blob SHA `d0aa0113ef648ed768c2891f3ed88c085f89a5cb`.
- **Decoded original ZIP:** 41,103 bytes, SHA-256 `118eee70c7f0cb0b18554e2f461a3e25e071257bafc9c6a8c69bb6d22ca38ec7`.

## Independent retrieval

Fetch the `.base64.txt` file from this source-only branch or its exact immutable commit (avoid unpinned branch reads for final evidence). Decode and verify:

```bash
base64 --decode immortalis_B3_FULL_construction_handoff_2026-11-23.zip.base64.txt > immortalis_B3_FULL_construction_handoff_2026-11-23.zip
sha256sum immortalis_B3_FULL_construction_handoff_2026-11-23.zip
unzip -t immortalis_B3_FULL_construction_handoff_2026-11-23.zip
```

*Note: copy the actual filename from the repository; the display examples may contain nonprinting separator characters. The expected ZIP SHA-256 is shown above.*

## Exact ZIP member hashes

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `BLUE_FULL_B3_PREFLIGHT.md` | 10697 | `934a1e66b81e78af831934652df36a7ed959095f290e632c87688cb7c56e6716` |
| `FULL_B3_BUILDER_BRIEF.md` | 9828 | `96e1509f3d6986cb04942efdae70ea5e226757422bf96f085ba770896b0ac82d` |
| `IF1_IF6_CONSTRUCTION_BINDINGS_CANDIDATE.json` | 1927 | `3ed5c417fbaa5a1482fba24a05dc6e4833387d1e3e14f71fbb38bfe996ce4bea` |
| `SHA256_FILE_MANIFEST.json` | 1320 | `3cce1e996cce91311588c7368fe1a7c1754e5606b1d70ed363368266e86b3fe0` |
| `manifest-index.json` | 975 | `5ffea78335ddb6a9c0ece8c01aee0cc73b917bc6c0527b523385d153f68a806f` |
| `source-correction-matrix.md` | 7427 | `e3640c3ce0aeb40c832ab598f36fc0e4e715e86979b92aae3e13d822de6374b1` |
| `verify-authored-contracts.py` | 7569 | `1822c2fed3444fbd9d79d42129a3086615baea374eb44cc424eb77bd66023968` |
| `workshop-opening-glassbell-v1.json` | 52410 | `02dcbc20d2c0cc073c5417340bfcb527adbd7d5b0b2abe9853ad0cc19aa7b7dc` |
| `workshop-opening-quiet-v1.json` | 47931 | `513a93263713d1df82a17b9462eac1a04d93698b4bb86f69b0086edc8b726da5` |

## Why the original candidate fails

Quiet has 25 proposed owner groups, only 7 with an `authored_value` and 18 with original-producer requirements. Glassbell has 28 proposed groups, only 7 with an `authored_value` and 21 without. RED CB-1.3 QV-1 requires every group to contain a complete strict original value, validated against its actual owner schema at the pinned base. Neither current candidate passes. The existing checker (12 mutants) does **not** establish QV-1.

Correct governing construction plan: [BLUE FULL B3 v2.0](https://app.notion.com/p/42120af901e081fdac32e51c3350e5ce), native pin `2026-11-23T10:14:06.394Z`. [RED one-pass](https://app.notion.com/p/42120af901e0812d8667f78defa14e37), native pin `2026-11-23T09:31:44.986Z`. [GitHub issue #137](https://github.com/gamerelninorex-bit/Immortalis/issues/137). These references describe **proposed architecture**, not deployed owner authority.

**A8 first-party retrieval is now available in this branch. Builder/reviewer must independently recompute hash; do not infer acceptance. A0/QV-1 and AD-1, AD-4, AD-5 remain separate gates.**
