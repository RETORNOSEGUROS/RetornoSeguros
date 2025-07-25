firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const cotacaoId = new URLSearchParams(window.location.search).get("id");
let isAdmin = false;

auth.onAuthStateChanged(async user => {
  if (!user) return window.location.href = "login.html";

  const email = user.email;
  isAdmin = email === "patrick@retornoseguros.com.br";

  const cotRef = db.collection("cotacoes-gerentes").doc(cotacaoId);
  const cotDoc = await cotRef.get();

  if (!cotDoc.exists) {
    document.getElementById("infoCotacao").innerHTML = "<p>Cotação não encontrada.</p>";
    return;
  }

  const cot = cotDoc.data();
  document.getElementById("infoCotacao").innerHTML = `
    <strong>${cot.empresa}</strong> - ${cot.ramo}<br>
    Status: <b>${cot.status}</b><br>
    Valor: R$ ${cot.valor || "-"}<br>
    Vigência Final: ${cot.vigenciaFinal ? new Date(cot.vigenciaFinal.seconds * 1000).toLocaleDateString() : "-"}
  `;

  if (isAdmin) {
    document.getElementById("adminControls").style.display = "block";
    document.getElementById("statusCotacao").value = cot.status || "nova";
    document.getElementById("valorCotacao").value = cot.valor || "";
    if (cot.vigenciaFinal) {
      document.getElementById("vigenciaFinal").value = new Date(cot.vigenciaFinal.seconds * 1000).toISOString().substr(0,10);
    }
  }

  db.collection("mensagens_cotacoes")
    .where("cotacaoId", "==", cotacaoId)
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      const chat = document.getElementById("chatMensagens");
      chat.innerHTML = "";
      snapshot.forEach(doc => {
        const msg = doc.data();
        const div = document.createElement("div");
        div.className = "msg " + (msg.autor === "admin" ? "admin" : "gerente");
        div.textContent = `[${new Date(msg.timestamp?.seconds * 1000).toLocaleString()}] ${msg.autor}: ${msg.texto}`;
        chat.appendChild(div);
      });
    });
});

function enviarMensagem() {
  const texto = document.getElementById("mensagem").value.trim();
  if (!texto) return;

  db.collection("mensagens_cotacoes").add({
    cotacaoId: cotacaoId,
    autor: isAdmin ? "admin" : "gerente",
    texto,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    document.getElementById("mensagem").value = "";
  });
}

function atualizarCotacao() {
  const status = document.getElementById("statusCotacao").value;
  const valor = parseFloat(document.getElementById("valorCotacao").value);
  const vigencia = document.getElementById("vigenciaFinal").value;

  const atualizacoes = {
    status,
    valor: isNaN(valor) ? null : valor,
    vigenciaFinal: vigencia ? firebase.firestore.Timestamp.fromDate(new Date(vigencia)) : null
  };

  db.collection("cotacoes-gerentes").doc(cotacaoId).update(atualizacoes)
    .then(() => alert("Cotação atualizada com sucesso."));
}
