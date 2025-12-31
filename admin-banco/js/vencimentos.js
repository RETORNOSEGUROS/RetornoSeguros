// vencimentos.js — Vencimentos & Renovações Premium
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

let REGISTROS = [];
let REGISTROS_FILTRADOS = [];
let AGENCIAS = {};
let EMPRESAS_AGENCIA = new Set();
let CACHE_EMPRESAS = {};

// Charts
let chartMeses = null;
let chartRamos = null;

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

// Converte Firestore Timestamp ou string para Date
const toDate = (x) => {
  if (!x) return null;
  if (x.toDate) return x.toDate();
  if (x instanceof Date) return x;
  const d = new Date(x);
  return isNaN(d.getTime()) ? null : d;
};

const fmtData = (d) => d ? d.toLocaleDateString("pt-BR") : "-";

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

function parseFimVigencia(value) {
  if (!value) return { date: null, dia: null, mes: null, ano: null, display: "-" };
  
  // Firestore Timestamp
  if (value && typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return { date: d, dia: d.getDate(), mes: d.getMonth() + 1, ano: d.getFullYear(), display: d.toLocaleDateString("pt-BR") };
  }
  
  // Date object
  if (value instanceof Date) {
    return { date: value, dia: value.getDate(), mes: value.getMonth() + 1, ano: value.getFullYear(), display: value.toLocaleDateString("pt-BR") };
  }
  
  const s = String(value).trim();
  
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return { date: dt, dia: d, mes: m, ano: y, display: dt.toLocaleDateString("pt-BR") };
  }
  
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/").map(Number);
    const dt = new Date(y, m - 1, d);
    return { date: dt, dia: d, mes: m, ano: y, display: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}` };
  }
  
  return { date: null, dia: null, mes: null, ano: null, display: s || "-" };
}

function getUrgencia(fimVigencia) {
  if (!fimVigencia?.date) return { tipo: "normal", label: "Normal", class: "normal" };
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(fimVigencia.date);
  fim.setHours(0, 0, 0, 0);
  
  const diffDias = Math.ceil((fim - hoje) / (1000 * 60 * 60 * 24));
  
  if (diffDias < 0) return { tipo: "vencido", label: "Vencido", class: "vencido", dias: diffDias };
  if (diffDias <= 30) return { tipo: "urgente", label: `${diffDias}d`, class: "urgente", dias: diffDias };
  return { tipo: "normal", label: `${diffDias}d`, class: "normal", dias: diffDias };
}

function getIconeRamo(ramo) {
  const r = normalizar(ramo);
  if (r.includes("saude") || r.includes("saúde")) return "🏥";
  if (r.includes("dental")) return "🦷";
  if (r.includes("vida")) return "❤️";
  if (r.includes("patrimonial") || r.includes("empresarial")) return "🏢";
  if (r.includes("frota") || r.includes("auto")) return "🚗";
  if (r.includes("equipamento")) return "⚙️";
  if (r.includes("garantia")) return "📜";
  return "📋";
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
  
  await init();
});

// ==== Inicialização ====
async function init() {
  await carregarAgencias();
  
  // Se GC, carregar empresas da agência
  if (!CTX.isAdmin && isGC(CTX.perfil) && CTX.agenciaId) {
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
      const nome = d.nome || "(Sem nome)";
      AGENCIAS[doc.id] = nome;
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

async function carregarDados() {
  REGISTROS = [];
  
  console.log("[Vencimentos] Iniciando carga de dados...");
  console.log("[Vencimentos] CTX:", CTX);
  
  // Carregar VISITAS
  await carregarVisitas();
  
  // Carregar NEGÓCIOS EMITIDOS
  await carregarNegociosEmitidos();
  
  console.log(`[Vencimentos] Total de registros: ${REGISTROS.length}`);
  
  // Ordenar por data de vencimento
  REGISTROS.sort((a, b) => {
    if (!a.fim.date) return 1;
    if (!b.fim.date) return -1;
    return a.fim.date - b.fim.date;
  });
}

async function carregarVisitas() {
  try {
    let docs = [];
    
    if (CTX.isAdmin) {
      const snap = await db.collection("visitas").get();
      docs = snap.docs;
      console.log(`[Visitas] Admin - Total: ${docs.length}`);
    } else if (isGC(CTX.perfil) && CTX.agenciaId) {
      // GC: da agência
      const map = new Map();
      try {
        const sA = await db.collection("visitas").where("agenciaId", "==", CTX.agenciaId).get();
        sA.forEach(d => map.set(d.id, d));
      } catch {}
      
      // Complemento por empresaId
      if (EMPRESAS_AGENCIA.size) {
        const ids = Array.from(EMPRESAS_AGENCIA);
        for (let i = 0; i < ids.length; i += 10) {
          try {
            const sB = await db.collection("visitas").where("empresaId", "in", ids.slice(i, i + 10)).get();
            sB.forEach(d => map.set(d.id, d));
          } catch {}
        }
      }
      docs = Array.from(map.values());
      console.log(`[Visitas] GC - Total: ${docs.length}`);
    } else {
      // RM: próprios
      const buckets = [];
      try { buckets.push(await db.collection("visitas").where("rmUid", "==", CTX.uid).get()); } catch {}
      try { buckets.push(await db.collection("visitas").where("criadoPorUid", "==", CTX.uid).get()); } catch {}
      try { buckets.push(await db.collection("visitas").where("usuarioId", "==", CTX.uid).get()); } catch {}
      const map = new Map();
      buckets.forEach(s => s?.docs.forEach(d => map.set(d.id, d)));
      docs = Array.from(map.values());
      console.log(`[Visitas] RM - Total: ${docs.length}`);
    }
    
    // Processar visitas
    let countComVencimento = 0;
    for (const doc of docs) {
      const v = doc.data() || {};
      const empresaId = v.empresaId;
      const emp = await getEmpresaInfo(empresaId);
      
      // RBAC extra
      if (!CTX.isAdmin && isGC(CTX.perfil) && CTX.agenciaId) {
        const ag = v.agenciaId || emp.agenciaId || "-";
        if (String(ag) !== String(CTX.agenciaId) && !EMPRESAS_AGENCIA.has(empresaId)) continue;
      }
      
      const ramos = v.ramos || {};
      for (const key of Object.keys(ramos)) {
        const item = ramos[key] || {};
        
        // Tentar vários campos de vencimento
        const vencimentoRaw = item.vencimento || item.fimVigencia || item.dataVencimento || 
                             item.vigenciaFim || item.fim_vigencia || null;
        
        if (!vencimentoRaw) continue;
        
        const fim = parseFimVigencia(vencimentoRaw);
        if (!fim.date) continue;
        
        countComVencimento++;
        
        REGISTROS.push({
          id: doc.id + "_" + key,
          origem: "visita",
          origemLabel: "Mapeado em Visita",
          empresaId: empresaId,
          empresaNome: v.empresaNome || emp.nome,
          agenciaId: v.agenciaId || emp.agenciaId || "-",
          agenciaNome: AGENCIAS[v.agenciaId || emp.agenciaId] || "-",
          rmNome: v.rmNome || emp.rmNome || "-",
          ramo: (key || item.ramo || "-").toString().replace(/_/g, " "),
          fim: fim,
          premio: parseCurrency(item.valorEstimado || item.premio || item.valor || 0),
          seguradora: item.seguradora || "-"
        });
      }
    }
    console.log(`[Visitas] Com vencimento válido: ${countComVencimento}`);
  } catch (e) { console.warn("Erro visitas:", e); }
}

async function carregarNegociosEmitidos() {
  try {
    let docs = [];
    
    if (CTX.isAdmin) {
      const snap = await db.collection("cotacoes-gerentes").where("status", "==", "Negócio Emitido").get();
      docs = snap.docs;
      console.log(`[Negócios] Admin - Total: ${docs.length}`);
    } else if (isGC(CTX.perfil) && CTX.agenciaId) {
      // GC: buscar todos e filtrar (evita problema de índice)
      try {
        const snap = await db.collection("cotacoes-gerentes").where("status", "==", "Negócio Emitido").get();
        docs = snap.docs.filter(doc => {
          const d = doc.data();
          return d.agenciaId === CTX.agenciaId;
        });
      } catch(e) {
        console.warn("[Negócios] Query status falhou, tentando fallback:", e.message);
        // Fallback: pegar tudo e filtrar
        const snap = await db.collection("cotacoes-gerentes").get();
        docs = snap.docs.filter(doc => {
          const d = doc.data();
          const st = String(d.status||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
          return st === "negocio emitido" && d.agenciaId === CTX.agenciaId;
        });
      }
      console.log(`[Negócios] GC - Total após filtro: ${docs.length}`);
    } else {
      // RM: próprios
      const buckets = [];
      const base = db.collection("cotacoes-gerentes").where("status", "==", "Negócio Emitido");
      try { buckets.push(await base.where("rmUid", "==", CTX.uid).get()); } catch {}
      try { buckets.push(await base.where("rmId", "==", CTX.uid).get()); } catch {}
      try { buckets.push(await base.where("criadoPorUid", "==", CTX.uid).get()); } catch {}
      const map = new Map();
      buckets.forEach(s => s?.docs.forEach(d => map.set(d.id, d)));
      docs = Array.from(map.values());
      console.log(`[Negócios] RM - Total: ${docs.length}`);
    }
    
    // Processar negócios
    let countComVencimento = 0;
    let countSemVencimento = 0;
    
    for (const doc of docs) {
      const c = doc.data() || {};
      const emp = await getEmpresaInfo(c.empresaId);
      
      // RBAC extra para GC (já filtrado acima, mas por segurança)
      if (!CTX.isAdmin && isGC(CTX.perfil) && CTX.agenciaId) {
        const ag = c.agenciaId || c.agencia || emp.agenciaId || "-";
        if (String(ag) !== String(CTX.agenciaId) && !EMPRESAS_AGENCIA.has(c.empresaId)) continue;
      }
      
      // Usar mesma lógica do negocios-fechados.js
      // Os campos principais são: inicioVigencia e fimVigencia
      let fimVigenciaDate = toDate(c.fimVigencia);
      const inicioVigenciaDate = toDate(c.inicioVigencia);
      
      // Se não tem fim, calcular a partir do início + 12 meses
      if (!fimVigenciaDate && inicioVigenciaDate) {
        fimVigenciaDate = new Date(inicioVigenciaDate);
        fimVigenciaDate.setFullYear(fimVigenciaDate.getFullYear() + 1);
        console.log(`[Negócio] ${c.empresaNome} - Calculado fim: ${fmtData(inicioVigenciaDate)} -> ${fmtData(fimVigenciaDate)}`);
      }
      
      if (!fimVigenciaDate) {
        countSemVencimento++;
        if (countSemVencimento <= 3) {
          console.log(`[Negócio] Sem vigência:`, { 
            id: doc.id, 
            empresa: c.empresaNome,
            inicioVigencia: c.inicioVigencia,
            fimVigencia: c.fimVigencia
          });
        }
        continue;
      }
      
      countComVencimento++;
      
      // Criar objeto de fim no formato esperado
      const fim = {
        date: fimVigenciaDate,
        dia: fimVigenciaDate.getDate(),
        mes: fimVigenciaDate.getMonth() + 1,
        ano: fimVigenciaDate.getFullYear(),
        display: fimVigenciaDate.toLocaleDateString("pt-BR")
      };
      
      REGISTROS.push({
        id: doc.id,
        origem: "negocio",
        origemLabel: "Negócio Fechado",
        empresaId: c.empresaId || "",
        empresaNome: c.empresaNome || emp.nome,
        agenciaId: c.agenciaId || c.agencia || emp.agenciaId || "-",
        agenciaNome: AGENCIAS[c.agenciaId || c.agencia || emp.agenciaId] || "-",
        rmNome: c.rmNome || emp.rmNome || "-",
        ramo: c.ramo || "-",
        fim: fim,
        premio: parseCurrency(c.premioLiquido || c.valorNegocio || c.valorFinal || c.premio || 0),
        seguradora: c.seguradora || "Bradesco Seguros"
      });
    }
    console.log(`[Negócios] Com vencimento: ${countComVencimento}, Sem vencimento: ${countSemVencimento}`);
  } catch (e) { console.warn("Erro negócios:", e); }
}

// ==== Filtros ====
function montarFiltros() {
  // Anos
  const anosSet = new Set();
  REGISTROS.forEach(r => { if (r.fim.ano) anosSet.add(r.fim.ano); });
  const anos = Array.from(anosSet).sort((a, b) => a - b);
  
  const selAno = $("filtroAno");
  if (selAno) {
    selAno.innerHTML = '<option value="">Todos</option>';
    anos.forEach(ano => {
      selAno.innerHTML += `<option value="${ano}">${ano}</option>`;
    });
    // Selecionar ano atual por padrão
    const anoAtual = new Date().getFullYear();
    if (anos.includes(anoAtual)) selAno.value = String(anoAtual);
  }
  
  // Agências (só Admin vê)
  const selAgencia = $("filtroAgencia");
  const grpAgencia = $("filtroAgenciaGroup");
  if (CTX.isAdmin) {
    if (selAgencia) {
      selAgencia.innerHTML = '<option value="">Todas</option>';
      const agsSet = new Set();
      REGISTROS.forEach(r => { if (r.agenciaId && r.agenciaId !== "-") agsSet.add(r.agenciaId); });
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
      REGISTROS.forEach(r => { if (r.rmNome && r.rmNome !== "-") rmsSet.add(r.rmNome); });
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
    REGISTROS.forEach(r => { if (r.ramo && r.ramo !== "-") ramosSet.add(r.ramo); });
    Array.from(ramosSet).sort().forEach(ramo => {
      selRamo.innerHTML += `<option value="${ramo}">${ramo}</option>`;
    });
  }
}

function aplicarFiltros() {
  const ano = $("filtroAno")?.value || "";
  const mes = $("filtroMes")?.value || "";
  const agencia = $("filtroAgencia")?.value || "";
  const rm = $("filtroRM")?.value || "";
  const ramo = $("filtroRamo")?.value || "";
  const origem = $("filtroOrigem")?.value || "";
  const empresa = normalizar($("filtroEmpresa")?.value || "");
  
  REGISTROS_FILTRADOS = REGISTROS.filter(r => {
    if (ano && r.fim.ano !== parseInt(ano)) return false;
    if (mes && String(r.fim.mes).padStart(2, "0") !== mes) return false;
    if (agencia && r.agenciaId !== agencia) return false;
    if (rm && r.rmNome !== rm) return false;
    if (ramo && r.ramo !== ramo) return false;
    if (origem && r.origem !== origem) return false;
    if (empresa && !normalizar(r.empresaNome).includes(empresa)) return false;
    return true;
  });
  
  renderizarTudo();
}

function selecionarMes(ano, mes) {
  $("filtroAno").value = String(ano);
  $("filtroMes").value = String(mes).padStart(2, "0");
  aplicarFiltros();
}

function limparFiltros() {
  $("filtroAno").value = "";
  $("filtroMes").value = "";
  if ($("filtroAgencia")) $("filtroAgencia").value = "";
  if ($("filtroRM")) $("filtroRM").value = "";
  $("filtroRamo").value = "";
  $("filtroOrigem").value = "";
  $("filtroEmpresa").value = "";
  aplicarFiltros();
}

// ==== Renderização ====
function renderizarTudo() {
  renderizarAlert();
  renderizarStats();
  renderizarMeses();
  renderizarGraficos();
  renderizarTabela();
}

function renderizarAlert() {
  const alert = $("alertBanner");
  if (!alert) return;
  
  const urgentes = REGISTROS.filter(r => {
    const urg = getUrgencia(r.fim);
    return urg.tipo === "urgente" || urg.tipo === "vencido";
  });
  
  if (urgentes.length > 0) {
    const temVencido = urgentes.some(r => getUrgencia(r.fim).tipo === "vencido");
    alert.style.display = "flex";
    alert.className = temVencido ? "alert-banner urgent" : "alert-banner";
    
    const alertIcon = alert.querySelector(".alert-icon");
    const alertTitle = $("alertTitle");
    const alertDesc = $("alertDesc");
    const alertValue = $("alertValue");
    
    if (alertIcon) alertIcon.textContent = temVencido ? "🚨" : "⚠️";
    if (alertTitle) alertTitle.textContent = temVencido ? "⚠️ Existem seguros vencidos!" : "Atenção: Vencimentos próximos";
    if (alertDesc) alertDesc.textContent = `${urgentes.length} seguro(s) precisam de atenção nos próximos 30 dias`;
    if (alertValue) alertValue.textContent = urgentes.length;
  } else {
    alert.style.display = "none";
  }
}

function renderizarStats() {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  const mesProximo = mesAtual === 12 ? 1 : mesAtual + 1;
  const anoProximo = mesAtual === 12 ? anoAtual + 1 : anoAtual;
  
  // Total filtrado
  const total = REGISTROS_FILTRADOS.length;
  const totalValor = REGISTROS_FILTRADOS.reduce((s, r) => s + r.premio, 0);
  
  // Este mês
  const esteMes = REGISTROS.filter(r => r.fim.mes === mesAtual && r.fim.ano === anoAtual);
  const esteMesValor = esteMes.reduce((s, r) => s + r.premio, 0);
  
  // Próximo mês
  const proxMes = REGISTROS.filter(r => r.fim.mes === mesProximo && r.fim.ano === anoProximo);
  const proxMesValor = proxMes.reduce((s, r) => s + r.premio, 0);
  
  // Próximos 90 dias
  const em90dias = new Date(hoje.getTime() + 90 * 24 * 60 * 60 * 1000);
  const prox90 = REGISTROS.filter(r => r.fim.date && r.fim.date >= hoje && r.fim.date <= em90dias);
  const prox90Valor = prox90.reduce((s, r) => s + r.premio, 0);
  
  $("statTotal").textContent = total;
  $("statTotalValor").textContent = fmtBRLCompact(totalValor);
  $("statMesAtual").textContent = esteMes.length;
  $("statMesAtualValor").textContent = fmtBRLCompact(esteMesValor);
  $("statProximo").textContent = proxMes.length;
  $("statProximoValor").textContent = fmtBRLCompact(proxMesValor);
  $("statTrimestre").textContent = prox90.length;
  $("statTrimestreValor").textContent = fmtBRLCompact(prox90Valor);
}

function renderizarMeses() {
  const container = $("monthsScroll");
  if (!container) return;
  
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  
  // Mostrar próximos 12 meses
  let html = "";
  for (let i = 0; i < 12; i++) {
    let mes = mesAtual + i;
    let ano = anoAtual;
    if (mes > 12) { mes -= 12; ano++; }
    
    const registrosMes = REGISTROS.filter(r => r.fim.mes === mes && r.fim.ano === ano);
    const valorMes = registrosMes.reduce((s, r) => s + r.premio, 0);
    
    const isCurrent = i === 0;
    const isActive = $("filtroMes")?.value === String(mes).padStart(2, "0") && 
                    $("filtroAno")?.value === String(ano);
    
    html += `
      <div class="month-card ${isCurrent ? 'current' : ''} ${isActive ? 'active' : ''}" 
           onclick="selecionarMes(${ano}, ${mes})">
        <div class="month-name">${MESES_ABREV[mes]}/${String(ano).slice(2)}</div>
        <div class="month-qtd">${registrosMes.length}</div>
        <div class="month-valor">${fmtBRLCompact(valorMes)}</div>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

function renderizarGraficos() {
  renderizarGraficoMeses();
  renderizarGraficoRamos();
}

function renderizarGraficoMeses() {
  const ctx = $("chartMeses")?.getContext("2d");
  if (!ctx) return;
  
  // Agrupar por mês
  const porMes = {};
  REGISTROS_FILTRADOS.forEach(r => {
    if (r.fim.ano && r.fim.mes) {
      const key = `${r.fim.ano}-${String(r.fim.mes).padStart(2, "0")}`;
      if (!porMes[key]) porMes[key] = { qtd: 0, valor: 0 };
      porMes[key].qtd++;
      porMes[key].valor += r.premio;
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
        backgroundColor: 'rgba(245, 158, 11, 0.7)',
        borderColor: 'rgba(245, 158, 11, 1)',
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

function renderizarGraficoRamos() {
  const ctx = $("chartRamos")?.getContext("2d");
  if (!ctx) return;
  
  const porRamo = {};
  REGISTROS_FILTRADOS.forEach(r => {
    if (!porRamo[r.ramo]) porRamo[r.ramo] = 0;
    porRamo[r.ramo] += r.premio;
  });
  
  const dados = Object.entries(porRamo).sort((a, b) => b[1] - a[1]);
  const labels = dados.map(d => d[0]);
  const values = dados.map(d => d[1]);
  
  const cores = [
    'rgba(245, 158, 11, 0.8)', 'rgba(59, 130, 246, 0.8)', 'rgba(16, 185, 129, 0.8)',
    'rgba(139, 92, 246, 0.8)', 'rgba(236, 72, 153, 0.8)', 'rgba(20, 184, 166, 0.8)',
    'rgba(239, 68, 68, 0.8)', 'rgba(99, 102, 241, 0.8)'
  ];
  
  if (chartRamos) chartRamos.destroy();
  
  chartRamos = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: cores,
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
              return `${ctx.label}: ${fmtBRL(ctx.raw)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function renderizarTabela() {
  const tbody = $("tableBody");
  if (!tbody) return;
  
  if (REGISTROS_FILTRADOS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">📅</div><h3>Nenhum vencimento encontrado</h3><p>Ajuste os filtros para ver mais resultados</p></div></td></tr>`;
    $("tableCount").textContent = "0 registros";
    return;
  }
  
  const totalValor = REGISTROS_FILTRADOS.reduce((s, r) => s + r.premio, 0);
  
  tbody.innerHTML = REGISTROS_FILTRADOS.map(r => {
    const urgencia = getUrgencia(r.fim);
    const urgenciaBadge = urgencia.tipo === "vencido" 
      ? `<span class="badge urgente">🚨 Vencido</span>`
      : urgencia.tipo === "urgente"
      ? `<span class="badge proximo">⚠️ ${urgencia.dias}d</span>`
      : `<span class="badge" style="background: #dcfce7; color: #166534;">✓ ${urgencia.dias}d</span>`;
    
    const origemBadge = r.origem === "visita"
      ? `<span class="badge visita">📋 Visita</span>`
      : `<span class="badge negocio">✅ Negócio</span>`;
    
    return `
      <tr>
        <td>${urgenciaBadge}</td>
        <td class="data-cell">
          <span class="urgency-dot ${urgencia.class}"></span>
          ${r.fim.display}
        </td>
        <td class="empresa-cell" title="${r.empresaNome}">${r.empresaNome}</td>
        <td>${getIconeRamo(r.ramo)} ${r.ramo}</td>
        <td>${r.rmNome}</td>
        <td class="valor-cell">${fmtBRL(r.premio)}</td>
        <td>${r.seguradora}</td>
        <td>${origemBadge}</td>
        <td>
          <button class="btn-renovar" onclick="gerarCotacaoRenovacao('${r.empresaId}', '${encodeURIComponent(r.empresaNome)}', '${encodeURIComponent(r.ramo)}', ${r.premio})">
            🔄 Renovar
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  $("tableCount").textContent = `${REGISTROS_FILTRADOS.length} registros • Total: ${fmtBRL(totalValor)}`;
}

// ==== Gerar Cotação de Renovação ====
function gerarCotacaoRenovacao(empresaId, empresaNome, ramo, valorAnterior) {
  const params = new URLSearchParams({
    empresaId: empresaId,
    empresaNome: decodeURIComponent(empresaNome),
    ramo: decodeURIComponent(ramo),
    valorAnterior: valorAnterior,
    tipo: "renovacao",
    nova: "1"
  });
  window.location.href = `cotacoes.html?${params}`;
}

// ==== Exports ====
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const laranja = [245, 158, 11];
  const escuro = [30, 41, 59];
  
  // Header
  doc.setFillColor(...laranja);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('📅 Relatório de Vencimentos & Renovações', 14, 16);
  
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 80, 10);
  doc.text(`Total: ${REGISTROS_FILTRADOS.length} registros`, pageWidth - 80, 16);
  
  // KPIs
  let y = 35;
  const total = REGISTROS_FILTRADOS.reduce((s, r) => s + r.premio, 0);
  
  doc.setTextColor(...escuro);
  doc.setFontSize(11);
  doc.text(`Prêmio Total: ${fmtBRL(total)}`, 14, y);
  y += 10;
  
  // Tabela
  const dados = REGISTROS_FILTRADOS.slice(0, 100).map(r => [
    r.fim.display,
    r.empresaNome.substring(0, 30),
    r.ramo,
    r.rmNome,
    fmtBRL(r.premio),
    r.seguradora,
    r.origemLabel
  ]);
  
  doc.autoTable({
    startY: y,
    head: [['Vencimento', 'Empresa', 'Ramo', 'RM', 'Prêmio', 'Seguradora', 'Origem']],
    body: dados,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: escuro, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 50 },
      2: { cellWidth: 30 },
      3: { cellWidth: 30 },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 35 },
      6: { cellWidth: 30 }
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: function(data) {
      if (data.section === 'body' && data.column.index === 0) {
        // Destacar vencimentos urgentes
        const row = REGISTROS_FILTRADOS[data.row.index];
        if (row) {
          const urg = getUrgencia(row.fim);
          if (urg.tipo === "vencido") data.cell.styles.fillColor = [254, 226, 226];
          else if (urg.tipo === "urgente") data.cell.styles.fillColor = [254, 243, 199];
        }
      }
    }
  });
  
  doc.save(`vencimentos-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportarExcel() {
  const dados = REGISTROS_FILTRADOS.map(r => ({
    'Fim Vigência': r.fim.display,
    'Empresa': r.empresaNome,
    'Ramo': r.ramo,
    'RM': r.rmNome,
    'Agência': r.agenciaNome,
    'Prêmio': r.premio,
    'Seguradora': r.seguradora,
    'Origem': r.origemLabel
  }));
  
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Vencimentos");
  XLSX.writeFile(wb, `vencimentos-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==== Globals ====
window.aplicarFiltros = aplicarFiltros;
window.limparFiltros = limparFiltros;
window.selecionarMes = selecionarMes;
window.gerarCotacaoRenovacao = gerarCotacaoRenovacao;
window.exportarPDF = exportarPDF;
window.exportarExcel = exportarExcel;
