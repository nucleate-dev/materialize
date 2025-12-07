import { BuildStatus } from '../types/PublicAPITypes.js';

export function isEditableDevServer(status: BuildStatus | null): boolean {
  return (
    status === 'updating' ||
    status === 'creating' ||
    status === 'stable' ||
    status === 'error' ||
    status === 'chatting' ||
    status === 'building'
  );
}

export function isDispatchInProgress(status: BuildStatus | null): boolean {
  return (
    status === 'updating' || status === 'creating' || status === 'chatting'
  );
}

export function isDevServerInShutdownStages(
  status: BuildStatus | null,
): boolean {
  return status === 'cleaning';
}
