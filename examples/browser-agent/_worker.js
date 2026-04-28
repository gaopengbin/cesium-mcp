export default {
  async fetch(r, env) {
    const u = new URL(r.url);
    if (u.pathname !== '/api/chat') return env.ASSETS.fetch(r);
    if (r.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (r.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors() });
    const k = env.OPENAI_API_KEY;
    if (!k) return Response.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500, headers: cors() });
    let b;
    try { b = await r.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: cors() }); }
    const { model, messages, tools } = b;
    if (!messages || !Array.isArray(messages)) return Response.json({ error: 'messages required' }, { status: 400, headers: cors() });
    const p = { model: model || 'deepseek/deepseek-chat-v3-0324', messages };
    if (tools && tools.length > 0) p.tools = tools;
    const base = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k },
      body: JSON.stringify(p),
    });
    const d = await res.text();
    return new Response(d, { status: res.status, headers: { 'Content-Type': 'application/json', ...cors() } });
  },
};
function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
