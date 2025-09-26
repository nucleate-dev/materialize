/**
 * Configuration for Chat Engine selection and settings
 */
export const CHAT_ENGINE_CONFIG = {
  /**
   * Chat Engine version to use
   * - 'v1': ChatEngineV1 (default) - uses existing system with write_file tool
   * - 'v2': ChatEngineV2 - uses enhanced system with patch_file tool for efficient file modifications
   */
  VERSION: 'v1' as 'v1' | 'v2',
} as const;

export type ChatEngineVersion = typeof CHAT_ENGINE_CONFIG.VERSION;