import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// NOTE: When you run `supabase gen types typescript` to generate DB types,
// add the Database generic back: createClient<Database>(...)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
