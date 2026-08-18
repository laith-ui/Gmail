/**
 * Shared Anthropic API call with the failure handling every call site needs:
 * one retry with backoff on rate-limit/overload (429/529), and `null` on a
 * model refusal (callers must treat null as "skip, don't retry" - a refusal
 * repeats deterministically, so retrying it every 5 minutes just burns money).
 * Throws on other errors.
 */
function callClaude_(payload) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY script property. See README for setup.');
  }

  var params = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', params);
  var code = response.getResponseCode();

  if (code === 429 || code === 529) {
    Utilities.sleep(3000);
    response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', params);
    code = response.getResponseCode();
  }

  if (code !== 200) {
    throw new Error('Claude API error ' + code + ': ' + response.getContentText().slice(0, 500));
  }

  var body = JSON.parse(response.getContentText());
  if (body.stop_reason === 'refusal') {
    console.log('Model declined to respond (refusal).');
    return null;
  }

  var textBlock = (body.content || []).filter(function (block) { return block.type === 'text'; })[0];
  if (!textBlock || !textBlock.text) {
    throw new Error('Claude returned no text (stop_reason: ' + body.stop_reason + ').');
  }
  return textBlock.text.trim();
}

/**
 * Sends the thread text to Claude and returns a draft reply body, or null if
 * the model declined (caller skips the thread without retrying).
 * `otherRecipients`, when non-empty, means the draft will go out as a
 * reply-all, so the model is told who else will see it.
 * `reservationContext`, when present, is a live BigQuery/Guesty lookup of
 * the property's current reservation - treated as ground truth over anything
 * the model might otherwise guess.
 * `styleExamples`, when present, is a sample of Laith's own past sent
 * emails, used purely as a tone/voice reference.
 */
function draftReplyWithClaude_(threadText, subject, otherRecipients, reservationContext, styleExamples) {
  var recipientNote =
    otherRecipients && otherRecipients.length
      ? '\n\n(This reply will go to everyone on the thread, including: ' + otherRecipients.join(', ') + '. ' +
        'Address the group naturally where it reads better than singling out one person.)'
      : '';

  var reservationNote = reservationContext
    ? '\n\n<reservation_data>\nLive reservation data for this property, pulled from Guesty just now. ' +
      'Treat this as ground truth for dates (and entry codes, if present), overriding anything ' +
      'stated in the email thread:\n\n' + reservationContext + '\n</reservation_data>'
    : '';

  // Style examples are expensive for Haiku to process meaningfully, so skip them to save costs
  var styleNote = '';

  var payload = {
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
    system:
      'Draft a direct, professional reply to the most recent email in the thread. ' +
      'Reply body only - no subject, signature, or name placeholders. ' +
      'Use specific details from the thread (names, dates, numbers). ' +
      'Answer the actual question. Do not re-ask something already answered. ' +
      'Keep it concise. ' +
      'If reservation data is provided in <reservation_data>, use those dates/codes instead of the email. ' +
      'Never include an entry or door code unless it is in the reservation data. ' +
      'Do not use em dashes or en dashes - use commas or periods instead. ' +
      'Do not include XML tags in your response.',
    messages: [{
      role: 'user',
      content:
        'Subject: ' + subject + '\n\n<email_thread>\n' + threadText + '\n</email_thread>' +
        recipientNote + reservationNote + styleNote,
    }],
  };

  var text = callClaude_(payload);
  if (text === null) return null;

  // Belt-and-suspenders: strip any em/en dash the model uses despite the instruction above.
  return text.replace(/[–—]/g, ',');
}
