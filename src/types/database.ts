// Типы схемы Supabase проекта «Эннеаграмма.one».
// Сгенерировано командой (перегенерировать после КАЖДОЙ миграции):
//   $env:SUPABASE_ACCESS_TOKEN = "<personal access token>"
//   npx supabase gen types typescript --project-id ziukaapuxykwybjpljjg > src/types/database.ts
//
// Литеральные union-типы для CHECK-констрейнтов (LeadSource, EventType и т.д.) —
// в src/types/domain.ts, этот файл их не содержит и перезаписывается генератором целиком.

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
    PostgrestVersion: "14.15"
  }
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
      club_subscriptions: {
        Row: {
          canceled_at: string | null
          created_at: string | null
          current_period_end: string
          customer_phone: string | null
          grace_until: string | null
          id: string
          is_founder_price: boolean
          lead_id: string
          price_kopecks: number
          prodamus_subscription_id: string | null
          salebot_subscriber_id: string | null
          started_at: string
          status: string
          updated_at: string | null
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string | null
          current_period_end: string
          customer_phone?: string | null
          grace_until?: string | null
          id?: string
          is_founder_price?: boolean
          lead_id: string
          price_kopecks: number
          prodamus_subscription_id?: string | null
          salebot_subscriber_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string
          customer_phone?: string | null
          grace_until?: string | null
          id?: string
          is_founder_price?: boolean
          lead_id?: string
          price_kopecks?: number
          prodamus_subscription_id?: string | null
          salebot_subscriber_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_subscriptions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          lead_id: string | null
          metadata: Json | null
          salebot_event_id: string | null
          session_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          salebot_event_id?: string | null
          session_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          salebot_event_id?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          consent_152fz: boolean
          consent_at: string | null
          created_at: string | null
          email: string | null
          enneagram_type: number | null
          full_name: string | null
          id: string
          phone: string | null
          source: string
          subscribed_telegram: boolean
          telegram_id: number | null
          telegram_username: string | null
          updated_at: string | null
          wing: number | null
        }
        Insert: {
          consent_152fz?: boolean
          consent_at?: string | null
          created_at?: string | null
          email?: string | null
          enneagram_type?: number | null
          full_name?: string | null
          id?: string
          phone?: string | null
          source?: string
          subscribed_telegram?: boolean
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string | null
          wing?: number | null
        }
        Update: {
          consent_152fz?: boolean
          consent_at?: string | null
          created_at?: string | null
          email?: string | null
          enneagram_type?: number | null
          full_name?: string | null
          id?: string
          phone?: string | null
          source?: string
          subscribed_telegram?: boolean
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string | null
          wing?: number | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_kopecks: number
          created_at: string | null
          id: string
          idempotence_key: string
          lead_id: string
          product_type: string
          provider: string
          provider_payment_id: string | null
          raw_webhook: Json | null
          status: string
          subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount_kopecks: number
          created_at?: string | null
          id?: string
          idempotence_key: string
          lead_id: string
          product_type: string
          provider?: string
          provider_payment_id?: string | null
          raw_webhook?: Json | null
          status?: string
          subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_kopecks?: number
          created_at?: string | null
          id?: string
          idempotence_key?: string
          lead_id?: string
          product_type?: string
          provider?: string
          provider_payment_id?: string | null
          raw_webhook?: Json | null
          status?: string
          subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "club_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string
          id: string
          role?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      telegram_access_grants: {
        Row: {
          chat_id: number | null
          created_at: string | null
          granted_at: string | null
          id: string
          lead_id: string
          revoked_at: string | null
          status: string
          subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          chat_id?: number | null
          created_at?: string | null
          granted_at?: string | null
          id?: string
          lead_id: string
          revoked_at?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          chat_id?: number | null
          created_at?: string | null
          granted_at?: string | null
          id?: string
          lead_id?: string
          revoked_at?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_access_grants_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_access_grants_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "club_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      test_sessions: {
        Row: {
          answers: Json
          axis_scores: Json | null
          created_at: string | null
          id: string
          lead_id: string | null
          result: Json | null
          status: string
          updated_at: string | null
          version: string
        }
        Insert: {
          answers?: Json
          axis_scores?: Json | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          result?: Json | null
          status?: string
          updated_at?: string | null
          version?: string
        }
        Update: {
          answers?: Json
          axis_scores?: Json | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          result?: Json | null
          status?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      type_descriptions: {
        Row: {
          center: string
          harmonic_triad: string
          portrait_md: string
          short_summary: string
          social_triad: string
          title: string
          type: number
          updated_at: string | null
          wings: Json | null
        }
        Insert: {
          center: string
          harmonic_triad: string
          portrait_md: string
          short_summary: string
          social_triad: string
          title: string
          type: number
          updated_at?: string | null
          wings?: Json | null
        }
        Update: {
          center?: string
          harmonic_triad?: string
          portrait_md?: string
          short_summary?: string
          social_triad?: string
          title?: string
          type?: number
          updated_at?: string | null
          wings?: Json | null
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          created_at: string | null
          deposit_payment_id: string | null
          deposit_status: string
          id: string
          lead_id: string
          note: string | null
          tier_interest: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deposit_payment_id?: string | null
          deposit_status?: string
          id?: string
          lead_id: string
          note?: string | null
          tier_interest: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deposit_payment_id?: string | null
          deposit_status?: string
          id?: string
          lead_id?: string
          note?: string | null
          tier_interest?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_deposit_payment_id_fkey"
            columns: ["deposit_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
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
