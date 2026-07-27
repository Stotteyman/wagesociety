// GET /api/health — liveness + config visibility (no secrets returned).
const { isConfigured } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204 };
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      status: 'healthy',
      supabase_configured: isConfigured(),
      service_key_present: Boolean(process.env.SUPABASE_SERVICE_KEY),
      time: new Date().toISOString(),
    }),
  };
};
