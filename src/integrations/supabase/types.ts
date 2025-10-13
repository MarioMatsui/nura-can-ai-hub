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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      conversations: {
        Row: {
          created_at: string
          id: string
          model_type: Database["public"]["Enums"]["ai_model_type"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          model_type?: Database["public"]["Enums"]["ai_model_type"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          model_type?: Database["public"]["Enums"]["ai_model_type"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      document_blocks: {
        Row: {
          bbox: Json | null
          block_id: string
          block_type: string
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          markdown: string | null
          page_number: number
          section_title: string | null
          token_count: number | null
        }
        Insert: {
          bbox?: Json | null
          block_id: string
          block_type: string
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          markdown?: string | null
          page_number: number
          section_title?: string | null
          token_count?: number | null
        }
        Update: {
          bbox?: Json | null
          block_id?: string
          block_type?: string
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          markdown?: string | null
          page_number?: number
          section_title?: string | null
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_blocks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          block_ids: string[] | null
          chunk_order: number
          chunk_type: string | null
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          hash: string | null
          id: string
          is_atomic: boolean | null
          page_range: string | null
        }
        Insert: {
          block_ids?: string[] | null
          chunk_order: number
          chunk_type?: string | null
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          hash?: string | null
          id?: string
          is_atomic?: boolean | null
          page_range?: string | null
        }
        Update: {
          block_ids?: string[] | null
          chunk_order?: number
          chunk_type?: string | null
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          hash?: string | null
          id?: string
          is_atomic?: boolean | null
          page_range?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_images: {
        Row: {
          bbox: Json | null
          caption: string | null
          created_at: string
          description: string | null
          document_id: string
          id: string
          image_id: string
          image_type: string | null
          ocr_text: string | null
          page_number: number
          storage_path: string
          thumbnail_path: string | null
        }
        Insert: {
          bbox?: Json | null
          caption?: string | null
          created_at?: string
          description?: string | null
          document_id: string
          id?: string
          image_id: string
          image_type?: string | null
          ocr_text?: string | null
          page_number: number
          storage_path: string
          thumbnail_path?: string | null
        }
        Update: {
          bbox?: Json | null
          caption?: string | null
          created_at?: string
          description?: string | null
          document_id?: string
          id?: string
          image_id?: string
          image_type?: string | null
          ocr_text?: string | null
          page_number?: number
          storage_path?: string
          thumbnail_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_images_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_tables: {
        Row: {
          bbox: Json | null
          caption: string | null
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          markdown: string
          page_number: number
          structured_data: Json
          table_id: string
        }
        Insert: {
          bbox?: Json | null
          caption?: string | null
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          markdown: string
          page_number: number
          structured_data: Json
          table_id: string
        }
        Update: {
          bbox?: Json | null
          caption?: string | null
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          markdown?: string
          page_number?: number
          structured_data?: Json
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_tables_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          author: string | null
          content: string
          created_at: string
          created_date: string | null
          doc_type: string | null
          error_message: string | null
          extracted_metadata: Json | null
          file_hash: string | null
          file_name: string
          file_path: string | null
          file_size_bytes: number | null
          id: string
          knowledge_type: Database["public"]["Enums"]["knowledge_base_type"]
          language: string | null
          metadata: Json | null
          progress: number | null
          status: string
          title: string
          total_pages: number | null
          updated_at: string
        }
        Insert: {
          author?: string | null
          content: string
          created_at?: string
          created_date?: string | null
          doc_type?: string | null
          error_message?: string | null
          extracted_metadata?: Json | null
          file_hash?: string | null
          file_name: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          knowledge_type: Database["public"]["Enums"]["knowledge_base_type"]
          language?: string | null
          metadata?: Json | null
          progress?: number | null
          status?: string
          title: string
          total_pages?: number | null
          updated_at?: string
        }
        Update: {
          author?: string | null
          content?: string
          created_at?: string
          created_date?: string | null
          doc_type?: string | null
          error_message?: string | null
          extracted_metadata?: Json | null
          file_hash?: string | null
          file_name?: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          knowledge_type?: Database["public"]["Enums"]["knowledge_base_type"]
          language?: string | null
          metadata?: Json | null
          progress?: number | null
          status?: string
          title?: string
          total_pages?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          document_id: string
          error_message: string | null
          id: string
          job_type: string
          progress: number | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          document_id: string
          error_message?: string | null
          id?: string
          job_type: string
          progress?: number | null
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error_message?: string | null
          id?: string
          job_type?: string
          progress?: number | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birth_date: string
          cpf: string
          created_at: string
          crm_crv: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          birth_date: string
          cpf: string
          created_at?: string
          crm_crv?: string | null
          email: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string
          cpf?: string
          created_at?: string
          crm_crv?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
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
      user_subscriptions: {
        Row: {
          billing_period: Database["public"]["Enums"]["billing_period"] | null
          created_at: string
          expires_at: string | null
          id: string
          plan_type: Database["public"]["Enums"]["subscription_plan"]
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_period?: Database["public"]["Enums"]["billing_period"] | null
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_type?: Database["public"]["Enums"]["subscription_plan"]
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_period?: Database["public"]["Enums"]["billing_period"] | null
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_type?: Database["public"]["Enums"]["subscription_plan"]
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
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
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: unknown
      }
      search_semantic_chunks: {
        Args: {
          chunk_type_filter?: string
          knowledge_type_filter: Database["public"]["Enums"]["knowledge_base_type"]
          match_count?: number
          query_embedding: string
        }
        Returns: {
          chunk_type: string
          content: string
          document_id: string
          document_title: string
          id: string
          is_atomic: boolean
          page_range: string
          section_title: string
          similarity: number
        }[]
      }
      search_similar_chunks: {
        Args: {
          knowledge_type_filter: Database["public"]["Enums"]["knowledge_base_type"]
          match_count?: number
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          document_title: string
          id: string
          similarity: number
        }[]
      }
      search_structured_blocks: {
        Args: {
          block_type_filter?: string
          document_id_filter: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          block_id: string
          block_type: string
          content: string
          document_id: string
          id: string
          page_number: number
          section_title: string
          similarity: number
        }[]
      }
      search_tables: {
        Args: {
          document_id_filter?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          caption: string
          document_id: string
          id: string
          markdown: string
          page_number: number
          similarity: number
          structured_data: Json
          table_id: string
        }[]
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      ai_model_type:
        | "generic"
        | "medical"
        | "legal"
        | "veterinary"
        | "specialist"
      app_role: "admin" | "user"
      billing_period: "monthly" | "annual"
      knowledge_base_type: "medical" | "legal" | "veterinary"
      subscription_plan:
        | "free"
        | "medical"
        | "legal"
        | "veterinary"
        | "specialist"
      subscription_status: "active" | "inactive" | "cancelled"
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
      ai_model_type: [
        "generic",
        "medical",
        "legal",
        "veterinary",
        "specialist",
      ],
      app_role: ["admin", "user"],
      billing_period: ["monthly", "annual"],
      knowledge_base_type: ["medical", "legal", "veterinary"],
      subscription_plan: [
        "free",
        "medical",
        "legal",
        "veterinary",
        "specialist",
      ],
      subscription_status: ["active", "inactive", "cancelled"],
    },
  },
} as const
