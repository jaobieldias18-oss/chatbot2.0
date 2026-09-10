/* ═══════════════════════════════════════════════════════════════
   MERIDIAN — Conexões (fixas no código, sem tela de configuração)
   ─────────────────────────────────────────────────────────────────
   1. Supabase → supabase.com → seu projeto → Settings → API:
        supabaseUrl = Project URL        (ex.: https://xxxx.supabase.co)
        supabaseKey = anon public key    (a chave "anon", NÃO a service_role)
   2. Rode o arquivo supabase.sql no SQL Editor do projeto.
   3. Groq:
        • Produção (Cloudflare Pages): defina a env var GROQ_API_KEY no
          painel do Pages. A rota /api/chat usa ela — deixe groqKey vazio.
        • Teste local (abrir index.html direto): preencha groqKey com sua chave.
   ═══════════════════════════════════════════════════════════════ */
window.MERIDIAN_CONFIG = {
  supabaseUrl: "https://ssxxkeicctsadogmynsb.supabase.co",
  supabaseKey: "sb_publishable_USknLmCjE6MjfZ2KFwlGLA_4VgBRXhg",
  model: "openai/gpt-oss-120b", // ou "openai/gpt-oss-20b"
  temperature: 0.7,
  groqKey: "" // chave Groq fica como env var GROQ_API_KEY no Cloudflare
};
