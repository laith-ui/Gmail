/**
 * Pulls a few of Laith's own past sent emails to use as style reference so
 * drafts sound like him instead of a generic assistant. Prefers prior
 * correspondence with the same sender (keeps established rapport/tone
 * consistent); falls back to recent sent mail in general if there's no
 * history with this person.
 */

/** First email address found in a raw header value, or '' if none. */
function extractEmail_(headerValue) {
  var match = (headerValue || '').match(/[^\s<>,"]+@[^\s<>,"]+/);
  return match ? match[0] : '';
}

/** Up to `limit` plain-text bodies of messages Laith actually sent, matching `query`. */
function collectSentBodies_(query, limit) {
  var myEmail = CONFIG.MY_EMAIL.toLowerCase();
  var bodies = [];

  GmailApp.search(query, 0, limit).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (bodies.length >= limit) return;
      if (m.getFrom().toLowerCase().indexOf(myEmail) !== -1) {
        bodies.push(m.getPlainBody());
      }
    });
  });

  return bodies;
}

/**
 * Returns a block of past-sent-email text for the drafting prompt, or ''
 * if there's nothing usable. Never throws - a lookup failure here shouldn't
 * block drafting, it just means the draft skips the style reference.
 */
function getWritingStyleExamples_(senderEmail) {
  if (!CONFIG.SENT_STYLE_ENABLED) return '';

  try {
    var examples = senderEmail ? collectSentBodies_('in:sent to:' + senderEmail, CONFIG.SENT_STYLE_EXAMPLE_COUNT) : [];
    if (!examples.length) {
      examples = collectSentBodies_('in:sent', CONFIG.SENT_STYLE_EXAMPLE_COUNT);
    }
    return examples
      .map(function (body) { return body.slice(0, CONFIG.SENT_STYLE_EXAMPLE_CHARS); })
      .join('\n\n---\n\n');
  } catch (err) {
    console.error('Writing-style lookup failed: ' + err);
    return '';
  }
}
