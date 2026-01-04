export interface DesignSystemConstructorAgent {
  constructDesignSystem(): Promise<{
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  }>;
}
