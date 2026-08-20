import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://uzfwnseiguxdaaqoicrr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Mr_AaeNYR1YqOobBYMq9pA_6_Hd5Gmf";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
