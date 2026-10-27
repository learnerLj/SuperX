// GENERATED from src/content/native-panel.ts. Edit src/ and run npm run build.
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SuperXNativePanel = api;
})(globalThis, function() {
  "use strict";
  const CHANNEL = "SUPERX_NATIVE_API_V1";
  const OPENER = 'button[data-testid="GrokDrawerHeader"],[data-testid="GrokDrawerHeader"] > button';
  function panel(doc) {
    return doc.querySelector("#layers [data-grok-composer]")?.closest('[data-testid="GrokDrawer"]') || null;
  }
  const editor = (root) => root.querySelector(
    '[contenteditable="true"][role="textbox"][data-lexical-editor="true"]'
  );
  const generating = (root) => Boolean(
    root.querySelector(
      'button[aria-label="Stop"],button[aria-label="停止"],button:has(svg[data-icon="icon-stop"])'
    )
  );
  function create({
    document: doc,
    window: view,
    send
  }) {
    const tasks = /* @__PURE__ */ new Map();
    let uiOwner = null;
    const live = (task) => tasks.get(task.nonce) === task;
    const blocked = () => [...tasks.values()].some((task) => task.blocked);
    const delay = (ms) => new Promise((resolve) => view.setTimeout(resolve, ms));
    const emit = (task, kind, value = {}) => {
      try {
        send({ type: "NATIVE_EVENT", nonce: task.nonce, kind, ...value });
      } catch {
      }
    };
    const post = (task, type, value = {}) => view.postMessage(
      {
        channel: CHANNEL,
        direction: "TO_API",
        nonce: task.nonce,
        type,
        ...value
      },
      view.location.origin
    );
    const error = (code, stage) => ({ code, stage });
    const isOpen = (task) => Boolean(task.root?.isConnected && panel(doc) === task.root);
    function nativeNode(task, node) {
      const element = node?.nodeType === 3 ? node.parentElement : node;
      return Boolean(
        task.root?.contains(node) || element?.closest?.(
          '[data-testid="GrokDrawer"],[data-testid="GrokDrawerHeader"]'
        )
      );
    }
    function snapshot(task) {
      const element = doc.activeElement;
      if (nativeNode(task, element)) {
        if (!task.focus) task.focus = { element: doc.body };
        return;
      }
      const selection = view.getSelection?.();
      let range;
      if (selection?.rangeCount) {
        const candidate = selection.getRangeAt(0);
        if (!nativeNode(task, candidate.startContainer) && !nativeNode(task, candidate.endContainer))
          range = candidate.cloneRange();
      }
      task.focus = {
        element,
        range,
        start: element?.selectionStart,
        end: element?.selectionEnd
      };
    }
    function restore(task) {
      const saved = task.focus;
      if (!saved || task.taken || task.restoring) return;
      task.restoring = true;
      try {
        const selection = view.getSelection?.();
        if (selection?.rangeCount && nativeNode(task, selection.anchorNode))
          selection.removeAllRanges();
        if (nativeNode(task, doc.activeElement))
          doc.activeElement.blur();
        if (saved.element?.isConnected && saved.element !== doc.body && !nativeNode(task, saved.element) && doc.activeElement !== saved.element)
          saved.element.focus({ preventScroll: true });
        const range = saved.range, current = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (range?.startContainer?.isConnected && range?.endContainer?.isConnected && !nativeNode(task, range.startContainer) && !nativeNode(task, range.endContainer)) {
          if (selection && (!current || current.startContainer !== range.startContainer || current.startOffset !== range.startOffset || current.endContainer !== range.endContainer || current.endOffset !== range.endOffset)) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } else if (typeof saved.start === "number" && saved.element?.isConnected && (saved.element.selectionStart !== saved.start || saved.element.selectionEnd !== saved.end))
          saved.element.setSelectionRange?.(saved.start, saved.end);
      } finally {
        task.restoring = false;
      }
    }
    function own(task, root) {
      task.root = root;
      if (!task.owned) {
        task.hadInert = root.hasAttribute("inert");
        task.owned = true;
      }
      root.setAttribute("inert", "");
      root.setAttribute("data-superx-owned-panel", "");
    }
    function releaseUI(task) {
      if (task.uiReleased) return;
      task.uiReleased = true;
      if (uiOwner !== task) return;
      task.style?.remove();
      task.root?.removeAttribute("data-superx-owned-panel");
      if (task.owned && !task.hadInert) task.root?.removeAttribute("inert");
      doc.documentElement.removeAttribute("data-superx-native-running");
      for (const [name, handler] of [
        ["focusin", task.onFocus],
        ["selectionchange", task.onSelection],
        ["pointerdown", task.onIntent],
        ["keydown", task.onIntent]
      ])
        doc.removeEventListener(name, handler, true);
    }
    function release(task) {
      releaseUI(task);
      view.clearInterval(task.heartbeat);
      view.removeEventListener("message", task.onAPI);
      view.clearTimeout(task.cancelTimer);
      view.clearTimeout(task.recoveryTimer);
      tasks.delete(task.nonce);
      freeUI(task);
    }
    function freeUI(task) {
      if (uiOwner === task && task.uiClean) {
        uiOwner = null;
        pump();
      }
    }
    async function handoff(task) {
      if (!live(task) || task.cancelled || task.handingOff) return;
      task.handingOff = true;
      const clean = await cleanup(task);
      if (!live(task)) return;
      if (clean) freeUI(task);
      else cancel(task.nonce);
    }
    async function cleanup(task) {
      if (task.uiClean) return true;
      if (task.cleaning) return task.cleaning;
      task.cleaning = (async () => {
        if (task.openIssued && !task.root && !task.taken) {
          const until = Date.now() + 2500;
          while (!task.root && Date.now() < until) {
            task.root = panel(doc);
            if (!task.root) await delay(100);
          }
        }
        if (isOpen(task) && !task.taken) {
          task.root.querySelector(
            'button[aria-label="Collapse"]'
          )?.click();
          const until = Date.now() + 2500;
          while (isOpen(task) && !task.taken && Date.now() < until)
            await delay(100);
          await delay(200);
          if (doc.activeElement === task.opener || doc.activeElement === doc.body || nativeNode(task, doc.activeElement))
            restore(task);
        }
        releaseUI(task);
        task.uiClean = !isOpen(task) || task.taken;
        return task.uiClean;
      })();
      return task.cleaning;
    }
    function recoverClosedPanel(task) {
      if (!live(task)) return;
      if (!isOpen(task)) {
        task.uiClean = true;
        release(task);
        emit(task, "CLOSED");
      } else
        task.recoveryTimer = view.setTimeout(
          () => recoverClosedPanel(task),
          300
        );
    }
    async function block(task) {
      if (!live(task) || task.blocked || task.finishing) return;
      task.blocked = true;
      await cleanup(task);
      if (live(task))
        emit(task, "ERROR", { code: "X_NATIVE_CANCEL_UNCONFIRMED" });
    }
    async function finish(task, result = null, failure = null, closed = false) {
      if (!live(task) || task.finishing) return;
      task.finishing = true;
      task.cancelled = true;
      const clean = await cleanup(task);
      if (!clean) {
        task.finishing = false;
        task.blocked = true;
        emit(task, "ERROR", { code: "X_NATIVE_CANCEL_UNCONFIRMED" });
        recoverClosedPanel(task);
        return;
      }
      release(task);
      if (closed || task.cancelRequested || task.blocked) emit(task, "CLOSED");
      else if (failure) {
        emit(task, "ERROR", {
          code: failure.code || "X_NATIVE_LAYOUT",
          stage: failure.stage
        });
        if (failure.code === "X_NATIVE_CANCEL_UNCONFIRMED")
          emit(task, "CLOSED");
      } else emit(task, "RESULT", result);
    }
    function cancel(nonce) {
      const task = tasks.get(nonce);
      if (!task) {
        emit({ nonce }, "CLOSED");
        return;
      }
      if (task.cancelRequested) return;
      task.cancelRequested = true;
      task.cancelled = true;
      if (uiOwner === task || task.sent || task.connecting)
        post(task, "CANCEL");
      if (!task.sent && !task.connecting) {
        void finish(task, null, null, true);
        return;
      }
      task.cancelTimer = view.setTimeout(() => block(task), 4e3);
    }
    function takeover(task) {
      if (task.taken) return;
      task.taken = true;
      releaseUI(task);
      cancel(task.nonce);
    }
    async function wait(task, check, ms = 25e3) {
      const until = Date.now() + ms;
      while (live(task) && !task.cancelled) {
        const found = check();
        if (found) return found;
        if (Date.now() >= until) break;
        await delay(100);
      }
      throw error(
        task.cancelled ? "X_NATIVE_INTERRUPTED" : "X_NATIVE_LAYOUT",
        "editor-ready"
      );
    }
    async function execute(task) {
      task.style = doc.createElement("style");
      task.style.textContent = 'html[data-superx-native-running] #layers [data-testid="GrokDrawer"]:has([data-grok-composer]){position:fixed!important;left:-20000px!important;top:0!important;width:1024px!important;height:900px!important;opacity:0!important;pointer-events:none!important;}';
      doc.documentElement.setAttribute("data-superx-native-running", "");
      doc.documentElement.append(task.style);
      post(task, "PREPARE");
      task.opener = await wait(
        task,
        () => doc.querySelector(OPENER),
        5e3
      );
      if (!live(task) || task.cancelled) return;
      if (panel(doc)) throw error("X_NATIVE_PANEL_BUSY");
      task.openIssued = true;
      task.opener.click();
      const opened = await wait(task, () => panel(doc));
      if (!live(task) || task.cancelled) return;
      own(task, opened);
      const input = await wait(task, () => editor(task.root));
      if (!live(task) || task.cancelled) return;
      if (String(input.innerText || input.value || "").trim() || generating(task.root))
        throw error("X_NATIVE_PANEL_BUSY");
      task.connecting = true;
      post(task, "CONNECT");
      await wait(task, () => task.ready, 25e3);
      if (!live(task) || task.cancelled) return;
      task.sent = true;
      post(task, "RUN", { prompt: task.prompt });
    }
    function pump() {
      if (uiOwner || blocked()) return;
      const task = [...tasks.values()].find(
        (item) => item.queued && !item.cancelled && !item.finishing
      );
      if (!task) return;
      task.queued = false;
      uiOwner = task;
      task.uiReleased = false;
      task.uiClean = false;
      snapshot(task);
      if (panel(doc)) {
        void finish(task, null, error("X_NATIVE_PANEL_BUSY"));
        return;
      }
      for (const [name, handler] of [
        ["focusin", task.onFocus],
        ["selectionchange", task.onSelection],
        ["pointerdown", task.onIntent],
        ["keydown", task.onIntent]
      ])
        doc.addEventListener(name, handler, true);
      void execute(task).catch((failure) => {
        if (!live(task) || task.finishing) return;
        if (task.sent || task.connecting) cancel(task.nonce);
        else {
          post(task, "CANCEL");
          void finish(task, null, failure);
        }
      });
    }
    function run({ nonce, prompt }) {
      if (tasks.has(nonce)) return;
      if (blocked()) {
        emit({ nonce }, "ERROR", { code: "X_NATIVE_CANCEL_UNCONFIRMED" });
        emit({ nonce }, "CLOSED");
        return;
      }
      if (tasks.size >= 10) {
        emit({ nonce }, "ERROR", { code: "X_NATIVE_PANEL_BUSY" });
        return;
      }
      if (typeof nonce !== "string" || typeof prompt !== "string" || !prompt.trim() || prompt.length > 6e4) {
        emit({ nonce }, "ERROR", {
          code: "X_NATIVE_LAYOUT",
          stage: "input-size"
        });
        return;
      }
      if (!uiOwner && panel(doc)) {
        emit({ nonce }, "ERROR", { code: "X_NATIVE_PANEL_BUSY" });
        return;
      }
      const task = {
        nonce,
        prompt,
        root: null,
        sent: false,
        ready: false,
        queued: true,
        uiReleased: true,
        uiClean: true
      };
      tasks.set(nonce, task);
      task.onAPI = (event) => {
        const m = event.data;
        if (event.source !== view || event.origin !== view.location.origin || m?.channel !== CHANNEL || m.direction !== "FROM_API" || m.nonce !== nonce || !live(task))
          return;
        if (m.kind === "READY") {
          task.ready = true;
          return;
        }
        if (m.kind === "RUNNING") {
          void handoff(task);
          return;
        }
        if (m.kind === "TAKEOVER") {
          takeover(task);
          return;
        }
        if (m.kind === "UPDATE") {
          if (!task.cancelled && !task.blocked && !task.finishing)
            emit(task, "UPDATE", { text: m.text, sources: m.sources });
          return;
        }
        if (m.kind === "ERROR" && m.code === "X_NATIVE_CANCEL_UNCONFIRMED") {
          if (m.retain) void block(task);
          else void finish(task, null, error(m.code));
          return;
        }
        if (m.kind === "RESULT")
          void finish(task, { text: m.text, sources: m.sources });
        else if (m.kind === "CLOSED") void finish(task, null, null, true);
        else if (m.kind === "ERROR")
          void finish(task, null, error(m.code, m.stage));
      };
      task.onIntent = (event) => {
        if (event.isTrusted && !task.taken && (nativeNode(task, event.target) || task.openIssued && event.target.closest?.(OPENER)))
          takeover(task);
      };
      task.onSelection = () => {
        if (!task.restoring && !task.taken && !nativeNode(task, doc.activeElement))
          snapshot(task);
      };
      task.onFocus = (event) => {
        if (task.restoring || task.taken || task.focusFault) return;
        const root = task.root || task.openIssued && panel(doc);
        if ((root || null)?.contains(event.target)) {
          own(task, root);
          if ((task.restores = (task.restores || 0) + 1) > 12) {
            task.focusFault = true;
            cancel(nonce);
            return;
          }
          restore(task);
        } else if (task.finishing && event.target === task.opener)
          restore(task);
        else snapshot(task);
      };
      view.addEventListener("message", task.onAPI);
      task.heartbeat = view.setInterval(() => emit(task, "PING"), 2e4);
      pump();
    }
    return {
      run,
      cancel,
      disconnect() {
        for (const task of [...tasks.values()]) cancel(task.nonce);
      }
    };
  }
  return { create };
});
