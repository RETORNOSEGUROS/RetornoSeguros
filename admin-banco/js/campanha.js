// campanha.js — Portal de Campanha para Assistentes de Banco
// Firebase v8

// ==== Firebase Init ====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// ==== Estado Global ====
let CAMPANHA = null;
let PARTICIPANTE = null;
let EMPRESAS = [];
let EMPRESAS_FILTRADAS = [];
let RANKING = [];
let HISTORICO = [];
let REGRAS = [];

// Modal state
let MODAL_EMPRESA = null;
let MODAL_ACAO = null;

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

// ==== Inicialização ====
async function init() {
  // Pegar parâmetros da URL
  const params = new URLSearchParams(window.location.search);
  const campanhaId = params.get('c') || params.get('campanha');
  const participanteId = params.get('p') || params.get('participante');

  if (!campanhaId || !participanteId) {
    mostrarNotFound();
    return;
  }

  try {
    // Carregar campanha
    const campanhaDoc = await db.collection("campanhas").doc(campanhaId).get();
    if (!campanhaDoc.exists) {
      mostrarNotFound();
      return;
    }
    CAMPANHA = { id: campanhaDoc.id, ...campanhaDoc.data() };

    // Verificar se campanha está ativa
    if (CAMPANHA.status === 'encerrada') {
      mostrarCampanhaEncerrada();
      return;
    }

    // Carregar participante
    const participanteDoc = await db.collection("campanhas").doc(campanhaId)
      .collection("participantes").doc(participanteId).get();
    
    if (!participanteDoc.exists) {
      mostrarNotFound();
      return;
    }
    PARTICIPANTE = { id: participanteDoc.id, ...participanteDoc.data() };

    // Registrar acesso
    await db.collection("campanhas").doc(campanhaId)
      .collection("participantes").doc(participanteId)
      .update({ ultimoAcesso: firebase.firestore.FieldValue.serverTimestamp() });

    // Carregar regras da campanha ou usar padrão
    REGRAS = CAMPANHA.regras || REGRAS_PADRAO;

    // Carregar dados
    await Promise.all([
      carregarEmpresas(),
      carregarRanking(),
      carregarHistorico()
    ]);

    // Renderizar
    renderizarHeader();
    renderizarTudo();

    // Mostrar conteúdo
    $("loadingState").style.display = "none";
    $("campanhaContent").style.display = "block";
    document.querySelector(".main").appendChild($("campanhaContent"));

  } catch (error) {
    console.error("Erro ao carregar campanha:", error);
    mostrarNotFound();
  }
}

function mostrarNotFound() {
  $("loadingState").style.display = "none";
  $("headerCampanha").style.display = "none";
  $("notFoundState").style.display = "block";
  document.querySelector(".main").appendChild($("notFoundState"));
}

function mostrarCampanhaEncerrada() {
  $("loadingState").innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 80px; margin-bottom: 20px;">🏁</div>
      <h2 style="font-size: 24px; margin-bottom: 8px;">Campanha Encerrada</h2>
      <p style="color: var(--muted);">Esta campanha já foi finalizada.</p>
    </div>
  `;
}

// ==== Carregar Dados ====
async function carregarEmpresas() {
  try {
    // Empresas vinculadas à agência do participante
    const agenciaId = PARTICIPANTE.agenciaId;
    
    let query = db.collection("empresas");
    if (agenciaId) {
      query = query.where("agenciaId", "==", agenciaId);
    }
    
    const snap = await query.get();
    
    // Carregar ações já realizadas para cada empresa
    const acoesSnap = await db.collection("campanhas").doc(CAMPANHA.id)
      .collection("acoes")
      .where("participanteId", "==", PARTICIPANTE.id)
      .get();
    
    const acoesPorEmpresa = {};
    acoesSnap.forEach(doc => {
      const acao = doc.data();
      if (!acoesPorEmpresa[acao.empresaId]) {
        acoesPorEmpresa[acao.empresaId] = [];
      }
      acoesPorEmpresa[acao.empresaId].push({ id: doc.id, ...acao });
    });
    
    snap.forEach(doc => {
      const d = doc.data();
      const acoes = acoesPorEmpresa[doc.id] || [];
      
      // Determinar status baseado nas ações
      let status = "diamante"; // Não abordada
      if (acoes.length > 0) {
        const temDecisao = acoes.some(a => a.tipo === "decisao_fechou" || a.tipo === "decisao_nao_fechou");
        status = temDecisao ? "concluido" : "andamento";
      }
      
      EMPRESAS.push({
        id: doc.id,
        nome: d.nome || d.razaoSocial || "Empresa",
        cnpj: d.cnpj || "",
        cidade: d.cidade || "",
        numFuncionarios: d.numFuncionarios || 0,
        socios: d.socios || [],
        email: d.email || "",
        status: status,
        acoes: acoes,
        acoesTipos: acoes.map(a => a.tipo)
      });
    });
    
    EMPRESAS.sort((a, b) => {
      // Priorizar não abordadas (diamante)
      const statusOrder = { diamante: 0, andamento: 1, concluido: 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.nome.localeCompare(b.nome);
    });
    
    EMPRESAS_FILTRADAS = [...EMPRESAS];
  } catch (e) {
    console.error("Erro ao carregar empresas:", e);
  }
}

async function carregarRanking() {
  try {
    const snap = await db.collection("campanhas").doc(CAMPANHA.id)
      .collection("participantes")
      .orderBy("pontos", "desc")
      .limit(20)
      .get();
    
    let pos = 1;
    snap.forEach(doc => {
      const d = doc.data();
      RANKING.push({
        id: doc.id,
        nome: d.nome || "Participante",
        agencia: d.agenciaNome || "",
        pontos: d.pontos || 0,
        posicao: pos++,
        isMe: doc.id === PARTICIPANTE.id
      });
    });
  } catch (e) {
    console.error("Erro ao carregar ranking:", e);
  }
}

async function carregarHistorico() {
  try {
    const snap = await db.collection("campanhas").doc(CAMPANHA.id)
      .collection("acoes")
      .where("participanteId", "==", PARTICIPANTE.id)
      .orderBy("dataRegistro", "desc")
      .limit(50)
      .get();
    
    snap.forEach(doc => {
      const d = doc.data();
      HISTORICO.push({
        id: doc.id,
        tipo: d.tipo,
        empresaNome: d.empresaNome || "",
        pontos: d.pontos || 0,
        dataRegistro: toDate(d.dataRegistro),
        descricao: d.descricao || ""
      });
    });
  } catch (e) {
    console.error("Erro ao carregar histórico:", e);
  }
}

// ==== Renderização ====
function renderizarHeader() {
  $("campanhaNome").textContent = CAMPANHA.nome || "Campanha";
  $("campanhaDesc").textContent = CAMPANHA.descricao || "";
  
  const iniciais = (PARTICIPANTE.nome || "?").split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  $("userAvatar").textContent = iniciais;
  $("userName").textContent = PARTICIPANTE.nome || "Participante";
  $("userAgencia").textContent = PARTICIPANTE.agenciaNome || "Agência";
  $("userPoints").textContent = PARTICIPANTE.pontos || 0;
}

function renderizarTudo() {
  renderizarStats();
  renderizarEmpresas();
  renderizarRanking();
  renderizarMeusPontos();
  renderizarRegras();
}

function renderizarStats() {
  const naoAbordadas = EMPRESAS.filter(e => e.status === "diamante").length;
  const emAndamento = EMPRESAS.filter(e => e.status === "andamento").length;
  const concluidas = EMPRESAS.filter(e => e.status === "concluido").length;
  
  $("statNaoAbordadas").textContent = naoAbordadas;
  $("statEmAndamento").textContent = emAndamento;
  $("statConcluidas").textContent = concluidas;
  $("statTotal").textContent = EMPRESAS.length;
  $("badgeEmpresas").textContent = EMPRESAS.length;
}

function renderizarEmpresas() {
  const container = $("empresaGrid");
  
  if (EMPRESAS_FILTRADAS.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">
        <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
        <p>Nenhuma empresa encontrada</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = EMPRESAS_FILTRADAS.map(emp => {
    const statusIcon = { diamante: "💎", andamento: "🔄", concluido: "✅" };
    const statusClass = { diamante: "status-diamante", andamento: "status-andamento", concluido: "status-concluido" };
    
    // Calcular ações pendentes
    const acoesPendentes = REGRAS.filter(r => !emp.acoesTipos.includes(r.tipo));
    const acoesFeitas = REGRAS.filter(r => emp.acoesTipos.includes(r.tipo));
    
    return `
      <div class="empresa-card ${statusClass[emp.status]}" onclick="abrirEmpresa('${emp.id}')">
        <div class="empresa-card-body">
          <div class="empresa-header">
            <div>
              <div class="empresa-nome">${emp.nome}</div>
              <div class="empresa-info">${emp.cidade || 'Sem cidade'} ${emp.cnpj ? `• ${emp.cnpj}` : ''}</div>
            </div>
            <div class="empresa-status-icon">${statusIcon[emp.status]}</div>
          </div>
          <div class="empresa-meta">
            ${emp.numFuncionarios > 0 ? `<span class="meta-tag funcionarios">👥 ${emp.numFuncionarios} func.</span>` : ''}
            ${emp.acoesTipos.includes('dados_socios') ? `<span class="meta-tag socios">✓ Sócios</span>` : ''}
            ${emp.acoesTipos.includes('email_cotacao_dental') ? `<span class="meta-tag dental">✓ Dental</span>` : ''}
            ${emp.acoesTipos.includes('email_cotacao_saude') ? `<span class="meta-tag saude">✓ Saúde</span>` : ''}
          </div>
          <div class="empresa-actions">
            <div style="font-size: 11px; color: var(--muted); margin-bottom: 8px;">
              ${acoesFeitas.length}/${REGRAS.length} ações realizadas
            </div>
            <div style="height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden;">
              <div style="height: 100%; width: ${(acoesFeitas.length / REGRAS.length) * 100}%; background: linear-gradient(90deg, var(--brand), var(--brand-light)); transition: width 0.3s;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderizarRanking() {
  // Pódio (top 3)
  const podium = $("rankingPodium");
  const top3 = RANKING.slice(0, 3);
  
  if (top3.length >= 3) {
    // Reorganizar: 2º, 1º, 3º
    const ordem = [top3[1], top3[0], top3[2]];
    podium.innerHTML = ordem.map((p, idx) => {
      const classes = ["second", "first", "third"];
      const iniciais = (p.nome || "?").split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
      return `
        <div class="podium-item ${classes[idx]} ${p.isMe ? 'is-me' : ''}">
          <div class="podium-avatar">${iniciais}</div>
          <div class="podium-name">${p.nome}</div>
          <div class="podium-points">${p.pontos} pts</div>
          <div class="podium-position">${p.posicao}º</div>
        </div>
      `;
    }).join("");
  } else {
    podium.innerHTML = '<p style="color: var(--muted); font-size: 14px;">Ranking ainda não disponível</p>';
  }
  
  // Lista (4º em diante)
  const lista = $("rankingList");
  const restante = RANKING.slice(3);
  
  if (restante.length > 0) {
    lista.innerHTML = restante.map(p => `
      <div class="ranking-row ${p.isMe ? 'is-me' : ''}">
        <div class="ranking-pos">${p.posicao}º</div>
        <div class="ranking-name">${p.nome}</div>
        <div class="ranking-pts">${p.pontos} pts</div>
      </div>
    `).join("");
  } else {
    lista.innerHTML = '';
  }
}

function renderizarMeusPontos() {
  // Stats
  const minhaPosicao = RANKING.find(r => r.isMe)?.posicao || 0;
  const empresasTrabalhadas = new Set(HISTORICO.map(h => h.empresaNome)).size;
  
  $("meusPontosTotal").textContent = PARTICIPANTE.pontos || 0;
  $("minhasPosicao").textContent = minhaPosicao > 0 ? `#${minhaPosicao}` : "-";
  $("minhasAcoes").textContent = HISTORICO.length;
  $("minhasEmpresas").textContent = empresasTrabalhadas;
  
  // Histórico
  const container = $("historicoList");
  
  if (HISTORICO.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--muted);">
        <div style="font-size: 40px; margin-bottom: 12px;">📭</div>
        <p>Nenhuma ação registrada ainda</p>
        <p style="font-size: 12px;">Comece a trabalhar as empresas!</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = HISTORICO.map(h => {
    const regra = REGRAS.find(r => r.tipo === h.tipo);
    return `
      <div class="rule-item">
        <div class="rule-icon">${regra?.icon || '📋'}</div>
        <div class="rule-info">
          <div class="rule-desc">${h.empresaNome}</div>
          <div style="font-size: 11px; color: var(--muted);">${regra?.descricao || h.tipo} • ${fmtDataHora(h.dataRegistro)}</div>
        </div>
        <div class="rule-points">+${h.pontos}</div>
      </div>
    `;
  }).join("");
}

function renderizarRegras() {
  const container = $("regrasList");
  
  container.innerHTML = REGRAS.map(r => `
    <div class="rule-item">
      <div class="rule-icon">${r.icon}</div>
      <div class="rule-info">
        <div class="rule-desc">${r.descricao}</div>
      </div>
      <div class="rule-points">+${r.pontos} pts</div>
    </div>
  `).join("");
}

// ==== Filtros ====
function filtrarEmpresas() {
  const termo = normalizar($("searchEmpresa").value);
  
  if (!termo) {
    EMPRESAS_FILTRADAS = [...EMPRESAS];
  } else {
    EMPRESAS_FILTRADAS = EMPRESAS.filter(e => 
      normalizar(e.nome).includes(termo) ||
      normalizar(e.cnpj).includes(termo) ||
      normalizar(e.cidade).includes(termo)
    );
  }
  
  renderizarEmpresas();
}

// ==== Tabs ====
function trocarTab(tabId) {
  // Atualizar tabs
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  
  event.target.closest('.tab').classList.add('active');
  $(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1).replace(/-([a-z])/g, g => g[1].toUpperCase())}`).classList.add('active');
}

// ==== Modal Empresa ====
function abrirEmpresa(empresaId) {
  const empresa = EMPRESAS.find(e => e.id === empresaId);
  if (!empresa) return;
  
  MODAL_EMPRESA = empresa;
  
  // Gerar formulário baseado nas ações pendentes
  const acoesPendentes = REGRAS.filter(r => !empresa.acoesTipos.includes(r.tipo));
  const acoesFeitas = REGRAS.filter(r => empresa.acoesTipos.includes(r.tipo));
  
  $("modalAcaoTitle").innerHTML = `📋 ${empresa.nome}`;
  
  let bodyHtml = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: 13px; color: var(--muted); margin-bottom: 8px;">Progresso</div>
      <div style="height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
        <div style="height: 100%; width: ${(acoesFeitas.length / REGRAS.length) * 100}%; background: linear-gradient(90deg, var(--brand), var(--brand-light));"></div>
      </div>
      <div style="font-size: 12px; color: var(--muted);">${acoesFeitas.length} de ${REGRAS.length} ações realizadas</div>
    </div>
  `;
  
  if (acoesFeitas.length > 0) {
    bodyHtml += `
      <div style="margin-bottom: 20px;">
        <div style="font-size: 12px; font-weight: 700; color: var(--success); margin-bottom: 8px;">✅ Ações Realizadas</div>
        ${acoesFeitas.map(r => `
          <div style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #d1fae5; border-radius: 8px; margin-bottom: 6px; font-size: 13px;">
            <span>${r.icon}</span>
            <span style="flex: 1;">${r.descricao}</span>
            <span style="font-weight: 700; color: var(--success);">+${r.pontos}</span>
          </div>
        `).join("")}
      </div>
    `;
  }
  
  if (acoesPendentes.length > 0) {
    bodyHtml += `
      <div>
        <div style="font-size: 12px; font-weight: 700; color: var(--brand); margin-bottom: 12px;">🎯 Ações Disponíveis</div>
        <div class="form-group">
          <label class="form-label">Selecione a ação</label>
          <select class="form-select" id="selectAcao" onchange="mostrarCamposAcao()">
            <option value="">Escolha uma ação...</option>
            ${acoesPendentes.map(r => `
              <option value="${r.tipo}" data-pontos="${r.pontos}">${r.icon} ${r.descricao} (+${r.pontos} pts)</option>
            `).join("")}
          </select>
        </div>
        <div id="camposAcao"></div>
      </div>
    `;
  } else {
    bodyHtml += `
      <div style="text-align: center; padding: 20px; background: #d1fae5; border-radius: 12px;">
        <div style="font-size: 40px; margin-bottom: 8px;">🎉</div>
        <div style="font-weight: 700; color: var(--success);">Parabéns!</div>
        <div style="font-size: 13px; color: var(--muted);">Todas as ações foram concluídas para esta empresa.</div>
      </div>
    `;
  }
  
  $("modalAcaoBody").innerHTML = bodyHtml;
  $("btnSalvarAcao").style.display = acoesPendentes.length > 0 ? "inline-flex" : "none";
  $("modalAcao").classList.add("active");
}

function mostrarCamposAcao() {
  const tipo = $("selectAcao").value;
  const container = $("camposAcao");
  
  if (!tipo) {
    container.innerHTML = "";
    return;
  }
  
  // Campos específicos por tipo de ação
  const campos = {
    "numero_funcionarios": `
      <div class="form-group">
        <label class="form-label">Número de Funcionários</label>
        <input type="number" class="form-input" id="campoFuncionarios" placeholder="Ex: 25" min="1">
        <div class="form-hint">Informe o número atualizado de funcionários da empresa</div>
      </div>
    `,
    "dados_socios": `
      <div class="form-group">
        <label class="form-label">Dados dos Sócios</label>
        <textarea class="form-textarea" id="campoSocios" placeholder="Nome: João Silva&#10;Nascimento: 15/03/1980&#10;&#10;Nome: Maria Santos&#10;Nascimento: 22/07/1975"></textarea>
        <div class="form-hint">Informe nome e data de nascimento de cada sócio</div>
      </div>
    `,
    "email_cotacao_dental": `
      <div class="form-group">
        <label class="form-label">E-mail do Cliente</label>
        <input type="email" class="form-input" id="campoEmail" placeholder="cliente@empresa.com">
        <div class="form-hint">E-mail para enviarmos a cotação de plano dental</div>
      </div>
    `,
    "email_cotacao_saude": `
      <div class="form-group">
        <label class="form-label">E-mail do Cliente</label>
        <input type="email" class="form-input" id="campoEmail" placeholder="cliente@empresa.com">
        <div class="form-hint">E-mail para enviarmos a cotação de plano de saúde</div>
      </div>
    `,
    "reuniao_agendada": `
      <div class="form-group">
        <label class="form-label">Data e Hora da Reunião</label>
        <input type="datetime-local" class="form-input" id="campoDataReuniao">
      </div>
      <div class="form-group">
        <label class="form-label">Observações</label>
        <textarea class="form-textarea" id="campoObsReuniao" placeholder="Detalhes da reunião, participantes, etc."></textarea>
      </div>
    `,
    "contato_beneficios": `
      <div class="form-group">
        <label class="form-label">Forma de Contato</label>
        <select class="form-select" id="campoFormaContato">
          <option value="whatsapp">WhatsApp</option>
          <option value="ligacao">Ligação</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Feedback do Cliente</label>
        <textarea class="form-textarea" id="campoFeedback" placeholder="O que o cliente disse sobre os benefícios?"></textarea>
      </div>
    `,
    "decisao_nao_fechou": `
      <div class="form-group">
        <label class="form-label">Motivo da Recusa</label>
        <select class="form-select" id="campoMotivoRecusa">
          <option value="">Selecione...</option>
          <option value="preco">Preço alto</option>
          <option value="ja_tem">Já possui plano</option>
          <option value="sem_interesse">Sem interesse no momento</option>
          <option value="concorrente">Fechou com concorrente</option>
          <option value="outro">Outro</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Justificativa Detalhada</label>
        <textarea class="form-textarea" id="campoJustificativa" placeholder="Explique o motivo do cliente não fechar..."></textarea>
      </div>
    `,
    "decisao_fechou": `
      <div class="form-group">
        <label class="form-label">Produto Fechado</label>
        <select class="form-select" id="campoProdutoFechado">
          <option value="">Selecione...</option>
          <option value="dental">Plano Dental</option>
          <option value="saude">Plano de Saúde</option>
          <option value="vida">Seguro de Vida</option>
          <option value="outros">Outros</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Observações</label>
        <textarea class="form-textarea" id="campoObsFechamento" placeholder="Detalhes do fechamento..."></textarea>
      </div>
    `
  };
  
  container.innerHTML = campos[tipo] || `
    <div class="form-group">
      <label class="form-label">Observações</label>
      <textarea class="form-textarea" id="campoObs" placeholder="Adicione detalhes..."></textarea>
    </div>
  `;
}

function fecharModalAcao() {
  $("modalAcao").classList.remove("active");
  MODAL_EMPRESA = null;
  MODAL_ACAO = null;
}

// ==== Salvar Ação ====
async function salvarAcao() {
  if (!MODAL_EMPRESA) return;
  
  const tipo = $("selectAcao")?.value;
  if (!tipo) {
    alert("Selecione uma ação!");
    return;
  }
  
  const regra = REGRAS.find(r => r.tipo === tipo);
  if (!regra) return;
  
  // Coletar dados específicos
  let dados = {};
  
  switch (tipo) {
    case "numero_funcionarios":
      dados.funcionarios = parseInt($("campoFuncionarios")?.value) || 0;
      if (!dados.funcionarios) { alert("Informe o número de funcionários!"); return; }
      break;
    case "dados_socios":
      dados.socios = $("campoSocios")?.value || "";
      if (!dados.socios.trim()) { alert("Informe os dados dos sócios!"); return; }
      break;
    case "email_cotacao_dental":
    case "email_cotacao_saude":
      dados.email = $("campoEmail")?.value || "";
      if (!dados.email.includes("@")) { alert("Informe um e-mail válido!"); return; }
      break;
    case "reuniao_agendada":
      dados.dataReuniao = $("campoDataReuniao")?.value || "";
      dados.observacoes = $("campoObsReuniao")?.value || "";
      if (!dados.dataReuniao) { alert("Informe a data da reunião!"); return; }
      break;
    case "contato_beneficios":
      dados.formaContato = $("campoFormaContato")?.value || "whatsapp";
      dados.feedback = $("campoFeedback")?.value || "";
      break;
    case "decisao_nao_fechou":
      dados.motivo = $("campoMotivoRecusa")?.value || "";
      dados.justificativa = $("campoJustificativa")?.value || "";
      if (!dados.justificativa.trim()) { alert("Informe a justificativa!"); return; }
      break;
    case "decisao_fechou":
      dados.produto = $("campoProdutoFechado")?.value || "";
      dados.observacoes = $("campoObsFechamento")?.value || "";
      break;
  }
  
  // Desabilitar botão
  const btn = $("btnSalvarAcao");
  btn.disabled = true;
  btn.innerHTML = "⏳ Salvando...";
  
  try {
    // Registrar ação
    await db.collection("campanhas").doc(CAMPANHA.id)
      .collection("acoes").add({
        tipo: tipo,
        empresaId: MODAL_EMPRESA.id,
        empresaNome: MODAL_EMPRESA.nome,
        participanteId: PARTICIPANTE.id,
        participanteNome: PARTICIPANTE.nome,
        pontos: regra.pontos,
        dados: dados,
        dataRegistro: firebase.firestore.FieldValue.serverTimestamp()
      });
    
    // Atualizar pontos do participante
    const novosPontos = (PARTICIPANTE.pontos || 0) + regra.pontos;
    await db.collection("campanhas").doc(CAMPANHA.id)
      .collection("participantes").doc(PARTICIPANTE.id)
      .update({ pontos: novosPontos });
    
    PARTICIPANTE.pontos = novosPontos;
    
    // Atualizar empresa (para número de funcionários)
    if (tipo === "numero_funcionarios" && dados.funcionarios) {
      await db.collection("empresas").doc(MODAL_EMPRESA.id)
        .update({ numFuncionarios: dados.funcionarios });
    }
    
    // Fechar modal
    fecharModalAcao();
    
    // Mostrar animação de pontos
    mostrarPontosGanhos(regra.pontos);
    
    // Recarregar dados
    EMPRESAS = [];
    RANKING = [];
    HISTORICO = [];
    await Promise.all([carregarEmpresas(), carregarRanking(), carregarHistorico()]);
    renderizarHeader();
    renderizarTudo();
    
  } catch (error) {
    console.error("Erro ao salvar ação:", error);
    alert("Erro ao salvar. Tente novamente.");
    btn.disabled = false;
    btn.innerHTML = "✨ Registrar e Ganhar Pontos";
  }
}

function mostrarPontosGanhos(pontos) {
  const toast = $("pointsToast");
  $("toastAmount").textContent = pontos;
  toast.classList.add("active");
  
  // Confetti!
  if (typeof confetti !== "undefined") {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#7c3aed', '#a855f7', '#ec4899', '#fbbf24']
    });
  }
  
  setTimeout(() => {
    toast.classList.remove("active");
  }, 2500);
}

// ==== Globals ====
window.trocarTab = trocarTab;
window.abrirEmpresa = abrirEmpresa;
window.fecharModalAcao = fecharModalAcao;
window.salvarAcao = salvarAcao;
window.filtrarEmpresas = filtrarEmpresas;
window.mostrarCamposAcao = mostrarCamposAcao;

// ==== Init ====
document.addEventListener("DOMContentLoaded", init);
