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
      account_deletions: {
        Row: {
          created_at: string
          id: string
          processed_at: string | null
          reason: string | null
          requested_at: string
          scheduled_deletion_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_deletion_at: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_deletion_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_verifications: {
        Row: {
          address: string
          created_at: string
          full_name: string
          id: string
          nin: string
          nin_back_url: string | null
          nin_front_url: string | null
          passport_photo_url: string | null
          phone_number: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          full_name: string
          id?: string
          nin: string
          nin_back_url?: string | null
          nin_front_url?: string | null
          passport_photo_url?: string | null
          phone_number: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          full_name?: string
          id?: string
          nin?: string
          nin_back_url?: string | null
          nin_front_url?: string | null
          passport_photo_url?: string | null
          phone_number?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_action_logs: {
        Row: {
          action_details: Json | null
          action_type: string
          admin_user_id: string
          created_at: string
          id: string
          ip_address: string | null
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          action_details?: Json | null
          action_type: string
          admin_user_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action_details?: Json | null
          action_type?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_revenue: {
        Row: {
          amount: number
          amount_ngn: number | null
          base_amount: number | null
          created_at: string
          currency: string
          fee_percentage: number | null
          id: string
          metadata: Json | null
          notes: string | null
          revenue_type: string
          source: string
          transaction_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          amount_ngn?: number | null
          base_amount?: number | null
          created_at?: string
          currency: string
          fee_percentage?: number | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          revenue_type: string
          source: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          amount_ngn?: number | null
          base_amount?: number | null
          created_at?: string
          currency?: string
          fee_percentage?: number | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          revenue_type?: string
          source?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_revenue_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      aggregated_prices: {
        Row: {
          asset: string
          buy_price: number
          circuit_breaker_activated_at: string | null
          circuit_breaker_active: boolean
          circuit_breaker_reason: string | null
          created_at: string
          disabled_at: string | null
          disabled_reason: string | null
          is_disabled: boolean
          last_known_price: number | null
          last_known_price_at: string | null
          liquidity_factor: number | null
          min_liquidity_threshold: number | null
          price_median: number | null
          price_sources_count: number | null
          price_std_deviation: number | null
          sell_price: number
          spot_price: number
          updated_at: string
          using_fallback: boolean
        }
        Insert: {
          asset: string
          buy_price: number
          circuit_breaker_activated_at?: string | null
          circuit_breaker_active?: boolean
          circuit_breaker_reason?: string | null
          created_at?: string
          disabled_at?: string | null
          disabled_reason?: string | null
          is_disabled?: boolean
          last_known_price?: number | null
          last_known_price_at?: string | null
          liquidity_factor?: number | null
          min_liquidity_threshold?: number | null
          price_median?: number | null
          price_sources_count?: number | null
          price_std_deviation?: number | null
          sell_price: number
          spot_price: number
          updated_at?: string
          using_fallback?: boolean
        }
        Update: {
          asset?: string
          buy_price?: number
          circuit_breaker_activated_at?: string | null
          circuit_breaker_active?: boolean
          circuit_breaker_reason?: string | null
          created_at?: string
          disabled_at?: string | null
          disabled_reason?: string | null
          is_disabled?: boolean
          last_known_price?: number | null
          last_known_price_at?: string | null
          liquidity_factor?: number | null
          min_liquidity_threshold?: number | null
          price_median?: number | null
          price_sources_count?: number | null
          price_std_deviation?: number | null
          sell_price?: number
          spot_price?: number
          updated_at?: string
          using_fallback?: boolean
        }
        Relationships: []
      }
      alert_configurations: {
        Row: {
          alert_type: string
          cooldown_minutes: number | null
          created_at: string
          email_enabled: boolean
          email_recipients: string[] | null
          id: string
          is_active: boolean
          max_alerts_per_day: number | null
          min_severity_to_send: string | null
          severity_threshold: string | null
          slack_enabled: boolean
          slack_webhook_url: string | null
          sms_enabled: boolean
          sms_recipients: string[] | null
          updated_at: string
        }
        Insert: {
          alert_type: string
          cooldown_minutes?: number | null
          created_at?: string
          email_enabled?: boolean
          email_recipients?: string[] | null
          id?: string
          is_active?: boolean
          max_alerts_per_day?: number | null
          min_severity_to_send?: string | null
          severity_threshold?: string | null
          slack_enabled?: boolean
          slack_webhook_url?: string | null
          sms_enabled?: boolean
          sms_recipients?: string[] | null
          updated_at?: string
        }
        Update: {
          alert_type?: string
          cooldown_minutes?: number | null
          created_at?: string
          email_enabled?: boolean
          email_recipients?: string[] | null
          id?: string
          is_active?: boolean
          max_alerts_per_day?: number | null
          min_severity_to_send?: string | null
          severity_threshold?: string | null
          slack_enabled?: boolean
          slack_webhook_url?: string | null
          sms_enabled?: boolean
          sms_recipients?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          additional_settings: Json | null
          app_name: string
          app_version: string
          created_at: string
          id: number
          kyc_required: boolean
          maintenance_mode: boolean
          max_withdrawal_amount: number
          min_withdrawal_amount: number
          privacy_policy: string | null
          registration_enabled: boolean
          support_address: string | null
          support_email: string | null
          support_phone: string | null
          terms_and_conditions: string | null
          transaction_fee: number
          transaction_fee_percentage: number
          updated_at: string
          updated_by: string | null
          withdrawal_fee: number
        }
        Insert: {
          additional_settings?: Json | null
          app_name?: string
          app_version?: string
          created_at?: string
          id?: number
          kyc_required?: boolean
          maintenance_mode?: boolean
          max_withdrawal_amount?: number
          min_withdrawal_amount?: number
          privacy_policy?: string | null
          registration_enabled?: boolean
          support_address?: string | null
          support_email?: string | null
          support_phone?: string | null
          terms_and_conditions?: string | null
          transaction_fee?: number
          transaction_fee_percentage?: number
          updated_at?: string
          updated_by?: string | null
          withdrawal_fee?: number
        }
        Update: {
          additional_settings?: Json | null
          app_name?: string
          app_version?: string
          created_at?: string
          id?: number
          kyc_required?: boolean
          maintenance_mode?: boolean
          max_withdrawal_amount?: number
          min_withdrawal_amount?: number
          privacy_policy?: string | null
          registration_enabled?: boolean
          support_address?: string | null
          support_email?: string | null
          support_phone?: string | null
          terms_and_conditions?: string | null
          transaction_fee?: number
          transaction_fee_percentage?: number
          updated_at?: string
          updated_by?: string | null
          withdrawal_fee?: number
        }
        Relationships: []
      }
      asset_prices: {
        Row: {
          asset: string
          change_24h_percentage: number | null
          created_at: string
          deviation_from_median: number | null
          fetched_at: string
          id: string
          is_outlier: boolean | null
          price: number
          price_source_id: string | null
          price_type: string
          volume_24h: number | null
        }
        Insert: {
          asset: string
          change_24h_percentage?: number | null
          created_at?: string
          deviation_from_median?: number | null
          fetched_at?: string
          id?: string
          is_outlier?: boolean | null
          price: number
          price_source_id?: string | null
          price_type: string
          volume_24h?: number | null
        }
        Update: {
          asset?: string
          change_24h_percentage?: number | null
          created_at?: string
          deviation_from_median?: number | null
          fetched_at?: string
          id?: string
          is_outlier?: boolean | null
          price?: number
          price_source_id?: string | null
          price_type?: string
          volume_24h?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_prices_price_source_id_fkey"
            columns: ["price_source_id"]
            isOneToOne: false
            referencedRelation: "price_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: string
          changes: Json | null
          created_at: string
          description: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          performed_by: string
          regulatory_category: string | null
          requires_retention: boolean
          retention_until: string | null
          session_id: string | null
          target_entity_id: string | null
          target_entity_type: string | null
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          changes?: Json | null
          created_at?: string
          description: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          performed_by: string
          regulatory_category?: string | null
          requires_retention?: boolean
          retention_until?: string | null
          session_id?: string | null
          target_entity_id?: string | null
          target_entity_type?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          changes?: Json | null
          created_at?: string
          description?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string
          regulatory_category?: string | null
          requires_retention?: boolean
          retention_until?: string | null
          session_id?: string | null
          target_entity_id?: string | null
          target_entity_type?: string | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      auto_sell_logs: {
        Row: {
          created_at: string | null
          crypto_amount: number
          crypto_currency: string
          error_message: string | null
          executed_at: string | null
          id: string
          ngn_amount: number
          sell_id: string | null
          source_transaction_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          crypto_amount: number
          crypto_currency: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          ngn_amount: number
          sell_id?: string | null
          source_transaction_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          crypto_amount?: number
          crypto_currency?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          ngn_amount?: number
          sell_id?: string | null
          source_transaction_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_sell_logs_sell_id_fkey"
            columns: ["sell_id"]
            isOneToOne: false
            referencedRelation: "sells"
            referencedColumns: ["sell_id"]
          },
          {
            foreignKeyName: "auto_sell_logs_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          alert_sent_at: string | null
          alert_threshold: number | null
          bank_code: string | null
          bank_name: string
          created_at: string
          current_balance: number | null
          environment: string
          id: string
          is_active: boolean
          is_primary: boolean | null
          last_reconciled_at: string | null
          last_reconciliation_balance: number | null
          metadata: Json | null
          minimum_threshold: number | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          alert_sent_at?: string | null
          alert_threshold?: number | null
          bank_code?: string | null
          bank_name: string
          created_at?: string
          current_balance?: number | null
          environment?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean | null
          last_reconciled_at?: string | null
          last_reconciliation_balance?: number | null
          metadata?: Json | null
          minimum_threshold?: number | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          alert_sent_at?: string | null
          alert_threshold?: number | null
          bank_code?: string | null
          bank_name?: string
          created_at?: string
          current_balance?: number | null
          environment?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean | null
          last_reconciled_at?: string | null
          last_reconciliation_balance?: number | null
          metadata?: Json | null
          minimum_threshold?: number | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bank_reconciliation: {
        Row: {
          aging_0_30_days: number | null
          aging_31_60_days: number | null
          aging_61_90_days: number | null
          aging_over_90_days: number | null
          bank_account_id: string
          bank_statement_balance: number
          created_at: string
          difference: number
          has_mismatch: boolean
          id: string
          ledger_balance: number
          metadata: Json | null
          mismatch_reason: string | null
          mismatch_resolved: boolean | null
          reconciliation_date: string
          reconciliation_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          statement_reference: string | null
          updated_at: string
        }
        Insert: {
          aging_0_30_days?: number | null
          aging_31_60_days?: number | null
          aging_61_90_days?: number | null
          aging_over_90_days?: number | null
          bank_account_id: string
          bank_statement_balance: number
          created_at?: string
          difference: number
          has_mismatch?: boolean
          id?: string
          ledger_balance: number
          metadata?: Json | null
          mismatch_reason?: string | null
          mismatch_resolved?: boolean | null
          reconciliation_date: string
          reconciliation_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          statement_reference?: string | null
          updated_at?: string
        }
        Update: {
          aging_0_30_days?: number | null
          aging_31_60_days?: number | null
          aging_61_90_days?: number | null
          aging_over_90_days?: number | null
          bank_account_id?: string
          bank_statement_balance?: number
          created_at?: string
          difference?: number
          has_mismatch?: boolean
          id?: string
          ledger_balance?: number
          metadata?: Json | null
          mismatch_reason?: string | null
          mismatch_resolved?: boolean | null
          reconciliation_date?: string
          reconciliation_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          statement_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliation_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      btc_deposits: {
        Row: {
          amount_btc: number
          confirmations: number
          created_at: string
          id: string
          status: string
          to_address: string
          txid: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_btc: number
          confirmations?: number
          created_at?: string
          id?: string
          status?: string
          to_address: string
          txid: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_btc?: number
          confirmations?: number
          created_at?: string
          id?: string
          status?: string
          to_address?: string
          txid?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      buy_transactions: {
        Row: {
          amount_after_fee: number
          client_order_id: string | null
          completed_at: string | null
          created_at: string
          crypto_amount: number | null
          crypto_currency: string
          error_message: string | null
          fee_amount: number
          fee_percentage: number
          id: string
          luno_order_id: string | null
          luno_pair: string
          ngn_amount: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_after_fee: number
          client_order_id?: string | null
          completed_at?: string | null
          created_at?: string
          crypto_amount?: number | null
          crypto_currency: string
          error_message?: string | null
          fee_amount: number
          fee_percentage?: number
          id?: string
          luno_order_id?: string | null
          luno_pair: string
          ngn_amount: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_after_fee?: number
          client_order_id?: string | null
          completed_at?: string | null
          created_at?: string
          crypto_amount?: number | null
          crypto_currency?: string
          error_message?: string | null
          fee_amount?: number
          fee_percentage?: number
          id?: string
          luno_order_id?: string | null
          luno_pair?: string
          ngn_amount?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crypto_prices: {
        Row: {
          created_at: string
          crypto_symbol: string
          id: string
          last_updated: string
          price_ngn: number
          price_usd: number
          source: string
        }
        Insert: {
          created_at?: string
          crypto_symbol: string
          id?: string
          last_updated?: string
          price_ngn: number
          price_usd: number
          source?: string
        }
        Update: {
          created_at?: string
          crypto_symbol?: string
          id?: string
          last_updated?: string
          price_ngn?: number
          price_usd?: number
          source?: string
        }
        Relationships: []
      }
      crypto_wallets: {
        Row: {
          address: string
          asset: string
          created_at: string
          derivation_path: string | null
          destination_tag: string | null
          id: string
          is_active: boolean
          mnemonic_encrypted: string | null
          network: string
          private_key: string | null
          private_key_encrypted: string | null
          public_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          asset: string
          created_at?: string
          derivation_path?: string | null
          destination_tag?: string | null
          id?: string
          is_active?: boolean
          mnemonic_encrypted?: string | null
          network?: string
          private_key?: string | null
          private_key_encrypted?: string | null
          public_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          asset?: string
          created_at?: string
          derivation_path?: string | null
          destination_tag?: string | null
          id?: string
          is_active?: boolean
          mnemonic_encrypted?: string | null
          network?: string
          private_key?: string | null
          private_key_encrypted?: string | null
          public_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_gift_cards: {
        Row: {
          activated_at: string | null
          amount: number
          balance: number
          card_type: string
          code: string
          created_at: string
          created_by: string
          created_for_user_id: string | null
          currency: string
          description: string | null
          design_color: string | null
          design_image_url: string | null
          expires_at: string | null
          expires_in_days: number | null
          id: string
          is_promotional: boolean | null
          is_reloadable: boolean | null
          is_transferable: boolean | null
          last_used_at: string | null
          metadata: Json | null
          personal_message: string | null
          promotional_code: string | null
          recipient_email: string | null
          recipient_name: string | null
          recipient_phone: string | null
          status: string
          tags: string[] | null
          title: string | null
          transaction_id: string | null
          updated_at: string
          usage_count: number | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          activated_at?: string | null
          amount: number
          balance?: number
          card_type?: string
          code: string
          created_at?: string
          created_by: string
          created_for_user_id?: string | null
          currency?: string
          description?: string | null
          design_color?: string | null
          design_image_url?: string | null
          expires_at?: string | null
          expires_in_days?: number | null
          id?: string
          is_promotional?: boolean | null
          is_reloadable?: boolean | null
          is_transferable?: boolean | null
          last_used_at?: string | null
          metadata?: Json | null
          personal_message?: string | null
          promotional_code?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          status?: string
          tags?: string[] | null
          title?: string | null
          transaction_id?: string | null
          updated_at?: string
          usage_count?: number | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          activated_at?: string | null
          amount?: number
          balance?: number
          card_type?: string
          code?: string
          created_at?: string
          created_by?: string
          created_for_user_id?: string | null
          currency?: string
          description?: string | null
          design_color?: string | null
          design_image_url?: string | null
          expires_at?: string | null
          expires_in_days?: number | null
          id?: string
          is_promotional?: boolean | null
          is_reloadable?: boolean | null
          is_transferable?: boolean | null
          last_used_at?: string | null
          metadata?: Json | null
          personal_message?: string | null
          promotional_code?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          status?: string
          tags?: string[] | null
          title?: string | null
          transaction_id?: string | null
          updated_at?: string
          usage_count?: number | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_gift_cards_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_controls: {
        Row: {
          deposits_enabled: boolean
          freeze_reason: string | null
          frozen_at: string | null
          frozen_by: string | null
          id: number
          is_system_frozen: boolean
          maintenance_message: string | null
          maintenance_mode: boolean
          trading_enabled: boolean
          updated_at: string
          withdrawals_enabled: boolean
        }
        Insert: {
          deposits_enabled?: boolean
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          id?: number
          is_system_frozen?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          trading_enabled?: boolean
          updated_at?: string
          withdrawals_enabled?: boolean
        }
        Update: {
          deposits_enabled?: boolean
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          id?: number
          is_system_frozen?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          trading_enabled?: boolean
          updated_at?: string
          withdrawals_enabled?: boolean
        }
        Relationships: []
      }
      gift_card_sales: {
        Row: {
          admin_notes: string | null
          amount: number
          card_category: string
          card_subcategory: string
          card_type: string
          created_at: string
          currency: string
          id: string
          image_urls: Json | null
          payment_transaction_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          card_category: string
          card_subcategory: string
          card_type: string
          created_at?: string
          currency?: string
          id?: string
          image_urls?: Json | null
          payment_transaction_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          card_category?: string
          card_subcategory?: string
          card_type?: string
          created_at?: string
          currency?: string
          id?: string
          image_urls?: Json | null
          payment_transaction_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gift_cards: {
        Row: {
          amount: number
          card_category: string
          card_subcategory: string
          card_type: string
          code: string
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          message: string | null
          recipient_email: string | null
          recipient_name: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          card_category: string
          card_subcategory: string
          card_type?: string
          code: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          message?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          card_category?: string
          card_subcategory?: string
          card_type?: string
          code?: string
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          message?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      global_risk_controls: {
        Row: {
          auto_disable_on_discrepancy: boolean
          discrepancy_threshold_percentage: number | null
          emergency_kill_switch: boolean
          id: number
          kill_switch_activated_at: string | null
          kill_switch_activated_by: string | null
          kill_switch_reason: string | null
          liquidity_threshold_percentage: number | null
          max_daily_withdrawals: number | null
          max_hourly_withdrawals: number | null
          throttle_factor: number | null
          trade_throttling_enabled: boolean
          updated_at: string
          withdrawal_velocity_window_hours: number | null
        }
        Insert: {
          auto_disable_on_discrepancy?: boolean
          discrepancy_threshold_percentage?: number | null
          emergency_kill_switch?: boolean
          id?: number
          kill_switch_activated_at?: string | null
          kill_switch_activated_by?: string | null
          kill_switch_reason?: string | null
          liquidity_threshold_percentage?: number | null
          max_daily_withdrawals?: number | null
          max_hourly_withdrawals?: number | null
          throttle_factor?: number | null
          trade_throttling_enabled?: boolean
          updated_at?: string
          withdrawal_velocity_window_hours?: number | null
        }
        Update: {
          auto_disable_on_discrepancy?: boolean
          discrepancy_threshold_percentage?: number | null
          emergency_kill_switch?: boolean
          id?: number
          kill_switch_activated_at?: string | null
          kill_switch_activated_by?: string | null
          kill_switch_reason?: string | null
          liquidity_threshold_percentage?: number | null
          max_daily_withdrawals?: number | null
          max_hourly_withdrawals?: number | null
          throttle_factor?: number | null
          trade_throttling_enabled?: boolean
          updated_at?: string
          withdrawal_velocity_window_hours?: number | null
        }
        Relationships: []
      }
      inventory_adjustments: {
        Row: {
          adjustment_type: string
          amount: number
          asset: string
          auto_expired: boolean
          balance_after: number
          balance_before: number
          blockchain_network: string | null
          created_at: string
          expired_at: string | null
          expires_at: string | null
          id: string
          is_verified: boolean
          metadata: Json | null
          notes: string | null
          operation: string
          original_adjustment_id: string | null
          pending_balance_after: number | null
          pending_balance_before: number | null
          performed_at: string
          performed_by: string
          reason: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          source_reference: string | null
          status: string
          transaction_hash: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          wallet_address: string | null
        }
        Insert: {
          adjustment_type: string
          amount: number
          asset: string
          auto_expired?: boolean
          balance_after: number
          balance_before: number
          blockchain_network?: string | null
          created_at?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          is_verified?: boolean
          metadata?: Json | null
          notes?: string | null
          operation: string
          original_adjustment_id?: string | null
          pending_balance_after?: number | null
          pending_balance_before?: number | null
          performed_at?: string
          performed_by: string
          reason: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_reference?: string | null
          status?: string
          transaction_hash?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          wallet_address?: string | null
        }
        Update: {
          adjustment_type?: string
          amount?: number
          asset?: string
          auto_expired?: boolean
          balance_after?: number
          balance_before?: number
          blockchain_network?: string | null
          created_at?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          is_verified?: boolean
          metadata?: Json | null
          notes?: string | null
          operation?: string
          original_adjustment_id?: string | null
          pending_balance_after?: number | null
          pending_balance_before?: number | null
          performed_at?: string
          performed_by?: string
          reason?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_reference?: string | null
          status?: string
          transaction_hash?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_original_adjustment_id_fkey"
            columns: ["original_adjustment_id"]
            isOneToOne: false
            referencedRelation: "inventory_adjustments"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidity_controls: {
        Row: {
          asset: string
          created_at: string
          current_balance: number | null
          daily_withdrawal_limit: number | null
          daily_withdrawal_used: number | null
          freeze_reason: string | null
          frozen_at: string | null
          frozen_by: string | null
          hourly_limit_reset_at: string | null
          hourly_withdrawal_limit: number | null
          hourly_withdrawal_used: number | null
          id: string
          is_active: boolean
          is_frozen: boolean
          last_updated_at: string | null
          maximum_balance: number | null
          minimum_balance: number | null
          target_utilization_percentage: number | null
          updated_at: string
          utilization_percentage: number | null
          wallet_type: string
          withdrawal_limit_reset_at: string | null
        }
        Insert: {
          asset: string
          created_at?: string
          current_balance?: number | null
          daily_withdrawal_limit?: number | null
          daily_withdrawal_used?: number | null
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          hourly_limit_reset_at?: string | null
          hourly_withdrawal_limit?: number | null
          hourly_withdrawal_used?: number | null
          id?: string
          is_active?: boolean
          is_frozen?: boolean
          last_updated_at?: string | null
          maximum_balance?: number | null
          minimum_balance?: number | null
          target_utilization_percentage?: number | null
          updated_at?: string
          utilization_percentage?: number | null
          wallet_type: string
          withdrawal_limit_reset_at?: string | null
        }
        Update: {
          asset?: string
          created_at?: string
          current_balance?: number | null
          daily_withdrawal_limit?: number | null
          daily_withdrawal_used?: number | null
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          hourly_limit_reset_at?: string | null
          hourly_withdrawal_limit?: number | null
          hourly_withdrawal_used?: number | null
          id?: string
          is_active?: boolean
          is_frozen?: boolean
          last_updated_at?: string | null
          maximum_balance?: number | null
          minimum_balance?: number | null
          target_utilization_percentage?: number | null
          updated_at?: string
          utilization_percentage?: number | null
          wallet_type?: string
          withdrawal_limit_reset_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string
          read_at: string | null
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          read_at?: string | null
          status?: string
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          read_at?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      on_chain_balances: {
        Row: {
          asset: string
          created_at: string
          difference: number
          fetch_error: string | null
          id: string
          last_fetched_at: string | null
          ledger_inventory: number
          network: string | null
          notes: string | null
          on_chain_balance: number
          reconciliation_status: string
          updated_at: string
          wallet_address: string
        }
        Insert: {
          asset: string
          created_at?: string
          difference?: number
          fetch_error?: string | null
          id?: string
          last_fetched_at?: string | null
          ledger_inventory?: number
          network?: string | null
          notes?: string | null
          on_chain_balance?: number
          reconciliation_status?: string
          updated_at?: string
          wallet_address: string
        }
        Update: {
          asset?: string
          created_at?: string
          difference?: number
          fetch_error?: string | null
          id?: string
          last_fetched_at?: string | null
          ledger_inventory?: number
          network?: string | null
          notes?: string | null
          on_chain_balance?: number
          reconciliation_status?: string
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      price_cache: {
        Row: {
          alert_sent: boolean | null
          alert_threshold_percentage: number | null
          asset: string
          created_at: string
          deviation_percentage: number | null
          fallback_reason: string | null
          fetched_at: string
          id: string
          is_fallback: boolean
          market_cap: number | null
          price_change_24h: number | null
          price_ngn: number
          price_source: string
          price_usd: number
          updated_at: string
          volume_24h: number | null
        }
        Insert: {
          alert_sent?: boolean | null
          alert_threshold_percentage?: number | null
          asset: string
          created_at?: string
          deviation_percentage?: number | null
          fallback_reason?: string | null
          fetched_at?: string
          id?: string
          is_fallback?: boolean
          market_cap?: number | null
          price_change_24h?: number | null
          price_ngn: number
          price_source?: string
          price_usd: number
          updated_at?: string
          volume_24h?: number | null
        }
        Update: {
          alert_sent?: boolean | null
          alert_threshold_percentage?: number | null
          asset?: string
          created_at?: string
          deviation_percentage?: number | null
          fallback_reason?: string | null
          fetched_at?: string
          id?: string
          is_fallback?: boolean
          market_cap?: number | null
          price_change_24h?: number | null
          price_ngn?: number
          price_source?: string
          price_usd?: number
          updated_at?: string
          volume_24h?: number | null
        }
        Relationships: []
      }
      price_overrides: {
        Row: {
          account: string
          admin_id: string
          asset: string
          created_at: string
          expiry_time: string
          id: string
          market_price: number
          override_price: number
          reason: string
          status: string
          updated_at: string
        }
        Insert: {
          account: string
          admin_id: string
          asset: string
          created_at?: string
          expiry_time: string
          id?: string
          market_price: number
          override_price: number
          reason: string
          status?: string
          updated_at?: string
        }
        Update: {
          account?: string
          admin_id?: string
          asset?: string
          created_at?: string
          expiry_time?: string
          id?: string
          market_price?: number
          override_price?: number
          reason?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      price_sources: {
        Row: {
          api_endpoint: string | null
          api_key: string | null
          created_at: string
          id: string
          is_active: boolean
          last_request_at: string | null
          notes: string | null
          priority: number | null
          reliability_score: number | null
          requests_per_minute: number | null
          source_name: string
          source_type: string
          updated_at: string
        }
        Insert: {
          api_endpoint?: string | null
          api_key?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_request_at?: string | null
          notes?: string | null
          priority?: number | null
          reliability_score?: number | null
          requests_per_minute?: number | null
          source_name: string
          source_type: string
          updated_at?: string
        }
        Update: {
          api_endpoint?: string | null
          api_key?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_request_at?: string | null
          notes?: string | null
          priority?: number | null
          reliability_score?: number | null
          requests_per_minute?: number | null
          source_name?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_engine_config: {
        Row: {
          asset: string
          buy_spread_percentage: number
          created_at: string
          created_by: string | null
          frozen_at: string | null
          frozen_buy_price_ngn: number | null
          frozen_sell_price_ngn: number | null
          id: string
          notes: string | null
          override_buy_price_ngn: number | null
          override_sell_price_ngn: number | null
          price_frozen: boolean
          retail_markup_fraction: number
          sell_spread_percentage: number
          trading_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          asset: string
          buy_spread_percentage?: number
          created_at?: string
          created_by?: string | null
          frozen_at?: string | null
          frozen_buy_price_ngn?: number | null
          frozen_sell_price_ngn?: number | null
          id?: string
          notes?: string | null
          override_buy_price_ngn?: number | null
          override_sell_price_ngn?: number | null
          price_frozen?: boolean
          retail_markup_fraction?: number
          sell_spread_percentage?: number
          trading_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          asset?: string
          buy_spread_percentage?: number
          created_at?: string
          created_by?: string | null
          frozen_at?: string | null
          frozen_buy_price_ngn?: number | null
          frozen_sell_price_ngn?: number | null
          id?: string
          notes?: string | null
          override_buy_price_ngn?: number | null
          override_sell_price_ngn?: number | null
          price_frozen?: boolean
          retail_markup_fraction?: number
          sell_spread_percentage?: number
          trading_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          asset: string
          buy_spread_percent: number
          created_at: string
          id: string
          is_active: boolean
          platform_fee_percent: number
          sell_spread_percent: number
          updated_at: string
        }
        Insert: {
          asset: string
          buy_spread_percent?: number
          created_at?: string
          id?: string
          is_active?: boolean
          platform_fee_percent?: number
          sell_spread_percent?: number
          updated_at?: string
        }
        Update: {
          asset?: string
          buy_spread_percent?: number
          created_at?: string
          id?: string
          is_active?: boolean
          platform_fee_percent?: number
          sell_spread_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      push_notification_tokens: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reconciliation_history: {
        Row: {
          asset: string
          completed_at: string | null
          created_at: string
          discrepancy_after: number
          discrepancy_before: number
          discrepancy_resolved: boolean
          id: string
          initiated_by: string | null
          ledger_balance_after: number
          ledger_balance_before: number
          on_chain_balance_after: number
          on_chain_balance_before: number
          on_chain_proof: Json | null
          pending_balance_after: number | null
          pending_balance_before: number | null
          reconciliation_data: Json | null
          reconciliation_method: string
          resolution_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          asset: string
          completed_at?: string | null
          created_at?: string
          discrepancy_after: number
          discrepancy_before: number
          discrepancy_resolved?: boolean
          id?: string
          initiated_by?: string | null
          ledger_balance_after: number
          ledger_balance_before: number
          on_chain_balance_after: number
          on_chain_balance_before: number
          on_chain_proof?: Json | null
          pending_balance_after?: number | null
          pending_balance_before?: number | null
          reconciliation_data?: Json | null
          reconciliation_method: string
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          asset?: string
          completed_at?: string | null
          created_at?: string
          discrepancy_after?: number
          discrepancy_before?: number
          discrepancy_resolved?: boolean
          id?: string
          initiated_by?: string | null
          ledger_balance_after?: number
          ledger_balance_before?: number
          on_chain_balance_after?: number
          on_chain_balance_before?: number
          on_chain_proof?: Json | null
          pending_balance_after?: number | null
          pending_balance_before?: number | null
          reconciliation_data?: Json | null
          reconciliation_method?: string
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      reconciliation_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          asset: string
          completed_at: string | null
          created_at: string
          discrepancy: number
          id: string
          initiated_by: string | null
          ledger_balance: number
          on_chain_balance: number
          pending_balance: number | null
          reconciliation_history_id: string | null
          rejection_reason: string | null
          requires_approval: boolean | null
          resolution_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          run_data: Json | null
          run_type: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          asset: string
          completed_at?: string | null
          created_at?: string
          discrepancy: number
          id?: string
          initiated_by?: string | null
          ledger_balance: number
          on_chain_balance: number
          pending_balance?: number | null
          reconciliation_history_id?: string | null
          rejection_reason?: string | null
          requires_approval?: boolean | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_data?: Json | null
          run_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          asset?: string
          completed_at?: string | null
          created_at?: string
          discrepancy?: number
          id?: string
          initiated_by?: string | null
          ledger_balance?: number
          on_chain_balance?: number
          pending_balance?: number | null
          reconciliation_history_id?: string | null
          rejection_reason?: string | null
          requires_approval?: boolean | null
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_data?: Json | null
          run_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_runs_reconciliation_history_id_fkey"
            columns: ["reconciliation_history_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_history"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          actual_amount: number | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          currency: string | null
          details: Json | null
          discrepancies: Json | null
          discrepancies_found: number | null
          discrepancy_amount: number | null
          expected_amount: number | null
          id: string
          initiated_by: string | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          reconciliation_date: string
          reconciliation_type: string
          status: string
          transactions_checked: number | null
          updated_at: string
        }
        Insert: {
          actual_amount?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          currency?: string | null
          details?: Json | null
          discrepancies?: Json | null
          discrepancies_found?: number | null
          discrepancy_amount?: number | null
          expected_amount?: number | null
          id?: string
          initiated_by?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          reconciliation_date?: string
          reconciliation_type: string
          status?: string
          transactions_checked?: number | null
          updated_at?: string
        }
        Update: {
          actual_amount?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          currency?: string | null
          details?: Json | null
          discrepancies?: Json | null
          discrepancies_found?: number | null
          discrepancy_amount?: number | null
          expected_amount?: number | null
          id?: string
          initiated_by?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          reconciliation_date?: string
          reconciliation_type?: string
          status?: string
          transactions_checked?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_transaction_id: string | null
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
          reward_amount: number
          reward_currency: string
          reward_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_transaction_id?: string | null
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
          reward_amount?: number
          reward_currency?: string
          reward_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_transaction_id?: string | null
          referral_code?: string
          referred_user_id?: string
          referrer_user_id?: string
          reward_amount?: number
          reward_currency?: string
          reward_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      risk_events: {
        Row: {
          action_taken: string | null
          asset: string | null
          created_at: string
          description: string
          event_data: Json | null
          event_type: string
          id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          triggered_by: string | null
          triggered_by_system: boolean | null
        }
        Insert: {
          action_taken?: string | null
          asset?: string | null
          created_at?: string
          description: string
          event_data?: Json | null
          event_type: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          triggered_by?: string | null
          triggered_by_system?: boolean | null
        }
        Update: {
          action_taken?: string | null
          asset?: string | null
          created_at?: string
          description?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          triggered_by?: string | null
          triggered_by_system?: boolean | null
        }
        Relationships: []
      }
      sell_transactions: {
        Row: {
          client_order_id: string | null
          completed_at: string | null
          created_at: string
          crypto_amount: number
          crypto_currency: string
          error_message: string | null
          fee_amount: number | null
          fee_percentage: number
          id: string
          luno_order_id: string | null
          luno_pair: string
          ngn_amount: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_order_id?: string | null
          completed_at?: string | null
          created_at?: string
          crypto_amount: number
          crypto_currency: string
          error_message?: string | null
          fee_amount?: number | null
          fee_percentage?: number
          id?: string
          luno_order_id?: string | null
          luno_pair: string
          ngn_amount?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_order_id?: string | null
          completed_at?: string | null
          created_at?: string
          crypto_amount?: number
          crypto_currency?: string
          error_message?: string | null
          fee_amount?: number | null
          fee_percentage?: number
          id?: string
          luno_order_id?: string | null
          luno_pair?: string
          ngn_amount?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sells: {
        Row: {
          auto_sell: boolean | null
          btc_amount: number | null
          btc_tx_hash: string | null
          completed_at: string | null
          created_at: string
          eth_amount: number | null
          eth_tx_hash: string | null
          locked_btc_amount: number | null
          locked_eth_amount: number | null
          locked_sol_amount: number | null
          locked_usdc_amount: number | null
          locked_usdt_amount: number | null
          locked_xrp_amount: number | null
          luno_order_id: string | null
          metadata: Json | null
          ngn_received: number | null
          profit: number | null
          quote_expires_at: string | null
          quoted_ngn: number
          sell_id: string
          sol_amount: number | null
          sol_tx_hash: string | null
          source_deposit_id: string | null
          status: string
          updated_at: string
          usdc_amount: number | null
          usdc_tx_hash: string | null
          usdt_amount: number | null
          usdt_tx_hash: string | null
          user_id: string
          xrp_amount: number | null
          xrp_tx_hash: string | null
        }
        Insert: {
          auto_sell?: boolean | null
          btc_amount?: number | null
          btc_tx_hash?: string | null
          completed_at?: string | null
          created_at?: string
          eth_amount?: number | null
          eth_tx_hash?: string | null
          locked_btc_amount?: number | null
          locked_eth_amount?: number | null
          locked_sol_amount?: number | null
          locked_usdc_amount?: number | null
          locked_usdt_amount?: number | null
          locked_xrp_amount?: number | null
          luno_order_id?: string | null
          metadata?: Json | null
          ngn_received?: number | null
          profit?: number | null
          quote_expires_at?: string | null
          quoted_ngn: number
          sell_id?: string
          sol_amount?: number | null
          sol_tx_hash?: string | null
          source_deposit_id?: string | null
          status?: string
          updated_at?: string
          usdc_amount?: number | null
          usdc_tx_hash?: string | null
          usdt_amount?: number | null
          usdt_tx_hash?: string | null
          user_id: string
          xrp_amount?: number | null
          xrp_tx_hash?: string | null
        }
        Update: {
          auto_sell?: boolean | null
          btc_amount?: number | null
          btc_tx_hash?: string | null
          completed_at?: string | null
          created_at?: string
          eth_amount?: number | null
          eth_tx_hash?: string | null
          locked_btc_amount?: number | null
          locked_eth_amount?: number | null
          locked_sol_amount?: number | null
          locked_usdc_amount?: number | null
          locked_usdt_amount?: number | null
          locked_xrp_amount?: number | null
          luno_order_id?: string | null
          metadata?: Json | null
          ngn_received?: number | null
          profit?: number | null
          quote_expires_at?: string | null
          quoted_ngn?: number
          sell_id?: string
          sol_amount?: number | null
          sol_tx_hash?: string | null
          source_deposit_id?: string | null
          status?: string
          updated_at?: string
          usdc_amount?: number | null
          usdc_tx_hash?: string | null
          usdt_amount?: number | null
          usdt_tx_hash?: string | null
          user_id?: string
          xrp_amount?: number | null
          xrp_tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sells_source_deposit_id_fkey"
            columns: ["source_deposit_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_reports: {
        Row: {
          aging_analysis: Json | null
          alert_sent: boolean | null
          bank_account_balance: number | null
          bank_discrepancy: number | null
          bank_reconciliation_status: string | null
          closing_balance: number
          created_at: string
          failure_reason: string | null
          float_age_days: number | null
          generated_at: string | null
          generated_by: string | null
          id: string
          net_change: number | null
          notes: string | null
          opening_balance: number
          period_end: string
          period_start: string
          report_data: Json | null
          report_date: string
          report_type: string
          settlement_failed: boolean | null
          status: string
          total_credits: number | null
          total_debits: number | null
          updated_at: string
        }
        Insert: {
          aging_analysis?: Json | null
          alert_sent?: boolean | null
          bank_account_balance?: number | null
          bank_discrepancy?: number | null
          bank_reconciliation_status?: string | null
          closing_balance: number
          created_at?: string
          failure_reason?: string | null
          float_age_days?: number | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          net_change?: number | null
          notes?: string | null
          opening_balance: number
          period_end: string
          period_start: string
          report_data?: Json | null
          report_date?: string
          report_type: string
          settlement_failed?: boolean | null
          status?: string
          total_credits?: number | null
          total_debits?: number | null
          updated_at?: string
        }
        Update: {
          aging_analysis?: Json | null
          alert_sent?: boolean | null
          bank_account_balance?: number | null
          bank_discrepancy?: number | null
          bank_reconciliation_status?: string | null
          closing_balance?: number
          created_at?: string
          failure_reason?: string | null
          float_age_days?: number | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          net_change?: number | null
          notes?: string | null
          opening_balance?: number
          period_end?: string
          period_start?: string
          report_data?: Json | null
          report_date?: string
          report_type?: string
          settlement_failed?: boolean | null
          status?: string
          total_credits?: number | null
          total_debits?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      settlements: {
        Row: {
          asset: string | null
          confirmations: number | null
          created_at: string
          currency: string
          destination_address: string | null
          exchange: string | null
          fees_collected: number | null
          id: string
          metadata: Json | null
          net_amount: number
          network: string | null
          notes: string | null
          period_end: string
          period_start: string
          processed_at: string | null
          processed_by: string | null
          required_confirmations: number | null
          settlement_date: string
          settlement_reference: string | null
          settlement_type: string
          status: string
          total_amount: number
          transaction_count: number | null
          transaction_fee: number | null
          transaction_hash: string | null
          updated_at: string
          usd_value: number | null
          user_count: number | null
        }
        Insert: {
          asset?: string | null
          confirmations?: number | null
          created_at?: string
          currency?: string
          destination_address?: string | null
          exchange?: string | null
          fees_collected?: number | null
          id?: string
          metadata?: Json | null
          net_amount: number
          network?: string | null
          notes?: string | null
          period_end: string
          period_start: string
          processed_at?: string | null
          processed_by?: string | null
          required_confirmations?: number | null
          settlement_date: string
          settlement_reference?: string | null
          settlement_type: string
          status?: string
          total_amount: number
          transaction_count?: number | null
          transaction_fee?: number | null
          transaction_hash?: string | null
          updated_at?: string
          usd_value?: number | null
          user_count?: number | null
        }
        Update: {
          asset?: string | null
          confirmations?: number | null
          created_at?: string
          currency?: string
          destination_address?: string | null
          exchange?: string | null
          fees_collected?: number | null
          id?: string
          metadata?: Json | null
          net_amount?: number
          network?: string | null
          notes?: string | null
          period_end?: string
          period_start?: string
          processed_at?: string | null
          processed_by?: string | null
          required_confirmations?: number | null
          settlement_date?: string
          settlement_reference?: string | null
          settlement_type?: string
          status?: string
          total_amount?: number
          transaction_count?: number | null
          transaction_fee?: number | null
          transaction_hash?: string | null
          updated_at?: string
          usd_value?: number | null
          user_count?: number | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          created_at: string
          id: string
          is_admin: boolean
          is_read: boolean
          message: string
          read_at: string | null
          ticket_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_admin?: boolean
          is_read?: boolean
          message: string
          read_at?: string | null
          ticket_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_admin?: boolean
          is_read?: boolean
          message?: string
          read_at?: string | null
          ticket_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_chat_quick_topics: {
        Row: {
          auto_reply: string
          created_at: string
          is_active: boolean
          label: string
          prompt: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          auto_reply: string
          created_at?: string
          is_active?: boolean
          label: string
          prompt: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          auto_reply?: string
          created_at?: string
          is_active?: boolean
          label?: string
          prompt?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          id: string
          last_message_at: string
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          id?: string
          last_message_at?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          id?: string
          last_message_at?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_user_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_id_mismatches"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_user_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      system_limits: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          effective_from: string | null
          effective_until: string | null
          id: string
          is_active: boolean
          limit_type: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
          user_type: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency: string
          description?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean
          limit_type: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          user_type?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          is_active?: boolean
          limit_type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          user_type?: string | null
        }
        Relationships: []
      }
      system_wallets: {
        Row: {
          btc_inventory: number
          btc_main_address: string | null
          btc_pending_inventory: number
          created_at: string
          eth_inventory: number
          eth_main_address: string | null
          eth_pending_inventory: number
          id: number
          ngn_float_balance: number
          ngn_pending_float: number
          sol_inventory: number
          sol_main_address: string | null
          sol_pending_inventory: number
          updated_at: string
          usdc_eth_main_address: string | null
          usdc_inventory: number
          usdc_pending_inventory: number
          usdc_sol_main_address: string | null
          usdt_eth_main_address: string | null
          usdt_inventory: number
          usdt_pending_inventory: number
          usdt_tron_main_address: string | null
          xrp_inventory: number
          xrp_main_address: string | null
          xrp_pending_inventory: number
        }
        Insert: {
          btc_inventory?: number
          btc_main_address?: string | null
          btc_pending_inventory?: number
          created_at?: string
          eth_inventory?: number
          eth_main_address?: string | null
          eth_pending_inventory?: number
          id?: number
          ngn_float_balance?: number
          ngn_pending_float?: number
          sol_inventory?: number
          sol_main_address?: string | null
          sol_pending_inventory?: number
          updated_at?: string
          usdc_eth_main_address?: string | null
          usdc_inventory?: number
          usdc_pending_inventory?: number
          usdc_sol_main_address?: string | null
          usdt_eth_main_address?: string | null
          usdt_inventory?: number
          usdt_pending_inventory?: number
          usdt_tron_main_address?: string | null
          xrp_inventory?: number
          xrp_main_address?: string | null
          xrp_pending_inventory?: number
        }
        Update: {
          btc_inventory?: number
          btc_main_address?: string | null
          btc_pending_inventory?: number
          created_at?: string
          eth_inventory?: number
          eth_main_address?: string | null
          eth_pending_inventory?: number
          id?: number
          ngn_float_balance?: number
          ngn_pending_float?: number
          sol_inventory?: number
          sol_main_address?: string | null
          sol_pending_inventory?: number
          updated_at?: string
          usdc_eth_main_address?: string | null
          usdc_inventory?: number
          usdc_pending_inventory?: number
          usdc_sol_main_address?: string | null
          usdt_eth_main_address?: string | null
          usdt_inventory?: number
          usdt_pending_inventory?: number
          usdt_tron_main_address?: string | null
          xrp_inventory?: number
          xrp_main_address?: string | null
          xrp_pending_inventory?: number
        }
        Relationships: []
      }
      transaction_anomalies: {
        Row: {
          analysis_notes: string | null
          anomaly_type: string
          created_at: string
          detected_at: string
          detected_by: string | null
          detection_rules: Json | null
          id: string
          resolution_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_score: number | null
          severity: string
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          analysis_notes?: string | null
          anomaly_type: string
          created_at?: string
          detected_at?: string
          detected_by?: string | null
          detection_rules?: Json | null
          id?: string
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_score?: number | null
          severity?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          analysis_notes?: string | null
          anomaly_type?: string
          created_at?: string
          detected_at?: string
          detected_by?: string | null
          detection_rules?: Json | null
          id?: string
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_score?: number | null
          severity?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_anomalies_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          auto_sell_id: string | null
          auto_sold: boolean | null
          block_number: number | null
          completed_at: string | null
          confirmations: number | null
          confirmed_at: string | null
          created_at: string
          crypto_amount: number | null
          crypto_currency: string
          error_message: string | null
          external_order_id: string | null
          external_reference: string | null
          external_transaction_id: string | null
          fee_amount: number | null
          fee_currency: string | null
          fee_percentage: number | null
          fiat_amount: number | null
          fiat_currency: string | null
          from_address: string | null
          id: string
          metadata: Json | null
          network: string
          notes: string | null
          related_transaction_id: string | null
          status: string
          to_address: string | null
          transaction_hash: string | null
          transaction_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_sell_id?: string | null
          auto_sold?: boolean | null
          block_number?: number | null
          completed_at?: string | null
          confirmations?: number | null
          confirmed_at?: string | null
          created_at?: string
          crypto_amount?: number | null
          crypto_currency: string
          error_message?: string | null
          external_order_id?: string | null
          external_reference?: string | null
          external_transaction_id?: string | null
          fee_amount?: number | null
          fee_currency?: string | null
          fee_percentage?: number | null
          fiat_amount?: number | null
          fiat_currency?: string | null
          from_address?: string | null
          id?: string
          metadata?: Json | null
          network?: string
          notes?: string | null
          related_transaction_id?: string | null
          status?: string
          to_address?: string | null
          transaction_hash?: string | null
          transaction_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_sell_id?: string | null
          auto_sold?: boolean | null
          block_number?: number | null
          completed_at?: string | null
          confirmations?: number | null
          confirmed_at?: string | null
          created_at?: string
          crypto_amount?: number | null
          crypto_currency?: string
          error_message?: string | null
          external_order_id?: string | null
          external_reference?: string | null
          external_transaction_id?: string | null
          fee_amount?: number | null
          fee_currency?: string | null
          fee_percentage?: number | null
          fiat_amount?: number | null
          fiat_currency?: string | null
          from_address?: string | null
          id?: string
          metadata?: Json | null
          network?: string
          notes?: string | null
          related_transaction_id?: string | null
          status?: string
          to_address?: string | null
          transaction_hash?: string | null
          transaction_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_auto_sell_id_fkey"
            columns: ["auto_sell_id"]
            isOneToOne: false
            referencedRelation: "auto_sell_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_related_transaction_id_fkey"
            columns: ["related_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          asset: string | null
          channels_sent: string[] | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          sent_at: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          asset?: string | null
          channels_sent?: string[] | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sent_at?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          asset?: string | null
          channels_sent?: string[] | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sent_at?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      treasury_permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          permissions: Json
          role_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          permissions?: Json
          role_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          permissions?: Json
          role_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      treasury_reconciliation_status: {
        Row: {
          alert_sent_at: string | null
          asset: string
          auto_resolve_enabled: boolean | null
          available_liquidity: number | null
          created_at: string
          difference: number
          difference_percentage: number | null
          freeze_reason: string | null
          frozen_at: string | null
          frozen_by: string | null
          health_score: number | null
          health_status: string | null
          id: string
          is_frozen: boolean
          is_low_balance: boolean | null
          is_negative_inventory: boolean | null
          is_on_chain_lower: boolean | null
          last_auto_resolved_at: string | null
          last_reconciled_at: string | null
          ledger_balance: number
          liquidity_percentage: number | null
          low_balance_threshold: number | null
          minimum_liquidity_threshold: number | null
          negative_threshold: number | null
          on_chain_balance: number
          reconciliation_notes: string | null
          status: string
          tolerance_percentage: number | null
          tolerance_threshold: number | null
          updated_at: string
        }
        Insert: {
          alert_sent_at?: string | null
          asset: string
          auto_resolve_enabled?: boolean | null
          available_liquidity?: number | null
          created_at?: string
          difference?: number
          difference_percentage?: number | null
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          health_score?: number | null
          health_status?: string | null
          id?: string
          is_frozen?: boolean
          is_low_balance?: boolean | null
          is_negative_inventory?: boolean | null
          is_on_chain_lower?: boolean | null
          last_auto_resolved_at?: string | null
          last_reconciled_at?: string | null
          ledger_balance?: number
          liquidity_percentage?: number | null
          low_balance_threshold?: number | null
          minimum_liquidity_threshold?: number | null
          negative_threshold?: number | null
          on_chain_balance?: number
          reconciliation_notes?: string | null
          status?: string
          tolerance_percentage?: number | null
          tolerance_threshold?: number | null
          updated_at?: string
        }
        Update: {
          alert_sent_at?: string | null
          asset?: string
          auto_resolve_enabled?: boolean | null
          available_liquidity?: number | null
          created_at?: string
          difference?: number
          difference_percentage?: number | null
          freeze_reason?: string | null
          frozen_at?: string | null
          frozen_by?: string | null
          health_score?: number | null
          health_status?: string | null
          id?: string
          is_frozen?: boolean
          is_low_balance?: boolean | null
          is_negative_inventory?: boolean | null
          is_on_chain_lower?: boolean | null
          last_auto_resolved_at?: string | null
          last_reconciled_at?: string | null
          ledger_balance?: number
          liquidity_percentage?: number | null
          low_balance_threshold?: number | null
          minimum_liquidity_threshold?: number | null
          negative_threshold?: number | null
          on_chain_balance?: number
          reconciliation_notes?: string | null
          status?: string
          tolerance_percentage?: number | null
          tolerance_threshold?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      treasury_reports: {
        Row: {
          created_at: string
          end_date: string | null
          export_count: number | null
          exported_at: string | null
          file_path: string | null
          file_size_bytes: number | null
          generated_at: string | null
          generated_by: string | null
          id: string
          is_export_ready: boolean
          is_regulatory: boolean
          metadata: Json | null
          notes: string | null
          period_end: string
          period_start: string
          regulatory_category: string | null
          regulatory_compliant: boolean
          report_data: Json
          report_format: string
          report_type: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          export_count?: number | null
          exported_at?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          is_export_ready?: boolean
          is_regulatory?: boolean
          metadata?: Json | null
          notes?: string | null
          period_end: string
          period_start: string
          regulatory_category?: string | null
          regulatory_compliant?: boolean
          report_data?: Json
          report_format?: string
          report_type: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          export_count?: number | null
          exported_at?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          is_export_ready?: boolean
          is_regulatory?: boolean
          metadata?: Json | null
          notes?: string | null
          period_end?: string
          period_start?: string
          regulatory_category?: string | null
          regulatory_compliant?: boolean
          report_data?: Json
          report_format?: string
          report_type?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      treasury_risk_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          asset: string | null
          created_at: string
          current_value: number | null
          description: string
          details: Json | null
          difference: number | null
          id: string
          resolved_at: string | null
          severity: string
          status: string
          threshold_value: number | null
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          asset?: string | null
          created_at?: string
          current_value?: number | null
          description: string
          details?: Json | null
          difference?: number | null
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          threshold_value?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          asset?: string | null
          created_at?: string
          current_value?: number | null
          description?: string
          details?: Json | null
          difference?: number | null
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          threshold_value?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      treasury_threshold_rules: {
        Row: {
          alert_channels: string[] | null
          alert_frequency_minutes: number | null
          alert_on_critical: boolean
          alert_on_minimum: boolean
          asset: string
          auto_disable_trading: boolean
          created_at: string
          created_by: string | null
          critical_balance: number
          id: string
          is_active: boolean
          last_alert_sent_at: string | null
          minimum_balance: number
          notes: string | null
          optimal_balance: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_channels?: string[] | null
          alert_frequency_minutes?: number | null
          alert_on_critical?: boolean
          alert_on_minimum?: boolean
          asset: string
          auto_disable_trading?: boolean
          created_at?: string
          created_by?: string | null
          critical_balance?: number
          id?: string
          is_active?: boolean
          last_alert_sent_at?: string | null
          minimum_balance?: number
          notes?: string | null
          optimal_balance?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_channels?: string[] | null
          alert_frequency_minutes?: number | null
          alert_on_critical?: boolean
          alert_on_minimum?: boolean
          asset?: string
          auto_disable_trading?: boolean
          created_at?: string
          created_by?: string | null
          critical_balance?: number
          id?: string
          is_active?: boolean
          last_alert_sent_at?: string | null
          minimum_balance?: number
          notes?: string | null
          optimal_balance?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      treasury_wallet_addresses: {
        Row: {
          address: string
          asset: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string | null
          network: string
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address: string
          asset: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          network?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string
          asset?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          network?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      treasury_wallet_balances: {
        Row: {
          asset: string
          balance: number
          balance_usd: number | null
          created_at: string
          fetch_error: string | null
          id: string
          last_fetched_at: string | null
          updated_at: string
          wallet_id: string
        }
        Insert: {
          asset: string
          balance?: number
          balance_usd?: number | null
          created_at?: string
          fetch_error?: string | null
          id?: string
          last_fetched_at?: string | null
          updated_at?: string
          wallet_id: string
        }
        Update: {
          asset?: string
          balance?: number
          balance_usd?: number | null
          created_at?: string
          fetch_error?: string | null
          id?: string
          last_fetched_at?: string | null
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treasury_wallet_balances_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "treasury_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_wallets: {
        Row: {
          btc_address: string | null
          created_at: string
          description: string | null
          eth_address: string | null
          id: string
          is_active: boolean
          name: string
          sol_address: string | null
          type: string
          updated_at: string
          usdc_address: string | null
          usdt_address: string | null
          xrp_address: string | null
        }
        Insert: {
          btc_address?: string | null
          created_at?: string
          description?: string | null
          eth_address?: string | null
          id?: string
          is_active?: boolean
          name: string
          sol_address?: string | null
          type: string
          updated_at?: string
          usdc_address?: string | null
          usdt_address?: string | null
          xrp_address?: string | null
        }
        Update: {
          btc_address?: string | null
          created_at?: string
          description?: string | null
          eth_address?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sol_address?: string | null
          type?: string
          updated_at?: string
          usdc_address?: string | null
          usdt_address?: string | null
          xrp_address?: string | null
        }
        Relationships: []
      }
      user_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at: string | null
          id: string
          is_default: boolean | null
          is_verified: boolean | null
          metadata: Json | null
          updated_at: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          metadata?: Json | null
          updated_at?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string
          bank_name?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          metadata?: Json | null
          updated_at?: string | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          auto_sell_btc: boolean | null
          auto_sell_crypto: boolean | null
          auto_sell_eth: boolean | null
          auto_sell_sol: boolean | null
          auto_sell_xrp: boolean | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_sell_btc?: boolean | null
          auto_sell_crypto?: boolean | null
          auto_sell_eth?: boolean | null
          auto_sell_sol?: boolean | null
          auto_sell_xrp?: boolean | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_sell_btc?: boolean | null
          auto_sell_crypto?: boolean | null
          auto_sell_eth?: boolean | null
          auto_sell_sol?: boolean | null
          auto_sell_xrp?: boolean | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_price_alerts: {
        Row: {
          alert_type: string
          created_at: string
          crypto_symbol: string
          direction: string | null
          id: string
          is_enabled: boolean
          last_triggered_at: string | null
          notes: string | null
          notify_on_down: boolean
          notify_on_up: boolean
          percentage_threshold: number | null
          target_price_usd: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          crypto_symbol: string
          direction?: string | null
          id?: string
          is_enabled?: boolean
          last_triggered_at?: string | null
          notes?: string | null
          notify_on_down?: boolean
          notify_on_up?: boolean
          percentage_threshold?: number | null
          target_price_usd?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          crypto_symbol?: string
          direction?: string | null
          id?: string
          is_enabled?: boolean
          last_triggered_at?: string | null
          notes?: string | null
          notify_on_down?: boolean
          notify_on_up?: boolean
          percentage_threshold?: number | null
          target_price_usd?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          account_status: string
          address: string | null
          avatar_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          email: string | null
          email_notifications: boolean
          enable_biometric: boolean
          full_name: string | null
          hash_pin: string | null
          id: string
          is_admin: boolean
          phone_number: string | null
          push_notifications: boolean
          referral_code: string | null
          referred_by: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: string
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          email_notifications?: boolean
          enable_biometric?: boolean
          full_name?: string | null
          hash_pin?: string | null
          id?: string
          is_admin?: boolean
          phone_number?: string | null
          push_notifications?: boolean
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: string
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          email_notifications?: boolean
          enable_biometric?: boolean
          full_name?: string | null
          hash_pin?: string | null
          id?: string
          is_admin?: boolean
          phone_number?: string | null
          push_notifications?: boolean
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_treasury_roles: {
        Row: {
          approval_workflow: Json | null
          assigned_at: string | null
          assigned_by: string | null
          created_at: string
          id: string
          is_active: boolean
          requires_approval: boolean
          role_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_workflow?: Json | null
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          requires_approval?: boolean
          role_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_workflow?: Json | null
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          requires_approval?: boolean
          role_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_wallets: {
        Row: {
          btc_balance: number
          created_at: string
          eth_balance: number
          ngn_balance: number
          sol_balance: number
          updated_at: string
          usdc_balance: number
          usdt_balance: number
          user_id: string
          xrp_balance: number
        }
        Insert: {
          btc_balance?: number
          created_at?: string
          eth_balance?: number
          ngn_balance?: number
          sol_balance?: number
          updated_at?: string
          usdc_balance?: number
          usdt_balance?: number
          user_id: string
          xrp_balance?: number
        }
        Update: {
          btc_balance?: number
          created_at?: string
          eth_balance?: number
          ngn_balance?: number
          sol_balance?: number
          updated_at?: string
          usdc_balance?: number
          usdt_balance?: number
          user_id?: string
          xrp_balance?: number
        }
        Relationships: []
      }
      wallet_balances: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          locked: number
          locked_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency: string
          id?: string
          locked?: number
          locked_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          locked?: number
          locked_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_registry: {
        Row: {
          asset: string
          blockchain_network: string
          created_at: string
          current_balance: number | null
          daily_withdrawal_limit: number | null
          deprecated_at: string | null
          deprecated_reason: string | null
          environment: string
          id: string
          is_active: boolean
          is_deprecated: boolean
          last_balance_check_at: string | null
          last_rotated_at: string | null
          metadata: Json | null
          monthly_withdrawal_limit: number | null
          notes: string | null
          polling_schedule_minutes: number | null
          rotation_schedule_days: number | null
          single_transaction_limit: number | null
          updated_at: string
          wallet_address: string
          wallet_name: string
          wallet_type_id: string
          weekly_withdrawal_limit: number | null
        }
        Insert: {
          asset: string
          blockchain_network: string
          created_at?: string
          current_balance?: number | null
          daily_withdrawal_limit?: number | null
          deprecated_at?: string | null
          deprecated_reason?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          is_deprecated?: boolean
          last_balance_check_at?: string | null
          last_rotated_at?: string | null
          metadata?: Json | null
          monthly_withdrawal_limit?: number | null
          notes?: string | null
          polling_schedule_minutes?: number | null
          rotation_schedule_days?: number | null
          single_transaction_limit?: number | null
          updated_at?: string
          wallet_address: string
          wallet_name: string
          wallet_type_id: string
          weekly_withdrawal_limit?: number | null
        }
        Update: {
          asset?: string
          blockchain_network?: string
          created_at?: string
          current_balance?: number | null
          daily_withdrawal_limit?: number | null
          deprecated_at?: string | null
          deprecated_reason?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          is_deprecated?: boolean
          last_balance_check_at?: string | null
          last_rotated_at?: string | null
          metadata?: Json | null
          monthly_withdrawal_limit?: number | null
          notes?: string | null
          polling_schedule_minutes?: number | null
          rotation_schedule_days?: number | null
          single_transaction_limit?: number | null
          updated_at?: string
          wallet_address?: string
          wallet_name?: string
          wallet_type_id?: string
          weekly_withdrawal_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_registry_wallet_type_id_fkey"
            columns: ["wallet_type_id"]
            isOneToOne: false
            referencedRelation: "wallet_types"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          max_balance_threshold: number | null
          name: string
          security_level: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          max_balance_threshold?: number | null
          name: string
          security_level: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          max_balance_threshold?: number | null
          name?: string
          security_level?: number
        }
        Relationships: []
      }
      wallets: {
        Row: {
          created_at: string
          id: string
          ngn_balance: number
          updated_at: string
          usd_balance: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ngn_balance?: number
          updated_at?: string
          usd_balance?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ngn_balance?: number
          updated_at?: string
          usd_balance?: number
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_transactions: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          currency: string
          description: string | null
          error_code: string | null
          error_message: string | null
          external_reference: string | null
          external_transaction_id: string | null
          id: string
          metadata: Json | null
          status: string
          transaction_type: string
          updated_at: string
          user_id: string
          withdrawal_id: string
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          error_code?: string | null
          error_message?: string | null
          external_reference?: string | null
          external_transaction_id?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          transaction_type: string
          updated_at?: string
          user_id: string
          withdrawal_id: string
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          error_code?: string | null
          error_message?: string | null
          external_reference?: string | null
          external_transaction_id?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          transaction_type?: string
          updated_at?: string
          user_id?: string
          withdrawal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_transactions_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          account_name: string
          account_number: string
          amount: number
          bank_code: string | null
          bank_name: string
          created_at: string
          currency: string
          fee_amount: number | null
          id: string
          metadata: Json | null
          status: string
          transfer_id: string | null
          transfer_reference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          amount: number
          bank_code?: string | null
          bank_name: string
          created_at?: string
          currency?: string
          fee_amount?: number | null
          id?: string
          metadata?: Json | null
          status?: string
          transfer_id?: string | null
          transfer_reference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          amount?: number
          bank_code?: string | null
          bank_name?: string
          created_at?: string
          currency?: string
          fee_amount?: number | null
          id?: string
          metadata?: Json | null
          status?: string
          transfer_id?: string | null
          transfer_reference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_revenue_summary: {
        Row: {
          avg_fee_percentage: number | null
          currency: string | null
          first_revenue_date: string | null
          last_revenue_date: string | null
          revenue_type: string | null
          source: string | null
          total_amount: number | null
          total_amount_ngn: number | null
          transaction_count: number | null
        }
        Relationships: []
      }
      auto_sell_stats: {
        Row: {
          avg_rate: number | null
          crypto_currency: string | null
          last_conversion_at: string | null
          total_conversions: number | null
          total_crypto_amount: number | null
          total_ngn_amount: number | null
          user_id: string | null
        }
        Relationships: []
      }
      user_profile_id_mismatches: {
        Row: {
          auth_user_exists: string | null
          auth_user_id: string | null
          email: string | null
          profile_id: string | null
          status: string | null
        }
        Insert: {
          auth_user_exists?: never
          auth_user_id?: string | null
          email?: string | null
          profile_id?: string | null
          status?: never
        }
        Update: {
          auth_user_exists?: never
          auth_user_id?: string | null
          email?: string | null
          profile_id?: string | null
          status?: never
        }
        Relationships: []
      }
    }
    Functions: {
      activate_kill_switch: {
        Args: { p_activated_by?: string; p_reason: string }
        Returns: Json
      }
      admin_activate_user: {
        Args: { p_admin_user_id: string; p_user_id: string }
        Returns: boolean
      }
      admin_approve_verification: {
        Args: { p_admin_user_id: string; p_verification_id: string }
        Returns: Json
      }
      admin_credit_balance: {
        Args: {
          p_admin_user_id: string
          p_amount: number
          p_currency: string
          p_reason: string
          p_user_id: string
        }
        Returns: boolean
      }
      admin_debit_balance: {
        Args: {
          p_admin_user_id: string
          p_amount: number
          p_currency: string
          p_reason: string
          p_user_id: string
        }
        Returns: boolean
      }
      admin_refund_transaction: {
        Args: {
          p_admin_user_id: string
          p_refund_reason?: string
          p_transaction_id: string
        }
        Returns: {
          error_message: string
          new_balance: number
          refunded_amount: number
          refunded_currency: string
          success: boolean
        }[]
      }
      admin_reject_verification: {
        Args: {
          p_admin_user_id: string
          p_rejection_reason: string
          p_verification_id: string
        }
        Returns: Json
      }
      admin_suspend_user: {
        Args: { p_admin_user_id: string; p_user_id: string }
        Returns: boolean
      }
      admin_view_verifications: {
        Args: {
          p_admin_user_id: string
          p_limit?: number
          p_offset?: number
          p_status?: string
        }
        Returns: {
          address: string
          created_at: string
          full_name: string
          id: string
          nin: string
          nin_back_url: string
          nin_front_url: string
          passport_photo_url: string
          phone_number: string
          rejection_reason: string
          reviewed_at: string
          reviewed_by: string
          reviewer_email: string
          status: string
          submitted_at: string
          updated_at: string
          user_email: string
          user_id: string
        }[]
      }
      aggregate_prices: { Args: { p_asset: string }; Returns: Json }
      auto_verify_pending_payments: {
        Args: never
        Returns: {
          error_count: number
          failed_count: number
          verified_count: number
        }[]
      }
      bytea_to_text: { Args: { data: string }; Returns: string }
      calculate_treasury_health_score: {
        Args: { p_asset: string }
        Returns: Json
      }
      cancel_account_deletion_request: {
        Args: { p_deletion_id: string; p_user_id: string }
        Returns: boolean
      }
      cancel_custom_gift_card: {
        Args: { p_code: string; p_user_id: string }
        Returns: {
          error_message: string
          success: boolean
        }[]
      }
      check_and_create_risk_alerts: {
        Args: {
          p_asset: string
          p_is_low: boolean
          p_is_negative: boolean
          p_is_on_chain_lower: boolean
          p_ledger_balance: number
          p_on_chain_balance?: number
          p_status: string
        }
        Returns: undefined
      }
      check_asset_auto_disable: { Args: { p_asset: string }; Returns: boolean }
      check_balance_threshold: {
        Args: { p_asset: string; p_current_balance: number }
        Returns: {
          is_below_critical: boolean
          is_below_minimum: boolean
          should_disable_trading: boolean
          threshold_rule: Json
        }[]
      }
      check_bitcoin_deposit_status: {
        Args: { p_transaction_id: string }
        Returns: {
          confirmations: number
          needs_credit: boolean
          status: string
          transaction_id: string
        }[]
      }
      check_ngn_float_threshold: { Args: never; Returns: Json }
      confirm_pending_adjustment: {
        Args: {
          p_adjustment_id: string
          p_transaction_hash?: string
          p_verified_by?: string
        }
        Returns: Json
      }
      create_account_deletion_request: {
        Args: {
          p_grace_period_days?: number
          p_reason?: string
          p_user_id: string
        }
        Returns: string
      }
      create_custom_gift_card: {
        Args: {
          p_amount: number
          p_card_type?: string
          p_created_by: string
          p_created_for_user_id?: string
          p_currency?: string
          p_description?: string
          p_design_color?: string
          p_design_image_url?: string
          p_expires_in_days?: number
          p_is_promotional?: boolean
          p_is_reloadable?: boolean
          p_is_transferable?: boolean
          p_metadata?: Json
          p_personal_message?: string
          p_promotional_code?: string
          p_recipient_email?: string
          p_recipient_name?: string
          p_recipient_phone?: string
          p_tags?: string[]
          p_title?: string
        }
        Returns: {
          code: string
          error_message: string
          gift_card_id: string
          success: boolean
        }[]
      }
      create_gift_card_sale: {
        Args: {
          p_amount: number
          p_card_category: string
          p_card_subcategory: string
          p_card_type: string
          p_currency?: string
          p_image_urls?: Json
          p_user_id: string
        }
        Returns: string
      }
      create_inventory_adjustment: {
        Args: {
          p_adjustment_type: string
          p_amount: number
          p_asset: string
          p_blockchain_network?: string
          p_metadata?: Json
          p_notes?: string
          p_operation: string
          p_performed_by?: string
          p_reason: string
          p_source_reference?: string
          p_transaction_hash?: string
          p_wallet_address?: string
        }
        Returns: Json
      }
      create_notification: {
        Args: {
          p_data?: Json
          p_message: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_referral: {
        Args: {
          p_referral_code: string
          p_referred_user_id: string
          p_referrer_user_id: string
          p_reward_amount?: number
          p_reward_currency?: string
        }
        Returns: string
      }
      create_treasury_alert: {
        Args: {
          p_alert_type: string
          p_asset?: string
          p_details?: Json
          p_message: string
          p_severity: string
          p_title: string
        }
        Returns: string
      }
      credit_crypto_wallet: {
        Args: { p_amount: number; p_currency: string; p_user_id: string }
        Returns: undefined
      }
      credit_usd_balance: {
        Args: { p_amount: number; p_user_id: string }
        Returns: boolean
      }
      credit_wallet: {
        Args: { p_amount: number; p_currency?: string; p_user_id: string }
        Returns: boolean
      }
      debit_crypto_wallet: {
        Args: { p_amount: number; p_currency: string; p_user_id: string }
        Returns: undefined
      }
      debit_usd_balance: {
        Args: { p_amount: number; p_user_id: string }
        Returns: boolean
      }
      debit_wallet: {
        Args: { p_amount: number; p_currency?: string; p_user_id: string }
        Returns: boolean
      }
      expire_price_overrides: { Args: never; Returns: undefined }
      expire_unconfirmed_inventory: { Args: never; Returns: number }
      fix_ethereum_transactions_and_balances: {
        Args: never
        Returns: {
          balance_credited: boolean
          new_amount: number
          old_amount: number
          status: string
          transaction_id: string
        }[]
      }
      fix_user_profile_id: { Args: { p_email: string }; Returns: boolean }
      fix_wallet_balances_user_ids: {
        Args: never
        Returns: {
          error_count: number
          fixed_count: number
          merged_count: number
        }[]
      }
      force_reconciliation: {
        Args: {
          p_asset: string
          p_auto_resolve?: boolean
          p_initiated_by?: string
          p_reconciliation_method?: string
          p_resolution_action?: string
          p_resolution_notes?: string
        }
        Returns: Json
      }
      freeze_pricing_globally: {
        Args: { p_admin_user_id?: string; p_freeze: boolean }
        Returns: number
      }
      generate_custom_gift_card_code: {
        Args: { p_prefix?: string }
        Returns: string
      }
      generate_gift_card_code: { Args: never; Returns: string }
      generate_reconciliation_report: {
        Args: {
          p_end_date?: string
          p_generated_by?: string
          p_start_date?: string
        }
        Returns: Json
      }
      get_all_pricing_engine_configs: {
        Args: never
        Returns: {
          asset: string
          buy_spread_percentage: number
          created_at: string
          created_by: string
          frozen_at: string
          frozen_buy_price_ngn: number
          frozen_sell_price_ngn: number
          id: string
          notes: string
          override_buy_price_ngn: number
          override_sell_price_ngn: number
          price_frozen: boolean
          retail_markup_fraction: number
          sell_spread_percentage: number
          trading_enabled: boolean
          updated_at: string
          updated_by: string
        }[]
      }
      get_app_settings: { Args: never; Returns: Json }
      get_available_liquidity: { Args: { p_asset: string }; Returns: number }
      get_bitcoin_addresses_to_monitor: {
        Args: never
        Returns: {
          address: string
          last_checked_at: string
          user_id: string
        }[]
      }
      get_correct_user_id: { Args: { p_user_id: string }; Returns: string }
      get_custom_gift_cards: {
        Args: {
          p_include_expired?: boolean
          p_status?: string
          p_user_id: string
        }
        Returns: {
          amount: number
          balance: number
          card_type: string
          code: string
          created_at: string
          currency: string
          description: string
          design_color: string
          design_image_url: string
          expires_at: string
          id: string
          is_reloadable: boolean
          is_transferable: boolean
          personal_message: string
          recipient_email: string
          recipient_name: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          usage_count: number
          used_at: string
        }[]
      }
      get_due_deletion_requests: {
        Args: never
        Returns: {
          id: string
          reason: string
          requested_at: string
          scheduled_deletion_at: string
          user_id: string
        }[]
      }
      get_latest_price: {
        Args: { p_asset: string }
        Returns: {
          fetched_at: string
          is_fallback: boolean
          price_ngn: number
          price_source: string
          price_usd: number
        }[]
      }
      get_or_create_crypto_price: {
        Args: {
          p_crypto_symbol: string
          p_price_ngn: number
          p_price_usd: number
          p_source?: string
        }
        Returns: string
      }
      get_or_create_support_ticket: {
        Args: { p_category?: string; p_subject?: string; p_user_id: string }
        Returns: string
      }
      get_or_create_user_wallet: {
        Args: { p_user_id: string }
        Returns: {
          btc_balance: number
          created_at: string
          eth_balance: number
          ngn_balance: number
          sol_balance: number
          updated_at: string
          usdc_balance: number
          usdt_balance: number
          user_id: string
          xrp_balance: number
        }
        SetofOptions: {
          from: "*"
          to: "user_wallets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_or_create_wallet_balance: {
        Args: { p_currency: string; p_user_id: string }
        Returns: {
          balance: number
          created_at: string
          currency: string
          id: string
          locked: number
          locked_balance: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wallet_balances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_pending_transactions_for_reconciliation: {
        Args: { p_hours_old?: number }
        Returns: {
          created_at: string
          external_reference: string
          fiat_amount: number
          fiat_currency: string
          id: string
          status: string
          transaction_type: string
          user_id: string
        }[]
      }
      get_pricing_engine_config: {
        Args: { p_asset: string }
        Returns: {
          asset: string
          buy_spread_percentage: number
          frozen_at: string
          frozen_buy_price_ngn: number
          frozen_sell_price_ngn: number
          id: string
          override_buy_price_ngn: number
          override_sell_price_ngn: number
          price_frozen: boolean
          retail_markup_fraction: number
          sell_spread_percentage: number
          trading_enabled: boolean
        }[]
      }
      get_public_app_settings: {
        Args: never
        Returns: {
          app_name: string
          app_version: string
          privacy_policy: string
          support_address: string
          support_email: string
          support_phone: string
          terms_and_conditions: string
        }[]
      }
      get_recent_referrals: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          created_at: string
          id: string
          referral_code: string
          referred_user_id: string
          reward_amount: number
          reward_currency: string
          reward_status: string
        }[]
      }
      get_referral_stats: {
        Args: { p_user_id: string }
        Returns: {
          paid_earnings: number
          paid_referrals: number
          pending_earnings: number
          pending_referrals: number
          total_earnings: number
          total_referrals: number
        }[]
      }
      get_ticket_unread_count: {
        Args: { p_ticket_id: string; p_user_id: string }
        Returns: number
      }
      get_transaction_for_verification: {
        Args: { p_external_reference: string }
        Returns: {
          created_at: string
          external_reference: string
          fiat_amount: number
          fiat_currency: string
          id: string
          status: string
          transaction_type: string
          user_id: string
        }[]
      }
      get_transaction_status_stats: {
        Args: { p_user_id?: string }
        Returns: {
          count: number
          status: string
          total_amount: number
        }[]
      }
      get_unread_notifications_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_deletion_request: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          id: string
          processed_at: string
          reason: string
          requested_at: string
          scheduled_deletion_at: string
          status: string
          updated_at: string
          user_id: string
        }[]
      }
      get_user_gift_card_sales: {
        Args: { p_status?: string; p_user_id: string }
        Returns: {
          admin_notes: string
          amount: number
          card_category: string
          card_subcategory: string
          card_type: string
          created_at: string
          currency: string
          id: string
          image_urls: Json
          payment_transaction_id: string
          rejection_reason: string
          reviewed_at: string
          status: string
          updated_at: string
        }[]
      }
      get_user_gift_cards: {
        Args: { p_status?: string; p_user_id: string }
        Returns: {
          amount: number
          card_category: string
          card_subcategory: string
          card_type: string
          code: string
          created_at: string
          currency: string
          expires_at: string
          id: string
          message: string
          recipient_email: string
          recipient_name: string
          redeemed_at: string
          status: string
          updated_at: string
        }[]
      }
      get_user_verification_status: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_withdrawal_transaction_summary: {
        Args: { p_withdrawal_id: string }
        Returns: {
          completed_count: number
          failed_count: number
          total_debits: number
          total_fees: number
          total_refunds: number
          transaction_count: number
        }[]
      }
      grant_admin_access: { Args: { user_email: string }; Returns: boolean }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      instant_buy_crypto: {
        Args: {
          p_asset: string
          p_fee_percentage?: number
          p_min_system_reserve?: number
          p_ngn_amount: number
          p_rate: number
          p_user_id: string
        }
        Returns: {
          crypto_amount: number
          error_message: string
          new_balances: Json
          success: boolean
        }[]
      }
      instant_sell_crypto: {
        Args: {
          p_crypto_amount: number
          p_crypto_currency: string
          p_platform_fee_percentage?: number
          p_price_per_unit: number
          p_user_id: string
        }
        Returns: {
          error_message: string
          new_crypto_balance: number
          new_ngn_balance: number
          ngn_credited: number
          platform_fee: number
          success: boolean
        }[]
      }
      instant_sell_crypto_v2: {
        Args: {
          p_amount: number
          p_asset: string
          p_fee_percentage?: number
          p_max_sell_per_transaction?: number
          p_min_system_reserve?: number
          p_rate: number
          p_user_id: string
        }
        Returns: {
          error_message: string
          new_balances: Json
          ngn_amount: number
          success: boolean
        }[]
      }
      is_user_admin: { Args: { check_user_id: string }; Returns: boolean }
      lock_btc_for_sell: {
        Args: { p_btc_amount: number; p_user_id: string }
        Returns: boolean
      }
      manual_complete_transaction: {
        Args: {
          p_admin_user_id: string
          p_external_transaction_id?: string
          p_transaction_id: string
        }
        Returns: boolean
      }
      mark_all_notifications_as_read: {
        Args: { p_user_id: string }
        Returns: number
      }
      mark_deletion_completed: {
        Args: { p_deletion_id: string }
        Returns: boolean
      }
      mark_deletion_failed: {
        Args: { p_deletion_id: string; p_error_message?: string }
        Returns: boolean
      }
      mark_deletion_processing: {
        Args: { p_deletion_id: string }
        Returns: boolean
      }
      mark_notification_as_read: {
        Args: { p_notification_id: string; p_user_id: string }
        Returns: boolean
      }
      mark_referral_reward_paid: {
        Args: {
          p_admin_user_id: string
          p_payment_transaction_id?: string
          p_referral_id: string
        }
        Returns: boolean
      }
      mark_ticket_messages_as_read: {
        Args: { p_ticket_id: string; p_user_id: string }
        Returns: number
      }
      purchase_gift_card: {
        Args: {
          p_amount: number
          p_card_category: string
          p_card_subcategory: string
          p_card_type?: string
          p_currency?: string
          p_expires_in_days?: number
          p_message?: string
          p_recipient_email?: string
          p_recipient_name?: string
          p_user_id: string
        }
        Returns: {
          code: string
          error_message: string
          gift_card_id: string
          success: boolean
        }[]
      }
      reconcile_inventory: {
        Args: { p_asset?: string }
        Returns: {
          actual_inventory: number
          asset: string
          discrepancy: number
          expected_inventory: number
          status: string
        }[]
      }
      record_admin_revenue: {
        Args: {
          p_amount: number
          p_base_amount?: number
          p_currency: string
          p_fee_percentage?: number
          p_metadata?: Json
          p_notes?: string
          p_revenue_type: string
          p_source: string
          p_transaction_id?: string
          p_user_id?: string
        }
        Returns: string
      }
      redeem_gift_card: {
        Args: { p_code: string; p_user_id: string }
        Returns: {
          amount: number
          currency: string
          error_message: string
          success: boolean
        }[]
      }
      reload_custom_gift_card: {
        Args: { p_amount: number; p_code: string }
        Returns: {
          error_message: string
          new_balance: number
          success: boolean
        }[]
      }
      resolve_discrepancy: {
        Args: {
          p_adjustment_id?: string
          p_asset: string
          p_resolution_action: string
          p_resolution_notes: string
          p_resolved_by?: string
          p_transaction_hash?: string
        }
        Returns: Json
      }
      revoke_admin_access: { Args: { user_email: string }; Returns: boolean }
      safe_update_inventory: {
        Args: {
          p_amount: number
          p_asset: string
          p_operation: string
          p_performed_by?: string
          p_reason?: string
        }
        Returns: Json
      }
      send_transaction_email_notification: {
        Args: {
          p_notification_data: Json
          p_notification_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      set_pricing_engine_config: {
        Args: {
          p_admin_user_id?: string
          p_asset: string
          p_buy_spread_percentage?: number
          p_notes?: string
          p_override_buy_price_ngn?: number
          p_override_sell_price_ngn?: number
          p_price_frozen?: boolean
          p_retail_markup_fraction?: number
          p_sell_spread_percentage?: number
          p_trading_enabled?: boolean
        }
        Returns: string
      }
      swap_crypto: {
        Args: {
          p_from_amount: number
          p_from_asset: string
          p_from_sell_price: number
          p_min_system_reserve?: number
          p_swap_fee_percentage?: number
          p_to_asset: string
          p_to_buy_price: number
          p_user_id: string
        }
        Returns: {
          error_message: string
          from_amount: number
          new_balances: Json
          success: boolean
          swap_fee: number
          to_amount: number
          value_in_ngn: number
        }[]
      }
      sync_usd_balance: { Args: { p_user_id: string }; Returns: boolean }
      sync_user_wallet_from_balances: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      unlock_btc_for_sell: {
        Args: { p_btc_amount: number; p_user_id: string }
        Returns: boolean
      }
      update_app_settings: {
        Args: {
          p_additional_settings?: Json
          p_admin_user_id?: string
          p_app_name?: string
          p_app_version?: string
          p_kyc_required?: boolean
          p_maintenance_mode?: boolean
          p_max_withdrawal_amount?: number
          p_min_withdrawal_amount?: number
          p_privacy_policy?: string
          p_registration_enabled?: boolean
          p_support_address?: string
          p_support_email?: string
          p_support_phone?: string
          p_terms_and_conditions?: string
          p_transaction_fee?: number
          p_transaction_fee_percentage?: number
          p_withdrawal_fee?: number
        }
        Returns: number
      }
      update_gift_card_sale_status: {
        Args: {
          p_admin_notes?: string
          p_admin_user_id: string
          p_rejection_reason?: string
          p_sale_id: string
          p_status: string
        }
        Returns: boolean
      }
      update_on_chain_balance: {
        Args: {
          p_asset: string
          p_fetch_error?: string
          p_ledger_inventory?: number
          p_on_chain_balance: number
          p_wallet_address: string
        }
        Returns: Json
      }
      update_reconciliation_status: {
        Args: {
          p_asset: string
          p_ledger_balance?: number
          p_on_chain_balance?: number
        }
        Returns: Json
      }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      use_custom_gift_card: {
        Args: { p_amount?: number; p_code: string; p_user_id: string }
        Returns: {
          amount_used: number
          error_message: string
          remaining_balance: number
          success: boolean
        }[]
      }
      validate_gift_card_code: {
        Args: { p_code: string }
        Returns: {
          amount: number
          currency: string
          error_message: string
          expires_at: string
          gift_card_id: string
          is_valid: boolean
          status: string
        }[]
      }
      validate_referral_code: {
        Args: { p_code: string }
        Returns: {
          error_message: string
          is_valid: boolean
          user_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
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
