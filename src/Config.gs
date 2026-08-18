/**
 * Central configuration for the inbox automation. Edit the values below to
 * change which senders skip the inbox, which labels are used, and how the
 * AI drafting behaves. No other file should need changes for basic tuning.
 */
var CONFIG = {
  // How many threads the drafting phase takes per run. Each drafted thread
  // costs several sequential API calls (~15-30s), and Apps Script kills any
  // execution at 6 minutes, so keep this small - the 5-minute trigger means
  // a backlog drains quickly anyway.
  MAX_THREADS_PER_RUN: 5,

  // The archive/label phases are cheap (no API calls), so they can take more.
  MAX_SKIP_THREADS_PER_RUN: 25,

  // Wall-clock budget for the drafting loop before it stops starting new
  // threads (leaves headroom under the 6-minute execution kill).
  RUN_DEADLINE_MS: 4.5 * 60 * 1000,

  // Senders that should always skip the inbox: archived immediately, labeled,
  // and marked unread so they're easy to batch-review later under their label.
  SKIP_INBOX_RULES: [
    { label: 'Skipped/Amazon', domains: ['amazon.com'] },
    { label: 'Skipped/Guesty', domains: ['guesty.com'] },
    { label: 'Skipped/Asana', domains: ['asana.com'] },
    { label: 'Skipped/Rippling', domains: ['rippling.com'] },
    { label: 'Skipped/Shipping', domains: ['ups.com', 'fedex.com', 'usps.com', 'dhl.com'] },
  ],

  // Gmail's own "promotions" category catches most newsletters/marketing mail.
  NEWSLETTER_LABEL: 'Skipped/Newsletters',
  NEWSLETTER_QUERY: 'category:promotions',

  // Applied to every thread the drafting phase examines, before any expensive
  // work, and excluded from the search - this is the idempotency marker that
  // guarantees each thread is processed exactly once (success, skip, or fail).
  PROCESSED_LABEL: 'AI-Processed',

  // Pure-bookkeeping labels hidden from the message list (their chips no
  // longer crowd the subject line) and tucked away in the sidebar. They keep
  // working for search and the automation's own queries. Applied by
  // applyLabelColors() in Setup.gs.
  HIDDEN_LABELS: ['AI-Processed'],

  // Applied when the AI drafts a reply for review (thread stays in the inbox).
  NEEDS_REPLY_LABEL: 'Needs-Reply',

  // Applied instead of retrying when draft generation errors on a thread.
  DRAFT_FAILED_LABEL: 'Draft-Failed',

  // Applied to sensitive threads that must never get an AI draft (see
  // NEVER_DRAFT_* below) so they still surface for manual attention.
  REVIEW_NO_DRAFT_LABEL: 'Review-No-Draft',

  // First line of every AI draft, so a draft is unmistakably machine-authored
  // when the thread is opened (especially on mobile, where the draft opens in
  // the reply box one tap from Send). Delete the line before sending. Set to
  // '' to disable.
  DRAFT_MARKER: '[AI draft - review, edit, and delete this line before sending]',

  // Sender keywords that mean "automated, don't draft a reply" even if the
  // sender isn't covered by a skip-inbox rule above. Checked against the
  // From address by looksAutomated_() in Main.gs, alongside header-based
  // signals (List-Unsubscribe, Auto-Submitted) that catch notification mail
  // from services you haven't explicitly listed anywhere.
  NO_REPLY_PATTERNS: ['no-reply', 'noreply', 'do-not-reply', 'donotreply', 'notifications@', 'notification@', 'notify@', 'alerts@', 'auto-confirm@'],

  // Threads matching these never get an AI draft, even unsent - drafts are
  // discoverable, visible to anyone with delegated mailbox access, and the
  // model can invent commitments. Matched threads are labeled
  // REVIEW_NO_DRAFT_LABEL instead so they still get looked at. Add law firm /
  // insurer / HR-provider domains you correspond with to the domains list.
  NEVER_DRAFT_DOMAINS: [],
  NEVER_DRAFT_KEYWORDS: [
    'attorney', 'counsel', 'demand letter', 'litigation', 'subpoena', 'deposition',
    'settlement', 'harassment', 'termination', 'eeoc', 'lawsuit', 'legal action',
    'insurance claim', 'claim number', 'injury', 'incident report',
    'resignation', 'confidential', 'nda', 'non-disclosure',
  ],

  // Claude API (key lives in Script Properties, not here - see README).
  // Using Haiku 4.5 for cost efficiency - ~1% the cost of Opus.
  CLAUDE_MODEL: 'claude-haiku-4-5-20251001',
  CLAUDE_MAX_TOKENS: 800,
  // De-quoted thread text cap (quoted history is stripped before counting,
  // so this covers nearly all real threads in full). Truncation drops whole
  // messages from the oldest end.
  MAX_THREAD_CHARS: 20000,

  // Cheap/fast model used for classification/extraction - not for drafting,
  // so it doesn't need Opus-level quality.
  EXTRACTION_MODEL: 'claude-haiku-4-5-20251001',

  // When an inbox email looks like a vendor asking about property access,
  // look up the live reservation in BigQuery (synced from Guesty) so drafts
  // cite real check-in/checkout dates instead of guessing.
  VENDOR_ACCESS_ENABLED: true,
  // Keywords require an access-specific noun; bare "check in"/"checking in"
  // phrases are deliberately excluded - they fire on ordinary business email.
  VENDOR_ACCESS_KEYWORDS: [
    'access code', 'gate code', 'door code', 'lock code', 'entry code', 'lockbox',
    'key code', 'access the property', 'access to the property', 'when can i access',
    'get into the property', 'get into the house', 'get into the unit',
  ],
  // Entry/door codes are credentials. They are ONLY included in a draft when
  // the sender's email domain is explicitly listed here; for anyone else the
  // draft gets occupancy dates only, never a code. Empty list = codes are
  // never included. Add your trusted vendors' domains deliberately.
  VENDOR_ACCESS_CODE_DOMAINS: [],
  BIGQUERY_PROJECT_ID: 'stayloom',
  BIGQUERY_TIMEZONE: 'America/Chicago', // reservations store local property time

  // Pulls a few of Laith's own past sent emails in as style reference so
  // drafts sound like him. Disabled with Haiku to save costs - not worth it.
  SENT_STYLE_ENABLED: false,
  SENT_STYLE_EXAMPLE_COUNT: 3,
  SENT_STYLE_EXAMPLE_CHARS: 1200, // per-example cap, keeps the prompt from ballooning

  // Files threads into the existing Gmail label taxonomy (read live from the
  // account each run). INCLUDE_PATTERN picks which labels are offered to the
  // classifier - currently the numbered "1. ..." through "6. ..." tree.
  // EXCLUDE_PREFIXES keeps the automation's own labels out of the choices.
  TAXONOMY_ENABLED: true,
  TAXONOMY_INCLUDE_PATTERN: /^[0-9]+\. /,
  TAXONOMY_EXCLUDE_PREFIXES: ['Skipped/', 'Priority/', 'Needs-Reply', 'AI-Processed', 'Draft-Failed', 'Review-No-Draft'],
  TAXONOMY_MAX_LABELS: 1,
  // When no existing label fits, the classifier may create ONE new sub-label
  // under an existing numbered top-level category (never a new top-level),
  // so every thread gets filed and the taxonomy grows deliberately.
  TAXONOMY_ALLOW_NEW: true,

  // Color-coded priority triage, so the inbox can be scanned visually.
  PRIORITY_ENABLED: true,
  PRIORITY_LABELS: {
    URGENT: 'Priority/1-Urgent',
    DECISION: 'Priority/2-Needs-You',
    FYI: 'Priority/3-FYI',
  },

  // Gmail only accepts specific hex values for label colors; these are all
  // from its allowed palette. Applied by applyLabelColors() in Setup.gs.
  LABEL_COLORS: {
    'Priority/1-Urgent': { background: '#fb4c2f', text: '#ffffff' }, // red
    'Priority/2-Needs-You': { background: '#ffad47', text: '#ffffff' }, // amber
    'Priority/3-FYI': { background: '#16a766', text: '#ffffff' }, // green
    'Needs-Reply': { background: '#4a86e8', text: '#ffffff' }, // blue
    'Review-No-Draft': { background: '#fb4c2f', text: '#ffffff' }, // red - needs eyes
    'Skipped/Amazon': { background: '#cccccc', text: '#666666' },
    'Skipped/Guesty': { background: '#cccccc', text: '#666666' },
    'Skipped/Asana': { background: '#cccccc', text: '#666666' },
    'Skipped/Rippling': { background: '#cccccc', text: '#666666' },
    'Skipped/Shipping': { background: '#cccccc', text: '#666666' },
    'Skipped/Newsletters': { background: '#cccccc', text: '#666666' },
  },

  MY_EMAIL: (Session.getActiveUser().getEmail() || '').toLowerCase(),
};
