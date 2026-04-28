/**
 * Cloudflare Pages Function — OpenAI API proxy
 * Receives chat messages + tools, forwards to OpenAI, returns the response.
 * Keeps the API key server-side.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'OPENAI_API_KEY not configured on server' },
      { status: 500, headers: corsHeaders() }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: corsHeaders() }
    );
  }

  const { model, messages, tools } = body;
  if (!messages || !Array.isArray(messages)) {
    return Response.json(
      { error: 'messages array is required' },
      { status: 400, headers: corsHeaders() }
    );
  }

  const openaiBody = {
    model: model || 'gpt-4o-mini',
    messages,
  };
  if (tools && tools.length > 0) {
    openaiBody.tools = tools;
  }

  // Lightweight structured log (no PII, no message content).
  // Tail with: `npx wrangler pages deployment tail`
  try {
    console.log(JSON.stringify({
      event: 'chat',
      model: openaiBody.model,
      msgCount: messages.length,
      toolCount: tools?.length ?? 0,
      lastRole: messages[messages.length - 1]?.role,
      ts: Date.now(),
    }));
  } catch { /* never fail the request because of logging */ }

  const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const openaiRes = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(openaiBody),
  });

  const data = await openaiRes.text();

  return new Response(data, {
    status: openaiRes.status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
