// relatorios.js — Central de Relatórios BI
// Firebase v8 compatível

// ==== Firebase Init ====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ==== Estado Global ====
let CTX = { uid: null, perfil: null, agenciaId: null, nome: null, isAdmin: false };
const ADMIN_EMAILS = ["patrick@retornoseguros.com.br"];

// Dados carregados
let DADOS = {
  cotacoes: [],
  cotacoesAnteriores: [],
  visitas: [],
  visitasAnteriores: [],
  vencimentos: [],
  agencias: {},
  rms: {},
  empresas: {}
};

// Filtros atuais
let FILTROS = {
  dataInicio: null,
  dataFim: null,
  dataInicioAnterior: null,
  dataFimAnterior: null,
  agencia: '',
  rm: '',
  tipoComparacao: 'ano'
};

// Charts
let CHARTS = {};

// ==== Helpers ====
const $ = id => document.getElementById(id);
const normalizar = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const toDate = x => {
  if (!x) return null;
  if (x.toDate) return x.toDate();
  if (x instanceof Date) return x;
  if (typeof x === 'string') {
    // Tenta dd/mm/yyyy
    const m = x.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return new Date(m[3], m[2] - 1, m[1]);
  }
  const d = new Date(x);
  return isNaN(d) ? null : d;
};

const fmtData = d => d ? d.toLocaleDateString("pt-BR") : "-";
const fmtNum = n => Number(n || 0).toLocaleString("pt-BR");
const fmtPct = n => `${Number(n || 0).toFixed(1)}%`;

const parseValor = v => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
  return parseFloat(s) || 0;
};

const fmtBRL = n => parseValor(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBRLShort = n => {
  const v = parseValor(n);
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return fmtBRL(v);
};

// Status helpers
const STATUS_EMITIDO = ["negócio emitido", "negocio emitido", "emitido", "fechado"];
const STATUS_PENDENTE = ["pendente"];
const STATUS_RECUSADO = ["recusado", "declinado"];

function categoriaStatus(status) {
  const st = normalizar(status);
  if (STATUS_EMITIDO.some(s => st.includes(s))) return "emitido";
  if (STATUS_PENDENTE.some(s => st.includes(s))) return "pendente";
  if (STATUS_RECUSADO.some(s => st.includes(s))) return "recusado";
  if (st.includes("emissao") || st.includes("emissão")) return "emissao";
  return "outros";
}

function corBadge(status) {
  const cat = categoriaStatus(status);
  switch (cat) {
    case "emitido": return "badge-success";
    case "pendente": return "badge-warning";
    case "recusado": return "badge-danger";
    case "emissao": return "badge-info";
    default: return "badge-muted";
  }
}

function calcDelta(atual, anterior) {
  if (!anterior || anterior === 0) return atual > 0 ? 100 : 0;
  return ((atual - anterior) / anterior) * 100;
}

function renderDelta(el, atual, anterior, suffix = '') {
  if (!el) return;
  const delta = calcDelta(atual, anterior);
  const sign = delta > 0 ? '+' : '';
  const cls = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-neutral';
  el.className = `delta ${cls}`;
  el.innerHTML = `${sign}${delta.toFixed(1)}%${suffix ? ' ' + suffix : ''}`;
}

// ==== Auth ====
auth.onAuthStateChanged(async user => {
  if (!user) { location.href = "login.html"; return; }
  CTX.uid = user.uid;
  
  try {
    const snap = await db.collection("usuarios_banco").doc(user.uid).get();
    if (snap.exists) {
      const d = snap.data();
      CTX.perfil = normalizar(d.perfil || "").replace(/[-_]/g, " ");
      CTX.agenciaId = d.agenciaId || null;
      CTX.nome = d.nome || user.email;
      CTX.isAdmin = CTX.perfil === "admin" || ADMIN_EMAILS.includes(user.email?.toLowerCase());
    } else if (ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
      CTX.perfil = "admin";
      CTX.isAdmin = true;
      CTX.nome = user.email;
    }
  } catch (e) { console.warn("Erro perfil:", e); }
  
  $("userInfo").textContent = CTX.nome;
  $("footerAno").textContent = new Date().getFullYear();
  
  await init();
});

// ==== Inicialização ====
async function init() {
  // Eventos
  $("btnAplicar").addEventListener("click", carregarTudo);
  $("btnExportPDF").addEventListener("click", exportarPDF);
  $("btnExportExcel").addEventListener("click", exportarExcel);
  
  // Carregar lookups
  await carregarLookups();
  
  // Aplicar período padrão
  aplicarPreset();
  
  // Carregar dados
  await carregarTudo();
}

// ==== Lookups ====
async function carregarLookups() {
  // Agências
  try {
    const snap = await db.collection("agencias_banco").get();
    snap.forEach(doc => {
      const d = doc.data();
      DADOS.agencias[doc.id] = d.nome || doc.id;
    });
    
    const sel = $("fAgencia");
    sel.innerHTML = '<option value="">Todas as Agências</option>';
    if (!CTX.isAdmin && CTX.agenciaId) {
      sel.innerHTML = `<option value="${CTX.agenciaId}">${DADOS.agencias[CTX.agenciaId] || CTX.agenciaId}</option>`;
      sel.disabled = true;
    } else {
      Object.entries(DADOS.agencias).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, nome]) => {
        sel.innerHTML += `<option value="${id}">${nome}</option>`;
      });
    }
  } catch (e) { console.warn("Erro agências:", e); }
  
  // RMs
  try {
    const snap = await db.collection("usuarios_banco").get();
    snap.forEach(doc => {
      const d = doc.data();
      if (d.nome) {
        DADOS.rms[doc.id] = { nome: d.nome, agenciaId: d.agenciaId };
      }
    });
    
    popularSelectRM();
  } catch (e) { console.warn("Erro RMs:", e); }
}

function popularSelectRM() {
  const sel = $("fRM");
  const agenciaFiltro = $("fAgencia").value;
  
  // CORREÇÃO: RM vê apenas ele mesmo
  if (!CTX.isAdmin && !["gerente chefe", "assistente"].includes(CTX.perfil)) {
    sel.innerHTML = `<option value="${CTX.uid}" selected>${CTX.nome}</option>`;
    sel.disabled = true;
    return;
  }
  
  sel.innerHTML = '<option value="">Todos os Gerentes</option>';
  Object.entries(DADOS.rms)
    .filter(([id, rm]) => {
      // Filtrar por agência selecionada
      if (agenciaFiltro && rm.agenciaId !== agenciaFiltro) return false;
      // CORREÇÃO: GC/Assistente vê apenas da sua agência
      if (!CTX.isAdmin && rm.agenciaId !== CTX.agenciaId) return false;
      return true;
    })
    .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
    .forEach(([id, rm]) => {
      sel.innerHTML += `<option value="${id}">${rm.nome}</option>`;
    });
}

// ==== Presets de Período ====
function aplicarPreset() {
  const preset = $("fPreset").value;
  const hoje = new Date();
  let inicio, fim;
  
  switch (preset) {
    case "mes":
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      fim = hoje;
      break;
    case "trimestre":
      const trim = Math.floor(hoje.getMonth() / 3);
      inicio = new Date(hoje.getFullYear(), trim * 3, 1);
      fim = hoje;
      break;
    case "semestre":
      const sem = hoje.getMonth() < 6 ? 0 : 6;
      inicio = new Date(hoje.getFullYear(), sem, 1);
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
    case "custom":
      $("customDateStart").style.display = 'block';
      $("customDateEnd").style.display = 'block';
      return;
    default: // ano
      inicio = new Date(hoje.getFullYear(), 0, 1);
      fim = hoje;
  }
  
  $("customDateStart").style.display = 'none';
  $("customDateEnd").style.display = 'none';
  $("fDataInicio").value = inicio.toISOString().substring(0, 10);
  $("fDataFim").value = fim.toISOString().substring(0, 10);
  
  FILTROS.dataInicio = inicio;
  FILTROS.dataFim = fim;
  calcularPeriodoAnterior();
}

function calcularPeriodoAnterior() {
  const tipo = document.querySelector('input[name="tipoComparacao"]:checked')?.value || 'ano';
  FILTROS.tipoComparacao = tipo;
  
  const inicio = FILTROS.dataInicio;
  const fim = FILTROS.dataFim;
  
  if (!inicio || !fim) return;
  
  switch (tipo) {
    case 'ano':
      FILTROS.dataInicioAnterior = new Date(inicio.getFullYear() - 1, inicio.getMonth(), inicio.getDate());
      FILTROS.dataFimAnterior = new Date(fim.getFullYear() - 1, fim.getMonth(), fim.getDate());
      break;
    case 'mes':
      FILTROS.dataInicioAnterior = new Date(inicio.getFullYear(), inicio.getMonth() - 1, inicio.getDate());
      FILTROS.dataFimAnterior = new Date(fim.getFullYear(), fim.getMonth() - 1, fim.getDate());
      break;
    case 'periodo':
      FILTROS.dataInicioAnterior = new Date(inicio.getFullYear() - 1, inicio.getMonth(), inicio.getDate());
      FILTROS.dataFimAnterior = new Date(fim.getFullYear() - 1, fim.getMonth(), fim.getDate());
      break;
  }
}

function mudarComparacao() {
  calcularPeriodoAnterior();
  atualizarComparativo();
}

// ==== Carregar Todos os Dados ====
async function carregarTudo() {
  $("loadingGlobal").style.display = 'flex';
  
  // Atualizar filtros
  if ($("fPreset").value === 'custom') {
    FILTROS.dataInicio = $("fDataInicio").value ? new Date($("fDataInicio").value + "T00:00:00") : null;
    FILTROS.dataFim = $("fDataFim").value ? new Date($("fDataFim").value + "T23:59:59") : null;
    calcularPeriodoAnterior();
  }
  
  FILTROS.agencia = $("fAgencia").value;
  FILTROS.rm = $("fRM").value;
  
  try {
    await Promise.all([
      carregarCotacoes(),
      carregarVisitas(),
      carregarVencimentos()
    ]);
    
    atualizarTudo();
  } catch (e) {
    console.error("Erro ao carregar:", e);
  }
  
  $("loadingGlobal").style.display = 'none';
}

// ==== Carregar Cotações ====
async function carregarCotacoes() {
  const col = db.collection("cotacoes-gerentes");
  
  // Query base por permissão
  let docs = [];
  if (CTX.isAdmin) {
    docs = (await col.get()).docs;
  } else if (["gerente chefe", "assistente"].includes(CTX.perfil) && CTX.agenciaId) {
    docs = (await col.where("agenciaId", "==", CTX.agenciaId).get()).docs;
  } else {
    // RM
    const queries = [
      col.where("rmUid", "==", CTX.uid).get(),
      col.where("rmId", "==", CTX.uid).get(),
      col.where("criadoPorUid", "==", CTX.uid).get()
    ];
    const results = await Promise.allSettled(queries);
    const map = new Map();
    results.forEach(r => {
      if (r.status === "fulfilled") r.value.forEach(doc => map.set(doc.id, doc));
    });
    docs = Array.from(map.values());
  }
  
  // Processar cotações
  const todas = docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      ...d,
      _empresaNome: d.empresaNome || "Empresa",
      _agenciaId: d.agenciaId || "",
      _agenciaNome: DADOS.agencias[d.agenciaId] || d.agenciaId || "-",
      _rmNome: d.rmNome || DADOS.rms[d.rmUid]?.nome || DADOS.rms[d.rmId]?.nome || "-",
      _rmUid: d.rmUid || d.rmId || "",
      _ramo: d.ramo || "Não informado",
      _status: d.status || "Sem status",
      _valor: parseValor(d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0),
      _vigenciaInicio: toDate(d.vigenciaInicial ?? d.inicioVigencia ?? d.vigencia_inicial),
      _vigenciaFim: toDate(d.fimVigencia ?? d.vigenciaFinal ?? d.vigencia_final),
      _dataCriacao: toDate(d.dataCriacao),
      _seguradora: d.seguradora || "-"
    };
  });
  
  // Filtrar por agência/RM se selecionado
  let filtradas = todas;
  if (FILTROS.agencia) {
    filtradas = filtradas.filter(c => c._agenciaId === FILTROS.agencia);
  }
  if (FILTROS.rm) {
    filtradas = filtradas.filter(c => c._rmUid === FILTROS.rm);
  }
  
  // Separar por período (usando VIGÊNCIA para emitidos, DATA CRIAÇÃO para cotações)
  DADOS.cotacoes = filtradas.filter(c => {
    // Para emitidos, usar vigência
    if (categoriaStatus(c._status) === "emitido") {
      const vigencia = c._vigenciaInicio || c._dataCriacao;
      if (!vigencia) return true;
      if (FILTROS.dataInicio && vigencia < FILTROS.dataInicio) return false;
      if (FILTROS.dataFim && vigencia > FILTROS.dataFim) return false;
    } else {
      // Para cotações, usar data criação
      const data = c._dataCriacao;
      if (!data) return true;
      if (FILTROS.dataInicio && data < FILTROS.dataInicio) return false;
      if (FILTROS.dataFim && data > FILTROS.dataFim) return false;
    }
    return true;
  });
  
  DADOS.cotacoesAnteriores = filtradas.filter(c => {
    if (categoriaStatus(c._status) === "emitido") {
      const vigencia = c._vigenciaInicio || c._dataCriacao;
      if (!vigencia) return false;
      if (FILTROS.dataInicioAnterior && vigencia < FILTROS.dataInicioAnterior) return false;
      if (FILTROS.dataFimAnterior && vigencia > FILTROS.dataFimAnterior) return false;
    } else {
      const data = c._dataCriacao;
      if (!data) return false;
      if (FILTROS.dataInicioAnterior && data < FILTROS.dataInicioAnterior) return false;
      if (FILTROS.dataFimAnterior && data > FILTROS.dataFimAnterior) return false;
    }
    return true;
  });
}

// ==== Carregar Visitas ====
async function carregarVisitas() {
  const col = db.collection("agenda_visitas");
  
  let docs = [];
  if (CTX.isAdmin) {
    docs = (await col.get()).docs;
  } else if (["gerente chefe", "assistente"].includes(CTX.perfil) && CTX.agenciaId) {
    try {
      docs = (await col.where("agenciaId", "==", CTX.agenciaId).get()).docs;
    } catch { docs = (await col.get()).docs; }
  } else {
    const queries = [
      col.where("rmUid", "==", CTX.uid).get(),
      col.where("usuarioId", "==", CTX.uid).get()
    ];
    const results = await Promise.allSettled(queries);
    const map = new Map();
    results.forEach(r => {
      if (r.status === "fulfilled") r.value.forEach(doc => map.set(doc.id, doc));
    });
    docs = Array.from(map.values());
  }
  
  const todas = docs.map(doc => {
    const d = doc.data();
    const data = toDate(d.dataHoraTs ?? d.dataHora ?? d.data);
    return {
      id: doc.id,
      ...d,
      _data: data,
      _empresaNome: d.empresaNome || d.empresa || "-",
      _rmNome: d.rmNome || DADOS.rms[d.rmUid]?.nome || "-",
      _agenciaNome: DADOS.agencias[d.agenciaId] || "-",
      _tipo: normalizar(d.tipo || d.modalidade || "presencial"),
      _realizada: data && data < new Date()
    };
  });
  
  // Filtrar por período e agência/RM
  let filtradas = todas;
  if (FILTROS.agencia) {
    filtradas = filtradas.filter(v => v.agenciaId === FILTROS.agencia);
  }
  if (FILTROS.rm) {
    filtradas = filtradas.filter(v => v.rmUid === FILTROS.rm || v.usuarioId === FILTROS.rm);
  }
  
  DADOS.visitas = filtradas.filter(v => {
    if (!v._data) return true;
    if (FILTROS.dataInicio && v._data < FILTROS.dataInicio) return false;
    if (FILTROS.dataFim && v._data > FILTROS.dataFim) return false;
    return true;
  });
  
  DADOS.visitasAnteriores = filtradas.filter(v => {
    if (!v._data) return false;
    if (FILTROS.dataInicioAnterior && v._data < FILTROS.dataInicioAnterior) return false;
    if (FILTROS.dataFimAnterior && v._data > FILTROS.dataFimAnterior) return false;
    return true;
  });
}

// ==== Carregar Vencimentos ====
async function carregarVencimentos() {
  // Buscar cotações emitidas com fim de vigência
  const emitidos = DADOS.cotacoes.filter(c => categoriaStatus(c._status) === "emitido" && c._vigenciaFim);
  
  const hoje = new Date();
  DADOS.vencimentos = emitidos.map(c => ({
    ...c,
    _diasParaVencer: Math.ceil((c._vigenciaFim - hoje) / (1000 * 60 * 60 * 24))
  })).filter(v => v._diasParaVencer > -30); // Inclui vencidos até 30 dias
}

// ==== Atualizar Tudo ====
function atualizarTudo() {
  atualizarComparativo();
  atualizarGerencial();
  atualizarRenovacoes();
  atualizarVisitas();
  atualizarEquipe();
}

// ==== ABA COMPARATIVO ====
function atualizarComparativo() {
  const atual = DADOS.cotacoes;
  const anterior = DADOS.cotacoesAnteriores;
  
  const emitidosAtual = atual.filter(c => categoriaStatus(c._status) === "emitido");
  const emitidosAnterior = anterior.filter(c => categoriaStatus(c._status) === "emitido");
  
  const cotacoesAtual = atual.length;
  const cotacoesAnterior = anterior.length;
  
  const qtdEmitidosAtual = emitidosAtual.length;
  const qtdEmitidosAnterior = emitidosAnterior.length;
  
  const valorAtual = emitidosAtual.reduce((s, c) => s + c._valor, 0);
  const valorAnterior = emitidosAnterior.reduce((s, c) => s + c._valor, 0);
  
  const ticketAtual = qtdEmitidosAtual > 0 ? valorAtual / qtdEmitidosAtual : 0;
  const ticketAnterior = qtdEmitidosAnterior > 0 ? valorAnterior / qtdEmitidosAnterior : 0;
  
  const conversaoAtual = cotacoesAtual > 0 ? (qtdEmitidosAtual / cotacoesAtual) * 100 : 0;
  const conversaoAnterior = cotacoesAnterior > 0 ? (qtdEmitidosAnterior / cotacoesAnterior) * 100 : 0;
  
  // KPIs
  $("cmpCotacoes").textContent = fmtNum(cotacoesAtual);
  renderDelta($("cmpCotacoesDelta"), cotacoesAtual, cotacoesAnterior, 'vs anterior');
  
  $("cmpEmitidos").textContent = fmtNum(qtdEmitidosAtual);
  renderDelta($("cmpEmitidosDelta"), qtdEmitidosAtual, qtdEmitidosAnterior, 'vs anterior');
  
  $("cmpValor").textContent = fmtBRLShort(valorAtual);
  renderDelta($("cmpValorDelta"), valorAtual, valorAnterior, 'vs anterior');
  
  $("cmpTicket").textContent = fmtBRLShort(ticketAtual);
  renderDelta($("cmpTicketDelta"), ticketAtual, ticketAnterior, 'vs anterior');
  
  $("cmpConversao").textContent = fmtPct(conversaoAtual);
  const deltaCnv = conversaoAtual - conversaoAnterior;
  $("cmpConversaoDelta").className = `delta ${deltaCnv >= 0 ? 'delta-up' : 'delta-down'}`;
  $("cmpConversaoDelta").textContent = `${deltaCnv >= 0 ? '+' : ''}${deltaCnv.toFixed(1)}pp`;
  
  // Renovações (simplificado)
  const renovacoesAtual = DADOS.vencimentos.filter(v => v._diasParaVencer <= 0 && v._diasParaVencer >= -30).length;
  $("cmpRenovacoes").textContent = fmtNum(renovacoesAtual);
  $("cmpRenovacoesDelta").textContent = "-";
  
  // Cards globais
  $("cmpGlobalAtual").textContent = fmtBRLShort(valorAtual);
  $("cmpGlobalAnterior").textContent = fmtBRLShort(valorAnterior);
  const variacaoGlobal = calcDelta(valorAtual, valorAnterior);
  $("cmpGlobalVariacao").textContent = `${variacaoGlobal >= 0 ? '+' : ''}${variacaoGlobal.toFixed(1)}%`;
  $("cmpGlobalVariacao").className = `text-xl font-bold ${variacaoGlobal >= 0 ? 'text-emerald-600' : 'text-red-600'}`;
  
  // Gráficos
  renderChartComparativoEvolucao();
  renderChartComparativoStatus();
  renderChartGlobalComparativo(valorAtual, valorAnterior);
  
  // Tabelas comparativas
  renderTabelaCmpAgencia();
  renderTabelaCmpRM();
  renderTabelaCmpRamo();
}

function renderChartComparativoEvolucao() {
  const ctx = $("chartComparativoEvolucao");
  if (CHARTS.cmpEvolucao) CHARTS.cmpEvolucao.destroy();
  
  // Agrupar por mês
  const porMesAtual = {};
  const porMesAnterior = {};
  
  DADOS.cotacoes.forEach(c => {
    const data = categoriaStatus(c._status) === "emitido" ? (c._vigenciaInicio || c._dataCriacao) : c._dataCriacao;
    if (data) {
      const key = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      if (!porMesAtual[key]) porMesAtual[key] = { qtd: 0, valor: 0 };
      porMesAtual[key].qtd++;
      if (categoriaStatus(c._status) === "emitido") porMesAtual[key].valor += c._valor;
    }
  });
  
  DADOS.cotacoesAnteriores.forEach(c => {
    const data = categoriaStatus(c._status) === "emitido" ? (c._vigenciaInicio || c._dataCriacao) : c._dataCriacao;
    if (data) {
      const key = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      if (!porMesAnterior[key]) porMesAnterior[key] = { qtd: 0, valor: 0 };
      porMesAnterior[key].qtd++;
      if (categoriaStatus(c._status) === "emitido") porMesAnterior[key].valor += c._valor;
    }
  });
  
  const meses = [...new Set([...Object.keys(porMesAtual), ...Object.keys(porMesAnterior)])].sort();
  const labels = meses.map(m => { const [a, mes] = m.split('-'); return `${mes}/${a.slice(2)}`; });
  
  CHARTS.cmpEvolucao = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Valor Atual',
          data: meses.map(m => porMesAtual[m]?.valor || 0),
          backgroundColor: '#6366f1',
          borderRadius: 4
        },
        {
          label: 'Valor Anterior',
          data: meses.map(m => porMesAnterior[m]?.valor || 0),
          backgroundColor: '#cbd5e1',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => fmtBRLShort(v) } } }
    }
  });
}

function renderChartComparativoStatus() {
  const ctx = $("chartComparativoStatus");
  if (CHARTS.cmpStatus) CHARTS.cmpStatus.destroy();
  
  const statusAtual = {};
  const statusAnterior = {};
  
  DADOS.cotacoes.forEach(c => {
    const st = c._status;
    statusAtual[st] = (statusAtual[st] || 0) + 1;
  });
  
  DADOS.cotacoesAnteriores.forEach(c => {
    const st = c._status;
    statusAnterior[st] = (statusAnterior[st] || 0) + 1;
  });
  
  const labels = [...new Set([...Object.keys(statusAtual), ...Object.keys(statusAnterior)])];
  
  CHARTS.cmpStatus = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Atual', data: labels.map(l => statusAtual[l] || 0), backgroundColor: '#6366f1', borderRadius: 4 },
        { label: 'Anterior', data: labels.map(l => statusAnterior[l] || 0), backgroundColor: '#cbd5e1', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { beginAtZero: true } }
    }
  });
}

function renderChartGlobalComparativo(atual, anterior) {
  const ctx = $("chartGlobalComparativo");
  if (CHARTS.globalCmp) CHARTS.globalCmp.destroy();
  
  CHARTS.globalCmp = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Período Atual', 'Período Anterior'],
      datasets: [{
        data: [atual, anterior],
        backgroundColor: ['#6366f1', '#cbd5e1'],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => fmtBRLShort(v) } } }
    }
  });
}

function renderTabelaCmpAgencia() {
  const tbody = $("bodyCmpAgencia");
  
  const porAgenciaAtual = {};
  const porAgenciaAnterior = {};
  
  DADOS.cotacoes.forEach(c => {
    const ag = c._agenciaNome;
    if (!porAgenciaAtual[ag]) porAgenciaAtual[ag] = { cotacoes: 0, emitidos: 0, valor: 0 };
    porAgenciaAtual[ag].cotacoes++;
    if (categoriaStatus(c._status) === "emitido") {
      porAgenciaAtual[ag].emitidos++;
      porAgenciaAtual[ag].valor += c._valor;
    }
  });
  
  DADOS.cotacoesAnteriores.forEach(c => {
    const ag = c._agenciaNome;
    if (!porAgenciaAnterior[ag]) porAgenciaAnterior[ag] = { cotacoes: 0, emitidos: 0, valor: 0 };
    porAgenciaAnterior[ag].cotacoes++;
    if (categoriaStatus(c._status) === "emitido") {
      porAgenciaAnterior[ag].emitidos++;
      porAgenciaAnterior[ag].valor += c._valor;
    }
  });
  
  const agencias = [...new Set([...Object.keys(porAgenciaAtual), ...Object.keys(porAgenciaAnterior)])].sort();
  
  tbody.innerHTML = agencias.map(ag => {
    const at = porAgenciaAtual[ag] || { cotacoes: 0, emitidos: 0, valor: 0 };
    const an = porAgenciaAnterior[ag] || { cotacoes: 0, emitidos: 0, valor: 0 };
    const dCot = calcDelta(at.cotacoes, an.cotacoes);
    const dEmi = calcDelta(at.emitidos, an.emitidos);
    const dVal = calcDelta(at.valor, an.valor);
    
    return `<tr>
      <td class="font-medium">${ag}</td>
      <td>${fmtNum(at.cotacoes)}</td>
      <td>${fmtNum(an.cotacoes)}</td>
      <td class="${dCot >= 0 ? 'text-emerald-600' : 'text-red-600'}">${dCot >= 0 ? '+' : ''}${dCot.toFixed(1)}%</td>
      <td>${fmtNum(at.emitidos)}</td>
      <td>${fmtNum(an.emitidos)}</td>
      <td class="${dEmi >= 0 ? 'text-emerald-600' : 'text-red-600'}">${dEmi >= 0 ? '+' : ''}${dEmi.toFixed(1)}%</td>
      <td>${fmtBRLShort(at.valor)}</td>
      <td>${fmtBRLShort(an.valor)}</td>
      <td class="${dVal >= 0 ? 'text-emerald-600' : 'text-red-600'} font-semibold">${dVal >= 0 ? '+' : ''}${dVal.toFixed(1)}%</td>
    </tr>`;
  }).join('');
}

function renderTabelaCmpRM() {
  const tbody = $("bodyCmpRM");
  
  const porRMAtual = {};
  const porRMAnterior = {};
  
  DADOS.cotacoes.forEach(c => {
    const rm = c._rmNome;
    const ag = c._agenciaNome;
    if (!porRMAtual[rm]) porRMAtual[rm] = { agencia: ag, cotacoes: 0, emitidos: 0, valor: 0 };
    porRMAtual[rm].cotacoes++;
    if (categoriaStatus(c._status) === "emitido") {
      porRMAtual[rm].emitidos++;
      porRMAtual[rm].valor += c._valor;
    }
  });
  
  DADOS.cotacoesAnteriores.forEach(c => {
    const rm = c._rmNome;
    const ag = c._agenciaNome;
    if (!porRMAnterior[rm]) porRMAnterior[rm] = { agencia: ag, cotacoes: 0, emitidos: 0, valor: 0 };
    porRMAnterior[rm].cotacoes++;
    if (categoriaStatus(c._status) === "emitido") {
      porRMAnterior[rm].emitidos++;
      porRMAnterior[rm].valor += c._valor;
    }
  });
  
  // Média global
  const totalEmitidos = Object.values(porRMAtual).reduce((s, r) => s + r.emitidos, 0);
  const totalCotacoes = Object.values(porRMAtual).reduce((s, r) => s + r.cotacoes, 0);
  const mediaConversao = totalCotacoes > 0 ? (totalEmitidos / totalCotacoes) * 100 : 0;
  
  const rms = Object.entries(porRMAtual).sort((a, b) => b[1].valor - a[1].valor);
  
  tbody.innerHTML = rms.map(([rm, at]) => {
    const an = porRMAnterior[rm] || { cotacoes: 0, emitidos: 0, valor: 0 };
    const dCot = calcDelta(at.cotacoes, an.cotacoes);
    const dEmi = calcDelta(at.emitidos, an.emitidos);
    const dVal = calcDelta(at.valor, an.valor);
    const conversao = at.cotacoes > 0 ? (at.emitidos / at.cotacoes) * 100 : 0;
    const vsMedia = conversao - mediaConversao;
    
    return `<tr>
      <td class="font-medium">${rm}</td>
      <td>${at.agencia}</td>
      <td>${fmtNum(at.cotacoes)}</td>
      <td class="${dCot >= 0 ? 'text-emerald-600' : 'text-red-600'}">${dCot >= 0 ? '+' : ''}${dCot.toFixed(0)}%</td>
      <td>${fmtNum(at.emitidos)}</td>
      <td class="${dEmi >= 0 ? 'text-emerald-600' : 'text-red-600'}">${dEmi >= 0 ? '+' : ''}${dEmi.toFixed(0)}%</td>
      <td>${fmtBRLShort(at.valor)}</td>
      <td class="${dVal >= 0 ? 'text-emerald-600' : 'text-red-600'}">${dVal >= 0 ? '+' : ''}${dVal.toFixed(0)}%</td>
      <td>${fmtPct(conversao)}</td>
      <td class="${vsMedia >= 0 ? 'text-emerald-600' : 'text-red-600'}">${vsMedia >= 0 ? '+' : ''}${vsMedia.toFixed(1)}pp</td>
    </tr>`;
  }).join('');
}

function renderTabelaCmpRamo() {
  const tbody = $("bodyCmpRamo");
  
  const porRamoAtual = {};
  const porRamoAnterior = {};
  
  DADOS.cotacoes.forEach(c => {
    const r = c._ramo;
    if (!porRamoAtual[r]) porRamoAtual[r] = { cotacoes: 0, valor: 0 };
    porRamoAtual[r].cotacoes++;
    porRamoAtual[r].valor += c._valor;
  });
  
  DADOS.cotacoesAnteriores.forEach(c => {
    const r = c._ramo;
    if (!porRamoAnterior[r]) porRamoAnterior[r] = { cotacoes: 0, valor: 0 };
    porRamoAnterior[r].cotacoes++;
    porRamoAnterior[r].valor += c._valor;
  });
  
  const ramos = Object.entries(porRamoAtual).sort((a, b) => b[1].valor - a[1].valor);
  
  tbody.innerHTML = ramos.map(([ramo, at]) => {
    const an = porRamoAnterior[ramo] || { cotacoes: 0, valor: 0 };
    const dCot = calcDelta(at.cotacoes, an.cotacoes);
    const dVal = calcDelta(at.valor, an.valor);
    
    return `<tr>
      <td class="font-medium">${ramo}</td>
      <td>${fmtNum(at.cotacoes)}</td>
      <td>${fmtNum(an.cotacoes)}</td>
      <td class="${dCot >= 0 ? 'text-emerald-600' : 'text-red-600'}">${dCot >= 0 ? '+' : ''}${dCot.toFixed(0)}%</td>
      <td>${fmtBRLShort(at.valor)}</td>
      <td>${fmtBRLShort(an.valor)}</td>
      <td class="${dVal >= 0 ? 'text-emerald-600' : 'text-red-600'} font-semibold">${dVal >= 0 ? '+' : ''}${dVal.toFixed(0)}%</td>
    </tr>`;
  }).join('');
}

// ==== ABA GERENCIAL ====
function atualizarGerencial() {
  const dados = DADOS.cotacoes;
  
  const emitidos = dados.filter(c => categoriaStatus(c._status) === "emitido");
  const pendentes = dados.filter(c => categoriaStatus(c._status) === "pendente");
  const recusados = dados.filter(c => categoriaStatus(c._status) === "recusado");
  const valorTotal = emitidos.reduce((s, c) => s + c._valor, 0);
  const conversao = dados.length > 0 ? (emitidos.length / dados.length) * 100 : 0;
  
  $("gerCotacoes").textContent = fmtNum(dados.length);
  $("gerEmitidos").textContent = fmtNum(emitidos.length);
  $("gerValor").textContent = fmtBRLShort(valorTotal);
  $("gerPendentes").textContent = fmtNum(pendentes.length);
  $("gerRecusados").textContent = fmtNum(recusados.length);
  $("gerConversao").textContent = fmtPct(conversao);
  
  // Popular filtro de status
  const statusUnicos = [...new Set(dados.map(c => c._status))].sort();
  $("gerFiltroStatus").innerHTML = '<option value="">Todos Status</option>' +
    statusUnicos.map(s => `<option value="${s}">${s}</option>`).join('');
  
  renderChartGerencialEvolucao();
  renderChartGerencialStatus();
  renderChartGerencialRamo();
  renderChartGerencialAgencia();
  renderTabelaGerencial();
}

function renderChartGerencialEvolucao() {
  const ctx = $("chartGerencialEvolucao");
  if (CHARTS.gerEvolucao) CHARTS.gerEvolucao.destroy();
  
  const porMes = {};
  DADOS.cotacoes.filter(c => categoriaStatus(c._status) === "emitido").forEach(c => {
    const data = c._vigenciaInicio || c._dataCriacao;
    if (data) {
      const key = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      if (!porMes[key]) porMes[key] = { qtd: 0, valor: 0 };
      porMes[key].qtd++;
      porMes[key].valor += c._valor;
    }
  });
  
  const meses = Object.keys(porMes).sort();
  const labels = meses.map(m => { const [a, mes] = m.split('-'); return `${mes}/${a.slice(2)}`; });
  
  CHARTS.gerEvolucao = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Quantidade', data: meses.map(m => porMes[m].qtd), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4, yAxisID: 'y' },
        { label: 'Valor', data: meses.map(m => porMes[m].valor), borderColor: '#10b981', borderDash: [5, 5], tension: 0.4, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { position: 'left', beginAtZero: true },
        y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: v => fmtBRLShort(v) } }
      }
    }
  });
}

function renderChartGerencialStatus() {
  const ctx = $("chartGerencialStatus");
  if (CHARTS.gerStatus) CHARTS.gerStatus.destroy();
  
  const porStatus = {};
  DADOS.cotacoes.forEach(c => {
    porStatus[c._status] = (porStatus[c._status] || 0) + 1;
  });
  
  const entries = Object.entries(porStatus).sort((a, b) => b[1] - a[1]);
  const cores = entries.map(([st]) => {
    const cat = categoriaStatus(st);
    if (cat === 'emitido') return '#10b981';
    if (cat === 'pendente') return '#f59e0b';
    if (cat === 'recusado') return '#ef4444';
    if (cat === 'emissao') return '#6366f1';
    return '#94a3b8';
  });
  
  CHARTS.gerStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(([st]) => st),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: cores, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: { legend: { position: 'right', labels: { usePointStyle: true } } }
    }
  });
}

function renderChartGerencialRamo() {
  const ctx = $("chartGerencialRamo");
  if (CHARTS.gerRamo) CHARTS.gerRamo.destroy();
  
  const porRamo = {};
  DADOS.cotacoes.filter(c => categoriaStatus(c._status) === "emitido").forEach(c => {
    porRamo[c._ramo] = (porRamo[c._ramo] || 0) + c._valor;
  });
  
  const entries = Object.entries(porRamo).sort((a, b) => b[1] - a[1]).slice(0, 10);
  
  CHARTS.gerRamo = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(([r]) => r.length > 15 ? r.slice(0, 15) + '...' : r),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: '#6366f1', borderRadius: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { callback: v => fmtBRLShort(v) } } }
    }
  });
}

function renderChartGerencialAgencia() {
  const ctx = $("chartGerencialAgencia");
  if (CHARTS.gerAgencia) CHARTS.gerAgencia.destroy();
  
  const porAgencia = {};
  DADOS.cotacoes.filter(c => categoriaStatus(c._status) === "emitido").forEach(c => {
    if (!porAgencia[c._agenciaNome]) porAgencia[c._agenciaNome] = { qtd: 0, valor: 0 };
    porAgencia[c._agenciaNome].qtd++;
    porAgencia[c._agenciaNome].valor += c._valor;
  });
  
  const entries = Object.entries(porAgencia).sort((a, b) => b[1].valor - a[1].valor).slice(0, 8);
  
  CHARTS.gerAgencia = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(([a]) => a.length > 20 ? a.slice(0, 20) + '...' : a),
      datasets: [
        { label: 'Quantidade', data: entries.map(([, d]) => d.qtd), backgroundColor: '#6366f1', borderRadius: 4 },
        { label: 'Valor (÷1000)', data: entries.map(([, d]) => d.valor / 1000), backgroundColor: '#10b981', borderRadius: 4 }
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

let dadosGerencialFiltrados = [];
function renderTabelaGerencial() {
  const filtroStatus = $("gerFiltroStatus").value;
  const busca = normalizar($("gerBusca").value);
  
  dadosGerencialFiltrados = DADOS.cotacoes.filter(c => {
    if (filtroStatus && c._status !== filtroStatus) return false;
    if (busca && !normalizar(c._empresaNome).includes(busca) && !normalizar(c._rmNome).includes(busca)) return false;
    return true;
  });
  
  const tbody = $("bodyGerencial");
  tbody.innerHTML = dadosGerencialFiltrados.slice(0, 100).map(c => `
    <tr>
      <td class="font-medium">${c._empresaNome}</td>
      <td>${c._agenciaNome}</td>
      <td>${c._rmNome}</td>
      <td>${c._ramo}</td>
      <td class="font-semibold">${fmtBRL(c._valor)}</td>
      <td><span class="badge ${corBadge(c._status)}">${c._status}</span></td>
      <td>${fmtData(c._vigenciaInicio)}</td>
      <td>${fmtData(c._vigenciaFim)}</td>
    </tr>
  `).join('');
}

function filtrarTabelaGerencial() {
  renderTabelaGerencial();
}

// ==== ABA RENOVAÇÕES ====
function atualizarRenovacoes() {
  const vencimentos = DADOS.vencimentos;
  const hoje = new Date();
  
  const venc7 = vencimentos.filter(v => v._diasParaVencer > 0 && v._diasParaVencer <= 7);
  const venc30 = vencimentos.filter(v => v._diasParaVencer > 0 && v._diasParaVencer <= 30);
  const renovados = vencimentos.filter(v => v._diasParaVencer <= 0);
  
  const valorVenc7 = venc7.reduce((s, v) => s + v._valor, 0);
  const valorVenc30 = venc30.reduce((s, v) => s + v._valor, 0);
  const valorRenovados = renovados.reduce((s, v) => s + v._valor, 0);
  
  $("renVenc7").textContent = fmtNum(venc7.length);
  $("renVenc7Valor").textContent = fmtBRLShort(valorVenc7) + " em risco";
  
  $("renVenc30").textContent = fmtNum(venc30.length);
  $("renVenc30Valor").textContent = fmtBRLShort(valorVenc30) + " em risco";
  
  $("renRenovados").textContent = fmtNum(renovados.length);
  $("renRenovadosValor").textContent = fmtBRLShort(valorRenovados);
  
  const totalVencendo = vencimentos.filter(v => v._diasParaVencer > 0).length;
  const valorRisco = vencimentos.filter(v => v._diasParaVencer > 0).reduce((s, v) => s + v._valor, 0);
  const taxaRenovacao = totalVencendo > 0 ? (renovados.length / (renovados.length + totalVencendo)) * 100 : 0;
  const ticketMedio = renovados.length > 0 ? valorRenovados / renovados.length : 0;
  
  $("renTotal").textContent = fmtNum(totalVencendo);
  $("renValorRisco").textContent = fmtBRLShort(valorRisco);
  $("renTaxa").textContent = fmtPct(taxaRenovacao);
  $("renTicket").textContent = fmtBRLShort(ticketMedio);
  
  renderChartRenovacoesVencimentos();
  renderChartRenovacoesRamo();
  filtrarRenovacoes();
}

function renderChartRenovacoesVencimentos() {
  const ctx = $("chartRenovacoesVencimentos");
  if (CHARTS.renVenc) CHARTS.renVenc.destroy();
  
  const porMes = {};
  DADOS.vencimentos.filter(v => v._diasParaVencer > 0).forEach(v => {
    if (v._vigenciaFim) {
      const key = `${v._vigenciaFim.getFullYear()}-${String(v._vigenciaFim.getMonth() + 1).padStart(2, '0')}`;
      if (!porMes[key]) porMes[key] = { qtd: 0, valor: 0 };
      porMes[key].qtd++;
      porMes[key].valor += v._valor;
    }
  });
  
  const meses = Object.keys(porMes).sort().slice(0, 12);
  const labels = meses.map(m => { const [a, mes] = m.split('-'); return `${mes}/${a.slice(2)}`; });
  
  CHARTS.renVenc = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Quantidade', data: meses.map(m => porMes[m].qtd), backgroundColor: '#f59e0b', borderRadius: 4, yAxisID: 'y' },
        { label: 'Valor', data: meses.map(m => porMes[m].valor), type: 'line', borderColor: '#ef4444', tension: 0.4, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { position: 'left', beginAtZero: true },
        y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: v => fmtBRLShort(v) } }
      }
    }
  });
}

function renderChartRenovacoesRamo() {
  const ctx = $("chartRenovacoesRamo");
  if (CHARTS.renRamo) CHARTS.renRamo.destroy();
  
  const porRamo = {};
  DADOS.vencimentos.filter(v => v._diasParaVencer > 0).forEach(v => {
    porRamo[v._ramo] = (porRamo[v._ramo] || 0) + v._valor;
  });
  
  const entries = Object.entries(porRamo).sort((a, b) => b[1] - a[1]).slice(0, 8);
  
  CHARTS.renRamo = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: entries.map(([r]) => r),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { usePointStyle: true } } }
    }
  });
}

function filtrarRenovacoes() {
  const periodo = $("renFiltroPeriodo").value;
  let dados = DADOS.vencimentos.filter(v => v._diasParaVencer > 0);
  
  if (periodo !== 'all') {
    const dias = parseInt(periodo);
    dados = dados.filter(v => v._diasParaVencer <= dias);
  }
  
  dados.sort((a, b) => a._diasParaVencer - b._diasParaVencer);
  
  const tbody = $("bodyRenovacoes");
  tbody.innerHTML = dados.map(v => {
    const urgencia = v._diasParaVencer <= 7 ? 'text-red-600 font-bold' : v._diasParaVencer <= 30 ? 'text-amber-600' : '';
    return `<tr>
      <td class="font-medium">${v._empresaNome}</td>
      <td>${v._ramo}</td>
      <td>${v._rmNome}</td>
      <td>${v._agenciaNome}</td>
      <td>${fmtData(v._vigenciaFim)}</td>
      <td class="${urgencia}">${v._diasParaVencer}</td>
      <td class="font-semibold">${fmtBRL(v._valor)}</td>
      <td>${v._seguradora}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="text-center py-8 text-slate-400">Nenhum vencimento encontrado</td></tr>';
}

// ==== ABA VISITAS ====
function atualizarVisitas() {
  const visitas = DADOS.visitas;
  const realizadas = visitas.filter(v => v._realizada);
  const agendadas = visitas.filter(v => !v._realizada);
  const presenciais = visitas.filter(v => v._tipo.includes('presencial'));
  const online = visitas.filter(v => v._tipo.includes('online') || v._tipo.includes('video') || v._tipo.includes('remot'));
  
  $("visTotal").textContent = fmtNum(visitas.length);
  $("visRealizadas").textContent = fmtNum(realizadas.length);
  $("visAgendadas").textContent = fmtNum(agendadas.length);
  $("visPresenciais").textContent = fmtNum(presenciais.length);
  $("visOnline").textContent = fmtNum(online.length);
  
  // Média por mês
  const meses = new Set();
  visitas.forEach(v => {
    if (v._data) meses.add(`${v._data.getFullYear()}-${v._data.getMonth()}`);
  });
  const media = meses.size > 0 ? visitas.length / meses.size : 0;
  $("visMedia").textContent = fmtNum(Math.round(media));
  
  renderChartVisitasMes();
  renderChartVisitasRM();
  renderChartVisitasTipo();
  renderChartVisitasDia();
  renderTabelaVisitas();
}

function renderChartVisitasMes() {
  const ctx = $("chartVisitasMes");
  if (CHARTS.visMes) CHARTS.visMes.destroy();
  
  const porMes = {};
  DADOS.visitas.forEach(v => {
    if (v._data) {
      const key = `${v._data.getFullYear()}-${String(v._data.getMonth() + 1).padStart(2, '0')}`;
      porMes[key] = (porMes[key] || 0) + 1;
    }
  });
  
  const meses = Object.keys(porMes).sort();
  const labels = meses.map(m => { const [a, mes] = m.split('-'); return `${mes}/${a.slice(2)}`; });
  
  CHARTS.visMes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: meses.map(m => porMes[m]), backgroundColor: '#6366f1', borderRadius: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

function renderChartVisitasRM() {
  const ctx = $("chartVisitasRM");
  if (CHARTS.visRM) CHARTS.visRM.destroy();
  
  const porRM = {};
  DADOS.visitas.forEach(v => {
    porRM[v._rmNome] = (porRM[v._rmNome] || 0) + 1;
  });
  
  const entries = Object.entries(porRM).sort((a, b) => b[1] - a[1]).slice(0, 10);
  
  CHARTS.visRM = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(([r]) => r),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: '#10b981', borderRadius: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } }
    }
  });
}

function renderChartVisitasTipo() {
  const ctx = $("chartVisitasTipo");
  if (CHARTS.visTipo) CHARTS.visTipo.destroy();
  
  const presenciais = DADOS.visitas.filter(v => v._tipo.includes('presencial')).length;
  const online = DADOS.visitas.filter(v => v._tipo.includes('online') || v._tipo.includes('video') || v._tipo.includes('remot')).length;
  const outros = DADOS.visitas.length - presenciais - online;
  
  CHARTS.visTipo = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Presencial', 'Online', 'Outros'],
      datasets: [{ data: [presenciais, online, outros], backgroundColor: ['#6366f1', '#10b981', '#94a3b8'], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function renderChartVisitasDia() {
  const ctx = $("chartVisitasDia");
  if (CHARTS.visDia) CHARTS.visDia.destroy();
  
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const porDia = [0, 0, 0, 0, 0, 0, 0];
  
  DADOS.visitas.forEach(v => {
    if (v._data) porDia[v._data.getDay()]++;
  });
  
  CHARTS.visDia = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dias,
      datasets: [{ data: porDia, backgroundColor: '#f59e0b', borderRadius: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

function renderTabelaVisitas() {
  const tbody = $("bodyVisitas");
  const visitas = [...DADOS.visitas].sort((a, b) => (b._data || 0) - (a._data || 0)).slice(0, 100);
  
  tbody.innerHTML = visitas.map(v => `<tr>
    <td>${fmtData(v._data)}</td>
    <td class="font-medium">${v._empresaNome}</td>
    <td>${v._rmNome}</td>
    <td>${v._agenciaNome}</td>
    <td><span class="badge ${v._tipo.includes('presencial') ? 'badge-info' : 'badge-success'}">${v._tipo || 'Presencial'}</span></td>
    <td class="max-w-[200px] truncate">${v.observacoes || '-'}</td>
  </tr>`).join('') || '<tr><td colspan="6" class="text-center py-8 text-slate-400">Nenhuma visita encontrada</td></tr>';
}

// ==== ABA EQUIPE ====
function atualizarEquipe() {
  const porRM = {};
  
  DADOS.cotacoes.forEach(c => {
    const rm = c._rmNome;
    const ag = c._agenciaNome;
    if (!porRM[rm]) porRM[rm] = { agencia: ag, cotacoes: 0, emitidos: 0, valor: 0 };
    porRM[rm].cotacoes++;
    if (categoriaStatus(c._status) === "emitido") {
      porRM[rm].emitidos++;
      porRM[rm].valor += c._valor;
    }
  });
  
  // Calcular métricas
  const rms = Object.entries(porRM).map(([nome, d]) => ({
    nome,
    ...d,
    conversao: d.cotacoes > 0 ? (d.emitidos / d.cotacoes) * 100 : 0,
    ticket: d.emitidos > 0 ? d.valor / d.emitidos : 0
  }));
  
  // Médias
  const totalValor = rms.reduce((s, r) => s + r.valor, 0);
  const totalCotacoes = rms.reduce((s, r) => s + r.cotacoes, 0);
  const totalEmitidos = rms.reduce((s, r) => s + r.emitidos, 0);
  const mediaGlobal = rms.length > 0 ? totalValor / rms.length : 0;
  const conversaoGlobal = totalCotacoes > 0 ? (totalEmitidos / totalCotacoes) * 100 : 0;
  
  // Por agência
  const porAgencia = {};
  rms.forEach(r => {
    if (!porAgencia[r.agencia]) porAgencia[r.agencia] = { valor: 0, qtd: 0 };
    porAgencia[r.agencia].valor += r.valor;
    porAgencia[r.agencia].qtd++;
  });
  const mediaAgencia = Object.keys(porAgencia).length > 0 ?
    Object.values(porAgencia).reduce((s, a) => s + a.valor / a.qtd, 0) / Object.keys(porAgencia).length : 0;
  
  $("eqMediaGlobal").textContent = fmtBRLShort(mediaGlobal);
  $("eqMediaGlobalConv").textContent = `Conversão: ${fmtPct(conversaoGlobal)}`;
  $("eqMediaAgencia").textContent = fmtBRLShort(mediaAgencia);
  $("eqMediaAgenciaConv").textContent = `${Object.keys(porAgencia).length} agências`;
  $("eqMediaRM").textContent = fmtBRLShort(rms.length > 0 ? totalValor / rms.length : 0);
  $("eqMediaRMConv").textContent = `${rms.length} gerentes`;
  
  // Rankings
  renderRanking("rankProducao", rms.sort((a, b) => b.valor - a.valor).slice(0, 10), r => fmtBRLShort(r.valor));
  renderRanking("rankConversao", rms.filter(r => r.cotacoes >= 3).sort((a, b) => b.conversao - a.conversao).slice(0, 10), r => fmtPct(r.conversao));
  renderRanking("rankVolume", rms.sort((a, b) => b.cotacoes - a.cotacoes).slice(0, 10), r => `${r.cotacoes} cotações`);
  
  // Gráfico comparativo
  renderChartEquipeComparativo(rms, mediaGlobal);
  
  // Tabela
  renderTabelaEquipe(rms, mediaGlobal, porAgencia);
}

function renderRanking(containerId, items, valueFormatter) {
  const container = $(containerId);
  container.innerHTML = items.map((r, i) => `
    <div class="rank-item">
      <div class="rank-badge ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other'}">${i + 1}</div>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-slate-800 truncate">${r.nome}</div>
        <div class="text-xs text-slate-500">${r.agencia}</div>
      </div>
      <div class="font-bold text-slate-700">${valueFormatter(r)}</div>
    </div>
  `).join('') || '<div class="text-slate-400 text-sm p-4">Sem dados</div>';
}

function renderChartEquipeComparativo(rms, mediaGlobal) {
  const ctx = $("chartEquipeComparativo");
  if (CHARTS.eqComp) CHARTS.eqComp.destroy();
  
  const top10 = rms.sort((a, b) => b.valor - a.valor).slice(0, 10);
  
  CHARTS.eqComp = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(r => r.nome.split(' ')[0]),
      datasets: [
        { label: 'Produção', data: top10.map(r => r.valor), backgroundColor: '#6366f1', borderRadius: 4 },
        { label: 'Média Global', data: top10.map(() => mediaGlobal), type: 'line', borderColor: '#ef4444', borderDash: [5, 5], pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => fmtBRLShort(v) } } }
    }
  });
}

function renderTabelaEquipe(rms, mediaGlobal, porAgencia) {
  const tbody = $("bodyEquipe");
  const sorted = rms.sort((a, b) => b.valor - a.valor);
  
  tbody.innerHTML = sorted.map((r, i) => {
    const vsGlobal = mediaGlobal > 0 ? ((r.valor - mediaGlobal) / mediaGlobal) * 100 : 0;
    const mediaAg = porAgencia[r.agencia]?.qtd > 0 ? porAgencia[r.agencia].valor / porAgencia[r.agencia].qtd : 0;
    const vsAgencia = mediaAg > 0 ? ((r.valor - mediaAg) / mediaAg) * 100 : 0;
    
    return `<tr class="${i < 3 ? 'highlight-row' : ''}">
      <td class="font-bold ${i < 3 ? 'text-amber-600' : ''}">${i + 1}</td>
      <td class="font-medium">${r.nome}</td>
      <td>${r.agencia}</td>
      <td>${fmtNum(r.cotacoes)}</td>
      <td>${fmtNum(r.emitidos)}</td>
      <td class="font-semibold">${fmtBRLShort(r.valor)}</td>
      <td>${fmtBRLShort(r.ticket)}</td>
      <td>${fmtPct(r.conversao)}</td>
      <td class="${vsGlobal >= 0 ? 'text-emerald-600' : 'text-red-600'}">${vsGlobal >= 0 ? '+' : ''}${vsGlobal.toFixed(0)}%</td>
      <td class="${vsAgencia >= 0 ? 'text-emerald-600' : 'text-red-600'}">${vsAgencia >= 0 ? '+' : ''}${vsAgencia.toFixed(0)}%</td>
    </tr>`;
  }).join('');
}

// ==== TAB SWITCHING ====
function switchMainTab(tab) {
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.main-tab[data-tab="${tab}"]`).classList.add('active');
  
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  $(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
}

function switchSubTab(mainTab, subTab) {
  const container = $(`tab${mainTab.charAt(0).toUpperCase() + mainTab.slice(1)}`);
  container.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  container.querySelector(`.sub-tab[data-subtab="${subTab}"]`).classList.add('active');
  
  container.querySelectorAll('[id^="sub"]').forEach(c => c.classList.add('hidden'));
  $(`sub${subTab.charAt(0).toUpperCase() + subTab.slice(1)}`).classList.remove('hidden');
}

// ==== EXPORTS ====
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  doc.setFontSize(18);
  doc.text('Central de Relatórios - Retorno Seguros', 14, 15);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 22);
  
  // Dados da aba ativa
  const tabAtiva = document.querySelector('.main-tab.active')?.dataset.tab || 'comparativo';
  
  let dados = [];
  let headers = [];
  
  if (tabAtiva === 'gerencial') {
    headers = ['Empresa', 'Agência', 'Gerente', 'Ramo', 'Valor', 'Status'];
    dados = dadosGerencialFiltrados.map(c => [c._empresaNome, c._agenciaNome, c._rmNome, c._ramo, fmtBRL(c._valor), c._status]);
  } else if (tabAtiva === 'renovacoes') {
    headers = ['Empresa', 'Ramo', 'Gerente', 'Vencimento', 'Dias', 'Prêmio'];
    dados = DADOS.vencimentos.filter(v => v._diasParaVencer > 0).map(v => [v._empresaNome, v._ramo, v._rmNome, fmtData(v._vigenciaFim), v._diasParaVencer, fmtBRL(v._valor)]);
  } else {
    headers = ['Métrica', 'Atual', 'Anterior', 'Variação'];
    const cot = DADOS.cotacoes.length;
    const cotAnt = DADOS.cotacoesAnteriores.length;
    const emi = DADOS.cotacoes.filter(c => categoriaStatus(c._status) === 'emitido').length;
    const emiAnt = DADOS.cotacoesAnteriores.filter(c => categoriaStatus(c._status) === 'emitido').length;
    dados = [
      ['Cotações', cot, cotAnt, `${calcDelta(cot, cotAnt).toFixed(1)}%`],
      ['Emitidos', emi, emiAnt, `${calcDelta(emi, emiAnt).toFixed(1)}%`]
    ];
  }
  
  doc.autoTable({
    startY: 30,
    head: [headers],
    body: dados.slice(0, 50),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] }
  });
  
  doc.save(`relatorio-${tabAtiva}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportarExcel() {
  const tabAtiva = document.querySelector('.main-tab.active')?.dataset.tab || 'comparativo';
  
  let dados = [];
  
  if (tabAtiva === 'gerencial') {
    dados = dadosGerencialFiltrados.map(c => ({
      Empresa: c._empresaNome,
      Agência: c._agenciaNome,
      Gerente: c._rmNome,
      Ramo: c._ramo,
      Valor: c._valor,
      Status: c._status,
      'Vigência Início': fmtData(c._vigenciaInicio),
      'Vigência Fim': fmtData(c._vigenciaFim)
    }));
  } else if (tabAtiva === 'renovacoes') {
    dados = DADOS.vencimentos.map(v => ({
      Empresa: v._empresaNome,
      Ramo: v._ramo,
      Gerente: v._rmNome,
      Agência: v._agenciaNome,
      Vencimento: fmtData(v._vigenciaFim),
      'Dias para Vencer': v._diasParaVencer,
      Prêmio: v._valor,
      Seguradora: v._seguradora
    }));
  } else if (tabAtiva === 'visitas') {
    dados = DADOS.visitas.map(v => ({
      Data: fmtData(v._data),
      Empresa: v._empresaNome,
      Gerente: v._rmNome,
      Agência: v._agenciaNome,
      Tipo: v._tipo
    }));
  } else {
    dados = DADOS.cotacoes.map(c => ({
      Empresa: c._empresaNome,
      Agência: c._agenciaNome,
      Gerente: c._rmNome,
      Ramo: c._ramo,
      Valor: c._valor,
      Status: c._status
    }));
  }
  
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tabAtiva);
  XLSX.writeFile(wb, `relatorio-${tabAtiva}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==== Globals ====
window.switchMainTab = switchMainTab;
window.switchSubTab = switchSubTab;
window.aplicarPreset = aplicarPreset;
window.mudarComparacao = mudarComparacao;
window.filtrarTabelaGerencial = filtrarTabelaGerencial;
window.filtrarRenovacoes = filtrarRenovacoes;
window.exportarPDF = exportarPDF;
window.exportarExcel = exportarExcel;
