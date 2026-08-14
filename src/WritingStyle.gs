/**
 * Pulls a few of Laith's own past sent emails to use as style reference so
 * drafts sound like him instead of a generic assistant. Prefers prior
 * correspondence with the same sender (keeps established rapport/tone
 * consistent); falls back to recent sent mail in general if there's no
 * history with this person.
 *
 * Results are cached per execution: the generic fallback is identical for
 * every thread in a run, and per-sender lookups repeat when several threads
 * come from the same person - no reason to re-search Gmail each time.
 */

var styleCache_ = {};

/** First email address found in a raw header value, or '' if none. */
function extractEmail_(headerValue) {
  var match = (headerValue || '').match(/[^\s<>,"]+@[^\s<>,"]+/);
  return match ? match[0] : '';
}

/** Up to `limit` plain-text bodies of messages Laith actually sent, matching `query`. */
function collectSentBodies_(query, limit) {
  var myEmail = CONFIG.MY_EMAIL;
  if (!myEmail) return []; // can't attribute authorship without knowing own address

  var bodies = [];
  var threads = GmailApp.search(query, 0, limit);

  for (var t = 0; t < threads.length && bodies.length < limit; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length && bodies.length < limit; m++) {
      if (extractEmail_(messages[m].getFrom()).toLowerCase() === myEmail) {
        bodies.push(stripQuotedText_(messages[m].getPlainBody()));
      }
    }
  }

  return bodies;
}

/**
 * Returns a block of past-sent-email text for the drafting prompt, or ''
 * if there's nothing usable. Never throws - a lookup failure here shouldn't
 * block drafting, it just means the draft skips the style reference.
 */
function getWritingStyleExamples_(senderEmail) {
  if (!CONFIG.SENT_STYLE_ENABLED) return '';

  var cacheKey = (senderEmail || '*').toLowerCase();
  if (styleCache_[cacheKey] !== undefined) return styleCache_[cacheKey];

  var result = '';
  try {
    var examples = senderEmail ? collectSentBodies_('in:sent to:' + senderEmail, CONFIG.SENT_STYLE_EXAMPLE_COUNT) : [];
    if (!examples.length) {
      // Generic fallback is the same for every thread - compute once per run.
      if (styleCache_['*'] !== undefined) {
        styleCache_[cacheKey] = styleCache_['*'];
        return styleCache_['*'];
      }
      examples = collectSentBodies_('in:sent', CONFIG.SENT_STYLE_EXAMPLE_COUNT);
      styleCache_['*'] = joinStyleExamples_(examples);
      styleCache_[cacheKey] = styleCache_['*'];
      return styleCache_['*'];
    }
    result = joinStyleExamples_(examples);
  } catch (err) {
    console.error('Writing-style lookup failed: ' + err);
    result = '';
  }

  styleCache_[cacheKey] = result;
  return result;
}

function joinStyleExamples_(examples) {
  return examples
    .map(function (body) { return body.slice(0, CONFIG.SENT_STYLE_EXAMPLE_CHARS); })
    .join('\n\n---\n\n');
}
