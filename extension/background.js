// GENERATED from src/background/worker.ts. Edit src/ and run npm run build.
importScripts(
  "feed-core.js",
  "api-provider.js",
  "native-provider.js",
  "build-acp.js",
  "build-transport.js",
  "build-provider.js",
  "build-setup.js",
  "ui-i18n.js",
  "key-store.js",
  "oauth-provider.js",
  "history-store.js",
  "answer-cache.js",
  "provider-registry.js"
);
const Core = XGrokCore;
const UI = GrokFirstUI;
const KeyStore = SuperXKeyStore;
const BuildKeyStore = SuperXBuildConnectionStore;
const native = SuperXNative.create({ chrome, crypto: globalThis.crypto });
const providers = SuperXProviders.create({
  core: Core,
  api: GrokFirstAPI,
  build: SuperXBuild,
  native: { run: native.run, publicError: SuperXNative.publicError }
});
const answers = SuperXAnswerCache.create({ indexedDB: globalThis.indexedDB });
let answerCacheReady = false;
const answerPending = /* @__PURE__ */ new Map();
let answerClearBarrier = Promise.resolve();
const history = SuperXHistoryStore.create(chrome.storage.local);
const HISTORY_ALARM = "SUPERX_HISTORY_CLEANUP";
const clients = /* @__PURE__ */ new Set();
let clientSequence = 0;
const jobs = /* @__PURE__ */ new Map();
const flights = /* @__PURE__ */ new Map(), subscriptions = /* @__PURE__ */ new Map();
const runningJobs = /* @__PURE__ */ new Set();
const apiSlots = /* @__PURE__ */ new Set();
let railWidth = 0, railWidthWrites = Promise.resolve();
let queue = [], pumping = false, settings, cache = {}, quotas = {}, railStates = {}, revision = 0, cacheEpoch = 0;
let uiLanguage = UI.browserLanguage(globalThis);
let apiDiagnostics = [], apiDiagnosticsEpoch = 0, apiDiagnosticsReady = Promise.resolve(), apiDiagnosticsWrites = Promise.resolve();
let quotaWrites = Promise.resolve(), cacheWrites = Promise.resolve(), railStateWrites = Promise.resolve(), uiLanguageWrites = Promise.resolve();
let securityWrites = Promise.resolve(), securityPending = 0, securityGeneration = 0;
let hasSavedKey = false, rememberApiKey = true, credentialReady = false, securityFault = false, sealAttempted = false;
let buildStatus = {
  connected: false,
  installed: false,
  available: false,
  errorCode: "BUILD_NOT_CONNECTED"
}, buildStatusAt = 0, buildStatusPending;
let buildSecret = "", buildConnectionGeneration = 0, buildConnectionPending = 0;
let nativeFaultCode = "";
let oauthGeneration = 0, oauthActionGeneration = 0, oauthPendingLogins = 0, oauthCredentialIdentity = "", oauthReady = Promise.resolve(), providerFault = false;
const oauth = SuperXOAuth.create({
  chrome,
  fetch: globalThis.fetch?.bind(globalThis),
  crypto: globalThis.crypto,
  keyStore: KeyStore.create?.({ purpose: "oauth-refresh" }),
  onChange: onOAuthChanged
});
const CACHE_TTL = 24 * 60 * 60 * 1e3;
const ready = initialize();
async function initialize() {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS"
  });
  await chrome.storage.session.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS"
  });
  apiDiagnosticsReady = loadAPIDiagnostics();
  const local = await chrome.storage.local.get([
    "settings",
    "uiLanguage",
    "apiKey",
    "apiKeyEncrypted",
    "apiKeyVault",
    "rememberApiKey",
    "buildConnectionEncrypted",
    "invalidAnswerSource",
    "railWidth"
  ]);
  const session = await chrome.storage.session.get([
    "quotas",
    "railStates",
    "uiLanguage",
    "apiKey",
    "cache",
    "securityFault",
    "apiBudgetPause",
    "apiCapacityPause"
  ]);
  railWidth = validRailWidth(local.railWidth) ? local.railWidth : 0;
  const hasSettings = local.settings && typeof local.settings === "object" && !Array.isArray(local.settings) && Object.keys(local.settings).length > 0;
  const legacyConnection = KeyStore.envelopePresent(local.apiKeyEncrypted) || validKey(local.apiKey) || local.apiKeyVault !== void 0 || validKey(session.apiKey) || BuildKeyStore.envelopePresent(local.buildConnectionEncrypted);
  settings = Core.normalizeSettings(
    !hasSettings && legacyConnection ? { provider: "api" } : local.settings
  );
  providerFault = local.invalidAnswerSource === true || Boolean(
    local.settings?.provider && !["api", "build", "oauth", "native", "x-native"].includes(
      local.settings.provider
    )
  );
  if (providerFault)
    await chrome.storage.local.set({ invalidAnswerSource: true });
  oauthReady = Promise.resolve(oauth.initialize()).catch(() => {
  });
  try {
    await chrome.storage.session.remove(["apiBudgetPause", "apiCapacityPause"]);
  } catch {
  }
  if (BuildKeyStore.envelopePresent(local.buildConnectionEncrypted)) {
    try {
      const secret = await BuildKeyStore.open(local.buildConnectionEncrypted);
      if (validBuildSecret(secret)) buildSecret = secret;
    } catch {
    }
  }
  securityFault = session.securityFault === true;
  const storedCredential = KeyStore.envelopePresent(local.apiKeyEncrypted) || validKey(local.apiKey) || local.apiKeyVault !== void 0;
  rememberApiKey = typeof local.rememberApiKey === "boolean" ? local.rememberApiKey : Boolean(storedCredential) || !validKey(session.apiKey);
  try {
    const encrypted = KeyStore.envelopePresent(local.apiKeyEncrypted);
    const available = encrypted ? await KeyStore.open(local.apiKeyEncrypted) : validKey(local.apiKey) ? local.apiKey.trim() : validKey(session.apiKey) ? session.apiKey.trim() : "";
    if (encrypted && !validKey(available))
      throw new Error("Invalid stored credential.");
    if (encrypted || validKey(local.apiKey) || local.apiKeyVault !== void 0 && available) {
      if (rememberApiKey) {
        if (!encrypted) await persistEncryptedKey(available);
        else await chrome.storage.local.remove(["apiKey", "apiKeyVault"]);
      } else {
        await chrome.storage.local.remove([
          "apiKey",
          "apiKeyEncrypted",
          "apiKeyVault"
        ]);
        await KeyStore.clear();
      }
      await chrome.storage.session.set({ apiKey: available });
      session.apiKey = available;
    }
  } catch {
    securityFault = true;
    session.apiKey = void 0;
    try {
      await chrome.storage.session.remove("apiKey");
    } catch {
    }
    try {
      await chrome.storage.session.set({ securityFault: true });
    } catch {
    }
  }
  const stored = await chrome.storage.local.get([
    "apiKey",
    "apiKeyEncrypted",
    "apiKeyVault"
  ]);
  hasSavedKey = KeyStore.envelopePresent(stored.apiKeyEncrypted) || validKey(stored.apiKey) || stored.apiKeyVault !== void 0;
  credentialReady = validKey(session.apiKey);
  const legacy = pruneCache(session.cache);
  cache = Object.fromEntries(
    Object.entries(legacy).filter(([, value]) => Array.isArray(value.comments))
  );
  quotas = session.quotas || {};
  railStates = session.railStates || {};
  try {
    await answers.ready();
    await answers.migrate(
      Object.entries(legacy).filter(([key, value]) => {
        if (Array.isArray(value.comments) || !cacheableAnswer(value))
          return false;
        try {
          const identity = JSON.parse(key);
          return identity[1] !== "x-native" && (identity[1] !== "oauth" || identity[2]?.[0] === oauth.status().credentialId);
        } catch {
          return true;
        }
      }),
      answerBudget()
    );
    await answers.trim(answerBudget());
    answerCacheReady = true;
  } catch {
  }
  await chrome.storage.local.remove("cache");
  if (session.cache !== void 0)
    try {
      await persistCache(cacheEpoch);
    } catch {
    }
  uiLanguage = UI.normalizeLanguage(
    session.uiLanguage || local.uiLanguage || uiLanguage
  );
  if (JSON.stringify(local.settings) !== JSON.stringify(settings))
    await chrome.storage.local.set({ settings });
  if (typeof local.rememberApiKey !== "boolean")
    await chrome.storage.local.set({ rememberApiKey });
  void history.prune().then(() => broadcastHistoryConfig()).catch(() => {
  });
  try {
    await chrome.alarms?.create(HISTORY_ALARM, { periodInMinutes: 60 });
  } catch {
  }
}
function validKey(value) {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= 500 && !/[\r\n]/.test(value);
}
function securityAllowsCalls() {
  return !securityFault && credentialReady && securityPending === 0;
}
function buildReady() {
  return buildConnectionPending === 0 && validBuildSecret(buildSecret) && buildStatus.connected === true && buildStatus.installed === true && buildStatus.available === true && buildStatus.authenticated === true && buildStatus.permission !== false;
}
function providerAllowsCalls(s = settings) {
  if (providerFault) return false;
  if (s?.provider === "x-native") return !nativeFaultCode;
  if (s?.provider === "api") return securityAllowsCalls();
  if (s?.provider === "build") return buildReady();
  if (s?.provider === "oauth") {
    const state = oauth.status();
    return state.connected === true && Boolean(state.credentialId) && state.catalogModels?.some(
      (item) => (typeof item === "string" ? item : item?.id) === s.oauthModel
    );
  }
  return false;
}
function oauthFeedStatus() {
  const state = oauth.status();
  return {
    state: state.state,
    connected: state.connected === true,
    credentialId: state.credentialId || "",
    errorCode: state.errorCode || "",
    modelAvailable: state.catalogModels?.some(
      (item) => (typeof item === "string" ? item : item?.id) === settings?.oauthModel
    ) === true
  };
}
function onOAuthChanged() {
  const state = oauth.status(), identity = state.credentialId || "";
  if (identity !== oauthCredentialIdentity) {
    oauthCredentialIdentity = identity;
    oauthGeneration++;
    for (const job of [...jobs.values()].filter(
      (value) => value.settings.provider === "oauth"
    ))
      abortJob(job);
    for (const key of Object.keys(cache)) {
      try {
        const partition = JSON.parse(key);
        if (partition[1] === "oauth" && (!identity || partition[2]?.[0] !== identity))
          delete cache[key];
      } catch {
        delete cache[key];
      }
    }
    cacheEpoch++;
    void queueAnswerWrite(
      () => answers.removeProvider("oauth", identity)
    ).catch(() => {
    });
    if (settings?.provider === "oauth")
      void history.invalidateResults?.().catch(() => {
      });
  }
  void Promise.resolve().then(() => ready).then(async () => {
    await chrome.runtime.sendMessage({
      type: "OAUTH_STATUS_CHANGED",
      oauthStatus: oauth.status()
    }).catch(() => {
    });
    await broadcastConfig();
    pump();
  }).catch(() => {
  });
}
function selectedEffort(value) {
  return Core.providerEffort ? Core.providerEffort(value) : value.provider === "oauth" ? value.oauthReasoningEffort : value.provider === "build" ? value.buildReasoningEffort : Core.reasoningEffort(value.apiModel, value.apiReasoningEffort);
}
function historyScope(value = settings) {
  return value.provider === "oauth" ? "oauth:" + (value.oauthCredentialId || oauth.status().credentialId || "signed-out") : value.provider;
}
function scopedHistory(result) {
  const scope = historyScope();
  return {
    ...result,
    entries: (result.entries || []).map((value) => {
      const entry = { ...value };
      if (entry.analysis && (scope === "x-native" || (entry.analysis.scope || "api") !== scope))
        delete entry.analysis;
      if (scope === "x-native" || (entry.commentsScope || "api") !== scope)
        for (const field of [
          "comments",
          "commentsScope",
          "commentsLanguage",
          "commentsModel",
          "commentsUsage",
          "commentsCompletedAt"
        ])
          delete entry[field];
      return entry;
    })
  };
}
function validBuildSecret(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24,256}$/.test(value) && !/^(?:xai|sk)-/i.test(value);
}
function buildConnection(input = {}) {
  const port = input.port === void 0 ? settings.buildPort : input.port, secret = input.secret === void 0 ? buildSecret : input.secret;
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !validBuildSecret(secret))
    throw Object.assign(new Error("Invalid local connection settings."), {
      code: "BUILD_CONNECTION_REQUIRED"
    });
  return { port, secret };
}
async function probeBuild(connection) {
  if (chrome.permissions?.contains && !await chrome.permissions.contains({ origins: ["http://127.0.0.1/*"] }))
    return {
      connected: false,
      installed: false,
      available: false,
      errorCode: "BUILD_PERMISSION_REQUIRED"
    };
  return SuperXBuild.status({ connection });
}
function sameBuildConnection(value) {
  return value.port === settings.buildPort && value.secret === buildSecret;
}
async function checkBuildDraft(message) {
  let connection;
  try {
    connection = buildConnection(message);
  } catch (caught) {
    const error = caught;
    return {
      ok: true,
      connected: false,
      available: false,
      ready: false,
      errorCode: error.code
    };
  }
  if ([...runningJobs].some((job) => job.settings.provider === "build")) {
    if (sameBuildConnection(connection))
      return { ok: true, ...buildStatus, ready: buildReady(), busy: true };
    return {
      ok: true,
      connected: false,
      available: false,
      ready: false,
      errorCode: "BUILD_BUSY"
    };
  }
  if (sameBuildConnection(connection)) {
    const status2 = await refreshBuildStatus(true);
    void broadcastConfig();
    return { ok: true, ...status2, ready: buildReady() };
  }
  const status = await probeBuild(connection);
  return {
    ok: true,
    ...status,
    ready: status.available === true && status.authenticated === true && status.connected === true
  };
}
function newBuildSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "superx_" + [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}
function buildStorageError() {
  return { ok: false, errorKey: "build.storageError" };
}
function queueBuildConnection(message, clear = false) {
  let connection;
  try {
    if (!clear) connection = buildConnection(message);
  } catch {
    return Promise.resolve({ ok: false, errorKey: "build.codeRequired" });
  }
  const next = message.settings === void 0 ? void 0 : Core.normalizeSettings({
    ...message.settings,
    buildPort: connection?.port ?? settings.buildPort
  });
  if (next && next.provider !== "x-native" && !next.webSearch && !next.xSearch)
    return Promise.resolve({
      ok: false,
      errorKey: "options.urlSearchRequired"
    });
  if (!clear && sameBuildConnection(connection))
    return queueSettingsMutation(next ?? settings);
  const generation = ++buildConnectionGeneration;
  buildConnectionPending++;
  if (settings.provider === "build") revision++;
  for (const job of [...jobs.values()].filter(
    (job2) => job2.settings.provider === "build"
  ))
    abortJob(job);
  buildStatusAt = 0;
  buildStatus = {
    connected: false,
    available: false,
    installed: false,
    errorCode: "BUILD_CONNECTION_REQUIRED"
  };
  void broadcastConfig();
  const operation = securityWrites.catch(() => {
  }).then(async () => {
    let failure;
    try {
      await SuperXBuild.close?.();
      if (clear) {
        await chrome.storage.local.remove("buildConnectionEncrypted");
        await BuildKeyStore.clear();
        buildSecret = "";
      } else {
        const envelope = await BuildKeyStore.seal(connection.secret);
        if (!BuildKeyStore.isEnvelope(envelope) || await BuildKeyStore.open(envelope) !== connection.secret)
          throw 0;
        await chrome.storage.local.set({
          buildConnectionEncrypted: envelope
        });
        const saved = await chrome.storage.local.get(
          "buildConnectionEncrypted"
        );
        if (!BuildKeyStore.isEnvelope(saved.buildConnectionEncrypted) || await BuildKeyStore.open(saved.buildConnectionEncrypted) !== connection.secret)
          throw 0;
        buildSecret = connection.secret;
        await saveSettings(
          next ?? { ...settings, buildPort: connection.port }
        );
      }
      cache = Object.fromEntries(
        Object.entries(cache).filter(([key]) => {
          try {
            return JSON.parse(key)[1] !== "build";
          } catch {
            return true;
          }
        })
      );
      cacheEpoch++;
      await queueAnswerWrite(() => answers.removeProvider("build"));
      await persistCache(cacheEpoch);
    } catch {
      failure = buildStorageError();
      buildSecret = "";
    } finally {
      buildConnectionPending--;
    }
    if (generation === buildConnectionGeneration) {
      buildStatusAt = 0;
      buildStatus = {
        connected: false,
        installed: false,
        available: false,
        errorCode: "BUILD_CONNECTION_REQUIRED"
      };
    }
    await broadcastConfig();
    return failure ?? {
      ok: true,
      configured: validBuildSecret(buildSecret),
      port: settings.buildPort
    };
  });
  securityWrites = operation;
  return operation;
}
async function refreshBuildStatus(force = false) {
  if (buildReady() && [...runningJobs].some((job) => job.settings.provider === "build")) {
    buildStatusAt = Date.now();
    return { ...buildStatus, busy: true };
  }
  if (buildConnectionPending) return buildStatus;
  if (buildStatusPending) return buildStatusPending;
  if (!force && Date.now() - buildStatusAt < 1e4) return buildStatus;
  const generation = buildConnectionGeneration;
  const pending = (async () => {
    try {
      const status = await probeBuild(buildConnection());
      if (generation === buildConnectionGeneration) buildStatus = status;
    } catch (error) {
      if (generation === buildConnectionGeneration)
        buildStatus = {
          connected: false,
          installed: false,
          available: false,
          errorCode: SuperXBuild.publicError(error).code
        };
    }
    if (generation === buildConnectionGeneration) buildStatusAt = Date.now();
    return buildStatus;
  })();
  buildStatusPending = pending;
  try {
    await pending;
  } finally {
    if (buildStatusPending === pending) buildStatusPending = void 0;
  }
  if (generation !== buildConnectionGeneration && !buildConnectionPending)
    return refreshBuildStatus(force);
  return buildStatus;
}
function ensureBuildStatus() {
  if (buildConnectionPending) return;
  if (!buildStatusPending && (!buildStatusAt || Date.now() - buildStatusAt > 1e4))
    void refreshBuildStatus().then(() => broadcastConfig()).then(() => pump()).catch(() => {
    });
}
function securityStatus() {
  return {
    keyState: securityAllowsCalls() ? "ready" : hasSavedKey && !credentialReady ? "migration" : "missing",
    remember: rememberApiKey,
    hasSavedKey
  };
}
function isX(url) {
  try {
    return ["x.com", "twitter.com"].includes(new URL(url).hostname) && new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
function isFeed(url) {
  return isX(url) && !/^\/(?:messages|i\/(?:chat|grok|flow|premium|settings))\b/.test(
    new URL(url).pathname
  );
}
function trustedUI(sender) {
  try {
    const url = new URL(sender.url), base = new URL(chrome.runtime.getURL(""));
    return sender.id === chrome.runtime.id && url.protocol === base.protocol && url.host === base.host && ["/options.html", "/popup.html", "/history.html", "/setup.html"].includes(
      url.pathname
    );
  } catch {
    return false;
  }
}
function trustedFeed(sender) {
  return sender.id === chrome.runtime.id && sender.frameId === 0 && Number.isInteger(sender.tab?.id) && isFeed(sender.url);
}
function postJob(job) {
  return !commentsJob(job) && !draftJob(job);
}
function collapsedRailWorkAllowed(job) {
  return draftJob(job) || postJob(job) && (job.force || job.prefetch && job.started);
}
function currentTaskAllowed(job) {
  return !postJob(job) || job.started || job.force || settings.enabled;
}
function removePausedAutomaticJobs() {
  for (const job of [...jobs.values()])
    if (!currentTaskAllowed(job)) {
      jobError(job, "已暂停自动分析。", "PAUSED");
      abortJob(job, true);
    }
  queue = queue.filter((job) => jobs.get(job.key) === job);
}
function paidTaskSettings(value = {}) {
  const {
    explainPrompt,
    verifyPrompt,
    draftPrompt,
    postDraftPrompt,
    replyDraftPrompt,
    commentsPrompt,
    interfaceLanguage,
    dwellMs,
    analysisDefaultsVersion,
    oauthRemember,
    enabled,
    answerCacheLimitMB,
    prefetchCount,
    prefetchAll,
    ...other
  } = value;
  return other;
}
function validRailWidth(value) {
  return value === 0 || Number.isSafeInteger(value) && value >= 220;
}
function send(port, message) {
  try {
    port.postMessage(message);
  } catch {
  }
}
async function publicConfig() {
  const generation = securityGeneration, canRefresh = securityPending === 0;
  const session = settings.provider === "api" ? await chrome.storage.session.get("apiKey") : {};
  if (settings.provider === "api" && canRefresh && generation === securityGeneration && securityPending === 0)
    credentialReady = validKey(session.apiKey);
  const status = securityStatus();
  const historyConfig = history.config();
  if (settings.provider === "build") ensureBuildStatus();
  return {
    settings,
    railWidth,
    answerCacheReady,
    nativeStatus: { errorCode: nativeFaultCode },
    taskRevision: revision,
    ready: providerAllowsCalls(),
    keyState: status.keyState,
    credentialIdentity: settings.provider === "oauth" ? oauthCredentialIdentity : "",
    oauthStatus: oauthFeedStatus(),
    apiBudgetPaused: false,
    apiCapacityPaused: false,
    ...settings.provider === "build" ? { buildStatus: { ...buildStatus, ready: buildReady() } } : {},
    buildConnection: {
      configured: validBuildSecret(buildSecret),
      port: settings.buildPort
    },
    historyEnabled: historyConfig.enabled,
    historyEpoch: historyConfig.epoch
  };
}
async function notifyHistoryChanged() {
  await chrome.runtime.sendMessage({ type: "HISTORY_CHANGED", ...history.config() }).catch(() => {
  });
}
async function broadcastHistoryConfig() {
  const config = history.config();
  for (const client of clients)
    send(client.port, { type: "HISTORY_CONFIG", ...config });
  await notifyHistoryChanged();
}
function historyTicket(post, snapshot = settings) {
  if (snapshot.provider === "x-native") return null;
  const scope = historyScope(snapshot), capturedRevision = revision;
  return history.capture(post.id).then((ticket) => ({ ticket, scope, revision: capturedRevision })).catch(() => null);
}
function rememberHistoryResult(ticket, result, comments = false, language = "") {
  if (!comments && Core.readerOutput(result?.text, { final: true }).kind !== "content")
    return;
  void Promise.resolve(ticket).then((value) => {
    if (!value || value.scope === "x-native" || value.revision !== revision || value.scope !== historyScope())
      return;
    return comments ? history.comments(value.ticket, {
      ...result,
      language,
      scope: value.scope
    }) : history.analysis(value.ticket, {
      ...result,
      language,
      scope: value.scope
    });
  }).then(() => notifyHistoryChanged()).catch(() => {
  });
}
async function broadcastConfig() {
  const config = await publicConfig();
  for (const client of clients)
    send(client.port, {
      type: "CONFIG",
      ...config,
      used: quotas[client.tabId] || 0,
      collapsed: Boolean(railStates[client.tabId]),
      uiLanguage: client.uiLanguage
    });
  void chrome.runtime.sendMessage({ type: "CONFIG", ...config, oauthStatus: oauth.status() }).catch(() => {
  });
}
async function currentUILanguage() {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    const active = tabs.find((tab) => isFeed(tab.pendingUrl || tab.url));
    const client = active && [...clients].find((value) => value.tabId === active.id);
    if (client) return client.uiLanguage;
  } catch {
  }
  return uiLanguage;
}
function updateUILanguage(client, value) {
  client.uiLanguage = UI.normalizeLanguage(value);
  uiLanguage = client.uiLanguage;
  const language = uiLanguage;
  for (const peer of clients)
    if (peer.tabId === client.tabId) peer.uiLanguage = language;
  uiLanguageWrites = uiLanguageWrites.catch(() => {
  }).then(async () => {
    await Promise.all([
      chrome.storage.session.set({ uiLanguage: language }),
      chrome.storage.local.set({ uiLanguage: language })
    ]);
    await chrome.runtime.sendMessage({ type: "UI_LANGUAGE_CHANGED", language }).catch(() => {
    });
  });
  return uiLanguageWrites;
}
function sanitizePostImages(input) {
  const raw = input;
  const images = [], seen = /* @__PURE__ */ new Set();
  for (const image of Array.isArray(raw) ? raw.slice(0, 32) : []) {
    if (!image || typeof image.url !== "string" || image.url.length > 2048)
      continue;
    let url;
    try {
      url = new URL(image.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com" || url.port || url.username || url.password || !/^\/(?:media|(?:ext_tw_|amplify_|tweet_)?video_thumb)\//.test(
      url.pathname
    ))
      continue;
    const format = url.searchParams.get("format");
    url.search = "";
    url.hash = "";
    if (format && /^(?:jpe?g|png|webp|gif)$/i.test(format))
      url.searchParams.set("format", format.toLowerCase());
    const normalized = url.href;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    images.push({
      url: normalized,
      alt: typeof image.alt === "string" ? image.alt.slice(0, 500) : "",
      .../\/(?:ext_tw_|amplify_|tweet_)?video_thumb\//.test(url.pathname) ? { kind: "video-thumbnail" } : {}
    });
    if (images.length === 4) break;
  }
  return images;
}
function sanitizePost(input) {
  const raw = input;
  const url = Core.canonicalPostUrl(raw?.url);
  const id = url?.match(/\/status\/(\d+)$/)?.[1];
  if (!id || id !== String(raw?.id)) throw new Error("无法识别帖子地址。");
  const text = (value) => typeof value === "string" ? value.slice(0, 12e3) : "";
  const language = (value) => {
    const hint = Core.resolvePostLanguage("auto", {
      language: value,
      text: ""
    });
    return hint === "auto" ? "" : hint;
  };
  const context = (p, depth = 0) => {
    const images = sanitizePostImages(p.images);
    return {
      id: text(p.id),
      url: Core.canonicalPostUrl(p.url),
      text: text(p.text),
      language: language(p.language),
      author: text(p.author).slice(0, 200),
      timestamp: text(p.timestamp).slice(0, 60),
      hasMedia: Boolean(p.hasMedia) || p.hasVideo === true || images.length > 0,
      images,
      ...p.hasVideo === true || images.some((image) => image.kind === "video-thumbnail") ? { hasVideo: true } : {},
      ...p.textTruncated === true ? { textTruncated: true } : {},
      ...p.snapshotOnly === true && !p.id && !p.url ? { snapshotOnly: true } : {},
      ...depth < 2 && Array.isArray(p.quotedContext) && p.quotedContext.length ? {
        quotedContext: p.quotedContext.slice(0, 2).filter(
          (quote) => quote && typeof quote === "object" && !Array.isArray(quote)
        ).map((quote) => context(quote, depth + 1))
      } : {}
    };
  };
  return {
    ...context(raw),
    id,
    url,
    quotedContext: (Array.isArray(raw.quotedContext) ? raw.quotedContext : []).slice(0, 2).filter(
      (quote) => quote && typeof quote === "object" && !Array.isArray(quote)
    ).map((quote) => context(quote, 1))
  };
}
function sanitizeDraftImages(input) {
  const raw = input;
  if (raw === void 0) return [];
  if (!Array.isArray(raw) || raw.length > 4)
    throw new Error("无法读取草稿图片。");
  let total = 0;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  return raw.map((image) => {
    const url = image?.url;
    if (typeof url !== "string" || url.length > Math.ceil(8 * 1024 * 1024 / 3) * 4 + 32)
      throw new Error("无法读取草稿图片。");
    const match = /^data:image\/(png|jpeg);base64,/.exec(url);
    if (!match) throw new Error("无法读取草稿图片。");
    const data = url.slice(match[0].length), padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
    if (!data.length || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))
      throw new Error("无法读取草稿图片。");
    const bytes = data.length / 4 * 3 - padding;
    total += bytes;
    if (total > 8 * 1024 * 1024)
      throw new Error("草稿图片总大小不能超过 8 MiB。");
    if (padding && alphabet.indexOf(data[data.length - padding - 1]) % (padding === 2 ? 16 : 4) !== 0)
      throw new Error("无法读取草稿图片。");
    const header = [];
    for (let index = 0; index < Math.min(data.length, 12); index += 4) {
      const a = alphabet.indexOf(data[index]), b = alphabet.indexOf(data[index + 1]), c = alphabet.indexOf(data[index + 2]), d = alphabet.indexOf(data[index + 3]);
      header.push(a << 2 | b >> 4);
      if (c >= 0) header.push((b & 15) << 4 | c >> 2);
      if (d >= 0) header.push((c & 3) << 6 | d);
    }
    const valid = match[1] === "png" ? [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => header[index] === value
    ) : header[0] === 255 && header[1] === 216 && header[2] === 255;
    if (!valid) throw new Error("无法读取草稿图片。");
    return {
      url,
      alt: typeof image.alt === "string" ? image.alt.slice(0, 500) : ""
    };
  });
}
function sanitizeDraft(input) {
  const raw = input;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof raw.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(raw.id) || typeof raw.text !== "string" || raw.text.length > 3e4)
    throw new Error("请输入不超过 30000 字符的草稿。");
  const images = sanitizeDraftImages(raw.images);
  if (!raw.text.trim() && !images.length)
    throw new Error("请输入草稿文字或添加图片。");
  if (raw.mode != null && !["post", "reply"].includes(raw.mode))
    throw new Error("无法识别草稿类型。");
  const mode = raw.mode || (raw.context != null || raw.threadContext != null ? "reply" : "post");
  const result = {
    kind: "draft",
    id: raw.id,
    text: raw.text.trim(),
    mode,
    ...images.length ? { images } : {},
    ...raw.hasMedia === true || images.length ? { hasMedia: true } : {},
    ...raw.hasUncheckedMedia === true ? { hasUncheckedMedia: true } : {}
  };
  const project = (input2, limit, quoteDepth = 0, full = false) => {
    const value = input2;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("无法识别帖子上下文。");
    const snapshot = value.snapshotOnly === true && value.id == null && value.url == null;
    let post;
    if (snapshot) {
      const images2 = sanitizePostImages(value.images);
      if (typeof value.text !== "string" || !value.text.trim() && value.hasMedia !== true && value.hasVideo !== true && !images2.length)
        throw new Error("无法识别帖子快照。");
      const hint = Core.resolvePostLanguage("auto", {
        language: value.language,
        text: ""
      });
      post = {
        id: null,
        url: null,
        text: value.text.slice(0, 12e3),
        language: hint === "auto" ? "" : hint,
        author: typeof value.author === "string" ? value.author.slice(0, 200) : "",
        timestamp: typeof value.timestamp === "string" ? value.timestamp.slice(0, 60) : "",
        hasMedia: value.hasMedia === true || value.hasVideo === true || images2.length > 0,
        images: images2,
        ...value.hasVideo === true || images2.some((image) => image.kind === "video-thumbnail") ? { hasVideo: true } : {}
      };
    } else post = sanitizePost(value);
    const shortened = typeof value.text === "string" && value.text.length > limit;
    const out = full && !snapshot ? { ...post } : {
      id: post.id,
      url: post.url,
      text: post.text,
      language: post.language,
      author: post.author,
      timestamp: post.timestamp,
      hasMedia: post.hasMedia,
      ...post.images?.length ? { images: post.images } : {},
      ...post.hasVideo === true ? { hasVideo: true } : {}
    };
    out.text = post.text.slice(0, limit);
    if (snapshot) out.snapshotOnly = true;
    if (shortened || value.textTruncated === true) out.textTruncated = true;
    if (quoteDepth > 0 && Object.hasOwn(value, "quotedContext")) {
      if (!Array.isArray(value.quotedContext))
        throw new Error("无法识别引用帖上下文。");
      const seen = /* @__PURE__ */ new Set();
      out.quotedContext = [];
      for (const child of value.quotedContext) {
        const quote = project(child, 3e3, quoteDepth - 1), key = contextKey(quote);
        if (seen.has(key)) continue;
        seen.add(key);
        out.quotedContext.push(quote);
        if (out.quotedContext.length === 2) break;
      }
    } else delete out.quotedContext;
    return out;
  };
  const contextKey = (value) => value.id ? "id:" + value.id : JSON.stringify(["snapshot", value]);
  if (mode === "reply") {
    if (raw.context != null)
      result.context = project(raw.context, 12e3, 2, true);
    if (Object.hasOwn(raw, "threadContext")) {
      if (!Array.isArray(raw.threadContext))
        throw new Error("无法识别回复上下文。");
      const seen = new Set(result.context ? [contextKey(result.context)] : []), unique = [];
      for (const value of raw.threadContext) {
        const post = project(value, 12e3, 2), key = contextKey(post);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(post);
      }
      const selected = unique.length > 6 ? [unique[0], ...unique.slice(-5)] : unique;
      result.threadContext = selected.map(
        (value, index) => project(value, index === 0 ? 3e3 : 1e3, 2)
      );
    }
  } else if (Object.hasOwn(raw, "quotedContext")) {
    if (!Array.isArray(raw.quotedContext))
      throw new Error("无法识别引用帖上下文。");
    const seen = /* @__PURE__ */ new Set();
    result.quotedContext = [];
    for (const value of raw.quotedContext) {
      const post = project(value, 3e3, 2), key = contextKey(post);
      if (seen.has(key)) continue;
      seen.add(key);
      result.quotedContext.push(post);
      if (result.quotedContext.length === 2) break;
    }
  }
  return result;
}
function cacheKey(post, s, inputFingerprint) {
  if (s.provider === "x-native")
    return s.nativeAccount ? JSON.stringify([
      "SuperX-native-answers-v1",
      "x-native",
      s.nativeAccount,
      Core.canonicalPostUrl(post.url),
      s.language,
      Core.resolvePostLanguage(s.language, post),
      "native-prompt-v1-fast-markdown-format",
      Core.explanationMode(s) === "preset" ? Core.DEFAULT_PROMPTS.verify : s.verifyPrompt,
      "fast"
    ]) : null;
  const mode = Core.explanationMode(s);
  const prompts = [
    "fact-check-prompts-v2-deeper",
    mode === "preset" ? Core.DEFAULT_PROMPTS.verify : s.verifyPrompt
  ];
  return JSON.stringify([
    "GrokFirst-v1",
    s.provider,
    s.provider === "build" ? ["official-ws-v1", s.buildPort, s.buildModel] : s.provider === "oauth" ? [s.oauthCredentialId, s.oauthModel] : s.apiModel,
    s.language,
    s.webSearch,
    s.xSearch,
    "api-v11-context-images",
    mode,
    "only",
    Core.apiPostIdentity(post, s),
    ...prompts,
    selectedEffort(s)
  ]);
}
function sanitizeAnalysis(raw) {
  const value = typeof raw === "string" ? { text: raw } : raw && typeof raw === "object" ? raw : {};
  return {
    text: Core.readerOutput(value.text, { final: true }).text.slice(0, 3e4),
    verificationStatus: typeof value.verificationStatus === "string" ? value.verificationStatus.slice(0, 40) : "",
    warning: typeof value.warning === "string" ? value.warning.slice(0, 1e3) : "",
    sources: (Array.isArray(value.sources) ? value.sources : []).slice(0, 20).map((source) => ({
      url: GrokFirstAPI.safeUrl(source?.url),
      title: typeof source?.title === "string" ? source.title.slice(0, 200) : ""
    })).filter((source) => source.url)
  };
}
function commentCacheKey(post, s, inputFingerprint, analysis) {
  const prompts = ["comments-prompt-v1", s.commentsPrompt];
  return JSON.stringify([
    "GrokFirst-comments-v2-language",
    s.provider,
    s.provider === "build" ? ["official-ws-v1", s.buildPort, s.buildModel] : s.provider === "oauth" ? [s.oauthCredentialId, s.oauthModel] : s.apiModel,
    s.language,
    Core.postFingerprint(post),
    analysis,
    ...prompts,
    selectedEffort(s)
  ]);
}
function commentsJob(job) {
  return job.settings.task === "comments";
}
function draftJob(job) {
  return job.settings.task === "draft";
}
function billingMetadata(value, provider) {
  if (provider === "x-native") return { model: "x-web", usageComplete: false };
  return ["api", "build", "oauth"].includes(provider) ? GrokFirstAPI.sanitizedMetadata(value) : {};
}
function requestMetadata(input, provider) {
  const value = input;
  if (!["api", "oauth"].includes(provider)) return {};
  let diagnostics;
  try {
    diagnostics = (Core.sanitizedRequestDiagnostics || GrokFirstAPI.sanitizedRequestDiagnostics)?.(value?.requestDiagnostics);
  } catch {
  }
  return diagnostics ? { requestDiagnostics: diagnostics } : {};
}
const API_DIAGNOSTIC_CODES = /* @__PURE__ */ new Set([
  "API_INCOMPLETE",
  "API_STREAM_INTERRUPTED",
  "API_STREAM_ERROR",
  "API_LANGUAGE_MISMATCH",
  "RATE_LIMIT",
  "API_CAPACITY",
  "API_IMAGE_INPUT",
  "API_ERROR",
  "CANCELED",
  "TIMEOUT",
  "COMMENTS_INVALID_RESPONSE"
]);
function pruneAPIDiagnostics(input, now = Date.now()) {
  return (Array.isArray(input) ? input : []).slice(0, 1e3).flatMap((entry) => {
    if (!entry || !API_DIAGNOSTIC_CODES.has(entry.code) || !Number.isSafeInteger(entry.recordedAt) || entry.recordedAt < 0 || entry.recordedAt > now || now - entry.recordedAt >= CACHE_TTL)
      return [];
    const diagnostics = requestMetadata(entry, "api").requestDiagnostics;
    const verificationFailure = GrokFirstAPI.sanitizedVerificationFailure(
      entry.verificationFailure
    );
    return diagnostics ? [
      {
        recordedAt: entry.recordedAt,
        code: entry.code,
        requestDiagnostics: diagnostics,
        ...verificationFailure ? { verificationFailure } : {}
      }
    ] : [];
  }).sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 30);
}
async function loadAPIDiagnostics() {
  const epoch = apiDiagnosticsEpoch;
  try {
    const stored = await chrome.storage.session.get("apiRequestDiagnostics");
    if (epoch !== apiDiagnosticsEpoch) return;
    apiDiagnostics = pruneAPIDiagnostics(stored.apiRequestDiagnostics);
    if (stored.apiRequestDiagnostics !== void 0 && JSON.stringify(stored.apiRequestDiagnostics) !== JSON.stringify(apiDiagnostics))
      await chrome.storage.session.set({
        apiRequestDiagnostics: apiDiagnostics
      });
  } catch {
  }
}
function rememberAPIDiagnostics(job, input, code) {
  const value = input;
  if (draftJob(job)) return;
  if (!["api", "oauth"].includes(job.settings.provider) || job.diagnosticsRecorded || !API_DIAGNOSTIC_CODES.has(code))
    return;
  const diagnostics = requestMetadata(value, "api").requestDiagnostics;
  if (!diagnostics) return;
  job.diagnosticsRecorded = true;
  const verificationFailure = GrokFirstAPI.sanitizedVerificationFailure(
    value?.verificationFailure
  );
  const epoch = apiDiagnosticsEpoch, entry = {
    recordedAt: Date.now(),
    code,
    requestDiagnostics: diagnostics,
    ...verificationFailure ? { verificationFailure } : {}
  };
  apiDiagnosticsWrites = apiDiagnosticsWrites.catch(() => {
  }).then(async () => {
    await apiDiagnosticsReady;
    if (epoch !== apiDiagnosticsEpoch) return;
    apiDiagnostics = pruneAPIDiagnostics([entry, ...apiDiagnostics]);
    try {
      await chrome.storage.session.set({
        apiRequestDiagnostics: apiDiagnostics
      });
    } catch {
    }
  });
}
function pruneStoredAPIDiagnostics() {
  const epoch = apiDiagnosticsEpoch;
  const operation = apiDiagnosticsWrites.catch(() => {
  }).then(async () => {
    await apiDiagnosticsReady;
    if (epoch !== apiDiagnosticsEpoch) return;
    const kept = pruneAPIDiagnostics(apiDiagnostics), changed = JSON.stringify(kept) !== JSON.stringify(apiDiagnostics);
    apiDiagnostics = kept;
    if (changed)
      try {
        await chrome.storage.session.set({
          apiRequestDiagnostics: apiDiagnostics
        });
      } catch {
      }
  });
  apiDiagnosticsWrites = operation;
  return operation;
}
async function getAPIDiagnostics() {
  await pruneStoredAPIDiagnostics();
  return {
    ok: true,
    entries: apiDiagnostics,
    retentionHours: 24,
    maxEntries: 30
  };
}
function clearAPIDiagnostics() {
  apiDiagnosticsEpoch++;
  apiDiagnostics = [];
  const operation = apiDiagnosticsWrites.catch(() => {
  }).then(async () => {
    await apiDiagnosticsReady;
    try {
      await chrome.storage.session.remove("apiRequestDiagnostics");
      return { ok: true };
    } catch {
      return { ok: false, errorKey: "diagnostics.storageError" };
    }
  });
  apiDiagnosticsWrites = operation;
  return operation;
}
function verificationMetadata(value, mode, text = String(value?.text || "").slice(0, 3e4)) {
  const start = value?.verificationStart;
  const failure = ["only", "background"].includes(mode) ? GrokFirstAPI.sanitizedVerificationFailure(value?.verificationFailure) : void 0;
  return {
    ...mode === "background" && Number.isSafeInteger(start) && start >= 2 && start <= text.length && text.slice(start - 2, start) === "\n\n" ? { verificationStart: start } : {},
    ...failure ? { verificationFailure: failure } : {}
  };
}
function withBillingMetadata(value, provider, verificationMode) {
  const result = { ...value };
  for (const field of [
    "usage",
    "usageComplete",
    "usageByStage",
    "model",
    "modelByStage",
    "verificationStart",
    "verificationFailure",
    "requestDiagnostics"
  ])
    delete result[field];
  return {
    ...result,
    ...billingMetadata(value, provider),
    ...verificationMetadata(value, verificationMode),
    ...requestMetadata(value, provider)
  };
}
function jobError(job, error, code, extra = {}) {
  sendJob(job, {
    type: commentsJob(job) ? "COMMENT_ERROR" : "ERROR",
    requestId: job.requestId,
    error,
    code,
    retryAttempts: job.retryAttempts || 0,
    ...extra
  });
}
function freshCacheEntry(input, now) {
  const entry = input;
  return entry && typeof entry === "object" && !Array.isArray(entry) && entry.provider !== "x-native" && Number.isFinite(entry.completedAt) && entry.completedAt >= 0 && entry.completedAt <= now && now - entry.completedAt < CACHE_TTL && (typeof entry.text !== "string" || Core.readerOutput(entry.text, { final: true }).kind === "content");
}
function pruneCache(input, now = Date.now()) {
  const entries = input && typeof input === "object" && !Array.isArray(input) ? Object.entries(input) : [];
  const recent = entries.filter(([, value]) => freshCacheEntry(value, now)).sort((a, b) => b[1].completedAt - a[1].completedAt).slice(0, 160);
  const kept = [];
  let bytes = 0;
  for (const entry of recent) {
    bytes += new TextEncoder().encode(JSON.stringify(entry)).byteLength;
    if (bytes > 4e6) break;
    kept.push(entry);
  }
  return Object.fromEntries(kept);
}
function cachedResult(key) {
  const entry = cache[key];
  if (freshCacheEntry(entry, Date.now())) return entry;
  delete cache[key];
  return null;
}
function persistQuotas() {
  quotaWrites = quotaWrites.catch(() => {
  }).then(() => chrome.storage.session.set({ quotas: { ...quotas } }));
  return quotaWrites;
}
function persistCache(epoch) {
  cacheWrites = cacheWrites.catch(() => {
  }).then(
    () => epoch === cacheEpoch ? chrome.storage.session.set({ cache: { ...cache } }) : void 0
  );
  return cacheWrites;
}
function answerBudget() {
  return settings.answerCacheLimitMB * 1024 * 1024;
}
function cacheableAnswer(value) {
  return Core.readerOutput(value?.text, { final: true }).kind === "content" && !["incomplete", "failed", "pending"].includes(
    value.verificationStatus
  );
}
function queueAnswerWrite(operation) {
  cacheWrites = cacheWrites.catch(() => {
  }).then(operation).then((value) => value);
  return cacheWrites;
}
async function cachedAnswer(key) {
  if (!key) return null;
  await answerClearBarrier.catch(() => {
  });
  await answerPending.get(key)?.catch(() => {
  });
  try {
    const value = await answers.get(key);
    answerCacheReady = true;
    return value && cacheableAnswer(value) ? value : null;
  } catch {
    answerCacheReady = false;
    return null;
  }
}
function nativeJobCurrent(job) {
  return job.settings.provider !== "x-native" || job.nativeGeneration === job.client.nativeGeneration;
}
function saveAnswer(job, result, epoch) {
  if (!job.fingerprint || !cacheableAnswer(result)) return;
  const pending = queueAnswerWrite(() => {
    if (epoch !== cacheEpoch || job.controller.signal.aborted || !nativeJobCurrent(job) || !jobAudienceActive(job))
      return;
    return answers.put(job.fingerprint, result, answerBudget());
  });
  answerPending.set(job.fingerprint, pending);
  void pending.catch(() => {
  }).finally(() => {
    if (answerPending.get(job.fingerprint) === pending)
      answerPending.delete(job.fingerprint);
  });
}
function clearStoredCache() {
  cache = {};
  cacheEpoch++;
  answerClearBarrier = queueAnswerWrite(async () => {
    const results = await Promise.allSettled([
      answers.clear(),
      chrome.storage.session.remove("cache"),
      chrome.storage.local.remove("cache")
    ]);
    const failed = results.find((value) => value.status === "rejected");
    if (failed) throw failed.reason;
  });
  return answerClearBarrier;
}
function persistRailStates() {
  railStateWrites = railStateWrites.catch(() => {
  }).then(() => chrome.storage.session.set({ railStates: { ...railStates } }));
  return railStateWrites;
}
function jobAudienceActive(job) {
  return job.subscribers ? job.subscribers.size > 0 : clients.has(job.client) && job.clientEpoch === job.client.cancelEpoch;
}
function sendCancelledSubscribers(job, message) {
  for (const sub of job.cancelledSubscribers || []) {
    if (!subscriptions.has(sub.key) && !sub.client.admissions.has(sub.requestId))
      send(sub.client.port, { ...message, requestId: sub.requestId });
  }
  job.cancelledSubscribers = void 0;
}
function sendJob(job, message) {
  if (!job.subscribers) {
    send(job.client.port, message);
    return;
  }
  if (["QUEUED", "START", "RETRY_WAIT"].includes(message.type)) {
    job.statusMessage = message;
  }
  if (message.type === "UPDATE")
    job.updateMessage = {
      ...job.updateMessage,
      ...Object.fromEntries(
        Object.entries(message).filter(([, value]) => value !== void 0)
      )
    };
  if (["RESULT", "ERROR"].includes(message.type)) job.terminal = true;
  for (const sub of job.subscribers.values())
    send(sub.client.port, { ...message, requestId: sub.requestId });
  if (message.type === "ERROR") sendCancelledSubscribers(job, message);
}
function subscribeJob(job, sub) {
  job.subscribers.set(sub.key, sub);
  subscriptions.set(sub.key, { job, sub });
  if (sub.force) job.force = true;
  if (!sub.prefetch && job.prefetch) {
    job.prefetch = false;
    if (queue.includes(job)) {
      queue = queue.filter((value) => value !== job);
      enqueueJob(job);
    }
  }
  if (job.cancelled || job.restartAfterSettle) {
    send(sub.client.port, { type: "QUEUED", requestId: sub.requestId });
    return;
  }
  if (job.statusMessage)
    send(sub.client.port, { ...job.statusMessage, requestId: sub.requestId });
  if (job.updateMessage)
    send(sub.client.port, { ...job.updateMessage, requestId: sub.requestId });
}
function requestJob(client, id) {
  return subscriptions.get(`${client.tabId}:${id}`)?.job || jobs.get(`${client.tabId}:${id}`);
}
function requestOwned(job, client, id) {
  return job?.subscribers ? job.subscribers.get(`${client.tabId}:${id}`)?.client === client : job?.client === client;
}
function removeJob(job) {
  if (jobs.get(job.key) === job) jobs.delete(job.key);
  if (job.flightKey && flights.get(job.flightKey) === job)
    flights.delete(job.flightKey);
  for (const sub of job.subscribers?.values() || [])
    if (subscriptions.get(sub.key)?.job === job) subscriptions.delete(sub.key);
}
function abortJob(job, deferPump = false) {
  if (job.subscribers?.size && !job.terminal)
    jobError(job, "任务已取消。", "CANCELLED");
  job.cancelled = true;
  clearTimeout(job.retryTimer);
  job.retryTimer = void 0;
  job.retryPlan = void 0;
  job.controller.abort();
  if (job.subscribers) {
    for (const sub of job.subscribers.values())
      if (subscriptions.get(sub.key)?.job === job)
        subscriptions.delete(sub.key);
    job.subscribers.clear();
  }
  if (!runningJobs.has(job) && !job.apiProviderPending) removeJob(job);
  queue = queue.filter((j) => j !== job);
  if (!deferPump) pump();
}
function cancelSubscription(job, client, id, error = {}) {
  if (!job.subscribers) {
    abortJob(job);
    return;
  }
  const key = `${client.tabId}:${id}`, sub = job.subscribers.get(key);
  if (sub?.client !== client) return;
  if (job.settings.provider === "x-native" && runningJobs.has(job) && job.subscribers.size === 1) {
    (job.cancelledSubscribers ||= []).push(sub);
  } else
    send(client.port, {
      type: "ERROR",
      requestId: sub.requestId,
      error: "任务已取消。",
      code: "CANCELLED",
      retryAttempts: job.retryAttempts || 0,
      ...aggregateBilling(job, job.billing),
      ...error
    });
  job.subscribers.delete(key);
  if (subscriptions.get(key)?.job === job) subscriptions.delete(key);
  if (!job.subscribers.size) abortJob(job);
}
function replaceNativeOwner(job) {
  if (runningJobs.has(job)) {
    job.restartAfterSettle = true;
    job.controller.abort();
    return;
  }
  const sub = job.subscribers.values().next().value;
  job.client = sub.client;
  job.clientEpoch = sub.client.cancelEpoch;
  job.nativeGeneration = sub.client.nativeGeneration;
}
function cancelClient(client) {
  client.cancelEpoch++;
  client.admissions.clear();
  client.promotions.clear();
  for (const job of [...jobs.values()]) {
    if (!job.subscribers) {
      if (job.client === client) abortJob(job);
      continue;
    }
    for (const sub of [...job.subscribers.values()])
      if (sub.client === client) cancelSubscription(job, client, sub.requestId);
    if (job.settings.provider === "x-native" && job.client === client && (!clients.has(client) || !nativeJobCurrent(job)) && job.subscribers.size) {
      replaceNativeOwner(job);
    }
  }
}
function waitForAbort(promise, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", cancel);
      if (ok) resolve(value);
      else reject(value);
    };
    const cancel = () => finish(
      false,
      signal.reason || new DOMException("Cancelled", "AbortError")
    );
    Promise.resolve(promise).then(
      (value) => finish(true, value),
      (error) => finish(false, error)
    );
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  });
}
async function openSettings(focus) {
  try {
    await chrome.storage.session.set({
      superxOptionsFocus: {
        id: focus === "native" || settings.provider === "x-native" ? "native" : focus === "oauth" || settings.provider === "oauth" ? "oauth" : focus === "build" || settings.provider === "build" ? "build" : "api-key",
        nonce: crypto.randomUUID()
      }
    });
  } catch {
  }
  await chrome.runtime.openOptionsPage();
}
async function openHistory() {
  await chrome.tabs.create({ url: chrome.runtime.getURL("history.html") });
}
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "GROKFIRST_FEED" || !port.sender || !trustedFeed(port.sender)) {
    port.disconnect();
    return;
  }
  const client = {
    scope: ++clientSequence,
    port,
    tabId: port.sender.tab.id,
    cancelEpoch: 0,
    uiLanguage: null,
    requestCancellations: /* @__PURE__ */ new Map(),
    admissions: /* @__PURE__ */ new Map(),
    promotions: /* @__PURE__ */ new Set(),
    nativeAccount: "",
    nativeGeneration: 0
  };
  clients.add(client);
  ready.then(async () => {
    client.uiLanguage = UI.normalizeLanguage(client.uiLanguage || uiLanguage);
    send(port, {
      type: "CONFIG",
      ...await publicConfig(),
      used: quotas[client.tabId] || 0,
      collapsed: Boolean(railStates[client.tabId]),
      uiLanguage: client.uiLanguage
    });
  }).catch(
    () => send(port, { type: "FATAL", error: "扩展初始化失败，请重新加载扩展。" })
  );
  port.onMessage.addListener((input) => {
    const message = input;
    if (message?.type === "NATIVE_EVENT") return;
    if (message?.type === "NATIVE_ACCOUNT_CHANGED" || message?.type === "ANALYZE" || message?.type === "LOOKUP_CACHED_POST") {
      const account = Core.normalizeNativeAccount(message.nativeAccount);
      if (account !== client.nativeAccount) {
        client.nativeAccount = account;
        client.nativeGeneration++;
        for (const job of [...jobs.values()].filter(
          (job2) => job2.settings.provider === "x-native"
        )) {
          if (!job.subscribers) {
            if (job.client === client) abortJob(job);
            continue;
          }
          for (const sub of [...job.subscribers.values()])
            if (sub.client === client)
              cancelSubscription(job, client, sub.requestId);
          if (job.client === client && job.subscribers?.size)
            replaceNativeOwner(job);
        }
      }
      if (message.type === "NATIVE_ACCOUNT_CHANGED") return;
    }
    const receivedNativeGeneration = client.nativeGeneration, receivedCacheEpoch = cacheEpoch;
    const receivedEpoch = client.cancelEpoch, receivedRevision = revision, receivedCredentialGeneration = securityGeneration, receivedBuildGeneration = buildConnectionGeneration, receivedOAuthGeneration = oauthGeneration;
    const messageRequestId = String(message.requestId || "").slice(0, 80);
    if (["CANCEL", "CANCEL_IF_QUEUED"].includes(message.type) && messageRequestId) {
      client.requestCancellations.set(messageRequestId, Symbol());
      client.admissions.delete(messageRequestId);
      client.promotions.delete(messageRequestId);
    }
    if (message.type === "PROMOTE_REQUEST") {
      if (client.admissions.has(messageRequestId))
        client.promotions.add(messageRequestId);
      const job = requestJob(client, messageRequestId);
      if (requestOwned(job, client, messageRequestId) && !commentsJob(job) && !draftJob(job) && job.prefetch) {
        job.prefetch = false;
        if (queue.includes(job)) {
          queue = queue.filter((value) => value !== job);
          enqueueJob(job);
        }
      }
      return;
    }
    const receivedCancellation = client.requestCancellations.get(messageRequestId);
    let admission, admittedJob;
    if (["ANALYZE", "ANALYZE_DRAFT", "GENERATE_COMMENTS"].includes(
      message.type
    ) && messageRequestId) {
      if (client.admissions.has(messageRequestId) || requestJob(client, messageRequestId)?.cancellation === receivedCancellation && Boolean(requestJob(client, messageRequestId)))
        return;
      admission = Symbol();
      client.admissions.set(messageRequestId, admission);
    }
    ready.then(async () => {
      if (!clients.has(client)) return;
      if (message.type === "LOOKUP_CACHED_POST") {
        if (!messageRequestId) return;
        const miss = (deferred) => send(port, {
          type: "CACHE_MISS",
          requestId: messageRequestId,
          ...deferred ? { deferred: true } : {}
        });
        const currentCredentials2 = () => settings.provider === "x-native" ? receivedNativeGeneration === client.nativeGeneration : settings.provider === "oauth" ? receivedOAuthGeneration === oauthGeneration : settings.provider === "build" ? receivedBuildGeneration === buildConnectionGeneration : receivedCredentialGeneration === securityGeneration;
        const current = () => clients.has(client) && trustedFeed(port.sender) && !Boolean(requestJob(client, messageRequestId)) && client.cancelEpoch === receivedEpoch && receivedRevision === revision && receivedCacheEpoch === cacheEpoch && client.requestCancellations.get(messageRequestId) === receivedCancellation && currentCredentials2() && !providerFault;
        if (!current()) {
          miss(false);
          return;
        }
        if (settings.provider === "api" && (securityPending || securityFault) || settings.provider === "build" && buildConnectionPending) {
          miss(true);
          return;
        }
        const oauthState = settings.provider === "oauth" ? oauth.status() : null;
        if (oauthState && !oauthState.credentialId) {
          miss(["restoring", "refreshing"].includes(oauthState.state));
          return;
        }
        if (settings.provider === "x-native" && !client.nativeAccount) {
          miss(true);
          return;
        }
        let post2;
        try {
          post2 = sanitizePost(message.post);
        } catch {
          miss(false);
          return;
        }
        const snapshot2 = {
          ...settings,
          ...settings.provider === "x-native" ? { nativeAccount: client.nativeAccount } : {},
          ...oauthState ? { oauthCredentialId: oauthState.credentialId } : {}
        };
        const result = await cachedAnswer(
          cacheKey(post2, snapshot2, Core.postFingerprint(post2))
        );
        if (!current() || !result) {
          miss(false);
          return;
        }
        send(port, {
          type: "RESULT",
          requestId: messageRequestId,
          result: withBillingMetadata(
            result,
            snapshot2.provider,
            snapshot2.apiVerification
          ),
          cached: true,
          cacheLookup: true
        });
        return;
      }
      if (message.type === "PING") {
        send(port, { type: "PONG" });
        return;
      }
      if (message.type === "UI_LANGUAGE") {
        await updateUILanguage(client, message.language);
        return;
      }
      if (message.type === "CANCEL_ALL") {
        cancelClient(client);
        return;
      }
      if (message.type === "OPEN_SETTINGS") {
        await openSettings(message.focus);
        return;
      }
      if (message.type === "OPEN_HISTORY" && trustedFeed(port.sender)) {
        await openHistory();
        return;
      }
      if (message.type === "HISTORY_VISIT") {
        if (!trustedFeed(port.sender)) return;
        const batchId = String(message.batchId || "").slice(0, 80), ack = (ok) => {
          if (batchId)
            send(port, {
              type: "HISTORY_ACK",
              batchId,
              ok,
              epoch: history.config().epoch
            });
        };
        if (!settings.enabled || !Array.isArray(message.posts) || message.posts.length > 30 || message.historyEpoch !== history.config().epoch) {
          ack(false);
          return;
        }
        const posts = [];
        for (const raw of message.posts) {
          try {
            posts.push(sanitizePost(raw));
          } catch {
          }
        }
        try {
          const status = await history.visit(posts, message.historyEpoch);
          ack(
            status.enabled && message.historyEpoch === status.epoch && posts.length > 0
          );
        } catch {
          ack(false);
        }
        return;
      }
      if (message.type === "SET_ENABLED") {
        await queueSettingsMutation(() => ({
          ...settings,
          enabled: Boolean(message.enabled)
        }));
        return;
      }
      if (message.type === "SET_LANGUAGE") {
        await queueSettingsMutation(() => ({
          ...settings,
          language: message.language
        }));
        return;
      }
      if (message.type === "SET_RAIL_WIDTH") {
        if (!trustedFeed(port.sender) || !validRailWidth(message.width))
          return;
        const width = message.width;
        railWidth = width;
        for (const peer of clients)
          send(peer.port, { type: "RAIL_WIDTH", width });
        railWidthWrites = railWidthWrites.catch(() => {
        }).then(() => chrome.storage.local.set({ railWidth: width }));
        await railWidthWrites;
        return;
      }
      if (message.type === "SET_RAIL_COLLAPSED") {
        railStates[client.tabId] = Boolean(message.collapsed);
        if (railStates[client.tabId]) {
          for (const waiting of [...jobs.values()].filter(
            (job2) => !collapsedRailWorkAllowed(job2) && !runningJobs.has(job2)
          )) {
            if (waiting.subscribers) {
              for (const sub2 of [...waiting.subscribers.values()])
                if (sub2.client.tabId === client.tabId)
                  cancelSubscription(waiting, sub2.client, sub2.requestId, {
                    error: "右栏已收起，未开始的分析已暂停。",
                    code: "RAIL_COLLAPSED"
                  });
            } else if (waiting.client.tabId === client.tabId) {
              jobError(
                waiting,
                "右栏已收起，未开始的分析已暂停。",
                "RAIL_COLLAPSED"
              );
              abortJob(waiting, true);
            }
          }
          queue = queue.filter((job2) => jobs.get(job2.key) === job2);
          pump();
        }
        for (const peer of clients)
          if (peer.tabId === client.tabId)
            send(peer.port, {
              type: "RAIL_VISIBILITY",
              collapsed: Boolean(railStates[client.tabId])
            });
        await persistRailStates();
        return;
      }
      if (message.type === "CANCEL") {
        const job2 = requestJob(client, messageRequestId);
        if (requestOwned(job2, client, messageRequestId))
          cancelSubscription(job2, client, messageRequestId);
        return;
      }
      if (message.type === "CANCEL_IF_QUEUED") {
        const job2 = requestJob(client, messageRequestId);
        if (requestOwned(job2, client, messageRequestId) && (runningJobs.has(job2) || message.preserveStarted === true && job2.started === true))
          return;
        if (requestOwned(job2, client, messageRequestId) && job2.subscribers) {
          cancelSubscription(job2, client, messageRequestId);
          return;
        }
        if (requestOwned(job2, client, messageRequestId)) abortJob(job2);
        send(port, {
          type: "ERROR",
          requestId: messageRequestId,
          error: "未开始的分析已暂停。",
          code: "CANCELLED"
        });
        return;
      }
      if (!["ANALYZE", "ANALYZE_DRAFT", "GENERATE_COMMENTS"].includes(
        message.type
      ))
        return;
      const comments = message.type === "GENERATE_COMMENTS";
      const draft = message.type === "ANALYZE_DRAFT";
      const report = (error, code, extra = {}) => send(port, {
        type: comments ? "COMMENT_ERROR" : "ERROR",
        requestId,
        error,
        code,
        ...extra
      });
      const requestId = messageRequestId;
      if (!requestId) return;
      if (client.requestCancellations.get(requestId) !== receivedCancellation)
        return;
      const currentCredentials = () => settings.provider === "x-native" ? receivedNativeGeneration === client.nativeGeneration : settings.provider === "oauth" ? receivedOAuthGeneration === oauthGeneration : settings.provider === "build" ? receivedBuildGeneration === buildConnectionGeneration : receivedCredentialGeneration === securityGeneration;
      if (client.cancelEpoch !== receivedEpoch || receivedRevision !== revision || !currentCredentials()) {
        report("任务已取消。", "CANCELLED");
        return;
      }
      if (!providers[settings.provider].capabilities[comments ? "comments" : draft ? "draft" : "analysis"]) {
        const error = providers[settings.provider].publicError({
          code: "X_NATIVE_UNSUPPORTED"
        });
        report(error.error, error.code);
        return;
      }
      if (settings.provider === "api" && (securityPending || securityFault)) {
        report("API Key 设置需要重新确认，请在设置中重试。", "NEEDS_KEY");
        return;
      }
      const snapshot = {
        ...settings,
        ...settings.provider === "x-native" ? { nativeAccount: client.nativeAccount } : {},
        ...settings.provider === "oauth" ? { oauthCredentialId: oauth.status().credentialId || "" } : {},
        ...comments ? { task: "comments" } : draft ? { task: "draft", language: "auto" } : {}
      };
      if (Core.isNonTextGenerationModel(
        providers[snapshot.provider].model(snapshot)
      )) {
        report(
          GrokFirstAPI.publicError({ code: "MODEL_UNSUPPORTED" }).error,
          "MODEL_UNSUPPORTED"
        );
        return;
      }
      if (!settings.enabled && !comments && !draft) {
        report("已暂停自动分析。", "PAUSED");
        return;
      }
      if (railStates[client.tabId] && !draft) {
        report("右栏已收起。", "RAIL_COLLAPSED");
        return;
      }
      let post, inputFingerprint;
      try {
        if (draft) post = sanitizeDraft(message.draft);
        else {
          inputFingerprint = Core.postFingerprint(message.post);
          post = sanitizePost(message.post);
        }
      } catch (caught) {
        const e = caught;
        report(
          draft ? "请输入有效的草稿和回复上下文。" : e.message,
          draft ? "DRAFT_INVALID" : "POST_INVALID"
        );
        return;
      }
      if (snapshot.provider !== "x-native" && !comments && !draft && !snapshot.webSearch && !snapshot.xSearch) {
        report(
          "通过帖子链接读取全文需要启用 X 搜索或网页搜索。",
          "URL_SEARCH_REQUIRED"
        );
        return;
      }
      const analysis = comments ? sanitizeAnalysis(message.analysis) : void 0;
      const fingerprint = draft ? null : comments ? commentCacheKey(post, snapshot, inputFingerprint, analysis) : cacheKey(post, snapshot, inputFingerprint);
      const ticket = draft ? null : historyTicket(post, snapshot), historyLanguage = draft ? "" : Core.resolvePostLanguage(snapshot.language, post);
      const resumeAdmission = () => {
        if (!clients.has(client) || client.cancelEpoch !== receivedEpoch || receivedRevision !== revision || client.requestCancellations.get(requestId) !== receivedCancellation || client.admissions.get(requestId) !== admission || !currentCredentials())
          return false;
        if (receivedCacheEpoch !== cacheEpoch) {
          report("缓存已清空，任务已取消；请重新核查。", "CANCELLED");
          return false;
        }
        return true;
      };
      const key = `${client.tabId}:${requestId}`;
      if (requestJob(client, requestId)) return;
      const flightFingerprint = fingerprint || (!comments && !draft ? cacheKey(
        post,
        {
          ...snapshot,
          nativeAccount: "unresolved-source:" + client.scope
        },
        inputFingerprint
      ) : null);
      const flightKey = !comments && !draft ? JSON.stringify([
        flightFingerprint,
        revision,
        cacheEpoch,
        securityGeneration,
        buildConnectionGeneration,
        oauthGeneration,
        ...!fingerprint ? [client.nativeGeneration] : []
      ]) : null;
      const sub = {
        key,
        requestId,
        client,
        force: message.force === true,
        prefetch: message.prefetch === true
      };
      const existing = flightKey && flights.get(flightKey);
      if (existing) {
        subscribeJob(existing, sub);
        return;
      }
      const job = {
        key: flightKey ? Symbol(key) : key,
        requestId,
        force: !comments && !draft && message.force === true,
        prefetch: !comments && !draft && message.prefetch === true && !client.promotions.has(requestId),
        cancellation: receivedCancellation,
        cacheEpoch: receivedCacheEpoch,
        nativeGeneration: receivedNativeGeneration,
        post,
        inputFingerprint,
        analysis,
        client,
        clientEpoch: receivedEpoch,
        settings: snapshot,
        revision: receivedRevision,
        fingerprint,
        historyTicket: ticket,
        historyLanguage,
        started: false,
        retryAttempts: 0,
        completedBilling: [],
        controller: new AbortController()
      };
      if (flightKey) {
        job.flightKey = flightKey;
        job.subscribers = /* @__PURE__ */ new Map();
        flights.set(flightKey, job);
        subscribeJob(job, sub);
      }
      admittedJob = job;
      jobs.set(job.key, job);
      const admissionCurrent = () => {
        if (!job.subscribers) return resumeAdmission();
        if (job.cacheEpoch !== cacheEpoch && !job.terminal) {
          jobError(job, "缓存已清空，任务已取消；请重新核查。", "CANCELLED");
        }
        return jobs.get(job.key) === job && !job.cancelled && job.revision === revision && job.cacheEpoch === cacheEpoch && jobAudienceActive(job);
      };
      const cached = draft || message.force === true ? null : comments ? cachedResult(fingerprint) : await cachedAnswer(fingerprint);
      if (!admissionCurrent()) {
        removeJob(job);
        return;
      }
      if (cached && !job.force) {
        rememberHistoryResult(ticket, cached, comments, historyLanguage);
        sendJob(
          job,
          comments ? {
            type: "COMMENT_RESULT",
            requestId,
            comments: cached.comments,
            cached: true,
            ...billingMetadata(cached, snapshot.provider)
          } : {
            type: "RESULT",
            requestId,
            result: withBillingMetadata(
              cached,
              snapshot.provider,
              snapshot.apiVerification
            ),
            cached: true
          }
        );
        removeJob(job);
        return;
      }
      const config = await publicConfig();
      if (!admissionCurrent()) {
        removeJob(job);
        return;
      }
      if (!jobRailAllowed(job) && !draft) {
        jobError(job, "右栏已收起。", "RAIL_COLLAPSED");
        removeJob(job);
        return;
      }
      if (!settings.enabled && !comments && !draft && !job.force) {
        jobError(job, "已暂停自动分析。", "PAUSED");
        removeJob(job);
        return;
      }
      if (!config.ready) {
        const code = settings.provider === "x-native" ? nativeFaultCode || "X_NATIVE_INTERRUPTED" : settings.provider === "oauth" ? oauth.status().errorCode || "OAUTH_LOGIN_REQUIRED" : settings.provider === "build" ? buildStatus.errorCode || "BUILD_NOT_CONNECTED" : "NEEDS_KEY";
        jobError(
          job,
          providers[snapshot.provider].publicError({ code }).error,
          code
        );
        removeJob(job);
        return;
      }
      enqueueJob(job);
      if (!comments) sendJob(job, { type: "QUEUED", requestId });
      pump();
    }).catch(() => {
      const failure = message.type === "LOOKUP_CACHED_POST" ? { type: "CACHE_MISS", requestId: messageRequestId } : {
        type: message.type === "GENERATE_COMMENTS" ? "COMMENT_ERROR" : "ERROR",
        requestId: message.requestId,
        error: "处理失败，请重新加载扩展。"
      };
      if (admittedJob) {
        if (jobs.get(admittedJob.key) === admittedJob) {
          sendJob(admittedJob, failure);
          abortJob(admittedJob);
        }
      } else send(port, failure);
    }).finally(() => {
      if (admission && client.admissions.get(messageRequestId) === admission) {
        client.admissions.delete(messageRequestId);
        client.promotions.delete(messageRequestId);
      }
    });
  });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    clients.delete(client);
    cancelClient(client);
  });
});
function liveJob(job) {
  return nativeJobCurrent(job) && runningJobs.has(job) && jobs.get(job.key) === job && !job.controller.signal.aborted && job.revision === revision && jobAudienceActive(job);
}
function apiLimit(s) {
  return providers[s.provider].concurrency(s);
}
function jobRailAllowed(job) {
  return collapsedRailWorkAllowed(job) || (job.subscribers ? [...job.subscribers.values()].some(
    (sub) => !railStates[sub.client.tabId]
  ) : !railStates[job.client.tabId]);
}
function jobPriority(job) {
  return commentsJob(job) || draftJob(job) ? 0 : job.prefetch ? 2 : 1;
}
function enqueueJob(job) {
  const at = queue.findIndex(
    (waiting) => jobPriority(waiting) > jobPriority(job)
  );
  if (at < 0) queue.push(job);
  else queue.splice(at, 0, job);
}
const API_BUDGET_CODES = /* @__PURE__ */ new Set([
  "spending_limit",
  "insufficient_credits",
  "insufficient_quota",
  "usage_limit_exceeded"
]);
function apiBudgetFailure(value) {
  const supplied = GrokFirstAPI.sanitizedVerificationFailure(value?.verificationFailure) || GrokFirstAPI.sanitizedVerificationFailure(
    value?.partialResult?.verificationFailure
  );
  const details = value?.failureDetails;
  const fallback = GrokFirstAPI.sanitizedVerificationFailure({
    stage: "verify",
    code: "ACCESS",
    errorCode: value?.code,
    httpStatus: value?.httpStatus ?? details?.httpStatus,
    providerCode: value?.providerCode ?? details?.providerCode
  });
  return [supplied, fallback].find(
    (failure) => failure && (failure.httpStatus === 402 || API_BUDGET_CODES.has(failure.providerCode))
  );
}
function apiCapacityFailure(value) {
  return value?.code === "API_CAPACITY" || GrokFirstAPI.sanitizedVerificationFailure(value?.verificationFailure)?.errorCode === "API_CAPACITY" || GrokFirstAPI.sanitizedVerificationFailure(
    value?.partialResult?.verificationFailure
  )?.errorCode === "API_CAPACITY";
}
function clearQueuePause() {
  return Promise.resolve(true);
}
function clearAPIBudgetPause() {
  return Promise.resolve(true);
}
function clearAPICapacityPause() {
  return Promise.resolve(true);
}
function clearAPIDeadline(job) {
  clearTimeout(job.deadline);
  job.deadline = void 0;
}
function startAPIDeadline(job) {
  clearAPIDeadline(job);
  const stage = job.slotPhase;
  job.deadline = setTimeout(
    () => job.controller.abort(
      Object.assign(new Error("分析超时，Grok 未能完成响应；可手动重试。"), {
        code: "TIMEOUT",
        ...stage === "verify" ? {
          verificationFailure: {
            code: "TIMEOUT",
            stage: "verify",
            errorCode: "TIMEOUT"
          }
        } : {}
      })
    ),
    15e4
  );
}
function releaseAPISlot(job) {
  clearAPIDeadline(job);
  apiSlots.delete(job);
  job.slotHeld = false;
  job.slotPhase = null;
}
function trackedAPICall(job, onUpdate) {
  job.apiProviderPending = true;
  return runAPI(job, onUpdate).then(
    (value) => {
      if (job.controller.signal.aborted)
        job.billing = {
          ...job.billing,
          ...billingMetadata(value, job.settings.provider)
        };
      return value;
    },
    (caught) => {
      const error = caught;
      if (job.controller.signal.aborted)
        job.billing = {
          ...job.billing,
          ...billingMetadata(error.partialResult, job.settings.provider),
          ...billingMetadata(error, job.settings.provider)
        };
      throw error;
    }
  ).finally(() => {
    job.apiProviderPending = false;
    if (job.executionFinished) completeAttempt(job);
  });
}
function logicalJobActive(job) {
  return nativeJobCurrent(job) && jobs.get(job.key) === job && !job.cancelled && job.revision === revision && jobAudienceActive(job);
}
function aggregateBilling(job, current = {}) {
  if (!job.completedBilling.length)
    return billingMetadata(current, job.settings.provider);
  const values = [
    ...job.completedBilling,
    billingMetadata(current, job.settings.provider)
  ];
  const stage = commentsJob(job) ? "comments" : "verify";
  const usage = GrokFirstAPI.mergeUsage(...values.map((value) => value.usage));
  const model = [...values].reverse().find((value) => value.model)?.model;
  const usageByStage = {};
  for (const name of ["url", "explain", "verify", "inline", "comments"]) {
    const reported = values.map(
      (value) => value.usageByStage?.[name] || (name === stage ? value.usage : void 0)
    ).filter(Boolean);
    if (reported.length)
      usageByStage[name] = GrokFirstAPI.mergeUsage(...reported);
  }
  const modelByStage = Object.assign(
    {},
    ...values.map((value) => value.modelByStage || {}),
    model ? { [stage]: model } : {}
  );
  return billingMetadata(
    {
      usage,
      usageComplete: values.every(
        (value) => value.usageComplete === true && GrokFirstAPI.usageComplete(value.usage)
      ),
      usageByStage,
      model,
      modelByStage
    },
    job.settings.provider
  );
}
function retryPlan(job, error, code, extra = {}) {
  if (!logicalJobActive(job) || job.retryAttempts >= Core.AUTO_RETRY_LIMIT || !Core.autoRetryDecision({ ...error, provider: job.settings.provider }).retryable)
    return false;
  const safe = providers[job.settings.provider].publicError(error);
  job.retryPlan = { error: safe.error, code, extra };
  return true;
}
function completeAttempt(job) {
  if (job.attemptCompleted) return;
  job.attemptCompleted = true;
  releaseAPISlot(job);
  runningJobs.delete(job);
  if (job.subscribers?.size && !job.transportBlocked && (job.cancelled || job.restartAfterSettle) && job.revision === revision && job.cacheEpoch === cacheEpoch) {
    const sub = job.subscribers.values().next().value;
    job.client = sub.client;
    job.clientEpoch = sub.client.cancelEpoch;
    job.nativeGeneration = sub.client.nativeGeneration;
    job.cancelled = false;
    job.restartAfterSettle = false;
    job.terminal = false;
    job.controller = new AbortController();
    job.executionFinished = false;
    job.attemptCompleted = false;
    job.retryPlan = void 0;
    job.updateMessage = void 0;
    if (job.billing)
      job.completedBilling.push(
        billingMetadata(job.billing, job.settings.provider)
      );
    job.billing = void 0;
    job.requestDiagnostics = void 0;
    job.diagnosticsRecorded = false;
    job.attemptHasReaderText = false;
    job.retainedFactCheck = void 0;
    job.previousPartial = void 0;
    sendJob(job, { type: "QUEUED", requestId: job.requestId });
    enqueueJob(job);
    pump();
    return;
  }
  const plan = job.retryPlan;
  job.retryPlan = void 0;
  if (plan && logicalJobActive(job) && jobRailAllowed(job)) {
    const billing = aggregateBilling(job, job.billing);
    job.completedBilling.push(
      billingMetadata(job.billing, job.settings.provider)
    );
    const next = job.retryAttempts + 1;
    const partialResult = plan.extra.partialResult ? withBillingMetadata(
      { ...plan.extra.partialResult, ...billing },
      job.settings.provider,
      job.settings.apiVerification
    ) : void 0;
    sendJob(job, {
      type: commentsJob(job) ? "COMMENT_RETRY_WAIT" : "RETRY_WAIT",
      requestId: job.requestId,
      retryAttempt: next,
      maxRetries: Core.AUTO_RETRY_LIMIT,
      retryDelayMs: Core.AUTO_RETRY_DELAY_MS,
      error: plan.error,
      code: plan.code,
      ...plan.extra,
      ...billing,
      ...partialResult ? { partialResult } : {}
    });
    job.retryTimer = setTimeout(() => {
      job.retryTimer = void 0;
      if (!logicalJobActive(job) || !jobRailAllowed(job)) {
        removeJob(job);
        return;
      }
      job.previousPartial = job.retainedFactCheck ? sanitizeAnalysis(job.retainedFactCheck) : void 0;
      job.nextRetryAttempt = next;
      job.controller = new AbortController();
      job.executionFinished = false;
      job.attemptCompleted = false;
      job.billing = void 0;
      job.requestDiagnostics = void 0;
      job.diagnosticsRecorded = false;
      job.attemptHasReaderText = false;
      enqueueJob(job);
      sendJob(job, {
        type: commentsJob(job) ? "COMMENT_QUEUED" : "QUEUED",
        requestId: job.requestId,
        retryAttempt: next,
        maxRetries: Core.AUTO_RETRY_LIMIT
      });
      pump();
    }, Core.AUTO_RETRY_DELAY_MS);
  } else removeJob(job);
  pump();
}
function stopUnavailableBuild(code) {
  buildStatus = { ...buildStatus, available: false, errorCode: code };
  buildStatusAt = Date.now();
  for (const waiting of [...jobs.values()].filter(
    (job) => job.settings.provider === "build" && !runningJobs.has(job)
  )) {
    jobError(waiting, SuperXBuild.publicError({ code }).error, code);
    abortJob(waiting);
  }
  queue = queue.filter((job) => job.settings.provider !== "build");
  void broadcastConfig();
}
function pump() {
  if (pumping || !providerAllowsCalls()) return;
  pumping = true;
  try {
    queue = queue.filter(
      (job) => jobs.get(job.key) === job && !job.controller.signal.aborted && job.revision === revision && jobAudienceActive(job)
    );
    while (queue.length) {
      const job = queue[0];
      if (!currentTaskAllowed(job)) {
        queue.shift();
        jobError(job, "已暂停自动分析。", "PAUSED");
        abortJob(job, true);
        continue;
      }
      if (apiSlots.size >= apiLimit(job.settings)) break;
      queue.shift();
      runningJobs.add(job);
      job.started = true;
      if (job.nextRetryAttempt) {
        job.retryAttempts = job.nextRetryAttempt;
        job.nextRetryAttempt = void 0;
      }
      job.slotHeld = true;
      job.slotPhase = commentsJob(job) ? "comments" : "verify";
      apiSlots.add(job);
      void executeJob(job);
    }
  } finally {
    pumping = false;
  }
}
async function executeJob(job) {
  const { client, requestId } = job, signal = job.controller.signal;
  const epoch = job.cacheEpoch;
  try {
    const used = commentsJob(job) || draftJob(job) ? quotas[client.tabId] || 0 : quotas[client.tabId] = (quotas[client.tabId] || 0) + 1;
    startAPIDeadline(job);
    if (!commentsJob(job) && !draftJob(job))
      void persistQuotas().catch(() => {
      });
    if (!liveJob(job)) return;
    sendJob(job, {
      type: commentsJob(job) ? "COMMENT_START" : "START",
      requestId,
      retryAttempt: job.retryAttempts,
      maxRetries: Core.AUTO_RETRY_LIMIT,
      ...commentsJob(job) ? {} : { used }
    });
    const onUpdate = (update) => {
      job.billing = {
        ...job.billing,
        ...billingMetadata(update, job.settings.provider)
      };
      const diagnostics = requestMetadata(
        update,
        job.settings.provider
      ).requestDiagnostics;
      if (diagnostics) job.requestDiagnostics = diagnostics;
      const hasText = typeof update.text === "string";
      const text = hasText ? Core.readerOutput(update.text).text.slice(0, 3e4) : void 0;
      if (!commentsJob(job) && hasText && !signal.aborted) {
        if (text.trim()) job.attemptHasReaderText = true;
        if (text.trim())
          job.retainedFactCheck = {
            ...sanitizeAnalysis({ ...update, text }),
            ...job.billing,
            provider: job.settings.provider,
            apiVerification: "only",
            verified: false,
            searched: update.searched === true
          };
        else if (job.attemptHasReaderText || !job.retryAttempts)
          delete job.retainedFactCheck;
      }
      if (liveJob(job) && !commentsJob(job))
        sendJob(job, {
          type: "UPDATE",
          requestId,
          ...hasText && (text.trim() || job.attemptHasReaderText || !job.retainedFactCheck) ? { text } : {},
          phase: update.phase,
          verificationStatus: update.verificationStatus,
          warning: update.warning,
          ...job.settings.provider === "x-native" ? { provider: "x-native", verified: false, searched: false } : {},
          ...!hasText || text.trim() || job.attemptHasReaderText || !job.retainedFactCheck ? { sources: update.sources } : {},
          ...aggregateBilling(job, job.billing),
          ...verificationMetadata(
            update,
            job.settings.apiVerification,
            text || ""
          )
        });
    };
    const result = withBillingMetadata(
      await (["build", "x-native"].includes(job.settings.provider) ? runAPI(job, onUpdate) : waitForAbort(trackedAPICall(job, onUpdate), signal)),
      job.settings.provider,
      commentsJob(job) ? void 0 : job.settings.apiVerification
    );
    if (!liveJob(job)) return;
    job.billing = {
      ...job.billing,
      ...billingMetadata(result, job.settings.provider)
    };
    if (result.requestDiagnostics)
      job.requestDiagnostics = result.requestDiagnostics;
    if (["api", "oauth"].includes(job.settings.provider) && apiCapacityFailure(result))
      throw Object.assign(
        new Error("Model capacity is temporarily unavailable."),
        {
          code: "API_CAPACITY",
          partialResult: result,
          verificationFailure: result.verificationFailure,
          ...job.billing,
          ...requestMetadata(result, job.settings.provider)
        }
      );
    if (commentsJob(job))
      result.comments = GrokFirstAPI.validateComments(result.comments);
    else {
      const reader = Core.readerOutput(result.text, { final: true });
      if (reader.kind !== "content") {
        job.retainedFactCheck = job.previousPartial;
        sendJob(job, {
          type: "UPDATE",
          requestId,
          text: job.previousPartial?.text || "",
          sources: job.previousPartial?.sources || [],
          phase: "verify",
          verificationStatus: "pending",
          ...aggregateBilling(job, job.billing)
        });
        throw Object.assign(
          new Error("Grok 未返回可显示的核查答案，可手动重试。"),
          {
            code: "API_INCOMPLETE",
            verificationFailure: {
              stage: "verify",
              code: "INCOMPLETE",
              errorCode: "API_INCOMPLETE"
            },
            ...job.billing
          }
        );
      }
      result.text = reader.text.slice(0, 3e4);
    }
    if (["incomplete", "failed"].includes(result.verificationStatus)) {
      rememberAPIDiagnostics(
        job,
        result,
        result.verificationFailure?.errorCode || "API_INCOMPLETE"
      );
      if (job.retryAttempts < Core.AUTO_RETRY_LIMIT && Core.autoRetryDecision({ ...result, provider: job.settings.provider }).retryable)
        throw Object.assign(new Error("Fact Check incomplete."), {
          code: result.verificationFailure?.errorCode || "API_INCOMPLETE",
          partialResult: result,
          verificationFailure: result.verificationFailure,
          ...job.billing
        });
    }
    Object.assign(result, aggregateBilling(job, job.billing));
    releaseAPISlot(job);
    pump();
    result.completedAt = Date.now();
    if (!draftJob(job))
      rememberHistoryResult(
        job.historyTicket,
        result,
        commentsJob(job),
        job.historyLanguage
      );
    if (!draftJob(job) && epoch === cacheEpoch && (commentsJob(job) || cacheableAnswer(result))) {
      if (!commentsJob(job)) saveAnswer(job, result, epoch);
      else {
        cache[job.fingerprint] = result;
        cache = pruneCache(cache);
        void persistCache(epoch).catch(() => {
        });
      }
    }
    const recovered = { retryAttempts: job.retryAttempts };
    if (liveJob(job))
      sendJob(
        job,
        commentsJob(job) ? {
          type: "COMMENT_RESULT",
          requestId,
          comments: result.comments,
          cached: false,
          ...aggregateBilling(job, job.billing),
          ...recovered
        } : { type: "RESULT", requestId, result, cached: false, ...recovered }
      );
  } catch (caught) {
    const e = caught;
    if (job.subscribers && (job.cancelled || job.restartAfterSettle) && !["X_NATIVE_CANCEL_UNCONFIRMED", "BUILD_CANCEL_UNCONFIRMED"].includes(
      e.code
    )) {
      sendCancelledSubscribers(job, {
        type: "ERROR",
        error: "请求已取消；可手动重试。",
        code: "CANCELLED",
        retryAttempts: job.retryAttempts || 0,
        ...aggregateBilling(job, job.billing)
      });
      return;
    }
    if (job.settings.provider === "x-native" && e.code === "X_NATIVE_CANCEL_UNCONFIRMED") {
      job.transportBlocked = true;
      const safe = SuperXNative.publicError(e);
      for (const waiting of [...jobs.values()].filter(
        (item) => item !== job && item.settings.provider === "x-native" && !runningJobs.has(item)
      )) {
        jobError(waiting, safe.error, safe.code);
        abortJob(waiting);
      }
      if (job.subscribers || nativeJobCurrent(job) && clients.has(client) && job.revision === revision && (!jobs.has(job.key) || jobs.get(job.key) === job))
        jobError(
          job,
          safe.error,
          safe.code,
          aggregateBilling(job, job.billing)
        );
      return;
    }
    if (liveJob(job) && job.settings.provider === "x-native" && [
      "X_NATIVE_LOGIN_REQUIRED",
      "X_NATIVE_USAGE_LIMIT",
      "X_NATIVE_PAGE_ERROR",
      "X_NATIVE_UNAVAILABLE",
      "X_NATIVE_ADAPTER_CHANGED"
    ].includes(e.code)) {
      nativeFaultCode = e.code;
      for (const waiting of [...jobs.values()].filter(
        (item) => item !== job && item.settings.provider === "x-native" && !runningJobs.has(item)
      )) {
        jobError(waiting, SuperXNative.publicError(e).error, e.code);
        abortJob(waiting);
      }
      void broadcastConfig();
    }
    if (job.settings.provider === "build" && e.code === "BUILD_CANCEL_UNCONFIRMED") {
      job.billing = {
        ...job.billing,
        ...billingMetadata(e.partialResult, job.settings.provider),
        ...billingMetadata(e, job.settings.provider)
      };
      job.transportBlocked = true;
      stopUnavailableBuild(e.code);
      if (jobAudienceActive(job) && (!jobs.has(job.key) || jobs.get(job.key) === job))
        jobError(
          job,
          SuperXBuild.publicError(e).error,
          e.code,
          aggregateBilling(job, job.billing)
        );
      return;
    }
    if (liveJob(job)) {
      job.billing = {
        ...job.billing,
        ...billingMetadata(e.partialResult, job.settings.provider),
        ...billingMetadata(e, job.settings.provider)
      };
      const errorBilling = aggregateBilling(job, job.billing);
      const diagnostics = requestMetadata(e, job.settings.provider).requestDiagnostics || requestMetadata(e.partialResult, job.settings.provider).requestDiagnostics || job.requestDiagnostics;
      const diagnosticMetadata = diagnostics ? { requestDiagnostics: diagnostics } : {};
      const retained = e.partialResult || job.retainedFactCheck;
      const partialText = Core.readerOutput(retained?.text, {
        final: true
      }).text.slice(0, 3e4);
      const partialResult = partialText ? withBillingMetadata(
        {
          ...retained,
          ...errorBilling,
          ...diagnosticMetadata,
          text: partialText,
          verificationStatus: "incomplete"
        },
        job.settings.provider,
        job.settings.apiVerification
      ) : void 0;
      if (partialResult && !commentsJob(job))
        job.retainedFactCheck = sanitizeAnalysis(partialResult);
      const safeError = e.code === "MODEL_UNSUPPORTED" ? GrokFirstAPI.publicError(e) : providers[job.settings.provider].publicError(e);
      const budgetFailure = ["api", "oauth"].includes(job.settings.provider) ? apiBudgetFailure(e) : void 0;
      const capacityFailure = ["api", "oauth"].includes(job.settings.provider) && apiCapacityFailure(e) ? GrokFirstAPI.sanitizedVerificationFailure(e.verificationFailure) || GrokFirstAPI.sanitizedVerificationFailure({
        stage: "verify",
        code: "SERVER",
        ...e.failureDetails,
        errorCode: "API_CAPACITY"
      }) : void 0;
      if (partialResult && !draftJob(job))
        rememberHistoryResult(
          job.historyTicket,
          { ...partialResult, completedAt: Date.now() },
          false,
          job.historyLanguage
        );
      rememberAPIDiagnostics(
        job,
        {
          ...diagnosticMetadata,
          verificationFailure: e.verificationFailure || partialResult?.verificationFailure || budgetFailure || capacityFailure
        },
        safeError.code
      );
      const failureMetadata = {
        ...errorBilling,
        ...diagnosticMetadata,
        ...commentsJob(job) ? budgetFailure || capacityFailure ? { verificationFailure: budgetFailure || capacityFailure } : {} : {
          ...verificationMetadata(
            {
              verificationFailure: e.verificationFailure || partialResult?.verificationFailure || budgetFailure || capacityFailure
            },
            job.settings.apiVerification
          ),
          partialResult
        }
      };
      if (!retryPlan(job, e, safeError.code, failureMetadata))
        jobError(job, safeError.error, safeError.code, {
          ...failureMetadata,
          retryAttempts: job.retryAttempts
        });
      if (job.settings.provider === "build" && [
        "BUILD_CONNECTION_REQUIRED",
        "BUILD_CANCEL_UNCONFIRMED",
        "BUILD_PERMISSION_REQUIRED",
        "BUILD_LOGIN_REQUIRED",
        "BUILD_VERSION_UNSUPPORTED",
        "BUILD_CONFIG_UNSUPPORTED",
        "BUILD_TOOL_POLICY",
        "BUILD_UNAVAILABLE"
      ].includes(safeError.code))
        stopUnavailableBuild(safeError.code);
    } else if (nativeJobCurrent(job) && signal.aborted && jobAudienceActive(job) && job.revision === revision && (!jobs.has(job.key) || jobs.get(job.key) === job)) {
      const reason = signal.reason;
      const timedOut = reason?.code === "TIMEOUT";
      const billing = aggregateBilling(job, job.billing);
      const partialResult = timedOut && job.retainedFactCheck ? withBillingMetadata(
        {
          ...job.retainedFactCheck,
          ...billing,
          verificationStatus: "incomplete",
          ...verificationMetadata(reason, job.settings.apiVerification)
        },
        job.settings.provider,
        job.settings.apiVerification
      ) : void 0;
      if (partialResult && !draftJob(job))
        rememberHistoryResult(
          job.historyTicket,
          { ...partialResult, completedAt: Date.now() },
          false,
          job.historyLanguage
        );
      const metadata = {
        ...billing,
        ...timedOut && !commentsJob(job) ? verificationMetadata(reason, job.settings.apiVerification) : {},
        ...partialResult ? { partialResult } : {}
      };
      if (!timedOut || !retryPlan(job, reason, reason.code, metadata))
        jobError(
          job,
          timedOut ? (job.settings.provider === "x-native" ? SuperXNative.publicError(reason) : GrokFirstAPI.publicError(reason)).error : "请求已取消；可手动重试。",
          timedOut ? reason.code : "CANCELLED",
          { ...metadata, retryAttempts: job.retryAttempts }
        );
    }
  } finally {
    clearAPIDeadline(job);
    job.executionFinished = true;
    if (!job.apiProviderPending) completeAttempt(job);
    pump();
  }
}
async function runAPI(job, onUpdate) {
  const signal = job.controller.signal, adapter = providers[job.settings.provider];
  if (!adapter)
    throw Object.assign(new Error("Unknown answer source."), {
      code: "PROVIDER_UNAVAILABLE"
    });
  const assertCurrent = () => {
    if (!liveJob(job))
      throw signal.reason || new DOMException("Cancelled", "AbortError");
  };
  return adapter.run(
    {
      post: job.post,
      settings: job.settings,
      task: commentsJob(job) ? "comments" : draftJob(job) ? "draft" : "analysis",
      analysis: job.analysis
    },
    {
      signal,
      onUpdate,
      client: job.client,
      assertCurrent,
      async getApiKey() {
        const session = await waitForAbort(
          chrome.storage.session.get("apiKey"),
          signal
        );
        assertCurrent();
        if (!validKey(session.apiKey))
          throw Object.assign(new Error("请打开设置并输入 API Key。"), {
            code: "NEEDS_KEY"
          });
        return session.apiKey;
      },
      async getBuildConnection() {
        const connection = buildConnection({ port: job.settings.buildPort });
        if (chrome.permissions?.contains && !await chrome.permissions.contains({
          origins: ["http://127.0.0.1/*"]
        }))
          throw Object.assign(
            new Error("Local connection access was removed."),
            { code: "BUILD_PERMISSION_REQUIRED" }
          );
        assertCurrent();
        return connection;
      },
      getOAuthAuthorization() {
        const expectedCredentialId = job.settings.oauthCredentialId;
        const token = async (forceRefresh = false, rejectedAccessToken) => {
          if (!liveJob(job))
            throw signal.reason || Object.assign(new Error("Cancelled."), { code: "CANCELLED" });
          const value = await oauth.ensureAccessToken({
            signal,
            forceRefresh,
            expectedCredentialId,
            rejectedAccessToken
          });
          if (!liveJob(job) || value.credentialId !== expectedCredentialId)
            throw Object.assign(new Error("Grok login changed."), {
              code: "OAUTH_ACCOUNT_CHANGED"
            });
          return value.accessToken;
        };
        if (!expectedCredentialId || !providerAllowsCalls(job.settings))
          throw Object.assign(
            new Error("Grok subscription login is required."),
            { code: "OAUTH_LOGIN_REQUIRED" }
          );
        return {
          getAccessToken: () => token(),
          onUnauthorized: (rejectedToken) => token(true, rejectedToken)
        };
      }
    }
  );
}
function invalidateSecurityJobs() {
  revision++;
  for (const job of [...jobs.values()]) abortJob(job);
  return clearQueuePause();
}
function securityError() {
  return { ok: false, errorKey: "errors.keyStorage" };
}
async function refreshSecurityState() {
  const [local, session] = await Promise.all([
    chrome.storage.local.get([
      "apiKey",
      "apiKeyEncrypted",
      "apiKeyVault",
      "rememberApiKey",
      "settings"
    ]),
    chrome.storage.session.get("apiKey")
  ]);
  settings = Core.normalizeSettings(local.settings);
  rememberApiKey = typeof local.rememberApiKey === "boolean" ? local.rememberApiKey : rememberApiKey;
  hasSavedKey = KeyStore.envelopePresent(local.apiKeyEncrypted) || validKey(local.apiKey) || local.apiKeyVault !== void 0;
  credentialReady = validKey(session.apiKey);
}
async function persistEncryptedKey(apiKey, values = {}, current = () => true) {
  sealAttempted = true;
  const envelope = await KeyStore.seal(apiKey);
  if (!current()) return false;
  if (!KeyStore.isEnvelope(envelope) || await KeyStore.open(envelope) !== apiKey)
    throw new Error("Key storage validation failed.");
  if (!current()) return false;
  await chrome.storage.local.set({ ...values, apiKeyEncrypted: envelope });
  if (!current()) return false;
  const stored = await chrome.storage.local.get("apiKeyEncrypted");
  if (!current()) return false;
  if (!KeyStore.isEnvelope(stored.apiKeyEncrypted) || await KeyStore.open(stored.apiKeyEncrypted) !== apiKey)
    throw new Error("Key storage validation failed.");
  if (!current()) return false;
  await chrome.storage.local.remove(["apiKey", "apiKeyVault"]);
  return current();
}
async function mutateSecurity(message, generation) {
  const current = () => generation === securityGeneration;
  if (!current()) return;
  const apiKey = message.apiKey, remember = typeof message.remember === "boolean" ? message.remember : rememberApiKey;
  const values = {
    rememberApiKey: remember,
    ...message.settings ? { settings: message.settings } : {}
  };
  await chrome.storage.session.remove("apiKey");
  if (!current()) return;
  if (apiKey && remember) {
    if (!await persistEncryptedKey(apiKey, values, current)) return;
  } else {
    const needsDurableDeletion = !apiKey || message.remember !== false || hasSavedKey || sealAttempted || securityFault;
    await chrome.storage.local.remove([
      "apiKey",
      "apiKeyEncrypted",
      "apiKeyVault"
    ]);
    if (!current()) return;
    if (needsDurableDeletion) await KeyStore.clear();
    if (!current()) return;
    await chrome.storage.local.set(values);
  }
  if (!current()) return;
  if (message.settings) {
    settings = message.settings;
    providerFault = false;
    await chrome.storage.local.remove("invalidAnswerSource");
  }
  if (apiKey) await chrome.storage.session.set({ apiKey });
}
function queueSecurityMutation(message) {
  const generation = ++securityGeneration;
  securityPending++;
  let pauseReset;
  if (message.settings && JSON.stringify(paidTaskSettings(message.settings)) !== JSON.stringify(paidTaskSettings(settings)))
    pauseReset = invalidateSecurityJobs();
  else {
    if (settings?.provider === "api") revision++;
    for (const job of [...jobs.values()].filter(
      (job2) => job2.settings.provider === "api"
    ))
      abortJob(job);
    pauseReset = clearQueuePause("api");
  }
  cache = {};
  cacheEpoch++;
  void ready.then(() => broadcastConfig()).catch(() => {
  });
  const operation = securityWrites.catch(() => {
  }).then(async () => {
    await ready;
    await pauseReset;
    let failure;
    try {
      try {
        await clearStoredCache();
      } catch (error) {
        failure = securityError();
      }
      try {
        await mutateSecurity(message, generation);
      } catch (error) {
        failure = securityError();
      }
      try {
        await refreshSecurityState();
      } catch (error) {
        failure = securityError();
        credentialReady = false;
      }
      if (failure) {
        securityFault = true;
        try {
          await chrome.storage.session.set({ securityFault: true });
        } catch {
        }
      } else if (generation === securityGeneration) {
        try {
          await chrome.storage.session.remove("securityFault");
          securityFault = false;
        } catch (error) {
          securityFault = true;
          failure = securityError();
          try {
            await chrome.storage.session.set({ securityFault: true });
          } catch {
          }
        }
      }
    } finally {
      securityPending--;
    }
    await broadcastConfig();
    return failure || { ok: true, ...securityStatus() };
  });
  securityWrites = operation;
  return operation;
}
async function saveSettings(input) {
  const next = Core.normalizeSettings(input);
  if (next.provider === "x-native") nativeFaultCode = "";
  if (JSON.stringify(next) !== JSON.stringify(settings)) {
    const modelChanged = next.apiModel !== settings.apiModel;
    const cancelsJobs = JSON.stringify(paidTaskSettings(next)) !== JSON.stringify(paidTaskSettings(settings));
    if (cancelsJobs) {
      revision++;
      for (const job of [...jobs.values()]) abortJob(job);
    }
    if (next.provider !== settings.provider) {
      oauthActionGeneration++;
      await history.invalidateResults?.();
      const state = oauth.status();
      if (oauthPendingLogins || state.device || ["starting", "authorizing", "awaiting_authorization"].includes(
        state.state
      ))
        await oauth.cancelLogin();
    }
    const capacityChanged = next.answerCacheLimitMB !== settings.answerCacheLimitMB;
    settings = next;
    providerFault = false;
    if (capacityChanged)
      await queueAnswerWrite(() => answers.trim(answerBudget())).catch(
        () => {
        }
      );
    removePausedAutomaticJobs();
    if (cancelsJobs) {
      await clearQueuePause();
      pump();
    }
    await chrome.storage.local.set({ settings });
    await chrome.storage.local.remove("invalidAnswerSource");
    if (modelChanged) await clearAPICapacityPause();
  }
  if (providerFault) {
    providerFault = false;
    await chrome.storage.local.remove("invalidAnswerSource");
  }
  await broadcastConfig();
}
function queueSettingsMutation(input) {
  const operation = securityWrites.catch(() => {
  }).then(async () => {
    await ready;
    await saveSettings(typeof input === "function" ? input() : input);
    return { ok: true };
  });
  securityWrites = operation;
  return operation;
}
async function handleOAuthMessage(message, actionGeneration) {
  if (message.type === "GET_OAUTH_STATUS")
    return { ok: true, oauthStatus: oauth.status() };
  if ((message.type === "OAUTH_SET_REMEMBER" || ["OAUTH_LOGIN", "OAUTH_START_LOGIN"].includes(message.type) && message.remember !== void 0) && typeof message.remember !== "boolean")
    return {
      ok: false,
      errorCode: "OAUTH_DEVICE_INVALID",
      oauthStatus: oauth.status()
    };
  let state;
  if (["OAUTH_LOGIN", "OAUTH_START_LOGIN"].includes(message.type)) {
    if (actionGeneration !== oauthActionGeneration)
      return {
        ok: false,
        errorCode: "OAUTH_CANCELLED",
        oauthStatus: oauth.status()
      };
    state = await oauth.startLogin({
      remember: message.remember ?? settings.oauthRemember ?? true
    });
    const device = state.device;
    if (device && actionGeneration === oauthActionGeneration && oauth.status().device?.userCode === device.userCode) {
      try {
        await chrome.tabs.create({
          url: device.verificationUriComplete,
          active: true
        });
      } catch {
        return {
          ok: false,
          errorCode: "OAUTH_AUTH_UNAVAILABLE",
          oauthStatus: oauth.status()
        };
      }
    }
  } else if (message.type === "OAUTH_CANCEL_LOGIN")
    state = await oauth.cancelLogin();
  else if (message.type === "OAUTH_LOGOUT") {
    state = await oauth.logout();
    for (const key of Object.keys(cache)) {
      try {
        if (JSON.parse(key)[1] === "oauth") delete cache[key];
      } catch {
        delete cache[key];
      }
    }
    cacheEpoch++;
    await queueAnswerWrite(() => answers.removeProvider("oauth")).catch(
      () => {
      }
    );
    await persistCache(cacheEpoch).catch(() => {
    });
  } else if (message.type === "OAUTH_SET_REMEMBER")
    state = await oauth.setRemember(message.remember);
  else if (message.type === "OAUTH_REFRESH_CATALOG")
    state = await oauth.catalog();
  if (state && ["OAUTH_LOGIN", "OAUTH_START_LOGIN", "OAUTH_SET_REMEMBER"].includes(
    message.type
  ) && typeof state.remember === "boolean") {
    await queueSettingsMutation(() => ({
      ...settings,
      oauthRemember: state.remember
    }));
  }
  await broadcastConfig();
  return {
    ok: !state?.errorCode,
    oauthStatus: oauth.status(),
    ...state?.errorCode ? { errorCode: state.errorCode } : {}
  };
}
chrome.runtime.onMessage.addListener((input, sender, respond) => {
  const message = input;
  const oauthTypes = [
    "GET_OAUTH_STATUS",
    "OAUTH_LOGIN",
    "OAUTH_START_LOGIN",
    "OAUTH_CANCEL_LOGIN",
    "OAUTH_LOGOUT",
    "OAUTH_SET_REMEMBER",
    "OAUTH_REFRESH_CATALOG"
  ];
  if (oauthTypes.includes(message?.type)) {
    if (!trustedUI(sender)) {
      respond({ ok: false, errorCode: "OAUTH_PERMISSION" });
      return false;
    }
    const login = ["OAUTH_LOGIN", "OAUTH_START_LOGIN"].includes(message.type);
    const actionGeneration = [
      "OAUTH_LOGIN",
      "OAUTH_START_LOGIN",
      "OAUTH_CANCEL_LOGIN",
      "OAUTH_LOGOUT"
    ].includes(message.type) ? ++oauthActionGeneration : oauthActionGeneration;
    if (login) oauthPendingLogins++;
    ready.then(() => handleOAuthMessage(message, actionGeneration)).then(respond).catch(
      () => respond({
        ok: false,
        errorCode: "OAUTH_AUTH_UNAVAILABLE",
        oauthStatus: oauth.status()
      })
    ).finally(() => {
      if (login) oauthPendingLogins--;
    });
    return true;
  }
  if (trustedUI(sender) && message?.type === "SAVE_KEY") {
    const raw = message.apiKey, apiKey = typeof raw === "string" ? raw.trim() : raw == null ? "" : null;
    if (apiKey === null || typeof raw === "string" && (/[\r\n]/.test(raw) || raw.trim() && !validKey(raw))) {
      respond({ ok: false, errorKey: "errors.keyInvalid" });
      return true;
    }
    if (message.remember !== void 0 && typeof message.remember !== "boolean") {
      respond({ ok: false, errorKey: "errors.keyInvalid" });
      return true;
    }
    if (message.settings?.provider !== void 0 && !["api", "oauth", "build", "x-native"].includes(
      message.settings.provider
    )) {
      respond({ ok: false, errorKey: "options.providerChoice" });
      return true;
    }
    const next = message.settings === void 0 ? void 0 : Core.normalizeSettings(message.settings);
    if (next && next.provider !== "x-native" && !next.webSearch && !next.xSearch) {
      respond({ ok: false, errorKey: "options.urlSearchRequired" });
      return true;
    }
    queueSecurityMutation({
      apiKey,
      remember: message.remember,
      settings: next
    }).then(respond).catch(() => respond(securityError()));
    return true;
  }
  if (trustedUI(sender) && message?.type === "SAVE_SETTINGS") {
    if (message.settings?.provider !== void 0 && !["api", "oauth", "build", "x-native"].includes(
      message.settings.provider
    )) {
      respond({ ok: false, errorKey: "options.providerChoice" });
      return true;
    }
    const next = Core.normalizeSettings(message.settings);
    if (next.provider !== "x-native" && !next.webSearch && !next.xSearch) {
      respond({ ok: false, errorKey: "options.urlSearchRequired" });
      return true;
    }
    queueSettingsMutation(next).then(respond).catch(
      () => respond({ ok: false, error: "扩展操作失败，请重新加载扩展。" })
    );
    return true;
  }
  (async () => {
    await ready;
    if (message?.type === "OPEN_SETTINGS" && (trustedUI(sender) || trustedFeed(sender))) {
      await openSettings(message.focus);
      return { ok: true };
    }
    if (message?.type === "OPEN_HISTORY" && (trustedUI(sender) || trustedFeed(sender))) {
      await openHistory();
      return { ok: true };
    }
    if (!trustedUI(sender))
      return { ok: false, error: "此操作仅允许在扩展设置页中执行。" };
    if (message.type === "GET_UI_LANGUAGE")
      return { ok: true, language: await currentUILanguage() };
    if (message.type === "GET_SECURITY_STATUS")
      return { ok: true, ...securityStatus() };
    if (message.type === "OPEN_CONNECTOR_GUIDE") {
      await chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
      return { ok: true };
    }
    if (message.type === "GET_BUILD_CONNECTION")
      return {
        ok: true,
        configured: validBuildSecret(buildSecret),
        port: settings.buildPort
      };
    if (message.type === "GET_BUILD_LAUNCH") {
      if (!["/options.html", "/setup.html"].includes(
        new URL(sender.url).pathname
      ))
        return { ok: false, errorKey: "build.codeRequired" };
      const port = message.port ?? settings.buildPort, secret = validBuildSecret(buildSecret) ? buildSecret : newBuildSecret();
      try {
        return {
          ok: true,
          command: SuperXBuildSetup.command({
            platform: message.platform,
            port,
            secret
          }),
          port,
          secret
        };
      } catch {
        return { ok: false, errorKey: "build.codeRequired" };
      }
    }
    if (message.type === "SAVE_BUILD_CONNECTION")
      return queueBuildConnection(message);
    if (message.type === "CLEAR_BUILD_CONNECTION")
      return queueBuildConnection(message, true);
    if (message.type === "GET_BUILD_STATUS") return checkBuildDraft(message);
    if (message.type === "GET_CONFIG") {
      if (settings.provider === "build") await refreshBuildStatus();
      return {
        ok: true,
        ...await publicConfig(),
        oauthStatus: oauth.status()
      };
    }
    if (message.type === "GET_API_DIAGNOSTICS") return getAPIDiagnostics();
    if (message.type === "CLEAR_API_DIAGNOSTICS") return clearAPIDiagnostics();
    if (message.type === "GET_HISTORY" || message.type === "GET_HISTORY_STATUS") {
      try {
        const result = await history[message.type === "GET_HISTORY" ? "get" : "status"]();
        return {
          ok: true,
          ...message.type === "GET_HISTORY" ? scopedHistory(result) : result
        };
      } catch {
        return { ok: false, errorKey: "history.storageError" };
      }
    }
    if (["CLEAR_HISTORY", "DELETE_HISTORY", "SET_HISTORY_ENABLED"].includes(
      message.type
    )) {
      if (message.type === "DELETE_HISTORY" && !/^\d{1,25}$/.test(String(message.id || "")) || message.type === "SET_HISTORY_ENABLED" && typeof message.enabled !== "boolean")
        return { ok: false, errorKey: "history.storageError" };
      try {
        const result = await (message.type === "CLEAR_HISTORY" ? history.clear() : message.type === "DELETE_HISTORY" ? history.delete(message.id) : history.setEnabled(message.enabled));
        await broadcastHistoryConfig();
        return { ok: true, ...scopedHistory(result) };
      } catch {
        return { ok: false, errorKey: "history.storageError" };
      }
    }
    if (message.type === "CLEAR_CACHE") {
      await clearStoredCache();
      return { ok: true };
    }
    return { ok: false, error: "未知操作。" };
  })().then(respond).catch(
    () => respond({ ok: false, error: "扩展操作失败，请重新加载扩展。" })
  );
  return true;
});
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (Object.values(SuperXOAuth.ALARMS || {}).includes(alarm.name))
    void ready.then(() => oauth.handleAlarm(alarm)).catch(() => {
    });
  if (alarm.name === HISTORY_ALARM) {
    void ready.then(() => history.prune()).then(() => notifyHistoryChanged()).catch(() => {
    });
    void ready.then(() => pruneStoredAPIDiagnostics()).catch(() => {
    });
  }
});
chrome.runtime.onStartup?.addListener(() => {
  void ready.then(() => oauthReady).catch(() => {
  });
});
chrome.permissions?.onRemoved?.addListener((removed) => {
  if (!removed.origins?.includes("http://127.0.0.1/*")) return;
  void ready.then(async () => {
    buildConnectionGeneration++;
    stopUnavailableBuild("BUILD_PERMISSION_REQUIRED");
    for (const job of [...jobs.values()].filter(
      (job2) => job2.settings.provider === "build"
    ))
      abortJob(job);
    await SuperXBuild.close?.();
  }).catch(() => {
  });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  ready.then(async () => {
    delete quotas[tabId];
    delete railStates[tabId];
    await Promise.all([persistQuotas(), persistRailStates()]);
  });
  for (const client of clients)
    if (client.tabId === tabId) cancelClient(client);
});
