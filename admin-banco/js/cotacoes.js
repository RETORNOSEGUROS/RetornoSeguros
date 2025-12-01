// cotacoes.js — Gestão de Cotações Modernizado
// Firebase v8 compatível

// ==== Firebase Init ====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ==== Estado Global ====
let CTX = { uid: null, perfil: null, agenciaId: null, nome: null, email: null, isAdmin: false };
const ADMIN_EMAILS = ["patrick@retornoseguros.com.br"];

let COTACOES = [];
let COTACOES_FILTRADAS = [];
let SELECIONADAS = new Set();
let VIEW_ATUAL = 'list';
let FILTRO_STATUS_ATUAL = '';
let FILTRO_TEMP_ATUAL = '';

// Lookups
let AGENCIAS = {};
let RMS = {};
let EMPRESAS = {};
let RAMOS = [];

// Status config
const STATUS_EMITIDO = ["negócio emitido", "negocio emitido", "emitido", "fechado"];
const STATUS_PENDENTE = ["pendente"];
const STATUS_RECUSADO = ["recusado", "declinado"];
const STATUS_EMISSAO = ["emissão", "emissao", "em emissão"];

const KANBAN_COLUMNS = [
  { id: 'pendente', label: 'Pendentes', color: '#f59e0b', icon: '⏳' },
  { id: 'emissao', label: 'Em Emissão', color: '#6366f1', icon: '📝' },
  { id: 'emitido', label: 'Emitidos', color: '#10b981', icon: '✅' },
  { id: 'recusado', label: 'Recusados', color: '#ef4444', icon: '❌' }
];

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
const fmtDataHora = d => d ? d.toLocaleString("pt-BR") : "-";
const fmtNum = n => Number(n || 0).toLocaleString("pt-BR");

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

function formatarMoeda(input) {
  let v = (input.value || '').replace(/\D/g, '');
  if (!v) { input.value = 'R$ 0,00'; return; }
  v = (parseInt(v, 10) / 100).toFixed(2).replace('.', ',');
  v = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  input.value = 'R$ ' + v;
}

function desformatarMoeda(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/[^\d]/g, '') / 100);
}

// Categoria de status
function categoriaStatus(status) {
  const st = normalizar(status);
  if (STATUS_EMITIDO.some(s => st.includes(s))) return "emitido";
  if (STATUS_PENDENTE.some(s => st.includes(s))) return "pendente";
  if (STATUS_RECUSADO.some(s => st.includes(s))) return "recusado";
  if (STATUS_EMISSAO.some(s => st.includes(s))) return "emissao";
  return "outros";
}

function classeStatus(status) {
  const cat = categoriaStatus(status);
  switch (cat) {
    case "emitido": return "status-emitido";
    case "pendente": return "status-pendente";
    case "recusado": return "status-recusado";
    case "emissao": return "status-emissao";
    default: return "status-default";
  }
}

// Temperatura (mapa de calor)
function calcularTemperatura(cotacao) {
  // Se já tem temperatura definida, usa
  if (cotacao.temperatura) return cotacao.temperatura;
  
  // Calcula baseado em critérios
  let score = 50; // Base morno
  
  // Status influencia muito
  const cat = categoriaStatus(cotacao.status);
  if (cat === 'emitido') return 'quente';
  if (cat === 'recusado') return 'frio';
  if (cat === 'emissao') score += 30;
  
  // Valor alto aumenta probabilidade
  const valor = parseValor(cotacao.valorDesejado || cotacao.valorFinal || 0);
  if (valor > 100000) score += 15;
  else if (valor > 50000) score += 10;
  
  // Interações recentes indicam atividade
  const interacoes = cotacao.interacoes || [];
  if (interacoes.length > 5) score += 10;
  
  // Tempo desde última atualização
  const ultimaData = toDate(cotacao.dataAtualizacao || cotacao.dataHora || cotacao.dataCriacao);
  if (ultimaData) {
    const diasSemAtualizar = Math.floor((new Date() - ultimaData) / (1000 * 60 * 60 * 24));
    if (diasSemAtualizar <= 3) score += 15;
    else if (diasSemAtualizar > 14) score -= 20;
  }
  
  if (score >= 70) return 'quente';
  if (score >= 40) return 'morno';
  return 'frio';
}

function classeTemperatura(temp) {
  switch (temp) {
    case 'quente': return 'heat-quente';
    case 'morno': return 'heat-morno';
    case 'frio': return 'heat-frio';
    default: return 'heat-morno';
  }
}

function labelTemperatura(temp) {
  switch (temp) {
    case 'quente': return '🔥 Quente';
    case 'morno': return '🟡 Morno';
    case 'frio': return '❄️ Frio';
    default: return '🟡 Morno';
  }
}

// Tempo relativo
function tempoRelativo(data) {
  if (!data) return "";
  const agora = new Date();
  const diff = agora - data;
  const minutos = Math.floor(diff / 60000);
  const horas = Math.floor(diff / 3600000);
  const dias = Math.floor(diff / 86400000);
  
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos}min`;
  if (horas < 24) return `há ${horas}h`;
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  if (dias < 30) return `há ${Math.floor(dias / 7)} sem`;
  return fmtData(data);
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
      CTX.nome = user.email;
    }
  } catch (e) { console.warn("Erro perfil:", e); }
  
  await init();
});

// ==== Inicialização ====
async function init() {
  await Promise.all([
    carregarLookups(),
    carregarRamos()
  ]);
  
  await carregarCotacoes();
  renderizarTudo();
}

// ==== Lookups ====
async function carregarLookups() {
  // Agências
  try {
    const snap = await db.collection("agencias_banco").get();
    snap.forEach(doc => {
      AGENCIAS[doc.id] = doc.data().nome || doc.id;
    });
    
    const selAgencia = $("filtroAgencia");
    if (selAgencia) {
      selAgencia.innerHTML = '<option value="">Todas</option>';
      if (!CTX.isAdmin && CTX.agenciaId) {
        selAgencia.innerHTML = `<option value="${CTX.agenciaId}">${AGENCIAS[CTX.agenciaId] || CTX.agenciaId}</option>`;
        selAgencia.disabled = true;
      } else {
        Object.entries(AGENCIAS).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, nome]) => {
          selAgencia.innerHTML += `<option value="${id}">${nome}</option>`;
        });
      }
    }
  } catch (e) { console.warn("Erro agências:", e); }
  
  // RMs
  try {
    const snap = await db.collection("usuarios_banco").get();
    snap.forEach(doc => {
      const d = doc.data();
      if (d.nome) {
        RMS[doc.id] = { nome: d.nome, agenciaId: d.agenciaId };
      }
    });
    
    const selRM = $("filtroRM");
    if (selRM) {
      selRM.innerHTML = '<option value="">Todos</option>';
      Object.entries(RMS).sort((a, b) => a[1].nome.localeCompare(b[1].nome)).forEach(([id, rm]) => {
        selRM.innerHTML += `<option value="${id}">${rm.nome}</option>`;
      });
    }
  } catch (e) { console.warn("Erro RMs:", e); }
  
  // Empresas (para datalist)
  try {
    const snap = await db.collection("empresas").get();
    const datalistNova = $("empresasListNova");
    const datalistFiltro = $("empresasList");
    
    snap.forEach(doc => {
      const d = doc.data();
      EMPRESAS[doc.id] = d;
      const opt1 = document.createElement("option");
      opt1.value = d.nome || d.razaoSocial || "";
      opt1.dataset.id = doc.id;
      if (datalistNova) datalistNova.appendChild(opt1);
      
      const opt2 = opt1.cloneNode(true);
      if (datalistFiltro) datalistFiltro.appendChild(opt2);
    });
  } catch (e) { console.warn("Erro empresas:", e); }
}

async function carregarRamos() {
  try {
    const snap = await db.collection("ramos-seguro").get();
    RAMOS = [];
    
    snap.forEach(doc => {
      const d = doc.data();
      // Usar nomeExibicao se existir, senão usar campo ou doc.id
      const nomeExibicao = d.nomeExibicao || d.nome || d.campo || doc.id;
      RAMOS.push({
        id: doc.id,
        campo: d.campo || doc.id,
        nomeExibicao: nomeExibicao
      });
    });
    
    // Ordenar por nomeExibicao
    RAMOS.sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao));
    
    // Preencher selects
    const selNova = $("novaRamo");
    const selFiltro = $("filtroRamo");
    
    if (selNova) {
      selNova.innerHTML = '<option value="">Selecione o ramo</option>';
      RAMOS.forEach(r => selNova.innerHTML += `<option value="${r.nomeExibicao}">${r.nomeExibicao}</option>`);
    }
    if (selFiltro) {
      selFiltro.innerHTML = '<option value="">Todos</option>';
      RAMOS.forEach(r => selFiltro.innerHTML += `<option value="${r.nomeExibicao}">${r.nomeExibicao}</option>`);
    }
  } catch (e) { console.warn("Erro ramos:", e); }
}

// ==== Carregar Cotações ====
async function carregarCotacoes() {
  const col = db.collection("cotacoes-gerentes");
  let docs = [];
  
  if (CTX.isAdmin) {
    docs = (await col.orderBy("dataCriacao", "desc").limit(500).get()).docs;
  } else if (["gerente chefe", "assistente"].includes(CTX.perfil) && CTX.agenciaId) {
    docs = (await col.where("agenciaId", "==", CTX.agenciaId).orderBy("dataCriacao", "desc").limit(300).get()).docs;
  } else {
    // RM - busca por vários campos de posse
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
  
  COTACOES = docs.map(doc => {
    const d = doc.data();
    const temp = calcularTemperatura({ ...d, id: doc.id });
    
    // O gerente é o vinculado à cotação (que veio da empresa)
    // Se não tem rmNome, tenta buscar pelo rmUid
    let rmNome = d.rmNome || '';
    const rmUid = d.rmUid || d.rmId || '';
    
    if (!rmNome && rmUid && RMS[rmUid]) {
      rmNome = RMS[rmUid].nome;
    }
    
    // Se ainda não tem, tenta buscar da empresa vinculada
    if (!rmNome && d.empresaId && EMPRESAS[d.empresaId]) {
      const emp = EMPRESAS[d.empresaId];
      rmNome = emp.rmNome || emp.gerenteNome || '';
      if (!rmNome) {
        const empRmId = emp.rmUid || emp.rmId || emp.gerenteId;
        if (empRmId && RMS[empRmId]) {
          rmNome = RMS[empRmId].nome;
        }
      }
    }
    
    return {
      id: doc.id,
      ...d,
      _empresaNome: d.empresaNome || "Empresa",
      _agenciaId: d.agenciaId || "",
      _agenciaNome: AGENCIAS[d.agenciaId] || d.agenciaId || "-",
      _rmNome: rmNome || "-",
      _rmUid: rmUid,
      _ramo: d.ramo || "Não informado",
      _status: d.status || "Sem status",
      _statusCat: categoriaStatus(d.status),
      _valor: parseValor(d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0),
      _dataCriacao: toDate(d.dataCriacao),
      _dataAtualizacao: toDate(d.dataAtualizacao || d.dataHora),
      _temperatura: temp,
      _interacoes: (d.interacoes || []).length
    };
  });
  
  // Ordenar por data de atualização (mais recentes primeiro)
  COTACOES.sort((a, b) => {
    const da = a._dataAtualizacao || a._dataCriacao || new Date(0);
    const db = b._dataAtualizacao || b._dataCriacao || new Date(0);
    return db - da;
  });
  
  COTACOES_FILTRADAS = [...COTACOES];
  
  // Popular filtro de status
  const statusUnicos = [...new Set(COTACOES.map(c => c._status))].filter(Boolean).sort();
  const selStatus = $("filtroStatus");
  if (selStatus) {
    selStatus.innerHTML = '<option value="">Todos</option>';
    statusUnicos.forEach(s => selStatus.innerHTML += `<option value="${s}">${s}</option>`);
  }
}

// ==== Renderização ====
function renderizarTudo() {
  renderizarStats();
  renderizarLista();
  renderizarKanban();
  atualizarSelectionBar();
}

function renderizarStats() {
  const total = COTACOES.length;
  const pendentes = COTACOES.filter(c => c._statusCat === 'pendente').length;
  const emitidos = COTACOES.filter(c => c._statusCat === 'emitido').length;
  const recusados = COTACOES.filter(c => c._statusCat === 'recusado').length;
  const quentes = COTACOES.filter(c => c._temperatura === 'quente').length;
  const valorTotal = COTACOES.filter(c => c._statusCat === 'emitido').reduce((s, c) => s + c._valor, 0);
  
  $("statTodas").textContent = fmtNum(total);
  $("statPendentes").textContent = fmtNum(pendentes);
  $("statEmitidos").textContent = fmtNum(emitidos);
  $("statRecusados").textContent = fmtNum(recusados);
  $("statQuentes").textContent = fmtNum(quentes);
  $("statValor").textContent = fmtBRLShort(valorTotal);
}

function renderizarLista() {
  const container = $("listaCotacoes");
  if (!container) return;
  
  if (COTACOES_FILTRADAS.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">Nenhuma cotação encontrada</div>
        <p>Tente ajustar os filtros ou criar uma nova cotação</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = COTACOES_FILTRADAS.map(c => {
    const isSelected = SELECIONADAS.has(c.id);
    const tempoStr = tempoRelativo(c._dataAtualizacao || c._dataCriacao);
    const isUrgente = c._temperatura === 'quente' || (c._dataAtualizacao && (new Date() - c._dataAtualizacao) > 7 * 86400000);
    
    return `
      <div class="cotacao-card ${isSelected ? 'selected' : ''}" data-id="${c.id}">
        <div class="cotacao-header">
          <div class="cotacao-empresa">
            <div class="cotacao-check ${isSelected ? 'checked' : ''}" onclick="event.stopPropagation(); toggleSelecao('${c.id}')"></div>
            <span>${c._empresaNome}</span>
          </div>
          <div class="cotacao-meta">
            <span class="heat-badge ${classeTemperatura(c._temperatura)}">${labelTemperatura(c._temperatura)}</span>
            <span class="status-badge ${classeStatus(c._status)}">${c._status}</span>
          </div>
        </div>
        <div class="cotacao-body">
          <div class="cotacao-info">
            <div class="cotacao-info-item">
              <span class="cotacao-info-label">Ramo</span>
              <span class="cotacao-info-value">${c._ramo}</span>
            </div>
            <div class="cotacao-info-item">
              <span class="cotacao-info-label">Valor</span>
              <span class="cotacao-info-value">${fmtBRL(c._valor)}</span>
            </div>
            <div class="cotacao-info-item">
              <span class="cotacao-info-label">Gerente</span>
              <span class="cotacao-info-value">${c._rmNome}</span>
            </div>
            <div class="cotacao-info-item">
              <span class="cotacao-info-label">Agência</span>
              <span class="cotacao-info-value">${c._agenciaNome}</span>
            </div>
          </div>
          <div class="cotacao-actions">
            <span class="time-badge ${isUrgente ? 'urgent' : ''}">🕐 ${tempoStr}</span>
            ${c._interacoes > 0 ? `<span class="time-badge">💬 ${c._interacoes}</span>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); abrirModalEdicao('${c.id}')" title="Editar">✏️</button>
            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); abrirCotacao('${c.id}')">Abrir →</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Click no card abre cotação
  container.querySelectorAll('.cotacao-card').forEach(card => {
    card.addEventListener('click', e => {
      if (!e.target.closest('.cotacao-check') && !e.target.closest('button')) {
        abrirCotacao(card.dataset.id);
      }
    });
  });
}

function renderizarKanban() {
  const container = $("kanbanContainer");
  if (!container) return;
  
  container.innerHTML = KANBAN_COLUMNS.map(col => {
    const cotacoesCol = COTACOES_FILTRADAS.filter(c => c._statusCat === col.id);
    
    return `
      <div class="kanban-column">
        <div class="kanban-column-header" style="border-color: ${col.color}; background: ${col.color}10;">
          <span>${col.icon} ${col.label}</span>
          <span class="count">${cotacoesCol.length}</span>
        </div>
        <div class="kanban-column-body">
          ${cotacoesCol.map(c => `
            <div class="kanban-card" onclick="abrirCotacao('${c.id}')">
              <div class="kanban-card-title">${c._empresaNome}</div>
              <div class="kanban-card-info">${c._ramo}</div>
              <div class="kanban-card-info">👤 ${c._rmNome}</div>
              <div class="kanban-card-footer">
                <span class="kanban-card-value">${fmtBRL(c._valor)}</span>
                <span class="heat-badge ${classeTemperatura(c._temperatura)}" style="font-size: 10px; padding: 2px 8px;">${labelTemperatura(c._temperatura)}</span>
              </div>
            </div>
          `).join('') || '<div style="text-align: center; color: #94a3b8; padding: 20px; font-size: 13px;">Nenhuma cotação</div>'}
        </div>
      </div>
    `;
  }).join('');
}

// ==== Seleção ====
function toggleSelecao(id) {
  if (SELECIONADAS.has(id)) {
    SELECIONADAS.delete(id);
  } else {
    SELECIONADAS.add(id);
  }
  renderizarLista();
  atualizarSelectionBar();
}

function limparSelecao() {
  SELECIONADAS.clear();
  renderizarLista();
  atualizarSelectionBar();
}

function atualizarSelectionBar() {
  const bar = $("selectionBar");
  const count = $("selCount");
  if (bar && count) {
    count.textContent = SELECIONADAS.size;
    bar.classList.toggle('active', SELECIONADAS.size > 0);
  }
}

// ==== Filtros ====
function toggleFiltros() {
  const content = $("filtrosContent");
  const arrow = $("filtrosArrow");
  if (content) content.classList.toggle('open');
  if (arrow) arrow.textContent = content?.classList.contains('open') ? '▲' : '▼';
}

function aplicarFiltros() {
  const empresa = normalizar($("filtroEmpresa")?.value || "");
  const status = $("filtroStatus")?.value || "";
  const ramo = $("filtroRamo")?.value || "";
  const temperatura = $("filtroTemperatura")?.value || "";
  const agencia = $("filtroAgencia")?.value || "";
  const rm = $("filtroRM")?.value || "";
  const dataInicio = $("filtroDataInicio")?.value ? new Date($("filtroDataInicio").value + "T00:00:00") : null;
  const dataFim = $("filtroDataFim")?.value ? new Date($("filtroDataFim").value + "T23:59:59") : null;
  
  // Normalizar ramo para comparação
  const ramoNorm = normalizar(ramo);
  
  COTACOES_FILTRADAS = COTACOES.filter(c => {
    if (empresa && !normalizar(c._empresaNome).includes(empresa)) return false;
    if (status && c._status !== status) return false;
    // Comparar ramo de forma flexível (normalizado)
    if (ramo && normalizar(c._ramo) !== ramoNorm) return false;
    if (temperatura && c._temperatura !== temperatura) return false;
    if (agencia && c._agenciaId !== agencia) return false;
    if (rm && c._rmUid !== rm) return false;
    if (dataInicio && c._dataCriacao < dataInicio) return false;
    if (dataFim && c._dataCriacao > dataFim) return false;
    return true;
  });
  
  // Contar filtros ativos
  let count = 0;
  if (empresa) count++;
  if (status) count++;
  if (ramo) count++;
  if (temperatura) count++;
  if (agencia) count++;
  if (rm) count++;
  if (dataInicio || dataFim) count++;
  
  const badge = $("filtrosCount");
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline' : 'none';
  }
  
  renderizarLista();
  renderizarKanban();
}

function limparFiltros() {
  $("filtroEmpresa").value = "";
  $("filtroStatus").value = "";
  $("filtroRamo").value = "";
  $("filtroTemperatura").value = "";
  if (!CTX.isAdmin) {
    // Mantém agência se não for admin
  } else {
    $("filtroAgencia").value = "";
  }
  $("filtroRM").value = "";
  $("filtroDataInicio").value = "";
  $("filtroDataFim").value = "";
  
  COTACOES_FILTRADAS = [...COTACOES];
  $("filtrosCount").style.display = 'none';
  
  // Reset quick filters
  document.querySelectorAll('.quick-filter').forEach(btn => btn.classList.remove('active'));
  document.querySelector('.quick-filter[data-filter="todas"]')?.classList.add('active');
  
  // Reset stat cards
  document.querySelectorAll('.stat-card').forEach(card => card.classList.remove('active'));
  
  renderizarLista();
  renderizarKanban();
}

function filtrarPorStatus(categoria) {
  document.querySelectorAll('.stat-card').forEach(card => {
    card.classList.toggle('active', card.dataset.filter === (categoria || 'todas'));
  });
  
  if (!categoria) {
    COTACOES_FILTRADAS = [...COTACOES];
  } else {
    COTACOES_FILTRADAS = COTACOES.filter(c => c._statusCat === categoria);
  }
  
  FILTRO_STATUS_ATUAL = categoria;
  renderizarLista();
  renderizarKanban();
}

function filtrarPorTemperatura(temp) {
  document.querySelectorAll('.stat-card').forEach(card => {
    card.classList.toggle('active', card.dataset.filter === temp);
  });
  
  COTACOES_FILTRADAS = COTACOES.filter(c => c._temperatura === temp);
  FILTRO_TEMP_ATUAL = temp;
  renderizarLista();
  renderizarKanban();
}

function quickFilter(tipo) {
  document.querySelectorAll('.quick-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === tipo);
  });
  
  const hoje = new Date();
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - hoje.getDay());
  inicioSemana.setHours(0, 0, 0, 0);
  
  switch (tipo) {
    case 'todas':
      COTACOES_FILTRADAS = [...COTACOES];
      break;
    case 'minhas':
      COTACOES_FILTRADAS = COTACOES.filter(c => c._rmUid === CTX.uid || c.criadoPorUid === CTX.uid);
      break;
    case 'urgentes':
      COTACOES_FILTRADAS = COTACOES.filter(c => {
        if (c._temperatura === 'quente') return true;
        const data = c._dataAtualizacao || c._dataCriacao;
        if (data && (hoje - data) > 7 * 86400000) return true;
        return false;
      });
      break;
    case 'semana':
      COTACOES_FILTRADAS = COTACOES.filter(c => {
        const data = c._dataCriacao;
        return data && data >= inicioSemana;
      });
      break;
    case 'quentes':
      COTACOES_FILTRADAS = COTACOES.filter(c => c._temperatura === 'quente');
      break;
  }
  
  renderizarLista();
  renderizarKanban();
}

// ==== Views ====
function setView(view) {
  VIEW_ATUAL = view;
  
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  
  $("listView").classList.toggle('hidden', view !== 'list');
  $("kanbanView").classList.toggle('active', view === 'kanban');
}

// ==== Nova Cotação ====
function toggleNovaCotacao() {
  const content = $("novaCotacaoContent");
  const arrow = $("novaCotacaoArrow");
  if (content) content.classList.toggle('open');
  if (arrow) arrow.textContent = content?.classList.contains('open') ? '▲' : '▼';
}

function resolverEmpresaNova() {
  const input = $("novaEmpresaNome");
  const info = $("novaEmpresaInfo");
  const hiddenId = $("novaEmpresaId");
  if (!input || !info) return;
  
  const nome = input.value.trim();
  const empresa = Object.entries(EMPRESAS).find(([id, e]) => 
    (e.nome || e.razaoSocial || "").toLowerCase() === nome.toLowerCase()
  );
  
  if (empresa) {
    const [empId, empData] = empresa;
    hiddenId.value = empId;
    
    // Buscar nome do gerente vinculado
    let gerenteNome = empData.rmNome || empData.gerenteNome || '';
    const gerenteId = empData.rmUid || empData.rmId || empData.gerenteId;
    
    if (!gerenteNome && gerenteId && RMS[gerenteId]) {
      gerenteNome = RMS[gerenteId].nome;
    }
    
    info.innerHTML = `
      <span>📄 CNPJ: ${empData.cnpj || '-'}</span>
      <span style="margin-left: 16px;">👤 Gerente: <strong>${gerenteNome || 'Não vinculado'}</strong></span>
    `;
  } else {
    hiddenId.value = "";
    info.innerHTML = "";
  }
}

async function criarNovaCotacao() {
  const empresaNome = $("novaEmpresaNome")?.value.trim();
  const empresaId = $("novaEmpresaId")?.value;
  const ramo = $("novaRamo")?.value;
  const valor = desformatarMoeda($("novaValor")?.value);
  const temperatura = $("novaTemperatura")?.value || 'morno';
  const observacoes = $("novaObservacoes")?.value.trim();
  
  if (!empresaNome) return alert("Informe o nome da empresa.");
  if (!ramo) return alert("Selecione o ramo do seguro.");
  
  try {
    const empresa = empresaId ? EMPRESAS[empresaId] : null;
    
    // IMPORTANTE: O gerente é sempre o vinculado à empresa, não quem está criando
    // Quem cria (admin) fica registrado em criadoPorUid/criadoPorNome
    // O gerente responsável vem da empresa
    let rmUid = empresa?.rmUid || empresa?.rmId || empresa?.gerenteId || "";
    let rmNome = empresa?.rmNome || empresa?.gerenteNome || "";
    
    // Se a empresa tem rmUid mas não tem nome, busca o nome
    if (rmUid && !rmNome && RMS[rmUid]) {
      rmNome = RMS[rmUid].nome;
    }
    
    // Se não for admin, usa o próprio usuário como RM
    if (!CTX.isAdmin && !rmUid) {
      rmUid = CTX.uid;
      rmNome = CTX.nome;
    }
    
    const novaCotacao = {
      empresaNome,
      empresaId: empresaId || null,
      empresaCNPJ: empresa?.cnpj || null,
      ramo,
      valorDesejado: valor,
      temperatura,
      status: "Pendente Agência",
      dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
      dataAtualizacao: firebase.firestore.FieldValue.serverTimestamp(),
      // Quem criou (pode ser admin)
      criadoPorUid: CTX.uid,
      criadoPorNome: CTX.nome,
      // Gerente responsável (vinculado à empresa)
      rmUid: rmUid,
      rmNome: rmNome,
      rmId: rmUid, // compatibilidade
      agenciaId: empresa?.agenciaId || CTX.agenciaId || "",
      interacoes: observacoes ? [{
        autorNome: CTX.nome, // Quem escreveu a obs (pode ser admin)
        autorUid: CTX.uid,
        mensagem: observacoes,
        dataHora: new Date(),
        tipo: "observacao"
      }] : []
    };
    
    await db.collection("cotacoes-gerentes").add(novaCotacao);
    alert("Cotação criada com sucesso!");
    
    // Limpar form
    $("novaEmpresaNome").value = "";
    $("novaEmpresaId").value = "";
    $("novaEmpresaInfo").innerHTML = "";
    $("novaRamo").value = "";
    $("novaValor").value = "";
    $("novaTemperatura").value = "morno";
    $("novaObservacoes").value = "";
    
    // Recarregar
    await carregarCotacoes();
    renderizarTudo();
    
  } catch (e) {
    console.error("Erro ao criar cotação:", e);
    alert("Erro ao criar cotação. Tente novamente.");
  }
}

// ==== Navegação ====
function abrirCotacao(id) {
  window.location.href = `chat-cotacao.html?id=${id}`;
}

// ==== PDF ====
function abrirModalPDF() {
  $("modalPDF").classList.add('active');
  renderizarPreviewPDF();
}

function fecharModalPDF() {
  $("modalPDF").classList.remove('active');
}

function renderizarPreviewPDF() {
  const container = $("pdfPreview");
  if (!container) return;
  
  // Usar selecionadas ou filtradas
  const dados = SELECIONADAS.size > 0 
    ? COTACOES_FILTRADAS.filter(c => SELECIONADAS.has(c.id))
    : COTACOES_FILTRADAS;
  
  const total = dados.length;
  const emitidos = dados.filter(c => c._statusCat === 'emitido').length;
  const valorTotal = dados.filter(c => c._statusCat === 'emitido').reduce((s, c) => s + c._valor, 0);
  const quentes = dados.filter(c => c._temperatura === 'quente').length;
  
  container.innerHTML = `
    <div class="pdf-header">
      <div class="pdf-logo">📊 Retorno Seguros</div>
      <div class="pdf-title">
        <h2>Relatório de Cotações</h2>
        <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
      </div>
    </div>
    
    <div class="pdf-kpis">
      <div class="pdf-kpi">
        <div class="pdf-kpi-value">${fmtNum(total)}</div>
        <div class="pdf-kpi-label">Total de Cotações</div>
      </div>
      <div class="pdf-kpi">
        <div class="pdf-kpi-value">${fmtNum(emitidos)}</div>
        <div class="pdf-kpi-label">Emitidos</div>
      </div>
      <div class="pdf-kpi">
        <div class="pdf-kpi-value">${fmtBRLShort(valorTotal)}</div>
        <div class="pdf-kpi-label">Valor Total</div>
      </div>
      <div class="pdf-kpi">
        <div class="pdf-kpi-value">${fmtNum(quentes)}</div>
        <div class="pdf-kpi-label">🔥 Quentes</div>
      </div>
    </div>
    
    <table class="pdf-table">
      <thead>
        <tr>
          <th>Empresa</th>
          <th>Ramo</th>
          <th>Valor</th>
          <th>Status</th>
          <th>Temperatura</th>
          <th>Gerente</th>
          <th>Agência</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        ${dados.slice(0, 50).map(c => `
          <tr>
            <td><strong>${c._empresaNome}</strong></td>
            <td>${c._ramo}</td>
            <td>${fmtBRL(c._valor)}</td>
            <td>${c._status}</td>
            <td>${labelTemperatura(c._temperatura)}</td>
            <td>${c._rmNome}</td>
            <td>${c._agenciaNome}</td>
            <td>${fmtData(c._dataCriacao)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${dados.length > 50 ? `<p style="text-align: center; margin-top: 16px; color: #64748b; font-size: 12px;">Exibindo 50 de ${dados.length} registros</p>` : ''}
    
    <div class="pdf-footer">
      <p>Retorno Seguros - Sistema de Gestão de Cotações</p>
      <p>Este relatório é confidencial e destinado apenas ao uso interno.</p>
    </div>
  `;
}

async function gerarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  const dados = SELECIONADAS.size > 0 
    ? COTACOES_FILTRADAS.filter(c => SELECIONADAS.has(c.id))
    : COTACOES_FILTRADAS;
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(79, 70, 229);
  doc.text('Retorno Seguros', 14, 15);
  
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text('Relatório de Cotações', 14, 24);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);
  
  // KPIs
  const total = dados.length;
  const emitidos = dados.filter(c => c._statusCat === 'emitido').length;
  const valorTotal = dados.filter(c => c._statusCat === 'emitido').reduce((s, c) => s + c._valor, 0);
  
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(`Total: ${total} | Emitidos: ${emitidos} | Valor: ${fmtBRL(valorTotal)}`, 14, 38);
  
  // Tabela
  doc.autoTable({
    startY: 44,
    head: [['Empresa', 'Ramo', 'Valor', 'Status', 'Temp.', 'Gerente', 'Agência', 'Data']],
    body: dados.map(c => [
      c._empresaNome,
      c._ramo,
      fmtBRL(c._valor),
      c._status,
      c._temperatura,
      c._rmNome,
      c._agenciaNome,
      fmtData(c._dataCriacao)
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 30 },
      2: { cellWidth: 28 },
      3: { cellWidth: 35 },
      4: { cellWidth: 18 },
      5: { cellWidth: 35 },
      6: { cellWidth: 35 },
      7: { cellWidth: 22 }
    }
  });
  
  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  }
  
  doc.save(`cotacoes-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function imprimirPDF() {
  window.print();
}

// ==== Excel ====
function exportarExcel() {
  const dados = COTACOES_FILTRADAS.map(c => ({
    'Empresa': c._empresaNome,
    'CNPJ': c.empresaCNPJ || '-',
    'Ramo': c._ramo,
    'Valor': c._valor,
    'Status': c._status,
    'Temperatura': c._temperatura,
    'Gerente': c._rmNome,
    'Agência': c._agenciaNome,
    'Data Criação': fmtData(c._dataCriacao),
    'Última Atualização': fmtData(c._dataAtualizacao),
    'Interações': c._interacoes
  }));
  
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cotações');
  XLSX.writeFile(wb, `cotacoes-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportarSelecionadas() {
  const dados = COTACOES_FILTRADAS.filter(c => SELECIONADAS.has(c.id)).map(c => ({
    'Empresa': c._empresaNome,
    'Ramo': c._ramo,
    'Valor': c._valor,
    'Status': c._status,
    'Temperatura': c._temperatura,
    'Gerente': c._rmNome,
    'Agência': c._agenciaNome,
    'Data': fmtData(c._dataCriacao)
  }));
  
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Selecionadas');
  XLSX.writeFile(wb, `cotacoes-selecionadas-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==== Relatório Modal ====
function abrirModalRelatorio() {
  $("modalRelatorio").classList.add('active');
  renderizarRelatorio();
}

function fecharModalRelatorio() {
  $("modalRelatorio").classList.remove('active');
}

function renderizarRelatorio() {
  const container = $("relatorioContent");
  if (!container) return;
  
  const dados = COTACOES_FILTRADAS;
  
  // KPIs
  const total = dados.length;
  const emitidos = dados.filter(c => c._statusCat === 'emitido');
  const pendentes = dados.filter(c => c._statusCat === 'pendente');
  const valorEmitido = emitidos.reduce((s, c) => s + c._valor, 0);
  const conversao = total > 0 ? (emitidos.length / total * 100).toFixed(1) : 0;
  
  // Por status
  const porStatus = {};
  dados.forEach(c => {
    porStatus[c._status] = (porStatus[c._status] || 0) + 1;
  });
  
  // Por temperatura
  const quentes = dados.filter(c => c._temperatura === 'quente').length;
  const mornos = dados.filter(c => c._temperatura === 'morno').length;
  const frios = dados.filter(c => c._temperatura === 'frio').length;
  
  // Por RM
  const porRM = {};
  dados.forEach(c => {
    if (!porRM[c._rmNome]) porRM[c._rmNome] = { total: 0, emitidos: 0, valor: 0 };
    porRM[c._rmNome].total++;
    if (c._statusCat === 'emitido') {
      porRM[c._rmNome].emitidos++;
      porRM[c._rmNome].valor += c._valor;
    }
  });
  
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
      <div style="background: #f8fafc; padding: 20px; border-radius: 12px; text-align: center;">
        <div style="font-size: 28px; font-weight: 800; color: #4f46e5;">${fmtNum(total)}</div>
        <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Total</div>
      </div>
      <div style="background: #dcfce7; padding: 20px; border-radius: 12px; text-align: center;">
        <div style="font-size: 28px; font-weight: 800; color: #166534;">${fmtNum(emitidos.length)}</div>
        <div style="font-size: 12px; color: #166534; text-transform: uppercase;">Emitidos</div>
      </div>
      <div style="background: #f0fdf4; padding: 20px; border-radius: 12px; text-align: center;">
        <div style="font-size: 28px; font-weight: 800; color: #166534;">${fmtBRLShort(valorEmitido)}</div>
        <div style="font-size: 12px; color: #166534; text-transform: uppercase;">Valor</div>
      </div>
      <div style="background: #fef3c7; padding: 20px; border-radius: 12px; text-align: center;">
        <div style="font-size: 28px; font-weight: 800; color: #b45309;">${conversao}%</div>
        <div style="font-size: 12px; color: #b45309; text-transform: uppercase;">Conversão</div>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
      <div style="background: #f8fafc; padding: 20px; border-radius: 12px;">
        <h4 style="margin: 0 0 16px; font-size: 14px; color: #1e293b;">🌡️ Mapa de Calor</h4>
        <div style="display: flex; gap: 12px;">
          <div style="flex: 1; text-align: center; padding: 12px; background: linear-gradient(135deg, #ef4444, #f97316); border-radius: 10px; color: white;">
            <div style="font-size: 24px; font-weight: 800;">🔥 ${quentes}</div>
            <div style="font-size: 11px;">Quentes</div>
          </div>
          <div style="flex: 1; text-align: center; padding: 12px; background: linear-gradient(135deg, #f59e0b, #fbbf24); border-radius: 10px; color: #78350f;">
            <div style="font-size: 24px; font-weight: 800;">🟡 ${mornos}</div>
            <div style="font-size: 11px;">Mornos</div>
          </div>
          <div style="flex: 1; text-align: center; padding: 12px; background: linear-gradient(135deg, #3b82f6, #60a5fa); border-radius: 10px; color: white;">
            <div style="font-size: 24px; font-weight: 800;">❄️ ${frios}</div>
            <div style="font-size: 11px;">Frios</div>
          </div>
        </div>
      </div>
      
      <div style="background: #f8fafc; padding: 20px; border-radius: 12px;">
        <h4 style="margin: 0 0 16px; font-size: 14px; color: #1e293b;">📊 Por Status</h4>
        <div style="max-height: 150px; overflow-y: auto;">
          ${Object.entries(porStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => `
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
              <span style="font-size: 13px;">${status}</span>
              <span style="font-weight: 700; font-size: 13px;">${count}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    
    <div style="background: #f8fafc; padding: 20px; border-radius: 12px;">
      <h4 style="margin: 0 0 16px; font-size: 14px; color: #1e293b;">👥 Ranking por Gerente</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #e2e8f0;">
            <th style="padding: 10px; text-align: left;">Gerente</th>
            <th style="padding: 10px; text-align: center;">Total</th>
            <th style="padding: 10px; text-align: center;">Emitidos</th>
            <th style="padding: 10px; text-align: right;">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(porRM).sort((a, b) => b[1].valor - a[1].valor).slice(0, 10).map(([rm, d]) => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px;">${rm}</td>
              <td style="padding: 10px; text-align: center;">${d.total}</td>
              <td style="padding: 10px; text-align: center;">${d.emitidos}</td>
              <td style="padding: 10px; text-align: right; font-weight: 700;">${fmtBRL(d.valor)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function exportarRelatorioPDF() {
  // Usa a mesma função do PDF principal
  gerarPDF();
}

// ==== Edição Rápida ====
let COTACAO_EDITANDO = null;

function abrirModalEdicao(id) {
  const cotacao = COTACOES.find(c => c.id === id);
  if (!cotacao) return;
  
  COTACAO_EDITANDO = cotacao;
  
  $("editCotacaoId").value = id;
  $("editEmpresaNome").textContent = cotacao._empresaNome;
  $("editValor").value = fmtBRL(cotacao._valor);
  $("editTemperatura").value = cotacao._temperatura || 'morno';
  $("editObservacao").value = "";
  
  // Atualizar botões de temperatura
  setEditTemp(cotacao._temperatura || 'morno');
  
  $("modalEdicao").classList.add('active');
}

function fecharModalEdicao() {
  $("modalEdicao").classList.remove('active');
  COTACAO_EDITANDO = null;
}

function setEditTemp(temp) {
  $("editTemperatura").value = temp;
  
  // Atualizar visual dos botões
  document.querySelectorAll('.edit-temp-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.temp === temp);
  });
}

async function salvarEdicaoCotacao() {
  const id = $("editCotacaoId").value;
  const novoValor = desformatarMoeda($("editValor").value);
  const novaTemp = $("editTemperatura").value;
  const observacao = $("editObservacao").value.trim();
  
  if (!id || !COTACAO_EDITANDO) {
    alert("Erro: cotação não encontrada.");
    return;
  }
  
  if (!novoValor || novoValor <= 0) {
    alert("Informe um valor válido.");
    return;
  }
  
  try {
    const valorAntigo = COTACAO_EDITANDO._valor;
    const tempAntiga = COTACAO_EDITANDO._temperatura;
    
    // Montar mensagem de alteração
    let msgs = [];
    if (novoValor !== valorAntigo) {
      msgs.push(`Valor: ${fmtBRL(valorAntigo)} → ${fmtBRL(novoValor)}`);
    }
    if (novaTemp !== tempAntiga) {
      msgs.push(`Temperatura: ${labelTemperatura(tempAntiga)} → ${labelTemperatura(novaTemp)}`);
    }
    if (observacao) {
      msgs.push(`Obs: ${observacao}`);
    }
    
    const interacao = {
      autorNome: CTX.nome,
      autorUid: CTX.uid,
      mensagem: `✏️ Cotação editada. ${msgs.join('. ')}`,
      dataHora: new Date(),
      tipo: "sistema"
    };
    
    const ref = db.collection("cotacoes-gerentes").doc(id);
    await ref.update({
      valorDesejado: novoValor,
      valorFinal: novoValor,
      temperatura: novaTemp,
      dataAtualizacao: firebase.firestore.FieldValue.serverTimestamp(),
      interacoes: firebase.firestore.FieldValue.arrayUnion(interacao)
    });
    
    alert("Cotação atualizada com sucesso!");
    fecharModalEdicao();
    
    // Recarregar dados
    await carregarCotacoes();
    renderizarTudo();
    
  } catch (e) {
    console.error("Erro ao salvar edição:", e);
    alert("Erro ao salvar alterações.");
  }
}

// ==== Globals ====
window.setView = setView;
window.toggleFiltros = toggleFiltros;
window.aplicarFiltros = aplicarFiltros;
window.limparFiltros = limparFiltros;
window.filtrarPorStatus = filtrarPorStatus;
window.filtrarPorTemperatura = filtrarPorTemperatura;
window.quickFilter = quickFilter;
window.toggleNovaCotacao = toggleNovaCotacao;
window.resolverEmpresaNova = resolverEmpresaNova;
window.criarNovaCotacao = criarNovaCotacao;
window.toggleSelecao = toggleSelecao;
window.limparSelecao = limparSelecao;
window.abrirCotacao = abrirCotacao;
window.abrirModalPDF = abrirModalPDF;
window.fecharModalPDF = fecharModalPDF;
window.gerarPDF = gerarPDF;
window.imprimirPDF = imprimirPDF;
window.exportarExcel = exportarExcel;
window.exportarSelecionadas = exportarSelecionadas;
window.abrirModalRelatorio = abrirModalRelatorio;
window.fecharModalRelatorio = fecharModalRelatorio;
window.exportarRelatorioPDF = exportarRelatorioPDF;
window.formatarMoeda = formatarMoeda;
window.abrirModalEdicao = abrirModalEdicao;
window.fecharModalEdicao = fecharModalEdicao;
window.setEditTemp = setEditTemp;
window.salvarEdicaoCotacao = salvarEdicaoCotacao;
