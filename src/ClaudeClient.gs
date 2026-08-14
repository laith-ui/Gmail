/**
 * Sends the recent thread text to Claude and returns a draft reply body.
 * `otherRecipients`, when non-empty, means the draft will go out as a
 * reply-all, so the model is told who else will see it.
 * `reservationContext`, when present, is a live BigQuery/Guesty lookup of
 * the property's current reservation and entry code - treated as ground
 * truth over anything the model might otherwise guess.
 * Throws if ANTHROPIC_API_KEY isn't configured or the API call fails.
 */
function draftReplyWithClaude_(threadText, subject, otherRecipients, reservationContext) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY script property. See README for setup.');
  }

  var recipientNote =
    otherRecipients && otherRecipients.length
      ? '\n\n(This reply will go to everyone on the thread, including: ' + otherRecipients.join(', ') + '. ' +
        'Address the group naturally where it reads better than singling out one person.)'
      : '';

  var reservationNote = reservationContext
    ? '\n\n---\nLive reservation data for this property, pulled from Guesty just now. Treat this ' +
      'as ground truth for check-in/checkout dates and entry codes, overriding any dates or codes ' +
      'mentioned earlier in the thread:\n\n' + reservationContext
    : '';

  var payload = {
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
    system:
      'You are Laith\'s expert-level executive assistant, drafting the actual reply he will ' +
      'send. Below is the COMPLETE thread, every message, not an excerpt, so read all of it and ' +
      'build a full picture before writing: what was already asked, already answered, already ' +
      'agreed to, and what is genuinely still open. Do not re-ask something the thread already ' +
      'answered, contradict an earlier commitment in the thread, or ignore the most recent message ' +
      'in favor of an earlier one. ' +
      'Write only the body of a reply - no subject line, no "[Name]" placeholders, no signature ' +
      'block, no explanation of what you did. ' +
      'Ground the reply in the specific details of the thread (names, dates, numbers, addresses, ' +
      'requests, decisions already made) instead of generic filler like "thank you for reaching ' +
      'out" or "I appreciate your patience". Match the tone and formality of whoever you are ' +
      'replying to. Keep quick, simple items to a couple of sentences; give substantive questions ' +
      'a fuller, still direct answer that actually resolves them rather than restating the ' +
      'question or hedging. ' +
      'Only ask a clarifying question if the thread truly cannot be answered without one. ' +
      'If the thread genuinely lacks enough information for a real answer, write a short holding ' +
      'reply that acknowledges the email and says Laith will follow up with specifics, rather than ' +
      'inventing details. ' +
      'Never use em dashes or en dashes anywhere in the reply - use commas, periods, or ' +
      'parentheses instead. ' +
      'If live reservation data is provided below the thread, use those exact dates/codes rather ' +
      'than anything stated earlier in the thread, and do not mention that the data came from a ' +
      'lookup or system - just answer as Laith would.',
    messages: [{ role: 'user', content: 'Subject: ' + subject + '\n\n' + threadText + recipientNote + reservationNote }],
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Claude API error ' + code + ': ' + response.getContentText());
  }

  var body = JSON.parse(response.getContentText());
  var textBlock = (body.content || []).filter(function (block) { return block.type === 'text'; })[0];
  if (!textBlock || !textBlock.text) {
    throw new Error('Claude returned no draftable text (stop_reason: ' + body.stop_reason + ').');
  }
  // Belt-and-suspenders: strip any em/en dash the model uses despite the instruction above.
  return textBlock.text.replace(/[–—]/g, ',').trim();
}
