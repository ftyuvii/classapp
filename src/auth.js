import { supabase } from "./supabaseClient.js";


export async function signInTeacher(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOutTeacher() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentTeacher() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Failed to read session:", error);
    return null;
  }
  return data.session?.user ?? null;
}

export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}
