// Firestore data access. All reads/writes go through here.
import {
  db,
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
import { ADMIN_EMAILS } from "./config.js";

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
}

// --- Admin views ----------------------------------------------------

export async function getAllInterns() {
  const snap = await getDocs(collection(db, "interns"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// Remove an intern entirely: all their log entries first, then the profile.
// (Firestore doesn't auto-delete subcollections, so we clear logs manually.)
export async function deleteIntern(uid) {
  const logs = await getLogs(uid);
  for (const l of logs) {
    await deleteLog(uid, l.id);
  }
  await deleteDoc(doc(db, "interns", uid));
}
