// GENERATED from src/providers/native-api-bridge.ts. Edit src/ and run npm run build.
(function(view) {
  "use strict";
  const CHANNEL = "SUPERX_NATIVE_API_V1", Protocol = view.SuperXNativeProtocol;
  if (!Protocol || !view.WebSocket || view.__superxNativeAPIInstalled) return;
  view.__superxNativeAPIInstalled = true;
  const tasks = /* @__PURE__ */ new Map();
  let prepared = null, prepareTimer;
  const owns = (task) => tasks.get(task.nonce) === task;
  const blocked = () => [...tasks.values()].some((task) => task.blocked);
  const post = (nonce, value) => view.postMessage(
    { channel: CHANNEL, direction: "FROM_API", nonce, ...value },
    view.location.origin
  );
  function context() {
    try {
      const input = view.document.querySelector(
        '[data-superx-owned-panel][inert] [data-grok-composer] [contenteditable="true"][role="textbox"]'
      );
      if (!input || String(input.innerText || "").trim()) return null;
      const composer = input.closest("[data-grok-composer]");
      const key = Object.keys(composer).find(
        (k) => k.startsWith("__reactFiber$")
      );
      let fiber = key && composer[key];
      for (let depth = 0; fiber && depth < 35; depth++, fiber = fiber.return) {
        const runtime = fiber.memoizedProps?.runtime;
        if (runtime && typeof runtime.getCredentials === "function" && typeof runtime.getTurnStatus === "function") {
          if (runtime.getTurnStatus() !== "idle") return null;
          return { composer, input, runtime };
        }
      }
      return null;
    } catch {
      return null;
    }
  }
  function unchanged(task) {
    const now = context();
    return Boolean(
      now && now.composer === task.context.composer && now.input === task.context.input && now.runtime === task.context.runtime
    );
  }
  function authProtocols(credentials) {
    const protocol = credentials?.protocol ?? "grok.bearer";
    const token = typeof credentials?.token === "string" ? credentials.token.trim() : "";
    if (!["grok.bearer", "xai-x-user"].includes(protocol) || !token || token.length > 32768 || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(token))
      return null;
    return protocol === "xai-x-user" ? [`xai-x-user.${token}`] : ["grok.bearer", token];
  }
  function clearPrepared() {
    view.clearTimeout(prepareTimer);
    prepareTimer = void 0;
    prepared = null;
  }
  function dispose(task) {
    view.clearTimeout(task.deadline);
    view.clearTimeout(task.cancelTimer);
    view.clearTimeout(task.closeTimer);
    task.socket?.removeEventListener("message", task.onMessage);
    task.socket?.removeEventListener("close", task.onClose);
    task.socket?.removeEventListener("error", task.onError);
    task.socket?.removeEventListener("open", task.onOpen);
    if (owns(task)) tasks.delete(task.nonce);
    if (prepared === task.nonce) clearPrepared();
  }
  function terminate(task, value) {
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
    if (task.socket.readyState === 3) {
      closed(task);
      return;
    }
    try {
      task.socket.close();
    } catch {
    }
    if (!owns(task)) return;
    task.closeTimer = view.setTimeout(() => {
      if (owns(task)) {
        task.blocked = true;
        task.retained = true;
        post(task.nonce, {
          kind: "ERROR",
          code: "X_NATIVE_CANCEL_UNCONFIRMED",
          retain: true
        });
      }
    }, 4e3);
  }
  function closed(task) {
    if (!owns(task)) return;
    if (task.protocol && !task.protocol.isTerminal())
      task.protocol.disconnect();
    if (!owns(task)) return;
    const value = task.retained ? { kind: "CLOSED" } : task.final || (task.cancelled ? { kind: "CLOSED" } : { kind: "ERROR", code: "X_NATIVE_INTERRUPTED" });
    dispose(task);
    post(task.nonce, value);
  }
  function cancel(task) {
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
      4e3
    );
  }
  async function connect(nonce) {
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
    const task = { nonce, context: context(), cancelled: false };
    if (!task.context) {
      clearPrepared();
      post(nonce, { kind: "ERROR", code: "X_NATIVE_UNAVAILABLE" });
      return;
    }
    tasks.set(nonce, task);
    try {
      const credentials = await task.context.runtime.getCredentials();
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
      if (typeof credentials?.uid !== "string" || !credentials.uid)
        throw Error();
      url.searchParams.set("uid", credentials.uid);
      task.socket = new view.WebSocket(url.href, protocols);
      task.onMessage = (event) => task.protocol?.receive(event.data);
      task.onClose = () => closed(task);
      task.onError = () => terminate(task, { kind: "ERROR", code: "X_NATIVE_UNAVAILABLE" });
      task.onOpen = () => {
        if (!owns(task) || task.cancelled || prepared !== nonce) return;
        if (blocked()) {
          terminate(task, {
            kind: "ERROR",
            code: "X_NATIVE_CANCEL_UNCONFIRMED"
          });
          return;
        }
        if (!unchanged(task)) {
          terminate(task, { kind: "ERROR", code: "X_NATIVE_PANEL_BUSY" });
          return;
        }
        post(nonce, { kind: "READY" });
      };
      task.socket.addEventListener("open", task.onOpen);
      task.socket.addEventListener("message", task.onMessage);
      task.socket.addEventListener("close", task.onClose);
      task.socket.addEventListener("error", task.onError);
    } catch {
      if (owns(task))
        terminate(task, { kind: "ERROR", code: "X_NATIVE_UNAVAILABLE" });
    }
  }
  function run(nonce, prompt) {
    const task = tasks.get(nonce);
    if (task && (task.protocol || task.cancelled)) return;
    if (blocked()) {
      if (task)
        terminate(task, { kind: "ERROR", code: "X_NATIVE_CANCEL_UNCONFIRMED" });
      else post(nonce, { kind: "ERROR", code: "X_NATIVE_CANCEL_UNCONFIRMED" });
      return;
    }
    if (!task || !task.socket || task.socket.readyState !== 1) {
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
          if (task.socket.readyState !== 1) throw Error();
          task.socket.send(JSON.stringify(packet));
        } catch {
          task.blocked = true;
          throw Error();
        }
      },
      emit: (value) => {
        if (!owns(task)) return;
        if (value.kind === "RESULT" || value.kind === "CLOSED" || value.kind === "ERROR" && !value.retain)
          terminate(task, value);
        else {
          if (value.kind === "ERROR" && value.retain) {
            task.blocked = true;
            task.retained = true;
          }
          post(nonce, value);
        }
      }
    });
    task.deadline = view.setTimeout(() => cancel(task), 15e4);
    task.protocol.start();
    if (owns(task) && !task.final && !task.cancelled)
      post(nonce, { kind: "RUNNING" });
  }
  view.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== view || event.origin !== view.location.origin || message?.channel !== CHANNEL || message.direction !== "TO_API" || typeof message.nonce !== "string" || message.nonce.length > 100)
      return;
    const nonce = message.nonce;
    if (message.type === "PREPARE") {
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
      }, 3e4);
    } else if (message.type === "CONNECT")
      void connect(nonce);
    else if (message.type === "RUN") {
      if (typeof message.prompt !== "string" || !message.prompt.trim() || message.prompt.length > 6e4) {
        const task = tasks.get(nonce);
        if (task) terminate(task, { kind: "ERROR", code: "X_NATIVE_LAYOUT" });
        return;
      }
      run(nonce, message.prompt);
    } else if (message.type === "CANCEL") {
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
})(globalThis);
