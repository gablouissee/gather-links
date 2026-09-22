# Lioncrest Intern Logbook

A web version of the OJT intern logbook — but for **many interns at once**, with
**Gmail / Outlook sign-in** and an **admin dashboard**.

It mirrors the original spreadsheet:

| Intern details | Daily log columns |
|----------------|-------------------|
| Name, Department, School, Date started, Required hours/day, Weekly hours, **Total required hours**, Time-in link, Proof folder link | Date, Time In, Proof, Time Out, Proof, No. of Hours, **Actual Hours** |

- **Interns** sign in with Google (Gmail), Microsoft (Outlook), or a
  **username + password their admin created for them** (no email required, and
  no public self-signup). They fill in their details and log each day. Hours are
  computed automatically from time-in / time-out; a progress bar tracks them
  toward their required total. They can export their log to CSV.
- **Admins** see every intern, their total hours, progress and status, and can
  open any intern's daily log (and export it). Admins can also **create intern
  accounts** ("+ Add intern" — sets a username + temporary password) and
  **delete** interns.

Everyone gets **Messages** (💬 in the top bar) — private 1-on-1 chats between
users, updating live.

Admins also get a **Documents** library ("📁 Documents" on the dashboard) for
storing OJT forms, memos and other files (upload a file up to ~700 KB, or paste a
link for bigger ones), and a private **Admin notes** box on each intern's page
that only admins can see.

> **Resetting an intern's password:** since usernames have no real email inbox,
> there's no self-service reset. To give a new password, delete the intern and
> re-add them (this also clears their logs), or add a Cloud Function later for
> in-place resets.

It's a **static site** (HTML + JS, no build step). All accounts and data live in
**Firebase Authentication + Firestore**, so there's no server for you to run.

---

## Setup (about 10 minutes)

### 1. Create a Firebase project
1. Go to <https://console.firebase.google.com> and **Add project**.
2. Inside the project, click the **Web** icon (`</>`) to register a web app.
3. Copy the `firebaseConfig` object it shows you.

### 2. Paste your config
Open [`js/config.js`](js/config.js) and replace the placeholder values in
`firebaseConfig` with the ones from step 1. Set `ORG_NAME` if you want a name
other than "Lioncrest".

### 3. Enable the sign-in methods
In the console: **Build → Authentication → Get started → Sign-in method**.
- Enable **Email/Password** (this powers the **username + password** logins that
  admins create — usernames are stored internally as `username@<hidden domain>`,
  set by `USERNAME_DOMAIN` in `js/config.js`; interns only ever see the username).
- Enable **Google** (this is Gmail).
- Enable **Microsoft** (this is Outlook / Microsoft 365). Microsoft asks for an
  Azure app **Client ID + secret** — create one at
  <https://portal.azure.com> → *App registrations* → *New registration*, then
  paste the credentials into the Firebase Microsoft provider. Add the redirect
  URI Firebase shows you to the Azure app.
- Under **Authentication → Settings → Authorized domains**, add the domain you
  deploy to (e.g. `your-site.web.app`, `your-site.vercel.app`, or your custom
  domain). `localhost` is authorised by default for testing.

### 4. Create the database
**Build → Firestore Database → Create database** (start in production mode).
Then open the **Rules** tab, paste the contents of
[`firestore.rules`](firestore.rules), and **Publish**.

### 5. Make yourself an admin
Admins are defined by a document in the `admins` collection keyed by email.
1. In Firestore, **Start collection** → collection ID `admins`.
2. Add a document whose **Document ID** is *your* login email
   (e.g. `you@gmail.com`). Give it any field, e.g. `role: "admin"`.
3. (Optional) also add your email to `ADMIN_EMAILS` in `js/config.js` so the UI
   recognises you instantly.

Now sign in with that email and you'll land on the **Admin Dashboard**. Everyone
else lands on their own intern logbook.

### 6. Deploy
Any static host works. Examples:

```bash
# Firebase Hosting
npm i -g firebase-tools
firebase login
firebase init hosting        # set public dir to this "logbook" folder
firebase deploy
```

Or drag the `logbook/` folder onto **Netlify**, or point **Vercel** at it, or
serve locally:

```bash
cd logbook
python3 -m http.server 8000   # then open http://localhost:8000
```

> Because it uses ES modules, open it through a web server (the command above),
> not by double-clicking `index.html`.

---

## How hours are calculated
`Actual Hours` is pre-filled from `Time Out − Time In` (handles shifts crossing
midnight). Edit the field to deduct breaks — the manual value is what counts
toward the required total, exactly like the "Actual Hours" column in the
spreadsheet. "Proof" fields hold links to your time-in/out screenshots.

## Files
| File | Purpose |
|------|---------|
| `index.html` | App shell |
| `js/config.js` | **Your** Firebase keys + org name + admin allowlist |
| `js/firebase.js` | Firebase SDK setup (Google + Microsoft providers) |
| `js/store.js` | Firestore reads/writes |
| `js/helpers.js` | Hours maths, formatting, CSV export |
| `js/app.js` | Login, intern dashboard, admin dashboard |
| `css/styles.css` | Styling |
| `firestore.rules` | Database security rules |

## Security notes
- Interns can only read/write **their own** profile and logs.
- Admins can read every intern and edit any log.
- Admin status is enforced by Firestore rules via the `admins` collection, so a
  user can't promote themselves by editing client code.
