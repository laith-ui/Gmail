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
   Claude, which reads the *entire* thread and writes a draft reply (reply-all
   when others are on the thread) attached directly to it, tagged
   `Needs-Reply`. **Nothing is ever sent automatically** - you still review
   and hit send yourself. Drafts are matched to your own voice using a sample
   of your past sent mail (preferring prior correspondence with that same
   sender). If the email looks like a vendor asking about property access, it
   first looks up the live reservation and entry code in BigQuery (synced
   from Guesty) so the draft cites real dates/codes instead of guessing.
4. **Color-coded priority triage** - each of those threads also gets a
   priority label so the inbox can be scanned by color:
   `Priority/1-Urgent` (red, needs you today), `Priority/2-Needs-You`
   (amber, awaiting your decision), `Priority/3-FYI` (green, no action).

It only ever archives, labels, and drafts. It never deletes, sends, or
touches anything outside your own mailbox.

## How it's organized

```
src/
  appsscript.json     - manifest: timezone, OAuth scopes, BigQuery advanced service
  Config.gs           - all the tunable settings (senders, labels, model, ...)
  Labels.gs           - small label helper
  ClaudeClient.gs     - calls the Anthropic API to draft a reply
  ReservationLookup.gs - vendor access-request detection + BigQuery/Guesty lookup
  WritingStyle.gs     - samples your past sent mail so drafts match your voice
  Priority.gs         - classifies threads into the color-coded priority buckets
  Main.gs             - the processing phases + the entry point
  Setup.gs            - one-time trigger install/remove helpers
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

### 4. Enable BigQuery access (for vendor access-info lookups)

This step is only needed for the reservation-lookup feature; skip it if you
don't need that and the rest of the automation works fine without it (a
lookup failure just falls back to a normal drafted reply).

In the Apps Script editor:

1. Click the **+** next to "Services" in the left sidebar, find **BigQuery
   API**, and add it (this matches the `enabledAdvancedServices` entry
   already in `appsscript.json` - if you pushed via clasp it may already show
   up automatically).
2. **Project Settings -> Google Cloud Platform (GCP) Project -> Change
   project**, and enter the project number for `stayloom` (find it in the
   [Cloud Console](https://console.cloud.google.com) under that project's
   Dashboard). Your Google account needs BigQuery read access on `stayloom`
   already (the same access used elsewhere for Guesty/reporting).
3. Re-run `runInboxAutomation` once and accept the additional BigQuery
   OAuth consent prompt.

### 5. Apply the label colors

Select `applyLabelColors` from the function dropdown and click **Run** once.
This creates the priority labels and colors them (red/amber/green for the
priority buckets, blue for `Needs-Reply`, grey for the `Skipped/*` labels).
Colors persist in Gmail, so this only needs re-running if you change
`LABEL_COLORS` in `Config.gs`.

### 6. Install the recurring trigger

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
- `VENDOR_ACCESS_ENABLED` / `VENDOR_ACCESS_KEYWORDS` - turn the reservation
  lookup off, or adjust which phrases trigger it.
- `SENT_STYLE_ENABLED` / `SENT_STYLE_EXAMPLE_COUNT` - turn voice-matching off,
  or change how many past sent emails are sampled as reference.
- `PRIORITY_ENABLED` / `PRIORITY_LABELS` / `LABEL_COLORS` - turn priority
  triage off, rename the buckets, or recolor any label. Gmail only accepts
  colors from its own fixed palette, so pick replacements from an existing
  Gmail label color rather than an arbitrary hex value.

## Notes on quotas

Apps Script consumer accounts allow roughly 20,000 Gmail read/write calls and
20,000 `UrlFetchApp` (external request) calls per day. At 5-minute intervals
(288 runs/day) with `MAX_THREADS_PER_RUN: 25`, normal inbox volume stays
comfortably under both limits. If you have a very high-volume inbox, either
raise the interval in `setupTrigger()` or lower `MAX_THREADS_PER_RUN`.
