// ============================================================
//  Lioncrest Intern Logbook — configuration
// ============================================================
//
// 1. Create a Firebase project at https://console.firebase.google.com
// 2. Add a Web App, then copy its config object below.
// 3. In the console: Build → Authentication → Sign-in method,
//    enable "Google" and "Microsoft" providers.
// 4. Build → Firestore Database → create a database.
// 5. Deploy the rules in ../firestore.rules
//
// See ../README.md for the full walkthrough.
// ------------------------------------------------------------

export const firebaseConfig = {
  apiKey: "AIzaSyDfUFMGCOv8QmPuWzfWlT3xUuk4O3N8cTI",
  authDomain: "internship-logbook-94a41.firebaseapp.com",
  projectId: "internship-logbook-94a41",
  storageBucket: "internship-logbook-94a41.firebasestorage.app",
  messagingSenderId: "619512870061",
  appId: "1:619512870061:web:8f0148dc0454f72379c224",
  measurementId: "G-P1HVCS62NT",
};

// The company name shown throughout the app.
export const ORG_NAME = "Lioncrest";

// Interns log in with a plain username + password (no email needed). Firebase
// requires an email internally, so the app appends this hidden domain to every
// username, e.g. username "juan" becomes "juan@lioncrest-interns.local".
// Interns never see or type this. DO NOT change it after accounts exist —
// changing it would stop existing usernames from logging in.
export const USERNAME_DOMAIN = "lioncrest-interns.local";

// Optional convenience: emails listed here are treated as admins by the UI
// even before an `admins/{email}` document exists in Firestore. The Firestore
// security rules still rely on the `admins` collection, so the FIRST admin
// must also be added there once (see README → "Make yourself an admin").
export const ADMIN_EMAILS = [
  "lgcapao.lc@gmail.com",
];
