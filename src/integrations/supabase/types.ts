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
      daily_usage: {
        Row: {
          id: string
          user_id: string
          feature: string
          usage_date: string
          count: number
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          feature: string
          usage_date?: string
          count?: number
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          feature?: string
          usage_date?: string
          count?: number
          updated_at?: string
        }
        Relationships: []
      }
      chat_history: {
        Row: {
          created_at: string
          id: string
          messages: Json
          provider: string | null
          subject: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          provider?: string | null
          subject?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          provider?: string | null
          subject?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      flashcards: {
        Row: {
          cards: Json
          created_at: string
          id: string
          topic: string | null
          user_id: string
        }
        Insert: {
          cards?: Json
          created_at?: string
          id?: string
          topic?: string | null
          user_id: string
        }
        Update: {
          cards?: Json
          created_at?: string
          id?: string
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      generated_images: {
        Row: {
          created_at: string
          enhanced_prompt: string | null
          id: string
          image_url: string | null
          prompt: string | null
          style: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          enhanced_prompt?: string | null
          id?: string
          image_url?: string | null
          prompt?: string | null
          style?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          enhanced_prompt?: string | null
          id?: string
          image_url?: string | null
          prompt?: string | null
          style?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mindmaps: {
        Row: {
          created_at: string
          id: string
          map_data: Json | null
          topic: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          map_data?: Json | null
          topic?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          map_data?: Json | null
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          content: string | null
          created_at: string
          id: string
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quiz_results: {
        Row: {
          created_at: string
          difficulty: string | null
          id: string
          percentage: number | null
          questions: Json
          score: number | null
          topic: string | null
          total: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: string | null
          id?: string
          percentage?: number | null
          questions?: Json
          score?: number | null
          topic?: string | null
          total?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: string | null
          id?: string
          percentage?: number | null
          questions?: Json
          score?: number | null
          topic?: string | null
          total?: number | null
          user_id?: string
        }
        Relationships: []
      }
      summaries: {
        Row: {
          created_at: string
          exam_questions: Json
          id: string
          key_points: Json
          original_text: string | null
          source_type: string | null
          summary: string | null
          user_id: string
          vocabulary: Json
        }
        Insert: {
          created_at?: string
          exam_questions?: Json
          id?: string
          key_points?: Json
          original_text?: string | null
          source_type?: string | null
          summary?: string | null
          user_id: string
          vocabulary?: Json
        }
        Update: {
          created_at?: string
          exam_questions?: Json
          id?: string
          key_points?: Json
          original_text?: string | null
          source_type?: string | null
          summary?: string | null
          user_id?: string
          vocabulary?: Json
        }
        Relationships: []
      }
      translations: {
        Row: {
          created_at: string
          id: string
          original_text: string | null
          source_language: string | null
          target_language: string | null
          translated_text: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          original_text?: string | null
          source_language?: string | null
          target_language?: string | null
          translated_text?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          original_text?: string | null
          source_language?: string | null
          target_language?: string | null
          translated_text?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          id: string
          last_active: string
          study_streak: number
          total_chats: number
          total_images: number
          total_notes: number
          total_quizzes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_active?: string
          study_streak?: number
          total_chats?: number
          total_images?: number
          total_notes?: number
          total_quizzes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_active?: string
          study_streak?: number
          total_chats?: number
          total_images?: number
          total_notes?: number
          total_quizzes?: number
          updated_at?: string
          user_id?: string
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
  public: {
    Enums: {},
  },
} as const
