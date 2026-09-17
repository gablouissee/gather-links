// Small pure helpers: escaping, time/hours maths, formatting.

// Usernames: lowercase, only letters/digits/dot/underscore/hyphen.
export function sanitizeUsername(u) {
  return String(u || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}
// Map a username to the internal Firebase email it's stored under.
export function usernameToEmail(username, domain) {
  return `${sanitizeUsername(username)}@${domain}`;
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// Turn an <input type="time"> value ("HH:MM", 24h) into minutes since midnight.
function timeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Hours worked between a time-in and time-out, to 2 decimals.
// Handles a shift that crosses midnight.
export function computeHours(timeIn, timeOut) {
  const a = timeToMinutes(timeIn);
  const b = timeToMinutes(timeOut);
  if (a === null || b === null) return 0;
  let mins = b - a;
  if (mins < 0) mins += 24 * 60; // crossed midnight
  return Math.round((mins / 60) * 100) / 100;
}

// Present a 24h "HH:MM" as a friendly 12h string.
export function fmtTime(hhmm) {
  const mins = timeToMinutes(hhmm);
  if (mins === null) return "—";
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fmtHours(n) {
  const v = Number(n) || 0;
  return (Math.round(v * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

// Total actual hours across an array of log entries.
export function totalActual(logs) {
  return logs.reduce((sum, l) => sum + (Number(l.actualHours) || 0), 0);
}

// Build a CSV string from log entries (mirrors the original spreadsheet columns).
export function logsToCsv(profile, logs) {
  const rows = [];
  rows.push(["INTERN NAME", profile.name || ""]);
  rows.push(["DEPARTMENT", profile.department || ""]);
  rows.push(["DATE START", profile.dateStart || ""]);
  rows.push(["REQUIRED HOURS", profile.requiredHours || ""]);
  rows.push(["WEEKLY HOURS", profile.weeklyHours || ""]);
  rows.push(["TOTAL REQUIRED HOURS", profile.totalRequired || ""]);
  rows.push(["SCHOOL", profile.school || ""]);
  rows.push([]);
  rows.push(["DATE", "TIME IN", "PROOF", "TIME OUT", "PROOF", "NO. OF HOURS", "ACTUAL HOURS", "NOTES"]);
  for (const l of logs) {
    rows.push([
      l.date || "",
      fmtTime(l.timeIn),
      l.timeInProof || "",
      fmtTime(l.timeOut),
      l.timeOutProof || "",
      l.hours ?? "",
      l.actualHours ?? "",
      l.notes || "",
    ]);
  }
  return rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
