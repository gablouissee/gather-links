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
  orderBy,
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
  if (existing) return existing;
  const profile = {
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
  await setDoc(doc(db, "interns", user.uid), profile);
  return { uid: user.uid, ...profile };
}

export async function saveProfile(uid, fields) {
  await updateDoc(doc(db, "interns", uid), fields);
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
