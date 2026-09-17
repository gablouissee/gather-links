// Firebase initialisation — modular SDK loaded straight from the CDN.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
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
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// A separate Firebase app instance used only when an admin creates an intern
// account. Creating a user signs *in* as that user on whichever auth instance
// does it — using this secondary instance keeps the admin's own session intact.
let secondaryApp = null;
export function getSecondary() {
  if (!secondaryApp) secondaryApp = initializeApp(firebaseConfig, "secondary");
  return { auth: getAuth(secondaryApp), db: getFirestore(secondaryApp) };
}

// Gmail sign-in.
export const googleProvider = new GoogleAuthProvider();

// Outlook / Microsoft 365 sign-in.
export const microsoftProvider = new OAuthProvider("microsoft.com");
microsoftProvider.setCustomParameters({ prompt: "select_account" });

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  onAuthStateChanged,
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
};
