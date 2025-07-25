firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let usuarioAtual;

auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  usuarioAtual = user;

  // NOVO TRECHO PARA PREENCHER EMPRESA AUTOMATICAMENTE
  const urlParams = new URLSearchParams(window.location.search);
  const empresaParam = urlParams.get("empresa");
  if (empresaParam) {
    document.getElementById("empresa").value = empresaParam;
  }

  listarCotacoes();
});

function enviarCotacao() {
  const empresa = document.getElementById("empresa").value.trim();
  const ramo = document.getElementById("ramo").value;
  const observacoes = document.getElementById("observacoes").value.trim();

  if (!empresa || !ramo) {
    alert("Preencha empresa e ramo.");
    return;
  }

  const novaCotacao = {
    empresa,
    ramo,
    observacoes,
    usuarioId: usuarioAtual.uid,
    status: "nova",
    dataSolicitacao: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection("cotacoes-gerentes").add(novaCotacao)
    .then(() => {
      alert("Cotação enviada.");
      listarCotacoes();
    });
}

function listarCotacoes() {
  const lista = document.getElementById("listaCotacoes");
  lista.innerHTML = "Carregando...";

  db.collection("cotacoes-gerentes")
    .where("usuarioId", "==", usuarioAtual.uid)
    .orderBy("dataSolicitacao", "desc")
    .limit(10)
    .get()
    .then(snapshot => {
      lista.innerHTML = "";
      if (snapshot.empty) {
        lista.innerHTML = "<p>Nenhuma cotação encontrada.</p>";
        return;
      }

      snapshot.forEach(doc => {
        const cot = doc.data();
        const div = document.createElement("div");
        div.style.marginBottom = "15px";
        div.innerHTML = `
          <strong>${cot.empresa}</strong> (${cot.ramo})<br>
          Status: <b>${cot.status}</b><br>
          Obs: ${cot.observacoes || "-"}<br>
          <a href="chat-cotacao.html?id=${doc.id}">Abrir conversa</a>
        `;
        lista.appendChild(div);
      });
    });
}
