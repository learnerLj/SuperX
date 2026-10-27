// Only typed production entrypoints are generated. Existing JS transports stay JS.
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const GENERATED_ENTRIES = Object.freeze([
  {
    source: "src/background/answer-cache.ts",
    output: "extension/answer-cache.js",
    globalName: "SuperXAnswerCache",
  },
  {
    source: "src/background/provider-registry.ts",
    output: "extension/provider-registry.js",
    globalName: "SuperXProviders",
  },
  {
    source: "src/content/feed-scheduler.ts",
    output: "extension/feed-scheduler.js",
    globalName: "SuperXFeedScheduler",
  },
]);
export async function buildExtension({
  root = projectRoot,
  check = false,
} = {}) {
  const types = spawnSync(
    process.execPath,
    [
      resolve(root, "node_modules/typescript/bin/tsc"),
      "--project",
      resolve(root, "tsconfig.json"),
      "--noEmit",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (types.error || types.status !== 0)
    throw new Error(
      types.error?.message ||
        types.stdout ||
        types.stderr ||
        "TypeScript failed",
    );
  for (const entry of GENERATED_ENTRIES) {
    const result = await build({
      absWorkingDir: root,
      entryPoints: [entry.source],
      outfile: entry.output,
      bundle: true,
      write: false,
      format: "iife",
      globalName: entry.globalName,
      platform: "browser",
      target: "chrome120",
      charset: "utf8",
      legalComments: "none",
      banner: {
        js: `// GENERATED from ${entry.source}. Edit src/ and run npm run build.`,
      },
      footer: {
        js: `if (typeof module === "object" && module.exports) module.exports = ${entry.globalName};`,
      },
    });
    const bytes = result.outputFiles[0].contents,
      location = resolve(root, entry.output);
    if (check) {
      let existing;
      try {
        existing = await readFile(location);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (!existing || !existing.equals(Buffer.from(bytes)))
        throw new Error(
          `Generated output drift: ${entry.output}; run npm run build.`,
        );
    } else await writeFile(location, bytes);
  }
  return GENERATED_ENTRIES.length;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check"))
    throw new Error("Usage: node tools/build-extension.mjs [--check]");
  buildExtension({ check: args.includes("--check") })
    .then((count) =>
      console.log(
        `Strict TypeScript and ${count} generated entries ${args.includes("--check") ? "verified" : "built"}.`,
      ),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
