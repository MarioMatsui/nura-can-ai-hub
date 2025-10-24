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
      admin_notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          processed_at: string | null
          read_at: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          read_at?: string | null
          status?: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          read_at?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          conversation_id: string | null
          cost: number
          created_at: string
          id: string
          model: string
          tokens_input: number
          tokens_output: number
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          cost?: number
          created_at?: string
          id?: string
          model: string
          tokens_input?: number
          tokens_output?: number
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          cost?: number
          created_at?: string
          id?: string
          model?: string
          tokens_input?: number
          tokens_output?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
          timestamp: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
          timestamp?: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
          timestamp?: string
        }
        Relationships: []
      }
      cancellation_requests: {
        Row: {
          cancellation_reason:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          created_at: string
          effective_cancel_at: string
          id: string
          notes: string | null
          plan_code: string
          plan_type_requested:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          processed_at: string | null
          provider: string
          provider_subscription_id: string | null
          reason: string | null
          status: string
          subscription_id: string
          user_id: string
        }
        Insert: {
          cancellation_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          created_at?: string
          effective_cancel_at: string
          id?: string
          notes?: string | null
          plan_code: string
          plan_type_requested?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          processed_at?: string | null
          provider: string
          provider_subscription_id?: string | null
          reason?: string | null
          status?: string
          subscription_id: string
          user_id: string
        }
        Update: {
          cancellation_reason?:
            | Database["public"]["Enums"]["cancellation_reason"]
            | null
          created_at?: string
          effective_cancel_at?: string
          id?: string
          notes?: string | null
          plan_code?: string
          plan_type_requested?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          processed_at?: string | null
          provider?: string
          provider_subscription_id?: string | null
          reason?: string | null
          status?: string
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_requests_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
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
      payments: {
        Row: {
          amount: number
          billing_cycle: Database["public"]["Enums"]["billing_period"] | null
          charge_id: string | null
          created_at: string
          id: string
          payer_email: string | null
          payload_raw: Json | null
          plan_type: Database["public"]["Enums"]["subscription_plan"]
          provider: string
          provider_payment_id: string | null
          reference: string | null
          request_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          billing_cycle?: Database["public"]["Enums"]["billing_period"] | null
          charge_id?: string | null
          created_at?: string
          id?: string
          payer_email?: string | null
          payload_raw?: Json | null
          plan_type: Database["public"]["Enums"]["subscription_plan"]
          provider?: string
          provider_payment_id?: string | null
          reference?: string | null
          request_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          billing_cycle?: Database["public"]["Enums"]["billing_period"] | null
          charge_id?: string | null
          created_at?: string
          id?: string
          payer_email?: string | null
          payload_raw?: Json | null
          plan_type?: Database["public"]["Enums"]["subscription_plan"]
          provider?: string
          provider_payment_id?: string | null
          reference?: string | null
          request_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      processed_webhooks: {
        Row: {
          created_at: string
          event_type: string
          id: string
          processed_at: string
          webhook_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          processed_at?: string
          webhook_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          processed_at?: string
          webhook_id?: string
        }
        Relationships: []
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
          region: string | null
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
          region?: string | null
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
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          effective_at: string
          event: string
          id: string
          metadata: Json | null
          plan_type: Database["public"]["Enums"]["plan_type_enum"]
          status: Database["public"]["Enums"]["plan_status_enum"]
          user_id: string
        }
        Insert: {
          created_at?: string
          effective_at?: string
          event: string
          id?: string
          metadata?: Json | null
          plan_type: Database["public"]["Enums"]["plan_type_enum"]
          status: Database["public"]["Enums"]["plan_status_enum"]
          user_id: string
        }
        Update: {
          created_at?: string
          effective_at?: string
          event?: string
          id?: string
          metadata?: Json | null
          plan_type?: Database["public"]["Enums"]["plan_type_enum"]
          status?: Database["public"]["Enums"]["plan_status_enum"]
          user_id?: string
        }
        Relationships: []
      }
      user_plans: {
        Row: {
          billing_cycle:
            | Database["public"]["Enums"]["billing_cycle_enum"]
            | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          plan_type: Database["public"]["Enums"]["plan_type_enum"]
          raw: Json | null
          status: Database["public"]["Enums"]["plan_status_enum"]
          stripe_customer_id: string | null
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_cycle?:
            | Database["public"]["Enums"]["billing_cycle_enum"]
            | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_type?: Database["public"]["Enums"]["plan_type_enum"]
          raw?: Json | null
          status?: Database["public"]["Enums"]["plan_status_enum"]
          stripe_customer_id?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_cycle?:
            | Database["public"]["Enums"]["billing_cycle_enum"]
            | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_type?: Database["public"]["Enums"]["plan_type_enum"]
          raw?: Json | null
          status?: Database["public"]["Enums"]["plan_status_enum"]
          stripe_customer_id?: string | null
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
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
          cancel_at: string | null
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
          cancel_at?: string | null
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
          cancel_at?: string | null
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
      webhook_events: {
        Row: {
          charge_id: string | null
          created_at: string
          event_id: string | null
          event_type: string
          external_reference: string | null
          id: string
          payer_email: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          provider: string
          reference: string | null
          request_id: string | null
          status: string | null
          valid_token: boolean | null
        }
        Insert: {
          charge_id?: string | null
          created_at?: string
          event_id?: string | null
          event_type: string
          external_reference?: string | null
          id?: string
          payer_email?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          provider?: string
          reference?: string | null
          request_id?: string | null
          status?: string | null
          valid_token?: boolean | null
        }
        Update: {
          charge_id?: string | null
          created_at?: string
          event_id?: string | null
          event_type?: string
          external_reference?: string | null
          id?: string
          payer_email?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          provider?: string
          reference?: string | null
          request_id?: string | null
          status?: string | null
          valid_token?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_webhooks: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      upsert_user_plan: {
        Args: {
          _billing_cycle?: Database["public"]["Enums"]["billing_cycle_enum"]
          _cancel_at_period_end?: boolean
          _current_period_end?: string
          _plan_type?: Database["public"]["Enums"]["plan_type_enum"]
          _raw?: Json
          _status?: Database["public"]["Enums"]["plan_status_enum"]
          _stripe_customer_id?: string
          _subscription_id?: string
          _user_id: string
        }
        Returns: string
      }
      validate_cpf: { Args: { cpf_input: string }; Returns: boolean }
    }
    Enums: {
      ai_model_type:
        | "generic"
        | "medical"
        | "legal"
        | "veterinary"
        | "specialist"
      app_role: "admin" | "user"
      billing_cycle_enum: "mensal" | "anual"
      billing_period: "monthly" | "annual"
      cancellation_reason:
        | "solicitacao_usuario"
        | "upgrade_para_especialista"
        | "outros"
      knowledge_base_type: "medical" | "legal" | "veterinary"
      plan_status_enum:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "inactive"
      plan_type_enum:
        | "free"
        | "medico"
        | "juridico"
        | "veterinario"
        | "especialista"
      subscription_plan:
        | "free"
        | "medical"
        | "legal"
        | "veterinary"
        | "specialist"
      subscription_status:
        | "active"
        | "inactive"
        | "cancelled"
        | "scheduled_cancellation"
        | "expired"
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
      billing_cycle_enum: ["mensal", "anual"],
      billing_period: ["monthly", "annual"],
      cancellation_reason: [
        "solicitacao_usuario",
        "upgrade_para_especialista",
        "outros",
      ],
      knowledge_base_type: ["medical", "legal", "veterinary"],
      plan_status_enum: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "incomplete",
        "inactive",
      ],
      plan_type_enum: [
        "free",
        "medico",
        "juridico",
        "veterinario",
        "especialista",
      ],
      subscription_plan: [
        "free",
        "medical",
        "legal",
        "veterinary",
        "specialist",
      ],
      subscription_status: [
        "active",
        "inactive",
        "cancelled",
        "scheduled_cancellation",
        "expired",
      ],
    },
  },
} as const
