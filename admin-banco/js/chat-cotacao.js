// Evita reinit se firebase-config já iniciou
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioAtual = null;
let usuarioNomeAtual = null;
let cotacaoId = null;
let cotacaoRef = null;
let cotacaoData = null;
let configStatus = null; // lido do Firestore (se existir)

// ====== STATUS FIXOS SOLICITADOS ======
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

// Onde a "informação adicional" é obrigatória
const STATUS_EXIGE_EXTRA = new Set([
  "Pendente Agência",
  "Pendente Corretor",
  "Pendente Seguradora",
  "Pendente Cliente",
  "Emitido Declinado",
  "Em Emissão",
  "Negócio Fechado"
]);

// Motivos padrão caso não existam no config
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

auth.onAuthStateChanged(async user => {
  try {
    if (!user) return (window.location.href = "login.html");
    usuarioAtual = user;
    usuarioNomeAtual = await obterNome(user.uid, user.email);

    const params = new URLSearchParams(window.location.search);
    cotacaoId = params.get("id");
    if (!cotacaoId) return alert("ID de cotação não informado.");

    cotacaoRef = db.collection("cotacoes-gerentes").doc(cotacaoId);
    const doc = await cotacaoRef.get();
    if (!doc.exists) return alert("Cotação não encontrada.");

    cotacaoData = doc.data();
    preencherCabecalho();
    exibirHistorico();

    // 👉 habilita edição de valor para admin (e já mascara)
    prepararEdicaoValorParaAdmin(user.email);

    await carregarStatus(); // resiliente com fallback
  } catch (e) {
    console.error("Falha ao inicializar chat-cotacao:", e);
    alert("Erro ao carregar a cotação.");
  }
});

async function obterNome(uid, fallback) {
  try {
    const snap = await db.collection("usuarios_banco").doc(uid).get();
    return snap.exists ? (snap.data().nome || snap.data().email || fallback) : fallback;
  } catch {
    return fallback;
  }
}

/* ===================== Cabeçalho ===================== */
function preencherCabecalho() {
  setText("empresaNome", cotacaoData.empresaNome || "-");
  setText("empresaCNPJ", cotacaoData.empresaCNPJ || "-");
  setText("ramo", cotacaoData.ramo || "-");

  const valor = Number(cotacaoData.valorDesejado) || 0;
  setText("valorDesejadoTexto", valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  setText("status", cotacaoData.status || "-");

  const ini = cotacaoData.inicioVigencia, fim = cotacaoData.fimVigencia;
  if (ini || fim) {
    const txt =
      (toDate(ini)?.toLocaleDateString("pt-BR") || "—") +
      " até " +
      (toDate(fim)?.toLocaleDateString("pt-BR") || "—");
    setText("vigenciaAtual", "Vigência: " + txt);
  } else {
    setText("vigenciaAtual", "");
  }
}

/* ===== Admin: editar Valor desejado ===== */
function prepararEdicaoValorParaAdmin(email) {
  const isAdmin = email === "patrick@retornoseguros.com.br";
  const span = $("valorDesejadoTexto");
  const input = $("valorDesejadoInput");
  const btn = $("btnSalvarValor");
  if (!span || !input || !btn) return; // HTML sem controles

  if (!isAdmin) {
    // mantém somente leitura
    span.style.display = "inline";
    input.style.display = "none";
    btn.style.display = "none";
    return;
  }

  // Admin enxerga input e botão
  span.style.display = "none";
  input.style.display = "inline-block";
  btn.style.display = "inline-block";

  // valor atual mascarado
  const atual = Number(cotacaoData?.valorDesejado) || 0;
  input.value = atual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // máscara ao digitar
  input.addEventListener("input", () => formatarMoeda(input));

  // expõe função global para o botão
  window.salvarNovoValor = async function () {
    const novoValor = desformatarMoeda(input.value);
    if (!novoValor || isNaN(novoValor) || novoValor <= 0) {
      alert("Valor inválido."); return;
    }
    try {
      await cotacaoRef.update({ valorDesejado: novoValor });
      alert("Valor desejado atualizado.");
      location.reload();
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar valor.");
    }
  };
}

/* ===================== Interações ===================== */
function exibirHistorico() {
  const div = $("historico");
  if (!div) return;
  div.innerHTML = "";

  const items = cotacaoData.interacoes || [];
  if (!items.length) {
    div.innerHTML = "<p class='muted'>Nenhuma interação registrada.</p>";
    return;
  }

  items
    .sort((a,b)=> (toDate(a.dataHora)?.getTime()||0) - (toDate(b.dataHora)?.getTime()||0))
    .forEach(msg => {
      const data = toDate(msg.dataHora)?.toLocaleString("pt-BR") || "-";
      const tipo = msg.tipo === "mudanca_status" ? "<span class='muted'>[Status]</span> " : "";
      const autor = msg.autorNome || msg.autorEmail || "Usuário";

      const el = document.createElement("div");
      el.className = "mensagem";
      el.innerHTML = `<strong>${autor}</strong> <span class="muted">(${data})</span><br>${tipo}${msg.mensagem || ""}`;
      div.appendChild(el);
    });
}

function enviarMensagem() {
  const texto = $("novaMensagem")?.value.trim();
  if (!texto) return alert("Digite uma mensagem.");
  const nova = {
    autorNome: usuarioNomeAtual,
    autorUid: usuarioAtual.uid,
    mensagem: texto,
    dataHora: new Date(),
    tipo: "observacao"
  };
  cotacaoRef.update({ interacoes: firebase.firestore.FieldValue.arrayUnion(nova) })
    .then(() => { $("novaMensagem").value = ""; exibirHistorico(); alert("Mensagem registrada."); })
    .catch(err => { console.error(err); alert("Erro ao enviar mensagem."); });
}

/* ===================== Status / Motivos / Vigência / Extra ===================== */
async function carregarStatus() {
  const select = $("novoStatus");
  if (select) {
    // pré-carrega com fixos para não ficar "Carregando..."
    select.innerHTML = '<option value="">Selecione o novo status</option>';
    STATUS_FIXOS.forEach(s => {
      const op = document.createElement("option");
      op.value = s; op.textContent = s;
      select.appendChild(op);
    });
  }

  try {
    const snap = await db.collection("status-negociacao").doc("config").get();
    configStatus = snap.exists ? (snap.data() || {}) : {};
  } catch (err) {
    console.warn("Não foi possível ler 'status-negociacao/config'. Prosseguindo apenas com os fixos.", err);
    configStatus = {};
  }

  if (select) {
    const fromCfg = Array.isArray(configStatus.statusFinais) ? configStatus.statusFinais : [];
    const set = new Set([...STATUS_FIXOS, ...fromCfg]);
    const listaFinal = Array.from(set);

    select.innerHTML = '<option value="">Selecione o novo status</option>';
    listaFinal.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      select.appendChild(opt);
    });

    // Listener para exibir campos adicionais por status
    select.addEventListener("change", () => {
      const valor = select.value;

      // Reset containers
      const motivoBox = $("motivoContainer");
      const motivoSel = $("motivoRecusa");
      const vigBox = $("vigenciaContainer");
      const extraBox = $("extraInfoContainer");

      if (motivoSel) motivoSel.innerHTML = '<option value="">Selecione o motivo</option>';
      if (motivoBox) motivoBox.style.display = "none";
      if (vigBox) vigBox.style.display = "none";
      if (extraBox) extraBox.style.display = "none";

      // Recusas → motivo obrigatório
      const motivosCliente = configStatus.motivosRecusaCliente || FALLBACK_MOTIVOS_CLIENTE;
      const motivosSeg = configStatus.motivosRecusaSeguradora || FALLBACK_MOTIVOS_SEGURADORA;

      if (valor === "Recusado Cliente" && motivoSel && motivoBox) {
        motivosCliente.forEach(m => {
          const op = document.createElement("option");
          op.value = m; op.textContent = m;
          motivoSel.appendChild(op);
        });
        motivoBox.style.display = "block";
      }

      if (valor === "Recusado Seguradora" && motivoSel && motivoBox) {
        motivosSeg.forEach(m => {
          const op = document.createElement("option");
          op.value = m; op.textContent = m;
          motivoSel.appendChild(op);
        });
        motivoBox.style.display = "block";
      }

      // Negócio Emitido → vigência obrigatória
      if (valor === "Negócio Emitido" && vigBox) {
        vigBox.style.display = "grid";
      }

      // Status que exigem informação adicional
      if (STATUS_EXIGE_EXTRA.has(valor) && extraBox) {
        extraBox.style.display = "block";
      }
    });
  }
}

function atualizarStatus() {
  const novo = $("novoStatus")?.value;
  if (!novo) return alert("Selecione o novo status.");

  const motivoSel = $("motivoRecusa");
  const extra = ($("extraInfo")?.value || "").trim();

  // Vigência (quando negócio emitido)
  let inicioVig = null, fimVig = null;
  if (novo === "Negócio Emitido") {
    const ini = $("inicioVigencia")?.value;
    const fim = $("fimVigencia")?.value;
    if (!ini || !fim) return alert("Informe o período de vigência.");
    inicioVig = firebase.firestore.Timestamp.fromDate(new Date(ini+"T12:00:00"));
    fimVig = firebase.firestore.Timestamp.fromDate(new Date(fim+"T12:00:00"));
  }

  // Motivo obrigatório nas recusas
  if ((novo === "Recusado Cliente" || novo === "Recusado Seguradora")) {
    const motivo = (motivoSel && motivoSel.value) ? motivoSel.value : "";
    if (!motivo) return alert("Selecione o motivo da recusa.");
  }

  // Extra obrigatório nos pendentes / emitido declinado / em emissão / negócio fechado
  if (STATUS_EXIGE_EXTRA.has(novo) && !extra) {
    return alert("Descreva a informação adicional (pendência, detalhe do status, etc.).");
  }

  // Monta mensagem da interação
  let mensagem = `Status alterado para "${novo}".`;
  if (motivoSel && motivoSel.value) mensagem += ` Motivo: ${motivoSel.value}`;
  if (inicioVig && fimVig) {
    mensagem += ` Vigência: ${toDate(inicioVig).toLocaleDateString("pt-BR")} até ${toDate(fimVig).toLocaleDateString("pt-BR")}.`;
  }
  if (extra) mensagem += ` Obs.: ${extra}`;

  const interacao = {
    autorNome: usuarioNomeAtual,
    autorUid: usuarioAtual.uid,
    mensagem,
    dataHora: new Date(),
    tipo: "mudanca_status"
  };

  const update = { status: novo, interacoes: firebase.firestore.FieldValue.arrayUnion(interacao) };
  if (inicioVig && fimVig) { update.inicioVigencia = inicioVig; update.fimVigencia = fimVig; }

  cotacaoRef.update(update)
    .then(() => { alert("Status atualizado com sucesso."); location.reload(); })
    .catch(err => { console.error(err); alert("Erro ao atualizar status."); });
}

/* ===================== Utils ===================== */
function $(id){ return document.getElementById(id); }
function setText(id, txt){ const el=$(id); if(el) el.textContent = txt ?? ""; }
function toDate(ts){ return ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null); }

// máscara moeda
function formatarMoeda(input){
  let v=(input.value||'').replace(/\D/g,'');
  if(!v){ input.value='R$ 0,00'; return; }
  v=(parseInt(v,10)/100).toFixed(2).replace('.',',');
  v=v.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  input.value='R$ '+v;
}
function desformatarMoeda(str){ if(!str) return 0; return parseFloat(str.replace(/[^\d]/g,'')/100); }

// Exports para onclick no HTML
window.enviarMensagem = enviarMensagem;
window.atualizarStatus = atualizarStatus;
