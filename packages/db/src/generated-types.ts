// Generated from a live local Supabase instance (migrations under
// supabase/migrations/ applied via `supabase db reset`) with
// `supabase gen types typescript --local`. Regenerate the same way after
// any schema change — do not hand-edit.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_tenants: {
        Row: {
          account_id: string
          created_at: string
          role: string
          tenant_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          role?: string
          tenant_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_accounts: {
        Row: {
          created_at: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      chat_history: {
        Row: {
          context_id: string
          context_type: string
          created_at: string
          direction: string
          id: string
          message_id: string
          payload: Json
          status: string
          wa_id: string
        }
        Insert: {
          context_id: string
          context_type: string
          created_at?: string
          direction: string
          id?: string
          message_id: string
          payload: Json
          status?: string
          wa_id: string
        }
        Update: {
          context_id?: string
          context_type?: string
          created_at?: string
          direction?: string
          id?: string
          message_id?: string
          payload?: Json
          status?: string
          wa_id?: string
        }
        Relationships: []
      }
      conversation_state: {
        Row: {
          context_id: string
          context_type: string
          current_state: string
          last_interaction: string
          pending_msg_id: string | null
          wa_id: string
        }
        Insert: {
          context_id: string
          context_type: string
          current_state?: string
          last_interaction?: string
          pending_msg_id?: string | null
          wa_id: string
        }
        Update: {
          context_id?: string
          context_type?: string
          current_state?: string
          last_interaction?: string
          pending_msg_id?: string | null
          wa_id?: string
        }
        Relationships: []
      }
      dashboard_notifications: {
        Row: {
          created_at: string
          id: string
          ref_id: string
          status: string
          tenant_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          ref_id: string
          status?: string
          tenant_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          ref_id?: string
          status?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_configs: {
        Row: {
          created_at: string
          draft_session_id: string
          field_values: Json
          id: string
          last_validation: Json | null
          lob_key: string | null
          selected_primitives: string[]
          version: number
        }
        Insert: {
          created_at?: string
          draft_session_id: string
          field_values?: Json
          id?: string
          last_validation?: Json | null
          lob_key?: string | null
          selected_primitives?: string[]
          version?: number
        }
        Update: {
          created_at?: string
          draft_session_id?: string
          field_values?: Json
          id?: string
          last_validation?: Json | null
          lob_key?: string | null
          selected_primitives?: string[]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_configs_draft_session_id_fkey"
            columns: ["draft_session_id"]
            isOneToOne: false
            referencedRelation: "draft_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_sessions: {
        Row: {
          confirmed: boolean
          created_at: string
          expires_at: string | null
          id: string
          lob_ambiguity_asked: boolean
          owner_contact: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          lob_ambiguity_asked?: boolean
          owner_contact?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          lob_ambiguity_asked?: boolean
          owner_contact?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "draft_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_wa_bindings: {
        Row: {
          compiled_config: Json
          created_at: string
          draft_session_id: string
          expires_at: string
          status: string
          token: string
          wa_id: string | null
        }
        Insert: {
          compiled_config: Json
          created_at?: string
          draft_session_id: string
          expires_at: string
          status?: string
          token: string
          wa_id?: string | null
        }
        Update: {
          compiled_config?: Json
          created_at?: string
          draft_session_id?: string
          expires_at?: string
          status?: string
          token?: string
          wa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "draft_wa_bindings_draft_session_id_fkey"
            columns: ["draft_session_id"]
            isOneToOne: false
            referencedRelation: "draft_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          context_id: string
          context_type: string
          created_at: string
          id: string
          status: string
          summary: string
          wa_id: string
        }
        Insert: {
          context_id: string
          context_type: string
          created_at?: string
          id?: string
          status?: string
          summary: string
          wa_id: string
        }
        Update: {
          context_id?: string
          context_type?: string
          created_at?: string
          id?: string
          status?: string
          summary?: string
          wa_id?: string
        }
        Relationships: []
      }
      tenant_configs: {
        Row: {
          compiled_at: string
          compiled_config: Json
          id: string
          source_draft_session_id: string | null
          tenant_id: string
          version: number
        }
        Insert: {
          compiled_at?: string
          compiled_config: Json
          id?: string
          source_draft_session_id?: string | null
          tenant_id: string
          version?: number
        }
        Update: {
          compiled_at?: string
          compiled_config?: Json
          id?: string
          source_draft_session_id?: string | null
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_configs_source_draft_session_id_fkey"
            columns: ["source_draft_session_id"]
            isOneToOne: false
            referencedRelation: "draft_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          bsp_provider: string | null
          created_at: string
          id: string
          name: string
          phone_number_id: string | null
          pricing_tier: string
          published_at: string | null
          status: string
        }
        Insert: {
          bsp_provider?: string | null
          created_at?: string
          id?: string
          name: string
          phone_number_id?: string | null
          pricing_tier?: string
          published_at?: string | null
          status?: string
        }
        Update: {
          bsp_provider?: string | null
          created_at?: string
          id?: string
          name?: string
          phone_number_id?: string | null
          pricing_tier?: string
          published_at?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

