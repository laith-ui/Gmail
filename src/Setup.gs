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
