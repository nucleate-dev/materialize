export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage: {
        Row: {
          created_at: string | null
          credit_grant_id: string | null
          credits_used: number
          id: number
          is_free_tier: boolean
          prototype_id: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credit_grant_id?: string | null
          credits_used?: number
          id?: never
          is_free_tier?: boolean
          prototype_id?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          credit_grant_id?: string | null
          credits_used?: number
          id?: never
          is_free_tier?: boolean
          prototype_id?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_credit_grant_id_fkey"
            columns: ["credit_grant_id"]
            isOneToOne: false
            referencedRelation: "credit_grant_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_credit_grant_id_fkey"
            columns: ["credit_grant_id"]
            isOneToOne: false
            referencedRelation: "credit_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_documents: {
        Row: {
          canvas_id: string | null
          created_at: string | null
          document_data: Json | null
          id: string
          updated_at: string | null
        }
        Insert: {
          canvas_id?: string | null
          created_at?: string | null
          document_data?: Json | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          canvas_id?: string | null
          created_at?: string | null
          document_data?: Json | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canvas_documents_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_sessions: {
        Row: {
          canvas_id: string
          last_accessed: string
          session_data: Json
          user_id: string
        }
        Insert: {
          canvas_id: string
          last_accessed?: string
          session_data: Json
          user_id: string
        }
        Update: {
          canvas_id?: string
          last_accessed?: string
          session_data?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_sessions_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      canvases: {
        Row: {
          created_at: string | null
          description: string | null
          folder_id: string | null
          id: string
          name: string
          owner_id: string
          thumbnail_url: string | null
          updated_at: string | null
          visibility: Database["public"]["Enums"]["visibility_level"] | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          owner_id: string
          thumbnail_url?: string | null
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          owner_id?: string
          thumbnail_url?: string | null
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Relationships: [
          {
            foreignKeyName: "canvases_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvases_project_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      cloudflare_tunnels: {
        Row: {
          cname_target: string | null
          created_at: string
          hostname: string | null
          id: string
          prototype_id: string | null
          status: Database["public"]["Enums"]["tunnel_status"]
          token: string | null
          tunnel_id: string | null
          updated_at: string
        }
        Insert: {
          cname_target?: string | null
          created_at?: string
          hostname?: string | null
          id?: string
          prototype_id?: string | null
          status?: Database["public"]["Enums"]["tunnel_status"]
          token?: string | null
          tunnel_id?: string | null
          updated_at?: string
        }
        Update: {
          cname_target?: string | null
          created_at?: string
          hostname?: string | null
          id?: string
          prototype_id?: string | null
          status?: Database["public"]["Enums"]["tunnel_status"]
          token?: string | null
          tunnel_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      connectors_supabase_integration_tokens: {
        Row: {
          access_token_encrypted: string
          created_at: string
          integration_id: string
          refresh_token_encrypted: string | null
          refresh_token_expires_at: string | null
          token_expires_at: string | null
          token_scopes: string | null
          token_type: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          created_at?: string
          integration_id: string
          refresh_token_encrypted?: string | null
          refresh_token_expires_at?: string | null
          token_expires_at?: string | null
          token_scopes?: string | null
          token_type?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          created_at?: string
          integration_id?: string
          refresh_token_encrypted?: string | null
          refresh_token_expires_at?: string | null
          token_expires_at?: string | null
          token_scopes?: string | null
          token_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connectors_supabase_integration_tokens_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "connectors_supabase_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      connectors_supabase_integrations: {
        Row: {
          connected_at: string
          connected_by_user_id: string | null
          id: string
          metadata: Json
          status: Database["public"]["Enums"]["connector_status"]
          supabase_organization_id: string
          supabase_organization_name: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          connected_at?: string
          connected_by_user_id?: string | null
          id?: string
          metadata?: Json
          status?: Database["public"]["Enums"]["connector_status"]
          supabase_organization_id: string
          supabase_organization_name?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          connected_at?: string
          connected_by_user_id?: string | null
          id?: string
          metadata?: Json
          status?: Database["public"]["Enums"]["connector_status"]
          supabase_organization_id?: string
          supabase_organization_name?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connectors_supabase_integrations_connected_by_user_id_fkey"
            columns: ["connected_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connectors_supabase_integrations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_grants: {
        Row: {
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string
          credits_granted: number
          expires_at: string
          grant_reason: string | null
          grant_type: string
          id: string
          subscription_id: string | null
          team_id: string
        }
        Insert: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          credits_granted: number
          expires_at: string
          grant_reason?: string | null
          grant_type?: string
          id?: string
          subscription_id?: string | null
          team_id: string
        }
        Update: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          credits_granted?: number
          expires_at?: string
          grant_reason?: string | null
          grant_type?: string
          id?: string
          subscription_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_grants_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_grants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      design_system_files: {
        Row: {
          created_at: string
          file_contents: Json
          file_name: string
          id: number
        }
        Insert: {
          created_at?: string
          file_contents: Json
          file_name: string
          id?: number
        }
        Update: {
          created_at?: string
          file_contents?: Json
          file_name?: string
          id?: number
        }
        Relationships: []
      }
      design_systems: {
        Row: {
          created_at: string
          description: string | null
          design_rules: string
          id: string
          name: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          design_rules: string
          id?: string
          name: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          design_rules?: string
          id?: string
          name?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_systems_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      flags: {
        Row: {
          flag_name: string
          is_enabled: boolean
        }
        Insert: {
          flag_name: string
          is_enabled: boolean
        }
        Update: {
          flag_name?: string
          is_enabled?: boolean
        }
        Relationships: []
      }
      folders: {
        Row: {
          created_at: string | null
          custom_design_system: string | null
          default_design_style: Database["public"]["Enums"]["design_style"]
          description: string | null
          folder_context: Json | null
          id: string
          name: string
          team_id: string
          thumbnail_url: string | null
          updated_at: string | null
          visibility: Database["public"]["Enums"]["visibility_level"] | null
        }
        Insert: {
          created_at?: string | null
          custom_design_system?: string | null
          default_design_style?: Database["public"]["Enums"]["design_style"]
          description?: string | null
          folder_context?: Json | null
          id?: string
          name?: string
          team_id: string
          thumbnail_url?: string | null
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Update: {
          created_at?: string | null
          custom_design_system?: string | null
          default_design_style?: Database["public"]["Enums"]["design_style"]
          description?: string | null
          folder_context?: Json | null
          id?: string
          name?: string
          team_id?: string
          thumbnail_url?: string | null
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Relationships: [
          {
            foreignKeyName: "folders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_custom_design_system_fkey"
            columns: ["custom_design_system"]
            isOneToOne: false
            referencedRelation: "design_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      github_connect_sessions: {
        Row: {
          created_at: string
          created_by_user_id: string
          expires_at: string
          id: string
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          expires_at: string
          id?: string
          status: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          expires_at?: string
          id?: string
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_connect_sessions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "github_connect_sessions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      github_integration_tokens: {
        Row: {
          created_at: string
          refresh_encrypted: string | null
          team_id: string
          token_encrypted: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          refresh_encrypted?: string | null
          team_id: string
          token_encrypted: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          refresh_encrypted?: string | null
          team_id?: string
          token_encrypted?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_integration_tokens_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "github_integrations"
            referencedColumns: ["team_id"]
          },
        ]
      }
      github_integrations: {
        Row: {
          account_login: string
          account_type: string
          connected_at: string
          installation_id: number
          installed_by_github_user_id: number
          is_suspended: boolean
          suspended_at: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          account_login: string
          account_type: string
          connected_at?: string
          installation_id: number
          installed_by_github_user_id: number
          is_suspended?: boolean
          suspended_at?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          account_login?: string
          account_type?: string
          connected_at?: string
          installation_id?: number
          installed_by_github_user_id?: number
          is_suspended?: boolean
          suspended_at?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_integrations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_github_repositories: {
        Row: {
          account_login: string
          account_type: string
          created_at: string
          default_branch: string
          full_name: string
          github_repo_id: number
          html_url: string
          installation_id: number
          is_archived: boolean | null
          is_private: boolean | null
          owner_login: string
          prototype_id: string | null
          repo_name: string
          updated_at: string
        }
        Insert: {
          account_login: string
          account_type: string
          created_at?: string
          default_branch: string
          full_name: string
          github_repo_id: number
          html_url: string
          installation_id: number
          is_archived?: boolean | null
          is_private?: boolean | null
          owner_login: string
          prototype_id?: string | null
          repo_name: string
          updated_at?: string
        }
        Update: {
          account_login?: string
          account_type?: string
          created_at?: string
          default_branch?: string
          full_name?: string
          github_repo_id?: number
          html_url?: string
          installation_id?: number
          is_archived?: boolean | null
          is_private?: boolean | null
          owner_login?: string
          prototype_id?: string | null
          repo_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prototype_github_repositories_prototype_id_fkey"
            columns: ["prototype_id"]
            isOneToOne: false
            referencedRelation: "prototypes"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          id: number
          invoice_id: string
          status: string | null
          stripe_customer_id: string | null
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          id?: number
          invoice_id: string
          status?: string | null
          stripe_customer_id?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          id?: number
          invoice_id?: string
          status?: string | null
          stripe_customer_id?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_assets: {
        Row: {
          created_at: string | null
          id: string
          name: string
          prototype_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          prototype_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          prototype_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prototype_assets_prototype_id_fkey"
            columns: ["prototype_id"]
            isOneToOne: false
            referencedRelation: "prototypes"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_backends: {
        Row: {
          backend_type: Database["public"]["Enums"]["prototype_backend_type"]
          created_at: string
          id: string
          metadata: Json
          prototype_id: string
          provider_integration_id: string | null
          provider_project_id: string
          provider_project_url: string | null
          updated_at: string
        }
        Insert: {
          backend_type: Database["public"]["Enums"]["prototype_backend_type"]
          created_at?: string
          id?: string
          metadata?: Json
          prototype_id: string
          provider_integration_id?: string | null
          provider_project_id: string
          provider_project_url?: string | null
          updated_at?: string
        }
        Update: {
          backend_type?: Database["public"]["Enums"]["prototype_backend_type"]
          created_at?: string
          id?: string
          metadata?: Json
          prototype_id?: string
          provider_integration_id?: string | null
          provider_project_id?: string
          provider_project_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prototype_backends_prototype_id_fkey"
            columns: ["prototype_id"]
            isOneToOne: false
            referencedRelation: "prototypes"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_build_history: {
        Row: {
          build_key: string
          build_output: string | null
          build_status:
            | Database["public"]["Enums"]["prototype_build_status"]
            | null
          created_at: string
          deploy_key: string
          id: string
          prototype_id: string
          updated_at: string
        }
        Insert: {
          build_key: string
          build_output?: string | null
          build_status?:
            | Database["public"]["Enums"]["prototype_build_status"]
            | null
          created_at?: string
          deploy_key: string
          id?: string
          prototype_id: string
          updated_at?: string
        }
        Update: {
          build_key?: string
          build_output?: string | null
          build_status?:
            | Database["public"]["Enums"]["prototype_build_status"]
            | null
          created_at?: string
          deploy_key?: string
          id?: string
          prototype_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prototype_build_history_prototype_id_fkey"
            columns: ["prototype_id"]
            isOneToOne: false
            referencedRelation: "prototypes"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_chat_messages: {
        Row: {
          chat_session_id: string | null
          content: string
          cost_function: string | null
          created_at: string
          credits_used: number | null
          event_data: Json | null
          event_timestamp: string | null
          event_type: string | null
          id: string
          image_url: string | null
          message_type: string
          phase: string | null
          role: Database["public"]["Enums"]["chat_role"]
          sequence: number | null
          user_id: string | null
        }
        Insert: {
          chat_session_id?: string | null
          content: string
          cost_function?: string | null
          created_at?: string
          credits_used?: number | null
          event_data?: Json | null
          event_timestamp?: string | null
          event_type?: string | null
          id?: string
          image_url?: string | null
          message_type?: string
          phase?: string | null
          role: Database["public"]["Enums"]["chat_role"]
          sequence?: number | null
          user_id?: string | null
        }
        Update: {
          chat_session_id?: string | null
          content?: string
          cost_function?: string | null
          created_at?: string
          credits_used?: number | null
          event_data?: Json | null
          event_timestamp?: string | null
          event_type?: string | null
          id?: string
          image_url?: string | null
          message_type?: string
          phase?: string | null
          role?: Database["public"]["Enums"]["chat_role"]
          sequence?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prototype_chat_messages_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "prototype_chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prototype_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_chat_sessions: {
        Row: {
          chat_context: Json | null
          created_at: string | null
          id: string
          prototype_id: string
          session_id: string | null
          session_type: string | null
          user_id: string
        }
        Insert: {
          chat_context?: Json | null
          created_at?: string | null
          id?: string
          prototype_id: string
          session_id?: string | null
          session_type?: string | null
          user_id: string
        }
        Update: {
          chat_context?: Json | null
          created_at?: string | null
          id?: string
          prototype_id?: string
          session_id?: string | null
          session_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prototype_chat_sessions_prototype_id_fkey"
            columns: ["prototype_id"]
            isOneToOne: false
            referencedRelation: "prototypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prototype_chat_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_env_var_secrets: {
        Row: {
          created_at: string
          env_var_id: string
          secret_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          env_var_id: string
          secret_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          env_var_id?: string
          secret_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prototype_env_var_secrets_env_var_id_fkey"
            columns: ["env_var_id"]
            isOneToOne: true
            referencedRelation: "prototype_env_vars"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_env_vars: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          name: string
          prototype_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          prototype_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          prototype_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prototype_env_vars_prototype_id_fkey"
            columns: ["prototype_id"]
            isOneToOne: false
            referencedRelation: "prototypes"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_files: {
        Row: {
          contents: string
          created_at: string | null
          id: string
          name: string
          prototype_id: string | null
          updated_at: string | null
        }
        Insert: {
          contents: string
          created_at?: string | null
          id?: string
          name: string
          prototype_id?: string | null
          updated_at?: string | null
        }
        Update: {
          contents?: string
          created_at?: string | null
          id?: string
          name?: string
          prototype_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prototype_files_prototype_id_fkey"
            columns: ["prototype_id"]
            isOneToOne: false
            referencedRelation: "prototypes"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_source_repositories: {
        Row: {
          created_at: string
          prototype_id: string
          source_repo_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          prototype_id: string
          source_repo_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          prototype_id?: string
          source_repo_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prototype_source_repositories_prototype_id_fkey"
            columns: ["prototype_id"]
            isOneToOne: true
            referencedRelation: "prototypes"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_source_repo_pull_requests: {
        Row: {
          base_branch: string
          branch_name: string
          created_at: string
          github_pull_request_number: number
          github_pull_request_url: string
          github_repo_id: number | null
          head_sha: string | null
          id: string
          pr_body: string | null
          pr_title: string
          prototype_chat_session_id: string | null
          prototype_id: string
          status: Database["public"]["Enums"]["pull_request_status"]
          updated_at: string
        }
        Insert: {
          base_branch: string
          branch_name: string
          created_at?: string
          github_pull_request_number: number
          github_pull_request_url: string
          github_repo_id?: number | null
          head_sha?: string | null
          id?: string
          pr_body?: string | null
          pr_title: string
          prototype_chat_session_id?: string | null
          prototype_id: string
          status?: Database["public"]["Enums"]["pull_request_status"]
          updated_at?: string
        }
        Update: {
          base_branch?: string
          branch_name?: string
          created_at?: string
          github_pull_request_number?: number
          github_pull_request_url?: string
          github_repo_id?: number | null
          head_sha?: string | null
          id?: string
          pr_body?: string | null
          pr_title?: string
          prototype_chat_session_id?: string | null
          prototype_id?: string
          status?: Database["public"]["Enums"]["pull_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prototype_source_repo_pull_reque_prototype_chat_session_id_fkey"
            columns: ["prototype_chat_session_id"]
            isOneToOne: false
            referencedRelation: "prototype_chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prototype_source_repo_pull_requests_prototype_id_fkey"
            columns: ["prototype_id"]
            isOneToOne: false
            referencedRelation: "prototypes"
            referencedColumns: ["id"]
          },
        ]
      }
      prototypes: {
        Row: {
          created_at: string | null
          custom_design_system: string | null
          description: string | null
          design_style: Database["public"]["Enums"]["design_style"]
          folder_id: string | null
          framework: Database["public"]["Enums"]["prototype_framework"] | null
          github_repo_id: number | null
          id: string
          latest_build_key: string
          latest_deploy_key: string | null
          name: string
          owner_id: string | null
          project_context: string
          prototype_context: Json | null
          public_display_config: Json | null
          slug: string | null
          team_id: string
          updated_at: string | null
          visibility: Database["public"]["Enums"]["visibility_level"] | null
        }
        Insert: {
          created_at?: string | null
          custom_design_system?: string | null
          description?: string | null
          design_style?: Database["public"]["Enums"]["design_style"]
          folder_id?: string | null
          framework?: Database["public"]["Enums"]["prototype_framework"] | null
          github_repo_id?: number | null
          id?: string
          latest_build_key: string
          latest_deploy_key?: string | null
          name?: string
          owner_id?: string | null
          project_context?: string
          prototype_context?: Json | null
          public_display_config?: Json | null
          slug?: string | null
          team_id: string
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Update: {
          created_at?: string | null
          custom_design_system?: string | null
          description?: string | null
          design_style?: Database["public"]["Enums"]["design_style"]
          folder_id?: string | null
          framework?: Database["public"]["Enums"]["prototype_framework"] | null
          github_repo_id?: number | null
          id?: string
          latest_build_key?: string
          latest_deploy_key?: string | null
          name?: string
          owner_id?: string | null
          project_context?: string
          prototype_context?: Json | null
          public_display_config?: Json | null
          slug?: string | null
          team_id?: string
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Relationships: [
          {
            foreignKeyName: "prototypes_custom_design_system_fkey"
            columns: ["custom_design_system"]
            isOneToOne: false
            referencedRelation: "design_systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prototypes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prototypes_github_repo_id_fkey"
            columns: ["github_repo_id"]
            isOneToOne: false
            referencedRelation: "prototype_github_repositories"
            referencedColumns: ["github_repo_id"]
          },
          {
            foreignKeyName: "prototypes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prototypes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: number | null
          current_period_start: number | null
          id: string
          plan_id: Database["public"]["Enums"]["subscription_plan_type"]
          price_id: string | null
          scheduled_for_cancellation: boolean | null
          seat_quantity: number
          status: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id: string | null
          stripe_subscription_item_id: string
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          current_period_end?: number | null
          current_period_start?: number | null
          id: string
          plan_id?: Database["public"]["Enums"]["subscription_plan_type"]
          price_id?: string | null
          scheduled_for_cancellation?: boolean | null
          seat_quantity?: number
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id?: string | null
          stripe_subscription_item_id?: string
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          current_period_end?: number | null
          current_period_start?: number | null
          id?: string
          plan_id?: Database["public"]["Enums"]["subscription_plan_type"]
          price_id?: string | null
          scheduled_for_cancellation?: boolean | null
          seat_quantity?: number
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_customer_id?: string | null
          stripe_subscription_item_id?: string
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string | null
          expires_at: string | null
          id: string
          invite_status: Database["public"]["Enums"]["team_invite_status"]
          invited_by: string | null
          invited_user_id: string | null
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invite_status?: Database["public"]["Enums"]["team_invite_status"]
          invited_by?: string | null
          invited_user_id?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invite_status?: Database["public"]["Enums"]["team_invite_status"]
          invited_by?: string | null
          invited_user_id?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          created_at: string
          invited_by: string | null
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_settings: {
        Row: {
          created_at: string
          setting_key: Database["public"]["Enums"]["team_setting_key"]
          setting_value: Database["public"]["Enums"]["team_setting_value"]
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          setting_key: Database["public"]["Enums"]["team_setting_key"]
          setting_value: Database["public"]["Enums"]["team_setting_value"]
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          setting_key?: Database["public"]["Enums"]["team_setting_key"]
          setting_value?: Database["public"]["Enums"]["team_setting_value"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_settings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          personal_owner_user_id: string | null
          slug: string | null
          sso_provider_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          personal_owner_user_id?: string | null
          slug?: string | null
          sso_provider_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          personal_owner_user_id?: string | null
          slug?: string | null
          sso_provider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_personal_owner_user_id_fkey"
            columns: ["personal_owner_user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_claude_tokens: {
        Row: {
          created_at: string
          id: string
          is_valid: boolean
          last_used_at: string | null
          last_validated_at: string | null
          oauth_token: string
          token_type: string | null
          updated_at: string
          user_id: string
          validation_error: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_valid?: boolean
          last_used_at?: string | null
          last_validated_at?: string | null
          oauth_token: string
          token_type?: string | null
          updated_at?: string
          user_id: string
          validation_error?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_valid?: boolean
          last_used_at?: string | null
          last_validated_at?: string | null
          oauth_token?: string
          token_type?: string | null
          updated_at?: string
          user_id?: string
          validation_error?: string | null
        }
        Relationships: []
      }
      user_internal_metadata: {
        Row: {
          created_at: string
          is_employee: boolean
          is_test_user: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_employee?: boolean
          is_test_user?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_employee?: boolean
          is_test_user?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_internal_metadata_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding_survey: {
        Row: {
          ai_coding_experience: string
          completed_at: string | null
          created_at: string | null
          referral_source: string
          referral_source_other: string | null
          role: string
          role_other: string | null
          updated_at: string | null
          use_cases: string[]
          use_cases_other: string | null
          user_id: string
        }
        Insert: {
          ai_coding_experience: string
          completed_at?: string | null
          created_at?: string | null
          referral_source: string
          referral_source_other?: string | null
          role: string
          role_other?: string | null
          updated_at?: string | null
          use_cases?: string[]
          use_cases_other?: string | null
          user_id: string
        }
        Update: {
          ai_coding_experience?: string
          completed_at?: string | null
          created_at?: string | null
          referral_source?: string
          referral_source_other?: string | null
          role?: string
          role_other?: string | null
          updated_at?: string | null
          use_cases?: string[]
          use_cases_other?: string | null
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          is_sso_user: boolean
          name: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_sso_user?: boolean
          name?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_sso_user?: boolean
          name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      credit_grant_balances: {
        Row: {
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string | null
          credits_granted: number | null
          credits_remaining: number | null
          credits_used: number | null
          expires_at: string | null
          grant_reason: string | null
          grant_type: string | null
          id: string | null
          subscription_id: string | null
          team_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_grants_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_grants_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      allocate_idle_tunnel: {
        Args: { p_prototype_id: string }
        Returns: {
          cname_target: string | null
          created_at: string
          hostname: string | null
          id: string
          prototype_id: string | null
          status: Database["public"]["Enums"]["tunnel_status"]
          token: string | null
          tunnel_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cloudflare_tunnels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_edit_prototype: { Args: { p_prototype_id: string }; Returns: boolean }
      can_view_prototype: { Args: { p_prototype_id: string }; Returns: boolean }
      consume_credits: {
        Args: { p_credits: number; p_prototype_id: string; p_user_id: string }
        Returns: {
          consumed_grants: Json
          error: string
          grant_balances: Json
          success: boolean
          total_remaining: number
        }[]
      }
      consume_credits_teams: {
        Args: { p_credits: number; p_prototype_id: string; p_team_id: string }
        Returns: {
          consumed_grants: Json
          error: string
          grant_balances: Json
          success: boolean
          total_remaining: number
        }[]
      }
      get_prototype_team_id: {
        Args: { p_prototype_id: string }
        Returns: string
      }
      is_team_empty: { Args: { p_team_id: string }; Returns: boolean }
      is_team_member: { Args: { p_team_id: string }; Returns: boolean }
      is_team_member_with_edit_privileges: {
        Args: { p_team_id: string }
        Returns: boolean
      }
      is_team_owner: { Args: { p_team_id: string }; Returns: boolean }
      is_team_owner_or_admin: { Args: { p_team_id: string }; Returns: boolean }
      validate_api_key: {
        Args: { p_key_hash: string }
        Returns: {
          key_id: string
          scopes: string
          team_id: string
          user_id: string
        }[]
      }
    }
    Enums: {
      chat_role: "user" | "assistant" | "system"
      connector_status: "active" | "disconnected" | "token_expired"
      design_style: "tamagui" | "stylesheets" | "nativewind" | "custom"
      file_type: "text" | "asset"
      prototype_backend_type: "supabase"
      prototype_build_status: "in_progress" | "success" | "failure"
      prototype_framework:
        | "mobile_expo_react_native"
        | "web_nextjs_react"
        | "web_vite_react"
      pull_request_status: "open" | "closed" | "merged"
      subscription_plan_type: "free" | "team" | "pro" | "plus" | "max"
      subscription_status: "active" | "past_due" | "canceled"
      team_invite_status: "pending" | "accepted" | "cancelled"
      team_role: "owner" | "admin" | "editor" | "viewer"
      team_setting_key: "block_public_prototypes"
      team_setting_value:
        | "team_setting_generic_value_true"
        | "team_setting_generic_value_false"
      tunnel_status: "creating" | "idle" | "allocated"
      visibility_level: "SELF" | "TEAM_SUBSET" | "TEAM" | "PUBLIC"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      chat_role: ["user", "assistant", "system"],
      connector_status: ["active", "disconnected", "token_expired"],
      design_style: ["tamagui", "stylesheets", "nativewind", "custom"],
      file_type: ["text", "asset"],
      prototype_backend_type: ["supabase"],
      prototype_build_status: ["in_progress", "success", "failure"],
      prototype_framework: [
        "mobile_expo_react_native",
        "web_nextjs_react",
        "web_vite_react",
      ],
      pull_request_status: ["open", "closed", "merged"],
      subscription_plan_type: ["free", "team", "pro", "plus", "max"],
      subscription_status: ["active", "past_due", "canceled"],
      team_invite_status: ["pending", "accepted", "cancelled"],
      team_role: ["owner", "admin", "editor", "viewer"],
      team_setting_key: ["block_public_prototypes"],
      team_setting_value: [
        "team_setting_generic_value_true",
        "team_setting_generic_value_false",
      ],
      tunnel_status: ["creating", "idle", "allocated"],
      visibility_level: ["SELF", "TEAM_SUBSET", "TEAM", "PUBLIC"],
    },
  },
} as const
