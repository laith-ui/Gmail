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
  ],

  // Gmail's own "promotions" category catches most newsletters/marketing mail.
  NEWSLETTER_LABEL: 'Skipped/Newsletters',
  NEWSLETTER_QUERY: 'category:promotions',

  // Applied (thread stays in the inbox) when the AI drafts a reply for review.
  NEEDS_REPLY_LABEL: 'Needs-Reply',

  // Senders that look automated; never auto-draft a reply to these even if
  // they land in the inbox and aren't covered by a skip-inbox rule above.
  NO_REPLY_PATTERNS: ['no-reply', 'noreply', 'do-not-reply', 'donotreply', 'notifications@', 'notification@'],

  // Claude API (key lives in Script Properties, not here - see README).
  CLAUDE_MODEL: 'claude-sonnet-5',
  CLAUDE_MAX_TOKENS: 600,
  MAX_THREAD_CHARS: 6000, // trims very long threads before sending to the model

  MY_EMAIL: Session.getActiveUser().getEmail(),
};
