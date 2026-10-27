import type { Post, Settings, Source, ProviderId } from "../shared/contracts";
import type { ExtractedPost } from "../shared/feed-core";
import type { Usage, Metadata, FailureDetails } from "../providers/types";
import type { RequestDiagnostics } from "../shared/feed-core";
import type {
  OAuthStatus,
  ErrorShape,
  ControlMessage,
  Reply,
} from "../ui/state-types";
(function () {
  "use strict";
  type Result = Metadata & {
    text: string;
    sources?: Source[];
    verificationStatus?: string;
    verificationStart?: number;
    verificationFailure?: FailureDetails;
    requestDiagnostics?: RequestDiagnostics;
    apiVerification?: string;
    warning?: string;
    searched?: boolean;
  };
  interface Retry {
    phase: string;
    max: number;
    attempt?: number;
    retryAt?: number;
    code?: string;
    limit?: number;
  }
  interface UsageRecord {
    requestedModel?: string;
    cached?: boolean;
    usage?: Usage;
    byStage?: Record<string, Usage>;
    model?: string;
    models?: string[];
    complete?: boolean;
  }
  interface Entry {
    article: HTMLElement;
    path: string;
    post: ExtractedPost;
    signature: string;
    status: string;
    since: number;
    result: Result | null;
    commentStatus: string;
    comments: string[];
    card: HTMLElement;
    ui: ReturnType<typeof createCard>["ui"];
    analysisKey?: string;
    analysisLeader?: Entry;
    analysisRetry?: Retry | null;
    analysisUsage?: UsageRecord | null;
    analysisVersion?: number;
    answerFrame?: number;
    answerSplit?: boolean;
    cacheLookupDeferred?: boolean;
    cacheLookupId?: string;
    cacheLookupKey?: string;
    cached?: boolean;
    commentError?: string;
    commentRequestDiagnostics?: RequestDiagnostics;
    commentRetry?: Retry | null;
    commentUsage?: UsageRecord | null;
    connectionStatus?: { key?: string; vars?: Record<string, unknown> };
    copyStatusKey?: string;
    errorCode?: string;
    explanationRendered?: string;
    keepRetryAnswer?: boolean;
    latestText?: string;
    noteKey?: string;
    pending?: boolean;
    phase?: string;
    requestDiagnostics?: RequestDiagnostics;
    sharedVersion?: number;
    sourceList?: Source[];
    statusKey?: string;
    statusVars?: Record<string, unknown>;
    verificationBase?: string;
    verificationDiagnostics?: boolean;
    verificationFailure?: FailureDetails | null;
    verificationRendered?: string;
    verificationStart?: number;
    verificationStarted?: boolean;
  }
  interface RequestSnapshot {
    requestId: string;
    task: string;
    entry: Entry;
    postSnapshot: Post;
    apiIdentity: string;
    path: string;
    provider: ProviderId;
    language: string;
    apiModel: string;
    verifyPrompt: string;
    commentsPrompt: string;
    force?: boolean;
    prefetch?: boolean;
    manual?: boolean;
    revision?: number;
    started?: boolean;
    originatedPrefetch?: boolean;
    railCancellation?: boolean;
    scrollCancellation?: boolean;
    analysisKey?: string;
    analysis?: Result;
    phase?: string;
  }
  interface FeedMessage extends Metadata {
    type: string;
    requestId: string;
    nonce: string;
    prompt: string;
    nativeAccount?: string;
    enabled: boolean;
    epoch: number;
    batchId: string;
    ok: boolean;
    width: number;
    collapsed: boolean;
    settings: Settings;
    ready: boolean;
    answerCacheReady?: boolean;
    historyEnabled?: boolean;
    historyEpoch?: number;
    railWidth?: number;
    uiLanguage?: string;
    language?: string;
    revision?: number;
    taskRevision?: number;
    credentialIdentity?: string;
    credentialId?: string;
    oauthStatus?: OAuthStatus;
    buildStatus?: { errorCode?: string };
    nativeStatus?: { errorCode?: string };
    result: Result;
    text: string;
    sources: Source[];
    comments: string[];
    cached?: boolean;
    error?: string;
    code?: string;
    phase?: string;
    verificationStatus?: string;
    verificationStart?: number;
    verificationFailure?: FailureDetails;
    requestDiagnostics?: RequestDiagnostics;
    attempt?: number;
    retryAt?: number;
    limit?: number;
    stage?: string;
    used?: number;
    cacheLookup?: boolean;
    deferred?: boolean;
    retryAttempt?: number;
    retryAttempts?: number;
    partialResult?: Result;
    kind?: string;
    verificationText?: string;
    warning?: string;
    diagnostics?: Record<string, unknown>;
  }

  if (globalThis.__grokFirstLoaded) return;
  globalThis.__grokFirstLoaded = true;
  const workerNonce = new URLSearchParams(location.hash.slice(1)).get(
    "xgrok-worker",
  );
  // Old releases left marked worker pages behind. They must never start a new
  // request after upgrading to the API-only release.
  if (workerNonce) return;

  const Core = XGrokCore,
    Layout = GrokFirstOverlayLayout,
    UI = GrokFirstUI,
    Scheduler = SuperXFeedScheduler;
  const nativePanel = SuperXNativePanel.create({
    document,
    window,
    send: (message) => post(message),
  });
  let xUILanguage = UI.normalizeLanguage(
    document.documentElement.getAttribute("lang") || navigator.language || "en",
  );
  let uiLanguage = UI.resolveLanguage("auto", xUILanguage);
  const t = (key: string | undefined, vars?: Record<string, unknown>) =>
    UI.t(key!, uiLanguage, vars);
  let settings: Settings = Core.DEFAULT_SETTINGS,
    providerReady = false,
    answerCacheReady = false,
    connected = false,
    port: chrome.runtime.Port | undefined,
    used = 0,
    collapsed = false;
  let customRailWidth = 0,
    resizeDrag: null | {
      id: number;
      start: number;
      width: number;
      preferred: number;
    } = null;
  let lastPath = location.pathname,
    scanTimer: number | null | undefined,
    reconnectTimer: number | undefined,
    handshakeTimer: number | undefined,
    dwellTimer: number | undefined,
    dwellDeadline = 0,
    needsPageRefresh = false;
  let hasConfig = false,
    workerSleeping = false,
    awaitingConfig = false,
    reconnectFailures = 0,
    xModalBlocked = false,
    pageSuspended = false;
  let oauthState: OAuthStatus = {},
    credentialIdentity = "",
    taskRevision: number | undefined;
  let draftComposer: ReturnType<typeof SuperXDraftComposer.create>;
  const explicitRequest = (request: RequestSnapshot) =>
    request?.task === "analysis" &&
    (request.force === true || request.manual === true);
  const wakeActions = new Map<string, () => void>(),
    wakeControls = new Map<string, { type: string }>();
  const entries = new Map<HTMLElement, Entry>(),
    detachedEntries = new Set<Entry>(),
    requests = new Map<string, RequestSnapshot>(),
    visible = new Set<HTMLElement>();
  // Reading a saved answer is independent of permission to start paid work.
  // Keep these probes separate from generation, progress and keepalive state.
  type CacheLookup = RequestSnapshot & {
    lookupKey: string;
    entries: Set<Entry>;
    timer?: number;
  };
  const cacheLookups = new Map<string, CacheLookup>();
  // X virtualizes the timeline. Keep live subscriptions and a bounded set of
  // recent cards when their native article is temporarily removed or recycled.
  const allEntries = () => [...entries.values(), ...detachedEntries];
  const historySeen = new Set<string>(),
    historyPending = new Map<
      string,
      { epoch: number; ids: string[]; sentAt: number }
    >();
  let historyEnabled = true,
    historyEpoch = 0,
    historyLoaded = false,
    historyRetryAt = 0;
  const queue = new Core.BoundedPostQueue({ capacity: Infinity });
  // The full-height rail and aligned rows are out of flow. X's columns and
  // articles remain untouched.
  const overlay = document.createElement("grok-first-overlay");
  overlay.id = "grokfirst-overlay";
  overlay.dataset.version =
    chrome.runtime.getManifest?.()?.version || "development";
  const overlayShadow = overlay.attachShadow({ mode: "open" });
  const overlayStyle = document.createElement("style");
  const symbolURL = chrome.runtime.getURL("assets/superx-symbol.svg");
  overlayStyle.textContent = `
    :host{all:initial;position:fixed;inset:0;display:block;overflow:hidden;pointer-events:none;z-index:2;contain:layout style paint;isolation:isolate;}
    :host([hidden]){display:none!important;}
    .rail{position:absolute;box-sizing:border-box;pointer-events:auto;background:var(--gf-bg,#000);}
    /* Keep this edge above the opaque header and rows. The rail itself must not
       create a stacking context, so the line remains continuous at the corner. */
    .rail::after{content:'';position:absolute;top:0;bottom:0;right:0;width:0;border-right:1px solid var(--gf-border,#2f3336);z-index:3;pointer-events:none;}
    .rail-head{position:absolute;z-index:2;display:flex;align-items:center;gap:6px;min-width:0;box-sizing:border-box;padding:0 12px;overflow:hidden;background:var(--gf-bg,#000);color:var(--gf-fg,#e7e9ea);border-bottom:1px solid var(--gf-border,#2f3336);font:700 17px/20px var(--gf-font,system-ui);pointer-events:auto;}
    .rail-head strong{display:flex;align-items:center;gap:7px;flex:1;min-width:0;overflow:hidden;white-space:nowrap;}.rail-brand-name{min-width:0;overflow:hidden;text-overflow:ellipsis;}.brand-symbol{display:block;flex:none;width:20px;height:20px;background-color:currentColor;-webkit-mask:url(${JSON.stringify(symbolURL)}) center/contain no-repeat;mask:url(${JSON.stringify(symbolURL)}) center/contain no-repeat;mask-mode:alpha;}.rail-head button,.rail-expand{display:flex;align-items:center;justify-content:center;box-sizing:border-box;height:32px;font:400 13px/20px var(--gf-font,system-ui);padding:0 8px;border:0;background:transparent;color:var(--gf-accent,#1d9bf0);cursor:pointer;flex-shrink:0;}.rail-head button:hover,.rail-expand:hover{background:rgba(127,127,127,.12);}.rail-head button:focus-visible,.rail-expand:focus-visible{outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:-2px;}
    .rail-head[data-compact=true] strong{display:none;}
    .rail-head .rail-collapse,.rail-expand{width:32px;padding:0;}.rail-collapse svg,.rail-expand svg{width:18px;height:18px;display:block;}.rail-expand{position:absolute;z-index:2;box-sizing:border-box;border:1px solid var(--gf-border,#2f3336);background:var(--gf-bg,#000);pointer-events:auto;}
    .rail-expand-mark{display:flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--gf-fg,#e7e9ea);}
    .rail-head .rail-settings,.rail-head .rail-history{width:32px;padding:0;}.rail-settings svg,.rail-history svg{width:18px;height:18px;display:block;}
    .rail-resize{position:absolute;z-index:3;width:8px;cursor:ew-resize;touch-action:none;pointer-events:auto;outline:none}.rail-resize::after{content:"";position:absolute;top:0;bottom:0;left:3px;width:2px;background:var(--gf-border,#2f3336)}.rail-resize:hover::after,.rail-resize:focus-visible::after{background:var(--gf-accent,#1d9bf0)}.rail-resize[hidden]{display:none!important;}
    .rail[hidden],.rail-head[hidden],.rail-expand[hidden]{display:none!important;}
    .rail-separators{position:absolute;z-index:2;overflow:hidden;pointer-events:none;}
    .rail-separators[hidden]{display:none!important;}
    .rail-separator{position:absolute;left:0;right:0;pointer-events:none;background:var(--gf-border,#2f3336);}
    grok-first-card{position:absolute;z-index:1;display:block;box-sizing:border-box;pointer-events:auto;overflow:hidden;}
    grok-first-card[hidden]{display:none!important;}
  `;
  overlayShadow.append(overlayStyle);
  const rail = node("aside", "rail");
  const railHeader = node("header", "rail-head"),
    railBrand = node("strong", "rail-brand"),
    brandMark = node("span", "brand-symbol");
  brandMark.setAttribute("aria-hidden", "true");
  railBrand.append(brandMark, node("span", "rail-brand-name", "SuperX"));
  railHeader.append(railBrand);
  const railToggle = node("button", "rail-toggle");
  railToggle.type = "button";
  railToggle.addEventListener("click", () => {
    railToggle.disabled = true;
    postControl({ type: "SET_ENABLED", enabled: !settings.enabled });
  });
  const railOptions = node("button", "rail-settings");
  railOptions.append(gear());
  railOptions.addEventListener("click", () => openSettings());
  const railHistory = node("button", "rail-history");
  railHistory.type = "button";
  const historyIcon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  historyIcon.setAttribute("viewBox", "0 0 24 24");
  historyIcon.setAttribute("fill", "none");
  historyIcon.setAttribute("stroke", "currentColor");
  historyIcon.setAttribute("stroke-width", "1.7");
  historyIcon.setAttribute("aria-hidden", "true");
  const historyPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  historyPath.setAttribute("d", "M3 11a9 9 0 1 1 2.6 7.3M3 4v7h7M12 7v5l3 2");
  historyPath.setAttribute("stroke-linecap", "round");
  historyPath.setAttribute("stroke-linejoin", "round");
  historyIcon.append(historyPath);
  railHistory.append(historyIcon);
  railHistory.addEventListener("click", () => openHistory());
  const railCollapse = node("button", "rail-collapse");
  railCollapse.append(chevron("left"));
  railCollapse.setAttribute("aria-label", "收起 SuperX");
  railCollapse.setAttribute("aria-expanded", "true");
  railCollapse.title = "收起右栏，停止新的分析，保留正在生成的结果";
  railCollapse.addEventListener("click", () => setCollapsed(true, true));
  const railExpand = node("button", "rail-expand"),
    expandMark = node("span", "rail-expand-mark");
  expandMark.setAttribute("aria-hidden", "true");
  expandMark.append(node("span", "brand-symbol"));
  railExpand.append(expandMark);
  railExpand.setAttribute("aria-label", "展开 SuperX");
  railExpand.setAttribute("aria-expanded", "false");
  railExpand.title = "展开 SuperX";
  railExpand.hidden = true;
  railExpand.addEventListener("click", () => setCollapsed(false, true));
  const railSeparators = node("div", "rail-separators");
  railSeparators.setAttribute("aria-hidden", "true");
  const railResize = node("div", "rail-resize");
  railResize.tabIndex = 0;
  railResize.setAttribute("role", "separator");
  railResize.setAttribute("aria-orientation", "vertical");
  railResize.addEventListener("pointerdown", beginRailResize);
  railResize.addEventListener("pointermove", moveRailResize);
  railResize.addEventListener("pointerup", finishRailResize);
  railResize.addEventListener("pointercancel", cancelRailResize);
  railResize.addEventListener("blur", cancelRailResize);
  railResize.addEventListener("dblclick", () => setRailWidth(0, true));
  railResize.addEventListener("keydown", railResizeKey);
  window.addEventListener("blur", cancelRailResize);
  railHeader.append(railToggle, railHistory, railOptions, railCollapse);
  overlayShadow.append(
    rail,
    railHeader,
    railExpand,
    railSeparators,
    railResize,
  );
  refreshHeaderLanguage();
  document.body.append(overlay);
  let layoutFrame: number | null = null,
    themeDirty = true,
    themeSignature = "",
    themePrimary: HTMLElement | null = null;
  const observedNativeCells = new Set<HTMLElement>(),
    observedNativeHeaders = new Set<HTMLElement>();
  let observedNativeSearch: HTMLFormElement | null | undefined;
  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => scheduleLayout())
      : null;
  const observer = new IntersectionObserver(
    (changes) => {
      for (const change of changes) {
        if (change.isIntersecting) {
          const entered = !visible.has(change.target as HTMLElement);
          visible.add(change.target as HTMLElement);
          const entry = entries.get(change.target as HTMLElement);
          if (
            entered &&
            entry &&
            [...requests.values()].some(
              (request) =>
                request.entry === entry && request.scrollCancellation,
            )
          )
            entry.since = Date.now();
        } else {
          visible.delete(change.target as HTMLElement);
          const entry = entries.get(change.target as HTMLElement);
          if (entry) {
            forgetCacheLookup(entry, true);
            entry.since = 0;
            entry.pending = false;
            queue.remove(entry.post.id);
            if (entry.status === "new") refreshCard(entry);
          }
        }
      }
      scheduleLayout();
      tick();
    },
    { threshold: 0 },
  );
  const mutations = new MutationObserver((changes) => {
    changes = changes.filter(
      (change) =>
        (change.target as HTMLElement) !== overlay &&
        !overlay.contains(change.target as HTMLElement) &&
        !(change.target as HTMLElement)?.closest?.(
          'superx-draft-action, superx-draft-panel, [data-testid="GrokDrawer"], [data-testid="grokDrawer"]',
        ),
    );
    if (!changes.length) return;
    syncXModalVisibility();
    themeDirty = true;
    scheduleLayout();
    if (
      changes.some(
        (change) =>
          change.type !== "attributes" ||
          !["class", "style", "hidden", "aria-hidden"].includes(
            change.attributeName!,
          ) ||
          affectsDisplayedPostBody(change.target as HTMLElement),
      )
    )
      scheduleScan();
  });
  mutations.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "href",
      "src",
      "alt",
      "lang",
      "datetime",
      "data-testid",
      "class",
      "style",
      "hidden",
      "aria-hidden",
      "role",
      "aria-modal",
      "open",
      "inert",
    ],
  });
  const themeObserver = new MutationObserver((changes) => {
    themeDirty = true;
    syncUILanguage();
    draftComposer?.refresh();
    scheduleLayout();
    if (
      changes.some(
        (change) =>
          (change.target as HTMLElement) === document.documentElement &&
          ["class", "style", "hidden", "aria-hidden"].includes(
            change.attributeName!,
          ),
      )
    )
      scheduleScan();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "lang", "hidden", "aria-hidden"],
  });
  if (document.head)
    themeObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href", "media", "disabled"],
    });
  window.addEventListener("scroll", onFeedScroll, {
    passive: true,
    capture: true,
  });
  window.addEventListener(
    "resize",
    () => {
      themeDirty = true;
      scheduleLayout();
    },
    { passive: true },
  );
  window.visualViewport?.addEventListener("resize", scheduleLayout, {
    passive: true,
  });
  window.visualViewport?.addEventListener("scroll", onFeedScroll, {
    passive: true,
  });
  for (const event of ["fullscreenchange", "webkitfullscreenchange"])
    document.addEventListener(event, () => {
      syncXModalVisibility();
      scheduleLayout();
      tick();
    });
  draftComposer = globalThis.SuperXDraftComposer?.create({
    core: Core,
    t,
    render: (target: HTMLElement, text: string) =>
      GrokFirstMarkdown.render(target, text),
    send: (message) => post(message),
    wake: () => {
      if (!connected) connect();
      configureDraft();
    },
    onLayout: scheduleLayout,
    openSettings,
    errorKey,
    symbolURL,
  });
  connect();
  scheduleScan();
  setInterval(tick, 100);
  // A message, rather than an idle open port, keeps the MV3 worker alive during generation.
  setInterval(() => {
    if ((requests.size || draftComposer?.activeCount) && connected)
      post({ type: "PING" });
  }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      wakeActions.clear();
      // Switching tabs only pauses new work. Keep the port and subscriptions
      // so accepted answers, comments and their retries can finish in place.
      pauseUnseenRailQueue({ preserveStarted: true });
    } else {
      if (!connected && !needsPageRefresh) connect();
      scheduleScan();
      tick();
    }
    scheduleLayout();
  });
  window.addEventListener("pagehide", () => {
    pageSuspended = true;
    post({ type: "CANCEL_ALL" });
    // disconnect() does not fire onDisconnect on this end. Detach locally
    // before BFCache freezes the document and reject any late messages.
    connectionLost();
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted && !pageSuspended) return;
    pageSuspended = false;
    themeDirty = true;
    if (!document.hidden && !needsPageRefresh) connect();
    scheduleScan();
    scheduleLayout();
    tick();
  });

  function invalidContext(error?: unknown) {
    try {
      return (
        needsPageRefresh ||
        !chrome.runtime.id ||
        /extension context invalidated/i.test(
          String((error as ErrorShape | undefined)?.message || ""),
        )
      );
    } catch {
      return true;
    }
  }
  function scheduleReconnect() {
    if (pageSuspended || needsPageRefresh || reconnectTimer) return;
    const delay = Math.min(30000, 3000 * 2 ** Math.min(reconnectFailures++, 4));
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      if (!document.hidden) connect();
    }, delay);
  }
  function connectionLost(error?: unknown, sourcePort = port) {
    if (sourcePort && sourcePort !== port) return;
    nativePanel.disconnect();
    for (const entry of allEntries())
      forgetCacheLookup(entry, Boolean(entry.cacheLookupId));
    needsPageRefresh = invalidContext(error);
    // Chrome may suspend an idle MV3 worker. A closed idle port is not an API
    // failure and must not overwrite completed reading or restart paid work.
    const idle =
      hasConfig &&
      !awaitingConfig &&
      !needsPageRefresh &&
      !error &&
      !requests.size &&
      !draftComposer?.activeCount &&
      !wakeActions.size &&
      !wakeControls.size;
    connected = false;
    awaitingConfig = false;
    workerSleeping = idle;
    resetDwellWaits();
    clearTimeout(handshakeTimer);
    handshakeTimer = undefined;
    if (!idle) providerReady = false;
    const interruptionKey = needsPageRefresh
      ? "status.refreshRequired"
      : pageSuspended
        ? "status.cancelled"
        : "status.connectionLost";
    draftComposer?.connectionLost(interruptionKey);
    const previousPort = port;
    port = undefined;
    try {
      previousPort?.disconnect();
    } catch {
      /* The old context may already be gone. */
    }
    for (const entry of allEntries()) {
      clearRetries(entry);
      const interrupted =
        ["queued", "running", "retry-wait"].includes(entry.status) ||
        wakeActions.has(wakeKey(entry, "analysis"));
      if (interrupted) {
        entry.status = "error";
        entry.ui.retry.hidden = false;
        status(entry, interruptionKey);
      }
      if (
        ["queued", "running", "retry-wait"].includes(entry.commentStatus) ||
        wakeActions.has(wakeKey(entry, "comments"))
      ) {
        entry.commentStatus = "error";
        entry.commentError = interruptionKey;
      }
      if (needsPageRefresh) {
        if (entry.status === "done" && !entry.connectionStatus)
          entry.connectionStatus = {
            key: entry.statusKey,
            vars: entry.statusVars,
          };
        status(entry, "status.refreshRequired");
      }
      refreshCard(entry);
      refreshComments(entry);
    }
    wakeActions.clear();
    wakeControls.clear();
    requests.clear();
    queue.clear();
    refreshHeaderLanguage();
    configureDraft();
    scheduleLayout();
    if (needsPageRefresh) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    } else if (!idle) scheduleReconnect();
  }
  function post<T extends { type: string }>(message: T) {
    if (pageSuspended && message.type !== "CANCEL_ALL") return false;
    if (!connected) {
      if (invalidContext()) connectionLost();
      else if (!workerSleeping) scheduleReconnect();
      return false;
    }
    try {
      port!.postMessage(message);
      return true;
    } catch (error) {
      connectionLost(error);
      return false;
    }
  }
  function postControl<T extends { type: string }>(message: T) {
    if (pageSuspended || needsPageRefresh) return false;
    if (workerSleeping || awaitingConfig) {
      // These are user preferences, not API tasks. Retain the latest value
      // while waking; dispatch it before new analysis uses the old preference.
      wakeControls.set(message.type, message);
      if (!connected) connect();
      return true;
    }
    return post(message);
  }
  function wakeKey(entry: Entry, task: string) {
    return entry.post.id + ":" + task;
  }
  function afterWake(entry: Entry, task: string, action: () => void) {
    if (!workerSleeping && !awaitingConfig) return false;
    if (
      !(providerReady || (task === "analysis" && answerCacheReady)) ||
      needsPageRefresh
    )
      return false;
    const key = wakeKey(entry, task),
      identity = Core.apiPostIdentity(
        entry.post,
        task === "comments" ? undefined : settings,
      ),
      path = location.pathname,
      oauthIdentity = settings.provider === "oauth" ? credentialIdentity : null;
    if (!wakeActions.has(key))
      wakeActions.set(key, () => {
        if (
          entries.get(entry.article) !== entry ||
          path !== location.pathname ||
          Core.apiPostIdentity(
            entry.post,
            task === "comments" ? undefined : settings,
          ) !== identity ||
          (oauthIdentity !== null && oauthIdentity !== credentialIdentity) ||
          !entry.article.isConnected ||
          !eligibility(entry.article).eligible ||
          document.hidden ||
          collapsed
        )
          return;
        action();
      });
    refreshCard(entry);
    if (!connected) connect();
    return true;
  }
  function usableConnection() {
    return (
      !pageSuspended &&
      !needsPageRefresh &&
      providerReady &&
      (connected || workerSleeping || awaitingConfig)
    );
  }
  function configureDraft() {
    draftComposer?.configure({
      settings,
      ready: providerReady,
      connected,
      hasConfig,
      awaitingConfig,
      refreshRequired: needsPageRefresh,
      taskRevision,
      restoring:
        settings.provider === "oauth" &&
        ["restoring", "refreshing"].includes(oauthState.state!) &&
        !providerReady,
      needsProvider: needsProvider(),
      identity: JSON.stringify([
        settings.provider,
        credentialIdentity,
        Core.providerModel(settings),
        Core.providerEffort(settings),
        settings.buildTransport,
        settings.buildPort,
        settings.webSearch,
        settings.xSearch,
        settings.explanationMode,
      ]),
    });
  }
  let buildErrorCode = "",
    nativeErrorCode = "";
  function needsProvider() {
    if (settings.provider === "x-native")
      return errorKey(nativeErrorCode || "X_NATIVE_UNAVAILABLE");
    if (settings.provider === "oauth") {
      if (oauthState.connected && oauthState.modelAvailable === false)
        return "oauth.modelUnavailable";
      if (oauthState.state === "restoring" || oauthState.state === "refreshing")
        return "oauth.refreshing";
      if (
        ["starting", "authorizing", "awaiting_authorization"].includes(
          oauthState.state!,
        )
      )
        return "oauth.authorizing";
      if (oauthState.state === "reauth_required") return "oauth.reauthRequired";
      return oauthState.errorCode
        ? errorKey(oauthState.errorCode)
        : "oauth.needsLogin";
    }
    return settings.provider === "build"
      ? buildErrorCode.startsWith("BUILD_")
        ? errorKey(buildErrorCode)
        : "build.unknown"
      : "status.needsKey";
  }
  async function openSettings() {
    const message = {
      type: "OPEN_SETTINGS",
      focus:
        settings.provider === "x-native"
          ? "native"
          : settings.provider === "oauth"
            ? "oauth"
            : settings.provider === "build"
              ? "build"
              : "api-key",
    };
    // Settings can add or replace a Key. Restore the feed subscription so its
    // updated CONFIG can reach a tab that previously had no usable credential.
    if (workerSleeping) connect();
    try {
      const result = await chrome.runtime.sendMessage(message);
      if (result?.ok) return;
    } catch (error) {
      if (invalidContext(error)) {
        connectionLost(error);
        return;
      }
    }
    // Older workers only accept this action over their feed port.
    if (!post(message)) connectionLost();
  }
  async function openHistory() {
    try {
      const result = await chrome.runtime.sendMessage({ type: "OPEN_HISTORY" });
      if (result?.ok) return;
    } catch (error) {
      if (invalidContext(error)) {
        connectionLost(error);
        return;
      }
    }
    if (workerSleeping) connect();
    postControl({ type: "OPEN_HISTORY" });
  }
  function refreshHeaderLanguage() {
    railToggle.textContent = t(
      settings.enabled ? "common.pause" : "common.resume",
    );
    railToggle.disabled = !hasConfig || awaitingConfig;
    const direction = uiLanguage === "ar" ? "rtl" : "ltr";
    rail.setAttribute("lang", uiLanguage);
    rail.setAttribute("dir", direction);
    railHeader.setAttribute("lang", uiLanguage);
    railHeader.setAttribute("dir", direction);
    rail.setAttribute("aria-label", t("aria.rail"));
    railResize.setAttribute("aria-label", t("rail.resize"));
    railResize.title = t("rail.resizeHint");
    railOptions.setAttribute("aria-label", t("common.settings"));
    railOptions.title = t(
      needsPageRefresh
        ? "status.refreshRequired"
        : !providerReady
          ? settings.provider === "oauth"
            ? "oauth.login"
            : settings.provider === "build"
              ? "popup.setupBuild"
              : "common.enterKey"
          : "common.settings",
    );
    railHistory.setAttribute("aria-label", t("common.history"));
    railHistory.title = t("common.history");
    railCollapse.setAttribute("aria-label", t("common.collapse"));
    railCollapse.title = t("tooltip.collapse");
    railExpand.setAttribute("aria-label", t("common.expand"));
    railExpand.title = t("tooltip.expand");
    railHeader.title =
      settings.provider === "x-native"
        ? t("native.label")
        : settings.provider === "oauth"
          ? t("oauth.modeLabel", { count: settings.apiConcurrency })
          : settings.provider === "build"
            ? t("popup.buildLabel", {
                transport: settings.buildTransport.toUpperCase(),
              })
            : t("tooltip.apiMode", { count: settings.apiConcurrency });
  }
  function syncUILanguage() {
    const observed = UI.normalizeLanguage(
      document.documentElement.getAttribute("lang") ||
        navigator.language ||
        "en",
    );
    if (observed !== xUILanguage) {
      xUILanguage = observed;
      post({ type: "UI_LANGUAGE", language: xUILanguage });
    }
    const language = UI.resolveLanguage(
      settings.interfaceLanguage,
      xUILanguage,
    );
    if (language === uiLanguage) return;
    uiLanguage = language;
    refreshHeaderLanguage();
    draftComposer?.refresh();
    for (const entry of allEntries()) {
      refreshCard(entry);
      refreshComments(entry);
    }
  }
  function renderStatusText(
    entry: Entry,
    key: string,
    vars: Record<string, unknown> = {},
  ) {
    const target = entry.ui.status;
    if (key.startsWith("oauth.") || key.startsWith("native.")) {
      const button = node("button", "status-settings", t("common.settings"));
      button.type = "button";
      button.addEventListener("click", () => openSettings());
      target.replaceChildren(
        document.createTextNode(
          t(key, { model: settings.oauthModel, ...vars }) + " ",
        ),
        button,
      );
      return;
    }
    if (key === "status.refreshRequired") {
      const marker = "\uFFFC",
        parts = t("status.refreshRequiredAction", { refresh: marker }).split(
          marker,
        ),
        button = node("button", "status-settings", t("common.refreshPage"));
      button.type = "button";
      button.addEventListener("click", () => location.reload());
      target.replaceChildren(
        document.createTextNode(parts[0]!),
        button,
        document.createTextNode(parts.slice(1).join(marker)),
      );
      return;
    }
    if (key.startsWith("build.")) {
      const button = node("button", "status-settings", t("popup.setupBuild"));
      button.type = "button";
      button.addEventListener("click", () => openSettings());
      target.replaceChildren(
        document.createTextNode(t(key, vars) + " "),
        button,
      );
      return;
    }
    if (key !== "status.needsKey") {
      target.replaceChildren(document.createTextNode(t(key, vars)));
      return;
    }
    // Keep the translated sentence intact while making its Settings word an
    // actual keyboard-accessible control. The marker never becomes page text.
    const marker = "\uFFFC",
      template = t("status.needsKeyAction", { settings: marker });
    const parts = template.split(marker),
      button = node("button", "status-settings", t("common.settings"));
    button.type = "button";
    button.title = t("common.enterKey");
    button.addEventListener("click", () => openSettings());
    target.replaceChildren(
      document.createTextNode(parts[0]!),
      button,
      document.createTextNode(parts.slice(1).join(marker)),
    );
  }
  function status(
    entry: Entry,
    key: string,
    vars: Record<string, unknown> = {},
  ) {
    entry.statusKey = key;
    entry.statusVars = vars;
    renderStatusText(entry, key, vars);
    syncLoading(entry);
    refreshVerificationFailure(entry);
  }
  function note(entry: Entry, key: string) {
    entry.noteKey = key;
    entry.ui.note.textContent = key ? t(key) : "";
  }
  const verificationFailureKeys: Record<string, string> = {
    OUTPUT_LIMIT: "verification.outputLimit",
    INCOMPLETE: "verification.incomplete",
    CONNECTION: "verification.connection",
    TIMEOUT: "verification.timeout",
    LANGUAGE_MISMATCH: "verification.languageMismatch",
    RATE_LIMIT: "verification.rateLimit",
    ACCESS: "verification.access",
    SERVER: "verification.server",
    UNKNOWN: "verification.unknown",
  };
  function partialResultNote(result: Result | undefined) {
    // Older cached responses may have retained an explanation after their
    // second stage failed. A current fact check is one response, with no
    // previous-answer narrative to show beneath its partial output.
    return result?.apiVerification === "only" ? "" : "note.preserved";
  }
  function readerResult(value: Result | undefined) {
    const result: Partial<Result> =
      value && typeof value === "object" ? value : {};
    const output = Core.readerOutput(result.text, { final: true });
    const invalid = output.kind !== "content";
    return {
      invalid,
      result: invalid
        ? {
            ...result,
            text: "",
            sources: [],
            verificationStart: undefined,
            verificationStatus: "incomplete",
            verificationFailure: isCapacityFailure(
              undefined,
              result.verificationFailure,
            )
              ? result.verificationFailure
              : { stage: "verify", code: "INCOMPLETE" },
          }
        : { ...result, text: output.text },
    };
  }
  function setVerificationFailure(
    entry: Entry,
    value: FailureDetails | undefined,
    incomplete: boolean,
  ) {
    const valid =
        value?.stage === "verify" &&
        typeof value.code === "string" &&
        Object.hasOwn(verificationFailureKeys, value.code),
      code = valid ? value.code : "UNKNOWN";
    const failure: FailureDetails = { stage: "verify", code };
    if (valid) {
      if (["max_output_tokens", "content_filter"].includes(value.reason!))
        failure.reason = value.reason;
      if (
        [
          "API_INCOMPLETE",
          "API_STREAM_INTERRUPTED",
          "API_STREAM_ERROR",
          "API_LANGUAGE_MISMATCH",
          "API_CAPACITY",
          "API_IMAGE_INPUT",
          "RATE_LIMIT",
          "API_ERROR",
          "CANCELED",
          "TIMEOUT",
        ].includes(value.errorCode!)
      )
        failure.errorCode = value.errorCode;
      if (
        Number.isSafeInteger(value.httpStatus) &&
        value.httpStatus! >= 100 &&
        value.httpStatus! <= 599
      )
        failure.httpStatus = value.httpStatus;
      const providerCode = Core.apiFailureProviderCode(value.providerCode);
      if (providerCode) failure.providerCode = providerCode;
    }
    entry.verificationFailure = incomplete ? failure : null;
    refreshVerificationFailure(entry);
  }
  function refreshVerificationFailure(entry: Entry) {
    const failure = entry.verificationFailure;
    const failureKey =
      failure?.errorCode === "API_IMAGE_INPUT"
        ? "error.apiImageInput"
        : isCapacityFailure(undefined, failure!)
          ? "error.apiCapacity"
          : verificationFailureKeys[failure?.code!];
    entry.ui.status.title = failure ? t(failureKey) : "";
    const requestDiagnostics = Core.sanitizedRequestDiagnostics(
        entry.requestDiagnostics,
      ),
      commentRequestDiagnostics = Core.sanitizedRequestDiagnostics(
        entry.commentRequestDiagnostics,
      );
    if (failure || requestDiagnostics || commentRequestDiagnostics) {
      // Structured provider traces pass the same bounded sanitizer used by
      // the worker. No request body, credentials or arbitrary fields enter UI.
      const diagnostic = {
        ...failure,
        ...(requestDiagnostics ? { requestDiagnostics } : {}),
        ...(commentRequestDiagnostics ? { commentRequestDiagnostics } : {}),
      };
      entry.ui.diagnosticText.textContent =
        (failure ? t(failureKey) + "\n" : "") +
        JSON.stringify(diagnostic, null, 2);
      entry.ui.diagnostics.hidden = false;
      entry.verificationDiagnostics = true;
    } else if (entry.verificationDiagnostics) {
      entry.ui.diagnosticText.textContent = "";
      entry.ui.diagnostics.hidden = true;
      entry.verificationDiagnostics = false;
    }
  }
  function syncLoading(entry: Entry) {
    const active = ["queued", "running"].includes(entry.status);
    const verifying =
      active &&
      ["verification_queued", "verify", "verification"].includes(entry.phase!);
    const loading = active && !entry.latestText && !verifying;
    entry.ui.status.classList.toggle("shimmer", loading || verifying);
    entry.ui.thinking.hidden = !loading;
    entry.ui.thinkingLabel.textContent = t("status.thinking");
    entry.ui.verificationThinking.hidden =
      !verifying || Boolean(entry.verificationStarted);
    entry.ui.verificationThinkingLabel.textContent = t("status.thinking");
    entry.ui.analysisDivider.hidden =
      !entry.answerSplit || !(verifying || entry.verificationRendered?.trim());
    entry.ui.box.setAttribute(
      "aria-busy",
      String(active || entry.status === "retry-wait"),
    );
  }
  function errorKey(code?: string, failure?: FailureDetails | null) {
    if (typeof code === "string" && code.startsWith("X_NATIVE_"))
      return code === "X_NATIVE_ADAPTER_CHANGED"
        ? "native.adapterChanged"
        : code === "X_NATIVE_UNSUPPORTED"
          ? "native.unsupported"
          : code === "X_NATIVE_LOGIN_REQUIRED"
            ? "native.login"
            : code === "X_NATIVE_PANEL_BUSY"
              ? "native.busy"
              : code === "X_NATIVE_CANCEL_UNCONFIRMED"
                ? "native.cleanup"
                : "native.failed";
    if (code === "MODEL_UNSUPPORTED") return "error.modelUnsupported";
    if (code === "MEDIA_INPUT_LIMIT") return "error.mediaLimit";
    if (code === "API_IMAGE_INPUT") return "error.apiImageInput";
    if (code === "BUILD_IMAGE_UNSUPPORTED") return "build.imageUnsupported";
    if (code === "BUILD_IMAGE_UNAVAILABLE") return "build.imageUnavailable";
    if (code === "BUILD_IMAGE_LIMIT") return "build.imageLimit";
    if (typeof code === "string" && code.startsWith("OAUTH_"))
      return (
        {
          OAUTH_LOGIN_REQUIRED: "oauth.needsLogin",
          OAUTH_REAUTH_REQUIRED: "oauth.reauthRequired",
          OAUTH_ACCOUNT_CHANGED: "oauth.reauthRequired",
          OAUTH_REFRESH_UNCERTAIN: "oauth.reauthRequired",
          OAUTH_ACCESS_DENIED: "oauth.denied",
          OAUTH_DEVICE_EXPIRED: "oauth.expired",
          OAUTH_CANCELLED: "oauth.canceled",
          OAUTH_MODEL_UNAVAILABLE: "oauth.modelUnavailable",
          OAUTH_STORAGE_ERROR: "oauth.storageError",
          OAUTH_CATALOG_UNAVAILABLE: "oauth.catalogUnavailable",
          OAUTH_AUTH_UNAVAILABLE: "oauth.networkError",
        }[code] || "oauth.unavailable"
      );
    if (isCapacityFailure(code, failure)) return "error.apiCapacity";
    if (code?.startsWith("BUILD_"))
      return (
        {
          BUILD_LOGIN_REQUIRED: "build.login",
          BUILD_CANCEL_UNCONFIRMED: "build.cancelUnconfirmed",
          BUILD_CONNECTION_REQUIRED: "build.codeRequired",
          BUILD_AUTH_FAILED: "build.codeInvalid",
          BUILD_UNAVAILABLE: "build.missing",
          BUILD_DISCONNECTED: "build.missing",
          BUILD_NATIVE_MISSING: "build.missing",
          BUILD_VERSION_UNSUPPORTED: "build.unsupported",
          BUILD_MODEL_UNSUPPORTED: "build.unsupported",
          BUILD_EFFORT_UNSUPPORTED: "build.unsupported",
        }[code] || "build.unavailable"
      );
    const http = failure?.httpStatus,
      provider = Core.apiFailureProviderCode(failure?.providerCode);
    if (code === "API_ERROR") {
      if (
        http === 401 ||
        ["invalid_api_key", "authentication_error", "unauthenticated"].includes(
          provider!,
        )
      )
        return settings.provider === "oauth"
          ? "oauth.reauthRequired"
          : "error.apiKeyRejected";
      if (
        http === 402 ||
        [
          "insufficient_quota",
          "insufficient_credits",
          "spending_limit",
          "usage_limit_exceeded",
        ].includes(provider!)
      )
        return settings.provider === "oauth"
          ? "oauth.usageError"
          : "error.apiUsage";
      if (
        http === 403 ||
        ["permission_error", "permission_denied", "forbidden"].includes(
          provider!,
        )
      )
        return settings.provider === "oauth"
          ? "oauth.permissionError"
          : "error.apiAccess";
      if (http === 429 || failure?.code === "RATE_LIMIT")
        return "status.rateLimited";
      if (failure?.code === "CONNECTION") return "error.apiConnection";
      if (http! >= 500 || failure?.code === "SERVER") return "error.apiServer";
      if ((http! >= 400 && http! < 500) || failure?.code === "ACCESS")
        return "error.apiRequest";
      return "error.apiFailed";
    }
    if (["API_STREAM_INTERRUPTED", "API_STREAM_ERROR"].includes(code!))
      return "error.apiConnection";
    if (code === "TIMEOUT") return "error.apiTimeout";
    if (code === "API_INCOMPLETE")
      return failure?.code === "OUTPUT_LIMIT"
        ? "error.apiOutputLimit"
        : "error.apiIncomplete";
    return (
      (
        {
          RATE_LIMIT: "status.rateLimited",
          NEEDS_KEY: "status.needsKey",
          KEY_MIGRATION_REQUIRED: "status.needsKey",
          CANCELLED: "status.cancelled",
          RAIL_COLLAPSED: "status.disabled",
          URL_SEARCH_REQUIRED: "error.urlSearchRequired",
          API_LANGUAGE_MISMATCH: "error.outputLanguageMismatch",
        } as Record<string, string>
      )[code!] || "status.failed"
    );
  }
  let nativeAccountIdentity: string | null = null;
  function currentNativeAccount() {
    const href =
      document.querySelector<HTMLAnchorElement>(
        'a[data-testid="AppTabBar_Profile_Link"]',
      )?.href || "";
    const account = Core.normalizeNativeAccount(href);
    return account ? "https://x.com/" + account : "";
  }
  function syncNativeAccount() {
    if (settings.provider !== "x-native") {
      nativeAccountIdentity = null;
      return;
    }
    const account = currentNativeAccount();
    if (account === nativeAccountIdentity) return;
    const changed = nativeAccountIdentity !== null;
    nativeAccountIdentity = account;
    if (connected)
      post({ type: "NATIVE_ACCOUNT_CHANGED", nativeAccount: account });
    if (!changed) return;
    if (connected) post({ type: "CANCEL_ALL" });
    queue.clear();
    requests.clear();
    wakeActions.clear();
    for (const entry of allEntries()) {
      forgetCacheLookup(entry, true);
      clearRetries(entry);
      entry.status = "new";
      entry.pending = false;
      entry.since = 0;
      entry.result = null;
      entry.cached = false;
      entry.analysisUsage = null;
      entry.requestDiagnostics = undefined;
      setVerificationFailure(entry, null!, false);
      renderAnswer(entry, "", true);
      renderSources(entry, []);
      note(entry, "");
      entry.ui.retry.hidden = true;
      entry.commentStatus = "idle";
      entry.comments = [];
      entry.commentUsage = null;
      refreshComments(entry);
    }
  }
  function requestSnapshot(
    entry: Entry,
    requestId: string,
    task: string = "analysis",
  ): RequestSnapshot {
    return {
      requestId,
      task,
      entry,
      postSnapshot: entry.post,
      apiIdentity: Core.apiPostIdentity(
        entry.post,
        task === "comments" ? undefined : settings,
      ),
      path: location.pathname,
      provider: settings.provider,
      language: settings.language,
      apiModel:
        settings.provider === "oauth"
          ? settings.oauthModel
          : settings.provider === "build"
            ? settings.buildModel
            : settings.apiModel,
      verifyPrompt: settings.verifyPrompt,
      commentsPrompt: settings.commentsPrompt,
    };
  }
  function savedAnswerIdentity(entry: Entry) {
    return JSON.stringify([
      Core.apiPostIdentity(entry.post, settings),
      settings.provider,
      nativeAccountIdentity,
      credentialIdentity,
      taskRevision,
      Core.providerModel(settings),
      Core.providerEffort(settings),
      settings.language,
      settings.webSearch,
      settings.xSearch,
      Core.explanationMode(settings),
      settings.verifyPrompt,
    ]);
  }
  function forgetCacheLookup(entry: Entry, retry: boolean = false) {
    const lookup = cacheLookups.get(entry.cacheLookupId!);
    if (lookup) {
      lookup.entries.delete(entry);
      if (!lookup.entries.size) {
        clearTimeout(lookup.timer);
        cacheLookups.delete(lookup.requestId);
      }
    }
    entry.cacheLookupId = undefined;
    if (retry) {
      entry.cacheLookupKey = undefined;
      entry.cacheLookupDeferred = false;
    }
  }
  function restoreSavedAnswer(entry: Entry) {
    if (entry.status !== "new" || entry.post.isPromoted) return false;
    if (reuseAnalysis(entry)) return false;
    const key = savedAnswerIdentity(entry);
    if (entry.cacheLookupDeferred) return true;
    if (entry.cacheLookupKey === key) return Boolean(entry.cacheLookupId);
    if (!hasConfig || !connected || awaitingConfig) {
      if (workerSleeping && !needsPageRefresh) connect();
      return true;
    }
    forgetCacheLookup(entry);
    entry.cacheLookupKey = key;
    const pending = [...cacheLookups.values()].find(
      (value) => value.lookupKey === key && value.path === location.pathname,
    );
    if (pending) {
      entry.cacheLookupId = pending.requestId;
      pending.entries.add(entry);
      return true;
    }
    const requestId = crypto.randomUUID(),
      lookup: CacheLookup = {
        ...requestSnapshot(entry, requestId),
        lookupKey: key,
        entries: new Set([entry]),
      };
    entry.cacheLookupId = requestId;
    cacheLookups.set(requestId, lookup!);
    // A lost cache reply must never freeze automatic mode. Timeout is only a
    // miss; the enabled setting still decides whether new analysis may start.
    lookup.timer = setTimeout(() => {
      if (cacheLookups.get(requestId) !== lookup) return;
      cacheLookups.delete(requestId);
      for (const item of lookup.entries)
        if (item.cacheLookupId === requestId) {
          item.cacheLookupId = undefined;
          refreshCard(item);
        }
      tick();
    }, 5000);
    if (
      !post({
        type: "LOOKUP_CACHED_POST",
        requestId,
        post: entry.post,
        nativeAccount: currentNativeAccount(),
      })
    )
      forgetCacheLookup(entry, true);
    if (!automaticEntry(entry)) refreshCard(entry);
    return Boolean(entry.cacheLookupId);
  }
  function receiveSavedAnswer(message: FeedMessage) {
    const lookup = cacheLookups.get(message.requestId);
    if (!lookup) return;
    clearTimeout(lookup.timer);
    cacheLookups.delete(message.requestId);
    for (const entry of lookup.entries) {
      if (entry.cacheLookupId !== message.requestId) continue;
      entry.cacheLookupId = undefined;
      const current =
        entry.status === "new" &&
        entries.get(entry.article) === entry &&
        entry.article.isConnected &&
        lookup.path === location.pathname &&
        savedAnswerIdentity(entry) === lookup.lookupKey;
      if (!current) continue;
      if (reuseAnalysis(entry, true)) continue;
      if (message.type === "CACHE_MISS") {
        entry.cacheLookupDeferred = message.deferred === true;
        refreshCard(entry);
        continue;
      }
      if (
        document.hidden ||
        collapsed ||
        syncXModalVisibility() ||
        !eligibility(entry.article).eligible
      ) {
        entry.cacheLookupKey = undefined;
        continue;
      }
      entry.analysisKey = analysisIdentity(entry);
      entry.analysisVersion = (entry.analysisVersion || 0) + 1;
      applyAnalysisResult(entry, { ...lookup, entry }!, message);
      refreshCard(entry);
    }
    syncSharedAnalyses();
    scheduleLayout();
    tick();
  }
  function isAccountLimit(failure?: FailureDetails | null) {
    return (
      settings.provider === "api" &&
      (failure?.httpStatus === 402 ||
        [
          "spending_limit",
          "insufficient_credits",
          "insufficient_quota",
          "usage_limit_exceeded",
        ].includes(Core.apiFailureProviderCode(failure?.providerCode)!))
    );
  }
  function isCapacityFailure(code?: string, failure?: FailureDetails | null) {
    return code === "API_CAPACITY" || failure?.errorCode === "API_CAPACITY";
  }
  function retryPhase(
    entry: Entry,
    task: string,
    phase: string,
    message: Partial<FeedMessage> = {},
  ) {
    const key = task === "comments" ? "commentRetry" : "analysisRetry";
    const attempt = message.retryAttempt ?? message.retryAttempts;
    const max = Core.AUTO_RETRY_LIMIT;
    entry[key] =
      Number.isInteger(attempt) &&
      attempt! > 0 &&
      attempt! <= max &&
      (phase !== "exhausted" || attempt === max) &&
      !["CANCELLED", "CANCELED"].includes(message.code!)
        ? { phase, attempt, max }
        : null;
    refreshRetries(entry);
  }
  function clearRetries(entry: Entry) {
    entry.analysisRetry = null;
    entry.commentRetry = null;
    entry.keepRetryAnswer = false;
    refreshRetries(entry);
  }
  function refreshRetries(entry: Entry) {
    if (!entry.ui) return;
    for (const [state, label] of [
      [entry.analysisRetry, entry.ui.retryStatus],
      [entry.commentRetry, entry.ui.commentRetryStatus],
    ] as const) {
      label.hidden = !state;
      if (state)
        label.textContent =
          (state.phase === "queued" ? t("status.queued") + " · " : "") +
          t(
            state.phase === "waiting"
              ? "retry.waiting"
              : state.phase === "exhausted"
                ? "retry.exhausted"
                : "retry.running",
            {
              seconds: Core.AUTO_RETRY_DELAY_MS / 1000,
              attempt: state.attempt,
              max: state.max,
            },
          );
      else label.textContent = "";
    }
  }
  function setCollapsed(value: boolean, persist: boolean = false) {
    collapsed = Boolean(value);
    if (collapsed) {
      cancelDwellTimer();
      queue.clear();
      for (const entry of allEntries()) {
        entry.pending = false;
        entry.since = 0;
      }
      for (const [id, request] of requests)
        if (
          request.task === "comments"
            ? ["queued", "retry-wait"].includes(request.entry.commentStatus)
            : ["queued", "retry-wait"].includes(request.entry.status)
        ) {
          if (explicitRequest(request)) continue;
          if (request.originatedPrefetch) {
            if (!request.railCancellation) {
              request.railCancellation = true;
              post({
                type: "CANCEL_IF_QUEUED",
                requestId: id,
                preserveStarted: true,
              });
            }
            continue;
          }
          post({ type: "CANCEL", requestId: id });
          requests.delete(id);
          if (request.task === "comments") {
            request.entry.commentRetry = null;
            request.entry.commentStatus = "error";
            request.entry.commentError = "status.disabled";
            refreshComments(request.entry);
          } else {
            request.entry.analysisRetry = null;
            request.entry.status = "new";
            refreshCard(request.entry);
          }
        }
    }
    if (persist) postControl({ type: "SET_RAIL_COLLAPSED", collapsed });
    scheduleLayout();
    if (!collapsed) tick();
  }
  function connect() {
    if (pageSuspended || needsPageRefresh || connected) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    try {
      const nextPort = chrome.runtime.connect({ name: "GROKFIRST_FEED" });
      port = nextPort;
      connected = true;
      workerSleeping = false;
      awaitingConfig = true;
      configureDraft();
      nextPort.onMessage.addListener((message) => {
        if (port === nextPort) handleMessage(message);
      });
      nextPort.onDisconnect.addListener(() => {
        // Chrome exposes expected lifecycle disconnects through lastError.
        // Read it synchronously even for a stale port to avoid Unchecked logs.
        void chrome.runtime.lastError;
        if (port === nextPort) connectionLost(undefined, nextPort);
      });
      handshakeTimer = setTimeout(() => {
        if (port === nextPort && awaitingConfig)
          connectionLost(
            new Error("Background configuration timed out"),
            nextPort,
          );
      }, 8000);
      post({ type: "UI_LANGUAGE", language: xUILanguage });
    } catch (error) {
      connectionLost(error);
    }
  }
  function handleMessage(message: FeedMessage) {
    if (message.type !== "CONFIG") syncNativeAccount();
    if (message.type === "NATIVE_RUN") {
      if (
        typeof message.nativeAccount === "string" &&
        message.nativeAccount !==
          Core.normalizeNativeAccount(currentNativeAccount())
      ) {
        post({
          type: "NATIVE_EVENT",
          nonce: message.nonce,
          kind: "ERROR",
          code: "X_NATIVE_INTERRUPTED",
        });
        post({ type: "NATIVE_EVENT", nonce: message.nonce, kind: "CLOSED" });
        return;
      }
      nativePanel.run(message);
      return;
    }
    if (message.type === "NATIVE_CANCEL") {
      nativePanel.cancel(message.nonce);
      return;
    }
    if (message.type === "NATIVE_PING") return;
    if (message.type === "HISTORY_CONFIG") {
      configureHistory(message.enabled, message.epoch);
      return;
    }
    if (message.type === "HISTORY_ACK") {
      const batch = historyPending.get(message.batchId);
      if (!batch) return;
      historyPending.delete(message.batchId);
      if (batch.epoch !== historyEpoch || message.epoch !== historyEpoch)
        return;
      if (message.ok !== true) {
        for (const id of batch.ids) historySeen.delete(id);
        historyRetryAt = Date.now() + 5000;
      }
      return;
    }
    if (message.type === "RAIL_WIDTH") {
      if (!resizeDrag) {
        customRailWidth = message.width;
        scheduleLayout();
      }
      return;
    }
    if (message.type === "RAIL_VISIBILITY") {
      setCollapsed(message.collapsed);
      return;
    }
    if (message.type === "CONFIG") {
      hasConfig = true;
      awaitingConfig = true;
      workerSleeping = false;
      reconnectFailures = 0;
      clearTimeout(handshakeTimer);
      handshakeTimer = undefined;
      const nextSettings = Core.normalizeSettings(message.settings),
        previousOptions = { ...settings },
        nextOptions: Partial<Settings> = { ...nextSettings };
      // Editing prompts affects new requests. Interface language only relabels
      // controls; accepted jobs and visible answers retain their task snapshot.
      // An archived explanation draft can survive upgrades, but never changes
      // current fact-check jobs or their visible results.
      for (const field of [
        "explainPrompt",
        "verifyPrompt",
        "draftPrompt",
        "postDraftPrompt",
        "replyDraftPrompt",
        "commentsPrompt",
        "interfaceLanguage",
        "dwellMs",
        "analysisDefaultsVersion",
        "oauthRemember",
        "enabled",
        "answerCacheLimitMB",
        "prefetchCount",
        "prefetchAll",
      ] as const) {
        delete previousOptions[field];
        delete nextOptions[field];
      }
      // A waking worker can report OAuth restoration before decrypting the
      // saved identity. Unknown is not a new account: keep retained results
      // terminal until an authoritative identity arrives, with calls blocked.
      const pendingOAuthConnection =
        nextSettings.provider === "oauth" &&
        settings.provider === "oauth" &&
        ["restoring", "refreshing"].includes(message.oauthStatus?.state!) &&
        !message.oauthStatus?.errorCode &&
        (!message.credentialIdentity ||
          message.credentialIdentity === credentialIdentity);
      const pendingOAuthIdentity =
        pendingOAuthConnection && !message.credentialIdentity;
      const nextCredentialIdentity = pendingOAuthIdentity
        ? credentialIdentity
        : message.credentialIdentity || "";
      const accountChanged = credentialIdentity !== nextCredentialIdentity;
      const allChanged =
        accountChanged ||
        JSON.stringify(previousOptions) !== JSON.stringify(nextOptions);
      const presentationOrPromptsOnlyChanged =
        !allChanged &&
        JSON.stringify(settings) !== JSON.stringify(nextSettings);
      const identity = (value: Settings) =>
        JSON.stringify([
          value.provider,
          value.apiModel,
          value.apiReasoningEffort,
          value.oauthModel,
          value.oauthReasoningEffort,
          value.buildModel,
          value.buildReasoningEffort,
          value.buildTransport,
          value.buildPort,
          value.language,
          value.webSearch,
          value.xSearch,
          value.apiVerification,
          value.explanationMode,
        ]);
      const previous = identity(settings),
        dwellChanged = settings.dwellMs !== nextSettings.dwellMs;
      const pausing = settings.enabled && !nextSettings.enabled;
      if (!resizeDrag && !wakeControls.has("SET_RAIL_WIDTH"))
        customRailWidth =
          Number.isSafeInteger(message.railWidth) && message.railWidth! >= 220
            ? message.railWidth!
            : 0;
      const wasReady = providerReady;
      // A same-generation native fault closes admission; accepted requests
      // retain their own terminal events. Changed identities/configurations
      // still cancel through the normal path below.
      const retainedNativeFault =
        nextSettings.provider === "x-native" &&
        settings.provider === "x-native" &&
        Boolean(message.nativeStatus?.errorCode) &&
        Number.isSafeInteger(message.taskRevision) &&
        taskRevision === message.taskRevision &&
        !allChanged;
      settings = nextSettings;
      credentialIdentity = nextCredentialIdentity;
      oauthState = message.oauthStatus || {};
      taskRevision = Number.isSafeInteger(message.taskRevision)
        ? message.taskRevision
        : undefined;
      for (const entry of allEntries())
        if (
          allChanged ||
          presentationOrPromptsOnlyChanged ||
          entry.cacheLookupDeferred
        )
          forgetCacheLookup(entry, true);
      if (dwellChanged) resetDwellWaits();
      if (pausing) {
        resetDwellWaits();
        for (const [requestId, request] of requests)
          if (
            request.task === "analysis" &&
            !request.started &&
            !explicitRequest(request) &&
            !request.railCancellation
          ) {
            request.railCancellation = true;
            post({
              type: "CANCEL_IF_QUEUED",
              requestId,
              preserveStarted: true,
            });
          }
      }
      configureHistory(message.historyEnabled, message.historyEpoch);
      providerReady = Boolean(message.ready) && !pendingOAuthIdentity;
      answerCacheReady =
        message.answerCacheReady === true && !pendingOAuthIdentity;
      used = message.used || 0;
      nativeErrorCode = message.nativeStatus?.errorCode || "";
      buildErrorCode =
        typeof message.buildStatus?.errorCode === "string"
          ? message.buildStatus.errorCode
          : "";
      syncUILanguage();
      for (const entry of allEntries())
        if (entry.connectionStatus) {
          if (entry.status === "done" && entry.connectionStatus.key)
            status(
              entry,
              entry.connectionStatus.key,
              entry.connectionStatus.vars,
            );
          delete entry.connectionStatus;
        }
      refreshHeaderLanguage();
      const changed = accountChanged || previous !== identity(settings);
      // Per-answer failures never freeze other posts, including legacy
      // worker pause flags restored from an older browser session.
      if (!presentationOrPromptsOnlyChanged) queue.clear();
      if (
        allChanged ||
        (wasReady &&
          !providerReady &&
          !pendingOAuthConnection &&
          !retainedNativeFault)
      ) {
        resetDwellWaits();
        // Security and task-configuration changes cancel every old task.
        // Repeated paused snapshots must not cancel explicit draft checks;
        // actual setting changes are tracked by the worker's taskRevision.
        if (changed || accountChanged || (wasReady && !providerReady))
          post({ type: "CANCEL_ALL" });
        else
          for (const requestId of requests.keys())
            post({ type: "CANCEL", requestId });
        requests.clear();
        for (const entry of allEntries()) {
          clearRetries(entry);
          if (
            changed ||
            ["queued", "running", "retry-wait"].includes(entry.status)
          ) {
            entry.status = "new";
            entry.pending = false;
            entry.since = 0;
            entry.result = null;
            entry.analysisUsage = null;
            entry.requestDiagnostics = undefined;
            setVerificationFailure(entry, null!, false);
            renderAnswer(entry, "", true);
            renderSources(entry, []);
            note(entry, "");
            entry.ui.retry.hidden = true;
          }
          if (
            changed ||
            ["queued", "running", "retry-wait"].includes(entry.commentStatus)
          ) {
            entry.commentStatus = "idle";
            entry.comments = [];
            entry.commentUsage = null;
            entry.commentRequestDiagnostics = undefined;
            refreshComments(entry);
          }
        }
      }
      if (typeof message.collapsed === "boolean")
        setCollapsed(message.collapsed);
      awaitingConfig = false;
      railToggle.disabled = false;
      for (const [type, control] of wakeControls) {
        wakeControls.delete(type);
        if (!post(control)) return;
      }
      for (const entry of allEntries()) {
        refreshCard(entry);
      }
      scheduleLayout();
      configureDraft();
      if (providerReady || answerCacheReady) {
        const actions = [...wakeActions.values()];
        wakeActions.clear();
        for (const action of actions) {
          if (!connected || awaitingConfig) break;
          action();
        }
      } else if (!pendingOAuthConnection) wakeActions.clear();
      for (const entry of allEntries()) refreshCard(entry);
      scheduleScan();
      return;
    }
    if (message.type === "FATAL") {
      providerReady = false;
      queue.clear();
      requests.clear();
      draftComposer?.connectionLost("status.failed");
      configureDraft();
      for (const entry of allEntries()) {
        clearRetries(entry);
        entry.status = "error";
        status(entry, "status.failed");
        entry.ui.retry.hidden = false;
        if (["queued", "running", "retry-wait"].includes(entry.commentStatus)) {
          entry.commentStatus = "error";
          entry.commentError = "status.failed";
          refreshComments(entry);
        }
        refreshCard(entry);
      }
      scheduleLayout();
      return;
    }
    if (draftComposer?.handleMessage(message)) {
      scheduleLayout();
      return;
    }
    if (
      message.type === "CACHE_MISS" ||
      (message.type === "RESULT" && message.cacheLookup === true)
    ) {
      receiveSavedAnswer(message);
      return;
    }
    const request = requests.get(message.requestId);
    if (!request) return;
    const { entry } = request;
    if (request.task === "analysis")
      entry.analysisVersion = (entry.analysisVersion || 0) + 1;
    const unchanged =
      Core.apiPostIdentity(
        entry.post,
        request.task === "comments" ? undefined : settings,
      ) === request.apiIdentity;
    if (
      !unchanged ||
      request.path !== lastPath ||
      (request.path !== location.pathname && !hasBlockingXModal())
    ) {
      finishRequest(message);
      return;
    }
    if (
      message.type === "ERROR" &&
      ["TRIGGER_DISABLED", "PAUSED"].includes(message.code!) &&
      !request.started &&
      !explicitRequest(request)
    ) {
      requests.delete(message.requestId);
      entry.status = "new";
      entry.pending = false;
      entry.since = 0;
      entry.analysisUsage = null;
      refreshCard(entry);
      syncSharedAnalyses();
      scheduleLayout();
      return;
    }
    if (
      request.railCancellation &&
      ["ERROR", "COMMENT_ERROR"].includes(message.type) &&
      message.code === "CANCELLED"
    ) {
      // The worker confirms that this job never started. A delayed START or
      // RESULT, on the other hand, still belongs to the paid request we retain.
      requests.delete(message.requestId);
      if (request.task === "comments") entry.commentRetry = null;
      else entry.analysisRetry = null;
      if (request.task === "comments") {
        entry.commentStatus = "error";
        entry.commentError = "status.cancelled";
        entry.commentUsage = null;
        refreshComments(entry);
      } else {
        entry.status = "new";
        entry.pending = false;
        entry.analysisUsage = null;
        refreshCard(entry);
      }
      syncSharedAnalyses();
      scheduleLayout();
      tick();
      return;
    }
    // Monotonic across retry waits and re-queuing: this logical task has begun,
    // even if a later QUEUED snapshot no longer looks like running work.
    if (
      [
        "START",
        "UPDATE",
        "RETRY_WAIT",
        "COMMENT_START",
        "COMMENT_RETRY_WAIT",
      ].includes(message.type)
    )
      request.started = true;
    if (request.task === "comments") {
      if (message.type === "COMMENT_QUEUED") {
        entry.commentStatus = "queued";
        retryPhase(entry, "comments", "queued", message);
      }
      if (message.type === "COMMENT_START") {
        request.railCancellation = false;
        entry.commentStatus = "running";
        retryPhase(entry, "comments", "running", message);
      }
      if (message.type === "COMMENT_RESULT") {
        entry.commentRetry = null;
        captureUsage(
          entry,
          "comments",
          message,
          request,
          Boolean(message.cached),
          true,
        );
        const values = message.comments;
        if (
          Array.isArray(values) &&
          values.length === 3 &&
          values.every(
            (text) =>
              typeof text === "string" &&
              text.trim() &&
              Array.from(text).length <= 280,
          ) &&
          new Set(values).size === 3
        ) {
          entry.comments = values;
          entry.commentStatus = "done";
        } else {
          entry.commentStatus = "error";
          entry.commentError = "status.failed";
        }
      }
      if (["COMMENT_ERROR", "COMMENT_RETRY_WAIT"].includes(message.type)) {
        captureUsage(entry, "comments", message, request, false);
        entry.commentStatus =
          message.type === "COMMENT_RETRY_WAIT" ? "retry-wait" : "error";
        entry.commentError = errorKey(
          message.code,
          message.verificationFailure,
        );
        entry.commentRequestDiagnostics = Core.sanitizedRequestDiagnostics(
          message.requestDiagnostics,
        );
        retryPhase(
          entry,
          "comments",
          message.type === "COMMENT_RETRY_WAIT" ? "waiting" : "exhausted",
          message,
        );
      }
      refreshComments(entry);
      refreshVerificationFailure(entry);
      if (
        message.type === "COMMENT_RESULT" &&
        entry.commentStatus === "done" &&
        entry.ui.box.scrollTo
      ) {
        const end = Math.max(
          entry.ui.comments.offsetTop + entry.ui.comments.offsetHeight,
          entry.ui.tokenUsage.offsetTop + entry.ui.tokenUsage.offsetHeight,
        );
        const top = Math.max(0, end - entry.ui.box.clientHeight + 16);
        entry.ui.box.scrollTo({
          top,
          behavior: globalThis.matchMedia?.("(prefers-reduced-motion:reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
      }
      finishRequest(message);
      scheduleLayout();
      if (message.type === "COMMENT_RESULT") tick();
      return;
    }
    if (message.type === "QUEUED") {
      entry.status = "queued";
      if (message.retryAttempt)
        retryPhase(entry, "analysis", "queued", message);
      else if (entry.analysisRetry) entry.analysisRetry.phase = "queued";
      status(entry, "status.queued");
    }
    if (message.type === "START") {
      request.railCancellation = false;
      request.scrollCancellation = false;
      entry.since = 0;
      entry.status = "running";
      used = Math.max(used, message.used || 0);
      status(entry, "status.verifying");
      retryPhase(entry, "analysis", "running", message);
    }
    if (message.type === "UPDATE") {
      request.railCancellation = false;
      request.scrollCancellation = false;
      entry.since = 0;
      captureUsage(entry, "analysis", message, request, false);
      entry.status = "running";
      // Progress without a text snapshot leaves accepted prose intact. An
      // explicit empty snapshot retracts obsolete text, including a tool-only
      // fragment that an older worker may have exposed before classification.
      const suppliedText = typeof message.text === "string";
      const readerText = suppliedText
        ? Core.readerOutput(message.text).text
        : undefined;
      const verifying = [
        "verification_queued",
        "verify",
        "verification",
      ].includes(message.phase!);
      if (
        verifying &&
        !["verification_queued", "verify", "verification"].includes(
          entry.phase!,
        )
      ) {
        entry.verificationBase = entry.latestText || "";
        entry.verificationStarted = false;
        entry.verificationStart = undefined;
      }
      if (message.phase === "verification_queued" && suppliedText)
        entry.verificationBase = readerText;
      if (validVerificationBoundary(readerText!, message.verificationStart)) {
        entry.verificationStart = message.verificationStart;
        entry.verificationBase = readerText!.slice(
          0,
          message.verificationStart! - 2,
        );
      }
      if (
        verifying &&
        message.phase !== "verification_queued" &&
        suppliedText
      ) {
        // API progress identifies the actual check text separately from the
        // preserved explanation.
        const checkText =
          typeof message.verificationText === "string"
            ? Core.readerOutput(message.verificationText).text
            : readerText!.startsWith(entry.verificationBase || "")
              ? readerText!.slice((entry.verificationBase || "").length)
              : readerText;
        entry.verificationStarted = Boolean(
          readerText!.trim() && checkText!.trim(),
        );
      }
      entry.phase = request.phase = message.phase;
      const phases: Record<string, string> = {
        starting: "status.verifying",
        explain: "status.explaining",
        verification_queued: "status.verificationQueued",
        verify: "status.verifying",
        inline: "status.inline",
      };
      status(entry, phases[message.phase!] || "status.verifying");
      if (suppliedText && !(entry.keepRetryAnswer && !readerText!.trim())) {
        renderAnswer(entry, readerText!);
        if (readerText!.trim()) entry.keepRetryAnswer = false;
      } else if (verifying && entry.latestText)
        renderAnswer(entry, entry.latestText);
      if (message.sources) renderSources(entry, message.sources);
      if (message.warning)
        note(
          entry,
          ["explain", "verification_queued"].includes(message.phase!)
            ? "note.checkIncomplete"
            : "note.possibleErrors",
        );
    }
    if (message.type === "RESULT") {
      applyAnalysisResult(entry, request, message);
      finishRequest(message);
    }
    if (["ERROR", "RETRY_WAIT"].includes(message.type)) {
      const retryWaiting = message.type === "RETRY_WAIT";
      const retained = message.partialResult
        ? readerResult(message.partialResult)
        : null;
      const partialResult = retained?.result;
      captureUsage(
        entry,
        "analysis",
        { ...partialResult, ...message },
        request,
        false,
      );
      const partialVerification =
        partialResult &&
        (["incomplete", "failed"].includes(partialResult.verificationStatus!) ||
          partialResult.verificationFailure);
      const failure =
        message.verificationFailure || partialResult?.verificationFailure;
      entry.requestDiagnostics = Core.sanitizedRequestDiagnostics(
        message.requestDiagnostics || partialResult?.requestDiagnostics,
      );
      setVerificationFailure(
        entry,
        failure,
        Boolean(failure || partialVerification),
      );
      entry.status = retryWaiting ? "retry-wait" : "error";
      entry.phase = "";
      entry.errorCode = message.code;
      status(
        entry,
        isCapacityFailure(message.code, entry.verificationFailure!)
          ? "error.apiCapacity"
          : partialVerification
            ? "status.incomplete"
            : errorKey(message.code, entry.verificationFailure!),
      );
      note(entry, "");
      entry.ui.retry.hidden = retryWaiting;
      if (
        ["API_LANGUAGE_MISMATCH", "BUILD_LANGUAGE_MISMATCH"].includes(
          message.code!,
        )
      ) {
        entry.cached = false;
        entry.result = null;
        renderAnswer(entry, "", true);
        renderSources(entry, []);
      }
      if (partialResult) {
        entry.verificationStart = partialResult.verificationStart;
        renderAnswer(entry, partialResult.text, true);
        renderSources(entry, partialResult.sources || []);
        note(entry, retained.invalid ? "" : partialResultNote(partialResult));
      }
      entry.keepRetryAnswer = retryWaiting && Boolean(entry.latestText?.trim());
      retryPhase(
        entry,
        "analysis",
        retryWaiting ? "waiting" : "exhausted",
        message,
      );
      if (
        !entry.verificationFailure &&
        !entry.requestDiagnostics &&
        !entry.commentRequestDiagnostics
      ) {
        entry.ui.diagnostics.hidden = !message.diagnostics && !message.error;
        entry.ui.diagnosticText.textContent = JSON.stringify(
          {
            code: message.code,
            error: message.error,
            ...message.diagnostics,
            ...(message.usage ? { usage: message.usage } : {}),
          },
          null,
          2,
        ).slice(0, 4000);
      }
      if (
        [
          "NEEDS_KEY",
          "KEY_MIGRATION_REQUIRED",
          "BUILD_CONNECTION_REQUIRED",
          "BUILD_CANCEL_UNCONFIRMED",
          "BUILD_NATIVE_MISSING",
          "BUILD_PERMISSION_REQUIRED",
          "BUILD_LOGIN_REQUIRED",
          "BUILD_VERSION_UNSUPPORTED",
          "BUILD_CONFIG_UNSUPPORTED",
          "BUILD_TOOL_POLICY",
        ].includes(message.code!)
      ) {
        providerReady = false;
        queue.clear();
        for (const pending of allEntries()) refreshCard(pending);
      }
      if (isAccountLimit(entry.verificationFailure!))
        note(entry, "note.accountLimit");
      finishRequest(message);
    }
    syncSharedAnalyses();
    refreshCard(entry);
    scheduleLayout();
    if (["RESULT", "ERROR"].includes(message.type)) tick();
  }
  // API launch spacing belongs to the shared background scheduler; this page
  // submits all visible work without waiting for earlier answers to finish.
  function applyAnalysisResult(
    entry: Entry,
    request: RequestSnapshot,
    message: FeedMessage,
  ) {
    entry.analysisRetry = null;
    entry.keepRetryAnswer = false;
    const { result, invalid } = readerResult(message.result);
    captureUsage(
      entry,
      "analysis",
      result,
      request,
      Boolean(message.cached),
      true,
    );
    entry.status = invalid ? "error" : "done";
    entry.result = result;
    entry.verificationStart = result.verificationStart;
    if (invalid) entry.errorCode = "API_INCOMPLETE";
    renderAnswer(entry, result.text, true);
    renderSources(entry, result.sources || []);
    const incomplete = ["incomplete", "failed"].includes(
      result.verificationStatus!,
    );
    if (incomplete) retryPhase(entry, "analysis", "exhausted", message);
    entry.requestDiagnostics = Core.sanitizedRequestDiagnostics(
      result.requestDiagnostics || message.requestDiagnostics,
    );
    setVerificationFailure(entry, result.verificationFailure, incomplete);
    const sourceKey = isCapacityFailure(undefined, entry.verificationFailure!)
      ? "error.apiCapacity"
      : incomplete
        ? "status.incomplete"
        : result.searched
          ? "status.searched"
          : "status.unverified";
    entry.cached = !invalid && Boolean(message.cached);
    status(entry, sourceKey);
    note(
      entry,
      invalid
        ? ""
        : incomplete
          ? partialResultNote(result)
          : "note.possibleErrors",
    );
    entry.ui.retry.hidden = false;
    if (isAccountLimit(entry.verificationFailure!))
      note(entry, "note.accountLimit");
  }
  function finishRequest(message: FeedMessage) {
    if (
      !["RESULT", "ERROR", "COMMENT_RESULT", "COMMENT_ERROR"].includes(
        message.type,
      )
    )
      return;
    requests.delete(message.requestId);
    pruneDetachedEntries();
  }
  function affectsDisplayedPostBody(target: HTMLElement) {
    // X can keep both bodies mounted and switch visibility through their own
    // or ancestor attributes. Media and metric styling do not change the body.
    const ownBody = (body: Element) => {
      const article = body?.closest?.('article[data-testid="tweet"]');
      if (!article) return false;
      for (
        let cursor = body.parentElement;
        cursor && cursor !== article;
        cursor = cursor.parentElement
      ) {
        const testId = cursor.getAttribute?.("data-testid") || "",
          tag = String(cursor.tagName || "").toLowerCase();
        if (
          tag === "article" ||
          /^(?:quoteTweet|quotedTweet|quoted-post|card\.wrapper)$/i.test(
            testId,
          ) ||
          (tag !== "a" && cursor.getAttribute?.("role") === "link")
        )
          return false;
      }
      return true;
    };
    const containingBody = target?.closest?.('[data-testid="tweetText"]');
    if (containingBody && ownBody(containingBody)) return true;
    return Array.from(
      target?.querySelectorAll?.('[data-testid="tweetText"]') || [],
    ).some(ownBody);
  }
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 0);
  }
  function supportedPage() {
    return !/^\/(?:messages|i\/(?:chat|grok|flow|premium|settings))\b/.test(
      location.pathname,
    );
  }
  function hasBlockingXModal() {
    // X can change its SPA route before its portal mounts, or retain the old
    // dialog while navigating back. Either signal keeps the feed rail out.
    if (
      /^\/(?:i\/)?compose\/(?:post|tweet)(?:\/|$)/i.test(location.pathname) ||
      /\/status\/\d+\/(?:photo|video)\/\d+(?:\/|$)/i.test(location.pathname)
    )
      return true;
    const fullscreen =
      document.fullscreenElement || document.webkitFullscreenElement;
    if (fullscreen && fullscreen !== overlay && !overlay.contains(fullscreen))
      return true;
    const rendered = (element: Element) => {
      if (
        !element.isConnected ||
        element === overlay ||
        overlay.contains(element)
      )
        return false;
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        const local =
          node !== document.body && node !== document.documentElement;
        if (
          (node as HTMLElement).hidden ||
          (local &&
            (node.getAttribute("aria-hidden") === "true" ||
              node.hasAttribute("inert")))
        )
          return false;
        const style = getComputedStyle(node);
        if (
          style.display === "none" ||
          ["hidden", "collapse"].includes(style.visibility) ||
          style.contentVisibility === "hidden" ||
          Number.parseFloat(style.opacity) === 0
        )
          return false;
      }
      const rect = element.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < innerWidth &&
        rect.top < innerHeight
      )
        return true;
      // Semantic portal wrappers may use display:contents and own no box.
      return (
        getComputedStyle(element).display === "contents" &&
        Array.from(element.children).some(rendered)
      );
    };
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open], [data-testid="sheetDialog"], [data-testid="swipe-to-dismiss"]',
      ),
    ).some(rendered);
  }
  function syncXModalVisibility() {
    const blocked = hasBlockingXModal();
    if (blocked !== xModalBlocked) {
      xModalBlocked = blocked;
      // Hide the host immediately, before the next layout frame, so none of
      // its pointer-enabled children can cover a newly opened X dialog.
      if (blocked) {
        overlay.hidden = true;
        pauseUnseenRailQueue();
      }
      scheduleLayout();
    }
    return blocked;
  }
  function scheduleLayout() {
    if (layoutFrame !== null) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = null;
      positionCards();
    });
  }
  function opaqueColor(value: unknown) {
    if (typeof value !== "string") return null;
    const parts = value
      .match(/^rgba?\(([^)]+)\)$/i)?.[1]
      ?.replace(/\//g, " ")
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
    return parts &&
      parts.length >= 3 &&
      parts.every(Number.isFinite) &&
      (parts.length < 4 || parts[3]! >= 0.99)
      ? { value, rgb: parts.slice(0, 3) }
      : null;
  }
  function syncTheme(primary: HTMLElement | null) {
    if (!themeDirty && themePrimary === primary) return;
    themeDirty = false;
    themePrimary = primary;
    const computed = (
      element: Element | null | undefined,
    ): Partial<CSSStyleDeclaration> =>
      element ? getComputedStyle(element) : {};
    let bg;
    for (let element = primary; element && !bg; element = element.parentElement)
      bg = opaqueColor(computed(element).backgroundColor);
    bg ||=
      opaqueColor(computed(document.body).backgroundColor) ||
      opaqueColor(computed(document.documentElement).backgroundColor);
    const light = bg
      ? bg.rgb[0]! * 0.2126 + bg.rgb[1]! * 0.7152 + bg.rgb[2]! * 0.0722 > 160
      : false;
    const dim = !light && bg && Math.max(...bg.rgb) > 12;
    const palette = light
      ? { bg: "#fff", fg: "#0f1419", muted: "#536471", border: "#eff3f4" }
      : dim
        ? { bg: "#15202b", fg: "#f7f9f9", muted: "#8b98a5", border: "#38444d" }
        : { bg: "#000", fg: "#e7e9ea", muted: "#71767b", border: "#2f3336" };
    const article = primary!.querySelector<HTMLElement>(
      'article[data-testid="tweet"]',
    );
    const text =
      article?.querySelector<HTMLElement>('[data-testid="tweetText"]') ||
      article ||
      primary;
    const type = computed(text),
      primaryStyle = computed(primary),
      postStyle = computed(article);
    const border =
      parseFloat(primaryStyle.borderRightWidth!) > 0
        ? opaqueColor(primaryStyle.borderRightColor)
        : parseFloat(postStyle.borderBottomWidth!) > 0
          ? opaqueColor(postStyle.borderBottomColor)
          : null;
    const values = {
      "--gf-bg": bg?.value || palette.bg,
      "--gf-fg": opaqueColor(type.color)?.value || palette.fg,
      "--gf-muted":
        opaqueColor(computed(article?.querySelector<HTMLElement>("time")).color)
          ?.value || palette.muted,
      "--gf-border": border?.value || palette.border,
      "--gf-accent": light ? "#0072b1" : "#1d9bf0",
      "--gf-font":
        type.fontFamily || 'system-ui,-apple-system,"Segoe UI",sans-serif',
      "--gf-size": type.fontSize || "15px",
      "--gf-leading":
        type.lineHeight && type.lineHeight !== "normal"
          ? type.lineHeight
          : "1.4",
      "--gf-scheme": light ? "light" : "dark",
    };
    const signature = JSON.stringify(values);
    if (signature === themeSignature) return;
    themeSignature = signature;
    for (const [name, value] of Object.entries(values))
      overlay.style.setProperty(name, value);
  }
  function rowGeometry(article: HTMLElement) {
    const cell = article.closest('[data-testid="cellInnerDiv"]');
    const own = cell
      ? Array.from(
          cell.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
        ).filter(
          (node) =>
            !node.parentElement?.closest('article[data-testid="tweet"]'),
        )
      : [];
    const frame = own.length === 1 && own[0] === article ? cell : article,
      rect = frame!.getBoundingClientRect();
    let borderWidth = 0,
      borderColor = "var(--gf-border,#2f3336)",
      borderTop = rect.bottom,
      borderDistance = Infinity;
    const sample = (node: Element) => {
      const box = node.getBoundingClientRect();
      // Full-width native row dividers only; quoted posts and media frames must
      // not create extra rail lines. Keep the border's own fractional position.
      if (box.width < rect.width - 2 || Math.abs(box.bottom - rect.bottom) > 2)
        return;
      const style = getComputedStyle(node),
        width = parseFloat(style.borderBottomWidth) || 0;
      if (
        width <= 0 ||
        style.borderBottomStyle === "none" ||
        style.borderBottomStyle === "hidden"
      )
        return;
      const distance = Math.abs(box.bottom - rect.bottom);
      if (distance > borderDistance) return;
      borderWidth = width;
      borderColor = opaqueColor(style.borderBottomColor)?.value || borderColor;
      borderTop = box.bottom - width;
      borderDistance = distance;
    };
    // Thread cells can contain several articles. Even when the content frame is
    // the article, its divider may belong to a parent within that shared cell.
    for (
      let node: HTMLElement | null = article;
      node;
      node = node.parentElement
    ) {
      sample(node);
      if (node === (cell || article)) break;
    }
    if (!borderWidth && cell) {
      // X may put a divider on a sibling wrapper. A bounded, shallow walk avoids
      // traversing media/quoted content on every scroll frame.
      let level: Element[] = [cell!],
        visited = 0;
      for (let depth = 0; depth < 4 && level.length && visited < 48; depth++) {
        const next: Element[] = [];
        for (const parent of level)
          for (const child of parent.children) {
            if (++visited > 48) break;
            if (child === article || child.tagName === "ARTICLE") continue;
            sample(child);
            next.push(child);
          }
        level = next;
      }
    }
    return { rect, borderWidth, borderColor, borderTop };
  }
  function nativeCellSeparators(
    cell: HTMLElement,
    primaryRect: DOMRect,
    viewport: { width: number; height: number; left?: number; top?: number },
  ) {
    const rect = cell.getBoundingClientRect(),
      lines: { top: number; width: number; color: string }[] = [];
    if (rect.height <= 0 || rect.bottom <= 0 || rect.top >= viewport.height)
      return lines;
    const sample = (element: Element) => {
      const box = element.getBoundingClientRect();
      // Only native lines spanning the unmodified center column qualify.
      if (
        box.width <= 0 ||
        Math.abs(box.left - primaryRect.left) > 2 ||
        Math.abs(box.right - primaryRect.right) > 2
      )
        return;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return;
      for (const edge of ["Top", "Bottom"] as const) {
        const width =
            parseFloat(
              style[
                ("border" + edge + "Width") as
                  "borderTopWidth" | "borderBottomWidth"
              ],
            ) || 0,
          color = opaqueColor(
            style[
              ("border" + edge + "Color") as
                "borderTopColor" | "borderBottomColor"
            ],
          );
        if (
          width > 0 &&
          color &&
          style[
            ("border" + edge + "Style") as
              "borderTopStyle" | "borderBottomStyle"
          ] !== "none" &&
          style[
            ("border" + edge + "Style") as
              "borderTopStyle" | "borderBottomStyle"
          ] !== "hidden"
        )
          lines.push({
            top: edge === "Top" ? box.top : box.bottom - width,
            width,
            color: color.value,
          });
      }
      // X also paints dividers as thin filled elements inside padded spacers.
      // Their own position, not the enclosing cell's bottom, is the boundary.
      const fill = opaqueColor(style.backgroundColor);
      if (
        box.height > 0 &&
        box.height <= 2 &&
        fill &&
        !(
          parseFloat(style.borderTopWidth) ||
          parseFloat(style.borderBottomWidth)
        )
      )
        lines.push({ top: box.top, width: box.height, color: fill.value });
    };
    let level: Element[] = [cell!],
      visited = 0;
    for (let depth = 0; depth < 5 && level.length && visited < 64; depth++) {
      const next: Element[] = [];
      for (const element of level) {
        if (++visited > 64) break;
        if (
          element !== cell &&
          (element.tagName === "ARTICLE" ||
            element.getAttribute("data-testid") === "cellInnerDiv")
        )
          continue;
        sample(element);
        next.push(...element.children);
      }
      level = next;
    }
    return lines;
  }
  function syncNativeCells(
    primary: HTMLElement | null,
    primaryRect: DOMRect | null | undefined,
  ) {
    const cells = new Set<HTMLElement>();
    if (primary && primaryRect)
      for (const cell of primary.querySelectorAll<HTMLElement>(
        '[data-testid="cellInnerDiv"]',
      )) {
        if (
          cell.closest('article[data-testid="tweet"]') ||
          cell.querySelector<HTMLElement>('article[data-testid="tweet"]') ||
          cell.parentElement?.closest('[data-testid="cellInnerDiv"]')
        )
          continue;
        const rect = cell.getBoundingClientRect();
        if (
          rect.width <= 0 ||
          Math.abs(rect.left - primaryRect.left) > 2 ||
          Math.abs(rect.right - primaryRect.right) > 2
        )
          continue;
        cells.add(cell);
        if (!observedNativeCells.has(cell)) resizeObserver?.observe(cell);
      }
    for (const cell of observedNativeCells)
      if (!cells.has(cell)) resizeObserver?.unobserve(cell);
    observedNativeCells.clear();
    for (const cell of cells) observedNativeCells.add(cell);
    return cells;
  }
  function positionSeparators(
    items: ReturnType<typeof rowGeometry>[],
    bounds: ReturnType<typeof currentRailBounds>,
    viewport: { width: number; height: number; left?: number; top?: number },
    headerHeight: number,
    extraLines: { top: number; width: number; color?: string }[] = [],
  ) {
    const ordered = items.slice().sort((a, b) => a.rect.top - b.rect.top),
      lines = [...extraLines];
    for (const item of ordered)
      if (item.borderWidth > 0)
        lines.push({
          top: item.borderTop,
          width: item.borderWidth,
          color: item.borderColor,
        });
    // Extend the timeline's first-post boundary across the otherwise empty
    // rail above its first answer, including at the initial feed position.
    const first = ordered[0];
    if (first) {
      const width = first.borderWidth || 1;
      lines.push({
        top: first.rect.top - width,
        width,
        color: first.borderColor,
      });
    }
    const visibleLines = Layout.placeRailSeparators(lines, viewport, {
      headerHeight,
    });
    const geometry = {
      left: bounds.left,
      top: headerHeight,
      width: bounds.width,
      height: Math.max(0, viewport.height - headerHeight),
    };
    for (const [name, value] of Object.entries(geometry))
      if (
        railSeparators.style[name as "left" | "top" | "width" | "height"] !==
        value + "px"
      )
        railSeparators.style[name as "left" | "top" | "width" | "height"] =
          value + "px";
    while (railSeparators.children.length > visibleLines.length)
      railSeparators.children[railSeparators.children.length - 1]!.remove();
    visibleLines.forEach((line, index) => {
      let rule = railSeparators.children[index];
      if (!rule) {
        rule = node("div", "rail-separator");
        railSeparators.append(rule);
      }
      const styles = {
        top: line.top - headerHeight + "px",
        height: line.width + "px",
        background: line.color,
      };
      for (const [name, value] of Object.entries(styles))
        if (
          (rule as HTMLElement).style[
            name as "top" | "height" | "background"
          ] !== value
        )
          (rule as HTMLElement).style[name as "top" | "height" | "background"] =
            value!;
    });
  }
  function syncNativeHeaders(targets: Iterable<HTMLElement> = []) {
    const next = new Set(targets);
    for (const node of observedNativeHeaders)
      if (!next.has(node)) resizeObserver?.unobserve(node);
    for (const node of next)
      if (!observedNativeHeaders.has(node))
        resizeObserver?.observe(node, { box: "border-box" });
    observedNativeHeaders.clear();
    for (const node of next) observedNativeHeaders.add(node);
  }
  function primaryHeaderTabs(primary: HTMLElement | null) {
    const firstContent = primary!.querySelector<HTMLElement>(
      '[data-testid="cellInnerDiv"], article[data-testid="tweet"], [data-testid="tweetTextarea_0"]',
    );
    const beforeContent = (tabs: HTMLElement) => {
      if (!firstContent) return true;
      // Compare DOM branches, not viewport coordinates: a real profile/feed
      // navigation still precedes its posts after those posts scroll above it.
      const ancestors = new Set();
      for (
        let node: HTMLElement | null | undefined = tabs;
        node;
        node = node.parentElement
      )
        ancestors.add(node);
      let common: HTMLElement | null = firstContent;
      while (common && !ancestors.has(common)) common = common.parentElement;
      if (!common || common === tabs || common === firstContent) return false;
      let tabBranch: HTMLElement | null = tabs,
        contentBranch: HTMLElement | null = firstContent;
      while (tabBranch!.parentElement !== common)
        tabBranch = tabBranch!.parentElement;
      while (contentBranch!.parentElement !== common)
        contentBranch = contentBranch!.parentElement;
      for (const child of common.children) {
        if (child === tabBranch) return true;
        if (child === contentBranch) return false;
      }
      return false;
    };
    const candidates = Array.from(
      primary!.querySelectorAll<HTMLElement>(
        '[role="tablist"], [data-testid="grokFirstDemoHeader"]',
      ),
    ).filter((tabs) => {
      // Inline reply media controls also use role=tablist (inside toolBar and
      // cellInnerDiv). They must never move the header or clip existing answers.
      if (
        !tabs.isConnected ||
        tabs.closest(
          'article, [data-testid="cellInnerDiv"], [data-testid="toolBar"], form, [role="textbox"]',
        ) ||
        !beforeContent(tabs)
      )
        return false;
      for (
        let node: HTMLElement | null | undefined = tabs;
        node;
        node = node.parentElement
      ) {
        if (
          node.hidden ||
          node.hasAttribute("hidden") ||
          node.hasAttribute("inert") ||
          node.getAttribute("aria-hidden") === "true" ||
          (node.hasAttribute("contenteditable") &&
            node.getAttribute("contenteditable") !== "false") ||
          node.getAttribute("data-testid")?.startsWith("tweetTextarea_")
        )
          return false;
        const style = getComputedStyle(node);
        if (
          style.display === "none" ||
          ["hidden", "collapse"].includes(style.visibility) ||
          style.contentVisibility === "hidden" ||
          Number.parseFloat(style.opacity) === 0
        )
          return false;
        if (node === primary) break;
      }
      return true;
    });
    // Fonts and CSS size transitions need not produce a DOM mutation. Observe
    // navigation containers up to the feed branch, including temporary zero
    // sizes, so they can recover without waiting for a scroll or resize.
    const selected = candidates.find((tabs) => {
      const rect = tabs.getBoundingClientRect();
      return rect.width > 0 && rect.height >= 32 && rect.height <= 100;
    });
    const targets = new Set<HTMLElement>();
    for (
      let node: HTMLElement | null | undefined = selected || candidates[0];
      node &&
      node !== primary &&
      !(firstContent && node.contains(firstContent));
      node = node.parentElement
    )
      targets.add(node);
    syncNativeHeaders(targets);
    return selected;
  }
  function headerGeometry(
    primary: HTMLElement | null,
    viewport: { width: number; height: number; left?: number; top?: number },
  ) {
    const tabs = primaryHeaderTabs(primary);
    let source = tabs,
      rect = tabs?.getBoundingClientRect(),
      borderWidth = 1;
    if (rect && rect.height >= 32 && rect.height <= 100) {
      for (
        let node: HTMLElement | null | undefined = tabs;
        node && node !== primary;
        node = node.parentElement
      ) {
        const candidate = node.getBoundingClientRect(),
          width = parseFloat(getComputedStyle(node).borderBottomWidth) || 0;
        if (candidate.height > 110) break;
        if (width > 0 && Math.abs(candidate.bottom - rect.bottom) < 2) {
          source = node;
          rect = candidate;
          borderWidth = width;
          break;
        }
      }
      if (source === tabs)
        borderWidth =
          parseFloat(getComputedStyle(source!).borderBottomWidth) || 0;
      // A partially clipped tab bar keeps its visible bottom edge. Once the
      // source bar is entirely offscreen, dock our controls at the viewport top.
      if (rect.bottom <= 0 || rect.top >= viewport.height)
        return { top: 0, height: Math.min(53, viewport.height), borderWidth };
      const top = Math.max(0, rect.top),
        height = Math.max(0, Math.min(viewport.height, rect.bottom) - top);
      return { top, height, borderWidth };
    }
    return { top: 0, height: Math.min(53, viewport.height), borderWidth };
  }
  function nativeSearch() {
    return (
      document
        .querySelector<HTMLElement>('[data-testid="sidebarColumn"]')
        ?.querySelector<HTMLFormElement>('form[role="search"]') || null
    );
  }
  function searchFocused() {
    const search = nativeSearch();
    return Boolean(
      search &&
      document.activeElement &&
      search.contains(document.activeElement),
    );
  }
  document.addEventListener("focusin", scheduleLayout, true);
  document.addEventListener("focusout", scheduleLayout, true);
  function searchHeaderGeometry(
    header: { top: number; height: number; borderWidth: number },
    viewport: { width: number; height: number; left?: number; top?: number },
  ) {
    const search = nativeSearch();
    if (observedNativeSearch !== search) {
      if (observedNativeSearch) resizeObserver?.unobserve(observedNativeSearch);
      if (search) resizeObserver?.observe(search);
      observedNativeSearch = search;
    }
    const rect = search?.getBoundingClientRect();
    if (
      !rect ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.bottom <= 0 ||
      rect.top >= viewport.height
    )
      return header;
    const top = Math.min(viewport.height, Math.max(0, rect.bottom) + 8);
    return { top, height: Math.min(40, viewport.height - top), borderWidth: 1 };
  }
  function setRailWidth(width: number, persist: boolean = false) {
    customRailWidth = width;
    scheduleLayout();
    if (persist) postControl({ type: "SET_RAIL_WIDTH", width });
  }
  function beginRailResize(event: PointerEvent) {
    if (resizeDrag || event.button !== 0) return;
    const bounds = currentRailBounds();
    if (bounds.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    resizeDrag = {
      id: event.pointerId,
      start: event.clientX,
      width: bounds.width,
      preferred: customRailWidth,
    };
    railResize.focus({ preventScroll: true });
    railResize.setPointerCapture(event.pointerId);
  }
  function moveRailResize(event: PointerEvent) {
    if (!resizeDrag || event.pointerId !== resizeDrag.id) return;
    const bounds = currentRailBounds();
    if (bounds.hidden) {
      cancelRailResize();
      return;
    }
    const width = Math.round(
      Math.max(
        220,
        Math.min(
          innerWidth - bounds.left,
          resizeDrag.width + event.clientX - resizeDrag.start,
        ),
      ),
    );
    setRailWidth(width);
  }
  function finishRailResize(event: PointerEvent) {
    if (!resizeDrag || event.pointerId !== resizeDrag.id) return;
    const previous = resizeDrag;
    resizeDrag = null;
    if (railResize.hasPointerCapture(previous.id))
      railResize.releasePointerCapture(previous.id);
    if (Math.round(currentRailBounds().width) !== Math.round(previous.width))
      setRailWidth(customRailWidth, true);
    else setRailWidth(previous.preferred);
  }
  function cancelRailResize() {
    if (!resizeDrag) return;
    const previous = resizeDrag;
    resizeDrag = null;
    if (railResize.hasPointerCapture(previous.id))
      railResize.releasePointerCapture(previous.id);
    setRailWidth(previous.preferred);
  }
  function railResizeKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      cancelRailResize();
      return;
    }
    if (resizeDrag || !["ArrowLeft", "ArrowRight", "Home"].includes(event.key))
      return;
    event.preventDefault();
    if (event.key === "Home") {
      setRailWidth(0, true);
      return;
    }
    const bounds = currentRailBounds();
    if (bounds.hidden) return;
    const step = event.shiftKey ? 64 : 16;
    setRailWidth(
      Math.round(
        Math.max(
          220,
          Math.min(
            innerWidth - bounds.left,
            bounds.width + (event.key === "ArrowRight" ? step : -step),
          ),
        ),
      ),
      true,
    );
  }
  function currentRailBounds() {
    if (syncXModalVisibility())
      return {
        hidden: true,
        reason: "x-modal-open",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      };
    const viewport = {
      width: document.documentElement.clientWidth || innerWidth,
      height: innerHeight,
    };
    const primary = document.querySelector<HTMLElement>(
        '[data-testid="primaryColumn"]',
      ),
      sidebar = document.querySelector<HTMLElement>(
        '[data-testid="sidebarColumn"]',
      );
    return Layout.railBounds(
      primary?.getBoundingClientRect()!,
      sidebar?.getBoundingClientRect(),
      viewport,
      { preferredWidth: customRailWidth },
    );
  }
  function pauseUnseenRailQueue({ preserveStarted = false } = {}) {
    // No room for the result means no new paid work. Preserve requests whose
    // START has arrived, and only cancel work that is still waiting to begin.
    cancelDwellTimer();
    queue.clear();
    for (const entry of allEntries()) {
      entry.pending = false;
      entry.since = 0;
    }
    for (const [id, request] of requests)
      if (
        request.task === "comments"
          ? ["queued", "retry-wait"].includes(request.entry.commentStatus)
          : ["queued", "retry-wait"].includes(request.entry.status)
      ) {
        if (
          request.railCancellation ||
          explicitRequest(request) ||
          ((preserveStarted ||
            request.task === "analysis" ||
            request.originatedPrefetch) &&
            request.started)
        )
          continue;
        request.railCancellation = true;
        // Leave the request attached until cancellation is acknowledged. It may
        // already be running while the START message is still crossing the port.
        post(
          {
            type: "CANCEL_IF_QUEUED",
            requestId: id,
            ...(preserveStarted ||
            request.task === "analysis" ||
            request.originatedPrefetch
              ? { preserveStarted: true }
              : {}),
          }!,
        );
      }
  }
  function positionCards() {
    syncNativeAccount();
    const blocked = syncXModalVisibility();
    overlay.hidden =
      document.hidden || !supportedPage() || blocked || searchFocused();
    if (overlay.hidden) {
      if (blocked) {
        rail.hidden =
          railHeader.hidden =
          railExpand.hidden =
          railSeparators.hidden =
          railResize.hidden =
            true;
        for (const entry of allEntries()) entry.card.hidden = true;
        pauseUnseenRailQueue();
      }
      syncNativeCells(null, null);
      syncNativeHeaders();
      return;
    }
    // Focusing a descendant can scroll an overflow-hidden ancestor. Only each
    // answer box should scroll; keep the fixed rail and row hosts stationary.
    if (overlay.scrollTop) overlay.scrollTop = 0;
    if (overlay.scrollLeft) overlay.scrollLeft = 0;
    const items: { id: Entry; rect: DOMRect }[] = [],
      nativeRows: ReturnType<typeof rowGeometry>[] = [];
    const geometryByArticle = new Map();
    // Decorations follow all native rows, even when a row has no analysis
    // entry. They never depend on request state or answer content clipping.
    for (const article of document.querySelectorAll<HTMLElement>(
      'article[data-testid="tweet"]',
    )) {
      if (article.parentElement?.closest('article[data-testid="tweet"]'))
        continue;
      const rect = article.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const geometry = rowGeometry(article);
      geometryByArticle.set(article, geometry);
      nativeRows.push(geometry);
    }
    for (const entry of entries.values()) {
      if (entry.card.scrollTop) entry.card.scrollTop = 0;
      if (entry.card.scrollLeft) entry.card.scrollLeft = 0;
      if (!entry.article.isConnected) {
        entry.card.hidden = true;
        continue;
      }
      const geometry =
        geometryByArticle.get(entry.article) || rowGeometry(entry.article);
      items.push({ id: entry, ...geometry });
    }
    const viewport = {
      width: document.documentElement.clientWidth || innerWidth,
      height: innerHeight,
    };
    const primary = document.querySelector<HTMLElement>(
      '[data-testid="primaryColumn"]',
    );
    const sidebar = document.querySelector<HTMLElement>(
      '[data-testid="sidebarColumn"]',
    );
    const primaryRect = primary?.getBoundingClientRect(),
      nativeCells = syncNativeCells(primary, primaryRect);
    const bounds = Layout.railBounds(
      primaryRect!,
      sidebar?.getBoundingClientRect(),
      viewport,
      { preferredWidth: customRailWidth },
    );
    rail.hidden =
      railHeader.hidden =
      railSeparators.hidden =
      railResize.hidden =
        bounds.hidden || collapsed;
    railExpand.hidden = bounds.hidden || !collapsed;
    if (bounds.hidden) {
      syncNativeHeaders();
      pauseUnseenRailQueue();
      for (const item of items) item.id.card.hidden = true;
      return;
    }
    syncTheme(primary);
    const header = searchHeaderGeometry(
        headerGeometry(primary, viewport),
        viewport,
      ),
      headerHeight = header.top + header.height;
    railHeader.dataset.compact = String(bounds.width < 310);
    railHeader.style.borderBottomWidth = header.borderWidth + "px";
    for (const [element, geometry] of [
      [
        rail,
        {
          ...bounds,
          top: header.top,
          height: Math.max(0, viewport.height - header.top),
        },
      ],
      [railHeader, { ...bounds, top: header.top, height: header.height }],
      [
        railExpand,
        {
          left: bounds.left,
          top: header.top,
          width: 32,
          height: header.height,
        },
      ],
    ] as const)
      for (const name of ["left", "top", "width", "height"] as const) {
        const value = geometry![name] + "px";
        if (element!.style[name] !== value) element!.style[name] = value;
      }
    railResize.style.left = bounds.left + bounds.width - 8 + "px";
    railResize.style.top = header.top + "px";
    railResize.style.height = Math.max(0, viewport.height - header.top) + "px";
    railResize.setAttribute("aria-valuemin", "220");
    railResize.setAttribute(
      "aria-valuemax",
      String(Math.floor(viewport.width - bounds.left)),
    );
    railResize.setAttribute("aria-valuenow", String(Math.round(bounds.width)));
    if (collapsed) {
      for (const item of items) item.id.card.hidden = true;
      return;
    }
    const extraLines = [];
    for (const cell of nativeCells)
      extraLines.push(...nativeCellSeparators(cell, primaryRect!, viewport));
    positionSeparators(nativeRows, bounds, viewport, headerHeight, extraLines);
    for (const placement of Layout.placeRailRows(items, viewport, {
      headerHeight,
    })) {
      const entry = placement.id,
        card = entry!.card;
      card.hidden = placement.hidden;
      if (placement.hidden) continue;
      const geometry = {
        left: bounds.left,
        top: placement.top,
        width: bounds.width,
        height: placement.height,
      };
      for (const name of ["left", "top", "width", "height"] as const) {
        const value = geometry[name] + "px";
        if (card.style[name] !== value) card.style[name] = value;
      }
      // Separators live above every card, so a clipped or overlapping card
      // cannot erase the native row boundary.
      const native = geometryByArticle.get(entry!.article),
        visibleBorder =
          native?.borderWidth &&
          native.borderTop >= placement.visibleTop &&
          native.borderTop < placement.visibleBottom
            ? Math.min(
                native.borderWidth,
                placement.visibleBottom - native.borderTop,
              )
            : 0;
      const offset = placement.contentOffset + "px",
        height = Math.max(0, placement.contentHeight - visibleBorder) + "px";
      if (entry!.ui.box.style.top !== offset) entry!.ui.box.style.top = offset;
      if (entry!.ui.box.style.height !== height)
        entry!.ui.box.style.height = height;
    }
    tick();
  }
  function discardEntry(entry: Entry) {
    forgetCacheLookup(entry, true);

    for (const [id, request] of requests)
      if (request.entry === entry) {
        post({ type: "CANCEL", requestId: id });
        requests.delete(id);
      }
    if (entry.answerFrame !== undefined)
      cancelAnimationFrame(entry.answerFrame);
    detachedEntries.delete(entry);
    entry.card.remove();
  }
  function removeEntry(article: HTMLElement, entry: Entry, preserve = true) {
    forgetCacheLookup(entry, true);

    observer.unobserve(article);
    resizeObserver?.unobserve(article);
    resizeObserver?.unobserve(entry.ui.box);
    visible.delete(article);
    queue.remove(entry.post.id);
    if (entry.answerFrame !== undefined)
      cancelAnimationFrame(entry.answerFrame);
    entry.answerFrame = undefined;
    entry.card.remove();
    entries.delete(article);
    if (!preserve || entry.path !== location.pathname) {
      discardEntry(entry);
      return;
    }
    entry.pending = false;
    entry.since = 0;
    detachedEntries.add(entry);
    // START can be in transit. A conditional cancellation must leave both the
    // subscription and its concurrency lease intact if work has already begun.
    for (const [id, request] of requests)
      if (
        request.entry === entry &&
        !explicitRequest(request) &&
        (request.task === "comments"
          ? ["queued", "retry-wait"].includes(entry.commentStatus)
          : ["queued", "retry-wait"].includes(entry.status)) &&
        !request.railCancellation
      ) {
        if (queuedEntryEligible(entry, lookaheadWindow(), request.prefetch))
          continue;
        request.railCancellation = true;
        post(
          {
            type: "CANCEL_IF_QUEUED",
            requestId: id,
            ...(request.task === "analysis" || request.originatedPrefetch
              ? { preserveStarted: true }
              : {}),
          }!,
        );
      }
    pruneDetachedEntries();
  }
  function pruneDetachedEntries() {
    const active = new Set(
      [...requests.values()].map((request) => request.entry),
    );
    const completed = [...detachedEntries].filter(
      (entry) => !active.has(entry),
    );
    for (const entry of completed.slice(0, Math.max(0, completed.length - 100)))
      detachedEntries.delete(entry);
  }
  function scan() {
    if (syncXModalVisibility()) {
      scheduleLayout();
      return;
    }
    if (location.pathname !== lastPath) {
      for (const entry of allEntries()) forgetCacheLookup(entry, true);
      cancelDwellTimer();
      historySeen.clear();
      historyPending.clear();
      historyRetryAt = 0;
      lastPath = location.pathname;
      queue.clear();
      post({ type: "CANCEL_ALL" });
      requests.clear();
      draftComposer?.reset();
      for (const entry of allEntries()) {
        clearRetries(entry);
        entry.since = 0;
        entry.pending = false;
        if (["queued", "running", "retry-wait"].includes(entry.status)) {
          entry.status = "new";
          renderAnswer(entry, "", true);
          refreshCard(entry);
        }
        if (["queued", "running", "retry-wait"].includes(entry.commentStatus)) {
          entry.commentStatus = "error";
          entry.commentError = "status.cancelled";
          refreshComments(entry);
        }
      }
      detachedEntries.clear();
    }
    for (const [article, entry] of entries)
      if (!article.isConnected) removeEntry(article, entry);
    if (!supportedPage()) {
      scheduleLayout();
      return;
    }
    for (const article of document.querySelectorAll<HTMLElement>(
      'article[data-testid="tweet"]',
    )) {
      const data = Core.extractPost(article);
      if (!data) {
        const previous = entries.get(article);
        if (previous) removeEntry(article, previous);
        continue;
      }
      const signature = JSON.stringify([
        Core.postFingerprint(data),
        Boolean(data.isPromoted),
      ]);
      let entry = entries.get(article);
      if (entry) entry.path = location.pathname;
      if (entry && entry.signature === signature && entry.card.isConnected) {
        continue;
      }
      if (
        entry &&
        entry.post.id === data.id &&
        (entry.post.text !== data.text || entry.post.language !== data.language)
      )
        historySeen.delete(data.id!);
      const identity = (post: Post) => Core.apiPostIdentity(post, settings);
      if (
        entry &&
        entry.card.isConnected &&
        Boolean(data.isPromoted) === Boolean(entry.post.isPromoted) &&
        identity(data) === identity(entry.post)
      ) {
        // All API analysis uses the original URL and survives preview changes. Comment drafts still use
        // the supplied text, so cancel/clear only those when their input changes.
        if (Core.apiPostIdentity(data) !== Core.apiPostIdentity(entry.post)) {
          for (const [id, request] of requests)
            if (request.entry === entry && request.task === "comments") {
              post({ type: "CANCEL", requestId: id });
              requests.delete(id);
            }
          entry.commentStatus = "idle";
          entry.comments = [];
          entry.commentUsage = null;
          entry.commentRequestDiagnostics = undefined;
          refreshComments(entry);
          refreshVerificationFailure(entry);
        }
        entry.post = data;
        entry.signature = signature;
        continue;
      }
      // A different post can reuse the same native article while scrolling.
      // Changing this post's Auto language instead invalidates its old input.
      if (entry) removeEntry(article, entry, entry.post.id !== data.id);
      for (const previous of detachedEntries)
        if (
          previous.post.id === data.id &&
          identity(previous.post) !== identity(data)
        )
          discardEntry(previous);
      entry = [...detachedEntries]
        .reverse()
        .find(
          (previous) =>
            Boolean(previous.post.isPromoted) === Boolean(data.isPromoted) &&
            identity(previous.post) === identity(data),
        );
      if (entry) {
        detachedEntries.delete(entry);
        if (Core.apiPostIdentity(data) !== Core.apiPostIdentity(entry.post))
          clearComments(entry);
        entry.article = article;
        entry.post = data;
        entry.signature = signature;
        entry.since = 0;
        renderAnswer(entry, entry.latestText || "", true);
      } else {
        const seed: Omit<Entry, "card" | "ui"> = {
          article,
          path: location.pathname,
          post: data,
          signature,
          status: "new",
          since: 0,
          result: null,
          commentStatus: "idle",
          comments: [],
        };
        const { card, ui } = createCard(seed);
        entry = Object.assign(seed, { card, ui });
      }
      overlayShadow.append(entry!.card);
      entries.set(article, entry);
      observer.observe(article);
      resizeObserver?.observe(article);
      resizeObserver?.observe(entry!.ui.box);
      entry!.card.hidden = true;
      refreshCard(entry!);
      if (eligibility(article).eligible) visible.add(article);
    }
    scheduleLayout();
    tick();
  }
  function refreshCard(entry: Entry) {
    entry.ui.box.setAttribute("aria-label", t("aria.result"));
    const manualReply = entry.status === "new" && !automaticEntry(entry);
    entry.ui.retry.textContent = t(
      manualReply ? "common.analyzeReply" : "common.retry",
    );
    entry.ui.generateComments.textContent = t("common.generateComments");
    entry.ui.diagnosticLabel.textContent = t("common.diagnostics");
    if (entry.status === "new") {
      status(
        entry,
        !settings.enabled
          ? "status.disabled"
          : !connected && !workerSleeping
            ? needsPageRefresh
              ? "status.refreshRequired"
              : "status.connectionLost"
            : !providerReady
              ? needsProvider()
              : manualReply
                ? "status.replyManual"
                : entry.pending
                  ? "status.queued"
                  : "status.waiting",
      );
      note(entry, "");
      entry.ui.retry.hidden = true;
    } else if (entry.statusKey)
      status(entry, entry.statusKey, entry.statusVars);
    if (entry.noteKey) entry.ui.note.textContent = t(entry.noteKey);
    if (entry.cached)
      entry.ui.status.prepend(
        document.createTextNode(t("status.cached") + " · "),
      );
    entry.ui.retry.disabled =
      !usableConnection() ||
      !settings.enabled ||
      ["queued", "running", "retry-wait"].includes(entry.status) ||
      wakeActions.has(wakeKey(entry, "analysis")) ||
      (manualReply &&
        Boolean(entry.cacheLookupId || entry.cacheLookupDeferred));
    if (!providerReady) entry.ui.retry.hidden = true;
    else if (["done", "error"].includes(entry.status) || manualReply)
      entry.ui.retry.hidden = false;
    refreshComments(entry);
    refreshRetries(entry);
    syncLoading(entry);
    refreshUsage(entry);
  }
  // A post detail page contains the selected post plus replies/ancestors.
  // Only the URL-selected post is an automatic analysis target there.
  function automaticEntry(entry: Entry) {
    const selected = location.pathname.match(/\/status\/(\d+)(?:\/|$)/)?.[1];
    return !selected || String(entry.post.id) === selected;
  }
  function eligibility(article: HTMLElement) {
    return Core.visibilityEligibility(
      article.getBoundingClientRect(),
      { width: innerWidth, height: innerHeight },
      { minRatio: 0, minVisiblePx: 1 },
    );
  }
  function lookaheadWindow() {
    const viewport = { width: innerWidth, height: innerHeight },
      rows = [];
    const displayedIds = new Set(
      [...entries.values()]
        .filter(
          (entry) =>
            entry.article.isConnected && eligibility(entry.article).eligible,
        )
        .map((entry) => entry.post.id),
    );
    for (const entry of entries.values()) {
      if (!entry.article.isConnected || !automaticEntry(entry)) continue;
      const rect = entry.article.getBoundingClientRect();
      rows.push({
        entry,
        id: entry.post.id!,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        visible: displayedIds.has(entry.post.id),
        isPromoted: Boolean(entry.post.isPromoted),
      });
    }
    const ids = Scheduler.selectLookahead(rows!, viewport, {
      count: settings.prefetchCount,
      all: settings.prefetchAll,
    });
    const selected = new Set<Entry>();
    for (const id of ids) {
      const row = rows
        .filter(
          (row) =>
            row.id === id &&
            !row.visible &&
            !row.isPromoted &&
            row.top >= viewport.height &&
            row.bottom > row.top &&
            row.right > 0 &&
            row.left < viewport.width,
        )
        .sort((a, b) => a.top - b.top)[0];
      if (row) selected.add(row.entry);
    }
    return selected;
  }
  function analysisIdentity(entry: Entry) {
    const mode = Core.explanationMode(settings);
    return JSON.stringify([
      location.pathname,
      taskRevision,
      nativeAccountIdentity,
      credentialIdentity,
      settings.provider,
      Core.apiPostIdentity(entry.post, settings),
      mode,
      mode === "preset" ? Core.DEFAULT_PROMPTS.verify : settings.verifyPrompt,
    ]);
  }
  function analysisEntries(leader: Entry) {
    return [
      leader,
      ...[...entries.values()].filter(
        (entry) => entry.analysisLeader === leader,
      ),
    ];
  }
  function mirrorAnalysis(entry: Entry, leader: Entry) {
    if (entry.sharedVersion === leader.analysisVersion) return;
    entry.sharedVersion = leader.analysisVersion;
    entry.status = leader.status;
    entry.phase = leader.phase;
    entry.result = leader.result;
    entry.errorCode = leader.errorCode;
    entry.verificationStart = leader.verificationStart;
    entry.verificationBase = leader.verificationBase;
    entry.verificationStarted = leader.verificationStarted;
    entry.analysisRetry = leader.analysisRetry;
    entry.keepRetryAnswer = leader.keepRetryAnswer;
    entry.verificationFailure = leader.verificationFailure;
    entry.analysisUsage = leader.analysisUsage;
    entry.requestDiagnostics = leader.requestDiagnostics;
    entry.cached = leader.status === "done" || leader.cached;
    if (entry.analysisUsage && leader.status === "done")
      entry.analysisUsage = { ...entry.analysisUsage, cached: true };
    renderAnswer(entry, leader.latestText || "", true);
    renderSources(entry, leader.sourceList || []);
    if (leader.statusKey) status(entry, leader.statusKey, leader.statusVars);
    note(entry, leader.noteKey || "");
    refreshCard(entry);
  }
  function reuseAnalysis(entry: Entry, activeOnly = false) {
    const key = analysisIdentity(entry),
      active = [...requests.values()].find(
        (request) => request.task === "analysis" && request.analysisKey === key,
      );
    if (active?.entry === entry) {
      delete entry.analysisLeader;
      return false;
    }
    let leader = active?.entry;
    if (
      !activeOnly &&
      !leader &&
      entry.analysisLeader &&
      allEntries().includes(entry.analysisLeader) &&
      entry.analysisLeader.analysisKey === key &&
      entry.analysisLeader.status === "done"
    )
      leader = entry.analysisLeader;
    if (!activeOnly && !leader && entry.status === "new")
      leader = allEntries().find(
        (other) =>
          other !== entry &&
          other.analysisKey === key &&
          other.status === "done" &&
          other.result,
      );
    if (!leader) {
      if (entry.analysisLeader) {
        delete entry.analysisLeader;
        entry.sharedVersion = undefined;
        if (["queued", "running", "retry-wait"].includes(entry.status)) {
          entry.status = "new";
          entry.pending = false;
        }
      }
      return false;
    }
    if (entry.analysisLeader !== leader) {
      entry.analysisLeader = leader;
      entry.sharedVersion = -1;
    }
    entry.analysisKey = key;
    mirrorAnalysis(entry, leader);
    return true;
  }
  function syncSharedAnalyses() {
    for (const entry of entries.values()) reuseAnalysis(entry);
  }
  function queuedEntryEligible(
    entry: Entry,
    lookahead: Set<Entry>,
    prefetch = false,
  ) {
    return analysisEntries(entry).some(
      (candidate) =>
        candidate.article.isConnected &&
        entries.get(candidate.article) === candidate &&
        (eligibility(candidate.article).eligible ||
          (prefetch && lookahead.has(candidate))),
    );
  }
  function onFeedScroll(event: Event) {
    const target = event?.target as Node | null;
    // Captured scrolls include X's nested feed containers. A scroll within our
    // shadow rail is only reading the answer, so it must not postpone a post.
    const owned =
      target === overlay ||
      event?.composedPath?.().includes(overlay) ||
      Boolean(target?.nodeType && overlay.contains(target));
    if (!owned && settings.dwellMs > 0) {
      cancelDwellTimer();
      queue.clear();
      const now = Date.now(),
        lookahead = lookaheadWindow();
      for (const entry of allEntries())
        if (entry.status === "new") {
          entry.pending = false;
          entry.since =
            entry.article.isConnected &&
            visible.has(entry.article) &&
            eligibility(entry.article).eligible
              ? now
              : 0;
        }
      for (const [id, request] of requests)
        if (
          request.task === "analysis" &&
          ["queued", "retry-wait"].includes(request.entry.status) &&
          !explicitRequest(request) &&
          !request.force
        ) {
          if (
            request.prefetch &&
            queuedEntryEligible(request.entry, lookahead, true)
          )
            continue;
          request.scrollCancellation = true;
          const entry = request.entry;
          entry.since =
            entry.article.isConnected &&
            visible.has(entry.article) &&
            eligibility(entry.article).eligible
              ? now
              : 0;
          // A START can already be crossing the port. Keep this subscription
          // attached and ask the worker to cancel only if it truly has not begun.
          if (!request.railCancellation) {
            request.railCancellation = true;
            post(
              {
                type: "CANCEL_IF_QUEUED",
                requestId: id,
                ...(request.task === "analysis" || request.originatedPrefetch
                  ? { preserveStarted: true }
                  : {}),
              }!,
            );
          }
        }
    }
    scheduleLayout();
  }
  function cancelDwellTimer() {
    if (dwellTimer !== undefined) clearTimeout(dwellTimer);
    dwellTimer = undefined;
    dwellDeadline = 0;
  }
  function resetDwellWaits() {
    cancelDwellTimer();
    queue.clear();
    for (const entry of allEntries()) {
      entry.since = 0;
      entry.pending = false;
    }
  }
  function scheduleDwell(deadline: number) {
    if (!deadline) {
      cancelDwellTimer();
      return;
    }
    if (dwellTimer !== undefined && dwellDeadline === deadline) return;
    cancelDwellTimer();
    dwellDeadline = deadline;
    // One timeout wakes the earliest continuously visible post after scrolling
    // stops. It exists only while at least one visible post is waiting.
    dwellTimer = setTimeout(
      () => {
        dwellTimer = undefined;
        dwellDeadline = 0;
        tick();
      },
      Math.max(1, deadline - Date.now()),
    );
  }
  function tick() {
    if (pageSuspended) {
      resetDwellWaits();
      return;
    }
    syncNativeAccount();
    const blocked = syncXModalVisibility();
    recordHistory();
    if (blocked) {
      pauseUnseenRailQueue();
      return;
    }
    if (document.hidden || collapsed || !supportedPage() || searchFocused()) {
      resetDwellWaits();
      return;
    }
    if (currentRailBounds().hidden) {
      pauseUnseenRailQueue();
      return;
    }
    if (location.pathname !== lastPath) {
      scheduleScan();
      return;
    }
    for (const article of visible) {
      const entry = entries.get(article);
      if (!entry || !article.isConnected) continue;
      if (!eligibility(article).eligible) {
        forgetCacheLookup(entry, true);
        continue;
      }
      restoreSavedAnswer(entry);
    }
    if (!settings.enabled || !(providerReady || answerCacheReady)) {
      resetDwellWaits();
      return;
    }
    if (!connected) {
      resetDwellWaits();
      if (
        workerSleeping &&
        [...visible].some((article) => {
          const entry = entries.get(article);
          return (
            entry?.status === "new" &&
            automaticEntry(entry) &&
            article.isConnected &&
            eligibility(article).eligible
          );
        })
      )
        connect();
      return;
    }
    if (awaitingConfig) {
      resetDwellWaits();
      return;
    }
    const now = Date.now();
    let nextDwell = 0;
    syncSharedAnalyses();
    const lookahead = lookaheadWindow();
    for (const [id, request] of requests)
      if (
        request.prefetch &&
        analysisEntries(request.entry).some(
          (entry) =>
            entry.article.isConnected && eligibility(entry.article).eligible,
        )
      ) {
        request.prefetch = false;
        post({ type: "PROMOTE_REQUEST", requestId: id });
      }
    // Scrolling does not abandon a running paid request. Only withdraw work
    // that the worker confirms has not begun; retain its subscription meanwhile.
    for (const [id, request] of requests) {
      const entry = request.entry,
        queued =
          request.task === "comments"
            ? ["queued", "retry-wait"].includes(entry.commentStatus)
            : ["queued", "retry-wait"].includes(entry.status);
      if (!queued || request.railCancellation || explicitRequest(request))
        continue;
      if (
        !queuedEntryEligible(
          entry,
          lookahead,
          request.task === "analysis" && request.prefetch,
        )
      ) {
        entry.since = 0;
        request.railCancellation = true;
        post(
          {
            type: "CANCEL_IF_QUEUED",
            requestId: id,
            ...(request.task === "analysis" || request.originatedPrefetch
              ? { preserveStarted: true }
              : {}),
          }!,
        );
      }
    }
    for (const article of visible) {
      const entry = entries.get(article);
      if (!entry || !article.isConnected) continue;
      const visibility = eligibility(article);
      if (!visibility.eligible) {
        entry.since = 0;
        entry.pending = false;
        queue.remove(entry.post.id);
        continue;
      }
      if (
        entry.status !== "new" ||
        !automaticEntry(entry) ||
        entry.cacheLookupId ||
        entry.cacheLookupDeferred
      )
        continue;
      if (!entry.since) entry.since = now;
      const deadline = entry.since + settings.dwellMs;
      if (deadline > now) {
        nextDwell = nextDwell ? Math.min(nextDwell, deadline) : deadline;
        continue;
      }
      entry.pending = queue.enqueue(
        entry.post,
        1 / (1 + Math.max(0, article.getBoundingClientRect().top)),
      );
      refreshCard(entry);
    }
    let candidate: Post | null;
    while ((candidate = queue.take())) {
      const entry = [...entries.values()].find(
        (e) =>
          e.post.id === candidate!.id &&
          e.status === "new" &&
          visible.has(e.article) &&
          now - e.since >= settings.dwellMs,
      );
      if (!entry) continue;
      if (!eligibility(entry.article).eligible) {
        entry.pending = false;
        refreshCard(entry);
        continue;
      }
      submit(entry, false);
    }
    for (const entry of lookahead)
      if (entry.status === "new") submit(entry, false, true);
    scheduleDwell(nextDwell);
  }
  function configureHistory(
    enabled: boolean | undefined,
    epoch: number | undefined,
  ) {
    const nextEpoch = Number.isSafeInteger(epoch) ? epoch : historyEpoch;
    if (nextEpoch !== historyEpoch) {
      historyPending.clear();
      historyRetryAt = 0;
    }
    historyEnabled = enabled !== false;
    historyEpoch = nextEpoch!;
    historyLoaded = true;
    if (!historyEnabled) {
      historySeen.clear();
      historyPending.clear();
      historyRetryAt = 0;
    }
  }
  function recordHistory() {
    if (xModalBlocked) return;
    // Record visibility independently of paid work, without polling writes for
    // stationary posts. A clear does not immediately re-add the current view.
    if (
      !historyLoaded ||
      !historyEnabled ||
      !settings.enabled ||
      document.hidden ||
      !supportedPage()
    ) {
      historySeen.clear();
      historyPending.clear();
      return;
    }
    if (location.pathname !== lastPath) return;
    for (const [batchId, batch] of historyPending)
      if (Date.now() - batch.sentAt >= 10000) {
        historyPending.delete(batchId);
        for (const id of batch.ids) historySeen.delete(id);
        historyRetryAt = Date.now() + 5000;
      }
    if (Date.now() < historyRetryAt) return;
    const displayed = new Map();
    for (const article of visible) {
      const entry = entries.get(article);
      if (entry && article.isConnected && eligibility(article).eligible)
        displayed.set(entry.post.id, entry.post);
    }
    for (const id of historySeen)
      if (!displayed.has(id)) historySeen.delete(id);
    const unseen = [...displayed.values()].filter(
      (item) => !historySeen.has(item.id),
    );
    if (!unseen.length) return;
    if (!connected) {
      if (workerSleeping) connect();
      return;
    }
    if (awaitingConfig) return;
    for (let index = 0; index < unseen.length; index += 30) {
      const posts = unseen.slice(index, index + 30),
        batchId = crypto.randomUUID(),
        ids = posts.map((item) => item.id);
      historyPending.set(batchId, {
        ids,
        epoch: historyEpoch,
        sentAt: Date.now(),
      });
      for (const id of ids) historySeen.add(id);
      if (!post({ type: "HISTORY_VISIT", posts, historyEpoch, batchId })) {
        historyPending.delete(batchId);
        for (const id of ids) historySeen.delete(id);
        historyRetryAt = Date.now() + 5000;
        return;
      }
    }
  }
  function submit(
    entry: Entry,
    force: boolean,
    prefetch = false,
    manual = false,
  ) {
    if (!force && !manual && !automaticEntry(entry)) return;
    if (
      (force || manual) &&
      afterWake(entry, "analysis", () => submit(entry, force, prefetch, manual))
    )
      return;
    if (
      !settings.enabled ||
      !connected ||
      !(providerReady || (!force && answerCacheReady)) ||
      currentRailBounds().hidden
    )
      return;
    if (awaitingConfig) return;
    if (
      [...requests.values()].some(
        (r) => r.entry === entry && r.task === "analysis",
      )
    )
      return;
    if (reuseAnalysis(entry, force)) return;
    if (force && !clearComments(entry)) return;
    // Cancelling a comment can synchronously invalidate the shared port.
    if (!connected || !(providerReady || (!force && answerCacheReady))) return;
    forgetCacheLookup(entry);
    delete entry.analysisLeader;
    entry.sharedVersion = undefined;
    entry.analysisKey = analysisIdentity(entry);
    entry.analysisVersion = (entry.analysisVersion || 0) + 1;
    entry.analysisRetry = null;
    entry.keepRetryAnswer = false;
    const requestId = crypto.randomUUID();
    entry.pending = false;
    entry.since = 0;
    queue.remove(entry.post.id);
    entry.status = "queued";
    entry.phase = "";
    entry.verificationBase = "";
    entry.verificationStarted = false;
    entry.verificationStart = undefined;
    entry.result = null;
    entry.cached = false;
    entry.requestDiagnostics = undefined;
    setVerificationFailure(entry, null!, false);
    status(entry, "status.queued");
    entry.ui.retry.hidden = true;
    if (force || !entry.ui.answer.textContent) renderAnswer(entry, "", true);
    renderSources(entry, []);
    note(entry, "");
    entry.ui.diagnostics.hidden = true;
    entry.ui.diagnosticText.textContent = "";
    requests.set(requestId, {
      ...requestSnapshot(entry, requestId),
      force: force === true,
      manual,
      prefetch,
      originatedPrefetch: prefetch,
      analysisKey: entry.analysisKey,
    });
    entry.analysisUsage = null;
    captureUsage(entry, "analysis", {}, requests.get(requestId)!, false, true);
    refreshUsage(entry);
    post({
      type: "ANALYZE",
      requestId,
      post: entry.post,
      force,
      prefetch,
      nativeAccount: currentNativeAccount(),
    });
    scheduleLayout();
  }
  function clearComments(entry: Entry) {
    for (const [id, request] of requests)
      if (request.entry === entry && request.task === "comments") {
        if (!post({ type: "CANCEL", requestId: id })) return false;
        requests.delete(id);
      }
    entry.comments = [];
    entry.commentUsage = null;
    entry.commentRequestDiagnostics = undefined;
    entry.commentStatus = "idle";
    entry.commentRetry = null;
    entry.commentError = "";
    entry.copyStatusKey = "";
    entry.ui.copyStatus.textContent = "";
    refreshComments(entry);
    refreshVerificationFailure(entry);
    return true;
  }
  function generateComments(entry: Entry) {
    if (["queued", "running", "retry-wait"].includes(entry.commentStatus))
      return;
    if (
      collapsed ||
      document.hidden ||
      !supportedPage() ||
      currentRailBounds().hidden ||
      !entry.article.isConnected ||
      !eligibility(entry.article).eligible
    )
      return;
    if (afterWake(entry, "comments", () => generateComments(entry))) return;
    if (!connected || !providerReady || awaitingConfig) return;
    entry.commentRetry = null;
    const requestId = crypto.randomUUID(),
      request = requestSnapshot(entry, requestId, "comments");
    request.analysis = {
      text: entry.latestText || "",
      verificationStatus: entry.result?.verificationStatus || "unverified",
      warning: entry.result?.warning || "",
      sources: entry.result?.sources || [],
    };
    const force = entry.commentStatus === "error" || entry.comments.length > 0;
    request.force = force;
    entry.commentStatus = "queued";
    entry.commentError = "";
    entry.commentRequestDiagnostics = undefined;
    entry.copyStatusKey = "";
    entry.ui.copyStatus.textContent = "";
    requests.set(requestId, request);
    captureUsage(entry, "comments", {}, request, false, true);
    refreshComments(entry);
    refreshVerificationFailure(entry);
    post({
      type: "GENERATE_COMMENTS",
      requestId,
      post: entry.post,
      analysis: request.analysis,
      force,
    });
    scheduleLayout();
  }
  function refreshComments(entry: Entry) {
    const ui = entry.ui;
    if (!ui) return;
    const loading = ["queued", "running", "retry-wait"].includes(
      entry.commentStatus,
    );
    ui.generateComments.textContent = t(
      entry.commentStatus === "error"
        ? "common.retryComments"
        : "common.generateComments",
    );
    ui.generateComments.hidden =
      settings.provider === "x-native" ||
      !usableConnection() ||
      entry.status === "unsupported";
    ui.generateComments.disabled =
      loading ||
      !usableConnection() ||
      wakeActions.has(wakeKey(entry, "comments"));
    ui.comments.setAttribute("aria-label", t("aria.comments"));
    ui.comments.setAttribute("aria-busy", String(loading));
    ui.commentHeading.textContent = t("common.comments");
    ui.commentHint.textContent = t("comments.copyHint");
    ui.commentHeading.hidden = ui.commentHint.hidden = !entry.comments.length;
    if (entry.copyStatusKey) ui.copyStatus.textContent = t(entry.copyStatusKey);
    ui.commentStatus.hidden = !loading && entry.commentStatus !== "error";
    ui.commentStatus.textContent = loading
      ? t(
          entry.commentStatus === "running"
            ? "comments.loading"
            : "comments.pending",
        )
      : t(entry.commentError || "status.failed");
    ui.commentStatus.classList.toggle("shimmer", loading);
    for (const item of ui.comments.children) {
      item.setAttribute(
        "aria-label",
        t("common.copy") + ": " + item.textContent,
      );
      (item as HTMLElement).title = t("common.copy");
    }
    ui.comments.hidden = !entry.comments.length;
    refreshUsage(entry);
    refreshRetries(entry);
    // Locale changes update controls only; the suggested text remains in the
    // selected output language and keeps its own direction.
    if (
      ui.comments.children.length === entry.comments.length &&
      entry.comments.every(
        (text, i) =>
          (ui.comments.children[i] as HTMLElement).dataset.text === text,
      )
    )
      return;
    ui.comments.replaceChildren();
    for (const text of entry.comments) {
      const button = node("button", "comment-copy", text);
      button.dataset.text = text;
      button.setAttribute("dir", "auto");
      button.setAttribute("aria-label", t("common.copy") + ": " + text);
      button.title = t("common.copy");
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(text);
          entry.copyStatusKey = "common.copied";
        } catch {
          entry.copyStatusKey = "common.copyFailed";
        }
        ui.copyStatus.textContent = t(entry.copyStatusKey);
      });
      ui.comments.append(button);
    }
  }
  function tokenCount(value: unknown): number | null {
    return Number.isSafeInteger(value) && (value as number) >= 0
      ? (value as number)
      : null;
  }
  function safeModel(value: unknown) {
    return typeof value === "string" &&
      /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value)
      ? value
      : "";
  }
  function usageFields(value: Usage | undefined) {
    const usage: Usage = {};
    for (const key of [
      "total_tokens",
      "input_tokens",
      "output_tokens",
    ] as const)
      if (tokenCount(value?.[key]) !== null) usage[key] = value![key];
    return usage;
  }
  function usageTotal(usage: Usage) {
    if (tokenCount(usage.total_tokens) !== null) return usage.total_tokens;
    return tokenCount(usage.input_tokens) !== null &&
      tokenCount(usage.output_tokens) !== null
      ? tokenCount(usage.input_tokens! + usage.output_tokens!)
      : null;
  }
  function captureUsage(
    entry: Entry,
    task: string,
    metadata: Metadata,
    request: RequestSnapshot,
    cached: boolean,
    replace = false,
  ) {
    const key = task === "comments" ? "commentUsage" : "analysisUsage",
      previous = replace ? {} : entry[key] || {};
    const record: UsageRecord = {
      ...previous,
      requestedModel: safeModel(request.apiModel),
      cached,
    };
    if (replace || metadata.usage !== undefined)
      record.usage = usageFields(metadata.usage);
    if (replace || metadata.usageByStage !== undefined) {
      record.byStage = {};
      for (const stage of ["url", "inline", "explain", "verify", "comments"])
        if (
          metadata.usageByStage?.[stage] &&
          typeof metadata.usageByStage[stage] === "object"
        )
          record.byStage[stage] = usageFields(metadata.usageByStage[stage]);
    }
    if (replace || metadata.model !== undefined)
      record.model = safeModel(metadata.model);
    if (replace || metadata.modelByStage !== undefined) {
      record.models = [];
      for (const stage of ["url", "inline", "explain", "verify", "comments"]) {
        const model = safeModel(metadata.modelByStage?.[stage]);
        if (model && !record.models.includes(model)) record.models.push(model);
      }
    }
    if (typeof metadata.usageComplete === "boolean")
      record.complete = metadata.usageComplete;
    else if (replace) record.complete = undefined;
    entry[key] = record;
  }
  function refreshUsage(entry: Entry) {
    const label = entry.ui?.tokenUsage;
    if (!label) return;
    const records = (
      [
        ["analysis", entry.analysisUsage, entry.status],
        ["comments", entry.commentUsage, entry.commentStatus],
      ] as const
    ).filter(([, record]) => record);
    const formatter = new Intl.NumberFormat(uiLanguage),
      countText = (count: number) => formatter.format(count);
    const lines = [t("usage.scope")];
    let total = 0,
      known = false,
      incomplete = false,
      pending = false;
    for (const [task, record, state] of records as readonly (readonly [
      string,
      UsageRecord,
      string,
    ])[]) {
      const active = ["queued", "running", "retry-wait"].includes(state!);
      pending ||= active;
      const stages = Object.values(record.byStage || {}),
        values = stages.length ? stages : [record.usage || {}];
      const totals = values.map(usageTotal),
        available = totals.filter((value) => value !== null);
      const subtotal = tokenCount(
        available.reduce((sum, value) => sum! + value!, 0),
      );
      const complete =
        record.complete !== false &&
        available.length === values.length &&
        subtotal !== null &&
        !active;
      if (available.length && subtotal !== null) {
        known = true;
        total += subtotal;
      }
      incomplete ||= !complete;
      lines.push(
        t(task === "analysis" ? "usage.analysis" : "usage.comments") +
          ": " +
          (available.length && subtotal !== null
            ? t(complete ? "usage.total" : "usage.known", {
                count: countText(subtotal),
              })
            : t(active ? "usage.pending" : "usage.unavailable")),
      );
      const models = [
        ...new Set([record.model, ...(record.models || [])].filter(Boolean)),
      ];
      if (models.length)
        lines.push(t("usage.model", { model: models.join(", ") }));
      else {
        lines.push(t("usage.unknownModel"));
        if (record.requestedModel)
          lines.push(t("usage.requested", { model: record.requestedModel }));
      }
      for (const [field, key] of [
        ["input_tokens", "usage.input"],
        ["output_tokens", "usage.output"],
      ] as const) {
        const counts = values.map((value) => tokenCount(value[field]));
        if (counts.every((value) => value !== null)) {
          const sum = counts.reduce((a, b) => a + b, 0);
          if (tokenCount(sum) !== null)
            lines.push(t(key!, { count: countText(sum) }));
        }
      }
      if (record.cached) lines.push(t("usage.cached"));
    }
    label.hidden = !entry.latestText && !entry.comments.length && !known;
    // Completed provenance belongs with the usage details rather than a
    // repeated heading. Keep progress, onboarding and incomplete/error states
    // visible even when the row also owns a reported token subtotal.
    const completedMetadata =
      entry.status === "done" &&
      ["status.searched", "status.unverified"].includes(entry.statusKey!);
    entry.ui.status.hidden = completedMetadata && !label.hidden;
    if (completedMetadata) lines.push(t(entry.statusKey!));
    const text =
      known && tokenCount(total) !== null
        ? t(incomplete ? "usage.known" : "usage.total", {
            count: countText(total),
          })
        : t(pending ? "usage.pending" : "usage.unavailable");
    if (label.textContent !== text) label.textContent = text;
    if (incomplete && known) lines.push(t("usage.partial"));
    const title = lines.join("\n"),
      aria = text + "\n" + title;
    if (label.title !== title) label.title = title;
    if (label.getAttribute("aria-label") !== aria)
      label.setAttribute("aria-label", aria);
  }
  function node<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text) e.textContent = text;
    return e;
  }
  function chevron(direction: string) {
    const ns = "http://www.w3.org/2000/svg",
      svg = document.createElementNS(ns, "svg"),
      path = document.createElementNS(ns, "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    path.setAttribute(
      "d",
      direction === "left"
        ? "M15 5l-7 7 7 7"
        : direction === "right"
          ? "M9 5l7 7-7 7"
          : "M5 9l7 7 7-7",
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    return svg;
  }
  function gear() {
    const ns = "http://www.w3.org/2000/svg",
      svg = document.createElementNS(ns, "svg"),
      path = document.createElementNS(ns, "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const points = Array.from({ length: 48 }, (_, index) => {
      const angle = (index / 48) * Math.PI * 2 - Math.PI / 2,
        radius = [7.2, 7.2, 9.2, 9.2, 7.2, 7.2][index % 6];
      return `${(12 + Math.cos(angle) * radius!).toFixed(2)} ${(12 + Math.sin(angle) * radius!).toFixed(2)}`;
    });
    path.setAttribute(
      "d",
      "M" +
        points.join("L") +
        "Z M15.2 12a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0",
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    return svg;
  }
  function waitingIndicator(className = "thinking") {
    const indicator = node("div", className),
      dots = node("span", "dots"),
      label = node("span");
    dots.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 9; index++) {
      const dot = node("span", "dot");
      dot.style.setProperty("--dot", String(index));
      dots.append(dot);
    }
    indicator.append(dots, label);
    indicator.hidden = true;
    return { indicator, label };
  }
  function createCard(entry: Omit<Entry, "card" | "ui">) {
    const card = document.createElement("grok-first-card"),
      shadow = card.attachShadow({ mode: "open" });
    card.tabIndex = 0;
    const css = node("style");
    css.textContent = `
      :host{all:initial;font-family:var(--gf-font,system-ui);color:var(--gf-fg,#e7e9ea);font-size:var(--gf-size,15px);line-height:var(--gf-leading,1.4);cursor:auto;color-scheme:var(--gf-scheme,dark);}
      :host([hidden]){display:none!important;}:host(:focus-visible){outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:-2px;}*{box-sizing:border-box;min-width:0;}.card{position:absolute;left:0;right:0;max-width:100%;overflow-x:hidden;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--gf-muted,#71767b) var(--gf-bg,#000);background:var(--gf-bg,#000);padding:12px 16px;}
      button{font:inherit;color:var(--gf-accent,#1d9bf0);border:0;background:transparent;cursor:pointer;padding:2px 0}button:hover{text-decoration:underline;}button:disabled{color:var(--gf-muted,#71767b);cursor:default;text-decoration:none}button:focus-visible,a:focus-visible{outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:2px}
      .status{color:var(--gf-muted,#71767b);font-size:12px;margin-bottom:10px;overflow-wrap:anywhere}.status[hidden]{display:none}.answer{white-space:normal;overflow-wrap:anywhere;}
      .status-settings{font:inherit;padding:0;vertical-align:baseline}
      .answer p{margin:0 0 12px}.answer h1,.answer h2,.answer h3,.answer h4,.answer h5,.answer h6{font-size:1em;font-weight:700;line-height:1.4;margin:16px 0 8px}.answer h1{font-size:1.15em}.answer h2{font-size:1.08em}.answer>:first-child{margin-top:0}.answer>:last-child{margin-bottom:0}
      .answer ul,.answer ol{margin:8px 0 12px;padding-inline-start:24px}.answer li{margin:4px 0}.answer li>p{margin:4px 0}.answer li>ul,.answer li>ol{margin:4px 0}.answer blockquote{margin:12px 0;padding-inline-start:12px;border-inline-start:2px solid var(--gf-border,#2f3336);color:var(--gf-muted,#71767b)}.answer blockquote>:last-child{margin-bottom:0}
      .answer code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em;white-space:pre-wrap;overflow-wrap:anywhere;background:rgba(127,127,127,.13);padding:1px 4px}.answer pre{max-width:100%;margin:12px 0;padding:10px;border:1px solid var(--gf-border,#2f3336);white-space:pre-wrap;overflow-wrap:anywhere}.answer pre code{display:block;font-size:.85em;background:transparent;padding:0;white-space:pre-wrap;overflow-wrap:anywhere}.answer hr{border:0;border-top:1px solid var(--gf-border,#2f3336);margin:16px 0}
      .answer .analysis-section>:first-child{margin-top:0}.answer .analysis-section>:last-child{margin-bottom:0}.answer .analysis-divider{margin:16px 0}.answer .analysis-divider[hidden],.answer .verification-answer[hidden]{display:none}
      .answer table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;font-size:.9em;margin:12px 0}.answer th,.answer td{border:1px solid var(--gf-border,#2f3336);padding:6px;text-align:start;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}.answer th{font-weight:700}.answer .md-align-left{text-align:left}.answer .md-align-center{text-align:center}.answer .md-align-right{text-align:right}.answer .markdown-literal{white-space:pre-wrap}
      .answer .md-citation{font-size:.75em;line-height:0;vertical-align:super;white-space:nowrap}.answer .md-citation a{padding-inline:1px}
      a{color:var(--gf-accent,#1d9bf0);text-decoration:none;overflow-wrap:anywhere;word-break:break-word;}a:hover{text-decoration:underline}.sources{font-size:13px;display:grid;grid-template-columns:minmax(0,1fr);gap:4px;margin-top:12px}.sources:empty{display:none}.note{color:var(--gf-muted,#71767b);font-size:12px;margin-top:12px;overflow-wrap:anywhere;}.note:empty{display:none}
      .actions{display:none;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:13px}.actions:has(button:not([hidden])){display:flex}.actions button[hidden]{display:none}
      .retry-status{color:var(--gf-muted,#71767b);font-size:12px;overflow-wrap:anywhere;margin-top:10px}.retry-status[hidden]{display:none}
      .thinking{display:flex;align-items:center;gap:10px;color:var(--gf-muted,#71767b);font-size:13px;margin:12px 0}.thinking[hidden]{display:none}.dots{display:grid;grid-template-columns:repeat(3,3px);gap:3px;flex:none}.dot{width:3px;height:3px;background:currentColor;border-radius:50%;animation:gf-dot 1.2s ease-in-out infinite;animation-delay:calc(var(--dot)*.09s)}
      .shimmer{background-image:linear-gradient(to right,#64696d 0%,#b6b9bc 20%,#595d62 40%,#64696d 100%);background-size:9em 100%;background-clip:text;-webkit-background-clip:text;color:transparent;animation:gf-shimmer .7s linear infinite}
      @keyframes gf-shimmer{0%{background-position-x:-2em}100%{background-position-x:7em}}@keyframes gf-dot{0%,100%{opacity:.28}50%{opacity:1}}
      .comments{display:grid;gap:0;margin-top:12px;border-top:1px solid var(--gf-border,#2f3336)}.comments[hidden],.comment-status[hidden]{display:none}.comments .comment-copy{display:block;width:100%;padding:10px 0;text-align:start;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--gf-fg,#e7e9ea);font-size:14px;border-bottom:1px solid var(--gf-border,#2f3336)}.comments .comment-copy:hover{background:rgba(127,127,127,.1);text-decoration:none}.comment-heading{font-size:13px;font-weight:700;margin-top:16px}.comment-hint{font-size:12px;color:var(--gf-muted,#71767b);margin-top:4px}.comment-heading[hidden],.comment-hint[hidden]{display:none}.comment-status,.copy-status{font-size:12px;color:var(--gf-muted,#71767b);overflow-wrap:anywhere;margin-top:10px}.copy-status:empty{display:none}
      @media(prefers-reduced-motion:reduce){.dot{animation:none;opacity:.7}.shimmer{animation:none;background:none;color:var(--gf-muted,#71767b)}}
      .diagnostics{font-size:12px;color:var(--gf-muted,#71767b);margin-top:12px}.diagnostics[hidden]{display:none}.diagnostics summary{cursor:pointer}.diagnostics pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
      .token-usage{display:block;color:var(--gf-muted,#71767b);font-size:12px;margin-bottom:10px;overflow-wrap:anywhere;cursor:help}.token-usage[hidden]{display:none}.token-usage:focus-visible{outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:2px}
    `;
    const box = node("section", "card");
    box.setAttribute("aria-label", t("aria.result"));
    const status = node("div", "status"),
      answer = node("div", "answer"),
      sources = node("div", "sources"),
      note = node("div", "note"),
      actions = node("div", "actions");
    status.setAttribute("role", "status");
    answer.setAttribute("dir", "auto");
    const explanationAnswer = node(
        "div",
        "analysis-section explanation-answer",
      ),
      verificationAnswer = node("div", "analysis-section verification-answer"),
      analysisDivider = node("hr", "analysis-divider");
    analysisDivider.hidden = true;
    const { indicator: thinking, label: thinkingLabel } = waitingIndicator();
    const {
      indicator: verificationThinking,
      label: verificationThinkingLabel,
    } = waitingIndicator("thinking verification-thinking");
    verificationThinkingLabel.classList.add("shimmer");
    const diagnostics = node("details", "diagnostics"),
      diagnosticText = node("pre"),
      diagnosticLabel = node("summary", "", t("common.diagnostics"));
    diagnostics.hidden = true;
    diagnostics.append(diagnosticLabel, diagnosticText);
    const retry = node("button", "retry", t("common.retry"));
    retry.hidden = true;
    retry.addEventListener("click", () => {
      if (
        retry.disabled ||
        [...requests.values()].some(
          (r) => r.entry === entry && r.task === "analysis",
        )
      )
        return;
      for (const pending of allEntries())
        if (pending.status === "new") refreshCard(pending);
      if (entry.status === "new" && !automaticEntry(entry as Entry)) {
        if (entry.cacheLookupId || entry.cacheLookupDeferred) return;
        submit(entry as Entry, false, false, true);
      } else submit(entry as Entry, true);
    });
    const generateButton = node(
      "button",
      "generate-comments",
      t("common.generateComments"),
    );
    generateButton.addEventListener("click", () =>
      generateComments(entry as Entry),
    );
    const comments = node("div", "comments"),
      commentStatus = node("div", "comment-status"),
      copyStatus = node("div", "copy-status");
    commentStatus.hidden = true;
    comments.hidden = true;
    commentStatus.setAttribute("role", "status");
    copyStatus.setAttribute("role", "status");
    const commentHeading = node("div", "comment-heading"),
      commentHint = node("div", "comment-hint");
    commentHeading.hidden = commentHint.hidden = true;
    const retryStatus = node("div", "retry-status analysis-retry-status"),
      commentRetryStatus = node("div", "retry-status comment-retry-status");
    for (const label of [retryStatus, commentRetryStatus]) {
      label.hidden = true;
      label.setAttribute("role", "status");
      label.setAttribute("aria-live", "polite");
    }
    const tokenUsage = node("span", "token-usage");
    tokenUsage.hidden = true;
    tokenUsage.tabIndex = 0;
    actions.append(retry, generateButton);
    box.append(
      tokenUsage,
      status,
      thinking,
      answer,
      verificationThinking,
      sources,
      note,
      diagnostics,
      retryStatus,
      actions,
      commentStatus,
      commentRetryStatus,
      commentHeading,
      commentHint,
      comments,
      copyStatus,
    );
    shadow.append(css, box);
    // Card controls belong to the overlay, separate from X's navigation handlers.
    for (const type of ["click", "pointerdown", "keydown"])
      card.addEventListener(type, (event) => event.stopPropagation());
    card.addEventListener("scroll", scheduleLayout, { passive: true });
    return {
      card,
      ui: {
        box,
        status,
        thinking,
        thinkingLabel,
        verificationThinking,
        verificationThinkingLabel,
        answer,
        explanationAnswer,
        verificationAnswer,
        analysisDivider,
        sources,
        note,
        retry,
        retryStatus,
        commentRetryStatus,
        generateComments: generateButton,
        comments,
        commentStatus,
        commentHeading,
        commentHint,
        copyStatus,
        diagnostics,
        diagnosticLabel,
        diagnosticText,
        tokenUsage,
      },
    };
  }
  function validVerificationBoundary(text: string, start: number | undefined) {
    return (
      typeof text === "string" &&
      Number.isSafeInteger(start) &&
      start! > 2 &&
      start! <= text.length &&
      text.slice(start! - 2, start) === "\n\n" &&
      Boolean(text.slice(0, start! - 2).trim())
    );
  }
  function renderAnswerContent(entry: Entry) {
    const text = entry.latestText,
      ui = entry.ui;
    const verifying =
      ["queued", "running", "retry-wait"].includes(entry.status) &&
      ["verification_queued", "verify", "verification"].includes(entry.phase!);
    let start = validVerificationBoundary(text!, entry.verificationStart)
      ? entry.verificationStart
      : undefined;
    // The live stage snapshot also supports an older background worker during
    // reload. Cached text without metadata is never split by guessed headings.
    const base = entry.verificationBase;
    if (start === undefined && base?.trim() && text!.startsWith(base + "\n\n"))
      start = base.length + 2;
    const pending =
      start === undefined && verifying && base?.trim() && text === base;
    const explanation = start === undefined ? text : text!.slice(0, start - 2),
      check = start === undefined ? "" : text!.slice(start);
    if (
      explanation!.trim() &&
      (pending || (start !== undefined && (check.trim() || verifying)))
    ) {
      if (!entry.answerSplit)
        ui.answer.replaceChildren(
          ui.explanationAnswer,
          ui.analysisDivider,
          ui.verificationAnswer,
        );
      entry.answerSplit = true;
      // Once explanation is complete, retain its DOM while verification streams.
      if (entry.explanationRendered !== explanation) {
        renderText(ui.explanationAnswer, explanation!);
        entry.explanationRendered = explanation;
      }
      if (entry.verificationRendered !== check) {
        renderText(ui.verificationAnswer, check);
        entry.verificationRendered = check;
      }
      ui.verificationAnswer.hidden = !check.trim();
    } else {
      entry.answerSplit = false;
      entry.explanationRendered = entry.verificationRendered = undefined;
      renderText(ui.answer, text!);
    }
    syncLoading(entry);
  }
  function renderAnswer(entry: Entry, text: string = "", immediate = false) {
    entry.latestText = typeof text === "string" ? text : "";
    if (!entry.latestText) {
      entry.verificationStart = undefined;
      entry.verificationBase = "";
    }
    syncLoading(entry);
    if (immediate) {
      if (entry.answerFrame !== undefined)
        cancelAnimationFrame(entry.answerFrame);
      entry.answerFrame = undefined;
      renderAnswerContent(entry);
      renderSources(entry);
      return;
    }
    if (entry.answerFrame !== undefined) return;
    entry.answerFrame = requestAnimationFrame(() => {
      entry.answerFrame = undefined;
      if (!entry.card.isConnected) return;
      renderAnswerContent(entry);
      renderSources(entry);
      scheduleLayout();
    });
  }
  function renderText(target: HTMLElement, text: string) {
    GrokFirstMarkdown.render(target, text);
  }
  function sourceUrl(value: string | undefined) {
    try {
      const url = new URL(value!);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password
        ? url
        : null;
    } catch {
      return null;
    }
  }
  function sourceLabel(source: Source, url: URL) {
    const title = typeof source.title === "string" ? source.title.trim() : "";
    const numbered = /^[\s\[\](){}【】#.*]*\d+[\s\[\](){}【】#.*]*$/.test(
      title,
    );
    if (title && !numbered && !sourceUrl(title)) return title.slice(0, 200);
    // Never invent a publication title or fetch a page just to label a link.
    let path = url.pathname === "/" ? "" : url.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {}
    return (url.hostname + path + url.search + url.hash).slice(0, 200);
  }
  function renderSources(entry: Entry, sources?: Source[]) {
    if (sources !== undefined)
      entry.sourceList = Array.isArray(sources) ? sources : [];
    const target = entry.ui.sources;
    target.replaceChildren();
    const seen = new Set(
      Array.from(entry.ui.answer.querySelectorAll<HTMLAnchorElement>("a"))
        .map((link) => sourceUrl(link.href)?.href)
        .filter(Boolean),
    );
    let count = 0;
    for (const source of entry.sourceList || []) {
      const url = sourceUrl(source?.url);
      if (!url || seen.has(url.href)) continue;
      seen.add(url.href);
      const link = node("a", "", sourceLabel(source, url));
      link.href = url.href;
      link.title = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      target.append(link);
      if (++count === 12) break;
    }
  }
})();

export type {};
