/**
 * Data-access layer. Feature code calls functions exported from here (or from
 * feature-local api files that build on this) — components never talk to
 * supabase-js directly.
 */
import { getSupabase } from './supabase';

/** Generic helper: run a Supabase query and unwrap data/error into a throw-on-error result. */
export async function unwrap<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('No data returned');
  return data;
}

export { getSupabase };
