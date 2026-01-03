export interface DesignSystemConstructorAgent {
  constructDesignSystem(): Promise<{
    totalCostUsd: number | null;
    totalInputTokens: number;
    totalOutputTokens: number;
  }>;
}
