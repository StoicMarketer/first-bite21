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
      alarms: {
        Row: {
          alarm_time: string
          id: string
          is_active: boolean
          last_fired_at: string | null
          last_fired_on: string | null
          next_trigger_at: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alarm_time?: string
          id?: string
          is_active?: boolean
          last_fired_at?: string | null
          last_fired_on?: string | null
          next_trigger_at?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alarm_time?: string
          id?: string
          is_active?: boolean
          last_fired_at?: string | null
          last_fired_on?: string | null
          next_trigger_at?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      channel_messages: {
        Row: {
          audio_path: string | null
          channel_id: string
          created_at: string
          fanned_out: boolean
          id: string
          kind: string
          sender_id: string
          text_content: string | null
        }
        Insert: {
          audio_path?: string | null
          channel_id: string
          created_at?: string
          fanned_out?: boolean
          id?: string
          kind: string
          sender_id: string
          text_content?: string | null
        }
        Update: {
          audio_path?: string | null
          channel_id?: string
          created_at?: string
          fanned_out?: boolean
          id?: string
          kind?: string
          sender_id?: string
          text_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_subscriptions: {
        Row: {
          allow_receive: boolean
          allow_send: boolean
          channel_id: string
          joined_at: string
          share_wake_code: boolean
          user_id: string
        }
        Insert: {
          allow_receive?: boolean
          allow_send?: boolean
          channel_id: string
          joined_at?: string
          share_wake_code?: boolean
          user_id: string
        }
        Update: {
          allow_receive?: boolean
          allow_send?: boolean
          channel_id?: string
          joined_at?: string
          share_wake_code?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_subscriptions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          cover_emoji: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          invite_code: string | null
          is_official: boolean
          max_members: number
          name: string
          slug: string
          tone_prompt: string
          updated_at: string
          visibility: string
          voice: string
        }
        Insert: {
          cover_emoji?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invite_code?: string | null
          is_official?: boolean
          max_members?: number
          name: string
          slug: string
          tone_prompt: string
          updated_at?: string
          visibility?: string
          voice?: string
        }
        Update: {
          cover_emoji?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invite_code?: string | null
          is_official?: boolean
          max_members?: number
          name?: string
          slug?: string
          tone_prompt?: string
          updated_at?: string
          visibility?: string
          voice?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          audio_path: string | null
          channel_id: string | null
          created_at: string
          id: string
          is_ai: boolean
          is_played: boolean
          kind: Database["public"]["Enums"]["message_kind"]
          played_at: string | null
          played_on_date: string | null
          receiver_id: string
          saved_by_receiver: boolean
          scheduled_for: string
          sender_id: string
          text_content: string | null
        }
        Insert: {
          audio_path?: string | null
          channel_id?: string | null
          created_at?: string
          id?: string
          is_ai?: boolean
          is_played?: boolean
          kind: Database["public"]["Enums"]["message_kind"]
          played_at?: string | null
          played_on_date?: string | null
          receiver_id: string
          saved_by_receiver?: boolean
          scheduled_for: string
          sender_id: string
          text_content?: string | null
        }
        Update: {
          audio_path?: string | null
          channel_id?: string | null
          created_at?: string
          id?: string
          is_ai?: boolean
          is_played?: boolean
          kind?: Database["public"]["Enums"]["message_kind"]
          played_at?: string | null
          played_on_date?: string | null
          receiver_id?: string
          saved_by_receiver?: boolean
          scheduled_for?: string
          sender_id?: string
          text_content?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birthdate: string | null
          birthday_unlimited: boolean
          created_at: string
          display_name: string | null
          id: string
          last_send_date: string | null
          streak_count: number
          timezone: string
          updated_at: string
          username: string
          wake_code: string
        }
        Insert: {
          avatar_url?: string | null
          birthdate?: string | null
          birthday_unlimited?: boolean
          created_at?: string
          display_name?: string | null
          id: string
          last_send_date?: string | null
          streak_count?: number
          timezone?: string
          updated_at?: string
          username: string
          wake_code?: string
        }
        Update: {
          avatar_url?: string | null
          birthdate?: string | null
          birthday_unlimited?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          last_send_date?: string | null
          streak_count?: number
          timezone?: string
          updated_at?: string
          username?: string
          wake_code?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reactions: {
        Row: {
          audio_path: string | null
          created_at: string
          emoji: string | null
          id: string
          message_id: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          audio_path?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          message_id: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          audio_path?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          message_id?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fanout_channel_messages: { Args: never; Returns: number }
      generate_channel_invite_code: { Args: never; Returns: string }
      generate_wake_code: { Args: never; Returns: string }
      join_channel_by_invite: { Args: { _code: string }; Returns: string }
      lookup_by_username: {
        Args: { _username: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          username: string
        }[]
      }
      lookup_by_wake_code: {
        Args: { _code: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          username: string
          wake_code: string
        }[]
      }
      lookup_channel_by_invite: {
        Args: { _code: string }
        Returns: {
          cover_emoji: string
          description: string
          id: string
          is_official: boolean
          member_count: number
          name: string
          slug: string
          visibility: string
        }[]
      }
      regenerate_my_wake_code: { Args: never; Returns: string }
      update_my_username: { Args: { _username: string }; Returns: string }
    }
    Enums: {
      friendship_status: "pending" | "accepted" | "blocked"
      message_kind: "audio" | "text"
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
      friendship_status: ["pending", "accepted", "blocked"],
      message_kind: ["audio", "text"],
    },
  },
} as const
