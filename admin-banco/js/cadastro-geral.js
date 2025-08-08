firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 🔹 App secundário para criar usuários no Auth sem perder a sessão do admin
let secondaryApp = null;
function getSecondaryAuth() {
  if (!secondaryApp) {
    secondaryApp = firebase.initializeApp(firebaseConfig, "adminCreate");
  }
  return secondaryApp.auth();
}

let editandoUsuarioId = null;
let agenciasMap = {};

auth.onAuthStateChanged(user => {
  if (!user || user.email !== "patrick@retornoseguros.com.br") {
    window.location.href = "login.html";
  } else {
    loadAgencias().then(() => {
      listarUsuarios();
      carregarGerentesChefes();
    });
  }
});

function toggleCamposVinculo() {
  const perfil = document.getElementById("perfil").value;
  const gerenteBox = document.getElementById("gerenteChefeBox");
  gerenteBox.style.display = (perfil === "rm" || perfil === "assistente") ? "block" : "none";
}

async function loadAgencias() {
  // carrega agencias para o select e também monta um map para exibir nome na lista
  const sel = document.getElementById("agenciaId");
  sel.innerHTML = '<option value="">Selecione a agência</option>';
  agenciasMap = {};

  const snap = await db.collection("agencias_banco").orderBy(firebase.firestore.FieldPath.documentId()).get();
  snap.forEach(doc => {
    const data = doc.data() || {};
    agenciasMap[doc.id] = data.nome || doc.id;
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = `${doc.id} - ${data.nome || "-"}`;
    sel.appendChild(opt);
  });
}

function carregarGerentesChefes() {
  const select = document.getElementById("gerenteChefeId");
  select.innerHTML = '<option value="">Selecionar</option>';
  db.collection("usuarios_banco").where("perfil", "==", "gerente_chefe").get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const u = doc.data();
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = `${u.nome} (${u.agenciaId || "-"})`;
        select.appendChild(option);
      });
    });
}

async function cadastrarUsuario() {
  const nome = document.getElementById("nome").value.trim();
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();
  const perfil = document.getElementById("perfil").value;
  const agenciaId = document.getElementById("agenciaId").value;
  const gerenteChefeIdSelecionado = document.getElementById("gerenteChefeId").value;

  if (!nome || !email || !perfil || !agenciaId) {
    return alert("Preencha todos os campos obrigatórios.");
  }
  if (!agenciasMap[agenciaId]) {
    return alert("Agência inválida. Selecione uma agência existente.");
  }

  // 🔁 Edição (somente Firestore)
  if (editandoUsuarioId) {
    const atualizacao = {
      nome,
      perfil,
      agenciaId,
      gerenteChefeId: (perfil === "rm" || perfil === "assistente") ? gerenteChefeIdSelecionado : ""
    };

    return db.collection("usuarios_banco").doc(editandoUsuarioId).update(atualizacao)
      .then(() => {
        alert("✅ Usuário atualizado com sucesso.");
        limparFormulario();
        listarUsuarios();
        carregarGerentesChefes();
      })
      .catch(err => {
        console.error("Erro ao atualizar:", err);
        alert("Erro ao atualizar o usuário: " + (err?.message || err));
      });
  }

  // 🆕 Criação NOVA: Auth (secondary) -> Firestore (perfil)
  if (!senha || senha.length < 6) {
    return alert("Defina uma senha (mínimo 6 caracteres) para criar o login.");
  }

  const secondaryAuth = getSecondaryAuth();

  try {
    // cria no Auth usando a app secundária
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, senha);
    const uid = cred.user.uid;

    // grava o perfil com ID = UID
    await db.collection("usuarios_banco").doc(uid).set({
      nome,
      email,
      perfil,
      agenciaId,
      ativo: true,
      gerenteChefeId: (perfil === "rm" || perfil === "assistente") ? gerenteChefeIdSelecionado : "",
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    // encerra a sessão da app secundária (sua sessão principal continua intacta)
    await secondaryAuth.signOut();

    alert("✅ Usuário criado no Auth e cadastrado no banco!");
    limparFormulario();
    listarUsuarios();
    carregarGerentesChefes();
  } catch (err) {
    console.error("Erro ao criar login:", err);
    if (err && err.code === "auth/email-already-in-use") {
      alert("Este e-mail já existe no Auth. Use 'Redefinir senha' ou escolha outro e-mail.");
    } else {
      alert("Erro ao criar login: " + (err?.message || err));
    }
    try { await secondaryAuth.signOut(); } catch(e) {}
  }
}

function listarUsuarios() {
  const lista = document.getElementById("listaUsuarios");
  lista.innerHTML = "";

  db.collection("usuarios_banco").orderBy("nome").get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const u = doc.data();
        const agNome = agenciasMap[u.agenciaId] ? `${u.agenciaId} - ${agenciasMap[u.agenciaId]}` : (u.agenciaId || "-");
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${u.nome || "-"}</td>
          <td>${u.email || "-"}</td>
          <td>${u.perfil || "-"}</td>
          <td>${agNome}</td>
          <td>
            <button onclick="editarUsuario('${doc.id}', '${u.nome || ""}', '${u.email || ""}', '${u.perfil || ""}', '${u.agenciaId || ""}', '${u.gerenteChefeId || ""}')">Editar</button>
            <button onclick="excluirUsuario('${doc.id}', '${u.email || ""}')">🗑 Excluir</button>
          </td>
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
  document.getElementById("senha").value = ""; // senha não é exibida
  document.getElementById("perfil").value = perfil;
  document.getElementById("agenciaId").value = agenciaId || "";
  toggleCamposVinculo();
  setTimeout(() => {
    document.getElementById("gerenteChefeId").value = gerenteChefeId || "";
  }, 150);
  document.querySelector("button").textContent = "Atualizar";
}

async function excluirUsuario(usuarioId, email) {
  if (!confirm(`Deseja mesmo excluir o usuário ${email}? Isso removerá APENAS o perfil (Firestore).`)) return;

  // Observação: excluir o usuário do Auth exigirá login desse usuário ou uma Cloud Function Admin.
  // Aqui vamos excluir somente o doc do Firestore.
  try {
    await db.collection("usuarios_banco").doc(usuarioId).delete();
    alert("Perfil excluído do banco. (O login no Auth permanece.)");
    listarUsuarios();
  } catch (err) {
    console.error("Erro ao excluir:", err);
    alert("Erro ao excluir: " + (err?.message || err));
  }
}

function limparFormulario() {
  editandoUsuarioId = null;
  document.getElementById("nome").value = "";
  document.getElementById("email").value = "";
  document.getElementById("email").disabled = false;
  document.getElementById("senha").value = "";
  document.getElementById("perfil").value = "";
  document.getElementById("agenciaId").value = "";
  document.getElementById("gerenteChefeId").value = "";
  document.getElementById("gerenteChefeBox").style.display = "none";
  document.querySelector("button").textContent = "Cadastrar";
}
