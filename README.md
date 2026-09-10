# Meridian — Chat minimalista (Groq gpt-oss + Supabase + Cloudflare)

Assistente conversacional em **HTML + CSS + JS puros**, sem build. Design editorial
sofisticado (serifa Fraunces + Inter), animações sutis e memória persistente.

## 1. Supabase (banco das conversas)

1. Crie um projeto em `supabase.com` → **Settings → API** → copie `Project URL` e `anon public key`.
2. No **SQL Editor**, rode o arquivo `supabase.sql` (cria `conversations` + `messages`).
3. Abra `config.js` e preencha `supabaseUrl` e `supabaseKey`. Pronto — sem tela de configuração.

Sem Supabase, o app funciona em **modo local** (localStorage).

## 2. Groq gpt-oss (IA)

Modelos: `openai/gpt-oss-120b` (padrão, mais capaz) ou `openai/gpt-oss-20b` (mais rápido).

- **Produção (recomendado):** a chave fica no servidor. A rota `POST /api/chat`
  (`functions/api/chat.js`) faz o proxy com `GROQ_API_KEY` — a chave nunca vaza.
- **Teste local:** preencha `groqKey` no `config.js` com sua `gsk_…`.

## 3. Deploy no Cloudflare Pages

Opção A — via Git:
1. Suba esta pasta para um repositório GitHub.
2. Cloudflare Dashboard → **Pages → Create → Connect to Git** → selecione o repo.
3. Build: **Framework preset = None**, **Build command = (vazio)**, **Output = `/`**.
4. **Settings → Environment variables → Production:** adicione `GROQ_API_KEY`.
5. Deploy. A rota `/api/chat` passa a responder via Functions.

Opção B — arrastar pasta: Pages → **Upload assets** (Functions também funciona se
a pasta `functions/` estiver incluída).

Opção C — CLI: `npx wrangler pages deploy . --project-name meridian-chat`.

## 4. Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Layout (sidebar + chat + modal) |
| `styles.css` | Design system + animações + dark mode |
| `app.js` | Estado, Supabase, streaming visual, exportação |
| `config.js` | Valores padrão (opcional) |
| `functions/api/chat.js` | Proxy seguro Groq (Cloudflare Pages Functions) |
| `supabase.sql` | Schema do banco |
| `wrangler.toml` | Metadados Cloudflare |

## 5. Segurança

- Nunca exponha `service_role` nem `GROQ_API_KEY` no front-end.
- A anon key do Supabase é pública por desenho; as tabelas usam políticas abertas
  para protótipo. Para produção com login, ative RLS por usuário (ver comentários no SQL).
