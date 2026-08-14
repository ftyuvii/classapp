/* =========================================================
   FIREBASE CONFIG
   Paste your Firebase project config below.
   Get this from: Firebase Console > Project Settings > Your apps > Web app
========================================================= */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Fixed classroom info for Phase 1 — later this can come from a "classrooms" collection
const CURRENT_CLASSROOM = {
  className: "BCA",
  section: "FCA1",
  session: "2026–27",
  college: "DAV College, Jalandhar"
};

/* =========================================================
   DEMO TEACHER CREDENTIALS (development only)
   WARNING: This is NOT secure. Anyone can read this in the browser's
   JavaScript. This exists only so the project has a working teacher
   login for Phase 1. Replace with real Firebase Authentication
   (email/password provider) before this app is ever used for real.
========================================================= */
const DEMO_TEACHER = {
  email: "admin@dav.in",
  password: "Helloworld"
};

/* =========================================================
   ELEMENT REFERENCES
========================================================= */
const screens = {
  login: document.getElementById("login-screen"),
  teacherLogin: document.getElementById("teacher-screen"),
  onboarding: document.getElementById("onboarding-screen"),
  studentDashboard: document.getElementById("student-dashboard"),
  profile: document.getElementById("profile-screen"),
  teacherDashboard: document.getElementById("teacher-dashboard")
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

/* =========================================================
   GOOGLE AUTH
========================================================= */
const googleSignInBtn = document.getElementById("google-signin-btn");

googleSignInBtn.addEventListener("click", async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
    // onAuthStateChanged (below) takes over from here
  } catch (err) {
    console.error("Google sign-in failed:", err);
    alert("Sign-in failed. Please try again.");
  }
});

// Watches login state at all times — runs on page load and after every sign-in/out
auth.onAuthStateChanged(async (user) => {
  if (user) {
    await loadOrCreateStudentProfile(user);
  } else {
    // No one is logged in (via Google) — show login unless the teacher is logged in
    if (!isTeacherLoggedIn()) {
      showScreen("login");
    }
  }
});

/* =========================================================
   STUDENT PROFILE (Firestore)
========================================================= */
let currentStudentData = null;

async function loadOrCreateStudentProfile(user) {
  const studentRef = db.collection("students").doc(user.uid);
  const doc = await studentRef.get();

  if (doc.exists) {
    currentStudentData = doc.data();
  } else {
    // First-ever login for this student — create their profile document
    currentStudentData = {
      uid: user.uid,
      name: user.displayName || "Student",
      email: user.email || "",
      photoURL: user.photoURL || "",
      className: "",
      section: "",
      session: "",
      college: "",
      rollNumber: "Not assigned",
      onboardingCompleted: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await studentRef.set(currentStudentData);
  }

  renderStudentHeader(currentStudentData);

  if (!currentStudentData.onboardingCompleted) {
    showScreen("onboarding");
  } else {
    renderStudentDashboard(currentStudentData);
    showScreen("studentDashboard");
  }
}

function renderStudentHeader(data) {
  document.getElementById("header-avatar").src = data.photoURL || "";
  document.getElementById("header-name").textContent = data.name;
  document.getElementById("menu-avatar").src = data.photoURL || "";
  document.getElementById("menu-name").textContent = data.name;
  document.getElementById("menu-email").textContent = data.email;
}

function renderStudentDashboard(data) {
  const firstName = data.name.split(" ")[0];
  document.getElementById("greeting").textContent = `Good morning, ${firstName}`;
  document.getElementById("class-line").textContent =
    `${data.className} • ${data.section} • ${data.session}`;
  document.getElementById("session-pill").textContent =
    `${data.className} · ${data.section} · ${data.session}`;
}

function renderProfilePage(data) {
  document.getElementById("profile-photo").src = data.photoURL || "";
  document.getElementById("profile-name").textContent = data.name;
  document.getElementById("profile-email").textContent = data.email;
  document.getElementById("profile-uid").textContent = data.uid;
  document.getElementById("profile-class").textContent = data.className;
  document.getElementById("profile-section").textContent = data.section;
  document.getElementById("profile-session").textContent = data.session;
  document.getElementById("profile-college").textContent = data.college;
  document.getElementById("profile-roll").textContent = data.rollNumber;
}

/* =========================================================
   CLASSROOM ONBOARDING
========================================================= */
document.getElementById("join-classroom-btn").addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const updatedFields = {
    className: CURRENT_CLASSROOM.className,
    section: CURRENT_CLASSROOM.section,
    session: CURRENT_CLASSROOM.session,
    college: CURRENT_CLASSROOM.college,
    onboardingCompleted: true
  };

  await db.collection("students").doc(user.uid).update(updatedFields);

  currentStudentData = { ...currentStudentData, ...updatedFields };
  renderStudentDashboard(currentStudentData);
  showScreen("studentDashboard");
});

/* =========================================================
   PROFILE MENU + NAVIGATION
========================================================= */
const profileTrigger = document.getElementById("profile-trigger");
const profileMenu = document.getElementById("profile-menu");

profileTrigger.addEventListener("click", () => {
  profileMenu.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (!profileTrigger.contains(e.target) && !profileMenu.contains(e.target)) {
    profileMenu.classList.add("hidden");
  }
});

document.getElementById("view-profile-btn").addEventListener("click", () => {
  profileMenu.classList.add("hidden");
  renderProfilePage(currentStudentData);
  showScreen("profile");
});

document.getElementById("profile-back-btn").addEventListener("click", () => {
  showScreen("studentDashboard");
});

/* =========================================================
   LOGOUT
========================================================= */
document.getElementById("logout-btn").addEventListener("click", async () => {
  profileMenu.classList.add("hidden");
  await auth.signOut();
  currentStudentData = null;
  showScreen("login");
});

/* =========================================================
   TEACHER / ADMIN LOGIN
   NOTE: This checks credentials against a hardcoded constant above.
   It is a placeholder only — see the warning near DEMO_TEACHER.
========================================================= */
document.getElementById("show-teacher-login").addEventListener("click", () => {
  showScreen("teacherLogin");
});

document.getElementById("back-to-student").addEventListener("click", () => {
  showScreen("login");
});

document.getElementById("teacher-login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("teacher-email").value.trim();
  const password = document.getElementById("teacher-password").value;
  const errorEl = document.getElementById("teacher-error");

  if (email === DEMO_TEACHER.email && password === DEMO_TEACHER.password) {
    errorEl.classList.add("hidden");
    setTeacherLoggedIn(true);
    showScreen("teacherDashboard");
  } else {
    errorEl.classList.remove("hidden");
  }
});

document.getElementById("teacher-logout-btn").addEventListener("click", () => {
  setTeacherLoggedIn(false);
  showScreen("login");
});

// Simple session flag for the demo teacher login (not secure — resets on tab close)
function setTeacherLoggedIn(value) {
  sessionStorage.setItem("classhub_teacher_logged_in", value ? "true" : "false");
}

function isTeacherLoggedIn() {
  return sessionStorage.getItem("classhub_teacher_logged_in") === "true";
}

// If the teacher was mid-session on page load, keep them on their dashboard
if (isTeacherLoggedIn()) {
  showScreen("teacherDashboard");
}
