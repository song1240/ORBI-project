export type ComplexityLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export interface TaskAnalysis {
  taskType: string;
  complexityScore: number;
  complexityLevel: ComplexityLevel;
  expectedFiles: number;
  expectedToolCalls: number;
  reasoningLevel: string;
}

const levelFor = (score: number): ComplexityLevel => {
  if (score >= 90) return "VERY_HIGH";
  if (score >= 65) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "LOW";
};

export function analyzeTask(prompt: string): TaskAnalysis {
  const text = prompt.toLowerCase();
  let score = 10;
  if (/refactor|리팩터/.test(text)) score += 20;
  if (/entire|repository|전체/.test(text)) score += 35;
  if (/auth|authentication|인증/.test(text)) score += 25;
  if (/database|schema|migration|데이터베이스/.test(text)) score += 25;
  if (/api/.test(text)) score += 20;
  if (/test|테스트/.test(text)) score += 10;
  score = Math.min(score, 100);

  const taskType = /refactor|리팩터/.test(text)
    ? score >= 75
      ? "LARGE_REFACTOR"
      : "REFACTOR"
    : /bug|fix|오류|버그/.test(text)
      ? "BUG_FIX"
      : /ui|css|화면/.test(text)
        ? "UI_EDIT"
        : "FEATURE";

  return {
    taskType,
    complexityScore: score,
    complexityLevel: levelFor(score),
    expectedFiles: Math.max(2, Math.round(score / 5)),
    expectedToolCalls: Math.max(4, Math.round(score / 3)),
    reasoningLevel: score >= 75 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW",
  };
}

export function predictResources(analysis: TaskAnalysis) {
  const bases = {
    LOW: [5_000, 20_000],
    MEDIUM: [20_000, 60_000],
    HIGH: [60_000, 150_000],
    VERY_HIGH: [150_000, 400_000],
  } as const;
  const [min, max] = bases[analysis.complexityLevel];
  const adjustment = 1 + Math.min(analysis.expectedFiles / 100, 0.25);
  return {
    tokenEstimate: {
      min: Math.round(min * adjustment),
      max: Math.round(max * adjustment),
      confidence: Math.max(58, 88 - Math.round(analysis.complexityScore / 5)),
    },
    costEstimate: {
      min: Number((min * adjustment * 0.000012).toFixed(2)),
      max: Number((max * adjustment * 0.000018).toFixed(2)),
      confidence: Math.max(55, 84 - Math.round(analysis.complexityScore / 6)),
    },
  };
}

export function recommendModel(
  analysis: TaskAnalysis,
  contextUsage: number,
  switchThreshold: number,
) {
  const currentFit = Math.max(
    48,
    Math.min(96, 100 - Math.max(0, analysis.complexityScore - 72) - Math.max(0, contextUsage - 70)),
  );
  const recommendedFit = Math.min(97, currentFit + (analysis.complexityScore >= 88 ? 18 : 5));
  const shouldUpgrade = recommendedFit - currentFit >= switchThreshold;
  return {
    action: shouldUpgrade ? "UPGRADE" : "KEEP",
    title: shouldUpgrade ? "MODEL UPGRADE RECOMMENDED" : "KEEP CURRENT MODEL",
    reason: shouldUpgrade
      ? "This task spans enough architecture and related files that a stronger reasoning model is likely to reduce rework."
      : "A larger model is unlikely to provide enough quality improvement to justify the additional cost.",
    currentFit,
    recommendedFit,
    recommendedModel: shouldUpgrade ? "Opus" : null,
  };
}