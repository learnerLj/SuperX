import type { Settings, ModelEntry } from "../shared/contracts";
export type { ModelEntry } from "../shared/contracts";
export interface BuildStatus {
  ready?: boolean;
  authenticated?: boolean;
  errorCode?: string;
  modelCatalog?: ModelEntry[];
  models?: string[];
}
export interface OAuthStatus {
  state?: string;
  connected?: boolean;
  remember?: boolean;
  credentialId?: string | null;
  modelAvailable?: boolean;
  errorCode?: string | null;
  catalogErrorCode?: string | null;
  catalogModels?: (string | ModelEntry)[] | null;
  device?: { userCode?: string; verificationUriComplete?: string };
}
export interface Config {
  ready: boolean;
  keyState: string;
  settings?: Settings;
  buildStatus?: BuildStatus;
  nativeStatus?: { errorCode?: string };
  oauthStatus?: OAuthStatus;
}
export interface Reply extends Partial<Config> {
  ok: boolean;
  errorKey?: string;
  error?: string;
  errorCode?: string;
  vars?: Record<string, unknown>;
  language?: string;
  configured?: boolean;
  port?: number;
  command?: string;
  secret?: string;
  modelCatalog?: ModelEntry[];
  remember?: boolean;
  hasSavedKey?: boolean;
  key?: string;
  entries?: unknown[];
  retentionHours?: number;
  maxEntries?: number;
}
export type ControlMessage = { type: string; [key: string]: unknown };
export type ErrorShape = { message?: string };
