// Compiled by the same strict project; these are real transport payload shapes.
import type { AnalysisResult, Update } from "../../src/shared/contracts";
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
