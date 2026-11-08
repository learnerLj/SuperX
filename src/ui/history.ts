import type { Usage } from "../shared/contracts";
import type { ControlMessage, Reply } from "./state-types";
interface RawAnswer {
  index?: unknown;
  provider?: unknown;
  account?: unknown;
  model?: unknown;
  completedAt?: unknown;
  text?: unknown;
  sources?: { url?: unknown; title?: unknown }[];
  verificationStatus?: unknown;
  verificationStart?: unknown;
  usage?: Usage;
  usageComplete?: unknown;
}
interface RawRecord {
  id?: unknown;
  url?: unknown;
  hasSnapshot?: unknown;
  author?: unknown;
  text?: unknown;
  activityAt?: unknown;
  preferred?: unknown;
  answers?: RawAnswer[];
  comments?: unknown[];
}
interface Answer {
  index: number;
  provider: string;
  account: string;
  model: string;
  completedAt: number;
  text: string;
  sources: { url: string; title: string }[];
  verificationStatus: string;
  verificationStart?: number;
  usage?: Usage;
  usageComplete: boolean;
}
interface PostRecordView {
  id: string;
  url: string;
  hasSnapshot: boolean;
  author: string;
  text: string;
  activityAt: number;
  preferred: number;
  answers: Answer[];
  comments: string[];
}
type Cursor = [number, string];
interface RecordsReply extends Reply {
  epoch: number;
  records: RawRecord[];
  next: unknown;
}
interface UsageReply extends Reply {
  epoch: number;
  limitBytes: number;
  bytes: number;
  records: number;
}
interface StorageUsage {
  limitBytes: number;
  bytes: number;
  records: number;
}
export type API = ReturnType<typeof historyFactory>;
interface PageElements {
  "clear-history": HTMLElementTagNameMap["button"];
  "history-status": HTMLElementTagNameMap["p"];
  usage: HTMLElementTagNameMap["div"];
  "usage-meter": HTMLElementTagNameMap["div"];
  "usage-fill": HTMLElementTagNameMap["span"];
  "usage-text": HTMLElementTagNameMap["p"];
  "usage-hint": HTMLElementTagNameMap["p"];
  "clear-confirmation": HTMLElementTagNameMap["section"];
  "confirm-clear": HTMLElementTagNameMap["button"];
  "cancel-clear": HTMLElementTagNameMap["button"];
  "history-search": HTMLElementTagNameMap["input"];
  "refresh-history": HTMLElementTagNameMap["button"];
  "new-records": HTMLElementTagNameMap["button"];
  "history-empty": HTMLElementTagNameMap["div"];
  "empty-title": HTMLElementTagNameMap["h2"];
  "empty-help": HTMLElementTagNameMap["p"];
  "history-list": HTMLElementTagNameMap["section"];
  "history-more": HTMLElementTagNameMap["div"];
  "more-history": HTMLElementTagNameMap["button"];
}
(function (root: typeof globalThis, factory: typeof historyFactory) {
  "use strict";
  const api = factory(
    typeof module === "object" && module.exports
      ? require("./feed-core.js")
      : root.XGrokCore,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.SuperXHistoryUI = api;
    if (root.document && root.chrome?.runtime)
      api.create({ environment: root }).start();
  }
})(globalThis, historyFactory);
function historyFactory(Core: typeof XGrokCore) {
  "use strict";
  const SEARCH_DELAY = 300;
  const PROVIDER_LABELS: Record<string, string> = {
    api: "options.providerAPI",
    oauth: "options.providerOAuth",
    build: "options.providerBuild",
    "x-native": "native.label",
  };
  const signatures = new WeakMap<PostRecordView, string>();
  function safePostUrl(value: unknown) {
    if (typeof value !== "string" || value.length > 2048) return null;
    try {
      const url = new URL(value as string);
      if (
        !/^https?:$/.test(url.protocol) ||
        url.username ||
        url.password ||
        !/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)
      )
        return null;
      const match =
        url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:\/|$)/) ||
        url.pathname.match(/^\/i\/web\/status\/(\d+)(?:\/|$)/);
      if (!match) return null;
      return match.length === 2
        ? `https://x.com/i/web/status/${match[1]}`
        : `https://x.com/${match[1]!.toLowerCase()}/status/${match[2]}`;
    } catch {
      return null;
    }
  }
  function safeSourceUrl(value: unknown) {
    try {
      const url = new URL(value as string);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
  function boundedText(value: unknown, limit: number) {
    return typeof value === "string" ? value.slice(0, limit) : "";
  }
  function safeUsage(value: Usage | undefined) {
    if (!value || typeof value !== "object") return undefined;
    const usage: Usage = {};
    for (const key of [
      "total_tokens",
      "input_tokens",
      "output_tokens",
    ] as const)
      if (Number.isSafeInteger(value[key]) && value[key]! >= 0)
        usage[key] = value[key];
    return Object.keys(usage).length ? usage : undefined;
  }
  function cursor(value: unknown): Cursor | null {
    return Array.isArray(value) &&
      value.length === 2 &&
      Number.isFinite(value[0]) &&
      typeof value[1] === "string" &&
      /^\d{1,25}$/.test(value[1])
      ? [value[0] as number, value[1]]
      : null;
  }
  function normalizeAnswer(value: RawAnswer, position: number): Answer {
    const answer: Answer = {
      index: Number.isSafeInteger(value?.index)
        ? (value.index as number)
        : position,
      provider: boundedText(value?.provider, 20),
      account: boundedText(value?.account, 80),
      model: boundedText(value?.model, 160),
      completedAt: Number.isFinite(value?.completedAt)
        ? (value.completedAt as number)
        : 0,
      text: boundedText(value?.text, 30000),
      sources: Array.isArray(value?.sources)
        ? value.sources.slice(0, 30).flatMap((source) => {
            const url = safeSourceUrl(source?.url);
            return url ? [{ url, title: boundedText(source.title, 300) }] : [];
          })
        : [],
      verificationStatus: boundedText(value?.verificationStatus, 40),
      verificationStart: Number.isSafeInteger(value?.verificationStart)
        ? (value.verificationStart as number)
        : undefined,
      usage: safeUsage(value?.usage),
      usageComplete: value?.usageComplete === true,
    };
    // Old cached tool-only answers stay hidden rather than shown as evidence.
    const output = Core.readerOutput(answer.text, { final: true });
    answer.text = output.text;
    if (output.kind !== "content") {
      answer.sources = [];
      answer.verificationStart = undefined;
      answer.verificationStatus = "incomplete";
    }
    return answer;
  }
  /** Untrusted worker DTOs are bounded and links re-validated before render. */
  function normalizeRecords(input: unknown): PostRecordView[] {
    const seen = new Set<string>();
    return (Array.isArray(input) ? (input as RawRecord[]) : []).flatMap(
      (value) => {
        const id = boundedText(value?.id, 25),
          url = safePostUrl(value?.url);
        if (
          !/^\d{1,25}$/.test(id) ||
          !url ||
          seen.has(id) ||
          !Number.isFinite(value?.activityAt)
        )
          return [];
        seen.add(id);
        const answers = Array.isArray(value.answers)
          ? value.answers.slice(0, 100).map(normalizeAnswer)
          : [];
        return [
          {
            id,
            url,
            hasSnapshot: value.hasSnapshot === true,
            author: boundedText(value.author, 300),
            text: boundedText(value.text, 12000),
            activityAt: value.activityAt as number,
            preferred: Number.isSafeInteger(value.preferred)
              ? (value.preferred as number)
              : 0,
            answers,
            comments: Array.isArray(value.comments)
              ? value.comments
                  .slice(0, 3)
                  .map((comment) => boundedText(comment, 2000))
                  .filter(Boolean)
              : [],
          },
        ];
      },
    );
  }
  function signature(record: PostRecordView) {
    if (!signatures.has(record))
      signatures.set(
        record,
        JSON.stringify([
          record.author,
          record.url,
          record.text,
          record.hasSnapshot,
          record.comments,
          record.answers.map((answer) => [
            answer.index,
            answer.provider,
            answer.account,
            answer.model,
            answer.completedAt,
            answer.text,
            answer.sources,
            answer.verificationStatus,
            answer.verificationStart,
            answer.usageComplete,
            answer.usage?.total_tokens,
            answer.usage?.input_tokens,
            answer.usage?.output_tokens,
          ]),
        ]),
      );
    return signatures.get(record)!;
  }
  function create({
    environment = globalThis,
    document = environment.document,
    chrome = environment.chrome,
    core = environment.XGrokCore,
    ui = environment.GrokFirstUI,
    markdown = environment.GrokFirstMarkdown,
  }: {
    environment?: typeof globalThis;
    document?: Document;
    chrome?: typeof globalThis.chrome;
    core?: typeof XGrokCore;
    ui?: typeof GrokFirstUI;
    markdown?: typeof GrokFirstMarkdown;
  } = {}) {
    function $<K extends keyof PageElements>(id: K): PageElements[K];
    function $(id: string): HTMLElement;
    function $(id: string) {
      return document.getElementById(id)!;
    }
    let records: PostRecordView[] = [],
      next: Cursor | null = null,
      epoch = 0,
      activeQuery = "",
      usage: StorageUsage | null = null,
      // Record count when the list was last loaded; growth is announced
      // instead of reordering the list under the reader.
      baseline: number | null = null,
      newCount = 0,
      loaded = false,
      loading = false,
      busy = false,
      requestRevision = 0,
      usageRevision = 0,
      localeRevision = 0,
      settingsRevision = 0;
    let settings = core.normalizeSettings(core.DEFAULT_SETTINGS),
      automaticLanguage = ui.browserLanguage(environment),
      language = automaticLanguage;
    let status: { key: string; error: boolean } | null = null,
      searchTimer: number | null = null,
      refreshQueued = false,
      listRenderPending = false;
    interface Labels {
      copyButtons: HTMLButtonElement[];
      tokens?: HTMLElement;
      model?: HTMLElement;
      warning?: HTMLElement;
      commentsHeading?: HTMLElement;
    }
    interface Row {
      node: HTMLElement;
      signature: string;
      record: PostRecordView;
      answer: Answer | null;
      time: HTMLTimeElement;
      open: HTMLAnchorElement;
      remove: HTMLButtonElement;
      noSnapshot?: HTMLElement;
      version?: HTMLSelectElement;
      details?: HTMLDetailsElement;
      summary?: HTMLElement;
      body?: HTMLElement;
      answerLabels?: Labels | null;
      noAnalysis?: HTMLElement;
    }
    const expanded = new Set<string>(),
      selected = new Map<string, number>(),
      rows = new Map<string, Row>(),
      timeFormatters = new Map<string, Intl.DateTimeFormat>(),
      numberFormatters = new Map<string, Intl.NumberFormat>();
    const t = (key: string, vars?: Record<string, unknown>) =>
      ui.t(key, language, vars);
    function element<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      className?: string,
      text?: string,
    ): HTMLElementTagNameMap[K] {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function link(url: string, text: string) {
      const node = element("a", "", text);
      node.href = url;
      node.target = "_blank";
      node.rel = "noopener noreferrer";
      return node;
    }
    async function request<T extends Reply>(message: ControlMessage) {
      return chrome.runtime.sendMessage<ControlMessage, T>(message);
    }
    function setStatus(key: string | null, error = false) {
      status = key ? { key, error } : null;
    }
    function setText(node: HTMLElement, text: string) {
      if (node.textContent !== text) node.textContent = text;
    }
    function formatTime(value: number) {
      try {
        if (!timeFormatters.has(language))
          timeFormatters.set(
            language,
            new Intl.DateTimeFormat(language, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
          );
        return timeFormatters.get(language)!.format(new Date(value));
      } catch {
        return t("history.invalidDate");
      }
    }
    function totalTokens(value: Usage | undefined) {
      if (
        Number.isSafeInteger(value?.total_tokens) &&
        value!.total_tokens! >= 0
      )
        return value!.total_tokens;
      if (
        Number.isSafeInteger(value?.input_tokens) &&
        value!.input_tokens! >= 0 &&
        Number.isSafeInteger(value?.output_tokens) &&
        value!.output_tokens! >= 0 &&
        Number.isSafeInteger(value!.input_tokens! + value!.output_tokens!)
      )
        return value!.input_tokens! + value!.output_tokens!;
      return null;
    }
    function number(value: number | null | undefined) {
      try {
        if (!numberFormatters.has(language))
          numberFormatters.set(language, new Intl.NumberFormat(language));
        return numberFormatters.get(language)!.format(value!);
      } catch {
        return String(value);
      }
    }
    /** The chosen version, else the worker's best match for the settings. */
    function currentAnswer(record: PostRecordView) {
      const index = selected.get(record.id) ?? record.preferred;
      return (
        record.answers.find((answer) => answer.index === index) ||
        record.answers[0] ||
        null
      );
    }
    function versionLabel(answer: Answer) {
      return [
        PROVIDER_LABELS[answer.provider]
          ? t(PROVIDER_LABELS[answer.provider]!)
          : answer.provider,
        answer.model,
        answer.account,
        answer.completedAt ? formatTime(answer.completedAt) : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    function renderAnswer(
      target: HTMLElement,
      answer: Answer | null,
      comments: string[],
    ) {
      target.replaceChildren();
      const labels: Labels = { copyButtons: [] };
      if (answer?.text) {
        const metadata = element("p", "answer-meta");
        const tokens = totalTokens(answer.usage);
        if (tokens !== null) {
          labels.tokens = element(
            "span",
            "",
            t("history.tokens", {
              count: number(tokens) + (answer.usageComplete ? "" : "+"),
            }),
          );
          metadata.append(labels.tokens);
        }
        if (answer.model) {
          labels.model = element(
            "span",
            "",
            t("history.model", { model: answer.model }),
          );
          metadata.append(labels.model);
        }
        if (metadata.childNodes.length) target.append(metadata);
        if (["incomplete", "failed"].includes(answer.verificationStatus)) {
          labels.warning = element(
            "p",
            "answer-warning",
            t("history.previousAnswer"),
          );
          target.append(labels.warning);
        }
        const boundary = answer.verificationStart!;
        const explanation = element("div", "answer-markdown");
        if (
          Number.isInteger(boundary) &&
          boundary > 0 &&
          boundary < answer.text.length
        ) {
          markdown.render(explanation, answer.text.slice(0, boundary));
          target.append(explanation);
          target.append(element("hr", "fact-check-divider"));
          const factCheck = element("div", "answer-markdown");
          markdown.render(factCheck, answer.text.slice(boundary));
          target.append(factCheck);
        } else {
          markdown.render(explanation, answer.text);
          target.append(explanation);
        }
        const unused = answer.sources.filter(
          (source) => !answer.text.includes(source.url),
        );
        if (unused.length) {
          const sources = element("div", "answer-sources");
          for (const source of unused)
            sources.append(
              link(
                source.url,
                source.title && !/^\d+$/.test(source.title.trim())
                  ? source.title
                  : new URL(source.url).hostname,
              ),
            );
          target.append(sources);
        }
      }
      if (comments.length) {
        labels.commentsHeading = element(
          "h3",
          "comments-heading",
          t("history.comments"),
        );
        target.append(labels.commentsHeading);
        for (const comment of comments) {
          const button = element("button", "comment-copy", comment);
          button.type = "button";
          button.title = t("history.copy");
          button.addEventListener("click", async () => {
            try {
              if (!environment.navigator?.clipboard?.writeText)
                throw new Error("Clipboard unavailable");
              await environment.navigator.clipboard.writeText(comment);
              setStatus("history.copied");
            } catch {
              setStatus("history.copyError", true);
            }
            renderStatus();
          });
          target.append(button);
          labels.copyButtons.push(button);
        }
      }
      return labels;
    }
    function noAnalysisKey(answer: Answer | null) {
      return ["incomplete", "failed"].includes(answer?.verificationStatus!)
        ? "status.incomplete"
        : "history.noAnalysis";
    }
    function buildRow(record: PostRecordView, rowSignature: string) {
      const article = element("article", "history-entry");
      article.dataset.entryId = record.id;
      const answer = currentAnswer(record);
      const row = {
        node: article,
        signature: rowSignature,
        record,
        answer,
      } as Row;
      const header = element("div", "entry-header");
      header.append(
        element(
          "span",
          "entry-author",
          record.author || new URL(record.url).pathname.split("/")[1],
        ),
      );
      row.time = element("time", "entry-time");
      header.append(row.time);
      article.append(header);
      if (record.text) article.append(element("p", "entry-text", record.text));
      else if (!record.hasSnapshot) {
        row.noSnapshot = element("p", "help entry-missing");
        article.append(row.noSnapshot);
      }
      if (record.answers.length > 1) {
        const version = element("select", "version-select");
        for (const item of record.answers) {
          const option = element("option");
          option.value = String(item.index);
          version.append(option);
        }
        version.value = String(answer?.index ?? "");
        version.addEventListener("change", () => {
          if (rows.get(record.id) !== row) return;
          selected.set(record.id, Number(version.value));
          render({ forceList: true });
        });
        row.version = version;
        article.append(version);
      }
      const actions = element("div", "entry-actions");
      row.open = link(record.url, t("history.open"));
      actions.append(row.open);
      const remove = element("button", "text-button", t("history.delete"));
      remove.type = "button";
      remove.dataset.action = "delete";
      row.remove = remove;
      remove.addEventListener("click", () =>
        mutate(
          { type: "DELETE_HISTORY", id: record.id },
          "history.deleted",
          "history.deleteError",
        ),
      );
      actions.append(remove);
      article.append(actions);
      if (answer?.text || record.comments.length) {
        const details = element("details", "answer-details"),
          summary = element("summary"),
          body = element("div", "answer-body");
        row.details = details;
        row.summary = summary;
        row.body = body;
        details.open = expanded.has(record.id);
        details.append(summary, body);
        if (details.open)
          row.answerLabels = renderAnswer(body, answer, record.comments);
        details.addEventListener("toggle", () => {
          // A toggle is queued by the browser, including when restoring an
          // open details element. Ignore a removed row and do not rebuild an
          // already rendered answer: selection and copy focus stay intact.
          if (rows.get(record.id) !== row) return;
          if (details.open) {
            expanded.add(record.id);
            if (!row.answerLabels)
              row.answerLabels = renderAnswer(body, answer, record.comments);
          } else {
            expanded.delete(record.id);
            body.replaceChildren();
            row.answerLabels = null;
          }
          summary.textContent = t(
            details.open ? "history.hideAnswer" : "history.showAnswer",
          );
        });
        article.append(details);
      } else {
        row.noAnalysis = element("p", "help");
        article.append(row.noAnalysis);
      }
      return row;
    }
    function updateRow(row: Row) {
      const { record, answer } = row;
      setText(row.time, formatTime(record.activityAt));
      row.time.dateTime = new Date(record.activityAt).toISOString();
      row.time.title = t("history.activity");
      setText(row.open, t("history.open"));
      setText(row.remove, t("history.delete"));
      row.remove.disabled = busy;
      row.remove.setAttribute(
        "aria-label",
        t("history.delete") + " · " + (record.author || record.id),
      );
      if (row.noSnapshot) setText(row.noSnapshot, t("history.noSnapshot"));
      if (row.version) {
        row.version.setAttribute("aria-label", t("history.version"));
        row.version.title = t("history.version");
        row.version.disabled = busy;
        [...row.version.childNodes].forEach((option, index) =>
          setText(option as HTMLElement, versionLabel(record.answers[index]!)),
        );
      }
      if (row.noAnalysis) setText(row.noAnalysis, t(noAnalysisKey(answer)));
      if (row.summary)
        setText(
          row.summary,
          t(row.details!.open ? "history.hideAnswer" : "history.showAnswer"),
        );
      const labels = row.answerLabels;
      if (labels?.tokens)
        setText(
          labels.tokens,
          t("history.tokens", {
            count:
              number(totalTokens(answer!.usage)) +
              (answer!.usageComplete ? "" : "+"),
          }),
        );
      if (labels?.model)
        setText(labels.model, t("history.model", { model: answer!.model }));
      if (labels?.warning) setText(labels.warning, t("history.previousAnswer"));
      if (labels?.commentsHeading)
        setText(labels.commentsHeading, t("history.comments"));
      for (const button of labels?.copyButtons || [])
        button.title = t("history.copy");
    }
    function listHasSelection() {
      const selection = environment.getSelection?.();
      return Boolean(
        selection &&
        !selection.isCollapsed &&
        ($("history-list").contains?.(selection.anchorNode) ||
          $("history-list").contains?.(selection.focusNode)),
      );
    }
    function renderList(force: boolean) {
      // A passive reload may replace content. Let readers finish
      // selecting/copying their current text before applying it.
      if (!force && listHasSelection()) {
        listRenderPending = true;
        return;
      }
      listRenderPending = false;
      const liveIds = new Set(records.map((record) => record.id));
      for (const [id] of rows)
        if (!liveIds.has(id)) {
          rows.delete(id);
          expanded.delete(id);
          selected.delete(id);
        }
      const nodes = records.map((record) => {
        const rowSignature =
          signature(record) + "#" + (selected.get(record.id) ?? "");
        let row = rows.get(record.id);
        if (!row || row.signature !== rowSignature) {
          row = buildRow(record, rowSignature);
          rows.set(record.id, row);
        }
        updateRow(row);
        return row.node;
      });
      const list = $("history-list"),
        wanted = new Set<Node>(nodes);
      for (let index = 0; index < nodes.length; index++)
        if (list.childNodes[index] !== nodes[index])
          list.insertBefore(nodes[index]!, list.childNodes[index] || null);
      for (const child of [...list.childNodes])
        if (!wanted.has(child)) list.removeChild(child);
    }
    function renderStatus() {
      $("history-status").textContent = status
        ? t(status.key)
        : loading && !loaded
          ? t("history.loading")
          : "";
      $("history-status").dataset.state = status?.error ? "error" : "success";
    }
    function renderUsage() {
      $("usage").hidden = !usage;
      if (!usage) return;
      const meter = ui.usageMeter(usage, language),
        bar = $("usage-meter");
      bar.setAttribute("aria-valuenow", String(meter.percent));
      bar.setAttribute("aria-valuetext", meter.text);
      bar.dataset.level = meter.level;
      $("usage-fill").style.width = meter.percent + "%";
      setText($("usage-text"), meter.text);
      $("usage-hint").hidden = !meter.nearLimit;
    }
    function render({ forceList = false } = {}) {
      ui.apply(document, language);
      document.title = "SuperX · " + t("history.title");
      renderStatus();
      renderUsage();
      $("refresh-history").disabled = busy || loading;
      $("clear-history").disabled =
        busy || !loaded || !(records.length || usage?.records);
      $("confirm-clear").disabled = busy;
      $("cancel-clear").disabled = busy;
      $("history-list").setAttribute("aria-busy", String(loading || busy));
      $("new-records").hidden = !loaded || newCount <= 0;
      $("new-records").disabled = busy || loading;
      setText(
        $("new-records"),
        t("history.newRecords", { count: number(newCount) }),
      );
      $("history-empty").hidden = !loaded || Boolean(records.length || next);
      $("empty-title").textContent = t(
        activeQuery ? "history.noMatches" : "history.empty",
      );
      $("empty-help").textContent = activeQuery ? "" : t("history.emptyHelp");
      $("history-more").hidden = !loaded || !next;
      $("more-history").disabled = busy || loading;
      setText(
        $("more-history"),
        t(activeQuery ? "history.searchMore" : "history.showMore"),
      );
      renderList(forceList);
    }
    function validPage(result: RecordsReply) {
      if (
        !result?.ok ||
        !Array.isArray(result.records) ||
        !Number.isSafeInteger(result.epoch)
      )
        throw new Error("Records unavailable");
      return result;
    }
    function acceptUsage(result: UsageReply | null) {
      if (
        !result?.ok ||
        !Number.isSafeInteger(result.epoch) ||
        ![result.bytes, result.limitBytes, result.records].every(
          (value) => Number.isFinite(value) && value >= 0,
        )
      )
        return null;
      usage = {
        bytes: result.bytes,
        limitBytes: result.limitBytes,
        records: result.records,
      };
      return result;
    }
    /** First page for the current search, with a fresh usage baseline. */
    async function refresh({ preserveStatus = false, forceList = true } = {}) {
      if (busy) {
        refreshQueued = true;
        return;
      }
      const revision = ++requestRevision,
        query = $("history-search").value.trim();
      loading = true;
      if (!preserveStatus) setStatus(null);
      render();
      try {
        const [page, meter] = await Promise.all([
          request<RecordsReply>({
            type: "GET_RECORDS",
            ...(query ? { query } : {}),
          }),
          request<UsageReply>({ type: "GET_CACHE_USAGE" }).catch(() => null),
        ]);
        if (revision !== requestRevision) return;
        validPage(page);
        ++usageRevision;
        records = normalizeRecords(page.records);
        next = cursor(page.next);
        epoch = page.epoch;
        activeQuery = query;
        const counted = acceptUsage(meter);
        baseline = counted?.epoch === epoch ? counted.records : null;
        newCount = 0;
        loaded = true;
      } catch {
        if (revision === requestRevision) setStatus("history.error", true);
      } finally {
        if (revision === requestRevision) {
          loading = false;
          render({ forceList });
        }
      }
    }
    async function loadMore() {
      if (busy || loading || !next) return;
      const revision = ++requestRevision;
      let stale = false;
      loading = true;
      setStatus(null);
      render();
      try {
        const page = validPage(
          await request<RecordsReply>({
            type: "GET_RECORDS",
            after: next,
            ...(activeQuery ? { query: activeQuery } : {}),
          }),
        );
        if (revision !== requestRevision) return;
        // A Clear or Delete elsewhere invalidates the cursor's list.
        if (page.epoch !== epoch) stale = true;
        else {
          const known = new Set(records.map((record) => record.id));
          records = records.concat(
            normalizeRecords(page.records).filter(
              (record) => !known.has(record.id),
            ),
          );
          next = cursor(page.next);
        }
      } catch {
        if (revision === requestRevision) setStatus("history.error", true);
      } finally {
        if (revision === requestRevision) {
          loading = false;
          render({ forceList: true });
        }
      }
      if (stale) await refresh({ preserveStatus: true });
    }
    /** Worker notices refresh only the meter and the new-record count; an
     * epoch change (Clear/Delete) reloads the list. */
    async function recordsChanged(noticeEpoch?: unknown) {
      // A running mutation re-reads usage when it settles.
      if (busy) return;
      if (loaded && Number.isSafeInteger(noticeEpoch) && noticeEpoch !== epoch)
        return refresh({ preserveStatus: true, forceList: false });
      const revision = ++usageRevision;
      try {
        const result = acceptUsage(
          await request<UsageReply>({ type: "GET_CACHE_USAGE" }),
        );
        if (!result || revision !== usageRevision) return;
        if (loaded && result.epoch !== epoch)
          return refresh({ preserveStatus: true, forceList: false });
        if (baseline !== null)
          newCount = Math.max(0, result.records - baseline);
      } catch {
        /* The meter keeps its last value; the list is unaffected. */
      }
      render();
    }
    async function mutate(
      message: ControlMessage,
      success: string,
      error: string,
    ) {
      if (busy || !loaded) return;
      ++requestRevision;
      loading = false;
      busy = true;
      setStatus(null);
      render();
      try {
        const result = await request<Reply & { epoch?: unknown }>(message);
        if (!result?.ok || !Number.isSafeInteger(result.epoch))
          throw new Error("Records unavailable");
        epoch = result.epoch as number;
        if (message.type === "CLEAR_HISTORY") {
          records = [];
          next = null;
          baseline = 0;
          newCount = 0;
          expanded.clear();
          selected.clear();
          $("clear-confirmation").hidden = true;
        } else {
          const id = message.id as string;
          if (baseline !== null && records.some((record) => record.id === id))
            baseline = Math.max(0, baseline - 1);
          records = records.filter((record) => record.id !== id);
          expanded.delete(id);
          selected.delete(id);
        }
        setStatus(success);
        $("history-search").focus();
      } catch {
        setStatus(error, true);
      } finally {
        busy = false;
        render({ forceList: true });
      }
      if (refreshQueued) {
        refreshQueued = false;
        await refresh({ preserveStatus: true, forceList: false });
      } else await recordsChanged();
    }
    async function start() {
      $("history-search").addEventListener("input", () => {
        if (searchTimer !== null) environment.clearTimeout?.(searchTimer);
        if (!environment.setTimeout) {
          void refresh();
          return;
        }
        searchTimer = environment.setTimeout(() => {
          searchTimer = null;
          void refresh();
        }, SEARCH_DELAY);
      });
      $("more-history").addEventListener("click", () => loadMore());
      $("new-records").addEventListener("click", () => refresh());
      $("refresh-history").addEventListener("click", () => refresh());
      $("clear-history").addEventListener("click", () => {
        if (busy || !loaded) return;
        $("clear-confirmation").hidden = false;
        $("confirm-clear").focus();
      });
      $("cancel-clear").addEventListener("click", () => {
        if (busy) return;
        $("clear-confirmation").hidden = true;
        $("clear-history").focus();
      });
      $("confirm-clear").addEventListener("click", () =>
        mutate(
          { type: "CLEAR_HISTORY" },
          "history.cleared",
          "history.clearError",
        ),
      );
      document.addEventListener?.("keydown", (event) => {
        if (
          event.key === "Escape" &&
          !$("clear-confirmation").hidden &&
          !busy
        ) {
          $("clear-confirmation").hidden = true;
          $("clear-history").focus();
        }
      });
      document.addEventListener?.("selectionchange", () => {
        if (listRenderPending && !listHasSelection()) render();
      });
      chrome.runtime.onMessage?.addListener((message: ControlMessage) => {
        if (message?.type === "UI_LANGUAGE_CHANGED") {
          localeRevision++;
          automaticLanguage = ui.normalizeLanguage(message.language);
          language = ui.resolveLanguage(
            settings.interfaceLanguage,
            automaticLanguage,
          );
          render();
        }
        if (message?.type === "HISTORY_CHANGED")
          void recordsChanged(message.epoch);
      });
      chrome.storage?.onChanged?.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.settings) {
          settingsRevision++;
          settings = core.normalizeSettings(changes.settings.newValue);
        }
        if (changes.uiLanguage) {
          localeRevision++;
          automaticLanguage = ui.normalizeLanguage(changes.uiLanguage.newValue);
        }
        if (changes.settings || changes.uiLanguage) {
          language = ui.resolveLanguage(
            settings.interfaceLanguage,
            automaticLanguage,
          );
          render();
        }
      });
      environment.addEventListener?.("unload", () => {
        if (searchTimer !== null) environment.clearTimeout?.(searchTimer);
      });
      render();
      const revision = localeRevision,
        configRevision = settingsRevision;
      await Promise.all([
        refresh(),
        (async () => {
          try {
            const [local, locale, config] = await Promise.all([
              chrome.storage?.local?.get?.(["uiLanguage"]) || {},
              request<Reply>({ type: "GET_UI_LANGUAGE" }).catch(() => null),
              request<Reply>({ type: "GET_CONFIG" }).catch(() => null),
            ]);
            if (config?.ok && settingsRevision === configRevision)
              settings = core.normalizeSettings(config.settings);
            if (localeRevision === revision)
              automaticLanguage = ui.normalizeLanguage(
                locale?.language || local.uiLanguage || automaticLanguage,
              );
            language = ui.resolveLanguage(
              settings.interfaceLanguage,
              automaticLanguage,
            );
            render();
          } catch {
            /* Records remain usable when the locale lookup fails. */
          }
        })(),
      ]);
    }
    return Object.freeze({ start, refresh, render, recordsChanged });
  }
  return Object.freeze({
    create,
    safePostUrl,
    safeSourceUrl,
    normalizeRecords,
  });
}

export type {};
