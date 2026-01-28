// visitas.js — Registrar Visita Modernizado (CORRIGIDO)
// Firebase v8
// Versão com histórico de visitas funcionando corretamente

// ==== Firebase Init ====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ==== Estado Global ====
let CTX = { uid: null, perfil: null, agenciaId: null, nome: null, email: null, isAdmin: false };
const ADMIN_EMAILS = ["patrick@retornoseguros.com.br"];

let EMPRESAS = {};
let SEGURADORAS = [];
let RMS = {};
let EMPRESA_SELECIONADA = null;
let CONTATOS = [];
let CHECKLIST_ITEMS = [];
let RAMOS_DATA = {};
let COTACAO_RAMO = null;

// Timer
let TIMER_RUNNING = false;
let TIMER_SECONDS = 0;
let TIMER_INTERVAL = null;

// Geo
let GEO_DATA = null;

// Ramos config
const RAMOS_CONFIG = [
  { id: "saude", nome: "Saúde", icon: "🏥" },
  { id: "dental", nome: "Dental", icon: "🦷" },
  { id: "vida", nome: "Vida", icon: "❤️" },
  { id: "vida-global", nome: "Vida Global", icon: "🌍" },
  { id: "patrimonial", nome: "Patrimonial", icon: "🏢" },
  { id: "frota", nome: "Frota", icon: "🚗" },
  { id: "equipamentos", nome: "Equipamentos", icon: "⚙️" },
  { id: "garantia", nome: "Garantia", icon: "📜" },
  { id: "rc", nome: "RC Profissional", icon: "⚖️" },
  { id: "cyber", nome: "Cyber", icon: "💻" },
  { id: "transporte", nome: "Transporte", icon: "🚚" },
  { id: "credito", nome: "Crédito", icon: "💳" }
];

const CHECKLIST_DEFAULT = [
  "Apresentar a empresa e serviços",
  "Levantar necessidades do cliente",
  "Verificar apólices vigentes",
  "Coletar datas de vencimento",
  "Identificar decisores",
  "Agendar próximo contato",
  "Entregar material institucional"
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
const fmtHora = d => d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "-";
const fmtDataHora = d => d ? `${fmtData(d)} às ${fmtHora(d)}` : "-";

function fmtBRL(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function fmtDuracao(segundos) {
  if (!segundos) return "-";
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function formatarMoeda(input) {
  let v = (input.value || '').replace(/\D/g, '');
  if (!v) { input.value = ''; return; }
  v = (parseInt(v, 10) / 100).toFixed(2).replace('.', ',');
  v = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  input.value = 'R$ ' + v;
}

function desformatarMoeda(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/[^\d]/g, '') || 0) / 100;
}

function getIniciais(nome) {
  if (!nome) return "?";
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
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
  showLoading(true);
  
  await Promise.all([
    carregarEmpresas(),
    carregarSeguradoras(),
    carregarRMs()
  ]);
  
  renderizarRamos();
  renderizarChecklist();
  setDefaultDateTime();
  criarModalDetalhesVisita(); // NOVO: Criar modal de detalhes
  
  showLoading(false);
}

function showLoading(show) {
  const el = $("loadingOverlay");
  if (el) el.classList.toggle('active', show);
}

// ==== Carregar Dados ====
async function carregarEmpresas() {
  try {
    let query = db.collection("empresas");
    
    if (!CTX.isAdmin) {
      if (["gerente chefe", "assistente"].includes(CTX.perfil)) {
        if (CTX.agenciaId) {
          query = query.where("agenciaId", "==", CTX.agenciaId);
        }
      } else {
        if (CTX.agenciaId) {
          query = query.where("agenciaId", "==", CTX.agenciaId);
        }
      }
    }
    
    const snap = await query.get();
    const datalist = $("empresasDatalist");
    
    snap.forEach(doc => {
      const d = doc.data();
      
      if (!CTX.isAdmin && !["gerente chefe", "assistente"].includes(CTX.perfil)) {
        const rmUid = d.rmUid || d.rmId || d.gerenteId || "";
        if (rmUid !== CTX.uid) return;
      }
      
      EMPRESAS[doc.id] = { id: doc.id, ...d };
      
      if (datalist) {
        const opt = document.createElement("option");
        opt.value = d.nome || d.razaoSocial || "";
        opt.dataset.id = doc.id;
        datalist.appendChild(opt);
      }
    });
  } catch (e) { console.warn("Erro empresas:", e); }
}

async function carregarSeguradoras() {
  try {
    const snap = await db.collection("seguradoras").get();
    snap.forEach(doc => {
      SEGURADORAS.push(doc.data().nome || doc.id);
    });
    SEGURADORAS.sort();
  } catch (e) { 
    SEGURADORAS = ["Bradesco", "SulAmérica", "Porto Seguro", "Allianz", "Mapfre", "Tokio Marine", "Liberty", "Zurich", "HDI", "Sompo", "Outros"];
  }
}

async function carregarRMs() {
  try {
    const snap = await db.collection("usuarios_banco").get();
    snap.forEach(doc => {
      const d = doc.data();
      if (d.nome) {
        if (CTX.isAdmin || d.agenciaId === CTX.agenciaId) {
          RMS[doc.id] = { nome: d.nome, agenciaId: d.agenciaId };
        }
      }
    });
  } catch (e) { console.warn("Erro RMs:", e); }
}

// ==== Empresa ====
$("empresaInput")?.addEventListener("change", function() {
  const nome = this.value.trim();
  const empresa = Object.values(EMPRESAS).find(e => 
    (e.nome || e.razaoSocial || "").toLowerCase() === nome.toLowerCase()
  );
  
  if (empresa) {
    selecionarEmpresa(empresa);
  }
});

async function selecionarEmpresa(empresa) {
  EMPRESA_SELECIONADA = empresa;
  
  $("empresaNome").textContent = empresa.nome || empresa.razaoSocial || "-";
  
  const badgesHtml = [];
  if (empresa.cidade) badgesHtml.push(`<span class="badge badge-muted">📍 ${empresa.cidade}${empresa.estado ? ', ' + empresa.estado : ''}</span>`);
  if (empresa.numFuncionarios) badgesHtml.push(`<span class="badge badge-info">👥 ${empresa.numFuncionarios} func.</span>`);
  $("empresaBadges").innerHTML = badgesHtml.join('');
  
  let rmNome = empresa.rmNome || empresa.gerenteNome || '';
  const rmId = empresa.rmUid || empresa.rmId || empresa.gerenteId;
  if (!rmNome && rmId && RMS[rmId]) rmNome = RMS[rmId].nome;
  
  $("empresaInfoGrid").innerHTML = `
    <div class="empresa-info-item"><span>👤</span> <strong>${rmNome || 'Não vinculado'}</strong></div>
    <div class="empresa-info-item"><span>📞</span> ${empresa.telefone || '-'}</div>
    <div class="empresa-info-item"><span>📧</span> ${empresa.email || '-'}</div>
    <div class="empresa-info-item"><span>📄</span> ${empresa.cnpj || '-'}</div>
  `;
  
  if (empresa.numFuncionarios) {
    $("numFuncionarios").value = empresa.numFuncionarios;
  }
  
  await carregarHistoricoEmpresa(empresa.id);
  await carregarSegurosMapeados(empresa.id);
  
  $("empresaCard").classList.add('active');
}

function limparEmpresa() {
  EMPRESA_SELECIONADA = null;
  $("empresaInput").value = "";
  $("empresaCard").classList.remove('active');
  $("historicoVisitas").innerHTML = '<div class="historico-empty">Nenhuma visita registrada</div>';
  $("segurosAtivosSection").style.display = "none";
}

// ============================================
// CORREÇÃO PRINCIPAL: Histórico com detalhes
// ============================================

async function carregarHistoricoEmpresa(empresaId) {
  const container = $("historicoVisitas");
  
  try {
    const snap = await db.collection("visitas")
      .where("empresaId", "==", empresaId)
      .orderBy("dataHora", "desc")
      .limit(10) // Aumentado de 5 para 10
      .get();
    
    if (snap.empty) {
      container.innerHTML = '<div class="historico-empty">Nenhuma visita registrada</div>';
      return;
    }
    
    let html = "";
    snap.forEach(doc => {
      const d = doc.data();
      const visitaId = doc.id;
      const data = toDate(d.dataHora);
      const tipo = d.tipoVisita || d.tipo || "Presencial";
      const tipoBadge = tipo === "Online" ? "badge-info" : "badge-success";
      
      // Contar informações extras
      const numContatos = (d.contatos || []).length;
      const numRamos = Object.values(d.ramos || {}).filter(r => r.abordado).length;
      const temObs = d.observacoes && d.observacoes.trim().length > 0;
      
      // Indicadores visuais
      let indicadores = [];
      if (numContatos > 0) indicadores.push(`👥${numContatos}`);
      if (numRamos > 0) indicadores.push(`🎯${numRamos}`);
      if (temObs) indicadores.push(`📝`);
      if (d.duracao > 0) indicadores.push(`⏱️`);
      
      html += `
        <div class="historico-item historico-item-clickable" onclick="verDetalhesVisita('${visitaId}')" title="Clique para ver detalhes">
          <div class="historico-item-left">
            <span class="badge ${tipoBadge}">${tipo === "Online" ? "🔵" : "🟢"} ${tipo}</span>
            <span>${fmtData(data)}</span>
            <span class="historico-indicadores">${indicadores.join(' ')}</span>
          </div>
          <div class="historico-item-right">
            <span style="color: var(--muted); font-size: 12px;">${d.rmNome || '-'}</span>
            <span class="historico-ver-mais">👁️</span>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  } catch (e) {
    console.warn("Erro histórico:", e);
    container.innerHTML = '<div class="historico-empty">Erro ao carregar histórico</div>';
  }
}

// ============================================
// NOVO: Modal de Detalhes da Visita
// ============================================

function criarModalDetalhesVisita() {
  // Verificar se modal já existe
  if ($("modalDetalhesVisita")) return;
  
  const modalHtml = `
    <div class="modal-overlay" id="modalDetalhesVisita">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3 class="modal-title" id="modalDetalhesTitle">📋 Detalhes da Visita</h3>
          <button class="modal-close" onclick="fecharDetalhesVisita()">✕</button>
        </div>
        <div class="modal-body" id="modalDetalhesContent">
          <div class="loading-spinner">Carregando...</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="fecharDetalhesVisita()">Fechar</button>
          <button class="btn btn-primary" onclick="duplicarVisita()" id="btnDuplicarVisita">📋 Usar como Base</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

let VISITA_DETALHES_ATUAL = null;

async function verDetalhesVisita(visitaId) {
  const modal = $("modalDetalhesVisita");
  const content = $("modalDetalhesContent");
  
  modal.classList.add('active');
  content.innerHTML = '<div class="loading-spinner">Carregando detalhes...</div>';
  
  try {
    const doc = await db.collection("visitas").doc(visitaId).get();
    
    if (!doc.exists) {
      content.innerHTML = '<div class="error-message">Visita não encontrada</div>';
      return;
    }
    
    const visita = doc.data();
    VISITA_DETALHES_ATUAL = { id: visitaId, ...visita };
    
    const data = toDate(visita.dataHora);
    const tipo = visita.tipoVisita || visita.tipo || "Presencial";
    const tipoBadge = tipo === "Online" ? "badge-info" : "badge-success";
    
    // Contatos
    const contatos = visita.contatos || [];
    let contatosHtml = '<div class="empty-state">Nenhum contato registrado</div>';
    if (contatos.length > 0) {
      contatosHtml = contatos.map(c => `
        <div class="detalhe-contato">
          <div class="contato-avatar-sm">${getIniciais(c.nome)}</div>
          <div>
            <div class="contato-nome-sm">${c.nome}</div>
            <div class="contato-cargo-sm">${c.cargo || '-'}</div>
          </div>
        </div>
      `).join('');
    }
    
    // Ramos mapeados
    const ramos = visita.ramos || {};
    const ramosAbordados = Object.entries(ramos).filter(([_, d]) => d.abordado);
    let ramosHtml = '<div class="empty-state">Nenhum ramo mapeado</div>';
    
    const statusLabels = { 
      ativo: "🟢 Ativo", 
      vence: "🟡 Vence em breve", 
      vencido: "🔴 Vencido", 
      "nao-possui": "⚪ Não possui" 
    };
    const interesseIcons = { alto: "🔥 Alto", medio: "🟡 Médio", baixo: "❄️ Baixo" };
    
    if (ramosAbordados.length > 0) {
      ramosHtml = ramosAbordados.map(([id, dados]) => {
        const config = RAMOS_CONFIG.find(r => r.id === id) || { nome: id, icon: "📋" };
        
        let detalhes = [];
        if (dados.status) detalhes.push(statusLabels[dados.status] || dados.status);
        if (dados.interesse) detalhes.push(interesseIcons[dados.interesse] || dados.interesse);
        if (dados.vencimento) detalhes.push(`📅 Venc: ${dados.vencimento}`);
        if (dados.seguradora) detalhes.push(`🏛️ ${dados.seguradora}`);
        if (dados.valorEstimado) detalhes.push(`💰 ${dados.valorEstimado}`);
        if (dados.concorrente) detalhes.push(`🏢 Atual: ${dados.concorrente}`);
        
        return `
          <div class="detalhe-ramo">
            <div class="detalhe-ramo-header">
              <span class="detalhe-ramo-icon">${config.icon}</span>
              <span class="detalhe-ramo-nome">${config.nome}</span>
            </div>
            <div class="detalhe-ramo-info">${detalhes.join(' • ') || 'Sem detalhes'}</div>
            ${dados.obs ? `<div class="detalhe-ramo-obs">📝 ${dados.obs}</div>` : ''}
          </div>
        `;
      }).join('');
    }
    
    // Checklist
    const checklist = visita.checklist || [];
    let checklistHtml = '<div class="empty-state">Nenhum checklist registrado</div>';
    if (checklist.length > 0) {
      const concluidos = checklist.filter(i => i.done).length;
      checklistHtml = `
        <div class="checklist-resumo">
          <span class="checklist-progress-bar">
            <span class="checklist-progress-fill" style="width: ${(concluidos/checklist.length)*100}%"></span>
          </span>
          <span class="checklist-progress-text">${concluidos}/${checklist.length} concluídos</span>
        </div>
        <div class="checklist-items">
          ${checklist.map(item => `
            <div class="checklist-item-mini ${item.done ? 'done' : ''}">
              <span class="checklist-check">${item.done ? '✓' : '○'}</span>
              <span>${item.text}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
    
    // Geolocalização
    let geoHtml = '';
    if (visita.geolocalizacao) {
      const geo = visita.geolocalizacao;
      geoHtml = `
        <div class="detalhe-section">
          <h4 class="detalhe-section-title">📍 Localização</h4>
          <div class="detalhe-geo">
            <span>Lat: ${geo.lat?.toFixed(6) || '-'}, Lng: ${geo.lng?.toFixed(6) || '-'}</span>
            <a href="https://www.google.com/maps?q=${geo.lat},${geo.lng}" target="_blank" class="btn btn-sm btn-secondary">Ver no Mapa</a>
          </div>
        </div>
      `;
    }
    
    content.innerHTML = `
      <div class="detalhe-visita">
        <!-- Cabeçalho -->
        <div class="detalhe-header">
          <div class="detalhe-empresa">${visita.empresaNome || '-'}</div>
          <div class="detalhe-meta">
            <span class="badge ${tipoBadge}">${tipo === "Online" ? "🔵" : "🟢"} ${tipo}</span>
            <span>📅 ${fmtDataHora(data)}</span>
            ${visita.duracao ? `<span>⏱️ ${fmtDuracao(visita.duracao)}</span>` : ''}
          </div>
          <div class="detalhe-rm">👤 Responsável: <strong>${visita.rmNome || '-'}</strong></div>
          ${visita.numFuncionarios ? `<div class="detalhe-func">👥 Funcionários: <strong>${visita.numFuncionarios}</strong></div>` : ''}
        </div>
        
        <!-- Contatos -->
        <div class="detalhe-section">
          <h4 class="detalhe-section-title">👥 Pessoas Contactadas (${contatos.length})</h4>
          <div class="detalhe-contatos">${contatosHtml}</div>
        </div>
        
        <!-- Ramos Mapeados -->
        <div class="detalhe-section">
          <h4 class="detalhe-section-title">🎯 Ramos Mapeados (${ramosAbordados.length})</h4>
          <div class="detalhe-ramos">${ramosHtml}</div>
        </div>
        
        <!-- Checklist -->
        <div class="detalhe-section">
          <h4 class="detalhe-section-title">✅ Checklist</h4>
          <div class="detalhe-checklist">${checklistHtml}</div>
        </div>
        
        ${geoHtml}
        
        <!-- Observações -->
        ${visita.observacoes ? `
          <div class="detalhe-section">
            <h4 class="detalhe-section-title">📝 Observações</h4>
            <div class="detalhe-obs">${visita.observacoes}</div>
          </div>
        ` : ''}
        
        <!-- Metadados -->
        <div class="detalhe-footer">
          <span>Registrado por: ${visita.criadoPorNome || '-'}</span>
          <span>ID: ${visitaId}</span>
        </div>
      </div>
    `;
    
  } catch (e) {
    console.error("Erro ao carregar detalhes:", e);
    content.innerHTML = `<div class="error-message">Erro ao carregar: ${e.message}</div>`;
  }
}

function fecharDetalhesVisita() {
  $("modalDetalhesVisita").classList.remove('active');
  VISITA_DETALHES_ATUAL = null;
}

function duplicarVisita() {
  if (!VISITA_DETALHES_ATUAL) return;
  
  const visita = VISITA_DETALHES_ATUAL;
  
  // Preencher contatos
  CONTATOS = [...(visita.contatos || [])];
  renderizarContatos();
  
  // Preencher ramos
  const ramos = visita.ramos || {};
  Object.entries(ramos).forEach(([id, dados]) => {
    if (dados.abordado && RAMOS_DATA[id]) {
      RAMOS_DATA[id] = { ...dados };
      
      // Ativar card visual
      const card = $(`ramo-${id}`);
      if (card) {
        card.classList.add('active');
        
        // Preencher campos
        if (dados.status) {
          const statusBtn = card.querySelector(`[data-status="${dados.status}"]`);
          if (statusBtn) statusBtn.classList.add('active');
        }
        if (dados.interesse) {
          const intBtn = card.querySelector(`[data-interesse="${dados.interesse}"]`);
          if (intBtn) intBtn.classList.add('active');
        }
        if (dados.vencimento) $(`${id}-vencimento`).value = dados.vencimento;
        if (dados.seguradora) $(`${id}-seguradora`).value = dados.seguradora;
        if (dados.valorEstimado) $(`${id}-valor`).value = dados.valorEstimado;
        if (dados.concorrente) $(`${id}-concorrente`).value = dados.concorrente;
        if (dados.obs) $(`${id}-obs`).value = dados.obs;
      }
    }
  });
  updateRamosCount();
  
  // Preencher observações
  if (visita.observacoes) {
    $("observacoesGerais").value = visita.observacoes;
  }
  
  fecharDetalhesVisita();
  alert("Dados da visita anterior carregados! Ajuste conforme necessário e salve como nova visita.");
}

// ============================================
// FIM DAS CORREÇÕES PRINCIPAIS
// ============================================

async function carregarSegurosMapeados(empresaId) {
  const section = $("segurosAtivosSection");
  const container = $("segurosAtivos");
  
  try {
    const snap = await db.collection("visitas")
      .where("empresaId", "==", empresaId)
      .orderBy("dataHora", "desc")
      .limit(1)
      .get();
    
    if (snap.empty) {
      section.style.display = "none";
      return;
    }
    
    const visita = snap.docs[0].data();
    const ramos = visita.ramos || {};
    
    const hoje = new Date();
    let html = "";
    let temRamos = false;
    
    Object.entries(ramos).forEach(([ramoId, dados]) => {
      if (!dados.abordado) return;
      temRamos = true;
      
      const config = RAMOS_CONFIG.find(r => r.id === ramoId) || { icon: "📋", nome: ramoId };
      
      let chipClass = "";
      let vencInfo = "";
      
      if (dados.vencimento) {
        const [dia, mes, ano] = dados.vencimento.split("/");
        const dataVenc = new Date(ano, mes - 1, dia);
        const diffDias = Math.ceil((dataVenc - hoje) / (1000 * 60 * 60 * 24));
        
        if (diffDias < 0) {
          chipClass = "vencido";
          vencInfo = "Vencido";
        } else if (diffDias <= 60) {
          chipClass = "vence-breve";
          vencInfo = `Vence ${dados.vencimento}`;
        } else {
          vencInfo = `Vence ${dados.vencimento}`;
        }
      } else if (dados.status === "nao-possui") {
        vencInfo = "Não possui";
      }
      
      html += `
        <div class="seguro-ativo-chip ${chipClass}">
          <span>${config.icon}</span>
          <span><strong>${config.nome}</strong></span>
          ${vencInfo ? `<span style="color: var(--muted);">• ${vencInfo}</span>` : ''}
        </div>
      `;
    });
    
    if (temRamos) {
      container.innerHTML = html;
      section.style.display = "block";
    } else {
      section.style.display = "none";
    }
  } catch (e) {
    console.warn("Erro seguros mapeados:", e);
    section.style.display = "none";
  }
}

// ==== Timer ====
function toggleTimer() {
  if (TIMER_RUNNING) {
    stopTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  TIMER_RUNNING = true;
  $("btnTimerStart").textContent = "⏸";
  $("btnTimerStart").classList.add('active');
  
  TIMER_INTERVAL = setInterval(() => {
    TIMER_SECONDS++;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  TIMER_RUNNING = false;
  $("btnTimerStart").textContent = "▶";
  $("btnTimerStart").classList.remove('active');
  
  if (TIMER_INTERVAL) {
    clearInterval(TIMER_INTERVAL);
    TIMER_INTERVAL = null;
  }
}

function resetTimer() {
  stopTimer();
  TIMER_SECONDS = 0;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const h = Math.floor(TIMER_SECONDS / 3600);
  const m = Math.floor((TIMER_SECONDS % 3600) / 60);
  const s = TIMER_SECONDS % 60;
  $("timerDisplay").textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ==== Geolocalização ====
function capturarGeo() {
  if (!navigator.geolocation) {
    alert("Geolocalização não suportada neste navegador.");
    return;
  }
  
  $("geoStatus").textContent = "Capturando...";
  
  navigator.geolocation.getCurrentPosition(
    pos => {
      GEO_DATA = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: new Date()
      };
      
      $("geoStatus").textContent = "✅ Localização capturada";
      $("geoCoords").textContent = `${GEO_DATA.lat.toFixed(6)}, ${GEO_DATA.lng.toFixed(6)}`;
      $("geoCard").style.background = "#dcfce7";
    },
    err => {
      console.warn("Erro geo:", err);
      $("geoStatus").textContent = "❌ Erro ao capturar";
      $("geoCoords").textContent = err.message;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ==== Contatos ====
function addContato() {
  const nome = $("contatoNome").value.trim();
  const cargo = $("contatoCargo").value.trim();
  
  if (!nome) {
    alert("Informe o nome do contato.");
    return;
  }
  
  CONTATOS.push({ nome, cargo });
  $("contatoNome").value = "";
  $("contatoCargo").value = "";
  
  renderizarContatos();
}

function removeContato(index) {
  CONTATOS.splice(index, 1);
  renderizarContatos();
}

function renderizarContatos() {
  const container = $("contatosList");
  
  if (CONTATOS.length === 0) {
    container.innerHTML = '<div class="historico-empty" id="contatosEmpty">Nenhum contato adicionado</div>';
    $("contatosCount").textContent = "0";
    return;
  }
  
  container.innerHTML = CONTATOS.map((c, i) => `
    <div class="contato-item">
      <div class="contato-avatar">${getIniciais(c.nome)}</div>
      <div class="contato-info">
        <div class="contato-nome">${c.nome}</div>
        <div class="contato-cargo">${c.cargo || '-'}</div>
      </div>
      <button class="contato-remove" onclick="removeContato(${i})">✕</button>
    </div>
  `).join('');
  
  $("contatosCount").textContent = CONTATOS.length;
}

// ==== Checklist ====
function renderizarChecklist() {
  CHECKLIST_ITEMS = CHECKLIST_DEFAULT.map(item => ({ text: item, done: false }));
  
  const container = $("checklist");
  container.innerHTML = CHECKLIST_ITEMS.map((item, i) => `
    <div class="checklist-item ${item.done ? 'done' : ''}" onclick="toggleChecklistItem(${i})">
      <div class="checklist-checkbox">${item.done ? '✓' : ''}</div>
      <span class="checklist-text">${item.text}</span>
    </div>
  `).join('');
  
  updateChecklistProgress();
}

function toggleChecklistItem(index) {
  CHECKLIST_ITEMS[index].done = !CHECKLIST_ITEMS[index].done;
  
  const items = document.querySelectorAll('.checklist-item');
  if (items[index]) {
    items[index].classList.toggle('done', CHECKLIST_ITEMS[index].done);
    items[index].querySelector('.checklist-checkbox').textContent = CHECKLIST_ITEMS[index].done ? '✓' : '';
  }
  
  updateChecklistProgress();
}

function updateChecklistProgress() {
  const done = CHECKLIST_ITEMS.filter(i => i.done).length;
  const total = CHECKLIST_ITEMS.length;
  $("checklistProgress").textContent = `${done}/${total}`;
}

// ==== Ramos ====
function renderizarRamos() {
  const container = $("ramosContainer");
  
  const seguradorasOptions = SEGURADORAS.map(s => `<option value="${s}">${s}</option>`).join('');
  
  container.innerHTML = RAMOS_CONFIG.map(ramo => {
    RAMOS_DATA[ramo.id] = {
      abordado: false,
      status: "",
      interesse: "",
      vencimento: "",
      seguradora: "",
      valorEstimado: "",
      concorrente: "",
      obs: ""
    };
    
    return `
      <div class="ramo-card" id="ramo-${ramo.id}" onclick="toggleRamo('${ramo.id}', event)">
        <div class="ramo-header">
          <div class="ramo-header-left">
            <div class="ramo-icon">${ramo.icon}</div>
            <span class="ramo-nome">${ramo.nome}</span>
          </div>
          <div class="ramo-toggle"></div>
        </div>
        <div class="ramo-body" onclick="event.stopPropagation()">
          <div style="margin-bottom: 14px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 6px; display: block;">STATUS</label>
            <div class="status-selector">
              <div class="status-option" data-status="ativo" onclick="setRamoStatus('${ramo.id}', 'ativo', this)">🟢 Ativo</div>
              <div class="status-option" data-status="vence" onclick="setRamoStatus('${ramo.id}', 'vence', this)">🟡 Vence</div>
              <div class="status-option" data-status="vencido" onclick="setRamoStatus('${ramo.id}', 'vencido', this)">🔴 Vencido</div>
              <div class="status-option" data-status="nao-possui" onclick="setRamoStatus('${ramo.id}', 'nao-possui', this)">⚪ Não tem</div>
            </div>
          </div>
          
          <div style="margin-bottom: 14px;">
            <label style="font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 6px; display: block;">INTERESSE</label>
            <div class="interesse-selector">
              <div class="interesse-option" data-interesse="alto" onclick="setRamoInteresse('${ramo.id}', 'alto', this)" title="Alto">🔥</div>
              <div class="interesse-option" data-interesse="medio" onclick="setRamoInteresse('${ramo.id}', 'medio', this)" title="Médio">🟡</div>
              <div class="interesse-option" data-interesse="baixo" onclick="setRamoInteresse('${ramo.id}', 'baixo', this)" title="Baixo">❄️</div>
            </div>
          </div>
          
          <div class="ramo-fields">
            <div class="ramo-field">
              <label>Vencimento</label>
              <input type="text" id="${ramo.id}-vencimento" placeholder="dd/mm/aaaa" maxlength="10" oninput="formatarData(this)" onchange="updateRamoField('${ramo.id}', 'vencimento', this.value)">
            </div>
            <div class="ramo-field">
              <label>Seguradora Atual</label>
              <select id="${ramo.id}-seguradora" onchange="updateRamoField('${ramo.id}', 'seguradora', this.value)">
                <option value="">Selecione</option>
                ${seguradorasOptions}
              </select>
            </div>
            <div class="ramo-field">
              <label>Valor Estimado</label>
              <input type="text" id="${ramo.id}-valor" placeholder="R$ 0,00" oninput="formatarMoeda(this); updateRamoField('${ramo.id}', 'valorEstimado', this.value)">
            </div>
            <div class="ramo-field">
              <label>Concorrente</label>
              <input type="text" id="${ramo.id}-concorrente" placeholder="Corretor atual" onchange="updateRamoField('${ramo.id}', 'concorrente', this.value)">
            </div>
            <div class="ramo-field full">
              <label>Observações</label>
              <textarea id="${ramo.id}-obs" placeholder="Notas sobre este ramo..." onchange="updateRamoField('${ramo.id}', 'obs', this.value)"></textarea>
            </div>
          </div>
          
          <div class="ramo-actions">
            <button class="btn btn-sm btn-primary" onclick="abrirModalCotacao('${ramo.id}')">📋 Criar Cotação</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleRamo(ramoId, event) {
  if (event.target.closest('.ramo-body')) return;
  
  const card = $(`ramo-${ramoId}`);
  const isActive = card.classList.contains('active');
  
  card.classList.toggle('active');
  RAMOS_DATA[ramoId].abordado = !isActive;
  
  updateRamosCount();
}

function setRamoStatus(ramoId, status, el) {
  el.parentElement.querySelectorAll('.status-option').forEach(opt => opt.classList.remove('active'));
  el.classList.add('active');
  RAMOS_DATA[ramoId].status = status;
}

function setRamoInteresse(ramoId, interesse, el) {
  el.parentElement.querySelectorAll('.interesse-option').forEach(opt => opt.classList.remove('active'));
  el.classList.add('active');
  RAMOS_DATA[ramoId].interesse = interesse;
}

function updateRamoField(ramoId, field, value) {
  RAMOS_DATA[ramoId][field] = value;
}

function formatarData(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
  if (v.length > 5) v = v.slice(0, 5) + '/' + v.slice(5, 9);
  input.value = v;
}

function updateRamosCount() {
  const count = Object.values(RAMOS_DATA).filter(r => r.abordado).length;
  $("ramosAtivosCount").textContent = `${count} ramo${count !== 1 ? 's' : ''}`;
}

// ==== Criar Cotação ====
function abrirModalCotacao(ramoId) {
  COTACAO_RAMO = ramoId;
  
  const ramo = RAMOS_CONFIG.find(r => r.id === ramoId) || { nome: ramoId, icon: "📋" };
  const dados = RAMOS_DATA[ramoId] || {};
  
  $("cotacaoInfo").innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="font-size: 32px;">${ramo.icon}</span>
      <div>
        <div style="font-weight: 700; font-size: 16px;">${ramo.nome}</div>
        <div style="font-size: 13px; color: var(--muted);">${EMPRESA_SELECIONADA?.nome || '-'}</div>
      </div>
    </div>
  `;
  
  $("cotacaoValor").value = dados.valorEstimado || "";
  
  const tempMap = { alto: "quente", medio: "morno", baixo: "frio" };
  $("cotacaoTemperatura").value = tempMap[dados.interesse] || "morno";
  
  $("modalCotacao").classList.add('active');
}

function fecharModalCotacao() {
  $("modalCotacao").classList.remove('active');
  COTACAO_RAMO = null;
}

async function confirmarCriarCotacao() {
  if (!EMPRESA_SELECIONADA || !COTACAO_RAMO) {
    alert("Dados incompletos.");
    return;
  }
  
  const ramo = RAMOS_CONFIG.find(r => r.id === COTACAO_RAMO) || { nome: COTACAO_RAMO };
  const valor = desformatarMoeda($("cotacaoValor").value);
  const temperatura = $("cotacaoTemperatura").value;
  
  let rmUid = EMPRESA_SELECIONADA.rmUid || EMPRESA_SELECIONADA.rmId || EMPRESA_SELECIONADA.gerenteId || "";
  let rmNome = EMPRESA_SELECIONADA.rmNome || EMPRESA_SELECIONADA.gerenteNome || "";
  if (rmUid && !rmNome && RMS[rmUid]) rmNome = RMS[rmUid].nome;
  if (!rmUid) { rmUid = CTX.uid; rmNome = CTX.nome; }
  
  const cotacao = {
    empresaNome: EMPRESA_SELECIONADA.nome || EMPRESA_SELECIONADA.razaoSocial,
    empresaId: EMPRESA_SELECIONADA.id,
    empresaCNPJ: EMPRESA_SELECIONADA.cnpj || null,
    ramo: ramo.nome,
    valorDesejado: valor,
    temperatura,
    status: "Pendente Agência",
    dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
    dataAtualizacao: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPorUid: CTX.uid,
    criadoPorNome: CTX.nome,
    rmUid,
    rmNome,
    agenciaId: EMPRESA_SELECIONADA.agenciaId || CTX.agenciaId || "",
    origem: "visita",
    interacoes: [{
      autorNome: CTX.nome,
      autorUid: CTX.uid,
      mensagem: `📋 Cotação criada a partir de visita comercial`,
      dataHora: new Date(),
      tipo: "sistema"
    }]
  };
  
  try {
    const docRef = await db.collection("cotacoes-gerentes").add(cotacao);
    alert(`Cotação criada com sucesso!\nID: ${docRef.id}`);
    fecharModalCotacao();
  } catch (e) {
    console.error("Erro ao criar cotação:", e);
    alert("Erro ao criar cotação.");
  }
}

// ==== Default DateTime ====
function setDefaultDateTime() {
  const now = new Date();
  $("dataVisita").value = now.toISOString().split("T")[0];
  $("horaVisita").value = now.toTimeString().slice(0, 5);
}

// ==== Resumo ====
function visualizarResumo() {
  if (!EMPRESA_SELECIONADA) {
    alert("Selecione uma empresa.");
    return;
  }
  
  if (!$("tipoVisita").value) {
    alert("Selecione o tipo de visita.");
    return;
  }
  
  const ramosAbordados = Object.entries(RAMOS_DATA).filter(([_, d]) => d.abordado);
  
  const interesseIcons = { alto: "🔥", medio: "🟡", baixo: "❄️" };
  const statusLabels = { ativo: "Ativo", vence: "Vence em breve", vencido: "Vencido", "nao-possui": "Não possui" };
  
  let ramosHtml = "";
  if (ramosAbordados.length > 0) {
    ramosHtml = ramosAbordados.map(([id, dados]) => {
      const ramo = RAMOS_CONFIG.find(r => r.id === id) || { nome: id, icon: "📋" };
      const details = [];
      if (dados.status) details.push(statusLabels[dados.status] || dados.status);
      if (dados.vencimento) details.push(`Venc: ${dados.vencimento}`);
      if (dados.seguradora) details.push(dados.seguradora);
      if (dados.valorEstimado) details.push(dados.valorEstimado);
      
      return `
        <div class="resumo-ramo">
          <div class="resumo-ramo-icon">${ramo.icon}</div>
          <div class="resumo-ramo-info">
            <div class="resumo-ramo-nome">${ramo.nome}</div>
            <div class="resumo-ramo-details">${details.join(' • ') || 'Sem detalhes'}</div>
          </div>
          <div class="resumo-ramo-interesse">${interesseIcons[dados.interesse] || '➖'}</div>
        </div>
      `;
    }).join('');
  } else {
    ramosHtml = '<div class="historico-empty">Nenhum ramo mapeado</div>';
  }
  
  $("resumoContent").innerHTML = `
    <div class="resumo-header">
      <div class="resumo-empresa">🏢 ${EMPRESA_SELECIONADA.nome || EMPRESA_SELECIONADA.razaoSocial}</div>
      <div class="resumo-meta">
        <span>📅 ${$("dataVisita").value.split("-").reverse().join("/")}</span>
        <span>🕐 ${$("horaVisita").value}</span>
        <span class="badge ${$("tipoVisita").value === "Online" ? "badge-info" : "badge-success"}">
          ${$("tipoVisita").value === "Online" ? "🔵" : "🟢"} ${$("tipoVisita").value}
        </span>
      </div>
      ${TIMER_SECONDS > 0 ? `<div style="margin-top: 8px; color: var(--muted);">⏱️ Duração: ${$("timerDisplay").textContent}</div>` : ''}
      ${GEO_DATA ? `<div style="margin-top: 4px; color: var(--muted);">📍 Localização capturada</div>` : ''}
    </div>
    
    ${CONTATOS.length > 0 ? `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 14px; margin-bottom: 10px;">👥 Contatos (${CONTATOS.length})</h4>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${CONTATOS.map(c => `<span class="badge badge-muted">${c.nome}${c.cargo ? ` - ${c.cargo}` : ''}</span>`).join('')}
        </div>
      </div>
    ` : ''}
    
    <div>
      <h4 style="font-size: 14px; margin-bottom: 10px;">🎯 Ramos Mapeados (${ramosAbordados.length})</h4>
      <div class="resumo-ramos">
        ${ramosHtml}
      </div>
    </div>
    
    ${$("observacoesGerais").value ? `
      <div style="margin-top: 20px;">
        <h4 style="font-size: 14px; margin-bottom: 10px;">📝 Observações</h4>
        <div style="background: #f8fafc; padding: 14px; border-radius: 10px; font-size: 14px;">${$("observacoesGerais").value}</div>
      </div>
    ` : ''}
  `;
  
  $("modalResumo").classList.add('active');
}

function fecharResumo() {
  $("modalResumo").classList.remove('active');
}

function confirmarSalvar() {
  fecharResumo();
  salvarVisita();
}

// ==== Salvar Visita ====
async function salvarVisita() {
  if (!EMPRESA_SELECIONADA) {
    alert("Selecione uma empresa.");
    return;
  }
  
  const tipoVisita = $("tipoVisita").value;
  if (!tipoVisita) {
    alert("Selecione o tipo de visita.");
    return;
  }
  
  const dataStr = $("dataVisita").value;
  const horaStr = $("horaVisita").value;
  if (!dataStr || !horaStr) {
    alert("Informe data e hora da visita.");
    return;
  }
  
  showLoading(true);
  
  const dataHora = new Date(`${dataStr}T${horaStr}:00`);
  
  let rmUid = EMPRESA_SELECIONADA.rmUid || EMPRESA_SELECIONADA.rmId || EMPRESA_SELECIONADA.gerenteId || "";
  let rmNome = EMPRESA_SELECIONADA.rmNome || EMPRESA_SELECIONADA.gerenteNome || "";
  if (rmUid && !rmNome && RMS[rmUid]) rmNome = RMS[rmUid].nome;
  if (!rmUid) { rmUid = CTX.uid; rmNome = CTX.nome; }
  
  const ramos = {};
  Object.entries(RAMOS_DATA).forEach(([id, dados]) => {
    if (dados.abordado) {
      ramos[id] = {
        abordado: true,
        status: dados.status,
        interesse: dados.interesse,
        vencimento: dados.vencimento,
        seguradora: dados.seguradora,
        valorEstimado: dados.valorEstimado,
        concorrente: dados.concorrente,
        obs: dados.obs
      };
    }
  });
  
  const visita = {
    empresaId: EMPRESA_SELECIONADA.id,
    empresaNome: EMPRESA_SELECIONADA.nome || EMPRESA_SELECIONADA.razaoSocial,
    empresaCNPJ: EMPRESA_SELECIONADA.cnpj || null,
    cidade: EMPRESA_SELECIONADA.cidade || "",
    tipoVisita,
    dataHora,
    dataHoraTs: firebase.firestore.Timestamp.fromDate(dataHora),
    numFuncionarios: parseInt($("numFuncionarios").value) || null,
    contatos: CONTATOS,
    checklist: CHECKLIST_ITEMS,
    ramos,
    observacoes: $("observacoesGerais").value.trim(),
    duracao: TIMER_SECONDS,
    geolocalizacao: GEO_DATA,
    rmUid,
    rmNome,
    agenciaId: EMPRESA_SELECIONADA.agenciaId || CTX.agenciaId || "",
    criadoPorUid: CTX.uid,
    criadoPorNome: CTX.nome,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  try {
    await db.collection("visitas").add(visita);
    
    if (visita.numFuncionarios && EMPRESA_SELECIONADA.id) {
      try {
        await db.collection("empresas").doc(EMPRESA_SELECIONADA.id).update({
          numFuncionarios: visita.numFuncionarios,
          ultimaVisita: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) { console.warn("Erro ao atualizar empresa:", e); }
    }
    
    showLoading(false);
    alert("Visita registrada com sucesso!");
    
    const ramosComInteresseAlto = Object.entries(ramos).filter(([_, d]) => d.interesse === "alto");
    if (ramosComInteresseAlto.length > 0) {
      const criar = confirm(`Você marcou ${ramosComInteresseAlto.length} ramo(s) com interesse ALTO. Deseja criar cotações automaticamente?`);
      if (criar) {
        for (const [ramoId, _] of ramosComInteresseAlto) {
          COTACAO_RAMO = ramoId;
          await confirmarCriarCotacao();
        }
      }
    }
    
    if (confirm("Deseja registrar outra visita?")) {
      location.reload();
    } else {
      location.href = "painel.html";
    }
    
  } catch (e) {
    showLoading(false);
    console.error("Erro ao salvar visita:", e);
    alert("Erro ao salvar visita: " + e.message);
  }
}

// ==== Gerar Link para Cliente ====
function gerarLink() {
  if (!EMPRESA_SELECIONADA) {
    alert("Selecione uma empresa primeiro.");
    return;
  }
  
  let rmNome = EMPRESA_SELECIONADA.rmNome || EMPRESA_SELECIONADA.gerenteNome || '';
  const rmId = EMPRESA_SELECIONADA.rmUid || EMPRESA_SELECIONADA.rmId || EMPRESA_SELECIONADA.gerenteId;
  if (!rmNome && rmId && RMS[rmId]) rmNome = RMS[rmId].nome;
  
  const params = new URLSearchParams({
    empresaId: EMPRESA_SELECIONADA.id,
    empresaNome: EMPRESA_SELECIONADA.nome || EMPRESA_SELECIONADA.razaoSocial || '',
    rmNome: rmNome || CTX.nome || ''
  });
  
  const baseUrl = location.origin + location.pathname.replace('visitas.html', '');
  const url = `${baseUrl}visita-cliente.html?${params}`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      alert(`Link copiado!\n\nEnvie para o cliente preencher:\n${url}`);
    }).catch(() => {
      prompt("Copie o link abaixo:", url);
    });
  } else {
    prompt("Copie o link abaixo:", url);
  }
}

// ==== Globals ====
window.limparEmpresa = limparEmpresa;
window.toggleTimer = toggleTimer;
window.resetTimer = resetTimer;
window.capturarGeo = capturarGeo;
window.addContato = addContato;
window.removeContato = removeContato;
window.toggleChecklistItem = toggleChecklistItem;
window.toggleRamo = toggleRamo;
window.setRamoStatus = setRamoStatus;
window.setRamoInteresse = setRamoInteresse;
window.updateRamoField = updateRamoField;
window.formatarMoeda = formatarMoeda;
window.formatarData = formatarData;
window.abrirModalCotacao = abrirModalCotacao;
window.fecharModalCotacao = fecharModalCotacao;
window.confirmarCriarCotacao = confirmarCriarCotacao;
window.visualizarResumo = visualizarResumo;
window.fecharResumo = fecharResumo;
window.confirmarSalvar = confirmarSalvar;
window.salvarVisita = salvarVisita;
window.gerarLink = gerarLink;

// NOVOS EXPORTS para modal de detalhes
window.verDetalhesVisita = verDetalhesVisita;
window.fecharDetalhesVisita = fecharDetalhesVisita;
window.duplicarVisita = duplicarVisita;
