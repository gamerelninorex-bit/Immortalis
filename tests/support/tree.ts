import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every file under a directory (recursively): path -> content. */
export const treeOf = (dir: string, prefix = ""): Record<string, string> =>
  Object.fromEntries(
    readdirSync(dir)
      .sort()
      .flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory()
          ? Object.entries(treeOf(full, `${prefix}${name}/`))
          : [[`${prefix}${name}`, readFileSync(full, "utf8")] as const];
      }),
  );
