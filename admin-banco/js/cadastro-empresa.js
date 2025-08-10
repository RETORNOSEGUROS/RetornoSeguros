/* Firebase */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* Estado */
let agenciasMap  = {};    // { "3495": "Corporate One", ... }
let rmsMap       = {};    // { uid: {nome, agenciaId} } cache p/ nome do RM
let perfilAtual  = null;
let minhaAgencia = null;
let meuUid       = null;
let meuNome      = null;
let isAdmin      = false;

/* Ordenação */
let sortKey = "nome";     // nome | cidade | estado | agencia | rmNome
let sortDir = "asc";      // asc | desc

/* Helpers DOM */
const $ = (id) => document.getElementById(id);
const setStatus = (msg) => { const el=$('statusLista'); if(el) el.textContent = msg || ''; };

/* Auth */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    alert("Faça login para continuar.");
    return (window.location.href = "login.html");
  }
  meuUid = user.uid;

  // Admin por e‑mail
  isAdmin = (user.email === "patrick@retornoseguros.com.br");

  // Perfil do usuário
  const snap = await db.collection("usuarios_banco").doc(user.uid).get();
  const p = snap.exists ? (snap.data()||{}) : {};
  perfilAtual  = p.perfil || "";
  minhaAgencia = p.agenciaId || "";
  meuNome      = p.nome || "";

  await carregarAgencias();
  await carregarRMsFormulario();     // RMs para o formulário (da agência escolhida)
  await prepararFiltrosRM();         // RMs para filtro (gerente chefe/admin)

  // Regras de filtro por agência:
  const filtroSel = $('filtroAgencia');
  if (!isAdmin && minhaAgencia) {
    filtroSel.value = minhaAgencia;
    filtroSel.disabled = true;
  }

  // Mostrar filtro por RM para gerente_chefe e admin
  if (perfilAtual === "gerente_chefe" || isAdmin) {
    $('boxFiltroRm').style.display = "block";
  }

  instalarOrdenacaoCabecalhos();
  await carregarEmpresas();
});

/* Carrega agências para formulário e filtro */
async function carregarAgencias() {
  agenciasMap = {};
  const selForm   = $('agenciaId');
  const selFiltro = $('filtroAgencia');

  selForm.innerHTML   = '<option value="">Selecione uma agência</option>';
  selFiltro.innerHTML = '<option value="">Minha agência</option>';

  const snap = await db.collection("agencias_banco")
                       .orderBy(firebase.firestore.FieldPath.documentId())
                       .get();

  snap.forEach((doc) => {
    const ag = doc.data() || {};
    const id = doc.id;
    agenciasMap[id] = ag.nome || id;

    const opt1 = document.createElement("option");
    opt1.value = id;
    opt1.textContent = `${id} - ( ${agenciasMap[id]} )`;
    selForm.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = id;
    opt2.textContent = `${id} - ( ${agenciasMap[id]} )`;
    selFiltro.appendChild(opt2);
  });

  // default no formulário
  if (minhaAgencia && selForm.querySelector(`option[value="${minhaAgencia}"]`)) {
    selForm.value = minhaAgencia;
  }
}

/* RMs para o FORMULÁRIO (value = rmUid) */
async function carregarRMsFormulario() {
  const selectRM = $('rmUid');
  if (!selectRM) return;
  selectRM.innerHTML = '<option value="">Selecione um RM</option>';

  const agenciaEscolhida = $('agenciaId').value || minhaAgencia;
  let q = db.collection("usuarios_banco").where("perfil", "==", "rm");
  if (agenciaEscolhida) q = q.where("agenciaId", "==", agenciaEscolhida);

  const snapshot = await q.get();
  snapshot.forEach((doc) => {
    const u = doc.data() || {};
    rmsMap[doc.id] = { nome: u.nome || "(sem nome)", agenciaId: u.agenciaId || "" };

    const opt = document.createElement("option");
    opt.value = doc.id; // rmUid
    opt.textContent = `${u.nome} (${u.agenciaId || "-"})`;
    selectRM.appendChild(opt);
  });
}

/* RMs para o FILTRO (gerente chefe/admin) */
async function prepararFiltrosRM() {
  const box = $('boxFiltroRm');
  if (!box) return;

  // só popula se o box estiver visível
  if (!(perfilAtual === "gerente_chefe" || isAdmin)) return;

  await carregarRMsFiltro();
}

/* Carrega o combo de filtro de RM conforme agência do filtro */
async function carregarRMsFiltro() {
  const filtroRm = $('filtroRm');
  const agencia = $('filtroAgencia').value || minhaAgencia;

  filtroRm.innerHTML = '<option value="">Todos os RMs</option>';

  let q = db.collection("usuarios_banco").where("perfil", "==", "rm");
  if (agencia) q = q.where("agenciaId", "==", agencia);

  const snap = await q.get();
  snap.forEach((doc) => {
    const u = doc.data() || {};
    rmsMap[doc.id] = { nome: u.nome || "(sem nome)", agenciaId: u.agenciaId || "" };
    const opt = document.createElement("option");
    opt.value = doc.id; // uid
    opt.textContent = u.nome || "(sem nome)";
    filtroRm.appendChild(opt);
  });
}

/* onChange do select de Agência (FORM) */
function onAgenciaChangeForm() {
  carregarRMsFormulario();
}

/* onChange do filtro de Agência (LISTA) */
async function onFiltroAgenciaChange() {
  if (perfilAtual === "gerente_chefe" || isAdmin) {
    // quando troca agência no filtro, recarrega lista de RMs do filtro
    await carregarRMsFiltro();
  }
  carregarEmpresas();
}

/* Salvar empresa (agora grava rmUid e rmNome) */
async function salvarEmpresa() {
  const nome      = $('nome').value.trim();
  const cnpj      = $('cnpj').value.trim();
  const cidade    = $('cidade').value.trim();
  const estado    = $('estado').value.trim();
  const agenciaId = $('agenciaId').value.trim();
  const rmUid     = $('rmUid').value;
  const empresaId = $('empresaIdEditando').value;

  if (!nome || !cidade || !estado || !agenciaId || !rmUid) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  const rmNome = (rmsMap[rmUid]?.nome) || ""; // redundância útil para listagem/ordenação

  const dados = { nome, cnpj, cidade, estado, agenciaId, rmUid, rmNome };

  try {
    if (empresaId) {
      await db.collection("empresas").doc(empresaId).update(dados);
      alert("Empresa atualizada com sucesso.");
    } else {
      const user = auth.currentUser;
      if (!user) return alert("Usuário não autenticado.");
      dados.criadoEm     = firebase.firestore.Timestamp.now();
      dados.criadoPorUid = user.uid;
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

/* Carregar empresas com regras de visibilidade + filtros + ordenação */
async function carregarEmpresas() {
  const filtroAg = isAdmin ? ($('filtroAgencia').value || "") : (minhaAgencia || "");
  const filtroRm = (perfilAtual === "gerente_chefe" || isAdmin) ? ($('filtroRm').value || "") : "";

  setStatus("Carregando...");

  try {
    let q = db.collection("empresas");

    // Escopo por agência (RM/Assistente/GerenteChefe ficam restritos; admin opcional)
    if (filtroAg) q = q.where("agenciaId", "==", filtroAg);

    // RM vê somente as suas empresas
    if (!isAdmin && perfilAtual === "rm") {
      q = q.where("rmUid", "==", meuUid);
    }

    // Gerente Chefe (ou Admin) pode filtrar por RM específico
    if ((perfilAtual === "gerente_chefe" || isAdmin) && filtroRm) {
      q = q.where("rmUid", "==", filtroRm);
    }

    let snapshot;
    try {
      // orderBy('nome') serve para a maioria; se faltar índice, caímos no fallback
      snapshot = await q.orderBy("nome").get();
    } catch (err) {
      console.warn("Possível índice ausente; buscando sem orderBy. Detalhe:", err);
      snapshot = await q.get();
    }

    const rows = [];
    snapshot.forEach((doc) => {
      const e = doc.data() || {};
      rows.push({
        id: doc.id,
        nome: e.nome || "-",
        cidade: e.cidade || "-",
        estado: e.estado || "-",
        agencia: e.agenciaId ? `${e.agenciaId} - ${agenciasMap[e.agenciaId] || ""}` : "-",
        agenciaSort: e.agenciaId || "",
        rmUid: e.rmUid || "",
        rmNome: e.rmNome || "-"
      });
    });

    // Ordenação client-side
    ordenarRows(rows);

    renderTabela(rows);
    setStatus(`${rows.length} empresa(s) listada(s).`);
  } catch (e) {
    console.error("Erro ao carregar empresas:", e);
    setStatus("Erro ao carregar empresas. Verifique o console.");
  }
}

/* Ordenação */
function instalarOrdenacaoCabecalhos() {
  document.querySelectorAll("th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-sort");
      if (sortKey === key) {
        sortDir = (sortDir === "asc" ? "desc" : "asc");
      } else {
        sortKey = key;
        sortDir = "asc";
      }
      atualizarSetas();
      carregarEmpresas();
    });
  });
  atualizarSetas();
}
function atualizarSetas() {
  ["nome","cidade","estado","agencia","rmNome"].forEach(k=>{
    const el = document.getElementById("arrow-"+k);
    if (!el) return;
    el.textContent = (sortKey===k ? (sortDir==="asc"?"↑":"↓") : "↕");
  });
}
function ordenarRows(rows){
  const key = sortKey;
  const dir = sortDir === "asc" ? 1 : -1;
  rows.sort((a,b)=>{
    const va = (a[key] || "").toString().toLowerCase();
    const vb = (b[key] || "").toString().toLowerCase();
    if (va < vb) return -1*dir;
    if (va > vb) return  1*dir;
    return 0;
  });
}

/* Render */
function renderTabela(items){
  const tbody = $('listaEmpresas');
  tbody.innerHTML = "";
  items.forEach(e=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.nome}</td>
      <td>${e.cidade}</td>
      <td>${e.estado}</td>
      <td>${e.agencia}</td>
      <td>${e.rmNome}</td>
      <td><div class="row-actions"><button class="btn btn-sm" onclick="editarEmpresa('${e.id}')">Editar</button></div></td>
    `;
    tbody.appendChild(tr);
  });
}

/* Editar */
async function editarEmpresa(id) {
  const snap = await db.collection("empresas").doc(id).get();
  if (!snap.exists) return;
  const e = snap.data() || {};

  $('empresaIdEditando').value = id;
  $('nome').value   = e.nome   || "";
  $('cnpj').value   = e.cnpj   || "";
  $('cidade').value = e.cidade || "";
  $('estado').value = e.estado || "";

  $('agenciaId').value = e.agenciaId || "";
  await carregarRMsFormulario();
  $('rmUid').value = e.rmUid || "";

  $('tituloFormulario').textContent = "Editar Empresa";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* UI Helpers */
function limparFormulario() {
  $('empresaIdEditando').value = "";
  $('nome').value   = "";
  $('cnpj').value   = "";
  $('cidade').value = "";
  $('estado').value = "";
  $('agenciaId').value = minhaAgencia || "";
  $('rmUid').value  = "";
  $('tituloFormulario').textContent = "Cadastrar Nova Empresa";
}
function limparFiltro() {
  const selAg = $('filtroAgencia');
  const selRm = $('filtroRm');
  if (!isAdmin && minhaAgencia) {
    selAg.value = minhaAgencia;
  } else {
    selAg.value = "";
  }
  if (selRm) selRm.value = "";
  carregarEmpresas();
}

/* Expor para HTML */
window.onAgenciaChangeForm  = onAgenciaChangeForm;
window.onFiltroAgenciaChange= onFiltroAgenciaChange;
window.salvarEmpresa        = salvarEmpresa;
window.editarEmpresa        = editarEmpresa;
window.limparFiltro         = limparFiltro;
