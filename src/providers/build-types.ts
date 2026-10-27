import type { BuildConnection } from "../shared/contracts";
import type { HostMessage, CallOptions } from "./types";
import type { RunRequest, RequestOptions, RunOptions, Wire } from "./acp-types";
export type { BuildConnection, RequestOptions, RunOptions, Wire };
export type WebSocketFactory = (url: string) => WebSocket;
export interface SocketOptions {
  webSocketFactory?: WebSocketFactory;
  openTimeoutMs?: number;
  requestTimeoutMs?: number;
  heartbeatMs?: number;
  imageFetcher?: typeof fetch;
  imageTimeoutMs?: number;
}
export interface BuildOptions extends SocketOptions, CallOptions {
  connection?: BuildConnection;
}
export type ACPClient = ReturnType<import("./build-acp").API["create"]>;
export interface BridgeContract {
  connected?: boolean;
  request(
    payload: RunRequest | { type: "STATUS" },
    options?: RunOptions,
  ): Promise<HostMessage>;
  close(): Promise<{ confirmed: boolean } | undefined>;
}
export interface RPC {
  jsonrpc: string;
  id?: unknown;
  method?: string;
  params?: unknown;
  error?: { message?: unknown };
  result?: unknown;
}
export interface Pending {
  finish(error?: unknown, value?: unknown): void;
}
