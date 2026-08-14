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

  // Bookkeeping labels: keep them working (search/filtering still sees them)
  // but hide their chips from the message list so they don't crowd out the
  // subject line, and tuck them away in the sidebar.
  CONFIG.HIDDEN_LABELS.forEach(function (name) {
    try {
      var label = existing[name] || Gmail.Users.Labels.create({ name: name }, 'me');
      Gmail.Users.Labels.patch(
        { name: name, labelListVisibility: 'labelHide', messageListVisibility: 'hide' },
        'me',
        label.id
      );
    } catch (err) {
      console.error('Could not hide label "' + name + '": ' + err);
    }
  });
}
