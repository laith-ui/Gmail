/**
 * Vendor access-info support: detects emails asking about property access,
 * pulls the property reference out of the thread, and looks up the live
 * reservation + entry code from BigQuery (synced from Guesty) so the drafted
 * reply can cite real check-in/checkout dates and codes instead of guessing.
 *
 * Requires the BigQuery advanced service enabled in this Apps Script project
 * (Services -> add "BigQuery API") and the bigquery.readonly OAuth scope in
 * appsscript.json (already added) - see README for the one-time setup.
 */

/** True if a message's subject/body suggests someone is asking about property access. */
function looksLikeAccessRequest_(message) {
  var text = (message.getSubject() + ' ' + message.getPlainBody()).toLowerCase();
  return CONFIG.VENDOR_ACCESS_KEYWORDS.some(function (kw) { return text.indexOf(kw) !== -1; });
}

/**
 * Asks a small/cheap model to pull the property address or nickname out of
 * the thread text, so it can be matched against Guesty listing nicknames.
 * Returns '' if no property reference is mentioned.
 */
function extractPropertyReference_(threadText) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return '';

  var payload = {
    model: CONFIG.EXTRACTION_MODEL,
    max_tokens: 60,
    system:
      'Extract the property address or property nickname this email thread is about. ' +
      'Reply with ONLY the address/nickname text, nothing else. If none is mentioned, reply with ' +
      'exactly: NONE',
    messages: [{ role: 'user', content: threadText.slice(0, 4000) }],
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
  var result = textBlock && textBlock.text ? textBlock.text.trim() : '';
  return result === 'NONE' ? '' : result;
}

/**
 * Looks up the current/next confirmed reservation (and any entry code tied
 * to it) for a property whose Guesty listing nickname loosely matches
 * `propertyReference` (every significant word/number in it must appear in
 * the nickname). Returns a plain-text summary for the drafting prompt, or
 * null if nothing matches or BigQuery isn't reachable.
 */
function lookupReservationAccess_(propertyReference) {
  var tokens = propertyReference
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(function (t) { return t.length > 1; });
  if (!tokens.length) return null;

  var conditions = tokens
    .map(function (t) { return 'LOWER(r.listing_nickname) LIKE "%' + t.replace(/"/g, '') + '%"'; })
    .join(' AND ');

  var query =
    'SELECT r.listing_nickname, r.check_in, r.check_out, l.code, l.purpose, l.status AS lock_status ' +
    'FROM `' + CONFIG.BIGQUERY_PROJECT_ID + '.silver_guesty.t_reservations` r ' +
    'LEFT JOIN `' + CONFIG.BIGQUERY_PROJECT_ID + '.silver_guesty.t_guesty_lock_codes` l ' +
    'ON l.reservation_id = r.id ' +
    'WHERE r.status = "confirmed" AND r.check_out >= CURRENT_DATETIME() AND ' + conditions + ' ' +
    'ORDER BY r.check_in LIMIT 3';

  var result;
  try {
    result = BigQuery.Jobs.query({ query: query, useLegacySql: false }, CONFIG.BIGQUERY_PROJECT_ID);
  } catch (err) {
    console.error('BigQuery reservation lookup failed: ' + err);
    return null;
  }

  if (!result.rows || !result.rows.length) return null;

  return result.rows
    .map(function (row) {
      var v = row.f.map(function (cell) { return cell.v; });
      var summary = 'Property: ' + v[0] + '\nCheck-in: ' + v[1] + '\nCheck-out: ' + v[2];
      return v[3] ? summary + '\nEntry code (' + v[4] + ', ' + v[5] + '): ' + v[3] : summary + '\nNo entry code on file for this reservation.';
    })
    .join('\n\n');
}
