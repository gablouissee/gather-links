import {
  auth,
  googleProvider,
  microsoftProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "./firebase.js";
import { firebaseConfig, ORG_NAME, USERNAME_DOMAIN } from "./config.js";
import * as store from "./store.js";
import {
  esc,
  sanitizeUsername,
  usernameToEmail,
  fileToCompressedDataURL,
  fileToDataURL,
  downloadDataUrl,
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

// Active chat listener (unsubscribed when navigating away).
let chatUnsub = null;
function stopChat() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
}

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
  const who = u?.displayName
    || (state.profile && state.profile.username ? "@" + state.profile.username : u?.email)
    || "";
  const initials = (who || "?")
    .replace(/^@/, "")
    .split(/[\s.]+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
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
        <span>${esc(who)}</span>
      </div>
      <button class="ghost" id="open-chat" style="color:#fff" title="Messages">💬</button>
      <button class="theme-toggle" title="Toggle theme">🌙</button>
      <button class="ghost" id="signout" style="color:#fff">Sign out</button>
    </header>`;
}

function wireTopbar() {
  const btn = document.getElementById("signout");
  if (btn) btn.onclick = () => signOut(auth);
  const chat = document.getElementById("open-chat");
  if (chat) chat.onclick = () => renderMessages();
  refreshThemeToggles();
}

// -------------------------------------------------------------- login
function renderLogin() {
  stopChat();
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

        <div class="or-divider"><span>or use a username</span></div>

        <form id="email-form" autocomplete="on">
          <input id="e-user" type="text" placeholder="Username" autocomplete="username" autocapitalize="none" spellcheck="false" ${CONFIGURED ? "" : "disabled"} />
          <input id="e-pass" type="password" placeholder="Password" autocomplete="current-password" ${CONFIGURED ? "" : "disabled"} />
          <button class="gold" type="submit" id="e-submit" style="width:100%" ${CONFIGURED ? "" : "disabled"}>Sign in</button>
        </form>

        <div class="login-foot">Use the username &amp; password your coordinator gave you, or sign in with Google / Outlook. Forgot your password? Ask your coordinator to reset it.</div>
      </div>
    </div>`;
  document.getElementById("google").onclick = () => login(googleProvider);
  document.getElementById("microsoft").onclick = () => login(microsoftProvider);
  wireEmailAuth();
  refreshThemeToggles();
}

// Username + password sign-in (accounts are created by an admin, not self-service).
function wireEmailAuth() {
  const form = document.getElementById("email-form");
  const submit = document.getElementById("e-submit");
  const passEl = document.getElementById("e-pass");

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (!CONFIGURED) return;
    const username = sanitizeUsername(document.getElementById("e-user").value);
    const pass = passEl.value;
    if (!username || !pass) return toast("Enter your username and password.", true);
    submit.disabled = true;
    try {
      await signInWithEmailAndPassword(auth, usernameToEmail(username, USERNAME_DOMAIN), pass);
      // onAuthStateChanged takes over from here.
    } catch (e) {
      toast(emailAuthError(e), true);
      console.error(e);
      submit.disabled = false;
    }
  };
}

function emailAuthError(e) {
  const code = e?.code || "";
  if (code.includes("invalid-email")) return "That username has invalid characters.";
  if (code.includes("email-already-in-use")) return "That username is already taken.";
  if (code.includes("weak-password")) return "Password is too weak (use at least 6 characters).";
  if (code.includes("user-not-found")) return "No account found with that username.";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Incorrect username or password.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please wait a bit and try again.";
  if (code.includes("operation-not-allowed")) return "Username sign-in isn't enabled in Firebase yet (enable Email/Password).";
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
  stopChat();
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
      <td>${proofCell(l, "in")}</td>
      <td>${esc(fmtTime(l.timeOut))}</td>
      <td>${proofCell(l, "out")}</td>
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

function proofCell(l, which) {
  const link = which === "in" ? l.timeInProof : l.timeOutProof;
  const isImg = which === "in" ? l.timeInProofImg : l.timeOutProofImg;
  if (isImg) {
    return `<button class="ghost small proof-view" data-proof-log="${esc(l.id)}" data-proof-which="${which}">📷 photo</button>`;
  }
  if (link) {
    return `<a class="proof-link" href="${esc(link)}" target="_blank" rel="noopener">link</a>`;
  }
  return "—";
}

function openProofLightbox(uid, logId, which) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="lightbox"><div class="center-load" style="color:#fff">Loading photo…</div></div>`;
  document.body.appendChild(back);
  back.addEventListener("click", () => back.remove());
  store.getProofs(uid, logId).then((p) => {
    const url = p && (which === "in" ? p.timeIn : p.timeOut);
    back.querySelector(".lightbox").innerHTML = url
      ? `<img src="${url}" alt="Proof photo" /><div style="text-align:center;margin-top:10px"><button class="secondary small">Close</button></div>`
      : `<p style="color:#fff">Photo not found.</p>`;
  }).catch((e) => {
    console.error(e);
    back.querySelector(".lightbox").innerHTML = `<p style="color:#fff">Could not load photo.</p>`;
  });
}

function wireLogRowActions(uid, logs, onDone, editable) {
  appEl.querySelectorAll(".proof-view").forEach((b) => {
    b.onclick = () => openProofLightbox(uid, b.dataset.proofLog, b.dataset.proofWhich);
  });
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
        <div>
          <label>Time-In proof</label>
          <div class="proof-preview" id="in-preview" hidden></div>
          <input type="file" id="f-in-file" accept="image/*" class="proof-file" />
          <input type="url" id="f-inproof" placeholder="…or paste a link instead" value="${esc(e.timeInProof || "")}" />
        </div>
        <div>
          <label>Time-Out proof</label>
          <div class="proof-preview" id="out-preview" hidden></div>
          <input type="file" id="f-out-file" accept="image/*" class="proof-file" />
          <input type="url" id="f-outproof" placeholder="…or paste a link instead" value="${esc(e.timeOutProof || "")}" />
        </div>
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

  // --- proof photos ---
  const photos = { in: null, out: null }; // data URLs, or null
  const renderPreview = (which) => {
    const box = back.querySelector(which === "in" ? "#in-preview" : "#out-preview");
    const linkEl = back.querySelector(which === "in" ? "#f-inproof" : "#f-outproof");
    const data = photos[which];
    box.hidden = !data;
    box.innerHTML = data
      ? `<img src="${data}" alt="preview" /><button type="button" class="ghost small remove-photo" style="color:var(--danger)">Remove photo</button>`
      : "";
    if (data) {
      linkEl.value = "";
      linkEl.disabled = true;
      box.querySelector(".remove-photo").onclick = () => {
        photos[which] = null;
        const fileEl = back.querySelector(which === "in" ? "#f-in-file" : "#f-out-file");
        fileEl.value = "";
        linkEl.disabled = false;
        renderPreview(which);
      };
    } else {
      linkEl.disabled = false;
    }
  };
  const wireFile = (which) => {
    const fileEl = back.querySelector(which === "in" ? "#f-in-file" : "#f-out-file");
    fileEl.addEventListener("change", async () => {
      const file = fileEl.files && fileEl.files[0];
      if (!file) return;
      try {
        photos[which] = await fileToCompressedDataURL(file);
        renderPreview(which);
      } catch (err) { toast(err.message || "Could not use that image.", true); fileEl.value = ""; }
    });
  };
  wireFile("in");
  wireFile("out");
  // Load existing uploaded photos when editing.
  if (entry && (entry.timeInProofImg || entry.timeOutProofImg)) {
    store.getProofs(uid, entry.id).then((p) => {
      if (!p) return;
      if (p.timeIn) { photos.in = p.timeIn; renderPreview("in"); }
      if (p.timeOut) { photos.out = p.timeOut; renderPreview("out"); }
    }).catch((err) => console.error(err));
  }

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
      timeInProof: photos.in ? "" : back.querySelector("#f-inproof").value.trim(),
      timeInProofImg: !!photos.in,
      timeOutProof: photos.out ? "" : back.querySelector("#f-outproof").value.trim(),
      timeOutProofImg: !!photos.out,
      hours,
      actualHours: actualRaw === "" ? hours : Number(actualRaw),
      notes: back.querySelector("#f-notes").value.trim(),
    };
    const saveBtn = back.querySelector("#m-save");
    saveBtn.disabled = true;
    try {
      let logId = entry ? entry.id : null;
      if (entry) await store.updateLog(uid, logId, record);
      else logId = await store.addLog(uid, record);
      // Save/clear the photos if there are any now, or there were any before.
      if (photos.in || photos.out || (entry && (entry.timeInProofImg || entry.timeOutProofImg))) {
        await store.saveProofs(uid, logId, { timeIn: photos.in || "", timeOut: photos.out || "" });
      }
      toast("Entry saved.");
      close();
      onDone();
    } catch (err) { toast("Could not save entry.", true); console.error(err); saveBtn.disabled = false; }
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
  stopChat();
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

  // Keep the chat directory in sync so every intern is reachable in chat
  // automatically (runs in the background; only writes missing entries).
  store.syncDirectory(interns).catch((e) => console.error(e));

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
        <td><strong>${esc(it.name || "—")}</strong><br><span class="hint">${esc(it.username ? "@" + it.username : (it.email || ""))}</span></td>
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
        <div class="row-actions">
          <button class="secondary" id="open-docs">📁 Documents</button>
          <button class="gold" id="add-intern">+ Add intern</button>
        </div>
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
  document.getElementById("add-intern").onclick = () => openAddInternModal();
  document.getElementById("open-docs").onclick = () => renderDocuments();
}

// ----------------------------------------------------- documents library
const MAX_DOC_BYTES = 700 * 1024; // ~700 KB cap for uploaded files

async function renderDocuments() {
  stopChat();
  appEl.innerHTML = topbar() + `<div class="wrap"><div class="center-load">Loading documents…</div></div>`;
  wireTopbar();
  let docs = [];
  try {
    docs = await store.getDocuments();
  } catch (e) {
    console.error(e);
    appEl.innerHTML = topbar() + `<div class="wrap"><div class="card"><p>Could not load documents. Check your Firestore rules.</p></div></div>`;
    wireTopbar();
    return;
  }
  const items = docs.map((d) => `
    <tr>
      <td><strong>${esc(d.title || "Untitled")}</strong>${d.note ? `<br><span class="hint">${esc(d.note)}</span>` : ""}</td>
      <td>${d.fileName ? esc(d.fileName) : (d.link ? "Link" : "—")}</td>
      <td style="white-space:nowrap">
        ${d.hasFile ? `<button class="secondary small" data-dl="${esc(d.id)}" data-name="${esc(d.fileName || "document")}">Download</button>` : ""}
        ${d.link ? `<a class="proof-link" href="${esc(d.link)}" target="_blank" rel="noopener">Open link</a>` : ""}
        <button class="danger small" data-del-doc="${esc(d.id)}" data-title="${esc(d.title || "this document")}">Delete</button>
      </td>
    </tr>`).join("");

  appEl.innerHTML = topbar() + `
    <div class="wrap">
      <button class="back-link" id="back">← Back to dashboard</button>
      <div class="page-head">
        <div><h1>Documents</h1><p>Store OJT forms, memos and other files (private to admins).</p></div>
        <div class="row-actions"><button class="gold" id="add-doc">+ Add document</button></div>
      </div>
      <div class="card">
        <div class="table-wrap">
          ${docs.length ? `<table>
            <thead><tr><th>Title</th><th>File</th><th></th></tr></thead>
            <tbody>${items}</tbody></table>` : '<div class="empty">No documents yet. Click “+ Add document”.</div>'}
        </div>
      </div>
    </div>`;
  wireTopbar();
  document.getElementById("back").onclick = () => renderAdminDashboard();
  document.getElementById("add-doc").onclick = () => openAddDocumentModal();
  appEl.querySelectorAll("[data-dl]").forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        const f = await store.getDocumentFile(b.dataset.dl);
        if (f && f.data) downloadDataUrl(f.fileName || b.dataset.name, f.data);
        else toast("File not found.", true);
      } catch (e) { toast("Could not download file.", true); console.error(e); }
      b.disabled = false;
    };
  });
  appEl.querySelectorAll("[data-del-doc]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm(`Delete “${b.dataset.title}”?`)) return;
      try { await store.deleteDocument(b.dataset.delDoc); toast("Document deleted."); renderDocuments(); }
      catch (e) { toast("Could not delete document.", true); console.error(e); }
    };
  });
}

function openAddDocumentModal() {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal">
      <h2>Add document</h2>
      <p class="hint">Upload a file (up to 700 KB) or paste a link (for bigger files, e.g. Google Drive).</p>
      <div class="grid">
        <div><label>Title</label><input id="d-title" placeholder="e.g. OJT Endorsement Form" /></div>
        <div><label>Note (optional)</label><input id="d-note" placeholder="short description" /></div>
        <div>
          <label>File</label>
          <input type="file" id="d-file" class="proof-file" />
          <div class="hint" id="d-fileinfo"></div>
        </div>
        <div><label>…or a link</label><input type="url" id="d-link" placeholder="https://drive.google.com/…" /></div>
      </div>
      <div class="modal-foot">
        <button class="secondary" id="d-cancel">Cancel</button>
        <button class="gold" id="d-save">Save document</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener("click", (ev) => { if (ev.target === back) close(); });
  back.querySelector("#d-cancel").onclick = close;

  let fileData = null; // { data, fileName, mime }
  const info = back.querySelector("#d-fileinfo");
  const linkEl = back.querySelector("#d-link");
  back.querySelector("#d-file").addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    fileData = null;
    info.textContent = "";
    if (!file) return;
    try {
      let dataUrl;
      if (file.type.startsWith("image/")) {
        dataUrl = await fileToCompressedDataURL(file, { maxDim: 1600, maxBytes: 500000 });
      } else {
        if (file.size > MAX_DOC_BYTES) {
          toast("That file is over 700 KB — paste a link instead.", true);
          ev.target.value = "";
          return;
        }
        dataUrl = await fileToDataURL(file);
      }
      fileData = { data: dataUrl, fileName: file.name, mime: file.type || "application/octet-stream" };
      info.textContent = `Selected: ${file.name}`;
      linkEl.value = "";
      linkEl.disabled = true;
    } catch (e) { toast(e.message || "Could not read that file.", true); ev.target.value = ""; }
  });

  back.querySelector("#d-save").onclick = async () => {
    const title = back.querySelector("#d-title").value.trim();
    const note = back.querySelector("#d-note").value.trim();
    const link = linkEl.value.trim();
    if (!title) return toast("Please enter a title.", true);
    if (!fileData && !link) return toast("Add a file or a link.", true);
    const btn = back.querySelector("#d-save");
    btn.disabled = true;
    try {
      await store.addDocument(
        { title, note, link: fileData ? "" : link, fileName: fileData ? fileData.fileName : "", hasFile: !!fileData },
        fileData,
      );
      toast("Document saved.");
      close();
      renderDocuments();
    } catch (e) { toast("Could not save document.", true); console.error(e); btn.disabled = false; }
  };
}

// Admin-only: create a new intern's email/password account.
function openAddInternModal() {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal">
      <h2>Add intern</h2>
      <p class="hint">Create a login for an intern. Give them the username and password — no email needed.</p>
      <div class="grid">
        <div><label>Full name</label><input id="a-name" placeholder="Juan Dela Cruz" /></div>
        <div><label>Username</label><input id="a-user" type="text" autocapitalize="none" spellcheck="false" placeholder="e.g. juan.delacruz" /></div>
        <div><label>Temporary password</label><input id="a-pass" type="text" placeholder="at least 6 characters" /></div>
        <div class="grid two">
          <div><label>Department</label><input id="a-dept" placeholder="e.g. Marketing" /></div>
          <div><label>Total required hours</label><input id="a-total" type="number" placeholder="486" /></div>
        </div>
        <div><label>School</label><input id="a-school" placeholder="School name" /></div>
      </div>
      <div class="modal-foot">
        <button class="secondary" id="a-cancel">Cancel</button>
        <button class="gold" id="a-save">Create account</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener("click", (ev) => { if (ev.target === back) close(); });
  back.querySelector("#a-cancel").onclick = close;
  back.querySelector("#a-save").onclick = async () => {
    const username = sanitizeUsername(back.querySelector("#a-user").value);
    const password = back.querySelector("#a-pass").value;
    const name = back.querySelector("#a-name").value.trim();
    if (!username || !password) return toast("Username and password are required.", true);
    if (password.length < 6) return toast("Password must be at least 6 characters.", true);
    const btn = back.querySelector("#a-save");
    btn.disabled = true;
    try {
      await store.adminCreateIntern({
        username,
        password,
        name,
        department: back.querySelector("#a-dept").value.trim(),
        school: back.querySelector("#a-school").value.trim(),
        totalRequired: back.querySelector("#a-total").value.trim(),
      });
      toast(`Account created for @${username}.`);
      close();
      renderAdminDashboard();
    } catch (e) {
      toast(emailAuthError(e), true);
      console.error(e);
      btn.disabled = false;
    }
  };
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
  stopChat();
  appEl.innerHTML = topbar() + `<div class="wrap"><div class="center-load">Loading log…</div></div>`;
  wireTopbar();
  let logs = [];
  try { logs = await store.getLogs(intern.uid); } catch (e) { console.error(e); }
  const { done, target, pct, remaining } = statProgress(logs, intern);

  appEl.innerHTML = topbar() + `
    <div class="wrap">
      <button class="back-link" id="back">← Back to all interns</button>
      <div class="page-head">
        <div><h1>${esc(intern.name || "Intern")}</h1><p>${esc(intern.username ? "@" + intern.username : (intern.email || ""))}${intern.department ? " · " + esc(intern.department) : ""}${intern.school ? " · " + esc(intern.school) : ""}</p></div>
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
        <h2>Admin notes <span style="font-weight:400;font-size:13px;color:var(--muted)">(private — only admins can see this)</span></h2>
        <textarea id="admin-notes" rows="4" placeholder="Notes about this intern…">Loading…</textarea>
        <div class="row-actions"><button class="secondary small" id="save-notes">Save notes</button></div>
      </div>
      <div class="card">
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

  // Admin notes: load then enable saving.
  const notesEl = document.getElementById("admin-notes");
  store.getAdminNotes(intern.uid).then((t) => { notesEl.value = t; }).catch(() => { notesEl.value = ""; });
  document.getElementById("save-notes").onclick = async () => {
    const btn = document.getElementById("save-notes");
    btn.disabled = true;
    try { await store.saveAdminNotes(intern.uid, notesEl.value); toast("Notes saved."); }
    catch (e) { toast("Could not save notes.", true); console.error(e); }
    btn.disabled = false;
  };
}

// ----------------------------------------------------- messages / chat
function myDisplayName() {
  return (state.profile && (state.profile.name || (state.profile.username ? "@" + state.profile.username : ""))) ||
    state.user?.displayName || state.user?.email || "Me";
}

async function renderMessages() {
  stopChat();
  appEl.innerHTML = topbar() + `<div class="wrap"><div class="center-load">Loading messages…</div></div>`;
  wireTopbar();
  let dir = [], convos = [];
  try {
    // Admins back-fill the directory so all interns appear as contacts.
    if (state.admin) { try { await store.syncDirectory(); } catch (e) { console.error(e); } }
    [dir, convos] = await Promise.all([store.getDirectory(), store.myConversations(state.user.uid)]);
  } catch (e) {
    console.error(e);
    appEl.innerHTML = topbar() + `<div class="wrap"><div class="card"><p>Could not load messages. Make sure the Firestore rules are published.</p></div></div>`;
    wireTopbar();
    return;
  }
  const me = state.user.uid;
  const nameOf = (uid) => {
    const d = dir.find((x) => x.uid === uid);
    return d ? (d.name || (d.username ? "@" + d.username : "User")) : "User";
  };
  const others = dir.filter((d) => d.uid !== me);
  const lastByOther = {};
  convos.forEach((c) => {
    const other = (c.participants || []).find((u) => u !== me);
    if (other) lastByOther[other] = c.lastMessage || "";
  });
  // Order: people you've chatted with first (by recency), then everyone else.
  const chatted = convos.map((c) => (c.participants || []).find((u) => u !== me)).filter(Boolean);
  const rest = others.map((o) => o.uid).filter((u) => !chatted.includes(u));
  const order = [...chatted.filter((u) => others.some((o) => o.uid === u)), ...rest];

  const contacts = order.map((uid) => `
    <div class="chat-contact" data-uid="${esc(uid)}">
      <div class="nm">${esc(nameOf(uid))}</div>
      ${lastByOther[uid] ? `<div class="pv">${esc(lastByOther[uid])}</div>` : ""}
    </div>`).join("") || `<div class="empty" style="padding:20px">No other people yet.</div>`;

  appEl.innerHTML = topbar() + `
    <div class="wrap">
      <button class="back-link" id="back">← Back</button>
      <div class="page-head"><div><h1>Messages</h1><p>Private 1-on-1 chats.</p></div></div>
      <div class="chat-wrap">
        <div class="chat-list" id="chat-list">${contacts}</div>
        <div class="chat-thread" id="chat-thread"><div class="chat-empty">Pick someone to start chatting.</div></div>
      </div>
    </div>`;
  wireTopbar();
  document.getElementById("back").onclick = () => (state.admin ? renderAdminDashboard() : reloadInternLogs());
  appEl.querySelectorAll(".chat-contact").forEach((el) => {
    el.onclick = () => {
      appEl.querySelectorAll(".chat-contact").forEach((c) => c.classList.remove("active"));
      el.classList.add("active");
      openThread(el.dataset.uid, nameOf(el.dataset.uid));
    };
  });
}

async function openThread(otherUid, otherName) {
  stopChat();
  const me = state.user.uid;
  const pane = document.getElementById("chat-thread");
  pane.innerHTML = `<div class="chat-head">${esc(otherName)}</div><div class="chat-msgs" id="chat-msgs"><div class="center-load">…</div></div>
    <form class="chat-form" id="chat-form"><input id="chat-input" placeholder="Type a message…" autocomplete="off" /><button class="gold" type="submit">Send</button></form>`;
  let convId;
  try {
    convId = await store.ensureConversation(me, otherUid, { [me]: myDisplayName(), [otherUid]: otherName });
  } catch (e) {
    pane.innerHTML = `<div class="chat-empty">Could not open this chat.</div>`;
    console.error(e);
    return;
  }
  const msgsEl = document.getElementById("chat-msgs");
  chatUnsub = store.listenMessages(convId, (msgs) => {
    if (!document.body.contains(msgsEl)) return;
    msgsEl.innerHTML = msgs.length
      ? msgs.map((m) => `<div class="bubble ${m.from === me ? "me" : "them"}">${esc(m.text)}</div>`).join("")
      : `<div class="chat-empty">No messages yet. Say hi 👋</div>`;
    msgsEl.scrollTop = msgsEl.scrollHeight;
  });
  document.getElementById("chat-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try { await store.sendMessage(convId, me, text); }
    catch (e) { toast("Could not send message.", true); console.error(e); }
  };
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
