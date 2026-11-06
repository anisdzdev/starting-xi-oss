import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { getEnv } from './env';

let client: SupabaseClient | null = null;

/**
 * Lazy singleton — created on first use so importing this module never throws
 * (important for web static rendering and for checkouts without a .env yet).
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const { supabaseUrl, supabaseAnonKey } = getEnv();
  const isWeb = Platform.OS === 'web';

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Web uses supabase-js's default localStorage handling.
      storage: isWeb ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: isWeb,
    },
  });

  if (!isWeb) {
    // Keep token refresh in sync with app foreground/background state.
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        client?.auth.startAutoRefresh();
      } else {
        client?.auth.stopAutoRefresh();
      }
    });
  }

  return client;
}
