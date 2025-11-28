// admin-banco/js/painel.js — Painel Moderno (menu + KPIs + listas + gráficos + comparações)

// ==== Firebase base ====
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid: null, perfil: null, agenciaId: null, nome: null };

// Admins por e-mail (fallback quando não há usuarios_banco/{uid})
const ADMIN_EMAILS = ["patrick@retornoseguros.com.br"];

// Cache para evitar múltiplas chamadas
const CACHE = {
  empresas: null,
  visitas: null,
  agendaVisitas: null,
  cotacoes: null,
  cotacoesAgencia: null, // para comparação
  timestamp: 0
};
const CACHE_TTL = 60000; // 1 minuto

// ==== Utils ====
const normalizarPerfil = (p) => String(p || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[-_]+/g, " ").trim();

const normalizar = (s) => String(s || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().trim();

const toDate = (x) => x?.toDate ? x.toDate() : (x ? new Date(x) : null);
const fmtData = (d) => d ? d.toLocaleDateString("pt-BR") : "-";
const fmtHora = (d) => d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDataHora = (d) => d ? `${fmtData(d)} ${fmtHora(d)}` : "-";

const parseValor = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const limp = String(v)
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(limp);
  return Number.isFinite(n) ? n : 0;
};

const fmtBRL = (n) => `R$ ${parseValor(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtBRLShort = (n) => {
  const val = parseValor(n);
  if (val >= 1000000) return `R$ ${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `R$ ${(val / 1000).toFixed(1)}K`;
  return fmtBRL(val);
};

function skeleton(id, n = 3) {
  const ul = document.getElementById(id);
  if (!ul) return;
  ul.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const li = document.createElement("li");
    li.className = "skeleton h-14 rounded-xl";
    ul.appendChild(li);
  }
}

// ==== Persistência ====
async function ensurePersistence() {
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (e1) {
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    } catch (e2) {
      await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
    }
  }
}

// ==== Auth + contexto ====
async function initAuth() {
  await ensurePersistence();

  const failback = setTimeout(() => {
    if (!auth.currentUser) location.href = "login.html";
  }, 5000);

  auth.onAuthStateChanged(async (user) => {
    if (!user) { clearTimeout(failback); location.href = "login.html"; return; }
    clearTimeout(failback);

    CTX.uid = user.uid;

    let snap = null;
    try { snap = await db.collection("usuarios_banco").doc(user.uid).get(); }
    catch (e) { console.warn("Erro lendo usuarios_banco:", e?.message); }

    if (!snap || !snap.exists) {
      if (ADMIN_EMAILS.includes((user.email || "").toLowerCase())) {
        CTX.perfil = "admin";
        CTX.agenciaId = null;
        CTX.nome = user.email || "admin";
        initDashboard();
        return;
      } else {
        const elPerfil = document.getElementById("perfilUsuario");
        if (elPerfil) elPerfil.textContent = "Usuário sem perfil cadastrado";
        return;
      }
    }

    const d = snap.data();
    CTX.perfil = normalizarPerfil(d.perfil || "");
    CTX.agenciaId = d.agenciaId || d.agenciaid || null;
    CTX.nome = d.nome || user.email;

    initDashboard();
  });
}

// ==== Inicializar Dashboard ====
function initDashboard() {
  atualizarTopo();
  montarMenuLateral(CTX.perfil);
  carregarTudo();
  initDrawerMobile();
}

async function carregarTudo() {
  // Carrega em paralelo para performance
  await Promise.all([
    carregarKPIs(),
    carregarResumoPainel(),
    carregarGraficos(),
    carregarComparacoes(),
    carregarFeedMovimentacoes()
  ]);
}

// ==== Header (saudação + perfil enxuto) ====
function atualizarTopo() {
  const titulo = document.getElementById("tituloSaudacao");
  const hora = new Date().getHours();
  let saudacao = "Olá";
  if (hora >= 5 && hora < 12) saudacao = "Bom dia";
  else if (hora >= 12 && hora < 18) saudacao = "Boa tarde";
  else saudacao = "Boa noite";
  
  if (titulo) titulo.textContent = `${saudacao}, ${CTX.nome?.split(' ')[0] || 'Usuário'}`;

  const elPerfil = document.getElementById("perfilUsuario");
  if (elPerfil) {
    const p = (CTX.perfil || "").toLowerCase();
    const label =
      p === "rm" ? "Gerente de Relacionamento" :
      p === "admin" ? "Administrador" :
      p === "assistente" ? "Assistente" :
      (p.includes("gerente") ? "Gerente Chefe" : (CTX.perfil || "").toUpperCase());
    elPerfil.textContent = label;
  }
}

// ==== Menu lateral ====
function montarMenuLateral(perfilBruto) {
  const nav = document.getElementById("menuNav");
  if (!nav) return;
  nav.innerHTML = "";

  const perfil = normalizarPerfil(perfilBruto);

  const ICON = {
    gerentes: `<span>👤</span>`,
    empresa: `<span>🏢</span>`,
    agencia: `<span>🏦</span>`,
    agenda: `<span>📅</span>`,
    visitas: `<span>📌</span>`,
    cotacao: `<span>📄</span>`,
    producao: `<span>📈</span>`,
    dicas: `<span>💡</span>`,
    consultar: `<span>🔎</span>`,
    ramos: `<span>🧩</span>`,
    rel: `<span>📊</span>`,
    venc: `<span>⏰</span>`,
    func: `<span>🧍</span>`,
    carteira: `<span>👛</span>`,
    comissoes: `<span>💵</span>`,
    resgates: `<span>🔐</span>`,
    financeiro: `<span>💳</span>`,
    home: `<span>🏠</span>`
  };

  const GRUPOS = [
    { titulo: "Principal", itens: [
      ["Painel", "painel.html", ICON.home],
    ]},
    { titulo: "Cadastros", itens: [
      ["Cadastrar Gerentes", "cadastro-geral.html", ICON.gerentes],
      ["Cadastrar Empresa", "cadastro-empresa.html", ICON.empresa],
      ["Agências", "agencias.html", ICON.agencia],
      ["Empresas", "empresas.html", ICON.empresa],
      ["Funcionários", "funcionarios.html", ICON.func]
    ]},
    { titulo: "Operações", itens: [
      ["Agenda Visitas", "agenda-visitas.html", ICON.agenda],
      ["Visitas", "visitas.html", ICON.visitas],
      ["Solicitações de Cotação", "cotacoes.html", ICON.cotacao],
      ["Produção", "negocios-fechados.html", ICON.producao],
      ["Financeiro", "financeiro.html", ICON.financeiro],
      ["Dicas Produtos", "dicas-produtos.html", ICON.dicas],
      ["Consultar Dicas", "consultar-dicas.html", ICON.consultar],
      ["Ramos Seguro", "ramos-seguro.html", ICON.ramos]
    ]},
    { titulo: "Relatórios", itens: [
      ["Relatório Visitas", "visitas-relatorio.html", ICON.rel],
      ["Vencimentos", "vencimentos.html", ICON.venc],
      ["Relatórios", "relatorios.html", ICON.rel]
    ]},
    { titulo: "Admin", adminOnly: true, itens: [
      ["Carteira", "carteira.html", ICON.carteira],
      ["Comissões", "comissoes.html", ICON.comissoes],
      ["Resgates (Admin)", "resgates-admin.html", ICON.resgates]
    ]}
  ];

  // Perfis permitidos por rota
  const ROTAS_POR_PERFIL = {
    "admin": new Set([...GRUPOS.flatMap(g => g.itens.map(i => i[1]))]),
    "rm": new Set([
      "painel.html", "cadastro-empresa.html", "agenda-visitas.html", "visitas.html", "empresas.html",
      "cotacoes.html", "negocios-fechados.html", "consultar-dicas.html", "visitas-relatorio.html",
      "vencimentos.html", "funcionarios.html", "financeiro.html"
    ]),
    "gerente chefe": new Set([
      "painel.html", "cadastro-empresa.html", "agenda-visitas.html", "visitas.html", "empresas.html",
      "cotacoes.html", "negocios-fechados.html", "consultar-dicas.html", "visitas-relatorio.html",
      "vencimentos.html", "funcionarios.html", "financeiro.html"
    ]),
    "assistente": new Set([
      "painel.html", "agenda-visitas.html", "visitas.html", "cotacoes.html", "consultar-dicas.html",
      "funcionarios.html", "financeiro.html"
    ])
  };
  const perfilKey = ["gerente chefe", "gerente-chefe", "gerente_chefe"].includes(perfil) ? "gerente chefe" : perfil;
  const pode = ROTAS_POR_PERFIL[perfilKey] || new Set();

  const frag = document.createDocumentFragment();
  const currentPage = window.location.pathname.split('/').pop() || 'painel.html';

  GRUPOS.forEach(grupo => {
    if (grupo.adminOnly && perfilKey !== "admin") return;

    let permitidos = grupo.itens.filter(([_, href]) => perfilKey === "admin" || pode.has(href));

    // guarda extra: se NÃO for admin, nunca mostrar "dicas-produtos" e "ramos-seguro"
    if (perfilKey !== "admin") {
      permitidos = permitidos.filter(([_, href]) => href !== "dicas-produtos.html" && href !== "ramos-seguro.html");
    }

    if (!permitidos.length) return;

    const h = document.createElement("div");
    h.className = "nav-group-title mt-4 first:mt-0";
    h.textContent = grupo.titulo;
    frag.appendChild(h);

    permitidos.forEach(([label, href, icon]) => {
      const a = document.createElement("a");
      a.href = href;
      a.className = `nav-link ${currentPage === href ? 'active' : ''}`;
      a.innerHTML = `<span class="nav-icon">${icon}</span><span>${label}</span>`;
      frag.appendChild(a);
    });
  });

  nav.appendChild(frag);
  if (window.innerWidth >= 1024) nav.classList.remove("hidden");
}

// ==== Helper para queries por perfil (com cache) ====
async function getDocsPerfil(colName, limitN = 0, forceRefresh = false) {
  const cacheKey = colName;
  const now = Date.now();
  
  if (!forceRefresh && CACHE[cacheKey] && (now - CACHE.timestamp) < CACHE_TTL) {
    return CACHE[cacheKey];
  }

  const col = db.collection(colName);
  const perfil = CTX.perfil;
  let snaps = [];

  if (perfil === "admin") {
    snaps = [await (limitN ? col.limit(limitN).get() : col.get())];
  } else if (perfil === "rm") {
    snaps = [await (limitN ? col.where("rmUid", "==", CTX.uid).limit(limitN).get()
                           : col.where("rmUid", "==", CTX.uid).get())];
  } else if (perfil === "assistente" || perfil === "gerente chefe") {
    const s1 = await (limitN ? col.where("agenciaId", "==", CTX.agenciaId).limit(limitN).get()
                             : col.where("agenciaId", "==", CTX.agenciaId).get());
    let s2 = { forEach: () => {}, empty: true, docs: [] };
    try {
      s2 = await (limitN ? col.where("gerenteChefeUid", "==", CTX.uid).limit(limitN).get()
                         : col.where("gerenteChefeUid", "==", CTX.uid).get());
    } catch (e) { /* opcional */ }
    snaps = [s1, s2];
  } else {
    snaps = [await (limitN ? col.limit(limitN).get() : col.get())];
  }

  const map = new Map();
  snaps.forEach(s => s.forEach(d => map.set(d.id, d)));
  const result = Array.from(map.values());
  
  CACHE[cacheKey] = result;
  CACHE.timestamp = now;
  
  return result;
}

// ==== Buscar dados da agência (para comparação) ====
async function getDocsAgencia(colName) {
  if (!CTX.agenciaId) return [];
  
  const cacheKey = colName + 'Agencia';
  const now = Date.now();
  
  if (CACHE[cacheKey] && (now - CACHE.timestamp) < CACHE_TTL) {
    return CACHE[cacheKey];
  }

  try {
    const snap = await db.collection(colName).where("agenciaId", "==", CTX.agenciaId).get();
    const result = snap.docs.map(d => d.data());
    CACHE[cacheKey] = result;
    return result;
  } catch (e) {
    console.warn("Erro ao buscar dados da agência:", e);
    return [];
  }
}

// ==== KPIs (topo) ====
async function carregarKPIs() {
  const perfil = CTX.perfil;
  const ano = new Date().getFullYear();
  const iniAno = new Date(ano, 0, 1);
  const fimAno = new Date(ano + 1, 0, 1);

  // rótulos dinâmicos
  const lblV = document.getElementById("lblVisitas");
  const lblC = document.getElementById("lblCotacoes");
  if (lblV) lblV.textContent = (perfil === "gerente chefe" ? "Visitas (ano)" : "Visitas (últ. 30d)");
  if (lblC) lblC.textContent = (perfil === "gerente chefe" ? "Cotações (ano)" : "Cotações");

  // Empresas
  try {
    let docs = await getDocsPerfil("empresas");
    animateNumber("kpiEmpresas", docs.length);
  } catch (e) { console.warn("[KPI Empresas]", e.message); }

  // Visitas
  try {
    let docs = await getDocsPerfil("visitas");
    if (perfil === "gerente chefe") {
      docs = docs.filter(d => {
        const data = toDate(d.data ? d.data() : d)?.data || toDate((d.data ? d.data() : d).data);
        return data && data >= iniAno && data < fimAno;
      });
    } else {
      const d30 = new Date(); d30.setDate(d30.getDate() - 30);
      docs = docs.filter(d => {
        const data = toDate((d.data ? d.data() : d).data);
        return data && data >= d30;
      });
    }
    animateNumber("kpiVisitas", docs.length);
  } catch (e) { console.warn("[KPI Visitas]", e.message); }

  // Cotações
  try {
    let docs = await getDocsPerfil("cotacoes-gerentes");
    if (perfil === "gerente chefe") {
      docs = docs.filter(d => {
        const dd = d.data ? d.data() : d;
        const dt = toDate(dd.dataCriacao) || toDate(dd.data);
        return dt && dt >= iniAno && dt < fimAno;
      });
    }
    animateNumber("kpiCotacoes", docs.length);
  } catch (e) { console.warn("[KPI Cotações]", e.message); }

  // Produção (emissão)
  try {
    let docs = await getDocsPerfil("cotacoes-gerentes");
    let total = 0;
    docs.forEach(doc => {
      const d = doc.data ? doc.data() : doc;
      const st = normalizar(d.status || "");
      const dt = toDate(d.dataCriacao) || toDate(d.vigenciaInicial) || toDate(d.vigenciaInicio) || new Date(0);
      if (st === "negocio emitido" && dt >= iniAno && dt < fimAno) {
        const v = d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0;
        total += parseValor(v);
      }
    });
    document.getElementById("kpiProducao").textContent = fmtBRLShort(total);
  } catch (e) { console.warn("[KPI Produção]", e.message); }
}

// Animação de números
function animateNumber(elementId, target, duration = 800) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const start = 0;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (target - start) * easeOut);
    el.textContent = current.toLocaleString('pt-BR');
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

// ==== Gráficos ====
let chartStatus = null;

async function carregarGraficos() {
  try {
    const docs = await getDocsPerfil("cotacoes-gerentes");
    const statusCount = {};
    
    docs.forEach(doc => {
      const d = doc.data ? doc.data() : doc;
      const status = d.status || "Sem status";
      statusCount[status] = (statusCount[status] || 0) + 1;
    });

    const labels = Object.keys(statusCount);
    const data = Object.values(statusCount);
    
    // Cores por status
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
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: cores,
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 15,
              font: { family: 'DM Sans', size: 11 }
            }
          }
        }
      }
    });
  } catch (e) {
    console.warn("[Gráfico Status]", e.message);
  }
}

// ==== Comparações (Você vs Agência) ====
async function carregarComparacoes() {
  if (CTX.perfil === "admin") {
    // Admin vê dados gerais, não faz sentido "você vs agência"
    document.querySelector('.card:has(#compCotacoesVoce)')?.classList.add('hidden');
    return;
  }

  const mesAtual = new Date();
  const iniMes = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1);
  const fimMes = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 0, 23, 59, 59);

  try {
    // Dados do usuário
    const meusDocs = await getDocsPerfil("cotacoes-gerentes");
    const meusDocsNoMes = meusDocs.filter(doc => {
      const d = doc.data ? doc.data() : doc;
      const dt = toDate(d.dataCriacao);
      return dt && dt >= iniMes && dt <= fimMes;
    });
    
    // Minhas cotações no mês
    const minhasCotacoes = meusDocsNoMes.length;
    
    // Minha produção (emitidos)
    let minhaProducao = 0;
    meusDocs.forEach(doc => {
      const d = doc.data ? doc.data() : doc;
      const st = normalizar(d.status || "");
      const dt = toDate(d.dataCriacao);
      if (st === "negocio emitido" && dt && dt >= iniMes && dt <= fimMes) {
        minhaProducao += parseValor(d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0);
      }
    });

    // Dados da agência (todos os gerentes)
    const docsAgencia = await getDocsAgencia("cotacoes-gerentes");
    const docsAgenciaMes = docsAgencia.filter(d => {
      const dt = toDate(d.dataCriacao);
      return dt && dt >= iniMes && dt <= fimMes;
    });
    
    const cotacoesAgencia = docsAgenciaMes.length;
    
    let producaoAgencia = 0;
    docsAgencia.forEach(d => {
      const st = normalizar(d.status || "");
      const dt = toDate(d.dataCriacao);
      if (st === "negocio emitido" && dt && dt >= iniMes && dt <= fimMes) {
        producaoAgencia += parseValor(d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0);
      }
    });

    // Atualizar UI - Cotações
    document.getElementById("compCotacoesVoce").textContent = minhasCotacoes;
    document.getElementById("compCotacoesAgencia").textContent = cotacoesAgencia;
    const percCotacoes = cotacoesAgencia > 0 ? (minhasCotacoes / cotacoesAgencia) * 100 : 0;
    document.getElementById("barCotacoesVoce").style.width = `${Math.min(percCotacoes, 100)}%`;

    // Atualizar UI - Produção
    document.getElementById("compProducaoVoce").textContent = fmtBRLShort(minhaProducao);
    document.getElementById("compProducaoAgencia").textContent = fmtBRLShort(producaoAgencia);
    const percProducao = producaoAgencia > 0 ? (minhaProducao / producaoAgencia) * 100 : 0;
    document.getElementById("barProducaoVoce").style.width = `${Math.min(percProducao, 100)}%`;

    // Produção por Ramo
    const ramosProd = {};
    meusDocs.forEach(doc => {
      const d = doc.data ? doc.data() : doc;
      const st = normalizar(d.status || "");
      if (st === "negocio emitido") {
        const ramo = d.ramo || "Outros";
        const valor = parseValor(d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0);
        ramosProd[ramo] = (ramosProd[ramo] || 0) + valor;
      }
    });

    const ramosDiv = document.getElementById("producaoRamos");
    if (ramosDiv) {
      const entries = Object.entries(ramosProd).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (entries.length === 0) {
        ramosDiv.innerHTML = '<div class="text-slate-400 text-sm">Nenhuma produção registrada</div>';
      } else {
        const maxVal = entries[0][1];
        ramosDiv.innerHTML = entries.map(([ramo, valor]) => {
          const perc = maxVal > 0 ? (valor / maxVal) * 100 : 0;
          return `
            <div class="flex items-center gap-3">
              <div class="w-24 text-xs text-slate-600 truncate">${ramo}</div>
              <div class="flex-1 comparison-bar">
                <div class="fill you" style="width: ${perc}%"></div>
              </div>
              <div class="text-xs font-semibold text-slate-700 w-20 text-right">${fmtBRLShort(valor)}</div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (e) {
    console.warn("[Comparações]", e.message);
  }
}

// ==== Feed de Movimentações ====
async function carregarFeedMovimentacoes() {
  const container = document.getElementById("feedMovimentacoes");
  if (!container) return;

  try {
    const docs = await getDocsPerfil("cotacoes-gerentes");
    
    // Pegar as últimas 5 cotações com interações
    const comInteracoes = [];
    
    docs.forEach(doc => {
      const d = doc.data ? doc.data() : doc;
      const interacoes = d.interacoes || [];
      
      if (interacoes.length > 0) {
        // Pegar a última interação
        const ultima = [...interacoes].sort((a, b) => {
          const dtA = toDate(a.dataHora) || new Date(0);
          const dtB = toDate(b.dataHora) || new Date(0);
          return dtB - dtA;
        })[0];
        
        comInteracoes.push({
          id: doc.id || d.id,
          empresaNome: d.empresaNome || "Empresa",
          ramo: d.ramo || "-",
          status: d.status || "-",
          ultimaInteracao: ultima,
          dataInteracao: toDate(ultima.dataHora)
        });
      }
    });

    // Ordenar por data da última interação
    comInteracoes.sort((a, b) => (b.dataInteracao || 0) - (a.dataInteracao || 0));
    
    const ultimas = comInteracoes.slice(0, 5);

    if (ultimas.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <div class="text-sm">Nenhuma movimentação recente</div>
        </div>
      `;
      return;
    }

    container.innerHTML = ultimas.map(item => {
      const tipo = item.ultimaInteracao.tipo || "observacao";
      const cardClass = tipo === "mudanca_status" ? "pending" : "new";
      const badge = getBadgeStatus(item.status);
      
      return `
        <a href="chat-cotacao.html?id=${item.id}" class="msg-card ${cardClass} block">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-semibold text-brand-800 truncate">${item.empresaNome}</span>
                <span class="${badge.class}">${item.status}</span>
              </div>
              <div class="text-sm text-slate-600 line-clamp-2">
                ${item.ultimaInteracao.mensagem || "Sem mensagem"}
              </div>
              <div class="flex items-center gap-2 mt-2 text-xs text-slate-400">
                <span>${item.ultimaInteracao.autorNome || "Usuário"}</span>
                <span>•</span>
                <span>${fmtDataHora(item.dataInteracao)}</span>
              </div>
            </div>
            <div class="text-slate-400 text-lg">→</div>
          </div>
        </a>
      `;
    }).join('');
  } catch (e) {
    console.warn("[Feed Movimentações]", e.message);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="text-sm">Erro ao carregar movimentações</div>
      </div>
    `;
  }
}

function getBadgeStatus(status) {
  const st = normalizar(status);
  if (st.includes("emitido")) return { class: "badge badge-success" };
  if (st.includes("fechado")) return { class: "badge badge-success" };
  if (st.includes("pendente")) return { class: "badge badge-warning" };
  if (st.includes("recusado")) return { class: "badge badge-danger" };
  if (st.includes("iniciado")) return { class: "badge badge-info" };
  if (st.includes("emissao")) return { class: "badge badge-info" };
  return { class: "badge badge-muted" };
}

// ==== Painel: listas ====
async function carregarResumoPainel() {
  skeleton("listaVisitasAgendadas", 3);
  skeleton("listaVisitas", 3);
  skeleton("listaProducao", 3);
  skeleton("listaCotacoes", 3);

  await Promise.all([
    blocoVisitasAgendadas(),
    blocoMinhasVisitas(),
    blocoProducao(),
    blocoMinhasCotacoes()
  ]);
}

// 1) Visitas Agendadas
async function blocoVisitasAgendadas() {
  const now = Date.now();
  const docs = await getDocsPerfil("agenda_visitas");
  const futuros = [];

  docs.forEach(doc => {
    const d = doc.data ? doc.data() : doc;
    const dt = toDate(d.dataHoraTs) || toDate(d.dataHoraStr) || toDate(d.dataHora);
    if (dt && !isNaN(dt) && dt.getTime() >= now) futuros.push({ ...d, dt });
  });
  futuros.sort((a, b) => a.dt - b.dt);

  let arr = futuros.slice(0, 5);
  if (arr.length === 0) {
    const limite = now - 20 * 24 * 60 * 60 * 1000;
    const recentes = [];
    docs.forEach(doc => {
      const d = doc.data ? doc.data() : doc;
      const dt = toDate(d.dataHoraTs) || toDate(d.dataHoraStr) || toDate(d.dataHora);
      if (dt && !isNaN(dt) && dt.getTime() >= limite) recentes.push({ ...d, dt });
    });
    recentes.sort((a, b) => a.dt - b.dt);
    arr = recentes.slice(0, 5);
  }

  document.getElementById("qtdVA").textContent = String(arr.length);

  const ul = document.getElementById("listaVisitasAgendadas");
  if (!ul) return;
  
  if (arr.length === 0) {
    ul.innerHTML = `
      <li class="empty-state py-6">
        <div class="empty-state-icon">📅</div>
        <div class="text-sm">Nenhuma visita agendada</div>
      </li>
    `;
    return;
  }

  ul.innerHTML = arr.map(v => `
    <li class="row-item">
      <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-sm flex-shrink-0">
        📅
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-brand-800 truncate">${v.empresaNome || v.empresa || "-"}</div>
        <div class="text-xs text-slate-500">${fmtData(v.dt)} às ${fmtHora(v.dt)} • ${v.tipo || "-"}</div>
      </div>
      <div class="text-xs text-slate-400">${v.rmNome || v.rm || ""}</div>
    </li>
  `).join('');
}

// 2) Minhas Visitas (últimas 5)
async function blocoMinhasVisitas() {
  const docs = await getDocsPerfil("visitas");
  const ul = document.getElementById("listaVisitas");
  if (!ul) return;

  if (!docs.length) {
    ul.innerHTML = `
      <li class="empty-state py-6">
        <div class="empty-state-icon">📌</div>
        <div class="text-sm">Nenhuma visita registrada</div>
      </li>
    `;
    return;
  }

  const cacheEmp = new Map();
  const getEmpresaNome = async (id, fb) => {
    if (fb) return fb;
    if (!id) return "-";
    if (cacheEmp.has(id)) return cacheEmp.get(id);
    const dd = await db.collection("empresas").doc(id).get();
    const nome = dd.exists ? (dd.data().nome || dd.data().razaoSocial || "-") : "-";
    cacheEmp.set(id, nome);
    return nome;
  };

  const ord = (x) => toDate((x.data ? x.data() : x).data) || new Date(0);
  const last5 = docs.sort((a, b) => ord(b) - ord(a)).slice(0, 5);

  const items = [];
  for (const doc of last5) {
    const v = doc.data ? doc.data() : doc;
    const dt = toDate(v.data);
    const nomeEmp = await getEmpresaNome(v.empresaId, v.empresaNome);
    items.push({ nomeEmp, dt, tipo: v.tipo });
  }

  ul.innerHTML = items.map(item => `
    <li class="row-item">
      <div class="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center text-sm flex-shrink-0">
        📌
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-brand-800 truncate">${item.nomeEmp}</div>
        <div class="text-xs text-slate-500">${fmtData(item.dt)}${item.tipo ? " • " + item.tipo : ""}</div>
      </div>
    </li>
  `).join('');
}

// 3) Produção (emitidos)
async function blocoProducao() {
  const docs = await getDocsPerfil("cotacoes-gerentes");
  const ul = document.getElementById("listaProducao");
  if (!ul) return;

  const emitidos = [];
  docs.forEach(doc => {
    const d = doc.data ? doc.data() : doc;
    const st = normalizar(d.status || "");
    if (st === "negocio emitido") emitidos.push(d);
  });

  if (!emitidos.length) {
    ul.innerHTML = `
      <li class="empty-state py-6">
        <div class="empty-state-icon">📈</div>
        <div class="text-sm">Nenhum negócio emitido</div>
      </li>
    `;
    return;
  }

  emitidos.sort((a, b) => (toDate(b.dataCriacao) || 0) - (toDate(a.dataCriacao) || 0));
  
  ul.innerHTML = emitidos.slice(0, 5).map(d => {
    const valor = d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0;
    const vIni = toDate(d.vigenciaInicial) || toDate(d.vigenciaInicio) || toDate(d.vigencia_de) || null;
    const inicio = vIni ? `Início: ${fmtData(vIni)}` : "";
    
    return `
      <li class="row-item">
        <div class="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-sm flex-shrink-0">
          💰
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-brand-800 truncate">${d.empresaNome || "Empresa"}</div>
          <div class="text-xs text-slate-500">${d.ramo || "Ramo"}${inicio ? " • " + inicio : ""}</div>
        </div>
        <div class="text-sm font-semibold text-green-600">${fmtBRLShort(valor)}</div>
      </li>
    `;
  }).join('');
}

// 4) Minhas Cotações
async function blocoMinhasCotacoes() {
  let docs = await getDocsPerfil("cotacoes-gerentes");
  const ul = document.getElementById("listaCotacoes");
  if (!ul) return;

  if (!docs.length) {
    ul.innerHTML = `
      <li class="empty-state py-6">
        <div class="empty-state-icon">📋</div>
        <div class="text-sm">Nenhuma cotação encontrada</div>
      </li>
    `;
    return;
  }

  const ord = (x) => {
    const d = x.data ? x.data() : x;
    return toDate(d.ultimaAtualizacao) || toDate(d.atualizadoEm) ||
           toDate(d.dataCriacao) || toDate(d.data) || new Date(0);
  };
  docs = docs.sort((a, b) => ord(b) - ord(a)).slice(0, 5);

  ul.innerHTML = docs.map(x => {
    const d = x.data ? x.data() : x;
    const valor = d.valorFinal ?? d.valorDesejado ?? d.premio ?? 0;
    const badge = getBadgeStatus(d.status);
    
    return `
      <li class="row-item">
        <div class="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-sm flex-shrink-0">
          📋
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="font-semibold text-brand-800 truncate">${d.empresaNome || "Empresa"}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500">${d.ramo || "Ramo"}</span>
            <span class="${badge.class} text-[10px]">${d.status || "-"}</span>
          </div>
        </div>
        <div class="text-sm font-semibold text-slate-600">${fmtBRLShort(valor)}</div>
      </li>
    `;
  }).join('');
}

// ==== Drawer Mobile (animação) ====
function initDrawerMobile() {
  const nav = document.getElementById('menuNav');
  const body = document.body;
  const overlay = document.getElementById('sidebarOverlay');
  const fabMenu = document.getElementById('fabMenu');

  if (!nav || !overlay) return;

  const openNav = () => {
    if (window.innerWidth >= 1024) return;
    nav.classList.remove('hidden');
    overlay.classList.add('show');
    body.classList.add('overflow-hidden');
  };

  const closeNav = () => {
    if (window.innerWidth >= 1024) return;
    nav.classList.add('hidden');
    overlay.classList.remove('show');
    body.classList.remove('overflow-hidden');
  };

  fabMenu?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openNav(); });
  overlay.addEventListener('click', closeNav);
  
  document.addEventListener('click', (e) => {
    if (window.innerWidth >= 1024) return;
    if (!nav.contains(e.target) && !fabMenu?.contains(e.target)) closeNav();
  });
  
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      overlay.classList.remove('show');
      body.classList.remove('overflow-hidden');
      nav.classList.remove('hidden');
    } else {
      nav.classList.add('hidden');
    }
  });
}

// ==== Troca de senha ====
(function initTrocaSenha() {
  const abrir = document.getElementById("abrirTrocaSenha");
  const fechar = document.getElementById("fecharTrocaSenha");
  const modal = document.getElementById("modalTrocaSenha");
  const form = document.getElementById("formTrocarSenha");
  const erroEl = document.getElementById("trocaErro");
  const infoEl = document.getElementById("trocaInfo");

  if (!abrir || !fechar || !modal || !form) return;

  const abrirModal = () => {
    if (erroEl) erroEl.textContent = "";
    if (infoEl) infoEl.textContent = "";
    form.reset();
    modal.classList.remove("hidden");
  };
  const fecharModal = () => { modal.classList.add("hidden"); };

  abrir.addEventListener("click", abrirModal);
  fechar.addEventListener("click", fecharModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) fecharModal(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (erroEl) erroEl.textContent = "";
    if (infoEl) infoEl.textContent = "";

    const senhaAtual = document.getElementById("senhaAtual").value.trim();
    const novaSenha = document.getElementById("novaSenha").value.trim();
    const novaSenha2 = document.getElementById("novaSenha2").value.trim();

    if (novaSenha !== novaSenha2) {
      if (erroEl) erroEl.textContent = "As senhas novas não conferem.";
      return;
    }
    if (novaSenha.length < 6) {
      if (erroEl) erroEl.textContent = "A nova senha deve ter pelo menos 6 caracteres.";
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      if (erroEl) erroEl.textContent = "Você precisa estar logado.";
      return;
    }

    try {
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, senhaAtual);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(novaSenha);

      if (infoEl) infoEl.textContent = "Senha atualizada com sucesso! Saindo...";
      setTimeout(() => { auth.signOut().then(() => location.href = "login.html"); }, 1200);
    } catch (err) {
      if (erroEl) erroEl.textContent = err?.message || "Erro ao trocar senha.";
    }
  });
})();

// ==== Start ====
initAuth();
