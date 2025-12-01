// negocios-fechados.js — Negócios Fechados Premium
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

let NEGOCIOS = [];
let NEGOCIOS_FILTRADOS = [];
let NEGOCIOS_ANO_ANTERIOR = [];
let AGENCIAS = {};
let RMS = {};
let EMPRESAS_AGENCIA = new Set();

// Charts
let chartPizza = null;
let chartBarras = null;
let chartComparativo = null;

// ==== Helpers ====
const $ = id => document.getElementById(id);
const normalizar = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const toDate = x => {
  if (!x) return null;
  if (x.toDate) return x.toDate();
  if (x instanceof Date) return x;
  if (typeof x === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return new Date(x + "T00:00:00");
    const d = new Date(x);
    return isNaN(d) ? null : d;
  }
  return null;
};

const toISODate = d => d ? d.toISOString().slice(0, 10) : "";
const fmtData = d => d ? d.toLocaleDateString("pt-BR") : "-";
const fmtBRL = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtBRLCompact = v => {
  if (v >= 1000000) return `R$ ${(v/1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v/1000).toFixed(0)}K`;
  return fmtBRL(v);
};

function getIconeRamo(ramo) {
  const r = normalizar(ramo);
  if (r.includes("saude") || r.includes("saúde")) return "🏥";
  if (r.includes("dental")) return "🦷";
  if (r.includes("vida")) return "❤️";
  if (r.includes("patrimonial") || r.includes("empresarial")) return "🏢";
  if (r.includes("frota") || r.includes("auto")) return "🚗";
  if (r.includes("equipamento")) return "⚙️";
  if (r.includes("garantia")) return "📜";
  if (r.includes("rc") || r.includes("responsabilidade")) return "⚖️";
  if (r.includes("cyber")) return "💻";
  if (r.includes("transporte")) return "🚚";
  return "📋";
}

function getCorRamo(index) {
  const cores = [
    'rgba(16, 185, 129, 0.8)',   // verde
    'rgba(59, 130, 246, 0.8)',   // azul
    'rgba(139, 92, 246, 0.8)',   // roxo
    'rgba(245, 158, 11, 0.8)',   // laranja
    'rgba(236, 72, 153, 0.8)',   // rosa
    'rgba(20, 184, 166, 0.8)',   // teal
    'rgba(99, 102, 241, 0.8)',   // indigo
    'rgba(239, 68, 68, 0.8)',    // vermelho
    'rgba(34, 197, 94, 0.8)',    // lime
    'rgba(168, 85, 247, 0.8)'    // purple
  ];
  return cores[index % cores.length];
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
  
  // Verificar acesso
  if (CTX.perfil === "assistente") {
    document.querySelector('.main').innerHTML = `
      <div class="empty-state">
        <div class="icon">🔒</div>
        <h3>Acesso Restrito</h3>
        <p>Seu perfil não possui acesso a Negócios Fechados.</p>
      </div>
    `;
    return;
  }
  
  await init();
});

// ==== Inicialização ====
async function init() {
  await carregarLookups();
  
  // Se Gerente Chefe, carregar empresas da agência para fallback
  if (!CTX.isAdmin && CTX.perfil === "gerente chefe" && CTX.agenciaId) {
    await carregarEmpresasAgencia();
  }
  
  await carregarNegocios();
  
  // Definir filtros padrão (ano atual)
  definirFiltrosPadrao();
  
  montarFiltros();
  aplicarFiltros();
}

// ==== Carregar Dados ====
async function carregarLookups() {
  // Agências
  try {
    const snap = await db.collection("agencias_banco").get();
    snap.forEach(doc => {
      const d = doc.data();
      const nome = d.nome || "(Sem nome)";
      const banco = d.banco ? ` – ${d.banco}` : "";
      const cidade = d.Cidade || d.cidade || "";
      const uf = (d.estado || d.UF || "").toUpperCase();
      AGENCIAS[doc.id] = `${nome}${banco}${cidade ? ` / ${cidade}` : ""}${uf ? ` - ${uf}` : ""}`;
    });
  } catch (e) { console.warn("Erro agências:", e); }
  
  // RMs
  try {
    const snap = await db.collection("usuarios_banco").get();
    snap.forEach(doc => {
      const d = doc.data();
      if (d.nome) RMS[doc.id] = { nome: d.nome, agenciaId: d.agenciaId };
    });
  } catch (e) { console.warn("Erro RMs:", e); }
}

async function carregarEmpresasAgencia() {
  try {
    const snap = await db.collection("empresas").where("agenciaId", "==", CTX.agenciaId).get();
    snap.forEach(doc => EMPRESAS_AGENCIA.add(doc.id));
  } catch (e) { console.warn("Erro empresas agência:", e); }
}

async function carregarNegocios() {
  try {
    let snap;
    try {
      snap = await db.collection("cotacoes-gerentes").where("status", "==", "Negócio Emitido").get();
    } catch {
      snap = await db.collection("cotacoes-gerentes").get();
    }
    
    // Coletar empresaIds sem agenciaId para resolver
    const docsRaw = [];
    const empresaIdsSemAgencia = new Set();
    
    snap.forEach(doc => {
      const d = doc.data();
      // Filtrar apenas "Negócio Emitido" se query falhou
      if (normalizar(d.status || "").includes("emitido")) {
        docsRaw.push({ id: doc.id, ...d });
        if (!d.agenciaId && d.empresaId) {
          empresaIdsSemAgencia.add(d.empresaId);
        }
      }
    });
    
    // Resolver agenciaId via empresaId
    const agenciaPorEmpresa = await resolverAgenciaPorEmpresaIds(Array.from(empresaIdsSemAgencia));
    
    // Processar e filtrar por RBAC
    docsRaw.forEach(d => {
      let agenciaId = d.agenciaId || "";
      if (!agenciaId && d.empresaId && agenciaPorEmpresa[d.empresaId]) {
        agenciaId = agenciaPorEmpresa[d.empresaId];
      }
      
      // RBAC
      let permitido = false;
      if (CTX.isAdmin) {
        permitido = true;
      } else if (CTX.perfil === "gerente chefe") {
        // Vê da agência ou empresas da agência
        permitido = agenciaId === CTX.agenciaId || 
                   (d.empresaId && EMPRESAS_AGENCIA.has(d.empresaId));
      } else {
        // RM vê só os seus
        permitido = d.rmUid === CTX.uid || d.rmId === CTX.uid || 
                   d.usuarioId === CTX.uid || d.gerenteId === CTX.uid ||
                   d.criadoPorUid === CTX.uid;
      }
      
      if (!permitido) return;
      
      // Extrair prêmio
      const premio = parseFloat(
        d.premioLiquido || d.valorNegocio || d.valorFinal || 
        d.valorDesejado || d.valorProposta || d.premio || 0
      ) || 0;
      
      const inicioVigencia = toDate(d.inicioVigencia);
      const fimVigencia = toDate(d.fimVigencia);
      
      NEGOCIOS.push({
        id: d.id,
        empresaId: d.empresaId || "",
        empresaNome: d.empresaNome || "-",
        ramo: d.ramo || "-",
        rmUid: d.rmUid || d.rmId || "",
        rmNome: d.rmNome || "-",
        agenciaId: agenciaId,
        agenciaNome: agenciaId ? (AGENCIAS[agenciaId] || agenciaId) : "-",
        premio: premio,
        inicioVigencia: inicioVigencia,
        fimVigencia: fimVigencia,
        dataCriacao: toDate(d.dataCriacao),
        ano: inicioVigencia ? inicioVigencia.getFullYear() : null,
        mes: inicioVigencia ? inicioVigencia.getMonth() : null
      });
    });
    
    // Ordenar por data de início (mais recentes primeiro)
    NEGOCIOS.sort((a, b) => {
      if (!a.inicioVigencia) return 1;
      if (!b.inicioVigencia) return -1;
      return b.inicioVigencia - a.inicioVigencia;
    });
    
  } catch (e) { 
    console.error("Erro carregando negócios:", e); 
  }
}

async function resolverAgenciaPorEmpresaIds(empresaIds) {
  const res = {};
  if (!empresaIds.length) return res;
  
  for (let i = 0; i < empresaIds.length; i += 10) {
    const slice = empresaIds.slice(i, i + 10);
    try {
      const snap = await db.collection("empresas")
        .where(firebase.firestore.FieldPath.documentId(), "in", slice).get();
      snap.forEach(doc => { res[doc.id] = (doc.data() || {}).agenciaId || ""; });
    } catch {
      for (const id of slice) {
        try {
          const d = await db.collection("empresas").doc(id).get();
          if (d.exists) res[id] = (d.data() || {}).agenciaId || "";
        } catch {}
      }
    }
  }
  return res;
}

// ==== Filtros ====
function definirFiltrosPadrao() {
  const anoAtual = new Date().getFullYear();
  const inicio = `${anoAtual}-01-01`;
  const fim = `${anoAtual}-12-31`;
  
  if ($("filtroDataInicio")) $("filtroDataInicio").value = inicio;
  if ($("filtroDataFim")) $("filtroDataFim").value = fim;
}

function montarFiltros() {
  // Anos
  const anosSet = new Set();
  NEGOCIOS.forEach(n => { if (n.ano) anosSet.add(n.ano); });
  const anos = Array.from(anosSet).sort((a, b) => b - a);
  
  const selAno = $("filtroAno");
  if (selAno) {
    selAno.innerHTML = '<option value="">Período Selecionado</option>';
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
      Object.entries(AGENCIAS).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, nome]) => {
        selAgencia.innerHTML += `<option value="${id}">${nome}</option>`;
      });
    }
  } else {
    if (grpAgencia) grpAgencia.style.display = 'none';
  }
  
  // RMs (Admin e GC veem)
  const selRM = $("filtroRM");
  const grpRM = $("filtroRMGroup");
  if (CTX.isAdmin || CTX.perfil === "gerente chefe") {
    if (selRM) {
      selRM.innerHTML = '<option value="">Todos</option>';
      const rmsVisiveis = Object.entries(RMS)
        .filter(([id, rm]) => CTX.isAdmin || rm.agenciaId === CTX.agenciaId)
        .sort((a, b) => a[1].nome.localeCompare(b[1].nome));
      
      rmsVisiveis.forEach(([id, rm]) => {
        selRM.innerHTML += `<option value="${id}">${rm.nome}</option>`;
      });
    }
  } else {
    if (grpRM) grpRM.style.display = 'none';
  }
  
  // Ramos
  const ramosSet = new Set();
  NEGOCIOS.forEach(n => { if (n.ramo && n.ramo !== "-") ramosSet.add(n.ramo); });
  
  const selRamo = $("filtroRamo");
  if (selRamo) {
    selRamo.innerHTML = '<option value="">Todos</option>';
    Array.from(ramosSet).sort().forEach(ramo => {
      selRamo.innerHTML += `<option value="${ramo}">${ramo}</option>`;
    });
  }
}

function aplicarFiltroAno() {
  const ano = $("filtroAno")?.value;
  if (ano) {
    $("filtroDataInicio").value = `${ano}-01-01`;
    $("filtroDataFim").value = `${ano}-12-31`;
  }
  aplicarFiltros();
}

function aplicarFiltros() {
  const dataInicio = $("filtroDataInicio")?.value ? new Date($("filtroDataInicio").value + "T00:00:00") : null;
  const dataFim = $("filtroDataFim")?.value ? new Date($("filtroDataFim").value + "T23:59:59") : null;
  const agencia = $("filtroAgencia")?.value || "";
  const rm = $("filtroRM")?.value || "";
  const ramo = $("filtroRamo")?.value || "";
  const empresa = normalizar($("filtroEmpresa")?.value || "");
  
  NEGOCIOS_FILTRADOS = NEGOCIOS.filter(n => {
    if (dataInicio && n.inicioVigencia && n.inicioVigencia < dataInicio) return false;
    if (dataFim && n.inicioVigencia && n.inicioVigencia > dataFim) return false;
    if (agencia && n.agenciaId !== agencia) return false;
    if (rm && n.rmUid !== rm) return false;
    if (ramo && n.ramo !== ramo) return false;
    if (empresa && !normalizar(n.empresaNome).includes(empresa)) return false;
    return true;
  });
  
  // Calcular ano anterior para comparativo
  if (dataInicio && dataFim) {
    const anoAnteriorInicio = new Date(dataInicio);
    anoAnteriorInicio.setFullYear(anoAnteriorInicio.getFullYear() - 1);
    const anoAnteriorFim = new Date(dataFim);
    anoAnteriorFim.setFullYear(anoAnteriorFim.getFullYear() - 1);
    
    NEGOCIOS_ANO_ANTERIOR = NEGOCIOS.filter(n => {
      if (!n.inicioVigencia) return false;
      if (n.inicioVigencia < anoAnteriorInicio || n.inicioVigencia > anoAnteriorFim) return false;
      if (agencia && n.agenciaId !== agencia) return false;
      if (rm && n.rmUid !== rm) return false;
      if (ramo && n.ramo !== ramo) return false;
      return true;
    });
  } else {
    NEGOCIOS_ANO_ANTERIOR = [];
  }
  
  renderizarTudo();
}

function limparFiltros() {
  $("filtroAno").value = "";
  $("filtroAgencia").value = "";
  $("filtroRM").value = "";
  $("filtroRamo").value = "";
  $("filtroEmpresa").value = "";
  definirFiltrosPadrao();
  aplicarFiltros();
}

// ==== Renderização ====
function renderizarTudo() {
  renderizarStats();
  renderizarGraficos();
  renderizarTabelaMini();
  renderizarTabelaCompleta();
  renderizarRamos();
  renderizarComparativo();
  
  // Atualizar ranking se visível
  if ($("tabRanking")?.classList.contains("active")) {
    renderizarRanking();
  }
  
  // Ocultar aba de ranking para RM (só vê os próprios dados)
  const tabRankingBtn = $("tabRankingBtn");
  if (tabRankingBtn) {
    if (!CTX.isAdmin && CTX.perfil !== "gerente chefe") {
      tabRankingBtn.style.display = "none";
    } else {
      tabRankingBtn.style.display = "";
    }
  }
}

function renderizarStats() {
  const total = NEGOCIOS_FILTRADOS.reduce((sum, n) => sum + n.premio, 0);
  const qtd = NEGOCIOS_FILTRADOS.length;
  const ticket = qtd > 0 ? total / qtd : 0;
  
  // Top ramo
  const porRamo = {};
  NEGOCIOS_FILTRADOS.forEach(n => {
    if (!porRamo[n.ramo]) porRamo[n.ramo] = 0;
    porRamo[n.ramo] += n.premio;
  });
  const topRamo = Object.entries(porRamo).sort((a, b) => b[1] - a[1])[0];
  
  // Comparativo
  const totalAnterior = NEGOCIOS_ANO_ANTERIOR.reduce((sum, n) => sum + n.premio, 0);
  const diff = totalAnterior > 0 ? ((total - totalAnterior) / totalAnterior) * 100 : 0;
  
  $("statTotal").textContent = fmtBRLCompact(total);
  $("statNegocios").textContent = qtd;
  $("statTicket").textContent = fmtBRLCompact(ticket);
  $("statTopRamo").textContent = topRamo ? topRamo[0].substring(0, 12) : "-";
  $("statTopRamoSub").textContent = topRamo ? fmtBRLCompact(topRamo[1]) : "";
  
  if (totalAnterior > 0) {
    $("statCompare").textContent = (diff >= 0 ? "+" : "") + diff.toFixed(0) + "%";
    $("statCompareBadge").innerHTML = diff >= 0 
      ? `<span class="stat-badge up">↑ Crescimento</span>`
      : `<span class="stat-badge down">↓ Queda</span>`;
  } else {
    $("statCompare").textContent = "-";
    $("statCompareBadge").innerHTML = "";
  }
}

function renderizarGraficos() {
  renderizarPizza();
  renderizarBarras();
}

function renderizarPizza() {
  const ctx = $("chartPizza")?.getContext("2d");
  if (!ctx) return;
  
  // Agrupar por ramo
  const porRamo = {};
  NEGOCIOS_FILTRADOS.forEach(n => {
    if (!porRamo[n.ramo]) porRamo[n.ramo] = 0;
    porRamo[n.ramo] += n.premio;
  });
  
  const dados = Object.entries(porRamo).sort((a, b) => b[1] - a[1]);
  const labels = dados.map(d => d[0]);
  const values = dados.map(d => d[1]);
  const cores = dados.map((_, i) => getCorRamo(i));
  
  if (chartPizza) chartPizza.destroy();
  
  chartPizza = new Chart(ctx, {
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
          labels: { 
            font: { family: "'Plus Jakarta Sans'", size: 11 },
            usePointStyle: true,
            padding: 12
          }
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

function renderizarBarras() {
  const ctx = $("chartBarras")?.getContext("2d");
  if (!ctx) return;
  
  // Agrupar por mês
  const porMes = {};
  NEGOCIOS_FILTRADOS.forEach(n => {
    if (n.inicioVigencia) {
      const key = `${n.inicioVigencia.getFullYear()}-${String(n.inicioVigencia.getMonth() + 1).padStart(2, '0')}`;
      if (!porMes[key]) porMes[key] = 0;
      porMes[key] += n.premio;
    }
  });
  
  const meses = Object.keys(porMes).sort();
  const values = meses.map(m => porMes[m]);
  
  const labels = meses.map(m => {
    const [ano, mes] = m.split('-');
    const nomesMes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${nomesMes[parseInt(mes) - 1]}/${ano.slice(2)}`;
  });
  
  if (chartBarras) chartBarras.destroy();
  
  chartBarras = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Prêmio',
        data: values,
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => fmtBRL(ctx.raw)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => fmtBRLCompact(v),
            font: { family: "'Plus Jakarta Sans'", size: 11 }
          },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: {
          ticks: { font: { family: "'Plus Jakarta Sans'", size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

function renderizarTabelaMini() {
  const tbody = $("miniTableBody");
  if (!tbody) return;
  
  const ultimos = NEGOCIOS_FILTRADOS.slice(0, 10);
  
  if (ultimos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="icon">📋</div><h3>Nenhum negócio encontrado</h3></td></tr>`;
    $("miniTableCount").textContent = "0 negócios";
    return;
  }
  
  tbody.innerHTML = ultimos.map(n => `
    <tr>
      <td class="empresa-cell" title="${n.empresaNome}">${n.empresaNome}</td>
      <td><span class="ramo-badge">${getIconeRamo(n.ramo)} ${n.ramo}</span></td>
      <td>${n.rmNome}</td>
      <td class="valor-cell">${fmtBRL(n.premio)}</td>
      <td>${fmtData(n.inicioVigencia)}</td>
    </tr>
  `).join('');
  
  $("miniTableCount").textContent = `${NEGOCIOS_FILTRADOS.length} negócios • ${fmtBRL(NEGOCIOS_FILTRADOS.reduce((s, n) => s + n.premio, 0))}`;
}

function renderizarTabelaCompleta() {
  const tbody = $("fullTableBody");
  if (!tbody) return;
  
  if (NEGOCIOS_FILTRADOS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="icon">📋</div><h3>Nenhum negócio encontrado</h3></td></tr>`;
    $("fullTableCount").textContent = "0 negócios";
    return;
  }
  
  tbody.innerHTML = NEGOCIOS_FILTRADOS.map(n => `
    <tr>
      <td class="empresa-cell" title="${n.empresaNome}">${n.empresaNome}</td>
      <td><span class="ramo-badge">${getIconeRamo(n.ramo)} ${n.ramo}</span></td>
      <td>${n.rmNome}</td>
      <td>${n.agenciaNome}</td>
      <td class="valor-cell">${fmtBRL(n.premio)}</td>
      <td>${fmtData(n.inicioVigencia)}</td>
      <td>${fmtData(n.fimVigencia)}</td>
    </tr>
  `).join('');
  
  $("fullTableCount").textContent = `${NEGOCIOS_FILTRADOS.length} negócios • Total: ${fmtBRL(NEGOCIOS_FILTRADOS.reduce((s, n) => s + n.premio, 0))}`;
}

function renderizarRamos() {
  const container = $("ramoGrid");
  if (!container) return;
  
  // Agrupar por ramo
  const porRamo = {};
  NEGOCIOS_FILTRADOS.forEach(n => {
    if (!porRamo[n.ramo]) porRamo[n.ramo] = { negocios: [], total: 0, qtd: 0 };
    porRamo[n.ramo].negocios.push(n);
    porRamo[n.ramo].total += n.premio;
    porRamo[n.ramo].qtd++;
  });
  
  const ramos = Object.entries(porRamo).sort((a, b) => b[1].total - a[1].total);
  
  if (ramos.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🏷️</div><h3>Nenhum ramo encontrado</h3></div>`;
    return;
  }
  
  const totalGeral = NEGOCIOS_FILTRADOS.reduce((s, n) => s + n.premio, 0);
  
  container.innerHTML = ramos.map(([ramo, dados]) => {
    const pct = totalGeral > 0 ? ((dados.total / totalGeral) * 100).toFixed(1) : 0;
    const ticketMedio = dados.qtd > 0 ? dados.total / dados.qtd : 0;
    const top3 = dados.negocios.sort((a, b) => b.premio - a.premio).slice(0, 3);
    
    return `
      <div class="ramo-card" onclick="abrirModalRamo('${ramo}')">
        <div class="ramo-card-header">
          <div class="ramo-card-title">
            <span class="icon">${getIconeRamo(ramo)}</span>
            <span>${ramo}</span>
          </div>
          <div class="ramo-card-valor">${fmtBRLCompact(dados.total)}</div>
        </div>
        <div class="ramo-card-body">
          <div class="ramo-stats">
            <div class="ramo-stat">
              <div class="ramo-stat-value">${dados.qtd}</div>
              <div class="ramo-stat-label">Negócios</div>
            </div>
            <div class="ramo-stat">
              <div class="ramo-stat-value">${pct}%</div>
              <div class="ramo-stat-label">Participação</div>
            </div>
            <div class="ramo-stat">
              <div class="ramo-stat-value">${fmtBRLCompact(ticketMedio)}</div>
              <div class="ramo-stat-label">Ticket Médio</div>
            </div>
          </div>
          <table class="ramo-card-table">
            ${top3.map(n => `
              <tr>
                <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${n.empresaNome}</td>
                <td style="text-align: right; font-weight: 600; color: var(--success);">${fmtBRLCompact(n.premio)}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
    `;
  }).join('');
}

function renderizarComparativo() {
  const container = $("compareGrid");
  if (!container) return;
  
  const totalAtual = NEGOCIOS_FILTRADOS.reduce((s, n) => s + n.premio, 0);
  const qtdAtual = NEGOCIOS_FILTRADOS.length;
  const totalAnterior = NEGOCIOS_ANO_ANTERIOR.reduce((s, n) => s + n.premio, 0);
  const qtdAnterior = NEGOCIOS_ANO_ANTERIOR.length;
  
  const diffValor = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : 0;
  const diffQtd = qtdAnterior > 0 ? ((qtdAtual - qtdAnterior) / qtdAnterior) * 100 : 0;
  
  const anoAtual = $("filtroDataInicio")?.value?.slice(0, 4) || new Date().getFullYear();
  const anoAnterior = parseInt(anoAtual) - 1;
  
  container.innerHTML = `
    <div class="compare-card">
      <div class="compare-title">💰 Prêmio Total</div>
      <div class="compare-value current">${fmtBRL(totalAtual)}</div>
      <div class="compare-label">${anoAtual}</div>
      <div style="margin-top: 16px;">
        <div class="compare-value previous" style="font-size: 24px;">${fmtBRL(totalAnterior)}</div>
        <div class="compare-label">${anoAnterior}</div>
      </div>
      <div class="compare-diff ${diffValor >= 0 ? 'up' : diffValor < 0 ? 'down' : 'neutral'}">
        ${diffValor >= 0 ? '↑' : '↓'} ${Math.abs(diffValor).toFixed(1)}%
        <span style="font-weight: 400; opacity: 0.8;">vs ano anterior</span>
      </div>
    </div>
    <div class="compare-card">
      <div class="compare-title">📋 Quantidade de Negócios</div>
      <div class="compare-value current" style="color: var(--info);">${qtdAtual}</div>
      <div class="compare-label">${anoAtual}</div>
      <div style="margin-top: 16px;">
        <div class="compare-value previous" style="font-size: 24px;">${qtdAnterior}</div>
        <div class="compare-label">${anoAnterior}</div>
      </div>
      <div class="compare-diff ${diffQtd >= 0 ? 'up' : diffQtd < 0 ? 'down' : 'neutral'}">
        ${diffQtd >= 0 ? '↑' : '↓'} ${Math.abs(diffQtd).toFixed(1)}%
        <span style="font-weight: 400; opacity: 0.8;">vs ano anterior</span>
      </div>
    </div>
  `;
  
  // Gráfico comparativo
  renderizarGraficoComparativo();
}

function renderizarGraficoComparativo() {
  const ctx = $("chartComparativo")?.getContext("2d");
  if (!ctx) return;
  
  // Agrupar por ano
  const porAno = {};
  NEGOCIOS.forEach(n => {
    if (n.ano) {
      if (!porAno[n.ano]) porAno[n.ano] = 0;
      porAno[n.ano] += n.premio;
    }
  });
  
  const anos = Object.keys(porAno).sort();
  const values = anos.map(a => porAno[a]);
  
  if (chartComparativo) chartComparativo.destroy();
  
  chartComparativo = new Chart(ctx, {
    type: 'line',
    data: {
      labels: anos,
      datasets: [{
        label: 'Prêmio Anual',
        data: values,
        borderColor: 'rgba(16, 185, 129, 1)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: 'rgba(16, 185, 129, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => fmtBRL(ctx.raw)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => fmtBRLCompact(v),
            font: { family: "'Plus Jakarta Sans'", size: 11 }
          },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: {
          ticks: { font: { family: "'Plus Jakarta Sans'", size: 12, weight: 'bold' } },
          grid: { display: false }
        }
      }
    }
  });
}

// ==== Tabs ====
function trocarTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  
  const tabMap = { visao: 0, detalhes: 1, ramos: 2, ranking: 3, comparativo: 4 };
  document.querySelectorAll('.tab')[tabMap[tab]].classList.add('active');
  
  const tabIds = { visao: 'tabVisao', detalhes: 'tabDetalhes', ramos: 'tabRamos', ranking: 'tabRanking', comparativo: 'tabComparativo' };
  $(tabIds[tab]).classList.add('active');
  
  // Se for aba de ranking, renderizar
  if (tab === 'ranking') {
    renderizarRanking();
  }
}
window.trocarTab = trocarTab;

// ==== Ranking ====
function renderizarRanking() {
  const tipo = $("rankingTipo")?.value || "geral";
  
  // Mostrar/ocultar filtro de ramo
  const grpRamo = $("rankingRamoGroup");
  if (grpRamo) {
    grpRamo.style.display = tipo === "ramo" ? "" : "none";
  }
  
  // Preencher select de ramos se necessário
  const selRamo = $("rankingRamoFiltro");
  if (selRamo && selRamo.options.length <= 1) {
    const ramosSet = new Set();
    NEGOCIOS_FILTRADOS.forEach(n => { if (n.ramo && n.ramo !== "-") ramosSet.add(n.ramo); });
    Array.from(ramosSet).sort().forEach(ramo => {
      selRamo.innerHTML += `<option value="${ramo}">${ramo}</option>`;
    });
  }
  
  // Mostrar container correto
  const containerGeral = $("rankingGeralContainer");
  const containerRamo = $("rankingRamoContainer");
  
  if (tipo === "geral") {
    containerGeral.style.display = "";
    containerRamo.style.display = "none";
    renderizarRankingGeral();
  } else {
    containerGeral.style.display = "none";
    containerRamo.style.display = "";
    renderizarRankingPorRamo();
  }
}

function renderizarRankingGeral() {
  // Agrupar por gerente
  const porGerente = {};
  NEGOCIOS_FILTRADOS.forEach(n => {
    const key = n.rmUid || n.rmNome || "sem-gerente";
    if (!porGerente[key]) {
      porGerente[key] = {
        uid: n.rmUid,
        nome: n.rmNome || "Sem Gerente",
        agencia: n.agenciaNome || "-",
        total: 0,
        qtd: 0
      };
    }
    porGerente[key].total += n.premio;
    porGerente[key].qtd++;
  });
  
  const ranking = Object.values(porGerente).sort((a, b) => b.total - a.total);
  const totalGeral = NEGOCIOS_FILTRADOS.reduce((s, n) => s + n.premio, 0);
  
  // Renderizar Pódio (top 3)
  const podium = $("rankingPodium");
  if (podium) {
    if (ranking.length >= 3) {
      const [primeiro, segundo, terceiro] = ranking;
      podium.innerHTML = `
        <div class="podium-item silver">
          <div class="podium-avatar">${getIniciais(segundo.nome)}</div>
          <div class="podium-name" title="${segundo.nome}">${segundo.nome}</div>
          <div class="podium-value">${fmtBRLCompact(segundo.total)}</div>
          <div class="podium-qtd">${segundo.qtd} negócios</div>
          <div class="podium-base">2º</div>
        </div>
        <div class="podium-item gold">
          <div class="podium-avatar">${getIniciais(primeiro.nome)}</div>
          <div class="podium-name" title="${primeiro.nome}">${primeiro.nome}</div>
          <div class="podium-value">${fmtBRLCompact(primeiro.total)}</div>
          <div class="podium-qtd">${primeiro.qtd} negócios</div>
          <div class="podium-base">1º</div>
        </div>
        <div class="podium-item bronze">
          <div class="podium-avatar">${getIniciais(terceiro.nome)}</div>
          <div class="podium-name" title="${terceiro.nome}">${terceiro.nome}</div>
          <div class="podium-value">${fmtBRLCompact(terceiro.total)}</div>
          <div class="podium-qtd">${terceiro.qtd} negócios</div>
          <div class="podium-base">3º</div>
        </div>
      `;
    } else if (ranking.length > 0) {
      podium.innerHTML = ranking.slice(0, 3).map((g, i) => `
        <div class="podium-item ${i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze'}">
          <div class="podium-avatar">${getIniciais(g.nome)}</div>
          <div class="podium-name">${g.nome}</div>
          <div class="podium-value">${fmtBRLCompact(g.total)}</div>
          <div class="podium-qtd">${g.qtd} negócios</div>
          <div class="podium-base">${i + 1}º</div>
        </div>
      `).join('');
    } else {
      podium.innerHTML = `<div class="empty-state"><div class="icon">🏆</div><h3>Sem dados para ranking</h3></div>`;
    }
  }
  
  // Renderizar Tabela
  const tbody = $("rankingTableBody");
  if (tbody) {
    if (ranking.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="icon">🏆</div><h3>Nenhum gerente encontrado</h3></td></tr>`;
    } else {
      tbody.innerHTML = ranking.map((g, i) => {
        const pct = totalGeral > 0 ? ((g.total / totalGeral) * 100) : 0;
        const ticket = g.qtd > 0 ? g.total / g.qtd : 0;
        const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
        
        return `
          <tr>
            <td><span class="rank-position ${posClass}">${i + 1}º</span></td>
            <td>
              <div class="gerente-cell">
                <div class="gerente-avatar">${getIniciais(g.nome)}</div>
                <div class="gerente-info">
                  <span class="gerente-nome">${g.nome}</span>
                  <span class="gerente-agencia">${g.agencia}</span>
                </div>
              </div>
            </td>
            <td style="font-weight: 700;">${g.qtd}</td>
            <td class="valor-cell">${fmtBRL(g.total)}</td>
            <td>${fmtBRL(ticket)}</td>
            <td>
              <div style="display: flex; align-items: center; gap: 10px;">
                <div class="progress-bar-container" style="width: 80px;">
                  <div class="progress-bar-fill" style="width: ${pct}%"></div>
                </div>
                <span style="font-weight: 600;">${pct.toFixed(1)}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
  
  $("rankingCount").textContent = `${ranking.length} gerentes`;
}

function renderizarRankingPorRamo() {
  const container = $("rankingRamoGrid");
  if (!container) return;
  
  const ramoFiltro = $("rankingRamoFiltro")?.value || "";
  
  // Agrupar por ramo e depois por gerente
  const porRamo = {};
  NEGOCIOS_FILTRADOS.forEach(n => {
    if (ramoFiltro && n.ramo !== ramoFiltro) return;
    
    if (!porRamo[n.ramo]) porRamo[n.ramo] = { gerentes: {}, total: 0 };
    
    const key = n.rmUid || n.rmNome || "sem-gerente";
    if (!porRamo[n.ramo].gerentes[key]) {
      porRamo[n.ramo].gerentes[key] = {
        nome: n.rmNome || "Sem Gerente",
        total: 0,
        qtd: 0
      };
    }
    porRamo[n.ramo].gerentes[key].total += n.premio;
    porRamo[n.ramo].gerentes[key].qtd++;
    porRamo[n.ramo].total += n.premio;
  });
  
  const ramos = Object.entries(porRamo).sort((a, b) => b[1].total - a[1].total);
  
  if (ramos.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🏷️</div><h3>Nenhum ramo encontrado</h3></div>`;
    return;
  }
  
  container.innerHTML = ramos.map(([ramo, dados]) => {
    const ranking = Object.values(dados.gerentes).sort((a, b) => b.total - a.total);
    
    return `
      <div class="ranking-ramo-card">
        <div class="ranking-ramo-header">
          <div class="ranking-ramo-title">
            <span style="font-size: 24px;">${getIconeRamo(ramo)}</span>
            <span>${ramo}</span>
          </div>
          <div class="ranking-ramo-total">${fmtBRLCompact(dados.total)}</div>
        </div>
        <div class="ranking-ramo-list">
          ${ranking.slice(0, 10).map((g, i) => {
            const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
            return `
              <div class="ranking-ramo-item">
                <div class="ranking-ramo-position ${posClass}">${i + 1}º</div>
                <div class="ranking-ramo-info">
                  <div class="ranking-ramo-name">${g.nome}</div>
                  <div class="ranking-ramo-sub">${g.qtd} negócios</div>
                </div>
                <div class="ranking-ramo-value">${fmtBRLCompact(g.total)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function getIniciais(nome) {
  if (!nome || nome === "-") return "?";
  const partes = nome.split(" ").filter(p => p.length > 0);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
  return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
}

window.renderizarRanking = renderizarRanking;

// ==== Modal Ramo ====
function abrirModalRamo(ramo) {
  const negocios = NEGOCIOS_FILTRADOS.filter(n => n.ramo === ramo);
  const total = negocios.reduce((s, n) => s + n.premio, 0);
  
  $("modalRamoTitle").innerHTML = `${getIconeRamo(ramo)} ${ramo} - Detalhamento`;
  
  $("modalRamoBody").innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px;">
      <div style="background: #f8fafc; padding: 16px; border-radius: 10px; text-align: center;">
        <div style="font-size: 24px; font-weight: 800; color: var(--success);">${fmtBRL(total)}</div>
        <div style="font-size: 11px; color: var(--muted); text-transform: uppercase;">Total</div>
      </div>
      <div style="background: #f8fafc; padding: 16px; border-radius: 10px; text-align: center;">
        <div style="font-size: 24px; font-weight: 800;">${negocios.length}</div>
        <div style="font-size: 11px; color: var(--muted); text-transform: uppercase;">Negócios</div>
      </div>
      <div style="background: #f8fafc; padding: 16px; border-radius: 10px; text-align: center;">
        <div style="font-size: 24px; font-weight: 800;">${fmtBRLCompact(negocios.length > 0 ? total / negocios.length : 0)}</div>
        <div style="font-size: 11px; color: var(--muted); text-transform: uppercase;">Ticket Médio</div>
      </div>
    </div>
    <div style="max-height: 400px; overflow-y: auto;">
      <table class="data-table" style="font-size: 12px;">
        <thead>
          <tr><th>Empresa</th><th>RM</th><th>Prêmio</th><th>Vigência</th></tr>
        </thead>
        <tbody>
          ${negocios.sort((a, b) => b.premio - a.premio).map(n => `
            <tr>
              <td>${n.empresaNome}</td>
              <td>${n.rmNome}</td>
              <td class="valor-cell">${fmtBRL(n.premio)}</td>
              <td>${fmtData(n.inicioVigencia)} a ${fmtData(n.fimVigencia)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  $("modalRamo").classList.add("active");
}

function fecharModalRamo() {
  $("modalRamo").classList.remove("active");
}
window.abrirModalRamo = abrirModalRamo;
window.fecharModalRamo = fecharModalRamo;

// ==== Exports ====
async function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Cores
  const verde = [16, 185, 129];
  const escuro = [30, 41, 59];
  
  // ===== CAPA =====
  doc.setFillColor(...verde);
  doc.rect(0, 0, pageWidth, 80, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont(undefined, 'bold');
  doc.text('💰 Negócios Fechados', pageWidth / 2, 35, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setFont(undefined, 'normal');
  const periodo = `${$("filtroDataInicio")?.value || ''} a ${$("filtroDataFim")?.value || ''}`;
  doc.text(`Período: ${periodo}`, pageWidth / 2, 50, { align: 'center' });
  
  doc.setFontSize(11);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 65, { align: 'center' });
  
  // KPIs
  let y = 100;
  const total = NEGOCIOS_FILTRADOS.reduce((s, n) => s + n.premio, 0);
  const qtd = NEGOCIOS_FILTRADOS.length;
  const ticket = qtd > 0 ? total / qtd : 0;
  
  doc.setTextColor(...escuro);
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('RESUMO EXECUTIVO', 14, y);
  y += 10;
  
  // Boxes de KPIs
  const kpis = [
    { label: 'Prêmio Total', value: fmtBRL(total) },
    { label: 'Negócios', value: qtd.toString() },
    { label: 'Ticket Médio', value: fmtBRL(ticket) }
  ];
  
  const boxWidth = 58;
  kpis.forEach((kpi, i) => {
    const x = 14 + (i * (boxWidth + 5));
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, boxWidth, 25, 3, 3, 'F');
    
    doc.setTextColor(...verde);
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(kpi.value, x + boxWidth / 2, y + 12, { align: 'center' });
    
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text(kpi.label.toUpperCase(), x + boxWidth / 2, y + 20, { align: 'center' });
  });
  
  y += 40;
  
  // Distribuição por Ramo
  doc.setTextColor(...escuro);
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('DISTRIBUIÇÃO POR RAMO', 14, y);
  y += 8;
  
  const porRamo = {};
  NEGOCIOS_FILTRADOS.forEach(n => {
    if (!porRamo[n.ramo]) porRamo[n.ramo] = { total: 0, qtd: 0 };
    porRamo[n.ramo].total += n.premio;
    porRamo[n.ramo].qtd++;
  });
  
  const ramosOrdenados = Object.entries(porRamo).sort((a, b) => b[1].total - a[1].total);
  
  const ramoData = ramosOrdenados.map(([ramo, dados]) => {
    const pct = total > 0 ? ((dados.total / total) * 100).toFixed(1) : 0;
    return [ramo, dados.qtd.toString(), fmtBRL(dados.total), `${pct}%`];
  });
  
  doc.autoTable({
    startY: y,
    head: [['Ramo', 'Qtd', 'Prêmio', '%']],
    body: ramoData,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: escuro, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 50, halign: 'right' },
      3: { cellWidth: 25, halign: 'center' }
    },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });
  
  // Nova página para tabela completa
  doc.addPage();
  
  doc.setFillColor(...verde);
  doc.rect(0, 0, pageWidth, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('📋 Detalhamento dos Negócios', 14, 14);
  
  const negociosData = NEGOCIOS_FILTRADOS.slice(0, 50).map(n => [
    n.empresaNome.substring(0, 30),
    n.ramo,
    n.rmNome,
    fmtBRL(n.premio),
    fmtData(n.inicioVigencia)
  ]);
  
  doc.autoTable({
    startY: 30,
    head: [['Empresa', 'Ramo', 'RM', 'Prêmio', 'Início']],
    body: negociosData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: escuro, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 35 },
      2: { cellWidth: 35 },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 25, halign: 'center' }
    },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });
  
  if (NEGOCIOS_FILTRADOS.length > 50) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`* Exibindo os 50 primeiros de ${NEGOCIOS_FILTRADOS.length} negócios`, 14, doc.lastAutoTable.finalY + 10);
  }
  
  // ===== RANKING DE GERENTES (só para Admin e GC) =====
  if (CTX.isAdmin || CTX.perfil === "gerente chefe") {
    doc.addPage();
    
    doc.setFillColor(...verde);
    doc.rect(0, 0, pageWidth, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('🏆 Ranking de Gerentes', 14, 14);
    
    // Agrupar por gerente
    const porGerente = {};
    NEGOCIOS_FILTRADOS.forEach(n => {
      const key = n.rmUid || n.rmNome || "sem-gerente";
      if (!porGerente[key]) {
        porGerente[key] = { nome: n.rmNome || "Sem Gerente", total: 0, qtd: 0 };
      }
      porGerente[key].total += n.premio;
      porGerente[key].qtd++;
    });
    
    const rankingGerentes = Object.values(porGerente).sort((a, b) => b.total - a.total);
    
    const rankingData = rankingGerentes.slice(0, 20).map((g, i) => {
      const pct = total > 0 ? ((g.total / total) * 100).toFixed(1) : 0;
      return [`${i + 1}º`, g.nome, g.qtd.toString(), fmtBRL(g.total), `${pct}%`];
    });
    
    doc.autoTable({
      startY: 30,
      head: [['#', 'Gerente', 'Qtd', 'Prêmio', '%']],
      body: rankingData,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: escuro, textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 60 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 45, halign: 'right' },
        4: { cellWidth: 25, halign: 'center' }
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 0) {
          const pos = parseInt(data.cell.raw);
          if (pos === 1) data.cell.styles.fillColor = [254, 243, 199];
          else if (pos === 2) data.cell.styles.fillColor = [241, 245, 249];
          else if (pos === 3) data.cell.styles.fillColor = [254, 215, 170];
        }
      }
    });
  }
  
  // Rodapé
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Retorno Seguros • Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }
  
  doc.save(`negocios-fechados-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportarExcel() {
  const dados = NEGOCIOS_FILTRADOS.map(n => ({
    'Empresa': n.empresaNome,
    'Ramo': n.ramo,
    'RM': n.rmNome,
    'Agência': n.agenciaNome,
    'Prêmio': n.premio,
    'Início Vigência': n.inicioVigencia ? toISODate(n.inicioVigencia) : '',
    'Fim Vigência': n.fimVigencia ? toISODate(n.fimVigencia) : ''
  }));
  
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Negócios Fechados");
  XLSX.writeFile(wb, `negocios-fechados-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==== Globals ====
window.aplicarFiltros = aplicarFiltros;
window.aplicarFiltroAno = aplicarFiltroAno;
window.limparFiltros = limparFiltros;
window.exportarPDF = exportarPDF;
window.exportarExcel = exportarExcel;
