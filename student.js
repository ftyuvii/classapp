import { supabase } from "./supabaseClient.js";

const STUDENT_AUTH_REDIRECT = window.location.origin + window.location.pathname;

export async function getStudentByEmail(email) {
  const cleanEmail = String(email).trim().toLowerCase();
  if (!cleanEmail) return null;

  const { data, error } = await supabase
    .from("students")
    .select("roll_number, name, email")
    .eq("email", cleanEmail)
    .maybeSingle();

  if (error) {
    console.error("Student lookup by email failed:", error);
    throw error;
  }

  if (!data) return null;

  return {
    rollNumber: String(data.roll_number),
    name: data.name,
    email: data.email
  };
}

export async function sendStudentMagicLink(email) {
  const cleanEmail = String(email).trim().toLowerCase();

  const { error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo: STUDENT_AUTH_REDIRECT,
      shouldCreateUser: false
    }
  });

  if (error) {
    console.error("Failed to send student magic link:", error);
    throw error;
  }
}

export async function getCurrentStudentSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Failed to read student session:", error);
    throw error;
  }

  return data.session;
}

export function onStudentAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return data.subscription;
}

export async function signOutStudent() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Failed to sign out student:", error);
    throw error;
  }
}
