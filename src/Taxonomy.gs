/**
 * Files threads into Laith's existing Gmail label taxonomy (the numbered
 * "1. Executive & Board" / "3. Core Operations/Ops - Facilities" / ... tree)
 * rather than inventing a parallel scheme. Labels are read live from the
 * account, so adding or renaming a label in Gmail changes what the
 * classifier can pick without touching this code.
 */

/**
 * All user labels whose names start with a configured taxonomy prefix,
 * excluding the automation's own labels. Cached per execution since every
 * thread in a run classifies against the same list.
 */
var taxonomyLabelCache_ = null;

function getTaxonomyLabels_() {
  if (taxonomyLabelCache_) return taxonomyLabelCache_;

  taxonomyLabelCache_ = GmailApp.getUserLabels()
    .map(function (l) { return l.getName(); })
    .filter(function (name) {
      if (CONFIG.TAXONOMY_EXCLUDE_PREFIXES.some(function (p) { return name.indexOf(p) === 0; })) return false;
      return CONFIG.TAXONOMY_INCLUDE_PATTERN.test(name);
    })
    .sort();

  return taxonomyLabelCache_;
}

/**
 * Asks a cheap/fast model which of the existing taxonomy labels fit this
 * thread. Returns an array of label names (possibly empty) - only names that
 * actually exist in the account are returned, so a hallucinated label is
 * dropped rather than created.
 */
function classifyIntoTaxonomy_(threadText, subject) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return [];

  var labels = getTaxonomyLabels_();
  if (!labels.length) return [];

  var payload = {
    model: CONFIG.EXTRACTION_MODEL,
    max_tokens: 120,
    system:
      'You file email for Laith, an executive running property operations at a vacation-rental ' +
      'company. Below is his existing Gmail label taxonomy. Choose the label(s) that best fit the ' +
      'thread.\n\n' +
      'Rules:\n' +
      '- Reply with ONLY label names, exactly as written below, one per line.\n' +
      '- Choose the most specific applicable label (prefer "3. Core Operations/Ops - Finance" over ' +
      'the bare "3. Core Operations").\n' +
      '- Usually pick exactly one. Pick a second only if the thread genuinely spans two areas.\n' +
      '- If nothing fits well, reply with exactly: NONE\n\n' +
      'Available labels:\n' + labels.join('\n'),
    messages: [{ role: 'user', content: ('Subject: ' + subject + '\n\n' + threadText).slice(0, 6000) }],
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) return [];

  var body = JSON.parse(response.getContentText());
  var textBlock = (body.content || []).filter(function (b) { return b.type === 'text'; })[0];
  if (!textBlock || !textBlock.text) return [];

  var valid = {};
  labels.forEach(function (name) { valid[name] = true; });

  return textBlock.text
    .split('\n')
    // Strip bullet markers only - label names legitimately begin with digits
    // ("1. Executive & Board"), so don't strip leading numbers/dots.
    .map(function (line) { return line.trim().replace(/^[-*]\s*/, ''); })
    .filter(function (line) { return valid[line]; })
    .slice(0, CONFIG.TAXONOMY_MAX_LABELS);
}
