import { signInTeacher, signOutTeacher, getCurrentTeacher, onAuthChange } from "./src/auth.js";
import {
  getAttendanceForDate,
  setAttendance,
  setAttendanceBulk,
  clearAttendance,
  getAttendanceForStudent
} from "./src/attendance.js";
import { getAllNotes, uploadNote, deleteNote } from "./src/notes.js";
import { supabase } from "./src/supabaseClient.js";

const STUDENT_ROLL_KEY = "classhub_roll_number";
const MAX_NOTE_SIZE = 15 * 1024 * 1024;

const screens = {
  landing: document.getElementById("landing-screen"),
  teacherLogin: document.getElementById("teacher-login-screen"),
  student: document.getElementById("student-screen"),
  teacher: document.getElementById("teacher-screen")
};

let roster = [];
let notesCache = [];
let attendanceState = {};
let currentTeacherEmail = null;
let currentStudent = null;
let activeScreen = "landing";
let appReady = false;
let dashboardLoadInProgress = false;

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  if (screens[name]) {
    screens[name].classList.remove("hidden");
    activeScreen = name;
  }
}

function saveStudentSession(rollNumber) {
  try {
    localStorage.setItem(STUDENT_ROLL_KEY, rollNumber);
  } catch (error) {
    console.error("Failed to persist student session:", error);
  }
}

function clearStudentSession() {
  try {
    localStorage.removeItem(STUDENT_ROLL_KEY);
  } catch (error) {
    console.error("Failed to clear student session:", error);
  }
}

function getStoredRoll() {
  try {
    return localStorage.getItem(STUDENT_ROLL_KEY);
  } catch (error) {
    return null;
  }
}

async function loadRoster() {
  const { data, error } = await supabase
    .from("students")
    .select("roll_number, name")
    .order("roll_number", { ascending: true });

  if (error) {
    console.error("Student loading error:", error);
    throw error;
  }

  roster = (data || []).map((student) => ({
    rollNumber: String(student.roll_number),
    name: student.name
  }));

  return roster;
}

async function findStudent(rollNumber) {
  const cleanRoll = String(rollNumber).trim();
  if (!cleanRoll) return null;

  const localStudent = roster.find((student) => student.rollNumber === cleanRoll);
  if (localStudent) return localStudent;

  const { data, error } = await supabase
    .from("students")
    .select("roll_number, name")
    .eq("roll_number", cleanRoll)
    .maybeSingle();

  if (error) {
    console.error("Student lookup error:", error);
    throw error;
  }

  if (!data) return null;

  return { rollNumber: String(data.roll_number), name: data.name };
}

function subscribeToRosterChanges() {
  supabase
    .channel("students-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "students" }, async () => {
      try {
        await loadRoster();

        if (activeScreen === "teacher") {
          renderAttendanceBar();
          renderSummary();
        }

        if (activeScreen === "student" && currentStudent) {
          const stillExists = roster.find((student) => student.rollNumber === currentStudent.rollNumber);
          if (!stillExists) {
            clearStudentSession();
            currentStudent = null;
            showScreen("landing");
          }
        }
      } catch (error) {
        console.error("Failed to sync roster:", error);
      }
    })
    .subscribe();
}

function subscribeToAttendanceChanges() {
  supabase
    .channel("attendance-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, async (payload) => {
      const changedDate = payload.new?.date || payload.old?.date;
      const changedRoll = String(payload.new?.roll_number ?? payload.old?.roll_number ?? "");

      if (activeScreen === "teacher" && changedDate === dateInput.value) {
        await loadAttendanceForSelectedDate();
      }

      if (activeScreen === "student" && currentStudent && changedRoll === currentStudent.rollNumber) {
        await refreshStudentHistory();
      }
    })
    .subscribe();
}

function subscribeToNotesChanges() {
  supabase
    .channel("notes-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, async () => {
      if (activeScreen === "teacher") {
        await loadAndRenderNotes("teacher-notes-list", true);
      } else if (activeScreen === "student") {
        await loadAndRenderNotes("student-notes-list", false);
      }
    })
    .subscribe();
}

onAuthChange(async (user) => {
  if (!appReady) return;

  if (user) {
    await openTeacherDashboard();
  } else if (activeScreen === "teacher") {
    currentTeacherEmail = null;
    showScreen("landing");
  }
});

async function init() {
  try {
    await loadRoster();
    subscribeToRosterChanges();
    subscribeToAttendanceChanges();
    subscribeToNotesChanges();

    const teacher = await getCurrentTeacher();

    if (teacher) {
      await openTeacherDashboard();
    } else {
      const storedRoll = getStoredRoll();

      if (storedRoll) {
        const student = await findStudent(storedRoll);

        if (student) {
          await openStudentView(student);
        } else {
          clearStudentSession();
          showScreen("landing");
        }
      } else {
        showScreen("landing");
      }
    }
  } catch (error) {
    console.error("Application initialization failed:", error);
    showScreen("landing");
  } finally {
    appReady = true;
  }
}

const rollForm = document.getElementById("roll-form");
const rollInput = document.getElementById("roll-input");
const rollError = document.getElementById("roll-error");

rollForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const rollNumber = rollInput.value.trim();

  if (!rollNumber) {
    rollError.textContent = "Please enter your roll number.";
    rollError.classList.remove("hidden");
    return;
  }

  const submitButton = rollForm.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;
  rollError.classList.add("hidden");

  try {
    const student = await findStudent(rollNumber);

    if (!student) {
      rollError.textContent = "Student not found. Please check your roll number.";
      rollError.classList.remove("hidden");
      return;
    }

    saveStudentSession(student.rollNumber);
    await openStudentView(student);
  } catch (error) {
    console.error("Student lookup failed:", error);
    rollError.textContent = "Unable to find student. Please try again.";
    rollError.classList.remove("hidden");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

document.getElementById("student-exit-btn").addEventListener("click", () => {
  clearStudentSession();
  currentStudent = null;
  rollInput.value = "";
  rollError.classList.add("hidden");
  showScreen("landing");
});

async function openStudentView(student) {
  currentStudent = student;

  document.getElementById("student-roll-label").textContent = `Roll No. ${student.rollNumber}`;
  document.getElementById("student-name-label").textContent = student.name;

  showScreen("student");

  await refreshStudentHistory();
  await loadAndRenderNotes("student-notes-list", false);
}

async function refreshStudentHistory() {
  const historyListEl = document.getElementById("history-list");
  historyListEl.innerHTML = `<p class="empty-text">Loading…</p>`;

  try {
    const records = await getAttendanceForStudent(currentStudent.rollNumber);
    renderStudentHistory(records, historyListEl);
  } catch (error) {
    console.error("Failed to load student attendance:", error);
    historyListEl.innerHTML = `<p class="empty-text">Unable to load attendance.</p>`;
  }
}

function renderStudentHistory(records, container) {
  if (!records.length) {
    container.innerHTML = `<p class="empty-text">Nothing recorded yet — check back after your teacher marks attendance.</p>`;
    return;
  }

  container.innerHTML = records
    .slice(0, 30)
    .map(
      (record) => `
        <div class="history-row">
          <span>${formatDate(record.date)}</span>
          <span class="status-chip ${record.status}">${record.status}</span>
        </div>
      `
    )
    .join("");
}

function formatDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

document.getElementById("show-teacher-login").addEventListener("click", () => {
  showScreen("teacherLogin");
});

document.getElementById("back-to-landing").addEventListener("click", () => {
  showScreen("landing");
});

const teacherLoginForm = document.getElementById("teacher-login-form");
const teacherError = document.getElementById("teacher-error");

teacherLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("teacher-email").value.trim();
  const password = document.getElementById("teacher-password").value;
  const submitButton = teacherLoginForm.querySelector("button[type='submit']");

  teacherError.classList.add("hidden");
  submitButton.disabled = true;

  try {
    await signInTeacher(email, password);
    await openTeacherDashboard();
  } catch (error) {
    console.error("Teacher login failed:", error);
    teacherError.textContent = "Incorrect email or password.";
    teacherError.classList.remove("hidden");
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById("teacher-logout-btn").addEventListener("click", async () => {
  try {
    await signOutTeacher();
  } finally {
    currentTeacherEmail = null;
    clearStudentSession();
    showScreen("landing");
  }
});

const dateInput = document.getElementById("date-input");
const dateDisplay = document.getElementById("date-display");
const attendanceBarEl = document.getElementById("attendance-bar");
const summaryBarEl = document.getElementById("summary-bar");

async function openTeacherDashboard() {
  if (dashboardLoadInProgress) return;
  dashboardLoadInProgress = true;

  try {
    const teacher = await getCurrentTeacher();

    if (!teacher) {
      showScreen("landing");
      return;
    }

    currentTeacherEmail = teacher.email || null;
    if (!dateInput.value) dateInput.value = todayISO();

    showScreen("teacher");

    await loadAttendanceForSelectedDate();
    await loadAndRenderNotes("teacher-notes-list", true);
  } finally {
    dashboardLoadInProgress = false;
  }
}

dateInput.addEventListener("change", loadAttendanceForSelectedDate);

async function loadAttendanceForSelectedDate() {
  const date = dateInput.value;
  if (!date) return;

  dateDisplay.textContent = formatDate(date);
  attendanceBarEl.innerHTML = `<p class="empty-text">Loading…</p>`;

  try {
    attendanceState = await getAttendanceForDate(date);
  } catch (error) {
    console.error("Failed to load attendance:", error);
    attendanceState = {};
    attendanceBarEl.innerHTML = `<p class="empty-text">Unable to load attendance.</p>`;
  }

  renderAttendanceBar();
  renderSummary();
}

function renderAttendanceBar() {
  if (!roster.length) {
    attendanceBarEl.innerHTML = `<p class="empty-text">No students found.</p>`;
    return;
  }

  attendanceBarEl.innerHTML = roster
    .map((student) => {
      const status = attendanceState[student.rollNumber];
      return `
        <div class="student-chip ${status || ""}" data-roll="${student.rollNumber}">
          <span class="chip-name">${escapeHTML(student.rollNumber)}</span>
          <span class="chip-roll">${escapeHTML(student.name)}</span>
          <span class="chip-status">${status || "unmarked"}</span>
        </div>
      `;
    })
    .join("");

  attendanceBarEl.querySelectorAll(".student-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      handleChipClick(chip.dataset.roll);
    });
  });
}

function renderSummary() {
  const total = roster.length;
  const present = Object.values(attendanceState).filter((status) => status === "present").length;
  const absent = Object.values(attendanceState).filter((status) => status === "absent").length;
  const unmarked = Math.max(0, total - present - absent);

  summaryBarEl.innerHTML = `
    <span class="summary-pill">Total ${total}</span>
    <span class="summary-pill present">Present ${present}</span>
    <span class="summary-pill absent">Absent ${absent}</span>
    <span class="summary-pill">Unmarked ${unmarked}</span>
  `;
}

async function handleChipClick(rollNumber) {
  const student = roster.find((item) => item.rollNumber === rollNumber);
  if (!student) return;

  const current = attendanceState[rollNumber];
  const next = current === "present" ? "absent" : current === "absent" ? undefined : "present";
  const date = dateInput.value;

  if (next) {
    attendanceState[rollNumber] = next;
  } else {
    delete attendanceState[rollNumber];
  }

  renderAttendanceBar();
  renderSummary();

  try {
    if (next) {
      await setAttendance(rollNumber, student.name, date, next, currentTeacherEmail);
    } else {
      await clearAttendance(rollNumber, date);
    }
  } catch (error) {
    console.error("Failed to save attendance:", error);

    if (current) {
      attendanceState[rollNumber] = current;
    } else {
      delete attendanceState[rollNumber];
    }

    renderAttendanceBar();
    renderSummary();
    alert("Couldn't save that change. Please check your connection and try again.");
  }
}

document.getElementById("mark-all-present-btn").addEventListener("click", async () => {
  const date = dateInput.value;
  if (!roster.length) return;

  const previousState = { ...attendanceState };

  roster.forEach((student) => {
    attendanceState[student.rollNumber] = "present";
  });

  renderAttendanceBar();
  renderSummary();

  try {
    const entries = roster.map((student) => ({
      rollNumber: student.rollNumber,
      name: student.name,
      status: "present"
    }));
    await setAttendanceBulk(entries, date, currentTeacherEmail);
  } catch (error) {
    console.error("Failed to save attendance:", error);
    attendanceState = previousState;
    renderAttendanceBar();
    renderSummary();
    alert("Couldn't save attendance for all students. Please check your connection and try again.");
  }
});

function noteDateKey(isoTimestamp) {
  return isoTimestamp.split("T")[0];
}

function renderNotesList(container, notes, options) {
  const allowDelete = Boolean(options && options.allowDelete);

  if (!notes.length) {
    container.innerHTML = `<p class="empty-text">No notes uploaded yet.</p>`;
    return;
  }

  const groups = [];
  let lastDate = null;

  notes.forEach((note) => {
    const noteDate = noteDateKey(note.created_at);
    if (noteDate !== lastDate) {
      groups.push({ date: noteDate, items: [] });
      lastDate = noteDate;
    }
    groups[groups.length - 1].items.push(note);
  });

  container.innerHTML = groups
    .map(
      (group) => `
        <div class="note-date-group">
          <p class="note-date-heading">${formatDate(group.date)}</p>
          <div class="note-cards">
            ${group.items
              .map(
                (note) => `
                  <div class="note-card" data-note-id="${note.id}" data-storage-path="${escapeHTML(note.storage_path)}">
                    <div class="note-card-main">
                      <span class="file-badge ${note.file_type}">${note.file_type === "image" ? "IMG" : "PDF"}</span>
                      <div class="note-card-text">
                        <span class="note-title">${escapeHTML(note.title)}</span>
                        <span class="note-meta">${escapeHTML(note.file_name)}</span>
                      </div>
                    </div>
                    <div class="note-card-actions">
                      <a class="note-open-link" href="${note.file_url}" target="_blank" rel="noopener noreferrer">Open</a>
                      ${allowDelete ? `<button type="button" class="note-delete-btn" data-note-id="${note.id}">Delete</button>` : ""}
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      `
    )
    .join("");

  if (allowDelete) {
    container.querySelectorAll(".note-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleNoteDelete(btn.dataset.noteId, container));
    });
  }
}

async function handleNoteDelete(noteId, container) {
  const card = container.querySelector(`.note-card[data-note-id="${noteId}"]`);
  const storagePath = card ? card.dataset.storagePath : null;
  if (!storagePath) return;
  if (!confirm("Delete this note? This cannot be undone.")) return;

  try {
    await deleteNote(noteId, storagePath);
    notesCache = notesCache.filter((note) => String(note.id) !== String(noteId));
    renderNotesList(container, notesCache, { allowDelete: true });
  } catch (error) {
    console.error("Failed to delete note:", error);
    alert("Couldn't delete that note. Please try again.");
  }
}

async function loadAndRenderNotes(containerId, allowDelete) {
  const container = document.getElementById(containerId);
  container.innerHTML = `<p class="empty-text">Loading…</p>`;

  try {
    notesCache = await getAllNotes();
  } catch (error) {
    console.error("Failed to load notes:", error);
    container.innerHTML = `<p class="empty-text">Unable to load notes.</p>`;
    return;
  }

  renderNotesList(container, notesCache, { allowDelete });
}

const notesUploadForm = document.getElementById("notes-upload-form");
const notesUploadError = document.getElementById("notes-upload-error");

notesUploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const titleInput = document.getElementById("note-title-input");
  const fileInput = document.getElementById("note-file-input");
  const title = titleInput.value.trim();
  const file = fileInput.files[0];

  notesUploadError.classList.add("hidden");

  if (!title || !file) {
    notesUploadError.textContent = "Please add a title and choose a file.";
    notesUploadError.classList.remove("hidden");
    return;
  }

  const isPdf = file.type === "application/pdf";
  const isImage = file.type.startsWith("image/");

  if (!isPdf && !isImage) {
    notesUploadError.textContent = "Only PDF or image files are allowed.";
    notesUploadError.classList.remove("hidden");
    return;
  }

  if (file.size > MAX_NOTE_SIZE) {
    notesUploadError.textContent = "File is too large. Maximum size is 15MB.";
    notesUploadError.classList.remove("hidden");
    return;
  }

  const submitButton = notesUploadForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Uploading…";

  try {
    const newNote = await uploadNote(file, title, currentTeacherEmail);
    notesCache = [newNote, ...notesCache];
    renderNotesList(document.getElementById("teacher-notes-list"), notesCache, { allowDelete: true });
    notesUploadForm.reset();
  } catch (error) {
    console.error("Failed to upload note:", error);
    notesUploadError.textContent = "Upload failed. Please try again.";
    notesUploadError.classList.remove("hidden");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Upload note";
  }
});

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function todayISO() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().split("T")[0];
}

init();
