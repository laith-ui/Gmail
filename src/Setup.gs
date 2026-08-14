/**
 * Run this once from the Apps Script editor (select setupTrigger in the
 * function dropdown and click Run) to install the recurring trigger.
 * Safe to re-run - it replaces any existing trigger for runInboxAutomation.
 */
function setupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'runInboxAutomation'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('runInboxAutomation').timeBased().everyMinutes(5).create();

  console.log('Trigger installed: runInboxAutomation will run every 5 minutes.');
}

/**
 * Processes exactly one thread through the full drafting pipeline. Use this
 * to preview behavior (check the draft it produces and the labels it applies)
 * before or after config changes, without letting a full run loose.
 */
function testOneThread() {
  CONFIG.MAX_THREADS_PER_RUN = 1;
  processNeedsReplyDrafts_();
}

/**
 * Run this once (and again after editing CONFIG.LABEL_COLORS) to create the
 * priority labels and apply their colors. Colors persist in Gmail, so this
 * doesn't need to run on the recurring trigger.
 */
function applyLabelColors() {
  syncLabelColors_();
  console.log('Label colors applied.');
}

/** Removes the recurring trigger without touching any code or labels. */
function removeTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runInboxAutomation') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  console.log('Removed ' + removed + ' trigger(s).');
}
