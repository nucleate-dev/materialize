import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useActiveTeam } from '../stores/teamStore';
import { useAuthStore } from '../stores/authStore';
import {
  APIResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
  CreatePrototypeErrorResponse,
  PrototypeFramework,
  VisibilityLevel,
  DesignStyle,
} from '../lib/types/serverAPITypes';
import { PROTOTYPES_QUERY_KEY } from './usePrototypes';
import { useSubscriptionAccess } from './useSubscriptionAccess';

const SERVER_ENDPOINT = process.env.EXPO_PUBLIC_SERVER_ENDPOINT;

export interface CreatePrototypeOptions {
  name?: string;
  description?: string;
  framework?: PrototypeFramework;
  visibility?: VisibilityLevel;
  designStyle?: DesignStyle;
}

interface UseCreatePrototypeReturn {
  createPrototype: (options: CreatePrototypeOptions) => Promise<CreatePrototypeSuccessResponse>;
  isCreating: boolean;
  error: Error | null;
  reset: () => void;
}

export function useCreatePrototype(): UseCreatePrototypeReturn {
  const queryClient = useQueryClient();
  const activeTeam = useActiveTeam();
  const session = useAuthStore((state) => state.session);
  const { isFreePlan } = useSubscriptionAccess();

  const mutation = useMutation({
    mutationFn: async (
      options: CreatePrototypeOptions
    ): Promise<CreatePrototypeSuccessResponse> => {
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      if (!activeTeam?.id) {
        throw new Error('No active team selected');
      }

      // Free tier users can only create PUBLIC prototypes
      const defaultVisibility: VisibilityLevel = isFreePlan ? 'PUBLIC' : 'SELF';

      const payload: CreatePrototypeRequestBody = {
        name: options.name || 'New Project',
        creation_source: 'dashboard_prompt',
        team_id: activeTeam.id,
        framework: options.framework || 'mobile_expo_react_native',
        visibility: options.visibility || defaultVisibility,
        design_style: options.designStyle || 'stylesheets',
        description: options.description,
      };

      const response = await fetch(`${SERVER_ENDPOINT}/prototype/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const result: APIResponse<CreatePrototypeSuccessResponse, CreatePrototypeErrorResponse> =
        await response.json();

      if (result.error) {
        // Handle specific error types
        if (result.error.error === 'PROTOTYPE_LIMIT_REACHED') {
          throw new Error('You have reached your project limit. Please upgrade your plan.');
        }
        throw new Error(result.error.message || 'Failed to create project');
      }

      if (!result.data) {
        throw new Error('No data returned from server');
      }

      return result.data;
    },
    onSuccess: () => {
      // Invalidate prototypes list to refetch
      queryClient.invalidateQueries({ queryKey: [PROTOTYPES_QUERY_KEY] });
    },
  });

  return {
    createPrototype: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
