import type { KeyStore } from "./types";
export interface Auth {
  credentialId: string;
  revision: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  lifetimeMs: number;
  remember: boolean;
  blocked?: boolean;
}
export interface Device {
  id: string;
  deviceCode: string;
  userCode: string;
  verificationUriComplete: string;
  expiresAt: number;
  intervalMs: number;
  nextPollAt: number;
  polling: boolean;
}
export interface Stored extends Partial<Auth> {
  schema?: number;
  kind?: string;
  phase?: string;
  refreshEncrypted?: unknown;
  catalogModels?: unknown;
  scope?: string;
  errorCode?: string;
  device?: Partial<Device>;
}
export interface StorageArea {
  get(key: string): Promise<Record<string, Stored | undefined>>;
  set(value: Record<string, unknown>): Promise<void>;
}
export interface OAuthChrome {
  storage: { local: StorageArea; session: StorageArea };
  alarms: Pick<typeof chrome.alarms, "clear" | "get" | "create">;
}
export interface Body {
  error?: unknown;
  data?: unknown;
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  device_code?: unknown;
  user_code?: unknown;
  interval?: unknown;
  verification_uri?: unknown;
  verification_uri_complete?: unknown;
}
export interface Response {
  ok: boolean;
  status: number;
  data: Body;
  error: string;
  startedAt: number;
  receivedAt: number;
}
export interface Status {
  state: string;
  connected: boolean;
  remember: boolean;
  expiresAt: number | null;
  credentialId: string | null;
  errorCode: string | null;
  catalogModels: string[];
  catalogErrorCode: string | null;
  device?: Pick<Device, "userCode" | "verificationUriComplete" | "expiresAt">;
}
export interface Flight<T> {
  ticket: number;
  promise: Promise<T>;
}
export interface Access {
  accessToken: string;
  credentialId: string;
}
export interface Options {
  chrome?: OAuthChrome;
  fetch?: typeof fetch;
  crypto?: Pick<Crypto, "randomUUID">;
  keyStore?: KeyStore;
  now?: () => number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  onChange?: (status: Status) => void;
}
export interface AccessOptions {
  signal?: AbortSignal;
  forceRefresh?: boolean;
  expectedCredentialId?: string;
  rejectedAccessToken?: string;
}
