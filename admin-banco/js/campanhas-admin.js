// campanhas-admin.js — Administração de Campanhas
// Firebase v8

// ==== Firebase Init ====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ==== Estado Global ====
let CTX = { uid: null, perfil: null, isAdmin: false };
const ADMIN_EMAILS = ["patrick@retornoseguros.com.br"];

let CAMPANHAS = [];
let PARTICIPANTES_TODOS = [];
let ACOES_TODAS = [];
let AGENCIAS = {};

let CAMPANHA_ATUAL = null;

// ==== Regras de Pontuação Padrão ====
const REGRAS_PADRAO = [
  { id: "funcionarios", tipo: "numero_funcionarios", descricao: "Conseguiu o número atualizado de funcionários", pontos: 5, icon: "👥" },
  { id: "socios", tipo: "dados_socios", descricao: "Informou nome e data de nascimento dos sócios", pontos: 10, icon: "👤" },
  { id: "email_dental", tipo: "email_cotacao_dental", descricao: "Informou e-mail e enviamos cotação de dental", pontos: 8, icon: "🦷" },
  { id: "email_saude", tipo: "email_cotacao_saude", descricao: "Informou e-mail e enviamos cotação de saúde", pontos: 10, icon: "🏥" },
  { id: "reuniao", tipo: "reuniao_agendada", descricao: "Agendou reunião da corretora com o cliente", pontos: 15, icon: "📅" },
  { id: "contato", tipo: "contato_beneficios", descricao: "Perguntou ao cliente se entendeu os benefícios", pontos: 12, icon: "📞" },
  { id: "decisao_nao", tipo: "decisao_nao_fechou", descricao: "Decisão justificada - não fechou negócio", pontos: 8, icon: "📝" },
  { id: "decisao_sim", tipo: "decisao_fechou", descricao: "Cliente fechou negócio!", pontos: 40, icon: "🎉" }
];

// ==== Helpers ====
const $ = id => document.getElementById(id);
const normalizar = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const fmtData = d => d ? d.toLocaleDateString("pt-BR") : "-";
const fmtDataHora = d => d ? d.toLocaleString("pt-BR") : "-";

const toDate = x => {
  if (!x) return null;
  if (x.toDate) return x.toDate();
  if (x instanceof Date) return x;
  const d = new Date(x);
  return isNaN(d) ? null : d;
};

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
      CTX.isAdmin = CTX.perfil === "admin" || ADMIN_EMAILS.includes(user.email?.toLowerCase());
    } else if (ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
      CTX.perfil = "admin";
      CTX.isAdmin = true;
    }
  } catch (e) { console.warn("Erro perfil:", e); }
  
  // Apenas admin pode acessar
  if (!CTX.isAdmin) {
    alert("Acesso restrito a administradores.");
    location.href = "painel.html";
    return;
  }
  
  await init();
});

// ==== Inicialização ====
async function init() {
  await carregarAgencias();
  await Promise.all([carregarCampanhas(), carregarTodasAcoes()]);
  renderizarTudo();
}

// ==== Carregar Dados ====
async function carregarAgencias() {
  try {
    const snap = await db.collection("agencias_banco").get();
    snap.forEach(doc => {
      AGENCIAS[doc.id] = doc.data().nome || doc.id;
    });
    
    // Preencher selects de agências
    const options = Object.entries(AGENCIAS)
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, nome]) => `<option value="${id}">${nome}</option>`)
      .join("");
    
    const selCampanha = $("campanhaAgencias");
    if (selCampanha) selCampanha.innerHTML = options;
    
    const selParticipante = $("participanteAgencia");
    if (selParticipante) selParticipante.innerHTML = `<option value="">Selecione...</option>${options}`;
    
  } catch (e) { console.error("Erro agências:", e); }
}

async function carregarCampanhas() {
  CAMPANHAS = [];
  PARTICIPANTES_TODOS = [];
  
  try {
    const snap = await db.collection("campanhas").orderBy("dataCriacao", "desc").get();
    
    for (const doc of snap.docs) {
      const d = doc.data();
      const campanha = {
        id: doc.id,
        nome: d.nome || "Campanha",
        descricao: d.descricao || "",
        status: d.status || "ativa",
        dataInicio: toDate(d.dataInicio),
        dataFim: toDate(d.dataFim),
        dataCriacao: toDate(d.dataCriacao),
        agencias: d.agencias || [],
        regras: d.regras || REGRAS_PADRAO,
        participantes: [],
        totalPontos: 0,
        totalAcoes: 0
      };
      
      // Carregar participantes
      const partSnap = await db.collection("campanhas").doc(doc.id)
        .collection("participantes").get();
      
      partSnap.forEach(pDoc => {
        const p = pDoc.data();
        const participante = {
          id: pDoc.id,
          campanhaId: doc.id,
          campanhaNome: campanha.nome,
          nome: p.nome || "Participante",
          agenciaId: p.agenciaId || "",
          agenciaNome: p.agenciaNome || AGENCIAS[p.agenciaId] || "",
          cargo: p.cargo || "",
          email: p.email || "",
          telefone: p.telefone || "",
          pontos: p.pontos || 0,
          ultimoAcesso: toDate(p.ultimoAcesso)
        };
        campanha.participantes.push(participante);
        campanha.totalPontos += participante.pontos;
        PARTICIPANTES_TODOS.push(participante);
      });
      
      CAMPANHAS.push(campanha);
    }
    
    // Ordenar participantes por pontos
    PARTICIPANTES_TODOS.sort((a, b) => b.pontos - a.pontos);
    
  } catch (e) { console.error("Erro campanhas:", e); }
}

async function carregarTodasAcoes() {
  ACOES_TODAS = [];
  
  try {
    for (const campanha of CAMPANHAS) {
      const snap = await db.collection("campanhas").doc(campanha.id)
        .collection("acoes")
        .orderBy("dataRegistro", "desc")
        .limit(100)
        .get();
      
      snap.forEach(doc => {
        const d = doc.data();
        ACOES_TODAS.push({
          id: doc.id,
          campanhaId: campanha.id,
          campanhaNome: campanha.nome,
          tipo: d.tipo,
          empresaId: d.empresaId || "",
          empresaNome: d.empresaNome || "",
          participanteId: d.participanteId || "",
          participanteNome: d.participanteNome || "",
          pontos: d.pontos || 0,
          dados: d.dados || {},
          dataRegistro: toDate(d.dataRegistro),
          status: d.status || "aprovado"
        });
      });
      
      campanha.totalAcoes = snap.size;
    }
    
    ACOES_TODAS.sort((a, b) => (b.dataRegistro || 0) - (a.dataRegistro || 0));
    
  } catch (e) { console.error("Erro ações:", e); }
}

// ==== Renderização ====
function renderizarTudo() {
  renderizarStats();
  renderizarCampanhas();
  renderizarRanking();
  renderizarAcoes();
  preencherFiltros();
}

function renderizarStats() {
  const campanhasAtivas = CAMPANHAS.filter(c => c.status === "ativa").length;
  const totalParticipantes = PARTICIPANTES_TODOS.length;
  const totalPontos = PARTICIPANTES_TODOS.reduce((sum, p) => sum + p.pontos, 0);
  const totalAcoes = ACOES_TODAS.length;
  const negocios = ACOES_TODAS.filter(a => a.tipo === "decisao_fechou").length;
  
  $("statCampanhasAtivas").textContent = campanhasAtivas;
  $("statParticipantes").textContent = totalParticipantes;
  $("statPontosTotal").textContent = totalPontos.toLocaleString("pt-BR");
  $("statAcoes").textContent = totalAcoes;
  $("statNegocios").textContent = negocios;
}

function renderizarCampanhas() {
  const container = $("campanhasGrid");
  
  if (CAMPANHAS.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-state-icon">🎯</div>
        <h3>Nenhuma campanha criada</h3>
        <p>Crie sua primeira campanha para engajar assistentes de banco!</p>
        <button class="btn btn-primary" style="margin-top: 16px;" onclick="abrirModalNovaCampanha()">➕ Criar Campanha</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = CAMPANHAS.map(c => `
    <div class="campanha-card">
      <div class="campanha-card-header">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <h3>${c.nome}</h3>
          <span class="campanha-badge ${c.status}">${c.status === 'ativa' ? '🟢 Ativa' : '🔴 Encerrada'}</span>
        </div>
        <p>${c.descricao || 'Sem descrição'}</p>
      </div>
      <div class="campanha-card-body">
        <div class="campanha-card-stats">
          <div class="mini-stat">
            <div class="mini-stat-value">${c.participantes.length}</div>
            <div class="mini-stat-label">Participantes</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-value">${c.totalPontos.toLocaleString("pt-BR")}</div>
            <div class="mini-stat-label">Pontos</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-value">${c.totalAcoes}</div>
            <div class="mini-stat-label">Ações</div>
          </div>
        </div>
        <div style="font-size: 12px; color: var(--muted); margin-bottom: 12px;">
          📅 ${c.dataInicio ? fmtData(c.dataInicio) : 'Sem data'} até ${c.dataFim ? fmtData(c.dataFim) : 'Sem data'}
        </div>
        <div class="campanha-card-actions">
          <button class="btn btn-sm btn-secondary" style="flex: 1;" onclick="gerenciarCampanha('${c.id}')">⚙️ Gerenciar</button>
          <button class="btn btn-sm btn-primary" style="flex: 1;" onclick="abrirModalNovoParticipante('${c.id}')">➕ Participante</button>
        </div>
      </div>
    </div>
  `).join("");
}

function renderizarRanking() {
  const container = $("rankingTableBody");
  const filtro = $("filtroRankingCampanha")?.value || "";
  
  let participantes = [...PARTICIPANTES_TODOS];
  if (filtro) {
    participantes = participantes.filter(p => p.campanhaId === filtro);
  }
  
  // Recalcular posições
  participantes.sort((a, b) => b.pontos - a.pontos);
  
  if (participantes.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: var(--muted);">
          Nenhum participante encontrado
        </td>
      </tr>
    `;
    return;
  }
  
  container.innerHTML = participantes.map((p, idx) => {
    const pos = idx + 1;
    let badgeClass = "normal";
    if (pos === 1) badgeClass = "gold";
    else if (pos === 2) badgeClass = "silver";
    else if (pos === 3) badgeClass = "bronze";
    
    const acoes = ACOES_TODAS.filter(a => a.participanteId === p.id).length;
    
    return `
      <tr>
        <td><span class="ranking-badge ${badgeClass}">${pos}º</span></td>
        <td><strong>${p.nome}</strong></td>
        <td>${p.agenciaNome || '-'}</td>
        <td>${p.campanhaNome}</td>
        <td style="text-align: right;">${acoes}</td>
        <td style="text-align: right; font-weight: 700; color: var(--brand);">${p.pontos.toLocaleString("pt-BR")}</td>
      </tr>
    `;
  }).join("");
}

function renderizarAcoes() {
  const container = $("acoesTableBody");
  const filtroCampanha = $("filtroAcaoCampanha")?.value || "";
  const filtroTipo = $("filtroAcaoTipo")?.value || "";
  
  let acoes = [...ACOES_TODAS];
  if (filtroCampanha) {
    acoes = acoes.filter(a => a.campanhaId === filtroCampanha);
  }
  if (filtroTipo) {
    acoes = acoes.filter(a => a.tipo === filtroTipo);
  }
  
  if (acoes.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: var(--muted);">
          Nenhuma ação encontrada
        </td>
      </tr>
    `;
    return;
  }
  
  container.innerHTML = acoes.slice(0, 100).map(a => {
    const regra = REGRAS_PADRAO.find(r => r.tipo === a.tipo);
    return `
      <tr>
        <td>${fmtDataHora(a.dataRegistro)}</td>
        <td>${a.participanteNome}</td>
        <td>${a.empresaNome}</td>
        <td>
          <span style="display: flex; align-items: center; gap: 8px;">
            <span>${regra?.icon || '📋'}</span>
            <span>${regra?.descricao || a.tipo}</span>
          </span>
        </td>
        <td style="text-align: right; font-weight: 700; color: var(--brand);">+${a.pontos}</td>
        <td style="text-align: center;">
          <span style="padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: #d1fae5; color: #065f46;">
            ✓ Aprovado
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

function preencherFiltros() {
  // Filtro de campanhas no ranking
  const selRanking = $("filtroRankingCampanha");
  if (selRanking) {
    selRanking.innerHTML = `<option value="">Todas as Campanhas</option>` +
      CAMPANHAS.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
  }
  
  // Filtro de campanhas nas ações
  const selAcaoCampanha = $("filtroAcaoCampanha");
  if (selAcaoCampanha) {
    selAcaoCampanha.innerHTML = `<option value="">Todas as Campanhas</option>` +
      CAMPANHAS.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
  }
  
  // Filtro de tipos nas ações
  const selAcaoTipo = $("filtroAcaoTipo");
  if (selAcaoTipo) {
    selAcaoTipo.innerHTML = `<option value="">Todos os Tipos</option>` +
      REGRAS_PADRAO.map(r => `<option value="${r.tipo}">${r.icon} ${r.descricao}</option>`).join("");
  }
}

// ==== Tabs ====
function trocarTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  
  event.target.classList.add('active');
  $(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`).classList.add('active');
}

// ==== Modais ====
function abrirModalNovaCampanha() {
  // Limpar formulário
  $("campanhaNome").value = "";
  $("campanhaDesc").value = "";
  $("campanhaInicio").value = "";
  $("campanhaFim").value = "";
  
  // Selecionar todas as agências por padrão
  const select = $("campanhaAgencias");
  if (select) {
    Array.from(select.options).forEach(opt => opt.selected = true);
  }
  
  $("modalNovaCampanha").classList.add("active");
}

function fecharModal(modalId) {
  $(modalId).classList.remove("active");
}

// ==== Criar Campanha ====
async function criarCampanha() {
  const nome = $("campanhaNome").value.trim();
  const descricao = $("campanhaDesc").value.trim();
  const dataInicio = $("campanhaInicio").value;
  const dataFim = $("campanhaFim").value;
  
  if (!nome) {
    alert("Informe o nome da campanha!");
    return;
  }
  
  // Pegar agências selecionadas
  const select = $("campanhaAgencias");
  const agencias = Array.from(select.selectedOptions).map(opt => opt.value);
  
  try {
    await db.collection("campanhas").add({
      nome: nome,
      descricao: descricao,
      status: "ativa",
      dataInicio: dataInicio ? new Date(dataInicio + "T00:00:00") : null,
      dataFim: dataFim ? new Date(dataFim + "T23:59:59") : null,
      dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
      agencias: agencias,
      regras: REGRAS_PADRAO,
      criadoPor: CTX.uid
    });
    
    fecharModal("modalNovaCampanha");
    
    // Recarregar dados
    CAMPANHAS = [];
    PARTICIPANTES_TODOS = [];
    await carregarCampanhas();
    await carregarTodasAcoes();
    renderizarTudo();
    
    alert("Campanha criada com sucesso!");
    
  } catch (error) {
    console.error("Erro ao criar campanha:", error);
    alert("Erro ao criar campanha. Tente novamente.");
  }
}

// ==== Gerenciar Campanha ====
function gerenciarCampanha(campanhaId) {
  const campanha = CAMPANHAS.find(c => c.id === campanhaId);
  if (!campanha) return;
  
  CAMPANHA_ATUAL = campanha;
  
  $("modalGerenciarTitle").innerHTML = `📋 ${campanha.nome}`;
  
  const participantesHtml = campanha.participantes.length > 0 
    ? campanha.participantes.map(p => {
        const iniciais = (p.nome || "?").split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
        return `
          <div class="participante-item">
            <div class="participante-avatar">${iniciais}</div>
            <div class="participante-info">
              <div class="participante-nome">${p.nome}</div>
              <div class="participante-agencia">${p.agenciaNome || 'Sem agência'} • ${p.pontos} pts</div>
            </div>
            <div class="participante-actions">
              <button class="btn btn-sm btn-secondary" onclick="verLinkParticipante('${campanha.id}', '${p.id}', '${p.nome}')">🔗 Link</button>
              <button class="btn btn-sm btn-danger" onclick="removerParticipante('${campanha.id}', '${p.id}')">🗑️</button>
            </div>
          </div>
        `;
      }).join("")
    : `<div style="text-align: center; padding: 30px; color: var(--muted);">Nenhum participante adicionado</div>`;
  
  $("modalGerenciarBody").innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-value">${campanha.participantes.length}</div>
        <div class="stat-label">Participantes</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⭐</div>
        <div class="stat-value">${campanha.totalPontos.toLocaleString("pt-BR")}</div>
        <div class="stat-label">Pontos Total</div>
      </div>
    </div>
    
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
      <h4 style="font-weight: 700;">👥 Participantes</h4>
      <button class="btn btn-sm btn-primary" onclick="abrirModalNovoParticipante('${campanha.id}')">➕ Adicionar</button>
    </div>
    
    <div class="participantes-list">
      ${participantesHtml}
    </div>
    
    <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
      <h4 style="font-weight: 700; margin-bottom: 16px;">⚙️ Ações</h4>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn btn-secondary" onclick="exportarCampanha('${campanha.id}')">📊 Exportar Dados</button>
        ${campanha.status === 'ativa' 
          ? `<button class="btn btn-danger" onclick="encerrarCampanha('${campanha.id}')">🏁 Encerrar Campanha</button>`
          : `<button class="btn btn-success" onclick="reativarCampanha('${campanha.id}')">▶️ Reativar Campanha</button>`
        }
      </div>
    </div>
  `;
  
  $("modalGerenciarCampanha").classList.add("active");
}

// ==== Participantes ====
function abrirModalNovoParticipante(campanhaId) {
  CAMPANHA_ATUAL = CAMPANHAS.find(c => c.id === campanhaId);
  if (!CAMPANHA_ATUAL) return;
  
  // Limpar formulário
  $("participanteNome").value = "";
  $("participanteAgencia").value = "";
  $("participanteCargo").value = "";
  $("participanteEmail").value = "";
  $("participanteTelefone").value = "";
  
  // Filtrar agências da campanha
  const select = $("participanteAgencia");
  if (select && CAMPANHA_ATUAL.agencias?.length > 0) {
    select.innerHTML = `<option value="">Selecione...</option>` +
      CAMPANHA_ATUAL.agencias
        .map(id => `<option value="${id}">${AGENCIAS[id] || id}</option>`)
        .join("");
  }
  
  fecharModal("modalGerenciarCampanha");
  $("modalNovoParticipante").classList.add("active");
}

async function adicionarParticipante() {
  if (!CAMPANHA_ATUAL) return;
  
  const nome = $("participanteNome").value.trim();
  const agenciaId = $("participanteAgencia").value;
  const cargo = $("participanteCargo").value.trim();
  const email = $("participanteEmail").value.trim();
  const telefone = $("participanteTelefone").value.trim();
  
  if (!nome) {
    alert("Informe o nome do participante!");
    return;
  }
  
  try {
    const docRef = await db.collection("campanhas").doc(CAMPANHA_ATUAL.id)
      .collection("participantes").add({
        nome: nome,
        agenciaId: agenciaId,
        agenciaNome: AGENCIAS[agenciaId] || "",
        cargo: cargo,
        email: email,
        telefone: telefone,
        pontos: 0,
        dataCriacao: firebase.firestore.FieldValue.serverTimestamp()
      });
    
    fecharModal("modalNovoParticipante");
    
    // Mostrar link imediatamente
    verLinkParticipante(CAMPANHA_ATUAL.id, docRef.id, nome);
    
    // Recarregar dados
    CAMPANHAS = [];
    PARTICIPANTES_TODOS = [];
    await carregarCampanhas();
    renderizarTudo();
    
  } catch (error) {
    console.error("Erro ao adicionar participante:", error);
    alert("Erro ao adicionar. Tente novamente.");
  }
}

function verLinkParticipante(campanhaId, participanteId, nome) {
  const baseUrl = window.location.origin + window.location.pathname.replace("campanhas-admin.html", "");
  const link = `${baseUrl}campanha.html?c=${campanhaId}&p=${participanteId}`;
  
  $("linkParticipanteNome").textContent = nome;
  $("linkParticipanteUrl").value = link;
  
  // Salvar para WhatsApp
  window.LINK_ATUAL = { nome, link };
  
  fecharModal("modalGerenciarCampanha");
  $("modalLinkParticipante").classList.add("active");
}

function copiarLink() {
  const input = $("linkParticipanteUrl");
  input.select();
  document.execCommand("copy");
  alert("Link copiado!");
}

function enviarWhatsApp() {
  if (!window.LINK_ATUAL) return;
  
  const texto = encodeURIComponent(
    `🎯 Olá ${window.LINK_ATUAL.nome}!\n\n` +
    `Você foi convidado(a) para participar da nossa campanha de indicações!\n\n` +
    `Acesse seu portal exclusivo:\n${window.LINK_ATUAL.link}\n\n` +
    `Boa sorte! 🏆`
  );
  
  window.open(`https://wa.me/?text=${texto}`, "_blank");
}

async function removerParticipante(campanhaId, participanteId) {
  if (!confirm("Tem certeza que deseja remover este participante?")) return;
  
  try {
    await db.collection("campanhas").doc(campanhaId)
      .collection("participantes").doc(participanteId).delete();
    
    // Recarregar
    CAMPANHAS = [];
    PARTICIPANTES_TODOS = [];
    await carregarCampanhas();
    renderizarTudo();
    
    fecharModal("modalGerenciarCampanha");
    alert("Participante removido.");
    
  } catch (error) {
    console.error("Erro:", error);
    alert("Erro ao remover.");
  }
}

// ==== Ações da Campanha ====
async function encerrarCampanha(campanhaId) {
  if (!confirm("Tem certeza que deseja encerrar esta campanha?")) return;
  
  try {
    await db.collection("campanhas").doc(campanhaId).update({ status: "encerrada" });
    
    CAMPANHAS = [];
    PARTICIPANTES_TODOS = [];
    await carregarCampanhas();
    renderizarTudo();
    
    fecharModal("modalGerenciarCampanha");
    alert("Campanha encerrada.");
    
  } catch (error) {
    console.error("Erro:", error);
    alert("Erro ao encerrar.");
  }
}

async function reativarCampanha(campanhaId) {
  try {
    await db.collection("campanhas").doc(campanhaId).update({ status: "ativa" });
    
    CAMPANHAS = [];
    PARTICIPANTES_TODOS = [];
    await carregarCampanhas();
    renderizarTudo();
    
    fecharModal("modalGerenciarCampanha");
    alert("Campanha reativada.");
    
  } catch (error) {
    console.error("Erro:", error);
    alert("Erro ao reativar.");
  }
}

function exportarCampanha(campanhaId) {
  const campanha = CAMPANHAS.find(c => c.id === campanhaId);
  if (!campanha) return;
  
  const acoes = ACOES_TODAS.filter(a => a.campanhaId === campanhaId);
  
  const dados = acoes.map(a => ({
    "Data": fmtDataHora(a.dataRegistro),
    "Participante": a.participanteNome,
    "Empresa": a.empresaNome,
    "Ação": a.tipo,
    "Pontos": a.pontos
  }));
  
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ações");
  
  // Aba de participantes
  const partDados = campanha.participantes.map(p => ({
    "Nome": p.nome,
    "Agência": p.agenciaNome,
    "Pontos": p.pontos,
    "Último Acesso": fmtDataHora(p.ultimoAcesso)
  }));
  const wsPart = XLSX.utils.json_to_sheet(partDados);
  XLSX.utils.book_append_sheet(wb, wsPart, "Participantes");
  
  XLSX.writeFile(wb, `campanha-${campanha.nome.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==== Filtros ====
function filtrarRanking() {
  renderizarRanking();
}

function filtrarAcoes() {
  renderizarAcoes();
}

// ==== Exportar Relatório Geral ====
function exportarRelatorio() {
  // Participantes
  const partDados = PARTICIPANTES_TODOS.map((p, idx) => ({
    "Posição": idx + 1,
    "Nome": p.nome,
    "Agência": p.agenciaNome,
    "Campanha": p.campanhaNome,
    "Pontos": p.pontos
  }));
  
  const ws = XLSX.utils.json_to_sheet(partDados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ranking");
  
  // Ações
  const acoesDados = ACOES_TODAS.map(a => ({
    "Data": fmtDataHora(a.dataRegistro),
    "Campanha": a.campanhaNome,
    "Participante": a.participanteNome,
    "Empresa": a.empresaNome,
    "Ação": a.tipo,
    "Pontos": a.pontos
  }));
  const wsAcoes = XLSX.utils.json_to_sheet(acoesDados);
  XLSX.utils.book_append_sheet(wb, wsAcoes, "Ações");
  
  XLSX.writeFile(wb, `relatorio-campanhas-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==== Globals ====
window.trocarTab = trocarTab;
window.abrirModalNovaCampanha = abrirModalNovaCampanha;
window.fecharModal = fecharModal;
window.criarCampanha = criarCampanha;
window.gerenciarCampanha = gerenciarCampanha;
window.abrirModalNovoParticipante = abrirModalNovoParticipante;
window.adicionarParticipante = adicionarParticipante;
window.verLinkParticipante = verLinkParticipante;
window.copiarLink = copiarLink;
window.enviarWhatsApp = enviarWhatsApp;
window.removerParticipante = removerParticipante;
window.encerrarCampanha = encerrarCampanha;
window.reativarCampanha = reativarCampanha;
window.exportarCampanha = exportarCampanha;
window.filtrarRanking = filtrarRanking;
window.filtrarAcoes = filtrarAcoes;
window.exportarRelatorio = exportarRelatorio;
