import type { Source } from "../shared/contracts";
export type API = ReturnType<typeof createHistoryStore>;
export interface Limits {
  ttlMs: number;
  maxEntries: number;
  maxBytes: number;
}
export type Usage = Partial<
  Record<
    | "input_tokens"
    | "output_tokens"
    | "total_tokens"
    | "num_sources_used"
    | "num_server_side_tools_used"
    | "cost_in_usd_ticks",
    number
  >
> & {
  input_tokens_details?: Partial<
    Record<
      "cached_tokens" | "text_tokens" | "image_tokens" | "audio_tokens",
      number
    >
  >;
  output_tokens_details?: Partial<
    Record<"reasoning_tokens" | "audio_tokens", number>
  >;
  server_side_tool_usage_details?: Partial<
    Record<
      | "web_search_calls"
      | "x_search_calls"
      | "x_posts_fetched"
      | "x_users_fetched"
      | "code_interpreter_calls"
      | "file_search_calls"
      | "mcp_calls"
      | "document_search_calls"
      | "image_generation_calls",
      number
    >
  >;
};
export interface Metadata {
  usage?: Usage;
  usageComplete?: boolean;
  model?: string;
  usageByStage?: { [stage: string]: Usage };
  modelByStage?: { [stage: string]: string };
}
export interface HistoryAnalysis extends Metadata {
  text: string;
  sources: Source[];
  verificationStatus: string;
  language: string;
  completedAt: number;
  scope?: string;
  verificationStart?: number;
  verificationFailure?: { stage: "verify"; code: string };
}
export interface HistoryPost {
  id: string;
  url: string;
  text: string;
  author: string;
  language: string;
  hasMedia: boolean;
}
export interface Entry extends HistoryPost {
  recordId: string;
  firstViewedAt: number;
  lastViewedAt: number;
  visits: number;
  analysis?: HistoryAnalysis;
  comments?: string[];
  commentsCompletedAt?: number;
  commentsLanguage?: string;
  commentsScope?: string;
  commentsModel?: string;
  commentsUsage?: Usage;
}
export type EntryDTO = Omit<Entry, "recordId">;
export interface Status {
  enabled: boolean;
  epoch: number;
  count: number;
  limits: Limits;
}
export interface Response extends Status {
  entries: EntryDTO[];
}
export interface Ticket {
  id: string;
  recordId: string;
  epoch: number;
}
interface State {
  entries: Entry[];
  enabled: boolean;
  epoch: number;
  resultEpoch: number;
}
interface Storage {
  get(keys: string[]): Promise<{ [key: string]: unknown }>;
  set(items: { [key: string]: unknown }): Promise<void>;
}
// Property views are untrusted; existing checks below own normalization.
type Candidate = {
  [
    K in
      | keyof Entry
      | "provider"
      | "scope"
      | "sources"
      | "text"
      | "model"
      | "usage"
      | "usageComplete"
      | "usageByStage"
      | "modelByStage"
      | "completedAt"
      | "verificationStatus"
      | "verificationStart"
  ]?: unknown;
} & { verificationFailure?: { stage?: unknown; code?: unknown } };
/* SuperX: recent browsing stays in restricted local extension storage. */
(function (
  root: typeof globalThis | undefined,
  factory: typeof createHistoryStore,
) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SuperXHistoryStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, createHistoryStore);
function createHistoryStore() {
  "use strict";
  const STORAGE_KEY = "superxHistory",
    ENABLED_KEY = "superxHistoryEnabled";
  const LIMITS = Object.freeze({
    ttlMs: 24 * 60 * 60 * 1000,
    maxEntries: 1000,
    maxBytes: 6_000_000,
  });
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const text = (value: unknown, limit: number) =>
    typeof value === "string" ? value.slice(0, limit) : "";
  function safeUrl(value: unknown) {
    if (typeof value !== "string" || value.length > 4000) return "";
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password
        ? url.href
        : "";
    } catch {
      return "";
    }
  }
  function postIdentity(value: Candidate | null | undefined) {
    const url = safeUrl(value?.url);
    if (!url) return null;
    const parsed = new URL(url),
      match =
        parsed.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})$/) ||
        parsed.pathname.match(/^\/i\/web\/status\/(\d{1,25})$/);
    if (!/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(parsed.hostname) || !match)
      return null;
    const id = match[match.length - 1]!;
    if (id !== String(value!.id)) return null;
    return {
      id,
      url:
        match.length === 2
          ? `https://x.com/i/web/status/${id}`
          : `https://x.com/${match[1]!.toLowerCase()}/status/${id}`,
    };
  }
  function cleanPost(input: unknown) {
    const value = input as Candidate;
    const identity = postIdentity(value);
    if (!identity) return null;
    return {
      ...identity,
      text: text(value.text, 12000),
      author: text(value.author, 200),
      language: text(value.language, 30),
      hasMedia: value.hasMedia === true,
    };
  }
  function usage(input: unknown): Usage {
    const value = input as { [field: string]: unknown } | null | undefined;
    const result: Usage = {};
    if (!value || typeof value !== "object") return result;
    for (const field of [
      "input_tokens",
      "output_tokens",
      "total_tokens",
      "num_sources_used",
      "num_server_side_tools_used",
      "cost_in_usd_ticks",
    ] as const)
      if (Number.isFinite(value[field]) && (value[field] as number) >= 0)
        result[field] = value[field] as number;
    for (const [field, keys] of [
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
      const details: { [key: string]: number } = {};
      for (const key of keys)
        if (
          Number.isFinite(
            (value[field] as { [key: string]: unknown } | null | undefined)?.[
              key
            ],
          ) &&
          (value[field] as { [key: string]: number })[key]! >= 0
        )
          details[key] = (value[field] as { [key: string]: number })[key]!;
      if (Object.keys(details).length) result[field] = details;
    }
    return result;
  }
  function model(value: unknown) {
    return typeof value === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value)
      ? value
      : "";
  }
  function scope(value: unknown) {
    return typeof value === "string" &&
      /^(?:api|build|x-native|oauth:[A-Za-z0-9-]{1,100})$/.test(value)
      ? value
      : "";
  }
  function metadata(value: Candidate | null | undefined): Metadata {
    const result: Omit<Metadata, "usageByStage" | "modelByStage"> & {
      usageByStage?: { [stage: string]: Usage | string };
      modelByStage?: { [stage: string]: Usage | string };
    } = {};
    if (value?.usage && typeof value.usage === "object")
      result.usage = usage(value.usage);
    if (typeof value?.usageComplete === "boolean")
      result.usageComplete = value.usageComplete;
    if (model(value?.model)) result.model = model(value!.model);
    for (const field of ["usageByStage", "modelByStage"] as const) {
      const stages: { [stage: string]: Usage | string } = {};
      for (const stage of ["url", "explain", "verify", "inline", "comments"])
        if (Object.hasOwn(value?.[field] || {}, stage)) {
          const clean =
            field === "usageByStage"
              ? usage((value![field] as { [stage: string]: unknown })[stage])
              : model((value![field] as { [stage: string]: unknown })[stage]);
          if (field === "usageByStage" || clean) stages[stage] = clean;
        }
      if (Object.keys(stages).length) result[field] = stages;
    }
    return result as Metadata;
  }
  function cleanAnalysis(input: unknown, now: number): HistoryAnalysis | null {
    const value = input as Candidate;
    if (value?.scope === "x-native" || value?.provider === "x-native")
      return null;
    const body = text(value?.text, 30000);
    if (!body.trim()) return null;
    const sources = (
      Array.isArray(value.sources)
        ? (value.sources as { url?: unknown; title?: unknown }[])
        : []
    )
      .slice(0, 20)
      .map((item) => ({
        url: safeUrl(item?.url),
        title: text(item?.title, 200),
      }))
      .filter((item) => item.url);
    const result: HistoryAnalysis = {
      text: body,
      sources,
      verificationStatus: text(value.verificationStatus, 40),
      language: text(value.language, 30),
      completedAt:
        Number.isFinite(value.completedAt as number) &&
        (value.completedAt as number) >= 0 &&
        (value.completedAt as number) <= now
          ? (value.completedAt as number)
          : now,
      ...metadata(value),
    };
    if (scope(value.scope)) result.scope = scope(value.scope);
    if (
      Number.isSafeInteger(value.verificationStart as number) &&
      (value.verificationStart as number) >= 2 &&
      (value.verificationStart as number) <= body.length &&
      body.slice(
        (value.verificationStart as number) - 2,
        value.verificationStart as number,
      ) === "\n\n"
    )
      result.verificationStart = value.verificationStart as number;
    if (
      value.verificationFailure?.stage === "verify" &&
      [
        "TIMEOUT",
        "CONNECTION",
        "LANGUAGE_MISMATCH",
        "RATE_LIMIT",
        "INCOMPLETE",
        "UNKNOWN",
      ].includes(value.verificationFailure.code as string)
    )
      result.verificationFailure = {
        stage: "verify",
        code: value.verificationFailure.code as string,
      };
    return result;
  }
  function cleanComments(value: unknown) {
    const list: unknown[] = Array.isArray(value) ? value : [];
    return list
      .slice(0, 3)
      .map((item) => text(item, 2000).trim())
      .filter(Boolean);
  }
  function normalizedEntries(
    input: unknown,
    now: number,
    limits: Limits = LIMITS,
  ) {
    const records = new Map<string, Entry>();
    for (const value of (Array.isArray(input) ? input : []) as Candidate[]) {
      const post = cleanPost(value),
        last = value?.lastViewedAt,
        first = value?.firstViewedAt;
      if (
        !post ||
        !Number.isFinite(last as number) ||
        (last as number) < 0 ||
        (last as number) > now ||
        now - (last as number) >= limits.ttlMs
      )
        continue;
      const entry: Entry = {
        ...post,
        recordId: text(value.recordId, 100),
        firstViewedAt:
          Number.isFinite(first as number) &&
          (first as number) >= 0 &&
          (first as number) <= (last as number)
            ? (first as number)
            : (last as number),
        lastViewedAt: last as number,
        visits:
          Number.isSafeInteger(value.visits as number) &&
          (value.visits as number) > 0
            ? Math.min(value.visits as number, 1_000_000)
            : 1,
      };
      const analysis = cleanAnalysis(value.analysis, now);
      if (analysis) entry.analysis = analysis;
      const comments =
        value.commentsScope === "x-native" ? [] : cleanComments(value.comments);
      if (comments.length) {
        entry.comments = comments;
        entry.commentsCompletedAt =
          Number.isFinite(value.commentsCompletedAt as number) &&
          (value.commentsCompletedAt as number) <= now
            ? (value.commentsCompletedAt as number)
            : now;
        if (scope(value.commentsScope))
          entry.commentsScope = scope(value.commentsScope);
        entry.commentsLanguage = text(value.commentsLanguage, 30);
        if (model(value.commentsModel))
          entry.commentsModel = model(value.commentsModel);
        if (value.commentsUsage && typeof value.commentsUsage === "object")
          entry.commentsUsage = usage(value.commentsUsage);
      }
      const previous = records.get(entry.id);
      if (!previous || previous.lastViewedAt < entry.lastViewedAt)
        records.set(entry.id, entry);
    }
    const recent = [...records.values()]
        .sort((a, b) => b.lastViewedAt - a.lastViewedAt)
        .slice(0, limits.maxEntries),
      kept: Entry[] = [];
    let bytes = 2;
    for (const entry of recent) {
      const size =
        new TextEncoder().encode(JSON.stringify(entry)).byteLength + 1;
      if (bytes + size > limits.maxBytes) continue;
      bytes += size;
      kept.push(entry);
    }
    return kept;
  }
  function dto(entry: Entry): EntryDTO {
    const { recordId, ...result } = entry;
    return copy(result);
  }
  function create(
    storage: Storage,
    options: { now?: () => number; limits?: Partial<Limits> } = {},
  ) {
    const now = options.now || (() => Date.now()),
      limits = { ...LIMITS, ...options.limits };
    let loaded = false,
      entries: Entry[] = [],
      enabled = true,
      epoch = 0,
      resultEpoch = 0,
      chain: Promise<unknown> = Promise.resolve(),
      counter = 0;
    const boot = `${now()}-${Math.random().toString(36).slice(2)}`,
      entrySizes = new WeakMap<Entry, number>();
    const recordId = () => `${boot}-${++counter}`;
    const status = () => ({
      enabled,
      epoch,
      count: entries.length,
      limits: { ...limits },
    });
    const response = () => ({ ...status(), entries: entries.map(dto) });
    async function load() {
      if (loaded) return;
      const saved = await storage.get([STORAGE_KEY, ENABLED_KEY]),
        moment = now();
      const normalized = normalizedEntries(saved[STORAGE_KEY], moment, limits);
      for (const entry of normalized)
        if (!entry.recordId) entry.recordId = recordId();
      const nextEnabled = saved[ENABLED_KEY] !== false;
      if (
        JSON.stringify(normalized) !== JSON.stringify(saved[STORAGE_KEY] || [])
      )
        await storage.set({
          [STORAGE_KEY]: normalized,
          [ENABLED_KEY]: nextEnabled,
        });
      entries = normalized;
      enabled = nextEnabled;
      loaded = true;
    }
    function bounded(input: Entry[], moment: number) {
      const recent = input
          .filter(
            (entry) =>
              entry.lastViewedAt <= moment &&
              moment - entry.lastViewedAt < limits.ttlMs,
          )
          .sort((a, b) => b.lastViewedAt - a.lastViewedAt)
          .slice(0, limits.maxEntries),
        kept: Entry[] = [];
      let bytes = 2;
      for (const entry of recent) {
        let size = entrySizes.get(entry);
        if (size === undefined) {
          size = new TextEncoder().encode(JSON.stringify(entry)).byteLength + 1;
          entrySizes.set(entry, size);
        }
        if (bytes + size <= limits.maxBytes) {
          bytes += size;
          kept.push(entry);
        }
      }
      return kept;
    }
    function run<T = void>(
      operation: (state: State) => T | Promise<T>,
      full = false,
    ): Promise<T extends void ? Status : T> {
      const task = chain
        .catch(() => {})
        .then(async () => {
          await load();
          // Entries are sanitized on load and immutable afterwards. Reuse their
          // measured sizes so capturing a result ticket never repeatedly parses
          // or encodes every saved answer in a full history.
          const state = {
            entries: bounded(entries, now()),
            enabled,
            epoch,
            resultEpoch,
          };
          const value = await operation(state);
          state.entries = bounded(state.entries, now());
          if (
            state.entries.length !== entries.length ||
            state.entries.some((entry, index) => entry !== entries[index]) ||
            state.enabled !== enabled
          )
            await storage.set({
              [STORAGE_KEY]: state.entries,
              [ENABLED_KEY]: state.enabled,
            });
          entries = state.entries;
          enabled = state.enabled;
          epoch = state.epoch;
          resultEpoch = state.resultEpoch;
          return value === undefined ? (full ? response() : status()) : value;
        });
      chain = task;
      return task as Promise<T extends void ? Status : T>;
    }
    const store = {
      config() {
        return { enabled, epoch };
      },
      get() {
        return run(() => {}, true) as Promise<Response>;
      },
      status() {
        return run(() => {});
      },
      prune() {
        return run(() => {});
      },
      invalidateResults() {
        return run((state) => {
          state.resultEpoch++;
        });
      },
      visit(posts: unknown, expectedEpoch?: number) {
        return run((state) => {
          if (
            !state.enabled ||
            (expectedEpoch !== undefined && expectedEpoch !== state.epoch)
          )
            return;
          const moment = now(),
            seen = new Set();
          for (const value of (Array.isArray(posts)
            ? (posts as unknown[])
            : []
          ).slice(0, 30)) {
            const post = cleanPost(value);
            if (!post || seen.has(post.id)) continue;
            seen.add(post.id);
            const index = state.entries.findIndex(
                (entry) => entry.id === post.id,
              ),
              current = state.entries[index];
            if (current)
              state.entries[index] = {
                ...current,
                ...post,
                lastViewedAt: moment,
                visits: Math.min(current.visits + 1, 1_000_000),
              };
            else
              state.entries.push({
                ...post,
                recordId: recordId(),
                firstViewedAt: moment,
                lastViewedAt: moment,
                visits: 1,
              });
          }
        });
      },
      capture(id: unknown) {
        return run((state) => {
          const entry =
            state.enabled &&
            state.entries.find((value) => value.id === String(id));
          return entry
            ? {
                id: entry.id,
                recordId: entry.recordId,
                epoch: state.resultEpoch,
              }
            : null;
        });
      },
      analysis(ticket: Ticket | null, value: unknown) {
        return run((state) => {
          if (
            (value as Candidate | null | undefined)?.scope === "x-native" ||
            !ticket ||
            !state.enabled ||
            ticket.epoch !== state.resultEpoch
          )
            return;
          const index = state.entries.findIndex(
              (item) =>
                item.id === ticket.id && item.recordId === ticket.recordId,
            ),
            entry = state.entries[index],
            analysis = cleanAnalysis(value, now());
          if (entry && analysis) state.entries[index] = { ...entry, analysis };
        });
      },
      comments(ticket: Ticket | null, input: unknown) {
        const value = input as Candidate;
        return run((state) => {
          if (
            value?.scope === "x-native" ||
            !ticket ||
            !state.enabled ||
            ticket.epoch !== state.resultEpoch
          )
            return;
          const index = state.entries.findIndex(
              (item) =>
                item.id === ticket.id && item.recordId === ticket.recordId,
            ),
            entry = state.entries[index],
            comments = cleanComments(value?.comments);
          if (entry && comments.length) {
            const { commentsModel, commentsUsage, commentsScope, ...previous } =
              entry;
            const moment = now(),
              completedAt =
                Number.isFinite(value.completedAt as number) &&
                (value.completedAt as number) >= 0 &&
                (value.completedAt as number) <= moment
                  ? (value.completedAt as number)
                  : moment;
            state.entries[index] = {
              ...previous,
              comments,
              commentsCompletedAt: completedAt,
              commentsLanguage: text(value.language, 30),
              ...(scope(value.scope)
                ? { commentsScope: scope(value.scope) }
                : {}),
              ...(model(value.model)
                ? { commentsModel: model(value.model) }
                : {}),
              ...(value.usage ? { commentsUsage: usage(value.usage) } : {}),
            };
          }
        });
      },
      clear() {
        return run((state) => {
          state.entries = [];
          state.epoch++;
          state.resultEpoch++;
        }, true) as Promise<Response>;
      },
      delete(id: unknown) {
        return run((state) => {
          state.entries = state.entries.filter(
            (entry) => entry.id !== String(id),
          );
          state.epoch++;
        }, true) as Promise<Response>;
      },
      setEnabled(value: boolean) {
        return run((state) => {
          if (state.enabled !== value) {
            state.enabled = value;
            state.epoch++;
            state.resultEpoch++;
          }
        }, true) as Promise<Response>;
      },
    };
    return store;
  }
  return { create, LIMITS, STORAGE_KEY, ENABLED_KEY, normalizedEntries };
}
