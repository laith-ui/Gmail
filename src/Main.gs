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
 * True if a message looks automated/transactional rather than something a
 * human is waiting on a reply to. Combines the sender-keyword list in
 * Config.gs with two header-based signals that catch notification mail from
 * services you haven't explicitly listed: List-Unsubscribe (present on
 * almost all bulk/automated senders) and Auto-Submitted (set by ticketing,
 * monitoring, and delivery-notification systems per RFC 3834).
 */
function looksAutomated_(message) {
  var from = message.getFrom().toLowerCase();
  if (CONFIG.NO_REPLY_PATTERNS.some(function (p) { return from.indexOf(p) !== -1; })) return true;
  if (message.getHeader('List-Unsubscribe')) return true;

  var autoSubmitted = message.getHeader('Auto-Submitted');
  if (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') return true;

  return false;
}

/**
 * Email addresses on a message's To/Cc lines, excluding Laith's own address
 * and de-duplicated. A non-empty result means other people are part of this
 * conversation, so the reply should go to everyone, not just the sender.
 */
function otherRecipients_(message) {
  var raw = (message.getTo() || '') + ',' + (message.getCc() || '');
  var emails = raw.match(/[^\s<>,"]+@[^\s<>,"]+/g) || [];
  var seen = {};
  var myEmail = CONFIG.MY_EMAIL.toLowerCase();

  return emails.filter(function (addr) {
    var lower = addr.toLowerCase();
    if (lower === myEmail || seen[lower]) return false;
    seen[lower] = true;
    return true;
  });
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
      if (looksAutomated_(last)) return;

      var threadText = messages
        .map(function (m) { return 'From: ' + m.getFrom() + '\n' + m.getPlainBody(); })
        .join('\n\n---\n\n')
        .slice(-CONFIG.MAX_THREAD_CHARS);

      var others = otherRecipients_(last);

      var reservationContext = null;
      if (CONFIG.VENDOR_ACCESS_ENABLED && looksLikeAccessRequest_(last)) {
        try {
          var propertyReference = extractPropertyReference_(threadText);
          if (propertyReference) {
            reservationContext = lookupReservationAccess_(propertyReference);
          }
        } catch (err) {
          console.error('Reservation lookup failed for thread "' + thread.getFirstMessageSubject() + '": ' + err);
        }
      }

      var draftBody = draftReplyWithClaude_(threadText, thread.getFirstMessageSubject(), others, reservationContext);

      if (others.length) {
        thread.createDraftReplyAll(draftBody);
      } else {
        thread.createDraftReply(draftBody);
      }
      thread.addLabel(needsReplyLabel);
      drafted++;
    } catch (err) {
      console.error('Failed to draft reply for thread "' + thread.getFirstMessageSubject() + '": ' + err);
    }
  });

  console.log('Needs-Reply: drafted ' + drafted + ' new repl' + (drafted === 1 ? 'y' : 'ies') + '.');
}
