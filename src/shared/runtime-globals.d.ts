/** Runtime scripts are loaded in manifest/importScripts order, not bundled across worlds. */
export {};
declare global {
  var XGrokCore: import("./feed-core").API;
  var GrokFirstUI: import("../ui/i18n").API;
  var GrokFirstOverlayLayout: import("../content/overlay-layout").API;
  var GrokFirstMarkdown: import("../content/markdown-renderer").API;
  var SuperXHistoryUI: import("../ui/history").API;
  var SuperXNativePanel: import("../content/native-panel").API;
  var SuperXDraftComposer: import("../content/draft-composer").API;
  var GrokFirstAPI: import("../providers/api-provider").API;
  var SuperXACP: import("../providers/build-acp").API;
  var SuperXBuildTransport: import("../providers/build-transport").API;
  var SuperXBuild: import("../providers/build-provider").API;
  var SuperXBuildSetup: import("../providers/build-setup").API;
  var SuperXNativeProtocol: import("../providers/native-protocol").API;
  var SuperXNative: import("../providers/native-provider").API;
  var SuperXOAuth: import("../providers/oauth-provider").API;
  var SuperXKeyStore: import("../background/key-store").API;
  var SuperXBuildConnectionStore: import("../background/key-store").BuildAPI;
  var SuperXHistoryStore: import("../background/history-store").API;
  var SuperXAnswerCache: typeof import("../background/answer-cache");
  var SuperXProviders: typeof import("../background/provider-registry");
  var SuperXFeedScheduler: typeof import("../content/feed-scheduler");
  var SuperXMath: typeof import("../content/math-renderer");
  var marked: import("./vendor-contracts").MarkedLibrary;
  var markedCjkFriendly: import("./vendor-contracts").CJKFriendly;
  var __grokFirstLoaded: boolean | undefined;
  var __superxNativeAPIInstalled: boolean | undefined;
  var module: { exports: unknown };
  function require(name: "./feed-core.js"): typeof XGrokCore;
  function require(name: "./api-provider.js"): typeof GrokFirstAPI;
  function require(name: "./ui-i18n.js"): typeof GrokFirstUI;
  function require(name: "./build-acp.js"): typeof SuperXACP;
  function require(name: "./build-transport.js"): typeof SuperXBuildTransport;
  function require(name: "./marked.umd.js"): typeof marked;
  function require(
    name: "./marked-cjk-friendly.umd.js",
  ): typeof markedCjkFriendly;
  function require(name: "./math-renderer.js"): typeof SuperXMath;
  function importScripts(...urls: string[]): void;
  interface Document {
    readonly webkitFullscreenElement?: Element | null;
  }
  interface Navigator {
    readonly userAgentData?: { readonly platform: string };
  }
}
