// GENERATED from src/background/provider-registry.ts. Edit src/ and run npm run build.
"use strict";
var SuperXProviders = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/background/provider-registry.ts
  var provider_registry_exports = {};
  __export(provider_registry_exports, {
    create: () => create
  });
  var remoteConcurrency = (settings) => Math.max(1, Math.min(8, Math.trunc(Number(settings.apiConcurrency)) || 3));
  var fail = (error, code) => {
    throw Object.assign(new Error(error), { code });
  };
  function create(deps) {
    function textModel(request) {
      if (deps.core.isNonTextGenerationModel(
        deps.core.providerModel(request.settings)
      )) {
        fail(
          "The selected model generates images or video and cannot fact-check posts.",
          "MODEL_UNSUPPORTED"
        );
      }
    }
    const api = {
      id: "api",
      capabilities: { analysis: true, comments: true, draft: true },
      model: deps.core.providerModel,
      concurrency: remoteConcurrency,
      publicError: (error) => deps.api.publicError(error),
      async run(request, context) {
        textModel(request);
        const key = await context.getApiKey();
        context.assertCurrent();
        const { post, settings, analysis } = request, { signal, onUpdate } = context;
        return request.task === "comments" ? deps.api.generateComments(post, settings, key, { analysis, signal }) : deps.api.run(post, settings, key, { signal, onUpdate });
      }
    };
    const oauth = {
      id: "oauth",
      capabilities: { analysis: true, comments: true, draft: true },
      model: deps.core.providerModel,
      concurrency: remoteConcurrency,
      publicError: (error) => deps.api.publicError(error),
      async run(request, context) {
        textModel(request);
        const authorization = context.getOAuthAuthorization();
        context.assertCurrent();
        const { post, settings, analysis } = request, { signal, onUpdate } = context;
        return request.task === "comments" ? deps.api.generateComments(post, settings, void 0, {
          analysis,
          signal,
          authorization
        }) : deps.api.run(post, settings, void 0, {
          signal,
          onUpdate,
          authorization
        });
      }
    };
    const build = {
      id: "build",
      capabilities: { analysis: true, comments: true, draft: true },
      model: deps.core.providerModel,
      concurrency: () => 1,
      publicError: (error) => deps.build.publicError(error),
      async run(request, context) {
        textModel(request);
        const connection = await context.getBuildConnection();
        context.assertCurrent();
        const { post, settings, analysis } = request, { signal, onUpdate } = context;
        return request.task === "comments" ? deps.build.generateComments(post, settings, {
          analysis,
          signal,
          connection
        }) : deps.build.run(post, settings, { signal, onUpdate, connection });
      }
    };
    const native = {
      id: "x-native",
      capabilities: { analysis: true, comments: false, draft: false },
      model: () => "fast",
      concurrency: () => 10,
      publicError: (error) => deps.native.publicError(error),
      async run(request, context) {
        if (request.task !== "analysis") {
          const safe = deps.native.publicError({ code: "X_NATIVE_UNSUPPORTED" });
          fail(safe.error, safe.code);
        }
        context.assertCurrent();
        return deps.native.run(request.post, request.settings, {
          signal: context.signal,
          onUpdate: context.onUpdate,
          client: context.client
        });
      }
    };
    return Object.freeze({ api, oauth, build, "x-native": native });
  }
  return __toCommonJS(provider_registry_exports);
})();
if (typeof module === "object" && module.exports) module.exports = SuperXProviders;
