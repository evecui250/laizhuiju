'use client';

import { createClient } from '@supabase/supabase-js';

// Publishable (anon) key — safe to ship in the app. Access is enforced by
// the Row Level Security policies in supabase/migrations, not by keeping
// this key secret. Project region: Singapore (closest to users in China).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://mjsgcvuyousczqexxszs.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_WEmGQIZnbWUMSXm9oKSWdQ_l7tDrIIE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
