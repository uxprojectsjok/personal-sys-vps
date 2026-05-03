// server/api/test-key.post.js
// POST /api/test-key — testet einen Anthropic API-Key serverseitig (kein CORS-Problem)
// Auth: soul_cert Bearer-Token

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token || !token.includes('.')) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const body = await readBody(event)
  const { anthropic_key } = body || {}
  if (!anthropic_key || !anthropic_key.startsWith('sk-ant-'))
    throw createError({ statusCode: 400, message: 'invalid_key' })

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropic_key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    })
    return { ok: res.ok, status: res.status }
  } catch {
    return { ok: false, status: 0 }
  }
})
