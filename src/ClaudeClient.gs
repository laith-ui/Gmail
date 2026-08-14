/**
 * Sends the recent thread text to Claude and returns a draft reply body.
 * `otherRecipients`, when non-empty, means the draft will go out as a
 * reply-all, so the model is told who else will see it.
 * Throws if ANTHROPIC_API_KEY isn't configured or the API call fails.
 */
function draftReplyWithClaude_(threadText, subject, otherRecipients) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY script property. See README for setup.');
  }

  var recipientNote =
    otherRecipients && otherRecipients.length
      ? '\n\n(This reply will go to everyone on the thread, including: ' + otherRecipients.join(', ') + '. ' +
        'Address the group naturally where it reads better than singling out one person.)'
      : '';

  var payload = {
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
    system:
      'You draft email replies on behalf of Laith. Read the full thread below and write only ' +
      'the body of a reply - no subject line, no "[Name]" placeholders, no signature block, no ' +
      'explanation of what you did. ' +
      'Ground the reply in the specific details of the thread (names, dates, numbers, requests, ' +
      'decisions already made) instead of generic filler like "thank you for reaching out" or ' +
      '"I appreciate your patience". Match the tone and formality of whoever you are replying to. ' +
      'Keep quick, simple items to a couple of sentences; give substantive questions a fuller, ' +
      'still direct answer that actually resolves them rather than restating the question. ' +
      'Only ask a clarifying question if the thread truly cannot be answered without one - do not ' +
      'ask questions the thread already answers. ' +
      'If the thread genuinely lacks enough information for a real answer, write a short holding ' +
      'reply that acknowledges the email and says Laith will follow up with specifics, rather than ' +
      'inventing details. ' +
      'Never use em dashes or en dashes anywhere in the reply - use commas, periods, or ' +
      'parentheses instead.',
    messages: [{ role: 'user', content: 'Subject: ' + subject + '\n\n' + threadText + recipientNote }],
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
