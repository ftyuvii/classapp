import { supabase } from "./supabaseClient.js";

const TABLE = "attendance";
const VALID_STATUSES = ["present", "absent"];

function assertRollNumber(rollNumber) {
  const value = String(rollNumber ?? "").trim();
  if (!value) throw new Error("Roll number is required.");
  return value;
}

function assertDate(date) {
  const value = String(date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("A valid date (YYYY-MM-DD) is required.");
  return value;
}

function assertStatus(status) {
  if (!VALID_STATUSES.includes(status)) throw new Error(`Status must be one of: ${VALID_STATUSES.join(", ")}`);
  return status;
}

export async function getAttendanceForDate(date) {
  const cleanDate = assertDate(date);

  const { data, error } = await supabase
    .from(TABLE)
    .select("roll_number, status")
    .eq("date", cleanDate);

  if (error) throw error;

  const map = {};
  for (const row of data) {
    map[String(row.roll_number)] = row.status;
  }
  return map;
}

export async function setAttendance(rollNumber, name, date, status, markedBy) {
  const cleanRoll = assertRollNumber(rollNumber);
  const cleanDate = assertDate(date);
  const cleanStatus = assertStatus(status);

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        roll_number: cleanRoll,
        name: name ?? null,
        date: cleanDate,
        status: cleanStatus,
        marked_by: markedBy ?? null
      },
      { onConflict: "roll_number,date" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function setAttendanceBulk(entries, date, markedBy) {
  const cleanDate = assertDate(date);

  if (!Array.isArray(entries) || !entries.length) {
    throw new Error("At least one student is required.");
  }

  const rows = entries.map((entry) => ({
    roll_number: assertRollNumber(entry.rollNumber),
    name: entry.name ?? null,
    date: cleanDate,
    status: assertStatus(entry.status),
    marked_by: markedBy ?? null
  }));

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "roll_number,date" })
    .select();

  if (error) throw error;
  return data;
}

export async function clearAttendance(rollNumber, date) {
  const cleanRoll = assertRollNumber(rollNumber);
  const cleanDate = assertDate(date);

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("roll_number", cleanRoll)
    .eq("date", cleanDate);

  if (error) throw error;
}

export async function clearAttendanceBulk(rollNumbers, date) {
  const cleanDate = assertDate(date);
  const cleanRolls = (rollNumbers || []).map(assertRollNumber);

  if (!cleanRolls.length) return;

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("date", cleanDate)
    .in("roll_number", cleanRolls);

  if (error) throw error;
}

export async function getAttendanceForStudent(rollNumber) {
  const cleanRoll = assertRollNumber(rollNumber);

  const { data, error } = await supabase
    .from(TABLE)
    .select("date, status")
    .eq("roll_number", cleanRoll)
    .order("date", { ascending: false });

  if (error) throw error;
  return data;
}
