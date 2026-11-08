import type { Usage } from "../shared/contracts";

/* SuperX: normalization for the post records owned by answer-cache. This
 * module is bundled into answer-cache.js and has no runtime global. */

export interface PostSnapshot {
  url: string;
  text: string;
  author: string;
  language: string;
  hasMedia: boolean;
}
export interface PostComments {
  comments: string[];
  commentsCompletedAt: number;
  commentsLanguage: string;
  commentsScope?: string;
  commentsModel?: string;
  commentsUsage?: Usage;
}
/** Logical content counted in the cache budget. A record without a snapshot
 * keeps only its canonical URL; comments are the latest completed set. */
export interface PostContent
  extends Partial<Omit<PostSnapshot, "url">>, Partial<PostComments> {
  url: string;
}
export interface PostRecord extends PostContent {
  id: string;
  activityAt: number;
  lastUsed: number;
  bytes: number;
}
export interface LegacyEntry {
  id: string;
  snapshot: PostSnapshot;
  comments: PostComments | null;
}
type Fields = { [field: string]: unknown };

const LEGACY_TTL = 24 * 60 * 60 * 1000;
const text = (value: unknown, limit: number) =>
  typeof value === "string" ? value.slice(0, limit) : "";
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
function fields(value: unknown): Fields {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Fields)
    : {};
}

/** Canonical X status identity: `/i/web/status/N` and `/user/status/N`
 * resolve to the same id. Other hosts or paths have no identity. */
export function postIdentity(
  value: unknown,
): { id: string; url: string } | null {
  if (typeof value !== "string" || value.length > 4000) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)
  )
    return null;
  const match =
    url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})\/?$/) ||
    url.pathname.match(/^\/i\/web\/status\/(\d{1,25})\/?$/);
  if (!match) return null;
  const id = match[match.length - 1]!;
  return {
    id,
    url:
      match.length === 2
        ? `https://x.com/i/web/status/${id}`
        : `https://x.com/${match[1]!.toLowerCase()}/status/${id}`,
  };
}
/** Same truncation rules as the retired 24-hour history snapshot. */
export function cleanPost(
  input: unknown,
): (PostSnapshot & { id: string }) | null {
  const value = fields(input),
    identity = postIdentity(value.url);
  if (!identity || (value.id !== undefined && String(value.id) !== identity.id))
    return null;
  return {
    ...identity,
    text: text(value.text, 12000),
    author: text(value.author, 200),
    language: text(value.language, 30),
    hasMedia: value.hasMedia === true,
  };
}
export function usage(input: unknown): Usage {
  const value = fields(input),
    result: Usage = {};
  for (const field of [
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "num_sources_used",
    "num_server_side_tools_used",
    "cost_in_usd_ticks",
  ] as const) {
    const n = value[field];
    if (finite(n) && n >= 0) result[field] = n;
  }
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
    const source = fields(value[field]),
      details: { [key: string]: number } = {};
    for (const key of keys) {
      const n = source[key];
      if (finite(n) && n >= 0) details[key] = n;
    }
    if (Object.keys(details).length) result[field] = details;
  }
  return result;
}
export function model(value: unknown) {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value)
    ? value
    : "";
}
export function scope(value: unknown) {
  return typeof value === "string" &&
    /^(?:api|build|oauth:[A-Za-z0-9-]{1,100})$/.test(value)
    ? value
    : "";
}
/** The latest completed comment drafts; X native never generates comments. */
export function cleanComments(
  input: unknown,
  now: number,
): PostComments | null {
  const value = fields(input),
    list: unknown[] = Array.isArray(value.comments) ? value.comments : [];
  const comments = list
    .slice(0, 3)
    .map((item) => text(item, 2000).trim())
    .filter(Boolean);
  if (!comments.length || value.scope === "x-native") return null;
  const completed = value.completedAt;
  const result: PostComments = {
    comments,
    commentsCompletedAt:
      finite(completed) && completed >= 0 && completed <= now ? completed : now,
    commentsLanguage: text(value.language, 30),
  };
  if (scope(value.scope)) result.commentsScope = scope(value.scope);
  if (model(value.model)) result.commentsModel = model(value.model);
  if (value.usage && typeof value.usage === "object")
    result.commentsUsage = usage(value.usage);
  return result;
}
/** Legacy `superxHistory` entries that were still inside their 24-hour
 * window. Visit counters/times and saved analyses are intentionally dropped:
 * answers come only from the cache, and records no longer track viewing. */
export function legacyEntries(input: unknown, now: number): LegacyEntry[] {
  const records = new Map<string, { at: number; entry: LegacyEntry }>();
  for (const raw of Array.isArray(input) ? (input as unknown[]) : []) {
    const value = fields(raw),
      post = cleanPost(value),
      last = value.lastViewedAt;
    if (!post || !finite(last) || last < 0 || last > now) continue;
    if (now - last >= LEGACY_TTL) continue;
    const { id, ...snapshot } = post;
    const comments = cleanComments(
      {
        comments: value.comments,
        completedAt: value.commentsCompletedAt,
        language: value.commentsLanguage,
        scope: value.commentsScope,
        model: value.commentsModel,
        usage: value.commentsUsage,
      },
      now,
    );
    const previous = records.get(id);
    if (!previous || previous.at < last)
      records.set(id, {
        at: last,
        entry: {
          id,
          snapshot,
          // A newer duplicate without comments keeps the older drafts.
          comments: comments || previous?.entry.comments || null,
        },
      });
    else if (!previous.entry.comments && comments)
      previous.entry.comments = comments;
  }
  return [...records.values()].map((value) => value.entry);
}
