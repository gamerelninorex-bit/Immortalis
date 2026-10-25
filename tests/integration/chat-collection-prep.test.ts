/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON */
import { afterEach, describe, expect, it, vi } from "vitest";
import { started, status, stage, walk, keys, MOMENT } from "../support/chat-route.ts";

afterEach(() => vi.restoreAllMocks());

describe("SCRATCH: smoke", () => {
  it("walks", async () => {
    const r = await started();
    try {
      const s0 = await status(r.chat);
      console.log(JSON.stringify(s0, null, 1));
      const out = await walk(r);
      for (const [k, v] of Object.entries(out))
        console.log(
          k,
          JSON.stringify((v as any).finished.data ?? (v as any).finished.text)?.slice(0, 1500),
        );
      console.log(JSON.stringify(await status(r.chat), null, 1));
      console.log((await keys(r.s)).filter((k) => !k.startsWith("world/")).join("\n"));
      void stage;
      void MOMENT;
      void expect;
    } finally {
      await r.stop();
    }
  }, 240_000);
});
