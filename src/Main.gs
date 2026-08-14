/**
 * Entry point, wired to a time-based trigger by setupTrigger() in Setup.gs.
 * Runs the skip-inbox rules, then newsletter triage, then AI reply drafting.
 */
function runInboxAutomation() {
  processSkipInboxRules_();
  processNewsletters_();
  processNeedsReplyDrafts_();
}

/**
 * Archives, labels, and marks unread any inbox thread from a configured
 * automated sender (Amazon, Guesty, Asana, Rippling, ...). Threads already
 * moved out of the inbox naturally drop out of the "in:inbox" search on the
 * next run, so this is idempotent without needing a processed-marker label.
 */
function processSkipInboxRules_() {
  CONFIG.SKIP_INBOX_RULES.forEach(function (rule) {
    var fromClause = rule.domains.map(function (d) { return 'from:' + d; }).join(' OR ');
    var query = 'in:inbox (' + fromClause + ')';
    var threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_RUN);
    if (!threads.length) return;

    var label = getOrCreateLabel_(rule.label);
    var moved = 0;
    threads.forEach(function (thread) {
      try {
        thread.addLabel(label);
        thread.markUnread();
        thread.moveToArchive();
        moved++;
      } catch (err) {
        console.error(rule.label + ': failed on thread "' + thread.getFirstMessageSubject() + '": ' + err);
      }
    });
    console.log(rule.label + ': moved ' + moved + ' thread(s) out of the inbox.');
  });
}

/** Same treatment as processSkipInboxRules_, but for Gmail's promotions category. */
function processNewsletters_() {
  var query = 'in:inbox ' + CONFIG.NEWSLETTER_QUERY;
  var threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_RUN);
  if (!threads.length) return;

  var label = getOrCreateLabel_(CONFIG.NEWSLETTER_LABEL);
  var moved = 0;
  threads.forEach(function (thread) {
    try {
      thread.addLabel(label);
      thread.markUnread();
      thread.moveToArchive();
      moved++;
    } catch (err) {
      console.error('Newsletters: failed on thread "' + thread.getFirstMessageSubject() + '": ' + err);
    }
  });
  console.log('Newsletters: moved ' + moved + ' thread(s) out of the inbox.');
}

/**
 * For inbox threads that aren't covered by a skip rule, aren't already
 * handled, and are actually awaiting a reply from Laith, asks Claude for a
 * draft and attaches it to the thread. Never sends anything - drafts only.
 */
function processNeedsReplyDrafts_() {
  var skipDomains = CONFIG.SKIP_INBOX_RULES.reduce(function (acc, r) {
    return acc.concat(r.domains);
  }, []);
  var exclusions = skipDomains.map(function (d) { return '-from:' + d; }).join(' ');
  var query =
    'in:inbox is:unread -category:promotions -category:social -category:forums -label:' +
    CONFIG.NEEDS_REPLY_LABEL +
    ' ' +
    exclusions;

  var threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_RUN);
  if (!threads.length) return;

  var needsReplyLabel = getOrCreateLabel_(CONFIG.NEEDS_REPLY_LABEL);
  var drafted = 0;

  threads.forEach(function (thread) {
    try {
      var messages = thread.getMessages();
      var last = messages[messages.length - 1];

      if (last.isDraft()) return; // a draft already exists on this thread
      if (last.getFrom().indexOf(CONFIG.MY_EMAIL) !== -1) return; // Laith already replied
      if (CONFIG.NO_REPLY_PATTERNS.some(function (p) {
        return last.getFrom().toLowerCase().indexOf(p) !== -1;
      })) return;

      var threadText = messages
        .slice(-3)
        .map(function (m) { return 'From: ' + m.getFrom() + '\n' + m.getPlainBody(); })
        .join('\n\n---\n\n')
        .slice(-CONFIG.MAX_THREAD_CHARS);

      var draftBody = draftReplyWithClaude_(threadText, thread.getFirstMessageSubject());
      thread.createDraftReply(draftBody);
      thread.addLabel(needsReplyLabel);
      drafted++;
    } catch (err) {
      console.error('Failed to draft reply for thread "' + thread.getFirstMessageSubject() + '": ' + err);
    }
  });

  console.log('Needs-Reply: drafted ' + drafted + ' new repl' + (drafted === 1 ? 'y' : 'ies') + '.');
}
