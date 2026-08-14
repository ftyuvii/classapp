import { signInTeacher, signOutTeacher, getCurrentTeacher } from "./src/auth.js";
import {
  getAttendanceForDate,
  setAttendance,
  clearAttendance,
  getAttendanceForStudent
} from "./src/attendance.js";
import { supabase } from "./src/supabaseClient.js";

const screens = {
  landing: document.getElementById("landing-screen"),
  teacherLogin: document.getElementById("teacher-login-screen"),
  student: document.getElementById("student-screen"),
  teacher: document.getElementById("teacher-screen")
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));

  if (screens[name]) {
    screens[name].classList.remove("hidden");
  }
}

let roster = [];

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

  if (!cleanRoll) {
    return null;
  }

  const localStudent = roster.find(
    (student) => student.rollNumber === cleanRoll
  );

  if (localStudent) {
    return localStudent;
  }

  const { data, error } = await supabase
    .from("students")
    .select("roll_number, name")
    .eq("roll_number", cleanRoll)
    .maybeSingle();

  if (error) {
    console.error("Student lookup error:", error);
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    rollNumber: String(data.roll_number),
    name: data.name
  };
}

async function init() {
  try {
    await loadRoster();

    const teacher = await getCurrentTeacher();

    if (teacher) {
      await openTeacherDashboard();
    } else {
      showScreen("landing");
    }
  } catch (error) {
    console.error("Application initialization failed:", error);
    showScreen("landing");
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

  if (submitButton) {
    submitButton.disabled = true;
  }

  rollError.classList.add("hidden");

  try {
    const student = await findStudent(rollNumber);

    if (!student) {
      rollError.textContent =
        "Student not found. Please check your roll number.";
      rollError.classList.remove("hidden");
      return;
    }

    await openStudentView(student);
  } catch (error) {
    console.error("Student lookup failed:", error);

    rollError.textContent =
      "Unable to find student. Please try again.";
    rollError.classList.remove("hidden");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
});

document
  .getElementById("student-exit-btn")
  .addEventListener("click", () => {
    rollInput.value = "";
    rollError.classList.add("hidden");
    showScreen("landing");
  });

async function openStudentView(student) {
  document.getElementById(
    "student-roll-label"
  ).textContent = `Roll No. ${student.rollNumber}`;

  document.getElementById(
    "student-name-label"
  ).textContent = student.name;

  const historyListEl = document.getElementById("history-list");

  historyListEl.innerHTML =
    `<p class="empty-text">Loading…</p>`;

  let records = [];

  try {
    records = await getAttendanceForStudent(student.rollNumber);
  } catch (error) {
    console.error("Failed to load student attendance:", error);

    historyListEl.innerHTML =
      `<p class="empty-text">Unable to load attendance.</p>`;
  }

  renderStudentStats(records);
  renderStudentHistory(records, historyListEl);

  showScreen("student");
}

function renderStudentStats(records) {
  const total = records.length;

  const present = records.filter(
    (record) => record.status === "present"
  ).length;

  const percent = total
    ? Math.round((present / total) * 100)
    : 0;

  document.getElementById("attendance-percent").textContent =
    total ? `${percent}%` : "—";

  document.getElementById("progress-fill").style.width =
    `${percent}%`;

  document.getElementById("attendance-summary").textContent =
    total
      ? `Present ${present} of ${total} marked days`
      : "No records yet";
}

function renderStudentHistory(records, container) {
  if (!records.length) {
    container.innerHTML =
      `<p class="empty-text">Nothing recorded yet — check back after your teacher marks attendance.</p>`;
    return;
  }

  container.innerHTML = records
    .slice(0, 14)
    .map(
      (record) => `
        <div class="history-row">
          <span>${formatDate(record.date)}</span>
          <span class="status-chip ${record.status}">
            ${record.status}
          </span>
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

document
  .getElementById("show-teacher-login")
  .addEventListener("click", () => {
    showScreen("teacherLogin");
  });

document
  .getElementById("back-to-landing")
  .addEventListener("click", () => {
    showScreen("landing");
  });

const teacherLoginForm =
  document.getElementById("teacher-login-form");

const teacherError =
  document.getElementById("teacher-error");

teacherLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email =
    document.getElementById("teacher-email").value.trim();

  const password =
    document.getElementById("teacher-password").value;

  const submitButton =
    teacherLoginForm.querySelector("button[type='submit']");

  teacherError.classList.add("hidden");
  submitButton.disabled = true;

  try {
    await signInTeacher(email, password);
    await openTeacherDashboard();
  } catch (error) {
    console.error("Teacher login failed:", error);

    teacherError.textContent =
      "Incorrect email or password.";

    teacherError.classList.remove("hidden");
  } finally {
    submitButton.disabled = false;
  }
});

document
  .getElementById("teacher-logout-btn")
  .addEventListener("click", async () => {
    try {
      await signOutTeacher();
    } finally {
      currentTeacherEmail = null;
      showScreen("landing");
    }
  });

const dateInput = document.getElementById("date-input");
const dateDisplay = document.getElementById("date-display");
const attendanceBarEl =
  document.getElementById("attendance-bar");
const summaryBarEl =
  document.getElementById("summary-bar");

let attendanceState = {};
let currentTeacherEmail = null;

async function openTeacherDashboard() {
  const teacher = await getCurrentTeacher();

  if (!teacher) {
    showScreen("landing");
    return;
  }

  currentTeacherEmail = teacher.email || null;

  dateInput.value = todayISO();

  await loadAttendanceForSelectedDate();

  showScreen("teacher");
}

dateInput.addEventListener(
  "change",
  loadAttendanceForSelectedDate
);

async function loadAttendanceForSelectedDate() {
  const date = dateInput.value;

  if (!date) {
    return;
  }

  dateDisplay.textContent = formatDate(date);

  attendanceBarEl.innerHTML =
    `<p class="empty-text">Loading…</p>`;

  try {
    attendanceState =
      await getAttendanceForDate(date);
  } catch (error) {
    console.error(
      "Failed to load attendance:",
      error
    );

    attendanceState = {};

    attendanceBarEl.innerHTML =
      `<p class="empty-text">Unable to load attendance.</p>`;
  }

  renderAttendanceBar();
  renderSummary();
}

function renderAttendanceBar() {
  if (!roster.length) {
    attendanceBarEl.innerHTML =
      `<p class="empty-text">No students found.</p>`;
    return;
  }

  attendanceBarEl.innerHTML = roster
    .map((student) => {
      const status =
        attendanceState[student.rollNumber];

      return `
        <div
          class="student-chip ${status || ""}"
          data-roll="${student.rollNumber}"
        >
          <span class="chip-roll">
            Roll ${student.rollNumber}
          </span>

          <span class="chip-name">
            ${escapeHTML(student.name)}
          </span>

          <span class="chip-status">
            ${status || "unmarked"}
          </span>
        </div>
      `;
    })
    .join("");

  attendanceBarEl
    .querySelectorAll(".student-chip")
    .forEach((chip) => {
      chip.addEventListener("click", () => {
        handleChipClick(chip.dataset.roll);
      });
    });
}

function renderSummary() {
  const total = roster.length;

  const present =
    Object.values(attendanceState).filter(
      (status) => status === "present"
    ).length;

  const absent =
    Object.values(attendanceState).filter(
      (status) => status === "absent"
    ).length;

  const unmarked =
    Math.max(0, total - present - absent);

  summaryBarEl.innerHTML = `
    <span class="summary-pill">
      Total ${total}
    </span>

    <span class="summary-pill present">
      Present ${present}
    </span>

    <span class="summary-pill absent">
      Absent ${absent}
    </span>

    <span class="summary-pill">
      Unmarked ${unmarked}
    </span>
  `;
}

async function handleChipClick(rollNumber) {
  const student =
    roster.find(
      (item) => item.rollNumber === rollNumber
    );

  if (!student) {
    return;
  }

  const current =
    attendanceState[rollNumber];

  const next =
    current === "present"
      ? "absent"
      : current === "absent"
      ? undefined
      : "present";

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
      await setAttendance(
        rollNumber,
        student.name,
        date,
        next,
        currentTeacherEmail
      );
    } else {
      await clearAttendance(
        rollNumber,
        date
      );
    }
  } catch (error) {
    console.error(
      "Failed to save attendance:",
      error
    );

    if (current) {
      attendanceState[rollNumber] = current;
    } else {
      delete attendanceState[rollNumber];
    }

    renderAttendanceBar();
    renderSummary();

    alert(
      "Couldn't save that change. Please check your connection and try again."
    );
  }
}

document
  .getElementById("mark-all-present-btn")
  .addEventListener("click", async () => {
    const date = dateInput.value;

    if (!roster.length) {
      return;
    }

    const previousState = {
      ...attendanceState
    };

    roster.forEach((student) => {
      attendanceState[student.rollNumber] =
        "present";
    });

    renderAttendanceBar();
    renderSummary();

    try {
      await Promise.all(
        roster.map((student) =>
          setAttendance(
            student.rollNumber,
            student.name,
            date,
            "present",
            currentTeacherEmail
          )
        )
      );
    } catch (error) {
      console.error(
        "Failed to save attendance:",
        error
      );

      attendanceState = previousState;

      renderAttendanceBar();
      renderSummary();

      alert(
        "Some records may not have saved. Please check your connection."
      );
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

  return new Date(
    date.getTime() - offset * 60000
  )
    .toISOString()
    .split("T")[0];
}

init();