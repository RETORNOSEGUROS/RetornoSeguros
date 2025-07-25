firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged(async (user) => {
  if (!user) return location.href = "login.html";

  const uid = user.uid;
  const userDoc = await db.collection("usuarios").doc(uid).get();
  const dados = userDoc.data();
  window.usuarioAtual = { ...dados, uid };

  carregarDados(dados);
  carregarMinhasApolices(uid);
  carregarApolicesNaRetorno(uid);
  calcularMeusPontos(uid);
  carregarMinhasIndicacoes(uid);
  carregarApolicesIndicadas(uid);
  prepararFormularioEdicao(dados, uid);
  carregarResgates(uid);
  prepararFormularioResgate(uid);
});

function logout() {
  auth.signOut().then(() => location.href = "login.html");
}

function mostrarSecao(secao) {
  document.querySelectorAll(".box").forEach(div => div.classList.remove("active"));
  document.getElementById(`secao-${secao}`).classList.add("active");
}

// --- Dados Pessoais
function carregarDados(dados) {
  document.getElementById("dadosUsuario").innerHTML = `
    <p><strong>Nome:</strong> ${dados.nome}</p>
    <p><strong>Email:</strong> ${dados.email}</p>
    <p><strong>Celular:</strong> ${dados.celular}</p>
    <p><strong>Cidade:</strong> ${dados.cidade} - ${dados.estado}</p>
  `;
}

function prepararFormularioEdicao(dados, uid) {
  document.getElementById("novoNome").value = dados.nome || "";
  document.getElementById("novoEmail").value = dados.email || "";
  document.getElementById("novoCelular").value = dados.celular || "";
  document.getElementById("novaCidade").value = dados.cidade || "";
  document.getElementById("novoEstado").value = dados.estado || "";

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
    if (novaSenha) await auth.currentUser.updatePassword(novaSenha).catch(err => alert(err.message));
    await db.collection("usuarios").doc(uid).update(updates);
    alert("Dados atualizados!");
    location.reload();
  });
}

// --- Minhas Apólices
function carregarMinhasApolices(uid) {
  db.collection("apolices").where("usuarioId", "==", uid).get().then(snapshot => {
    const tbody = document.getElementById("tabelaApolices");
    tbody.innerHTML = "";
    snapshot.forEach(doc => {
      const a = doc.data();
      tbody.innerHTML += `
        <tr>
          <td>${a.tipo}</td>
          <td>${a.seguradora}</td>
          <td>R$ ${parseFloat(a.valorPago || 0).toFixed(2)}</td>
          <td>${a.dataRenovacao || ""}</td>
          <td>${a.pdfEnviado ? "✅" : "❌"}</td>
        </tr>`;
    });
  });
}

// --- Apólices Confirmadas (na Retorno)
function carregarApolicesNaRetorno(uid) {
  db.collection("apolices").where("usuarioId", "==", uid).where("pdfEnviado", "==", true).get().then(snapshot => {
    const tbody = document.getElementById("tabelaRetorno");
    tbody.innerHTML = "";
    snapshot.forEach(a => {
      const data = a.data();
      const valor = parseFloat(data.valorPago || 0);
      const pontos = valor * 0.025;
      tbody.innerHTML += `
        <tr>
          <td>${data.tipo}</td>
          <td>${data.seguradora}</td>
          <td>R$ ${valor.toFixed(2)}</td>
          <td>${data.dataRenovacao || ""}</td>
          <td>${pontos.toFixed(2)}</td>
        </tr>`;
    });
  });
}

// --- Minhas Indicações
function carregarMinhasIndicacoes(uid) {
  db.collection("usuarios").where("usuarioIndicadorId", "==", uid).get().then(snapshot => {
    const tbody = document.getElementById("tabelaIndicacoes");
    tbody.innerHTML = "";
    snapshot.forEach(doc => {
      const u = doc.data();
      const nome = u.nome || "Sem nome";
      const data = new Date(u.dataCadastro || u.timestamp || Date.now()).toLocaleDateString();
      tbody.innerHTML += `<tr><td>${nome}</td><td>${data}</td><td>+10</td></tr>`;
    });
  });
}

// --- Apólices Indicadas (2%)
async function carregarApolicesIndicadas(uid) {
  const indicados = await db.collection("usuarios").where("usuarioIndicadorId", "==", uid).get();
  const tbody = document.getElementById("tabelaApolicesIndicadas");
  tbody.innerHTML = "";

  for (let doc of indicados.docs) {
    const indicado = doc.data();
    const nome = indicado.nome || "Indicado";
    const apolices = await db.collection("apolices").where("usuarioId", "==", doc.id).where("pdfEnviado", "==", true).get();

    apolices.forEach(a => {
      const data = a.data();
      const valor = parseFloat(data.valorPago || 0);
      const pontos = valor * 0.02;
      tbody.innerHTML += `
        <tr>
          <td>${nome}</td>
          <td>${data.tipo}</td>
          <td>${data.seguradora}</td>
          <td>R$ ${valor.toFixed(2)}</td>
          <td>${pontos.toFixed(2)}</td>
        </tr>`;
    });
  }
}

// --- Pontuação total
async function calcularMeusPontos(uid) {
  let total = 0;

  const minhas = await db.collection("apolices").where("usuarioId", "==", uid).where("pdfEnviado", "==", true).get();
  minhas.forEach(doc => {
    total += parseFloat(doc.data().valorPago || 0) * 0.025;
  });

  const indicados = await db.collection("usuarios").where("usuarioIndicadorId", "==", uid).get();
  total += indicados.size * 10;

  for (let doc of indicados.docs) {
    const apolices = await db.collection("apolices").where("usuarioId", "==", doc.id).where("pdfEnviado", "==", true).get();
    apolices.forEach(a => {
      total += parseFloat(a.data().valorPago || 0) * 0.02;
    });
  }

  // Buscar valor já resgatado
  const resgates = await db.collection("resgates").where("usuarioId", "==", uid).get();
  let jaResgatado = 0;
  resgates.forEach(r => jaResgatado += parseFloat(r.data().valor || 0));

  const saldo = total - jaResgatado;
  document.getElementById("saldoAtual").innerHTML = `
    <p><strong>Saldo atual:</strong> R$ ${saldo.toFixed(2)}</p>
    <p><strong>Valor já resgatado:</strong> R$ ${jaResgatado.toFixed(2)}</p>
  `;

  window.saldoDisponivel = saldo;
}

// --- Resgate
function prepararFormularioResgate(uid) {
  document.getElementById("formResgate").addEventListener("submit", async (e) => {
    e.preventDefault();

    const valor = parseFloat(document.getElementById("valorResgate").value);
    const pix = document.getElementById("chavePix").value.trim();

    if (isNaN(valor) || valor < 20) return alert("Valor mínimo para resgate é R$20");
    if (valor > window.saldoDisponivel) return alert("Saldo insuficiente.");
    if (!pix) return alert("Informe sua chave Pix ou dados bancários.");

    await db.collection("resgates").add({
      usuarioId: uid,
      valor,
      pix,
      status: "pendente",
      dataSolicitacao: new Date().toISOString()
    });

    alert("Solicitação enviada! Em breve a equipe entrará em contato.");
    location.reload();
  });
}

function carregarResgates(uid) {
  // Futuro: mostrar histórico de resgates se desejar
}
