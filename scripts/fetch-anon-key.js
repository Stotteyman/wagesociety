// scripts/fetch-anon-key.js — Run ONCE to log the real anon key.
// Do NOT commit this file — it's a one-shot diagnostic.
const https = require('https');

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = 'pqngaffhjqadrsntsvlp';

if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const options = {
  hostname: 'api.supabase.com',
  path: '/v1/projects/' + projectRef + '/api-keys',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + serviceKey,
    'Content-Type': 'application/json',
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      // anon key might be in parsed.anon_key or parsed.apikey
      // Try to find it
      const anonKey = parsed.anon_key || parsed.apikey ||
        (Array.isArray(parsed) ? (parsed[0]?.anon_key || parsed[0]?.apikey) : null) ||
        'NOT_FOUND_in: ' + JSON.stringify(parsed).slice(0, 300);
      console.log('REAL_ANON_KEY:', anonKey);
    } catch(e) {
      console.error('PARSE_ERROR:', e.message, '| raw:', data.slice(0, 200));
    }
  });
});

req.on('error', e => console.error('REQUEST_ERROR:', e.message));
req.end();