// Model pricing per 1M tokens (USD)
// Last updated: January 2025
export const MODEL_COSTS_USD: Record<
  string,
  { inputPer1M: number; outputPer1M: number }
> = {
  // Anthropic models
  'claude-sonnet-4-5-20250514': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-opus-4-5-20251101': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-3-5-sonnet-latest': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-5-sonnet-20241022': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-5-haiku-latest': { inputPer1M: 0.8, outputPer1M: 4.0 },
  'claude-3-5-haiku-20241022': { inputPer1M: 0.8, outputPer1M: 4.0 },
  'claude-3-opus-latest': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-3-sonnet-20240229': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-haiku-20240307': { inputPer1M: 0.25, outputPer1M: 1.25 },

  // OpenAI models
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
  'gpt-4o-2024-11-20': { inputPer1M: 2.5, outputPer1M: 10.0 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4o-mini-2024-07-18': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4-turbo': { inputPer1M: 10.0, outputPer1M: 30.0 },
  'gpt-4-turbo-preview': { inputPer1M: 10.0, outputPer1M: 30.0 },
  'gpt-4': { inputPer1M: 30.0, outputPer1M: 60.0 },
  'o1-preview': { inputPer1M: 15.0, outputPer1M: 60.0 },
  'o1-mini': { inputPer1M: 3.0, outputPer1M: 12.0 },

  // Google models
  'gemini-3-pro-preview': { inputPer1M: 2.0, outputPer1M: 12.0 },
  'gemini-2.0-flash': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gemini-2.0-flash-exp': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini-1.5-flash-latest': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.0 },
  'gemini-1.5-pro-latest': { inputPer1M: 1.25, outputPer1M: 5.0 },
};

// Image generation pricing (per image, USD)
export const IMAGE_GENERATION_COSTS_USD: Record<
  string,
  Record<string, number>
> = {
  'dall-e-3': {
    '1024x1024': 0.04,
    '1024x1792': 0.08,
    '1792x1024': 0.08,
    // HD quality doubles the price
    '1024x1024-hd': 0.08,
    '1024x1792-hd': 0.12,
    '1792x1024-hd': 0.12,
  },
  'dall-e-2': {
    '1024x1024': 0.02,
    '512x512': 0.018,
    '256x256': 0.016,
  },
};

// Credit conversion rate: $0.15 = 1 credit (matches build-workers costFunctionV3)
const DOLLARS_PER_CREDIT = 0.15;

// Default pricing for unknown models
const DEFAULT_MODEL_PRICING = { inputPer1M: 3.0, outputPer1M: 15.0 };

export function calculateCompletionCredits(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_COSTS_USD[model] ?? DEFAULT_MODEL_PRICING;

  const inputCost = (inputTokens * pricing.inputPer1M) / 1_000_000;
  const outputCost = (outputTokens * pricing.outputPer1M) / 1_000_000;
  const totalCostUsd = inputCost + outputCost;

  // Convert to credits with minimum of 0.01
  const credits = totalCostUsd / DOLLARS_PER_CREDIT;
  return Math.max(0.01, Math.round(credits * 100) / 100);
}

export function calculateImageGenerationCredits(
  model: string,
  size: string,
  quality: string = 'standard',
  count: number = 1,
): number {
  const modelPricing = IMAGE_GENERATION_COSTS_USD[model];
  if (!modelPricing) {
    // Default to 1 credit per image for unknown models
    return count;
  }

  // Check for HD quality pricing
  const sizeKey = quality === 'hd' ? `${size}-hd` : size;
  const costPerImage =
    modelPricing[sizeKey] ??
    modelPricing[size] ??
    modelPricing['1024x1024'] ??
    0.04;

  const totalCostUsd = costPerImage * count;
  const credits = totalCostUsd / DOLLARS_PER_CREDIT;

  return Math.max(0.01, Math.round(credits * 100) / 100);
}

export function estimateCompletionCredits(
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
): number {
  return calculateCompletionCredits(
    model,
    estimatedInputTokens,
    estimatedOutputTokens,
  );
}
