// Every first-party extension script is generated from strict TypeScript.
import ts from "typescript";
import { build, transform } from "esbuild";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VENDOR_SCRIPTS = Object.freeze([
  "marked.umd.js",
  "marked-cjk-friendly.umd.js",
]);
const script = (source, output) => ({
  source: `src/${source}.ts`,
  output: `extension/${output}.js`,
  standalone: true,
});
export const GENERATED_ENTRIES = Object.freeze([
  script("background/worker", "background"),
  script("shared/feed-core", "feed-core"),
  script("background/history-store", "history-store"),
  script("background/key-store", "key-store"),
  script("providers/api-provider", "api-provider"),
  script("providers/build-acp", "build-acp"),
  script("providers/build-transport", "build-transport"),
  script("providers/build-provider", "build-provider"),
  script("providers/build-setup", "build-setup"),
  script("providers/native-api-bridge", "native-api-bridge"),
  script("providers/native-protocol", "native-protocol"),
  script("providers/native-provider", "native-provider"),
  script("providers/oauth-provider", "oauth-provider"),
  script("content/content", "content"),
  script("content/draft-composer", "draft-composer"),
  script("content/native-panel", "native-panel"),
  script("content/overlay-layout", "overlay-layout"),
  script("content/markdown-renderer", "markdown-renderer"),
  script("ui/options", "options"),
  script("ui/popup", "popup"),
  script("ui/setup", "setup"),
  script("ui/history", "history"),
  script("ui/i18n", "ui-i18n"),
  {
    source: "src/content/math-renderer.ts",
    output: "extension/math-renderer.js",
    globalName: "SuperXMath",
    minify: true,
    charset: "ascii",
  },
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
export async function inspectScriptOwnership(root = projectRoot) {
  async function scriptsIn(directory, prefix = "") {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory())
        files.push(
          ...(await scriptsIn(resolve(directory, entry.name), name + "/")),
        );
      else if (entry.isFile() && name.endsWith(".js")) files.push(name);
    }
    return files;
  }
  const scripts = (await scriptsIn(resolve(root, "extension"))).sort();
  const owners = new Map();
  for (const entry of GENERATED_ENTRIES) {
    const name = entry.output.slice("extension/".length);
    if (owners.has(name))
      throw new Error(`Duplicate TypeScript owner: ${name}`);
    owners.set(name, entry.source);
    await readFile(resolve(root, entry.source));
  }
  for (const name of scripts)
    if (!owners.has(name) && !VENDOR_SCRIPTS.includes(name))
      throw new Error(`Unowned handwritten runtime: ${name}`);
  for (const name of [...owners.keys(), ...VENDOR_SCRIPTS])
    if (!scripts.includes(name))
      throw new Error(`Missing runtime script: ${name}`);
  return { scripts, owners, vendors: VENDOR_SCRIPTS };
}
/** Keep the migration enforceable: strict checking must not be disabled in source. */
export function checkTypedSource(source, filename) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    source,
  );
  for (
    let kind = scanner.scan();
    kind !== ts.SyntaxKind.EndOfFileToken;
    kind = scanner.scan()
  ) {
    if (
      (kind === ts.SyntaxKind.SingleLineCommentTrivia ||
        kind === ts.SyntaxKind.MultiLineCommentTrivia) &&
      /@ts-(?:ignore|nocheck|expect-error)\b/.test(scanner.getTokenText())
    )
      throw new Error(`Type checking suppression forbidden: ${filename}`);
  }
  const tree = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword)
      throw new Error(`Explicit any forbidden: ${filename}`);
    if (
      ts.isAsExpression(node) &&
      ts.isAsExpression(node.expression) &&
      node.expression.type.kind === ts.SyntaxKind.UnknownKeyword
    )
      throw new Error(`Unchecked double assertion forbidden: ${filename}`);
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
async function checkTypedSources(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = resolve(directory, entry.name);
    if (entry.isDirectory()) await checkTypedSources(filename);
    else if (entry.name.endsWith(".ts"))
      checkTypedSource(await readFile(filename, "utf8"), filename);
    else if (entry.name.endsWith(".js"))
      throw new Error(`Handwritten JavaScript source forbidden: ${filename}`);
  }
}
/** Erase module-only declarations before parsing as a classic script. This
 * preserves legacy top-level `this` instead of esbuild's ESM `void 0`. */
export function classicSource(source, filename) {
  const tree = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const edits = [];
  for (const node of tree.statements) {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly)
        throw new Error(`Classic runtime import forbidden: ${filename}`);
      edits.push([node.getStart(tree), node.end]);
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly)
        throw new Error(`Classic runtime export forbidden: ${filename}`);
      edits.push([node.getStart(tree), node.end]);
    } else if (
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)
    ) {
      for (const modifier of node.modifiers || [])
        if (modifier.kind === ts.SyntaxKind.ExportKeyword)
          edits.push([modifier.getStart(tree), modifier.end]);
    } else if (
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    )
      throw new Error(`Classic runtime export forbidden: ${filename}`);
  }
  for (const [start, end] of edits.sort((a, b) => b[0] - a[0]))
    source = source.slice(0, start) + source.slice(end);
  return source;
}
export async function buildExtension({
  root = projectRoot,
  check = false,
} = {}) {
  await inspectScriptOwnership(root);
  await checkTypedSources(resolve(root, "src"));
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
    const result = entry.standalone
      ? await transform(
          classicSource(
            await readFile(resolve(root, entry.source), "utf8"),
            entry.source,
          ),
          {
            loader: "ts",
            target: "chrome120",
            charset: "utf8",
            legalComments: "none",
            banner: `// GENERATED from ${entry.source}. Edit src/ and run npm run build.`,
          },
        )
      : await build({
          absWorkingDir: root,
          entryPoints: [entry.source],
          outfile: entry.output,
          bundle: true,
          write: false,
          format: "iife",
          globalName: entry.globalName,
          platform: "browser",
          target: "chrome120",
          charset: entry.charset || "utf8",
          minify: entry.minify === true,
          legalComments: "none",
          banner: {
            js: `// GENERATED from ${entry.source}. Edit src/ and run npm run build.`,
          },
          footer: {
            js: `if (typeof module === "object" && module.exports) module.exports = ${entry.globalName};`,
          },
        });
    const bytes = entry.standalone
        ? Buffer.from(result.code)
        : result.outputFiles[0].contents,
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
