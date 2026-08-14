// =========================================================
// SUPABASE CLIENT
// Paste your project URL and anon (public) key below.
// Get these from: Supabase Dashboard > Project Settings > API
//
// The anon key is safe to expose in frontend code — it's designed
// for this. Access control is enforced by Row Level Security (RLS)
// policies on the database tables, not by hiding this key.
// =========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "sb_publishable_Mr_AaeNYR1YqOobBYMq9pA_6_Hd5Gmf";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
