// painel.js — Dashboard Moderno - Retorno Seguros

// ==== Firebase ====
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ==== Estado Global ====
let CTX = { uid: null, perfil: null, agenciaId: null, nome: null };
const ADMIN_EMAILS = ["patrick@retornoseguros.com.br"];

// Cache para evitar queries repetidas
const CACHE = { data: {}, timestamp: 0 };
const CACHE_TTL = 60000;

// ==== Helpers ====
const normalizar = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const normalizarPerfil = (p) => normalizar(p).replace(/[-_]+/g, " ");
const isGC = (perfil) => ["gerente chefe", "gerente-chefe", "gerente_chefe"].includes(normalizarPerfil(perfil));

const toDate = (x) => {
  if (!x) return null;
  if (x.toDate) return x.toDate();
  if (x instanceof Date) return x;
  const d = new Date(x);
  return isNaN(d) ? null : d;
};

const fmtData = (d) => d ? d.toLocaleDateString("pt-BR") : "-";
const fmtHora = (d) => d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDataHora = (d) => d ? `${fmtData(d)} ${fmtHora(d)}` : "-";

const parseValor = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
  return parseFloat(s) || 0;
};

const fmtBRL = (n) => parseValor(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBRLShort = (n) => {
  const v = parseValor(n);
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(1)}K`;
  return fmtBRL(v);
};

// Skeleton loader
function skeleton(id, n = 3) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = Array(n).fill('<div class="skeleton h-14 rounded-xl"></div>').join('');
}

// ==== Persistência Auth ====
async function ensurePersistence() {
  try { await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); }
  catch { try { await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION); } catch { } }
}

// ==== Boot ====
async function initAuth() {
  await ensurePersistence();
  
  const timeout = setTimeout(() => {
    if (!auth.currentUser) location.href = "login.html";
  }, 5000);

  auth.onAuthStateChanged(async (user) => {
    if (!user) { clearTimeout(timeout); location.href = "login.html"; return; }
    clearTimeout(timeout);
    CTX.uid = user.uid;

    // Buscar perfil
    try {
      const snap = await db.collection("usuarios_banco").doc(user.uid).get();
      if (snap.exists) {
        const d = snap.data();
        CTX.perfil = normalizarPerfil(d.perfil || "");
        CTX.agenciaId = d.agenciaId || d.agenciaid || null;
        CTX.nome = d.nome || user.email;
      } else if (ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
        CTX.perfil = "admin";
        CTX.agenciaId = null;
        CTX.nome = user.email;
      } else {
        document.getElementById("perfilUsuario").textContent = "Sem perfil";
        return;
      }
    } catch (e) {
      console.warn("Erro ao ler perfil:", e);
      if (ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
        CTX.perfil = "admin";
        CTX.nome = user.email;
      }
    }

    initDashboard();
  });
}

function initDashboard() {
  atualizarTopo();
  montarMenu();
  initDrawer();
  initModal();
  
  // Carregar dados em paralelo
  Promise.all([
    carregarKPIs(),
    carregarGraficoStatus(),
    carregarComparacoes(),
    carregarFeed(),
    carregarVencimentos(),
    carregarAgenda(),
    carregarProducao(),
    carregarCotacoes()
  ]);
}

// ==== Header ====
function atualizarTopo() {
  const h = new Date().getHours();
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const nome = CTX.nome?.split(' ')[0] || "Usuário";
  
  document.getElementById("tituloSaudacao").textContent = `${saudacao}, ${nome}`;
  
  const perfis = {
    "admin": "Administrador",
    "rm": "Gerente RM",
    "gerente chefe": "Gerente Chefe",
    "assistente": "Assistente"
  };
  document.getElementById("perfilUsuario").textContent = perfis[CTX.perfil] || CTX.perfil?.toUpperCase() || "";
}

// ==== Menu Lateral ====
function montarMenu() {
  const nav = document.getElementById("menuNav");
  if (!nav) return;

  const perfil = CTX.perfil;
  const isAdmin = perfil === "admin";
  const currentPage = location.pathname.split('/').pop() || 'painel.html';

  const MENU = [
    { titulo: "Principal", itens: [
      { label: "Dashboard", href: "painel.html", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" }
    ]},
    { titulo: "Cadastros", itens: [
      { label: "Gerentes", href: "cadastro-geral.html", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", roles: ["admin"] },
      { label: "Empresas", href: "empresas.html", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
      { label: "Nova Empresa", href: "cadastro-empresa.html", icon: "M12 6v6m0 0v6m0-6h6m-6 0H6" },
      { label: "Agências", href: "agencias.html", icon: "M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z", roles: ["admin"] },
      { label: "Funcionários", href: "funcionarios.html", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" }
    ]},
    { titulo: "Operações", itens: [
      { label: "Agenda", href: "agenda-visitas.html", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
      { label: "Visitas", href: "visitas.html", icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" },
      { label: "Cotações", href: "cotacoes.html", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
      { label: "Produção", href: "negocios-fechados.html", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
      { label: "Financeiro", href: "financeiro.html", icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" },
      { label: "Consultar Dicas", href: "consultar-dicas.html", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
      { label: "Dicas Produtos", href: "dicas-produtos.html", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z", roles: ["admin"] },
      { label: "Ramos Seguro", href: "ramos-seguro.html", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", roles: ["admin"] }
    ]},
    { titulo: "Relatórios", itens: [
      { label: "Visitas", href: "visitas-relatorio.html", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
      { label: "Vencimentos", href: "vencimentos.html", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
      { label: "Relatórios", href: "relatorios.html", icon: "M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" }
    ]},
    { titulo: "Admin", adminOnly: true, itens: [
      { label: "Carteira", href: "carteira.html", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
      { label: "Comissões", href: "comissoes.html", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
      { label: "Resgates", href: "resgates-admin.html", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" }
    ]}
  ];

  // Permissões por perfil
  const ROTAS = {
    "admin": new Set(MENU.flatMap(g => g.itens.map(i => i.href))),
    "rm": new Set(["painel.html", "cadastro-empresa.html", "empresas.html", "agenda-visitas.html", "visitas.html", "cotacoes.html", "negocios-fechados.html", "consultar-dicas.html", "visitas-relatorio.html", "vencimentos.html", "funcionarios.html", "financeiro.html"]),
    "gerente chefe": new Set(["painel.html", "cadastro-empresa.html", "empresas.html", "agenda-visitas.html", "visitas.html", "cotacoes.html", "negocios-fechados.html", "consultar-dicas.html", "visitas-relatorio.html", "vencimentos.html", "funcionarios.html", "financeiro.html"]),
    "assistente": new Set(["painel.html", "agenda-visitas.html", "visitas.html", "cotacoes.html", "consultar-dicas.html", "funcionarios.html", "financeiro.html"])
  };

  const pode = ROTAS[perfil] || new Set();
  let html = '';

  MENU.forEach(grupo => {
    if (grupo.adminOnly && !isAdmin) return;

    let itens = grupo.itens.filter(item => {
      if (item.roles && !item.roles.includes(perfil) && !isAdmin) return false;
      return isAdmin || pode.has(item.href);
    });

    if (!itens.length) return;

    html += `<div class="nav-section"><div class="nav-title">${grupo.titulo}</div>`;
    itens.forEach(item => {
      const active = currentPage === item.href ? 'active' : '';
      html += `
        <a href="${item.href}" class="nav-link ${active}">
          <span class="nav-icon">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${item.icon}"/>
            </svg>
          </span>
          <span>${item.label}</span>
        </a>
      `;
    });
    html += '</div>';
  });

  nav.innerHTML = html;
  if (window.innerWidth >= 1024) nav.classList.remove('hidden');
}

// ==== Query Helper com RBAC ====
async function getDocsPerfil(colName) {
  const cacheKey = colName;
  if (CACHE.data[cacheKey] && Date.now() - CACHE.timestamp < CACHE_TTL) {
    return CACHE.data[cacheKey];
  }

  const col = db.collection(colName);
  const perfil = CTX.perfil;
  let snaps = [];

  try {
    if (perfil === "admin") {
      snaps = [await col.get()];
    } else if (perfil === "rm") {
      // RM vê apenas seus docs
      const queries = [
        col.where("rmUid", "==", CTX.uid).get(),
        col.where("rmId", "==", CTX.uid).get(),
        col.where("usuarioId", "==", CTX.uid).get(),
        col.where("criadoPorUid", "==", CTX.uid).get()
      ];
      const results = await Promise.allSettled(queries);
      snaps = results.filter(r => r.status === "fulfilled").map(r => r.value);
    } else if (isGC(perfil) || perfil === "assistente") {
      // Gerente Chefe e Assistente veem da agência
      if (CTX.agenciaId) {
        snaps = [await col.where("agenciaId", "==", CTX.agenciaId).get()];
      }
    }
  } catch (e) {
    console.warn(`Query ${colName} falhou:`, e);
  }

  const map = new Map();
  snaps.forEach(s => s?.forEach?.(d => map.set(d.id, { id: d.id, ...d.data() })));
  const result = Array.from(map.values());

  CACHE.data[cacheKey] = result;
  CACHE.timestamp = Date.now();
  return result;
}

// Buscar todos da agência (para comparação)
async function getDocsAgencia(colName) {
  if (!CTX.agenciaId || CTX.perfil === "admin") return [];
  try {
    const snap = await db.collection(colName).where("agenciaId", "==", CTX.agenciaId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

// ==== KPIs ====
async function carregarKPIs() {
  const ano = new Date().getFullYear();
  const iniAno = new Date(ano, 0, 1);
  const fimAno = new Date(ano + 1, 0, 1);
  const perfil = CTX.perfil;

  // Empresas
  try {
    const docs = await getDocsPerfil("empresas");
    animateNumber("kpiEmpresas", docs.length);
  } catch { }

  // Visitas do ANO
  // Admin: todas | GC: da agência | RM: próprias
  try {
    const docs = await getDocsPerfil("agenda_visitas");
    const visitasAno = docs.filter(d => {
      const dt = toDate(d.dataHoraTs) || toDate(d.dataHoraStr) || toDate(d.dataHora) || toDate(d.data);
      return dt && dt >= iniAno && dt < fimAno;
    });
    animateNumber("kpiVisitas", visitasAno.length);
    document.getElementById("lblVisitas").textContent = "Visitas " + ano;
  } catch { }

  // Cotações
  try {
    const docs = await getDocsPerfil("cotacoes-gerentes");
    animateNumber("kpiCotacoes", docs.length);
  } catch { }

  // Produção do ANO
  try {
    const docs = await getDocsPerfil("cotacoes-gerentes");
    let total = 0;
    docs.forEach(d => {
      const st = normalizar(d.status || "");
      const dt = toDate(d.dataCriacao) || toDate(d.vigenciaInicial);
      if (st === "negocio emitido" && dt && dt >= iniAno && dt < fimAno) {
        total += parseValor(d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0);
      }
    });
    document.getElementById("kpiProducao").textContent = fmtBRLShort(total);
  } catch { }
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const duration = 600;
  const start = performance.now();

  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(target * ease).toLocaleString('pt-BR');
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ==== Gráfico Status ====
let chartStatus = null;

async function carregarGraficoStatus() {
  try {
    const docs = await getDocsPerfil("cotacoes-gerentes");
    const statusCount = {};

    docs.forEach(d => {
      const st = d.status || "Sem status";
      statusCount[st] = (statusCount[st] || 0) + 1;
    });

    const labels = Object.keys(statusCount);
    const data = Object.values(statusCount);

    const cores = labels.map(s => {
      const st = normalizar(s);
      if (st.includes("emitido")) return '#10b981';
      if (st.includes("fechado")) return '#059669';
      if (st.includes("pendente")) return '#f59e0b';
      if (st.includes("recusado")) return '#ef4444';
      if (st.includes("iniciado")) return '#6366f1';
      if (st.includes("emissao")) return '#3b82f6';
      return '#94a3b8';
    });

    const ctx = document.getElementById("chartStatus");
    if (!ctx) return;

    if (chartStatus) chartStatus.destroy();

    chartStatus = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: cores, borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 12,
              font: { family: 'Plus Jakarta Sans', size: 11 }
            }
          }
        }
      }
    });
  } catch (e) {
    console.warn("[Gráfico]", e);
  }
}

// ==== Comparações (Você vs Agência) ====
async function carregarComparacoes() {
  const card = document.getElementById("cardComparacao");
  if (CTX.perfil === "admin") {
    card?.classList.add('hidden');
    return;
  }

  const agora = new Date();
  const iniMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59);

  try {
    // Meus dados
    const meusDocs = await getDocsPerfil("cotacoes-gerentes");
    const meusNoMes = meusDocs.filter(d => {
      const dt = toDate(d.dataCriacao);
      return dt && dt >= iniMes && dt <= fimMes;
    });

    const minhasCotacoes = meusNoMes.length;
    let minhaProducao = 0;
    meusDocs.forEach(d => {
      const st = normalizar(d.status || "");
      const dt = toDate(d.dataCriacao);
      if (st === "negocio emitido" && dt && dt >= iniMes && dt <= fimMes) {
        minhaProducao += parseValor(d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0);
      }
    });

    // Dados da agência
    const docsAgencia = await getDocsAgencia("cotacoes-gerentes");
    const agenciaMes = docsAgencia.filter(d => {
      const dt = toDate(d.dataCriacao);
      return dt && dt >= iniMes && dt <= fimMes;
    });

    const cotacoesAgencia = agenciaMes.length;
    let producaoAgencia = 0;
    docsAgencia.forEach(d => {
      const st = normalizar(d.status || "");
      const dt = toDate(d.dataCriacao);
      if (st === "negocio emitido" && dt && dt >= iniMes && dt <= fimMes) {
        producaoAgencia += parseValor(d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0);
      }
    });

    // Atualizar UI
    document.getElementById("compCotacoesVoce").textContent = minhasCotacoes;
    document.getElementById("compCotacoesAgencia").textContent = cotacoesAgencia;
    const pCot = cotacoesAgencia > 0 ? (minhasCotacoes / cotacoesAgencia) * 100 : 0;
    document.getElementById("barCotacoesVoce").style.width = Math.min(pCot, 100) + '%';

    document.getElementById("compProducaoVoce").textContent = fmtBRLShort(minhaProducao);
    document.getElementById("compProducaoAgencia").textContent = fmtBRLShort(producaoAgencia);
    const pProd = producaoAgencia > 0 ? (minhaProducao / producaoAgencia) * 100 : 0;
    document.getElementById("barProducaoVoce").style.width = Math.min(pProd, 100) + '%';

    // Cotações por Ramo (VALOR, não quantidade)
    const ramoValor = {};
    meusDocs.forEach(d => {
      const ramo = d.ramo || "Outros";
      const valor = parseValor(d.valorFinal ?? d.valorDesejado ?? d.premio ?? 0);
      ramoValor[ramo] = (ramoValor[ramo] || 0) + valor;
    });

    const ramosDiv = document.getElementById("cotacoesRamos");
    const entries = Object.entries(ramoValor).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (!entries.length) {
      ramosDiv.innerHTML = '<div class="text-slate-400 text-xs">Nenhuma cotação</div>';
    } else {
      const max = entries[0][1];
      ramosDiv.innerHTML = entries.map(([ramo, valor]) => `
        <div class="flex items-center gap-2">
          <div class="w-20 text-xs text-slate-500 truncate">${ramo}</div>
          <div class="flex-1 progress-bar">
            <div class="progress-fill bg-gradient-to-r from-violet-500 to-violet-400" style="width:${max > 0 ? (valor / max) * 100 : 0}%"></div>
          </div>
          <div class="text-xs font-semibold text-slate-700 w-16 text-right">${fmtBRLShort(valor)}</div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.warn("[Comparações]", e);
  }
}

// ==== Feed de Movimentações ====
async function carregarFeed() {
  const container = document.getElementById("feedMovimentacoes");
  if (!container) return;

  try {
    const docs = await getDocsPerfil("cotacoes-gerentes");
    const comInteracoes = [];

    docs.forEach(d => {
      const interacoes = d.interacoes || [];
      if (interacoes.length) {
        const ultima = [...interacoes].sort((a, b) => {
          return (toDate(b.dataHora) || 0) - (toDate(a.dataHora) || 0);
        })[0];

        comInteracoes.push({
          id: d.id,
          empresaNome: d.empresaNome || "Empresa",
          status: d.status || "-",
          ultimaInteracao: ultima,
          dataInteracao: toDate(ultima.dataHora)
        });
      }
    });

    comInteracoes.sort((a, b) => (b.dataInteracao || 0) - (a.dataInteracao || 0));
    const ultimas = comInteracoes.slice(0, 5);

    if (!ultimas.length) {
      container.innerHTML = '<div class="empty-state"><div class="text-sm">Nenhuma movimentação</div></div>';
      return;
    }

    container.innerHTML = ultimas.map(item => {
      const badge = getBadge(item.status);
      const indicador = item.ultimaInteracao.tipo === "mudanca_status" ? "bg-amber-500" : "bg-emerald-500";

      return `
        <a href="chat-cotacao.html?id=${item.id}" class="activity-card block">
          <div class="activity-indicator ${indicador}"></div>
          <div class="pl-2">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-semibold text-slate-800 text-sm truncate">${item.empresaNome}</span>
              <span class="${badge}">${item.status}</span>
            </div>
            <div class="text-xs text-slate-500 line-clamp-1">${item.ultimaInteracao.mensagem || "-"}</div>
            <div class="text-[10px] text-slate-400 mt-1">${item.ultimaInteracao.autorNome || ""} • ${fmtDataHora(item.dataInteracao)}</div>
          </div>
        </a>
      `;
    }).join('');
  } catch (e) {
    console.warn("[Feed]", e);
    container.innerHTML = '<div class="empty-state text-sm">Erro ao carregar</div>';
  }
}

function getBadge(status) {
  const st = normalizar(status);
  if (st.includes("emitido") || st.includes("fechado")) return "badge badge-success";
  if (st.includes("pendente")) return "badge badge-warning";
  if (st.includes("recusado")) return "badge badge-danger";
  if (st.includes("iniciado") || st.includes("emissao")) return "badge badge-info";
  return "badge badge-muted";
}

// ==== Próximos Vencimentos ====
async function carregarVencimentos() {
  const container = document.getElementById("listaVencimentos");
  if (!container) return;

  const agora = new Date();
  const mesAtual = agora.getMonth();
  const anoAtual = agora.getFullYear();
  const iniMes = new Date(anoAtual, mesAtual, 1);
  const fimProxMes = new Date(anoAtual, mesAtual + 2, 0, 23, 59, 59);

  try {
    // Buscar cotações emitidas com fim de vigência
    const docs = await getDocsPerfil("cotacoes-gerentes");
    const vencimentos = [];

    docs.forEach(d => {
      const st = normalizar(d.status || "");
      if (st !== "negocio emitido") return;

      const fimVig = toDate(d.fimVigencia) || toDate(d.vigenciaFinal);
      if (!fimVig) return;

      if (fimVig >= iniMes && fimVig <= fimProxMes) {
        vencimentos.push({
          id: d.id,
          empresaNome: d.empresaNome || "Empresa",
          ramo: d.ramo || "-",
          fimVigencia: fimVig,
          valor: parseValor(d.valorFinal ?? d.premio ?? d.valorDesejado ?? 0)
        });
      }
    });

    // Também buscar de visitas (ramos com vencimento)
    const visitas = await getDocsPerfil("visitas");
    visitas.forEach(v => {
      const ramos = v.ramos || {};
      Object.entries(ramos).forEach(([key, item]) => {
        const fimVig = toDate(item.vencimento) || toDate(item.fimVigencia);
        if (!fimVig) return;

        if (fimVig >= iniMes && fimVig <= fimProxMes) {
          vencimentos.push({
            id: v.id,
            empresaNome: v.empresaNome || v.empresa || "Empresa",
            ramo: key.replace(/_/g, " ").toUpperCase(),
            fimVigencia: fimVig,
            valor: parseValor(item.premio ?? 0),
            origem: "visita"
          });
        }
      });
    });

    vencimentos.sort((a, b) => a.fimVigencia - b.fimVigencia);

    if (!vencimentos.length) {
      container.innerHTML = '<div class="empty-state py-8"><div class="text-sm">Nenhum vencimento próximo</div></div>';
      return;
    }

    container.innerHTML = vencimentos.slice(0, 10).map(v => {
      const diasRestantes = Math.ceil((v.fimVigencia - agora) / (1000 * 60 * 60 * 24));
      const urgencia = diasRestantes <= 7 ? 'border-red-200 bg-red-50' :
                       diasRestantes <= 30 ? 'border-amber-200 bg-amber-50' :
                       'border-slate-200 bg-white';
      const textUrgencia = diasRestantes <= 7 ? 'text-red-600' :
                           diasRestantes <= 30 ? 'text-amber-600' : 'text-slate-600';

      return `
        <div class="scroll-item card ${urgencia} p-4">
          <div class="font-semibold text-slate-800 text-sm truncate mb-1">${v.empresaNome}</div>
          <div class="text-xs text-slate-500 mb-2">${v.ramo}</div>
          <div class="flex items-center justify-between">
            <span class="text-xs ${textUrgencia} font-semibold">${fmtData(v.fimVigencia)}</span>
            <span class="text-xs font-bold text-slate-700">${fmtBRLShort(v.valor)}</span>
          </div>
          <div class="text-[10px] ${textUrgencia} mt-1">${diasRestantes > 0 ? `${diasRestantes} dias` : 'Vencido!'}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.warn("[Vencimentos]", e);
    container.innerHTML = '<div class="empty-state text-sm">Erro ao carregar</div>';
  }
}

// ==== Agenda ====
async function carregarAgenda() {
  const container = document.getElementById("listaVisitasAgendadas");
  if (!container) return;

  try {
    const docs = await getDocsPerfil("agenda_visitas");
    const agora = Date.now();
    const futuras = [];

    docs.forEach(d => {
      const dt = toDate(d.dataHoraTs) || toDate(d.dataHoraStr) || toDate(d.dataHora);
      if (dt && dt.getTime() >= agora) {
        futuras.push({ ...d, dt });
      }
    });

    futuras.sort((a, b) => a.dt - b.dt);
    const lista = futuras.slice(0, 5);

    document.getElementById("qtdVA").textContent = lista.length;

    if (!lista.length) {
      container.innerHTML = '<li class="empty-state py-4"><div class="text-sm">Nenhuma visita agendada</div></li>';
      return;
    }

    container.innerHTML = lista.map(v => `
      <li class="list-item">
        <div class="icon-box bg-blue-100 text-blue-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-slate-800 text-sm truncate">${v.empresaNome || v.empresa || "-"}</div>
          <div class="text-xs text-slate-500">${fmtData(v.dt)} às ${fmtHora(v.dt)}</div>
        </div>
      </li>
    `).join('');
  } catch (e) {
    console.warn("[Agenda]", e);
  }
}

// ==== Produção ====
async function carregarProducao() {
  const container = document.getElementById("listaProducao");
  if (!container) return;

  try {
    const docs = await getDocsPerfil("cotacoes-gerentes");
    const emitidos = docs.filter(d => normalizar(d.status || "") === "negocio emitido");

    emitidos.sort((a, b) => (toDate(b.dataCriacao) || 0) - (toDate(a.dataCriacao) || 0));

    if (!emitidos.length) {
      container.innerHTML = '<li class="empty-state py-4"><div class="text-sm">Nenhum negócio emitido</div></li>';
      return;
    }

    container.innerHTML = emitidos.slice(0, 5).map(d => {
      const valor = parseValor(d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0);
      return `
        <li class="list-item">
          <div class="icon-box bg-green-100 text-green-600">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-slate-800 text-sm truncate">${d.empresaNome || "Empresa"}</div>
            <div class="text-xs text-slate-500">${d.ramo || "-"}</div>
          </div>
          <div class="text-sm font-bold text-green-600">${fmtBRLShort(valor)}</div>
        </li>
      `;
    }).join('');
  } catch (e) {
    console.warn("[Produção]", e);
  }
}

// ==== Cotações ====
async function carregarCotacoes() {
  const container = document.getElementById("listaCotacoes");
  if (!container) return;

  try {
    const docs = await getDocsPerfil("cotacoes-gerentes");

    docs.sort((a, b) => {
      const dtA = toDate(a.ultimaAtualizacao) || toDate(a.dataCriacao) || 0;
      const dtB = toDate(b.ultimaAtualizacao) || toDate(b.dataCriacao) || 0;
      return dtB - dtA;
    });

    if (!docs.length) {
      container.innerHTML = '<li class="empty-state py-4"><div class="text-sm">Nenhuma cotação</div></li>';
      return;
    }

    container.innerHTML = docs.slice(0, 5).map(d => {
      const valor = parseValor(d.valorFinal ?? d.valorDesejado ?? d.premio ?? 0);
      const badge = getBadge(d.status);
      return `
        <li class="list-item">
          <div class="icon-box bg-amber-100 text-amber-600">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="font-semibold text-slate-800 text-sm truncate">${d.empresaNome || "Empresa"}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-500">${d.ramo || "-"}</span>
              <span class="${badge} text-[10px]">${d.status || "-"}</span>
            </div>
          </div>
          <div class="text-sm font-semibold text-slate-600">${fmtBRLShort(valor)}</div>
        </li>
      `;
    }).join('');
  } catch (e) {
    console.warn("[Cotações]", e);
  }
}

// ==== Drawer Mobile ====
function initDrawer() {
  const nav = document.getElementById('menuNav');
  const overlay = document.getElementById('sidebarOverlay');
  const fabMenu = document.getElementById('fabMenu');
  if (!nav || !overlay) return;

  const open = () => {
    if (window.innerWidth >= 1024) return;
    nav.classList.remove('hidden');
    overlay.classList.add('show');
    document.body.classList.add('overflow-hidden');
  };

  const close = () => {
    if (window.innerWidth >= 1024) return;
    nav.classList.add('hidden');
    overlay.classList.remove('show');
    document.body.classList.remove('overflow-hidden');
  };

  fabMenu?.addEventListener('click', e => { e.preventDefault(); open(); });
  overlay.addEventListener('click', close);

  document.addEventListener('click', e => {
    if (window.innerWidth >= 1024) return;
    if (!nav.contains(e.target) && !fabMenu?.contains(e.target)) close();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      overlay.classList.remove('show');
      document.body.classList.remove('overflow-hidden');
      nav.classList.remove('hidden');
    } else {
      nav.classList.add('hidden');
    }
  });
}

// ==== Modal Troca Senha ====
function initModal() {
  const modal = document.getElementById("modalTrocaSenha");
  const form = document.getElementById("formTrocarSenha");
  const abrir = document.getElementById("abrirTrocaSenha");
  const fechar = document.getElementById("fecharTrocaSenha");
  const overlay = document.getElementById("modalOverlay");
  const erroEl = document.getElementById("trocaErro");
  const infoEl = document.getElementById("trocaInfo");

  if (!modal || !form) return;

  const abrirModal = () => {
    erroEl && (erroEl.textContent = "");
    infoEl && (infoEl.textContent = "");
    form.reset();
    modal.classList.add("show");
  };

  const fecharModal = () => modal.classList.remove("show");

  abrir?.addEventListener("click", abrirModal);
  fechar?.addEventListener("click", fecharModal);
  overlay?.addEventListener("click", fecharModal);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    erroEl && (erroEl.textContent = "");
    infoEl && (infoEl.textContent = "");

    const senhaAtual = document.getElementById("senhaAtual").value.trim();
    const novaSenha = document.getElementById("novaSenha").value.trim();
    const novaSenha2 = document.getElementById("novaSenha2").value.trim();

    if (novaSenha !== novaSenha2) {
      erroEl && (erroEl.textContent = "As senhas não conferem.");
      return;
    }
    if (novaSenha.length < 6) {
      erroEl && (erroEl.textContent = "Mínimo 6 caracteres.");
      return;
    }

    const user = auth.currentUser;
    if (!user?.email) {
      erroEl && (erroEl.textContent = "Não autenticado.");
      return;
    }

    try {
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, senhaAtual);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(novaSenha);
      infoEl && (infoEl.textContent = "Senha atualizada!");
      setTimeout(() => auth.signOut().then(() => location.href = "login.html"), 1500);
    } catch (err) {
      erroEl && (erroEl.textContent = err?.message || "Erro.");
    }
  });
}

// ==== Start ====
initAuth();
