firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let agenciasMap = {};
let perfilAtual = null;
let minhaAgencia = null;

auth.onAuthStateChanged(async user => {
  if (!user) {
    alert("Faça login para continuar.");
    return (window.location.href = "login.html");
  }

  // pega perfil e agência do usuário logado
  const docPerfil = await db.collection("usuarios_banco").doc(user.uid).get();
  const p = docPerfil.exists ? docPerfil.data() : {};
  perfilAtual = p.perfil || "";
  minhaAgencia = p.agenciaId || "";

  await carregarAgencias(); // popular selects de agência
  await carregarRMs();      // popular RMs

  // set default do filtro: se admin, mantém vazio (pode trocar); senão fixa na minhaAgencia
  const filtroSel = document.getElementById("filtroAgencia");
  if (perfilAtual !== "admin" && minhaAgencia) {
    filtroSel.value = minhaAgencia;
    filtroSel.disabled = true;
  }

  carregarEmpresas();
});

async function carregarAgencias() {
  agenciasMap = {};
  const selForm = document.getElementById("agenciaId");
  const selFiltro = document.getElementById("filtroAgencia");

  selForm.innerHTML = '<option value="">Selecione uma agência</option>';
  // mantém a primeira opção do filtro (Minha agência)
  selFiltro.innerHTML = '<option value="">Minha agência</option>';

  const snap = await db.collection("agencias_banco")
    .orderBy(firebase.firestore.FieldPath.documentId()).get();

  snap.forEach(doc => {
    const data = doc.data() || {};
    const id = doc.id;
    agenciasMap[id] = data.nome || id;

    const opt1 = document.createElement("option");
    opt1.value = id;
    opt1.textContent = `${id} - ${agenciasMap[id]}`;
    selForm.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = id;
    opt2.textContent = `${id} - ${agenciasMap[id]}`;
    selFiltro.appendChild(opt2);
  });

  // default no formulário: minha agência
  if (minhaAgencia && selForm.querySelector(`option[value="${minhaAgencia}"]`)) {
    selForm.value = minhaAgencia;
  }
}

async function carregarRMs() {
  const selectRM = document.getElementById("rm");
  selectRM.innerHTML = '<option value="">Selecione um RM</option>';

  // lista RMs da mesma agência do usuário (ou de toda a agência escolhida no form, se admin quiser)
  const agenciaEscolhida = document.getElementById("agenciaId").value || minhaAgencia;

  let q = db.collection("usuarios_banco").where("perfil", "==", "rm");
  if (agenciaEscolhida) q = q.where("agenciaId", "==", agenciaEscolhida);

  const snapshot = await q.get();
  snapshot.forEach(doc => {
    const dados = doc.data();
    const option = document.createElement("option");
    // mantém o que você já usa hoje (nome); depois podemos trocar para uid se quiser
    option.value = dados.nome;
    option.textContent = `${dados.nome} (${dados.agenciaId || "-"})`;
    selectRM.appendChild(option);
  });
}

async function salvarEmpresa() {
  const nome = document.getElementById("nome").value.trim();
  const cnpj = document.getElementById("cnpj").value.trim();
  const cidade = document.getElementById("cidade").value.trim();
  const estado = document.getElementById("estado").value.trim();
  const agenciaId = document.getElementById("agenciaId").value.trim();
  const rm = document.getElementById("rm").value;
  const empresaId = document.getElementById("empresaIdEditando").value;

  if (!nome || !cidade || !estado || !agenciaId || !rm) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  const dados = { nome, cnpj, cidade, estado, agenciaId, rm };

  if (empresaId) {
    await db.collection("empresas").doc(empresaId).update(dados);
    alert("Empresa atualizada com sucesso.");
  } else {
    const user = auth.currentUser;
    if (!user) return alert("Usuário não autenticado.");

    dados.criadoEm = firebase.firestore.Timestamp.now();
    dados.criadoPorUid = user.uid;

    await db.collection("empresas").add(dados);
    alert("Empresa cadastrada com sucesso.");
  }

  limparFormulario();
  carregarEmpresas();
}

async function carregarEmpresas() {
  const filtroAg = document.getElementById("filtroAgencia").value || minhaAgencia;

  let q = db.collection("empresas");
  if (filtroAg) q = q.where("agenciaId", "==", filtroAg);

  const snapshot = await q.orderBy("nome").get();

  let html = `
    <h3>Empresas Cadastradas</h3>
    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Cidade</th>
          <th>Estado</th>
          <th>Agência</th>
          <th>RM</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
  `;

  snapshot.forEach(doc => {
    const e = doc.data();
    const agLabel = e.agenciaId ? `${e.agenciaId} - ${agenciasMap[e.agenciaId] || ""}` : "-";
    html += `
      <tr>
        <td>${e.nome || "-"}</td>
        <td>${e.cidade || "-"}</td>
        <td>${e.estado || "-"}</td>
        <td>${agLabel}</td>
        <td>${e.rm || "-"}</td>
        <td>
          <button class="btn-sm" onclick="editarEmpresa('${doc.id}')">Editar</button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  document.getElementById("listaEmpresas").innerHTML = html;
}

async function editarEmpresa(id) {
  const docSnap = await db.collection("empresas").doc(id).get();
  if (!docSnap.exists) return;

  const e = docSnap.data();

  document.getElementById("empresaIdEditando").value = id;
  document.getElementById("nome").value = e.nome || "";
  document.getElementById("cnpj").value = e.cnpj || "";
  document.getElementById("cidade").value = e.cidade || "";
  document.getElementById("estado").value = e.estado || "";

  // seleciona agência no form (e recarrega RMs dessa agência)
  document.getElementById("agenciaId").value = e.agenciaId || "";
  await carregarRMs();
  document.getElementById("rm").value = e.rm || "";

  document.getElementById("tituloFormulario").textContent = "Editar Empresa";
}

function limparFormulario() {
  document.getElementById("empresaIdEditando").value = "";
  document.getElementById("nome").value = "";
  document.getElementById("cnpj").value = "";
  document.getElementById("cidade").value = "";
  document.getElementById("estado").value = "";
  document.getElementById("agenciaId").value = minhaAgencia || "";
  document.getElementById("rm").value = "";
  document.getElementById("tituloFormulario").textContent = "Cadastrar Nova Empresa";
}

window.addEventListener("DOMContentLoaded", () => {
  // tudo é carregado no onAuthStateChanged
});
