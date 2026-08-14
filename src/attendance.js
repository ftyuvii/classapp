// =========================================================
// ATTENDANCE — reads and writes against the `attendance` table.
// Schema and RLS policies are documented in README.md.
// =========================================================
import { supabase } from "./supabaseClient.js";

const TABLE = "attendance";

/**
 * Returns all attendance rows recorded for a given date (YYYY-MM-DD),
 * as a map of rollNumber -> status ("present" | "absent").
 */
export async function getAttendanceForDate(date) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("roll_number, status")
    .eq("date", date);

  if (error) throw error;

  const map = {};
  for (const row of data) {
    map[row.roll_number] = row.status;
  }
  return map;
}

/**
 * Marks (or updates) one student's attendance for one date.
 * Uses upsert on the (roll_number, date) unique constraint, so
 * calling this twice for the same student/date just overwrites the status.
 */
export async function setAttendance(rollNumber, name, date, status, markedBy) {
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { roll_number: rollNumber, name, date, status, marked_by: markedBy },
      { onConflict: "roll_number,date" }
    );
  if (error) throw error;
}

/**
 * Clears a student's attendance for a date (used when cycling back to "unmarked").
 */
export async function clearAttendance(rollNumber, date) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("roll_number", rollNumber)
    .eq("date", date);
  if (error) throw error;
}

/**
 * Returns a student's full attendance history, most recent first.
 */
export async function getAttendanceForStudent(rollNumber) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("date, status")
    .eq("roll_number", rollNumber)
    .order("date", { ascending: false });

  if (error) throw error;
  return data;
}
