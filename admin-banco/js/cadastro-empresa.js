/* Firebase */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* Estado */
let agenciasMap  = {};    // { "<id>": "Nome — Banco / Cidade - UF" }
let rmsMap       = {};    // { uid: {nome, agenciaId} }
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
  perfilAtual  = (p.perfil || "").toLowerCase();
  minhaAgencia = p.agenciaId || "";
  meuNome      = p.nome || "";

  // Assistente NÃO acessa cadastro de empresas (visual); segurança real fica nas Rules
  if (perfilAtual === "assistente" && !isAdmin) {
    alert("Seu perfil não tem acesso à página de cadastro de empresas.");
    return (window.location.href = "painel.html");
  }

  await carregarAgencias();
  await carregarRMsFormulario();     // RMs para o formulário (da agência escolhida)
  await prepararFiltrosRM();         // RMs para filtro (gerente-chefe/admin)

  // Regras de filtro por agência na LISTA:
  const filtroSel = $('filtroAgencia');
  if (!isAdmin && minhaAgencia) {
    filtroSel.value = minhaAgencia;
    filtroSel.disabled = true;
  }

  // Mostrar filtro por RM para gerente_chefe e admin
  if (perfilAtual === "gerente_chefe" || perfilAtual === "gerente chefe" || isAdmin) {
    $('boxFiltroRm')?.style?.setProperty("display","block");
  } else {
    $('boxFiltroRm')?.style?.setProperty("display","none");
  }

  // Travar campos do FORM para RM (ele só cria/edita o que é dele e na sua agência)
  if (!isAdmin && perfilAtual === "rm") {
    if ($('agenciaId')) {
      $('agenciaId').value = minhaAgencia || "";
      $('agenciaId').disabled = true;
    }
    if ($('rmUid')) {
      $('rmUid').innerHTML = `<option value="${meuUid}">${meuNome || "Eu"}</option>`;
      $('rmUid').disabled = true;
    }
  }

  instalarOrdenacaoCabecalhos();
  await carregarEmpresas();
});

/* ---------- Agências (SEM UID visível) ---------- */
async function carregarAgencias() {
  agenciasMap = {};
  const selForm   = $('agenciaId');
  const selFiltro = $('filtroAgencia');

  if (selForm)   selForm.innerHTML   = '<option value="">Selecione uma agência</option>';
  if (selFiltro) selFiltro.innerHTML = '<option value="">Minha agência</option>';

  let snap;
  try {
    // tenta ordenar por nome; se houver docs sem “nome”, faz fallback
    snap = await db.collection("agencias_banco").orderBy("nome").get();
    if (snap.empty) snap = await db.collection("agencias_banco").get();
  } catch {
    snap = await db.collection("agencias_banco").get();
  }

  snap.forEach((doc) => {
    const ag = doc.data() || {};
    const id = doc.id;

    const nome   = (ag.nome || "(Sem nome)").toString();
    const banco  = ag.banco ? ` — ${ag.banco}` : "";
    const cidade = (ag.Cidade || ag.cidade || "").toString();
    const cidadeFmt = cidade ? ` / ${cidade}` : "";
    const uf = (ag.estado || ag.UF || "").toString().toUpperCase();
    const ufFmt = uf ? ` - ${uf}` : "";

    // 🔹 Rótulo amigável SEM UID
    const label = `${nome}${banco}${cidadeFmt}${ufFmt}`;

    // guarda no cache para listagem/tabela
    agenciasMap[id] = label;

    // options: value = id (para salvar), text = label (sem UID)
    if (selForm) {
      const opt1 = document.createElement("option");
      opt1.value = id;
      opt1.textContent = label;
      selForm.appendChild(opt1);
    }
    if (selFiltro) {
      const opt2 = document.createElement("option");
      opt2.value = id;
      opt2.textContent = label;
      selFiltro.appendChild(opt2);
    }
  });

  // default no formulário
  if (selForm && minhaAgencia && selForm.querySelector(`option[value="${minhaAgencia}"]`)) {
    selForm.value = minhaAgencia;
  }
}

/* RMs para o FORMULÁRIO (value = rmUid) */
async function carregarRMsFormulario() {
  const selectRM = $('rmUid');
  if (!selectRM) return;

  // Se RM (não admin), já travamos no onAuthStateChanged — aqui só refaz se admin/chefe
  if (!isAdmin && perfilAtual === "rm") return;

  selectRM.innerHTML = '<option value="">Selecione um RM</option>';

  const agenciaEscolhida = $('agenciaId')?.value || minhaAgencia;
  let q = db.collection("usuarios_banco").where("perfil", "==", "rm");
  if (agenciaEscolhida) q = q.where("agenciaId", "==", agenciaEscolhida);

  const snapshot = await q.get();
  snapshot.forEach((doc) => {
    const u = doc.data() || {};
    rmsMap[doc.id] = { nome: u.nome || "(sem nome)", agenciaId: u.agenciaId || "" };

    const opt = document.createElement("option");
    opt.value = doc.id; // rmUid
    // mostra rótulo da agência se existir no cache
    const agRot = agenciasMap[u.agenciaId] ? ` (${agenciasMap[u.agenciaId]})` : "";
    opt.textContent = `${u.nome}${agRot}`;
    selectRM.appendChild(opt);
  });
}

/* RMs para o FILTRO (gerente chefe/admin) */
async function prepararFiltrosRM() {
  const box = $('boxFiltroRm');
  if (!box) return;
  if (!((perfilAtual === "gerente_chefe" || perfilAtual === "gerente chefe") || isAdmin)) return;
  await carregarRMsFiltro();
}

/* Carrega o combo de filtro de RM conforme agência do filtro */
async function carregarRMsFiltro() {
  const filtroRm = $('filtroRm');
  const agencia = $('filtroAgencia')?.value || minhaAgencia;
  if (!filtroRm) return;

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
  if ((perfilAtual === "gerente_chefe" || perfilAtual === "gerente chefe") || isAdmin) {
    await carregarRMsFiltro();
  }
  carregarEmpresas();
}

/* Salvar empresa (grava rmUid e rmNome; força escopo por perfil) */
async function salvarEmpresa() {
  const nome      = $('nome').value.trim();
  const cnpj      = $('cnpj').value.trim();
  const cidade    = $('cidade').value.trim();
  const estado    = $('estado').value.trim();
  let   agenciaId = $('agenciaId').value.trim();
  let   rmUid     = $('rmUid').value;
  const empresaId = $('empresaIdEditando').value;

  if (!nome || !cidade || !estado) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  if (!isAdmin && perfilAtual === "rm") {
    agenciaId = minhaAgencia || "";
    rmUid     = meuUid;
  }
  if (!isAdmin && (perfilAtual === "gerente_chefe" || perfilAtual === "gerente chefe")) {
    if (agenciaId && minhaAgencia && agenciaId !== minhaAgencia) {
      alert("Gerente Chefe só pode criar/editar empresas da própria agência.");
      return;
    }
  }

  if (!agenciaId || !rmUid) {
    alert("Selecione agência e RM.");
    return;
  }

  const rmNome = (rmsMap[rmUid]?.nome) || (rmUid === meuUid ? (meuNome || "") : "");

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
  const filtroAg = isAdmin ? ($('filtroAgencia')?.value || "") : (minhaAgencia || "");
  const filtroRm = ((perfilAtual === "gerente_chefe" || perfilAtual === "gerente chefe") || isAdmin) ? ($('filtroRm')?.value || "") : "";

  setStatus("Carregando...");

  try {
    let q = db.collection("empresas");

    if (filtroAg) q = q.where("agenciaId", "==", filtroAg);

    if (!isAdmin && perfilAtual === "rm") {
      q = q.where("rmUid", "==", meuUid);
    }

    if (((perfilAtual === "gerente_chefe" || perfilAtual === "gerente chefe") || isAdmin) && filtroRm) {
      q = q.where("rmUid", "==", filtroRm);
    }

    let snapshot;
    try {
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
        // 🔹 usa rótulo amigável SEM UID
        agencia: e.agenciaId ? (agenciasMap[e.agenciaId] || "") : "-",
        agenciaSort: e.agenciaId || "",
        rmUid: e.rmUid || "",
        rmNome: e.rmNome || "-"
      });
    });

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
  if (!tbody) return;
  tbody.innerHTML = "";
  items.forEach(e=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.nome}</td>
      <td>${e.cidade}</td>
      <td>${e.estado}</td>
      <td>${e.agencia}</td>
      <td>${e.rmNome}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-sm" onclick="editarEmpresa('${e.id}')">Editar</button>
        </div>
      </td>
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

  if (!isAdmin && perfilAtual === "rm") {
    $('agenciaId').value = minhaAgencia || "";
    $('agenciaId').disabled = true;
    $('rmUid').innerHTML = `<option value="${meuUid}">${meuNome || "Eu"}</option>`;
    $('rmUid').disabled = true;
  }

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
  if ($('agenciaId')) $('agenciaId').value = minhaAgencia || "";
  if ($('rmUid')) $('rmUid').value  = "";
  $('tituloFormulario').textContent = "Cadastrar Nova Empresa";
}
function limparFiltro() {
  const selAg = $('filtroAgencia');
  const selRm = $('filtroRm');
  if (!isAdmin && minhaAgencia) {
    selAg.value = minhaAgencia;
  } else if (selAg) {
    selAg.value = "";
  }
  if (selRm) selRm.value = "";
  carregarEmpresas();
}

/* Expor para HTML */
window.onAgenciaChangeForm   = onAgenciaChangeForm;
window.onFiltroAgenciaChange = onFiltroAgenciaChange;
window.salvarEmpresa         = salvarEmpresa;
window.editarEmpresa         = editarEmpresa;
window.limparFiltro          = limparFiltro;
