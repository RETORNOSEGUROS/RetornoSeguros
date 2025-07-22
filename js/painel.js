// painel.js
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioId;

function mostrarSecao(secaoId) {
  document.querySelectorAll('.box').forEach(div => div.classList.remove('active'));
  document.getElementById(`secao-${secaoId}`).classList.add('active');
}

function logout() {
  auth.signOut().then(() => window.location.href = "login.html");
}

auth.onAuthStateChanged(async user => {
  if (!user) return (window.location.href = "login.html");
  usuarioId = user.uid;
  const userDoc = await db.collection("usuarios").doc(usuarioId).get();
  const dados = userDoc.data();

  document.getElementById("dadosUsuario").innerHTML = `
    <strong>Nome:</strong> ${dados.nome}<br>
    <strong>Email:</strong> ${dados.email}<br>
    <strong>Telefone:</strong> ${dados.celular || "-"}<br>
    <strong>Cidade:</strong> ${dados.cidade || "-"}, ${dados.estado || "-"}
  `;

  document.getElementById("novoNome").value = dados.nome;
  document.getElementById("novoEmail").value = dados.email;
  document.getElementById("novoCelular").value = dados.celular || "";
  document.getElementById("novaCidade").value = dados.cidade || "";
  document.getElementById("novoEstado").value = dados.estado || "";

  carregarApolices(usuarioId);
  carregarApolicesRetorno();
  calcularPontuacao(usuarioId);
});

// Editar dados e senha
const formEditar = document.getElementById("formEditar");
formEditar.addEventListener("submit", async e => {
  e.preventDefault();
  const updates = {
    nome: document.getElementById("novoNome").value.trim(),
    email: document.getElementById("novoEmail").value.trim(),
    celular: document.getElementById("novoCelular").value.trim(),
    cidade: document.getElementById("novaCidade").value.trim(),
    estado: document.getElementById("novoEstado").value.trim(),
  };
  await db.collection("usuarios").doc(usuarioId).update(updates);

  const novaSenha = document.getElementById("novaSenha").value.trim();
  if (novaSenha.length >= 6) {
    await auth.currentUser.updatePassword(novaSenha);
    alert("Senha alterada com sucesso!");
  }

  alert("Dados atualizados com sucesso!");
});

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

function carregarApolicesRetorno() {
  db.collection("apolices")
    .where("pdfEnviado", "==", true)
    .onSnapshot(async snapshot => {
      const tbody = document.getElementById("tabelaRetorno");
      tbody.innerHTML = "";
      for (const doc of snapshot.docs) {
        const ap = doc.data();
        const userDoc = await db.collection("usuarios").doc(ap.usuarioId).get();
        const nome = userDoc.exists ? userDoc.data().nome : "Usuário";

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${nome}</td>
          <td>${ap.tipo || "—"}</td>
          <td>${ap.seguradora || "—"}</td>
          <td>${ap.valorPago || "—"}</td>
          <td>${ap.dataRenovacao?.toDate().toLocaleDateString() || "—"}</td>
        `;
        tbody.appendChild(row);
      }
    });
}

async function calcularPontuacao(uid) {
  const usuarioDoc = await db.collection("usuarios").doc(uid).get();
  let pontos = 0;

  const snap = await db.collection("apolices").where("usuarioId", "==", uid).get();
  pontos += snap.size * 30;
  snap.forEach(doc => {
    if (doc.data().pdfEnviado === true) pontos += 30;
  });

  const indicados = await db.collection("usuarios").where("usuarioIndicadorId", "==", uid).get();
  pontos += indicados.size * 10;

  for (const indicado of indicados.docs) {
    const indicId = indicado.id;
    const aps = await db.collection("apolices")
      .where("usuarioId", "==", indicId)
      .where("pdfEnviado", "==", true).get();
    pontos += aps.size * 20;
  }

  document.getElementById("pontuacao").innerText = `${pontos} pontos acumulados.`;
}
