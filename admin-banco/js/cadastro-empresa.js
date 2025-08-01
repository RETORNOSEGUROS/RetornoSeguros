firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

function carregarRMs() {
  const selectRM = document.getElementById("rm");

  db.collection("usuarios_banco")
    .where("perfil", "==", "rm")
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const dados = doc.data();
        const option = document.createElement("option");
        option.value = dados.nome;
        option.textContent = `${dados.nome} (${dados.agenciaId || "sem agência"})`;
        selectRM.appendChild(option);
      });
    });
}

function salvarEmpresa() {
  const nome = document.getElementById("nome").value.trim();
  const cnpj = document.getElementById("cnpj").value.trim();
  const cidade = document.getElementById("cidade").value.trim();
  const estado = document.getElementById("estado").value.trim();
  const agencia = document.getElementById("agencia").value.trim();
  const rm = document.getElementById("rm").value;
  const empresaId = document.getElementById("empresaIdEditando").value;

  if (!nome || !cidade || !estado || !agencia || !rm) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  const dados = { nome, cnpj, cidade, estado, agencia, rm };

  if (empresaId) {
    db.collection("empresas").doc(empresaId).update(dados).then(() => {
      alert("Empresa atualizada com sucesso.");
      limparFormulario();
      carregarEmpresas();
    });
  } else {
    auth.onAuthStateChanged(user => {
      if (!user) return alert("Usuário não autenticado.");
      dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();

      db.collection("empresas").add(dados).then(() => {
        alert("Empresa cadastrada com sucesso.");
        limparFormulario();
        carregarEmpresas();
      });
    });
  }
}

function carregarEmpresas() {
  db.collection("empresas").orderBy("nome").get().then(snapshot => {
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
      html += `
        <tr>
          <td>${e.nome || "-"}</td>
          <td>${e.cidade || "-"}</td>
          <td>${e.estado || "-"}</td>
          <td>${e.agencia || "-"}</td>
          <td>${e.rm || "-"}</td>
          <td>
            <button class="btn-sm" onclick="editarEmpresa('${doc.id}')">Editar</button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    document.getElementById("listaEmpresas").innerHTML = html;
  });
}

function editarEmpresa(id) {
  db.collection("empresas").doc(id).get().then(doc => {
    if (!doc.exists) return;
    const e = doc.data();

    document.getElementById("empresaIdEditando").value = id;
    document.getElementById("nome").value = e.nome || "";
    document.getElementById("cnpj").value = e.cnpj || "";
    document.getElementById("cidade").value = e.cidade || "";
    document.getElementById("estado").value = e.estado || "";
    document.getElementById("agencia").value = e.agencia || "";
    document.getElementById("rm").value = e.rm || "";
    document.getElementById("tituloFormulario").textContent = "Editar Empresa";
  });
}

function limparFormulario() {
  document.getElementById("empresaIdEditando").value = "";
  document.getElementById("nome").value = "";
  document.getElementById("cnpj").value = "";
  document.getElementById("cidade").value = "";
  document.getElementById("estado").value = "";
  document.getElementById("agencia").value = "";
  document.getElementById("rm").value = "";
  document.getElementById("tituloFormulario").textContent = "Cadastrar Nova Empresa";
}

window.addEventListener("DOMContentLoaded", () => {
  carregarRMs();
  carregarEmpresas();
});
