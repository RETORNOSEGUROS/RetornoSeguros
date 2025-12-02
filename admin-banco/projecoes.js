// ================================================================================
// SISTEMA DE PROJEÇÕES E METAS - RETORNO SEGUROS
// ================================================================================

console.log("=== Projeções.js carregado ===");

// Firebase init
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// ================================================================================
// CONTEXTO E ESTADO GLOBAL
// ================================================================================

let CTX = {
  uid: null,
  perfil: null,
  agenciaId: null,
  nome: null
};

let ESTADO = {
  ano: 2026,
  agenciaId: null,
  qtdGerentes: 4,
  ramosSelecionados: [],
  metas: {},
  planoGerado: false,
  empresasCache: [],
  gerentesCache: []
};

// ================================================================================
// DADOS DOS RAMOS - PARÂMETROS DE MERCADO
// ================================================================================

const RAMOS_CONFIG = {
  'saude-pme': {
    id: 'saude-pme',
    nome: 'Saúde PME',
    icon: '🏥',
    cor: '#ef4444',
    corBg: 'rgba(239, 68, 68, 0.15)',
    ticketMedio: 500, // por vida/mês
    unidade: 'vida',
    vidasTipicas: { min: 15, max: 100 },
    conversao: 0.18, // 18% de conversão do funil
    cicloVenda: 45, // dias
    funil: {
      prospeccoes: 50,
      reunioes: 15,
      cotacoes: 9,
      apresentacoes: 5,
      fechamentos: 2
    },
    checklistSemanal: [
      '12 ligações de prospecção (3/dia útil)',
      '8 e-mails de apresentação',
      '3-4 reuniões presenciais/online',
      '2-3 cotações enviadas',
      '1-2 apresentações de proposta'
    ],
    dicas: {
      abertura: 'Como está a satisfação dos funcionários com o plano atual?',
      gatilho: 'Reajuste anual vem aí, melhor avaliar opções agora',
      objecao: 'Mostrar custo vs turnover e produtividade'
    },
    perfilIdeal: 'Empresas de 15-100 funcionários, setores de serviços, comércio e indústria leve'
  },
  
  'dental': {
    id: 'dental',
    nome: 'Dental',
    icon: '🦷',
    cor: '#3b82f6',
    corBg: 'rgba(59, 130, 246, 0.15)',
    ticketMedio: 35,
    unidade: 'vida',
    vidasTipicas: { min: 20, max: 200 },
    conversao: 0.30,
    cicloVenda: 20,
    funil: {
      prospeccoes: 40,
      reunioes: 16,
      cotacoes: 12,
      apresentacoes: 8,
      fechamentos: 4
    },
    checklistSemanal: [
      '15 ligações de prospecção',
      '10 e-mails de apresentação',
      '4-5 reuniões (podem ser rápidas, 15-20min)',
      '4-5 cotações enviadas',
      '3-4 apresentações',
      '1-2 fechamentos'
    ],
    dicas: {
      abertura: 'Seus funcionários têm acesso a plano dental?',
      gatilho: 'Dental custa menos que um café por dia por funcionário',
      objecao: 'Produto de entrada, decisão rápida, pouca burocracia'
    },
    perfilIdeal: 'Foco em empresas que JÁ TÊM saúde mas não têm dental - cross-sell fácil'
  },
  
  'vida-grupo': {
    id: 'vida-grupo',
    nome: 'Vida em Grupo',
    icon: '👥',
    cor: '#8b5cf6',
    corBg: 'rgba(139, 92, 246, 0.15)',
    ticketMedio: 30,
    unidade: 'vida',
    vidasTipicas: { min: 30, max: 300 },
    conversao: 0.25,
    cicloVenda: 35,
    funil: {
      prospeccoes: 40,
      reunioes: 12,
      cotacoes: 9,
      apresentacoes: 6,
      fechamentos: 2
    },
    checklistSemanal: [
      '10 ligações de prospecção',
      '8 e-mails de apresentação',
      '3-4 reuniões',
      '3-4 cotações enviadas',
      '2-3 apresentações',
      '1 fechamento'
    ],
    dicas: {
      abertura: 'Se acontecer algo com um funcionário, a empresa está protegida?',
      gatilho: 'Compliance trabalhista - algumas categorias obrigam',
      objecao: 'Benefício fiscal para empresa, proteção para família'
    },
    perfilIdeal: 'Empresas com atividades de risco, indústrias, transportadoras'
  },
  
  'frota': {
    id: 'frota',
    nome: 'Frota',
    icon: '🚗',
    cor: '#f59e0b',
    corBg: 'rgba(245, 158, 11, 0.15)',
    ticketMedio: 1500,
    unidade: 'veículo',
    vidasTipicas: { min: 5, max: 50 },
    conversao: 0.20,
    cicloVenda: 35,
    funil: {
      prospeccoes: 30,
      reunioes: 10,
      cotacoes: 7,
      apresentacoes: 4,
      fechamentos: 2
    },
    checklistSemanal: [
      '8 ligações (foco em empresas com veículos)',
      'Pesquisa de frotas na região',
      '2-3 reuniões',
      '2-3 cotações enviadas',
      '1-2 apresentações',
      '0-1 fechamento'
    ],
    dicas: {
      abertura: 'Quantos veículos a empresa possui? São próprios ou terceiros?',
      gatilho: 'Quanto sua empresa perde por dia quando um veículo fica parado?',
      objecao: 'Gestão de sinistros como diferencial, telemetria'
    },
    perfilIdeal: 'Empresas com frota própria, transportadoras, distribuidoras'
  },
  
  'patrimonial': {
    id: 'patrimonial',
    nome: 'Patrimonial',
    icon: '🏢',
    cor: '#10b981',
    corBg: 'rgba(16, 185, 129, 0.15)',
    ticketMedio: 8000,
    unidade: 'apólice',
    vidasTipicas: { min: 1, max: 3 },
    conversao: 0.12,
    cicloVenda: 60,
    funil: {
      prospeccoes: 25,
      reunioes: 8,
      cotacoes: 5,
      apresentacoes: 3,
      fechamentos: 1
    },
    checklistSemanal: [
      '6 ligações (decisão mais demorada)',
      'Análise de instalações/riscos',
      '2 reuniões (geralmente com proprietário/diretor)',
      '1-2 cotações enviadas',
      '1 apresentação',
      '0-1 fechamento'
    ],
    dicas: {
      abertura: 'O imóvel da empresa é próprio ou alugado? Tem seguro?',
      gatilho: 'Se um incêndio destruir sua empresa hoje, como você recomeça?',
      objecao: 'Financiamento bancário exige seguro, proteção do patrimônio'
    },
    perfilIdeal: 'Empresas com imóvel próprio, indústrias, comércios grandes'
  },
  
  'resp-civil': {
    id: 'resp-civil',
    nome: 'Responsabilidade Civil',
    icon: '⚖️',
    cor: '#6366f1',
    corBg: 'rgba(99, 102, 241, 0.15)',
    ticketMedio: 5000,
    unidade: 'apólice',
    vidasTipicas: { min: 1, max: 1 },
    conversao: 0.10,
    cicloVenda: 60,
    funil: {
      prospeccoes: 20,
      reunioes: 6,
      cotacoes: 4,
      apresentacoes: 2,
      fechamentos: 1
    },
    checklistSemanal: [
      '5 ligações (produto de nicho)',
      'Foco em setores específicos',
      '1-2 reuniões',
      '1-2 cotações',
      '0-1 fechamento'
    ],
    dicas: {
      abertura: 'Sua empresa já teve problemas com reclamações de clientes/terceiros?',
      gatilho: 'Um processo de um cliente pode quebrar sua empresa',
      objecao: 'Proteção essencial para prestadores de serviço'
    },
    perfilIdeal: 'Construção civil, medicina, contabilidade, TI, eventos'
  },
  
  'deo': {
    id: 'deo',
    nome: 'D&O',
    icon: '👔',
    cor: '#ec4899',
    corBg: 'rgba(236, 72, 153, 0.15)',
    ticketMedio: 12000,
    unidade: 'apólice',
    vidasTipicas: { min: 1, max: 1 },
    conversao: 0.08,
    cicloVenda: 90,
    funil: {
      prospeccoes: 15,
      reunioes: 5,
      cotacoes: 3,
      apresentacoes: 2,
      fechamentos: 1
    },
    checklistSemanal: [
      '4 ligações (C-Level apenas)',
      'Foco em S.A., empresas com auditoria',
      '1-2 reuniões com diretoria',
      '1 cotação',
      '0-1 fechamento'
    ],
    dicas: {
      abertura: 'A empresa tem conselho de administração ou diretoria estatutária?',
      gatilho: 'Você sabia que os diretores respondem com patrimônio pessoal?',
      objecao: 'Proteção pessoal dos executivos, exigência de investidores'
    },
    perfilIdeal: 'S.A. abertas/fechadas, empresas com investidores, em processo de IPO'
  },
  
  'garantia': {
    id: 'garantia',
    nome: 'Garantia',
    icon: '📋',
    cor: '#14b8a6',
    corBg: 'rgba(20, 184, 166, 0.15)',
    ticketMedio: 15000,
    unidade: 'contrato',
    vidasTipicas: { min: 1, max: 10 },
    conversao: 0.12,
    cicloVenda: 45,
    funil: {
      prospeccoes: 20,
      reunioes: 6,
      cotacoes: 5,
      apresentacoes: 3,
      fechamentos: 1
    },
    checklistSemanal: [
      '6 ligações',
      'Monitorar licitações',
      '2 reuniões',
      '2 cotações',
      '1 apresentação',
      '0-1 fechamento'
    ],
    dicas: {
      abertura: 'A empresa participa de licitações ou contratos públicos?',
      gatilho: 'Seguro garantia libera limite de crédito bancário',
      objecao: 'Substitui carta fiança, mais barato que caução'
    },
    perfilIdeal: 'Construtoras, empresas que participam de licitações'
  },
  
  'transporte': {
    id: 'transporte',
    nome: 'Transporte',
    icon: '🚚',
    cor: '#f97316',
    corBg: 'rgba(249, 115, 22, 0.15)',
    ticketMedio: 2000,
    unidade: 'embarque',
    vidasTipicas: { min: 5, max: 50 },
    conversao: 0.18,
    cicloVenda: 25,
    funil: {
      prospeccoes: 30,
      reunioes: 10,
      cotacoes: 8,
      apresentacoes: 5,
      fechamentos: 2
    },
    checklistSemanal: [
      '8 ligações',
      '6 e-mails',
      '3 reuniões',
      '3 cotações',
      '1-2 apresentações',
      '1 fechamento'
    ],
    dicas: {
      abertura: 'A empresa transporta mercadorias próprias ou de terceiros?',
      gatilho: 'Uma carga perdida pode comprometer meses de lucro',
      objecao: 'Custo baixo por embarque, tranquilidade total'
    },
    perfilIdeal: 'Transportadoras, indústrias com distribuição própria'
  },
  
  'cyber': {
    id: 'cyber',
    nome: 'Cyber',
    icon: '💻',
    cor: '#7c3aed',
    corBg: 'rgba(124, 58, 237, 0.15)',
    ticketMedio: 8000,
    unidade: 'apólice',
    vidasTipicas: { min: 1, max: 1 },
    conversao: 0.06,
    cicloVenda: 75,
    funil: {
      prospeccoes: 20,
      reunioes: 6,
      cotacoes: 3,
      apresentacoes: 2,
      fechamentos: 1
    },
    checklistSemanal: [
      '5 ligações',
      'Foco em empresas de tecnologia e e-commerce',
      '1-2 reuniões',
      '1 cotação',
      '0-1 apresentação'
    ],
    dicas: {
      abertura: 'A empresa armazena dados sensíveis de clientes?',
      gatilho: 'LGPD: multas podem chegar a 2% do faturamento',
      objecao: 'Proteção contra hackers, vazamentos, ransomware'
    },
    perfilIdeal: 'E-commerce, fintechs, empresas de tecnologia, saúde'
  },
  
  'equipamentos': {
    id: 'equipamentos',
    nome: 'Equipamentos',
    icon: '🔧',
    cor: '#64748b',
    corBg: 'rgba(100, 116, 139, 0.15)',
    ticketMedio: 3000,
    unidade: 'equipamento',
    vidasTipicas: { min: 1, max: 20 },
    conversao: 0.15,
    cicloVenda: 35,
    funil: {
      prospeccoes: 25,
      reunioes: 8,
      cotacoes: 6,
      apresentacoes: 4,
      fechamentos: 2
    },
    checklistSemanal: [
      '7 ligações',
      '5 e-mails',
      '2 reuniões',
      '2 cotações',
      '1 apresentação',
      '0-1 fechamento'
    ],
    dicas: {
      abertura: 'A empresa possui equipamentos de alto valor? São financiados?',
      gatilho: 'Equipamento parado = produção parada = prejuízo',
      objecao: 'Cobre roubo, quebra, danos elétricos'
    },
    perfilIdeal: 'Indústrias, hospitais, empresas com máquinas caras'
  },
  
  'agricola': {
    id: 'agricola',
    nome: 'Agrícola',
    icon: '🌾',
    cor: '#84cc16',
    corBg: 'rgba(132, 204, 22, 0.15)',
    ticketMedio: 25000,
    unidade: 'safra',
    vidasTipicas: { min: 1, max: 5 },
    conversao: 0.18,
    cicloVenda: 60,
    funil: {
      prospeccoes: 20,
      reunioes: 8,
      cotacoes: 6,
      apresentacoes: 4,
      fechamentos: 2
    },
    checklistSemanal: [
      '5 ligações',
      'Monitorar época de plantio',
      '2 reuniões',
      '2 cotações',
      '1 apresentação',
      '0-1 fechamento'
    ],
    dicas: {
      abertura: 'Qual cultura vocês plantam? Quantos hectares?',
      gatilho: 'Clima imprevisível: uma seca pode destruir a safra inteira',
      objecao: 'Subvenção do governo reduz custo, exigência de financiamento'
    },
    perfilIdeal: 'Produtores rurais, cooperativas, agronegócio'
  }
};

// ================================================================================
// HELPERS
// ================================================================================

const normalizarPerfil = (p) => String(p || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[-_]+/g, " ").trim();

const toBRL = (n) => {
  if (!Number.isFinite(n)) return "R$ 0";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const toBRLCompact = (n) => {
  if (!Number.isFinite(n)) return "R$ 0";
  if (n >= 1000000) return `R$ ${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(0)}K`;
  return toBRL(n);
};

const parseBRL = (str) => {
  const only = String(str || "").replace(/[^\d,.-]/g, "").replace(".", "").replace(",", ".");
  const n = parseFloat(only);
  return Number.isFinite(n) ? n : 0;
};

const getIniciais = (nome) => {
  if (!nome) return "??";
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
};

// ================================================================================
// AUTENTICAÇÃO
// ================================================================================

auth.onAuthStateChanged(async (user) => {
  if (!user) return location.href = "login.html";
  
  CTX.uid = user.uid;
  
  try {
    const prof = await db.collection("usuarios_banco").doc(user.uid).get();
    if (prof.exists) {
      const d = prof.data() || {};
      CTX.perfil = normalizarPerfil(d.perfil || "admin");
      CTX.agenciaId = d.agenciaId || d.agenciaid || null;
      CTX.nome = d.nome || user.email;
    } else {
      CTX.perfil = "admin";
      CTX.nome = user.email || "Usuário";
    }
  } catch (e) {
    console.error("[AUTH] Erro:", e);
    CTX.perfil = "admin";
    CTX.nome = user.email || "Usuário";
  }
  
  // Atualizar UI
  document.getElementById("nomeUsuario").textContent = CTX.nome;
  document.getElementById("perfilUsuario").textContent = CTX.perfil;
  document.getElementById("avatarUsuario").textContent = getIniciais(CTX.nome);
  
  console.log("[AUTH]", CTX.nome, CTX.perfil, CTX.agenciaId);
  
  // Inicializar sistema
  initSistema();
});

// ================================================================================
// INICIALIZAÇÃO
// ================================================================================

async function initSistema() {
  // Configurar tabs
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab-' + tab)?.classList.add('active');
    });
  });
  
  // Carregar agências
  await carregarAgencias();
  
  // Renderizar checkboxes de ramos
  renderizarCheckboxRamos();
  
  // Event listeners
  document.getElementById('qtdGerentes').addEventListener('change', atualizarCalculos);
  document.getElementById('selAgencia').addEventListener('change', () => {
    ESTADO.agenciaId = document.getElementById('selAgencia').value;
    carregarEmpresas();
    carregarGerentes();
  });
}

async function carregarAgencias() {
  const sel = document.getElementById('selAgencia');
  
  try {
    if (CTX.perfil === 'admin') {
      const snap = await db.collection('agencias_banco').get();
      snap.forEach(doc => {
        const d = doc.data();
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = d.nome || doc.id;
        sel.appendChild(opt);
      });
    } else if (CTX.agenciaId) {
      // GC ou RM - só a própria agência
      const doc = await db.collection('agencias_banco').doc(CTX.agenciaId).get();
      if (doc.exists) {
        const d = doc.data();
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = d.nome || doc.id;
        sel.appendChild(opt);
        sel.value = doc.id;
        ESTADO.agenciaId = doc.id;
        carregarEmpresas();
        carregarGerentes();
      }
    }
  } catch (e) {
    console.error("[carregarAgencias]", e);
  }
}

async function carregarEmpresas() {
  if (!ESTADO.agenciaId) return;
  
  try {
    const snap = await db.collection('empresas')
      .where('agenciaId', '==', ESTADO.agenciaId)
      .get();
    
    ESTADO.empresasCache = [];
    snap.forEach(doc => {
      ESTADO.empresasCache.push({ id: doc.id, ...doc.data() });
    });
    
    console.log("[carregarEmpresas]", ESTADO.empresasCache.length, "empresas");
  } catch (e) {
    console.error("[carregarEmpresas]", e);
  }
}

async function carregarGerentes() {
  if (!ESTADO.agenciaId) return;
  
  try {
    const snap = await db.collection('usuarios_banco')
      .where('agenciaId', '==', ESTADO.agenciaId)
      .where('perfil', '==', 'rm')
      .get();
    
    ESTADO.gerentesCache = [];
    snap.forEach(doc => {
      ESTADO.gerentesCache.push({ id: doc.id, ...doc.data() });
    });
    
    // Atualizar quantidade de gerentes
    document.getElementById('qtdGerentes').value = ESTADO.gerentesCache.length || 4;
    ESTADO.qtdGerentes = ESTADO.gerentesCache.length || 4;
    
    console.log("[carregarGerentes]", ESTADO.gerentesCache.length, "gerentes");
  } catch (e) {
    console.error("[carregarGerentes]", e);
  }
}

// ================================================================================
// CHECKBOXES DE RAMOS
// ================================================================================

function renderizarCheckboxRamos() {
  const container = document.getElementById('checkboxRamos');
  container.innerHTML = '';
  
  Object.values(RAMOS_CONFIG).forEach(ramo => {
    const div = document.createElement('div');
    div.className = 'checkbox-item';
    div.setAttribute('data-ramo', ramo.id);
    div.innerHTML = `
      <input type="checkbox" id="chk-${ramo.id}">
      <div class="checkbox-box"></div>
      <span class="checkbox-icon">${ramo.icon}</span>
      <span class="checkbox-label">${ramo.nome}</span>
    `;
    
    div.addEventListener('click', () => {
      const chk = div.querySelector('input');
      chk.checked = !chk.checked;
      div.classList.toggle('checked', chk.checked);
      atualizarRamosSelecionados();
    });
    
    container.appendChild(div);
  });
}

function atualizarRamosSelecionados() {
  ESTADO.ramosSelecionados = [];
  
  document.querySelectorAll('.checkbox-item.checked').forEach(div => {
    const ramoId = div.getAttribute('data-ramo');
    if (ramoId) ESTADO.ramosSelecionados.push(ramoId);
  });
  
  // Mostrar/ocultar card de metas
  const cardMetas = document.getElementById('cardMetas');
  if (ESTADO.ramosSelecionados.length > 0) {
    cardMetas.style.display = 'block';
    renderizarTabelaMetas();
  } else {
    cardMetas.style.display = 'none';
  }
}

// ================================================================================
// TABELA DE METAS
// ================================================================================

function renderizarTabelaMetas() {
  const tbody = document.getElementById('tbodyMetas');
  tbody.innerHTML = '';
  
  ESTADO.ramosSelecionados.forEach(ramoId => {
    const ramo = RAMOS_CONFIG[ramoId];
    if (!ramo) return;
    
    const metaAtual = ESTADO.metas[ramoId]?.anual || 0;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="ramo-cell">
          <div class="ramo-icon" style="background:${ramo.corBg}">${ramo.icon}</div>
          <div>
            <div class="ramo-name">${ramo.nome}</div>
          </div>
        </div>
      </td>
      <td>
        <input type="text" class="input-money" id="meta-${ramoId}" 
          value="${metaAtual ? toBRL(metaAtual) : ''}" 
          placeholder="R$ 0"
          onchange="atualizarMeta('${ramoId}')">
      </td>
      <td>
        <div class="ticket-info">
          ${toBRL(ramo.ticketMedio)}/${ramo.unidade}
        </div>
      </td>
      <td class="valor-calculado" id="mensal-${ramoId}">-</td>
      <td class="valor-calculado" id="gerente-${ramoId}">-</td>
      <td class="valor-calculado" id="vidas-${ramoId}">-</td>
    `;
    
    tbody.appendChild(tr);
  });
  
  // Bind de formatação de moeda
  tbody.querySelectorAll('.input-money').forEach(el => {
    el.addEventListener('blur', () => {
      const v = parseBRL(el.value);
      el.value = v ? toBRL(v) : '';
    });
  });
  
  atualizarCalculos();
}

function atualizarMeta(ramoId) {
  const input = document.getElementById(`meta-${ramoId}`);
  const valor = parseBRL(input.value);
  
  if (!ESTADO.metas[ramoId]) ESTADO.metas[ramoId] = {};
  ESTADO.metas[ramoId].anual = valor;
  
  atualizarCalculos();
}

function atualizarCalculos() {
  ESTADO.qtdGerentes = parseInt(document.getElementById('qtdGerentes').value) || 4;
  
  let totalAnual = 0;
  
  ESTADO.ramosSelecionados.forEach(ramoId => {
    const ramo = RAMOS_CONFIG[ramoId];
    if (!ramo) return;
    
    const input = document.getElementById(`meta-${ramoId}`);
    const metaAnual = parseBRL(input?.value || '0');
    
    if (!ESTADO.metas[ramoId]) ESTADO.metas[ramoId] = {};
    ESTADO.metas[ramoId].anual = metaAnual;
    
    const metaMensal = metaAnual / 12;
    const metaGerente = metaMensal / ESTADO.qtdGerentes;
    const vidasMes = Math.ceil(metaMensal / ramo.ticketMedio);
    const vidasGerente = Math.ceil(vidasMes / ESTADO.qtdGerentes);
    
    ESTADO.metas[ramoId].mensal = metaMensal;
    ESTADO.metas[ramoId].porGerente = metaGerente;
    ESTADO.metas[ramoId].vidasMes = vidasMes;
    ESTADO.metas[ramoId].vidasGerente = vidasGerente;
    
    document.getElementById(`mensal-${ramoId}`).textContent = toBRLCompact(metaMensal);
    document.getElementById(`gerente-${ramoId}`).textContent = toBRLCompact(metaGerente);
    document.getElementById(`vidas-${ramoId}`).textContent = `${vidasGerente} ${ramo.unidade}s`;
    
    totalAnual += metaAnual;
  });
  
  document.getElementById('totalAnual').textContent = toBRL(totalAnual);
}

function limparMetas() {
  ESTADO.metas = {};
  ESTADO.ramosSelecionados.forEach(ramoId => {
    const input = document.getElementById(`meta-${ramoId}`);
    if (input) input.value = '';
  });
  atualizarCalculos();
}

// ================================================================================
// GERAR PLANO DE AÇÃO
// ================================================================================

function gerarPlanoAcao() {
  // Validar
  if (ESTADO.ramosSelecionados.length === 0) {
    alert('Selecione pelo menos um ramo');
    return;
  }
  
  const temMeta = ESTADO.ramosSelecionados.some(r => ESTADO.metas[r]?.anual > 0);
  if (!temMeta) {
    alert('Defina pelo menos uma meta');
    return;
  }
  
  // Gerar conteúdo
  const container = document.getElementById('planoAcaoContent');
  let html = '';
  
  // Header com resumo
  html += `
    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <div class="card-title">
          <div class="card-icon">📊</div>
          <span>Resumo do Planejamento ${ESTADO.ano}</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline" onclick="exportarPlanoPDF()">📄 PDF</button>
          <button class="btn btn-outline" onclick="exportarPlanoExcel()">📊 Excel</button>
        </div>
      </div>
      
      <div class="grid-4" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--accent-glow)">📅</div>
          <div class="stat-value">${ESTADO.ano}</div>
          <div class="stat-label">Ano</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--success-bg)">👥</div>
          <div class="stat-value">${ESTADO.qtdGerentes}</div>
          <div class="stat-label">Gerentes</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--warning-bg)">🎯</div>
          <div class="stat-value">${ESTADO.ramosSelecionados.length}</div>
          <div class="stat-label">Ramos</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:var(--info-bg)">💰</div>
          <div class="stat-value">${toBRLCompact(Object.values(ESTADO.metas).reduce((s, m) => s + (m.anual || 0), 0))}</div>
          <div class="stat-label">Meta Total</div>
        </div>
      </div>
    </div>
  `;
  
  // Card para cada ramo
  ESTADO.ramosSelecionados.forEach(ramoId => {
    const ramo = RAMOS_CONFIG[ramoId];
    const meta = ESTADO.metas[ramoId];
    
    if (!ramo || !meta?.anual) return;
    
    html += renderizarPlanoRamo(ramo, meta);
  });
  
  container.innerHTML = html;
  
  // Ir para a aba de plano
  document.querySelector('[data-tab="plano"]').click();
  
  // Gerar pipeline
  gerarPipeline();
  
  ESTADO.planoGerado = true;
}

function renderizarPlanoRamo(ramo, meta) {
  const funilSemanal = {};
  Object.keys(ramo.funil).forEach(k => {
    funilSemanal[k] = Math.ceil(ramo.funil[k] / 4); // Dividir mensal por 4 semanas
  });
  
  return `
    <div class="plano-card">
      <div class="plano-header" style="background:${ramo.corBg}">
        <div class="plano-icon" style="background:${ramo.cor}">${ramo.icon}</div>
        <div class="plano-info">
          <div class="plano-title">${ramo.nome}</div>
          <div class="plano-meta">Ticket: ${toBRL(ramo.ticketMedio)}/${ramo.unidade} • Ciclo: ${ramo.cicloVenda} dias</div>
        </div>
        <div class="plano-value">
          <div class="plano-value-main">${toBRLCompact(meta.porGerente)}/mês</div>
          <div class="plano-value-sub">${meta.vidasGerente} ${ramo.unidade}s por gerente</div>
        </div>
      </div>
      
      <div class="plano-body">
        <!-- Funil -->
        <div class="plano-section">
          <div class="plano-section-title">📊 Funil Necessário (por mês)</div>
          <div class="funil-container">
            <div class="funil-step">
              <div class="funil-box">
                <div class="funil-value">${ramo.funil.prospeccoes}</div>
              </div>
              <div class="funil-label">Prospecções</div>
            </div>
            <div class="funil-arrow">→</div>
            <div class="funil-step">
              <div class="funil-box">
                <div class="funil-value">${ramo.funil.reunioes}</div>
              </div>
              <div class="funil-label">Reuniões</div>
            </div>
            <div class="funil-arrow">→</div>
            <div class="funil-step">
              <div class="funil-box">
                <div class="funil-value">${ramo.funil.cotacoes}</div>
              </div>
              <div class="funil-label">Cotações</div>
            </div>
            <div class="funil-arrow">→</div>
            <div class="funil-step">
              <div class="funil-box">
                <div class="funil-value">${ramo.funil.apresentacoes}</div>
              </div>
              <div class="funil-label">Apresentações</div>
            </div>
            <div class="funil-arrow">→</div>
            <div class="funil-step">
              <div class="funil-box" style="background:${ramo.cor};border-color:${ramo.cor}">
                <div class="funil-value" style="color:#fff">${ramo.funil.fechamentos}</div>
              </div>
              <div class="funil-label">Fechamentos</div>
            </div>
          </div>
        </div>
        
        <!-- Checklist -->
        <div class="plano-section">
          <div class="plano-section-title">✅ Checklist Semanal por Gerente</div>
          <ul class="checklist">
            ${ramo.checklistSemanal.map(item => `
              <li>
                <div class="checklist-check">☐</div>
                <span>${item}</span>
              </li>
            `).join('')}
          </ul>
        </div>
        
        <!-- Dicas -->
        <div class="plano-section">
          <div class="plano-section-title">💡 Dicas de Abordagem</div>
          <div class="dica-box">
            <p style="margin-bottom:8px"><strong>Abertura:</strong> "${ramo.dicas.abertura}"</p>
            <p style="margin-bottom:8px"><strong>Gatilho:</strong> "${ramo.dicas.gatilho}"</p>
            <p><strong>Objeção:</strong> ${ramo.dicas.objecao}</p>
          </div>
        </div>
        
        <!-- Perfil ideal -->
        <div class="plano-section">
          <div class="plano-section-title">🎯 Perfil Ideal de Cliente</div>
          <p style="color:var(--text-secondary);font-size:14px">${ramo.perfilIdeal}</p>
        </div>
      </div>
    </div>
  `;
}

// ================================================================================
// GERAR PIPELINE DE EMPRESAS
// ================================================================================

function gerarPipeline() {
  const container = document.getElementById('pipelineContent');
  
  if (ESTADO.empresasCache.length === 0) {
    container.innerHTML = `
      <div class="alert alert-warning">
        <div class="alert-icon">⚠️</div>
        <div class="alert-content">
          <div class="alert-title">Nenhuma empresa carregada</div>
          <div class="alert-text">Selecione uma agência para carregar as empresas da base</div>
        </div>
      </div>
    `;
    return;
  }
  
  // Distribuir empresas por gerente
  const distribuicao = distribuirEmpresas();
  
  let html = `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">
          <div class="card-icon">🎯</div>
          <span>Pipeline de Empresas</span>
        </div>
        <div style="display:flex;gap:8px">
          <select class="form-select" id="filtroGerente" style="width:200px" onchange="filtrarPipeline()">
            <option value="">Todos os Gerentes</option>
            ${ESTADO.gerentesCache.map(g => `<option value="${g.id}">${g.nome}</option>`).join('')}
          </select>
          <select class="form-select" id="filtroRamoPipeline" style="width:150px" onchange="filtrarPipeline()">
            <option value="">Todos os Ramos</option>
            ${ESTADO.ramosSelecionados.map(r => `<option value="${r}">${RAMOS_CONFIG[r]?.nome}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
  `;
  
  // Cards por gerente
  distribuicao.forEach((dados, gerenteId) => {
    const gerente = ESTADO.gerentesCache.find(g => g.id === gerenteId) || { nome: 'Gerente', id: gerenteId };
    
    const totalPotencial = dados.empresas.reduce((s, e) => s + (e.potencial || 0), 0);
    const totalEmpresas = dados.empresas.length;
    
    html += `
      <div class="gerente-card" data-gerente="${gerenteId}">
        <div class="gerente-header">
          <div class="gerente-avatar">${getIniciais(gerente.nome)}</div>
          <div class="gerente-info">
            <div class="gerente-nome">${gerente.nome}</div>
            <div class="gerente-role">Gerente de Relacionamento</div>
          </div>
        </div>
        
        <div class="gerente-stats">
          <div class="gerente-stat">
            <div class="gerente-stat-value">${totalEmpresas}</div>
            <div class="gerente-stat-label">Empresas</div>
          </div>
          <div class="gerente-stat">
            <div class="gerente-stat-value" style="color:var(--success)">${toBRLCompact(totalPotencial)}</div>
            <div class="gerente-stat-label">Potencial</div>
          </div>
          <div class="gerente-stat">
            <div class="gerente-stat-value">${toBRLCompact(totalPotencial * 0.18)}</div>
            <div class="gerente-stat-label">Projeção (18%)</div>
          </div>
          <div class="gerente-stat">
            <div class="gerente-stat-value">${ESTADO.ramosSelecionados.length}</div>
            <div class="gerente-stat-label">Ramos</div>
          </div>
        </div>
        
        <div class="gerente-body">
          <table class="pipeline-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Ramo</th>
                <th>Potencial</th>
                <th>Ação Sugerida</th>
              </tr>
            </thead>
            <tbody>
              ${dados.empresas.slice(0, 10).map(emp => `
                <tr data-ramo="${emp.ramo}">
                  <td>
                    <div class="empresa-cell">
                      <div class="empresa-priority ${emp.prioridade}"></div>
                      <div>
                        <div class="empresa-nome">${emp.nome}</div>
                        <div class="empresa-detalhe">${emp.cidade || ''} ${emp.funcionarios ? '• ' + emp.funcionarios + ' func.' : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="badge" style="background:${RAMOS_CONFIG[emp.ramo]?.corBg};color:${RAMOS_CONFIG[emp.ramo]?.cor}">${RAMOS_CONFIG[emp.ramo]?.icon} ${RAMOS_CONFIG[emp.ramo]?.nome}</span></td>
                  <td class="valor-calculado">${toBRLCompact(emp.potencial)}</td>
                  <td><span class="acao-sugerida">${emp.acao}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${dados.empresas.length > 10 ? `<p style="text-align:center;color:var(--text-muted);padding:12px;font-size:13px">+ ${dados.empresas.length - 10} empresas...</p>` : ''}
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function distribuirEmpresas() {
  const distribuicao = new Map();
  
  // Inicializar map para cada gerente
  ESTADO.gerentesCache.forEach(g => {
    distribuicao.set(g.id, { gerente: g, empresas: [] });
  });
  
  // Se não tem gerentes, criar um genérico
  if (ESTADO.gerentesCache.length === 0) {
    for (let i = 1; i <= ESTADO.qtdGerentes; i++) {
      distribuicao.set(`gerente-${i}`, { gerente: { nome: `Gerente ${i}`, id: `gerente-${i}` }, empresas: [] });
    }
  }
  
  // Distribuir empresas
  ESTADO.empresasCache.forEach(emp => {
    // Verificar qual gerente é responsável
    let gerenteId = emp.rmUid || emp.rmId;
    
    if (!gerenteId || !distribuicao.has(gerenteId)) {
      // Se não tem gerente definido, distribuir round-robin
      const keys = Array.from(distribuicao.keys());
      gerenteId = keys[Math.floor(Math.random() * keys.length)];
    }
    
    // Para cada ramo selecionado, verificar se é oportunidade
    ESTADO.ramosSelecionados.forEach(ramoId => {
      const ramo = RAMOS_CONFIG[ramoId];
      if (!ramo) return;
      
      // Calcular potencial baseado em funcionários ou estimativa
      const funcionarios = emp.funcionarios || emp.qtdFuncionarios || 20;
      const potencial = funcionarios * ramo.ticketMedio;
      
      // Definir prioridade e ação
      let prioridade = 'medium';
      let acao = 'Entrar em contato para apresentação';
      
      // Verificar se tem o produto (campo pode variar)
      const temProduto = emp.seguros?.[ramoId] || emp.produtos?.[ramoId];
      
      if (!temProduto) {
        prioridade = 'high';
        acao = 'Não tem o produto - oportunidade!';
      } else {
        // Verificar vencimento
        const vencimento = emp.vencimentos?.[ramoId];
        if (vencimento) {
          const diasParaVencer = Math.ceil((new Date(vencimento) - new Date()) / (1000 * 60 * 60 * 24));
          if (diasParaVencer <= 60 && diasParaVencer > 0) {
            prioridade = 'high';
            acao = `Vence em ${diasParaVencer} dias - renovação!`;
          } else if (diasParaVencer <= 90) {
            prioridade = 'medium';
            acao = `Vence em ${diasParaVencer} dias - agendar`;
          }
        } else {
          prioridade = 'low';
          acao = 'Verificar interesse em upgrade';
        }
      }
      
      distribuicao.get(gerenteId)?.empresas.push({
        id: emp.id,
        nome: emp.nome || 'Sem nome',
        cidade: emp.cidade,
        funcionarios,
        ramo: ramoId,
        potencial,
        prioridade,
        acao
      });
    });
  });
  
  // Ordenar empresas por prioridade
  distribuicao.forEach(dados => {
    dados.empresas.sort((a, b) => {
      const ordem = { high: 1, medium: 2, low: 3 };
      return (ordem[a.prioridade] || 4) - (ordem[b.prioridade] || 4);
    });
  });
  
  return distribuicao;
}

function filtrarPipeline() {
  const gerenteId = document.getElementById('filtroGerente')?.value;
  const ramoId = document.getElementById('filtroRamoPipeline')?.value;
  
  // Filtrar cards de gerente
  document.querySelectorAll('.gerente-card').forEach(card => {
    const cardGerente = card.getAttribute('data-gerente');
    const showGerente = !gerenteId || cardGerente === gerenteId;
    card.style.display = showGerente ? 'block' : 'none';
    
    // Filtrar linhas por ramo
    if (showGerente && ramoId) {
      card.querySelectorAll('tbody tr').forEach(tr => {
        const rowRamo = tr.getAttribute('data-ramo');
        tr.style.display = rowRamo === ramoId ? '' : 'none';
      });
    } else if (showGerente) {
      card.querySelectorAll('tbody tr').forEach(tr => {
        tr.style.display = '';
      });
    }
  });
}

// ================================================================================
// ACOMPANHAMENTO
// ================================================================================

function renderizarAcompanhamento() {
  const container = document.getElementById('acompanhamentoContent');
  
  // Por enquanto, mockup
  container.innerHTML = `
    <div class="alert alert-info">
      <div class="alert-icon">ℹ️</div>
      <div class="alert-content">
        <div class="alert-title">Em desenvolvimento</div>
        <div class="alert-text">O módulo de acompanhamento semanal será implementado na próxima versão.</div>
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="card-icon">📊</div>
          <span>Acompanhamento Semanal</span>
        </div>
      </div>
      
      <div class="empty-state">
        <div class="empty-state-icon">🚧</div>
        <div class="empty-state-title">Funcionalidade em construção</div>
        <div class="empty-state-text">
          Este módulo permitirá:
          <br>• Registrar resultados semanais
          <br>• Comparar realizado vs meta
          <br>• Ver alertas de performance
          <br>• Exportar relatórios
        </div>
      </div>
    </div>
  `;
}

// ================================================================================
// EXPORTS
// ================================================================================

function exportarPlanoPDF() {
  const content = document.getElementById('planoAcaoContent');
  
  const opt = {
    margin: 10,
    filename: `plano-acao-${ESTADO.ano}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  
  html2pdf().set(opt).from(content).save();
}

function exportarPlanoExcel() {
  const dados = [];
  
  // Header
  dados.push(['PLANO DE AÇÃO ' + ESTADO.ano]);
  dados.push([]);
  dados.push(['Ramo', 'Meta Anual', 'Meta Mensal', 'Por Gerente', 'Vidas/Mês', 'Ticket Médio']);
  
  ESTADO.ramosSelecionados.forEach(ramoId => {
    const ramo = RAMOS_CONFIG[ramoId];
    const meta = ESTADO.metas[ramoId];
    if (!ramo || !meta) return;
    
    dados.push([
      ramo.nome,
      meta.anual,
      meta.mensal,
      meta.porGerente,
      meta.vidasMes,
      ramo.ticketMedio
    ]);
  });
  
  dados.push([]);
  dados.push(['TOTAL', Object.values(ESTADO.metas).reduce((s, m) => s + (m.anual || 0), 0)]);
  
  const ws = XLSX.utils.aoa_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plano de Ação');
  
  XLSX.writeFile(wb, `plano-acao-${ESTADO.ano}.xlsx`);
}

// Expor funções
window.atualizarMeta = atualizarMeta;
window.atualizarCalculos = atualizarCalculos;
window.limparMetas = limparMetas;
window.gerarPlanoAcao = gerarPlanoAcao;
window.filtrarPipeline = filtrarPipeline;
window.exportarPlanoPDF = exportarPlanoPDF;
window.exportarPlanoExcel = exportarPlanoExcel;
