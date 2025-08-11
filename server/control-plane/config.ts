export const REDIS_KEYS = {
  ACTIVE_BUILDS: "active_build",
  PORT_REGISTRY: "port_registry",
};

export const CONFIG = {
  METRO_PORT_RANGE: { min: 4000, max: 4099 },
  IDLE_TIMEOUT_HOT_RELOAD: 15 * 60 * 1000, // 15 minutes
  IDLE_TIMEOUT_CLEANUP: 120 * 60 * 1000, // 120 minutes
  CLEANUP_INTERVAL_HOT_RELOAD: 5 * 60 * 1000, // 5 minutes
  CLEANUP_INTERVAL_FILES: 20 * 60 * 1000, // 20 minutes
  AUTO_SCALING_GROUP_NAME: process.env.ASG_NAME || "rn-web-workers",
};
