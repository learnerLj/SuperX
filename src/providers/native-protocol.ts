import type { Source, ProviderRoot } from "./types";
export interface FailureDetail {
  status?: string;
  reason?: string;
  errorCode?: string;
}
export interface Event {
  kind: string;
  text?: string;
  sources?: Source[];
  code?: string;
  retain?: boolean;
  detail?: FailureDetail;
}
export interface Options {
  nonce: string;
  prompt: string;
  send(value: unknown): void;
  emit(value: Event): void;
  randomUUID(): string;
}
export interface Protocol {
  start(): void;
  receive(data: unknown): void;
  cancel(): void;
  disconnect(): void;
  isTerminal(): boolean;
}
export interface API {
  create(options: Options): Protocol;
}
interface Wire {
  [key: string]: unknown;
  event?: Wire;
  error?: Wire;
  text?: Wire;
  render_citation?: Wire;
  session?: Wire;
  response?: Wire;
}
/* State for one response on an externally owned WebSocket; no transport or UI. */
(function (root: ProviderRoot, factory: () => API) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SuperXNativeProtocol = api;
})(globalThis as typeof globalThis & ProviderRoot, function () {
  "use strict";
  const MAX_FRAME = 2 * 1024 * 1024,
    MAX_TEXT = 30000,
    MAX_SOURCES = 20;
  const plain = (value: unknown): value is Wire => {
    if (!value || typeof value !== "object") return false;
    const proto: object | null = Object.getPrototypeOf(value);
    return proto === null || Object.getPrototypeOf(proto) === null;
  };
  const id = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.length <= 200;
  // X reports an exhausted web allowance through several shapes: an error
  // frame, a failed response, or an incomplete response with a reason. Only
  // these short identifiers are retained; message prose never reaches storage.
  const LIMIT_SIGNAL =
    /usage|quota|rate.?limit|limit.?reached|too many|exceeded.{0,24}(?:limit|allowance)|(?:使用|用量|调用).{0,8}(?:上限|限制)/i;
  const SAFE_DETAIL = /^[A-Za-z0-9_.:-]{1,80}$/;
  function limitSignal(value: unknown): boolean {
    if (!plain(value)) return false;
    return [value.code, value.type, value.reason, value.message].some(
      (part) =>
        typeof part === "string" && LIMIT_SIGNAL.test(part.slice(0, 300)),
    );
  }
  function failureDetail(
    status: string,
    value: unknown,
  ): FailureDetail | undefined {
    const out: FailureDetail = { status };
    if (plain(value)) {
      const code =
        typeof value.code === "string"
          ? value.code
          : typeof value.type === "string"
            ? value.type
            : "";
      const reason = typeof value.reason === "string" ? value.reason : "";
      if (SAFE_DETAIL.test(code)) out.errorCode = code;
      if (SAFE_DETAIL.test(reason)) out.reason = reason;
    }
    return out.errorCode || out.reason ? out : undefined;
  }
  function create({ nonce, prompt, send, emit, randomUUID }: Options) {
    // nonce belongs to the outer bridge. Protocol ownership is established by
    // the matching create/request IDs, session and response, not by a nonce.
    let started = false,
      terminal = false,
      sessionId = "",
      responseId = "";
    let createId = "",
      requestId = "",
      cancelId = "",
      responseSent = false;
    let userCancelled = false,
      internalError = "",
      cancelAttempted = false,
      cancelUnconfirmed = false,
      text = "";
    const sources: Source[] = [],
      sourceNumbers = new Map<string, number>();
    const snapshot = () => sources.map((source) => ({ ...source }));
    function finish(kind: string, code?: string, detail?: FailureDetail) {
      if (terminal) return;
      terminal = true;
      emit(
        kind === "RESULT"
          ? { kind, text, sources: snapshot() }
          : code
            ? { kind, code, ...(detail ? { detail } : {}) }
            : { kind },
      );
    }
    function nextId() {
      let value: string | undefined;
      try {
        value = randomUUID();
      } catch {
        /* Return only a fixed protocol error. */
      }
      return id(value) ? value : "";
    }
    function transmit(value: unknown) {
      try {
        send(value);
      } catch {
        if (responseSent) {
          userCancelled = true;
          unconfirmed();
        } else finish("ERROR", "X_NATIVE_INTERRUPTED");
      }
    }
    function start() {
      if (started || terminal) return;
      started = true;
      createId = nextId();
      if (!createId) {
        finish("ERROR", "X_NATIVE_PAGE_ERROR");
        return;
      }
      transmit({
        event: {
          type: "session.create",
          event_id: createId,
          session: {
            model: "fast",
            x_grok: {
              protocol_capabilities: [
                "conversation_attached",
                "custom_methods_v1",
                "workspace_servers_v1",
              ],
              use_chunk: true,
              disable_artifact: true,
              accept_interleaved_phases: true,
              disabled_connector_ids: [],
            },
          },
        },
      });
    }
    function unconfirmed() {
      if (!cancelUnconfirmed) {
        cancelUnconfirmed = true;
        emit({
          kind: "ERROR",
          code: "X_NATIVE_CANCEL_UNCONFIRMED",
          retain: true,
        });
      }
    }
    function cancelResponse() {
      if (!responseId || cancelAttempted || terminal) return;
      cancelAttempted = true;
      cancelId = nextId();
      if (!cancelId) {
        unconfirmed();
        return;
      }
      transmit({
        session_id: sessionId,
        event: {
          type: "response.cancel",
          event_id: cancelId,
          response_id: responseId,
        },
      });
    }
    function responseError(code: string) {
      if (terminal || internalError) return;
      internalError = code;
      if (!responseSent) finish("ERROR", code);
      else cancelResponse();
    }
    function cancel() {
      if (terminal || userCancelled) return;
      userCancelled = true;
      if (!responseSent)
        finish(internalError ? "ERROR" : "CLOSED", internalError || undefined);
      else cancelResponse();
    }
    function disconnect() {
      if (terminal) return;
      finish(
        userCancelled ? "CLOSED" : "ERROR",
        userCancelled ? undefined : "X_NATIVE_INTERRUPTED",
      );
    }
    function serverError(event: Wire) {
      if (!plain(event.error)) return;
      const reference = event.error.event_id;
      const detail = failureDetail("error", event.error);
      // A rejection of our own cancel must keep the retained gate even when it
      // carries limit wording; releasing ownership here could free the panel
      // while X is still generating.
      if (cancelId && reference === cancelId && responseId) {
        unconfirmed();
        return;
      }
      if (limitSignal(event.error)) {
        if (userCancelled && !internalError) finish("CLOSED");
        else finish("ERROR", internalError || "X_NATIVE_USAGE_LIMIT", detail);
        return;
      }
      if (
        !responseId &&
        (reference === createId || (requestId && reference === requestId))
      ) {
        if (userCancelled && !internalError) finish("CLOSED");
        else finish("ERROR", internalError || "X_NATIVE_PAGE_ERROR", detail);
      }
    }
    function chunk(value: unknown) {
      if (!plain(value) || userCancelled || internalError) return;
      // Reasoning/notetaker text and any citations carried with it are private
      // to that other channel. Citation-only chunks have no text channel.
      if (
        plain(value.text) &&
        value.text.channel !== "CHANNEL_ASSISTANT_RESPONSE"
      )
        return;
      let delta =
        plain(value.text) && typeof value.text.text === "string"
          ? value.text.text
          : "";
      let source: Source | undefined, number: number | undefined;
      if (Object.hasOwn(value, "render_citation")) {
        const raw = value.render_citation?.url;
        let url: URL | undefined;
        if (typeof raw === "string" && raw.length <= 2048) {
          try {
            const parsed = new URL(raw);
            if (
              ["http:", "https:"].includes(parsed.protocol) &&
              !parsed.username &&
              !parsed.password &&
              parsed.href.length <= 2048
            )
              url = parsed;
          } catch {
            /* Invalid citations must fail the response. */
          }
        }
        if (!url) {
          responseError("X_NATIVE_CITATION_UNAVAILABLE");
          return;
        }
        number = sourceNumbers.get(url.href);
        if (!number) {
          if (sources.length >= MAX_SOURCES) {
            responseError("X_NATIVE_CITATION_UNAVAILABLE");
            return;
          }
          number = sources.length + 1;
          source = { url: url.href, title: url.hostname };
        }
        delta += "[[" + number + "]](<" + url.href + ">)";
      }
      if (!delta) return;
      if (text.length + delta.length > MAX_TEXT) {
        responseError("X_NATIVE_RESPONSE_LIMIT");
        return;
      }
      if (source) {
        sources.push(source);
        sourceNumbers.set(source.url, number!);
      }
      text += delta;
      emit({ kind: "UPDATE", text, sources: snapshot() });
    }
    function receive(data: unknown) {
      if (!started || terminal) return;
      if (typeof data === "string") {
        if (
          data.length > MAX_FRAME ||
          new TextEncoder().encode(data).length > MAX_FRAME
        ) {
          responseError("X_NATIVE_RESPONSE_LIMIT");
          return;
        }
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (!plain(data) || !plain(data.event)) return;
      const event = data.event;
      if (event.type === "error") {
        serverError(event);
        return;
      }
      if (event.type === "session.created") {
        if (
          !sessionId &&
          event.client_event_id === createId &&
          id(data.session_id)
        ) {
          if (event.session?.model && event.session.model !== "fast") {
            finish("ERROR", "X_NATIVE_PAGE_ERROR");
            return;
          }
          sessionId = data.session_id;
        }
        return;
      }
      if (!sessionId || data.session_id !== sessionId) return;
      if (event.type === "conversation.attached") {
        if (responseSent) return;
        requestId = nextId();
        if (!requestId) {
          finish("ERROR", "X_NATIVE_PAGE_ERROR");
          return;
        }
        const messageId = nextId();
        if (!messageId) {
          finish("ERROR", "X_NATIVE_PAGE_ERROR");
          return;
        }
        responseSent = true;
        transmit({
          session_id: sessionId,
          event: {
            type: "response.create",
            event_id: requestId,
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: prompt }],
              x_grok: { client_message_id: messageId },
            },
          },
        });
      } else if (event.type === "response.created") {
        if (
          !responseSent ||
          responseId ||
          event.client_event_id !== requestId ||
          !plain(event.response) ||
          !id(event.response.id) ||
          event.response.status !== "in_progress"
        )
          return;
        responseId = event.response.id;
        if (userCancelled || internalError) cancelResponse();
      } else if (event.type === "response.chunk") {
        if (responseId && event.response_id === responseId) chunk(event.chunk);
      } else if (event.type === "response.done") {
        if (
          !responseId ||
          !plain(event.response) ||
          event.response.id !== responseId ||
          !["completed", "incomplete", "failed"].includes(
            event.response.status as string,
          )
        )
          return;
        const response = event.response;
        // X does not name the exhausted allowance in the terminal frame it
        // sends to the page: the observed shape is status "incomplete" with
        // status_details.reason "stream_error" and no error object. Keep any
        // limit wording that does arrive, and give the silent stream failure
        // its own code instead of calling every stop an interruption.
        const statusDetails = plain(response.status_details)
          ? response.status_details
          : undefined;
        const cause = plain(response.error)
          ? response.error
          : plain(response.incomplete_details)
            ? response.incomplete_details
            : statusDetails;
        const detail = failureDetail(String(response.status), cause);
        const limited =
          limitSignal(response.error) ||
          limitSignal(response.incomplete_details) ||
          limitSignal(statusDetails);
        if (internalError) finish("ERROR", internalError);
        else if (userCancelled) finish("CLOSED");
        else if (response.status === "completed")
          finish(
            text.trim() ? "RESULT" : "ERROR",
            text.trim() ? undefined : "X_NATIVE_PAGE_ERROR",
            text.trim() ? undefined : detail,
          );
        else if (limited) finish("ERROR", "X_NATIVE_USAGE_LIMIT", detail);
        else if (response.status === "incomplete")
          finish(
            "ERROR",
            statusDetails?.reason === "stream_error"
              ? "X_NATIVE_STREAM_ERROR"
              : "X_NATIVE_INTERRUPTED",
            detail,
          );
        else finish("ERROR", "X_NATIVE_PAGE_ERROR", detail);
      }
      // output_text.done/output_item.done are empty in the observed protocol;
      // neither those events nor tool_result/ui_layout supply assistant text.
    }
    return { start, receive, cancel, disconnect, isTerminal: () => terminal };
  }
  return { create };
});
