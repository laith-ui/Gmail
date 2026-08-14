# Gmail Inbox Automation

A Google Apps Script that runs on a 5-minute timer inside your own Gmail
account and does five things on every run:

1. **Skip-inbox senders** - mail from Amazon, Guesty, Asana, or Rippling is
   labeled (`Skipped/Amazon`, `Skipped/Guesty`, etc.), archived out of the
   inbox, and marked unread, so it's out of your way but still shows up as
   unread under its label whenever you want to batch-review it.
2. **Newsletters/promotions** - anything Gmail already categorizes as
   `Promotions` gets the same treatment under `Skipped/Newsletters`.
3. **Needs-Reply drafting** - everything else still sitting unread in your
   inbox (that isn't from an obvious no-reply/automated address) gets sent to
   Claude, which reads the *entire* thread (quoted duplicates stripped) and
   writes a draft reply (reply-all when others are on the thread) attached
   directly to it, tagged `Needs-Reply`. **The script never sends anything**
   - you still review and hit send yourself - and every draft opens with an
   `[AI draft - ...]` marker line you delete before sending, so an AI draft
   can't be mistaken for your own words or fat-fingered out the door.
   Drafts are matched to your own voice using a sample of your past sent
   mail (preferring prior correspondence with that same sender). Threads
   touching legal, HR, insurance, or similar sensitive matters are never
   drafted at all - they get a red `Review-No-Draft` label instead (see
   `NEVER_DRAFT_KEYWORDS` / `NEVER_DRAFT_DOMAINS`). If the email looks like
   a vendor asking about property access, it looks up the live reservation
   in BigQuery (synced from Guesty) so the draft cites real occupancy dates;
   entry codes are only ever included for senders whose domain you've
   explicitly allowlisted in `VENDOR_ACCESS_CODE_DOMAINS` (empty by default
   = codes never appear in drafts).
4. **Color-coded priority triage** - each of those threads also gets a
   priority label so the inbox can be scanned by color:
   `Priority/1-Urgent` (red, needs you today), `Priority/2-Needs-You`
   (amber, awaiting your decision), `Priority/3-FYI` (green, no action).
5. **Filing into your existing labels** - threads are also filed into your
   own Gmail label taxonomy (the numbered "1. Executive & Board" ...
   "6. Admin & Personal Workflow" tree). The label list is read live from
   your account each run, so renaming/adding labels in Gmail immediately
   changes where things can be filed; the automation never creates new
   taxonomy labels, only applies existing ones.

The code only archives, labels, and drafts - it contains no send or delete
calls. (Note the honest caveat: the `gmail.modify` OAuth scope it requires
*would permit* sending, since Google offers no drafts-but-no-send scope.
"Never sends" is a property of this code, which you can read, not a
permission boundary enforced by Google.)

Reliability guardrails: a script lock prevents overlapping runs from
double-drafting; every thread the drafting phase examines is tagged
`AI-Processed` first, so each thread is handled exactly once (a failed
draft is labeled `Draft-Failed` and not retried/re-billed forever); and the
drafting loop stops early rather than hitting Apps Script's 6-minute
execution kill mid-thread.

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
- `NEVER_DRAFT_KEYWORDS` / `NEVER_DRAFT_DOMAINS` - **the most important
  knob.** Threads matching these are never drafted (labeled
  `Review-No-Draft` instead). Add your law firms, insurers, HR providers,
  and any other senders whose threads should never contain an AI draft.
- `VENDOR_ACCESS_CODE_DOMAINS` - the only way an entry/door code can appear
  in a draft. Empty (the default) means codes never appear; add trusted
  vendor domains deliberately.
- `DRAFT_MARKER` - the first line of every AI draft. Set to `''` to disable
  (not recommended: it's what makes an accidental send obvious).
- `CLAUDE_MODEL` / `CLAUDE_MAX_TOKENS` - swap models or adjust reply length.
- `MAX_THREADS_PER_RUN` - drafted threads per 5-minute tick. Each one takes
  several sequential API calls (~15-30s), and Apps Script kills executions
  at 6 minutes, so keep this small - a backlog drains across ticks anyway.
- `VENDOR_ACCESS_ENABLED` / `VENDOR_ACCESS_KEYWORDS` - turn the reservation
  lookup off, or adjust which phrases trigger it.
- `SENT_STYLE_ENABLED` / `SENT_STYLE_EXAMPLE_COUNT` - turn voice-matching off,
  or change how many past sent emails are sampled as reference.
- `PRIORITY_ENABLED` / `PRIORITY_LABELS` / `LABEL_COLORS` - turn priority
  triage off, rename the buckets, or recolor any label. Gmail only accepts
  colors from its own fixed palette, so pick replacements from an existing
  Gmail label color rather than an arbitrary hex value.

## Testing changes safely

`testOneThread` (in the function dropdown) runs the full drafting pipeline
on exactly one thread - use it to preview a draft and the labels applied
after any config change, before the recurring trigger picks the change up.

## Notes on quotas

The binding constraint on Google Workspace accounts is **total trigger
runtime** (6 hours/day), not per-call quotas. At 288 runs/day, idle runs
cost a few seconds each; busy runs are capped by `MAX_THREADS_PER_RUN: 5`
and the internal 4.5-minute deadline, which keeps a full day comfortably
inside the budget. If Executions ever shows runs being skipped late in the
day, widen the trigger interval in `setupTrigger()` (e.g. 10-15 minutes)
rather than raising the per-run thread count.
