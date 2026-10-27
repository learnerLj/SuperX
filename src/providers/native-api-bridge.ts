export type {};
import type {
  API as ProtocolAPI,
  Event as ProtocolEvent,
  Protocol,
} from "./native-protocol";
interface Credentials {
  protocol?: string;
  token?: string;
  uid?: string;
}
interface Runtime {
  getCredentials(): Promise<Credentials>;
  getTurnStatus(): string;
}
interface Fiber {
  return?: Fiber;
  memoizedProps?: { runtime?: Runtime };
}
interface Composer extends HTMLElement {
  [key: `__reactFiber$${string}`]: Fiber;
}
interface Context {
  composer: Composer;
  input: HTMLElement;
  runtime: Runtime;
}
interface Task {
  nonce: string;
  context: Context | null;
  cancelled: boolean;
  blocked?: boolean;
  retained?: boolean;
  final?: ProtocolEvent;
  socket?: WebSocket;
  protocol?: Protocol;
  deadline?: number;
  cancelTimer?: number;
  closeTimer?: number;
  onMessage?: (event: MessageEvent<unknown>) => void;
  onClose?: () => void;
  onError?: () => void;
  onOpen?: () => void;
}
type View = Window &
  typeof globalThis & {
    SuperXNativeProtocol: ProtocolAPI;
    __superxNativeAPIInstalled?: boolean;
  };
/* MAIN-world API adapter. Authentication stays in page memory. */
(function (view: View) {
  "use strict";
  const CHANNEL = "SUPERX_NATIVE_API_V1",
    Protocol = view.SuperXNativeProtocol;
  if (!Protocol || !view.WebSocket || view.__superxNativeAPIInstalled) return;
  view.__superxNativeAPIInstalled = true;
  const tasks = new Map<string, Task>();
  let prepared: string | null = null,
    prepareTimer: number | undefined;
  const owns = (task: Task) => tasks.get(task.nonce) === task;
  const blocked = () => [...tasks.values()].some((task) => task.blocked);
  const post = (nonce: string, value: ProtocolEvent) =>
    view.postMessage(
      { channel: CHANNEL, direction: "FROM_API", nonce, ...value },
      view.location.origin,
    );
  function context() {
    try {
      const input = view.document.querySelector<HTMLElement>(
        '[data-superx-owned-panel][inert] [data-grok-composer] [contenteditable="true"][role="textbox"]',
      );
      if (!input || String(input.innerText || "").trim()) return null;
      const composer = input.closest<Composer>("[data-grok-composer]")!;
      const key = Object.keys(composer).find((k) =>
        k.startsWith("__reactFiber$"),
      );
      let fiber = key && composer[key as `__reactFiber$${string}`];
      for (let depth = 0; fiber && depth < 35; depth++, fiber = fiber.return) {
        const runtime = fiber.memoizedProps?.runtime;
        if (
          runtime &&
          typeof runtime.getCredentials === "function" &&
          typeof runtime.getTurnStatus === "function"
        ) {
          if (runtime.getTurnStatus() !== "idle") return null;
          return { composer, input, runtime };
        }
      }
      return null;
    } catch {
      return null;
    }
  }
  function unchanged(task: Task) {
    const now = context();
    return Boolean(
      now &&
      now.composer === task.context!.composer &&
      now.input === task.context!.input &&
      now.runtime === task.context!.runtime,
    );
  }
  function authProtocols(credentials: Credentials) {
    // Wire format verified in X's public runtime on 2026-10-28. Keep this
    // small protocol adapter local: webpack module IDs change on deployment.
    // Credentials and the resulting protocols never leave MAIN-world memory.
    const protocol = credentials?.protocol ?? "grok.bearer";
    const token =
      typeof credentials?.token === "string" ? credentials.token.trim() : "";
    if (
      !["grok.bearer", "xai-x-user"].includes(protocol) ||
      !token ||
      token.length > 32768 ||
      !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(token)
    )
      return null;
    return protocol === "xai-x-user"
      ? [`xai-x-user.${token}`]
      : ["grok.bearer", token];
  }
  function clearPrepared() {
    view.clearTimeout(prepareTimer);
    prepareTimer = undefined;
    prepared = null;
  }
  function dispose(task: Task) {
    view.clearTimeout(task.deadline);
    view.clearTimeout(task.cancelTimer);
    view.clearTimeout(task.closeTimer);
    task.socket?.removeEventListener("message", task.onMessage!);
    task.socket?.removeEventListener("close", task.onClose!);
    task.socket?.removeEventListener("error", task.onError!);
    task.socket?.removeEventListener("open", task.onOpen!);
    if (owns(task)) tasks.delete(task.nonce);
    if (prepared === task.nonce) clearPrepared();
  }
  function terminate(task: Task, value: ProtocolEvent) {
    if (!owns(task) || task.final) return;
    task.final = value;
    task.cancelled = true;
    view.clearTimeout(task.deadline);
    view.clearTimeout(task.cancelTimer);
    if (!task.socket) {
      dispose(task);
      post(task.nonce, value);
      return;
    }
    // Only a real close event confirms closure; close() returning is no ACK.
    if (task.socket!.readyState === 3) {
      closed(task);
      return;
    }
    try {
      task.socket.close();
    } catch {
      /* Retain ownership until an actual close. */
    }
    if (!owns(task)) return;
    task.closeTimer = view.setTimeout(() => {
      if (owns(task)) {
        task.blocked = true;
        task.retained = true;
        post(task.nonce, {
          kind: "ERROR",
          code: "X_NATIVE_CANCEL_UNCONFIRMED",
          retain: true,
        });
      }
    }, 4000);
  }
  function closed(task: Task) {
    if (!owns(task)) return;
    if (task.protocol && !task.protocol.isTerminal())
      task.protocol.disconnect();
    if (!owns(task)) return;
    const value = task.retained
      ? { kind: "CLOSED" }
      : task.final ||
        (task.cancelled
          ? { kind: "CLOSED" }
          : { kind: "ERROR", code: "X_NATIVE_INTERRUPTED" });
    dispose(task);
    post(task.nonce, value);
  }
  function cancel(task: Task) {
    if (!owns(task)) return;
    task.cancelled = true;
    if (task.final) {
      task.final = { kind: "CLOSED" };
      return;
    }
    if (!task.protocol) {
      terminate(task, { kind: "CLOSED" });
      return;
    }
    task.protocol.cancel();
    if (!owns(task) || task.final || task.cancelTimer) return;
    task.cancelTimer = view.setTimeout(
      () => terminate(task, { kind: "CLOSED" }),
      4000,
    );
  }
  async function connect(nonce: string) {
    if (tasks.has(nonce)) return;
    if (blocked()) {
      post(nonce, { kind: "ERROR", code: "X_NATIVE_CANCEL_UNCONFIRMED" });
      return;
    }
    if (tasks.size >= 10) {
      post(nonce, { kind: "ERROR", code: "X_NATIVE_BUSY" });
      return;
    }
    if (prepared !== nonce) {
      post(nonce, { kind: "ERROR", code: "X_NATIVE_UNAVAILABLE" });
      return;
    }
    const task: Task = { nonce, context: context(), cancelled: false };
    if (!task.context) {
      clearPrepared();
      post(nonce, { kind: "ERROR", code: "X_NATIVE_UNAVAILABLE" });
      return;
    }
    tasks.set(nonce, task);
    try {
      const credentials = await task.context!.runtime.getCredentials();
      if (!owns(task) || task.cancelled || prepared !== nonce) return;
      if (blocked()) {
        terminate(task, { kind: "ERROR", code: "X_NATIVE_CANCEL_UNCONFIRMED" });
        return;
      }
      if (!unchanged(task)) {
        terminate(task, { kind: "ERROR", code: "X_NATIVE_PANEL_BUSY" });
        return;
      }
      const protocols = authProtocols(credentials);
      if (!protocols) {
        terminate(task, { kind: "ERROR", code: "X_NATIVE_ADAPTER_CHANGED" });
        return;
      }
      const url = new URL("wss://grok.com/ws/mgw/");
      // uid is required by this observed gateway. It remains in the page's
      // connection URL; neither uid nor auth protocols cross the bridge.
      if (typeof credentials?.uid !== "string" || !credentials.uid)
        throw Error();
      url.searchParams.set("uid", credentials.uid);
      task.socket = new view.WebSocket(url.href, protocols);
      task.onMessage = (event) => task.protocol?.receive(event.data);
      task.onClose = () => closed(task);
      task.onError = () =>
        terminate(task, { kind: "ERROR", code: "X_NATIVE_UNAVAILABLE" });
      task.onOpen = () => {
        if (!owns(task) || task.cancelled || prepared !== nonce) return;
        if (blocked()) {
          terminate(task, {
            kind: "ERROR",
            code: "X_NATIVE_CANCEL_UNCONFIRMED",
          });
          return;
        }
        if (!unchanged(task)) {
          terminate(task, { kind: "ERROR", code: "X_NATIVE_PANEL_BUSY" });
          return;
        }
        post(nonce, { kind: "READY" });
      };
      task.socket.addEventListener("open", task.onOpen!);
      task.socket.addEventListener("message", task.onMessage!);
      task.socket.addEventListener("close", task.onClose!);
      task.socket.addEventListener("error", task.onError!);
    } catch {
      if (owns(task))
        terminate(task, { kind: "ERROR", code: "X_NATIVE_UNAVAILABLE" });
    }
  }
  function run(nonce: string, prompt: string) {
    const task = tasks.get(nonce);
    if (task && (task.protocol || task.cancelled)) return;
    if (blocked()) {
      if (task)
        terminate(task, { kind: "ERROR", code: "X_NATIVE_CANCEL_UNCONFIRMED" });
      else post(nonce, { kind: "ERROR", code: "X_NATIVE_CANCEL_UNCONFIRMED" });
      return;
    }
    if (!task || !task.socket || task.socket!.readyState !== 1) {
      post(nonce, { kind: "ERROR", code: "X_NATIVE_UNAVAILABLE" });
      return;
    }
    if (!unchanged(task)) {
      terminate(task, { kind: "ERROR", code: "X_NATIVE_PANEL_BUSY" });
      return;
    }
    if (prepared === nonce) clearPrepared();
    task.protocol = Protocol.create({
      nonce,
      prompt,
      randomUUID: () => view.crypto.randomUUID(),
      send: (packet) => {
        try {
          if (task.socket!.readyState !== 1) throw Error();
          task.socket!.send(JSON.stringify(packet));
        } catch {
          task.blocked = true;
          throw Error();
        }
      },
      emit: (value) => {
        if (!owns(task)) return;
        if (
          value.kind === "RESULT" ||
          value.kind === "CLOSED" ||
          (value.kind === "ERROR" && !value.retain)
        )
          terminate(task, value);
        else {
          if (value.kind === "ERROR" && value.retain) {
            task.blocked = true;
            task.retained = true;
          }
          post(nonce, value);
        }
      },
    });
    task.deadline = view.setTimeout(() => cancel(task), 150000);
    task.protocol.start();
    if (owns(task) && !task.final && !task.cancelled)
      post(nonce, { kind: "RUNNING" });
  }
  view.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message: unknown = event.data;
    if (
      event.source !== view ||
      event.origin !== view.location.origin ||
      (message as { channel?: unknown })?.channel !== CHANNEL ||
      (message as { direction: string }).direction !== "TO_API" ||
      typeof (message as { nonce: string }).nonce !== "string" ||
      (message as { nonce: string }).nonce.length > 100
    )
      return;
    const nonce = (message as { nonce: string }).nonce;
    if ((message as { type: string }).type === "PREPARE") {
      if (blocked()) {
        post(nonce, { kind: "ERROR", code: "X_NATIVE_CANCEL_UNCONFIRMED" });
        return;
      }
      if (tasks.has(nonce)) return;
      if (tasks.size >= 10) {
        post(nonce, { kind: "ERROR", code: "X_NATIVE_BUSY" });
        return;
      }
      if (prepared && prepared !== nonce) {
        post(nonce, { kind: "ERROR", code: "X_NATIVE_PANEL_BUSY" });
        return;
      }
      prepared = nonce;
      view.clearTimeout(prepareTimer);
      prepareTimer = view.setTimeout(() => {
        if (prepared !== nonce) return;
        const task = tasks.get(nonce);
        if (task)
          terminate(task, { kind: "ERROR", code: "X_NATIVE_UNAVAILABLE" });
        else {
          clearPrepared();
          post(nonce, { kind: "ERROR", code: "X_NATIVE_UNAVAILABLE" });
        }
      }, 30000);
    } else if ((message as { type: string }).type === "CONNECT")
      void connect(nonce);
    else if ((message as { type: string }).type === "RUN") {
      if (
        typeof (message as { prompt: string }).prompt !== "string" ||
        !(message as { prompt: string }).prompt.trim() ||
        (message as { prompt: string }).prompt.length > 60000
      ) {
        const task = tasks.get(nonce);
        if (task) terminate(task, { kind: "ERROR", code: "X_NATIVE_LAYOUT" });
        return;
      }
      run(nonce, (message as { prompt: string }).prompt);
    } else if ((message as { type: string }).type === "CANCEL") {
      const task = tasks.get(nonce);
      if (task) cancel(task);
      else {
        if (prepared === nonce) clearPrepared();
        post(nonce, { kind: "CLOSED" });
      }
    }
  });
  view.addEventListener("pagehide", () => {
    clearPrepared();
    for (const task of [...tasks.values()]) cancel(task);
  });
})(globalThis as View);
