/**
 * Owner-neutral seam for pending-enrollment fences the IM-02 coordinator consults BEFORE it opens a transaction. The
 * coordinator coordinates and is never a substantive owner: each fence below is its owner's own rule, stated once in that
 * owner's module and re-used unchanged by kernel admission (`temporalGroupCheck`), so the typed pre-stage refusal and the
 * raw-commit refusal cannot drift. The coordinator learns only "an enrollment is pending and this stop would reach it".
 *
 * `dispatchEnrollmentPendingViolation` — ROADBED R2-D18 v1.2.1 §4 step 8: a committed first dispatch that is not yet both
 * enrolled with the Temporal kernel and consumed by its requesting owner fences its own original delivery boundary on every
 * advance path (INITIAL, HELD, RESUME and a raw canonical advance).
 */
export { freightDispatchPendingViolation as dispatchEnrollmentPendingViolation } from "../logistics/freight.ts";
