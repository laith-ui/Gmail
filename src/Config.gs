/**
 * Central configuration for the inbox automation. Edit the values below to
 * change which senders skip the inbox, which labels are used, and how the
 * AI drafting behaves. No other file should need changes for basic tuning.
 */
var CONFIG = {
  // Upper bound on how many threads each phase processes per run, so a single
  // execution can't run long enough to hit Apps Script's time limit.
  MAX_THREADS_PER_RUN: 25,

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

  // Applied (thread stays in the inbox) when the AI drafts a reply for review.
  NEEDS_REPLY_LABEL: 'Needs-Reply',

  // Sender keywords that mean "automated, don't draft a reply" even if the
  // sender isn't covered by a skip-inbox rule above. Checked against the
  // From address by looksAutomated_() in Main.gs, alongside header-based
  // signals (List-Unsubscribe, Auto-Submitted) that catch notification mail
  // from services you haven't explicitly listed anywhere.
  NO_REPLY_PATTERNS: ['no-reply', 'noreply', 'do-not-reply', 'donotreply', 'notifications@', 'notification@', 'notify@', 'alerts@', 'auto-confirm@'],

  // Claude API (key lives in Script Properties, not here - see README).
  // Opus is the strongest available model - worth the extra cost/latency for
  // drafting quality. Drop to 'claude-sonnet-5' if you want faster/cheaper runs.
  CLAUDE_MODEL: 'claude-opus-5',
  CLAUDE_MAX_TOKENS: 1200,
  // Whole threads are sent as context (no longer just the last few messages).
  // This just bounds pathologically long threads (huge CC chains, mailing
  // lists) from blowing up the request - keeps the most recent messages,
  // trimming from the oldest end. ~60k chars is roughly 15k tokens.
  MAX_THREAD_CHARS: 60000,

  // Cheap/fast model used only to pull a property reference out of an email -
  // not for drafting, so it doesn't need Opus-level quality.
  EXTRACTION_MODEL: 'claude-haiku-4-5-20251001',

  // When an inbox email looks like a vendor asking about property access,
  // look up the live reservation + entry code in BigQuery (synced from
  // Guesty) instead of letting the model guess dates or codes.
  VENDOR_ACCESS_ENABLED: true,
  VENDOR_ACCESS_KEYWORDS: [
    'access code', 'gate code', 'door code', 'lock code', 'entry code', 'lockbox',
    'key code', 'check in', 'check out', 'checkin', 'checkout', 'access the property',
    'get into the', 'get in to the', 'when can i access',
  ],
  BIGQUERY_PROJECT_ID: 'stayloom',

  // Pulls a few of Laith's own past sent emails in as style reference so
  // drafts sound like him. Prefers prior correspondence with the same
  // sender, falling back to recent sent mail generally.
  SENT_STYLE_ENABLED: true,
  SENT_STYLE_EXAMPLE_COUNT: 3,
  SENT_STYLE_EXAMPLE_CHARS: 1200, // per-example cap, keeps the prompt from ballooning

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
    'Skipped/Amazon': { background: '#cccccc', text: '#666666' },
    'Skipped/Guesty': { background: '#cccccc', text: '#666666' },
    'Skipped/Asana': { background: '#cccccc', text: '#666666' },
    'Skipped/Rippling': { background: '#cccccc', text: '#666666' },
    'Skipped/Shipping': { background: '#cccccc', text: '#666666' },
    'Skipped/Newsletters': { background: '#cccccc', text: '#666666' },
  },

  MY_EMAIL: Session.getActiveUser().getEmail(),
};
