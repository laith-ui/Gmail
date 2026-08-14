/**
 * Returns the Gmail label with the given name, creating it (including any
 * parent segments implied by a "Parent/Child" name) if it doesn't exist yet.
 */
function getOrCreateLabel_(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) {
    label = GmailApp.createLabel(name);
  }
  return label;
}
