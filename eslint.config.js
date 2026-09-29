import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "**/dist", "coverage", "pnpm-lock.yaml"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
