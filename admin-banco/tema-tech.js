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
    D.elements.line.tension = 0.38; D.elements.line.borderWidth = 2.5; D.elements.line.capBezierPoints = true; D.elements.point.radius = 0; D.elements.point.hoverRadius = 6; D.elements.point.hitRadius = 14;
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
          if (Array.isArray(ds.backgroundColor)) ds.backgroundColor = ds.backgroundColor.map(c => { const k = String(c || '').toLowerCase(); return /94a3b8|cbd5e1|e2e8f0/.test(k) ? 'rgba(148,163,184,.45)' : /4f46e5|4338ca|312e81/.test(k) ? '#818CF8' : c; });
          else if (!isLine) { const base = mapCor(ds.backgroundColor || ds.borderColor) ; ds.backgroundColor = (base && base !== ds.backgroundColor) ? base : (ds.backgroundColor || PAL[i % PAL.length]); }
          if (typeof ds.borderColor === 'string' || !ds.borderColor) ds.borderColor = mapCor(ds.borderColor) || PAL[i % PAL.length];
          if (isLine) {
            const cor = typeof ds.borderColor === 'string' ? ds.borderColor : PAL[i % PAL.length];
            ds.borderColor = cor; ds.pointBackgroundColor = cor; ds.pointBorderColor = '#070B16'; ds.pointBorderWidth = 2;
            if (ds.borderDash && ds.borderDash.length) { ds.borderWidth = 2; ds.borderDash = [6, 5]; ds.borderColor = hex2rgba(cor, .9); ds.fill = false; }
            else if (ds.fill === undefined || ds.fill === true || ds.fill === 'origin') {
              ds.fill = true; ds.borderWidth = 2.5; ds.pointRadius = c => c.dataIndex === c.dataset.data.length - 1 ? 4 : 0;
              ds.backgroundColor = ctx => {
                const { chart: ch } = ctx; const area = ch.chartArea; if (!area) return hex2rgba(cor, .12);
                const g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                g.addColorStop(0, hex2rgba(cor, .38)); g.addColorStop(1, hex2rgba(cor, 0)); return g;
              };
            } else { ds.backgroundColor = hex2rgba(cor, .15); ds.borderWidth = 2.5; ds.pointRadius = c => c.dataIndex === c.dataset.data.length - 1 ? 4 : 0; }
          }
          if (isPie) { ds.borderWidth = 0; ds.spacing = 3; ds.hoverOffset = 8; ds.borderRadius = 6; }
        });
        if (/doughnut/.test(type)) { chart.options.cutout = chart.options.cutout || '74%'; }
        const sc = chart.options.scales || {};
        Object.values(sc).forEach(ax => { ax.grid = Object.assign({ color: 'rgba(148,163,184,.08)', drawTicks: false }, ax.grid || {}); ax.ticks = Object.assign({ color: '#5E6A82', font: { size: 11 } }, ax.ticks || {}); ax.border = Object.assign({ display: false }, ax.border || {}); });
      }
    });
  })();


  /* ---------- 9. normalizador genérico de cores inline (por luminosidade) + barras + estrelas + números ---------- */
  (function normalizador() {
    const parse = v => {
      v = String(v || '').trim().toLowerCase(); if (!v) return null;
      if (v === 'white') v = '#ffffff';
      let m = v.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)/);
      if (m) return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: m[4] === undefined ? 1 : +m[4] };
      m = v.match(/^#([\da-f]{3}|[\da-f]{6})$/); if (!m) return null;
      let h = m[1]; if (h.length === 3) h = h.split('').map(c => c + c).join('');
      return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: 1 };
    };
    const hsl = c => { const { r, g, b } = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return { h, s, l }; };
    const mapBg = (v, ctx) => {
      const c = parse(v); if (!c || c.a < .9) return null; const { h, s, l } = hsl(c);
      if (ctx.fill && l > .85) return 'linear-gradient(90deg, var(--sky), #B8E0FF)';
      if (l > .62) return s < .15 ? (l > .97 ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.075)') : `hsla(${h.toFixed(0)}, 70%, 62%, .12)`;
      if (h >= 225 && h <= 280 && s > .4 && l > .3 && l < .65) return 'linear-gradient(135deg, var(--navy-2), #3E6FC4)';
      if (l < .16 && s < .7) return 'var(--bg-3)';
      return null;
    };
    const mapFg = v => { const c = parse(v); if (!c) return null; const { h, s, l } = hsl(c); if (l >= .45) return null; if (s < .2) return l < .22 ? 'var(--ink)' : 'var(--ink-2)'; if (h >= 225 && h <= 280) return 'var(--sky-2)'; return `hsl(${h.toFixed(0)}, ${(Math.min(s, .85) * 100).toFixed(0)}%, 72%)`; };
    const mapBd = v => { const c = parse(v); if (!c) return null; const { h, s, l } = hsl(c); if (l <= .7) return null; return s < .2 ? 'var(--line)' : `hsl(${h.toFixed(0)}, 40%, 32%)`; };
    const mapGrad = v => {
      const stops = (v.match(/#[\da-f]{3,6}\b|rgba?\([^)]*\)/gi) || []).map(parse).filter(Boolean); if (!stops.length) return null;
      const L = stops.map(hsl);
      if (L.every(x => x.l > .62)) return `linear-gradient(135deg, hsla(${L[0].h.toFixed(0)}, 70%, 62%, .13), hsla(${L[L.length - 1].h.toFixed(0)}, 70%, 62%, .06))`;
      if (L.every(x => x.h >= 225 && x.h <= 285 && x.l < .7)) return 'linear-gradient(135deg, var(--navy-2), #3E6FC4)';
      return null;
    };
    const ehFill = el => { const st = el.style; if (!/%$/.test(st.width || '')) return false; const p = el.parentElement; if (!p) return false; const ph = parseFloat(p.style.height) || 0; return st.height === '100%' || (ph && ph <= 28) || (p.style.overflow === 'hidden' && !el.children.length); };

    function fix(el) {
      if (!el || el.nodeType !== 1 || !el.style || el.id === 'ttBg' || el.hasAttribute('data-ignore-bg') || el.closest('#ttCockpit, .tt-flow, .tt-hero, #ttGlobe, .tt-cal-ev')) return;
      const st = el.style, fill = ehFill(el);
      /* barras de progresso: cor de destaque + animação de crescimento (uma vez) */
      if (fill && !el.dataset.ttBar) {
        el.dataset.ttBar = '1'; const alvo = st.width;
        const g = mapBg(st.backgroundColor || st.background, { fill: true });
        if (g) st.setProperty('background', g, 'important');
        if (!reduce) { st.setProperty('transition', 'none', 'important'); st.width = '0%'; el.classList.add('tt-bar'); requestAnimationFrame(() => requestAnimationFrame(() => { st.removeProperty('transition'); st.width = alvo; })); }
        return;
      }
      const emModal = !!el.closest('.cad-modal-panel, .visita-panel, [style*="position:fixed"], [style*="position: fixed"]') && !el.closest('.sidebar, .topbar, #ttBg');
      if (st.backgroundImage && /gradient/.test(st.backgroundImage)) { const g = mapGrad(st.backgroundImage); if (g) st.setProperty('background', emModal ? 'var(--bg-2)' : g, 'important'); }
      else { let bg = mapBg(st.backgroundColor, { fill }); if (bg && emModal && /rgba\(255,255,255/.test(bg)) bg = (parse(st.backgroundColor) || {}).a < .9 ? null : 'var(--bg-2)'; if (bg) st.setProperty('background', bg, 'important'); }
      const fg = mapFg(st.color); if (fg) st.setProperty('color', fg, 'important');
      ['borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'].forEach(k => { const b = mapBd(st[k]); if (b) st.setProperty(k.replace(/([A-Z])/g, m => '-' + m.toLowerCase()), b, 'important'); });
      if (st.boxShadow && /rgba\(0|rgba\(15|rgba\(79/.test(st.boxShadow)) st.setProperty('box-shadow', 'none', 'important');
      /* números em mono (percentuais/valores) recém-inseridos: pulso suave */
      if (!el.dataset.ttNum && /jetbrains/i.test(st.fontFamily || '') && /^\s*R?\$?\s*[\d.,]+\s*[%KM]?\s*$/.test(el.textContent || '') && el.children.length === 0 && parseFloat(st.fontSize) >= 14) { el.dataset.ttNum = '1'; el.classList.add('tt-pulse'); setTimeout(() => el.classList.remove('tt-pulse'), 6000); }
    }
    /* estrelas da campanha: 3D + brilho + preenchimento animado */
    function estrelas(root) {
      root.querySelectorAll('svg:not([data-tt-star]) linearGradient[id^="est_"]').forEach(lg => {
        const svg = lg.closest('svg'); if (!svg) return; svg.dataset.ttStar = '1';
        const stops = lg.querySelectorAll('stop'); if (stops.length < 2) return;
        const alvo = parseFloat(stops[0].getAttribute('offset')) || 0, cor = stops[0].getAttribute('stop-color');
        stops[1].setAttribute('stop-color', '#1a2438');
        const path = svg.querySelector('path'); if (path) { path.setAttribute('stroke', 'rgba(148,163,184,.35)'); }
        const wrap = document.createElement('span'); wrap.className = 'tt-star3d'; wrap.style.setProperty('--glow', alvo >= 100 ? cor : 'rgba(95,180,255,.35)'); wrap.dataset.full = alvo >= 100 ? '1' : '0';
        svg.parentNode.insertBefore(wrap, svg); wrap.appendChild(svg);
        if (reduce) return;
        let p = 0; const t0 = performance.now();
        (function step(now) { const r = Math.min(1, (now - t0) / 1200), e = 1 - Math.pow(1 - r, 3); p = alvo * e; stops[0].setAttribute('offset', p + '%'); stops[1].setAttribute('offset', p + '%'); if (r < 1) requestAnimationFrame(step); })(t0);
      });
    }
    function varrer(root) { if (root.nodeType !== 1) return; fix(root); root.querySelectorAll('[style]').forEach(fix); estrelas(root); }
    let fila = new Set(), agendado = false;
    function agendar(el) { fila.add(el); if (agendado) return; agendado = true; requestAnimationFrame(() => { fila.forEach(varrer); fila.clear(); agendado = false; }); }
    const mo = new MutationObserver(ms => { for (const m of ms) { if (m.type === 'attributes') { if (m.target.dataset && m.target.dataset.ttBar && m.attributeName === 'style') continue; agendar(m.target); } else m.addedNodes.forEach(n => n.nodeType === 1 && agendar(n)); } });
    function start() { varrer(document.body); mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] }); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  })();

  /* ---------- 9b. gráficos: reanimam sempre que a tela deles aparece ---------- */
  (function reanimar() {
    if (!window.Chart) return;
    const mo = new MutationObserver(ms => {
      for (const m of ms) {
        const el = m.target; if (!el.classList || !el.classList.contains('screen') || !el.classList.contains('active')) continue;
        el.querySelectorAll('canvas').forEach(cv => { const ch = Chart.getChart ? Chart.getChart(cv) : null; if (ch && !reduce) { try { ch.reset(); ch.update(); } catch (e) {} } });
        el.querySelectorAll('[data-tt-bar]').forEach(b => { const w = b.style.width; b.style.transition = 'none'; b.style.width = '0%'; requestAnimationFrame(() => requestAnimationFrame(() => { b.style.removeProperty('transition'); b.style.width = w; })); });
      }
    });
    document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.screen').forEach(s => mo.observe(s, { attributes: true, attributeFilter: ['class'] })));
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

      /* 3. VISITAS: agendamentos realizados no ano (fonte igual à do calendário) */
      const parseDataAg = str => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
      const ags = (T.agendamentos || []).filter(a => a.status === 'realizada');
      const meu = T.meuUid, ehRm = T.perfil === 'rm';
      const agsMostra = ehRm ? ags.filter(a => a.gerenteUid === meu) : ags;
      const agsAno = agsMostra.filter(a => { const d = parseDataAg(a.data); return d && d >= anoIni; });
      const empVisSet = new Set(agsAno.map(a => a.empresaId).filter(Boolean));
      const empVis = N ? Array.from(empVisSet).filter(id => ids.has(id)).length || empVisSet.size : empVisSet.size;
      const ultVis = agsAno.map(a => parseDataAg(a.data)).filter(Boolean).sort((a, b) => b - a)[0];
      anel('vis', pct(empVis, N || empVisSet.size || 1));
      set('vis', 'big', `${empVis}${N ? ' de ' + N : ''}`);
      set('vis', 'gap', agsAno.length ? `${agsAno.length} visita${agsAno.length > 1 ? 's' : ''} realizada${agsAno.length > 1 ? 's' : ''} em ${hoje.getFullYear()}` : `nenhuma visita realizada em ${hoje.getFullYear()}`);
      set('vis', 'alerta', ultVis ? (dias(ultVis) === 0 ? 'visita hoje' : `última visita há ${dias(ultVis)} dias`) : 'registre visitas na agenda', !ultVis || dias(ultVis) >= 7 ? 'urg' : 'ok');
      { const s6 = new Array(6).fill(0), base = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1); agsMostra.forEach(a => { const d = parseDataAg(a.data); if (!d || d < base) return; const i = (d.getFullYear() - base.getFullYear()) * 12 + d.getMonth() - base.getMonth(); if (i >= 0 && i < 6) s6[i]++; }); spark('vis', s6, AMB); }

      /* 4. APRESENTAÇÕES: leitura direta (mesma agência) */
      try {
        const db = T.db, ag = T.ctx && T.ctx.agenciaId;
        let qa = db.collection('mb_apresentacoes'); if (ag) qa = qa.where('agenciaId', '==', ag);
        const sa = await qa.get(); const aps = []; sa.forEach(d => aps.push(d.data()));
        const apEmp = new Set(aps.filter(a => ids.has(a.empresaId)).map(a => a.empresaId)).size;
        const apInt = aps.filter(a => ids.has(a.empresaId) && (a.concluiu || a.questionarioCompleto || a.ultimoInteresse === 'cotar')).length;
        anel('apr', pct(apEmp, N));
        set('apr', 'big', `${apEmp} de ${N}`);
        set('apr', 'gap', `${apInt} interagiram (concluíram ou pediram cotação)`);
        set('apr', 'alerta', N - apEmp > 0 ? `${N - apEmp} empresas nunca abriram uma apresentação` : 'toda a carteira já abriu', N - apEmp > N * 0.5 ? 'urg' : 'ok');
        spark('apr', porMes(aps, 'criadoEm'), SKY);
      } catch (e) { console.warn('cockpit apresentações', e); set('apr', 'gap', 'sem acesso às apresentações'); }

      marcar();
    }

    /* 6. OBJETIVOS por ramo — produção × meta retorno (fonte: Relatório de Metas) */
    function objetivos() {
      const el = g('meta'); if (!el) return;
      const T = window.__tt, ramos = T && T.metasPorGrupo;
      if (!ramos || !ramos.length) { set('meta', 'big', 'sem dados'); set('meta', 'gap', 'cadastre metas em Metas → Metas Anuais'); anel('meta', 0); return; }
      const metaTot = T.metaTotalRet || ramos.reduce((s, r) => s + r.meta, 0);
      const realTot = T.realTotalRet || ramos.reduce((s, r) => s + r.real, 0);
      const pctTot = metaTot > 0 ? Math.round(realTot / metaTot * 100) : 0;
      anel('meta', pctTot, pctTot >= 100 ? 'var(--teal)' : undefined);
      set('meta', 'big', pctTot + '% da meta');
      const noAlvo = ramos.filter(r => r.pct >= 100).length;
      set('meta', 'gap', `${T.fmt ? T.fmt(realTot) : realTot} de ${T.fmt ? T.fmt(metaTot) : metaTot} · ${ramos.length} ramos`);
      const abaixo = ramos.filter(r => r.pct < 100).sort((a, b) => a.pct - b.pct)[0];
      set('meta', 'alerta', abaixo ? `${abaixo.nome.replace(/ .*/, '')} é o mais baixo (${Math.round(abaixo.pct)}%)` : 'todos os ramos no alvo', noAlvo === ramos.length ? 'ok' : 'urg');
      /* roda de todos os ramos, cada anel = % produção vs meta */
      desenhaRoda(el, ramos);
    }
    function desenhaRoda(card, ramos) {
      const body = card.querySelector('.tt-g-body'); if (!body) return;
      const svg = body.querySelector('svg'); if (svg) svg.style.display = 'none';
      let grid = card.querySelector('.tt-ramos-grid');
      if (!grid) { grid = document.createElement('div'); grid.className = 'tt-ramos-grid'; body.insertAdjacentElement('afterend', grid); }
      const CORES = { vida: '#5FB4FF', re: '#F5B544', saude: '#2DD4BF', auto: '#9B8CFF', dental: '#F472B6', prev: '#A3E635', previdencia: '#A3E635' };
      const cor = r => CORES[(r.id || '').toLowerCase()] || r.cor || '#5FB4FF';
      grid.innerHTML = ramos.map(r => {
        const p = Math.max(0, Math.min(100, Math.round(r.pct)));
        return `<div class="tt-ramo-cell" title="${r.nome}: ${T_fmt(r.real)} de ${T_fmt(r.meta)}">
          <svg viewBox="0 0 44 44"><circle class="tr" cx="22" cy="22" r="18"/><circle class="va" cx="22" cy="22" r="18" style="stroke:${cor(r)};stroke-dashoffset:113" data-off="${113 - 113 * Math.min(100, p) / 100}"/><text x="22" y="26" class="pc">${p}%</text></svg>
          <span class="tt-ramo-nome">${r.nome.replace(/ .*/, '')}</span>
        </div>`;
      }).join('');
      /* anima o preenchimento */
      requestAnimationFrame(() => requestAnimationFrame(() => { grid.querySelectorAll('circle.va').forEach(c => { c.style.strokeDashoffset = c.dataset.off; }); }));
      /* limpa o rodapé (a legenda agora está em cada mini-anel) */
      const foot = card.querySelector('.tt-g-foot [data-f="foot"]'); if (foot) foot.innerHTML = '';
    }
    function T_fmt(v) { const T = window.__tt; return T && T.fmt ? T.fmt(v) : ('R$ ' + Math.round(v || 0).toLocaleString('pt-BR')); }
    /* fallback antigo (termômetro) só se não houver dados por ramo */
    function meta() { if (window.__tt && window.__tt.metasPorGrupo && window.__tt.metasPorGrupo.length) return objetivos(); const el = g('meta'); if (el) { set('meta', 'big', 'abra Relatório de Metas'); set('meta', 'gap', 'os objetivos por ramo aparecem após carregar as metas'); } }
        window.__ttObjetivos = objetivos;

    function ligar() {
      root()?.querySelectorAll('.tt-gauge').forEach(el => {
        el.addEventListener('click', () => { const t = el.dataset.go; if (window.navTo) { try { window.event = null; } catch (e) {} navTo(t); const nav = document.querySelector(`.nav-item[onclick*="'${t}'"]`); document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); nav && nav.classList.add('active'); } });
        el.setAttribute('role', 'button'); el.tabIndex = 0;
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
      });
      document.addEventListener('tt:dados', () => { calcular(); meta(); });
      document.addEventListener('tt:metas', () => { if (window.__ttObjetivos) window.__ttObjetivos(); });
      document.addEventListener('tt:metasret', () => { if (window.__ttObjetivos) window.__ttObjetivos(); });
      /* renomeia "Meta do mês" -> "Objetivos por ramo" */
      const hMeta = root()?.querySelector('.tt-gauge[data-k="meta"] .tt-g-head span'); if (hMeta) hMeta.textContent = 'Objetivos por ramo';
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
