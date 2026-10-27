import type {
  Post as SharedPost,
  PostImage,
  Settings,
  ProviderId,
  Source,
  AnalysisResult,
  Update,
  ResultMetadata,
} from "../shared/contracts";
import type { Metadata, Usage, FailureDetails } from "../providers/types";
import type { RequestDiagnostics } from "../shared/feed-core";
import type { Ticket } from "./history-store";
export type {
  Settings,
  ProviderId,
  Source,
  PostImage,
  Metadata,
  Usage,
  FailureDetails,
  RequestDiagnostics,
  AnalysisResult,
  Update,
  ResultMetadata,
};
export interface Post extends SharedPost {
  mode?: "post" | "reply";
  username?: string;
  hasUncheckedMedia?: boolean;
  context?: Post;
  quotedContext?: Post[];
  threadContext?: Post[];
}
export interface RawPost {
  id?: unknown;
  url?: unknown;
  text?: unknown;
  language?: unknown;
  author?: unknown;
  timestamp?: unknown;
  hasMedia?: unknown;
  hasVideo?: unknown;
  textTruncated?: unknown;
  snapshotOnly?: unknown;
  images?: unknown;
  quotedContext?: unknown;
  mode?: unknown;
  context?: unknown;
  threadContext?: unknown;
  hasUncheckedMedia?: unknown;
}
export interface RawImage {
  url?: unknown;
  alt?: unknown;
}
export type SettingsInput = {
  [K in keyof Settings]?: unknown;
};
export interface WorkerMessage {
  type: string;
  requestId?: unknown;
  nativeAccount?: unknown;
  post?: unknown;
  draft?: unknown;
  analysis?: unknown;
  force?: unknown;
  prefetch?: unknown;
  language?: unknown;
  focus?: unknown;
  batchId?: unknown;
  posts?: unknown;
  historyEpoch?: unknown;
  enabled?: unknown;
  width?: unknown;
  collapsed?: unknown;
  preserveStarted?: unknown;
  apiKey?: unknown;
  remember?: unknown;
  settings?: SettingsInput;
  port?: unknown;
  secret?: unknown;
  platform?: unknown;
  id?: unknown;
}
export interface SecurityMutation {
  apiKey: string;
  remember?: boolean;
  settings?: Settings;
}
export interface BuildStatus {
  connected: boolean;
  installed: boolean;
  available: boolean;
  authenticated?: boolean;
  permission?: false | string;
  errorCode?: string;
  busy?: boolean;
}
export interface Result extends Metadata, ResultMetadata {
  text?: string;
  comments?: string[];
  sources?: Source[];
  verificationStatus?: string;
  warning?: string;
  provider?: ProviderId;
  verified?: boolean;
  searched?: boolean;
  completedAt?: number;
  apiVerification?: string;
  verificationStart?: number;
  verificationFailure?: FailureDetails;
  requestDiagnostics?: RequestDiagnostics;
}
export type SanitizedAnalysis = {
  text: string;
  verificationStatus: string;
  warning: string;
  sources: Source[];
};
export interface ErrorView extends Metadata {
  text?: string;
  verificationStart?: number;
  name?: string;
  message?: string;
  code?: string;
  provider?: ProviderId;
  partialResult?: Result;
  failureDetails?: FailureDetails;
  verificationFailure?: FailureDetails;
  requestDiagnostics?: RequestDiagnostics;
  httpStatus?: number;
  providerCode?: string;
}
export interface DiagnosticEntry {
  recordedAt: number;
  code: string;
  requestDiagnostics: RequestDiagnostics;
  verificationFailure?: FailureDetails;
}
export interface Client {
  scope: number;
  port: chrome.runtime.Port;
  tabId: number;
  cancelEpoch: number;
  uiLanguage: string | null;
  requestCancellations: Map<string, symbol>;
  admissions: Map<string, symbol>;
  promotions: Set<string>;
  nativeAccount: string;
  nativeGeneration: number;
}
export interface Subscription {
  key: string;
  requestId: string;
  client: Client;
  force: boolean;
  prefetch: boolean;
}
export interface HistoryCapture {
  ticket: Ticket | null;
  scope: string;
  revision: number;
}
export type HistoryTicket = Promise<HistoryCapture | null> | null;
export interface Job {
  key: string | symbol;
  requestId: string;
  force: boolean;
  prefetch: boolean;
  cancellation: symbol | undefined;
  cacheEpoch: number;
  nativeGeneration: number;
  post: Post;
  inputFingerprint?: string;
  analysis?: SanitizedAnalysis;
  client: Client;
  clientEpoch: number;
  settings: Settings;
  revision: number;
  fingerprint: string | null;
  historyTicket: HistoryTicket;
  historyLanguage: string;
  started: boolean;
  retryAttempts: number;
  completedBilling: Metadata[];
  controller: AbortController;
  flightKey?: string;
  subscribers?: Map<string, Subscription>;
  cancelledSubscribers?: Subscription[];
  statusMessage?: OutboundMessage;
  updateMessage?: Partial<OutboundMessage>;
  terminal?: boolean;
  cancelled?: boolean;
  restartAfterSettle?: boolean;
  retryTimer?: ReturnType<typeof setTimeout>;
  retryPlan?: {
    error: string;
    code: string;
    extra: ErrorExtra;
  };
  apiProviderPending?: boolean;
  deadline?: ReturnType<typeof setTimeout>;
  slotHeld?: boolean;
  slotPhase?: "comments" | "verify" | null;
  billing?: Metadata;
  requestDiagnostics?: RequestDiagnostics;
  diagnosticsRecorded?: boolean;
  attemptCompleted?: boolean;
  transportBlocked?: boolean;
  executionFinished?: boolean;
  attemptHasReaderText?: boolean;
  retainedFactCheck?: Result;
  previousPartial?: SanitizedAnalysis;
  nextRetryAttempt?: number;
}
export interface ErrorExtra extends Metadata {
  partialResult?: Result;
  verificationFailure?: FailureDetails;
  requestDiagnostics?: RequestDiagnostics;
  error?: string;
  code?: string;
  retryAttempts?: number;
}
export interface OutboundMessage extends ErrorExtra {
  type: string;
  requestId?: unknown;
  text?: string;
  phase?: string;
  verificationStatus?: string;
  warning?: unknown;
  sources?: Source[];
  provider?: ProviderId;
  verified?: boolean;
  searched?: boolean;
  result?: Result;
  comments?: string[];
  cached?: boolean;
  cacheLookup?: boolean;
  retryAttempt?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  used?: number;
  [field: string]: unknown;
}
export interface StorageSnapshot {
  settings?: SettingsInput;
  uiLanguage?: unknown;
  apiKey?: unknown;
  apiKeyEncrypted?: unknown;
  apiKeyVault?: unknown;
  rememberApiKey?: unknown;
  buildConnectionEncrypted?: unknown;
  invalidAnswerSource?: unknown;
  railWidth?: unknown;
  quotas?: {
    [tabId: number]: number;
  };
  railStates?: {
    [tabId: number]: boolean;
  };
  cache?: unknown;
  securityFault?: unknown;
  apiRequestDiagnostics?: unknown;
  apiBudgetPause?: unknown;
  apiCapacityPause?: unknown;
}
export interface CachePartition {
  1?: unknown;
  2?: {
    0?: unknown;
  };
}
