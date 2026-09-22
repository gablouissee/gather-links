// Firestore data access. All reads/writes go through here.
import {
  db,
  getSecondary,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "./firebase.js";
import { ADMIN_EMAILS, USERNAME_DOMAIN } from "./config.js";
import { usernameToEmail } from "./helpers.js";

// --- Intern profile -------------------------------------------------

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, "interns", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

// Create a profile document the first time a user signs in.
export async function ensureProfile(user) {
  const existing = await getProfile(user.uid);
  const profile = existing || {
    name: user.displayName || "",
    email: user.email || "",
    department: "",
    dateStart: "",
    requiredHours: "",
    weeklyHours: "",
    totalRequired: "",
    school: "",
    timeInLink: "https://time.is/",
    folderLink: "",
    createdAt: serverTimestamp(),
  };
  if (!existing) await setDoc(doc(db, "interns", user.uid), profile);
  // Keep a lightweight, readable directory entry for the chat contact list.
  try {
    await setDoc(doc(db, "directory", user.uid), {
      name: profile.name || user.displayName || "",
      username: profile.username || "",
    }, { merge: true });
  } catch { /* non-fatal */ }
  return { uid: user.uid, ...profile };
}

export async function saveProfile(uid, fields) {
  await updateDoc(doc(db, "interns", uid), fields);
  if (fields.name !== undefined) {
    try { await setDoc(doc(db, "directory", uid), { name: fields.name || "" }, { merge: true }); }
    catch { /* non-fatal */ }
  }
}

// --- Admin check ----------------------------------------------------

export async function isAdmin(user) {
  if (!user) return false;
  if (ADMIN_EMAILS.map((e) => e.toLowerCase()).includes((user.email || "").toLowerCase())) {
    return true;
  }
  try {
    const snap = await getDoc(doc(db, "admins", user.email));
    return snap.exists();
  } catch {
    return false;
  }
}

// --- Log entries ----------------------------------------------------

export async function getLogs(uid) {
  const q = query(collection(db, "interns", uid, "logs"), orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addLog(uid, entry) {
  const ref = await addDoc(collection(db, "interns", uid, "logs"), {
    ...entry,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLog(uid, logId, entry) {
  await updateDoc(doc(db, "interns", uid, "logs", logId), entry);
}

export async function deleteLog(uid, logId) {
  await deleteDoc(doc(db, "interns", uid, "logs", logId));
  // Remove any uploaded proof photos for this log too.
  try { await deleteDoc(doc(db, "interns", uid, "proofs", logId)); } catch { /* none */ }
}

// --- Proof photos (stored apart from logs so listings stay light) ----

export async function getProofs(uid, logId) {
  const snap = await getDoc(doc(db, "interns", uid, "proofs", logId));
  return snap.exists() ? snap.data() : null;
}

// Save (or clear) the time-in / time-out photos for a log. Data URLs are stored
// in a separate `proofs` document so log listings don't have to download images.
export async function saveProofs(uid, logId, { timeIn, timeOut }) {
  const ref = doc(db, "interns", uid, "proofs", logId);
  if (!timeIn && !timeOut) {
    try { await deleteDoc(ref); } catch { /* nothing to delete */ }
    return;
  }
  await setDoc(ref, { timeIn: timeIn || "", timeOut: timeOut || "" });
}

// --- Admin views ----------------------------------------------------

export async function getAllInterns() {
  const snap = await getDocs(collection(db, "interns"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// Admin creates an intern's email/password account without losing their own
// session. The new user is created on the secondary auth instance, and the
// profile document is written as that new user (so it satisfies the security
// rules), then the secondary instance is signed out again.
export async function adminCreateIntern({ username, password, name, department, school, totalRequired }) {
  const email = usernameToEmail(username, USERNAME_DOMAIN);
  const { auth: secAuth, db: secDb } = getSecondary();
  const cred = await createUserWithEmailAndPassword(secAuth, email, password);
  try {
    if (name) {
      try { await updateProfile(cred.user, { displayName: name }); } catch { /* non-fatal */ }
    }
    await setDoc(doc(secDb, "interns", cred.user.uid), {
      name: name || "",
      username: username.trim().toLowerCase(),
      email,
      department: department || "",
      dateStart: "",
      requiredHours: "",
      weeklyHours: "",
      totalRequired: totalRequired || "",
      school: school || "",
      timeInLink: "https://time.is/",
      folderLink: "",
      createdAt: serverTimestamp(),
    });
    // Directory entry (written as the new user, so it passes the rules).
    try {
      await setDoc(doc(secDb, "directory", cred.user.uid), {
        name: name || "",
        username: username.trim().toLowerCase(),
      }, { merge: true });
    } catch { /* non-fatal */ }
  } finally {
    await signOut(secAuth);
  }
  return cred.user.uid;
}

// Remove an intern entirely: all their log entries first, then the profile.
// (Firestore doesn't auto-delete subcollections, so we clear logs manually.)
export async function deleteIntern(uid) {
  const logs = await getLogs(uid);
  for (const l of logs) {
    await deleteLog(uid, l.id); // also removes each log's proof photos
  }
  // Safety net: clear any stray proof documents.
  const proofSnap = await getDocs(collection(db, "interns", uid, "proofs"));
  for (const d of proofSnap.docs) {
    await deleteDoc(doc(db, "interns", uid, "proofs", d.id));
  }
  await deleteDoc(doc(db, "interns", uid));
}

// --- Admin notes about an intern (private: admins only) ---------------

export async function getAdminNotes(uid) {
  const snap = await getDoc(doc(db, "interns", uid, "admin", "notes"));
  return snap.exists() ? (snap.data().text || "") : "";
}

export async function saveAdminNotes(uid, text) {
  await setDoc(doc(db, "interns", uid, "admin", "notes"), {
    text: text || "",
    updatedAt: serverTimestamp(),
  });
}

// --- Admin document library (admin only) -----------------------------
// Metadata lives in `documents`; any uploaded file's bytes live in
// `documentFiles/{id}` so the library list stays light.

export async function getDocuments() {
  const q = query(collection(db, "documents"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addDocument(meta, fileData) {
  const ref = await addDoc(collection(db, "documents"), {
    ...meta,
    createdAt: serverTimestamp(),
  });
  if (fileData) {
    await setDoc(doc(db, "documentFiles", ref.id), fileData);
  }
  return ref.id;
}

export async function getDocumentFile(id) {
  const snap = await getDoc(doc(db, "documentFiles", id));
  return snap.exists() ? snap.data() : null;
}

export async function deleteDocument(id) {
  await deleteDoc(doc(db, "documents", id));
  try { await deleteDoc(doc(db, "documentFiles", id)); } catch { /* none */ }
}

// --- Direct messages (1-on-1 chat) -----------------------------------

// Everyone's name/username for the contact list.
export async function getDirectory() {
  const snap = await getDocs(collection(db, "directory"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// Admin-only: make sure every intern has a directory entry, so they show up
// in the chat contact list without each one having to sign in first.
export async function syncDirectory() {
  const [interns, dir] = await Promise.all([getAllInterns(), getDirectory()]);
  const have = new Set(dir.map((d) => d.uid));
  const missing = interns.filter((i) => !have.has(i.uid));
  for (const it of missing) {
    try {
      await setDoc(doc(db, "directory", it.uid), {
        name: it.name || "",
        username: it.username || "",
      }, { merge: true });
    } catch { /* skip */ }
  }
  return missing.length;
}

// A pair of users always maps to the same conversation id.
export function convIdFor(a, b) {
  return [a, b].sort().join("__");
}

// Conversations the current user is part of (sorted newest-first client-side
// to avoid needing a composite Firestore index).
export async function myConversations(uid) {
  const q = query(collection(db, "conversations"), where("participants", "array-contains", uid));
  const snap = await getDocs(q);
  const millis = (v) => (v && v.toMillis ? v.toMillis() : (typeof v === "number" ? v : 0));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => millis(b.updatedAt || b.createdAt) - millis(a.updatedAt || a.createdAt));
}

// Make sure the conversation document exists before sending.
export async function ensureConversation(me, other, names) {
  const id = convIdFor(me, other);
  await setDoc(doc(db, "conversations", id), {
    participants: [me, other].sort(),
    names: names || {},
    createdAt: serverTimestamp(),
  }, { merge: true });
  return id;
}

export async function sendMessage(convId, from, text) {
  await addDoc(collection(db, "conversations", convId, "messages"), {
    from,
    text,
    at: serverTimestamp(),
  });
  await setDoc(doc(db, "conversations", convId), {
    lastMessage: text,
    lastFrom: from,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Live listener for a conversation's messages. Returns an unsubscribe function.
export function listenMessages(convId, cb) {
  const q = query(collection(db, "conversations", convId, "messages"), orderBy("at", "asc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error("chat listen error", err));
}
