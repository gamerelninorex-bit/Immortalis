import { defineConfig } from "vitest/config";

// Integration tests drive durable journals, checkpoints and child processes. On a shared CI runner the 5 s vitest default is
// not a meaningful bound for them: main CI run 44445980478 failed twice on two different tests that relied on it. A test or
// file that declares its own timeout keeps it; this only replaces the implicit default for the integration project.
const DEFAULT_TIMEOUT_MS: Readonly<Record<string, number>> = { integration: 120_000 };

const project = (name: string) => ({
  test: {
    name,
    include: [`tests/${name}/**/*.test.ts`],
    ...(DEFAULT_TIMEOUT_MS[name] ? { testTimeout: DEFAULT_TIMEOUT_MS[name] } : {}),
  },
});

export default defineConfig({
  test: {
    projects: ["unit", "contract", "conformance", "security", "integration"].map(project),
  },
});
