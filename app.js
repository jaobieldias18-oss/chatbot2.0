/* Meridian — conexão Supabase + Groq gpt-oss via Cloudflare Functions */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const thread = $("thread"), welcome = $("welcome"), scroll = $("scroll"),
    input = $("input"), sendBtn = $("sendBtn"), stopBtn = $("stopBtn"),
    historyList = $("historyList"), convoTitle = $("convoTitle"),
    modelBadge = $("modelBadge"), latencyEl = $("latency"), toastEl = $("toast");

  const LS_THEME = "meridian_theme", LS_LOCAL = "meridian_local_v1";

  /* Chaves fixas no código (config.js) — sem tela de configuração. */
  const cfg = Object.assign(
    { supabaseUrl: "", supabaseKey: "", groqKey: "", model: "openai/gpt-oss-120b", temperature: 0.7 },
    (window.MERIDIAN_CONFIG || {})
  );
  let sb = null, useSupabase = false;
  let convos = [], currentId = null, messages = [], aborter = null, sending = false;

  /* ---------- theme ---------- */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $("themeLabel").textContent = t === "light" ? "Escuro" : "Claro";
    localStorage.setItem(LS_THEME, t);
  }
  applyTheme(localStorage.getItem(LS_THEME) || "light");
  $("themeBtn").onclick = () =>
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");

  /* ---------- toast ---------- */
  let toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  /* ---------- sidebar mobile ---------- */
  const app = document.querySelector(".app");
  const setNav = (open) => app.classList.toggle("nav-closed", !open);
  setNav(window.innerWidth > 900);
  $("menuBtn").onclick = () => setNav(true);
  $("sidebarClose").onclick = $("scrim").onclick = () => setNav(false);

  /* ---------- Supabase ---------- */
  function setDbStatus(ok) {
    const el = $("dbStatus");
    el.classList.toggle("is-ok", ok);
    el.innerHTML = ok ? "<i></i>supabase" : "<i></i>local";
  }
  function initSupabase() {
    useSupabase = false; sb = null;
    if (cfg.supabaseUrl && cfg.supabaseKey && window.supabase) {
      try {
        sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
        useSupabase = true; setDbStatus(true); return;
      } catch { /* cai para local */ }
    }
    setDbStatus(false);
  }
  const localRead = () => { try { return JSON.parse(localStorage.getItem(LS_LOCAL) || '{"convos":[],"msgs":{}}'); } catch { return { convos: [], msgs: {} }; } };
  const localWrite = (d) => localStorage.setItem(LS_LOCAL, JSON.stringify(d));

  async function dbListConvos() {
    if (useSupabase) {
      const { data, error } = await sb.from("conversations").select("*").order("updated_at", { ascending: false }).limit(100);
      if (error) throw error; return data;
    }
    return localRead().convos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
  async function dbCreateConvo(title) {
    if (useSupabase) {
      const { data, error } = await sb.from("conversations").insert({ title }).select().single();
      if (error) throw error; return data;
    }
    const d = localRead();
    const c = { id: "c_" + Date.now(), title, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    d.convos.unshift(c); d.msgs[c.id] = []; localWrite(d); return c;
  }
  async function dbUpdateConvo(id, patch) {
    if (useSupabase) { await sb.from("conversations").update(patch).eq("id", id); }
    else { const d = localRead(); const c = d.convos.find((x) => x.id === id); if (c) Object.assign(c, patch); localWrite(d); }
  }
  async function dbDeleteConvo(id) {
    if (useSupabase) { await sb.from("conversations").delete().eq("id", id); }
    else { const d = localRead(); d.convos = d.convos.filter((x) => x.id !== id); delete d.msgs[id]; localWrite(d); }
  }
  async function dbListMsgs(convoId) {
    if (useSupabase) {
      const { data, error } = await sb.from("messages").select("*").eq("conversation_id", convoId).order("created_at", { ascending: true });
      if (error) throw error; return data;
    }
    return localRead().msgs[convoId] || [];
  }
  async function dbAddMsg(convoId, role, content) {
    if (useSupabase) {
      const { error } = await sb.from("messages").insert({ conversation_id: convoId, role, content });
      if (error) throw error;
      await sb.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);
    } else {
      const d = localRead();
      (d.msgs[convoId] = d.msgs[convoId] || []).push({ id: "m_" + Date.now() + Math.random().toString(16).slice(2), conversation_id: convoId, role, content, created_at: new Date().toISOString() });
      const c = d.convos.find((x) => x.id === convoId); if (c) c.updated_at = new Date().toISOString();
      localWrite(d);
    }
  }

  /* ---------- history UI ---------- */
  function groupLabel(iso) {
    const d = new Date(iso), now = new Date();
    const days = Math.floor((now - d) / 864e5);
    if (days <= 0) return "Hoje";
    if (days === 1) return "Ontem";
    if (days < 7) return "Últimos 7 dias";
    if (days < 30) return "Últimos 30 dias";
    return "Anteriores";
  }
  function renderHistory(filter = "") {
    const f = filter.trim().toLowerCase();
    const list = convos.filter((c) => c.title.toLowerCase().includes(f));
    historyList.innerHTML = "";
    if (!list.length) {
      historyList.innerHTML = `<div class="hist-empty">Nenhuma conversa${f ? " para esta busca" : " ainda"}.<br>Comece uma nova ao lado.</div>`;
      return;
    }
    let lastGroup = "";
    for (const c of list) {
      const g = groupLabel(c.updated_at || c.created_at);
      if (g !== lastGroup) {
        lastGroup = g;
        const h = document.createElement("div");
        h.className = "hist-group"; h.textContent = g;
        historyList.appendChild(h);
      }
      const b = document.createElement("button");
      b.className = "hist-item" + (c.id === currentId ? " active" : "");
      b.innerHTML = `<span class="t"></span><span class="x" title="Excluir">✕</span>`;
      b.querySelector(".t").textContent = c.title || "Sem título";
      b.title = c.title;
      b.onclick = (e) => { if (e.target.classList.contains("x")) return; openConvo(c.id); if (window.innerWidth <= 900) setNav(false); };
      b.querySelector(".x").onclick = async (e) => {
        e.stopPropagation();
        if (!confirm("Excluir esta conversa?")) return;
        await dbDeleteConvo(c.id);
        convos = convos.filter((x) => x.id !== c.id);
        if (currentId === c.id) newChat();
        renderHistory($("searchInput").value);
        toast("Conversa excluída");
      };
      historyList.appendChild(b);
    }
  }
  $("searchInput").oninput = (e) => renderHistory(e.target.value);

  /* ---------- thread UI ---------- */
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  // Renderizador markdown próprio (fallback quando o CDN marked falha/offline)
  function mdLite(text) {
    const fences = [];
    let src = esc(text).replace(/```(\w*)\n([\s\S]*?)(```|$)/g, (m, lang, code) => {
      fences.push('<pre><code class="lang-' + lang + '">' + code.replace(/\n$/, "") + "</code></pre>");
      return "\u0000" + (fences.length - 1) + "\u0000";
    });
    const inline = (s) => s
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\W)\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const lines = src.split("\n"), out = [];
    let list = null;
    const closeList = () => { if (list) { out.push(list === "ul" ? "</ul>" : "</ol>"); list = null; } };
    for (let ln of lines) {
      const fence = ln.match(/^\u0000(\d+)\u0000$/);
      if (fence) { closeList(); out.push(fences[+fence[1]]); continue; }
      let m;
      if ((m = ln.match(/^(#{1,4})\s+(.*)/))) { closeList(); const lv = m[1].length; out.push(`<h${lv + 2}>${inline(m[2])}</h${lv + 2}>`); }
      else if ((m = ln.match(/^&gt;\s?(.*)/))) { closeList(); out.push("<blockquote>" + inline(m[1]) + "</blockquote>"); }
      else if (/^---+$/.test(ln.trim())) { closeList(); out.push("<hr>"); }
      else if ((m = ln.match(/^(\s*)[-*•]\s+(.*)/))) { if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push("<li>" + inline(m[2]) + "</li>"); }
      else if ((m = ln.match(/^(\s*)\d+[.)]\s+(.*)/))) { if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push("<li>" + inline(m[2]) + "</li>"); }
      else if (ln.trim() === "") { closeList(); }
      else { closeList(); out.push("<p>" + inline(ln) + "</p>"); }
    }
    closeList();
    return out.join("\n");
  }
  function md(text) {
    // Protege matemática (delimitadores LaTeX) antes do markdown,
    // senão o parser come as barras de \[ \] \( \).
    const maths = [];
    const guarded = String(text).replace(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g, (m) => {
      maths.push(m); return "\uE000" + (maths.length - 1) + "\uE000";
    });
    let html;
    try {
      html = window.marked ? marked.parse(guarded, { breaks: true }) : mdLite(guarded);
    } catch { html = null; }
    try {
      if (!html) html = mdLite(guarded);
      html = html.replace(/\uE000(\d+)\uE000/g, (m, i) => esc(maths[+i]));
      if (window.marked && window.DOMPurify) html = DOMPurify.sanitize(html);
      return html;
    } catch { try { return mdLite(text); } catch { return "<p>" + esc(text) + "</p>"; } }
  }

  /* ---------- matemática (KaTeX + fallback) ---------- */
  const MATH_SEG = /(\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$\$[\s\S]+?\$\$)/g;
  function prettyLatex(s) {
    let t = s;
    // 1) sub/sup primeiro (remove chaves internas p/ as regras seguintes)
    t = t.replace(/\^\{([^{}]*)\}/g, "<sup>$1</sup>").replace(/_\{([^{}]*)\}/g, "<sub>$1</sub>");
    t = t.replace(/\\boxed\{([^{}]*)\}/g, "$1");
    t = t.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
    t = t.replace(/\\text\{([^{}]*)\}/g, "$1");
    for (let k = 0; k < 3; k++) t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
    const cmd = { pm: "±", cdot: "·", times: "×", div: "÷", neq: "≠", leq: "≤", geq: "≥", approx: "≈", infty: "∞", sum: "Σ", int: "∫", Delta: "Δ", delta: "δ", alpha: "α", beta: "β", gamma: "γ", theta: "θ", lambda: "λ", mu: "μ", pi: "π", sigma: "σ", phi: "φ", sqrt: "√", to: "→" };
    t = t.replace(/\\(pm|cdot|times|div|neq|leq|geq|approx|infty|sum|int|Delta|delta|alpha|beta|gamma|theta|lambda|mu|pi|sigma|phi|sqrt|to)\b/g, (m, c) => cmd[c]);
    t = t.replace(/\\(left|right|big|bigg|quad|qquad|,|;|:|!)\b/g, " ").replace(/\\[,;:!]/g, " ");
    t = t.replace(/\\\\/g, " ");
    t = t.replace(/\\([a-zA-Z]+)/g, "$1");
    t = t.replace(/[{}]/g, "");
    return t.trim();
  }
  function prettifyMathFallback(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeValue.indexOf("\\") < 0 && n.nodeValue.indexOf("$$") < 0) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (p && /^(PRE|CODE|SCRIPT|STYLE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
        MATH_SEG.lastIndex = 0;
        return MATH_SEG.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const frag = document.createDocumentFragment();
      let last = 0; MATH_SEG.lastIndex = 0;
      const txt = n.nodeValue;
      let m;
      while ((m = MATH_SEG.exec(txt))) {
        if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
        const raw = m[0], disp = raw.startsWith("\\[") || raw.startsWith("$$");
        const inner = raw.replace(/^(\$\$|\\\[|\\\()/, "").replace(/(\$\$|\\\]|\\\))$/, "");
        const s = document.createElement("span");
        s.className = "math-fb" + (disp ? "" : " inline");
        s.innerHTML = prettyLatex(esc(inner));
        frag.appendChild(s);
        last = m.index + raw.length;
      }
      if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
      n.parentNode.replaceChild(frag, n);
    }
  }
  function renderMath(el) {
    try {
      if (window.renderMathInElement) {
        renderMathInElement(el, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
          ],
          throwOnError: false,
        });
      } else prettifyMathFallback(el);
    } catch { try { prettifyMathFallback(el); } catch {} }
  }
  function scrollBottom() { requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; }); }
  function setWelcomeVisible() { welcome.style.display = messages.length ? "none" : ""; }

  function addMsg(role, content, animate = true) {
    const el = document.createElement("div");
    el.className = "msg " + role;
    el.style.animation = animate ? "" : "none";
    el.innerHTML = `
      <div class="avatar">${role === "user" ? "V" : "M"}</div>
      <div class="bubble"><div class="who">${role === "user" ? "Você" : "Meridian"}</div>
      <div class="body"></div>
      <div class="msg-actions"><button class="mini-btn copy">Copiar</button></div></div>`;
    const bd = el.querySelector(".body");
    bd.innerHTML = md(content);
    if (content) renderMath(bd);
    el.querySelector(".copy").onclick = async () => {
      await navigator.clipboard.writeText(content).catch(() => {});
      toast("Copiado");
    };
    thread.appendChild(el);
    scrollBottom();
    return el;
  }

  function typingEl() {
    const el = document.createElement("div");
    el.className = "msg assistant"; el.id = "typingRow";
    el.innerHTML = `<div class="avatar">M</div><div class="bubble"><div class="who">Meridian</div><div class="typing"><span></span><span></span><span></span></div></div>`;
    thread.appendChild(el); scrollBottom();
    return el;
  }

  // Efeito "digitação" sofisticado: revela o texto progressivamente
  async function typewriterReveal(bodyEl, fullText, signal) {
    const step = Math.max(2, Math.round(fullText.length / 160));
    let i = 0;
    bodyEl.innerHTML = md("") + '<span class="stream-caret"></span>';
    while (i < fullText.length) {
      if (signal && signal.aborted) throw new DOMException("aborted", "AbortError");
      i = Math.min(fullText.length, i + step);
      bodyEl.innerHTML = md(fullText.slice(0, i)) + (i < fullText.length ? '<span class="stream-caret"></span>' : "");
      if (i % (step * 4) === 0) scrollBottom();
      await new Promise((r) => setTimeout(r, 12));
    }
    scrollBottom();
  }

  /* ---------- Groq via Cloudflare ---------- */
  const SYSTEM = "Você é o Meridian, um assistente editorial e objetivo. Responda em português brasileiro, com tom profissional e minimalista. Evite clichês de IA ('como modelo de linguagem', emojis excessivos, listas genéricas). Seja direto, útil e elegante. Use markdown quando ajudar na leitura. Para matemática, use LaTeX: \\(...\\) para fórmulas no meio do texto e \\[...\\] para fórmulas em destaque, uma por bloco.";
  async function complete(history, signal) {
    const payload = {
      model: cfg.model || "openai/gpt-oss-120b",
      temperature: Number(cfg.temperature ?? 0.7),
      messages: [{ role: "system", content: SYSTEM }, ...history.slice(-20)],
    };
    // 1) tenta o proxy seguro do Cloudflare (/api/chat)
    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal,
      });
      if (r.ok) {
        const j = await r.json();
        const txt = j.choices?.[0]?.message?.content || j.reply || j.text;
        if (txt) return { text: txt, via: "cloudflare" };
      }
      // se 404 (fora do Pages) cai para direto
      if (r.status !== 404) {
        const t = await r.text().catch(() => "");
        throw new Error("Proxy /api/chat: " + r.status + " " + t.slice(0, 200));
      }
    } catch (e) {
      if (e.name === "AbortError") throw e;
      if (cfg.groqKey) { /* tenta direto abaixo */ }
      else if (location.protocol === "file:") throw new Error("Você abriu o arquivo local. A IA só funciona no site publicado: https://meridian-chat.pages.dev");
      else if (e instanceof TypeError) throw new Error("Sem conexão com o servidor. Verifique sua internet e recarregue a página.");
      else throw new Error("Groq indisponível: configure GROQ_API_KEY no Cloudflare Pages ou preencha groqKey no config.js para teste local.");
    }
    // 2) fallback local direto ao Groq
    if (!cfg.groqKey) throw new Error("Sem chave Groq (groqKey no config.js) para teste local.");
    let r2;
    try {
      r2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.groqKey },
        body: JSON.stringify(payload), signal,
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      throw new Error("Sem conexão com o Groq. Verifique sua internet e tente de novo.");
    }
    if (!r2.ok) throw new Error("Groq " + r2.status + ": " + (await r2.text()).slice(0, 300));
    const j2 = await r2.json();
    return { text: j2.choices?.[0]?.message?.content || "(sem resposta)", via: "groq-direto" };
  }

  /* ---------- fluxo ---------- */
  async function refresh() {
    initSupabase();
    modelBadge.textContent = (cfg.model || "").replace("openai/", "");
    try { convos = await dbListConvos(); }
    catch (e) { console.warn(e); toast("Supabase inacessível — usando modo local"); setDbStatus(false); useSupabase = false; sb = null; convos = localRead().convos; }
    renderHistory($("searchInput").value);
  }

  function newChat() {
    currentId = null; messages = []; thread.innerHTML = "";
    convoTitle.textContent = "Nova conversa";
    $("storeHint").textContent = "Salvando nesta conversa";
    setWelcomeVisible();
  }
  $("newChatBtn").onclick = newChat;

  async function openConvo(id) {
    currentId = id; thread.innerHTML = "";
    const c = convos.find((x) => x.id === id);
    convoTitle.textContent = c ? c.title : "Conversa";
    try { messages = (await dbListMsgs(id)).map((m) => ({ role: m.role, content: m.content })); }
    catch (e) { toast("Falha ao carregar mensagens"); messages = []; }
    for (const m of messages) addMsg(m.role, m.content, false);
    $("storeHint").textContent = useSupabase ? "Salvo no Supabase" : "Salvo localmente";
    setWelcomeVisible(); renderHistory($("searchInput").value); scrollBottom();
  }

  async function send(text) {
    text = (text || "").trim();
    if (!text || sending) return;
    sending = true; sendBtn.disabled = true; stopBtn.hidden = false;
    aborter = new AbortController();

    try {
      if (!currentId) {
        const title = text.length > 46 ? text.slice(0, 46) + "…" : text;
        const c = await dbCreateConvo(title);
        currentId = c.id; convos.unshift(c);
        convoTitle.textContent = c.title;
        renderHistory($("searchInput").value);
      }
      messages.push({ role: "user", content: text });
      addMsg("user", text);
      setWelcomeVisible();
      await dbAddMsg(currentId, "user", text);
      await dbUpdateConvo(currentId, { updated_at: new Date().toISOString() });

      input.value = ""; autogrow();
      const t0 = performance.now();
      const row = typingEl();
      const { text: reply } = await complete(messages, aborter.signal);
      row.remove();

      messages.push({ role: "assistant", content: reply });
      const el = addMsg("assistant", "");
      const body = el.querySelector(".body");
      try { await typewriterReveal(body, reply, aborter.signal); }
      catch { body.innerHTML = md(reply); } // interrompido: mostra parcial/final
      renderMath(body);
      el.querySelector(".copy").onclick = async () => { await navigator.clipboard.writeText(reply).catch(() => {}); toast("Copiado"); };
      await dbAddMsg(currentId, "assistant", reply);
      await dbUpdateConvo(currentId, { updated_at: new Date().toISOString() });

      const dt = ((performance.now() - t0) / 1000).toFixed(1);
      latencyEl.textContent = dt + "s";
      convos = await dbListConvos().catch(() => convos);
      renderHistory($("searchInput").value);
    } catch (e) {
      document.getElementById("typingRow")?.remove();
      if (e.name === "AbortError") toast("Resposta interrompida");
      else { console.error(e); addMsg("assistant", "⚠️ " + (e.message || "Falha ao gerar resposta.")); toast("Erro — verifique o config.js"); }
    } finally {
      sending = false; sendBtn.disabled = false; stopBtn.hidden = true; aborter = null;
    }
  }

  stopBtn.onclick = () => aborter?.abort();
  sendBtn.onclick = () => send(input.value);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  function autogrow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 180) + "px"; }
  input.addEventListener("input", autogrow); autogrow();

  document.querySelectorAll(".sugg").forEach((b) =>
    b.addEventListener("click", () => { send(b.dataset.prompt); }));

  $("exportBtn").onclick = () => {
    if (!messages.length) return toast("Nada para exportar");
    const mdDoc = "# " + convoTitle.textContent + "\n\n" +
      messages.map((m) => (m.role === "user" ? "## Você\n" : "## Meridian\n") + m.content + "\n").join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([mdDoc], { type: "text/markdown" }));
    a.download = "conversa.md"; a.click();
  };
  $("deleteBtn").onclick = async () => {
    if (!currentId) return newChat();
    if (!confirm("Excluir esta conversa?")) return;
    await dbDeleteConvo(currentId);
    convos = convos.filter((x) => x.id !== currentId);
    newChat(); renderHistory($("searchInput").value); toast("Conversa excluída");
  };

  refresh().then(newChat);
})();
