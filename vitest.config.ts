import { defineConfig } from "vitest/config";

const project = (name: string) => ({
  test: { name, include: [`tests/${name}/**/*.test.ts`] },
});

export default defineConfig({
  test: {
    projects: ["unit", "contract", "conformance", "security", "integration"].map(project),
  },
});
