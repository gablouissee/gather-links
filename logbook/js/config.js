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
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// The company name shown throughout the app.
export const ORG_NAME = "Lioncrest";

// Optional convenience: emails listed here are treated as admins by the UI
// even before an `admins/{email}` document exists in Firestore. The Firestore
// security rules still rely on the `admins` collection, so the FIRST admin
// must also be added there once (see README → "Make yourself an admin").
export const ADMIN_EMAILS = [
  // "you@gmail.com",
];
