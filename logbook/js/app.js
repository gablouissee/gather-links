import {
  auth,
  googleProvider,
  microsoftProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  onAuthStateChanged,
} from "./firebase.js";
import { firebaseConfig, ORG_NAME } from "./config.js";
import * as store from "./store.js";
import {
  esc,
  computeHours,
  fmtTime,
  fmtDate,
  fmtHours,
  todayISO,
  totalActual,
  logsToCsv,
  downloadCsv,
} from "./helpers.js";

const appEl = document.getElementById("app");
const CONFIGURED = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";

let state = { user: null, profile: null, admin: false };

// ---------------------------------------------------------------- theme
const THEME_KEY = "lb-theme";
function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  refreshThemeToggles();
}
function refreshThemeToggles() {
  const dark = currentTheme() === "dark";
  document.querySelectorAll(".theme-toggle").forEach((b) => {
    b.textContent = dark ? "☀️" : "🌙";
    b.title = dark ? "Switch to light mode" : "Switch to dark mode";
    b.onclick = () => applyTheme(dark ? "light" : "dark");
  });
}
function initTheme() {
  let t;
  try { t = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  if (t !== "dark" && t !== "light") {
    t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", t);
}
initTheme();

// ---------------------------------------------------------------- toast
let toastTimer;
function toast(msg, isErr = false) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 3200);
}

// ------------------------------------------------------------ top bar
function topbar() {
  const u = state.user;
  const initials = (u?.displayName || u?.email || "?")
    .split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const avatar = u?.photoURL
    ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer" />`
    : esc(initials);
  return `
    <header class="topbar">
      <div class="crest">${esc(ORG_NAME[0] || "L")}</div>
      <div>
        <div class="brand-name">${esc(ORG_NAME)}</div>
        <div class="brand-sub">Intern Logbook</div>
      </div>
      <div class="spacer"></div>
      ${state.admin ? '<span class="badge">Admin</span>' : ""}
      <div class="who">
        <div class="avatar">${avatar}</div>
        <span>${esc(u?.displayName || u?.email || "")}</span>
      </div>
      <button class="theme-toggle" title="Toggle theme">🌙</button>
      <button class="ghost" id="signout" style="color:#fff">Sign out</button>
    </header>`;
}

function wireTopbar() {
  const btn = document.getElementById("signout");
  if (btn) btn.onclick = () => signOut(auth);
  refreshThemeToggles();
}

// -------------------------------------------------------------- login
function renderLogin() {
  const g = `<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.2 13.3 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.9 6.8-17.4z"/><path fill="#FBBC05" d="M10.4 28.3c-.5-1.5-.8-3-.8-4.8s.3-3.3.8-4.8l-7.8-6.1C.9 16.1 0 19.9 0 23.5s.9 7.4 2.6 10.9l7.8-6.1z"/><path fill="#34A853" d="M24 47c6.2 0 11.4-2 15.2-5.5l-7.3-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.4 0-11.8-3.8-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 47 24 47z"/></svg>`;
  const ms = `<svg viewBox="0 0 24 24"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>`;
  appEl.innerHTML = `
    <div class="login-shell">
      <button class="theme-toggle floating" title="Toggle theme">🌙</button>
      <div class="login-card">
        <div class="crest">${esc(ORG_NAME[0] || "L")}</div>
        <h1>${esc(ORG_NAME)} Intern Logbook</h1>
        <p>Sign in with your school or work account to record your OJT hours.</p>
        ${CONFIGURED ? "" : `<div class="setup-warn">⚠️ Not connected yet. Add your Firebase keys in <code>js/config.js</code> and enable Google &amp; Microsoft sign-in. See <code>README.md</code>.</div>`}
        <button class="oauth-btn" id="google" ${CONFIGURED ? "" : "disabled"}>${g} Sign in with Google (Gmail)</button>
        <button class="oauth-btn" id="microsoft" ${CONFIGURED ? "" : "disabled"}>${ms} Sign in with Microsoft (Outlook)</button>

        <div class="or-divider"><span>or use email</span></div>

        <form id="email-form" autocomplete="on">
          <div id="name-field" hidden>
            <input id="e-name" type="text" placeholder="Full name" autocomplete="name" />
          </div>
          <input id="e-email" type="email" placeholder="Email address" autocomplete="email" ${CONFIGURED ? "" : "disabled"} />
          <input id="e-pass" type="password" placeholder="Password" autocomplete="current-password" ${CONFIGURED ? "" : "disabled"} />
          <button class="gold" type="submit" id="e-submit" style="width:100%" ${CONFIGURED ? "" : "disabled"}>Sign in</button>
        </form>
        <div class="login-links">
          <a href="#" id="toggle-mode">Create an account</a>
          <a href="#" id="forgot">Forgot password?</a>
        </div>

        <div class="login-foot">Your logbook is private to you. Admins can review all interns' hours.</div>
      </div>
    </div>`;
  document.getElementById("google").onclick = () => login(googleProvider);
  document.getElementById("microsoft").onclick = () => login(microsoftProvider);
  wireEmailAuth();
  refreshThemeToggles();
}

// Email + password sign-in / sign-up (for people without Google or Outlook).
let emailMode = "signin"; // or "signup"
function wireEmailAuth() {
  emailMode = "signin";
  const form = document.getElementById("email-form");
  const nameField = document.getElementById("name-field");
  const submit = document.getElementById("e-submit");
  const passEl = document.getElementById("e-pass");
  const toggle = document.getElementById("toggle-mode");

  const applyMode = () => {
    const signup = emailMode === "signup";
    nameField.hidden = !signup;
    submit.textContent = signup ? "Create account" : "Sign in";
    passEl.setAttribute("autocomplete", signup ? "new-password" : "current-password");
    toggle.textContent = signup ? "Already have an account? Sign in" : "Create an account";
  };
  toggle.onclick = (ev) => { ev.preventDefault(); emailMode = emailMode === "signup" ? "signin" : "signup"; applyMode(); };

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (!CONFIGURED) return;
    const email = document.getElementById("e-email").value.trim();
    const pass = passEl.value;
    const name = document.getElementById("e-name").value.trim();
    if (!email || !pass) return toast("Enter your email and password.", true);
    submit.disabled = true;
    try {
      if (emailMode === "signup") {
        if (pass.length < 6) { toast("Password must be at least 6 characters.", true); submit.disabled = false; return; }
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        if (name) { try { await updateProfile(cred.user, { displayName: name }); } catch { /* non-fatal */ } }
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
      // onAuthStateChanged takes over from here.
    } catch (e) {
      toast(emailAuthError(e), true);
      console.error(e);
      submit.disabled = false;
    }
  };

  document.getElementById("forgot").onclick = async (ev) => {
    ev.preventDefault();
    if (!CONFIGURED) return;
    const email = (document.getElementById("e-email").value || "").trim();
    if (!email) return toast("Type your email above first, then click “Forgot password?”.", true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast("Password reset email sent. Check your inbox.");
    } catch (e) { toast(emailAuthError(e), true); console.error(e); }
  };
}

function emailAuthError(e) {
  const code = e?.code || "";
  if (code.includes("invalid-email")) return "That email address doesn't look valid.";
  if (code.includes("email-already-in-use")) return "An account with this email already exists — try signing in.";
  if (code.includes("weak-password")) return "Password is too weak (use at least 6 characters).";
  if (code.includes("user-not-found")) return "No account found with that email — create one first.";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Incorrect email or password.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please wait a bit and try again.";
  if (code.includes("operation-not-allowed")) return "Email/password sign-in isn't enabled in Firebase yet.";
  return "Something went wrong. Please try again.";
}

async function login(provider) {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = e?.code || "";
    let msg = "Sign-in failed. Please try again.";
    if (code.includes("popup-closed") || code.includes("cancelled")) msg = "Sign-in cancelled.";
    else if (code.includes("unauthorized-domain")) msg = "This domain isn't authorised in Firebase Auth settings.";
    else if (code.includes("operation-not-allowed")) msg = "This provider isn't enabled in Firebase Authentication.";
    else if (code.includes("account-exists-with-different-credential")) msg = "You already signed in with a different provider using this email.";
    toast(msg, true);
    console.error(e);
  }
}

// ------------------------------------------------- intern dashboard
function statProgress(logs, profile) {
  const done = totalActual(logs);
  const target = Number(profile.totalRequired) || 0;
  const pct = target > 0 ? Math.min(100, (done / target) * 100) : 0;
  const remaining = target > 0 ? Math.max(0, target - done) : 0;
  return { done, target, pct, remaining };
}

function renderInternDashboard(logs) {
  const p = state.profile;
  const { done, target, pct, remaining } = statProgress(logs, p);
  appEl.innerHTML = topbar() + `
    <div class="wrap">
      <div class="page-head">
        <div>
          <h1>My Logbook</h1>
          <p>${esc(p.name || "Intern")}${p.department ? " · " + esc(p.department) : ""}</p>
        </div>
        <div class="row-actions">
          <button class="secondary" id="edit-profile">Edit details</button>
          <button class="gold" id="add-log">+ Log entry</button>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><div class="k">Hours logged</div><div class="v">${fmtHours(done)}</div><div class="u">actual hours</div></div>
        <div class="stat"><div class="k">Required total</div><div class="v">${target ? fmtHours(target) : "—"}</div><div class="u">${target ? "target hours" : "set in details"}</div></div>
        <div class="stat"><div class="k">Remaining</div><div class="v">${target ? fmtHours(remaining) : "—"}</div><div class="u">hours to go</div></div>
        <div class="stat"><div class="k">Entries</div><div class="v">${logs.length}</div><div class="u">days logged</div></div>
      </div>
      ${target ? `<div class="progress"><span style="width:${pct}%"></span></div><p class="hint" style="margin-top:8px">${pct.toFixed(0)}% of required hours complete.</p>` : ""}

      <div class="card">
        <h2>Daily time log</h2>
        <p class="hint">${p.timeInLink ? `Time reference: <a href="${esc(p.timeInLink)}" target="_blank" rel="noopener">${esc(p.timeInLink)}</a>` : ""}${p.folderLink ? ` · <a href="${esc(p.folderLink)}" target="_blank" rel="noopener">Proof folder</a>` : ""}</p>
        <div class="table-wrap">${logTable(logs, true)}</div>
        <div class="row-actions"><button class="secondary small" id="export">Export CSV</button></div>
      </div>
    </div>`;
  wireTopbar();
  document.getElementById("add-log").onclick = () => openLogModal(state.user.uid, null, () => reloadInternLogs());
  document.getElementById("edit-profile").onclick = () => openProfileModal(p, () => reloadInternLogs());
  document.getElementById("export").onclick = () => downloadCsv(`logbook-${(p.name || "intern").replace(/\s+/g, "_")}.csv`, logsToCsv(p, logs));
  wireLogRowActions(state.user.uid, logs, () => reloadInternLogs(), true);
}

async function reloadInternLogs() {
  const logs = await store.getLogs(state.user.uid);
  state.profile = (await store.getProfile(state.user.uid)) || state.profile;
  renderInternDashboard(logs);
}

// ------------------------------------------------- shared log table
function logTable(logs, editable) {
  if (!logs.length) {
    return `<div class="empty">No entries yet.${editable ? " Click “+ Log entry” to record your first day." : ""}</div>`;
  }
  const rows = logs.map((l) => `
    <tr>
      <td>${esc(fmtDate(l.date))}</td>
      <td>${esc(fmtTime(l.timeIn))}</td>
      <td>${l.timeInProof ? `<a class="proof-link" href="${esc(l.timeInProof)}" target="_blank" rel="noopener">view</a>` : "—"}</td>
      <td>${esc(fmtTime(l.timeOut))}</td>
      <td>${l.timeOutProof ? `<a class="proof-link" href="${esc(l.timeOutProof)}" target="_blank" rel="noopener">view</a>` : "—"}</td>
      <td>${fmtHours(l.hours)}</td>
      <td><strong>${fmtHours(l.actualHours)}</strong></td>
      ${editable ? `<td><button class="ghost small" data-edit="${esc(l.id)}">Edit</button><button class="ghost small" data-del="${esc(l.id)}" style="color:var(--danger)">Delete</button></td>` : ""}
    </tr>`).join("");
  return `
    <table>
      <thead><tr>
        <th>Date</th><th>Time In</th><th>Proof</th><th>Time Out</th><th>Proof</th>
        <th>No. of Hours</th><th>Actual Hours</th>${editable ? "<th></th>" : ""}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function wireLogRowActions(uid, logs, onDone, editable) {
  if (!editable) return;
  appEl.querySelectorAll("[data-edit]").forEach((b) => {
    b.onclick = () => {
      const entry = logs.find((l) => l.id === b.dataset.edit);
      openLogModal(uid, entry, onDone);
    };
  });
  appEl.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("Delete this log entry?")) return;
      try {
        await store.deleteLog(uid, b.dataset.del);
        toast("Entry deleted.");
        onDone();
      } catch (e) { toast("Could not delete entry.", true); console.error(e); }
    };
  });
}

// ----------------------------------------------------- log modal
function openLogModal(uid, entry, onDone) {
  const e = entry || {};
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal">
      <h2>${entry ? "Edit" : "New"} log entry</h2>
      <div class="grid">
        <div><label>Date</label><input type="date" id="f-date" value="${esc(e.date || todayISO())}" /></div>
        <div class="grid two">
          <div><label>Time In</label><input type="time" id="f-in" value="${esc(e.timeIn || "")}" /></div>
          <div><label>Time Out</label><input type="time" id="f-out" value="${esc(e.timeOut || "")}" /></div>
        </div>
        <div><label>Time-In proof (screenshot link)</label><input type="url" id="f-inproof" placeholder="https://…" value="${esc(e.timeInProof || "")}" /></div>
        <div><label>Time-Out proof (screenshot link)</label><input type="url" id="f-outproof" placeholder="https://…" value="${esc(e.timeOutProof || "")}" /></div>
        <div><label>Actual hours <span style="font-weight:400">(auto-filled from times; edit to deduct breaks)</span></label><input type="number" step="0.25" min="0" id="f-actual" value="${esc(e.actualHours ?? "")}" /></div>
        <div><label>Notes (optional)</label><textarea id="f-notes" rows="2">${esc(e.notes || "")}</textarea></div>
      </div>
      <div class="modal-foot">
        <button class="secondary" id="m-cancel">Cancel</button>
        <button class="gold" id="m-save">Save entry</button>
      </div>
    </div>`;
  document.body.appendChild(back);

  const inEl = back.querySelector("#f-in");
  const outEl = back.querySelector("#f-out");
  const actualEl = back.querySelector("#f-actual");
  let actualTouched = !!(entry && entry.actualHours != null);
  actualEl.addEventListener("input", () => (actualTouched = true));
  const recompute = () => {
    if (actualTouched) return;
    const h = computeHours(inEl.value, outEl.value);
    if (h) actualEl.value = h;
  };
  inEl.addEventListener("change", recompute);
  outEl.addEventListener("change", recompute);

  const close = () => back.remove();
  back.addEventListener("click", (ev) => { if (ev.target === back) close(); });
  back.querySelector("#m-cancel").onclick = close;
  back.querySelector("#m-save").onclick = async () => {
    const date = back.querySelector("#f-date").value;
    if (!date) return toast("Please choose a date.", true);
    const timeIn = inEl.value, timeOut = outEl.value;
    const hours = computeHours(timeIn, timeOut);
    const actualRaw = actualEl.value;
    const record = {
      date,
      timeIn,
      timeOut,
      timeInProof: back.querySelector("#f-inproof").value.trim(),
      timeOutProof: back.querySelector("#f-outproof").value.trim(),
      hours,
      actualHours: actualRaw === "" ? hours : Number(actualRaw),
      notes: back.querySelector("#f-notes").value.trim(),
    };
    try {
      if (entry) await store.updateLog(uid, entry.id, record);
      else await store.addLog(uid, record);
      toast("Entry saved.");
      close();
      onDone();
    } catch (err) { toast("Could not save entry.", true); console.error(err); }
  };
}

// ----------------------------------------------------- profile modal
function openProfileModal(profile, onDone) {
  const p = profile;
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal">
      <h2>Intern details</h2>
      <div class="grid">
        <div class="grid two">
          <div><label>Full name</label><input id="p-name" value="${esc(p.name || "")}" /></div>
          <div><label>Department</label><input id="p-dept" value="${esc(p.department || "")}" placeholder="e.g. Social Media / Branding" /></div>
        </div>
        <div class="grid two">
          <div><label>School</label><input id="p-school" value="${esc(p.school || "")}" /></div>
          <div><label>Date started</label><input type="date" id="p-start" value="${esc(p.dateStart || "")}" /></div>
        </div>
        <div class="grid three">
          <div><label>Required hours / day</label><input id="p-req" value="${esc(p.requiredHours || "")}" placeholder="4 hrs" /></div>
          <div><label>Weekly hours</label><input id="p-week" value="${esc(p.weeklyHours || "")}" placeholder="20 hrs" /></div>
          <div><label>Total required hours</label><input type="number" id="p-total" value="${esc(p.totalRequired || "")}" placeholder="486" /></div>
        </div>
        <div><label>Time-in reference link</label><input type="url" id="p-timelink" value="${esc(p.timeInLink || "")}" placeholder="https://time.is/" /></div>
        <div><label>Proof folder link</label><input type="url" id="p-folder" value="${esc(p.folderLink || "")}" placeholder="https://drive.google.com/…" /></div>
      </div>
      <div class="modal-foot">
        <button class="secondary" id="p-cancel">Cancel</button>
        <button class="gold" id="p-save">Save details</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener("click", (ev) => { if (ev.target === back) close(); });
  back.querySelector("#p-cancel").onclick = close;
  back.querySelector("#p-save").onclick = async () => {
    const fields = {
      name: back.querySelector("#p-name").value.trim(),
      department: back.querySelector("#p-dept").value.trim(),
      school: back.querySelector("#p-school").value.trim(),
      dateStart: back.querySelector("#p-start").value,
      requiredHours: back.querySelector("#p-req").value.trim(),
      weeklyHours: back.querySelector("#p-week").value.trim(),
      totalRequired: back.querySelector("#p-total").value.trim(),
      timeInLink: back.querySelector("#p-timelink").value.trim(),
      folderLink: back.querySelector("#p-folder").value.trim(),
    };
    try {
      await store.saveProfile(profile.uid, fields);
      state.profile = { ...state.profile, ...fields };
      toast("Details saved.");
      close();
      onDone();
    } catch (err) { toast("Could not save details.", true); console.error(err); }
  };
}

// ----------------------------------------------------- admin dashboard
async function renderAdminDashboard() {
  appEl.innerHTML = topbar() + `<div class="wrap"><div class="center-load">Loading interns…</div></div>`;
  wireTopbar();
  let interns;
  try {
    interns = await store.getAllInterns();
  } catch (e) {
    appEl.innerHTML = topbar() + `<div class="wrap"><div class="card"><p>Could not load interns. Check your Firestore rules.</p></div></div>`;
    wireTopbar();
    console.error(e);
    return;
  }

  // Pull each intern's logs to compute totals.
  const withTotals = await Promise.all(interns.map(async (it) => {
    let logs = [];
    try { logs = await store.getLogs(it.uid); } catch { /* ignore */ }
    const target = Number(it.totalRequired) || 0;
    const done = totalActual(logs);
    return { ...it, logCount: logs.length, done, target };
  }));
  withTotals.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const totalHours = withTotals.reduce((s, i) => s + i.done, 0);
  const active = withTotals.filter((i) => i.logCount > 0).length;

  const rows = withTotals.map((it) => {
    const pct = it.target > 0 ? Math.min(100, (it.done / it.target) * 100) : 0;
    let pill = '<span class="pill on-track">In progress</span>';
    if (it.target > 0 && it.done >= it.target) pill = '<span class="pill done">Completed</span>';
    else if (it.target > 0 && pct < 50) pill = '<span class="pill behind">Behind</span>';
    else if (!it.logCount) pill = '<span class="pill behind">No logs</span>';
    return `
      <tr>
        <td><strong>${esc(it.name || "—")}</strong><br><span class="hint">${esc(it.email || "")}</span></td>
        <td>${esc(it.department || "—")}</td>
        <td>${esc(it.school || "—")}</td>
        <td>${fmtHours(it.done)}${it.target ? " / " + fmtHours(it.target) : ""}</td>
        <td>${it.logCount}</td>
        <td>${pill}</td>
        <td style="white-space:nowrap">
          <button class="secondary small" data-view="${esc(it.uid)}">View log</button>
          <button class="danger small" data-del-intern="${esc(it.uid)}" data-name="${esc(it.name || it.email || "this intern")}">Delete</button>
        </td>
      </tr>`;
  }).join("");

  appEl.innerHTML = topbar() + `
    <div class="wrap">
      <div class="page-head">
        <div><h1>Admin Dashboard</h1><p>Overview of all ${ORG_NAME} interns and their recorded hours.</p></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="k">Interns</div><div class="v">${withTotals.length}</div><div class="u">registered</div></div>
        <div class="stat"><div class="k">Active</div><div class="v">${active}</div><div class="u">with logged days</div></div>
        <div class="stat"><div class="k">Total hours</div><div class="v">${fmtHours(totalHours)}</div><div class="u">across all interns</div></div>
        <div class="stat"><div class="k">Completed</div><div class="v">${withTotals.filter(i => i.target > 0 && i.done >= i.target).length}</div><div class="u">met their target</div></div>
      </div>
      <div class="card">
        <h2>Interns</h2>
        <p class="hint">Click “View log” to inspect and export any intern's daily entries.</p>
        <div class="table-wrap">
          ${withTotals.length ? `<table>
            <thead><tr><th>Intern</th><th>Department</th><th>School</th><th>Hours</th><th>Entries</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows}</tbody></table>` : '<div class="empty">No interns have signed in yet.</div>'}
        </div>
      </div>
    </div>`;
  wireTopbar();
  appEl.querySelectorAll("[data-view]").forEach((b) => {
    b.onclick = () => renderAdminInternDetail(withTotals.find((i) => i.uid === b.dataset.view));
  });
  appEl.querySelectorAll("[data-del-intern]").forEach((b) => {
    b.onclick = () => confirmDeleteIntern(b.dataset.delIntern, b.dataset.name);
  });
}

async function confirmDeleteIntern(uid, name) {
  if (!confirm(`Delete ${name} and ALL of their log entries?\n\nThis permanently removes their logbook record and cannot be undone.`)) return;
  try {
    await store.deleteIntern(uid);
    toast("Intern deleted.");
    renderAdminDashboard();
  } catch (e) {
    toast("Could not delete intern.", true);
    console.error(e);
  }
}

async function renderAdminInternDetail(intern) {
  appEl.innerHTML = topbar() + `<div class="wrap"><div class="center-load">Loading log…</div></div>`;
  wireTopbar();
  let logs = [];
  try { logs = await store.getLogs(intern.uid); } catch (e) { console.error(e); }
  const { done, target, pct, remaining } = statProgress(logs, intern);

  appEl.innerHTML = topbar() + `
    <div class="wrap">
      <button class="back-link" id="back">← Back to all interns</button>
      <div class="page-head">
        <div><h1>${esc(intern.name || "Intern")}</h1><p>${esc(intern.email || "")}${intern.department ? " · " + esc(intern.department) : ""}${intern.school ? " · " + esc(intern.school) : ""}</p></div>
        <div class="row-actions">
          <button class="gold" id="admin-add">+ Log entry</button>
          <button class="secondary" id="admin-export">Export CSV</button>
          <button class="danger" id="admin-delete">Delete intern</button>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="k">Hours logged</div><div class="v">${fmtHours(done)}</div><div class="u">actual hours</div></div>
        <div class="stat"><div class="k">Required total</div><div class="v">${target ? fmtHours(target) : "—"}</div><div class="u">target</div></div>
        <div class="stat"><div class="k">Remaining</div><div class="v">${target ? fmtHours(remaining) : "—"}</div><div class="u">hours to go</div></div>
        <div class="stat"><div class="k">Entries</div><div class="v">${logs.length}</div><div class="u">days</div></div>
      </div>
      ${target ? `<div class="progress"><span style="width:${pct}%"></span></div>` : ""}
      <div class="card" style="margin-top:22px">
        <h2>Daily time log</h2>
        <div class="table-wrap">${logTable(logs, true)}</div>
      </div>
    </div>`;
  wireTopbar();
  document.getElementById("back").onclick = () => renderAdminDashboard();
  document.getElementById("admin-add").onclick = () => openLogModal(intern.uid, null, () => renderAdminInternDetail(intern));
  document.getElementById("admin-export").onclick = () => downloadCsv(`logbook-${(intern.name || "intern").replace(/\s+/g, "_")}.csv`, logsToCsv(intern, logs));
  document.getElementById("admin-delete").onclick = () => confirmDeleteIntern(intern.uid, intern.name || intern.email || "this intern");
  wireLogRowActions(intern.uid, logs, () => renderAdminInternDetail(intern), true);
}

// -------------------------------------------------------- auth routing
onAuthStateChanged(auth, async (user) => {
  state.user = user;
  if (!user) {
    state.profile = null;
    state.admin = false;
    renderLogin();
    return;
  }
  appEl.innerHTML = `<div class="center-load">Loading your logbook…</div>`;
  try {
    state.admin = await store.isAdmin(user);
    if (state.admin) {
      // Admins still get a profile record so they appear consistently.
      await store.ensureProfile(user);
      renderAdminDashboard();
    } else {
      state.profile = await store.ensureProfile(user);
      const logs = await store.getLogs(user.uid);
      renderInternDashboard(logs);
    }
  } catch (e) {
    console.error(e);
    appEl.innerHTML = topbar() + `<div class="wrap"><div class="card"><h2>Something went wrong</h2><p class="hint">We couldn't load your data. This usually means Firestore isn't set up or the security rules block access. See README.md.</p></div></div>`;
    wireTopbar();
  }
});

if (!CONFIGURED) renderLogin();
