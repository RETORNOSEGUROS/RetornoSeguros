// protege reinit se firebase-config já iniciou
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioAtual = null;
let usuarioNomeAtual = null; // nome exibido nas interações
let cotacaoId = null;
let cotacaoRef = null;
let cotacaoData = null;
let configStatus = null;
let isAdmin = false;

auth.onAuthStateChanged(async user => {
  if (!user) return (window.location.href = "login.html");
  usuarioAtual = user;

  // pega nome amigável do usuário
  usuarioNomeAtual = await obterNomeDoUsuario(user.uid, user.email);

  const params = new URLSearchParams(window.location.search);
  cotacaoId = params.get("id");
  if (!cotacaoId) { alert("ID de cotação não informado."); return; }

  isAdmin = usuarioAtual.email === "patrick@retornoseguros.com.br";

  cotacaoRef = db.collection("cotacoes-gerentes").doc(cotacaoId);
  const doc = await cotacaoRef.get();
  if (!doc.exists) { alert("Cotação não encontrada."); return; }

  cotacaoData = doc.data();
  preencherCabecalho();
  exibirHistorico();
  await carregarStatus();
});

async function obterNomeDoUsuario(uid, fallbackEmail){
  try{
    const snap = await db.collection("usuarios_banco").doc(uid).get();
    const nome = snap.exists ? (snap.data().nome || snap.data().email) : null;
    return nome || fallbackEmail;
  }catch(e){
    return fallbackEmail;
  }
}

function preencherCabecalho() {
  setText("empresaNome", cotacaoData.empresaNome);
  setText("empresaCNPJ", cotacaoData.empresaCNPJ);
  setText("ramo", cotacaoData.ramo);

  const spanTexto = $("valorDesejadoTexto");
  const input = $("valorDesejadoInput");
  const btnSalvar = $("btnSalvarValor");

  const valor = Number(cotacaoData.valorDesejado) || 0;
  spanTexto.textContent = valor.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });

  if (isAdmin) {
    spanTexto.style.display = "none";
    input.style.display = "inline-block";
    btnSalvar.style.display = "inline-block";
    // mostra já formatado e liga máscara
    input.value = valor.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
    input.addEventListener("input", () => formatarMoeda(input));
  } else {
    spanTexto.style.display = "inline";
    input.style.display = "none";
    btnSalvar.style.display = "none";
  }

  setText("status", cotacaoData.status || "-");

  // vigência atual (se houver)
  const ini = cotacaoData.inicioVigencia;
  const fim = cotacaoData.fimVigencia;
  if (ini || fim) {
    const txt =
      (ini ? toDate(ini).toLocaleDateString("pt-BR") : "—") +
      " até " +
      (fim ? toDate(fim).toLocaleDateString("pt-BR") : "—");
    setText("vigenciaAtual", "Vigência: " + txt);
  } else {
    setText("vigenciaAtual", "");
  }
}

function salvarNovoValor() {
  const input = $("valorDesejadoInput");
  const novoValor = desformatarMoeda(input.value);
  if (!novoValor || isNaN(novoValor) || novoValor <= 0) return alert("Valor inválido.");
  cotacaoRef.update({ valorDesejado: novoValor }).then(() => {
    alert("Valor desejado atualizado.");
    window.location.reload();
  }).catch(err => {
    console.error("Erro ao salvar valor:", err);
    alert("Erro ao atualizar valor.");
  });
}

function exibirHistorico() {
  const div = $("historico");
  div.innerHTML = "";

  const items = cotacaoData.interacoes || [];
  if (!items.length) { div.innerHTML = "<p class='muted'>Nenhuma interação registrada.</p>"; return; }

  items
    .sort((a,b)=> (a.dataHora?.seconds||0)-(b.dataHora?.seconds||0))
    .forEach(msg => {
      const item = document.createElement("div");
      item.className = "mensagem";
      const data = toDate(msg.dataHora)?.toLocaleString("pt-BR") || "-";
      const tipo = msg.tipo === "mudanca_status" ? "<span class='muted'>[Status]</span> " : "";
      const autor = msg.autorNome || msg.autorEmail || "Usuário";
      item.innerHTML = `<strong>${autor}</strong> <span class="muted">(${data})</span><br>${tipo}${(msg.mensagem||'')}`;
      div.appendChild(item);
    });
}

function enviarMensagem() {
  const texto = $("novaMensagem").value.trim();
  if (!texto) return alert("Digite a mensagem.");
  const novaInteracao = {
    autorNome: usuarioNomeAtual,   // << nome, não e-mail
    autorUid: usuarioAtual.uid,
    mensagem: texto,
    dataHora: new Date(),
    tipo: "observacao"
  };
  cotacaoRef.update({
    interacoes: firebase.firestore.FieldValue.arrayUnion(novaInteracao)
  }).then(() => {
    $("novaMensagem").value = "";
    alert("Mensagem registrada.");
    window.location.reload();
  });
}

async function carregarStatus() {
  const select = $("novoStatus");
  const snap = await db.collection("status-negociacao").doc("config").get();
  configStatus = snap.data();
  const lista = configStatus?.statusFinais || [];
  select.innerHTML = '<option value="">Selecione o novo status</option>';
  lista.forEach(status => {
    const opt = document.createElement("option");
    opt.value = status;
    opt.textContent = status;
    select.appendChild(opt);
  });

  // mostra/oculta motivos e vigência conforme seleção
  select.addEventListener("change", () => {
    const valor = select.value;
    const motivoBox = $("motivoContainer");
    const motivoSel = $("motivoRecusa");
    const vigBox = $("vigenciaContainer");

    // motivos
    motivoSel.innerHTML = '<option value="">Selecione o motivo</option>';
    motivoBox.style.display = "none";
    let motivos = [];
    if (valor === "Recusado Cliente") motivos = configStatus?.motivosRecusaCliente || [];
    if (valor === "Recusado Seguradora") motivos = configStatus?.motivosRecusaSeguradora || [];
    if (motivos.length) {
      motivos.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m; opt.textContent = m; motivoSel.appendChild(opt);
      });
      motivoBox.style.display = "block";
    }

    // vigência (obrigatória somente quando Negócio Emitido)
    vigBox.style.display = (valor === "Negócio Emitido") ? "grid" : "none";
  });
}

function atualizarStatus() {
  const novo = $("novoStatus").value;
  const motivo = $("motivoRecusa").value;

  if (!novo) return alert("Selecione o novo status.");

  // se Negócio Emitido, exigir vigência
  let inicioVig = null, fimVig = null;
  if (novo === "Negócio Emitido") {
    const ini = $("inicioVigencia").value;
    const fim = $("fimVigencia").value;
    if (!ini || !fim) return alert("Informe o período de vigência (início e fim).");
    inicioVig = firebase.firestore.Timestamp.fromDate(new Date(ini+"T12:00:00"));
    fimVig = firebase.firestore.Timestamp.fromDate(new Date(fim+"T12:00:00"));
  }

  if ((novo === "Recusado Cliente" || novo === "Recusado Seguradora") && !motivo) {
    return alert("Selecione o motivo da recusa.");
  }

  let mensagem = `Status alterado para "${novo}".`;
  if (motivo) mensagem += ` Motivo: ${motivo}`;
  if (inicioVig && fimVig) {
    mensagem += ` Vigência: ${toDate(inicioVig).toLocaleDateString("pt-BR")} até ${toDate(fimVig).toLocaleDateString("pt-BR")}.`;
  }

  const interacao = {
    autorNome: usuarioNomeAtual, // << nome, não e-mail
    autorUid: usuarioAtual.uid,
    mensagem,
    dataHora: new Date(),
    tipo: "mudanca_status"
  };

  const update = { status: novo, interacoes: firebase.firestore.FieldValue.arrayUnion(interacao) };
  if (inicioVig && fimVig) { update.inicioVigencia = inicioVig; update.fimVigencia = fimVig; }

  cotacaoRef.update(update).then(() => {
    alert("Status atualizado com sucesso.");
    window.location.reload();
  }).catch(err => {
    console.error("Erro ao atualizar status:", err);
    alert("Erro ao atualizar status.");
  });
}

/* ----------------- helpers ----------------- */
function $(id){ return document.getElementById(id); }
function setText(id,txt){ const el=$(id); if(el) el.textContent = txt ?? ""; }
function toDate(ts){ return ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null); }
