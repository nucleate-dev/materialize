export const REDIS_KEYS = {
  ACTIVE_BUILDS: 'active_build',
  PORT_REGISTRY: 'port_registry',
};

const SEC_IN_MIN = 60;
const MILLIS_IN_SEC = 1000;

export const CONFIG = {
  IDLE_TIMEOUT_HOT_RELOAD: 10 * SEC_IN_MIN * MILLIS_IN_SEC, // 10 minutes
  CLEANUP_INTERVAL_HOT_RELOAD: 3 * SEC_IN_MIN * MILLIS_IN_SEC, // 4 minutes
};
