/**
 * Sends the recent thread text to Claude and returns a draft reply body.
 * Throws if ANTHROPIC_API_KEY isn't configured or the API call fails.
 */
function draftReplyWithClaude_(threadText, subject) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY script property. See README for setup.');
  }

  var payload = {
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
    system:
      'You draft concise, professional email replies on behalf of Laith. ' +
      'Read the email thread below and write only the body of a reply - no subject line, ' +
      'no signature block, no explanation of what you did. Match a direct, friendly, ' +
      'professional tone. If the thread does not contain enough information for a real ' +
      'answer, write a short holding reply that acknowledges the email and says Laith will ' +
      'follow up with specifics.',
    messages: [{ role: 'user', content: 'Subject: ' + subject + '\n\n' + threadText }],
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
  return body.content[0].text.trim();
}
