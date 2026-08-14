import { signInTeacher, signOutTeacher, getCurrentTeacher } from "./src/auth.js";
import { getAttendanceForDate, setAttendance, clearAttendance, getAttendanceForStudent } from "./src/attendance.js";

/* =========================================================
   SCREEN ROUTING
========================================================= */
const screens = {
  landing: document.getElementById("landing-screen"),
  teacherLogin: document.getElementById("teacher-login-screen"),
  student: document.getElementById("student-screen"),
  teacher: document.getElementById("teacher-screen"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

/* =========================================================
   ROSTER (rolls.json) — the source of truth for valid students
========================================================= */
let roster = [];

async function loadRoster() {
  const res = await fetch("./rolls.json");
  roster = await res.json();
}

function findStudent(rollNumber) {
  return roster.find((s) => s.rollNumber === rollNumber.trim());
}

/* =========================================================
   INIT
========================================================= */
init();

async function init() {
  await loadRoster();

  const teacher = await getCurrentTeacher();
  if (teacher) {
    await openTeacherDashboard();
  } else {
    showScreen("landing");
  }
}

/* =========================================================
   STUDENT: ROLL NUMBER LOOKUP
========================================================= */
const rollForm = document.getElementById("roll-form");
const rollInput = document.getElementById("roll-input");
const rollError = document.getElementById("roll-error");

rollForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const student = findStudent(rollInput.value);

  if (!student) {
    rollError.classList.remove("hidden");
    return;
  }

  rollError.classList.add("hidden");
  await openStudentView(student);
});

document.getElementById("student-exit-btn").addEventListener("click", () => {
  rollInput.value = "";
  showScreen("landing");
});

async function openStudentView(student) {
  document.getElementById("student-roll-label").textContent = `Roll No. ${student.rollNumber}`;
  document.getElementById("student-name-label").textContent = student.name;

  const historyListEl = document.getElementById("history-list");
  historyListEl.innerHTML = `<p class="empty-text">Loading…</p>`;

  let records = [];
  try {
    records = await getAttendanceForStudent(student.rollNumber);
  } catch (err) {
    console.error("Failed to load attendance:", err);
  }

  renderStudentStats(records);
  renderStudentHistory(records, historyListEl);
  showScreen("student");
}

function renderStudentStats(records) {
  const total = records.length;
  const present = records.filter((r) => r.status === "present").length;
  const percent = total ? Math.round((present / total) * 100) : 0;

  document.getElementById("attendance-percent").textContent = total ? `${percent}%` : "—";
  document.getElementById("progress-fill").style.width = `${percent}%`;
  document.getElementById("attendance-summary").textContent = total
    ? `Present ${present} of ${total} marked days`
    : "No records yet";
}

function renderStudentHistory(records, container) {
  if (!records.length) {
    container.innerHTML = `<p class="empty-text">Nothing recorded yet — check back after your teacher marks attendance.</p>`;
    return;
  }

  container.innerHTML = records
    .slice(0, 14)
    .map(
      (r) => `
      <div class="history-row">
        <span>${formatDate(r.date)}</span>
        <span class="status-chip ${r.status}">${r.status}</span>
      </div>`
    )
    .join("");
}

function formatDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/* =========================================================
   TEACHER: LOGIN
========================================================= */
document.getElementById("show-teacher-login").addEventListener("click", () => {
  showScreen("teacherLogin");
});

document.getElementById("back-to-landing").addEventListener("click", () => {
  showScreen("landing");
});

const teacherLoginForm = document.getElementById("teacher-login-form");
const teacherError = document.getElementById("teacher-error");

teacherLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("teacher-email").value.trim();
  const password = document.getElementById("teacher-password").value;
  const submitBtn = teacherLoginForm.querySelector("button[type=submit]");

  teacherError.classList.add("hidden");
  submitBtn.disabled = true;

  try {
    await signInTeacher(email, password);
    await openTeacherDashboard();
  } catch (err) {
    teacherError.textContent = "Incorrect email or password.";
    teacherError.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById("teacher-logout-btn").addEventListener("click", async () => {
  await signOutTeacher();
  showScreen("landing");
});

/* =========================================================
   TEACHER: DASHBOARD — the attendance bar
========================================================= */
const dateInput = document.getElementById("date-input");
const dateDisplay = document.getElementById("date-display");
const attendanceBarEl = document.getElementById("attendance-bar");
const summaryBarEl = document.getElementById("summary-bar");

let attendanceState = {}; // rollNumber -> "present" | "absent" | undefined (unmarked)
let currentTeacherEmail = null;

async function openTeacherDashboard() {
  const teacher = await getCurrentTeacher();
  currentTeacherEmail = teacher?.email ?? null;

  dateInput.value = todayISO();
  await loadAttendanceForSelectedDate();
  showScreen("teacher");
}

dateInput.addEventListener("change", loadAttendanceForSelectedDate);

async function loadAttendanceForSelectedDate() {
  const date = dateInput.value;
  dateDisplay.textContent = formatDate(date);

  attendanceBarEl.innerHTML = `<p class="empty-text">Loading…</p>`;
  try {
    attendanceState = await getAttendanceForDate(date);
  } catch (err) {
    console.error("Failed to load attendance:", err);
    attendanceState = {};
  }

  renderAttendanceBar();
  renderSummary();
}

function renderAttendanceBar() {
  attendanceBarEl.innerHTML = roster
    .map((student) => {
      const status = attendanceState[student.rollNumber];
      return `
      <div class="student-chip ${status || ""}" data-roll="${student.rollNumber}">
        <span class="chip-roll">Roll ${student.rollNumber}</span>
        <span class="chip-name">${student.name}</span>
        <span class="chip-status">${status || "unmarked"}</span>
      </div>`;
    })
    .join("");

  attendanceBarEl.querySelectorAll(".student-chip").forEach((chip) => {
    chip.addEventListener("click", () => handleChipClick(chip.dataset.roll));
  });
}

function renderSummary() {
  const total = roster.length;
  const present = Object.values(attendanceState).filter((s) => s === "present").length;
  const absent = Object.values(attendanceState).filter((s) => s === "absent").length;
  const unmarked = total - present - absent;

  summaryBarEl.innerHTML = `
    <span class="summary-pill">Total ${total}</span>
    <span class="summary-pill present">Present ${present}</span>
    <span class="summary-pill absent">Absent ${absent}</span>
    <span class="summary-pill">Unmarked ${unmarked}</span>
  `;
}

async function handleChipClick(rollNumber) {
  const student = roster.find((s) => s.rollNumber === rollNumber);
  const current = attendanceState[rollNumber];
  const next = current === "present" ? "absent" : current === "absent" ? undefined : "present";
  const date = dateInput.value;

  // Optimistic UI update, then sync to Supabase
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
  } catch (err) {
    console.error("Failed to save attendance:", err);
    alert("Couldn't save that change. Please check your connection and try again.");
  }
}

document.getElementById("mark-all-present-btn").addEventListener("click", async () => {
  const date = dateInput.value;
  for (const student of roster) {
    attendanceState[student.rollNumber] = "present";
  }
  renderAttendanceBar();
  renderSummary();

  try {
    await Promise.all(
      roster.map((student) =>
        setAttendance(student.rollNumber, student.name, date, "present", currentTeacherEmail)
      )
    );
  } catch (err) {
    console.error("Failed to save attendance:", err);
    alert("Some records may not have saved. Please check your connection.");
  }
});

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().split("T")[0];
}
