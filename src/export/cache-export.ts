import { create } from "../background/answer-cache";
import type { GenerationMetadata, Source, Usage } from "../shared/contracts";

export type ExportFormat = "markdown" | "jsonl";
export interface ExportSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}
export interface ExportProgress {
  exported: number;
  skipped: number;
}
export interface ExportManifest {
  type: "manifest";
  format: "superx-cache";
  version: 1;
  exportedAt: string;
  consistency: "read-time";
  description: string;
}
export interface ExportAnalysis {
  type: "analysis";
  variantId: string;
  postUrl: string | null;
  language: string | null;
  provider: string | null;
  model: string | null;
  reasoningEffort: string | null;
  completedAt: string | null;
  text: string;
  sources: Source[];
  verificationStatus?: string;
  usage?: Usage;
  usageComplete?: boolean;
  usageByStage?: GenerationMetadata["usageByStage"];
  modelByStage?: GenerationMetadata["modelByStage"];
}
export interface ExportSummary extends ExportProgress {
  exportedAt: string;
  version: 1;
  consistency: "read-time";
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function parsedArray(value: unknown): unknown[] | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as unknown[]) : null;
  } catch {
    return null;
  }
}
function provider(value: unknown): string | null {
  return value === "api" ||
    value === "oauth" ||
    value === "build" ||
    value === "x-native"
    ? value
    : null;
}
function effort(value: unknown): string | null {
  return typeof value === "string" &&
    [
      "auto",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ].includes(value)
    ? value
    : null;
}
function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f]/u.test(value))
    return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function postUrl(value: unknown): string | null {
  const safe = httpUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (
    !["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(
      url.hostname,
    ) ||
    url.port ||
    !/^\/(?:[A-Za-z0-9_]+|i\/web)\/status\/\d+\/?$/u.test(url.pathname)
  )
    return null;
  // The public post identity does not need query parameters or a fragment.
  return `${url.protocol}//${url.hostname}${url.pathname}`;
}
function keyMetadata(
  key: string,
): Pick<
  ExportAnalysis,
  "postUrl" | "language" | "provider" | "model" | "reasoningEffort"
> {
  const empty = {
    postUrl: null,
    language: null,
    provider: null,
    model: null,
    reasoningEffort: null,
  };
  const parts = parsedArray(key);
  if (!parts) return empty;
  if (
    parts.length === 9 &&
    parts[0] === "SuperX-native-answers-v1" &&
    parts[1] === "x-native" &&
    typeof parts[2] === "string" &&
    typeof parts[4] === "string" &&
    typeof parts[5] === "string" &&
    parts[6] === "native-prompt-v1-fast-markdown-format" &&
    typeof parts[7] === "string" &&
    parts[8] === "fast"
  ) {
    return {
      postUrl: postUrl(parts[3]),
      language: string(parts[5]),
      provider: "x-native",
      model: "fast",
      reasoningEffort: null,
    };
  }
  if (
    parts.length !== 13 ||
    parts[0] !== "GrokFirst-v1" ||
    !["api", "oauth", "build"].includes(String(parts[1])) ||
    typeof parts[3] !== "string" ||
    typeof parts[4] !== "boolean" ||
    typeof parts[5] !== "boolean" ||
    parts[6] !== "api-v11-context-images" ||
    !["preset", "custom"].includes(String(parts[7])) ||
    parts[8] !== "only" ||
    parts[10] !== "fact-check-prompts-v2-deeper" ||
    typeof parts[11] !== "string" ||
    !effort(parts[12])
  )
    return empty;
  let model: string | null;
  const account = parts[2];
  if (parts[1] === "api") {
    if (typeof account !== "string") return empty;
    model = string(account);
  } else if (parts[1] === "oauth") {
    if (
      !Array.isArray(account) ||
      account.length !== 2 ||
      (account[0] !== null && typeof account[0] !== "string") ||
      typeof account[1] !== "string"
    )
      return empty;
    model = string(account[1]);
  } else {
    if (
      !Array.isArray(account) ||
      account.length !== 3 ||
      account[0] !== "official-ws-v1" ||
      typeof account[1] !== "number" ||
      !Number.isFinite(account[1]) ||
      typeof account[2] !== "string"
    )
      return empty;
    model = string(account[2]);
  }
  const input = parsedArray(parts[9]);
  if (
    !input ||
    input.length !== 4 ||
    input[0] !== "post-input-v4-source-full-url" ||
    input[1] !== parts[1] ||
    typeof input[3] !== "string"
  )
    return empty;
  return {
    postUrl: postUrl(input[2]),
    language: string(input[3]),
    provider: provider(parts[1]),
    model,
    reasoningEffort: effort(parts[12]),
  };
}
function iso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function numbers(
  value: unknown,
  fields: readonly string[],
): Record<string, number> {
  const raw = object(value),
    result: Record<string, number> = {};
  for (const field of fields) {
    const n = raw?.[field];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0)
      result[field] = n;
  }
  return result;
}
function usage(value: unknown): Usage | undefined {
  const raw = object(value);
  if (!raw) return undefined;
  const result: Usage = numbers(raw, [
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "num_sources_used",
    "num_server_side_tools_used",
    "cost_in_usd_ticks",
  ]);
  for (const [field, fields] of [
    [
      "input_tokens_details",
      ["cached_tokens", "text_tokens", "image_tokens", "audio_tokens"],
    ],
    ["output_tokens_details", ["reasoning_tokens", "audio_tokens"]],
    [
      "server_side_tool_usage_details",
      [
        "web_search_calls",
        "x_search_calls",
        "x_posts_fetched",
        "x_users_fetched",
        "code_interpreter_calls",
        "file_search_calls",
        "mcp_calls",
        "document_search_calls",
        "image_generation_calls",
      ],
    ],
  ] as const) {
    const details = numbers(raw[field], fields);
    if (Object.keys(details).length) result[field] = details;
  }
  return Object.keys(result).length ? result : undefined;
}
async function analysis(
  key: string,
  value: unknown,
): Promise<ExportAnalysis | null> {
  const raw = object(value);
  if (!raw || typeof raw.text !== "string" || !raw.text.trim()) return null;
  const hash = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  const metadata = keyMetadata(key);
  const result: ExportAnalysis = {
    type: "analysis",
    variantId: Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
    postUrl: metadata.postUrl,
    language: metadata.language,
    provider: provider(raw.provider) ?? metadata.provider,
    model: string(raw.model) ?? metadata.model,
    reasoningEffort: metadata.reasoningEffort,
    completedAt: iso(raw.completedAt),
    text: raw.text,
    sources: [],
  };
  for (const source of Array.isArray(raw.sources)
    ? (raw.sources as unknown[])
    : []) {
    const item = object(source),
      url = httpUrl(item?.url);
    if (url)
      result.sources.push({
        url,
        title: typeof item?.title === "string" ? item.title : "",
      });
  }
  if (typeof raw.verificationStatus === "string")
    result.verificationStatus = raw.verificationStatus;
  const cleanUsage = usage(raw.usage);
  if (cleanUsage) result.usage = cleanUsage;
  if (typeof raw.usageComplete === "boolean")
    result.usageComplete = raw.usageComplete;
  const usageStages = object(raw.usageByStage),
    modelStages = object(raw.modelByStage);
  for (const stage of ["url", "explain", "verify", "inline", "comments"]) {
    const clean = usage(usageStages?.[stage]),
      model = string(modelStages?.[stage]);
    if (clean) (result.usageByStage ??= {})[stage] = clean;
    if (model) (result.modelByStage ??= {})[stage] = model;
  }
  return result;
}
// Only metadata is escaped: the analysis body remains byte-for-byte Markdown.
function markdownText(value: string | null): string {
  return (value ?? "unknown")
    .replace(/[\r\n\u2028\u2029\u0000-\u001f\u007f]+/gu, " ")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/[\\`*_[\]{}()#+!|~]/gu, "\\$&");
}
function markdownUrl(url: string): string {
  return `<${url.replace(/</gu, "%3C").replace(/>/gu, "%3E")}>`;
}
function markdown(value: ExportAnalysis): string {
  const header = [
    ["Completed at", value.completedAt],
    ["Provider", value.provider],
    ["Model", value.model],
    ["Language", value.language],
    ["Reasoning effort", value.reasoningEffort],
    ["Variant ID", value.variantId],
  ]
    .map(([label, text]) => `${label}: ${markdownText(text ?? null)}`)
    .join("\n\n");
  const original = `Post URL: ${value.postUrl ? markdownUrl(value.postUrl) : "unknown"}`;
  const sources = value.sources
    .map(
      (source) => `- ${markdownText(source.title)} ${markdownUrl(source.url)}`,
    )
    .join("\n");
  return `${original}\n\n${header}\n\n---\n\n${value.text}\n\n---\n\n## Sources\n\n${sources || "No public sources recorded."}\n`;
}
function check(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw (
      signal.reason ??
      Object.assign(new Error("Export cancelled."), { name: "AbortError" })
    );
}

export async function exportCache(options: {
  indexedDB: IDBFactory;
  format: ExportFormat;
  sink: ExportSink;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
  exportedAt?: number;
  keyRange?: typeof IDBKeyRange;
}): Promise<ExportProgress> {
  const { sink, signal, onProgress } = options;
  const store = create({
    indexedDB: options.indexedDB,
    keyRange: options.keyRange,
  });
  const progress: ExportProgress = { exported: 0, skipped: 0 };
  async function write(chunk: Uint8Array): Promise<void> {
    check(signal);
    await sink.write(chunk);
    check(signal);
  }
  try {
    check(signal);
    const exportedAt = iso(options.exportedAt ?? Date.now());
    if (!exportedAt) throw new Error("Invalid export timestamp.");
    const description =
      "Records are read in separate batches, not a consistent snapshot. Concurrent writes/deletions may change the export. Analysis only: no original post text, webpage mirrors or image files. Versioned JSONL is an archive format, not an account-cache import format.";
    const manifest: ExportManifest = {
      type: "manifest",
      format: "superx-cache",
      version: 1,
      exportedAt,
      consistency: "read-time",
      description,
    };
    const encoder = new TextEncoder();
    // Initialize zip.js only when exporting ZIP. Loading the public bundle (or
    // exporting JSONL) does not require DOM, Blob or stream constructors.
    const zipModule =
      options.format === "markdown"
        ? await import("@zip.js/zip.js/lib/zip-core-custom.js")
        : null;
    check(signal);
    const zip = zipModule
      ? new zipModule.ZipWriter(new WritableStream<Uint8Array>({ write }), {
          level: 0,
          useWebWorkers: false,
          useCompressionStream: false,
          bufferedWrite: false,
          keepOrder: true,
          preventClose: true,
          signal,
        })
      : null;
    async function add(name: string, text: string): Promise<void> {
      check(signal);
      if (!zip || !zipModule) throw new Error("ZIP writer is unavailable.");
      await zip.add(name, new zipModule.TextReader(text));
      check(signal);
    }
    if (zip)
      await add(
        "README.md",
        `# SuperX cache export\n\nVersion: 1\n\nExported at: ${exportedAt}\n\nConsistency: read-time\n\n${description}\n\nEach analysis-<SHA256>.md contains one cached analysis variant. The ID hashes its private cache key; private keys are omitted. export-summary.json is written last and records exported/skipped counts. A successful export requires the archive and destination to close successfully.\n`,
      );
    else if (options.format === "jsonl")
      await write(encoder.encode(JSON.stringify(manifest) + "\n"));
    else throw new Error("Unsupported cache export format.");
    let after: string | undefined;
    do {
      check(signal);
      const page = await store.readPage({ after });
      check(signal);
      for (const item of page.items) {
        check(signal);
        const record = await analysis(item.key, item.value);
        check(signal);
        if (!record) progress.skipped++;
        else {
          if (zip)
            await add(`analysis-${record.variantId}.md`, markdown(record));
          else await write(encoder.encode(JSON.stringify(record) + "\n"));
          progress.exported++;
        }
        onProgress?.({ ...progress });
      }
      after = page.next ?? undefined;
    } while (after !== undefined);
    check(signal);
    if (zip) {
      const summary: ExportSummary = {
        ...progress,
        exportedAt,
        version: 1,
        consistency: "read-time",
      };
      await add("export-summary.json", JSON.stringify(summary) + "\n");
      await zip.close();
      check(signal);
    }
    onProgress?.({ ...progress });
    check(signal);
    // Resolving close commits the destination. Cancellation can no longer undo
    // that file or turn a successful commit into an aborted export.
    await sink.close();
    return { ...progress };
  } catch (error) {
    try {
      await sink.abort(error);
    } catch {
      /* Preserve the read/write/close/cancellation error. */
    }
    throw error;
  } finally {
    // If open itself failed, that failure has already been reported above.
    await store.close().catch(() => {});
  }
}
