firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let editandoUsuarioId = null;

auth.onAuthStateChanged(user => {
  if (!user || user.email !== "patrick@retornoseguros.com.br") {
    window.location.href = "login.html";
  } else {
    listarUsuarios();
    carregarGerentesChefes();
  }
});

function toggleGerenteChefeSelect() {
  const perfil = document.getElementById("perfil").value;
  const box = document.getElementById("gerenteChefeBox");
  box.style.display = (perfil === "rm" || perfil === "assistente") ? "block" : "none";
}

function carregarGerentesChefes() {
  const select = document.getElementById("gerenteChefeId");
  db.collection("usuarios_banco").where("perfil", "==", "gerente_chefe").get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const u = doc.data();
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = `${u.nome} (${u.agenciaId})`;
        select.appendChild(option);
      });
    });
}

function cadastrarUsuario() {
  const nome = document.getElementById("nome").value.trim();
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();
  const perfil = document.getElementById("perfil").value;
  const agenciaId = document.getElementById("agenciaId").value.trim();
  const gerenteChefeId = document.getElementById("gerenteChefeId").value;

  if (!nome || !email || !perfil || !agenciaId) {
    return alert("Preencha todos os campos.");
  }

  // Se estiver editando
  if (editandoUsuarioId) {
    const atualizacao = {
      nome, perfil, agenciaId,
      gerenteChefeId: (perfil === "rm" || perfil === "assistente") ? gerenteChefeId : ""
    };
    db.collection("usuarios_banco").doc(editandoUsuarioId).update(atualizacao)
      .then(() => {
        alert("Usuário atualizado com sucesso.");
        limparFormulario();
        listarUsuarios();
      });
    return;
  }

  if (!senha) return alert("Informe a senha para novo usuário.");

  auth.createUserWithEmailAndPassword(email, senha)
    .then(cred => {
      const uid = cred.user.uid;
      return db.collection("usuarios_banco").doc(uid).set({
        nome,
        email,
        perfil,
        agenciaId,
        ativo: true,
        gerenteChefeId: (perfil === "rm" || perfil === "assistente") ? gerenteChefeId : ""
      }).then(() => {
        alert("Usuário criado com sucesso!");
        limparFormulario();
        listarUsuarios();
      }).catch(err => {
        cred.user.delete();
        console.error("Erro Firestore:", err);
        alert("Erro ao salvar no banco. Cadastro cancelado.");
      });
    })
    .catch(err => {
      console.error("Erro Auth:", err);
      alert("Erro ao cadastrar: " + err.message);
    });
}

function listarUsuarios() {
  const lista = document.getElementById("listaUsuarios");
  lista.innerHTML = "Carregando...";

  db.collection("usuarios_banco").orderBy("nome").get()
    .then(snapshot => {
      lista.innerHTML = "";
      snapshot.forEach(doc => {
        const u = doc.data();
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${u.nome}</td>
          <td>${u.email}</td>
          <td>${u.perfil}</td>
          <td>${u.agenciaId || "-"}</td>
          <td><button onclick="editarUsuario('${doc.id}', '${u.nome}', '${u.email}', '${u.perfil}', '${u.agenciaId || ""}', '${u.gerenteChefeId || ""}')">Editar</button></td>
        `;
        lista.appendChild(tr);
      });
    });
}

function editarUsuario(id, nome, email, perfil, agenciaId, gerenteChefeId) {
  editandoUsuarioId = id;
  document.getElementById("nome").value = nome;
  document.getElementById("email").value = email;
  document.getElementById("email").disabled = true;
  document.getElementById("senha").value = "";
  document.getElementById("perfil").value = perfil;
  document.getElementById("agenciaId").value = agenciaId;
  toggleGerenteChefeSelect();
  if (perfil === "rm" || perfil === "assistente") {
    document.getElementById("gerenteChefeId").value = gerenteChefeId || "";
  }
  document.querySelector("button").textContent = "Atualizar";
}

function limparFormulario() {
  editandoUsuarioId = null;
  document.getElementById("nome").value = "";
  document.getElementById("email").value = "";
  document.getElementById("email").disabled = false;
  document.getElementById("senha").value = "";
  document.getElementById("perfil").value = "";
  document.getElementById("agenciaId").va
