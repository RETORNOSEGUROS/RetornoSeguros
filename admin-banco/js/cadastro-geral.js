// ✅ Inicialização
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();

// 🔹 App secundária para criar usuários no Auth sem perder a sessão do admin
let secondaryApp = null;
function getSecondaryAuth() {
  if (!secondaryApp) {
    secondaryApp = firebase.initializeApp(firebaseConfig, "adminCreate");
  }
  return secondaryApp.auth();
}

let editandoUsuarioId = null;

// 🔹 Cache de agências (id -> label amigável)
const agenciasCache = {}; // ex.: { "KhU...": "Large Corporate — Bradesco / Blumenau - SC" }
let usuariosCache = [];   // para filtrar sem refazer query sempre

function fmtDataBR(ts) {
  try {
    if (!ts) return "-";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch (_) {
    return "-";
  }
}

// ✅ Ao logar como admin, carrega tudo
auth.onAuthStateChanged(async (user) => {
  if (!user || user.email !== "patrick@retornoseguros.com.br") {
    window.location.href = "login.html";
  } else {
    await carregarAgencias();     // garante cache preenchido e selects prontos
    carregarGerentesChefes();
    prepararFiltros();
    listarUsuarios();             // agora a coluna “Agência” já usa o rótulo
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

// ✅ Popula selects de Agências e o cache
async function carregarAgencias() {
  const selectCad = document.getElementById("agenciaId");
  const selectFiltro = document.getElementById("filtroAgencia");

  if (selectCad) selectCad.innerHTML = '<option value="">Selecione</option>';
  if (selectFiltro) selectFiltro.innerHTML = '<option value="">Todas</option>';

  let snapshot;
  try {
    snapshot = await db.collection("agencias_banco").orderBy("nome").get();
    if (snapshot.empty) snapshot = await db.collection("agencias_banco").get();
  } catch (e) {
    snapshot = await db.collection("agencias_banco").get();
  }

  snapshot.forEach(doc => {
    const ag = doc.data() || {};
    const id = doc.id;

    const nome = (ag.nome || "(Sem nome)").toString();
    const banco = ag.banco ? ` — ${ag.banco}` : "";
    const cidade = ag.Cidade || ag.cidade || "";
    const cidadeFmt = cidade ? ` / ${cidade}` : "";
    const uf = (ag.estado || ag.UF || "").toString().toUpperCase();
    const ufFmt = uf ? ` - ${uf}` : "";

    const label = `${nome}${banco}${cidadeFmt}${ufFmt}`;
    agenciasCache[id] = label;

    if (selectCad) {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = label;
      selectCad.appendChild(o);
    }
    if (selectFiltro) {
      const o2 = document.createElement("option");
      o2.value = id;
      o2.textContent = label;
      selectFiltro.appendChild(o2);
    }
  });
}

// ✅ Criar/atualizar usuário (perfil/Firestore)
//    (Senha só é usada na CRIAÇÃO; para alterar depois use o botão "Alterar Senha")
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
        carregarGerentesChefes();
        listarUsuarios();
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

    await secondaryAuth.signOut();

    alert("✅ Usuário criado no Auth e cadastrado no banco!");
    limparFormulario();
    carregarGerentesChefes();
    listarUsuarios();
  } catch (err) {
    console.error("Erro ao criar login:", err);
    if (err && err.code === "auth/email-already-in-use") {
      alert("Este e-mail já existe no Auth. Use 'Alterar Senha' ou escolha outro e-mail.");
    } else {
      alert("Erro ao criar login: " + (err?.message || err));
    }
    try { await secondaryAuth.signOut(); } catch(e) {}
  }
}

// ✅ Listagem com cache local para filtros
async function listarUsuarios() {
  const lista = document.getElementById("listaUsuarios");
  if (!lista) return;

  lista.innerHTML = "";
  usuariosCache = []; // reset

  try {
    const snapshot = await db.collection("usuarios_banco").orderBy("nome").get();
    snapshot.forEach(doc => {
      const u = { id: doc.id, ...(doc.data() || {}) };
      usuariosCache.push(u);
    });
    renderLista(usuariosCache);
  } catch (err) {
    console.error("Erro ao listar usuários:", err);
  }
}

function renderLista(array) {
  const tbody = document.getElementById("listaUsuarios");
  if (!tbody) return;
  tbody.innerHTML = "";

  array.forEach(u => {
    const tr = document.createElement("tr");
    const agenciaRotulo = u.agenciaId ? (agenciasCache[u.agenciaId] || u.agenciaId) : "-";
    const criadoEmFmt = fmtDataBR(u.criadoEm);

    tr.innerHTML = `
      <td>${u.nome || "-"}</td>
      <td>${u.email || "-"}</td>
      <td>${u.perfil || "-"}</td>
      <td>${agenciaRotulo}</td>
      <td>${criadoEmFmt}</td>
      <td class="actions">
        <button onclick="editarUsuario('${u.id}', '${(u.nome||"").replace(/'/g,"&#39;")}', '${(u.email||"").replace(/'/g,"&#39;")}', '${u.perfil||""}', '${u.agenciaId||""}', '${u.gerenteChefeId||""}')">Editar</button>
        <button onclick="abrirAlterarSenha('${u.id}', '${(u.email||"").replace(/'/g,"&#39;")}')">Alterar Senha</button>
        <button class="danger" onclick="excluirUsuario('${u.id}', '${(u.email||"").replace(/'/g,"&#39;")}')">🗑 Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ✅ Filtros
function prepararFiltros() {
  const nome = document.getElementById("filtroNome");
  if (nome) nome.addEventListener("keyup", aplicarFiltros);
}

function aplicarFiltros() {
  const ag = (document.getElementById("filtroAgencia")?.value || "").trim();
  const pf = (document.getElementById("filtroPerfil")?.value || "").trim();
  const nm = (document.getElementById("filtroNome")?.value || "").toLowerCase().trim();

  const filtrados = usuariosCache.filter(u => {
    const byAg = ag ? u.agenciaId === ag : true;
    const byPf = pf ? u.perfil === pf : true;
    const byNm = nm ? (u.nome || "").toLowerCase().includes(nm) : true;
    return byAg && byPf && byNm;
  });
  renderLista(filtrados);
}

function limparFiltros() {
  const fAg = document.getElementById("filtroAgencia");
  const fPf = document.getElementById("filtroPerfil");
  const fNm = document.getElementById("filtroNome");
  if (fAg) fAg.value = "";
  if (fPf) fPf.value = "";
  if (fNm) fNm.value = "";
  renderLista(usuariosCache);
}

// ✅ Preenche formulário para edição (perfil/Firestore)
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
}

// ✅ Alterar senha via Cloud Function (Admin SDK)
async function abrirAlterarSenha(uid, email) {
  const nova = prompt(`Informe a nova senha para:\n${email}\n(Mínimo 6 caracteres)`);
  if (nova === null) return; // cancelou
  const senha = (nova || "").trim();
  if (senha.length < 6) {
    alert("A senha deve ter pelo menos 6 caracteres.");
    return;
  }
  try {
    const callable = functions.httpsCallable("adminUpdatePassword");
    const res = await callable({ uid, newPassword: senha });
    if (res && res.data && res.data.ok) {
      alert("✅ Senha atualizada no Auth. O usuário já pode logar com a nova senha.");
    } else {
      alert("Não foi possível confirmar a alteração de senha.");
    }
  } catch (err) {
    console.error("Erro ao alterar senha:", err);
    alert("Erro ao alterar senha: " + (err?.message || err));
  }
}
