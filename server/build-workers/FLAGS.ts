export type FeatureFlags = {
  ENABLE_DESIGN_AGENT_ON_FIRST_MESSAGE: boolean;
};

export const DEFAULT_FLAGS: FeatureFlags = {
  ENABLE_DESIGN_AGENT_ON_FIRST_MESSAGE: false,
};

export type FlagName = keyof FeatureFlags;
