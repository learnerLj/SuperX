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
export interface ResultMetadata {
  provider?: ProviderId;
  model?: string;
  usageComplete?: boolean;
  completedAt?: number;
  [field: string]: unknown;
}
export interface AnalysisResult extends ResultMetadata {
  text: string;
  sources?: Source[];
  /** Private providers and older cache entries retain their reported status strings. */
  verificationStatus?: string;
  verified?: boolean;
  searched?: boolean;
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
  getAccessToken(): Promise<string>;
  onUnauthorized(rejectedAccessToken: string): Promise<string>;
}
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
  ): Promise<AnalysisResult>;
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
  ): Promise<AnalysisResult>;
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
  ): Promise<AnalysisResult>;
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
  ): Promise<AnalysisResult | CommentsResult>;
}
