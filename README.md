# Gmail Inbox Automation

A Google Apps Script that runs on a 5-minute timer inside your own Gmail
account and does three things on every run:

1. **Skip-inbox senders** - mail from Amazon, Guesty, Asana, or Rippling is
   labeled (`Skipped/Amazon`, `Skipped/Guesty`, etc.), archived out of the
   inbox, and marked unread, so it's out of your way but still shows up as
   unread under its label whenever you want to batch-review it.
2. **Newsletters/promotions** - anything Gmail already categorizes as
   `Promotions` gets the same treatment under `Skipped/Newsletters`.
3. **Needs-Reply drafting** - everything else still sitting unread in your
   inbox (that isn't from an obvious no-reply/automated address) gets sent to
   Claude, which writes a draft reply attached directly to the thread and
   tags it `Needs-Reply`. **Nothing is ever sent automatically** - you still
   review and hit send yourself.

It only ever archives, labels, and drafts. It never deletes, sends, or
touches anything outside your own mailbox.

## How it's organized

```
src/
  appsscript.json   - manifest: timezone + OAuth scopes
  Config.gs         - all the tunable settings (senders, labels, model, ...)
  Labels.gs         - small label helper
  ClaudeClient.gs   - calls the Anthropic API to draft a reply
  Main.gs           - the three processing phases + the entry point
  Setup.gs          - one-time trigger install/remove helpers
```

## Setup

### 1. Create the Apps Script project

Pick one:

**Option A - clasp (recommended, keeps this repo in sync with the script):**

```bash
npm install
npm run login     # opens a browser to authorize clasp against your Google account
npm run create     # creates a new standalone Apps Script project
npm run push       # uploads src/ to it
```

`clasp create` writes a `.clasp.json` with the new project's `scriptId` -
that file is gitignored since it's environment-specific (see
`.clasp.json.example` for the shape). Re-run `npm run push` any time you
change a file in `src/` to sync it.

**Option B - manual:** go to
[script.google.com/create](https://script.google.com/create), then copy the
contents of each file in `src/` into a matching file in the editor (use
"Project Settings" to enable "Show appsscript.json" so you can paste that one
too).

### 2. Add your Anthropic API key

In the Apps Script editor: **Project Settings -> Script Properties -> Add
script property**, name it `ANTHROPIC_API_KEY`, and paste your key. It's
never written to this repo.

### 3. Authorize the script

Open `Main.gs` in the editor, select `runInboxAutomation` from the function
dropdown, and click **Run** once. Google will prompt you to authorize the
Gmail and external-request scopes - accept them. This first run also does an
immediate pass over your inbox.

### 4. Install the recurring trigger

Select `setupTrigger` from the function dropdown and click **Run** once.
That installs a time-based trigger that calls `runInboxAutomation` every 5
minutes from then on. You only need to do this once; re-running it just
replaces the existing trigger. `removeTrigger` undoes it.

## Customizing

Everything tunable lives in `Config.gs`:

- `SKIP_INBOX_RULES` - add/remove sender domains and their labels.
- `NEWSLETTER_QUERY` - change or broaden the Gmail search used to catch
  newsletters (e.g. add `OR category:social`).
- `NEEDS_REPLY_LABEL` / `NO_REPLY_PATTERNS` - adjust what counts as
  "needs a reply" vs. an automated sender to ignore.
- `CLAUDE_MODEL` / `CLAUDE_MAX_TOKENS` - swap models or adjust reply length.
- `MAX_THREADS_PER_RUN` - raise/lower how many threads each phase handles
  per 5-minute tick (kept low by default to stay well under Apps Script's
  6-minute execution limit).

## Notes on quotas

Apps Script consumer accounts allow roughly 20,000 Gmail read/write calls and
20,000 `UrlFetchApp` (external request) calls per day. At 5-minute intervals
(288 runs/day) with `MAX_THREADS_PER_RUN: 25`, normal inbox volume stays
comfortably under both limits. If you have a very high-volume inbox, either
raise the interval in `setupTrigger()` or lower `MAX_THREADS_PER_RUN`.
