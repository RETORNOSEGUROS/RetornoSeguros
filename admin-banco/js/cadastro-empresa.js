/* Inicialização Firebase */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* Estado local */
let agenciasMap   = {};     // { "3495": "Corporate One", ... }
let perfilAtual   = null;
let minhaAgencia  = null;
let isAdmin       = false;  // admin por email

/* Utils DOM */
const $  = (id) => document.getElementById(id);
const setStatus = (msg) => { const el=$('statusLista'); if(el) el.textContent = msg || ''; };

/* Fluxo de autenticação */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    alert("Faça login para continuar.");
    return (window.location.href = "login.html");
  }

  // Admin por e-mail (mantém compatível com outras telas)
  isAdmin = (user.email === "patrick@retornoseguros.com.br");

  // Perfil do usuário logado (pega agência padrão)
  try {
    const snap = await db.collection("usuarios_banco").doc(user.uid).get();
    const p = snap.exists ? (snap.data() || {}) : {};
    perfilAtual  = p.perfil || "";
    minhaAgencia = p.agenciaId || "";
  } catch(e) {
    console.error("Erro ao carregar perfil:", e);
  }

  await carregarAgencias(); // popular <select> da agência (form e filtro)
  await carregarRMs();      // popular RMs de acordo com agência do form

  // Filtro: se não for admin e tiver agência, fixa na sua; admin pode trocar
  const filtroSel = $('filtroAgencia');
  if (!isAdmin && minhaAgencia) {
    filtroSel.value = minhaAgencia;
    filtroSel.disabled = true;
  }

  await carregarEmpresas(); // primeira renderização
});

/* Carrega lista de agências para o formulário e para o filtro */
async function carregarAgencias() {
  agenciasMap = {};
  const selForm   = $('agenciaId');
  const selFiltro = $('filtroAgencia');

  selForm.innerHTML   = '<option value="">Selecione uma agência</option>';
  selFiltro.innerHTML = '<option value="">Minha agência</option>';

  // Ordena por ID (que é o número da agência). Se quiser por nome, mude para orderBy("nome")
  const snap = await db.collection("agencias_banco")
                       .orderBy(firebase.firestore.FieldPath.documentId())
                       .get();

  snap.forEach((doc) => {
    const ag = doc.data() || {};
    const id = doc.id;
    agenciasMap[id] = ag.nome || id;

    const optForm   = document.createElement("option");
    optForm.value   = id;
    optForm.textContent = `${id} - ${agenciasMap[id]}`;
    selForm.appendChild(optForm);

    const optFiltro = document.createElement("option");
    optFiltro.value = id;
    optFiltro.textContent = `${id} - ${agenciasMap[id]}`;
    selFiltro.appendChild(optFiltro);
  });

  // Default do formulário = minha agência (se existir)
  if (minhaAgencia && selForm.querySelector(`option[value="${minhaAgencia}"]`)) {
    selForm.value = minhaAgencia;
  }
}

/* Quando mudar a agência no formulário, recarrega RMs dessa agência */
function onAgenciaChangeForm() {
  carregarRMs();
}

/* Carrega RMs, preferindo a agência selecionada no form; fallback = minhaAgencia */
async function carregarRMs() {
  const selectRM = $('rm');
  if (!selectRM) return;
  selectRM.innerHTML = '<option value="">Selecione um RM</option>';

  const agenciaEscolhida = $('agenciaId').value || minhaAgencia;

  try {
    let q = db.collection("usuarios_banco").where("perfil", "==", "rm");
    if (agenciaEscolhida) q = q.where("agenciaId", "==", agenciaEscolhida);

    const snapshot = await q.get();
    snapshot.forEach((doc) => {
      const u = doc.data() || {};
      // Mantive value=nome para compatibilidade com seu modelo atual
      const opt = document.createElement("option");
      opt.value = u.nome;
      opt.textContent = `${u.nome} (${u.agenciaId || "-"})`;
      selectRM.appendChild(opt);
    });
  } catch (e) {
    console.error("Erro ao carregar RMs:", e);
  }
}

/* CRUD Empresa */
async function salvarEmpresa() {
  const nome      = $('nome').value.trim();
  const cnpj      = $('cnpj').value.trim();
  const cidade    = $('cidade').value.trim();
  const estado    = $('estado').value.trim();
  const agenciaId = $('agenciaId').value.trim();
  const rm        = $('rm').value;
  const empresaId = $('empresaIdEditando').value;

  if (!nome || !cidade || !estado || !agenciaId || !rm) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  const dados = { nome, cnpj, cidade, estado, agenciaId, rm };

  try {
    if (empresaId) {
      await db.collection("empresas").doc(empresaId).update(dados);
      alert("Empresa atualizada com sucesso.");
    } else {
      const user = auth.currentUser;
      if (!user) return alert("Usuário não autenticado.");
      dados.criadoEm    = firebase.firestore.Timestamp.now();
      dados.criadoPorUid= user.uid;
      await db.collection("empresas").add(dados);
      alert("Empresa cadastrada com sucesso.");
    }
    limparFormulario();
    await carregarEmpresas();
  } catch (e) {
    console.error("Erro ao salvar empresa:", e);
    alert("Erro ao salvar empresa.");
  }
}

/* Lista empresas aplicando filtro por agência (corrigido) */
async function carregarEmpresas() {
  const filtroValor = $('filtroAgencia').value;
  // Se filtro estiver vazio, usa minhaAgencia (exceto admin, que pode ver todas)
  const agenciaFiltro = filtroValor || (!isAdmin ? minhaAgencia : "");

  setStatus("Carregando...");

  try {
    let q = db.collection("empresas");
    if (agenciaFiltro) q = q.where("agenciaId", "==", agenciaFiltro);

    // orderBy('nome') + where igualdade costuma funcionar; se exigir índice, fazemos fallback:
    let snapshot;
    try {
      snapshot = await q.orderBy("nome").get();
    } catch (err) {
      console.warn("Possível índice ausente, tentando sem orderBy. Detalhe:", err);
      snapshot = await q.get();
    }

    const tbody = $('listaEmpresas');
    tbody.innerHTML = "";

    if (snapshot.empty) {
      setStatus("Nenhuma empresa encontrada para o filtro aplicado.");
      return;
    }

    // Caso tenha vindo sem orderBy, ordena no cliente por nome
    const docs = snapshot.docs.slice().sort((a,b) => {
      const na = (a.data().nome || "").toLowerCase();
      const nb = (b.data().nome || "").toLowerCase();
      return na.localeCompare(nb);
    });

    docs.forEach((doc) => {
      const e = doc.data() || {};
      const agLabel = e.agenciaId ? `${e.agenciaId} - ${agenciasMap[e.agenciaId] || ""}` : "-";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${e.nome || "-"}</td>
        <td>${e.cidade || "-"}</td>
        <td>${e.estado || "-"}</td>
        <td>${agLabel}</td>
        <td>${e.rm || "-"}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm" onclick="editarEmpresa('${doc.id}')">Editar</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    setStatus(`${docs.length} empresa(s) listada(s).`);
  } catch (e) {
    console.error("Erro ao carregar empresas:", e);
    setStatus("Erro ao carregar empresas. Verifique o console.");
  }
}

/* Ações da tabela */
async function editarEmpresa(id) {
  try {
    const snap = await db.collection("empresas").doc(id).get();
    if (!snap.exists) return;

    const e = snap.data() || {};

    $('empresaIdEditando').value = id;
    $('nome').value      = e.nome || "";
    $('cnpj').value      = e.cnpj || "";
    $('cidade').value    = e.cidade || "";
    $('estado').value    = e.estado || "";
    $('agenciaId').value = e.agenciaId || "";

    await carregarRMs();
    $('rm').value        = e.rm || "";

    $('tituloFormulario').textContent = "Editar Empresa";
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    console.error("Erro ao editar:", e);
  }
}

/* Helpers UI */
function limparFormulario() {
  $('empresaIdEditando').value = "";
  $('nome').value   = "";
  $('cnpj').value   = "";
  $('cidade').value = "";
  $('estado').value = "";
  $('agenciaId').value = minhaAgencia || "";
  $('rm').value     = "";
  $('tituloFormulario').textContent = "Cadastrar Nova Empresa";
}

function limparFiltro() {
  const sel = $('filtroAgencia');
  if (!isAdmin && minhaAgencia) {
    sel.value = minhaAgencia;
  } else {
    sel.value = "";
  }
  carregarEmpresas();
}

function onFiltroAgenciaChange() {
  carregarEmpresas();
}

/* Expondo funções usadas no HTML */
window.onAgenciaChangeForm = onAgenciaChangeForm;
window.salvarEmpresa       = salvarEmpresa;
window.editarEmpresa       = editarEmpresa;
window.limparFiltro        = limparFiltro;
window.onFiltroAgenciaChange = onFiltroAgenciaChange;
