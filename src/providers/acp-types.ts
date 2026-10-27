import type {
  HostMessage,
  ModelEntry,
  Source,
  Usage,
  ProviderError,
} from "./types";
export interface Image {
  url: string;
  label: string;
}
export interface RunRequest {
  type?: string;
  requestId?: string;
  task: "verify" | "comments";
  target?: "draft";
  model: string;
  effort: string;
  prompt: string;
  xSearch: boolean;
  webSearch: boolean;
  images?: Image[];
  outputSchema?: unknown;
  transport?: string;
}
export interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface RunOptions {
  signal?: AbortSignal;
  onUpdate?: (message: HostMessage) => void;
}
export interface Config {
  id?: string;
  value?: string;
  name?: string;
  options?: Config[];
  currentValue?: string;
}
/** Inspected ACP response/update fields; unsolicited frames stay unknown at receive. */
export interface Wire {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { sessionId?: string; update?: Wire };
  sessionUpdate?: string;
  type?: string;
  protocolVersion?: number;
  _meta?: Wire;
  agentVersion?: string;
  agentInfo?: { version?: string };
  serverInfo?: { version?: string };
  agentCapabilities?: { promptCapabilities?: { image?: boolean } };
  currentWorkingDirectory?: string;
  authMethods?: { id?: string }[];
  data?: Wire;
  result?: Wire;
  agentName?: string;
  model?: string;
  context?: { total?: number; toolDefinitionsCount?: number };
  sessionId?: string;
  configOptions?: Config[];
  models?: { currentModelId?: string };
  content?: { type?: string; text?: string };
  usage?: unknown;
  toolCallId?: string;
  rawInput?: { backend?: boolean; variant?: string };
  rawOutput?: { name?: string };
  status?: string;
  locations?: unknown;
  modelId?: string;
  modelUsage?: Record<string, unknown>;
  stopReason?: string;
  structuredOutput?: unknown;
  structured_output?: unknown;
  text?: string;
  sources?: unknown;
  citations?: unknown;
  annotations?: unknown;
}
export interface Transport {
  request(
    method: string,
    params?: unknown,
    options?: RequestOptions,
  ): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  respond(
    id: unknown,
    result?: unknown,
    error?: { code: number; message: string },
  ): void;
  onMessage(listener: (message: unknown) => void): () => unknown;
  cleanupSession?(
    id: string,
    options: { cancel?: boolean },
  ): Promise<boolean | { confirmed?: boolean }>;
  close?(): void;
}
export interface ClientOptions {
  transport?: Transport;
  cwd?: string;
  heartbeatMs?: number;
  imageFetcher?: typeof fetch;
  imageTimeoutMs?: number;
}
export interface Session {
  id: string;
  key: string;
  model: string;
  effort: string;
  modelCatalog: ModelEntry[];
}
export interface TurnFields {
  request: RunRequest;
  onUpdate: (value: HostMessage) => void;
  text: string;
  model: string;
  usage: Usage;
  usageComplete: boolean;
  searched: boolean;
  tools: Map<string, { family: string }>;
  sources: Map<string, Source>;
  lastEmit: number;
}
export interface ClientFields {
  transport: Transport;
  cwd: string;
  heartbeatMs: number;
  imageFetcher: typeof fetch;
  imageTimeoutMs: number;
  imageInputSupported: boolean;
  started: boolean;
  active: {
    sessionId: string;
    turn: { observe(update: unknown): void };
    reject(error: ProviderError): void;
  } | null;
  running: boolean;
  sessionIds: Set<string>;
  runtimeVersion: string;
  closed: boolean;
  failure: ProviderError | null;
  unsubscribe: () => unknown;
}
