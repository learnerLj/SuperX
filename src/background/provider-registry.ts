import type {
  AdapterDependencies,
  ExecutionContext,
  ProviderAdapter,
  ProviderId,
  ProviderRequest,
  Settings,
} from "../shared/contracts";

const remoteConcurrency = (settings: Settings): number =>
  Math.max(1, Math.min(8, Math.trunc(Number(settings.apiConcurrency)) || 3));
const fail = (error: string, code: string): never => {
  throw Object.assign(new Error(error), { code });
};

/** Thin dispatch only: background retains credentials, admission and leases. */
export function create(
  deps: AdapterDependencies,
): Readonly<Record<ProviderId, ProviderAdapter>> {
  function textModel(request: ProviderRequest): void {
    if (
      deps.core.isNonTextGenerationModel(
        deps.core.providerModel(request.settings),
      )
    ) {
      fail(
        "The selected model generates images or video and cannot fact-check posts.",
        "MODEL_UNSUPPORTED",
      );
    }
  }
  const api: ProviderAdapter = {
    id: "api",
    capabilities: { analysis: true, comments: true, draft: true },
    model: deps.core.providerModel,
    concurrency: remoteConcurrency,
    publicError: (error) => deps.api.publicError(error),
    async run(request, context) {
      textModel(request);
      const key = await context.getApiKey();
      context.assertCurrent();
      const { post, settings, analysis } = request,
        { signal, onUpdate } = context;
      return request.task === "comments"
        ? deps.api.generateComments(post, settings, key, { analysis, signal })
        : deps.api.run(post, settings, key, { signal, onUpdate });
    },
  };
  const oauth: ProviderAdapter = {
    id: "oauth",
    capabilities: { analysis: true, comments: true, draft: true },
    model: deps.core.providerModel,
    concurrency: remoteConcurrency,
    publicError: (error) => deps.api.publicError(error),
    async run(request, context) {
      textModel(request);
      const authorization = context.getOAuthAuthorization();
      context.assertCurrent();
      const { post, settings, analysis } = request,
        { signal, onUpdate } = context;
      return request.task === "comments"
        ? deps.api.generateComments(post, settings, undefined, {
            analysis,
            signal,
            authorization,
          })
        : deps.api.run(post, settings, undefined, {
            signal,
            onUpdate,
            authorization,
          });
    },
  };
  const build: ProviderAdapter = {
    id: "build",
    capabilities: { analysis: true, comments: true, draft: true },
    model: deps.core.providerModel,
    concurrency: () => 1,
    publicError: (error) => deps.build.publicError(error),
    async run(request, context) {
      textModel(request);
      const connection = await context.getBuildConnection();
      context.assertCurrent();
      const { post, settings, analysis } = request,
        { signal, onUpdate } = context;
      return request.task === "comments"
        ? deps.build.generateComments(post, settings, {
            analysis,
            signal,
            connection,
          })
        : deps.build.run(post, settings, { signal, onUpdate, connection });
    },
  };
  const native: ProviderAdapter = {
    id: "x-native",
    capabilities: { analysis: true, comments: false, draft: false },
    model: () => "fast",
    concurrency: () => 10,
    publicError: (error) => deps.native.publicError(error),
    async run(request: ProviderRequest, context: ExecutionContext) {
      if (request.task !== "analysis") {
        const safe = deps.native.publicError({ code: "X_NATIVE_UNSUPPORTED" });
        fail(safe.error, safe.code);
      }
      context.assertCurrent();
      return deps.native.run(request.post, request.settings, {
        signal: context.signal,
        onUpdate: context.onUpdate,
        client: context.client,
      });
    },
  };
  return Object.freeze({ api, oauth, build, "x-native": native });
}
