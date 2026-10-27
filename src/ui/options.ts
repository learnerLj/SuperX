import type { Settings } from "../shared/contracts";
import type {
  ControlMessage,
  Reply,
  OAuthStatus,
  ModelEntry,
  BuildStatus,
  ErrorShape,
} from "./state-types";
import type { FailureDetails } from "../providers/types";
interface OAuthView {
  state: string;
  connected: boolean;
  remember: boolean;
  catalogModels: ModelEntry[] | null;
  errorKey?: string;
  catalogError?: boolean;
  device?: { userCode: string; url: string };
}
interface FieldError {
  key: string;
  vars: Record<string, unknown>;
  errorId: string | null;
}
interface PageElements {
  "maintenance-link": HTMLAnchorElement & { disabled?: boolean };
  save: HTMLElementTagNameMap["button"];
  status: HTMLElementTagNameMap["p"];
  "settings-form": HTMLElementTagNameMap["form"];
  enabled: HTMLElementTagNameMap["input"];
  "source-heading": HTMLElementTagNameMap["h2"];
  "source-description": HTMLElementTagNameMap["p"];
  provider: HTMLElementTagNameMap["select"];
  "api-fields": HTMLElementTagNameMap["div"];
  "api-key": HTMLElementTagNameMap["input"];
  "key-help": HTMLElementTagNameMap["p"];
  "api-access-guide": HTMLElementTagNameMap["details"];
  "api-subscription-help": HTMLElementTagNameMap["p"];
  "api-subscription-before": HTMLElementTagNameMap["span"];
  "api-subscription-link": HTMLAnchorElement & { disabled?: boolean };
  "api-subscription-after": HTMLElementTagNameMap["span"];
  "remember-key": HTMLElementTagNameMap["input"];
  "key-security-state": HTMLElementTagNameMap["p"];
  "clear-key": HTMLElementTagNameMap["button"];
  "api-model": HTMLElementTagNameMap["select"];
  "api-model-status": HTMLElementTagNameMap["p"];
  "api-reasoning-effort": HTMLElementTagNameMap["select"];
  "model-help": HTMLElementTagNameMap["p"];
  "fast-preset": HTMLElementTagNameMap["button"];
  "model-pricing": HTMLAnchorElement & { disabled?: boolean };
  "oauth-fields": HTMLElementTagNameMap["div"];
  "oauth-heading": HTMLElementTagNameMap["h3"];
  "oauth-intro": HTMLElementTagNameMap["p"];
  "oauth-status": HTMLElementTagNameMap["p"];
  "oauth-login": HTMLElementTagNameMap["button"];
  "oauth-cancel": HTMLElementTagNameMap["button"];
  "oauth-logout": HTMLElementTagNameMap["button"];
  "oauth-device": HTMLElementTagNameMap["div"];
  "oauth-user-code": HTMLElementTagNameMap["code"];
  "oauth-copy-code": HTMLElementTagNameMap["button"];
  "oauth-official-link": HTMLAnchorElement & { disabled?: boolean };
  "oauth-remember": HTMLElementTagNameMap["input"];
  "oauth-model": HTMLElementTagNameMap["select"];
  "oauth-model-help": HTMLElementTagNameMap["p"];
  "oauth-model-status": HTMLElementTagNameMap["p"];
  "oauth-refresh-models": HTMLElementTagNameMap["button"];
  "oauth-reasoning-effort": HTMLElementTagNameMap["select"];
  "oauth-recommendation-help": HTMLElementTagNameMap["p"];
  "api-concurrency-field": HTMLElementTagNameMap["div"];
  "api-concurrency": HTMLElementTagNameMap["input"];
  "api-concurrency-help": HTMLElementTagNameMap["p"];
  "build-fields": HTMLElementTagNameMap["div"];
  "build-setup-heading": HTMLElementTagNameMap["h3"];
  "build-guide": HTMLElementTagNameMap["button"];
  "build-platform": HTMLElementTagNameMap["select"];
  "generate-build-command": HTMLElementTagNameMap["button"];
  "build-launch": HTMLElementTagNameMap["div"];
  "build-command": HTMLElementTagNameMap["code"];
  "copy-build-command": HTMLElementTagNameMap["button"];
  "build-port": HTMLElementTagNameMap["input"];
  "build-address": HTMLElementTagNameMap["p"];
  "build-secret": HTMLElementTagNameMap["input"];
  "build-secret-help": HTMLElementTagNameMap["p"];
  "clear-build-connection": HTMLElementTagNameMap["button"];
  "build-model": HTMLElementTagNameMap["select"];
  "build-model-help": HTMLElementTagNameMap["p"];
  "build-fast-help": HTMLElementTagNameMap["p"];
  "build-model-status": HTMLElementTagNameMap["p"];
  "build-reasoning-effort": HTMLElementTagNameMap["select"];
  "build-recommendation-help": HTMLElementTagNameMap["p"];
  "check-build": HTMLElementTagNameMap["button"];
  "build-status": HTMLElementTagNameMap["p"];
  "analysis-dwell": HTMLElementTagNameMap["input"];
  "analysis-dwell-help": HTMLElementTagNameMap["p"];
  "prefetch-count": HTMLElementTagNameMap["input"];
  "prefetch-all": HTMLElementTagNameMap["input"];
  "prefetch-help": HTMLElementTagNameMap["p"];
  "search-options": HTMLElementTagNameMap["div"];
  "verification-help": HTMLElementTagNameMap["p"];
  "web-search": HTMLElementTagNameMap["input"];
  "x-search": HTMLElementTagNameMap["input"];
  "search-status": HTMLElementTagNameMap["p"];
  "language-heading": HTMLElementTagNameMap["h2"];
  language: HTMLElementTagNameMap["select"];
  "language-help": HTMLElementTagNameMap["p"];
  "interface-language": HTMLElementTagNameMap["select"];
  "interface-language-help": HTMLElementTagNameMap["p"];
  "prompts-heading": HTMLElementTagNameMap["h2"];
  "reset-prompts": HTMLElementTagNameMap["button"];
  "explanation-mode-field": HTMLElementTagNameMap["div"];
  "explanation-mode": HTMLElementTagNameMap["select"];
  "explanation-mode-help": HTMLElementTagNameMap["p"];
  "prompt-editing-help": HTMLElementTagNameMap["div"];
  "prompt-rules-help": HTMLElementTagNameMap["p"];
  "analysis-prompts": HTMLElementTagNameMap["div"];
  "reset-verify-prompt": HTMLElementTagNameMap["button"];
  "verify-prompt-help": HTMLElementTagNameMap["p"];
  "verify-prompt": HTMLElementTagNameMap["textarea"];
  "reset-post-draft-prompt": HTMLElementTagNameMap["button"];
  "post-draft-prompt-help": HTMLElementTagNameMap["p"];
  "post-draft-prompt": HTMLElementTagNameMap["textarea"];
  "reset-reply-draft-prompt": HTMLElementTagNameMap["button"];
  "reply-draft-prompt-help": HTMLElementTagNameMap["p"];
  "reply-draft-prompt": HTMLElementTagNameMap["textarea"];
  "comments-customization": HTMLElementTagNameMap["details"];
  "comments-prompt-help": HTMLElementTagNameMap["p"];
  "reset-comments-prompt": HTMLElementTagNameMap["button"];
  "comments-prompt": HTMLElementTagNameMap["textarea"];
  maintenance: HTMLElementTagNameMap["details"];
  "maintenance-heading": HTMLElementTagNameMap["summary"];
  "answer-cache-limit": HTMLElementTagNameMap["input"];
  "answer-cache-limit-help": HTMLElementTagNameMap["p"];
  "cache-heading": HTMLElementTagNameMap["h3"];
  "clear-cache": HTMLElementTagNameMap["button"];
  "reload-heading": HTMLElementTagNameMap["h3"];
  "extension-version": HTMLElementTagNameMap["p"];
  "reload-extension": HTMLElementTagNameMap["button"];
  "api-diagnostics": HTMLElementTagNameMap["details"];
  "diagnostics-summary": HTMLElementTagNameMap["summary"];
  "diagnostics-help": HTMLElementTagNameMap["p"];
  "diagnostics-refresh": HTMLElementTagNameMap["button"];
  "diagnostics-copy": HTMLElementTagNameMap["button"];
  "diagnostics-clear": HTMLElementTagNameMap["button"];
  "diagnostics-status": HTMLElementTagNameMap["p"];
  "diagnostics-output": HTMLElementTagNameMap["pre"];
}
("use strict");

(() => {
  const core = globalThis.XGrokCore;
  const ui = globalThis.GrokFirstUI;
  function $<K extends keyof PageElements>(id: K): PageElements[K];
  function $(id: string): HTMLElement;
  function $(id: string) {
    return document.getElementById(id)!;
  }
  const promptFields = [
    { name: "verify", setting: "verifyPrompt", id: "verify-prompt" },
    { name: "postDraft", setting: "postDraftPrompt", id: "post-draft-prompt" },
    {
      name: "replyDraft",
      setting: "replyDraftPrompt",
      id: "reply-draft-prompt",
    },
    { name: "comments", setting: "commentsPrompt", id: "comments-prompt" },
  ] as const;
  const promptLimit = core.MAX_PROMPT_LENGTH || 12000;
  let currentSettings = core.normalizeSettings(core.DEFAULT_SETTINGS);
  let observedUILanguage = ui.browserLanguage(globalThis);
  let uiLanguage = observedUILanguage;
  let localeRevision = 0;
  let statusMessage: {
    key: string;
    state: string;
    vars: Record<string, unknown>;
  } | null = null;
  const fieldErrors = new Map<string, FieldError>();
  let displayedExplanationMode: string | undefined;
  let keyChanged = false;
  let rememberChanged = false;
  let originalKey = "";
  let security = { keyState: "missing", remember: true, hasSavedKey: false };
  let securityLoaded = false;
  let busy = false;
  let optionsFocusPending = false;
  let lastOptionsFocusNonce: string | number | undefined;
  let diagnosticsBusy = false,
    diagnosticsStatusKey: string | null = null,
    diagnosticsText = "",
    diagnosticsRetentionHours = 24,
    diagnosticsMaxEntries = 30;
  let buildStatus: BuildStatus | null = null,
    buildChecking = false,
    buildCheckRevision = 0;
  let buildConnection = { configured: false, port: 2419 },
    buildSecretChanged = false,
    buildGenerating = false;
  let oauthStatus: OAuthView = {
      state: "idle",
      connected: false,
      remember: true,
      catalogModels: null,
    },
    oauthActionBusy = false,
    oauthLoginPending = false,
    oauthActionRevision = 0,
    oauthLoaded = false,
    oauthPollTimer: number | undefined,
    oauthReadRevision = 0,
    oauthActionError: string | null = null;
  const apiControlIds = [
    "api-key",
    "remember-key",
    "api-model",
    "api-reasoning-effort",
    "fast-preset",
    "clear-key",
  ] as const;
  const buildControlIds = [
    "build-platform",
    "build-port",
    "build-secret",
    "generate-build-command",
    "copy-build-command",
    "clear-build-connection",
    "build-model",
    "build-reasoning-effort",
    "check-build",
    "build-guide",
  ] as const;
  const oauthControlIds = [
    "oauth-login",
    "oauth-cancel",
    "oauth-logout",
    "oauth-remember",
    "oauth-copy-code",
    "oauth-model",
    "oauth-reasoning-effort",
    "oauth-refresh-models",
  ] as const;
  const isBuild = () => $("provider").value === "build";
  const isOAuth = () => $("provider").value === "oauth";
  const isNative = () => $("provider").value === "x-native";
  const isAPI = () => $("provider").value === "api";
  function oauthErrorKey(code: string | null | undefined) {
    return (
      (
        {
          OAUTH_ACCESS_DENIED: "oauth.denied",
          OAUTH_AUTHORIZATION_DENIED: "oauth.denied",
          OAUTH_AUTHORIZATION_EXPIRED: "oauth.expired",
          OAUTH_DEVICE_EXPIRED: "oauth.expired",
          OAUTH_EXPIRED_TOKEN: "oauth.expired",
          OAUTH_NETWORK_ERROR: "oauth.networkError",
          OAUTH_AUTH_UNAVAILABLE: "oauth.networkError",
          OAUTH_NETWORK: "oauth.networkError",
          OAUTH_STORAGE_ERROR: "oauth.storageError",
          OAUTH_REAUTH_REQUIRED: "oauth.reauthRequired",
          OAUTH_REFRESH_UNCERTAIN: "oauth.reauthRequired",
          OAUTH_ACCOUNT_CHANGED: "oauth.reauthRequired",
          OAUTH_NOT_CONNECTED: "oauth.needsLogin",
          OAUTH_LOGIN_REQUIRED: "oauth.needsLogin",
          OAUTH_CANCELLED: "oauth.canceled",
          OAUTH_CATALOG_ERROR: "oauth.catalogUnavailable",
          OAUTH_CATALOG_FAILED: "oauth.catalogUnavailable",
          OAUTH_CATALOG_UNAVAILABLE: "oauth.catalogUnavailable",
        } as Record<string, string>
      )[code!] || "oauth.unavailable"
    );
  }
  function officialOAuthURL(value: unknown) {
    if (typeof value !== "string" || value.length > 2048) return "";
    try {
      const url = new URL(value);
      if (
        !["https://accounts.x.ai", "https://auth.x.ai"].includes(url.origin) ||
        url.username ||
        url.password ||
        url.hash ||
        !/^\/oauth2\/device(?:\/|$)/.test(url.pathname)
      )
        return "";
      for (const key of url.searchParams.keys())
        if (!["user_code", "client_id"].includes(key)) return "";
      return url.href;
    } catch {
      return "";
    }
  }
  function safeOAuthStatus(raw: OAuthStatus | undefined) {
    const states: Record<string, string> = {
      disconnected: "idle",
      starting: "authorizing",
      awaiting_authorization: "authorizing",
      idle: "idle",
      authorizing: "authorizing",
      connected: "connected",
      refreshing: "refreshing",
      restoring: "restoring",
      reauth_required: "reauth_required",
      error: "error",
      logging_out: "logging_out",
    };
    const result: OAuthView = {
      state: states[raw?.state!] || "idle",
      connected: raw?.connected === true,
      remember:
        typeof raw?.remember === "boolean"
          ? raw.remember
          : currentSettings.oauthRemember !== false,
      catalogModels: null,
    };
    if (typeof raw?.errorCode === "string")
      result.errorKey = oauthErrorKey(raw.errorCode);
    if (raw?.catalogErrorCode) result.catalogError = true;
    if (result.connected && Array.isArray(raw?.catalogModels))
      result.catalogModels = raw.catalogModels
        .slice(0, 100)
        .flatMap((entry) => {
          const id = typeof entry === "string" ? entry : entry?.id;
          if (
            typeof id !== "string" ||
            !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id)
          )
            return [];
          return [
            {
              id,
              available: (entry as ModelEntry)?.available !== false,
              ...(Array.isArray((entry as ModelEntry)?.efforts)
                ? {
                    efforts: (entry as ModelEntry).efforts!.filter((value) =>
                      [
                        "none",
                        "minimal",
                        "low",
                        "medium",
                        "high",
                        "xhigh",
                        "auto",
                      ].includes(value),
                    ),
                  }
                : {}),
            },
          ];
        });
    const code = raw?.device?.userCode,
      url = officialOAuthURL(raw?.device?.verificationUriComplete);
    if (
      result.state === "authorizing" &&
      typeof code === "string" &&
      /^[A-Za-z0-9-]{3,32}$/.test(code) &&
      url
    )
      result.device = { userCode: code, url };
    return result;
  }
  function oauthEfforts(model: string) {
    const entry = oauthStatus.catalogModels?.find((item) => item.id === model),
      profile = core.modelProfile(model);
    return (entry as ModelEntry)?.efforts || profile?.efforts || ["auto"];
  }
  function modelChoices(savedModel: string) {
    const choices: { value: string; label: string }[] = [...core.API_MODELS];
    // Preserve a previous configuration without advertising the provider's
    // complete catalog, which also includes image and video generators.
    if (!choices.some((item) => item.value === savedModel))
      choices.push({
        value: savedModel,
        label: ui.t(
          core.isNonTextGenerationModel(savedModel)
            ? "options.unsupportedModel"
            : "options.savedModel",
          uiLanguage,
          { model: savedModel },
        ),
      });
    return choices;
  }
  function modelChoiceLabel(item: { value: string; label: string }) {
    return item.value === "grok-4.3"
      ? ui.t("options.recommendedChoice", uiLanguage, { label: item.label })
      : item.label;
  }
  function reasoningChoiceLabel(value: string) {
    const label = ui.t("options.reasoning." + value, uiLanguage);
    return value === "none"
      ? ui.t("options.recommendedChoice", uiLanguage, { label })
      : label;
  }
  function populateOAuthModels(
    model: string = currentSettings.oauthModel || "grok-4.3",
    effort = $("oauth-reasoning-effort").value ||
      currentSettings.oauthReasoningEffort ||
      "none",
    modelChanged = false,
  ) {
    const select = $("oauth-model");
    select.replaceChildren();
    for (const item of modelChoices(currentSettings.oauthModel)) {
      const { value } = item,
        option = document.createElement("option");
      option.value = value;
      option.textContent = modelChoiceLabel(item);
      option.disabled =
        core.isNonTextGenerationModel(value) ||
        (Array.isArray(oauthStatus.catalogModels) &&
          !oauthStatus.catalogModels.some(
            (entry) => entry.id === value && entry.available !== false,
          ));
      select.append(option);
    }
    select.value = model;
    const reasoning = $("oauth-reasoning-effort"),
      efforts = oauthEfforts(model),
      preferred = core.reasoningEffort(model),
      selected = efforts.includes(effort)
        ? effort
        : !modelChanged &&
            [
              "none",
              "minimal",
              "low",
              "medium",
              "high",
              "xhigh",
              "auto",
            ].includes(effort)
          ? effort
          : efforts.includes(preferred)
            ? preferred
            : efforts[0] || "";
    reasoning.replaceChildren();
    for (const value of [
      ...efforts,
      ...(selected && !efforts.includes(selected) ? [selected] : []),
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = reasoningChoiceLabel(value);
      option.disabled = !efforts.includes(value);
      reasoning.append(option);
    }
    reasoning.value = selected;
  }
  function renderOAuth() {
    const selected = isOAuth(),
      pending = [
        "authorizing",
        "restoring",
        "refreshing",
        "logging_out",
      ].includes(oauthStatus.state),
      authorizing = oauthStatus.state === "authorizing",
      connected = oauthStatus.connected;
    $("oauth-intro").hidden = connected || oauthStatus.state === "refreshing";
    for (const id of oauthControlIds)
      ($(id) as HTMLButtonElement).disabled =
        busy || oauthActionBusy || !selected;
    $("oauth-login").hidden =
      authorizing ||
      connected ||
      ["restoring", "logging_out"].includes(oauthStatus.state);
    $("oauth-cancel").hidden = !authorizing;
    $("oauth-logout").hidden =
      !connected && oauthStatus.state !== "reauth_required";
    $("oauth-remember").disabled =
      busy ||
      oauthActionBusy ||
      !selected ||
      ["restoring", "logging_out"].includes(oauthStatus.state);
    $("oauth-refresh-models").disabled =
      busy || oauthActionBusy || !selected || !connected || pending;
    const statusKey =
      oauthActionError ||
      (oauthStatus.state === "error"
        ? oauthStatus.errorKey || "oauth.unavailable"
        : {
            idle: "oauth.idle",
            authorizing: "oauth.authorizing",
            connected: "oauth.connected",
            refreshing: "oauth.refreshing",
            restoring: "oauth.restoring",
            reauth_required: "oauth.reauthRequired",
            logging_out: "oauth.loggingOut",
          }[oauthStatus.state] || "oauth.unavailable");
    $("oauth-status").textContent = ui.t(statusKey, uiLanguage);
    $("oauth-status").dataset.state = oauthActionError
      ? "error"
      : oauthStatus.state;
    $("oauth-status").hidden =
      oauthStatus.state === "idle" && !oauthActionError;
    const device = oauthStatus.device;
    $("oauth-device").hidden = !device;
    $("oauth-user-code").textContent = device?.userCode || "";
    if (device) $("oauth-official-link").setAttribute("href", device.url);
    else $("oauth-official-link").removeAttribute("href");
    const model = $("oauth-model").value,
      available =
        !Array.isArray(oauthStatus.catalogModels) ||
        oauthStatus.catalogModels.some(
          (entry) => entry.id === model && entry.available !== false,
        ),
      effort = oauthEfforts(model).includes($("oauth-reasoning-effort").value);
    clearResolvedError("oauth-model", connected, [
      "oauth.needsLogin",
      "oauth.unavailable",
      "oauth.denied",
      "oauth.expired",
      "oauth.storageError",
      "oauth.networkError",
      "oauth.reauthRequired",
      "oauth.canceled",
    ]);
    clearResolvedError(
      "oauth-model",
      connected && !oauthStatus.catalogError && available,
      ["oauth.catalogUnavailable", "oauth.modelUnavailable"],
    );
    clearResolvedError("oauth-model", !core.isNonTextGenerationModel(model), [
      "error.modelUnsupported",
    ]);
    clearResolvedError("oauth-reasoning-effort", effort, [
      "options.reasoningInvalid",
    ]);
    $("oauth-model-status").textContent = core.isNonTextGenerationModel(model)
      ? ui.t("error.modelUnsupported", uiLanguage)
      : oauthStatus.catalogError
        ? ui.t("oauth.catalogUnavailable", uiLanguage)
        : !available
          ? ui.t("oauth.modelUnavailable", uiLanguage, { model })
          : !effort
            ? ui.t("options.reasoningInvalid", uiLanguage)
            : "";
  }
  function scheduleOAuthPoll() {
    if (oauthPollTimer !== undefined) globalThis.clearTimeout?.(oauthPollTimer);
    oauthPollTimer = undefined;
    if (
      isOAuth() &&
      ["authorizing", "restoring", "refreshing", "logging_out"].includes(
        oauthStatus.state,
      ) &&
      (globalThis.setTimeout as unknown)
    )
      oauthPollTimer = setTimeout(() => {
        oauthPollTimer = undefined;
        void refreshOAuthStatus();
      }, 1500);
  }
  function applyOAuthStatus(raw: OAuthStatus | undefined) {
    oauthStatus = safeOAuthStatus(raw);
    oauthLoaded = true;
    $("oauth-remember").checked = oauthStatus.remember;
    currentSettings = {
      ...currentSettings,
      oauthRemember: oauthStatus.remember,
    };
    populateOAuthModels(
      $("oauth-model").value || currentSettings.oauthModel,
      $("oauth-reasoning-effort").value || currentSettings.oauthReasoningEffort,
    );
    renderOAuth();
    scheduleOAuthPoll();
  }
  async function refreshOAuthStatus() {
    const revision = ++oauthReadRevision;
    try {
      const result = await send({ type: "GET_OAUTH_STATUS" });
      if (revision === oauthReadRevision && result.oauthStatus) {
        oauthActionError = null;
        applyOAuthStatus(result.oauthStatus);
      }
    } catch {
      if (revision === oauthReadRevision) {
        oauthActionError = "oauth.unavailable";
        renderOAuth();
      }
    }
  }
  async function oauthAction(type: string, values = {}) {
    if (busy || oauthActionBusy || !isOAuth()) return;
    const revision = ++oauthActionRevision;
    oauthActionBusy = true;
    oauthLoginPending = type === "OAUTH_LOGIN";
    oauthActionError = null;
    oauthReadRevision++;
    renderOAuth();
    try {
      const result = await chrome.runtime.sendMessage<unknown, Reply>({
        type,
        ...values,
      });
      if (revision !== oauthActionRevision) return;
      if (result?.oauthStatus) applyOAuthStatus(result.oauthStatus);
      if (!result?.ok) {
        oauthActionError = oauthErrorKey(
          result?.errorCode || result?.oauthStatus?.errorCode,
        );
        renderOAuth();
      } else if (!result.oauthStatus) throw new Error("Missing OAuth status");
    } catch {
      if (revision === oauthActionRevision) {
        oauthActionError = "oauth.unavailable";
        $("oauth-remember").checked = oauthStatus.remember;
        renderOAuth();
      }
    } finally {
      if (revision === oauthActionRevision) {
        oauthActionBusy = false;
        oauthLoginPending = false;
        renderOAuth();
        scheduleOAuthPoll();
      }
    }
  }
  async function cancelOAuthLoginOnProviderChange() {
    if (
      isOAuth() ||
      (!oauthLoginPending && oauthStatus.state !== "authorizing")
    )
      return;
    const revision = ++oauthActionRevision;
    oauthReadRevision++;
    oauthActionBusy = false;
    oauthLoginPending = false;
    oauthActionError = null;
    oauthStatus = {
      ...oauthStatus,
      state: "idle",
      connected: false,
      device: undefined,
    };
    renderOAuth();
    scheduleOAuthPoll();
    try {
      const result = await send({ type: "OAUTH_CANCEL_LOGIN" });
      if (revision === oauthActionRevision && result.oauthStatus)
        applyOAuthStatus(result.oauthStatus);
    } catch {
      if (revision === oauthActionRevision && isOAuth()) {
        oauthActionError = "oauth.unavailable";
        renderOAuth();
      }
    }
  }
  function buildStateKey() {
    if (buildChecking) return "build.checking";
    if (!buildStatus) return "build.unknown";
    if (buildStatus.errorCode === "BUILD_PERMISSION_REQUIRED")
      return "build.permission";
    if (buildStatus.ready === true) return "build.ready";
    if (buildStatus.errorCode === "BUILD_CANCEL_UNCONFIRMED")
      return "build.cancelUnconfirmed";
    if (
      [
        "BUILD_CONNECTION_REQUIRED",
        "BUILD_NOT_CONFIGURED",
        "BUILD_SECRET_REQUIRED",
      ].includes(buildStatus.errorCode!)
    )
      return "build.codeRequired";
    if (
      ["BUILD_AUTH_FAILED", "BUILD_INVALID_SECRET"].includes(
        buildStatus.errorCode!,
      )
    )
      return "build.codeInvalid";
    if (
      [
        "BUILD_NOT_CONNECTED",
        "BUILD_CONNECTION_FAILED",
        "BUILD_UNAVAILABLE",
        "BUILD_DISCONNECTED",
      ].includes(buildStatus.errorCode!)
    )
      return "build.missing";
    if (
      buildStatus.authenticated === false ||
      ["BUILD_AUTH_REQUIRED", "BUILD_LOGIN_REQUIRED"].includes(
        buildStatus.errorCode!,
      )
    )
      return "build.login";
    if (
      [
        "BUILD_VERSION_UNSUPPORTED",
        "BUILD_UNSUPPORTED_VERSION",
        "BUILD_PROTOCOL_UNSUPPORTED",
        "BUILD_TOOL_POLICY",
        "BUILD_CONFIG_UNSUPPORTED",
      ].includes(buildStatus.errorCode!)
    )
      return "build.unsupported";
    return "build.unavailable";
  }
  function renderBuildStatus() {
    $("build-status").textContent = ui.t(buildStateKey(), uiLanguage);
    $("build-status").dataset.state =
      buildStatus?.ready === true ? "ready" : "unknown";
    $("check-build").disabled =
      busy || buildChecking || buildGenerating || !isBuild();
    $("generate-build-command").disabled =
      busy || buildGenerating || buildChecking || !isBuild();
    if (isBuild())
      $("save").disabled = busy || buildChecking || buildGenerating;
    $("clear-build-connection").hidden = !buildConnection.configured;
    $("build-secret").placeholder = ui.t(
      buildConnection.configured ? "build.savedCode" : "build.codePlaceholder",
      uiLanguage,
    );
    $("build-address").textContent =
      `ws://127.0.0.1:${$("build-port").value || 2419}`;
    const catalog = buildStatus?.modelCatalog;
    const selected = $("build-model").value;
    const unavailable =
      Array.isArray(catalog) &&
      !catalog.some(
        (item) =>
          (typeof item === "string" ? item : item.id) === selected &&
          item.available !== false,
      );
    const efforts = catalog?.find(
      (item) => item && typeof item === "object" && item.id === selected,
    )?.efforts;
    const effortUnavailable =
      Array.isArray(efforts) &&
      !efforts.includes($("build-reasoning-effort").value);
    if (
      buildStatus?.ready === true &&
      fieldErrors.get("build-secret")?.key.startsWith("build.")
    )
      clearFieldError("build-secret");
    clearResolvedError("build-model", !unavailable, [
      "options.buildModelUnavailable",
    ]);
    clearResolvedError(
      "build-model",
      !core.isNonTextGenerationModel(selected),
      ["error.modelUnsupported"],
    );
    clearResolvedError(
      "build-reasoning-effort",
      Boolean($("build-reasoning-effort").value) && !effortUnavailable,
      ["options.reasoningInvalid"],
    );
    $("build-model-status").textContent = core.isNonTextGenerationModel(
      selected,
    )
      ? ui.t("error.modelUnsupported", uiLanguage)
      : unavailable
        ? ui.t("options.buildModelUnavailable", uiLanguage, { model: selected })
        : effortUnavailable
          ? ui.t("options.reasoningInvalid", uiLanguage)
          : "";
    $("build-fast-help").textContent = ui.t(
      "options.buildFastHelp",
      uiLanguage,
    );
    $("build-fast-help").hidden = !/fast/i.test(selected);
  }
  function renderProvider() {
    const build = isBuild(),
      oauth = isOAuth(),
      native = isNative();
    $("api-fields").hidden = !isAPI();
    $("build-fields").hidden = !build;
    $("oauth-fields").hidden = !oauth;
    for (const id of apiControlIds)
      ($(id) as HTMLButtonElement).disabled = busy || !isAPI();
    for (const id of buildControlIds)
      ($(id) as HTMLButtonElement).disabled = busy || !build;
    $("api-concurrency-field").hidden = build || native;
    $("api-concurrency").disabled = busy || build || native;
    for (const id of ["web-search", "x-search"] as const)
      ($(id) as HTMLButtonElement).disabled = busy || native;
    $("source-description").textContent = native
      ? ui.t("native.help", uiLanguage)
      : build
        ? ui.t("options.buildDescription", uiLanguage)
        : "";
    $("source-description").hidden = !build && !native;
    $("search-options").hidden = native;
    $("save").disabled = busy;
    $("verification-help").textContent = ui.t(
      native
        ? "native.help"
        : oauth
          ? "oauth.verificationHelp"
          : "options.verificationHelp",
      uiLanguage,
    );
    renderBuildStatus();
    renderOAuth();
    renderPrefetch();
  }
  function renderPrefetch() {
    $("prefetch-count").disabled = busy || $("prefetch-all").checked;
  }
  function requestLocalAccess() {
    try {
      return (
        chrome.permissions?.request({ origins: ["http://127.0.0.1/*"] }) ||
        Promise.resolve(false)
      );
    } catch {
      return Promise.resolve(false);
    }
  }

  function renderDiagnostics() {
    $("diagnostics-help").textContent = ui.t(
      "options.diagnosticsHelp",
      uiLanguage,
      { hours: diagnosticsRetentionHours, maxEntries: diagnosticsMaxEntries },
    );
    $("diagnostics-status").textContent = diagnosticsStatusKey
      ? ui.t(diagnosticsStatusKey, uiLanguage)
      : "";
    $("diagnostics-output").textContent = diagnosticsText;
    $("diagnostics-output").hidden = !diagnosticsText;
    for (const id of ["diagnostics-refresh", "diagnostics-clear"] as const)
      ($(id) as HTMLButtonElement).disabled = busy || diagnosticsBusy;
    $("diagnostics-copy").disabled =
      busy || diagnosticsBusy || !diagnosticsText;
  }
  function diagnosticEntries(value: unknown) {
    if (
      !Array.isArray(value) ||
      typeof core.sanitizedRequestDiagnostics !== "function"
    )
      throw new Error("Invalid diagnostics response");
    const errorCodes = new Set([
      "API_INCOMPLETE",
      "API_STREAM_INTERRUPTED",
      "API_STREAM_ERROR",
      "API_LANGUAGE_MISMATCH",
      "API_CAPACITY",
      "RATE_LIMIT",
      "API_ERROR",
      "CANCELED",
      "TIMEOUT",
      "COMMENTS_INVALID_RESPONSE",
    ]);
    const failureCodes = new Set([
      "OUTPUT_LIMIT",
      "INCOMPLETE",
      "CONNECTION",
      "TIMEOUT",
      "LANGUAGE_MISMATCH",
      "RATE_LIMIT",
      "ACCESS",
      "SERVER",
      "UNKNOWN",
    ]);
    return value.slice(0, 30).flatMap((entry) => {
      if (
        !entry ||
        !Number.isSafeInteger(entry.recordedAt) ||
        entry.recordedAt < 0
      )
        return [];
      const requestDiagnostics = core.sanitizedRequestDiagnostics(
        entry.requestDiagnostics,
      );
      if (!requestDiagnostics || !Object.keys(requestDiagnostics).length)
        return [];
      const code = errorCodes.has(entry.code) ? entry.code : "API_ERROR",
        failure = entry.verificationFailure;
      let verificationFailure: FailureDetails | undefined;
      if (failure?.stage === "verify" && failureCodes.has(failure.code)) {
        verificationFailure = { stage: "verify", code: failure.code };
        if (errorCodes.has(failure.errorCode))
          verificationFailure.errorCode = failure.errorCode;
        if (
          Number.isInteger(failure.httpStatus) &&
          failure.httpStatus >= 100 &&
          failure.httpStatus <= 599
        )
          verificationFailure.httpStatus = failure.httpStatus;
        const providerCode = core.apiFailureProviderCode(failure.providerCode);
        if (providerCode) verificationFailure.providerCode = providerCode;
        if (["max_output_tokens", "content_filter"].includes(failure.reason))
          verificationFailure.reason = failure.reason;
      }
      return [
        {
          recordedAt: entry.recordedAt,
          code,
          requestDiagnostics,
          ...(verificationFailure ? { verificationFailure } : {}),
        },
      ];
    });
  }
  async function refreshDiagnostics() {
    if (busy || diagnosticsBusy) return;
    diagnosticsBusy = true;
    diagnosticsStatusKey = "common.loading";
    renderDiagnostics();
    try {
      const result = await send({ type: "GET_API_DIAGNOSTICS" }),
        entries = diagnosticEntries(result.entries);
      diagnosticsText = entries.length ? JSON.stringify(entries, null, 2) : "";
      diagnosticsRetentionHours =
        Number.isInteger(result.retentionHours) &&
        result.retentionHours! > 0 &&
        result.retentionHours! <= 168
          ? result.retentionHours!
          : 24;
      diagnosticsMaxEntries =
        Number.isInteger(result.maxEntries) &&
        result.maxEntries! > 0 &&
        result.maxEntries! <= 30
          ? result.maxEntries!
          : 30;
      diagnosticsStatusKey = entries.length ? null : "options.diagnosticsEmpty";
    } catch {
      diagnosticsStatusKey = "options.diagnosticsUnavailable";
    } finally {
      diagnosticsBusy = false;
      renderDiagnostics();
    }
  }

  function setStatus(key: string, state = "success", vars = {}) {
    statusMessage = { key, state, vars };
    $("status").textContent = ui.t(key, uiLanguage, vars);
    $("status").dataset.state = state;
  }
  function fieldError(id: string, key: string, vars = {}) {
    const errorId =
      id === "api-key"
        ? "key-security-state"
        : id.startsWith("api-")
          ? "api-model-status"
          : id.startsWith("oauth-")
            ? "oauth-model-status"
            : id.startsWith("build-model") || id === "build-reasoning-effort"
              ? "build-model-status"
              : id.startsWith("build-")
                ? "build-status"
                : id === "x-search" || id === "web-search"
                  ? "search-status"
                  : null;
    fieldErrors.set(id, { key, vars, errorId });
    setStatus("options.checkFields", "error");
    const input = $(id),
      output = errorId && $(errorId);
    input.setAttribute("aria-invalid", "true");
    if (output) {
      output.textContent = ui.t(key, uiLanguage, vars);
      output.hidden = false;
      input.setAttribute("aria-errormessage", errorId);
      const described = (input.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter(Boolean);
      if (!described.includes(errorId))
        input.setAttribute(
          "aria-describedby",
          [...described, errorId].join(" "),
        );
    }
    for (
      let detail = input.closest?.("details");
      detail;
      detail = detail.parentElement?.closest?.("details")!
    )
      detail.open = true;
    input.focus();
    input.scrollIntoView?.({ block: "nearest" });
  }
  function clearFieldError(id: string) {
    const previous = fieldErrors.get(id);
    fieldErrors.delete(id);
    $(id).removeAttribute("aria-invalid");
    $(id).removeAttribute("aria-errormessage");
    const output = previous?.errorId && $(previous.errorId);
    if (
      output &&
      previous.errorId!.endsWith("-model-status") &&
      output.textContent === ui.t(previous.key, uiLanguage, previous.vars)
    )
      output.textContent = "";
  }
  function clearResolvedError(
    id: string,
    resolved: boolean,
    keys: readonly string[],
  ) {
    if (resolved && keys.includes(fieldErrors.get(id)?.key!))
      clearFieldError(id);
  }
  function renderSearchFeedback() {
    const missing =
        !isNative() && !$("web-search").checked && !$("x-search").checked,
      output = $("search-status");
    if (output) {
      output.hidden = !missing;
      output.textContent = missing
        ? ui.t("options.urlSearchRequired", uiLanguage)
        : "";
    }
    for (const id of ["web-search", "x-search"] as const) {
      if (missing) $(id).setAttribute("aria-invalid", "true");
      else clearFieldError(id);
    }
  }
  function setBusy(value: boolean) {
    busy = value;
    for (const control of $("settings-form").elements)
      (control as HTMLInputElement).disabled = value;
    renderSecurity();
    renderProvider();
    renderDiagnostics();
    if (!value && optionsFocusPending) void consumeOptionsFocus();
  }
  function keyInputClear() {
    $("api-key").value = "";
    originalKey = "";
    keyChanged = false;
  }
  function keyNeedsSave() {
    return keyChanged || rememberChanged;
  }
  function renderSecurity() {
    clearResolvedError(
      "api-key",
      securityLoaded && security.keyState === "ready",
      ["options.keyRequired", "errors.noResponse"],
    );
    const stateKeys: Record<string, string> = {
      ready: security.hasSavedKey
        ? "options.keyReadySaved"
        : "options.keyReady",
      migration: "options.keyMigration",
      missing: "options.keyMissing",
    };
    $("key-security-state").textContent = ui.t(
      stateKeys[security.keyState] || stateKeys.missing!,
      uiLanguage,
    );
    $("key-security-state").dataset.state = security.keyState;
    $("clear-key").hidden =
      !securityLoaded ||
      (security.keyState !== "ready" && !security.hasSavedKey);
    $("save").disabled = busy;
  }
  async function refreshSecurity(fillKey = false, preserveDraft = false) {
    const result = await send({ type: "GET_SECURITY_STATUS" });
    if (
      !["ready", "missing", "migration"].includes(result.keyState!) ||
      typeof result.remember !== "boolean" ||
      typeof result.hasSavedKey !== "boolean"
    ) {
      throw new Error(ui.t("errors.noResponse", uiLanguage));
    }
    security = result as typeof security;
    securityLoaded = true;
    if (fillKey) {
      const stored =
        security.keyState === "ready"
          ? await chrome.storage.session.get("apiKey")
          : {};
      const latestKey = (stored.apiKey as string | undefined) || "";
      // A change in another Settings tab updates the untouched input, while an
      // explicitly edited replacement Key remains this tab's unsaved draft.
      if (!preserveDraft || !keyChanged) {
        $("api-key").value = latestKey;
      }
      originalKey = latestKey;
      keyChanged = $("api-key").value.trim() !== originalKey.trim();
    }
    renderSecurity();
    return result;
  }
  function markDraft() {
    if (busy) return;
    const changed =
      keyChanged ||
      rememberChanged ||
      $("provider").value !== currentSettings.provider ||
      buildSecretChanged ||
      Number($("build-port").value) !== currentSettings.buildPort ||
      $("build-model").value !== currentSettings.buildModel ||
      $("build-reasoning-effort").value !==
        currentSettings.buildReasoningEffort ||
      $("oauth-model").value !== (currentSettings.oauthModel || "grok-4.3") ||
      $("oauth-reasoning-effort").value !==
        (currentSettings.oauthReasoningEffort || "none") ||
      $("enabled").checked !== currentSettings.enabled ||
      $("explanation-mode").value !== currentSettings.explanationMode ||
      $("api-model").value !== currentSettings.apiModel ||
      $("api-reasoning-effort").value !== currentSettings.apiReasoningEffort ||
      Number($("api-concurrency").value) !== currentSettings.apiConcurrency ||
      Number($("answer-cache-limit").value) !==
        currentSettings.answerCacheLimitMB ||
      Number($("prefetch-count").value) !== currentSettings.prefetchCount ||
      $("prefetch-all").checked !== currentSettings.prefetchAll ||
      Math.round(Number($("analysis-dwell").value) * 1000) !==
        currentSettings.dwellMs ||
      $("web-search").checked !== currentSettings.webSearch ||
      $("x-search").checked !== currentSettings.xSearch ||
      $("language").value !== currentSettings.language ||
      $("interface-language").value !== currentSettings.interfaceLanguage ||
      promptFields.some(
        (field: (typeof promptFields)[number]) =>
          $(field.id).value !== currentSettings[field.setting],
      );
    if (changed) setStatus("options.unsavedChanges");
    else if (statusMessage?.key === "options.unsavedChanges") {
      statusMessage = null;
      $("status").textContent = "";
      delete $("status").dataset.state;
    }
  }
  async function consumeOptionsFocus() {
    optionsFocusPending = true;
    if (busy || (isAPI() && !securityLoaded)) return;
    optionsFocusPending = false;
    try {
      const stored = await chrome.storage.session.get("superxOptionsFocus");
      const request = stored.superxOptionsFocus as
        { id: string; nonce: string | number } | undefined;
      if (
        !request ||
        !["api-key", "unlock-passphrase", "build", "oauth"].includes(
          request.id,
        ) ||
        !["string", "number"].includes(typeof request.nonce) ||
        request.nonce === lastOptionsFocusNonce
      )
        return;
      if (busy) {
        optionsFocusPending = true;
        return;
      }
      lastOptionsFocusNonce = request.nonce;
      // Focus an actionable control for the current connection state. A
      // restored login must never send focus to its hidden sign-in button.
      let id = ["native", "oauth"].includes(request.id)
        ? "provider"
        : request.id === "build" || isBuild()
          ? isBuild()
            ? "check-build"
            : "provider"
          : "api-key";
      if (isOAuth()) {
        const modelAvailable =
          !Array.isArray(oauthStatus.catalogModels) ||
          oauthStatus.catalogModels.some(
            (entry) =>
              entry.id === $("oauth-model").value && entry.available !== false,
          );
        if (
          oauthStatus.connected &&
          !modelAvailable &&
          !$("oauth-model").disabled
        )
          id = "oauth-model";
        else if (!$("oauth-login").hidden && !$("oauth-login").disabled)
          id = "oauth-login";
        else if (
          oauthStatus.device &&
          !$("oauth-device").hidden &&
          $("oauth-official-link").getAttribute("href")
        )
          id = "oauth-official-link";
        else id = "provider";
      }
      if ($(id).hidden || ($(id) as HTMLButtonElement).disabled)
        id = "provider";
      await chrome.storage.session.remove("superxOptionsFocus");
      $(id).scrollIntoView?.({ block: "center", behavior: "instant" });
      $(id).focus({ preventScroll: true });
    } catch {
      /* Opening Settings still works if a focus request cannot be consumed. */
    }
  }
  function showExplanationMode() {
    const mode =
      $("explanation-mode").value ||
      currentSettings.explanationMode ||
      "preset";
    $("analysis-prompts").hidden = mode !== "custom";
    if ($("prompt-editing-help"))
      $("prompt-editing-help").hidden = mode !== "custom";
    $("reset-prompts").hidden = mode !== "custom";
    if (
      mode === "custom" &&
      displayedExplanationMode !== mode &&
      $("comments-customization")
    )
      $("comments-customization").open = true;
    displayedExplanationMode = mode;
    const key =
      mode === "custom" ? "options.customModeHelp" : "options.presetModeHelp";
    $("explanation-mode-help").textContent = ui.t(key, uiLanguage);
  }
  function populateLanguages(language: string) {
    const select = $("language");
    select.replaceChildren();
    for (const item of core.LANGUAGES) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent =
        item.value === "auto" ? ui.t("lang.auto", uiLanguage) : item.label;
      select.append(option);
    }
    if (!core.LANGUAGES.some((item) => item.value === language)) {
      const option = document.createElement("option");
      option.value = language;
      option.textContent = ui.t("options.customLanguage", uiLanguage, {
        language,
      });
      select.append(option);
    }
    select.value = language;
  }
  function applyLanguage(language: unknown) {
    observedUILanguage = ui.normalizeLanguage(language);
    renderLanguage();
  }
  function populateInterfaceLanguages(language: string) {
    const select = $("interface-language");
    select.replaceChildren();
    for (const item of ui.INTERFACE_LANGUAGES) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent =
        item.value === "auto"
          ? ui.t("lang.interfaceAuto", uiLanguage)
          : item.label;
      select.append(option);
    }
    select.value = language;
  }
  function populateModels(model: string) {
    const select = $("api-model");
    select.replaceChildren();
    for (const item of modelChoices(currentSettings.apiModel)) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = modelChoiceLabel(item);
      option.disabled = core.isNonTextGenerationModel(item.value);
      select.append(option);
    }
    select.value = model;
  }
  function populateReasoning(model: string, effort: string) {
    const select = $("api-reasoning-effort");
    select.replaceChildren();
    for (const value of core.modelProfile(model)?.efforts || ["auto"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = reasoningChoiceLabel(value);
      select.append(option);
    }
    select.value = core.reasoningEffort(model, effort);
    clearResolvedError("api-reasoning-effort", Boolean(select.value), [
      "options.reasoningInvalid",
    ]);
  }
  function buildModelChoices() {
    return modelChoices(currentSettings.buildModel);
  }
  function populateBuildModels(model: string) {
    const select = $("build-model");
    select.replaceChildren();
    for (const item of buildModelChoices()) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = modelChoiceLabel(item);
      const catalog = buildStatus?.modelCatalog;
      option.disabled =
        core.isNonTextGenerationModel(item.value) ||
        (Array.isArray(catalog) &&
          !catalog.some(
            (entry) =>
              (typeof entry === "string" ? entry : entry.id) === item.value &&
              entry.available !== false,
          ));
      select.append(option);
    }
    select.value = model;
  }
  function populateBuildReasoning(
    model: string,
    effort: string,
    modelChanged = false,
  ) {
    const select = $("build-reasoning-effort");
    select.replaceChildren();
    const entry = buildStatus?.modelCatalog?.find(
      (item) => typeof item === "object" && item.id === model,
    );
    // Grok Build negotiates ACP levels independently of API model profiles.
    const supported = ["none", "minimal", "low", "medium", "high", "xhigh"];
    const efforts = Array.isArray((entry as ModelEntry)?.efforts)
      ? supported.filter((value) => entry!.efforts!.includes(value))
      : supported;
    for (const value of efforts) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = reasoningChoiceLabel(value);
      select.append(option);
    }
    const preferred = core.buildReasoningEffort(model);
    const selected = efforts.includes(effort)
      ? effort
      : !modelChanged && supported.includes(effort)
        ? effort
        : efforts.includes(preferred)
          ? preferred
          : efforts[0] || "";
    // A connection refresh must not silently turn 'none' into a reasoning
    // level. Keep an unavailable saved choice visible until explicitly edited.
    if (selected && !efforts.includes(selected)) {
      const option = document.createElement("option");
      option.value = selected;
      option.textContent = reasoningChoiceLabel(selected);
      option.disabled = true;
      select.append(option);
    }
    select.value = selected;
  }
  function renderLanguage() {
    const interfaceLanguage =
      $("interface-language").value || currentSettings.interfaceLanguage;
    uiLanguage = ui.resolveLanguage(interfaceLanguage, observedUILanguage);
    ui.apply(document, uiLanguage);
    // Keep a real, fixed-destination link inside localized plain text. Locale
    // refreshes must neither parse HTML nor reset the user's details toggle.
    const subscriptionName = "The X Subscription",
      subscriptionHelp = ui.t("options.apiSubscriptionHelp", uiLanguage);
    const subscriptionIndex = subscriptionHelp.indexOf(subscriptionName);
    $("api-subscription-before").textContent =
      subscriptionIndex < 0
        ? subscriptionHelp
        : subscriptionHelp.slice(0, subscriptionIndex);
    $("api-subscription-link").hidden = subscriptionIndex < 0;
    $("api-subscription-after").textContent =
      subscriptionIndex < 0
        ? ""
        : subscriptionHelp.slice(subscriptionIndex + subscriptionName.length);
    document.title = `SuperX · ${ui.t("common.settings", uiLanguage)}`;
    $("extension-version").textContent = ui.t("options.version", uiLanguage, {
      version: chrome.runtime.getManifest().version,
    });
    populateLanguages($("language").value || currentSettings.language);
    populateInterfaceLanguages(interfaceLanguage);
    const model = $("api-model").value || currentSettings.apiModel;
    const effort =
      $("api-reasoning-effort").value || currentSettings.apiReasoningEffort;
    populateModels(model);
    populateReasoning(model, effort);
    const buildModel = $("build-model").value || currentSettings.buildModel;
    const buildEffort =
      $("build-reasoning-effort").value || currentSettings.buildReasoningEffort;
    populateBuildModels(buildModel);
    populateBuildReasoning(buildModel, buildEffort);
    populateOAuthModels(
      $("oauth-model").value || currentSettings.oauthModel,
      $("oauth-reasoning-effort").value || currentSettings.oauthReasoningEffort,
    );
    showExplanationMode();
    renderSecurity();
    renderProvider();
    renderDiagnostics();
    renderSearchFeedback();
    for (const [id, error] of fieldErrors) {
      if (error.errorId && $(error.errorId))
        $(error.errorId).textContent = ui.t(error.key, uiLanguage, error.vars);
    }
    if (statusMessage)
      setStatus(statusMessage.key, statusMessage.state, statusMessage.vars);
  }
  function populate(settings: Settings) {
    $("enabled").checked = settings.enabled;
    $("provider").value = settings.provider;
    $("build-port").value = String(settings.buildPort);
    populateBuildModels(settings.buildModel);
    populateBuildReasoning(settings.buildModel, settings.buildReasoningEffort);
    populateOAuthModels(
      settings.oauthModel || "grok-4.3",
      settings.oauthReasoningEffort || "none",
    );
    $("oauth-remember").checked = oauthLoaded
      ? oauthStatus.remember
      : settings.oauthRemember !== false;
    $("explanation-mode").value =
      settings.explanationMode === "custom" ? "custom" : "preset";
    populateModels(settings.apiModel);
    populateReasoning(settings.apiModel, settings.apiReasoningEffort);
    $("api-concurrency").value = String(settings.apiConcurrency);
    $("answer-cache-limit").value = String(settings.answerCacheLimitMB);
    $("prefetch-count").value = String(settings.prefetchCount);
    $("prefetch-all").checked = settings.prefetchAll;
    renderPrefetch();
    $("analysis-dwell").value = String(settings.dwellMs / 1000);
    $("web-search").checked = settings.webSearch;
    $("x-search").checked = settings.xSearch;
    for (const field of promptFields)
      $(field.id).value = settings[field.setting];
    populateLanguages(settings.language);
    populateInterfaceLanguages(settings.interfaceLanguage);
    showExplanationMode();
    renderProvider();
    renderSearchFeedback();
  }
  async function send(message: ControlMessage) {
    const result = await chrome.runtime.sendMessage<unknown, Reply>(message);
    if (!result?.ok)
      throw new Error(
        result?.errorKey
          ? ui.t(result.errorKey, uiLanguage, result.vars || {})
          : result?.error || ui.t("errors.noResponse", uiLanguage),
      );
    return result;
  }
  async function load() {
    setBusy(true);
    const revision = localeRevision;
    try {
      // This reply waits for worker initialization, including legacy-source
      // migration. Read settings afterwards rather than keeping a pre-migration
      // storage snapshot that a later Save could write back over the result.
      const locale = await chrome.runtime
        .sendMessage<unknown, Reply>({ type: "GET_UI_LANGUAGE" })
        .catch(() => null);
      const local = await chrome.storage.local.get(["settings", "uiLanguage"]);
      // The worker hydrates remembered Keys before replying. Read its current
      // session mirror only afterwards so a browser restart cannot look empty.
      currentSettings = core.normalizeSettings(local.settings);
      populate(currentSettings);
      try {
        const connection = await send({ type: "GET_BUILD_CONNECTION" });
        buildConnection = {
          configured: connection.configured === true,
          port: connection.port || currentSettings.buildPort,
        };
        $("build-port").value = String(buildConnection.port);
      } catch {
        /* Existing API setup stays usable if the local connection is unavailable. */
      }
      try {
        await refreshSecurity(true);
      } catch (error) {
        if (currentSettings.provider === "api") throw error;
      }
      await refreshOAuthStatus();
      $("remember-key").checked = security.remember;
      if (localeRevision === revision)
        applyLanguage(
          locale?.language ||
            (local.uiLanguage as string) ||
            observedUILanguage,
        );
      else renderLanguage();
    } catch (error) {
      populate(currentSettings);
      setStatus("errors.load", "error", {
        error: (error as ErrorShape).message,
      });
    } finally {
      setBusy(false);
      await consumeOptionsFocus();
    }
  }
  $("explanation-mode").addEventListener("change", () => {
    showExplanationMode();
    markDraft();
  });
  $("provider").addEventListener("change", () => {
    void cancelOAuthLoginOnProviderChange();
    renderProvider();
    markDraft();
    scheduleOAuthPoll();
    if (isOAuth()) void refreshOAuthStatus();
  });
  $("oauth-login").addEventListener("click", () =>
    oauthAction("OAUTH_LOGIN", { remember: $("oauth-remember").checked }),
  );
  $("oauth-cancel").addEventListener("click", () =>
    oauthAction("OAUTH_CANCEL_LOGIN"),
  );
  $("oauth-logout").addEventListener("click", () =>
    oauthAction("OAUTH_LOGOUT"),
  );
  $("oauth-remember").addEventListener("change", () =>
    oauthAction("OAUTH_SET_REMEMBER", {
      remember: $("oauth-remember").checked,
    }),
  );
  $("oauth-refresh-models").addEventListener("click", () =>
    oauthAction("OAUTH_REFRESH_CATALOG"),
  );
  $("oauth-model").addEventListener("change", () => {
    populateOAuthModels(
      $("oauth-model").value,
      $("oauth-reasoning-effort").value,
      true,
    );
    renderOAuth();
    markDraft();
  });
  $("oauth-reasoning-effort").addEventListener("change", () => {
    renderOAuth();
    markDraft();
  });
  $("oauth-copy-code").addEventListener("click", async () => {
    if (!oauthStatus.device) return;
    try {
      await navigator.clipboard.writeText(oauthStatus.device.userCode);
      setStatus("common.copied");
    } catch {
      setStatus("common.copyFailed", "error");
    }
  });
  $("build-model").addEventListener("change", () => {
    populateBuildReasoning(
      $("build-model").value,
      $("build-reasoning-effort").value,
      true,
    );
    renderBuildStatus();
    markDraft();
  });
  $("build-reasoning-effort").addEventListener("change", () => {
    renderBuildStatus();
    markDraft();
  });
  $("check-build").addEventListener("click", async () => {
    if (busy || buildChecking || !isBuild()) return;
    const revision = ++buildCheckRevision;
    buildChecking = true;
    renderBuildStatus();
    // Optional loopback access is requested only from this explicit gesture.
    const permission = requestLocalAccess();
    try {
      if ((await permission) !== true) {
        if (revision === buildCheckRevision)
          buildStatus = {
            ready: false,
            errorCode: "BUILD_PERMISSION_REQUIRED",
          };
        return;
      }
      if (revision !== buildCheckRevision) return;
      const result = await send({
        type: "GET_BUILD_STATUS",
        port: Number($("build-port").value),
        ...(buildSecretChanged
          ? { secret: $("build-secret").value.trim() }
          : {}),
      });
      if (revision !== buildCheckRevision) return;
      buildStatus = result;
      const model = $("build-model").value,
        effort = $("build-reasoning-effort").value;
      populateBuildModels(model);
      populateBuildReasoning(model, effort);
      markDraft();
    } catch {
      if (revision === buildCheckRevision)
        buildStatus = { ready: false, errorCode: "BUILD_STATUS_UNKNOWN" };
    } finally {
      if (revision === buildCheckRevision) {
        buildChecking = false;
        renderBuildStatus();
      }
    }
  });
  $("build-guide").addEventListener("click", async () => {
    try {
      await send({ type: "OPEN_CONNECTOR_GUIDE" });
    } catch (error) {
      setStatus("errors.operation", "error", {
        error: (error as ErrorShape).message,
      });
    }
  });
  function resetBuildCheck() {
    buildCheckRevision++;
    buildChecking = false;
    buildStatus = null;
    const model = $("build-model").value,
      effort = $("build-reasoning-effort").value;
    populateBuildModels(model);
    populateBuildReasoning(model, effort);
    renderBuildStatus();
    markDraft();
  }
  $("build-platform").value = /Mac/i.test(
    navigator.userAgentData?.platform || navigator.platform || "",
  )
    ? "macos"
    : "windows";
  for (const id of ["build-port", "build-secret"] as const) {
    $(id).addEventListener("input", () => {
      if (id === "build-secret")
        buildSecretChanged =
          !buildConnection.configured || Boolean($(id).value.trim());
      $("build-launch").hidden = true;
      $("build-command").textContent = "";
      resetBuildCheck();
    });
  }
  $("build-platform").addEventListener("change", () => {
    $("build-launch").hidden = true;
  });
  $("generate-build-command").addEventListener("click", async () => {
    if (busy || buildGenerating || !isBuild()) return;
    buildGenerating = true;
    renderBuildStatus();
    try {
      const launch = await send({
        type: "GET_BUILD_LAUNCH",
        platform: $("build-platform").value,
        port: Number($("build-port").value),
      });
      if (
        typeof launch.command !== "string" ||
        typeof launch.secret !== "string" ||
        !launch.secret
      )
        throw new Error(ui.t("errors.noResponse", uiLanguage));
      $("build-command").textContent = launch.command;
      $("build-secret").value = launch.secret;
      $("build-port").value = String(launch.port);
      buildSecretChanged = true;
      $("build-launch").hidden = false;
      resetBuildCheck();
      setStatus("build.commandReady");
    } catch (error) {
      setStatus("errors.operation", "error", {
        error: (error as ErrorShape).message,
      });
    } finally {
      buildGenerating = false;
      renderBuildStatus();
    }
  });
  $("copy-build-command").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("build-command").textContent);
      setStatus("build.commandCopied");
    } catch {
      setStatus("common.copyFailed", "error");
    }
  });
  $("clear-build-connection").addEventListener("click", async () => {
    if (busy || !isBuild()) return;
    setBusy(true);
    try {
      await send({ type: "CLEAR_BUILD_CONNECTION" });
      buildConnection = { configured: false, port: currentSettings.buildPort };
      $("build-secret").value = "";
      buildSecretChanged = false;
      $("build-launch").hidden = true;
      $("build-command").textContent = "";
      resetBuildCheck();
      setStatus("build.cleared");
    } catch (error) {
      setStatus("errors.operation", "error", {
        error: (error as ErrorShape).message,
      });
    } finally {
      setBusy(false);
    }
  });
  $("interface-language").addEventListener("change", () => {
    renderLanguage();
    markDraft();
  });
  $("api-model").addEventListener("change", () => {
    populateReasoning($("api-model").value, $("api-reasoning-effort").value);
    markDraft();
  });
  for (const id of [
    "enabled",
    "build-reasoning-effort",
    "api-reasoning-effort",
    "api-concurrency",
    "answer-cache-limit",
    "prefetch-count",
    "prefetch-all",
    "analysis-dwell",
    "web-search",
    "x-search",
    "language",
    ...promptFields.map((field: (typeof promptFields)[number]) => field.id),
  ]) {
    $(id).addEventListener("input", markDraft);
    $(id).addEventListener("change", markDraft);
  }
  for (const id of [
    "api-key",
    "api-model",
    "api-reasoning-effort",
    "oauth-model",
    "oauth-reasoning-effort",
    "build-model",
    "build-reasoning-effort",
    "build-port",
    "build-secret",
  ] as const) {
    for (const event of ["input", "change"] as const)
      $(id).addEventListener(event, () => clearFieldError(id));
  }
  for (const id of ["web-search", "x-search"] as const) {
    for (const event of ["input", "change"] as const)
      $(id).addEventListener(event, renderSearchFeedback);
  }
  $("prefetch-all").addEventListener("change", renderPrefetch);
  function restorePrompt(field: (typeof promptFields)[number]) {
    $(field.id).value = core.DEFAULT_PROMPTS[field.name];
  }
  for (const field of promptFields) {
    $("reset-" + field.id).addEventListener("click", () => {
      if (busy) return;
      restorePrompt(field);
      setStatus("options.promptsReset");
    });
  }
  $("reset-prompts").addEventListener("click", () => {
    if (busy) return;
    for (const field of promptFields) restorePrompt(field);
    setStatus("options.promptsReset");
  });
  $("fast-preset").addEventListener("click", () => {
    $("api-model").value = "grok-4.3";
    populateReasoning("grok-4.3", "none");
    $("api-concurrency").value = String(core.DEFAULT_SETTINGS.apiConcurrency);
    $("analysis-dwell").value = String(core.DEFAULT_SETTINGS.dwellMs / 1000);
    showExplanationMode();
    setStatus("options.presetReady");
  });
  $("reload-extension").addEventListener("click", () => {
    if (busy) return;
    setStatus("options.reloading");
    chrome.runtime.reload();
  });
  function revealMaintenance() {
    const hash = globalThis.location?.hash || "";
    if (
      [
        "#maintenance-heading",
        "#cache-heading",
        "#reload-heading",
        "#api-diagnostics",
      ].includes(hash) &&
      $("maintenance")
    )
      $("maintenance").open = true;
  }
  $("maintenance-link")?.addEventListener("click", () => {
    if ($("maintenance")) $("maintenance").open = true;
  });
  globalThis.addEventListener?.("hashchange", revealMaintenance);
  revealMaintenance();
  $("api-key").addEventListener("input", () => {
    keyChanged = $("api-key").value.trim() !== originalKey.trim();
    renderSecurity();
    markDraft();
  });
  $("remember-key").addEventListener("change", () => {
    rememberChanged = $("remember-key").checked !== security.remember;
    renderSecurity();
    markDraft();
  });
  async function syncAfterSecurityAction(preserveDraft = false) {
    try {
      await refreshSecurity();
      if (!preserveDraft) $("remember-key").checked = security.remember;
      rememberChanged = $("remember-key").checked !== security.remember;
    } catch {
      // Runnable credential changes need a fresh Key state. Pausing and
      // unrelated preferences remain available after a failed mutation.
      securityLoaded = false;
    }
  }
  $("settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const enabled = $("enabled").checked,
      provider = $("provider").value;
    const modelId = isOAuth()
        ? "oauth-model"
        : isBuild()
          ? "build-model"
          : "api-model",
      effortId = isOAuth()
        ? "oauth-reasoning-effort"
        : isBuild()
          ? "build-reasoning-effort"
          : "api-reasoning-effort";
    const modelField = isOAuth()
        ? "oauthModel"
        : isBuild()
          ? "buildModel"
          : "apiModel",
      effortField = isOAuth()
        ? "oauthReasoningEffort"
        : isBuild()
          ? "buildReasoningEffort"
          : "apiReasoningEffort";
    const connectionChanged = isAPI()
      ? keyNeedsSave()
      : isBuild() &&
        (buildSecretChanged ||
          Number($("build-port").value) !== buildConnection.port);
    const strict =
      enabled &&
      !isNative() &&
      (!currentSettings.enabled ||
        provider !== currentSettings.provider ||
        $(modelId).value !== currentSettings[modelField] ||
        $(effortId).value !== currentSettings[effortField] ||
        $("web-search").checked !== currentSettings.webSearch ||
        $("x-search").checked !== currentSettings.xSearch ||
        connectionChanged);
    // A stale catalog or unfinished connection must not prevent pausing or
    // saving unrelated preferences. Native required checks still apply to
    // ordinary settings, while unchanged connection fields are not submitted.
    const ignored = !strict
        ? [modelId, effortId, ...(isBuild() ? ["build-port"] : [])]
        : [],
      disabled = ignored.map(
        (id: string) => [$(id), ($(id) as HTMLButtonElement).disabled] as const,
      );
    let valid;
    try {
      for (const [input] of disabled)
        (input as HTMLInputElement).disabled = true;
      valid = (event.currentTarget as HTMLFormElement).reportValidity();
    } finally {
      for (const [input, value] of disabled)
        (input as HTMLInputElement).disabled = value;
    }
    if (!valid) return;
    const oversized = promptFields.find(
      (field: (typeof promptFields)[number]) =>
        $(field.id).value.length > promptLimit,
    );
    if (oversized) {
      setStatus("options.promptTooLong", "error", { limit: promptLimit });
      $(oversized.id).focus();
      return;
    }
    const settings = core.normalizeSettings({
      ...currentSettings,
      analysisDefaultsVersion: core.DEFAULT_SETTINGS.analysisDefaultsVersion,
      enabled: $("enabled").checked,
      provider: $("provider").value,
      buildTransport: "acp",
      buildPort:
        enabled && isBuild() && connectionChanged
          ? Number($("build-port").value)
          : currentSettings.buildPort,
      buildModel: enabled
        ? $("build-model").value || currentSettings.buildModel
        : currentSettings.buildModel,
      buildReasoningEffort: enabled
        ? $("build-reasoning-effort").value ||
          currentSettings.buildReasoningEffort
        : currentSettings.buildReasoningEffort,
      oauthModel: enabled
        ? $("oauth-model").value || currentSettings.oauthModel
        : currentSettings.oauthModel,
      oauthReasoningEffort: enabled
        ? $("oauth-reasoning-effort").value ||
          currentSettings.oauthReasoningEffort
        : currentSettings.oauthReasoningEffort,
      oauthRemember: $("oauth-remember").checked,
      explanationMode: $("explanation-mode").value,
      apiModel: enabled
        ? $("api-model").value.trim() || currentSettings.apiModel
        : currentSettings.apiModel,
      apiReasoningEffort: enabled
        ? $("api-reasoning-effort").value || currentSettings.apiReasoningEffort
        : currentSettings.apiReasoningEffort,
      apiConcurrency: Number($("api-concurrency").value),
      answerCacheLimitMB: Number($("answer-cache-limit").value),
      prefetchCount: Number($("prefetch-count").value),
      prefetchAll: $("prefetch-all").checked,
      dwellMs: Math.round(Number($("analysis-dwell").value) * 1000),
      apiVerification: "only",
      webSearch: $("web-search").checked,
      xSearch: $("x-search").checked,
      language: $("language").value,
      interfaceLanguage: $("interface-language").value,
      verifyPrompt: $("verify-prompt").value,
      postDraftPrompt: $("post-draft-prompt").value,
      replyDraftPrompt: $("reply-draft-prompt").value,
      commentsPrompt: $("comments-prompt").value,
    });
    const apiKey = $("api-key").value.trim();
    const saveKey = enabled && isAPI() && connectionChanged;
    const saveBuildConnection = enabled && isBuild() && connectionChanged;
    const connectionDrafts =
      !enabled &&
      (keyNeedsSave() ||
        buildSecretChanged ||
        Number($("build-port").value) !== currentSettings.buildPort ||
        ["api", "build", "oauth"].some(
          (source) =>
            ($(source + "-model") as HTMLSelectElement).value !==
              currentSettings[
                (source + "Model") as "apiModel" | "oauthModel" | "buildModel"
              ] ||
            ($(source + "-reasoning-effort") as HTMLSelectElement).value !==
              currentSettings[
                (source + "ReasoningEffort") as
                  | "apiReasoningEffort"
                  | "oauthReasoningEffort"
                  | "buildReasoningEffort"
              ],
        ));
    const remember = $("remember-key").checked;
    const selectedModelId = isOAuth()
      ? "oauth-model"
      : isBuild()
        ? "build-model"
        : "api-model";
    if (strict && core.isNonTextGenerationModel($(selectedModelId).value)) {
      fieldError(selectedModelId, "error.modelUnsupported");
      return;
    }
    if (
      strict &&
      isBuild() &&
      !buildConnection.configured &&
      !$("build-secret").value.trim()
    ) {
      fieldError("build-secret", "build.codeRequired");
      return;
    }
    if (
      strict &&
      isAPI() &&
      (!securityLoaded || (!saveKey && security.keyState !== "ready"))
    ) {
      fieldError(
        "api-key",
        securityLoaded ? "options.keyRequired" : "errors.noResponse",
      );
      return;
    }
    if (strict && isOAuth() && !oauthStatus.connected) {
      fieldError("oauth-model", oauthStatus.errorKey || "oauth.needsLogin");
      return;
    }
    if (strict && isBuild() && buildStatus && buildStatus.ready !== true) {
      fieldError("build-secret", buildStateKey());
      return;
    }
    if (saveKey && !apiKey) {
      fieldError("api-key", "options.keyRequired");
      return;
    }
    if (saveKey && (apiKey.length > 500 || /[\r\n]/.test(apiKey))) {
      fieldError("api-key", "errors.keyInvalid");
      return;
    }
    if (
      strict &&
      isAPI() &&
      !core.API_MODELS.some((item) => item.value === $("api-model").value) &&
      $("api-model").value !== currentSettings.apiModel
    ) {
      fieldError("api-model", "options.modelInvalid");
      return;
    }
    if (
      strict &&
      isAPI() &&
      (!$("api-reasoning-effort").value ||
        $("api-reasoning-effort").value !== settings.apiReasoningEffort)
    ) {
      fieldError("api-reasoning-effort", "options.reasoningInvalid");
      return;
    }
    if (
      strict &&
      isBuild() &&
      (!buildModelChoices().some(
        (item) => item.value === $("build-model").value,
      ) ||
        (Array.isArray(buildStatus?.modelCatalog) &&
          !buildStatus.modelCatalog.some(
            (item) =>
              (typeof item === "string" ? item : item.id) ===
                settings.buildModel && item.available !== false,
          )))
    ) {
      fieldError("build-model", "options.buildModelUnavailable", {
        model: settings.buildModel,
      });
      return;
    }
    const buildEfforts = buildStatus?.modelCatalog?.find(
      (item) =>
        item && typeof item === "object" && item.id === settings.buildModel,
    )?.efforts;
    if (
      strict &&
      isBuild() &&
      (!$("build-reasoning-effort").value ||
        $("build-reasoning-effort").value !== settings.buildReasoningEffort ||
        (Array.isArray(buildEfforts) &&
          !buildEfforts.includes(settings.buildReasoningEffort)))
    ) {
      fieldError("build-reasoning-effort", "options.reasoningInvalid");
      return;
    }
    if (
      strict &&
      isOAuth() &&
      Array.isArray(oauthStatus.catalogModels) &&
      !oauthStatus.catalogModels.some(
        (entry) =>
          entry.id === settings.oauthModel && entry.available !== false,
      )
    ) {
      fieldError(
        "oauth-model",
        oauthStatus.catalogError
          ? "oauth.catalogUnavailable"
          : "oauth.modelUnavailable",
        { model: settings.oauthModel },
      );
      return;
    }
    if (
      strict &&
      isOAuth() &&
      (!$("oauth-reasoning-effort").value ||
        !oauthEfforts(settings.oauthModel).includes(
          $("oauth-reasoning-effort").value,
        ) ||
        settings.oauthReasoningEffort !== $("oauth-reasoning-effort").value)
    ) {
      fieldError("oauth-reasoning-effort", "options.reasoningInvalid");
      return;
    }
    if (strict && !isNative() && !settings.webSearch && !settings.xSearch) {
      renderSearchFeedback();
      fieldError("x-search", "options.urlSearchRequired");
      return;
    }
    setBusy(true);
    setStatus("options.saving");
    const localPermission = saveBuildConnection ? requestLocalAccess() : null;
    try {
      if (localPermission && (await localPermission) !== true) {
        setStatus("build.permission", "error");
        return;
      }
      // Apply a replacement Key and its settings in one worker transaction.
      // A settings-only save never erases or replaces an untouched credential.
      if (saveKey) {
        await send({ type: "SAVE_KEY", apiKey, remember, settings });
        keyChanged = false;
        rememberChanged = false;
        originalKey = apiKey;
      } else if (saveBuildConnection) {
        await send({
          type: "SAVE_BUILD_CONNECTION",
          port: settings.buildPort,
          settings,
          ...(buildSecretChanged
            ? { secret: $("build-secret").value.trim() }
            : {}),
        });
        buildConnection = { configured: true, port: settings.buildPort };
        buildSecretChanged = false;
        $("build-secret").value = "";
        $("build-launch").hidden = true;
        $("build-command").textContent = "";
      } else await send({ type: "SAVE_SETTINGS", settings });
      currentSettings = settings;
      if (saveKey) await refreshSecurity();
      if (strict) for (const id of [...fieldErrors.keys()]) clearFieldError(id);
      if (enabled) {
        populate(currentSettings);
        renderLanguage();
      } else {
        renderProvider();
        renderSearchFeedback();
      }
      setStatus(
        connectionDrafts ? "options.pausedWithDrafts" : "options.saved",
      );
    } catch (error) {
      setStatus("errors.operation", "error", {
        error: (error as ErrorShape).message,
      });
      // Re-read the actual state, retaining a replacement draft for retry.
      await syncAfterSecurityAction(true);
    } finally {
      setBusy(false);
    }
  });
  $("clear-key").addEventListener("click", async () => {
    if (busy || !isAPI()) return;
    setBusy(true);
    try {
      await send({
        type: "SAVE_KEY",
        apiKey: "",
        remember: $("remember-key").checked,
      });
      keyInputClear();
      rememberChanged = false;
      await refreshSecurity();
      setStatus("options.keyCleared");
    } catch (error) {
      setStatus("errors.operation", "error", {
        error: (error as ErrorShape).message,
      });
      // A failed storage operation may leave a changed credential state.
      // Reflect the worker's actual state instead of assuming it was cleared.
      try {
        await refreshSecurity(true);
      } catch {
        securityLoaded = false;
      }
    } finally {
      rememberChanged = false;
      await syncAfterSecurityAction();
      setBusy(false);
    }
  });
  $("clear-cache").addEventListener("click", async () => {
    if (busy) return;
    setBusy(true);
    try {
      await send({ type: "CLEAR_CACHE" });
      setStatus("options.cacheCleared");
    } catch (error) {
      setStatus("errors.operation", "error", {
        error: (error as ErrorShape).message,
      });
    } finally {
      setBusy(false);
    }
  });
  $("diagnostics-summary").addEventListener("click", () => {
    if (!$("api-diagnostics").open) void refreshDiagnostics();
  });
  $("diagnostics-refresh").addEventListener("click", () =>
    refreshDiagnostics(),
  );
  $("diagnostics-copy").addEventListener("click", async () => {
    if (busy || diagnosticsBusy || !diagnosticsText) return;
    diagnosticsBusy = true;
    renderDiagnostics();
    try {
      await navigator.clipboard.writeText(diagnosticsText);
      diagnosticsStatusKey = "options.diagnosticsCopied";
    } catch {
      diagnosticsStatusKey = "common.copyFailed";
    } finally {
      diagnosticsBusy = false;
      renderDiagnostics();
    }
  });
  $("diagnostics-clear").addEventListener("click", async () => {
    if (busy || diagnosticsBusy) return;
    diagnosticsBusy = true;
    diagnosticsText = "";
    diagnosticsStatusKey = "common.loading";
    renderDiagnostics();
    try {
      await send({ type: "CLEAR_API_DIAGNOSTICS" });
      diagnosticsText = "";
      diagnosticsStatusKey = "options.diagnosticsEmpty";
    } catch {
      diagnosticsStatusKey = "options.diagnosticsUnavailable";
    } finally {
      diagnosticsBusy = false;
      renderDiagnostics();
    }
  });
  chrome.runtime.onMessage.addListener((message: ControlMessage) => {
    if (message?.type === "UI_LANGUAGE_CHANGED") {
      localeRevision++;
      applyLanguage(message.language);
    }
    if (
      (message?.type === "OAUTH_STATUS_CHANGED" ||
        message?.type === "CONFIG") &&
      message.oauthStatus
    ) {
      oauthReadRevision++;
      oauthActionError = null;
      applyOAuthStatus(message.oauthStatus);
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      (area === "local" || area === "session") &&
      Object.keys(changes).some((key: string) => /^oauth/i.test(key)) &&
      !oauthActionBusy
    )
      void refreshOAuthStatus();
    if (
      area === "local" &&
      changes.buildConnectionEncrypted &&
      !busy &&
      !buildSecretChanged &&
      Number($("build-port").value) === buildConnection.port
    ) {
      send({ type: "GET_BUILD_CONNECTION" })
        .then((connection) => {
          if (
            !busy &&
            !buildSecretChanged &&
            Number($("build-port").value) === buildConnection.port
          ) {
            buildConnection = {
              configured: connection.configured === true,
              port: connection.port || currentSettings.buildPort,
            };
            $("build-port").value = String(buildConnection.port);
            currentSettings = {
              ...currentSettings,
              buildPort: buildConnection.port,
            };
            resetBuildCheck();
          }
        })
        .catch(() => {});
    }
    if (area === "local" && changes.uiLanguage) {
      localeRevision++;
      applyLanguage(changes.uiLanguage.newValue);
    }
    if (area === "local" && changes.settings && !busy) {
      const previousInterfaceLanguage = currentSettings.interfaceLanguage;
      const interfaceDraft =
        $("interface-language").value !== previousInterfaceLanguage;
      const nextSettings = core.normalizeSettings(changes.settings.newValue);
      // Other Settings tabs can change the interface without discarding this
      // tab's answer language, prompts, or replacement Key drafts.
      currentSettings = {
        ...currentSettings,
        interfaceLanguage: nextSettings.interfaceLanguage,
      };
      if (!interfaceDraft)
        populateInterfaceLanguages(nextSettings.interfaceLanguage);
      renderLanguage();
      markDraft();
    }
    if (area === "session" && changes.superxOptionsFocus)
      void consumeOptionsFocus();
    if (
      !busy &&
      ((area === "session" && (changes.apiKey || changes.securityFault)) ||
        (area === "local" &&
          (changes.apiKeyEncrypted ||
            changes.apiKey ||
            changes.apiKeyVault ||
            changes.rememberApiKey)))
    ) {
      refreshSecurity(true, true)
        .then(() => {
          if (!rememberChanged) $("remember-key").checked = security.remember;
          rememberChanged = $("remember-key").checked !== security.remember;
          renderSecurity();
          if (statusMessage?.key === "options.unsavedChanges") markDraft();
        })
        .catch(() => {
          securityLoaded = false;
          setStatus("errors.noResponse", "error");
          renderSecurity();
        });
    }
  });
  applyLanguage(observedUILanguage);
  load();
})();

export type {};
