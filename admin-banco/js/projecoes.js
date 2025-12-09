// ================================================================================
// SISTEMA DE PROJEÇÕES E METAS - RETORNO SEGUROS v2.3
// ================================================================================

console.log("=== Projecoes.js v2.3 ===");

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const RAMOS_CONFIG = {
  'saude-funcionarios': { id: 'saude-funcionarios', nome: 'Saúde Funcionários', icon: '🏥', cor: '#ef4444', ticketMedio: 400, unidade: 'vida', campoAuto: 'funcionariosQtd', visitaStatus: 'saude', checklist: [{ id: 1, texto: 'Tem ou não tem seguro', auto: true, prazo: 5, fonte: 'visita' }, { id: 2, texto: 'Planilha nascimento funcionários', auto: false, prazo: 8 }, { id: 3, texto: 'Cotação enviada por e-mail', auto: false, prazo: 12 }, { id: 4, texto: 'Confirmação recebimento', auto: false, prazo: 18 }, { id: 5, texto: 'FECHADO', auto: false, prazo: 25, final: true }] },
  'saude-socios': { id: 'saude-socios', nome: 'Saúde Sócios', icon: '🏥', cor: '#dc2626', ticketMedio: 800, unidade: 'vida', visitaStatus: 'saude', checklist: [{ id: 1, texto: 'Tem ou não tem seguro', auto: true, prazo: 5, fonte: 'visita' }, { id: 2, texto: 'Planilha nascimento sócios', auto: false, prazo: 8 }, { id: 3, texto: 'Cotação enviada', auto: false, prazo: 12 }, { id: 4, texto: 'Confirmação recebimento', auto: false, prazo: 18 }, { id: 5, texto: 'FECHADO', auto: false, prazo: 25, final: true }] },
  'dental-funcionarios': { id: 'dental-funcionarios', nome: 'Dental Funcionários', icon: '🦷', cor: '#3b82f6', ticketMedio: 18.5, unidade: 'vida', campoAuto: 'funcionariosQtd', visitaStatus: 'dental', checklist: [{ id: 1, texto: 'Funcionários mapeados', auto: true, prazo: 5, fonte: 'funcionarios' }, { id: 2, texto: 'Cotação enviada', auto: false, prazo: 10 }, { id: 3, texto: 'Tentativa agenda RH', auto: false, prazo: 15 }, { id: 4, texto: 'Contato interesse', auto: false, prazo: 20 }, { id: 5, texto: 'FECHADO', auto: false, prazo: 25, final: true }] },
  'dental-socios': { id: 'dental-socios', nome: 'Dental Sócios', icon: '🦷', cor: '#2563eb', ticketMedio: 35, unidade: 'vida', visitaStatus: 'dental', checklist: [{ id: 1, texto: 'Sócios identificados', auto: false, prazo: 5 }, { id: 2, texto: 'Cotação enviada', auto: false, prazo: 10 }, { id: 3, texto: 'Agenda tentativa', auto: false, prazo: 15 }, { id: 4, texto: 'Confirmação interesse', auto: false, prazo: 20 }, { id: 5, texto: 'FECHADO', auto: false, prazo: 25, final: true }] },
  'vida-global-funcionarios': { id: 'vida-global-funcionarios', nome: 'Vida Funcionários', icon: '👥', cor: '#8b5cf6', ticketMedio: 25, unidade: 'vida', campoAuto: 'funcionariosQtd', visitaStatus: 'vida-global', checklist: [{ id: 1, texto: 'Funcionários mapeados', auto: true, prazo: 5, fonte: 'funcionarios' }, { id: 2, texto: 'Cotação enviada', auto: false, prazo: 12 }, { id: 3, texto: 'Confirmação recebimento', auto: false, prazo: 18 }, { id: 4, texto: 'FECHADO', auto: false, prazo: 25, final: true }] },
  'pessoa-chave': { id: 'pessoa-chave', nome: 'Pessoa Chave', icon: '👔', cor: '#a855f7', ticketMedio: 150, unidade: 'apólice', visitaStatus: 'vida', checklist: [{ id: 1, texto: 'Envio CNPJ, nasc, %, PL', auto: false, prazo: 5 }, { id: 2, texto: 'Cotação enviada', auto: false, prazo: 12 }, { id: 3, texto: 'Confirmação', auto: false, prazo: 18 }, { id: 4, texto: 'FECHADO', auto: false, prazo: 25, final: true }] },
  'frota': { id: 'frota', nome: 'Frota', icon: '🚗', cor: '#f59e0b', ticketMedio: 1500, unidade: 'veículo', visitaStatus: 'frota', checklist: [{ id: 1, texto: 'Venc/prêmio mapeado', auto: true, prazo: 5, fonte: 'visita' }, { id: 2, texto: 'Planilha frota', auto: false, prazo: 8 }, { id: 3, texto: 'Apólice atual', auto: false, prazo: 12 }, { id: 4, texto: 'Cotação mês venc', auto: false, prazo: 18 }, { id: 5, texto: 'Confirmação', auto: false, prazo: 22 }, { id: 6, texto: 'FECHADO', auto: false, prazo: 25, final: true }] },
  'empresarial-patrimonial': { id: 'empresarial-patrimonial', nome: 'Patrimonial', icon: '🏢', cor: '#10b981', ticketMedio: 5000, unidade: 'apólice', visitaStatus: 'patrimonial', checklist: [{ id: 1, texto: 'Venc/prêmio mapeado', auto: true, prazo: 5, fonte: 'visita' }, { id: 2, texto: 'Apólice atual', auto: false, prazo: 10 }, { id: 3, texto: 'Cotação mês venc', auto: false, prazo: 18 }, { id: 4, texto: 'Confirmação', auto: false, prazo: 22 }, { id: 5, texto: 'FECHADO', auto: false, prazo: 25, final: true }] },
  'equipamentos': { id: 'equipamentos', nome: 'Equipamentos', icon: '🔧', cor: '#64748b', ticketMedio: 3000, unidade: 'apólice', visitaStatus: 'equipamentos', checklist: [{ id: 1, texto: 'Venc mapeado', auto: true, prazo: 5, fonte: 'visita' }, { id: 2, texto: 'Lista equipamentos', auto: false, prazo: 10 }, { id: 3, texto: 'Cotação', auto: false, prazo: 18 }, { id: 4, texto: 'Confirmação', auto: false, prazo: 22 }, { id: 5, texto: 'FECHADO', auto: false, prazo: 25, final: true }] },
  'garantia': { id: 'garantia', nome: 'Garantia', icon: '📋', cor: '#14b8a6', ticketMedio: 15000, unidade: 'contrato', visitaStatus: 'garantia', checklist: [{ id: 1, texto: 'Necessidade', auto: false, prazo: 5 }, { id: 2, texto: 'Documentação', auto: false, prazo: 10 }, { id: 3, texto: 'Cotação', auto: false, prazo: 15 }, { id: 4, texto: 'Confirmação', auto: false, prazo: 20 }, { id: 5, texto: 'FECHADO', auto: false, prazo: 25, final: true }] },
  'transporte': { id: 'transporte', nome: 'Transporte', icon: '🚚', cor: '#f97316', ticketMedio: 2000, unidade: 'embarque', visitaStatus: 'transporte', checklist: [{ id: 1, texto: 'Necessidade', auto: false, prazo: 5 }, { id: 2, texto: 'Cotação', auto: false, prazo: 12 }, { id: 3, texto: 'Interesse', auto: false, prazo: 18 }, { id: 4, texto: 'FECHADO', auto: false, prazo: 25, final: true }] },
  'rc': { id: 'rc', nome: 'RC Profissional', icon: '⚖️', cor: '#6366f1', ticketMedio: 5000, unidade: 'apólice', visitaStatus: 'rc', checklist: [{ id: 1, texto: 'Necessidade', auto: false, prazo: 5 }, { id: 2, texto: 'Questionário', auto: false, prazo: 10 }, { id: 3, texto: 'Cotação', auto: false, prazo: 15 }, { id: 4, texto: 'Confirmação', auto: false, prazo: 20 }, { id: 5, texto: 'FECHADO', auto: false, prazo: 25, final: true }] }
};

let CTX = { uid: null, perfil: null, agenciaId: null, nome: null, isAdmin: false };
let ESTADO = { ano: 2026, agenciaId: null, qtdGerentes: 4, ramosSelecionados: [], metas: {}, planejamentoId: null, distribuicao: {} };
let CACHE = { empresas: [], gerentes: [], visitas: {}, agencias: [], planejamentos: [], checklistsData: [] };

const $ = id => document.getElementById(id);
const normalizar = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const toBRL = n => !Number.isFinite(n) ? "R$ 0" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const toBRLCompact = n => { if (!Number.isFinite(n)) return "R$ 0"; if (n >= 1000000) return "R$ "+(n/1000000).toFixed(1)+"M"; if (n >= 1000) return "R$ "+(n/1000).toFixed(0)+"K"; return toBRL(n); };
const parseBRL = str => { const n = parseFloat(String(str || "").replace(/[^\d,.-]/g, "").replace(".", "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const getIniciais = nome => { if (!nome) return "?"; const p = nome.trim().split(/\s+/); return p.length === 1 ? p[0].substring(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase(); };
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// AUTH
auth.onAuthStateChanged(async user => {
  if (!user) return location.href = "login.html";
  CTX.uid = user.uid;
  try {
    const snap = await db.collection("usuarios_banco").doc(user.uid).get();
    if (snap.exists) {
      const d = snap.data();
      CTX.perfil = normalizar(d.perfil || "");
      CTX.agenciaId = d.agenciaId || null;
      CTX.nome = d.nome || user.email;
      CTX.isAdmin = CTX.perfil === "admin";
    }
  } catch (e) { console.error("[AUTH]", e); }
  $("userName").textContent = CTX.nome;
  $("userRole").textContent = CTX.perfil;
  $("userAvatar").textContent = getIniciais(CTX.nome);
  await initSistema();
});

// INIT
async function initSistema() {
  // Tabs
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      $('tab-' + tab)?.classList.add('active');
      if (tab === 'leads') carregarLeads();
      if (tab === 'checklist') renderizarChecklists();
      if (tab === 'distribuicao') gerarDistribuicao();
    });
  });
  
  await carregarAgencias();
  renderizarRamos();
  
  $('qtdGerentes').addEventListener('change', atualizarCalculos);
  $('selAgencia').addEventListener('change', async () => {
    ESTADO.agenciaId = $('selAgencia').value;
    await Promise.all([carregarEmpresas(), carregarGerentes(), carregarPlanejamentos()]);
  });
  $('selAno').addEventListener('change', async () => {
    ESTADO.ano = parseInt($('selAno').value);
    await carregarPlanejamento();
  });
  
  $('filtroGerente')?.addEventListener('change', () => gerarDistribuicao());
  $('filtroRamo')?.addEventListener('change', () => gerarDistribuicao());
  $('filtroGerenteCheck')?.addEventListener('change', () => renderizarChecklists());
  $('filtroMesCheck')?.addEventListener('change', () => renderizarChecklists());
  $('filtroRamoCheck')?.addEventListener('change', () => renderizarChecklists());
}

async function carregarAgencias() {
  const sel = $('selAgencia');
  try {
    if (CTX.isAdmin) {
      const snap = await db.collection('agencias_banco').get();
      snap.forEach(doc => {
        CACHE.agencias.push({ id: doc.id, ...doc.data() });
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = doc.data().nome || doc.id;
        sel.appendChild(opt);
      });
    } else if (CTX.agenciaId) {
      const doc = await db.collection('agencias_banco').doc(CTX.agenciaId).get();
      if (doc.exists) {
        CACHE.agencias.push({ id: doc.id, ...doc.data() });
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = doc.data().nome || doc.id;
        sel.appendChild(opt);
        sel.value = doc.id;
        ESTADO.agenciaId = doc.id;
        await Promise.all([carregarEmpresas(), carregarGerentes(), carregarPlanejamentos()]);
      }
    }
  } catch (e) { console.error("[carregarAgencias]", e); }
}

async function carregarEmpresas() {
  if (!ESTADO.agenciaId) return;
  try {
    const snap = await db.collection('empresas').where('agenciaId', '==', ESTADO.agenciaId).get();
    CACHE.empresas = [];
    snap.forEach(doc => CACHE.empresas.push({ id: doc.id, ...doc.data() }));
    await carregarVisitas();
  } catch (e) { console.error("[carregarEmpresas]", e); }
}

async function carregarVisitas() {
  CACHE.visitas = {};
  for (const emp of CACHE.empresas) {
    try {
      const snap = await db.collection('visitas').where('empresaId', '==', emp.id).orderBy('dataHora', 'desc').limit(1).get();
      if (!snap.empty) CACHE.visitas[emp.id] = snap.docs[0].data();
    } catch (e) { }
  }
}

async function carregarGerentes() {
  if (!ESTADO.agenciaId) return;
  try {
    const snap = await db.collection('usuarios_banco').where('agenciaId', '==', ESTADO.agenciaId).get();
    CACHE.gerentes = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (normalizar(d.perfil) === 'rm') CACHE.gerentes.push({ id: doc.id, ...d });
    });
    if (CACHE.gerentes.length > 0) {
      $('qtdGerentes').value = CACHE.gerentes.length;
      ESTADO.qtdGerentes = CACHE.gerentes.length;
    }
    preencherFiltros();
  } catch (e) { console.error("[carregarGerentes]", e); }
}

function preencherFiltros() {
  ['filtroGerente', 'filtroGerenteCheck', 'filtroGerenteLeads'].forEach(id => {
    const sel = $(id);
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    CACHE.gerentes.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.nome;
      sel.appendChild(opt);
    });
  });
  const selMes = $('filtroMesCheck');
  if (selMes) {
    while (selMes.options.length > 1) selMes.remove(1);
    MESES.forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i + 1;
      opt.textContent = m;
      selMes.appendChild(opt);
    });
  }
  atualizarFiltroRamos();
}

function atualizarFiltroRamos() {
  ['filtroRamo', 'filtroRamoCheck'].forEach(id => {
    const sel = $(id);
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    ESTADO.ramosSelecionados.forEach(ramoId => {
      const ramo = RAMOS_CONFIG[ramoId];
      if (ramo) {
        const opt = document.createElement('option');
        opt.value = ramoId;
        opt.textContent = ramo.icon + ' ' + ramo.nome;
        sel.appendChild(opt);
      }
    });
  });
}

// PLANEJAMENTOS
async function carregarPlanejamentos() {
  if (!ESTADO.agenciaId) return;
  try {
    const snap = await db.collection('projecoes').where('agenciaId', '==', ESTADO.agenciaId).get();
    CACHE.planejamentos = [];
    snap.forEach(doc => CACHE.planejamentos.push({ id: doc.id, ...doc.data() }));
    renderizarPlanejamentosSalvos();
    await carregarPlanejamento();
  } catch (e) { console.error("[carregarPlanejamentos]", e); }
}

function renderizarPlanejamentosSalvos() {
  const container = $('planejamentosSalvos');
  if (!container) return;
  
  if (CACHE.planejamentos.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Nenhum planejamento salvo para esta agência</p>';
    return;
  }
  
  let html = '<div class="planejamentos-lista">';
  CACHE.planejamentos.forEach(plan => {
    const ramosNomes = (plan.ramosSelecionados || []).map(r => {
      const ramo = RAMOS_CONFIG[r];
      return ramo ? ramo.icon + ' ' + ramo.nome : r;
    }).join(', ');
    const totalMeta = Object.values(plan.metas || {}).reduce((s, m) => s + (m.anual || 0), 0);
    const isAtivo = plan.ano === ESTADO.ano;
    
    html += `
      <div class="planejamento-item ${isAtivo ? 'ativo' : ''}">
        <div style="flex:1">
          <div class="planejamento-ano">${plan.ano}</div>
          <div class="planejamento-ramos">${ramosNomes || 'Sem ramos'}</div>
          <div class="planejamento-meta">Meta Total: ${toBRLCompact(totalMeta)}/ano</div>
        </div>
        <div class="planejamento-acoes">
          <button class="btn btn-secondary btn-sm" onclick="editarPlanejamento('${plan.id}')">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="excluirPlanejamento('${plan.id}')">🗑️</button>
        </div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

async function editarPlanejamento(planId) {
  const plan = CACHE.planejamentos.find(p => p.id === planId);
  if (!plan) return;
  
  ESTADO.planejamentoId = plan.id;
  ESTADO.ano = plan.ano;
  ESTADO.ramosSelecionados = plan.ramosSelecionados || [];
  ESTADO.metas = plan.metas || {};
  ESTADO.qtdGerentes = plan.qtdGerentes || 4;
  ESTADO.distribuicao = plan.distribuicao || {};
  
  $('selAno').value = plan.ano;
  $('qtdGerentes').value = plan.qtdGerentes;
  
  document.querySelectorAll('.ramo-item').forEach(item => {
    item.classList.remove('selected');
    item.querySelector('input').value = '';
  });
  restaurarSelecoes();
  renderizarPlanejamentosSalvos();
}

async function excluirPlanejamento(planId) {
  if (!confirm('Excluir este planejamento e todos os checklists relacionados?')) return;
  try {
    await db.collection('projecoes').doc(planId).delete();
    const checksSnap = await db.collection('projecoes-checklist').where('projecaoId', '==', planId).get();
    const batch = db.batch();
    checksSnap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    if (ESTADO.planejamentoId === planId) {
      limparMetas();
    }
    await carregarPlanejamentos();
    alert('Planejamento excluído!');
  } catch (e) { console.error(e); alert('Erro: ' + e.message); }
}

async function carregarPlanejamento() {
  if (!ESTADO.agenciaId) return;
  const plan = CACHE.planejamentos.find(p => p.ano === ESTADO.ano);
  if (plan) {
    ESTADO.planejamentoId = plan.id;
    ESTADO.ramosSelecionados = plan.ramosSelecionados || [];
    ESTADO.metas = plan.metas || {};
    ESTADO.qtdGerentes = plan.qtdGerentes || 4;
    ESTADO.distribuicao = plan.distribuicao || {};
    $('qtdGerentes').value = ESTADO.qtdGerentes;
    restaurarSelecoes();
  } else {
    ESTADO.planejamentoId = null;
    ESTADO.ramosSelecionados = [];
    ESTADO.metas = {};
    ESTADO.distribuicao = {};
    document.querySelectorAll('.ramo-item').forEach(item => {
      item.classList.remove('selected');
      item.querySelector('input').value = '';
    });
    atualizarTotalBar();
    atualizarFiltroRamos();
  }
  renderizarPlanejamentosSalvos();
}

// RAMOS
function renderizarRamos() {
  const container = $('ramosGrid');
  container.innerHTML = '';
  Object.values(RAMOS_CONFIG).forEach(ramo => {
    const div = document.createElement('div');
    div.className = 'ramo-item';
    div.setAttribute('data-ramo', ramo.id);
    div.innerHTML = `
      <div class="ramo-check">✓</div>
      <div class="ramo-icon">${ramo.icon}</div>
      <div class="ramo-info">
        <div class="ramo-name">${ramo.nome}</div>
        <div class="ramo-desc">Ticket: ${toBRL(ramo.ticketMedio)}/${ramo.unidade}</div>
      </div>
      <div class="ramo-meta">
        <input type="text" placeholder="R$ 0" data-ramo="${ramo.id}" onchange="atualizarMeta('${ramo.id}')" onblur="formatarInputMoeda(this)">
      </div>
    `;
    div.addEventListener('click', e => { if (e.target.tagName !== 'INPUT') toggleRamo(ramo.id); });
    container.appendChild(div);
  });
}

function toggleRamo(ramoId) {
  const item = document.querySelector(`.ramo-item[data-ramo="${ramoId}"]`);
  if (!item) return;
  const idx = ESTADO.ramosSelecionados.indexOf(ramoId);
  if (idx >= 0) {
    ESTADO.ramosSelecionados.splice(idx, 1);
    item.classList.remove('selected');
  } else {
    ESTADO.ramosSelecionados.push(ramoId);
    item.classList.add('selected');
  }
  atualizarTotalBar();
  atualizarFiltroRamos();
}

function restaurarSelecoes() {
  ESTADO.ramosSelecionados.forEach(ramoId => {
    const item = document.querySelector(`.ramo-item[data-ramo="${ramoId}"]`);
    if (item) {
      item.classList.add('selected');
      const input = item.querySelector('input');
      if (input && ESTADO.metas[ramoId]?.anual) {
        input.value = toBRL(ESTADO.metas[ramoId].anual);
      }
    }
  });
  atualizarTotalBar();
  atualizarCalculos();
  atualizarFiltroRamos();
}

function atualizarMeta(ramoId) {
  const input = document.querySelector(`input[data-ramo="${ramoId}"]`);
  if (!input) return;
  const valor = parseBRL(input.value);
  if (!ESTADO.metas[ramoId]) ESTADO.metas[ramoId] = {};
  ESTADO.metas[ramoId].anual = valor;
  if (valor > 0 && !ESTADO.ramosSelecionados.includes(ramoId)) {
    ESTADO.ramosSelecionados.push(ramoId);
    document.querySelector(`.ramo-item[data-ramo="${ramoId}"]`)?.classList.add('selected');
  }
  atualizarCalculos();
}

function atualizarCalculos() {
  ESTADO.qtdGerentes = parseInt($('qtdGerentes').value) || 4;
  ESTADO.ramosSelecionados.forEach(ramoId => {
    const ramo = RAMOS_CONFIG[ramoId];
    if (!ramo) return;
    const metaAnual = ESTADO.metas[ramoId]?.anual || 0;
    ESTADO.metas[ramoId] = {
      anual: metaAnual,
      mensal: metaAnual / 12,
      porGerente: metaAnual / 12 / ESTADO.qtdGerentes,
      vidasMes: Math.ceil((metaAnual / 12) / ramo.ticketMedio)
    };
  });
  atualizarTotalBar();
}

function atualizarTotalBar() {
  const total = ESTADO.ramosSelecionados.reduce((s, r) => s + (ESTADO.metas[r]?.anual || 0), 0);
  const bar = $('totalBar');
  if (total > 0) {
    bar.style.display = 'flex';
    $('totalAnual').textContent = toBRL(total);
  } else {
    bar.style.display = 'none';
  }
}

function formatarInputMoeda(input) {
  const v = parseBRL(input.value);
  if (v > 0) input.value = toBRL(v);
}

function limparMetas() {
  ESTADO.metas = {};
  ESTADO.ramosSelecionados = [];
  ESTADO.planejamentoId = null;
  ESTADO.distribuicao = {};
  document.querySelectorAll('.ramo-item').forEach(item => {
    item.classList.remove('selected');
    item.querySelector('input').value = '';
  });
  atualizarTotalBar();
  atualizarFiltroRamos();
}

// SALVAR
async function salvarEGerarPlanejamento() {
  if (!ESTADO.agenciaId) return alert('Selecione uma agência');
  if (ESTADO.ramosSelecionados.length === 0) return alert('Selecione pelo menos um ramo');
  const temMeta = ESTADO.ramosSelecionados.some(r => ESTADO.metas[r]?.anual > 0);
  if (!temMeta) return alert('Defina pelo menos uma meta');
  
  try {
    const dados = {
      ano: ESTADO.ano,
      agenciaId: ESTADO.agenciaId,
      qtdGerentes: ESTADO.qtdGerentes,
      ramosSelecionados: ESTADO.ramosSelecionados,
      metas: ESTADO.metas,
      distribuicao: ESTADO.distribuicao,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoPor: CTX.uid
    };
    
    if (ESTADO.planejamentoId) {
      await db.collection('projecoes').doc(ESTADO.planejamentoId).update(dados);
    } else {
      dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
      dados.criadoPor = CTX.uid;
      const ref = await db.collection('projecoes').add(dados);
      ESTADO.planejamentoId = ref.id;
    }
    
    await carregarPlanejamentos();
    alert('Planejamento salvo!');
  } catch (e) {
    console.error("[salvar]", e);
    alert('Erro: ' + e.message);
  }
}

// DISTRIBUIÇÃO
function gerarDistribuicao() {
  const container = $('distribuicaoContent');
  const filtroGerente = $('filtroGerente')?.value;
  const filtroRamo = $('filtroRamo')?.value;
  
  if (ESTADO.ramosSelecionados.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">Nenhum planejamento</div><p>Configure as metas primeiro</p></div>';
    return;
  }
  
  let gerentesExibir = CACHE.gerentes;
  if (filtroGerente) gerentesExibir = CACHE.gerentes.filter(g => g.id === filtroGerente);
  
  if (gerentesExibir.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">Nenhum gerente</div></div>';
    return;
  }
  
  let ramosExibir = ESTADO.ramosSelecionados;
  if (filtroRamo) ramosExibir = [filtroRamo];
  
  let html = '';
  gerentesExibir.forEach(gerente => {
    const empresasGerente = CACHE.empresas.filter(e => e.rmUid === gerente.id);
    
    html += `
      <div class="card" style="margin-bottom:24px">
        <div class="card-header">
          <div class="card-title">
            <div class="card-icon" style="background:var(--accent-bg)">${getIniciais(gerente.nome)}</div>
            <div>
              <div>${gerente.nome}</div>
              <div style="font-size:12px;color:var(--text-muted)">${empresasGerente.length} empresas</div>
            </div>
          </div>
          <button class="btn btn-secondary" onclick="sortearEmpresas('${gerente.id}')">🎲 Sortear</button>
        </div>
        <div class="months-grid">
    `;
    
    MESES.forEach((mes, idx) => {
      const mesNum = idx + 1;
      html += `
        <div class="month-card">
          <div class="month-header">
            <div class="month-name">${mes}</div>
            <div class="month-meta">${ESTADO.ano}</div>
          </div>
          <div class="month-body">
      `;
      
      ramosExibir.forEach(ramoId => {
        const ramo = RAMOS_CONFIG[ramoId];
        const meta = ESTADO.metas[ramoId];
        if (!ramo || !meta) return;
        
        const empresasSalvas = ESTADO.distribuicao?.[gerente.id]?.[mesNum]?.[ramoId] || [];
        
        html += `
          <div class="month-ramo">
            <div class="month-ramo-header">
              <div class="month-ramo-title"><span>${ramo.icon}</span><span>${ramo.nome}</span></div>
              <div class="month-ramo-meta">Meta: ${toBRLCompact(meta.porGerente)}/mês</div>
            </div>
            <div class="empresas-slots">
        `;
        
        for (let i = 0; i < 3; i++) {
          const slotId = `${gerente.id}-${mesNum}-${ramoId}-${i}`;
          const empresaId = empresasSalvas[i];
          const empresa = empresaId ? CACHE.empresas.find(e => e.id === empresaId) : null;
          
          if (empresa) {
            const func = empresa.funcionariosQtd || empresa.numFuncionarios || 0;
            const potencial = func > 0 ? func * ramo.ticketMedio : ramo.ticketMedio;
            html += `
              <div class="empresa-slot filled" data-slot="${slotId}" data-empresa="${empresa.id}" onclick="abrirSeletorEmpresa('${slotId}','${ramoId}','${gerente.id}')">
                <div class="slot-number">✓</div>
                <div class="slot-content">
                  <div class="slot-empresa">${empresa.nome}</div>
                  <div class="slot-potencial">${toBRLCompact(potencial)}/mês${func > 0 ? ' • ' + func + ' func.' : ''}</div>
                </div>
              </div>
            `;
          } else {
            html += `
              <div class="empresa-slot" data-slot="${slotId}" onclick="abrirSeletorEmpresa('${slotId}','${ramoId}','${gerente.id}')">
                <div class="slot-number">${i + 1}</div>
                <div class="slot-content">
                  <div class="slot-empresa">Selecionar empresa...</div>
                </div>
              </div>
            `;
          }
        }
        html += '</div></div>';
      });
      
      html += '</div></div>';
    });
    
    html += `
        </div>
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">
          <button class="btn btn-primary" onclick="salvarDistribuicaoGerente('${gerente.id}')">💾 Salvar Distribuição</button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function sortearEmpresas(gerenteId) {
  const gerente = CACHE.gerentes.find(g => g.id === gerenteId);
  if (!gerente) return;
  
  const empresasGerente = CACHE.empresas.filter(e => e.rmUid === gerenteId);
  if (empresasGerente.length === 0) {
    alert('Este gerente não possui empresas');
    return;
  }
  
  if (!ESTADO.distribuicao[gerenteId]) ESTADO.distribuicao[gerenteId] = {};
  
  ESTADO.ramosSelecionados.forEach(ramoId => {
    const embaralhadas = shuffle(empresasGerente);
    let idx = 0;
    for (let mes = 1; mes <= 12; mes++) {
      if (!ESTADO.distribuicao[gerenteId][mes]) ESTADO.distribuicao[gerenteId][mes] = {};
      ESTADO.distribuicao[gerenteId][mes][ramoId] = [];
      for (let slot = 0; slot < 3; slot++) {
        if (idx < embaralhadas.length) {
          ESTADO.distribuicao[gerenteId][mes][ramoId].push(embaralhadas[idx].id);
          idx++;
        }
      }
      if (idx >= embaralhadas.length) idx = 0;
    }
  });
  
  gerarDistribuicao();
  alert('Empresas sorteadas para ' + gerente.nome + '! Salve para confirmar.');
}

async function salvarDistribuicaoGerente(gerenteId) {
  if (!ESTADO.planejamentoId) {
    alert('Salve o planejamento primeiro na aba "Configurar Metas"');
    return;
  }
  
  try {
    await db.collection('projecoes').doc(ESTADO.planejamentoId).update({
      distribuicao: ESTADO.distribuicao,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    await gerarChecklistsGerente(gerenteId);
    alert('Distribuição salva e checklists gerados!');
  } catch (e) {
    console.error("[salvarDistribuicaoGerente]", e);
    alert('Erro: ' + e.message);
  }
}

async function gerarChecklistsGerente(gerenteId) {
  const distGerente = ESTADO.distribuicao[gerenteId];
  if (!distGerente) return;
  
  const gerente = CACHE.gerentes.find(g => g.id === gerenteId);
  const batch = db.batch();
  
  for (const [mes, ramos] of Object.entries(distGerente)) {
    for (const [ramoId, empresaIds] of Object.entries(ramos)) {
      const ramoConfig = RAMOS_CONFIG[ramoId];
      if (!ramoConfig) continue;
      
      for (const empresaId of empresaIds) {
        if (!empresaId) continue;
        
        const empresa = CACHE.empresas.find(e => e.id === empresaId);
        const visita = CACHE.visitas[empresaId];
        const checklistId = `${ESTADO.ano}-${mes}-${empresaId}-${ramoId}`;
        
        const checksStatus = {};
        ramoConfig.checklist.forEach(item => {
          if (item.auto) {
            let autoConcluido = false;
            if (item.fonte === 'funcionarios') {
              autoConcluido = (empresa?.funcionariosQtd || empresa?.numFuncionarios || 0) > 0;
            } else if (item.fonte === 'visita') {
              autoConcluido = !!visita?.ramos?.[ramoConfig.visitaStatus];
            }
            checksStatus[item.id] = { concluido: autoConcluido, auto: true, concluidoEm: autoConcluido ? new Date() : null };
          } else {
            checksStatus[item.id] = { concluido: false, auto: false, concluidoEm: null };
          }
        });
        
        const checklistDoc = {
          id: checklistId,
          ano: ESTADO.ano,
          mes: parseInt(mes),
          empresaId,
          empresaNome: empresa?.nome || '',
          ramoId,
          ramoNome: ramoConfig.nome,
          gerenteId,
          gerenteNome: gerente?.nome || '',
          agenciaId: ESTADO.agenciaId,
          projecaoId: ESTADO.planejamentoId,
          checks: checksStatus,
          criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        batch.set(db.collection('projecoes-checklist').doc(checklistId), checklistDoc, { merge: true });
      }
    }
  }
  
  await batch.commit();
}

// MODAL EMPRESA
let SLOT_ATUAL = null, RAMO_ATUAL = null, GERENTE_ATUAL = null, EMP_SELECIONADA = null;

function abrirSeletorEmpresa(slotId, ramoId, gerenteId) {
  SLOT_ATUAL = slotId;
  RAMO_ATUAL = ramoId;
  GERENTE_ATUAL = gerenteId;
  EMP_SELECIONADA = null;
  renderizarListaEmpresas();
  $('modalEmpresa').classList.add('active');
}

function fecharModalEmpresa() {
  $('modalEmpresa').classList.remove('active');
}

function renderizarListaEmpresas(filtro = '') {
  const container = $('empresaList');
  const ramo = RAMOS_CONFIG[RAMO_ATUAL];
  
  let lista = CACHE.empresas
    .filter(e => e.rmUid === GERENTE_ATUAL)
    .filter(e => !filtro || e.nome?.toLowerCase().includes(filtro.toLowerCase()))
    .map(emp => {
      const visita = CACHE.visitas[emp.id];
      const func = emp.funcionariosQtd || emp.numFuncionarios || 0;
      let status = visita?.ramos?.[ramo.visitaStatus]?.status || 'nao-mapeado';
      let potencial = ramo.campoAuto && func > 0 ? func * ramo.ticketMedio : ramo.ticketMedio;
      return { ...emp, potencial, status, funcionarios: func };
    });
  
  lista.sort((a, b) => b.potencial - a.potencial);
  
  if (lista.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhuma empresa deste gerente</p></div>';
    return;
  }
  
  container.innerHTML = lista.slice(0, 50).map(e => `
    <div class="empresa-option" data-id="${e.id}" onclick="selecionarEmpresaModal('${e.id}')">
      <div style="flex:1">
        <div style="font-weight:600">${e.nome}</div>
        <div style="font-size:12px;color:var(--text-muted)">${e.funcionarios > 0 ? e.funcionarios + ' func. • ' : ''}Potencial: ${toBRLCompact(e.potencial)}/mês</div>
      </div>
    </div>
  `).join('');
}

function filtrarEmpresasModal() {
  renderizarListaEmpresas($('buscaEmpresa').value);
}

function selecionarEmpresaModal(id) {
  document.querySelectorAll('.empresa-option.selected').forEach(el => el.classList.remove('selected'));
  document.querySelector(`.empresa-option[data-id="${id}"]`)?.classList.add('selected');
  EMP_SELECIONADA = id;
}

function confirmarEmpresa() {
  if (!EMP_SELECIONADA || !SLOT_ATUAL) return alert('Selecione uma empresa');
  
  const emp = CACHE.empresas.find(e => e.id === EMP_SELECIONADA);
  if (!emp) return;
  
  const ramo = RAMOS_CONFIG[RAMO_ATUAL];
  const func = emp.funcionariosQtd || emp.numFuncionarios || 0;
  const potencial = func > 0 ? func * ramo.ticketMedio : ramo.ticketMedio;
  
  const slot = document.querySelector(`[data-slot="${SLOT_ATUAL}"]`);
  if (slot) {
    slot.classList.add('filled');
    slot.innerHTML = `
      <div class="slot-number">✓</div>
      <div class="slot-content">
        <div class="slot-empresa">${emp.nome}</div>
        <div class="slot-potencial">${toBRLCompact(potencial)}/mês${func > 0 ? ' • ' + func + ' func.' : ''}</div>
      </div>
    `;
    slot.setAttribute('data-empresa', emp.id);
  }
  
  const [gerenteId, mes, ramoId, slotIdx] = SLOT_ATUAL.split('-');
  const mesNum = parseInt(mes);
  const slotNum = parseInt(slotIdx);
  
  if (!ESTADO.distribuicao[gerenteId]) ESTADO.distribuicao[gerenteId] = {};
  if (!ESTADO.distribuicao[gerenteId][mesNum]) ESTADO.distribuicao[gerenteId][mesNum] = {};
  if (!ESTADO.distribuicao[gerenteId][mesNum][ramoId]) ESTADO.distribuicao[gerenteId][mesNum][ramoId] = [];
  ESTADO.distribuicao[gerenteId][mesNum][ramoId][slotNum] = emp.id;
  
  fecharModalEmpresa();
}
="color:#64748b;font-size:12px">Em Andamento</div>
        </div>
        <div style="flex:1;background:#fef2f2;border-radius:10px;padding:16px;text-align:center;border-left:4px solid #ef4444">
          <div style="font-size:32px;font-weight:700;color:#ef4444">${atrasados}</div>
          <div style="color:#64748b;font-size:12px">Com Atraso</div>
        </div>
      </div>
  `;
  
  // Agrupar por mês
  const porMes = {};
  CACHE.checklistsData.forEach(data => {
    if (!porMes[data.mes]) porMes[data.mes] = [];
    porMes[data.mes].push(data);
  });
  
  Object.keys(porMes).sort((a, b) => a - b).forEach(mes => {
    htmlPDF += `<h2 style="color:#1e3a5f;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin:25px 0 15px;font-size:18px">${MESES[mes - 1]} ${ESTADO.ano}</h2>`;
    htmlPDF += `<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:10px;text-align:left;border:1px solid #e2e8f0;font-weight:600">Empresa</th>
          <th style="padding:10px;text-align:left;border:1px solid #e2e8f0;font-weight:600">Ramo</th>
          <th style="padding:10px;text-align:center;border:1px solid #e2e8f0;font-weight:600;width:120px">Progresso</th>
          <th style="padding:10px;text-align:left;border:1px solid #e2e8f0;font-weight:600">Etapas</th>
        </tr>
      </thead>
      <tbody>`;
    
    porMes[mes].forEach(data => {
      const ramoConfig = RAMOS_CONFIG[data.ramoId];
      if (!ramoConfig) return;
      
      const totalChecks = ramoConfig.checklist.length;
      const checksConcluidos = Object.values(data.checks || {}).filter(c => c.concluido).length;
      const progresso = Math.round((checksConcluidos / totalChecks) * 100);
      const temAtraso = ramoConfig.checklist.some(item => !data.checks?.[item.id]?.concluido && new Date().getDate() > item.prazo);
      
      let barColor = '#3b82f6';
      if (progresso >= 100) barColor = '#10b981';
      else if (progresso >= 50) barColor = '#f59e0b';
      else if (progresso < 25) barColor = '#ef4444';
      
      const etapas = ramoConfig.checklist.map(item => {
        const st = data.checks?.[item.id];
        if (st?.concluido) return '✅';
        if (new Date().getDate() > item.prazo) return '❌';
        return '⬜';
      }).join(' ');
      
      htmlPDF += `
        <tr style="${temAtraso ? 'background:#fef2f2' : ''}">
          <td style="padding:10px;border:1px solid #e2e8f0;font-weight:500">${data.empresaNome}</td>
          <td style="padding:10px;border:1px solid #e2e8f0">${ramoConfig.icon} ${ramoConfig.nome}</td>
          <td style="padding:10px;border:1px solid #e2e8f0;text-align:center">
            <div style="background:#e2e8f0;border-radius:10px;height:10px;width:80px;display:inline-block;vertical-align:middle;overflow:hidden">
              <div style="background:${barColor};height:10px;width:${progresso}%"></div>
            </div>
            <span style="font-size:11px;color:#64748b;margin-left:5px">${progresso}%</span>
          </td>
          <td style="padding:10px;border:1px solid #e2e8f0;font-size:14px">${etapas}</td>
        </tr>
      `;
    });
    
    htmlPDF += `</tbody></table>`;
  });
  
  htmlPDF += `
      <div style="margin-top:30px;padding:15px;background:#f8fafc;border-radius:10px;font-size:12px;color:#64748b">
        <strong>Legenda:</strong> ✅ Concluído &nbsp;&nbsp; ⬜ Pendente &nbsp;&nbsp; ❌ Atrasado
      </div>
    </div>
  `;
  
  const element = document.createElement('div');
  element.innerHTML = htmlPDF;
  document.body.appendChild(element);
  
  const nomeArquivo = `relatorio-projecoes-${ESTADO.ano}${filtroMes ? '-' + MESES[filtroMes - 1].toLowerCase() : ''}${gerente ? '-' + gerente.nome.split(' ')[0].toLowerCase() : ''}.pdf`;
  
  try {
    await html2pdf().set({
      margin: 10,
      filename: nomeArquivo,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
  } catch (e) {
    console.error(e);
    alert('Erro ao gerar PDF');
  }
  
  document.body.removeChild(element);
}

// LEADS
async function carregarLeads() {
  const container = $('leadsContent');
  if (CACHE.empresas.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">💡</div><div class="empty-title">Selecione uma agência</div></div>';
    return;
  }
  
  const leadsDental = [], leadsSaude = [];
  
  CACHE.empresas.forEach(emp => {
    const visita = CACHE.visitas[emp.id];
    const func = emp.funcionariosQtd || emp.numFuncionarios || 0;
    
    if (func > 0) {
      const status = visita?.ramos?.dental?.status;
      if (status === 'nao-possui' || !status) {
        leadsDental.push({
          ...emp,
          funcionarios: func,
          potencial: func * 18.5,
          status: status || 'nao-mapeado',
          prioridade: status === 'nao-possui' ? 'high' : 'medium'
        });
      }
    }
    
    const statusSaude = visita?.ramos?.saude?.status;
    if (statusSaude === 'nao-possui' || !statusSaude) {
      leadsSaude.push({
        ...emp,
        funcionarios: func,
        potencial: func > 0 ? func * 400 : 3 * 400,
        status: statusSaude || 'nao-mapeado',
        prioridade: statusSaude === 'nao-possui' ? 'high' : 'medium',
        dica: func === 0 ? 'Mínimo 3 vidas = R$ 1.200/mês' : null
      });
    }
  });
  
  leadsDental.sort((a, b) => b.potencial - a.potencial);
  leadsSaude.sort((a, b) => b.potencial - a.potencial);
  
  let html = '';
  
  if (leadsDental.length > 0) {
    const total = leadsDental.reduce((s, l) => s + l.potencial, 0);
    html += `
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-icon" style="background:rgba(59,130,246,0.1)">🦷</div>
            <span>Dental Funcionários</span>
          </div>
          <div class="meta-valor">${toBRLCompact(total)}/mês</div>
        </div>
        <p style="margin-bottom:16px;color:var(--text-muted)">Funcionários × R$ 18,50/mês</p>
        <table class="leads-table">
          <thead><tr><th>Empresa</th><th>Func.</th><th>Potencial/Mês</th><th>Status</th></tr></thead>
          <tbody>
            ${leadsDental.slice(0, 20).map(l => `
              <tr>
                <td><div class="lead-empresa"><div class="lead-priority ${l.prioridade}"></div><div style="font-weight:600">${l.nome}</div></div></td>
                <td>${l.funcionarios}</td>
                <td class="lead-potencial">${toBRL(l.potencial)}</td>
                <td><span class="badge ${l.status === 'nao-possui' ? 'badge-success' : ''}">${l.status === 'nao-possui' ? 'Não possui' : 'Não mapeado'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  if (leadsSaude.length > 0) {
    const total = leadsSaude.reduce((s, l) => s + l.potencial, 0);
    html += `
      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <div class="card-icon" style="background:rgba(239,68,68,0.1)">🏥</div>
            <span>Saúde Funcionários</span>
          </div>
          <div class="meta-valor">${toBRLCompact(total)}/mês</div>
        </div>
        <p style="margin-bottom:16px;color:var(--text-muted)">Funcionários × R$ 400/mês | Mínimo: 3 vidas</p>
        <table class="leads-table">
          <thead><tr><th>Empresa</th><th>Func.</th><th>Potencial/Mês</th><th>Status</th></tr></thead>
          <tbody>
            ${leadsSaude.slice(0, 20).map(l => `
              <tr>
                <td><div class="lead-empresa"><div class="lead-priority ${l.prioridade}"></div><div><div style="font-weight:600">${l.nome}</div>${l.dica ? `<div style="font-size:11px;color:var(--text-muted)">${l.dica}</div>` : ''}</div></div></td>
                <td>${l.funcionarios || '-'}</td>
                <td class="lead-potencial">${toBRL(l.potencial)}</td>
                <td><span class="badge ${l.status === 'nao-possui' ? 'badge-success' : ''}">${l.status === 'nao-possui' ? 'Não possui' : 'Não mapeado'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  container.innerHTML = html || '<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-title">Sem leads disponíveis</div></div>';
}

// GLOBAIS
window.toggleRamo = toggleRamo;
window.atualizarMeta = atualizarMeta;
window.formatarInputMoeda = formatarInputMoeda;
window.limparMetas = limparMetas;
window.salvarEGerarPlanejamento = salvarEGerarPlanejamento;
window.sortearEmpresas = sortearEmpresas;
window.salvarDistribuicaoGerente = salvarDistribuicaoGerente;
window.abrirSeletorEmpresa = abrirSeletorEmpresa;
window.fecharModalEmpresa = fecharModalEmpresa;
window.filtrarEmpresasModal = filtrarEmpresasModal;
window.selecionarEmpresaModal = selecionarEmpresaModal;
window.confirmarEmpresa = confirmarEmpresa;
window.toggleCheck = toggleCheck;
window.toggleChecklistDetail = toggleChecklistDetail;
window.renderizarChecklists = renderizarChecklists;
window.carregarLeads = carregarLeads;
window.editarPlanejamento = editarPlanejamento;
window.excluirPlanejamento = excluirPlanejamento;
window.gerarPDFChecklist = gerarPDFChecklist;
