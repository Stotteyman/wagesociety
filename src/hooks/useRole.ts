import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const RANK: Record<string, number> = { guest: 0, member: 1, staff: 2, manager: 3, admin: 4, superadmin: 5 };

export function useRole() {
  const [role, setRole] = useState<string>('guest');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.rpc('ws_current_role').then(({ data }) => { setRole((data as string) || 'guest'); setLoading(false); });
  }, []);
  return { role, loading, atLeast: (r: string) => (RANK[role] ?? 0) >= (RANK[r] ?? 99) };
}
