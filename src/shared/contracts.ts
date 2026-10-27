/** Shared contracts consumed by the worker, providers and reading UI. */
export type ProviderId = "api" | "oauth" | "build" | "x-native";
export type TaskKind = "analysis" | "comments" | "draft";
export type ReasoningEffort =
  "auto" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export interface Settings {
  provider: ProviderId;
  enabled: boolean;
  language: string;
  interfaceLanguage: string;
  analysisDefaultsVersion: number;
  dwellMs: number;
  maxPerSession: number;
  cooldownMs: number;
  apiConcurrency: number;
  answerCacheLimitMB: number;
  prefetchCount: number;
  prefetchAll: boolean;
  apiModel: string;
  apiReasoningEffort: ReasoningEffort;
  oauthModel: string;
  oauthReasoningEffort: ReasoningEffort;
  oauthRemember: boolean;
  oauthCredentialId?: string;
  buildPort: number;
  buildModel: string;
  buildReasoningEffort: ReasoningEffort;
  buildDefaultsVersion: number;
  buildTransport: string;
  apiVerification: "only";
  webSearch: boolean;
  xSearch: boolean;
  explanationMode: "preset" | "custom";
  explainPrompt?: string;
  verifyPrompt: string;
  commentsPrompt: string;
  draftPrompt: string;
  postDraftPrompt: string;
  replyDraftPrompt: string;
  nativeAccount?: string;
  task?: "comments" | "draft";
}
export type SettingsInput = { [K in keyof Settings]?: unknown };

export interface PostImage {
  url: string;
  alt?: string;
  kind?: string;
}
export interface Post {
  id?: string | null;
  url?: string | null;
  text: string;
  language?: string;
  author?: string;
  timestamp?: string;
  hasMedia?: boolean;
  hasVideo?: boolean;
  textTruncated?: boolean;
  snapshotOnly?: boolean;
  kind?: "draft";
  mode?: "post" | "reply";
  username?: string;
  hasUncheckedMedia?: boolean;
  isPromoted?: boolean;
  images?: PostImage[];
  quotedContext?: Post[];
  context?: Post;
  threadContext?: Post[];
}
/** Feed-to-worker messages; scheduling does not enter provider/cache identity. */
export interface PostAnalysisMessage {
  type: "ANALYZE";
  requestId: string;
  post: Post;
  force?: boolean;
  prefetch?: boolean;
  nativeAccount?: string;
}
export interface CachedPostLookupMessage {
  type: "LOOKUP_CACHED_POST";
  requestId: string;
  post: Post;
  nativeAccount?: string;
}
export interface Source {
  url: string;
  title: string;
}
/** Token/cost fields retained from provider responses and persisted history. */
export interface UsageTotals {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  num_sources_used?: number;
  num_server_side_tools_used?: number;
  cost_in_usd_ticks?: number;
}
export interface Usage extends UsageTotals {
  input_tokens_details?: {
    cached_tokens?: number;
    text_tokens?: number;
    image_tokens?: number;
    audio_tokens?: number;
  };
  output_tokens_details?: { reasoning_tokens?: number; audio_tokens?: number };
  server_side_tool_usage_details?: {
    web_search_calls?: number;
    x_search_calls?: number;
    x_posts_fetched?: number;
    x_users_fetched?: number;
    code_interpreter_calls?: number;
    file_search_calls?: number;
    mcp_calls?: number;
    document_search_calls?: number;
    image_generation_calls?: number;
  };
}
export interface GenerationMetadata {
  usage?: Usage;
  model?: string;
  usageComplete?: boolean;
  usageByStage?: Partial<Record<string, Usage>>;
  modelByStage?: Partial<Record<string, string>>;
}
export interface FailureDetails {
  code?: string;
  stage?: string;
  reason?: string;
  errorCode?: string;
  httpStatus?: number;
  providerCode?: string;
}
/** Validated diagnostics emitted by the shared sanitizer. */
export interface RequestDiagnostics {
  failureOrigin: "http" | "stream" | "network";
  transportStatus?: number;
  requestId?: string;
  responseId?: string;
  providerMessage?: string;
  startedAt?: number;
  failedAt?: number;
  elapsedMs?: number;
  model?: string;
  requestedModel?: string;
  requestedEffort?: ReasoningEffort;
}
/** Provider observations before diagnostic normalization. */
export type ProviderDiagnostics = Partial<
  Omit<RequestDiagnostics, "failureOrigin">
> & {
  failureOrigin?: string;
};
export interface ModelEntry {
  id: string;
  name?: string;
  available?: boolean;
  efforts?: string[];
}
export interface ResultMetadata extends GenerationMetadata {
  provider?: ProviderId;
  completedAt?: number;
  [field: string]: unknown;
}
export interface AnalysisResult<
  Diagnostics extends ProviderDiagnostics = RequestDiagnostics,
> extends ResultMetadata {
  text: string;
  sources?: Source[];
  /** Private providers and older cache entries retain their reported status strings. */
  verificationStatus?: string;
  verified?: boolean;
  searched?: boolean;
  verificationStart?: number;
  verificationFailure?: FailureDetails;
  requestDiagnostics?: Diagnostics;
  apiVerification?: string;
  warning?: string;
}
export interface CommentsResult extends ResultMetadata {
  comments: string[];
}
export interface Update extends ResultMetadata {
  text?: string;
  sources?: Source[];
  phase?: string;
  verificationStatus?: AnalysisResult["verificationStatus"];
}
export interface PublicError {
  error: string;
  code: string;
}
export interface Capabilities {
  analysis: boolean;
  comments: boolean;
  draft: boolean;
}
export interface FeedPort {
  postMessage(message: unknown): void;
}
export interface FeedClient {
  port: FeedPort;
  tabId: number;
}
export interface ProviderRequest {
  task: TaskKind;
  post: Post;
  settings: Settings;
  analysis?: AnalysisResult;
}
export interface Authorization {
  getAccessToken(signal?: AbortSignal): Promise<string>;
  onUnauthorized(
    rejectedAccessToken: string,
    signal?: AbortSignal,
  ): Promise<string>;
}
/** Direct provider callers may omit automatic credential recovery. */
export type ProviderAuthorization = Omit<Authorization, "onUnauthorized"> &
  Partial<Pick<Authorization, "onUnauthorized">>;
export interface BuildConnection {
  port: number;
  secret: string;
}
export interface ExecutionContext {
  signal: AbortSignal;
  onUpdate?: (update: Update) => void;
  client: FeedClient;
  assertCurrent(): void;
  getApiKey(): Promise<string>;
  getOAuthAuthorization(): Authorization;
  getBuildConnection(): Promise<BuildConnection>;
}
export interface Callbacks {
  signal: AbortSignal;
  onUpdate?: (update: Update) => void;
  analysis?: AnalysisResult;
  authorization?: Authorization;
}
export interface APITransport {
  run(
    post: Post,
    settings: Settings,
    key: string | undefined,
    callbacks: Callbacks,
  ): Promise<AnalysisResult<ProviderDiagnostics>>;
  generateComments(
    post: Post,
    settings: Settings,
    key: string | undefined,
    callbacks: Callbacks,
  ): Promise<CommentsResult>;
  publicError(error: unknown): PublicError;
}
export interface BuildTransport {
  run(
    post: Post,
    settings: Settings,
    callbacks: Callbacks & { connection: BuildConnection },
  ): Promise<AnalysisResult<ProviderDiagnostics>>;
  generateComments(
    post: Post,
    settings: Settings,
    callbacks: Callbacks & { connection: BuildConnection },
  ): Promise<CommentsResult>;
  publicError(error: unknown): PublicError;
}
export interface NativeTransport {
  run(
    post: Post,
    settings: Settings,
    callbacks: Callbacks & { client: FeedClient },
  ): Promise<AnalysisResult<ProviderDiagnostics>>;
  publicError(error: unknown): PublicError;
}
export interface AdapterDependencies {
  api: APITransport;
  build: BuildTransport;
  native: NativeTransport;
  core: {
    providerModel(settings: Settings): string;
    isNonTextGenerationModel(model: string): boolean;
  };
}
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly capabilities: Readonly<Capabilities>;
  model(settings: Settings): string;
  concurrency(settings: Settings): number;
  publicError(error: unknown): PublicError;
  run(
    request: ProviderRequest,
    context: ExecutionContext,
  ): Promise<AnalysisResult<ProviderDiagnostics> | CommentsResult>;
}
