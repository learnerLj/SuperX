import type {
  Post as SharedPost,
  Settings,
  AnalysisResult,
  Source,
  Update,
  ReasoningEffort,
} from "../shared/contracts";
export type { Settings, AnalysisResult, Source, Update, ReasoningEffort };
/** Additional draft/context fields already consumed by the wire providers. */
export interface Post extends Omit<
  SharedPost,
  "context" | "quotedContext" | "threadContext"
> {
  mode?: "post" | "reply";
  username?: string;
  hasUncheckedMedia?: boolean;
  context?: Post;
  quotedContext?: Post[];
  threadContext?: Post[];
}
export interface FailureDetails {
  code?: string;
  stage?: string;
  reason?: string;
  errorCode?: string;
  httpStatus?: number;
  providerCode?: string;
}
export interface RequestDiagnostics {
  failureOrigin?: string;
  requestId?: string;
  responseId?: string;
  requestedModel?: string;
  model?: string;
  providerMessage?: string;
  startedAt?: number;
  failedAt?: number;
  elapsedMs?: number;
}
export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  num_sources_used?: number;
  num_server_side_tools_used?: number;
  cost_in_usd_ticks?: number;
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
export interface Metadata {
  usage?: Usage;
  model?: string;
  usageComplete?: boolean;
  usageByStage?: Partial<Record<string, Usage>>;
  modelByStage?: Partial<Record<string, string>>;
}
export interface StageResult extends Metadata {
  text: string;
  sources?: Source[];
  searched?: boolean;
  verificationFailure?: FailureDetails;
  requestDiagnostics?: RequestDiagnostics;
}
export interface ProviderError extends Error, Metadata {
  code: string;
  nativeStage?: string;
  partialText?: string;
  partialSources?: Source[];
  partialSearched?: boolean;
  partialResult?: Partial<StageResult>;
  verificationFailure?: FailureDetails;
  failureDetails?: FailureDetails;
  requestDiagnostics?: RequestDiagnostics;
  provider?: string;
  nativeResponse?: HostMessage;
}
/** Only fields inspected at the Build host boundary. */
export interface HostMessage extends Metadata {
  requestId?: string;
  text?: string;
  sources?: Source[];
  searched?: boolean;
  channel?: string;
  phase?: string;
  status?: string;
  type?: string;
  connected?: boolean;
  installed?: boolean;
  available?: boolean;
  authenticated?: boolean;
  imageInputSupported?: boolean;
  version?: string;
  runtimeVersionConfirmed?: boolean;
  modelCatalog?: ModelEntry[];
  errorCode?: string;
}
export interface ModelEntry {
  id: string;
  name?: string;
  available?: boolean;
  efforts?: string[];
}
/** Browser-safe subset of the existing core consumed by providers. */
export type CoreContract = Pick<
  import("../shared/feed-core").API,
  | "DEFAULT_PROMPTS"
  | "resolvePostLanguage"
  | "canonicalPostUrl"
  | "normalizePrompt"
  | "normalizeSettings"
  | "explanationMode"
  | "providerModel"
  | "providerEffort"
  | "reasoningEffort"
  | "oauthReasoningEffort"
  | "isNonTextGenerationModel"
  | "readerOutput"
  | "apiFailureProviderCode"
  | "sanitizedRequestDiagnostics"
>;
export interface Authorization {
  getAccessToken(signal?: AbortSignal): Promise<string>;
  onUnauthorized?(rejectedToken: string, signal?: AbortSignal): Promise<string>;
}
export interface CallOptions {
  signal?: AbortSignal;
  onUpdate?: (value: Update) => void;
  analysis?: AnalysisResult;
  fetchImpl?: typeof fetch;
  authorization?: Authorization;
}
export interface ProviderRoot {
  XGrokCore: CoreContract;
  GrokFirstAPI: import("./api-provider").API;
  SuperXACP: import("./build-acp").API;
  SuperXBuildTransport: import("./build-transport").API;
  SuperXBuild: import("./build-provider").API;
  SuperXBuildSetup: import("./build-setup").API;
  SuperXNativeProtocol: import("./native-protocol").API;
  SuperXNative: import("./native-provider").API;
  SuperXOAuth: import("./oauth-provider").API;
  fetch: typeof fetch;
  WebSocket: typeof WebSocket;
  chrome: typeof chrome;
  crypto: Crypto;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  SuperXKeyStore?: { create(options: { purpose: string }): KeyStore };
}
export interface KeyStore {
  seal(value: string): Promise<unknown>;
  open(value: unknown): Promise<string>;
  isEnvelope(value: unknown): boolean;
  clear(): Promise<void>;
}
