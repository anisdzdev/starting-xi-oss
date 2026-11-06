import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Count this invocation in usage_log (free-tier guard; see DEPLOYMENT.md for
 * the budget math). Fire-and-forget — usage accounting must never break a
 * function.
 */
export function logInvocation(admin: SupabaseClient, fn: string): void {
  admin
    .rpc('bump_usage', { p_fn: fn })
    .then(({ error }) => {
      if (error) console.error('usage log failed:', error.message);
    });
}

/** Record a heartbeat in sync_state (stale-data banners read this). */
export async function heartbeat(
  admin: SupabaseClient,
  key: string,
  value: Record<string, unknown>
): Promise<void> {
  const { error } = await admin
    .from('sync_state')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) console.error('heartbeat failed:', error.message);
}
