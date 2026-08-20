import { supabase } from "./supabaseClient.js";

const TABLE = "notes";
const BUCKET = "notes";

export async function getAllNotes() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, title, file_name, storage_path, file_url, file_type, uploaded_by, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function uploadNote(file, title, uploadedBy) {
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "";
  const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${extension ? "." + extension : ""}`;
  const fileType = file.type.startsWith("image/") ? "image" : "pdf";

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(safeName, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(safeName);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      title,
      file_name: file.name,
      storage_path: safeName,
      file_url: publicUrlData.publicUrl,
      file_type: fileType,
      uploaded_by: uploadedBy
    })
    .select()
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([safeName]);
    throw error;
  }

  return data;
}

export async function deleteNote(id, storagePath) {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (storageError) throw storageError;

  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
