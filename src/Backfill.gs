/**
 * One-time backfill: files ALL existing inbox threads (read or unread, any
 * age) into the taxonomy, working through the backlog in batches so no
 * single execution hits Apps Script's 6-minute limit.
 *
 * Usage: run startBackfill() once from the editor. It processes the first
 * batch immediately, then installs its own recurring trigger to keep going
 * every 10 minutes, and removes that trigger automatically when the whole
 * inbox is labeled. stopBackfill() cancels early.
 *
 * Backfill only FILES (taxonomy labels + the AI-Processed marker). It never
 * drafts replies, never applies priority labels, and never archives - old
 * mail gets organized, not acted on.
 */

// Read mail only: unread threads are left for the main automation, which
// files them AND drafts replies - backfill marking them processed first
// would rob them of their drafts.
var BACKFILL_QUERY_ = 'in:inbox -is:unread -label:"AI-Processed"';
var BACKFILL_BATCH_SIZE_ = 60;

function startBackfill() {
  installBackfillTrigger_();
  backfillBatch();
}

function stopBackfill() {
  removeBackfillTrigger_();
  console.log('Backfill stopped. Run startBackfill() to resume where it left off.');
}

function backfillBatch() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    console.log('Another run holds the lock; this backfill tick will retry next time.');
    return;
  }

  try {
    var threads = GmailApp.search(BACKFILL_QUERY_, 0, BACKFILL_BATCH_SIZE_);
    if (!threads.length) {
      removeBackfillTrigger_();
      console.log('Backfill complete: every read inbox thread is labeled. Trigger removed.');
      return;
    }

    var processedLabel = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
    var deadline = Date.now() + CONFIG.RUN_DEADLINE_MS;
    var filed = 0;

    threads.forEach(function (thread) {
      if (Date.now() > deadline) return;

      var subject = '(unknown)';
      try {
        subject = thread.getFirstMessageSubject();
        thread.addLabel(processedLabel); // marked first - never re-examined even on failure

        var messages = thread.getMessages();
        var threadText = buildThreadText_(messages);

        classifyIntoTaxonomy_(threadText, subject).forEach(function (name) {
          var taxonomyLabel = GmailApp.getUserLabelByName(name);
          if (taxonomyLabel) thread.addLabel(taxonomyLabel);
        });
        filed++;
      } catch (err) {
        console.error('Backfill failed on "' + subject + '": ' + err);
      }
    });

    console.log('Backfill: filed ' + filed + ' thread(s) this batch; more remain.');
  } finally {
    lock.releaseLock();
  }
}

function installBackfillTrigger_() {
  removeBackfillTrigger_();
  ScriptApp.newTrigger('backfillBatch').timeBased().everyMinutes(10).create();
  console.log('Backfill trigger installed: a batch runs every 10 minutes until the inbox is fully labeled.');
}

function removeBackfillTrigger_() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'backfillBatch'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}
