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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assigned_name_mappings: {
        Row: {
          created_at: string
          id: string
          normalized_team_member_name: string | null
          notes: string | null
          raw_assigned_id: string | null
          raw_assigned_name: string | null
          source_name: string
          team_member_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          normalized_team_member_name?: string | null
          notes?: string | null
          raw_assigned_id?: string | null
          raw_assigned_name?: string | null
          source_name: string
          team_member_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          normalized_team_member_name?: string | null
          notes?: string | null
          raw_assigned_id?: string | null
          raw_assigned_name?: string | null
          source_name?: string
          team_member_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assigned_name_mappings_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          account_type: string | null
          active_status: boolean | null
          airtable_record_id: string | null
          care_plan_type: string | null
          company_name: string | null
          created_at: string
          external_company_id: string | null
          id: string
          monthly_included_hours: number
          notes: string | null
          source_name: string
          updated_at: string
          website: string | null
        }
        Insert: {
          account_type?: string | null
          active_status?: boolean | null
          airtable_record_id?: string | null
          care_plan_type?: string | null
          company_name?: string | null
          created_at?: string
          external_company_id?: string | null
          id?: string
          monthly_included_hours?: number
          notes?: string | null
          source_name: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_type?: string | null
          active_status?: boolean | null
          airtable_record_id?: string | null
          care_plan_type?: string | null
          company_name?: string | null
          created_at?: string
          external_company_id?: string | null
          id?: string
          monthly_included_hours?: number
          notes?: string | null
          source_name?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      integration_connections: {
        Row: {
          api_key_or_token: string | null
          auth_type: string | null
          base_url: string | null
          created_at: string
          history_imported_through: string | null
          id: string
          is_enabled: boolean
          last_sync_at: string | null
          last_tested_at: string | null
          notes: string | null
          source_name: string
          status: string | null
          sync_window_days: number
          updated_at: string
        }
        Insert: {
          api_key_or_token?: string | null
          auth_type?: string | null
          base_url?: string | null
          created_at?: string
          history_imported_through?: string | null
          id?: string
          is_enabled?: boolean
          last_sync_at?: string | null
          last_tested_at?: string | null
          notes?: string | null
          source_name: string
          status?: string | null
          sync_window_days?: number
          updated_at?: string
        }
        Update: {
          api_key_or_token?: string | null
          auth_type?: string | null
          base_url?: string | null
          created_at?: string
          history_imported_through?: string | null
          id?: string
          is_enabled?: boolean
          last_sync_at?: string | null
          last_tested_at?: string | null
          notes?: string | null
          source_name?: string
          status?: string | null
          sync_window_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      reporting_settings: {
        Row: {
          created_at: string
          default_date_range: string
          id: string
          reportable_time_mode: Database["public"]["Enums"]["reportable_time_mode"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_date_range?: string
          id?: string
          reportable_time_mode?: Database["public"]["Enums"]["reportable_time_mode"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_date_range?: string
          id?: string
          reportable_time_mode?: Database["public"]["Enums"]["reportable_time_mode"]
          updated_at?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          created_at: string
          cursor: Json | null
          error_count: number | null
          error_details: Json | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          progress_message: string | null
          records_created: number | null
          records_received: number | null
          records_updated: number | null
          since_at: string | null
          source_name: string
          stage: string | null
          stage_page: number
          started_at: string
          status: string
          sync_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cursor?: Json | null
          error_count?: number | null
          error_details?: Json | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          progress_message?: string | null
          records_created?: number | null
          records_received?: number | null
          records_updated?: number | null
          since_at?: string | null
          source_name: string
          stage?: string | null
          stage_page?: number
          started_at?: string
          status?: string
          sync_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cursor?: Json | null
          error_count?: number | null
          error_details?: Json | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          progress_message?: string | null
          records_created?: number | null
          records_received?: number | null
          records_updated?: number | null
          since_at?: string | null
          source_name?: string
          stage?: string | null
          stage_page?: number
          started_at?: string
          status?: string
          sync_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      tag_time_rules: {
        Row: {
          active_status: boolean
          created_at: string
          hours_value: number
          id: string
          notes: string | null
          stacking_priority: number
          tag_name: string
          updated_at: string
        }
        Insert: {
          active_status?: boolean
          created_at?: string
          hours_value?: number
          id?: string
          notes?: string | null
          stacking_priority?: number
          tag_name: string
          updated_at?: string
        }
        Update: {
          active_status?: boolean
          created_at?: string
          hours_value?: number
          id?: string
          notes?: string | null
          stacking_priority?: number
          tag_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          active_status: boolean
          billable_rate: number
          created_at: string
          department: string | null
          hourly_cost_rate: number
          id: string
          name: string
          notes: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          active_status?: boolean
          billable_rate?: number
          created_at?: string
          department?: string | null
          hourly_cost_rate?: number
          id?: string
          name: string
          notes?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          active_status?: boolean
          billable_rate?: number
          created_at?: string
          department?: string | null
          hourly_cost_rate?: number
          id?: string
          name?: string
          notes?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          actual_logged_time: number | null
          assigned_external_id: string | null
          assigned_name_raw: string | null
          assigned_team_member_id: string | null
          billable_value: number
          calculated_tag_time: number
          closed_at_source: string | null
          company_name: string | null
          created_at: string
          created_at_source: string | null
          customer_name: string | null
          external_company_id: string | null
          external_ticket_id: string
          final_reportable_time: number
          id: string
          inbox: string | null
          labor_cost: number
          raw_payload: Json | null
          source_system: string
          status: string | null
          tags: string[] | null
          ticket_title: string | null
          ticket_url: string | null
          type: string | null
          updated_at: string
          updated_at_source: string | null
        }
        Insert: {
          actual_logged_time?: number | null
          assigned_external_id?: string | null
          assigned_name_raw?: string | null
          assigned_team_member_id?: string | null
          billable_value?: number
          calculated_tag_time?: number
          closed_at_source?: string | null
          company_name?: string | null
          created_at?: string
          created_at_source?: string | null
          customer_name?: string | null
          external_company_id?: string | null
          external_ticket_id: string
          final_reportable_time?: number
          id?: string
          inbox?: string | null
          labor_cost?: number
          raw_payload?: Json | null
          source_system: string
          status?: string | null
          tags?: string[] | null
          ticket_title?: string | null
          ticket_url?: string | null
          type?: string | null
          updated_at?: string
          updated_at_source?: string | null
        }
        Update: {
          actual_logged_time?: number | null
          assigned_external_id?: string | null
          assigned_name_raw?: string | null
          assigned_team_member_id?: string | null
          billable_value?: number
          calculated_tag_time?: number
          closed_at_source?: string | null
          company_name?: string | null
          created_at?: string
          created_at_source?: string | null
          customer_name?: string | null
          external_company_id?: string | null
          external_ticket_id?: string
          final_reportable_time?: number
          id?: string
          inbox?: string | null
          labor_cost?: number
          raw_payload?: Json | null
          source_system?: string
          status?: string | null
          tags?: string[] | null
          ticket_title?: string | null
          ticket_url?: string | null
          type?: string | null
          updated_at?: string
          updated_at_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_team_member_id_fkey"
            columns: ["assigned_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      time_logs: {
        Row: {
          created_at: string
          external_entry_id: string
          external_ticket_id: string
          hours: number
          logged_at: string | null
          source_name: string
        }
        Insert: {
          created_at?: string
          external_entry_id: string
          external_ticket_id: string
          hours?: number
          logged_at?: string | null
          source_name: string
        }
        Update: {
          created_at?: string
          external_entry_id?: string
          external_ticket_id?: string
          hours?: number
          logged_at?: string | null
          source_name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_time_logs: { Args: { _source: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recalc_tickets: {
        Args: { _source?: string }
        Returns: {
          processed: number
          unmapped: number
        }[]
      }
      report_by_company: {
        Args: {
          _company?: string
          _date_from?: string
          _date_to?: string
          _inbox?: string
          _member?: string
          _source?: string
          _status?: string
          _tag?: string
          _type?: string
        }
        Returns: Json
      }
      report_by_team_member: {
        Args: {
          _company?: string
          _date_from?: string
          _date_to?: string
          _inbox?: string
          _member?: string
          _source?: string
          _status?: string
          _tag?: string
          _type?: string
        }
        Returns: Json
      }
      report_summary: {
        Args: {
          _company?: string
          _date_from?: string
          _date_to?: string
          _inbox?: string
          _member?: string
          _source?: string
          _status?: string
          _tag?: string
          _type?: string
        }
        Returns: Json
      }
      report_trends: {
        Args: {
          _company?: string
          _date_from?: string
          _date_to?: string
          _granularity?: string
          _inbox?: string
          _member?: string
          _source?: string
          _status?: string
          _tag?: string
          _type?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
      reportable_time_mode:
        | "actual_only"
        | "tag_only"
        | "greater_of_actual_or_tag"
        | "actual_plus_tag"
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
      app_role: ["admin", "user"],
      reportable_time_mode: [
        "actual_only",
        "tag_only",
        "greater_of_actual_or_tag",
        "actual_plus_tag",
      ],
    },
  },
} as const
