/**
 * Classifies inbox threads into color-coded priority labels so the inbox can
 * be scanned visually: red for things that need Laith today, yellow for
 * things awaiting his decision, green for FYI/no action needed.
 */

/**
 * Asks a cheap/fast model to bucket a thread. Returns one of the keys in
 * CONFIG.PRIORITY_LABELS, or '' if classification fails or is unrecognized
 * (in which case no priority label is applied and drafting proceeds normally).
 */
function classifyPriority_(threadText, subject) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return '';

  var payload = {
    model: CONFIG.EXTRACTION_MODEL,
    max_tokens: 10,
    system:
      'You triage email for Laith, an executive running property operations for a ' +
      'vacation-rental company (guests, owners, vendors, cleaners, maintenance, staff). ' +
      'Classify the thread into exactly one bucket and reply with ONLY that word:\n\n' +
      'URGENT - something is broken, blocked, or time-critical today: guest issue in progress, ' +
      'property emergency (water, power, HVAC, lockout, security), an owner or guest escalation, ' +
      'a payment/legal deadline, or someone explicitly waiting on Laith to unblock them.\n' +
      'DECISION - no emergency, but it needs Laith personally to decide, approve, price, or ' +
      'answer something only he can.\n' +
      'FYI - informational, already handled by someone else, or a routine update that needs no ' +
      'action from Laith.',
    messages: [{ role: 'user', content: ('Subject: ' + subject + '\n\n' + threadText).slice(0, 6000) }],
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) return '';

  var body = JSON.parse(response.getContentText());
  var textBlock = (body.content || []).filter(function (b) { return b.type === 'text'; })[0];
  var verdict = textBlock && textBlock.text ? textBlock.text.trim().toUpperCase() : '';

  return CONFIG.PRIORITY_LABELS[verdict] ? verdict : '';
}
