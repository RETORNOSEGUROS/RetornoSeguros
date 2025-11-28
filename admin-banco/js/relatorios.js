// relatorios.js — Super Relatório Gerencial
// Firebase v8 compatível com o resto do sistema

// ==== Firebase Init ====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ==== Estado Global ====
let CTX = { uid: null, perfil: null, agenciaId: null, nome: null, isAdmin: false };
const ADMIN_EMAILS = ["patrick@retornoseguros.com.br"];

let DADOS = {
  cotacoes: [],
  filtrados: [],
  agencias: {},
  rms: {},
  ramos: new Set(),
  status: new Set(),
  seguradoras: new Set()
};

let PAGINACAO = { pagina: 1, itensPorPagina: 20 };
let ORDENACAO = { campo: 'dataCriacao', direcao: 'desc' };
let CHARTS = {};

// ==== Helpers ====
const $ = (id) => document.getElementById(id);
const normalizar = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const normalizarPerfil = (p) => normalizar(p).replace(/[-_]+/g, " ");

const toDate = (x) => {
  if (!x) return null;
  if (x.toDate) return x.toDate();
  if (x instanceof Date) return x;
  const d = new Date(x);
  return isNaN(d) ? null : d;
};

const fmtData = (d) => d ? d.toLocaleDateString("pt-BR") : "-";
const fmtDataHora = (d) => d ? d.toLocaleString("pt-BR") : "-";

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
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return fmtBRL(v);
};

const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtPct = (n) => `${Number(n || 0).toFixed(1)}%`;

// Status helpers
const STATUS_EMITIDO = ["negócio emitido", "negocio emitido", "emitido"];
const STATUS_PENDENTE = ["pendente agência", "pendente corretor", "pendente seguradora", "pendente cliente", "pendente agencia"];
const STATUS_RECUSADO = ["recusado cliente", "recusado seguradora", "emitido declinado"];

function categoriaStatus(status) {
  const st = normalizar(status);
  if (STATUS_EMITIDO.some(s => st.includes(s))) return "emitido";
  if (STATUS_PENDENTE.some(s => st.includes(s))) return "pendente";
  if (STATUS_RECUSADO.some(s => st.includes(s))) return "recusado";
  if (st.includes("emissao") || st.includes("emissão")) return "emissao";
  if (st.includes("fechado")) return "emitido";
  return "outros";
}

function corStatus(status) {
  const cat = categoriaStatus(status);
  switch (cat) {
    case "emitido": return { bg: "#dcfce7", color: "#15803d", class: "badge-success" };
    case "pendente": return { bg: "#fef3c7", color: "#b45309", class: "badge-warning" };
    case "recusado": return { bg: "#fee2e2", color: "#dc2626", class: "badge-danger" };
    case "emissao": return { bg: "#e0e7ff", color: "#4338ca", class: "badge-info" };
    default: return { bg: "#f1f5f9", color: "#64748b", class: "badge-muted" };
  }
}

// ==== Auth ====
auth.onAuthStateChanged(async (user) => {
  if (!user) { location.href = "login.html"; return; }
  CTX.uid = user.uid;
  
  try {
    const snap = await db.collection("usuarios_banco").doc(user.uid).get();
    if (snap.exists) {
      const d = snap.data();
      CTX.perfil = normalizarPerfil(d.perfil || "");
      CTX.agenciaId = d.agenciaId || null;
      CTX.nome = d.nome || user.email;
      CTX.isAdmin = CTX.perfil === "admin" || ADMIN_EMAILS.includes(user.email?.toLowerCase());
    } else if (ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
      CTX.perfil = "admin";
      CTX.isAdmin = true;
      CTX.nome = user.email;
    }
  } catch (e) {
    console.warn("Erro perfil:", e);
  }
  
  init();
});

// ==== Inicialização ====
async function init() {
  $("dataGeracao").textContent = new Date().toLocaleString("pt-BR");
  
  // Eventos
  $("btnAplicar").addEventListener("click", aplicarFiltros);
  $("btnLimpar").addEventListener("click", limparFiltros);
  $("btnExportPDF").addEventListener("click", exportarPDF);
  $("btnExportExcel").addEventListener("click", exportarExcel);
  $("buscaTabela").addEventListener("input", debounce(filtrarTabela, 300));
  
  // Ordenação na tabela
  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => ordenarPor(th.dataset.sort));
  });
  
  // Carregar dados
  await carregarLookups();
  setDefaultDates();
  await carregarDados();
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// ==== Carregar Lookups ====
async function carregarLookups() {
  // Agências
  try {
    const snap = await db.collection("agencias_banco").get();
    snap.forEach(doc => {
      const d = doc.data();
      DADOS.agencias[doc.id] = d.nome || doc.id;
    });
    
    const selAgencia = $("fAgencia");
    selAgencia.innerHTML = '<option value="">Todas</option>';
    
    if (!CTX.isAdmin) {
      // Não-admin vê só sua agência
      const nome = DADOS.agencias[CTX.agenciaId] || CTX.agenciaId;
      selAgencia.innerHTML = `<option value="${CTX.agenciaId}">${nome}</option>`;
      selAgencia.disabled = true;
    } else {
      Object.entries(DADOS.agencias).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, nome]) => {
        selAgencia.innerHTML += `<option value="${id}">${nome}</option>`;
      });
    }
  } catch (e) { console.warn("Erro agências:", e); }
  
  // RMs
  try {
    const snap = await db.collection("usuarios_banco").get();
    snap.forEach(doc => {
      const d = doc.data();
      if (d.nome) DADOS.rms[doc.id] = d.nome;
    });
  } catch (e) { console.warn("Erro RMs:", e); }
}

function setDefaultDates() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), 0, 1); // 1º de janeiro
  $("fDataInicio").value = inicio.toISOString().substring(0, 10);
  $("fDataFim").value = hoje.toISOString().substring(0, 10);
}

// ==== Carregar Dados ====
async function carregarDados() {
  mostrarLoading(true);
  
  try {
    const col = db.collection("cotacoes-gerentes");
    let query;
    
    if (CTX.isAdmin) {
      query = col;
    } else if (["gerente chefe", "assistente"].includes(CTX.perfil) && CTX.agenciaId) {
      query = col.where("agenciaId", "==", CTX.agenciaId);
    } else {
      // RM - buscar por múltiplos campos
      const queries = [
        col.where("rmUid", "==", CTX.uid).get(),
        col.where("rmId", "==", CTX.uid).get(),
        col.where("criadoPorUid", "==", CTX.uid).get()
      ];
      const results = await Promise.allSettled(queries);
      const map = new Map();
      results.forEach(r => {
        if (r.status === "fulfilled") {
          r.value.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
        }
      });
      DADOS.cotacoes = Array.from(map.values());
      processarDados();
      return;
    }
    
    const snap = await query.get();
    DADOS.cotacoes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    processarDados();
    
  } catch (e) {
    console.error("Erro ao carregar:", e);
    mostrarLoading(false);
  }
}

function processarDados() {
  // Limpar sets
  DADOS.ramos.clear();
  DADOS.status.clear();
  DADOS.seguradoras.clear();
  
  // Processar cada cotação
  DADOS.cotacoes.forEach(c => {
    c._dataCriacao = toDate(c.dataCriacao);
    c._valor = parseValor(c.valorFinal ?? c.valorNegocio ?? c.premio ?? c.valorDesejado ?? 0);
    c._status = c.status || "Sem status";
    c._ramo = c.ramo || "Não informado";
    c._empresaNome = c.empresaNome || "Empresa";
    c._rmNome = c.rmNome || DADOS.rms[c.rmUid] || DADOS.rms[c.rmId] || "-";
    c._agenciaNome = DADOS.agencias[c.agenciaId] || c.agenciaId || "-";
    c._seguradora = c.seguradora || "-";
    
    // Calcular dias aberto
    if (c._dataCriacao) {
      c._diasAberto = Math.floor((new Date() - c._dataCriacao) / (1000 * 60 * 60 * 24));
    } else {
      c._diasAberto = 0;
    }
    
    // Coletar para filtros
    if (c._ramo) DADOS.ramos.add(c._ramo);
    if (c._status) DADOS.status.add(c._status);
    if (c._seguradora && c._seguradora !== "-") DADOS.seguradoras.add(c._seguradora);
  });
  
  // Popular filtros
  popularFiltros();
  
  // Aplicar filtros iniciais
  aplicarFiltros();
}

function popularFiltros() {
  // RMs
  const selRM = $("fRM");
  selRM.innerHTML = '<option value="">Todos</option>';
  const rmsUnicos = [...new Set(DADOS.cotacoes.map(c => c._rmNome).filter(Boolean))].sort();
  rmsUnicos.forEach(rm => {
    selRM.innerHTML += `<option value="${rm}">${rm}</option>`;
  });
  
  // Status
  const selStatus = $("fStatus");
  selStatus.innerHTML = '<option value="">Todos</option>';
  [...DADOS.status].sort().forEach(st => {
    selStatus.innerHTML += `<option value="${st}">${st}</option>`;
  });
  
  // Ramos
  const selRamo = $("fRamo");
  selRamo.innerHTML = '<option value="">Todos</option>';
  [...DADOS.ramos].sort().forEach(r => {
    selRamo.innerHTML += `<option value="${r}">${r}</option>`;
  });
  
  // Seguradoras
  const selSeg = $("fSeguradora");
  selSeg.innerHTML = '<option value="">Todas</option>';
  [...DADOS.seguradoras].sort().forEach(s => {
    selSeg.innerHTML += `<option value="${s}">${s}</option>`;
  });
}

// ==== Filtros ====
function aplicarFiltros() {
  const dataInicio = $("fDataInicio").value ? new Date($("fDataInicio").value + "T00:00:00") : null;
  const dataFim = $("fDataFim").value ? new Date($("fDataFim").value + "T23:59:59") : null;
  const agencia = $("fAgencia").value;
  const rm = $("fRM").value;
  const status = $("fStatus").value;
  const ramo = $("fRamo").value;
  const empresa = normalizar($("fEmpresa").value);
  const valorMin = parseValor($("fValorMin").value);
  const valorMax = parseValor($("fValorMax").value) || Infinity;
  const seguradora = $("fSeguradora").value;
  
  DADOS.filtrados = DADOS.cotacoes.filter(c => {
    if (dataInicio && c._dataCriacao && c._dataCriacao < dataInicio) return false;
    if (dataFim && c._dataCriacao && c._dataCriacao > dataFim) return false;
    if (agencia && c.agenciaId !== agencia) return false;
    if (rm && c._rmNome !== rm) return false;
    if (status && c._status !== status) return false;
    if (ramo && c._ramo !== ramo) return false;
    if (empresa && !normalizar(c._empresaNome).includes(empresa)) return false;
    if (valorMin && c._valor < valorMin) return false;
    if (valorMax < Infinity && c._valor > valorMax) return false;
    if (seguradora && c._seguradora !== seguradora) return false;
    return true;
  });
  
  // Contar filtros ativos
  let filtrosAtivos = 0;
  if (dataInicio || dataFim) filtrosAtivos++;
  if (agencia) filtrosAtivos++;
  if (rm) filtrosAtivos++;
  if (status) filtrosAtivos++;
  if (ramo) filtrosAtivos++;
  if (empresa) filtrosAtivos++;
  if (valorMin || valorMax < Infinity) filtrosAtivos++;
  if (seguradora) filtrosAtivos++;
  
  const badge = $("filtrosAtivos");
  if (filtrosAtivos > 0) {
    badge.textContent = `${filtrosAtivos} ativo${filtrosAtivos > 1 ? 's' : ''}`;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
  
  // Atualizar tudo
  PAGINACAO.pagina = 1;
  ordenarDados();
  atualizarKPIs();
  atualizarGraficos();
  atualizarRankings();
  atualizarAnalise();
  atualizarTabela();
  mostrarLoading(false);
}

function limparFiltros() {
  $("fAgencia").value = CTX.isAdmin ? "" : CTX.agenciaId;
  $("fRM").value = "";
  $("fStatus").value = "";
  $("fRamo").value = "";
  $("fEmpresa").value = "";
  $("fValorMin").value = "";
  $("fValorMax").value = "";
  $("fSeguradora").value = "";
  $("fPreset").value = "";
  setDefaultDates();
  aplicarFiltros();
}

function aplicarPreset(preset) {
  const hoje = new Date();
  let inicio, fim;
  
  switch (preset) {
    case "hoje":
      inicio = fim = hoje;
      break;
    case "semana":
      inicio = new Date(hoje);
      inicio.setDate(hoje.getDate() - hoje.getDay());
      fim = hoje;
      break;
    case "mes":
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      fim = hoje;
      break;
    case "trimestre":
      const trimestre = Math.floor(hoje.getMonth() / 3);
      inicio = new Date(hoje.getFullYear(), trimestre * 3, 1);
      fim = hoje;
      break;
    case "ano":
      inicio = new Date(hoje.getFullYear(), 0, 1);
      fim = hoje;
      break;
    case "mesPassado":
      inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      break;
    case "anoPassado":
      inicio = new Date(hoje.getFullYear() - 1, 0, 1);
      fim = new Date(hoje.getFullYear() - 1, 11, 31);
      break;
    default:
      return;
  }
  
  $("fDataInicio").value = inicio.toISOString().substring(0, 10);
  $("fDataFim").value = fim.toISOString().substring(0, 10);
}

// ==== KPIs ====
function atualizarKPIs() {
  const dados = DADOS.filtrados;
  
  const total = dados.length;
  const emitidos = dados.filter(c => categoriaStatus(c._status) === "emitido").length;
  const pendentes = dados.filter(c => categoriaStatus(c._status) === "pendente").length;
  const recusados = dados.filter(c => categoriaStatus(c._status) === "recusado").length;
  const valorTotal = dados.reduce((sum, c) => sum + c._valor, 0);
  const taxaConversao = total > 0 ? (emitidos / total) * 100 : 0;
  
  $("kpiTotalCotacoes").textContent = fmtNum(total);
  $("kpiEmitidos").textContent = fmtNum(emitidos);
  $("kpiValorTotal").textContent = fmtBRLShort(valorTotal);
  $("kpiPendentes").textContent = fmtNum(pendentes);
  $("kpiRecusados").textContent = fmtNum(recusados);
  $("kpiConversao").textContent = fmtPct(taxaConversao);
}

// ==== Gráficos ====
function atualizarGraficos() {
  atualizarGraficoEvolucao();
  atualizarGraficoStatus();
  atualizarGraficoRamo();
  atualizarGraficoAgencia();
}

function atualizarGraficoEvolucao() {
  const ctx = $("chartEvolucao");
  if (CHARTS.evolucao) CHARTS.evolucao.destroy();
  
  // Agrupar por mês
  const porMes = {};
  DADOS.filtrados.forEach(c => {
    if (c._dataCriacao) {
      const key = `${c._dataCriacao.getFullYear()}-${String(c._dataCriacao.getMonth() + 1).padStart(2, '0')}`;
      if (!porMes[key]) porMes[key] = { qtd: 0, valor: 0, emitidos: 0 };
      porMes[key].qtd++;
      porMes[key].valor += c._valor;
      if (categoriaStatus(c._status) === "emitido") porMes[key].emitidos++;
    }
  });
  
  const meses = Object.keys(porMes).sort();
  const labels = meses.map(m => {
    const [ano, mes] = m.split("-");
    return `${mes}/${ano.slice(2)}`;
  });
  
  CHARTS.evolucao = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Cotações',
          data: meses.map(m => porMes[m].qtd),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.4,
          yAxisID: 'y'
        },
        {
          label: 'Emitidos',
          data: meses.map(m => porMes[m].emitidos),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4,
          yAxisID: 'y'
        },
        {
          label: 'Valor (R$)',
          data: meses.map(m => porMes[m].valor),
          borderColor: '#f59e0b',
          borderDash: [5, 5],
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { position: 'left', beginAtZero: true },
        y1: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { callback: v => fmtBRLShort(v) }
        }
      }
    }
  });
}

function atualizarGraficoStatus() {
  const ctx = $("chartStatus");
  if (CHARTS.status) CHARTS.status.destroy();
  
  const porStatus = {};
  DADOS.filtrados.forEach(c => {
    const st = c._status;
    if (!porStatus[st]) porStatus[st] = { qtd: 0, valor: 0 };
    porStatus[st].qtd++;
    porStatus[st].valor += c._valor;
  });
  
  const entries = Object.entries(porStatus).sort((a, b) => b[1].qtd - a[1].qtd);
  
  CHARTS.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(([st]) => st),
      datasets: [{
        data: entries.map(([, d]) => d.qtd),
        backgroundColor: entries.map(([st]) => corStatus(st).bg),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { usePointStyle: true, padding: 15 } }
      }
    }
  });
}

function atualizarGraficoRamo() {
  const ctx = $("chartRamo");
  if (CHARTS.ramo) CHARTS.ramo.destroy();
  
  const porRamo = {};
  DADOS.filtrados.forEach(c => {
    const r = c._ramo;
    if (!porRamo[r]) porRamo[r] = { qtd: 0, valor: 0 };
    porRamo[r].qtd++;
    porRamo[r].valor += c._valor;
  });
  
  const entries = Object.entries(porRamo).sort((a, b) => b[1].valor - a[1].valor).slice(0, 10);
  
  CHARTS.ramo = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(([r]) => r.length > 15 ? r.slice(0, 15) + '...' : r),
      datasets: [{
        label: 'Valor',
        data: entries.map(([, d]) => d.valor),
        backgroundColor: '#6366f1',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: v => fmtBRLShort(v) } }
      }
    }
  });
}

function atualizarGraficoAgencia() {
  const ctx = $("chartAgencia");
  if (CHARTS.agencia) CHARTS.agencia.destroy();
  
  const porAgencia = {};
  DADOS.filtrados.forEach(c => {
    const a = c._agenciaNome;
    if (!porAgencia[a]) porAgencia[a] = { qtd: 0, valor: 0, emitidos: 0 };
    porAgencia[a].qtd++;
    porAgencia[a].valor += c._valor;
    if (categoriaStatus(c._status) === "emitido") porAgencia[a].emitidos++;
  });
  
  const entries = Object.entries(porAgencia).sort((a, b) => b[1].valor - a[1].valor).slice(0, 8);
  
  CHARTS.agencia = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(([a]) => a.length > 20 ? a.slice(0, 20) + '...' : a),
      datasets: [
        {
          label: 'Cotações',
          data: entries.map(([, d]) => d.qtd),
          backgroundColor: '#6366f1',
          borderRadius: 4
        },
        {
          label: 'Emitidos',
          data: entries.map(([, d]) => d.emitidos),
          backgroundColor: '#10b981',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

// ==== Rankings ====
function atualizarRankings() {
  // Top RMs
  const porRM = {};
  DADOS.filtrados.forEach(c => {
    const rm = c._rmNome;
    if (!porRM[rm]) porRM[rm] = { qtd: 0, valor: 0 };
    porRM[rm].qtd++;
    porRM[rm].valor += c._valor;
  });
  
  const topRMs = Object.entries(porRM).sort((a, b) => b[1].valor - a[1].valor).slice(0, 10);
  $("rankingRMs").innerHTML = topRMs.map(([rm, d], i) => `
    <div class="flex items-center gap-3 p-2 rounded-lg ${i === 0 ? 'bg-yellow-50' : 'bg-slate-50'}">
      <div class="w-6 h-6 rounded-full ${i < 3 ? 'bg-yellow-400 text-white' : 'bg-slate-200 text-slate-600'} flex items-center justify-center text-xs font-bold">${i + 1}</div>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-slate-800 truncate text-sm">${rm}</div>
        <div class="text-xs text-slate-500">${d.qtd} cotações</div>
      </div>
      <div class="text-sm font-bold text-slate-700">${fmtBRLShort(d.valor)}</div>
    </div>
  `).join('') || '<div class="text-slate-400 text-sm">Sem dados</div>';
  
  // Top Empresas
  const porEmpresa = {};
  DADOS.filtrados.forEach(c => {
    const e = c._empresaNome;
    if (!porEmpresa[e]) porEmpresa[e] = { qtd: 0, valor: 0 };
    porEmpresa[e].qtd++;
    porEmpresa[e].valor += c._valor;
  });
  
  const topEmpresas = Object.entries(porEmpresa).sort((a, b) => b[1].valor - a[1].valor).slice(0, 10);
  $("rankingEmpresas").innerHTML = topEmpresas.map(([emp, d], i) => `
    <div class="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
      <div class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">${i + 1}</div>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-slate-800 truncate text-sm">${emp}</div>
        <div class="text-xs text-slate-500">${d.qtd} cotações</div>
      </div>
      <div class="text-sm font-bold text-slate-700">${fmtBRLShort(d.valor)}</div>
    </div>
  `).join('') || '<div class="text-slate-400 text-sm">Sem dados</div>';
  
  // Top Ramos
  const porRamo = {};
  DADOS.filtrados.forEach(c => {
    const r = c._ramo;
    if (!porRamo[r]) porRamo[r] = { qtd: 0, valor: 0 };
    porRamo[r].qtd++;
    porRamo[r].valor += c._valor;
  });
  
  const topRamos = Object.entries(porRamo).sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 10);
  $("rankingRamos").innerHTML = topRamos.map(([ramo, d], i) => `
    <div class="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
      <div class="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">${i + 1}</div>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-slate-800 truncate text-sm">${ramo}</div>
        <div class="text-xs text-slate-500">${fmtBRLShort(d.valor)}</div>
      </div>
      <div class="text-sm font-bold text-slate-700">${d.qtd}</div>
    </div>
  `).join('') || '<div class="text-slate-400 text-sm">Sem dados</div>';
}

// ==== Análise ====
function atualizarAnalise() {
  const dados = DADOS.filtrados;
  
  // Ticket médio
  const total = dados.length;
  const valorTotal = dados.reduce((s, c) => s + c._valor, 0);
  $("metricaTicketMedio").textContent = total > 0 ? fmtBRL(valorTotal / total) : "-";
  
  // Tempo médio
  const comData = dados.filter(c => c._diasAberto > 0);
  const tempoMedio = comData.length > 0 ? comData.reduce((s, c) => s + c._diasAberto, 0) / comData.length : 0;
  $("metricaTempoMedio").textContent = tempoMedio > 0 ? `${Math.round(tempoMedio)} dias` : "-";
  
  // Maior negócio
  const maior = dados.reduce((max, c) => c._valor > max ? c._valor : max, 0);
  $("metricaMaiorNegocio").textContent = maior > 0 ? fmtBRL(maior) : "-";
  
  // Empresas únicas
  const empresasUnicas = new Set(dados.map(c => c._empresaNome)).size;
  $("metricaEmpresasUnicas").textContent = fmtNum(empresasUnicas);
  
  // Análise de recusas
  const recusados = dados.filter(c => categoriaStatus(c._status) === "recusado");
  const porMotivo = {};
  recusados.forEach(c => {
    const motivo = c._status;
    if (!porMotivo[motivo]) porMotivo[motivo] = { qtd: 0, valor: 0 };
    porMotivo[motivo].qtd++;
    porMotivo[motivo].valor += c._valor;
  });
  
  const motivosOrdenados = Object.entries(porMotivo).sort((a, b) => b[1].qtd - a[1].qtd);
  $("analiseRecusas").innerHTML = motivosOrdenados.length > 0 ? motivosOrdenados.map(([motivo, d]) => `
    <div class="flex items-center justify-between p-3 bg-rose-50 rounded-lg">
      <div>
        <div class="font-medium text-slate-800">${motivo}</div>
        <div class="text-xs text-slate-500">${d.qtd} ocorrências • ${fmtBRL(d.valor)} perdido</div>
      </div>
      <div class="text-rose-600 font-bold">${fmtPct((d.qtd / recusados.length) * 100)}</div>
    </div>
  `).join('') : '<div class="text-slate-400">Nenhuma recusa no período</div>';
}

// ==== Tabela ====
function ordenarDados() {
  const { campo, direcao } = ORDENACAO;
  const mult = direcao === 'asc' ? 1 : -1;
  
  DADOS.filtrados.sort((a, b) => {
    let va = a[campo] ?? a['_' + campo];
    let vb = b[campo] ?? b['_' + campo];
    
    if (va instanceof Date) va = va.getTime();
    if (vb instanceof Date) vb = vb.getTime();
    
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
    return String(va || "").localeCompare(String(vb || ""), 'pt-BR') * mult;
  });
}

function ordenarPor(campo) {
  if (ORDENACAO.campo === campo) {
    ORDENACAO.direcao = ORDENACAO.direcao === 'asc' ? 'desc' : 'asc';
  } else {
    ORDENACAO.campo = campo;
    ORDENACAO.direcao = 'desc';
  }
  
  // Atualizar visual dos headers
  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.classList.remove('sorted');
    th.querySelector('.sort-icon').textContent = '↕';
  });
  const th = document.querySelector(`th[data-sort="${campo}"]`);
  if (th) {
    th.classList.add('sorted');
    th.querySelector('.sort-icon').textContent = ORDENACAO.direcao === 'asc' ? '↑' : '↓';
  }
  
  ordenarDados();
  atualizarTabela();
}

function atualizarTabela() {
  const busca = normalizar($("buscaTabela").value);
  let dados = DADOS.filtrados;
  
  if (busca) {
    dados = dados.filter(c => 
      normalizar(c._empresaNome).includes(busca) ||
      normalizar(c._rmNome).includes(busca) ||
      normalizar(c._ramo).includes(busca) ||
      normalizar(c._status).includes(busca)
    );
  }
  
  // Paginação
  const total = dados.length;
  const itens = PAGINACAO.itensPorPagina === 'all' ? total : PAGINACAO.itensPorPagina;
  const totalPaginas = Math.ceil(total / itens) || 1;
  PAGINACAO.pagina = Math.min(PAGINACAO.pagina, totalPaginas);
  
  const inicio = (PAGINACAO.pagina - 1) * itens;
  const fim = Math.min(inicio + itens, total);
  const paginados = dados.slice(inicio, fim);
  
  // Render tabela
  const tbody = $("tabelaBody");
  if (paginados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-slate-400">Nenhum registro encontrado</td></tr>';
  } else {
    tbody.innerHTML = paginados.map(c => {
      const cor = corStatus(c._status);
      return `
        <tr>
          <td class="font-medium">${c._empresaNome}</td>
          <td>${c._agenciaNome}</td>
          <td>${c._rmNome}</td>
          <td>${c._ramo}</td>
          <td class="font-semibold">${fmtBRL(c._valor)}</td>
          <td><span class="badge ${cor.class}">${c._status}</span></td>
          <td>${fmtData(c._dataCriacao)}</td>
          <td>${c._diasAberto}</td>
          <td class="no-print">
            <a href="chat-cotacao.html?id=${c.id}" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">Ver →</a>
          </td>
        </tr>
      `;
    }).join('');
  }
  
  // Info
  $("qtdResultados").textContent = `${fmtNum(total)} registros`;
  $("paginacaoInfo").textContent = `${inicio + 1}-${fim}`;
  $("paginacaoTotal").textContent = fmtNum(total);
  
  // Botões paginação
  renderPaginacao(totalPaginas);
}

function renderPaginacao(totalPaginas) {
  const container = $("paginacaoBotoes");
  if (totalPaginas <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '';
  
  // Anterior
  html += `<button class="px-3 py-1 rounded ${PAGINACAO.pagina === 1 ? 'bg-slate-100 text-slate-400' : 'bg-slate-200 hover:bg-slate-300'}" ${PAGINACAO.pagina === 1 ? 'disabled' : ''} onclick="irParaPagina(${PAGINACAO.pagina - 1})">←</button>`;
  
  // Páginas
  const maxBotoes = 5;
  let inicio = Math.max(1, PAGINACAO.pagina - Math.floor(maxBotoes / 2));
  let fim = Math.min(totalPaginas, inicio + maxBotoes - 1);
  inicio = Math.max(1, fim - maxBotoes + 1);
  
  for (let i = inicio; i <= fim; i++) {
    html += `<button class="px-3 py-1 rounded ${i === PAGINACAO.pagina ? 'bg-indigo-600 text-white' : 'bg-slate-200 hover:bg-slate-300'}" onclick="irParaPagina(${i})">${i}</button>`;
  }
  
  // Próximo
  html += `<button class="px-3 py-1 rounded ${PAGINACAO.pagina === totalPaginas ? 'bg-slate-100 text-slate-400' : 'bg-slate-200 hover:bg-slate-300'}" ${PAGINACAO.pagina === totalPaginas ? 'disabled' : ''} onclick="irParaPagina(${PAGINACAO.pagina + 1})">→</button>`;
  
  container.innerHTML = html;
}

function irParaPagina(pagina) {
  PAGINACAO.pagina = pagina;
  atualizarTabela();
}

function mudarItensPorPagina() {
  const val = $("itensPorPagina").value;
  PAGINACAO.itensPorPagina = val === 'all' ? 'all' : parseInt(val);
  PAGINACAO.pagina = 1;
  atualizarTabela();
}

function filtrarTabela() {
  PAGINACAO.pagina = 1;
  atualizarTabela();
}

// ==== Tabs ====
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  
  $("tabGraficos").classList.toggle('hidden', tab !== 'graficos');
  $("tabRanking").classList.toggle('hidden', tab !== 'ranking');
  $("tabAnalise").classList.toggle('hidden', tab !== 'analise');
}

// ==== Filtros Toggle ====
function toggleFilters() {
  const content = $("filtersContent");
  const arrow = $("filterArrow");
  content.classList.toggle('open');
  arrow.style.transform = content.classList.contains('open') ? '' : 'rotate(-90deg)';
}

// ==== Loading ====
function mostrarLoading(show) {
  const tbody = $("tabelaBody");
  if (show) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading"><div class="spinner"></div></td></tr>';
  }
}

// ==== Exports ====
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  // Título
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text('Relatório Gerencial - Retorno Seguros', 14, 20);
  
  // Data
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
  doc.text(`Período: ${$("fDataInicio").value || 'Início'} a ${$("fDataFim").value || 'Fim'}`, 14, 33);
  
  // KPIs
  const kpis = [
    ['Total Cotações', $("kpiTotalCotacoes").textContent],
    ['Emitidos', $("kpiEmitidos").textContent],
    ['Valor Total', $("kpiValorTotal").textContent],
    ['Pendentes', $("kpiPendentes").textContent],
    ['Recusados', $("kpiRecusados").textContent],
    ['Taxa Conversão', $("kpiConversao").textContent]
  ];
  
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text('Resumo:', 14, 45);
  
  let x = 14;
  kpis.forEach(([label, value]) => {
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(label, x, 52);
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(value, x, 58);
    x += 45;
  });
  
  // Tabela
  const dados = DADOS.filtrados.map(c => [
    c._empresaNome.slice(0, 25),
    c._agenciaNome.slice(0, 15),
    c._rmNome.slice(0, 15),
    c._ramo.slice(0, 15),
    fmtBRL(c._valor),
    c._status,
    fmtData(c._dataCriacao)
  ]);
  
  doc.autoTable({
    startY: 68,
    head: [['Empresa', 'Agência', 'Gerente', 'Ramo', 'Valor', 'Status', 'Data']],
    body: dados,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });
  
  // Salvar
  doc.save(`relatorio-gerencial-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportarExcel() {
  const dados = DADOS.filtrados.map(c => ({
    'Empresa': c._empresaNome,
    'Agência': c._agenciaNome,
    'Gerente': c._rmNome,
    'Ramo': c._ramo,
    'Valor': c._valor,
    'Status': c._status,
    'Data Criação': fmtData(c._dataCriacao),
    'Dias Aberto': c._diasAberto,
    'Seguradora': c._seguradora
  }));
  
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
  XLSX.writeFile(wb, `relatorio-gerencial-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==== Globals ====
window.aplicarPreset = aplicarPreset;
window.switchTab = switchTab;
window.toggleFilters = toggleFilters;
window.irParaPagina = irParaPagina;
window.mudarItensPorPagina = mudarItensPorPagina;
