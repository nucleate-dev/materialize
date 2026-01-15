import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useActiveTeam } from '../stores/teamStore';

export interface Prototype {
  id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
  team_id: string;
  owner_id: string | null;
  framework: 'mobile_expo_react_native' | 'web_nextjs_react' | null;
  visibility: 'PUBLIC' | 'TEAM' | 'SELF' | null;
  design_style: string;
  latest_build_key: string;
  slug: string | null;
}

export const PROTOTYPES_QUERY_KEY = 'prototypes';

export function usePrototypes() {
  const activeTeam = useActiveTeam();

  return useQuery({
    queryKey: [PROTOTYPES_QUERY_KEY, activeTeam?.id],
    queryFn: async (): Promise<Prototype[]> => {
      if (!activeTeam?.id) return [];

      const { data, error } = await supabase
        .from('prototypes')
        .select('*')
        .eq('team_id', activeTeam.id)
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return data || [];
    },
    enabled: !!activeTeam?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function usePrototype(prototypeId: string | undefined) {
  return useQuery({
    queryKey: [PROTOTYPES_QUERY_KEY, 'single', prototypeId],
    queryFn: async (): Promise<Prototype | null> => {
      if (!prototypeId) return null;

      const { data, error } = await supabase
        .from('prototypes')
        .select('*')
        .eq('id', prototypeId)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    enabled: !!prototypeId,
  });
}

export function useDeletePrototype() {
  const queryClient = useQueryClient();
  const activeTeam = useActiveTeam();

  return useMutation({
    mutationFn: async (prototypeId: string) => {
      const { error } = await supabase
        .from('prototypes')
        .delete()
        .eq('id', prototypeId);

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      // Invalidate prototypes list
      queryClient.invalidateQueries({
        queryKey: [PROTOTYPES_QUERY_KEY, activeTeam?.id],
      });
    },
  });
}

export function useRefreshPrototypes() {
  const queryClient = useQueryClient();
  const activeTeam = useActiveTeam();

  return () => {
    queryClient.invalidateQueries({
      queryKey: [PROTOTYPES_QUERY_KEY, activeTeam?.id],
    });
  };
}

// Get screenshot URL from the build key
export function getScreenshotUrl(prototype: Prototype): string | null {
  if (!prototype.latest_build_key) return null;

  // The screenshot is stored in S3 with a predictable pattern
  // This matches the web app's pattern for screenshots
  const bucketUrl = process.env.EXPO_PUBLIC_S3_BUCKET_URL;
  if (!bucketUrl) return null;

  return `${bucketUrl}/${prototype.latest_build_key}/screenshot.png`;
}
