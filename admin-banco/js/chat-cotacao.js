firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioAtual = null;
let cotacaoId = null;
let cotacaoRef = null;
let cotacaoData = null;

auth.onAuthStateChanged(async user => {
  if (!user) return (window.location.href = "login.html");
  usuarioAtual = user;

  const params = new URLSearchParams(window.location.search);
  cotacaoId = params.get("id");
  if (!cotacaoId) {
    alert("ID de cotação não informado.");
    return;
  }

  cotacaoRef = db.collection("cotacoes-gerentes").doc(cotacaoId);
  const doc = await cotacaoRef.get();
  if (!doc.exists) {
    alert("Cotação não encontrada.");
    return;
  }

  cotacaoData = doc.data();
  preencherCabecalho();
  exibirHistorico();
  carregarStatus();
});

function preencherCabecalho() {
  document.getElementById("empresaNome").textContent = cotacaoData.empresaNome;
  document.getElementById("empresaCNPJ").textContent = cotacaoData.empresaCNPJ;
  document.getElementById("ramo").textContent = cotacaoData.ramo;
  document.getElementById("valorDesejado").textContent = (cotacaoData.valorDesejado || 0).toLocaleString("pt-BR");
  document.getElementById("status").textContent = cotacaoData.status;
}

function exibirHistorico() {
  const div = document.getElementById("historico");
  div.innerHTML = "";

  if (!cotacaoData.interacoes || cotacaoData.interacoes.length === 0) {
    div.innerHTML = "<p>Nenhuma interação registrada ainda.</p>";
    return;
  }

  cotacaoData.interacoes.forEach(msg => {
    const item = document.createElement("div");
    item.className = "mensagem";
    const data = msg.dataHora?.toDate?.().toLocaleString("pt-BR") || "-";
    const tipo = msg.tipo === "mudanca_status" ? "[Status]" : "";
    item.innerHTML = `<strong>${msg.autorNome}</strong> (${data}) ${tipo}<br>${msg.mensagem}`;
    div.appendChild(item);
  });
}

function enviarMensagem() {
  const texto = document.getElementById("novaMensagem").value.trim();
  if (!texto) return alert("Digite a mensagem.");

  const novaInteracao = {
    autorNome: usuarioAtual.email,
    autorUid: usuarioAtual.uid,
    mensagem: texto,
    dataHora: new Date(),
    tipo: "observacao"
  };

  cotacaoRef.update({
    interacoes: firebase.firestore.FieldValue.arrayUnion(novaInteracao)
  }).then(() => {
    document.getElementById("novaMensagem").value = "";
    alert("Mensagem registrada.");
    window.location.reload();
  });
}

function carregarStatus() {
  const select = document.getElementById("novoStatus");
  db.collection("status-negociacao").doc("config").get().then(doc => {
    const dados = doc.data();
    const lista = dados?.statusFinais || [];
    select.innerHTML = '<option value="">Selecione o novo status</option>';
    lista.forEach(status => {
      const opt = document.createElement("option");
      opt.value = status;
      opt.textContent = status;
      select.appendChild(opt);
    });
  });
}

function atualizarStatus() {
  const novo = document.getElementById("novoStatus").value;
  if (!novo) return alert("Selecione o novo status.");

  const interacao = {
    autorNome: usuarioAtual.email,
    autorUid: usuarioAtual.uid,
    mensagem: `Status alterado para "${novo}".`,
    dataHora: new Date(),
    tipo: "mudanca_status"
  };

  cotacaoRef.update({
    status: novo,
    interacoes: firebase.firestore.FieldValue.arrayUnion(interacao)
  }).then(() => {
    alert("Status atualizado com sucesso.");
    window.location.reload();
  }).catch(err => {
    console.error("Erro ao atualizar status:", err);
    alert("Erro ao atualizar status.");
  });
}
