/**
 * Test functions to verify the Haiku 4.5 setup and API key.
 * Run these from the Apps Script editor to debug the automation.
 */

/**
 * Verify that ANTHROPIC_API_KEY is set in Script Properties and can reach the API.
 * Run this first to ensure your API key is valid.
 */
function testApiKey() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');

  if (!apiKey) {
    console.log('❌ ANTHROPIC_API_KEY not found in Script Properties.');
    console.log('Setup: Project Settings > Script Properties > Add "ANTHROPIC_API_KEY" with your key');
    return false;
  }

  console.log('✓ API key found (length: ' + apiKey.length + ')');

  // Test a simple API call to verify the key works
  try {
    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Say "working" in one word.' }],
      }),
      muteHttpExceptions: true,
    });

    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (code === 200) {
      var text = (body.content || [])
        .filter(function (b) { return b.type === 'text'; })[0]?.text || 'no response';
      console.log('✓ API call successful. Model response: ' + text);
      return true;
    } else if (code === 401) {
      console.log('❌ API key is invalid (401 Unauthorized)');
      console.log('Check your ANTHROPIC_API_KEY in Script Properties');
      return false;
    } else {
      console.log('❌ API error ' + code + ': ' + body.error?.message);
      return false;
    }
  } catch (err) {
    console.log('❌ Network error: ' + err);
    return false;
  }
}

/**
 * Test the taxonomy classification with a sample email.
 * Requires a valid API key.
 */
function testTaxonomyClassification() {
  if (!testApiKey()) {
    console.log('Fix the API key first before running other tests.');
    return;
  }

  console.log('\n--- Testing taxonomy classification ---');

  var sampleThread =
    'From: vendor@example.com\n' +
    'Subject: Property access request\n\n' +
    'Hi Laith, We need access to the property on August 20th to perform maintenance. ' +
    'Please let us know the access code.';

  var subject = 'Property access request';

  var labels = classifyIntoTaxonomy_(sampleThread, subject);
  console.log('Classification result: ' + (labels.length ? labels.join(', ') : 'no label'));
}

/**
 * Test draft generation with a sample email.
 * Requires a valid API key and proper CONFIG setup.
 */
function testDraftGeneration() {
  if (!testApiKey()) {
    console.log('Fix the API key first before running other tests.');
    return;
  }

  console.log('\n--- Testing draft generation with Haiku ---');

  var sampleThread =
    'From: guest@example.com\n' +
    'Date: Aug 18, 2024\n\n' +
    'Hi Laith, Thanks for getting back to me. Can you confirm the check-in time for ' +
    'our reservation on August 20th? We arrive around 3pm. Thanks!';

  var subject = 'Check-in time question';

  var draft = draftReplyWithClaude_(sampleThread, subject, [], null, null);
  if (draft) {
    console.log('✓ Draft generated successfully:');
    console.log(draft);
  } else {
    console.log('❌ Draft generation returned null (model may have declined)');
  }
}

/**
 * Quick health check - verifies all core systems are wired up.
 */
function testHealthCheck() {
  console.log('=== Gmail Automation Health Check ===\n');

  // Check 1: API key
  console.log('1. API Key:');
  var apiKeyValid = testApiKey();
  console.log('');

  if (!apiKeyValid) {
    console.log('⚠️  Stopping checks - fix the API key first.');
    return;
  }

  // Check 2: Config
  console.log('2. Configuration:');
  console.log('   Model: ' + CONFIG.CLAUDE_MODEL);
  console.log('   Max tokens: ' + CONFIG.CLAUDE_MAX_TOKENS);
  console.log('   Taxonomy enabled: ' + CONFIG.TAXONOMY_ENABLED);
  console.log('   Priority enabled: ' + CONFIG.PRIORITY_ENABLED);
  console.log('');

  // Check 3: Gmail access
  console.log('3. Gmail Access:');
  try {
    var threads = GmailApp.search('in:inbox', 0, 1);
    console.log('   ✓ Can read inbox (' + threads.length + ' thread found)');
  } catch (err) {
    console.log('   ❌ Cannot read inbox: ' + err);
  }

  console.log('\n=== All systems operational ===');
}
