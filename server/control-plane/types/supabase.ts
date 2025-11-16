export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '12.2.3 (519615d)';
  };
  public: {
    Tables: {
      api_usage: {
        Row: {
          created_at: string | null;
          credit_grant_id: string | null;
          credits_used: number;
          is_free_tier: boolean;
          id: number;
          prototype_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          credit_grant_id?: string | null;
          credits_used?: number;
          is_free_tier?: boolean;
          id?: never;
          prototype_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          credit_grant_id?: string | null;
          credits_used?: number;
          is_free_tier?: boolean;
          id?: never;
          prototype_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'api_usage_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'api_usage_credit_grant_id_fkey';
            columns: ['credit_grant_id'];
            isOneToOne: false;
            referencedRelation: 'credit_grants';
            referencedColumns: ['id'];
          },
        ];
      };
      canvas_documents: {
        Row: {
          canvas_id: string | null;
          created_at: string | null;
          document_data: Json | null;
          id: string;
          updated_at: string | null;
        };
        Insert: {
          canvas_id?: string | null;
          created_at?: string | null;
          document_data?: Json | null;
          id?: string;
          updated_at?: string | null;
        };
        Update: {
          canvas_id?: string | null;
          created_at?: string | null;
          document_data?: Json | null;
          id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'canvas_documents_canvas_id_fkey';
            columns: ['canvas_id'];
            isOneToOne: false;
            referencedRelation: 'canvases';
            referencedColumns: ['id'];
          },
        ];
      };
      canvas_sessions: {
        Row: {
          canvas_id: string;
          last_accessed: string;
          session_data: Json;
          user_id: string;
        };
        Insert: {
          canvas_id: string;
          last_accessed?: string;
          session_data: Json;
          user_id: string;
        };
        Update: {
          canvas_id?: string;
          last_accessed?: string;
          session_data?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'canvas_sessions_canvas_id_fkey';
            columns: ['canvas_id'];
            isOneToOne: false;
            referencedRelation: 'canvases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'canvas_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      canvases: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          owner_id: string;
          folder_id: string | null;
          thumbnail_url: string | null;
          updated_at: string | null;
          visibility: Database['public']['Enums']['visibility_level'] | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          owner_id: string;
          folder_id?: string | null;
          thumbnail_url?: string | null;
          updated_at?: string | null;
          visibility?: Database['public']['Enums']['visibility_level'] | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          folder_id?: string | null;
          thumbnail_url?: string | null;
          updated_at?: string | null;
          visibility?: Database['public']['Enums']['visibility_level'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'canvases_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'canvases_folder_id_fkey';
            columns: ['folder_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      cloudflare_tunnels: {
        Row: {
          cname_target: string | null;
          created_at: string;
          hostname: string | null;
          id: string;
          prototype_id: string | null;
          status: Database['public']['Enums']['tunnel_status'];
          token: string | null;
          tunnel_id: string | null;
          updated_at: string;
        };
        Insert: {
          cname_target?: string | null;
          created_at?: string;
          hostname?: string | null;
          id?: string;
          prototype_id?: string | null;
          status?: Database['public']['Enums']['tunnel_status'];
          token?: string | null;
          tunnel_id?: string | null;
          updated_at?: string;
        };
        Update: {
          cname_target?: string | null;
          created_at?: string;
          hostname?: string | null;
          id?: string;
          prototype_id?: string | null;
          status?: Database['public']['Enums']['tunnel_status'];
          token?: string | null;
          tunnel_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_grants: {
        Row: {
          created_at: string;
          credits_granted: number;
          billing_period_start: string | null;
          billing_period_end: string | null;
          expires_at: string;
          grant_reason: string | null;
          grant_type: string;
          id: string;
          subscription_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          credits_granted: number;
          billing_period_start?: string | null;
          billing_period_end?: string | null;
          expires_at: string;
          grant_reason?: string | null;
          grant_type?: string;
          id?: string;
          subscription_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          credits_granted?: number;
          billing_period_start?: string | null;
          billing_period_end?: string | null;
          expires_at?: string;
          grant_reason?: string | null;
          grant_type?: string;
          id?: string;
          subscription_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_grants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_grants_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id'];
          },
        ];
      };
      design_system_files: {
        Row: {
          created_at: string;
          file_contents: Json;
          file_name: string;
          id: number;
        };
        Insert: {
          created_at?: string;
          file_contents: Json;
          file_name: string;
          id?: number;
        };
        Update: {
          created_at?: string;
          file_contents?: Json;
          file_name?: string;
          id?: number;
        };
        Relationships: [];
      };
      design_systems: {
        Row: {
          created_at: string;
          description: string | null;
          design_rules: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          design_rules: string;
          id?: string;
          name: string;
          owner_id?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          design_rules?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'design_systems_user_owner_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount: number | null;
          created_at: string;
          currency: string | null;
          id: number;
          invoice_id: string;
          status: string | null;
          stripe_customer_id: string | null;
          subscription_id: string | null;
          user_id: string | null;
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          currency?: string | null;
          id?: number;
          invoice_id: string;
          status?: string | null;
          stripe_customer_id?: string | null;
          subscription_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          currency?: string | null;
          id?: number;
          invoice_id?: string;
          status?: string | null;
          stripe_customer_id?: string | null;
          subscription_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      folders: {
        Row: {
          created_at: string | null;
          custom_design_system: string | null;
          default_design_style: Database['public']['Enums']['design_style'];
          description: string | null;
          id: string;
          name: string;
          owner_id: string | null;
          folder_context: Json | null;
          thumbnail_url: string | null;
          updated_at: string | null;
          visibility: Database['public']['Enums']['visibility_level'] | null;
        };
        Insert: {
          created_at?: string | null;
          custom_design_system?: string | null;
          default_design_style?: Database['public']['Enums']['design_style'];
          description?: string | null;
          id?: string;
          name?: string;
          owner_id?: string | null;
          folder_context?: Json | null;
          thumbnail_url?: string | null;
          updated_at?: string | null;
          visibility?: Database['public']['Enums']['visibility_level'] | null;
        };
        Update: {
          created_at?: string | null;
          custom_design_system?: string | null;
          default_design_style?: Database['public']['Enums']['design_style'];
          description?: string | null;
          id?: string;
          name?: string;
          owner_id?: string | null;
          folder_context?: Json | null;
          thumbnail_url?: string | null;
          updated_at?: string | null;
          visibility?: Database['public']['Enums']['visibility_level'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'folders_custom_design_system_fkey';
            columns: ['custom_design_system'];
            isOneToOne: false;
            referencedRelation: 'design_systems';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'folders_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      prototype_assets: {
        Row: {
          created_at: string | null;
          id: string;
          name: string;
          prototype_id: string | null;
          storage_url: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name: string;
          prototype_id?: string | null;
          storage_url: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string;
          prototype_id?: string | null;
          storage_url?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prototype_assets_prototype_id_fkey';
            columns: ['prototype_id'];
            isOneToOne: false;
            referencedRelation: 'prototypes';
            referencedColumns: ['id'];
          },
        ];
      };
      prototype_chat_messages: {
        Row: {
          chat_session_id: string | null;
          content: string;
          created_at: string;
          event_data: Json | null;
          event_timestamp: string | null;
          event_type: string | null;
          id: string;
          image_url: string | null;
          message_type: string;
          phase: string | null;
          role: Database['public']['Enums']['chat_role'];
          sequence: number | null;
        };
        Insert: {
          chat_session_id?: string | null;
          content: string;
          created_at?: string;
          event_data?: Json | null;
          event_timestamp?: string | null;
          event_type?: string | null;
          id?: string;
          image_url?: string | null;
          message_type?: string;
          phase?: string | null;
          role: Database['public']['Enums']['chat_role'];
          sequence?: number | null;
        };
        Update: {
          chat_session_id?: string | null;
          content?: string;
          created_at?: string;
          event_data?: Json | null;
          event_timestamp?: string | null;
          event_type?: string | null;
          id?: string;
          image_url?: string | null;
          message_type?: string;
          phase?: string | null;
          role?: Database['public']['Enums']['chat_role'];
          sequence?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prototype_chat_messages_chat_session_id_fkey';
            columns: ['chat_session_id'];
            isOneToOne: false;
            referencedRelation: 'prototype_chat_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      prototype_chat_sessions: {
        Row: {
          chat_context: Json | null;
          created_at: string | null;
          id: string;
          prototype_id: string | null;
          session_id: string | null;
          session_type: string | null;
          user_id: string | null;
        };
        Insert: {
          chat_context?: Json | null;
          created_at?: string | null;
          id?: string;
          prototype_id?: string | null;
          session_id?: string | null;
          session_type?: string | null;
          user_id?: string | null;
        };
        Update: {
          chat_context?: Json | null;
          created_at?: string | null;
          id?: string;
          prototype_id?: string | null;
          session_id?: string | null;
          session_type?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prototype_chat_sessions_prototype_id_fkey';
            columns: ['prototype_id'];
            isOneToOne: false;
            referencedRelation: 'prototypes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prototype_chat_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      prototype_files: {
        Row: {
          contents: string;
          created_at: string | null;
          id: string;
          name: string;
          prototype_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          contents: string;
          created_at?: string | null;
          id?: string;
          name: string;
          prototype_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          contents?: string;
          created_at?: string | null;
          id?: string;
          name?: string;
          prototype_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prototype_files_prototype_id_fkey';
            columns: ['prototype_id'];
            isOneToOne: false;
            referencedRelation: 'prototypes';
            referencedColumns: ['id'];
          },
        ];
      };
      prototypes: {
        Row: {
          created_at: string | null;
          custom_design_system: string | null;
          description: string | null;
          design_style: Database['public']['Enums']['design_style'];
          id: string;
          latest_build_key: string | null;
          name: string;
          owner_id: string | null;
          folder_id: string | null;
          prototype_context: Json | null;
          thumbnail_url: string | null;
          updated_at: string | null;
          visibility: Database['public']['Enums']['visibility_level'] | null;
        };
        Insert: {
          created_at?: string | null;
          custom_design_system?: string | null;
          description?: string | null;
          design_style?: Database['public']['Enums']['design_style'];
          id?: string;
          latest_build_key?: string | null;
          name?: string;
          owner_id?: string | null;
          folder_id?: string | null;
          prototype_context?: Json | null;
          thumbnail_url?: string | null;
          updated_at?: string | null;
          visibility?: Database['public']['Enums']['visibility_level'] | null;
        };
        Update: {
          created_at?: string | null;
          custom_design_system?: string | null;
          description?: string | null;
          design_style?: Database['public']['Enums']['design_style'];
          id?: string;
          latest_build_key?: string | null;
          name?: string;
          owner_id?: string | null;
          folder_id?: string | null;
          prototype_context?: Json | null;
          thumbnail_url?: string | null;
          updated_at?: string | null;
          visibility?: Database['public']['Enums']['visibility_level'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prototypes_custom_design_system_fkey';
            columns: ['custom_design_system'];
            isOneToOne: false;
            referencedRelation: 'design_systems';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prototypes_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prototypes_folder_id_fkey';
            columns: ['folder_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      subscriptions: {
        Row: {
          created_at: string;
          current_period_end: number | null;
          current_period_start: number | null;
          id: string;
          plan_id: Database['public']['Enums']['subscription_plan_type'];
          price_id: string | null;
          scheduled_for_cancellation: boolean | null;
          status: Database['public']['Enums']['subscription_status'] | null;
          stripe_customer_id: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          current_period_end?: number | null;
          current_period_start?: number | null;
          id: string;
          plan_id?: Database['public']['Enums']['subscription_plan_type'];
          price_id?: string | null;
          scheduled_for_cancellation?: boolean | null;
          status?: Database['public']['Enums']['subscription_status'] | null;
          stripe_customer_id?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          current_period_end?: number | null;
          current_period_start?: number | null;
          id?: string;
          plan_id?: Database['public']['Enums']['subscription_plan_type'];
          price_id?: string | null;
          scheduled_for_cancellation?: boolean | null;
          status?: Database['public']['Enums']['subscription_status'] | null;
          stripe_customer_id?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_internal_metadata: {
        Row: {
          created_at: string;
          is_employee: boolean;
          is_test_user: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          is_employee?: boolean;
          is_test_user?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          is_employee?: boolean;
          is_test_user?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_internal_metadata_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          id: string;
          name: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      credit_grant_balances: {
        Row: {
          billing_period_end: string | null;
          billing_period_start: string | null;
          created_at: string;
          credits_granted: number;
          credits_remaining: number;
          credits_used: number;
          expires_at: string;
          grant_reason: string | null;
          grant_type: string;
          id: string | null;
          subscription_id: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_grants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_grants_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      allocate_idle_tunnel: {
        Args: { p_prototype_id: string };
        Returns: {
          cname_target: string | null;
          created_at: string;
          hostname: string | null;
          id: string;
          prototype_id: string | null;
          status: Database['public']['Enums']['tunnel_status'];
          token: string | null;
          tunnel_id: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'cloudflare_tunnels';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      consume_credits: {
        Args: {
          p_user_id: string;
          p_prototype_id?: string | null;
          p_credits: number;
        };
        Returns: {
          success: boolean;
          total_remaining: number;
          consumed_grants: Json;
          grant_balances: Json;
          error: string | null;
        };
        SetofOptions: {
          from: {
            success: boolean;
            total_remaining: number;
            consumed_grants: Json;
            grant_balances: Json;
            error: string | null;
          };
          to: never;
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      chat_role: 'user' | 'assistant' | 'system';
      design_style: 'tamagui' | 'stylesheets' | 'nativewind' | 'custom';
      file_type: 'text' | 'asset';
      subscription_plan_type: 'free' | 'plus' | 'pro' | 'max' | 'team';
      subscription_status: 'active' | 'past_due' | 'canceled';
      tunnel_status: 'creating' | 'idle' | 'allocated';
      visibility_level: 'SELF' | 'TEAM_SUBSET' | 'TEAM' | 'PUBLIC';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      chat_role: ['user', 'assistant'],
      design_style: ['tamagui', 'stylesheets', 'nativewind', 'custom'],
      file_type: ['text', 'asset'],
      subscription_plan_type: ['free', 'plus', 'pro', 'max', 'team'],
      subscription_status: ['active', 'past_due', 'canceled'],
      tunnel_status: ['creating', 'idle', 'allocated'],
      visibility_level: ['SELF', 'TEAM_SUBSET', 'TEAM', 'PUBLIC'],
    },
  },
} as const;
