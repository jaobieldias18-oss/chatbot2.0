// Cloudflare Pages Function — proxy seguro para o Groq (gpt-oss).
// Rota: POST /api/chat  |  Env vars: GROQ_API_KEY (+ GROQ_MODEL opcional)
export async function onRequestPost({ request, env }) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  try {
    const body = await request.json().catch(() => ({}));
    const apiKey = env.GROQ_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "GROQ_API_KEY não configurada no Cloudflare Pages (Settings → Environment variables)." }, { status: 500, headers: cors });
    }
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: body.model || env.GROQ_MODEL || "openai/gpt-oss-120b",
        temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
        max_tokens: body.max_tokens || 2048,
        messages: Array.isArray(body.messages) ? body.messages : [],
      }),
    });
    const data = await groqRes.json().catch(() => ({}));
    if (!groqRes.ok) {
      return Response.json({ error: data?.error?.message || `Groq ${groqRes.status}` }, { status: groqRes.status, headers: cors });
    }
    return Response.json(data, { headers: cors });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
