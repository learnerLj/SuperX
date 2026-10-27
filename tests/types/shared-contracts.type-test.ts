/** Public layers derive their fields from the shared owner, not parallel copies. */
import type {
  Post,
  Usage,
  GenerationMetadata,
  RequestDiagnostics,
  ProviderDiagnostics,
  Authorization,
  ProviderAuthorization,
  SettingsInput,
  AnalysisResult,
  ModelEntry,
} from "../../src/shared/contracts";
import type {
  Post as ProviderPost,
  Usage as ProviderUsage,
  Metadata as ProviderMetadata,
  RequestDiagnostics as RawDiagnostics,
  Authorization as DirectAuthorization,
  ModelEntry as ProviderModel,
} from "../../src/providers/types";
import type {
  Post as WorkerPost,
  SettingsInput as WorkerSettings,
} from "../../src/background/worker-types";
import type {
  Usage as HistoryUsage,
  Metadata as HistoryMetadata,
} from "../../src/background/history-store";
import type {
  API as CoreAPI,
  RequestDiagnostics as CoreDiagnostics,
} from "../../src/shared/feed-core";
import type { ModelEntry as UIModel } from "../../src/ui/state-types";
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
type PostOwner = Assert<Equal<Post, ProviderPost>>;
type WorkerPostOwner = Assert<Equal<Post, WorkerPost>>;
type SettingsOwner = Assert<Equal<SettingsInput, WorkerSettings>>;
type UsageOwner = Assert<Equal<Usage, ProviderUsage>>;
type HistoryUsageOwner = Assert<Equal<Usage, HistoryUsage>>;
type MetadataOwner = Assert<Equal<GenerationMetadata, ProviderMetadata>>;
type HistoryMetadataOwner = Assert<
  Equal<
    HistoryMetadata["usageByStage"],
    Required<NonNullable<GenerationMetadata["usageByStage"]>> | undefined
  >
>;
type DiagnosticOwner = Assert<Equal<RequestDiagnostics, CoreDiagnostics>>;
type SanitizerOutput = Assert<
  Equal<
    ReturnType<CoreAPI["sanitizedRequestDiagnostics"]>,
    RequestDiagnostics | undefined
  >
>;
type RawOwner = Assert<Equal<ProviderDiagnostics, RawDiagnostics>>;
type AuthOwner = Assert<Equal<ProviderAuthorization, DirectAuthorization>>;
type ModelOwner = Assert<Equal<ModelEntry, ProviderModel>>;
type UIModelOwner = Assert<Equal<ModelEntry, UIModel>>;
declare const raw: ProviderDiagnostics,
  clean: RequestDiagnostics,
  direct: ProviderAuthorization;
const providerView: ProviderDiagnostics = clean;
const answer: AnalysisResult<RequestDiagnostics> = {
  text: "complete",
  requestDiagnostics: clean,
};
const rawAnswer: AnalysisResult = {
  text: "unchecked",
  // @ts-expect-error The default persisted/result view requires normalized diagnostics.
  requestDiagnostics: raw,
};
// @ts-expect-error Raw diagnostics need normalization before use as a validated UI result.
const unchecked: RequestDiagnostics = raw;
// @ts-expect-error Runtime execution requires credential recovery; direct callers may omit it.
const recovery: Authorization = direct;
const badEffort: RequestDiagnostics = {
  failureOrigin: "http",
  // @ts-expect-error Validated effort uses the supported effort union.
  requestedEffort: "turbo",
};
const badStatus: RequestDiagnostics = {
  failureOrigin: "http",
  // @ts-expect-error Validated transport status is numeric.
  transportStatus: "429",
};
void [
  providerView,
  answer,
  rawAnswer,
  unchecked,
  recovery,
  badEffort,
  badStatus,
];
