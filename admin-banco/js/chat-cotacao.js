// chat-cotacao.js — Chat de Cotação Modernizado
// Firebase v8 compatível

// ==== Firebase Init ====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage ? firebase.storage() : null;

// ==== Estado Global ====
let CTX = { uid: null, perfil: null, agenciaId: null, nome: null, email: null, isAdmin: false };
const ADMIN_EMAILS = ["patrick@retornoseguros.com.br"];

let cotacaoId = null;
let cotacaoRef = null;
let cotacaoData = null;
let configStatus = null;

// ==== Status Config ====
const STATUS_FIXOS = [
  "Negócio Emitido",
  "Pendente Agência",
  "Pendente Corretor",
  "Pendente Seguradora",
  "Pendente Cliente",
  "Recusado Cliente",
  "Recusado Seguradora",
  "Emitido Declinado",
  "Em Emissão",
  "Negócio Fechado"
];

const STATUS_EXIGE_EXTRA = new Set([
  "Pendente Agência",
  "Pendente Corretor",
  "Pendente Seguradora",
  "Pendente Cliente",
  "Emitido Declinado",
  "Em Emissão",
  "Negócio Fechado"
]);

const FALLBACK_MOTIVOS_CLIENTE = [
  "Preço acima do esperado",
  "Coberturas não atendem",
  "Cliente adiou decisão",
  "Fechou com o banco"
];

const FALLBACK_MOTIVOS_SEGURADORA = [
  "Risco não aceito",
  "Sinistralidade elevada",
  "Documentação insuficiente"
];

const TEMPLATES_MENSAGEM = {
  aguardando_docs: "📎 Aguardando documentação do cliente para prosseguir.",
  enviado_seg: "📤 Proposta enviada para a seguradora. Aguardando retorno.",
  retorno_cliente: "📞 Entrei em contato com o cliente. Aguardando decisão.",
  proposta_enviada: "📋 Proposta comercial enviada ao cliente por email."
};

const TEMPERATURA_CONFIG = {
  quente: {
    icon: '🔥',
    title: 'Negócio Quente',
    desc: 'Alta probabilidade de fechamento! Priorize este negócio.',
    class: 'quente'
  },
  morno: {
    icon: '🟡',
    title: 'Negócio Morno',
    desc: 'Probabilidade média de fechamento. Continue acompanhando.',
    class: 'morno'
  },
  frio: {
    icon: '❄️',
    title: 'Negócio Frio',
    desc: 'Baixa probabilidade no momento. Mantenha relacionamento.',
    class: 'frio'
  }
};

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
const fmtBRL = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function tempoRelativo(data) {
  if (!data) return "";
  const agora = new Date();
  const diff = agora - data;
  const minutos = Math.floor(diff / 60000);
  const horas = Math.floor(diff / 3600000);
  const dias = Math.floor(diff / 86400000);
  
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  if (horas < 24) return `há ${horas}h`;
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return fmtData(data);
}

function categoriaStatus(status) {
  const st = normalizar(status);
  if (st.includes('emitido') || st.includes('fechado')) return "emitido";
  if (st.includes('pendente')) return "pendente";
  if (st.includes('recusado') || st.includes('declinado')) return "recusado";
  if (st.includes('emissão') || st.includes('emissao')) return "emissao";
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

function getIniciais(nome) {
  if (!nome) return "?";
  const partes = nome.split(" ").filter(Boolean);
  if (partes.length >= 2) {
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }
  return nome.substring(0, 2).toUpperCase();
}

// ==== Auth ====
auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = "login.html"; return; }
  
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
  
  // Carregar cotação
  const params = new URLSearchParams(window.location.search);
  cotacaoId = params.get("id");
  
  if (!cotacaoId) {
    alert("ID de cotação não informado.");
    return;
  }
  
  cotacaoRef = db.collection("cotacoes-gerentes").doc(cotacaoId);
  
  try {
    const doc = await cotacaoRef.get();
    if (!doc.exists) {
      alert("Cotação não encontrada.");
      window.location.href = "cotacoes.html";
      return;
    }
    cotacaoData = { id: doc.id, ...doc.data() };
    
    // Verificar permissão
    if (!CTX.isAdmin) {
      const permOk = await verificarPermissao();
      if (!permOk) {
        alert("Sem permissão para acessar esta cotação.");
        window.location.href = "cotacoes.html";
        return;
      }
    }
    
    await init();
    
  } catch (e) {
    console.error("Erro ao carregar cotação:", e);
    alert("Erro ao carregar cotação.");
  }
});

async function verificarPermissao() {
  // Gerente-chefe/assistente: verifica agência
  if (["gerente chefe", "assistente"].includes(CTX.perfil)) {
    if (cotacaoData.agenciaId) {
      return cotacaoData.agenciaId === CTX.agenciaId;
    }
    // Fallback: verifica empresa
    if (cotacaoData.empresaId) {
      try {
        const emp = await db.collection("empresas").doc(cotacaoData.empresaId).get();
        if (emp.exists) {
          return emp.data().agenciaId === CTX.agenciaId;
        }
      } catch {}
    }
    return true;
  }
  
  // RM: precisa ser dono
  const dono = [
    cotacaoData.rmId,
    cotacaoData.rmUid,
    cotacaoData.usuarioId,
    cotacaoData.gerenteId,
    cotacaoData.criadoPorUid
  ].filter(Boolean);
  
  return dono.includes(CTX.uid);
}

// ==== Inicialização ====
async function init() {
  renderizarCabecalho();
  renderizarResumo();
  renderizarTemperatura();
  renderizarTimeline();
  renderizarChat();
  renderizarAnexos();
  await carregarStatusConfig();
  
  // Auto-resize textarea
  const textarea = $("novaMensagem");
  if (textarea) {
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  }
}

// ==== Renderização ====
function renderizarCabecalho() {
  $("headerEmpresa").textContent = cotacaoData.empresaNome || "Empresa";
  $("headerSub").textContent = `${cotacaoData.ramo || '-'} • ${cotacaoData.rmNome || '-'}`;
  
  const statusEl = $("headerStatus");
  statusEl.textContent = cotacaoData.status || "-";
  statusEl.className = `status-badge ${classeStatus(cotacaoData.status)}`;
  
  atualizarHeaderHeat(cotacaoData.temperatura || 'morno');
}

function atualizarHeaderHeat(temp) {
  const cfg = TEMPERATURA_CONFIG[temp] || TEMPERATURA_CONFIG.morno;
  const el = $("headerHeat");
  el.className = `heat-badge heat-${cfg.class}`;
  el.innerHTML = `${cfg.icon} ${cfg.title.replace('Negócio ', '')}`;
}

function renderizarResumo() {
  const valor = Number(cotacaoData.valorDesejado || cotacaoData.valorFinal || 0);
  $("valorDesejado").textContent = fmtBRL(valor);
  $("ramo").textContent = cotacaoData.ramo || "-";
  $("cnpj").textContent = cotacaoData.empresaCNPJ || "-";
  
  // Gerente é sempre o vinculado à cotação/empresa, não quem criou
  let gerenteNome = cotacaoData.rmNome || "";
  if (!gerenteNome && cotacaoData.rmUid) {
    // Tentar buscar pelo UID se disponível
    gerenteNome = cotacaoData.rmUid; // fallback para o UID
  }
  $("gerente").textContent = gerenteNome || "-";
  
  $("agencia").textContent = cotacaoData.agenciaNome || "-";
  
  // Vigência
  const ini = toDate(cotacaoData.inicioVigencia);
  const fim = toDate(cotacaoData.fimVigencia);
  if (ini || fim) {
    $("vigenciaContainer").style.display = "block";
    $("vigencia").textContent = `${fmtData(ini)} até ${fmtData(fim)}`;
  }
  
  // Estatísticas
  const criado = toDate(cotacaoData.dataCriacao);
  const atualizado = toDate(cotacaoData.dataAtualizacao || cotacaoData.dataHora);
  const interacoes = (cotacaoData.interacoes || []).length;
  
  $("statCriado").textContent = fmtData(criado);
  $("statAtualizado").textContent = tempoRelativo(atualizado);
  
  if (criado) {
    const dias = Math.floor((new Date() - criado) / 86400000);
    $("statDias").textContent = `${dias} dias`;
  }
  
  $("statInteracoes").textContent = interacoes;
  $("msgCount").textContent = `${interacoes} mensagens`;
}

function renderizarTemperatura() {
  const temp = cotacaoData.temperatura || calcularTemperaturaAuto();
  const cfg = TEMPERATURA_CONFIG[temp] || TEMPERATURA_CONFIG.morno;
  
  const indicator = $("heatIndicator");
  indicator.className = `heat-indicator ${cfg.class}`;
  
  $("heatIcon").textContent = cfg.icon;
  $("heatTitle").textContent = cfg.title;
  $("heatDesc").textContent = cfg.desc;
  
  // Atualizar botões
  document.querySelectorAll('.heat-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.heat-btn-${temp}`)?.classList.add('active');
}

function calcularTemperaturaAuto() {
  let score = 50;
  
  const cat = categoriaStatus(cotacaoData.status);
  if (cat === 'emitido') return 'quente';
  if (cat === 'recusado') return 'frio';
  if (cat === 'emissao') score += 30;
  
  const valor = Number(cotacaoData.valorDesejado || 0);
  if (valor > 100000) score += 15;
  else if (valor > 50000) score += 10;
  
  const interacoes = (cotacaoData.interacoes || []).length;
  if (interacoes > 5) score += 10;
  
  const ultimaData = toDate(cotacaoData.dataAtualizacao || cotacaoData.dataHora || cotacaoData.dataCriacao);
  if (ultimaData) {
    const diasSemAtualizar = Math.floor((new Date() - ultimaData) / 86400000);
    if (diasSemAtualizar <= 3) score += 15;
    else if (diasSemAtualizar > 14) score -= 20;
  }
  
  if (score >= 70) return 'quente';
  if (score >= 40) return 'morno';
  return 'frio';
}

async function alterarTemperatura(novaTemp) {
  try {
    await cotacaoRef.update({
      temperatura: novaTemp,
      dataAtualizacao: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    cotacaoData.temperatura = novaTemp;
    renderizarTemperatura();
    atualizarHeaderHeat(novaTemp);
    
    // Adicionar interação
    const interacao = {
      autorNome: CTX.nome,
      autorUid: CTX.uid,
      mensagem: `🌡️ Temperatura alterada para ${TEMPERATURA_CONFIG[novaTemp].title}`,
      dataHora: new Date(),
      tipo: "sistema"
    };
    
    await cotacaoRef.update({
      interacoes: firebase.firestore.FieldValue.arrayUnion(interacao)
    });
    
    cotacaoData.interacoes = (cotacaoData.interacoes || []).concat([interacao]);
    renderizarChat();
    
  } catch (e) {
    console.error("Erro ao alterar temperatura:", e);
    alert("Erro ao alterar temperatura.");
  }
}

function renderizarTimeline() {
  const status = cotacaoData.status || "";
  const cat = categoriaStatus(status);
  
  const steps = document.querySelectorAll('.timeline-step');
  const progress = $("timelineProgress");
  
  let currentStep = 1;
  
  if (cat === 'pendente') currentStep = 1;
  else if (cat === 'emissao') currentStep = 2;
  else if (cat === 'emitido') currentStep = 3;
  else if (cat === 'recusado') currentStep = -1; // Caminho diferente
  
  steps.forEach((step, i) => {
    step.classList.remove('completed', 'current');
    
    if (cat === 'recusado') {
      if (i === 0) step.classList.add('completed');
      // Outros ficam neutros
    } else {
      if (i < currentStep) step.classList.add('completed');
      if (i === currentStep) step.classList.add('current');
    }
  });
  
  // Progresso
  const progressPercent = cat === 'recusado' ? 25 : Math.min((currentStep + 1) * 25, 100);
  progress.style.width = `${progressPercent}%`;
  
  if (cat === 'recusado') {
    progress.style.background = 'linear-gradient(90deg, var(--brand), var(--danger))';
  } else if (cat === 'emitido') {
    progress.style.background = 'linear-gradient(90deg, var(--brand), var(--success))';
  }
}

function renderizarChat() {
  const container = $("chatMessages");
  const interacoes = cotacaoData.interacoes || [];
  
  if (interacoes.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--muted); padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 12px;">💬</div>
        <p>Nenhuma interação ainda.</p>
        <p style="font-size: 13px;">Envie a primeira mensagem!</p>
      </div>
    `;
    return;
  }
  
  // Ordenar por data
  const sorted = [...interacoes].sort((a, b) => {
    const da = toDate(a.dataHora) || new Date(0);
    const db = toDate(b.dataHora) || new Date(0);
    return da - db;
  });
  
  container.innerHTML = sorted.map(msg => {
    const data = toDate(msg.dataHora);
    const autor = msg.autorNome || msg.autorEmail || "Usuário";
    const isMine = msg.autorUid === CTX.uid;
    const isSystem = msg.tipo === "mudanca_status" || msg.tipo === "sistema";
    
    if (isSystem) {
      return `
        <div class="message system">
          <div class="message-avatar">🔔</div>
          <div class="message-content">
            <div class="message-bubble">${msg.mensagem || ''}</div>
            <div class="message-meta">${fmtDataHora(data)}</div>
          </div>
        </div>
      `;
    }
    
    return `
      <div class="message ${isMine ? 'sent' : 'received'}">
        <div class="message-avatar">${getIniciais(autor)}</div>
        <div class="message-content">
          <div class="message-bubble">${msg.mensagem || ''}</div>
          <div class="message-meta">
            <span class="message-author">${autor}</span>
            <span>•</span>
            <span>${tempoRelativo(data)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Scroll para baixo
  container.scrollTop = container.scrollHeight;
  
  // Atualizar contador
  $("msgCount").textContent = `${interacoes.length} mensagens`;
  $("statInteracoes").textContent = interacoes.length;
}

function renderizarAnexos() {
  const container = $("anexosList");
  const anexos = cotacaoData.anexos || [];
  
  if (anexos.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--muted); padding: 20px; font-size: 13px;">
        Nenhum anexo
      </div>
    `;
    return;
  }
  
  container.innerHTML = anexos.map((anexo, i) => {
    const icone = getIconeArquivo(anexo.nome || anexo.name);
    return `
      <div class="anexo-item">
        <span class="anexo-icon">${icone}</span>
        <div class="anexo-info">
          <div class="anexo-nome">${anexo.nome || anexo.name}</div>
          <div class="anexo-meta">${tempoRelativo(toDate(anexo.data))}</div>
        </div>
        <a href="${anexo.url}" target="_blank" class="btn btn-sm btn-secondary">📥</a>
      </div>
    `;
  }).join('');
}

function getIconeArquivo(nome) {
  const ext = (nome || '').split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return '📄';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx'].includes(ext)) return '📊';
  if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return '🖼️';
  return '📎';
}

// ==== Chat Actions ====
function inserirTemplate(tipo) {
  const texto = TEMPLATES_MENSAGEM[tipo] || '';
  const textarea = $("novaMensagem");
  if (textarea && texto) {
    textarea.value = texto;
    textarea.focus();
  }
}

async function enviarMensagem() {
  const texto = $("novaMensagem")?.value.trim();
  if (!texto) {
    alert("Digite uma mensagem.");
    return;
  }
  
  const nova = {
    autorNome: CTX.nome,
    autorUid: CTX.uid,
    mensagem: texto,
    dataHora: new Date(),
    tipo: "observacao"
  };
  
  try {
    await cotacaoRef.update({
      interacoes: firebase.firestore.FieldValue.arrayUnion(nova),
      dataAtualizacao: firebase.firestore.FieldValue.serverTimestamp(),
      agenciaId: cotacaoData.agenciaId || CTX.agenciaId || ""
    });
    
    $("novaMensagem").value = "";
    $("novaMensagem").style.height = 'auto';
    
    cotacaoData.interacoes = (cotacaoData.interacoes || []).concat([nova]);
    renderizarChat();
    
  } catch (e) {
    console.error("Erro ao enviar mensagem:", e);
    alert("Erro ao enviar mensagem.");
  }
}

// ==== Status ====
async function carregarStatusConfig() {
  try {
    const snap = await db.collection("status-negociacao").doc("config").get();
    configStatus = snap.exists ? (snap.data() || {}) : {};
  } catch {
    configStatus = {};
  }
  
  const select = $("novoStatus");
  if (!select) return;
  
  const fromCfg = Array.isArray(configStatus.statusFinais) ? configStatus.statusFinais : [];
  const listaFinal = [...new Set([...STATUS_FIXOS, ...fromCfg])];
  
  select.innerHTML = '<option value="">Selecione o novo status</option>';
  listaFinal.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
}

function onStatusChange() {
  const valor = $("novoStatus")?.value || "";
  
  // Esconder todos
  $("motivoContainer").style.display = "none";
  $("vigenciaInputs").style.display = "none";
  $("extraInfoContainer").style.display = "none";
  
  // Motivo para recusas
  if (valor.includes("Recusado Cliente") || valor.includes("Recusado Seguradora")) {
    const motivoSel = $("motivoRecusa");
    motivoSel.innerHTML = '<option value="">Selecione o motivo</option>';
    
    const motivos = valor.includes("Cliente")
      ? (configStatus?.motivosRecusaCliente || FALLBACK_MOTIVOS_CLIENTE)
      : (configStatus?.motivosRecusaSeguradora || FALLBACK_MOTIVOS_SEGURADORA);
    
    motivos.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      motivoSel.appendChild(opt);
    });
    
    $("motivoContainer").style.display = "block";
  }
  
  // Vigência para emitido
  if (valor === "Negócio Emitido") {
    $("vigenciaInputs").style.display = "grid";
  }
  
  // Extra info para pendentes e outros
  if (STATUS_EXIGE_EXTRA.has(valor)) {
    $("extraInfoContainer").style.display = "block";
  }
}

async function atualizarStatus() {
  const novo = $("novoStatus")?.value;
  if (!novo) {
    alert("Selecione o novo status.");
    return;
  }
  
  // Validações
  if (novo.includes("Recusado")) {
    const motivo = $("motivoRecusa")?.value;
    if (!motivo) {
      alert("Selecione o motivo da recusa.");
      return;
    }
  }
  
  let inicioVig = null, fimVig = null;
  if (novo === "Negócio Emitido") {
    const ini = $("inicioVigencia")?.value;
    const fim = $("fimVigencia")?.value;
    if (!ini || !fim) {
      alert("Informe o período de vigência.");
      return;
    }
    inicioVig = firebase.firestore.Timestamp.fromDate(new Date(ini + "T12:00:00"));
    fimVig = firebase.firestore.Timestamp.fromDate(new Date(fim + "T12:00:00"));
  }
  
  const extra = $("extraInfo")?.value.trim() || "";
  if (STATUS_EXIGE_EXTRA.has(novo) && !extra) {
    alert("Descreva a informação adicional.");
    return;
  }
  
  // Montar mensagem
  let mensagem = `📋 Status alterado para "${novo}"`;
  const motivo = $("motivoRecusa")?.value;
  if (motivo) mensagem += `. Motivo: ${motivo}`;
  if (inicioVig && fimVig) {
    mensagem += `. Vigência: ${fmtData(inicioVig.toDate())} até ${fmtData(fimVig.toDate())}`;
  }
  if (extra) mensagem += `. Obs.: ${extra}`;
  
  const interacao = {
    autorNome: CTX.nome,
    autorUid: CTX.uid,
    mensagem,
    dataHora: new Date(),
    tipo: "mudanca_status"
  };
  
  const update = {
    status: novo,
    interacoes: firebase.firestore.FieldValue.arrayUnion(interacao),
    dataAtualizacao: firebase.firestore.FieldValue.serverTimestamp(),
    agenciaId: cotacaoData.agenciaId || CTX.agenciaId || ""
  };
  
  if (inicioVig && fimVig) {
    update.inicioVigencia = inicioVig;
    update.fimVigencia = fimVig;
  }
  
  // Atualizar temperatura baseado no status
  if (novo === "Negócio Emitido" || novo === "Negócio Fechado") {
    update.temperatura = 'quente';
  } else if (novo.includes("Recusado") || novo === "Emitido Declinado") {
    update.temperatura = 'frio';
  }
  
  try {
    await cotacaoRef.update(update);
    alert("Status atualizado com sucesso!");
    location.reload();
  } catch (e) {
    console.error("Erro ao atualizar status:", e);
    alert("Erro ao atualizar status.");
  }
}

// ==== Anexos ====
function abrirUpload() {
  $("fileInput")?.click();
}

async function uploadAnexo() {
  const input = $("fileInput");
  if (!input || !input.files.length) return;
  
  if (!storage) {
    alert("Storage não configurado.");
    return;
  }
  
  const file = input.files[0];
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (file.size > maxSize) {
    alert("Arquivo muito grande. Máximo 10MB.");
    return;
  }
  
  try {
    const ref = storage.ref(`cotacoes/${cotacaoId}/${Date.now()}_${file.name}`);
    const snapshot = await ref.put(file);
    const url = await snapshot.ref.getDownloadURL();
    
    const anexo = {
      nome: file.name,
      url,
      tipo: file.type,
      tamanho: file.size,
      data: new Date(),
      uploadPorNome: CTX.nome,
      uploadPorUid: CTX.uid
    };
    
    await cotacaoRef.update({
      anexos: firebase.firestore.FieldValue.arrayUnion(anexo),
      dataAtualizacao: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Adicionar interação
    const interacao = {
      autorNome: CTX.nome,
      autorUid: CTX.uid,
      mensagem: `📎 Anexou arquivo: ${file.name}`,
      dataHora: new Date(),
      tipo: "sistema"
    };
    
    await cotacaoRef.update({
      interacoes: firebase.firestore.FieldValue.arrayUnion(interacao)
    });
    
    cotacaoData.anexos = (cotacaoData.anexos || []).concat([anexo]);
    cotacaoData.interacoes = (cotacaoData.interacoes || []).concat([interacao]);
    
    renderizarAnexos();
    renderizarChat();
    
    input.value = "";
    alert("Arquivo anexado com sucesso!");
    
  } catch (e) {
    console.error("Erro ao fazer upload:", e);
    alert("Erro ao anexar arquivo.");
  }
}

// ==== Utilitários ====
function copiarLink() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    alert("Link copiado para a área de transferência!");
  }).catch(() => {
    prompt("Copie o link:", url);
  });
}

// ==== Globals ====
window.alterarTemperatura = alterarTemperatura;
window.inserirTemplate = inserirTemplate;
window.enviarMensagem = enviarMensagem;
window.onStatusChange = onStatusChange;
window.atualizarStatus = atualizarStatus;
window.abrirUpload = abrirUpload;
window.uploadAnexo = uploadAnexo;
window.copiarLink = copiarLink;
