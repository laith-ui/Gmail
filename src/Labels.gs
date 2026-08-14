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

/**
 * Applies the colors defined in CONFIG.LABEL_COLORS to their labels, creating
 * any that don't exist yet. GmailApp has no color API, so this goes through
 * the Gmail advanced service. Run once via applyLabelColors() in Setup.gs;
 * colors persist, so it doesn't need to run on every automation tick.
 */
function syncLabelColors_() {
  var existing = {};
  (Gmail.Users.Labels.list('me').labels || []).forEach(function (l) { existing[l.name] = l; });

  Object.keys(CONFIG.LABEL_COLORS).forEach(function (name) {
    var color = CONFIG.LABEL_COLORS[name];
    var resource = {
      name: name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
      color: { backgroundColor: color.background, textColor: color.text },
    };

    try {
      if (existing[name]) {
        Gmail.Users.Labels.patch(resource, 'me', existing[name].id);
      } else {
        Gmail.Users.Labels.create(resource, 'me');
      }
    } catch (err) {
      console.error('Could not set color for label "' + name + '": ' + err);
    }
  });
}
