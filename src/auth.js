// =========================================================
// AUTH — Teacher / Admin only.
// Students never authenticate; they only look up a roll number
// (handled separately in script.js against rolls.json).
// =========================================================
import { supabase } from "./supabaseClient.js";

/**
 * Signs a teacher in with email + password.
 * Throws if credentials are invalid — caller should catch and display the error.
 */
export async function signInTeacher(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOutTeacher() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Returns the currently signed-in teacher (or null), based on the
 * persisted Supabase session. Use this on page load to restore state
 * without forcing a fresh login every visit.
 */
export async function getCurrentTeacher() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Failed to read session:", error);
    return null;
  }
  return data.session?.user ?? null;
}

/**
 * Subscribes to auth state changes (sign-in, sign-out, token refresh).
 * callback receives the user object, or null when signed out.
 */
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}
