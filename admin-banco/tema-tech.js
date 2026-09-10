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


  /* ---------- 9. normalizador de cores inline (cobre o que o JS escreve em tempo de execução,
     inclusive hover que grava 'white'/'#f8fafc' e valores que o navegador serializa como rgb()) ---------- */
  (function normalizador() {
    const toHex = v => {
      v = String(v || '').trim().toLowerCase();
      const m = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) return '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
      if (v === 'white') return '#ffffff';
      const h = v.match(/^#([\da-f]{3}|[\da-f]{6})$/); if (!h) return null;
      return h[1].length === 3 ? '#' + h[1].split('').map(c => c + c).join('') : '#' + h[1];
    };
    const BG = {
      '#ffffff': 'var(--bg-2)', '#f8fafc': 'var(--bg-3)', '#f1f5f9': 'var(--bg-3)', '#fafbfc': 'var(--bg-2)', '#f9fafb': 'var(--bg-2)', '#e2e8f0': 'var(--bg-3)', '#f3f4f6': 'var(--bg-3)',
      '#eef2ff': 'rgba(95,180,255,.10)', '#e0e7ff': 'rgba(95,180,255,.14)', '#eff6ff': 'rgba(95,180,255,.10)', '#dbeafe': 'rgba(95,180,255,.14)', '#f5f3ff': 'rgba(155,140,255,.12)', '#ede9fe': 'rgba(155,140,255,.14)', '#ecfeff': 'rgba(45,212,191,.09)',
      '#f0fdf4': 'rgba(45,212,191,.09)', '#dcfce7': 'rgba(45,212,191,.13)', '#d1fae5': 'rgba(45,212,191,.13)', '#f0fdfa': 'rgba(45,212,191,.09)',
      '#fef2f2': 'rgba(240,98,93,.10)', '#fee2e2': 'rgba(240,98,93,.14)',
      '#fff7ed': 'rgba(245,181,68,.09)', '#fffbeb': 'rgba(245,181,68,.09)', '#fef3c7': 'rgba(245,181,68,.13)', '#fef9c3': 'rgba(245,181,68,.13)', '#fde68a': 'rgba(245,181,68,.2)',
      '#0f172a': '#5FB4FF', '#1e293b': 'var(--bg-3)', '#4f46e5': '#3E6FC4', '#6366f1': '#3E6FC4', '#4338ca': '#3E6FC4', '#c7d2fe': 'rgba(95,180,255,.25)'
    };
    const FG = {
      '#0f172a': 'var(--ink)', '#1e293b': 'var(--ink)', '#111827': 'var(--ink)', '#334155': 'var(--ink)', '#1f2937': 'var(--ink)',
      '#475569': 'var(--ink-2)', '#64748b': 'var(--ink-2)', '#4b5563': 'var(--ink-2)', '#374151': 'var(--ink-2)',
      '#94a3b8': 'var(--ink-3)', '#cbd5e1': 'var(--ink-3)', '#9ca3af': 'var(--ink-3)',
      '#4338ca': '#8FCBFF', '#4f46e5': '#8FCBFF', '#3730a3': '#8FCBFF', '#1e40af': '#8FCBFF', '#0369a1': '#8FCBFF', '#312e81': '#8FCBFF',
      '#166534': '#5EE0C7', '#15803d': '#5EE0C7', '#065f46': '#5EE0C7', '#047857': '#5EE0C7',
      '#991b1b': '#FF8A86', '#b91c1c': '#FF8A86', '#7f1d1d': '#FF8A86',
      '#92400e': '#FFCB6B', '#b45309': '#FFCB6B', '#c2410c': '#FFCB6B', '#78350f': '#FFCB6B', '#9a3412': '#FFCB6B'
    };
    const BD = { '#e2e8f0': 'var(--line)', '#cbd5e1': 'var(--line-2)', '#f1f5f9': 'var(--line)', '#c7d2fe': 'rgba(95,180,255,.30)', '#bbf7d0': 'rgba(45,212,191,.30)', '#fecaca': 'rgba(240,98,93,.32)', '#fed7aa': 'rgba(245,181,68,.30)', '#e0e7ff': 'rgba(95,180,255,.25)' };
    function fix(el) {
      if (!el || el.nodeType !== 1 || !el.style || el.closest && el.closest('#ttBg')) return;
      const st = el.style;
      const bg = toHex(st.backgroundColor); if (bg && BG[bg]) { st.setProperty('background', BG[bg], 'important'); }
      else if (st.background && /white|#f|rgb\(2[45]\d/.test(st.background) && !st.backgroundImage) { const b2 = toHex(st.background.split(' ')[0]); if (b2 && BG[b2]) st.setProperty('background', BG[b2], 'important'); }
      const fg = toHex(st.color); if (fg && FG[fg]) st.setProperty('color', FG[fg], 'important');
      const bc = toHex(st.borderColor || st.borderLeftColor || st.borderBottomColor); if (bc && BD[bc]) st.setProperty('border-color', BD[bc], 'important');
    }
    function varrer(root) { if (root.nodeType !== 1) return; fix(root); root.querySelectorAll('[style]').forEach(fix); }
    let fila = new Set(), agendado = false;
    function agendar(el) { fila.add(el); if (agendado) return; agendado = true; requestAnimationFrame(() => { fila.forEach(varrer); fila.clear(); agendado = false; }); }
    const mo = new MutationObserver(ms => { for (const m of ms) { if (m.type === 'attributes') agendar(m.target); else m.addedNodes.forEach(n => n.nodeType === 1 && agendar(n)); } });
    function start() { varrer(document.body); mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] }); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  })();


  /* ---------- 10. COCKPIT: seis medidores calculados dos dados que o sistema já carregou ---------- */
  (function cockpit() {
    const root = () => $('ttCockpit');
    const q = (k, f) => root()?.querySelector(`.tt-gauge[data-k="${k}"] [data-f="${f}"]`);
    const g = k => root()?.querySelector(`.tt-gauge[data-k="${k}"]`);
    const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
    const dias = d => Math.floor((Date.now() - d) / 864e5);
    const toDate = v => { if (!v) return null; if (v.toDate) return v.toDate(); if (v.seconds) return new Date(v.seconds * 1000); const d = new Date(v); return isNaN(d) ? null : d; };
    const hoje = new Date(), anoIni = new Date(hoje.getFullYear(), 0, 1);

    function anel(k, valor, cor) {
      const el = g(k); if (!el) return;
      const c = el.querySelector('circle.va'), t = el.querySelector('text.pc');
      const p = Math.max(0, Math.min(100, valor || 0));
      c.style.strokeDashoffset = 264 - 264 * p / 100;
      c.style.stroke = cor || (p >= 70 ? 'var(--teal)' : p >= 40 ? 'var(--sky)' : 'var(--amber)');
      el.dataset.nivel = p >= 70 ? 'ok' : p >= 40 ? 'meio' : 'baixo';
      if (reduce) { t.textContent = p + '%'; return; }
      const t0 = performance.now(), de = parseInt(t.textContent) || 0;
      (function step(now) { const r = Math.min(1, (now - t0) / 1100), e = 1 - Math.pow(1 - r, 3); t.textContent = Math.round(de + (p - de) * e) + '%'; if (r < 1) requestAnimationFrame(step); })(t0);
    }
    function set(k, f, txt, cls) { const el = q(k, f); if (!el) return; el.textContent = txt || ''; if (cls !== undefined) el.className = (el.className.replace(/\b(urg|ok)\b/g, '').trim() + ' ' + cls).trim(); }
    function spark(k, serie, cor) {
      const c = q(k, 'spark'); if (!c || !serie || !serie.length) return;
      const ctx = c.getContext('2d'), W = c.width, H = c.height, max = Math.max(1, ...serie), n = serie.length;
      ctx.clearRect(0, 0, W, H);
      const X = i => 4 + i * (W - 8) / (n - 1), Y = v => H - 4 - (v / max) * (H - 10);
      const grad = ctx.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, cor.replace(')', ',.35)').replace('rgb', 'rgba')); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.moveTo(X(0), H); serie.forEach((v, i) => ctx.lineTo(X(i), Y(v))); ctx.lineTo(X(n - 1), H); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath(); serie.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))); ctx.strokeStyle = cor; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(X(n - 1), Y(serie[n - 1]), 2.4, 0, Math.PI * 2); ctx.fill();
    }
    function porMes(itens, campo) {                       // últimos 6 meses (contagem)
      const out = new Array(6).fill(0), base = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
      itens.forEach(it => { const d = toDate(it[campo]); if (!d || d < base) return; const i = (d.getFullYear() - base.getFullYear()) * 12 + d.getMonth() - base.getMonth(); if (i >= 0 && i < 6) out[i]++; });
      return out;
    }
    const SKY = 'rgb(95,180,255)', TEAL = 'rgb(45,212,191)', AMB = 'rgb(245,181,68)';

    async function calcular() {
      const T = window.__tt; if (!T || !root()) return;
      const emps = T.empresas || [], cots = T.cotacoes || [], ids = new Set(emps.map(e => e.id)), N = emps.length;

      /* 1. mapeamento */
      const mapeadas = emps.filter(e => Object.values(e.produtos || {}).some(v => v && v !== 'vazia')).length;
      const socios = emps.filter(e => (e.socios && e.socios.length) || e.semSociosConfirmado).length;
      const func = emps.filter(e => e.funcionarios > 0).length;
      anel('map', pct(mapeadas, N));
      set('map', 'big', `${mapeadas} de ${N}`);
      set('map', 'gap', N - mapeadas > 0 ? `faltam ${N - mapeadas} empresas para mapear` : 'carteira 100% mapeada');
      set('map', 's1', pct(socios, N) + '%'); set('map', 's2', pct(func, N) + '%');
      set('map', 'foot', N - socios > 0 ? `${N - socios} sem dados de sócios` : 'sócios completos');

      /* 2. cotações */
      const ativas = cots.filter(c => (T.statusAtivos || []).includes(c.status));
      const ult = ativas.map(c => toDate(c.atualizadoEm) || toDate(c.criadoEm) || toDate(c.dataSolicitacao)).filter(Boolean);
      const comMov = ativas.filter(c => { const d = toDate(c.atualizadoEm) || toDate(c.criadoEm) || toDate(c.dataSolicitacao); return d && dias(d) <= 14; }).length;
      const novas = cots.map(c => toDate(c.criadoEm) || toDate(c.dataSolicitacao)).filter(Boolean).sort((a, b) => b - a);
      const dSemNova = novas.length ? dias(novas[0]) : null;
      anel('cot', pct(comMov, ativas.length));
      set('cot', 'big', `${ativas.length} ativas`);
      set('cot', 'gap', ativas.length ? `${comMov} com movimento nos últimos 14 dias` : 'nenhuma cotação ativa');
      set('cot', 'alerta', dSemNova === null ? 'nenhuma cotação registrada' : dSemNova === 0 ? 'cotação nova hoje' : `sem cotação nova há ${dSemNova} dia${dSemNova > 1 ? 's' : ''}`, dSemNova === null || dSemNova >= 5 ? 'urg' : 'ok');
      spark('cot', porMes(cots, 'criadoEm'), SKY);

      /* 5. conversão do ano (fechadas x perdidas) */
      const doAno = cots.filter(c => { const d = toDate(c.dataDecisao) || toDate(c.atualizadoEm); return d && d >= anoIni; });
      const fech = doAno.filter(c => c.status === 'fechada'), perd = doAno.filter(c => /perd|naofech|nao_fech/i.test(c.status || ''));
      anel('fec', pct(fech.length, fech.length + perd.length));
      set('fec', 'big', `${fech.length} fechada${fech.length !== 1 ? 's' : ''}`);
      set('fec', 'gap', `${perd.length} perdida${perd.length !== 1 ? 's' : ''} no ano · ${T.fmt ? T.fmt(fech.reduce((s, c) => s + (c.valor || 0), 0)) : ''} em produção`);
      const fechMes = fech.filter(c => { const d = toDate(c.dataDecisao); return d && d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear(); }).length;
      set('fec', 'alerta', fechMes ? `${fechMes} fechamento${fechMes > 1 ? 's' : ''} este mês` : 'nenhum fechamento este mês', fechMes ? 'ok' : 'urg');
      spark('fec', porMes(fech, 'dataDecisao'), TEAL);

      /* 3 e 4. visitas e apresentações (leitura direta, mesma agência) */
      try {
        const db = T.db, ag = T.ctx && T.ctx.agenciaId;
        let qv = db.collection('mb_visitas'); if (ag) qv = qv.where('agenciaId', '==', ag);
        let qa = db.collection('mb_apresentacoes'); if (ag) qa = qa.where('agenciaId', '==', ag);
        const [sv, sa] = await Promise.all([qv.get(), qa.get()]);
        const vis = []; sv.forEach(d => vis.push(d.data())); const aps = []; sa.forEach(d => aps.push(d.data()));
        const visAno = vis.filter(v => { const d = toDate(v.criadoEm); return d && d >= anoIni && ids.has(v.empresaId); });
        const empVis = new Set(visAno.map(v => v.empresaId)).size;
        const ultVis = visAno.map(v => toDate(v.criadoEm)).sort((a, b) => b - a)[0];
        anel('vis', pct(empVis, N));
        set('vis', 'big', `${empVis} de ${N}`);
        set('vis', 'gap', N - empVis > 0 ? `${N - empVis} empresas ainda não visitadas em ${hoje.getFullYear()}` : 'todas visitadas este ano');
        set('vis', 'alerta', ultVis ? (dias(ultVis) === 0 ? 'visita registrada hoje' : `última visita há ${dias(ultVis)} dias`) : 'nenhuma visita registrada no ano', !ultVis || dias(ultVis) >= 7 ? 'urg' : 'ok');
        spark('vis', porMes(vis, 'criadoEm'), AMB);

        const apEmp = new Set(aps.filter(a => ids.has(a.empresaId)).map(a => a.empresaId)).size;
        const apInt = aps.filter(a => ids.has(a.empresaId) && (a.concluiu || a.questionarioCompleto || a.ultimoInteresse === 'cotar')).length;
        anel('apr', pct(apEmp, N));
        set('apr', 'big', `${apEmp} de ${N}`);
        set('apr', 'gap', `${apInt} interagiram (concluíram ou pediram cotação)`);
        set('apr', 'alerta', N - apEmp > 0 ? `${N - apEmp} empresas nunca abriram uma apresentação` : 'toda a carteira já abriu', N - apEmp > N * 0.5 ? 'urg' : 'ok');
        spark('apr', porMes(aps, 'criadoEm'), SKY);
      } catch (e) { console.warn('cockpit visitas/apresentações', e); set('vis', 'gap', 'sem acesso aos dados de visitas'); set('apr', 'gap', 'sem acesso às apresentações'); }

      marcar();
    }

    /* 6. meta: lê o termômetro que o sistema preenche */
    function meta() {
      const bar = $('termometroBar'), falta = $('termometroFalta'); if (!bar) return;
      const p = parseFloat(bar.style.width) || 0;
      anel('meta', p, p >= 100 ? 'var(--teal)' : undefined);
      set('meta', 'big', Math.round(p) + '% da meta');
      set('meta', 'gap', (falta && falta.textContent.trim() !== '—') ? falta.textContent.trim() : 'meta da agência ainda não definida');
      const diaMes = hoje.getDate(), diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate(), ritmo = Math.round(p / diaMes * diasMes);
      set('meta', 'alerta', p ? (ritmo >= 100 ? `no ritmo atual fecha em ${ritmo}%` : `no ritmo atual fecha em ${ritmo}% · acelerar`) : '', ritmo >= 100 ? 'ok' : 'urg');
      set('meta', 'foot', `${diasMes - diaMes} dias restantes no mês`);
    }

    function ligar() {
      root()?.querySelectorAll('.tt-gauge').forEach(el => {
        el.addEventListener('click', () => { const t = el.dataset.go; if (window.navTo) { try { window.event = null; } catch (e) {} navTo(t); const nav = document.querySelector(`.nav-item[onclick*="'${t}'"]`); document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); nav && nav.classList.add('active'); } });
        el.setAttribute('role', 'button'); el.tabIndex = 0;
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
      });
      document.addEventListener('tt:dados', () => { calcular(); meta(); });
      const bar = $('termometroBar'); bar && new MutationObserver(meta).observe(bar, { attributes: true, attributeFilter: ['style'] });
      const falta = $('termometroFalta'); falta && new MutationObserver(meta).observe(falta, { childList: true, characterData: true, subtree: true });
      if (window.__tt) { calcular(); meta(); }
      if (window.lucide) lucide.createIcons();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();
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
