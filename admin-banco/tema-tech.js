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


  /* ---------- 8. gráficos: tema global do Chart.js (vale para todas as telas) ---------- */
  (function graficos() {
    if (!window.Chart) return;
    const PAL = ['#5FB4FF', '#2DD4BF', '#F5B544', '#9B8CFF', '#F0625D', '#F472B6', '#8FCBFF', '#34D399', '#FBBF24', '#C4B5FD'];
    const D = Chart.defaults;
    D.color = '#98A4BA'; D.font.family = "'Plus Jakarta Sans', system-ui, sans-serif"; D.font.size = 11;
    D.plugins.legend.labels.boxWidth = 8; D.plugins.legend.labels.boxHeight = 8; D.plugins.legend.labels.usePointStyle = true; D.plugins.legend.labels.pointStyle = 'circle';
    D.plugins.tooltip.backgroundColor = '#111A2E'; D.plugins.tooltip.borderColor = 'rgba(148,163,184,.26)'; D.plugins.tooltip.borderWidth = 1;
    D.plugins.tooltip.titleColor = '#E8EDF6'; D.plugins.tooltip.bodyColor = '#98A4BA'; D.plugins.tooltip.padding = 10; D.plugins.tooltip.cornerRadius = 8;
    D.scale.grid.color = 'rgba(148,163,184,.08)'; D.scale.grid.drawTicks = false; D.scale.border = D.scale.border || {}; D.scale.border.display = false;
    D.elements.line.tension = 0.38; D.elements.line.borderWidth = 2; D.elements.point.radius = 0; D.elements.point.hoverRadius = 5; D.elements.point.hitRadius = 12;
    D.elements.bar.borderRadius = 6; D.elements.bar.borderSkipped = false;
    D.animation.duration = 900; D.animation.easing = 'easeOutQuart';
    const hex2rgba = (h, a) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(h); return m ? `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})` : h; };
    const mapCor = c => {
      const k = String(c || '').toLowerCase();
      if (/4f46e5|4338ca|6366f1|7c3aed|8b5cf6|c7d2fe|a5b4fc/.test(k)) return PAL[0];
      if (/10b981|059669|22c55e|16a34a|86efac|bbf7d0/.test(k)) return PAL[1];
      if (/f59e0b|d97706|eab308|fbbf24|fed7aa/.test(k)) return PAL[2];
      if (/ef4444|dc2626|f87171|fecaca/.test(k)) return PAL[4];
      if (/0ea5e9|3b82f6|0891b2|38bdf8/.test(k)) return PAL[6];
      if (/ec4899|db2777/.test(k)) return PAL[5];
      if (/94a3b8|cbd5e1|e2e8f0|64748b|475569/.test(k)) return 'rgba(148,163,184,.55)';
      return c;
    };
    Chart.register({
      id: 'temaTech',
      beforeInit(chart) {
        const type = chart.config.type;
        (chart.config.data.datasets || []).forEach((ds, i) => {
          const isLine = (ds.type || type) === 'line';
          const isPie = /doughnut|pie|polarArea/.test(ds.type || type);
          if (Array.isArray(ds.backgroundColor)) ds.backgroundColor = ds.backgroundColor.map((c, j) => mapCor(c) === c ? PAL[j % PAL.length] : mapCor(c));
          else if (!isLine) { const base = mapCor(ds.backgroundColor || ds.borderColor) ; ds.backgroundColor = (base && base !== ds.backgroundColor) ? base : (ds.backgroundColor || PAL[i % PAL.length]); }
          if (typeof ds.borderColor === 'string' || !ds.borderColor) ds.borderColor = mapCor(ds.borderColor) || PAL[i % PAL.length];
          if (isLine) {
            const cor = typeof ds.borderColor === 'string' ? ds.borderColor : PAL[i % PAL.length];
            ds.borderColor = cor; ds.pointBackgroundColor = cor; ds.pointBorderColor = '#070B16'; ds.pointBorderWidth = 2;
            if (ds.borderDash && ds.borderDash.length) { ds.borderWidth = 1.5; ds.borderColor = hex2rgba(cor, .7); ds.fill = false; }
            else if (ds.fill === undefined || ds.fill === true || ds.fill === 'origin') {
              ds.fill = true;
              ds.backgroundColor = ctx => {
                const { chart: ch } = ctx; const area = ch.chartArea; if (!area) return hex2rgba(cor, .12);
                const g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                g.addColorStop(0, hex2rgba(cor, .28)); g.addColorStop(1, hex2rgba(cor, 0)); return g;
              };
            } else ds.backgroundColor = hex2rgba(cor, .15);
          }
          if (isPie) { ds.borderWidth = 0; ds.spacing = 3; ds.hoverOffset = 8; ds.borderRadius = 6; }
        });
        if (/doughnut/.test(type)) { chart.options.cutout = chart.options.cutout || '74%'; }
        const sc = chart.options.scales || {};
        Object.values(sc).forEach(ax => { ax.grid = Object.assign({ color: 'rgba(148,163,184,.08)', drawTicks: false }, ax.grid || {}); ax.ticks = Object.assign({ color: '#5E6A82', font: { size: 11 } }, ax.ticks || {}); ax.border = Object.assign({ display: false }, ax.border || {}); });
      }
    });
  })();

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
