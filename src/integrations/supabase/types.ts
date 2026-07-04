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
      curated_questions: {
        Row: {
          category: string
          correct_index: number
          created_at: string
          created_by: string | null
          difficulty: string
          explanation: string
          id: string
          options: Json
          question: string
          times_correct: number
          times_served: number
          type_theme: string | null
          verified: boolean
        }
        Insert: {
          category: string
          correct_index: number
          created_at?: string
          created_by?: string | null
          difficulty: string
          explanation: string
          id?: string
          options: Json
          question: string
          times_correct?: number
          times_served?: number
          type_theme?: string | null
          verified?: boolean
        }
        Update: {
          category?: string
          correct_index?: number
          created_at?: string
          created_by?: string | null
          difficulty?: string
          explanation?: string
          id?: string
          options?: Json
          question?: string
          times_correct?: number
          times_served?: number
          type_theme?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      daily_questions: {
        Row: {
          created_at: string
          date: string
          questions: Json
          served_ids: string[]
        }
        Insert: {
          created_at?: string
          date: string
          questions: Json
          served_ids?: string[]
        }
        Update: {
          created_at?: string
          date?: string
          questions?: Json
          served_ids?: string[]
        }
        Relationships: []
      }
      feedback: {
        Row: {
          app_version: string | null
          category: string
          contact: string | null
          created_at: string
          id: string
          message: string
          trainer_name: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          category: string
          contact?: string | null
          created_at?: string
          id?: string
          message: string
          trainer_name?: string | null
          user_id?: string
        }
        Update: {
          app_version?: string | null
          category?: string
          contact?: string | null
          created_at?: string
          id?: string
          message?: string
          trainer_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string
          from_id: string
          id: string
          responded_at: string | null
          status: string
          to_id: string
        }
        Insert: {
          created_at?: string
          from_id: string
          id?: string
          responded_at?: string | null
          status?: string
          to_id: string
        }
        Update: {
          created_at?: string
          from_id?: string
          id?: string
          responded_at?: string | null
          status?: string
          to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friends: {
        Row: {
          created_at: string
          friend_id: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          owner_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friends_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mega_event_questions: {
        Row: {
          event_id: string
          generated_at: string
          questions: Json
        }
        Insert: {
          event_id: string
          generated_at?: string
          questions: Json
        }
        Update: {
          event_id?: string
          generated_at?: string
          questions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "mega_event_questions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "mega_events"
            referencedColumns: ["id"]
          },
        ]
      }
      mega_events: {
        Row: {
          base_dex_id: number
          base_name: string
          champ_items: number
          champ_tp: number
          champ_xp: number
          created_at: string
          ends_at: string
          id: string
          mega_id: number
          name: string
          starts_at: string
          trophy_id: string
          trophy_name: string
          types: string[]
          win_items: number
          win_tp: number
          win_xp: number
        }
        Insert: {
          base_dex_id: number
          base_name: string
          champ_items?: number
          champ_tp?: number
          champ_xp?: number
          created_at?: string
          ends_at: string
          id: string
          mega_id: number
          name: string
          starts_at: string
          trophy_id: string
          trophy_name: string
          types: string[]
          win_items?: number
          win_tp?: number
          win_xp?: number
        }
        Update: {
          base_dex_id?: number
          base_name?: string
          champ_items?: number
          champ_tp?: number
          champ_xp?: number
          created_at?: string
          ends_at?: string
          id?: string
          mega_id?: number
          name?: string
          starts_at?: string
          trophy_id?: string
          trophy_name?: string
          types?: string[]
          win_items?: number
          win_tp?: number
          win_xp?: number
        }
        Relationships: []
      }
      mega_runs: {
        Row: {
          accuracy: number
          attempts: number
          correct: number
          event_id: string
          finished_at: string
          id: string
          level: number
          time_ms: number
          total: number
          trainer_name: string
          trainer_sprite: string
          user_id: string
        }
        Insert: {
          accuracy: number
          attempts?: number
          correct: number
          event_id: string
          finished_at?: string
          id?: string
          level: number
          time_ms: number
          total: number
          trainer_name: string
          trainer_sprite: string
          user_id: string
        }
        Update: {
          accuracy?: number
          attempts?: number
          correct?: number
          event_id?: string
          finished_at?: string
          id?: string
          level?: number
          time_ms?: number
          total?: number
          trainer_name?: string
          trainer_sprite?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mega_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "mega_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mega_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ace_pokemon_id: number | null
          created_at: string
          friend_code: string
          id: string
          last_daily_claim: string | null
          last_gift_claim: string | null
          last_mega_played: string | null
          last_reminder_sent: string | null
          last_weekly_attempt: string | null
          last_whos_that_played: string | null
          level: number
          pokedex_count: number
          trainer_name: string | null
          trainer_sprite: string
          updated_at: string
          xp: number
        }
        Insert: {
          ace_pokemon_id?: number | null
          created_at?: string
          friend_code: string
          id: string
          last_daily_claim?: string | null
          last_gift_claim?: string | null
          last_mega_played?: string | null
          last_reminder_sent?: string | null
          last_weekly_attempt?: string | null
          last_whos_that_played?: string | null
          level?: number
          pokedex_count?: number
          trainer_name?: string | null
          trainer_sprite?: string
          updated_at?: string
          xp?: number
        }
        Update: {
          ace_pokemon_id?: number | null
          created_at?: string
          friend_code?: string
          id?: string
          last_daily_claim?: string | null
          last_gift_claim?: string | null
          last_mega_played?: string | null
          last_reminder_sent?: string | null
          last_weekly_attempt?: string | null
          last_whos_that_played?: string | null
          level?: number
          pokedex_count?: number
          trainer_name?: string | null
          trainer_sprite?: string
          updated_at?: string
          xp?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      pvp_live_matches: {
        Row: {
          created_at: string
          expires_at: string
          guest_completed_at: string | null
          guest_correct: number | null
          guest_id: string
          guest_score: number | null
          guest_streak: number | null
          guest_time_ms: number | null
          guest_total: number | null
          host_completed_at: string | null
          host_correct: number | null
          host_id: string
          host_score: number | null
          host_streak: number | null
          host_time_ms: number | null
          host_total: number | null
          id: string
          questions: Json
          started_at: string
          status: string
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          guest_completed_at?: string | null
          guest_correct?: number | null
          guest_id: string
          guest_score?: number | null
          guest_streak?: number | null
          guest_time_ms?: number | null
          guest_total?: number | null
          host_completed_at?: string | null
          host_correct?: number | null
          host_id: string
          host_score?: number | null
          host_streak?: number | null
          host_time_ms?: number | null
          host_total?: number | null
          id?: string
          questions: Json
          started_at: string
          status?: string
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          guest_completed_at?: string | null
          guest_correct?: number | null
          guest_id?: string
          guest_score?: number | null
          guest_streak?: number | null
          guest_time_ms?: number | null
          guest_total?: number | null
          host_completed_at?: string | null
          host_correct?: number | null
          host_id?: string
          host_score?: number | null
          host_streak?: number | null
          host_time_ms?: number | null
          host_total?: number | null
          id?: string
          questions?: Json
          started_at?: string
          status?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pvp_live_matches_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvp_live_matches_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvp_live_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pvp_matches: {
        Row: {
          challenger_completed_at: string | null
          challenger_correct: number | null
          challenger_id: string
          challenger_score: number | null
          challenger_streak: number | null
          challenger_time_ms: number | null
          challenger_total: number | null
          created_at: string
          expires_at: string
          id: string
          opponent_completed_at: string | null
          opponent_correct: number | null
          opponent_id: string
          opponent_score: number | null
          opponent_streak: number | null
          opponent_time_ms: number | null
          opponent_total: number | null
          questions: Json
          status: string
          winner_id: string | null
        }
        Insert: {
          challenger_completed_at?: string | null
          challenger_correct?: number | null
          challenger_id: string
          challenger_score?: number | null
          challenger_streak?: number | null
          challenger_time_ms?: number | null
          challenger_total?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          opponent_completed_at?: string | null
          opponent_correct?: number | null
          opponent_id: string
          opponent_score?: number | null
          opponent_streak?: number | null
          opponent_time_ms?: number | null
          opponent_total?: number | null
          questions: Json
          status?: string
          winner_id?: string | null
        }
        Update: {
          challenger_completed_at?: string | null
          challenger_correct?: number | null
          challenger_id?: string
          challenger_score?: number | null
          challenger_streak?: number | null
          challenger_time_ms?: number | null
          challenger_total?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          opponent_completed_at?: string | null
          opponent_correct?: number | null
          opponent_id?: string
          opponent_score?: number | null
          opponent_streak?: number | null
          opponent_time_ms?: number | null
          opponent_total?: number | null
          questions?: Json
          status?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pvp_matches_challenger_id_fkey"
            columns: ["challenger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvp_matches_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pvp_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
          referrer_reward_claimed: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          referrer_reward_claimed?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          referrer_reward_claimed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_pending_referral_rewards: { Args: never; Returns: Json }
      claim_referral: { Args: { _code: string }; Returns: Json }
      claim_trainer_name: { Args: { _name: string }; Returns: Json }
      create_pvp_challenge: {
        Args: { _opponent_id: string; _questions: Json }
        Returns: Json
      }
      decline_pvp_challenge: { Args: { _match_id: string }; Returns: Json }
      forfeit_live_pvp_match: { Args: { _match_id: string }; Returns: Json }
      get_curated_questions: {
        Args: {
          p_count: number
          p_difficulties: string[]
          p_exclude?: string[]
          p_type_theme?: string
        }
        Returns: {
          category: string
          correct_index: number
          difficulty: string
          explanation: string
          id: string
          options: Json
          question: string
          type_theme: string
        }[]
      }
      get_mega_leaderboard: {
        Args: { p_event_id: string; p_limit?: number }
        Returns: {
          accuracy: number
          correct: number
          level: number
          time_ms: number
          total: number
          trainer_name: string
          trainer_sprite: string
          user_id: string
        }[]
      }
      get_mega_questions_public: { Args: { p_event_id: string }; Returns: Json }
      increment_curated_correct: {
        Args: { question_id: string }
        Returns: undefined
      }
      increment_curated_served: {
        Args: { question_ids: string[] }
        Returns: undefined
      }
      insert_daily_if_absent: {
        Args: { p_date: string; p_questions: Json; p_served_ids?: string[] }
        Returns: undefined
      }
      insert_mega_questions_if_absent: {
        Args: { p_event_id: string; p_questions: Json }
        Returns: undefined
      }
      is_trainer_name_available: { Args: { _name: string }; Returns: boolean }
      list_incoming_friend_requests: {
        Args: never
        Returns: {
          created_at: string
          friend_code: string
          from_id: string
          level: number
          request_id: string
          trainer_name: string
          trainer_sprite: string
        }[]
      }
      lookup_profile_by_code: {
        Args: { _code: string }
        Returns: {
          ace_pokemon_id: number | null
          created_at: string
          friend_code: string
          id: string
          last_daily_claim: string | null
          last_gift_claim: string | null
          last_mega_played: string | null
          last_reminder_sent: string | null
          last_weekly_attempt: string | null
          last_whos_that_played: string | null
          level: number
          pokedex_count: number
          trainer_name: string | null
          trainer_sprite: string
          updated_at: string
          xp: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_pvp_invites: {
        Args: never
        Returns: {
          challenger_completed_at: string | null
          challenger_correct: number | null
          challenger_id: string
          challenger_score: number | null
          challenger_streak: number | null
          challenger_time_ms: number | null
          challenger_total: number | null
          created_at: string
          expires_at: string
          id: string
          opponent_completed_at: string | null
          opponent_correct: number | null
          opponent_id: string
          opponent_score: number | null
          opponent_streak: number | null
          opponent_time_ms: number | null
          opponent_total: number | null
          questions: Json
          status: string
          winner_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "pvp_matches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_pvp_matches: {
        Args: never
        Returns: {
          challenger_completed_at: string | null
          challenger_correct: number | null
          challenger_id: string
          challenger_score: number | null
          challenger_streak: number | null
          challenger_time_ms: number | null
          challenger_total: number | null
          created_at: string
          expires_at: string
          id: string
          opponent_completed_at: string | null
          opponent_correct: number | null
          opponent_id: string
          opponent_score: number | null
          opponent_streak: number | null
          opponent_time_ms: number | null
          opponent_total: number | null
          questions: Json
          status: string
          winner_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "pvp_matches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_pending_request_targets: { Args: never; Returns: string[] }
      pick_battle_curated: {
        Args: { p_count: number; p_difficulty: string; p_exclude?: string[] }
        Returns: {
          category: string
          correct_index: number
          explanation: string
          id: string
          options: Json
          question: string
        }[]
      }
      pick_daily_curated: {
        Args: { p_easy?: number; p_medium?: number; p_window?: number }
        Returns: {
          category: string
          correct_index: number
          explanation: string
          id: string
          options: Json
          question: string
        }[]
      }
      respond_friend_request: {
        Args: { _accept: boolean; _request_id: string }
        Returns: Json
      }
      reveal_mega_answer: {
        Args: { p_event_id: string; p_q_index: number }
        Returns: Json
      }
      send_friend_request: { Args: { _code: string }; Returns: Json }
      send_friend_request_by_id: { Args: { _target: string }; Returns: Json }
      start_live_pvp_match: {
        Args: { _opponent_code: string; _questions: Json }
        Returns: Json
      }
      submit_live_pvp_result: {
        Args: {
          _correct: number
          _match_id: string
          _max_streak: number
          _time_ms: number
          _total: number
        }
        Returns: Json
      }
      submit_mega_run: {
        Args: {
          p_accuracy: number
          p_correct: number
          p_event_id: string
          p_time_ms: number
          p_total: number
        }
        Returns: {
          accuracy: number
          attempts: number
          correct: number
          event_id: string
          finished_at: string
          id: string
          level: number
          time_ms: number
          total: number
          trainer_name: string
          trainer_sprite: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "mega_runs"
          isOneToOne: true
          isSetofReturn: false
        }
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
    ? DefaultSchema["Enums"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
