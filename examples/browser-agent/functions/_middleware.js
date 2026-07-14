/**
 * Adds the headers required for WebMCP on Cloudflare Pages.
 * Origin Trial tokens are public deployment metadata, but keeping the value in
 * the Pages environment lets each fork register its own exact origin.
 */
export async function onRequest(context) {
  return withWebMcpHeaders(await context.next(), context.env)
}

export function withWebMcpHeaders(response, env = {}) {
  const headers = new Headers(response.headers)
  headers.set('Origin-Agent-Cluster', '?1')
  if (env.WEBMCP_ORIGIN_TRIAL_TOKEN) {
    headers.set('Origin-Trial', env.WEBMCP_ORIGIN_TRIAL_TOKEN)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
