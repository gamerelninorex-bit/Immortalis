# F-014B B1 S3 - the present-basis reader: what it reads, what it returns, what it cannot say

MECHANISM ONLY, NON-WRITING, UNWIRED. `packages/engine/src/gm-wait-present-reader.ts` is a pure function over an injected fact source. It has no store, writes nothing,
opens no authority, and no production GM-wait host, admission or driver path calls it. It is named by no production file other than itself and the test tables.

## The read set (EXECUTED traces: tests/conformance/gm-wait-present-s3.test.ts, tests/integration/gm-wait-present-s3-committed.test.ts)

Eight categories, each a fixed key template built by the module from a closed table; a key the table cannot derive from an earlier read is refused and appears in the trace.
At most 25 keys can be read in one classification (`S3_MAX_READS`), independent of the size of the world; a stationary PC in a committed campaign reads 18, whether the
campaign holds 0, 20 or 60 unrelated ledgers (measurements.md).

| Cat | What                              | Keys                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | identity / result / custody       | the transaction record, its authority record, and (CONTINUATION only) the source transaction record                                                                                                                                                                                                                      |
| 2   | clock                             | `temporal/state`                                                                                                                                                                                                                                                                                                         |
| 3   | operative PC chain                | the Role Registry binding, the PC locus custody, and, only when custody names a world, that world's rival entity, transition, transfer and commitment records for the PC, the PC movement commitment and request, the registered movement object, the PC occupancy, and (open occupancy only) its extraction and reserve |
| 4   | catalogue digest                  | no store read: the supplied digest is judged against the build's retained manifests                                                                                                                                                                                                                                      |
| 5   | PC-known commitments, PROVISIONAL | the PC's standing-instruction ledger head and sequence-1 version                                                                                                                                                                                                                                                         |
| 6   | GIP                               | the sunset enrollment receipt, then the Instrument it names, then the Instrument's Temporal object                                                                                                                                                                                                                       |
| 7   | freight                           | the first-profile dispatch enrollment receipt, then its original E1 and TE records                                                                                                                                                                                                                                       |
| 8   | origin witness                    | `temporal/origin`, only for a genuinely fresh INITIAL, through the existing `siOriginWitnessViolation`                                                                                                                                                                                                                   |

The boundary index is never read (the legacy `isStationaryActivePc` and `pcCollectionCrossingClear` read the whole index; S3 uses neither). Malformed data is `INVALID`,
never `VALID_ABSENT`; a source that throws is a malformed read, never an absence. Every read, present or absent, is a witness with the version it saw (version 0 for an
absence), and `witnessesStillCurrent` re-checks a result's witnesses against a later source.

Source classes: VALID_ABSENT, COMPLETE, PENDING, INVALID. Verdicts (closed): REFUSE, PENDING, UNKNOWN, EXISTING_RESULT, plus the single synthetic positive below.

## Positive verdicts

There is none under the production catalogue: every member is UNDECLARED and ACTIONABLE_OR_UNSAFE, so a production classification ends in REFUSE (`CATALOGUE_UNDECLARED`) or
UNKNOWN. The only positive is `SYNTHETIC_TEST_POLICY_POSITIVE`, reachable only through a `SYNTHETIC_TEST_ONLY` policy whose id is a non-digest label and which can
never carry a production digest. The tests show the same worlds refused under the production catalogue. The authenticated GM binding does not exist, so every call carries
the labelled test precondition `UnauthenticatedGmBindingPrecondition` and the result says `NOT_PROVEN_TEST_PRECONDITION`.

## Category 5 (PROVISIONAL, BLUE Q2 as amended)

The ledger head plus its qualified sequence-1 version is at most an eligible PARTIAL candidate witness, and only when all three of these are proven by what S3 reads:
the exact operative PC identity (the Role Registry binding names this PC, and both records are this PC's and digest-consistent), the current source permission or visibility
(the carrier's access class is one the catalogue's audience projection names), and the governing policy (the carrier's rule is one the catalogue registers for the kind). A
result is PARTIAL_WITNESS or UNKNOWN (INVALID for a corrupt or half-present ledger); it is never complete; an absent ledger is UNKNOWN, never VALID_ABSENT; and under the
production catalogue a PARTIAL_WITNESS never flips a verdict positive. The trace carries the three proof records. No generic replacement fact or key is invented.

In the current catalogue the ledger's access class is not named by the audience projection, so a real committed ledger classifies UNKNOWN with identity and governing policy
PROVEN and visibility UNPROVEN (EXECUTED, committed-campaign test). A test-built variant of the production catalogue that names the class gives PARTIAL_WITNESS (EXECUTED), and still no positive verdict under that catalogue.

### Missing producer / consumer authority for category 5 (for S4 / section 10)

Nothing in the accepted sources says (a) which producer may state "this PC has no further known commitments" for a GM wait, (b) which consumer may read the standing-instruction
ledger on the GM's behalf, under which access class, or (c) which policy governs the answer. The empty sequence-1 ledger witness says only that the carrier had no enrolled instruction
at its cut; it is explicitly not a statement about the player's intentions, promises or older fictional directions (see the contract comment in `pc-standing-ledger.ts`). S3 therefore
carries the three proof requirements in its trace and stops at PARTIAL_WITNESS or UNKNOWN. Supplying that authority is S4 / section 10 work.

## The A0 re-pin (declared, scoped supersession)

`tests/conformance/a0-scope-conformance.test.ts` pinned `siOriginWitnessViolation` to appear in production only in `packages/contracts/src/temporal-origin.ts`. A pure, present-only helper
consumer now exists (the S3 reader, category 8, fresh INITIAL only), so that one assertion names the reader as the single declared additional production caller. The invariant the test exists
for is preserved and asserted in the same test: the predicate stays a pure function with no store, filesystem, clock or random; no file under the Temporal, owners, initial-setup, ms-setup,
protocol, operator or apps trees names it; and no production file other than the reader names the reader module. CONTINUATION, replay and seal read no origin, no Input, Completion or chronology
record is read, and no wire field is added.
