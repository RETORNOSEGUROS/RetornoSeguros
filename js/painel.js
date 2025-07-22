// painel.js
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioId;

auth.onAuthStateChanged(async user => {
  if (!user) return (window.location.href = "login.html");
  usuarioId = user.uid;
  const userDoc = await db.collection("usuarios").doc(usuarioId).get();
  const dados = userDoc.data();

  document.getElementById("dadosUsuario").innerHTML = `
    <strong>Nome:</strong> ${dados.nome}<br>
    <strong>Email:</strong> ${dados.email}<br>
    <strong>Telefone:</strong> ${dados.celular || "-"}<br>
    <strong>Cidade:</strong> ${dados.cidade}, ${dados.estado}
  `;

  document.getElementById("novoNome").value = dados.nome;

  carregarApolices(usuarioId);
  calcularPontuacao(usuarioId);
});

// Editar nome e senha
const formEditar = document.getElementById("formEditar");
formEditar.addEventListener("submit", async e => {
  e.preventDefault();
  const novoNome = document.getElementById("novoNome").value.trim();
  const novaSenha = document.getElementById("novaSenha").value.trim();

  if (novoNome) {
    await db.collection("usuarios").doc(usuarioId).update({ nome: novoNome });
  }

  if (novaSenha.length >= 6) {
    await auth.currentUser.updatePassword(novaSenha);
    alert("Senha alterada com sucesso!");
  }

  alert("Dados atualizados com sucesso!");
});

// Listar apólices
function carregarApolices(uid) {
  db.collection("apolices")
    .where("usuarioId", "==", uid)
    .onSnapshot(snapshot => {
      const tbody = document.getElementById("tabelaApolices");
      tbody.innerHTML = "";
      snapshot.forEach(doc => {
        const ap = doc.data();
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${ap.tipo || "—"}</td>
          <td>${ap.seguradora || "—"}</td>
          <td>${ap.valorPago || "—"}</td>
          <td>${ap.dataRenovacao?.toDate().toLocaleDateString() || "—"}</td>
          <td>${ap.pdfEnviado ? "✔" : "❌"}</td>
        `;
        tbody.appendChild(row);
      });
    });
}

// Calcular pontuação
async function calcularPontuacao(uid) {
  const usuarioDoc = await db.collection("usuarios").doc(uid).get();
  const dados = usuarioDoc.data();

  let pontos = 0;

  // +30 por apólice cadastrada
  const snap = await db.collection("apolices").where("usuarioId", "==", uid).get();
  pontos += snap.size * 30;

  // +30 por apólice confirmada (pdfEnviado)
  snap.forEach(doc => {
    if (doc.data().pdfEnviado === true) pontos += 30;
  });

  // +10 por indicação cadastrada
  const indicados = await db.collection("usuarios").where("usuarioIndicadorId", "==", uid).get();
  pontos += indicados.size * 10;

  // +20 por indicado que enviou apólice confirmada
  for (const indicado of indicados.docs) {
    const indicId = indicado.id;
    const aps = await db.collection("apolices")
      .where("usuarioId", "==", indicId)
      .where("pdfEnviado", "==", true).get();
    pontos += aps.size * 20;
  }

  document.getElementById("pontuacao").innerText = `${pontos} pontos acumulados.`;
}
