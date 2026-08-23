export const CONFIDENCE_WEIGHTS = {
  ocr: 0.2,
  grounded: 0.3,
  completeness: 0.25,
  consistency: 0.15,
  classifier: 0.1,
} as const;

export interface ConfidenceFeatures {
  ocrMean: number;
  groundedRatio: number;
  completeness: number;
  consistency: number;
  classifierAgreement: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** doc04 §V4 weighted feature score → confidence ∈ [0,1]. */
export function computeConfidence(features: ConfidenceFeatures): number {
  const w = CONFIDENCE_WEIGHTS;
  const score =
    clamp01(features.ocrMean) * w.ocr +
    clamp01(features.groundedRatio) * w.grounded +
    clamp01(features.completeness) * w.completeness +
    clamp01(features.consistency) * w.consistency +
    clamp01(features.classifierAgreement) * w.classifier;
  return Math.round(clamp01(score) * 1000) / 1000;
}
