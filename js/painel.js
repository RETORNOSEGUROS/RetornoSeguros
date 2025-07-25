firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const uid = user.uid;

  // Buscar dados do usuário
  const userDoc = await db.collection("usuarios").doc(uid).get();
  const dados = userDoc.data();
  window.usuarioAtual = dados;

  carregarDados(dados);
  carregarMinhasApolices(uid);
  carregarApolicesNaRetorno();
  calcularMeusPontos(uid);
  prepararFormularioEdicao(dados, uid);
});

function logout() {
  auth.signOut().then(() => {
    window.location.href = "login.html";
  });
}

function mostrarSecao(secao) {
  document.querySelectorAll(".box").forEach(div => div.classList.remove("active"));
  document.getElementById(`secao-${secao}`).classList.add("active");
}

// --------- DADOS
function carregarDados(dados) {
  document.getElementById("dadosUsuario").innerHTML = `
    <p><strong>Nome:</strong> ${dados.nome}</p>
    <p><strong>Email:</strong> ${dados.email}</p>
    <p><strong>Celular:</strong> ${dados.celular}</p>
    <p><strong>Cidade:</strong> ${dados.cidade} - ${dados.estado}</p>
  `;
}

// --------- EDITAR
function prepararFormularioEdicao(dados, uid) {
  document.getElementById("novoNome").value = dados.nome;
  document.getElementById("novoEmail").value = dados.email;
  document.getElementById("novoCelular").value = dados.celular;
  document.getElementById("novaCidade").value = dados.cidade;
  document.getElementById("novoEstado").value = dados.estado;

  document.getElementById("formEditar").addEventListener("submit", async (e) => {
    e.preventDefault();

    const updates = {
      nome: document.getElementById("novoNome").value,
      email: document.getElementById("novoEmail").value,
      celular: document.getElementById("novoCelular").value,
      cidade: document.getElementById("novaCidade").value,
      estado: document.getElementById("novoEstado").value,
    };

    const novaSenha = document.getElementById("novaSenha").value;
    if (novaSenha) {
      await auth.currentUser.updatePassword(novaSenha).catch(err => alert("Erro ao atualizar senha: " + err.message));
    }

    await db.collection("usuarios").doc(uid).update(updates);
    alert("Dados atualizados!");
    location.reload();
  });
}

// --------- MINHAS APÓLICES
function carregarMinhasApolices(uid) {
  db.collection("apolices").where("usuarioId", "==", uid).get().then(snapshot => {
    const tbody = document.getElementById("tabelaApolices");
    tbody.innerHTML = "";

    snapshot.forEach(doc => {
      const a = doc.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${a.tipo}</td>
        <td>${a.seguradora}</td>
        <td>R$ ${parseFloat(a.valorPago || 0).toFixed(2)}</td>
        <td>${a.dataRenovacao || ""}</td>
        <td>${a.pdfEnviado ? "✅" : "❌"}</td>
      `;
      tbody.appendChild(tr);
    });
  });
}

// --------- APÓLICES NA RETORNO
function carregarApolicesNaRetorno() {
  db.collection("apolices")
    .where("pdfEnviado", "==", true)
    .get().then(snapshot => {
      const tbody = document.getElementById("tabelaRetorno");
      tbody.innerHTML = "";

      snapshot.forEach(async doc => {
        const a = doc.data();
        const userSnap = await db.collection("usuarios").doc(a.usuarioId).get();
        const nomeUsuario = userSnap.exists ? userSnap.data().nome : "Desconhecido";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${nomeUsuario}</td>
          <td>${a.tipo}</td>
          <td>${a.seguradora}</td>
          <td>R$ ${parseFloat(a.valorPago || 0).toFixed(2)}</td>
          <td>${a.dataRenovacao || ""}</td>
        `;
        tbody.appendChild(tr);
      });
    });
}

// --------- PONTOS
async function calcularMeusPontos(uid) {
  let pontos = 0;

  // +30 se anexou apólice
  const minhas = await db.collection("apolices").where("usuarioId", "==", uid).get();
  if (!minhas.empty) pontos += 30;

  // +10 por indicação
  const indicados = await db.collection("usuarios").where("usuarioIndicadorId", "==", uid).get();
  pontos += indicados.size * 10;

  // +20 por cada indicado que anexou apólice
  let indicadosComApolice = 0;
  for (let doc of indicados.docs) {
    const id = doc.id;
    const apolices = await db.collection("apolices").where("usuarioId", "==", id).get();
    if (!apolices.empty) indicadosComApolice++;
  }
  pontos += indicadosComApolice * 20;

  document.getElementById("pontuacao").innerHTML = `
    <p><strong>Pontos acumulados:</strong> ${pontos}</p>
    <p>• Indicações: ${indicados.size} pessoas</p>
    <p>• Indicações com apólice: ${indicadosComApolice}</p>
    <p>• Apólice sua cadastrada: ${minhas.empty ? "Não" : "Sim"}</p>
  `;
}
