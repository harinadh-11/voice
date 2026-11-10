# Romantic Proposal Website 💛

A cinematic, interactive three-page proposal experience with animated love letters, **real microphone shout detection** that advances a cute character through five expressions, progressive golden-heart bursts, and a final YES/NO proposal that saves responses securely online via Supabase.

**No React. No build step.** Plain HTML, CSS, and vanilla JavaScript — easy to customize and host on GitHub Pages.

---

## Pages

| Page | File | What it does |
|------|------|----------------|
| 1. Letters | `index.html` | Opening message → typewriter romantic letters → CONTINUE |
| 2. Voice magic | `happy.html` | Mic permission on button click → shout detection (Web Audio) advances 5 character stages → progressive hearts → full-screen climax → NEXT |
| 3. Proposal | `final.html` | “Will you be my forever person?” → YES / NO → saves to Supabase |
| Admin | `admin.html` | Private dashboard (Supabase Auth) to view responses |

### Voice magic notes (`happy.html`)

- Shout detection is processed **locally** in the browser (Web Audio API) and uploads nothing.
- **Optional voice recording** (off by default): a consent screen appears when the visitor presses *Start voice magic*. Recording begins only after they tick the box and press **Start recording**, reuses the same microphone stream, shows a red **REC** light, and ends when Level 5 is completed or the microphone is stopped. The recording stays on the device and is uploaded **only** if the visitor presses **Save Recording** (they can **Play** or **Discard** it first). See [Voice recordings](#voice-recordings-optional) below.
- Stages advance only when sound stays above a configurable RMS threshold for ~320 ms (with cooldown/hysteresis).
- Sensitivity slider adjusts how loud a shout must be.
- Loud music or other noise can also trigger amplitude detection — this is amplitude-based, not speech recognition.
- Requires a secure context (`https://` or `localhost`) and microphone permission.

---

## File structure

```
romantic-proposal/
├── index.html
├── happy.html
├── final.html
├── admin.html
├── css/
│   ├── style.css
│   └── animations.css
├── js/
│   ├── config.js          ← messages, timings, Supabase URL/key
│   ├── main.js            ← floating hearts, music toggle
│   ├── letters.js
│   ├── happy.js           ← character shout + particle system
│   ├── final.js
│   ├── supabase.js
│   └── admin.js
├── supabase/
│   ├── schema.sql                    ← table + RLS policies (responses)
│   ├── voice_recordings.sql          ← private bucket + Storage policies + admin allow-list
│   └── voice_recordings_admin.sql    ← makes YOUR account the recordings admin
├── assets/                ← optional music file
├── README.md
└── .gitignore
```

---

## Local preview

1. Open the folder in a simple static server (required for some browsers with modules/CORS; also works with file:// for pure static checks).

   ```bash
   # Python 3
   cd romantic-proposal
   python3 -m http.server 8080
   ```

   Then visit: `http://localhost:8080`

2. Or use any static server (VS Code Live Server, `npx serve`, etc.).

3. Walk through: **index.html → Continue → happy.html → Next → final.html**.

Admin: `http://localhost:8080/admin.html` (after Supabase is configured).

---

## Customize romantic messages & timing

Edit **`js/config.js`**:

- `letters.messages` — array of love-letter strings  
- `letters.delayBetweenMessages` — ms between messages (default `1500`)  
- `letters.typeSpeed` — characters per second  
- `letters.opening` / `letters.closing`  
- `happy.particleCount`, timing values, `revealMessage`  
- `final.question`, `yesMessage`, `noMessage`  

No rebuild needed — refresh the page.

---

## Music (optional)

1. Add a licensed or public-domain audio file, e.g. `assets/soft-piano.mp3`.
2. In `js/config.js` set:

   ```js
   music: {
     src: "assets/soft-piano.mp3",
     volume: 0.35
   }
   ```

3. A mute/unmute button appears after load. Music starts only on user click (browser autoplay rules).

If the file is missing or `src` is empty, the site works without music and the button stays hidden.

---

## Supabase setup (required for online responses)

### 1. Create a project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Open **Project Settings → API**.
3. Copy:
   - **Project URL**
   - **anon public** key  

   Paste them into `js/config.js`:

   ```js
   supabase: {
     url: "https://YOUR_PROJECT.supabase.co",
     anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   }
   ```

   **Never** put the `service_role` key in any frontend file or Git commit.

### 2. Create the table and security policies

1. In Supabase: **SQL Editor → New query**.
2. Paste the entire contents of `supabase/schema.sql`.
3. Run it.

This creates:

- Table `proposal_responses` (`id`, `answer` YES/NO, `created_at`)
- Row Level Security enabled
- Public **INSERT** only for valid answers
- **SELECT** only for authenticated users
- No public read / update / delete

### 3. Create the admin user

1. Supabase → **Authentication → Users → Add user**.
2. Use your email + a strong password.
3. Sign in at `admin.html` with those credentials.

Optional: tighten the SELECT policy to a single email (instructions are in `schema.sql`).

### 4. Test the flow

1. Open `final.html`, choose YES or NO.
2. Confirm the row appears in Supabase **Table Editor → proposal_responses**.
3. Open `admin.html`, sign in, and verify the response list.

---

## Voice recordings (optional)

Skip this section if you do not want recordings: without it, visitors can still choose
"Continue without recording" and everything else works. Recordings need the Supabase URL and
publishable (anon) key from the setup above.

### One-time setup (you must do these in the Supabase dashboard)

1. **SQL Editor → New query →** paste all of `supabase/voice_recordings.sql` → **Run**.
   It is safe to run more than once. It creates the private bucket `voice-recordings`
   (5 MB per file; only `audio/webm`, `audio/ogg`, `audio/mp4`), an admin allow-list table,
   and the Storage policies below.
2. **Authentication → Users → Add user** (tick *Auto Confirm User*) — if you have not already.
3. **SQL Editor →** open `supabase/voice_recordings_admin.sql`, replace `YOUR_ADMIN_EMAIL@example.com`
   with that email, **Run**. This is what makes you the administrator.
4. **Authentication → Sign In / Providers →** turn **off** "Allow new users to sign up",
   so strangers cannot create accounts.
5. Sign in at `admin.html`. A **Voice recordings** section appears with Play and Download.

### Who can do what (Storage policies on `storage.objects`)

| Who | Allowed | How it is enforced |
|-----|---------|--------------------|
| Any visitor (anon key) | Upload **one new** file to `voice-recordings` | `INSERT` policy: right bucket, name must be exactly `<uuid>-<seconds>s.<webm\|ogg\|m4a>`, and fewer than 100 recordings exist |
| Any visitor | List, read, overwrite, move, delete | No `SELECT` / `UPDATE` / `DELETE` policy ⇒ denied |
| Signed-in user **not** on the allow-list | Nothing | `SELECT` policy requires a row in `public.admin_users` |
| The administrator | List, play, download (temporary signed URLs, 2–5 min) | `SELECT` policy + allow-list; bucket is `public = false` |
| Nobody through the API | Delete | No `DELETE` policy (delete from the dashboard if needed) |

Limits: the browser caps a recording at 4 minutes / 4 MB (`js/config.js → happy.recording`);
the bucket independently rejects files over 5 MB or with a non-audio type. The cap of 100
stored recordings (in the policy) stops anonymous visitors from filling your storage; raise
it in `voice_recordings.sql` if needed. No service-role key is used anywhere in the site.

### Test it

1. Open `happy.html` over `https://` or `http://localhost`, press **Start voice magic**.
2. Tick the box, press **Start recording**, allow the microphone. A red **REC 0:xx** appears.
3. Shout through the five levels. At the end, REC disappears and **Play / Save Recording / Discard** appear.
   Confirm in Supabase → Storage → `voice-recordings` that **nothing** is there yet.
4. Press **Save Recording** → "Saved ✓". The file now appears in Storage.
5. Sign in at `admin.html` → **Voice recordings** → Play and Download.
6. Negative checks: while signed out, `…/storage/v1/object/voice-recordings/<name>` returns an error; a second
   (non-admin) account sees no recordings.

---

## Security summary

| Action | Who | Enforced by |
|--------|-----|-------------|
| Insert YES/NO | Anyone (anon) | RLS + CHECK constraint |
| Read responses | Authenticated admin only | RLS |
| Update / delete | Nobody (by default) | No policies + REVOKE |
| Service role key | Server only — never in repo | Your discipline |

Anonymous submissions cannot uniquely identify a person. Multiple answers may appear if the page is used more than once. That is expected for this design.

---

## Deploy to GitHub Pages

1. Create a GitHub repository (public or private).
2. Push this folder to the repo root (or a `docs/` folder / `gh-pages` branch).

   ```bash
   cd romantic-proposal
   git init
   git add .
   git commit -m "Romantic proposal website"
   git branch -M main
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git push -u origin main
   ```

3. GitHub → **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main` / root (or `docs` if you put files there)
4. After a minute, the site is at:  
   `https://YOUR_USER.github.io/YOUR_REPO/`

5. Update `js/config.js` with your live Supabase URL/key **before** or **after** push (key is public-by-design when RLS is correct).

**Important:** Do not commit secrets. The anon key is intentional for client-side use; the service role key must never be committed.

---

## Testing checklist (manual)

- [ ] Letters appear one after another; CONTINUE only after the last message  
- [ ] CONTINUE → happy.html  
- [ ] Character idles, then shouts with open mouth  
- [ ] Golden hearts burst and progressively fill the screen  
- [ ] Background warms; message + NEXT appear after the sequence  
- [ ] NEXT → final.html  
- [ ] YES and NO both clickable  
- [ ] With Supabase configured: answer is stored; admin can read after login  
- [ ] Unauthenticated visitors cannot read the table (try Table Editor while logged out of admin)  
- [ ] Double-click does not create duplicate pending submits  
- [ ] Network error shows message + retry  
- [ ] Mobile layout has no horizontal scroll  
- [ ] `prefers-reduced-motion`: animations simplify, site remains usable  
- [ ] Missing music does not break the site  

---

## Known limitations

- Supabase must be configured by you (URL + anon key + schema + admin user). Until then, YES/NO show a clear error and allow retry.
- Anonymous responses are not identity-verified; treat history as “someone submitted this,” not a guaranteed unique person.
- GitHub Pages is static only — all dynamic storage is via Supabase.
- Background music requires a file you supply and a user gesture to start.

---

## License / usage

Built for a personal romantic proposal. Customize freely. Use only audio and assets you have rights to.
