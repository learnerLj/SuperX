import type {
  Post,
  Settings,
  AnalysisResult,
  Source,
  Update,
  ReasoningEffort,
  FailureDetails,
  Usage,
  GenerationMetadata as Metadata,
  ProviderDiagnostics as RequestDiagnostics,
  ModelEntry,
  ProviderAuthorization as Authorization,
} from "../shared/contracts";
export type {
  Post,
  Settings,
  AnalysisResult,
  Source,
  Update,
  ReasoningEffort,
  FailureDetails,
  Usage,
  Metadata,
  RequestDiagnostics,
  ModelEntry,
  Authorization,
};
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
