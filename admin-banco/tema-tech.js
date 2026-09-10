/* =====================================================================
   tema-tech.js — camada de animação da pele "tech".
   Não toca no Firebase nem nas funções do sistema: só observa os
   elementos que o sistema já preenche e anima o que está na tela.
   ===================================================================== */
(function () {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);

  /* ---------- 1. fundo vivo: malha de pontos que reage ao mouse ---------- */
  (function fundo() {
    const c = document.createElement('canvas');
    c.id = 'ttBg'; c.setAttribute('aria-hidden', 'true');
    document.body.prepend(c);
    const ctx = c.getContext('2d');
    let W, H, pts = [], mouse = { x: -9999, y: -9999 }, t = 0;
    function resize() {
      W = c.width = innerWidth; H = c.height = innerHeight;
      pts = [];
      const gap = W < 700 ? 34 : 30;
      for (let y = 0; y < H + gap; y += gap) for (let x = 0; x < W + gap; x += gap)
        pts.push({ x, y, ox: x, oy: y, p: Math.random() * Math.PI * 2 });
    }
    addEventListener('resize', resize); resize();
    addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
    addEventListener('mouseleave', () => { mouse.x = mouse.y = -9999; });
    function frame() {
      t += 0.012;
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        const dx = p.ox - mouse.x, dy = p.oy - mouse.y, d = Math.hypot(dx, dy);
        const push = d < 160 ? (160 - d) / 160 : 0;
        const wob = Math.sin(t + p.p) * 1.6;
        p.x = p.ox + (dx / (d || 1)) * push * 14 + wob;
        p.y = p.oy + (dy / (d || 1)) * push * 14 + Math.cos(t + p.p) * 1.6;
        const a = 0.10 + push * 0.55 + (Math.sin(t * 0.7 + p.p) + 1) * 0.03;
        ctx.fillStyle = push > 0 ? `rgba(95,180,255,${a})` : `rgba(148,163,184,${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1 + push * 1.4, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduce) requestAnimationFrame(frame);
    }
    frame();
  })();

  /* ---------- 2. globo de pontos no hero (3D projetado, sem biblioteca) ---------- */
  (function globo() {
    const c = $('ttGlobe'); if (!c) return;
    const ctx = c.getContext('2d'), N = 420, R = 118, cx = c.width / 2, cy = c.height / 2;
    const pts = [];
    for (let i = 0; i < N; i++) {           // distribuição uniforme (fibonacci)
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, hot: Math.random() < 0.06 });
    }
    let a = 0;
    function frame() {
      a += 0.0035;
      ctx.clearRect(0, 0, c.width, c.height);
      const tilt = 0.35, sa = Math.sin(a), ca = Math.cos(a), st = Math.sin(tilt), ct = Math.cos(tilt);
      const proj = pts.map(p => {
        const x1 = p.x * ca - p.z * sa, z1 = p.x * sa + p.z * ca;
        const y2 = p.y * ct - z1 * st, z2 = p.y * st + z1 * ct;
        return { X: cx + x1 * R, Y: cy + y2 * R, z: z2, hot: p.hot };
      }).sort((m, n) => m.z - n.z);
      ctx.strokeStyle = 'rgba(95,180,255,.10)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R + 14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy, R + 34, (R + 34) * 0.32, 0.3, 0, Math.PI * 2); ctx.stroke();
      for (const q of proj) {
        const k = (q.z + 1) / 2;                          // 0 atrás, 1 na frente
        if (q.hot) { ctx.fillStyle = `rgba(95,180,255,${0.35 + k * 0.65})`; ctx.beginPath(); ctx.arc(q.X, q.Y, 1.6 + k * 1.8, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = `rgba(200,215,235,${0.08 + k * 0.5})`; ctx.beginPath(); ctx.arc(q.X, q.Y, 0.7 + k * 1.1, 0, Math.PI * 2); ctx.fill(); }
      }
      if (!reduce) requestAnimationFrame(frame);
    }
    frame();
  })();

  /* ---------- 3. valores: parse do formato do sistema e contagem animada ---------- */
  function parseBR(s) {                                   // "R$ 3,57M" | "R$ 668,4K" | "R$ 1.234,56"
    if (!s) return 0;
    const m = String(s).replace(/\s/g, '').match(/-?[\d.]+(?:,\d+)?([KM])?/i);
    if (!m) return 0;
    let n = parseFloat(m[0].replace(/[KM]/i, '').replace(/\./g, '').replace(',', '.'));
    if (/M/i.test(m[1] || '')) n *= 1e6; else if (/K/i.test(m[1] || '')) n *= 1e3;
    return isNaN(n) ? 0 : n;
  }
  function fmtCompacto(n) {
    if (n >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + 'M';
    if (n >= 1e4) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'K';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const cur = {};                                          // valor atual de cada contador (para animar do anterior)
  function contar(el, alvoTxt) {
    if (!el) return;
    const alvo = parseBR(alvoTxt), de = cur[el.id] || 0;
    if (reduce || alvo === de) { el.textContent = alvoTxt; cur[el.id] = alvo; return; }
    const t0 = performance.now(), dur = 1100;
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = p < 1 ? fmtCompacto(de + (alvo - de) * e) : alvoTxt;
      if (p < 1) requestAnimationFrame(step); else cur[el.id] = alvo;
    })(t0);
  }

  /* ---------- 4. pipeline em fluxo: espelha os 3 cards originais ---------- */
  function pipeline() {
    const a = parseBR($('pipeAberto')?.textContent), b = parseBR($('pipeQuente')?.textContent), c = parseBR($('pipeFechado')?.textContent);
    const tot = a + b + c || 1;
    contar($('ttA'), $('pipeAberto')?.textContent); contar($('ttB'), $('pipeQuente')?.textContent); contar($('ttC'), $('pipeFechado')?.textContent);
    contar($('ttTotal'), fmtCompacto(a + b + c));
    $('ttASub').textContent = $('pipeAbertoSub')?.textContent || ''; $('ttBSub').textContent = $('pipeQuenteSub')?.textContent || ''; $('ttCSub').textContent = $('pipeFechadoSub')?.textContent || '';
    const pond = ($('pipeAbertoSub')?.textContent || '').match(/R\$\s*[\d.,]+[KM]?\s*ponderado/i);
    $('ttPond').textContent = pond ? pond[0] : '';
    requestAnimationFrame(() => {
      $('ttSegA').style.width = (a / tot * 100) + '%'; $('ttSegB').style.width = (b / tot * 100) + '%'; $('ttSegC').style.width = (c / tot * 100) + '%';
    });
    marcar();
  }

  /* ---------- 5. anel da meta: lê a largura que o sistema escreve na barra ---------- */
  function meta() {
    const bar = $('termometroBar'), ring = $('ttRing'), txt = $('ttRingPct'); if (!bar || !ring) return;
    const pct = Math.max(0, Math.min(100, parseFloat(bar.style.width) || 0));
    ring.style.strokeDashoffset = 314 - 314 * pct / 100;
    txt.textContent = Math.round(pct) + '%';
    ring.style.stroke = pct >= 100 ? 'var(--teal)' : 'var(--sky)';
  }

  /* ---------- 6. feed e fila: entrada escalonada quando o sistema renderiza ---------- */
  function escalonar(container) {
    if (!container || reduce) return;
    Array.from(container.children).forEach((el, i) => {
      el.classList.add('tt-in'); el.style.animationDelay = (i * 70) + 'ms';
    });
  }

  /* ---------- 7. "ao vivo": tempo desde a última atualização ---------- */
  let ultimo = Date.now();
  function marcar() { ultimo = Date.now(); }
  setInterval(() => {
    const el = $('ttSince'); if (!el) return;
    const s = Math.round((Date.now() - ultimo) / 1000);
    el.textContent = s < 5 ? 'agora' : s < 60 ? `há ${s}s` : `há ${Math.round(s / 60)} min`;
  }, 1000);

  /* ---------- observadores ---------- */
  function observar() {
    const mo = new MutationObserver(muts => {
      let pipe = false, met = false;
      for (const m of muts) {
        const id = m.target.id || m.target.parentElement?.id || '';
        if (/^pipe/.test(id)) pipe = true;
        if (id === 'termometroBar') met = true;
        if (id === 'feedConquistas' || id === 'filaAcao' || id === 'homeFunilLista') escalonar(m.target);
      }
      if (pipe) pipeline(); if (met) meta();
    });
    ['pipeAberto', 'pipeAbertoSub', 'pipeQuente', 'pipeQuenteSub', 'pipeFechado', 'pipeFechadoSub'].forEach(id => { const el = $(id); el && mo.observe(el, { childList: true, characterData: true, subtree: true }); });
    const bar = $('termometroBar'); bar && mo.observe(bar, { attributes: true, attributeFilter: ['style'] });
    ['feedConquistas', 'filaAcao', 'homeFunilLista'].forEach(id => { const el = $(id); el && mo.observe(el, { childList: true }); });
    pipeline(); meta();
    if (window.lucide) lucide.createIcons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observar); else observar();
})();
