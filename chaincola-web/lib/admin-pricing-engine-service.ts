import { createClient } from '@/lib/supabase/client';

/**
 * PricingEngineConfig type definition
 */
export interface PricingEngineConfig {
  id: string;
  asset: string;
  buy_spread_percentage: number;
  sell_spread_percentage: number;
  /** Buy vs sell wedge for app quotes: buy = sell * (1 + fraction). Example 0.052 = 5.2%. */
  retail_markup_fraction?: number;
  override_buy_price_ngn?: number;
  override_sell_price_ngn?: number;
  trading_enabled: boolean;
  price_frozen: boolean;
  frozen_buy_price_ngn?: number;
  frozen_sell_price_ngn?: number;
  frozen_at?: string;
  notes?: string;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Request type for setting pricing engine config
 */
export interface SetPricingEngineConfigRequest {
  asset: string;
  buy_spread_percentage?: number | null;
  sell_spread_percentage?: number | null;
  /** Stored as decimal fraction e.g. 0.052 = 5.2% retail gap (buy vs sell inference). */
  retail_markup_fraction?: number | null;
  override_buy_price_ngn?: number | null;
  override_sell_price_ngn?: number | null;
  trading_enabled?: boolean;
  price_frozen?: boolean;
  notes?: string;
}

/**
 * Get all pricing engine configs (admin only)
 */
export async function getAllPricingEngineConfigs(): Promise<PricingEngineConfig[]> {
  try {
    const supabase = createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase.rpc('get_all_pricing_engine_configs');

    if (error) {
      console.error('Error fetching pricing engine configs:', error);
      throw new Error(error.message || 'Failed to fetch pricing engine configs');
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((config: any) => ({
      id: config.id,
      asset: config.asset,
      buy_spread_percentage: parseFloat(config.buy_spread_percentage.toString()),
      sell_spread_percentage: parseFloat(config.sell_spread_percentage.toString()),
      retail_markup_fraction:
        config.retail_markup_fraction != null
          ? parseFloat(config.retail_markup_fraction.toString())
          : undefined,
      override_buy_price_ngn: config.override_buy_price_ngn ? parseFloat(config.override_buy_price_ngn.toString()) : undefined,
      override_sell_price_ngn: config.override_sell_price_ngn ? parseFloat(config.override_sell_price_ngn.toString()) : undefined,
      trading_enabled: config.trading_enabled,
      price_frozen: config.price_frozen,
      frozen_buy_price_ngn: config.frozen_buy_price_ngn ? parseFloat(config.frozen_buy_price_ngn.toString()) : undefined,
      frozen_sell_price_ngn: config.frozen_sell_price_ngn ? parseFloat(config.frozen_sell_price_ngn.toString()) : undefined,
      frozen_at: config.frozen_at || undefined,
      notes: config.notes || undefined,
      created_by: config.created_by || undefined,
      updated_by: config.updated_by || undefined,
      created_at: config.created_at,
      updated_at: config.updated_at,
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception fetching pricing engine configs:', msg);
    throw error;
  }
}

/**
 * Set or update pricing engine config (admin only)
 */
export async function setPricingEngineConfig(
  request: SetPricingEngineConfigRequest
): Promise<{ success: boolean; configId?: string; error?: string }> {
  try {
    const supabase = createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated',
      };
    }

    const { data, error } = await supabase.rpc('set_pricing_engine_config', {
      p_asset: request.asset.toUpperCase(),
      p_buy_spread_percentage: request.buy_spread_percentage !== undefined ? request.buy_spread_percentage : null,
      p_sell_spread_percentage: request.sell_spread_percentage !== undefined ? request.sell_spread_percentage : null,
      p_override_buy_price_ngn: request.override_buy_price_ngn !== undefined ? request.override_buy_price_ngn : null,
      p_override_sell_price_ngn: request.override_sell_price_ngn !== undefined ? request.override_sell_price_ngn : null,
      p_trading_enabled: request.trading_enabled !== undefined ? request.trading_enabled : null,
      p_price_frozen: request.price_frozen !== undefined ? request.price_frozen : null,
      p_notes: request.notes || null,
      p_retail_markup_fraction: request.retail_markup_fraction !== undefined ? request.retail_markup_fraction : null,
      p_admin_user_id: user.id,
    });

    if (error) {
      console.error('Error setting pricing engine config:', error);
      return {
        success: false,
        error: error.message || 'Failed to set pricing engine config',
      };
    }

    return {
      success: true,
      configId: data,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception setting pricing engine config:', msg);
    return {
      success: false,
      error: msg || 'Failed to set pricing engine config',
    };
  }
}

/**
 * Freeze or unfreeze prices globally (admin only)
 */
export async function freezePricingGlobally(
  freeze: boolean
): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
  try {
    const supabase = createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated',
      };
    }

    const { data, error } = await supabase.rpc('freeze_pricing_globally', {
      p_freeze: freeze,
      p_admin_user_id: user.id,
    });

    if (error) {
      console.error('Error freezing/unfreezing prices:', error);
      return {
        success: false,
        error: error.message || 'Failed to freeze/unfreeze prices',
      };
    }

    return {
      success: true,
      updatedCount: data,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception freezing/unfreezing prices:', msg);
    return {
      success: false,
      error: msg || 'Failed to freeze/unfreeze prices',
    };
  }
}

/**
 * Get pricing engine config for a specific asset (for application use)
 */
export async function getPricingEngineConfig(
  asset: string
): Promise<PricingEngineConfig | null> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase.rpc('get_pricing_engine_config', {
      p_asset: asset.toUpperCase(),
    });

    if (error) {
      console.error('Error fetching pricing engine config:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const config = data[0];
    return {
      id: config.id,
      asset: config.asset,
      buy_spread_percentage: parseFloat(config.buy_spread_percentage.toString()),
      sell_spread_percentage: parseFloat(config.sell_spread_percentage.toString()),
      retail_markup_fraction:
        config.retail_markup_fraction != null
          ? parseFloat(config.retail_markup_fraction.toString())
          : undefined,
      override_buy_price_ngn: config.override_buy_price_ngn ? parseFloat(config.override_buy_price_ngn.toString()) : undefined,
      override_sell_price_ngn: config.override_sell_price_ngn ? parseFloat(config.override_sell_price_ngn.toString()) : undefined,
      trading_enabled: config.trading_enabled,
      price_frozen: config.price_frozen,
      frozen_buy_price_ngn: config.frozen_buy_price_ngn ? parseFloat(config.frozen_buy_price_ngn.toString()) : undefined,
      frozen_sell_price_ngn: config.frozen_sell_price_ngn ? parseFloat(config.frozen_sell_price_ngn.toString()) : undefined,
      frozen_at: config.frozen_at || undefined,
    };
  } catch (error: unknown) {
    console.error('Exception fetching pricing engine config:', error);
    return null;
  }
}

/**
 * Get pricing engine configs for multiple assets at once (optimized batch fetch)
 * This is more efficient than calling getPricingEngineConfig multiple times
 */
export async function getPricingEngineConfigsBatch(
  assets: string[]
): Promise<Record<string, PricingEngineConfig | null>> {
  try {
    const supabase = createClient();
    
    // Fetch all configs in parallel
    const configPromises = assets.map(async (asset) => {
      try {
        const { data, error } = await supabase.rpc('get_pricing_engine_config', {
          p_asset: asset.toUpperCase(),
        });

        if (error || !data || data.length === 0) {
          return { asset: asset.toUpperCase(), config: null };
        }

        const config = data[0];
        return {
          asset: asset.toUpperCase(),
          config: {
            id: config.id,
            asset: config.asset,
            buy_spread_percentage: parseFloat(config.buy_spread_percentage.toString()),
            sell_spread_percentage: parseFloat(config.sell_spread_percentage.toString()),
            retail_markup_fraction:
              config.retail_markup_fraction != null
                ? parseFloat(config.retail_markup_fraction.toString())
                : undefined,
            override_buy_price_ngn: config.override_buy_price_ngn ? parseFloat(config.override_buy_price_ngn.toString()) : undefined,
            override_sell_price_ngn: config.override_sell_price_ngn ? parseFloat(config.override_sell_price_ngn.toString()) : undefined,
            trading_enabled: config.trading_enabled,
            price_frozen: config.price_frozen,
            frozen_buy_price_ngn: config.frozen_buy_price_ngn ? parseFloat(config.frozen_buy_price_ngn.toString()) : undefined,
            frozen_sell_price_ngn: config.frozen_sell_price_ngn ? parseFloat(config.frozen_sell_price_ngn.toString()) : undefined,
            frozen_at: config.frozen_at || undefined,
            created_at: config.created_at || new Date().toISOString(),
            updated_at: config.updated_at || new Date().toISOString(),
          } as PricingEngineConfig,
        };
      } catch (e) {
        return { asset: asset.toUpperCase(), config: null };
      }
    });

    const results = await Promise.all(configPromises);
    
    // Convert to map
    const configMap: Record<string, PricingEngineConfig | null> = {};
    results.forEach(({ asset, config }) => {
      configMap[asset] = config;
    });

    return configMap;
  } catch (error: unknown) {
    console.error('Exception fetching pricing engine configs batch:', error);
    // Return empty map on error
    const emptyMap: Record<string, PricingEngineConfig | null> = {};
    assets.forEach(asset => {
      emptyMap[asset.toUpperCase()] = null;
    });
    return emptyMap;
  }
}

/**
 * Calculate buy price for an asset using pricing engine.
 * Uses static rate (override) when set; otherwise market price (spreads are not used in admin—static rate only).
 */
export async function getBuyPrice(
  asset: string,
  marketPrice: number
): Promise<{ price: number; source: string }> {
  try {
    const config = await getPricingEngineConfig(asset);
    
    if (!config) {
      return { price: marketPrice, source: 'market' };
    }

    // Check if trading is disabled
    if (!config.trading_enabled) {
      throw new Error(`Trading is currently disabled for ${asset}`);
    }

    // If prices are frozen, use frozen price
    if (config.price_frozen && config.frozen_buy_price_ngn) {
      return { price: config.frozen_buy_price_ngn, source: 'frozen' };
    }

    // Static rate (admin-set override) takes precedence
    if (config.override_buy_price_ngn) {
      return { price: config.override_buy_price_ngn, source: 'static_rate' };
    }

    // Fallback: market price (no spread applied)
    return { price: marketPrice, source: 'market' };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error calculating buy price:', msg);
    // Fallback to market price
    return { price: marketPrice, source: 'market-fallback' };
  }
}

/**
 * Calculate sell price for an asset using pricing engine.
 * Uses static rate (override) when set; otherwise market price (spreads are not used in admin—static rate only).
 */
export async function getSellPrice(
  asset: string,
  marketPrice: number
): Promise<{ price: number; source: string }> {
  try {
    const config = await getPricingEngineConfig(asset);
    
    if (!config) {
      return { price: marketPrice, source: 'market' };
    }

    // Check if trading is disabled
    if (!config.trading_enabled) {
      throw new Error(`Trading is currently disabled for ${asset}`);
    }

    // If prices are frozen, use frozen price
    if (config.price_frozen && config.frozen_sell_price_ngn) {
      return { price: config.frozen_sell_price_ngn, source: 'frozen' };
    }

    // Static rate (admin-set override) takes precedence
    if (config.override_sell_price_ngn) {
      return { price: config.override_sell_price_ngn, source: 'static_rate' };
    }

    // Fallback: market price (no spread applied)
    return { price: marketPrice, source: 'market' };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error calculating sell price:', msg);
    // Fallback to market price
    return { price: marketPrice, source: 'market-fallback' };
  }
}
