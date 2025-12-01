// empresas.js — Mapa de Produtos por Empresa
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

let EMPRESAS = [];
let EMPRESAS_FILTRADAS = [];
let COTACOES = [];
let COTACOES_FILTRADAS = [];
let RAMOS = [];
let AGENCIAS = {};
let RMS = {};

let MODAL_EMPRESA = null;
let MODAL_RAMO = null;

// Ordenação
let SORT_COLUMN = null; // 'total' ou 'percent'
let SORT_DIR = 'desc';

// ==== Helpers ====
const $ = id => document.getElementById(id);
const normalizar = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const toDate = x => {
  if (!x) return null;
  if (x.toDate) return x.toDate();
  if (x instanceof Date) return x;
  const d = new Date(x);
  return isNaN(d) ? null : d;
};

const fmtData = d => d ? d.toLocaleDateString("pt-BR") : "-";
const fmtBRL = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const fmtBRLCompact = v => {
  if (v >= 1000000) return `R$ ${(v/1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v/1000).toFixed(0)}K`;
  return fmtBRL(v);
};

function categoriaStatus(status) {
  if (!status) return "sem";
  const s = normalizar(status);
  if (s.includes("emitido") && !s.includes("declinado")) return "emitido";
  if (s.includes("fechado") || s.includes("emissao") || s.includes("emissão")) return "emissao";
  if (s.includes("recusado") || s.includes("declinado") || s.includes("perdido")) return "recusado";
  if (s.includes("pendente") || s.includes("aguardando") || s.includes("analise") || s.includes("análise")) return "pendente";
  return "sem";
}

function statusIcon(cat) {
  const icons = { emitido: "🟢", pendente: "🟡", recusado: "🔴", emissao: "🔵", oportunidade: "💎" };
  return icons[cat] || "⚪";
}

function statusLabel(cat) {
  const labels = { emitido: "Emitido", pendente: "Pendente", recusado: "Recusado", emissao: "Em Emissão", oportunidade: "Oportunidade" };
  return labels[cat] || "Não Cotado";
}

function getIcone(id) {
  const icons = {
    "saude": "🏥", "dental": "🦷", "vida": "❤️", "vida-global": "🌍",
    "patrimonial": "🏢", "frota": "🚗", "equipamentos": "⚙️",
    "garantia": "📜", "rc": "⚖️", "cyber": "💻", "transporte": "🚚", "credito": "💳"
  };
  const idLower = normalizar(id);
  for (const [key, icon] of Object.entries(icons)) {
    if (idLower.includes(key)) return icon;
  }
  return "📋";
}

function getAbreviacao(nome) {
  const map = {
    "saude": "SAÚDE", "saúde": "SAÚDE", "dental": "DENTAL", "vida": "VIDA",
    "vida global": "V.GLOB", "patrimonial": "PATRIM", "frota": "FROTA",
    "equipamentos": "EQUIP", "garantia": "GARANT", "rc": "RC",
    "cyber": "CYBER", "transporte": "TRANSP", "credito": "CRÉD",
    "funcionarios": "FUNC", "funcionários": "FUNC", "socios": "SÓC", "sócios": "SÓC",
    "empresarial": "EMPRES", "pessoa chave": "P.CHAV", "resgatavel": "RESGAT", "resgatável": "RESGAT"
  };
  const n = normalizar(nome);
  for (const [key, abbr] of Object.entries(map)) {
    if (n.includes(key)) return abbr;
  }
  return nome.substring(0, 5).toUpperCase();
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
  await Promise.all([carregarRamos(), carregarLookups()]);
  await Promise.all([carregarEmpresas(), carregarCotacoes()]);
  
  processarDados();
  renderizarTudo();
  atualizarRanking();
}

// ==== Carregar Dados ====
async function carregarRamos() {
  try {
    let snap;
    try { snap = await db.collection("ramos-seguro").orderBy("ordem").get(); }
    catch { snap = await db.collection("ramos-seguro").get(); }
    
    snap.forEach(doc => {
      const d = doc.data();
      RAMOS.push({
        id: doc.id,
        nome: d.nomeExibicao || d.nome || doc.id,
        icon: getIcone(doc.id),
        abbr: getAbreviacao(d.nomeExibicao || d.nome || doc.id)
      });
    });
    
    if (RAMOS.length === 0) {
      RAMOS = [
        { id: "saude", nome: "Saúde", icon: "🏥", abbr: "SAÚDE" },
        { id: "dental", nome: "Dental", icon: "🦷", abbr: "DENTAL" },
        { id: "vida", nome: "Vida", icon: "❤️", abbr: "VIDA" },
        { id: "patrimonial", nome: "Patrimonial", icon: "🏢", abbr: "PATRIM" },
        { id: "frota", nome: "Frota", icon: "🚗", abbr: "FROTA" },
        { id: "equipamentos", nome: "Equipamentos", icon: "⚙️", abbr: "EQUIP" },
        { id: "garantia", nome: "Garantia", icon: "📜", abbr: "GARANT" },
        { id: "rc", nome: "RC", icon: "⚖️", abbr: "RC" }
      ];
    }
  } catch (e) { console.warn("Erro ramos:", e); }
}

async function carregarLookups() {
  // Agências
  try {
    const snap = await db.collection("agencias_banco").get();
    snap.forEach(doc => { AGENCIAS[doc.id] = doc.data().nome || doc.id; });
    
    const selAgencia = $("filtroAgencia");
    const selRankingAgencia = $("rankingAgencia");
    if (selAgencia) {
      selAgencia.innerHTML = '<option value="">Todas</option>';
      Object.entries(AGENCIAS).sort((a,b) => a[1].localeCompare(b[1])).forEach(([id, nome]) => {
        selAgencia.innerHTML += `<option value="${id}">${nome}</option>`;
      });
    }
    if (selRankingAgencia) {
      selRankingAgencia.innerHTML = '<option value="">Todas</option>';
      Object.entries(AGENCIAS).sort((a,b) => a[1].localeCompare(b[1])).forEach(([id, nome]) => {
        selRankingAgencia.innerHTML += `<option value="${id}">${nome}</option>`;
      });
    }
  } catch (e) { console.warn("Erro agências:", e); }
  
  // RMs
  try {
    const snap = await db.collection("usuarios_banco").get();
    snap.forEach(doc => {
      const d = doc.data();
      if (d.nome) RMS[doc.id] = { nome: d.nome, agenciaId: d.agenciaId };
    });
    
    const sel = $("filtroRM");
    if (sel) {
      sel.innerHTML = '<option value="">Todos</option>';
      Object.entries(RMS).sort((a,b) => a[1].nome.localeCompare(b[1].nome)).forEach(([id, rm]) => {
        sel.innerHTML += `<option value="${id}">${rm.nome}</option>`;
      });
    }
  } catch (e) { console.warn("Erro RMs:", e); }
}

async function carregarEmpresas() {
  try {
    const snap = await db.collection("empresas").get();
    snap.forEach(doc => {
      const d = doc.data();
      EMPRESAS.push({
        id: doc.id,
        nome: d.nome || d.razaoSocial || "Empresa",
        cnpj: d.cnpj || "",
        cidade: d.cidade || "",
        rmUid: d.rmUid || d.rmId || d.gerenteId || "",
        rmNome: d.rmNome || d.gerenteNome || "",
        agenciaId: d.agenciaId || "",
        numFuncionarios: d.numFuncionarios || 0
      });
    });
    EMPRESAS.sort((a, b) => a.nome.localeCompare(b.nome));
  } catch (e) { console.warn("Erro empresas:", e); }
}

async function carregarCotacoes() {
  try {
    const snap = await db.collection("cotacoes-gerentes").get();
    snap.forEach(doc => {
      const d = doc.data();
      COTACOES.push({
        id: doc.id,
        empresaId: d.empresaId || "",
        empresaNome: d.empresaNome || "",
        ramo: d.ramo || "",
        status: d.status || "",
        statusCat: categoriaStatus(d.status),
        valor: parseFloat(d.valorFinal || d.valorNegocio || d.premio || d.valorDesejado || 0),
        dataCriacao: toDate(d.dataCriacao),
        rmUid: d.rmUid || d.rmId || "",
        rmNome: d.rmNome || "",
        agenciaId: d.agenciaId || ""
      });
    });
  } catch (e) { console.warn("Erro cotações:", e); }
}

// ==== Processar Dados ====
function processarDados() {
  // Filtrar cotações por período se definido
  const dataInicio = $("filtroDataInicio")?.value ? new Date($("filtroDataInicio").value + "T00:00:00") : null;
  const dataFim = $("filtroDataFim")?.value ? new Date($("filtroDataFim").value + "T23:59:59") : null;
  
  COTACOES_FILTRADAS = COTACOES.filter(c => {
    if (dataInicio && c.dataCriacao && c.dataCriacao < dataInicio) return false;
    if (dataFim && c.dataCriacao && c.dataCriacao > dataFim) return false;
    return true;
  });
  
  // Calcular % por ramo
  const totalEmpresas = EMPRESAS.length;
  RAMOS.forEach(ramo => {
    const empresasComCotacao = new Set();
    COTACOES_FILTRADAS.forEach(c => {
      if (matchRamo(c.ramo, ramo)) {
        const emp = EMPRESAS.find(e => e.id === c.empresaId || normalizar(e.nome) === normalizar(c.empresaNome));
        if (emp) empresasComCotacao.add(emp.id);
      }
    });
    ramo.cotadas = empresasComCotacao.size;
    ramo.percent = totalEmpresas > 0 ? Math.round((empresasComCotacao.size / totalEmpresas) * 100) : 0;
  });
  
  // Para cada empresa, calcular status por ramo
  EMPRESAS.forEach(emp => {
    emp.ramos = {};
    emp.totalEmitidos = 0;
    emp.totalPendentes = 0;
    emp.totalRecusados = 0;
    emp.totalValor = 0;
    emp.oportunidades = 0;
    emp.totalCotacoes = 0;
    
    if (!emp.rmNome && emp.rmUid && RMS[emp.rmUid]) emp.rmNome = RMS[emp.rmUid].nome;
    
    RAMOS.forEach(ramo => {
      const cotacoesRamo = COTACOES_FILTRADAS.filter(c => {
        const matchEmpresa = c.empresaId === emp.id || normalizar(c.empresaNome) === normalizar(emp.nome);
        return matchEmpresa && matchRamo(c.ramo, ramo);
      });
      
      if (cotacoesRamo.length === 0) {
        emp.ramos[ramo.id] = { status: "oportunidade", cotacoes: [], valor: 0 };
        emp.oportunidades++;
      } else {
        const prioridade = { emitido: 4, emissao: 3, pendente: 2, recusado: 1 };
        cotacoesRamo.sort((a, b) => (prioridade[b.statusCat] || 0) - (prioridade[a.statusCat] || 0));
        
        const melhor = cotacoesRamo[0];
        emp.ramos[ramo.id] = { status: melhor.statusCat, cotacoes: cotacoesRamo, valor: melhor.valor };
        emp.totalCotacoes += cotacoesRamo.length;
        
        if (melhor.statusCat === "emitido") {
          emp.totalEmitidos++;
          emp.totalValor += melhor.valor;
        } else if (melhor.statusCat === "pendente") {
          emp.totalPendentes++;
        } else if (melhor.statusCat === "recusado") {
          emp.totalRecusados++;
        }
      }
    });
    
    emp.cobertura = Math.round(((RAMOS.length - emp.oportunidades) / RAMOS.length) * 100);
  });
  
  EMPRESAS_FILTRADAS = [...EMPRESAS];
}

function matchRamo(cotacaoRamo, ramo) {
  const cr = normalizar(cotacaoRamo);
  const rn = normalizar(ramo.nome);
  const ri = normalizar(ramo.id);
  return cr.includes(ri) || cr.includes(rn) || rn.includes(cr) || ri.includes(cr);
}

// ==== Renderização ====
function renderizarTudo() {
  renderizarStats();
  renderizarTabela();
}

function renderizarStats() {
  const total = EMPRESAS_FILTRADAS.length;
  let emitidos = 0, pendentes = 0, recusados = 0, oportunidades = 0, somaCobertura = 0;
  
  EMPRESAS_FILTRADAS.forEach(emp => {
    emitidos += emp.totalEmitidos;
    pendentes += emp.totalPendentes;
    recusados += emp.totalRecusados;
    oportunidades += emp.oportunidades;
    somaCobertura += emp.cobertura;
  });
  
  $("statEmpresas").textContent = total;
  $("statEmitidos").textContent = emitidos;
  $("statPendentes").textContent = pendentes;
  $("statRecusados").textContent = recusados;
  $("statOportunidades").textContent = oportunidades;
  $("statCobertura").textContent = (total > 0 ? Math.round(somaCobertura / total) : 0) + "%";
}

function renderizarTabela() {
  const container = $("tableScroll");
  
  if (EMPRESAS_FILTRADAS.length === 0) {
    container.innerHTML = `<div class="loading" style="padding: 40px;"><span style="font-size: 48px;">🔍</span><span style="margin-top: 16px;">Nenhuma empresa encontrada</span></div>`;
    $("tableCount").textContent = "0 empresas";
    return;
  }
  
  // Ordenar se necessário
  if (SORT_COLUMN) {
    EMPRESAS_FILTRADAS.sort((a, b) => {
      let va, vb;
      if (SORT_COLUMN === 'total') { va = a.totalValor; vb = b.totalValor; }
      else if (SORT_COLUMN === 'percent') { va = a.cobertura; vb = b.cobertura; }
      return SORT_DIR === 'desc' ? vb - va : va - vb;
    });
  }
  
  // Header com abreviação, ícone e %
  let headerHtml = `<tr><th>EMPRESA</th>`;
  RAMOS.forEach(ramo => {
    headerHtml += `
      <th title="${ramo.nome} (${ramo.percent}% cotado)">
        <div class="col-header">
          <span class="col-header-abbr">${ramo.abbr}</span>
          <span class="col-header-icon">${ramo.icon}</span>
          <span class="col-header-percent">${ramo.percent}%</span>
        </div>
      </th>`;
  });
  
  // Colunas ordenáveis
  const totalIcon = SORT_COLUMN === 'total' ? (SORT_DIR === 'desc' ? '↓' : '↑') : '↕';
  const percentIcon = SORT_COLUMN === 'percent' ? (SORT_DIR === 'desc' ? '↓' : '↑') : '↕';
  
  headerHtml += `
    <th class="sortable" onclick="ordenarPor('total')" title="Ordenar por valor total">
      TOTAL <span class="sort-icon ${SORT_COLUMN === 'total' ? 'active' : ''}">${totalIcon}</span>
    </th>
    <th class="sortable" onclick="ordenarPor('percent')" title="Ordenar por cobertura">
      % <span class="sort-icon ${SORT_COLUMN === 'percent' ? 'active' : ''}">${percentIcon}</span>
    </th>
  </tr>`;
  
  // Body
  let bodyHtml = "";
  const totaisPorRamo = {};
  RAMOS.forEach(ramo => { totaisPorRamo[ramo.id] = { qtd: 0, valor: 0 }; });
  
  EMPRESAS_FILTRADAS.forEach(emp => {
    bodyHtml += `<tr><td>
      <div class="empresa-cell">
        <div class="empresa-nome" title="${emp.nome}">${emp.nome}</div>
        <div class="empresa-meta">
          <span>👤 ${emp.rmNome || '-'}</span>
          ${emp.cidade ? `<span>📍 ${emp.cidade}</span>` : ''}
        </div>
        <div class="empresa-progress"><div class="empresa-progress-bar" style="width: ${emp.cobertura}%"></div></div>
      </div>
    </td>`;
    
    RAMOS.forEach(ramo => {
      const ramoData = emp.ramos[ramo.id] || { status: "sem", cotacoes: [], valor: 0 };
      bodyHtml += `<td><div class="status-cell ${ramoData.status}" onclick="abrirModal('${emp.id}', '${ramo.id}')" title="${ramo.nome}: ${statusLabel(ramoData.status)}">${statusIcon(ramoData.status)}</div></td>`;
      
      if (ramoData.status === "emitido") {
        totaisPorRamo[ramo.id].qtd++;
        totaisPorRamo[ramo.id].valor += ramoData.valor;
      }
    });
    
    bodyHtml += `
      <td class="total-cell"><div class="total-valor">${fmtBRLCompact(emp.totalValor)}</div></td>
      <td class="total-cell"><div class="total-percent">${emp.cobertura}%</div></td>
    </tr>`;
  });
  
  // Footer
  let footerHtml = `<tr><td><strong>TOTAL EMITIDOS</strong></td>`;
  let totalGeralValor = 0;
  
  RAMOS.forEach(ramo => {
    const dados = totaisPorRamo[ramo.id];
    totalGeralValor += dados.valor;
    footerHtml += `<td class="total-cell" title="${fmtBRL(dados.valor)}"><strong>${dados.qtd}</strong></td>`;
  });
  
  footerHtml += `<td class="total-cell"><div class="total-valor">${fmtBRLCompact(totalGeralValor)}</div></td><td></td></tr>`;
  
  container.innerHTML = `<table class="matrix-table"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody><tfoot>${footerHtml}</tfoot></table>`;
  $("tableCount").textContent = `${EMPRESAS_FILTRADAS.length} empresas × ${RAMOS.length} ramos`;
}

function ordenarPor(coluna) {
  if (SORT_COLUMN === coluna) {
    SORT_DIR = SORT_DIR === 'desc' ? 'asc' : 'desc';
  } else {
    SORT_COLUMN = coluna;
    SORT_DIR = 'desc';
  }
  renderizarTabela();
}
window.ordenarPor = ordenarPor;

// ==== Filtros ====
function aplicarFiltros() {
  const busca = normalizar($("filtroEmpresa")?.value || "");
  const agencia = $("filtroAgencia")?.value || "";
  const rm = $("filtroRM")?.value || "";
  const exibir = $("filtroExibir")?.value || "todos";
  
  // Reprocessar para aplicar filtro de data
  processarDados();
  
  EMPRESAS_FILTRADAS = EMPRESAS.filter(emp => {
    if (busca && !normalizar(emp.nome).includes(busca)) return false;
    if (agencia && emp.agenciaId !== agencia) return false;
    if (rm && emp.rmUid !== rm) return false;
    if (exibir === "oportunidades" && emp.oportunidades === 0) return false;
    if (exibir === "completas" && emp.cobertura < 100) return false;
    if (exibir === "vazias" && emp.cobertura > 0) return false;
    return true;
  });
  
  renderizarTudo();
}

function limparFiltros() {
  $("filtroEmpresa").value = "";
  $("filtroAgencia").value = "";
  $("filtroRM").value = "";
  $("filtroDataInicio").value = "";
  $("filtroDataFim").value = "";
  $("filtroExibir").value = "todos";
  SORT_COLUMN = null;
  SORT_DIR = 'desc';
  
  processarDados();
  EMPRESAS_FILTRADAS = [...EMPRESAS];
  renderizarTudo();
}

// ==== Tabs ====
function trocarTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  
  if (tab === 'mapa') {
    document.querySelector('.tab:nth-child(1)').classList.add('active');
    $("tabMapa").classList.add('active');
  } else {
    document.querySelector('.tab:nth-child(2)').classList.add('active');
    $("tabRanking").classList.add('active');
    atualizarRanking();
  }
}
window.trocarTab = trocarTab;

// ==== Ranking ====
function atualizarRanking() {
  const container = $("rankingContainer");
  if (!container) return;
  
  const dataInicio = $("rankingDataInicio")?.value ? new Date($("rankingDataInicio").value + "T00:00:00") : null;
  const dataFim = $("rankingDataFim")?.value ? new Date($("rankingDataFim").value + "T23:59:59") : null;
  const agencia = $("rankingAgencia")?.value || "";
  
  // Filtrar cotações
  const cotsFiltradas = COTACOES.filter(c => {
    if (dataInicio && c.dataCriacao && c.dataCriacao < dataInicio) return false;
    if (dataFim && c.dataCriacao && c.dataCriacao > dataFim) return false;
    if (agencia && c.agenciaId !== agencia) return false;
    return true;
  });
  
  // Ranking geral
  const porGerente = {};
  cotsFiltradas.forEach(c => {
    const uid = c.rmUid || "sem-gerente";
    const nome = c.rmNome || "Sem Gerente";
    if (!porGerente[uid]) porGerente[uid] = { nome, total: 0, emitidos: 0, valor: 0 };
    porGerente[uid].total++;
    if (c.statusCat === "emitido") {
      porGerente[uid].emitidos++;
      porGerente[uid].valor += c.valor;
    }
  });
  
  const rankingGeral = Object.values(porGerente).sort((a, b) => b.total - a.total);
  
  // Ranking por ramo
  const porRamo = {};
  RAMOS.forEach(ramo => { porRamo[ramo.id] = { ramo, gerentes: {} }; });
  
  cotsFiltradas.forEach(c => {
    RAMOS.forEach(ramo => {
      if (matchRamo(c.ramo, ramo)) {
        const uid = c.rmUid || "sem-gerente";
        const nome = c.rmNome || "Sem Gerente";
        if (!porRamo[ramo.id].gerentes[uid]) porRamo[ramo.id].gerentes[uid] = { nome, total: 0, emitidos: 0 };
        porRamo[ramo.id].gerentes[uid].total++;
        if (c.statusCat === "emitido") porRamo[ramo.id].gerentes[uid].emitidos++;
      }
    });
  });
  
  // Renderizar
  let html = `
    <div class="ranking-card">
      <div class="ranking-card-header">
        <span class="icon">🏆</span>
        <span>Ranking Geral</span>
        <span class="percent">${cotsFiltradas.length} cotações</span>
      </div>
      <div class="ranking-list">
        ${rankingGeral.slice(0, 10).map((g, i) => `
          <div class="ranking-item">
            <div class="ranking-position ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal'}">${i + 1}º</div>
            <div class="ranking-info">
              <div class="ranking-name">${g.nome}</div>
              <div class="ranking-sub">${g.emitidos} emitidos • ${fmtBRLCompact(g.valor)}</div>
            </div>
            <div class="ranking-value">${g.total}</div>
          </div>
        `).join('') || '<div style="padding: 20px; text-align: center; color: var(--muted);">Sem dados</div>'}
      </div>
    </div>
  `;
  
  // Cards por ramo
  RAMOS.forEach(ramo => {
    const dados = porRamo[ramo.id];
    const ranking = Object.values(dados.gerentes).sort((a, b) => b.total - a.total);
    const totalRamo = ranking.reduce((sum, g) => sum + g.total, 0);
    
    html += `
      <div class="ranking-card">
        <div class="ranking-card-header">
          <span class="icon">${ramo.icon}</span>
          <span>${ramo.nome}</span>
          <span class="percent">${totalRamo} cot.</span>
        </div>
        <div class="ranking-list">
          ${ranking.slice(0, 5).map((g, i) => `
            <div class="ranking-item">
              <div class="ranking-position ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal'}">${i + 1}º</div>
              <div class="ranking-info">
                <div class="ranking-name">${g.nome}</div>
                <div class="ranking-sub">${g.emitidos} emitidos</div>
              </div>
              <div class="ranking-value">${g.total}</div>
            </div>
          `).join('') || '<div style="padding: 16px; text-align: center; color: var(--muted); font-size: 12px;">Sem cotações</div>'}
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function limparFiltrosRanking() {
  $("rankingDataInicio").value = "";
  $("rankingDataFim").value = "";
  $("rankingAgencia").value = "";
  atualizarRanking();
}
window.limparFiltrosRanking = limparFiltrosRanking;

// ==== Modal ====
function abrirModal(empresaId, ramoId) {
  const empresa = EMPRESAS.find(e => e.id === empresaId);
  const ramo = RAMOS.find(r => r.id === ramoId);
  if (!empresa || !ramo) return;
  
  MODAL_EMPRESA = empresa;
  MODAL_RAMO = ramo;
  
  const ramoData = empresa.ramos[ramoId] || { status: "sem", cotacoes: [], valor: 0 };
  
  $("modalTitle").innerHTML = `${ramo.icon} ${ramo.nome}`;
  
  let bodyHtml = `
    <div class="modal-empresa">
      <div class="modal-empresa-nome">${empresa.nome}</div>
      <div class="modal-empresa-info">👤 ${empresa.rmNome || 'Não vinculado'} ${empresa.cidade ? `• 📍 ${empresa.cidade}` : ''}</div>
    </div>
  `;
  
  if (ramoData.status === "oportunidade") {
    bodyHtml += `
      <div class="oportunidade-card">
        <div class="oportunidade-icon">💎</div>
        <div class="oportunidade-title">Oportunidade de Negócio!</div>
        <div class="oportunidade-desc">Esta empresa ainda não possui cotação para ${ramo.nome}.</div>
      </div>
    `;
  } else {
    bodyHtml += `
      <div class="modal-status-card">
        <div class="modal-status-icon">${statusIcon(ramoData.status)}</div>
        <div class="modal-status-info">
          <div class="modal-status-label">Status Atual</div>
          <div class="modal-status-value">${statusLabel(ramoData.status)}</div>
          ${ramoData.valor > 0 ? `<div class="modal-status-detail">Valor: ${fmtBRL(ramoData.valor)}</div>` : ''}
        </div>
      </div>
    `;
    
    if (ramoData.cotacoes.length > 0) {
      bodyHtml += `<h4 style="margin-bottom: 12px; font-size: 14px;">📋 Histórico de Cotações</h4><div class="cotacoes-list">`;
      ramoData.cotacoes.slice(0, 5).forEach(cot => {
        bodyHtml += `
          <div class="cotacao-item">
            <div class="cotacao-item-left">
              <div class="cotacao-status-dot ${cot.statusCat}"></div>
              <div>
                <div style="font-weight: 600;">${cot.status || '-'}</div>
                <div style="font-size: 11px; color: var(--muted);">${fmtData(cot.dataCriacao)}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 600;">${fmtBRL(cot.valor)}</div>
              <div style="font-size: 11px; color: var(--muted);">${cot.rmNome || '-'}</div>
            </div>
          </div>
        `;
      });
      bodyHtml += `</div>`;
    }
  }
  
  $("modalBody").innerHTML = bodyHtml;
  $("btnCriarCotacao").style.display = "inline-flex";
  $("modalDetalhes").classList.add("active");
}

function fecharModal() {
  $("modalDetalhes").classList.remove("active");
  MODAL_EMPRESA = null;
  MODAL_RAMO = null;
}

function criarCotacaoDoModal() {
  if (!MODAL_EMPRESA || !MODAL_RAMO) return;
  const params = new URLSearchParams({
    empresaId: MODAL_EMPRESA.id,
    empresaNome: MODAL_EMPRESA.nome,
    ramo: MODAL_RAMO.nome,
    nova: "1"
  });
  window.location.href = `cotacoes.html?${params}`;
}

// ==== Export PDF (formatado) ====
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  // Cores
  const brandColor = [79, 70, 229];
  const headerBg = [30, 41, 59];
  const successColor = [16, 185, 129];
  const warningColor = [245, 158, 11];
  const dangerColor = [239, 68, 68];
  
  // Título
  doc.setFillColor(...brandColor);
  doc.rect(0, 0, 297, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('🗺️ Mapa de Produtos por Empresa', 14, 16);
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 200, 10);
  doc.text(`Total: ${EMPRESAS_FILTRADAS.length} empresas`, 200, 16);
  
  // Filtros aplicados
  let y = 32;
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  const filtros = [];
  if ($("filtroAgencia")?.value) filtros.push(`Agência: ${AGENCIAS[$("filtroAgencia").value] || '-'}`);
  if ($("filtroRM")?.value) filtros.push(`Gerente: ${RMS[$("filtroRM").value]?.nome || '-'}`);
  if ($("filtroDataInicio")?.value) filtros.push(`De: ${$("filtroDataInicio").value}`);
  if ($("filtroDataFim")?.value) filtros.push(`Até: ${$("filtroDataFim").value}`);
  if (filtros.length > 0) {
    doc.text(`Filtros: ${filtros.join(' | ')}`, 14, y);
    y += 6;
  }
  
  // Legenda
  doc.setFillColor(220, 252, 231); doc.rect(14, y, 8, 4, 'F');
  doc.setFillColor(254, 243, 199); doc.rect(40, y, 8, 4, 'F');
  doc.setFillColor(254, 226, 226); doc.rect(70, y, 8, 4, 'F');
  doc.setFillColor(237, 233, 254); doc.rect(100, y, 8, 4, 'F');
  
  doc.setTextColor(0, 0, 0);
  doc.text('Emitido', 24, y + 3);
  doc.text('Pendente', 50, y + 3);
  doc.text('Recusado', 80, y + 3);
  doc.text('Oportunidade', 110, y + 3);
  y += 10;
  
  // Tabela
  const headers = ['Empresa', ...RAMOS.map(r => r.abbr), 'Total', '%'];
  const dados = EMPRESAS_FILTRADAS.map(emp => {
    const row = [emp.nome.substring(0, 25)];
    RAMOS.forEach(ramo => {
      const ramoData = emp.ramos[ramo.id];
      const statusMap = { emitido: 'Emi', pendente: 'Pen', recusado: 'Rec', emissao: 'Ems', oportunidade: 'Opo' };
      row.push(statusMap[ramoData?.status] || '-');
    });
    row.push(fmtBRLCompact(emp.totalValor));
    row.push(emp.cobertura + '%');
    return row;
  });
  
  doc.autoTable({
    startY: y,
    head: [headers],
    body: dados,
    styles: { fontSize: 7, cellPadding: 2, halign: 'center' },
    headStyles: { fillColor: headerBg, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 35, halign: 'left' } },
    didParseCell: function(data) {
      if (data.section === 'body' && data.column.index > 0 && data.column.index <= RAMOS.length) {
        const val = data.cell.raw;
        if (val === 'Emi') data.cell.styles.fillColor = [220, 252, 231];
        else if (val === 'Pen') data.cell.styles.fillColor = [254, 243, 199];
        else if (val === 'Rec') data.cell.styles.fillColor = [254, 226, 226];
        else if (val === 'Opo') data.cell.styles.fillColor = [237, 233, 254];
      }
    }
  });
  
  doc.save(`mapa-produtos-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportarExcel() {
  const dados = EMPRESAS_FILTRADAS.map(emp => {
    const row = { 'Empresa': emp.nome, 'Cidade': emp.cidade, 'Gerente': emp.rmNome || '-' };
    RAMOS.forEach(ramo => {
      const ramoData = emp.ramos[ramo.id];
      row[ramo.nome] = statusLabel(ramoData?.status || 'sem');
    });
    row['Total Valor'] = emp.totalValor;
    row['Cobertura %'] = emp.cobertura;
    row['Oportunidades'] = emp.oportunidades;
    return row;
  });
  
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mapa de Produtos");
  XLSX.writeFile(wb, `mapa-produtos-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==== Globals ====
window.aplicarFiltros = aplicarFiltros;
window.limparFiltros = limparFiltros;
window.abrirModal = abrirModal;
window.fecharModal = fecharModal;
window.criarCotacaoDoModal = criarCotacaoDoModal;
window.exportarPDF = exportarPDF;
window.exportarExcel = exportarExcel;
window.atualizarRanking = atualizarRanking;
