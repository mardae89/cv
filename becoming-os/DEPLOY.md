# Using BECOMING OS

There is nothing to deploy and nothing to configure. Pick one of two ways to run it.

---

## Option A — your private claude.ai page (recommended: syncs, works for two)

The app is published as a private page in your claude.ai account. Open it on any
device where you're signed in to Claude; your records follow you.

1. Open the page (link in your Claude conversation, or **claude.ai → Artifacts →
   BECOMING OS**). On a phone you can add it to your home screen from the browser.
2. **You:** go through setup → **Body, business and a 10K** → confirm your starting
   weight (pre-filled with 267 lb from your plan — change it to today's scale
   reading). Skip anything you're not sure of; it's all editable later.
3. **Your wife:** open the page's **Share** menu and invite her by email. Give her
   the **Editor** role. Then she opens the link, signs in to her own Claude account,
   and runs setup → **My own transformation** → her own starting weight. Nothing is
   pre-filled for her.
4. Each of you sets **Settings → Privacy & sharing**. Your summaries then appear for
   each other under **Together** (and on Today).

Rules that matter:

- **Don't turn on a public link.** Someone from outside your organization who was
  invited by email can save only as an **Editor**, and only while the page has no
  public link. With a link on (or invited as Viewer/Commenter) her access becomes
  view-only: the app tells her so and keeps her records in her own browser instead,
  so nothing syncs and nothing is shared.
- Each person's records are private to that person — the page's owner can't read
  the other person's records either. Only the summary your sharing levels allow is
  visible to the other.
- Two devices editing the **same month of the same kind of record** at the very same
  moment: the later save wins. In practice that means don't log the same thing on
  two phones at once.

## Option B — a plain file, no account at all

Download `dist-page/becoming-os.html` and open it in any browser (or put it on any
static host). Records are kept in **that browser on that device only**:

- No sync between devices and no partner sharing.
- Clearing the browser's site data deletes them. Use **Settings → Export backup**
  regularly; **Import backup** restores one (or moves you to another device, or onto
  the claude.ai page).

## Backups

**Settings → Export backup** saves everything (records, settings, photos) as one
JSON file. **Import backup** replaces what's stored with the file's contents. Business
transactions also export as CSV from the Business screen.

## What isn't included

- **Phone push / email reminders.** Reminders appear in the in-app notification
  centre when you open the app. Nothing is sent outside the app.
- **Integrations** (Apple Health, Strava, Stripe, bank feeds). Everything is manual
  entry.

## Working on the code

```bash
cd becoming-os
npm install
npm run dev          # http://localhost:8080 (browser storage mode)
npm test && npm run typecheck
npm run build:page   # → dist-page/becoming-os.html (+ becoming-os.page.html for claude.ai)
```
