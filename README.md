# ClassHub — Attendance

A minimal, laptop-friendly attendance app.

- **Students** enter their roll number and see their own attendance record. No login.
- **Teachers/Admins** sign in (real Supabase auth) and mark daily attendance — that screen, the attendance bar, is the entire interface.

## Files

```
classhub/
├── index.html
├── style.css
├── script.js
├── rolls.json          ← editable roster (roll number + name)
├── README.md
└── src/
    ├── supabaseClient.js
    ├── auth.js          ← teacher sign in/out, session check
    └── attendance.js    ← read/write attendance records
```

## How it works

- `rolls.json` is the source of truth for who's a valid student. A roll number typed on
  the landing page is checked against this file. Not found → clear error, nothing else.
  To add or remove students, just edit this file — it's a plain array:

  ```json
  [
    { "rollNumber": "6", "name": "New Student" }
  ]
  ```

- Attendance itself lives in Supabase (not in `rolls.json`), because it needs to persist
  across days and devices. `src/attendance.js` reads/writes one table: `attendance`.

- Teachers authenticate through Supabase Auth (email + password) in `src/auth.js`.
  There's no public sign-up — you create teacher accounts yourself in the Supabase
  dashboard (step 5 below), which is the right model for a small class app.

- The dashboard's attendance bar cycles each student chip through
  **unmarked → present → absent → unmarked** on click, saving to Supabase after every
  click (no separate "Save" button to forget to press).

## Supabase Setup Steps

### 1. Create a project
Go to [supabase.com](https://supabase.com) → **New project**. Pick a name, password, and region.

### 2. Create the `attendance` table
In the Supabase dashboard, open **SQL Editor** and run:

```sql
create table attendance (
  id uuid primary key default gen_random_uuid(),
  roll_number text not null,
  name text not null,
  date date not null,
  status text not null check (status in ('present', 'absent')),
  marked_by text,
  created_at timestamptz default now(),
  unique (roll_number, date)
);
```

### 3. Enable Row Level Security and add policies
Still in the SQL Editor:

```sql
alter table attendance enable row level security;

-- Anyone can read attendance (students need to see their own record without logging in)
create policy "Public read access"
on attendance for select
using (true);

-- Only signed-in teachers can insert, update, or delete records
create policy "Teachers can insert"
on attendance for insert
with check (auth.role() = 'authenticated');

create policy "Teachers can update"
on attendance for update
using (auth.role() = 'authenticated');

create policy "Teachers can delete"
on attendance for delete
using (auth.role() = 'authenticated');
```

### 4. Get your API keys
**Project Settings → API**. Copy the **Project URL** and the **anon public** key.

### 5. Create a teacher account
**Authentication → Users → Add user** (create manually, not via a public sign-up form).
Set an email and password — these are what you'll type into the Teacher/Admin login screen.

### 6. Paste your config
Open `src/supabaseClient.js` and replace the placeholders:

```js
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

The anon key is meant to be public in frontend code — the RLS policies above are what
actually control access, not hiding this key.

### 7. Edit your roster
Open `rolls.json` and replace the sample rows with your real students.

### 8. Run locally
This app uses native ES module imports (`import ... from`), which browsers block on
`file://` pages — you need a local server:

- **VS Code**: install "Live Server" → right-click `index.html` → **Open with Live Server**
- **Python**: `python -m http.server 8000` from the `classhub` folder, then visit `http://localhost:8000`

## Notes on scope

This build is intentionally just the roll lookup, teacher login, and the attendance bar —
no other modules. Everything else from an earlier draft (Google sign-in, onboarding,
profile pages, placeholder feature cards) has been removed in favor of this single,
production-shaped flow.
