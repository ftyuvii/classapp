import { supabase } from "./supabaseClient.js";

const TABLE = "attendance";

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

export async function setAttendance(rollNumber, name, date, status, markedBy) {
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { roll_number: rollNumber, name, date, status, marked_by: markedBy },
      { onConflict: "roll_number,date" }
    );
  if (error) throw error;
}

export async function clearAttendance(rollNumber, date) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("roll_number", rollNumber)
    .eq("date", date);
  if (error) throw error;
}

export async function getAttendanceForStudent(rollNumber) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("date, status")
    .eq("roll_number", rollNumber)
    .order("date", { ascending: false });

  if (error) throw error;
  return data;
}
