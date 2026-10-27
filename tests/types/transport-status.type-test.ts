// Compiled by the same strict project; these are real transport payload shapes.
import type { AnalysisResult, Update, Settings, PostAnalysisMessage, CachedPostLookupMessage } from "../../src/shared/contracts";
const streaming: Update = {
  text: "Partial evidence",
  phase: "verify",
  verificationStatus: "running",
};
const unverified: AnalysisResult = {
  text: "Evidence is inconclusive.",
  verificationStatus: "unverified",
  verified: false,
};
const nativeFinal: AnalysisResult = {
  text: "Native result",
  verificationStatus: "completed",
  verified: false,
  model: "x-web",
};
void streaming;
void unverified;
void nativeFinal;

const manual: PostAnalysisMessage = {
  type: "ANALYZE", requestId: "manual", post: {text: "Claim"}, force: true, prefetch: false,
};
const passive: CachedPostLookupMessage = {
  type: "LOOKUP_CACHED_POST", requestId: "cached", post: {text: "Claim"},
};
const paused: Pick<Settings, "enabled"> = {enabled: false};
// @ts-expect-error Force must be a boolean, independent of prefetch.
const invalidForce: PostAnalysisMessage["force"] = "manual";
void manual;
void passive;
void paused;
void invalidForce;
