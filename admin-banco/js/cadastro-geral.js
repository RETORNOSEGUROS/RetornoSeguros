// ✅ Inicialização
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 🔹 App secundária para criar usuários no Auth sem perder a sessão do admin
let secondaryApp = null;
function getSecondaryAuth() {
  if (!secondaryApp) {
    secondaryApp = firebase.initializeApp(firebaseConfig, "adminCreate");
  }
  return secondaryApp.auth();
}

let editandoUsuarioId = null;

// ✅ Ao logar como admin, carrega tudo
auth.onAuthStateChanged(user => {
  if (!user || user.email !== "patrick@retornoseguros.com.br") {
    window.location.href = "login.html";
  } else {
    listarUsuarios();
    carregarGerentesChefes();
    carregarAgencias();           // <<=== carrega as agências
  }
});

// ✅ Mostra/oculta vínculo com gerente-chefe
function toggleCamposVinculo() {
  const perfil = document.getElementById("perfil").value;
  const gerenteBox = document.getElementById("gerenteChefeBox");
  gerenteBox.style.display = (perfil === "rm" || perfil === "assistente") ? "block" : "none";
}

// ✅ Popula select de Gerentes-Chefe
function carregarGerentesChefes() {
  const select = document.getElementById("gerenteChefeId");
  if (!select) return;

  select.innerHTML = '<option value="">Selecionar</option>';
  db.collection("usuarios_banco").where("perfil", "==", "gerente_chefe").get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const u = doc.data() || {};
        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = `${u.nome || "(Sem nome)"} (${u.agenciaId || "-"})`;
        select.appendChild(option);
      });
    })
    .catch(err => console.error("Erro ao carregar gerentes-chefe:", err));
}

// ✅ Popula select de Agências
function carregarAgencias() {
  const select = document.getElementById("agenciaId");
  if (!select) return;

  select.innerHTML = '<option value="">Selecione</option>';

  // Busca todas as agências e ordena por nome (se não tiver nome, usa o ID)
  db.collection("agencias_banco").orderBy("nome").get()
    .then(snapshot => {
      if (snapshot.empty) {
        // fallback: tenta sem orderBy, caso alguns docs não tenham "nome"
        return db.collection("agencias_banco").get();
      }
      return snapshot;
    })
    .then(snapshot => {
      snapshot.forEach(doc => {
        const ag = doc.data() || {};
        const nome = ag.nome || "(Sem nome)";
        const banco = ag.banco ? ` - ${ag.banco}` : "";
        const cidade = ag.Cidade || ag.cidade || ""; // em alguns lugares está "Cidade"
        const cidadeFmt = cidade ? ` / ${cidade}` : "";
        const option = document.createElement("option");
        option.value = doc.id; // Ex.: "3495"
        option.textContent = `${doc.id} - ${nome}${banco}${cidadeFmt}`;
        select.appendChild(option);
      });
    })
    .catch(err => {
      console.error("Erro ao carregar agências:", err);
      alert("Não foi possível carregar as agências. Verifique a coleção 'agencias_banco'.");
    });
}

// ✅ Criar/atualizar usuário
async function cadastrarUsuario() {
  const nome = document.getElementById("nome").value.trim();
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim(); // usada na criação do Auth
  const perfil = document.getElementById("perfil").value;
  const agenciaId = document.getElementById("agenciaId").value.trim();
  const gerenteChefeIdSelecionado = document.getElementById("gerenteChefeId").value;

  if (!nome || !email || !perfil || !agenciaId) {
    alert("Preencha todos os campos obrigatórios.");
    return;
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
        carregarAgencias(); // mantém o select sincronizado
      })
      .catch(err => {
        console.error("Erro ao atualizar:", err);
        alert("Erro ao atualizar o usuário: " + (err?.message || err));
      });
  }

  // 🆕 Criação NOVA: Auth (secondary) -> Firestore (perfil)
  if (!senha || senha.length < 6) {
    alert("Defina uma senha (mínimo 6 caracteres) para criar o login.");
    return;
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
    carregarAgencias();
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

// ✅ Listagem
function listarUsuarios() {
  const lista = document.getElementById("listaUsuarios");
  if (!lista) return;

  lista.innerHTML = "";

  db.collection("usuarios_banco").orderBy("nome").get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const u = doc.data() || {};
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${u.nome || "-"}</td>
          <td>${u.email || "-"}</td>
          <td>${u.perfil || "-"}</td>
          <td>${u.agenciaId || "-"}</td>
          <td>
            <button onclick="editarUsuario('${doc.id}', '${(u.nome || "").replace(/'/g,"&#39;")}', '${(u.email || "").replace(/'/g,"&#39;")}', '${u.perfil || ""}', '${u.agenciaId || ""}', '${u.gerenteChefeId || ""}')">Editar</button>
            <button onclick="excluirUsuario('${doc.id}', '${(u.email || "").replace(/'/g,"&#39;")}')">🗑 Excluir</button>
          </td>
        `;

        lista.appendChild(tr);
      });
    })
    .catch(err => console.error("Erro ao listar usuários:", err));
}

// ✅ Preenche formulário para edição
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
    const sel = document.getElementById("gerenteChefeId");
    if (sel) sel.value = gerenteChefeId || "";
  }, 150);
  // Troca rótulo do primeiro botão do formulário
  const btn = document.querySelector("button");
  if (btn) btn.textContent = "Atualizar";
}

// ✅ Excluir (apenas Firestore)
async function excluirUsuario(usuarioId, email) {
  if (!confirm(`Deseja mesmo excluir o usuário ${email}? Isso removerá APENAS o perfil (Firestore).`)) return;

  try {
    await db.collection("usuarios_banco").doc(usuarioId).delete();
    alert("Perfil excluído do banco. (O login no Auth permanece.)");
    listarUsuarios();
  } catch (err) {
    console.error("Erro ao excluir:", err);
    alert("Erro ao excluir: " + (err?.message || err));
  }
}

// ✅ Reset do formulário
function limparFormulario() {
  editandoUsuarioId = null;
  document.getElementById("nome").value = "";
  document.getElementById("email").value = "";
  document.getElementById("email").disabled = false;
  document.getElementById("senha").value = "";
  document.getElementById("perfil").value = "";
  document.getElementById("agenciaId").value = "";
  const sel = document.getElementById("gerenteChefeId");
  if (sel) sel.value = "";
  document.getElementById("gerenteChefeBox").style.display = "none";
  const btn = document.querySelector("button");
  if (btn) btn.textContent = "Cadastrar";
}
