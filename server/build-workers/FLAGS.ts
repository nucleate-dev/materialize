export type FeatureFlags = {
  ENABLE_DESIGN_AGENT_ON_FIRST_MESSAGE: boolean;
  ENABLE_MCP_DESIGN_TOOLS: boolean;
};

export const DEFAULT_FLAGS: FeatureFlags = {
  ENABLE_DESIGN_AGENT_ON_FIRST_MESSAGE: false,
  ENABLE_MCP_DESIGN_TOOLS: false,
};

export type FlagName = keyof FeatureFlags;
