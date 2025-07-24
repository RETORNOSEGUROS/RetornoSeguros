// Lógica para gerenciar gerentes e RMs
const form = document.getElementById("formCadastroGerente");
const tabela = document.getElementById("tabelaGerentes").querySelector("tbody");
const chefeSelect = document.getElementById("chefeId");

const isMaster = window.gerenteLogado.cargo === "master";
const uidAtual = window.gerenteLogado.id;

if (!isMaster && window.gerenteLogado.cargo !== "chefe") {
  document.getElementById("gerenciarGerentes").style.display = "none";
}

form.cargo.onchange = () => {
  if (form.cargo.value === "rm") {
    chefeSelect.style.display = "block";
    carregarChefes();
  } else {
    chefeSelect.style.display = "none";
  }
};

function carregarChefes() {
  chefeSelect.innerHTML = "<option value=''>Vincular ao Chefe</option>";
  db.collection("gerentes").where("cargo", "in", ["chefe", "master"]).get().then(snapshot => {
    snapshot.forEach(doc => {
      const dados = doc.data();
      chefeSelect.innerHTML += `<option value="${doc.id}">${dados.nome} (${dados.agencia})</option>`;
    });
  });
}

form.onsubmit = (e) => {
  e.preventDefault();
  const nome = form.nome.value.trim();
  const email = form.email.value.trim();
  const senha = form.senha.value;
  const cargo = form.cargo.value;
  const agencia = form.agencia.value.trim();
  const chefeId = form.chefeId.value || "";

  const msg = document.getElementById("mensagemCadastro");
  msg.textContent = "Cadastrando...";

  firebase.auth().createUserWithEmailAndPassword(email, senha)
    .then(userCredential => {
      const uid = userCredential.user.uid;
      return db.collection("gerentes").doc(uid).set({
        nome,
        email,
        cargo,
        agencia,
        chefeId: cargo === "rm" ? chefeId : "",
        ativo: true,
        uid
      });
    })
    .then(() => {
      msg.textContent = "✅ Usuário cadastrado com sucesso!";
      form.reset();
      chefeSelect.style.display = "none";
      listarGerentes();
    })
    .catch(error => {
      msg.style.color = "red";
      msg.textContent = "❌ Erro: " + error.message;
    });
};

function listarGerentes() {
  tabela.innerHTML = "<tr><td colspan='6'>Carregando...</td></tr>";

  let ref = db.collection("gerentes");
  if (!isMaster) ref = ref.where("chefeId", "==", uidAtual);

  ref.get().then(snapshot => {
    if (snapshot.empty) {
      tabela.innerHTML = "<tr><td colspan='6'>Nenhum gerente cadastrado.</td></tr>";
      return;
    }

    tabela.innerHTML = "";
    snapshot.forEach(doc => {
      const dados = doc.data();
      const linha = document.createElement("tr");
      linha.innerHTML = `
        <td>${dados.nome}</td>
        <td>${dados.cargo}</td>
        <td>${dados.agencia}</td>
        <td>${dados.email}</td>
        <td>${dados.ativo ? "✅" : "❌"}</td>
        <td>
          <button onclick="editarGerente('${doc.id}')">✏️</button>
          <button onclick="trocarSenha('${dados.email}')">🔑</button>
        </td>
      `;
      tabela.appendChild(linha);
    });
  });
}

function editarGerente(id) {
  db.collection("gerentes").doc(id).get().then(doc => {
    const d = doc.data();
    form.nome.value = d.nome;
    form.email.value = d.email;
    form.cargo.value = d.cargo;
    form.agencia.value = d.agencia;
    if (d.cargo === "rm") {
      chefeSelect.style.display = "block";
      carregarChefes();
      setTimeout(() => {
        chefeSelect.value = d.chefeId;
      }, 500);
    } else {
      chefeSelect.style.display = "none";
    }

    document.getElementById("mensagemCadastro").textContent = "🔁 Modo edição — clique em Salvar";
    form.onsubmit = (e) => {
      e.preventDefault();
      const nome = form.nome.value.trim();
      const cargo = form.cargo.value;
      const agencia = form.agencia.value.trim();
      const chefeId = form.chefeId.value || "";

      db.collection("gerentes").doc(id).update({
        nome,
        cargo,
        agencia,
        chefeId: cargo === "rm" ? chefeId : ""
      }).then(() => {
        document.getElementById("mensagemCadastro").textContent = "✅ Atualizado!";
        form.reset();
        chefeSelect.style.display = "none";
        listarGerentes();
        resetSubmitCadastro();
      });
    };
  });
}

function trocarSenha(email) {
  firebase.auth().sendPasswordResetEmail(email)
    .then(() => alert("E-mail de redefinição de senha enviado para: " + email))
    .catch(err => alert("Erro: " + err.message));
}

function resetSubmitCadastro() {
  form.onsubmit = defaultSubmit;
}

function defaultSubmit(e) {
  e.preventDefault();
}

listarGerentes();