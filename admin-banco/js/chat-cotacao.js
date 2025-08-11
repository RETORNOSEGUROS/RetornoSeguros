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

  const spanTexto = $("valorDesejadoTexto");
  const input = $("valorDesejadoInput");
  const btnSalvar = $("btnSalvarValor");

  const valor = Number(cotacaoData.valorDesejado) || 0;
  spanTexto.textContent = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Todos podem ver; salvar valor deixei restrito ao botão (se quiser liberar, é só manter visível pra todos)
  spanTexto.style.display = "inline";
  input.style.display = "none";
  btnSalvar.style.display = "none";

  setText("status", cotacaoData.status || "-");

  // Vigência atual (se existir)
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

function salvarNovoValor() {
  const input = $("valorDesejadoInput");
  const novoValor = desformatarMoeda(input.value);
  if (!novoValor || isNaN(novoValor) || novoValor <= 0) return alert("Valor inválido.");
  cotacaoRef.update({ valorDesejado: novoValor })
    .then(() => { alert("Valor desejado atualizado."); location.reload(); })
    .catch(err => { console.error(err); alert("Erro ao atualizar valor."); });
}

/* ===================== Interações ===================== */
function exibirHistorico() {
  const div = $("historico");
  div.innerHTML = "";

  const items = cotacaoData.interacoes || [];
  if (!items.length) {
    div.innerHTML = "<p class='muted'>Nenhuma interação registrada.</p>";
    return;
  }

  items
    .sort((a,b)=> (a.dataHora?.seconds||0)-(b.dataHora?.seconds||0))
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
  const texto = $("novaMensagem").value.trim();
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

/* ===================== Status / Motivos / Vigência ===================== */
// Fallback estendido (inclui os antigos + alguns intermediários comuns)
const FALLBACK_STATUS = [
  "Negócio iniciado",
  "Em Cotação",
  "Aguardando Documentos",
  "Em Análise Seguradora",
  "Proposta Enviada",
  "Aguardando Cliente",
  "Recusado Cliente",
  "Recusado Seguradora",
  "Negócio Emitido",
  "Renovação Agendada"
];

// Motivos padrão caso não exista no config
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

async function carregarStatus() {
  const select = $("novoStatus");

  try {
    const snap = await db.collection("status-negociacao").doc("config").get();
    configStatus = snap.exists ? (snap.data() || {}) : {};
  } catch (err) {
    console.warn("Não foi possível ler 'status-negociacao/config'. Usando somente fallback.", err);
    configStatus = {};
  }

  // União entre o que vier do Firestore e o fallback
  const listaConfig = Array.isArray(configStatus.statusFinais) ? configStatus.statusFinais : [];
  const set = new Set([...listaConfig, ...FALLBACK_STATUS]); // garante os antigos
  const listaFinal = Array.from(set);

  select.innerHTML = '<option value="">Selecione o novo status</option>';
  listaFinal.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s; opt.textContent = s;
    select.appendChild(opt);
  });

  // Listener de UI (motivos / vigência)
  select.addEventListener("change", () => {
    const valor = select.value;

    // Motivos
    const motivoBox = $("motivoContainer");
    const motivoSel = $("motivoRecusa");
    motivoSel.innerHTML = '<option value="">Selecione o motivo</option>';
    motivoBox.style.display = "none";

    const motivosCliente = configStatus.motivosRecusaCliente || FALLBACK_MOTIVOS_CLIENTE;
    const motivosSeg = configStatus.motivosRecusaSeguradora || FALLBACK_MOTIVOS_SEGURADORA;

    let motivos = [];
    if (valor === "Recusado Cliente")  motivos = motivosCliente;
    if (valor === "Recusado Seguradora") motivos = motivosSeg;

    if (motivos.length) {
      motivos.forEach(m => {
        const op = document.createElement("option");
        op.value = m; op.textContent = m;
        motivoSel.appendChild(op);
      });
      motivoBox.style.display = "block";
    }

    // Vigência quando Negócio Emitido
    $("vigenciaContainer").style.display = (valor === "Negócio Emitido") ? "grid" : "none";
  });
}

function atualizarStatus() {
  const novo = $("novoStatus").value;
  const motivo = $("motivoRecusa").value;

  if (!novo) return alert("Selecione o novo status.");

  // Vigência obrigatória quando negócio emitido
  let inicioVig = null, fimVig = null;
  if (novo === "Negócio Emitido") {
    const ini = $("inicioVigencia").value;
    const fim = $("fimVigencia").value;
    if (!ini || !fim) return alert("Informe o período de vigência.");
    inicioVig = firebase.firestore.Timestamp.fromDate(new Date(ini+"T12:00:00"));
    fimVig = firebase.firestore.Timestamp.fromDate(new Date(fim+"T12:00:00"));
  }

  // Motivo obrigatório quando recusado
  if ((novo === "Recusado Cliente" || novo === "Recusado Seguradora") && !motivo) {
    return alert("Selecione o motivo da recusa.");
  }

  let mensagem = `Status alterado para "${novo}".`;
  if (motivo) mensagem += ` Motivo: ${motivo}`;
  if (inicioVig && fimVig) {
    mensagem += ` Vigência: ${toDate(inicioVig).toLocaleDateString("pt-BR")} até ${toDate(fimVig).toLocaleDateString("pt-BR")}.`;
  }

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

// Mesma máscara da tela de cotações (se desejar liberar edição do valor por aqui)
function formatarMoeda(input){
  let v=(input.value||'').replace(/\D/g,'');
  if(!v){ input.value='R$ 0,00'; return; }
  v=(parseInt(v,10)/100).toFixed(2).replace('.',',');
  v=v.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  input.value='R$ '+v;
}
function desformatarMoeda(str){ if(!str) return 0; return parseFloat(str.replace(/[^\d]/g,'')/100); }

// Export para onclick inline do HTML
window.enviarMensagem = enviarMensagem;
window.atualizarStatus = atualizarStatus;
window.salvarNovoValor = salvarNovoValor;
