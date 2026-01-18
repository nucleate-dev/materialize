import type {
  LLMProviderError,
  LLMProviderErrorType,
} from '../providers/types.js';
import type {
  LLMCompletionErrorResponse,
  LLMErrorCode,
} from '../../../types/PublicAPITypes.js';
import { HTTP_STATUS } from '../../../types/PublicAPITypes.js';

export interface MappedError {
  status: number;
  response: LLMCompletionErrorResponse;
}

const ERROR_TYPE_TO_CODE: Record<LLMProviderErrorType, LLMErrorCode> = {
  rate_limit: 'RATE_LIMITED',
  auth: 'PROVIDER_ERROR',
  invalid_request: 'VALIDATION_ERROR',
  content_policy: 'CONTENT_POLICY_VIOLATION',
  server: 'PROVIDER_ERROR',
  unknown: 'PROVIDER_ERROR',
};

const ERROR_TYPE_TO_STATUS: Record<LLMProviderErrorType, number> = {
  rate_limit: 429,
  auth: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  invalid_request: HTTP_STATUS.BAD_REQUEST,
  content_policy: HTTP_STATUS.BAD_REQUEST,
  server: HTTP_STATUS.BAD_GATEWAY,
  unknown: HTTP_STATUS.INTERNAL_SERVER_ERROR,
};

const ERROR_TYPE_TO_MESSAGE: Record<LLMProviderErrorType, string> = {
  rate_limit: 'Provider rate limit exceeded. Please try again later.',
  auth: 'Provider authentication failed. Please contact support.',
  invalid_request: 'Invalid request to provider.',
  content_policy: 'Content violates provider usage policy.',
  server: 'Provider server error. Please try again later.',
  unknown: 'An unexpected error occurred.',
};

export function mapProviderErrorToAPIError(error: unknown): MappedError {
  // Check if it's a structured provider error
  const providerError = error as LLMProviderError;

  if (providerError && providerError.type) {
    const errorType = providerError.type;
    return {
      status: ERROR_TYPE_TO_STATUS[errorType],
      response: {
        error: ERROR_TYPE_TO_CODE[errorType],
        message: ERROR_TYPE_TO_MESSAGE[errorType],
        provider_error: providerError.message,
      },
    };
  }

  // Generic error handling
  const genericError = error as Error;
  return {
    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    response: {
      error: 'PROVIDER_ERROR',
      message: 'An unexpected error occurred.',
      provider_error: genericError?.message ?? 'Unknown error',
    },
  };
}

export function isLLMProviderError(error: unknown): error is LLMProviderError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'type' in error &&
    typeof (error as LLMProviderError).type === 'string'
  );
}
