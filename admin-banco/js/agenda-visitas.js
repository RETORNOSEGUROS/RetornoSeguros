// agenda-visitas.js — Agenda de Visitas Modernizada
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

let VISITAS = [];
let VISITAS_FILTRADAS = [];
let EMPRESAS = {};
let AGENCIAS = {};
let RMS = {};

let LIMITE = 30;
let PAGINA_ATUAL = 1;
let CALENDARIO_MES = new Date().getMonth();
let CALENDARIO_ANO = new Date().getFullYear();
let DATA_SELECIONADA = null;
let VISITA_EXCLUIR_ID = null;

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
const fmtHora = d => d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "-";
const fmtDataHora = d => d ? d.toLocaleString("pt-BR") : "-";

// Datas helpers
function getHoje() {
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  return h;
}

function getAmanha() {
  const a = getHoje();
  a.setDate(a.getDate() + 1);
  return a;
}

function getInicioSemana() {
  const d = getHoje();
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function getFimSemana() {
  const d = getInicioSemana();
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getInicioMes() {
  const d = getHoje();
  d.setDate(1);
  return d;
}

function getFimMes() {
  const d = getHoje();
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isMesmoDia(d1, d2) {
  if (!d1 || !d2) return false;
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

function getDiaSemana(d) {
  const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  return dias[d.getDay()];
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
    carregarEmpresas()
  ]);
  
  await carregarVisitas();
  renderizarTudo();
  renderizarCalendario();
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
      if (!CTX.isAdmin && !["gerente chefe", "assistente"].includes(CTX.perfil)) {
        // RM só vê sua agência
        if (CTX.agenciaId) {
          selAgencia.innerHTML = `<option value="${CTX.agenciaId}">${AGENCIAS[CTX.agenciaId] || CTX.agenciaId}</option>`;
        }
        selAgencia.disabled = true;
      } else if (!CTX.isAdmin && CTX.agenciaId) {
        // Gerente Chefe/Assistente vê só sua agência
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
        RMS[doc.id] = { nome: d.nome, agenciaId: d.agenciaId, perfil: d.perfil };
      }
    });
    
    const selRM = $("filtroRM");
    if (selRM) {
      // CORREÇÃO: Filtrar RMs por permissão
      if (!CTX.isAdmin && !["gerente chefe", "assistente"].includes(CTX.perfil)) {
        // RM vê apenas ele mesmo no dropdown
        selRM.innerHTML = `<option value="${CTX.uid}" selected>${CTX.nome}</option>`;
        selRM.disabled = true;
      } else {
        selRM.innerHTML = '<option value="">Todos</option>';
        // Admin vê todos, GC/Assistente vê apenas da sua agência
        Object.entries(RMS)
          .filter(([id, rm]) => CTX.isAdmin || rm.agenciaId === CTX.agenciaId)
          .sort((a, b) => a[1].nome.localeCompare(b[1].nome))
          .forEach(([id, rm]) => {
            selRM.innerHTML += `<option value="${id}">${rm.nome}</option>`;
          });
      }
    }
  } catch (e) { console.warn("Erro RMs:", e); }
}

async function carregarEmpresas() {
  try {
    let query = db.collection("empresas");
    
    // CORREÇÃO: Filtrar empresas por permissão
    // RM vê apenas empresas vinculadas a ele
    // GC/Assistente vê empresas da agência
    // Admin vê todas
    if (!CTX.isAdmin) {
      if (["gerente chefe", "assistente"].includes(CTX.perfil)) {
        if (CTX.agenciaId) {
          query = query.where("agenciaId", "==", CTX.agenciaId);
        }
      } else {
        // RM: buscar por vários campos de vínculo
        // Como Firestore não suporta OR nativo, carregamos da agência e filtramos
        if (CTX.agenciaId) {
          query = query.where("agenciaId", "==", CTX.agenciaId);
        }
      }
    }
    
    const snap = await query.get();
    const datalist = $("empresasDatalist");
    
    snap.forEach(doc => {
      const d = doc.data();
      
      // Para RM: filtro adicional no client (só empresas dele)
      if (!CTX.isAdmin && !["gerente chefe", "assistente"].includes(CTX.perfil)) {
        const rmUid = d.rmUid || d.rmId || d.gerenteId || "";
        if (rmUid !== CTX.uid) return; // Pula empresas de outros RMs
      }
      
      EMPRESAS[doc.id] = d;
      
      if (datalist) {
        const opt = document.createElement("option");
        opt.value = d.nome || d.razaoSocial || "";
        opt.dataset.id = doc.id;
        datalist.appendChild(opt);
      }
    });
  } catch (e) { console.warn("Erro empresas:", e); }
}

// ==== Carregar Visitas ====
async function carregarVisitas() {
  const col = db.collection("agenda_visitas");
  let docs = [];
  
  if (CTX.isAdmin || ["gerente chefe", "assistente"].includes(CTX.perfil)) {
    // Admin e Gerente Chefe veem todas (ou da agência)
    let query = col.orderBy("dataHoraTs", "desc");
    
    if (!CTX.isAdmin && CTX.agenciaId) {
      query = col.where("agenciaId", "==", CTX.agenciaId).orderBy("dataHoraTs", "desc");
    }
    
    docs = (await query.limit(500).get()).docs;
  } else {
    // RM vê só suas visitas
    const queries = [
      col.where("rmUid", "==", CTX.uid).get(),
      col.where("usuarioId", "==", CTX.uid).get(),
      col.where("criadoPorUid", "==", CTX.uid).get()
    ];
    const results = await Promise.allSettled(queries);
    const map = new Map();
    results.forEach(r => {
      if (r.status === "fulfilled") r.value.forEach(doc => map.set(doc.id, doc));
    });
    docs = Array.from(map.values());
  }
  
  const hoje = getHoje();
  
  VISITAS = docs.map(doc => {
    const d = doc.data();
    const dataHora = toDate(d.dataHoraTs || d.dataHora || d.data);
    const dataVisita = dataHora ? new Date(dataHora) : null;
    if (dataVisita) dataVisita.setHours(0, 0, 0, 0);
    
    // Detectar status
    let status = d.status || "Agendada";
    
    // Auto-detectar atrasada (passada e não realizada)
    const isAtrasada = dataVisita && dataVisita < hoje && status === "Agendada";
    
    return {
      id: doc.id,
      ...d,
      _dataHora: dataHora,
      _data: dataVisita,
      _empresaNome: d.empresaNome || d.empresa || "Empresa",
      _cidade: d.cidade || d.empresaCidade || "-",
      _rmNome: d.rmNome || RMS[d.rmUid]?.nome || RMS[d.usuarioId]?.nome || "-",
      _rmUid: d.rmUid || d.usuarioId || "",
      _agenciaId: d.agenciaId || "",
      _tipo: d.tipo || d.modalidade || "Presencial",
      _status: status,
      _isAtrasada: isAtrasada,
      _observacoes: d.observacoes || d.obs || "",
      _notasPosVisita: d.notasPosVisita || ""
    };
  });
  
  // Ordenar por data (próximas primeiro)
  VISITAS.sort((a, b) => {
    const da = a._dataHora || new Date(0);
    const db = b._dataHora || new Date(0);
    return da - db;
  });
  
  VISITAS_FILTRADAS = [...VISITAS];
}

// ==== Renderização ====
function renderizarTudo() {
  renderizarStats();
  renderizarLista();
  renderizarResumo();
}

function renderizarStats() {
  const hoje = getHoje();
  const amanha = getAmanha();
  const fimSemana = getFimSemana();
  const fimMes = getFimMes();
  
  const visitasHoje = VISITAS.filter(v => isMesmoDia(v._data, hoje)).length;
  const visitasSemana = VISITAS.filter(v => v._data && v._data >= hoje && v._data <= fimSemana).length;
  const visitasMes = VISITAS.filter(v => v._data && v._data >= hoje && v._data <= fimMes).length;
  const visitasRealizadas = VISITAS.filter(v => v._status === "Realizada").length;
  
  const total = VISITAS.length;
  const taxa = total > 0 ? Math.round((visitasRealizadas / total) * 100) : 0;
  
  $("statHoje").textContent = visitasHoje;
  $("statSemana").textContent = visitasSemana;
  $("statMes").textContent = visitasMes;
  $("statRealizadas").textContent = visitasRealizadas;
  $("statTaxa").textContent = taxa + "%";
}

function renderizarLista() {
  const container = $("listaVisitas");
  if (!container) return;
  
  if (VISITAS_FILTRADAS.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <div class="empty-state-title">Nenhuma visita encontrada</div>
        <p>Clique em "+ Nova Visita" para agendar</p>
      </div>
    `;
    $("btnCarregarMais").style.display = "none";
    return;
  }
  
  // Agrupar por dia
  const grupos = {};
  const hoje = getHoje();
  const amanha = getAmanha();
  
  VISITAS_FILTRADAS.slice(0, LIMITE * PAGINA_ATUAL).forEach(v => {
    if (!v._data) return;
    
    const key = v._data.toISOString().split("T")[0];
    if (!grupos[key]) {
      grupos[key] = {
        data: v._data,
        visitas: []
      };
    }
    grupos[key].visitas.push(v);
  });
  
  // Ordenar grupos por data
  const gruposOrdenados = Object.values(grupos).sort((a, b) => a.data - b.data);
  
  let html = "";
  
  gruposOrdenados.forEach(grupo => {
    const isHoje = isMesmoDia(grupo.data, hoje);
    const isAmanha = isMesmoDia(grupo.data, amanha);
    const isPassado = grupo.data < hoje;
    
    let badgeClass = "future";
    let badgeText = `${getDiaSemana(grupo.data)}, ${fmtData(grupo.data)}`;
    
    if (isHoje) {
      badgeClass = "today";
      badgeText = "🔴 HOJE";
    } else if (isAmanha) {
      badgeClass = "tomorrow";
      badgeText = "🟡 AMANHÃ";
    } else if (isPassado) {
      badgeClass = "past";
      badgeText = `⏪ ${fmtData(grupo.data)}`;
    }
    
    html += `
      <div class="day-group">
        <div class="day-header">
          <span class="day-badge ${badgeClass}">${badgeText}</span>
          <span class="day-count">${grupo.visitas.length} visita${grupo.visitas.length > 1 ? 's' : ''}</span>
        </div>
    `;
    
    grupo.visitas.forEach(v => {
      html += renderizarVisitaCard(v);
    });
    
    html += `</div>`;
  });
  
  container.innerHTML = html;
  
  // Mostrar/esconder botão carregar mais
  $("btnCarregarMais").style.display = 
    VISITAS_FILTRADAS.length > LIMITE * PAGINA_ATUAL ? "inline-flex" : "none";
}

function renderizarVisitaCard(v) {
  const tipoClass = v._tipo === "Online" ? "badge-online" : "badge-presencial";
  const tipoIcon = v._tipo === "Online" ? "🔵" : "🟢";
  
  let statusClass = "badge-agendada";
  let statusIcon = "⏳";
  switch (v._status) {
    case "Realizada": statusClass = "badge-realizada"; statusIcon = "✅"; break;
    case "Cancelada": statusClass = "badge-cancelada"; statusIcon = "❌"; break;
    case "Reagendada": statusClass = "badge-reagendada"; statusIcon = "🔄"; break;
  }
  
  let cardClass = "visit-card";
  if (v._status === "Realizada") cardClass += " realizada";
  if (v._status === "Cancelada") cardClass += " cancelada";
  if (v._isAtrasada) cardClass += " atrasada";
  
  return `
    <div class="${cardClass}" data-id="${v.id}">
      <div class="visit-header">
        <div class="visit-empresa">${v._empresaNome}</div>
        <div class="visit-hora">${fmtHora(v._dataHora)}</div>
      </div>
      <div class="visit-info">
        <div class="visit-info-item">
          <span>📍</span>
          <span>${v._cidade}</span>
        </div>
        <div class="visit-info-item">
          <span>👤</span>
          <strong>${v._rmNome}</strong>
        </div>
      </div>
      ${v._observacoes ? `<div class="visit-obs">💬 ${v._observacoes}</div>` : ''}
      ${v._notasPosVisita ? `<div class="visit-obs" style="background: #dcfce7;">📝 ${v._notasPosVisita}</div>` : ''}
      <div class="visit-footer">
        <div class="visit-badges">
          <span class="badge ${tipoClass}">${tipoIcon} ${v._tipo}</span>
          <span class="badge ${statusClass}">${statusIcon} ${v._status}</span>
          ${v._isAtrasada ? '<span class="badge" style="background: #fee2e2; color: #dc2626;">⚠️ Atrasada</span>' : ''}
        </div>
        <div class="visit-actions">
          ${v._status === "Agendada" ? `<button class="btn btn-sm btn-success" onclick="marcarRealizada('${v.id}')" title="Marcar como realizada">✅</button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="editarVisita('${v.id}')" title="Editar">✏️</button>
          <button class="btn btn-sm btn-secondary" onclick="duplicarVisita('${v.id}')" title="Duplicar">📋</button>
          <button class="btn btn-sm btn-secondary" onclick="confirmarExcluir('${v.id}')" title="Excluir" style="color: var(--danger);">🗑️</button>
        </div>
      </div>
    </div>
  `;
}

function renderizarResumo() {
  const presenciais = VISITAS_FILTRADAS.filter(v => v._tipo === "Presencial").length;
  const online = VISITAS_FILTRADAS.filter(v => v._tipo === "Online").length;
  const total = VISITAS_FILTRADAS.length;
  
  $("resumoPresenciais").textContent = presenciais;
  $("resumoOnline").textContent = online;
  $("resumoTotal").textContent = total;
}

// ==== Calendário ====
function renderizarCalendario() {
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", 
                 "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  
  $("calendarTitle").textContent = `${meses[CALENDARIO_MES]} ${CALENDARIO_ANO}`;
  
  const container = $("calendarDays");
  const primeiroDia = new Date(CALENDARIO_ANO, CALENDARIO_MES, 1);
  const ultimoDia = new Date(CALENDARIO_ANO, CALENDARIO_MES + 1, 0);
  const diasNoMes = ultimoDia.getDate();
  const primeiroDiaSemana = primeiroDia.getDay();
  
  const hoje = getHoje();
  
  // Dias com visitas
  const diasComVisitas = new Set();
  VISITAS.forEach(v => {
    if (v._data && v._data.getMonth() === CALENDARIO_MES && v._data.getFullYear() === CALENDARIO_ANO) {
      diasComVisitas.add(v._data.getDate());
    }
  });
  
  let html = "";
  
  // Dias do mês anterior
  const diasMesAnterior = new Date(CALENDARIO_ANO, CALENDARIO_MES, 0).getDate();
  for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
    html += `<div class="calendar-day other-month">${diasMesAnterior - i}</div>`;
  }
  
  // Dias do mês atual
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const dataAtual = new Date(CALENDARIO_ANO, CALENDARIO_MES, dia);
    const isHoje = isMesmoDia(dataAtual, hoje);
    const isSelecionado = DATA_SELECIONADA && isMesmoDia(dataAtual, DATA_SELECIONADA);
    const temVisitas = diasComVisitas.has(dia);
    
    let classes = "calendar-day";
    if (isHoje) classes += " today";
    if (isSelecionado) classes += " selected";
    if (temVisitas) classes += " has-visits";
    
    html += `<div class="${classes}" onclick="selecionarDia(${dia})">${dia}</div>`;
  }
  
  // Dias do próximo mês
  const totalCells = primeiroDiaSemana + diasNoMes;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remaining; i++) {
    html += `<div class="calendar-day other-month">${i}</div>`;
  }
  
  container.innerHTML = html;
}

function navegarCalendario(delta) {
  CALENDARIO_MES += delta;
  if (CALENDARIO_MES > 11) {
    CALENDARIO_MES = 0;
    CALENDARIO_ANO++;
  } else if (CALENDARIO_MES < 0) {
    CALENDARIO_MES = 11;
    CALENDARIO_ANO--;
  }
  renderizarCalendario();
}

function selecionarDia(dia) {
  DATA_SELECIONADA = new Date(CALENDARIO_ANO, CALENDARIO_MES, dia);
  
  // Filtrar visitas do dia
  VISITAS_FILTRADAS = VISITAS.filter(v => isMesmoDia(v._data, DATA_SELECIONADA));
  
  renderizarCalendario();
  renderizarLista();
  renderizarResumo();
  
  // Atualizar quick filters
  document.querySelectorAll('.quick-filter').forEach(btn => btn.classList.remove('active'));
}

// ==== Filtros ====
function toggleFiltros() {
  const content = $("filtrosContent");
  const arrow = $("filtrosArrow");
  if (content) content.classList.toggle('open');
  if (arrow) arrow.textContent = content?.classList.contains('open') ? '▲' : '▼';
}

function quickFilter(tipo) {
  document.querySelectorAll('.quick-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === tipo);
  });
  
  DATA_SELECIONADA = null;
  const hoje = getHoje();
  const fimSemana = getFimSemana();
  
  switch (tipo) {
    case 'todas':
      VISITAS_FILTRADAS = [...VISITAS];
      break;
    case 'hoje':
      VISITAS_FILTRADAS = VISITAS.filter(v => isMesmoDia(v._data, hoje));
      break;
    case 'semana':
      VISITAS_FILTRADAS = VISITAS.filter(v => v._data && v._data >= hoje && v._data <= fimSemana);
      break;
    case 'pendentes':
      VISITAS_FILTRADAS = VISITAS.filter(v => v._status === "Agendada");
      break;
    case 'atrasadas':
      VISITAS_FILTRADAS = VISITAS.filter(v => v._isAtrasada);
      break;
  }
  
  renderizarLista();
  renderizarResumo();
  renderizarCalendario();
}

function filtrarPor(tipo) {
  quickFilter(tipo === 'realizadas' ? 'todas' : tipo);
  
  if (tipo === 'realizadas') {
    VISITAS_FILTRADAS = VISITAS.filter(v => v._status === "Realizada");
    renderizarLista();
    renderizarResumo();
  }
}

function aplicarFiltros() {
  const agencia = $("filtroAgencia")?.value || "";
  const rm = $("filtroRM")?.value || "";
  const tipo = $("filtroTipo")?.value || "";
  const status = $("filtroStatus")?.value || "";
  const empresa = normalizar($("filtroEmpresa")?.value || "");
  const de = $("filtroDe")?.value ? new Date($("filtroDe").value + "T00:00:00") : null;
  const ate = $("filtroAte")?.value ? new Date($("filtroAte").value + "T23:59:59") : null;
  
  DATA_SELECIONADA = null;
  
  VISITAS_FILTRADAS = VISITAS.filter(v => {
    if (agencia && v._agenciaId !== agencia) return false;
    if (rm && v._rmUid !== rm) return false;
    if (tipo && v._tipo !== tipo) return false;
    if (status && v._status !== status) return false;
    if (empresa && !normalizar(v._empresaNome).includes(empresa)) return false;
    if (de && v._data < de) return false;
    if (ate && v._data > ate) return false;
    return true;
  });
  
  document.querySelectorAll('.quick-filter').forEach(btn => btn.classList.remove('active'));
  
  renderizarLista();
  renderizarResumo();
  renderizarCalendario();
}

function limparFiltros() {
  $("filtroAgencia").value = "";
  $("filtroRM").value = "";
  $("filtroTipo").value = "";
  $("filtroStatus").value = "";
  $("filtroEmpresa").value = "";
  $("filtroDe").value = "";
  $("filtroAte").value = "";
  
  DATA_SELECIONADA = null;
  VISITAS_FILTRADAS = [...VISITAS];
  
  document.querySelectorAll('.quick-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'todas');
  });
  
  renderizarLista();
  renderizarResumo();
  renderizarCalendario();
}

// ==== Views ====
function setView(view) {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  
  // Por enquanto só lista, calendário pode ser expandido depois
  if (view === 'calendar') {
    // Scroll para o calendário no mobile
    document.querySelector('.sidebar')?.scrollIntoView({ behavior: 'smooth' });
  }
}

// ==== Modal Nova/Editar ====
function abrirModalNova() {
  $("visitaId").value = "";
  $("modalTitulo").textContent = "📅 Nova Visita";
  $("empresaInput").value = "";
  $("empresaHiddenId").value = "";
  $("empresaInfo").style.display = "none";
  
  // Data/hora padrão: amanhã às 09:00
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  $("dataVisita").value = amanha.toISOString().split("T")[0];
  $("horaVisita").value = "09:00";
  
  $("tipoVisita").value = "Presencial";
  $("statusVisita").value = "Agendada";
  $("observacoes").value = "";
  $("notasPosVisita").value = "";
  $("notasPosVisitaGroup").style.display = "none";
  
  $("modalVisita").classList.add('active');
  $("empresaInput").focus();
}

function editarVisita(id) {
  const visita = VISITAS.find(v => v.id === id);
  if (!visita) return;
  
  $("visitaId").value = id;
  $("modalTitulo").textContent = "✏️ Editar Visita";
  $("empresaInput").value = visita._empresaNome;
  $("empresaHiddenId").value = visita.empresaId || "";
  
  if (visita._dataHora) {
    $("dataVisita").value = visita._dataHora.toISOString().split("T")[0];
    $("horaVisita").value = fmtHora(visita._dataHora);
  }
  
  $("tipoVisita").value = visita._tipo;
  $("statusVisita").value = visita._status;
  $("observacoes").value = visita._observacoes;
  $("notasPosVisita").value = visita._notasPosVisita;
  
  // Mostrar notas pós-visita se realizada
  $("notasPosVisitaGroup").style.display = visita._status === "Realizada" ? "block" : "none";
  
  $("modalVisita").classList.add('active');
}

function fecharModal() {
  $("modalVisita").classList.remove('active');
}

// Input empresa - resolver dados
$("empresaInput")?.addEventListener("input", function() {
  const nome = this.value.trim();
  const empresa = Object.entries(EMPRESAS).find(([id, e]) => 
    (e.nome || e.razaoSocial || "").toLowerCase() === nome.toLowerCase()
  );
  
  if (empresa) {
    const [empId, empData] = empresa;
    $("empresaHiddenId").value = empId;
    
    let rmNome = empData.rmNome || empData.gerenteNome || '';
    const rmId = empData.rmUid || empData.rmId || empData.gerenteId;
    if (!rmNome && rmId && RMS[rmId]) {
      rmNome = RMS[rmId].nome;
    }
    
    $("empresaInfo").style.display = "block";
    $("empresaInfoText").innerHTML = `
      📍 ${empData.cidade || '-'}, ${empData.estado || empData.uf || '-'} &nbsp;|&nbsp; 
      👤 ${rmNome || 'Não vinculado'}
    `;
  } else {
    $("empresaHiddenId").value = "";
    $("empresaInfo").style.display = "none";
  }
});

// Status change - mostrar notas pós-visita
$("statusVisita")?.addEventListener("change", function() {
  $("notasPosVisitaGroup").style.display = this.value === "Realizada" ? "block" : "none";
});

async function salvarVisita() {
  const id = $("visitaId").value;
  const empresaNome = $("empresaInput").value.trim();
  const empresaId = $("empresaHiddenId").value;
  const data = $("dataVisita").value;
  const hora = $("horaVisita").value;
  const tipo = $("tipoVisita").value;
  const status = $("statusVisita").value;
  const observacoes = $("observacoes").value.trim();
  const notasPosVisita = $("notasPosVisita").value.trim();
  
  if (!empresaNome) return alert("Informe a empresa.");
  if (!data || !hora) return alert("Informe data e hora.");
  
  const dataHora = new Date(`${data}T${hora}:00`);
  const empresa = empresaId ? EMPRESAS[empresaId] : null;
  
  // Buscar RM da empresa
  let rmUid = empresa?.rmUid || empresa?.rmId || empresa?.gerenteId || "";
  let rmNome = empresa?.rmNome || empresa?.gerenteNome || "";
  if (rmUid && !rmNome && RMS[rmUid]) {
    rmNome = RMS[rmUid].nome;
  }
  
  const visitaData = {
    empresaNome,
    empresaId: empresaId || null,
    cidade: empresa?.cidade || "",
    dataHoraTs: firebase.firestore.Timestamp.fromDate(dataHora),
    dataHora: dataHora,
    tipo,
    status,
    observacoes,
    notasPosVisita,
    rmUid: rmUid || CTX.uid,
    rmNome: rmNome || CTX.nome,
    agenciaId: empresa?.agenciaId || CTX.agenciaId || "",
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    atualizadoPor: CTX.nome
  };
  
  try {
    if (id) {
      // Editar
      await db.collection("agenda_visitas").doc(id).update(visitaData);
      alert("Visita atualizada com sucesso!");
    } else {
      // Criar
      visitaData.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
      visitaData.criadoPorUid = CTX.uid;
      visitaData.criadoPorNome = CTX.nome;
      await db.collection("agenda_visitas").add(visitaData);
      alert("Visita agendada com sucesso!");
    }
    
    fecharModal();
    await carregarVisitas();
    renderizarTudo();
    renderizarCalendario();
    
  } catch (e) {
    console.error("Erro ao salvar visita:", e);
    alert("Erro ao salvar visita.");
  }
}

// ==== Ações Rápidas ====
async function marcarRealizada(id) {
  const notas = prompt("Notas sobre a visita realizada (opcional):");
  
  try {
    await db.collection("agenda_visitas").doc(id).update({
      status: "Realizada",
      notasPosVisita: notas || "",
      realizadaEm: firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoPor: CTX.nome
    });
    
    await carregarVisitas();
    renderizarTudo();
    renderizarCalendario();
    
  } catch (e) {
    console.error("Erro ao marcar como realizada:", e);
    alert("Erro ao atualizar visita.");
  }
}

function duplicarVisita(id) {
  const visita = VISITAS.find(v => v.id === id);
  if (!visita) return;
  
  $("visitaId").value = ""; // Novo
  $("modalTitulo").textContent = "📋 Duplicar Visita";
  $("empresaInput").value = visita._empresaNome;
  $("empresaHiddenId").value = visita.empresaId || "";
  
  // Data: amanhã
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  $("dataVisita").value = amanha.toISOString().split("T")[0];
  $("horaVisita").value = fmtHora(visita._dataHora);
  
  $("tipoVisita").value = visita._tipo;
  $("statusVisita").value = "Agendada";
  $("observacoes").value = visita._observacoes;
  $("notasPosVisita").value = "";
  $("notasPosVisitaGroup").style.display = "none";
  
  $("modalVisita").classList.add('active');
}

// ==== Excluir ====
function confirmarExcluir(id) {
  const visita = VISITAS.find(v => v.id === id);
  if (!visita) return;
  
  VISITA_EXCLUIR_ID = id;
  $("confirmEmpresa").textContent = `${visita._empresaNome} - ${fmtData(visita._data)}`;
  $("modalConfirm").classList.add('active');
}

function fecharModalConfirm() {
  $("modalConfirm").classList.remove('active');
  VISITA_EXCLUIR_ID = null;
}

async function confirmarExclusao() {
  if (!VISITA_EXCLUIR_ID) return;
  
  try {
    await db.collection("agenda_visitas").doc(VISITA_EXCLUIR_ID).delete();
    fecharModalConfirm();
    
    await carregarVisitas();
    renderizarTudo();
    renderizarCalendario();
    
  } catch (e) {
    console.error("Erro ao excluir:", e);
    alert("Erro ao excluir visita.");
  }
}

// ==== Paginação ====
function carregarMais() {
  PAGINA_ATUAL++;
  renderizarLista();
}

// ==== Export PDF ====
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  
  doc.setFontSize(18);
  doc.setTextColor(79, 70, 229);
  doc.text('Agenda de Visitas', 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
  doc.text(`Total: ${VISITAS_FILTRADAS.length} visitas`, 14, 34);
  
  const dados = VISITAS_FILTRADAS.map(v => [
    fmtData(v._data),
    fmtHora(v._dataHora),
    v._empresaNome.substring(0, 25),
    v._cidade.substring(0, 15),
    v._rmNome.substring(0, 15),
    v._tipo,
    v._status
  ]);
  
  doc.autoTable({
    startY: 40,
    head: [['Data', 'Hora', 'Empresa', 'Cidade', 'Gerente', 'Tipo', 'Status']],
    body: dados,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [79, 70, 229] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 15 },
      2: { cellWidth: 45 },
      3: { cellWidth: 25 },
      4: { cellWidth: 30 },
      5: { cellWidth: 20 },
      6: { cellWidth: 20 }
    }
  });
  
  doc.save(`agenda-visitas-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==== Globals ====
window.setView = setView;
window.abrirModalNova = abrirModalNova;
window.editarVisita = editarVisita;
window.fecharModal = fecharModal;
window.salvarVisita = salvarVisita;
window.marcarRealizada = marcarRealizada;
window.duplicarVisita = duplicarVisita;
window.confirmarExcluir = confirmarExcluir;
window.fecharModalConfirm = fecharModalConfirm;
window.confirmarExclusao = confirmarExclusao;
window.quickFilter = quickFilter;
window.filtrarPor = filtrarPor;
window.aplicarFiltros = aplicarFiltros;
window.limparFiltros = limparFiltros;
window.toggleFiltros = toggleFiltros;
window.navegarCalendario = navegarCalendario;
window.selecionarDia = selecionarDia;
window.carregarMais = carregarMais;
window.exportarPDF = exportarPDF;
