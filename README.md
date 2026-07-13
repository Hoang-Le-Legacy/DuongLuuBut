# Sổ Lưu Bút — Dương "Domino" 🚀

A farewell yearbook (*sổ lưu bút*) for Dương "Domino" — an openable keepsake book
where friends leave goodbye messages. The hand-crafted book UI (cover flip, page
turn, washi tape) is a **vanilla, no-bundler frontend**; it's now backed by a
real database so Dương can curate it live from the site itself.

## How it works

- **Dương holds the one password.** Entering it unlocks the book for *him*:
  private messages become visible and edit mode (add / edit / delete a
  message, up to 5 photos each) turns on. Everyone else with the link only
  ever sees public messages — enforced on the server, not just hidden in the UI.
- **Data**: Neon (serverless Postgres) for messages, [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
  (private store) for photos — the DB only stores URLs, and photos are served
  back through `api/photo.js` rather than Blob's own CDN URL, since a private
  store requires an `Authorization` header that a plain `<img>` tag can't send.
- **Hosting**: Vercel — the frontend is served as static files, the API lives
  in `/api/*` as Node serverless functions.
- **No accounts, no bundler.** The frontend is the same plain `<script>`-tag
  JS as before; it just talks to `/api/*` with `fetch` instead of reading
  `js/data.js` and `localStorage`.

## Project structure

```
index.html            Markup skeleton (all dynamic nodes carry ids)
css/styles.css         Design tokens + component styles (OKLCH palette, type scale)
js/data.js             Display config (tape colors, image limits) — no message content
js/api.js              fetch wrapper for /api/*, client-side photo downscale, token storage
js/lightbox.js         Full-size photo viewer (prev/next, swipe, Esc)
js/editor.js           Add/edit message modal (fields + 5-slot photo uploader)
js/app.js              State machine + surgical DOM renderer (page flip, cover, nav)
api/entries/index.js    GET (list) / POST (create)
api/entries/[id].js     PATCH (update) / DELETE
api/upload.js           POST — downscaled photo → Vercel Blob (private)
api/photo.js            GET — streams a photo out of the private Blob store
api/unlock.js            POST — password → signed unlock token
api/password.js          POST — change password (requires a valid token)
api/_lib/                db.js, auth.js, validate.js, respond.js — shared helpers
db/schema.sql            Postgres schema (entries, entry_images, settings)
scripts/migrate.js       Applies db/schema.sql + seeds the initial password hash
design/                  Original Claude design component, for reference
```

## Local development

Requires Node 18+ and the [Vercel CLI](https://vercel.com/docs/cli) (installed
as a dev dependency, so `npx vercel` / `npm run dev` work without a global
install).

```bash
npm install
cp .env.example .env   # fill in the values below
npm run migrate        # creates tables + seeds the password hash
npm run dev             # runs `vercel dev` — serves the static files AND /api
```

Then open the printed local URL (typically `http://localhost:3000`).

### Environment variables

| Variable | Where it comes from | Used for |
|---|---|---|
| `DATABASE_URL` | Neon dashboard → your project → **Connection Details** (use the pooled connection string) | All Postgres queries |
| `SESSION_SECRET` | Generate: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` | Signs the unlock token (HMAC) |
| `BLOB_READ_WRITE_TOKEN` | Vercel dashboard → your project → **Storage** → create a **Blob** store | Uploading/deleting photos |
| `ADMIN_PASSWORD` | You choose it (default `DuongDomino`) | Only read **once**, by `npm run migrate`, to seed the password hash |

## Deploying (Vercel + Neon)

1. **Neon**: create a project at [neon.tech](https://neon.tech), copy the
   pooled connection string into `DATABASE_URL`.
2. **Vercel**: import this repo as a new Vercel project. Add a **Blob** store
   under Storage (either access level works — the app always talks to it as
   `private` and proxies photos through `api/photo.js`). This fills in
   `BLOB_READ_WRITE_TOKEN` for you automatically.
3. **Environment variables**: in the Vercel project settings, add
   `DATABASE_URL`, `SESSION_SECRET` (a fresh random value — don't reuse a
   local one), and `ADMIN_PASSWORD` (Dương's real password; used only for the
   one-time migration below).
4. **Migrate**: run `npm run migrate` locally with `DATABASE_URL` (and
   `ADMIN_PASSWORD`) pointed at the Neon database — this creates the tables
   and seeds the password hash. Re-running it is safe; it won't overwrite an
   existing password hash.
5. **Deploy**: push to the branch Vercel is watching, or run `vercel --prod`.
6. Open the live URL, click **🔑 Mở khóa**, enter the password, and start
   adding real messages. Change the password anytime from the ⚙️ button
   (only visible once unlocked).

Share the plain URL with anyone — they'll only ever see public messages and
have no way to write, upload, or unlock without the password (checked
server-side on every request, not just hidden in the UI).

## Security notes

- The password is never stored in plaintext — only a `scrypt` hash lives in
  the `settings` table, compared with `crypto.timingSafeEqual`.
- The unlock token is a signed (HMAC) `{exp}` payload — there's no session
  table to manage, and it can't be forged without `SESSION_SECRET`.
- Every mutating endpoint (`create`/`update`/`delete`/`upload`/`password`)
  re-verifies the token server-side; a link-holder without the password gets
  a `401` on all of them.
- `GET /api/entries` filters private entries server-side — an
  unauthenticated request never receives their `message`/`sender`/photos.
- Photos live in a **private** Blob store; `api/photo.js` is the only thing
  that can read it (via the server's `BLOB_READ_WRITE_TOKEN`/OIDC), and
  streams bytes back without its own auth check — by the time a client has a
  photo's pathname at all, `GET /api/entries` has already decided it's
  allowed to see it (public entry, or an unlocked request for a private one).
- All SQL is parameterized (tagged-template queries via
  `@neondatabase/serverless`); all API input is validated with Zod.

## Customize

- **Tape colors / image limits**: `js/data.js`.
- **Visual design**: `css/styles.css` (OKLCH design tokens at the top).
- **Copy on the left page** (title, intro text): `index.html`.

### Why vanilla JS on the frontend?

The source is a React-based design prototype. To keep the book a single,
dependency-free bundle that's simple to host as static files alongside a thin
API, it's kept as plain JS. A persistent DOM tree is mutated in place on each
state change (rather than re-rendered), which preserves the CSS transitions
that drive the cover-open and page-flip animations.
