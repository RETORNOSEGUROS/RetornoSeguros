// visitas-relatorio.js — Relatório de Visitas Premium
// Firebase v8

// ==== Firebase Init ====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ==== Estado Global ====
let CTX = { uid: null, perfil: null, agenciaId: null, nome: null, isAdmin: false };
const ADMIN_EMAILS = ["patrick@retornoseguros.com.br"];

let LINHAS = []; // Flatten: uma linha por ramo
let LINHAS_FILTRADAS = [];
let VISITAS_RAW = []; // Docs originais
let AGENCIAS = {};
let EMPRESAS_AGENCIA = new Set();
let CACHE_EMPRESAS = {};
let CACHE_USUARIOS = {};

// Ordenação
let sortKey = "vencimento";
let sortDir = "asc";

// Charts
let chartMeses = null;
let chartTipos = null;

// ==== Helpers ====
const $ = id => document.getElementById(id);
const normalizar = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const fmtBRL = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtBRLCompact = v => {
  if (v >= 1000000) return `R$ ${(v/1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v/1000).toFixed(0)}K`;
  return fmtBRL(v);
};

const MESES_NOME = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_ABREV = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function isGC(perfil) {
  if (!perfil) return false;
  const p = normalizar(perfil);
  return p === "gerente chefe" || p === "gerente-chefe" || p === "gerente_chefe";
}

function parseCurrency(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  const hasC = s.includes(","), hasD = s.includes(".");
  if (hasC && hasD) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  if (hasC && !hasD) return Number(s.replace(",", ".")) || 0;
  if (!hasC && hasD) {
    const last = s.split(".").pop();
    return (last.length === 2 ? Number(s) : Number(s.replace(/\./g, ""))) || 0;
  }
  return Number(s) || 0;
}

function extrairDMY(venc) {
  if (!venc) return { dd: null, mm: null, yyyy: null };
  
  // Firestore Timestamp
  if (venc && typeof venc.toDate === "function") {
    const d = venc.toDate();
    return { dd: d.getDate(), mm: d.getMonth() + 1, yyyy: d.getFullYear() };
  }
  
  // String DD/MM/YYYY
  if (typeof venc === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(venc)) {
    const [dd, mm, yyyy] = venc.split("/").map(n => parseInt(n, 10));
    return { dd, mm, yyyy };
  }
  
  // String DD/MM
  if (typeof venc === "string" && /^\d{2}\/\d{2}$/.test(venc)) {
    const [dd, mm] = venc.split("/").map(n => parseInt(n, 10));
    return { dd, mm, yyyy: null };
  }
  
  // String YYYY-MM-DD
  if (typeof venc === "string" && /^\d{4}-\d{2}-\d{2}$/.test(venc)) {
    const [yyyy, mm, dd] = venc.split("-").map(n => parseInt(n, 10));
    return { dd, mm, yyyy };
  }
  
  return { dd: null, mm: null, yyyy: null };
}

function dmyToString({ dd, mm, yyyy }) {
  if (!dd && !mm) return "-";
  const d = dd ? String(dd).padStart(2, "0") : "??";
  const m = mm ? String(mm).padStart(2, "0") : "??";
  return yyyy ? `${d}/${m}/${yyyy}` : `${d}/${m}`;
}

function toDate(val) {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(+d) ? null : d;
  }
  if (val instanceof Date) return val;
  return null;
}

function getUrgencia(mm, yyyy) {
  if (!mm || !yyyy) return { tipo: "semdata", label: "Sem data", class: "" };
  
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  
  const vencDate = new Date(yyyy, mm - 1, 15);
  const diffMeses = (yyyy - anoAtual) * 12 + (mm - mesAtual);
  
  if (diffMeses < 0) return { tipo: "vencido", label: "Vencido", class: "urgente" };
  if (diffMeses === 0) return { tipo: "estemes", label: "Este mês", class: "urgente" };
  if (diffMeses <= 2) return { tipo: "proximo", label: `${diffMeses}m`, class: "proximo" };
  return { tipo: "normal", label: `${diffMeses}m`, class: "normal" };
}

// ==== Auth ====
auth.onAuthStateChanged(async user => {
  if (!user) { location.href = "login.html"; return; }
  
  CTX.uid = user.uid;
  CTX.email = user.email;
  
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
    }
  } catch (e) { console.warn("Erro perfil:", e); }
  
  // Mostrar coluna de ações só para admin
  document.querySelectorAll(".th-acoes").forEach(th => {
    th.style.display = CTX.isAdmin ? "" : "none";
  });
  
  // Ocultar aba ranking para RM
  const tabRankingBtn = $("tabRankingBtn");
  if (tabRankingBtn && !CTX.isAdmin && !isGC(CTX.perfil)) {
    tabRankingBtn.style.display = "none";
  }
  
  await init();
});

// ==== Inicialização ====
async function init() {
  await carregarAgencias();
  
  if (!CTX.isAdmin && (isGC(CTX.perfil) || CTX.perfil === "assistente") && CTX.agenciaId) {
    await carregarEmpresasAgencia();
  }
  
  await carregarDados();
  
  montarFiltros();
  aplicarFiltros();
}

// ==== Carregar Dados ====
async function carregarAgencias() {
  try {
    const snap = await db.collection("agencias_banco").get();
    snap.forEach(doc => {
      const d = doc.data();
      AGENCIAS[doc.id] = d.nome || "(Sem nome)";
    });
  } catch (e) { console.warn("Erro agências:", e); }
}

async function carregarEmpresasAgencia() {
  try {
    const snap = await db.collection("empresas").where("agenciaId", "==", CTX.agenciaId).get();
    snap.forEach(doc => EMPRESAS_AGENCIA.add(doc.id));
  } catch (e) { console.warn("Erro empresas agência:", e); }
}

async function getEmpresaInfo(empId) {
  if (!empId) return { nome: "-", rmNome: "-", agenciaId: "-" };
  if (CACHE_EMPRESAS[empId]) return CACHE_EMPRESAS[empId];
  
  try {
    const snap = await db.collection("empresas").doc(empId).get();
    if (!snap.exists) {
      const info = { nome: empId, rmNome: "-", agenciaId: "-" };
      CACHE_EMPRESAS[empId] = info;
      return info;
    }
    const d = snap.data() || {};
    const info = {
      nome: d.nome || empId,
      rmNome: d.rmNome || d.rm || "-",
      agenciaId: d.agenciaId || "-"
    };
    CACHE_EMPRESAS[empId] = info;
    return info;
  } catch {
    return { nome: empId, rmNome: "-", agenciaId: "-" };
  }
}

async function getUsuarioNome(uid) {
  if (!uid) return "-";
  if (CACHE_USUARIOS[uid]) return CACHE_USUARIOS[uid];
  
  try {
    const snap = await db.collection("usuarios_banco").doc(uid).get();
    const nome = snap.exists ? (snap.data().nome || uid) : uid;
    CACHE_USUARIOS[uid] = nome;
    return nome;
  } catch {
    return uid;
  }
}

async function carregarDados() {
  LINHAS = [];
  VISITAS_RAW = [];
  
  console.log("[Visitas] Iniciando carga...");
  
  // Buscar visitas com RBAC
  const docs = await coletarVisitasPorPerfil();
  console.log(`[Visitas] Total docs: ${docs.length}`);
  
  // Processar cada visita
  for (const doc of docs) {
    const v = { id: doc.id, ...(doc.data() || {}) };
    
    // Data de criação
    v.dataObj = toDate(v.criadoEm) || new Date();
    
    // Info da empresa
    if (v.empresaId) {
      const emp = await getEmpresaInfo(v.empresaId);
      v.empresaNome = v.empresaNome || emp.nome;
      v.agenciaId = v.agenciaId || emp.agenciaId;
      v.rmNome = v.rmNome || emp.rmNome;
    }
    
    // Resolve nome da agência
    v.agenciaNome = AGENCIAS[v.agenciaId] || v.agenciaId || "-";
    
    // RBAC extra
    if (!CTX.isAdmin && (isGC(CTX.perfil) || CTX.perfil === "assistente") && CTX.agenciaId) {
      const ag = v.agenciaId || "-";
      if (String(ag) !== String(CTX.agenciaId) && !EMPRESAS_AGENCIA.has(v.empresaId)) continue;
    }
    
    VISITAS_RAW.push(v);
    
    // Flatten por ramo
    const ramos = v.ramos || {};
    const ramoKeys = Object.keys(ramos);
    
    // Se não tem ramos, cria linha genérica
    if (ramoKeys.length === 0) {
      LINHAS.push({
        visitaId: v.id,
        dataVisita: v.dataObj,
        dataVisitaStr: v.dataObj.toLocaleDateString("pt-BR"),
        tipoVisita: v.tipoVisita || "-",
        empresaId: v.empresaId || "",
        empresaNome: v.empresaNome || "-",
        agenciaId: v.agenciaId || "-",
        agenciaNome: v.agenciaNome,
        rmNome: v.rmNome || "-",
        numeroFuncionarios: v.numeroFuncionarios || "-",
        ramo: "(SEM RAMO)",
        vencDD: null,
        vencMM: null,
        vencYYYY: null,
        vencStr: "-",
        premio: 0,
        seguradora: "-"
      });
      continue;
    }
    
    // Uma linha para cada ramo
    for (const ramo of ramoKeys) {
      const info = ramos[ramo] || {};
      const { dd, mm, yyyy } = extrairDMY(info.vencimento || info.fimVigencia || info.dataVencimento);
      
      LINHAS.push({
        visitaId: v.id,
        dataVisita: v.dataObj,
        dataVisitaStr: v.dataObj.toLocaleDateString("pt-BR"),
        tipoVisita: v.tipoVisita || "-",
        empresaId: v.empresaId || "",
        empresaNome: v.empresaNome || "-",
        agenciaId: v.agenciaId || "-",
        agenciaNome: v.agenciaNome,
        rmNome: v.rmNome || "-",
        numeroFuncionarios: v.numeroFuncionarios || "-",
        ramo: (ramo || "").toUpperCase().replace(/_/g, " "),
        vencDD: dd,
        vencMM: mm,
        vencYYYY: yyyy,
        vencStr: dmyToString({ dd, mm, yyyy }),
        premio: parseCurrency(info.premio || info.valorEstimado || info.valor || 0),
        seguradora: info.seguradora || "-"
      });
    }
  }
  
  console.log(`[Visitas] Total linhas (flatten): ${LINHAS.length}`);
}

async function coletarVisitasPorPerfil() {
  const col = db.collection("visitas");
  
  // Admin: tudo
  if (CTX.isAdmin) {
    try {
      return (await col.orderBy("criadoEm", "desc").get()).docs;
    } catch {
      return (await col.get()).docs;
    }
  }
  
  // Gerente Chefe / Assistente: por agência
  if ((isGC(CTX.perfil) || CTX.perfil === "assistente") && CTX.agenciaId) {
    const map = new Map();
    
    // Docs com agenciaId
    try {
      const snapA = await col.where("agenciaId", "==", CTX.agenciaId).get();
      snapA.forEach(d => map.set(d.id, d));
    } catch {}
    
    // Complemento por empresaId
    if (EMPRESAS_AGENCIA.size) {
      const ids = Array.from(EMPRESAS_AGENCIA);
      for (let i = 0; i < ids.length; i += 10) {
        try {
          const snapB = await col.where("empresaId", "in", ids.slice(i, i + 10)).get();
          snapB.forEach(d => map.set(d.id, d));
        } catch {}
      }
    }
    
    return Array.from(map.values());
  }
  
  // RM: somente próprias
  const buckets = [];
  try { buckets.push(await col.where("usuarioId", "==", CTX.uid).get()); } catch {}
  try { buckets.push(await col.where("rmUid", "==", CTX.uid).get()); } catch {}
  try { buckets.push(await col.where("rmId", "==", CTX.uid).get()); } catch {}
  try { buckets.push(await col.where("gerenteId", "==", CTX.uid).get()); } catch {}
  try { buckets.push(await col.where("criadoPorUid", "==", CTX.uid).get()); } catch {}
  
  const map = new Map();
  buckets.forEach(s => s?.docs.forEach(d => map.set(d.id, d)));
  return Array.from(map.values());
}

// ==== Filtros ====
function montarFiltros() {
  // Anos
  const anosSet = new Set();
  LINHAS.forEach(l => { if (l.vencYYYY) anosSet.add(l.vencYYYY); });
  const anos = Array.from(anosSet).sort((a, b) => a - b);
  
  const selAno = $("filtroAno");
  if (selAno) {
    selAno.innerHTML = '<option value="">Todos</option>';
    anos.forEach(ano => {
      selAno.innerHTML += `<option value="${ano}">${ano}</option>`;
    });
  }
  
  // Agências (só Admin vê)
  const selAgencia = $("filtroAgencia");
  const grpAgencia = $("filtroAgenciaGroup");
  if (CTX.isAdmin) {
    if (selAgencia) {
      selAgencia.innerHTML = '<option value="">Todas</option>';
      const agsSet = new Set();
      LINHAS.forEach(l => { if (l.agenciaId && l.agenciaId !== "-") agsSet.add(l.agenciaId); });
      Array.from(agsSet).sort().forEach(agId => {
        selAgencia.innerHTML += `<option value="${agId}">${AGENCIAS[agId] || agId}</option>`;
      });
    }
  } else {
    if (grpAgencia) grpAgencia.style.display = 'none';
  }
  
  // RMs (Admin e GC veem)
  const selRM = $("filtroRM");
  const grpRM = $("filtroRMGroup");
  if (CTX.isAdmin || isGC(CTX.perfil)) {
    if (selRM) {
      selRM.innerHTML = '<option value="">Todos</option>';
      const rmsSet = new Set();
      LINHAS.forEach(l => { if (l.rmNome && l.rmNome !== "-") rmsSet.add(l.rmNome); });
      Array.from(rmsSet).sort().forEach(rm => {
        selRM.innerHTML += `<option value="${rm}">${rm}</option>`;
      });
    }
  } else {
    if (grpRM) grpRM.style.display = 'none';
  }
  
  // Ramos
  const selRamo = $("filtroRamo");
  if (selRamo) {
    selRamo.innerHTML = '<option value="">Todos</option>';
    const ramosSet = new Set();
    LINHAS.forEach(l => { if (l.ramo && l.ramo !== "-" && l.ramo !== "(SEM RAMO)") ramosSet.add(l.ramo); });
    Array.from(ramosSet).sort().forEach(ramo => {
      selRamo.innerHTML += `<option value="${ramo}">${ramo}</option>`;
    });
  }
  
  // Seguradoras
  const selSeguradora = $("filtroSeguradora");
  if (selSeguradora) {
    selSeguradora.innerHTML = '<option value="">Todas</option>';
    const segsSet = new Set();
    LINHAS.forEach(l => { if (l.seguradora && l.seguradora !== "-") segsSet.add(l.seguradora); });
    Array.from(segsSet).sort().forEach(seg => {
      selSeguradora.innerHTML += `<option value="${seg}">${seg}</option>`;
    });
  }
}

function aplicarFiltros() {
  const ano = $("filtroAno")?.value || "";
  const mes = $("filtroMes")?.value || "";
  const agencia = $("filtroAgencia")?.value || "";
  const rm = $("filtroRM")?.value || "";
  const tipo = $("filtroTipo")?.value || "";
  const ramo = $("filtroRamo")?.value || "";
  const seguradora = $("filtroSeguradora")?.value || "";
  const empresa = normalizar($("filtroEmpresa")?.value || "");
  
  LINHAS_FILTRADAS = LINHAS.filter(l => {
    if (ano && l.vencYYYY !== parseInt(ano)) return false;
    if (mes && l.vencMM !== parseInt(mes)) return false;
    if (agencia && l.agenciaId !== agencia) return false;
    if (rm && l.rmNome !== rm) return false;
    if (tipo && l.tipoVisita !== tipo) return false;
    if (ramo && l.ramo !== ramo) return false;
    if (seguradora && l.seguradora !== seguradora) return false;
    if (empresa && !normalizar(l.empresaNome).includes(empresa)) return false;
    return true;
  });
  
  // Ordenar
  LINHAS_FILTRADAS = ordenar(LINHAS_FILTRADAS);
  
  renderizarTudo();
}

function limparFiltros() {
  $("filtroAno").value = "";
  $("filtroMes").value = "";
  if ($("filtroAgencia")) $("filtroAgencia").value = "";
  if ($("filtroRM")) $("filtroRM").value = "";
  $("filtroTipo").value = "";
  $("filtroRamo").value = "";
  $("filtroSeguradora").value = "";
  $("filtroEmpresa").value = "";
  aplicarFiltros();
}

function ordenarPor(key) {
  if (sortKey === key) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortDir = key === "vencimento" ? "asc" : "asc";
  }
  LINHAS_FILTRADAS = ordenar(LINHAS_FILTRADAS);
  renderizarTabela();
}

function ordenar(rows) {
  const key = sortKey;
  const dir = sortDir === "asc" ? 1 : -1;
  
  return rows.slice().sort((a, b) => {
    if (key === "vencimento") {
      const da = new Date(a.vencYYYY || 9999, (a.vencMM || 1) - 1, a.vencDD || 1).getTime();
      const db = new Date(b.vencYYYY || 9999, (b.vencMM || 1) - 1, b.vencDD || 1).getTime();
      return (da - db) * dir;
    }
    if (key === "dataVisita") {
      return (a.dataVisita - b.dataVisita) * dir;
    }
    if (key === "premio") {
      return ((a.premio || 0) - (b.premio || 0)) * dir;
    }
    
    let va = a[key] || "";
    let vb = b[key] || "";
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

// ==== Tabs ====
function trocarTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  
  const tabMap = { visao: 0, detalhes: 1, ranking: 2 };
  document.querySelectorAll('.tab')[tabMap[tab]]?.classList.add('active');
  
  const tabIds = { visao: 'tabVisao', detalhes: 'tabDetalhes', ranking: 'tabRanking' };
  $(tabIds[tab])?.classList.add('active');
  
  if (tab === 'ranking') {
    renderizarRankings();
  }
}
window.trocarTab = trocarTab;

// ==== Renderização ====
function renderizarTudo() {
  renderizarStats();
  renderizarGraficos();
  renderizarMiniTabela();
  renderizarTabela();
}

function renderizarStats() {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  
  // Total de visitas únicas
  const visitasUnicas = new Set(LINHAS_FILTRADAS.map(l => l.visitaId)).size;
  const totalNegocios = LINHAS_FILTRADAS.filter(l => l.ramo !== "(SEM RAMO)").length;
  const totalPremio = LINHAS_FILTRADAS.reduce((s, l) => s + l.premio, 0);
  
  // Vencem este mês
  const venceMes = LINHAS_FILTRADAS.filter(l => l.vencMM === mesAtual && l.vencYYYY === anoAtual);
  const venceMesValor = venceMes.reduce((s, l) => s + l.premio, 0);
  
  // Por tipo
  const presencial = LINHAS_FILTRADAS.filter(l => normalizar(l.tipoVisita) === "presencial");
  const online = LINHAS_FILTRADAS.filter(l => normalizar(l.tipoVisita) === "online");
  const cliente = LINHAS_FILTRADAS.filter(l => normalizar(l.tipoVisita) === "cliente");
  
  $("statVisitas").textContent = visitasUnicas;
  $("statNegociosMapeados").textContent = `${totalNegocios} negócios • ${fmtBRLCompact(totalPremio)}`;
  
  $("statVenceMes").textContent = venceMes.length;
  $("statVenceMesValor").textContent = fmtBRLCompact(venceMesValor);
  
  $("statPresencial").textContent = new Set(presencial.map(l => l.visitaId)).size;
  $("statPresencialValor").textContent = fmtBRLCompact(presencial.reduce((s, l) => s + l.premio, 0));
  
  $("statOnline").textContent = new Set(online.map(l => l.visitaId)).size;
  $("statOnlineValor").textContent = fmtBRLCompact(online.reduce((s, l) => s + l.premio, 0));
  
  $("statCliente").textContent = new Set(cliente.map(l => l.visitaId)).size;
  $("statClienteValor").textContent = fmtBRLCompact(cliente.reduce((s, l) => s + l.premio, 0));
}

function renderizarGraficos() {
  renderizarGraficoMeses();
  renderizarGraficoTipos();
}

function renderizarGraficoMeses() {
  const ctx = $("chartMeses")?.getContext("2d");
  if (!ctx) return;
  
  const porMes = {};
  LINHAS_FILTRADAS.forEach(l => {
    if (l.vencYYYY && l.vencMM) {
      const key = `${l.vencYYYY}-${String(l.vencMM).padStart(2, "0")}`;
      if (!porMes[key]) porMes[key] = { qtd: 0, valor: 0 };
      porMes[key].qtd++;
      porMes[key].valor += l.premio;
    }
  });
  
  const meses = Object.keys(porMes).sort();
  const valores = meses.map(m => porMes[m].valor);
  const labels = meses.map(m => {
    const [ano, mes] = m.split("-");
    return `${MESES_ABREV[parseInt(mes)]}/${ano.slice(2)}`;
  });
  
  if (chartMeses) chartMeses.destroy();
  
  chartMeses = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Prêmio',
        data: valores,
        backgroundColor: 'rgba(139, 92, 246, 0.7)',
        borderColor: 'rgba(139, 92, 246, 1)',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmtBRL(ctx.raw) } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => fmtBRLCompact(v) },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderizarGraficoTipos() {
  const ctx = $("chartTipos")?.getContext("2d");
  if (!ctx) return;
  
  const porTipo = { Presencial: 0, Online: 0, Cliente: 0, Outros: 0 };
  
  LINHAS_FILTRADAS.forEach(l => {
    const tipo = normalizar(l.tipoVisita);
    if (tipo === "presencial") porTipo.Presencial++;
    else if (tipo === "online") porTipo.Online++;
    else if (tipo === "cliente") porTipo.Cliente++;
    else porTipo.Outros++;
  });
  
  const labels = Object.keys(porTipo).filter(k => porTipo[k] > 0);
  const values = labels.map(k => porTipo[k]);
  
  const cores = {
    Presencial: 'rgba(16, 185, 129, 0.8)',
    Online: 'rgba(245, 158, 11, 0.8)',
    Cliente: 'rgba(236, 72, 153, 0.8)',
    Outros: 'rgba(100, 116, 139, 0.8)'
  };
  
  if (chartTipos) chartTipos.destroy();
  
  chartTipos = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map(l => cores[l]),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { usePointStyle: true, padding: 12 }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.raw / total) * 100).toFixed(1);
              return `${ctx.label}: ${ctx.raw} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderizarMiniTabela() {
  const tbody = $("miniTableBody");
  if (!tbody) return;
  
  const ultimos = LINHAS_FILTRADAS.slice(0, 10);
  
  if (ultimos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">📋</div><h3>Nenhuma visita encontrada</h3></div></td></tr>`;
    $("miniTableCount").textContent = "0 registros";
    return;
  }
  
  tbody.innerHTML = ultimos.map(l => {
    const urgencia = getUrgencia(l.vencMM, l.vencYYYY);
    const tipoBadge = getTipoBadge(l.tipoVisita);
    
    return `
      <tr>
        <td>${tipoBadge}</td>
        <td class="data-cell">
          ${urgencia.class ? `<span class="badge ${urgencia.class}">${l.vencStr}</span>` : l.vencStr}
        </td>
        <td class="empresa-cell" title="${l.empresaNome}">${l.empresaNome}</td>
        <td>${l.ramo}</td>
        <td>${l.rmNome}</td>
        <td class="valor-cell">${fmtBRL(l.premio)}</td>
        <td>${l.seguradora}</td>
      </tr>
    `;
  }).join('');
  
  $("miniTableCount").textContent = `Mostrando 10 de ${LINHAS_FILTRADAS.length}`;
}

function renderizarTabela() {
  const tbody = $("tableBody");
  if (!tbody) return;
  
  if (LINHAS_FILTRADAS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="icon">📋</div><h3>Nenhuma visita encontrada</h3></div></td></tr>`;
    $("tableCount").textContent = "0 registros";
    return;
  }
  
  const totalPremio = LINHAS_FILTRADAS.reduce((s, l) => s + l.premio, 0);
  
  tbody.innerHTML = LINHAS_FILTRADAS.map(l => {
    const urgencia = getUrgencia(l.vencMM, l.vencYYYY);
    const tipoBadge = getTipoBadge(l.tipoVisita);
    
    return `
      <tr data-id="${l.visitaId}">
        <td>${tipoBadge}</td>
        <td class="data-cell">${l.dataVisitaStr}</td>
        <td class="data-cell">
          ${urgencia.class ? `<span class="badge ${urgencia.class}">${l.vencStr}</span>` : l.vencStr}
        </td>
        <td class="empresa-cell" title="${l.empresaNome}">${l.empresaNome}</td>
        <td>${l.ramo}</td>
        <td>${l.rmNome}</td>
        <td>${l.agenciaNome}</td>
        <td class="valor-cell">${fmtBRL(l.premio)}</td>
        <td>${l.seguradora}</td>
        <td>${l.numeroFuncionarios}</td>
        ${CTX.isAdmin ? `<td><button class="btn btn-danger btn-sm btn-excluir">Excluir</button></td>` : ''}
      </tr>
    `;
  }).join('');
  
  $("tableCount").textContent = `${LINHAS_FILTRADAS.length} registros • Total: ${fmtBRL(totalPremio)}`;
}

function getTipoBadge(tipo) {
  const t = normalizar(tipo);
  if (t === "presencial") return `<span class="badge presencial">🏢 Presencial</span>`;
  if (t === "online") return `<span class="badge online">💻 Online</span>`;
  if (t === "cliente") return `<span class="badge cliente">👤 Cliente</span>`;
  return `<span class="badge">${tipo || "-"}</span>`;
}

// ==== Rankings ====
function renderizarRankings() {
  renderizarRankingVisitas();
  renderizarRankingNegocios();
  renderizarRankingValor();
}

function renderizarRankingVisitas() {
  const container = $("rankingVisitas");
  if (!container) return;
  
  // Agrupar por RM - contar visitas únicas
  const porRM = {};
  LINHAS_FILTRADAS.forEach(l => {
    if (!porRM[l.rmNome]) porRM[l.rmNome] = { visitas: new Set(), negocios: 0, valor: 0 };
    porRM[l.rmNome].visitas.add(l.visitaId);
  });
  
  const ranking = Object.entries(porRM)
    .map(([nome, dados]) => ({ nome, qtd: dados.visitas.size }))
    .sort((a, b) => b.qtd - a.qtd);
  
  container.innerHTML = ranking.slice(0, 10).map((r, i) => {
    const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
    return `
      <div class="ranking-item">
        <div class="ranking-position ${posClass}">${i + 1}º</div>
        <div class="ranking-info">
          <div class="ranking-name">${r.nome}</div>
        </div>
        <div class="ranking-value">${r.qtd} visitas</div>
      </div>
    `;
  }).join('') || '<div class="empty-state">Sem dados</div>';
}

function renderizarRankingNegocios() {
  const container = $("rankingNegocios");
  if (!container) return;
  
  // Agrupar por RM - contar negócios (linhas)
  const porRM = {};
  LINHAS_FILTRADAS.filter(l => l.ramo !== "(SEM RAMO)").forEach(l => {
    if (!porRM[l.rmNome]) porRM[l.rmNome] = 0;
    porRM[l.rmNome]++;
  });
  
  const ranking = Object.entries(porRM)
    .map(([nome, qtd]) => ({ nome, qtd }))
    .sort((a, b) => b.qtd - a.qtd);
  
  container.innerHTML = ranking.slice(0, 10).map((r, i) => {
    const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
    return `
      <div class="ranking-item">
        <div class="ranking-position ${posClass}">${i + 1}º</div>
        <div class="ranking-info">
          <div class="ranking-name">${r.nome}</div>
        </div>
        <div class="ranking-value">${r.qtd} negócios</div>
      </div>
    `;
  }).join('') || '<div class="empty-state">Sem dados</div>';
}

function renderizarRankingValor() {
  const container = $("rankingValor");
  if (!container) return;
  
  // Agrupar por RM - somar prêmio
  const porRM = {};
  LINHAS_FILTRADAS.forEach(l => {
    if (!porRM[l.rmNome]) porRM[l.rmNome] = 0;
    porRM[l.rmNome] += l.premio;
  });
  
  const ranking = Object.entries(porRM)
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor);
  
  container.innerHTML = ranking.slice(0, 10).map((r, i) => {
    const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
    return `
      <div class="ranking-item">
        <div class="ranking-position ${posClass}">${i + 1}º</div>
        <div class="ranking-info">
          <div class="ranking-name">${r.nome}</div>
        </div>
        <div class="ranking-value">${fmtBRLCompact(r.valor)}</div>
      </div>
    `;
  }).join('') || '<div class="empty-state">Sem dados</div>';
}

// ==== Exclusão (Admin) ====
document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".btn-excluir");
  if (!btn) return;
  
  if (!CTX.isAdmin) { alert("Somente administradores podem excluir visitas."); return; }
  
  const tr = btn.closest("tr");
  const visitaId = tr?.getAttribute("data-id");
  if (!visitaId) return;
  
  if (!confirm("Tem certeza que deseja excluir esta visita? Esta ação não pode ser desfeita.")) return;
  
  try {
    await db.collection("visitas").doc(visitaId).delete();
    LINHAS = LINHAS.filter(l => l.visitaId !== visitaId);
    aplicarFiltros();
  } catch (e) {
    console.error(e);
    alert("Não foi possível excluir. Verifique suas permissões.");
  }
});

// ==== Exports ====
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const roxo = [139, 92, 246];
  const escuro = [30, 41, 59];
  
  // Header
  doc.setFillColor(...roxo);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('📋 Relatório de Visitas', 14, 16);
  
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 80, 10);
  
  // KPIs
  let y = 35;
  const visitasUnicas = new Set(LINHAS_FILTRADAS.map(l => l.visitaId)).size;
  const totalNegocios = LINHAS_FILTRADAS.filter(l => l.ramo !== "(SEM RAMO)").length;
  const totalPremio = LINHAS_FILTRADAS.reduce((s, l) => s + l.premio, 0);
  
  doc.setTextColor(...escuro);
  doc.setFontSize(11);
  doc.text(`Visitas: ${visitasUnicas} • Negócios Mapeados: ${totalNegocios} • Prêmio Total: ${fmtBRL(totalPremio)}`, 14, y);
  y += 10;
  
  // Tabela
  const dados = LINHAS_FILTRADAS.slice(0, 100).map(l => [
    l.tipoVisita,
    l.vencStr,
    l.empresaNome.substring(0, 25),
    l.ramo,
    l.rmNome,
    fmtBRL(l.premio),
    l.seguradora
  ]);
  
  doc.autoTable({
    startY: y,
    head: [['Tipo', 'Vencimento', 'Empresa', 'Ramo', 'RM', 'Prêmio', 'Seguradora']],
    body: dados,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: escuro, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });
  
  doc.save(`visitas-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportarExcel() {
  const dados = LINHAS_FILTRADAS.map(l => ({
    'Tipo': l.tipoVisita,
    'Data Visita': l.dataVisitaStr,
    'Vencimento': l.vencStr,
    'Empresa': l.empresaNome,
    'Ramo': l.ramo,
    'RM': l.rmNome,
    'Agência': l.agenciaNome,
    'Prêmio': l.premio,
    'Seguradora': l.seguradora,
    'Funcionários': l.numeroFuncionarios
  }));
  
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Visitas");
  XLSX.writeFile(wb, `visitas-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==== Globals ====
window.aplicarFiltros = aplicarFiltros;
window.limparFiltros = limparFiltros;
window.ordenarPor = ordenarPor;
window.exportarPDF = exportarPDF;
window.exportarExcel = exportarExcel;
