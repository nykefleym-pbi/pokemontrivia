export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      curated_questions: {
        Row: {
          category: string;
          correct_index: number;
          created_at: string;
          created_by: string | null;
          difficulty: string;
          explanation: string;
          id: string;
          options: Json;
          question: string;
          times_correct: number;
          times_served: number;
          type_theme: string | null;
          verified: boolean;
        };
        Insert: {
          category: string;
          correct_index: number;
          created_at?: string;
          created_by?: string | null;
          difficulty: string;
          explanation: string;
          id?: string;
          options: Json;
          question: string;
          times_correct?: number;
          times_served?: number;
          type_theme?: string | null;
          verified?: boolean;
        };
        Update: {
          category?: string;
          correct_index?: number;
          created_at?: string;
          created_by?: string | null;
          difficulty?: string;
          explanation?: string;
          id?: string;
          options?: Json;
          question?: string;
          times_correct?: number;
          times_served?: number;
          type_theme?: string | null;
          verified?: boolean;
        };
        Relationships: [];
      };
      friend_requests: {
        Row: {
          created_at: string;
          from_id: string;
          id: string;
          responded_at: string | null;
          status: string;
          to_id: string;
        };
        Insert: {
          created_at?: string;
          from_id: string;
          id?: string;
          responded_at?: string | null;
          status?: string;
          to_id: string;
        };
        Update: {
          created_at?: string;
          from_id?: string;
          id?: string;
          responded_at?: string | null;
          status?: string;
          to_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friend_requests_from_id_fkey";
            columns: ["from_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friend_requests_to_id_fkey";
            columns: ["to_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      friends: {
        Row: {
          created_at: string;
          friend_id: string;
          owner_id: string;
        };
        Insert: {
          created_at?: string;
          friend_id: string;
          owner_id: string;
        };
        Update: {
          created_at?: string;
          friend_id?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friends_friend_id_fkey";
            columns: ["friend_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mega_event_questions: {
        Row: {
          event_id: string;
          generated_at: string;
          questions: Json;
        };
        Insert: {
          event_id: string;
          generated_at?: string;
          questions: Json;
        };
        Update: {
          event_id?: string;
          generated_at?: string;
          questions?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "mega_event_questions_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "mega_events";
            referencedColumns: ["id"];
          },
        ];
      };
      mega_events: {
        Row: {
          base_dex_id: number;
          base_name: string;
          champ_items: number;
          champ_tp: number;
          champ_xp: number;
          created_at: string;
          ends_at: string;
          id: string;
          mega_id: number;
          name: string;
          starts_at: string;
          trophy_id: string;
          trophy_name: string;
          types: string[];
          win_items: number;
          win_tp: number;
          win_xp: number;
        };
        Insert: {
          base_dex_id: number;
          base_name: string;
          champ_items?: number;
          champ_tp?: number;
          champ_xp?: number;
          created_at?: string;
          ends_at: string;
          id: string;
          mega_id: number;
          name: string;
          starts_at: string;
          trophy_id: string;
          trophy_name: string;
          types: string[];
          win_items?: number;
          win_tp?: number;
          win_xp?: number;
        };
        Update: {
          base_dex_id?: number;
          base_name?: string;
          champ_items?: number;
          champ_tp?: number;
          champ_xp?: number;
          created_at?: string;
          ends_at?: string;
          id?: string;
          mega_id?: number;
          name?: string;
          starts_at?: string;
          trophy_id?: string;
          trophy_name?: string;
          types?: string[];
          win_items?: number;
          win_tp?: number;
          win_xp?: number;
        };
        Relationships: [];
      };
      mega_runs: {
        Row: {
          accuracy: number;
          attempts: number;
          correct: number;
          event_id: string;
          finished_at: string;
          id: string;
          level: number;
          time_ms: number;
          total: number;
          trainer_name: string;
          trainer_sprite: string;
          user_id: string;
        };
        Insert: {
          accuracy: number;
          attempts?: number;
          correct: number;
          event_id: string;
          finished_at?: string;
          id?: string;
          level: number;
          time_ms: number;
          total: number;
          trainer_name: string;
          trainer_sprite: string;
          user_id: string;
        };
        Update: {
          accuracy?: number;
          attempts?: number;
          correct?: number;
          event_id?: string;
          finished_at?: string;
          id?: string;
          level?: number;
          time_ms?: number;
          total?: number;
          trainer_name?: string;
          trainer_sprite?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mega_runs_event_fk";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "mega_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mega_runs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          ace_pokemon_id: number | null;
          created_at: string;
          friend_code: string;
          id: string;
          level: number;
          pokedex_count: number;
          trainer_name: string | null;
          trainer_sprite: string;
          updated_at: string;
          xp: number;
        };
        Insert: {
          ace_pokemon_id?: number | null;
          created_at?: string;
          friend_code: string;
          id: string;
          level?: number;
          pokedex_count?: number;
          trainer_name?: string | null;
          trainer_sprite?: string;
          updated_at?: string;
          xp?: number;
        };
        Update: {
          ace_pokemon_id?: number | null;
          created_at?: string;
          friend_code?: string;
          id?: string;
          level?: number;
          pokedex_count?: number;
          trainer_name?: string | null;
          trainer_sprite?: string;
          updated_at?: string;
          xp?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      check_curated_answer: {
        Args: { _chosen_index: number; _question_id: string };
        Returns: Json;
      };
      claim_trainer_name: { Args: { _name: string }; Returns: Json };
      get_curated_questions: {
        Args: {
          _category?: string;
          _difficulty?: string;
          _exclude?: string[];
          _limit?: number;
          _type_theme?: string;
        };
        Returns: {
          category: string;
          difficulty: string;
          id: string;
          options: Json;
          question: string;
          type_theme: string;
        }[];
      };
      get_mega_leaderboard: {
        Args: { p_event_id: string; p_limit?: number };
        Returns: {
          accuracy: number;
          attempts: number;
          correct: number;
          finished_at: string;
          level: number;
          time_ms: number;
          total: number;
          trainer_name: string;
          trainer_sprite: string;
          user_id: string;
        }[];
      };
      get_mega_questions_public: { Args: { p_event_id: string }; Returns: Json };
      increment_curated_correct: {
        Args: { question_id: string };
        Returns: undefined;
      };
      increment_curated_served: {
        Args: { question_ids: string[] };
        Returns: undefined;
      };
      insert_mega_questions_if_absent: {
        Args: { p_event_id: string; p_questions: Json };
        Returns: undefined;
      };
      is_trainer_name_available: { Args: { _name: string }; Returns: boolean };
      list_incoming_friend_requests: {
        Args: never;
        Returns: {
          created_at: string;
          friend_code: string;
          from_id: string;
          level: number;
          request_id: string;
          trainer_name: string;
          trainer_sprite: string;
        }[];
      };
      lookup_profile_by_code: {
        Args: { _code: string };
        Returns: {
          ace_pokemon_id: number | null;
          created_at: string;
          friend_code: string;
          id: string;
          level: number;
          pokedex_count: number;
          trainer_name: string | null;
          trainer_sprite: string;
          updated_at: string;
          xp: number;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      respond_friend_request: {
        Args: { _accept: boolean; _request_id: string };
        Returns: Json;
      };
      reveal_mega_answer: {
        Args: { p_event_id: string; p_q_index: number };
        Returns: Json;
      };
      send_friend_request: { Args: { _code: string }; Returns: Json };
      submit_mega_run: {
        Args: {
          p_accuracy: number;
          p_correct: number;
          p_event_id: string;
          p_time_ms: number;
          p_total: number;
        };
        Returns: {
          accuracy: number;
          attempts: number;
          correct: number;
          event_id: string;
          finished_at: string;
          id: string;
          level: number;
          time_ms: number;
          total: number;
          trainer_name: string;
          trainer_sprite: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "mega_runs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
