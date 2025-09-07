/* Firebase */
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* Estado */
let agenciasMap  = {};
let rmsMap       = {};
let perfilAtual  = null;
let minhaAgencia = null;
let meuUid       = null;
let meuNome      = null;
let isAdmin      = false;

/* Ordenação + busca */
let sortKey = "nome";           // nome | cnpj | cidade | estado | agencia | rmNome
let sortDir = "asc";
let buscaNomeAtual   = "";
let buscaCidadeAtual = "";
let rowsCache = [];

/* Helpers DOM */
const $ = (id) => document.getElementById(id);
const setStatus = (msg) => { const el=$('statusLista'); if(el) el.textContent = msg || ''; };
const roleNorm = (p) => String(p||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[-_]+/g," ").trim();

/* Máscara CNPJ */
function maskCNPJ(str){
  const d = String(str||"").replace(/\D/g,"").slice(0,14);
  return d
    .replace(/^(\d{2})(\d)/,"$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3")
    .replace(/\.(\d{3})(\d)/,".$1/$2")
    .replace(/(\d{4})(\d)/,"$1-$2");
}

/* Auth */
auth.onAuthStateChanged(async (user) => {
  if (!user) { alert("Faça login para continuar."); return (window.location.href = "login.html"); }
  meuUid  = user.uid;
  isAdmin = (user.email && user.email.toLowerCase() === "patrick@retornoseguros.com.br");

  const snap = await db.collection("usuarios_banco").doc(user.uid).get().catch(()=>null);
  const p = snap?.exists ? (snap.data()||{}) : {};
  perfilAtual  = roleNorm(p.perfil || "");
  minhaAgencia = p.agenciaId || "";
  meuNome      = p.nome || (user.email || "");

  if (perfilAtual === "assistente" && !isAdmin) { alert("Seu perfil não tem acesso."); return (window.location.href = "painel.html"); }

  const elPerfil = $('perfilUsuario'); if (elPerfil) elPerfil.textContent = `${meuNome} (${p.perfil || "sem perfil"})`;

  const cnpjEl = $('cnpj'); if (cnpjEl) cnpjEl.addEventListener("input", ()=> cnpjEl.value = maskCNPJ(cnpjEl.value));

  await carregarAgencias();
  await carregarRMsFormulario();
  await prepararFiltrosRM();

  const filtroSel = $('filtroAgencia');
  if (filtroSel && !isAdmin && minhaAgencia) { filtroSel.value = minhaAgencia; filtroSel.disabled = true; }

  if (perfilAtual === "gerente chefe" || isAdmin) $('boxFiltroRm')?.classList?.remove("hidden");

  if (!isAdmin && perfilAtual === "rm") {
    $('agenciaId').value = minhaAgencia || "";  $('agenciaId').disabled = true;
    $('rmUid').innerHTML = `<option value="${meuUid}">${meuNome || "Eu"}</option>`; $('rmUid').disabled = true;
  }

  instalarOrdenacaoCabecalhos();
  $('buscaNome')?.addEventListener("input", (e)=>{ buscaNomeAtual = (e.target.value||"").toLowerCase().trim(); renderTabela(rowsCache); });
  $('buscaCidade')?.addEventListener("input", (e)=>{ buscaCidadeAtual = (e.target.value||"").toLowerCase().trim(); renderTabela(rowsCache); });

  await carregarEmpresas();
});

/* ---------- Agências ---------- */
async function carregarAgencias() {
  agenciasMap = {};
  const selForm   = $('agenciaId');
  const selFiltro = $('filtroAgencia');

  if (selForm)   selForm.innerHTML   = '<option value="">Selecione uma agência</option>';
  if (selFiltro) selFiltro.innerHTML = '<option value="">Minha agência</option>';

  let snap;
  try { snap = await db.collection("agencias_banco").orderBy("nome").get(); if (snap.empty) snap = await db.collection("agencias_banco").get(); }
  catch { snap = await db.collection("agencias_banco").get(); }

  if (!isAdmin && (perfilAtual === "gerente chefe" || perfilAtual === "assistente")) {
    if (!minhaAgencia) return;
    const doc = await db.collection("agencias_banco").doc(minhaAgencia).get();
    const ag  = doc.exists ? (doc.data()||{}) : {};
    const nome   = (ag.nome || "(Sem nome)").toString();
    const banco  = ag.banco ? ` — ${ag.banco}` : "";
    const cidade = (ag.Cidade || ag.cidade || "").toString();
    const uf     = (ag.estado || ag.UF || "").toString().toUpperCase();
    const label  = `${nome}${banco}${cidade?` / ${cidade}`:""}${uf?` - ${uf}`:""}`;

    agenciasMap[minhaAgencia] = label;
    if (selForm)   { selForm.innerHTML   = `<option value="${minhaAgencia}" selected>${label}</option>`; selForm.disabled   = true; }
    if (selFiltro) { selFiltro.innerHTML = `<option value="${minhaAgencia}" selected>${label}</option>`; selFiltro.disabled = true; }
    return;
  }

  snap.forEach((doc) => {
    const ag = doc.data() || {};
    const id = doc.id;
    const nome   = (ag.nome || "(Sem nome)").toString();
    const banco  = ag.banco ? ` — ${ag.banco}` : "";
    const cidade = (ag.Cidade || ag.cidade || "").toString();
    const uf     = (ag.estado || ag.UF || "").toString().toUpperCase();
    const label  = `${nome}${banco}${cidade?` / ${cidade}`:""}${uf?` - ${uf}`:""}`;
    agenciasMap[id] = label;

    if (selForm)   selForm.insertAdjacentHTML("beforeend", `<option value="${id}">${label}</option>`);
    if (selFiltro) selFiltro.insertAdjacentHTML("beforeend", `<option value="${id}">${label}</option>`);
  });

  if (selForm && minhaAgencia && selForm.querySelector(`option[value="${minhaAgencia}"]`)) selForm.value = minhaAgencia;
}

/* ===== Helpers de RMs ===== */
async function rmlistFromEmpresas(agenciaId){
  const set = new Map();
  let q = db.collection("empresas");
  if (agenciaId) q = q.where("agenciaId","==",agenciaId);
  const snap = await q.limit(1000).get();
  snap.forEach(d=>{ const e=d.data()||{}; if(e.rmUid) set.set(e.rmUid, e.rmNome||"(sem nome)"); });
  return Array.from(set.entries()).map(([uid,nome])=>({uid,nome}));
}

async function carregarRMsFormulario() {
  const selectRM = $('rmUid'); if (!selectRM) return;
  if (!isAdmin && perfilAtual === "rm") return;

  selectRM.innerHTML = '<option value="">Selecione um RM</option>';
  const agenciaEscolhida = $('agenciaId')?.value || minhaAgencia;

  if (isAdmin) {
    let q = db.collection("usuarios_banco").where("perfil", "in", ["rm","RM","Rm","RM (Gerente de Conta)"]);
    if (agenciaEscolhida) q = q.where("agenciaId","==",agenciaEscolhida);
    const snapshot = await q.orderBy("nome").get().catch(()=>q.get());
    snapshot.forEach((doc)=>{
      const u = doc.data()||{};
      rmsMap[doc.id] = { nome: u.nome || "(sem nome)", agenciaId: u.agenciaId || "" };
      const agRot = agenciasMap[u.agenciaId] ? ` (${agenciasMap[u.agenciaId]})` : "";
      selectRM.insertAdjacentHTML("beforeend", `<option value="${doc.id}">${u.nome||"(sem nome)"}${agRot}</option>`);
    });
    return;
  }

  const rms = await rmlistFromEmpresas(agenciaEscolhida);
  rms.forEach(({uid,nome})=>{
    rmsMap[uid] = { nome, agenciaId: agenciaEscolhida };
    selectRM.insertAdjacentHTML("beforeend", `<option value="${uid}">${nome}</option>`);
  });
}

async function prepararFiltrosRM() {
  if (!(perfilAtual === "gerente chefe" || isAdmin)) return;
  await carregarRMsFiltro();
}
async function carregarRMsFiltro() {
  const filtroRm = $('filtroRm'); if (!filtroRm) return;
  const agencia = $('filtroAgencia')?.value || minhaAgencia;
  filtroRm.innerHTML = '<option value="">Todos os RMs</option>';

  if (isAdmin) {
    let q = db.collection("usuarios_banco").where("perfil", "in", ["rm","RM","Rm","RM (Gerente de Conta)"]);
    if (agencia) q = q.where("agenciaId","==",agencia);
    const snap = await q.orderBy("nome").get().catch(()=>q.get());
    snap.forEach((doc)=>{ const u=doc.data()||{}; filtroRm.insertAdjacentHTML("beforeend", `<option value="${doc.id}">${u.nome||"(sem nome)"}</option>`); });
    return;
  }
  const rms = await rmlistFromEmpresas(agencia);
  rms.forEach(({uid,nome})=>{ filtroRm.insertAdjacentHTML("beforeend", `<option value="${uid}">${nome}</option>`); });
}

/* onChange selects */
function onAgenciaChangeForm() { carregarRMsFormulario(); }
async function onFiltroAgenciaChange() { if ((perfilAtual === "gerente chefe") || isAdmin) await carregarRMsFiltro(); carregarEmpresas(); }

/* Salvar empresa */
async function salvarEmpresa() {
  const nome      = $('nome').value.trim();
  const cnpj      = $('cnpj').value.trim();
  const cidade    = $('cidade').value.trim();
  const estado    = $('estado').value.trim();
  let   agenciaId = $('agenciaId').value.trim();
  let   rmUid     = $('rmUid').value;
  const empresaId = $('empresaIdEditando').value;

  if (!nome || !cidade || !estado) return alert("Preencha todos os campos obrigatórios.");

  if (!isAdmin && perfilAtual === "rm") { agenciaId = minhaAgencia || ""; rmUid = meuUid; }
  if (!isAdmin && (perfilAtual === "gerente chefe") && agenciaId && minhaAgencia && agenciaId !== minhaAgencia)
    return alert("Gerente Chefe só pode criar/editar empresas da própria agência.");
  if (!agenciaId || !rmUid) return alert("Selecione agência e RM.");

  const rmNome = (rmsMap[rmUid]?.nome) || (rmUid === meuUid ? (meuNome || "") : "");
  const dados = { nome, cnpj, cidade, estado, agenciaId, rmUid, rmNome };

  try {
    if (empresaId) { await db.collection("empresas").doc(empresaId).update(dados); alert("Empresa atualizada com sucesso."); }
    else {
      const user = auth.currentUser; if (!user) return alert("Usuário não autenticado.");
      dados.criadoEm = firebase.firestore.Timestamp.now();
      dados.criadoPorUid = user.uid;
      await db.collection("empresas").add(dados);
      alert("Empresa cadastrada com sucesso.");
    }
    limparFormulario();
    await carregarEmpresas();
  } catch (e) { console.error("Erro ao salvar empresa:", e); alert("Erro ao salvar empresa."); }
}

/* Carregar empresas */
async function carregarEmpresas() {
  const filtroAg = isAdmin ? ($('filtroAgencia')?.value || "") : (minhaAgencia || "");
  const filtroRm = ((perfilAtual === "gerente chefe") || isAdmin) ? ($('filtroRm')?.value || "") : "";

  setStatus("Carregando...");
  try {
    let q = db.collection("empresas");
    if (filtroAg) q = q.where("agenciaId","==",filtroAg);
    if (!isAdmin && perfilAtual === "rm") q = q.where("rmUid","==",meuUid);
    if (((perfilAtual === "gerente chefe") || isAdmin) && filtroRm) q = q.where("rmUid","==",filtroRm);

    let snapshot;
    try { snapshot = await q.orderBy("nome").get(); }
    catch { snapshot = await q.get(); }

    const rows = [];
    snapshot.forEach((doc)=>{
      const e = doc.data()||{};
      rows.push({
        id: doc.id,
        nome: e.nome || "-",
        cnpj: e.cnpj || "-",
        cidade: e.cidade || "-",
        estado: e.estado || "-",
        agencia: e.agenciaId ? (agenciasMap[e.agenciaId] || "") : "-",
        agenciaId: e.agenciaId || "",
        rmUid: e.rmUid || "",
        criadoPorUid: e.criadoPorUid || "",
        rmNome: e.rmNome || "-"
      });
    });

    rowsCache = ordenarRows(rows);
    renderTabela(rowsCache);
    setStatus(`${rows.length} empresa(s) listada(s).`);
  } catch (e) { console.error("Erro ao carregar empresas:", e); setStatus("Erro ao carregar empresas."); }
}

/* Ordenação */
function instalarOrdenacaoCabecalhos() {
  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-sort");
      if (sortKey === key) sortDir = (sortDir === "asc" ? "desc" : "asc");
      else { sortKey = key; sortDir = "asc"; }
      atualizarSetas(); rowsCache = ordenarRows(rowsCache); renderTabela(rowsCache);
    });
  });
  atualizarSetas();
}
function atualizarSetas() {
  ["nome","cnpj","cidade","estado","agencia","rmNome"].forEach(k=>{
    const el = document.getElementById("arrow-"+k);
    if (!el) return;
    el.textContent = (sortKey===k ? (sortDir==="asc"?"↑":"↓") : "↕");
  });
}
function ordenarRows(rows){
  const key = sortKey, dir = (sortDir==="asc"?1:-1);
  return [...rows].sort((a,b)=>{
    const va = (a[key]||"").toString().toLowerCase();
    const vb = (b[key]||"").toString().toLowerCase();
    if (va<vb) return -1*dir; if (va>vb) return 1*dir; return 0;
  });
}

/* Render com filtro nome + cidade */
function renderTabela(items){
  const tbody = $('listaEmpresas'); if (!tbody) return;

  const bn = (buscaNomeAtual||"").trim();
  const bc = (buscaCidadeAtual||"").trim();

  const filtrados = items.filter(e=>{
    const okNome   = !bn || (e.nome||"").toLowerCase().includes(bn);
    const okCidade = !bc || (e.cidade||"").toLowerCase().includes(bc);
    return okNome && okCidade;
  });

  tbody.innerHTML = "";
  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-3 py-3 text-center muted">Nenhuma empresa encontrada.</td></tr>`;
    return;
  }

  filtrados.forEach(e=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2">${e.nome}</td>
      <td class="px-3 py-2 text-xs">${e.cnpj}</td>
      <td class="px-3 py-2">${e.cidade}</td>
      <td class="px-3 py-2">${e.estado}</td>
      <td class="px-3 py-2">${e.agencia}</td>
      <td class="px-3 py-2">${e.rmNome}</td>
      <td class="px-3 py-2">
        <div class="flex items-center gap-2">
          <button class="btn btn-outline btn-sm" onclick="editarEmpresa('${e.id}')">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="excluirEmpresa('${e.id}', '${e.nome.replace(/'/g,"\\'")}', '${e.agenciaId}', '${e.rmUid}', '${e.criadoPorUid||""}')">Excluir</button>
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

/* Excluir (RBAC) */
async function excluirEmpresa(id, nome, agenciaId, ownerUid, criadoPorUid){
  let pode = false;
  if (isAdmin) pode = true;
  else if (perfilAtual === "gerente chefe" && agenciaId && minhaAgencia && agenciaId === minhaAgencia) pode = true;
  else if (perfilAtual === "rm" && (ownerUid === meuUid || (criadoPorUid && criadoPorUid === meuUid))) pode = true;

  if(!pode) return alert("Você não tem permissão para excluir esta empresa.");

  if(!confirm(`Excluir a empresa "${nome}"? Esta ação não pode ser desfeita.`)) return;

  try{ await db.collection("empresas").doc(id).delete(); rowsCache = rowsCache.filter(r => r.id !== id); renderTabela(rowsCache); }
  catch(e){ console.error("Excluir empresa:", e); alert(e?.message || "Erro ao excluir."); }
}

/* UI Helpers */
function limparFormulario() {
  $('empresaIdEditando').value = "";
  $('nome').value = $('cnpj').value = $('cidade').value = $('estado').value = "";
  if ($('agenciaId')) $('agenciaId').value = minhaAgencia || "";
  if ($('rmUid')) $('rmUid').value  = "";
  $('tituloFormulario').textContent = "Cadastrar Nova Empresa";
}

/* ------- PDF (com fallback) ------- */
function gerarPDF(){
  const wrapperTabela = document.getElementById("tabela-wrapper");
  if (!wrapperTabela) return alert("Tabela não encontrada para gerar o PDF.");

  const linhas = wrapperTabela.querySelectorAll("tbody tr");
  if (!linhas.length || (linhas.length===1 && linhas[0].innerText.includes("Nenhuma empresa encontrada")))
    return alert("Sem dados na listagem para gerar o PDF.");

  const run = ()=>{
    const container = document.createElement("div");
    container.style.padding = "16px";
    container.innerHTML = `
      <div style="font-family: Inter, Arial; margin-bottom: 12px;">
        <div style="font-size:18px; font-weight:700; color:#1b2c5c;">Relatório de Empresas</div>
        <div style="font-size:12px; color:#334155;">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
      </div>
    `;
    container.appendChild(wrapperTabela.cloneNode(true));

    const opt = {
      margin: 10,
      filename: `empresas_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    window.html2pdf().from(container).set(opt).save();
  };

  if (typeof window.html2pdf === "undefined") {
    if (typeof window.__ensureHtml2Pdf === "function") {
      window.__ensureHtml2Pdf(run);
    } else {
      alert("Não foi possível carregar a biblioteca de PDF. Recarregue a página (Ctrl+F5).");
    }
    return;
  }
  run();
}

/* Expor */
window.onAgenciaChangeForm   = onAgenciaChangeForm;
window.onFiltroAgenciaChange = onFiltroAgenciaChange;
window.salvarEmpresa         = salvarEmpresa;
window.editarEmpresa         = editarEmpresa;
window.excluirEmpresa        = excluirEmpresa;
window.limparFormulario      = limparFormulario;
window.gerarPDF              = gerarPDF;
