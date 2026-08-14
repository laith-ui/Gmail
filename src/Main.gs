/**
 * Entry point, wired to a time-based trigger by setupTrigger() in Setup.gs.
 * Runs the skip-inbox rules, then newsletter triage, then AI reply drafting.
 *
 * A script lock prevents overlapping executions (a slow run + the next
 * trigger firing) from double-processing the same threads, and each phase is
 * isolated so a transient Gmail failure in one doesn't abort the others.
 */
function runInboxAutomation() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    console.log('Previous run still in progress; skipping this tick.');
    return;
  }

  try {
    runPhase_('Skip-inbox', processSkipInboxRules_);
    runPhase_('Newsletters', processNewsletters_);
    runPhase_('Drafting', processNeedsReplyDrafts_);
  } finally {
    lock.releaseLock();
  }
}

function runPhase_(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(name + ' phase failed: ' + err);
  }
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
    var threads = GmailApp.search(query, 0, CONFIG.MAX_SKIP_THREADS_PER_RUN);
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
        console.error(rule.label + ': failed on a thread: ' + err);
      }
    });
    console.log(rule.label + ': moved ' + moved + ' thread(s) out of the inbox.');
  });
}

/** Same treatment as processSkipInboxRules_, but for Gmail's promotions category. */
function processNewsletters_() {
  var query = 'in:inbox ' + CONFIG.NEWSLETTER_QUERY;
  var threads = GmailApp.search(query, 0, CONFIG.MAX_SKIP_THREADS_PER_RUN);
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
      console.error('Newsletters: failed on a thread: ' + err);
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
 * True if the thread is in a category where an AI draft should never exist,
 * even unsent: legal, HR, insurance, and similar sensitive matters. Matched
 * threads get the review label so they still surface for attention.
 */
function neverDraft_(message, subject) {
  var from = message.getFrom().toLowerCase();
  if (CONFIG.NEVER_DRAFT_DOMAINS.some(function (d) { return from.indexOf(d) !== -1; })) return true;

  var text = (subject + ' ' + message.getPlainBody()).toLowerCase();
  return CONFIG.NEVER_DRAFT_KEYWORDS.some(function (kw) { return text.indexOf(kw) !== -1; });
}

/** True if the message was sent by Laith (parsed address, case-insensitive). */
function isFromMe_(message) {
  if (!CONFIG.MY_EMAIL) return false; // getActiveUser can return '' in some auth contexts
  return extractEmail_(message.getFrom()).toLowerCase() === CONFIG.MY_EMAIL;
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
    if ((myEmail && lower === myEmail) || seen[lower]) return false;
    seen[lower] = true;
    return true;
  });
}

/**
 * Strips quoted history from a message body: ">"-prefixed lines, and
 * everything from an "On ... wrote:" / "Original Message" boundary down.
 * Without this, each message repeats the whole prior thread and the payload
 * sent to the model grows roughly quadratically with thread length.
 */
function stripQuotedText_(body) {
  var lines = body.split('\n');
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^\s*>/.test(line)) continue;
    if (/^On .{0,200} wrote:\s*$/.test(line)) break;
    if (/^-{2,}\s*(Original|Forwarded) [Mm]essage/.test(line)) break;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Thread text for the model: every message, de-quoted, newest kept in full.
 * Truncation drops whole messages from the oldest end rather than slicing
 * mid-message, so the model never sees an orphaned fragment misattributed
 * to the wrong sender.
 */
function buildThreadText_(messages) {
  var parts = messages.map(function (m) {
    return 'From: ' + m.getFrom() + '\n' + stripQuotedText_(m.getPlainBody());
  });

  var text = '';
  for (var i = parts.length - 1; i >= 0; i--) {
    var candidate = parts[i] + (text ? '\n\n---\n\n' + text : '');
    if (candidate.length > CONFIG.MAX_THREAD_CHARS && text) break;
    text = candidate;
  }
  return text;
}

/**
 * For inbox threads that aren't covered by a skip rule, aren't already
 * handled, and are actually awaiting a reply from Laith, asks Claude for a
 * draft and attaches it to the thread. Never sends anything - drafts only.
 *
 * Every thread this loop touches gets the processed-marker label FIRST, so
 * it leaves the search queue permanently: a failure is logged and labeled
 * Draft-Failed rather than retried (and re-billed) every 5 minutes forever,
 * and skipped threads can't pile up and crowd new mail out of the search.
 */
function processNeedsReplyDrafts_() {
  if (!CONFIG.MY_EMAIL) {
    console.error('Could not determine own email address; self-sent detection is degraded this run.');
  }

  var skipDomains = CONFIG.SKIP_INBOX_RULES.reduce(function (acc, r) {
    return acc.concat(r.domains);
  }, []);
  var exclusions = skipDomains.map(function (d) { return '-from:' + d; }).join(' ');
  // Needs-Reply is excluded too so threads drafted before the AI-Processed
  // marker existed aren't re-drafted after an upgrade.
  var query =
    'in:inbox is:unread -category:promotions -category:social -category:forums' +
    ' -label:"' + CONFIG.PROCESSED_LABEL + '" -label:"' + CONFIG.NEEDS_REPLY_LABEL + '" ' +
    exclusions;

  var threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_RUN);
  if (!threads.length) return;

  var processedLabel = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  var needsReplyLabel = getOrCreateLabel_(CONFIG.NEEDS_REPLY_LABEL);
  var drafted = 0;
  var priorityCounts = {};
  // Leave headroom under Apps Script's 6-minute kill: stop starting new
  // threads past this point; whatever's left is picked up next tick.
  var deadline = Date.now() + CONFIG.RUN_DEADLINE_MS;

  threads.forEach(function (thread) {
    if (Date.now() > deadline) return;

    var subject = '(unknown)';
    try {
      subject = thread.getFirstMessageSubject();
      var messages = thread.getMessages();
      var last = messages[messages.length - 1];

      // Mark before any expensive work - see function comment.
      thread.addLabel(processedLabel);

      if (last.isDraft()) return; // a draft already exists on this thread
      if (isFromMe_(last)) return; // Laith already replied
      if (looksAutomated_(last)) return;

      if (neverDraft_(last, subject)) {
        thread.addLabel(getOrCreateLabel_(CONFIG.REVIEW_NO_DRAFT_LABEL));
        console.log('Flagged for manual review (no AI draft): "' + subject + '"');
        return;
      }

      var threadText = buildThreadText_(messages);

      if (CONFIG.PRIORITY_ENABLED) {
        try {
          var priority = classifyPriority_(threadText, subject);
          if (priority) {
            thread.addLabel(getOrCreateLabel_(CONFIG.PRIORITY_LABELS[priority]));
            priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
          }
        } catch (err) {
          console.error('Priority classification failed for "' + subject + '": ' + err);
        }
      }

      if (CONFIG.TAXONOMY_ENABLED) {
        try {
          classifyIntoTaxonomy_(threadText, subject).forEach(function (name) {
            var taxonomyLabel = GmailApp.getUserLabelByName(name);
            if (taxonomyLabel) thread.addLabel(taxonomyLabel); // never creates - existing labels only
          });
        } catch (err) {
          console.error('Taxonomy filing failed for "' + subject + '": ' + err);
        }
      }

      var others = otherRecipients_(last);

      var reservationContext = null;
      if (CONFIG.VENDOR_ACCESS_ENABLED && looksLikeAccessRequest_(last)) {
        try {
          var propertyReference = extractPropertyReference_(threadText);
          if (propertyReference) {
            reservationContext = lookupReservationAccess_(propertyReference, extractEmail_(last.getFrom()));
          }
        } catch (err) {
          console.error('Reservation lookup failed for "' + subject + '": ' + err);
        }
      }

      var styleExamples = getWritingStyleExamples_(extractEmail_(last.getFrom()));

      var draftBody;
      try {
        draftBody = draftReplyWithClaude_(threadText, subject, others, reservationContext, styleExamples);
      } catch (err) {
        thread.addLabel(getOrCreateLabel_(CONFIG.DRAFT_FAILED_LABEL));
        console.error('Draft generation failed for "' + subject + '": ' + err);
        return;
      }
      if (!draftBody) return; // model declined (refusal) - flagged, not retried

      var finalBody = CONFIG.DRAFT_MARKER ? CONFIG.DRAFT_MARKER + '\n\n' + draftBody : draftBody;
      if (others.length) {
        thread.createDraftReplyAll(finalBody);
      } else {
        thread.createDraftReply(finalBody);
      }
      thread.addLabel(needsReplyLabel);
      drafted++;
    } catch (err) {
      console.error('Failed processing thread "' + subject + '": ' + err);
    }
  });

  console.log('Needs-Reply: drafted ' + drafted + ' new repl' + (drafted === 1 ? 'y' : 'ies') + '.');

  var prioritySummary = Object.keys(priorityCounts)
    .map(function (k) { return priorityCounts[k] + ' ' + k; })
    .join(', ');
  if (prioritySummary) console.log('Priority: ' + prioritySummary + '.');
}
