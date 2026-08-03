import { supabase } from './supabase';

// Calls a Netlify function under /api, attaching the Supabase access token.
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api/${path.replace(/^\//, '')}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Functions return a machine-readable `error` plus a human `detail`. Throwing only
    // the code put strings like "stripe_account_failed" in front of members, with the
    // sentence that explains it sitting unused in the payload. Prefer the sentence.
    const { error, detail } = body as { error?: string; detail?: string };
    throw new Error(detail || error || `Request failed (${res.status})`);
  }
  return body as T;
}
