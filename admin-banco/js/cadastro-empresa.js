/* Firebase */
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
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

/* Ordenação + busca */
let sortKey = "nome";     // nome | cidade | estado | agencia | rmNome
let sortDir = "asc";      // asc | desc
let buscaNomeAtual = "";  // filtro digitando
let rowsCache = [];       // cache pra filtrar sem reconsultar

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
  if (!user) {
    alert("Faça login para continuar.");
    return (window.location.href = "login.html");
  }
  meuUid  = user.uid;
  isAdmin = (user.email?.toLowerCase() === "patrick@retornoseguros.com.br"); // fallback admin por e-mail

  // Perfil do usuário
  const snap = await db.collection("usuarios_banco").doc(user.uid).get().catch(()=>null);
  const p = snap?.exists ? (snap.data()||{}) : {};
  perfilAtual  = roleNorm(p.perfil || "");
  minhaAgencia = p.agenciaId || "";
  meuNome      = p.nome || (user.email || "");

  // Sem acesso?
  if (perfilAtual === "assistente" && !isAdmin) {
    alert("Seu perfil não tem acesso à página de cadastro de empresas.");
    return (window.location.href = "painel.html");
  }

  // header
  const elPerfil = $('perfilUsuario');
  if (elPerfil) elPerfil.textContent = `${meuNome} (${p.perfil || "sem perfil"})`;

  // Menu lateral igual ao painel
  montarMenuLateral(perfilAtual);

  // Inputs: máscara CNPJ
  const cnpjEl = $('cnpj');
  cnpjEl?.addEventListener("input", ()=> cnpjEl.value = maskCNPJ(cnpjEl.value));

  // Carregamentos
  await carregarAgencias();
  await carregarRMsFormulario();
  await prepararFiltrosRM();

  // Regras de filtro por agência na LISTA
  const filtroSel = $('filtroAgencia');
  if (filtroSel) {
    if (!isAdmin && minhaAgencia) {
      filtroSel.value = minhaAgencia;
      filtroSel.disabled = true;
    }
  }

  // Mostrar filtro por RM para chefe/admin
  if (perfilAtual === "gerente chefe" || isAdmin) {
    $('boxFiltroRm')?.classList?.remove("hidden");
  }

  // Travar campos do FORM para RM
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

  // Ordenação + busca
  instalarOrdenacaoCabecalhos();
  $('buscaNome')?.addEventListener("input", (e)=>{ buscaNomeAtual = (e.target.value||"").toLowerCase(); renderTabela(rowsCache); });

  await carregarEmpresas();
});

/* ---------- Menu lateral (mesma matriz do painel) ---------- */
function montarMenuLateral(perfilBruto){
  const nav = document.getElementById("menuNav");
  if(!nav) return;
  nav.innerHTML = "";

  const perfil = roleNorm(perfilBruto);

  const ICON = {
    gerentes:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 12a3 3 0 10-6 0 3 3 0 006 0Zm6 8a6 6 0 10-12 0h12ZM4 6h16M4 10h8"/></svg>`,
    empresa:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l7-7 7 7-7 7-7-7z"/></svg>`,
    agencia:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7h18M3 12h18M3 17h18"/></svg>`,
    agenda:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 01-2 2v12z"/></svg>`,
    visitas:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 20h9M3 12l7-7 7 7"/></svg>`,
    cotacao:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 12h8M8 16h5M7 3h10l4 4v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>`,
    producao:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>`,
    dicas:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9V3m0 18v-6m-7-3h14"/></svg>`,
    ramos:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h6"/></svg>`,
    rel:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 3h18v18H3zM7 13l3 3 7-7"/></svg>`,
    venc:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    func:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 20h5V4H2v16h5m5 0v-6h4v6"/></svg>`,
    carteira:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7h18v10H3zM16 12h5"/></svg>`,
    comissoes:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 11V3h2v8h8v2h-8v8h-2v-8H3v-2z"/></svg>`,
    resgates:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 9V7a5 5 0 00-10 0v2H5v12h14V9h-2z"/></svg>`
  };

  const GRUPOS = [
    { titulo:"Cadastros", itens:[
      ["Cadastrar Gerentes","cadastro-geral.html",ICON.gerentes],
      ["Cadastrar Empresa","cadastro-empresa.html",ICON.empresa],
      ["Agências","agencias.html",ICON.agencia],
      ["Empresas","empresas.html",ICON.empresa],
      ["Funcionários","funcionarios.html",ICON.func]
    ]},
    { titulo:"Operações", itens:[
      ["Agenda Visitas","agenda-visitas.html",ICON.agenda],
      ["Visitas","visitas.html",ICON.visitas],
      ["Solicitações de Cotação","cotacoes.html",ICON.cotacao],
      ["Produção","negocios-fechados.html",ICON.producao],
      ["Dicas Produtos","dicas-produtos.html",ICON.dicas],
      ["Ramos Seguro","ramos-seguro.html",ICON.ramos]
    ]},
    { titulo:"Relatórios", itens:[
      ["Relatório Visitas","visitas-relatorio.html",ICON.rel],
      ["Vencimentos","vencimentos.html",ICON.venc],
      ["Relatórios","relatorios.html",ICON.rel]
    ]},
    { titulo:"Admin", adminOnly:true, itens:[
      ["Carteira","carteira.html",ICON.carteira],
      ["Comissões","comissoes.html",ICON.comissoes],
      ["Resgates (Admin)","resgates-admin.html",ICON.resgates]
    ]}
  ];

  const ROTAS_POR_PERFIL = {
    "admin": new Set([...GRUPOS.flatMap(g=>g.itens.map(i=>i[1]))]),
    "rm": new Set(["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html","funcionarios.html"]),
    "gerente chefe": new Set(["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html","funcionarios.html"]),
    "assistente": new Set(["agenda-visitas.html","visitas.html","cotacoes.html","consultar-dicas.html","funcionarios.html"])
  };
  const perfilKey = ["gerente chefe","gerente-chefe","gerente_chefe"].includes(perfil) ? "gerente chefe" : perfil;
  const pode = ROTAS_POR_PERFIL[perfilKey] || new Set();

  const frag = document.createDocumentFragment();

  GRUPOS.forEach(grupo=>{
    if(grupo.adminOnly && perfilKey!=="admin") return;
    const permitidos = grupo.itens.filter(([_,href])=> perfilKey==="admin" || pode.has(href));
    if(!permitidos.length) return;

    const h=document.createElement("div");
    h.className="text-xs uppercase text-slate-400 font-semibold px-2 mt-2 mb-1";
    h.textContent=grupo.titulo;
    frag.appendChild(h);

    permitidos.forEach(([label,href,icon])=>{
      const a=document.createElement("a");
      a.href=href;
      a.className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100";
      a.innerHTML=`${icon}<span>${label}</span>`;
      frag.appendChild(a);
    });
  });

  nav.appendChild(frag);
  if(window.innerWidth>=1024) nav.classList.remove("hidden");
}

/* ---------- Agências ---------- */
async function carregarAgencias() {
  agenciasMap = {};
  const selForm   = $('agenciaId');
  const selFiltro = $('filtroAgencia');

  // defaults
  if (selForm)   selForm.innerHTML   = '<option value="">Selecione uma agência</option>';
  if (selFiltro) selFiltro.innerHTML = '<option value="">Minha agência</option>';

  let snap;
  try {
    snap = await db.collection("agencias_banco").orderBy("nome").get();
    if (snap.empty) snap = await db.collection("agencias_banco").get();
  } catch {
    snap = await db.collection("agencias_banco").get();
  }

  // Se gerente-chefe/assistente: só a própria
  if (!isAdmin && (perfilAtual === "gerente chefe" || perfilAtual === "assistente")) {
    if (!minhaAgencia) return;
    const doc = await db.collection("agencias_banco").doc(minhaAgencia).get();
    const ag  = doc.exists ? (doc.data()||{}) : {};
    const nome   = (ag.nome || "(Sem nome)").toString();
    const banco  = ag.banco ? ` — ${ag.banco}` : "";
    const cidade = (ag.Cidade || ag.cidade || "").toString();
    const cidadeFmt = cidade ? ` / ${cidade}` : "";
    const uf = (ag.estado || ag.UF || "").toString().toUpperCase();
    const ufFmt = uf ? ` - ${uf}` : "";
    const label = `${nome}${banco}${cidadeFmt}${ufFmt}`;

    agenciasMap[minhaAgencia] = label;

    if (selForm)   { selForm.innerHTML   = `<option value="${minhaAgencia}" selected>${label}</option>`; selForm.disabled   = true; }
    if (selFiltro) { selFiltro.innerHTML = `<option value="${minhaAgencia}" selected>${label}</option>`; selFiltro.disabled = true; }
    return;
  }

  // Admin/RM: todas
  snap.forEach((doc) => {
    const ag = doc.data() || {};
    const id = doc.id;
    const nome   = (ag.nome || "(Sem nome)").toString();
    const banco  = ag.banco ? ` — ${ag.banco}` : "";
    const cidade = (ag.Cidade || ag.cidade || "").toString();
    const cidadeFmt = cidade ? ` / ${cidade}` : "";
    const uf = (ag.estado || ag.UF || "").toString().toUpperCase();
    const ufFmt = uf ? ` - ${uf}` : "";
    const label = `${nome}${banco}${cidadeFmt}${ufFmt}`;
    agenciasMap[id] = label;

    if (selForm) {
      const opt1 = document.createElement("option");
      opt1.value = id; opt1.textContent = label; selForm.appendChild(opt1);
    }
    if (selFiltro) {
      const opt2 = document.createElement("option");
      opt2.value = id; opt2.textContent = label; selFiltro.appendChild(opt2);
    }
  });

  if (selForm && minhaAgencia && selForm.querySelector(`option[value="${minhaAgencia}"]`)) {
    selForm.value = minhaAgencia;
  }
}

/* ===== Helpers para RMs a partir de EMPRESAS (quando não admin) ===== */
async function rmlistFromEmpresas(agenciaId){
  const set = new Map(); // rmUid -> rmNome
  let q = db.collection("empresas");
  if (agenciaId) q = q.where("agenciaId","==",agenciaId);
  const snap = await q.limit(1000).get();
  snap.forEach(d=>{
    const e = d.data()||{};
    if (e.rmUid) set.set(e.rmUid, e.rmNome || "(sem nome)");
  });
  return Array.from(set.entries()).map(([uid,nome])=>({uid,nome}));
}

/* RMs para o FORMULÁRIO */
async function carregarRMsFormulario() {
  const selectRM = $('rmUid');
  if (!selectRM) return;
  if (!isAdmin && perfilAtual === "rm") return; // já travado

  selectRM.innerHTML = '<option value="">Selecione um RM</option>';
  const agenciaEscolhida = $('agenciaId')?.value || minhaAgencia;

  if (isAdmin) {
    let q = db.collection("usuarios_banco")
              .where("perfil", "in", ["rm","RM","Rm","RM (Gerente de Conta)"]);
    if (agenciaEscolhida) q = q.where("agenciaId","==",agenciaEscolhida);
    const snapshot = await q.orderBy("nome").get().catch(()=>q.get());
    snapshot.forEach((doc)=>{
      const u = doc.data()||{};
      rmsMap[doc.id] = { nome: u.nome || "(sem nome)", agenciaId: u.agenciaId || "" };
      const agRot = agenciasMap[u.agenciaId] ? ` (${agenciasMap[u.agenciaId]})` : "";
      selectRM.insertAdjacentHTML("beforeend",
        `<option value="${doc.id}">${u.nome||"(sem nome)"}${agRot}</option>`);
    });
    return;
  }

  // Gerente-chefe/Assistente (sem quebrar Rules)
  const rms = await rmlistFromEmpresas(agenciaEscolhida);
  rms.forEach(({uid,nome})=>{
    rmsMap[uid] = { nome, agenciaId: agenciaEscolhida };
    selectRM.insertAdjacentHTML("beforeend", `<option value="${uid}">${nome}</option>`);
  });
}

/* Filtro de RMs (LISTA) */
async function prepararFiltrosRM() {
  if (!(perfilAtual === "gerente chefe" || isAdmin)) return;
  await carregarRMsFiltro();
}

async function carregarRMsFiltro() {
  const filtroRm = $('filtroRm');
  if (!filtroRm) return;
  const agencia = $('filtroAgencia')?.value || minhaAgencia;
  filtroRm.innerHTML = '<option value="">Todos os RMs</option>';

  if (isAdmin) {
    let q = db.collection("usuarios_banco")
              .where("perfil", "in", ["rm","RM","Rm","RM (Gerente de Conta)"]);
    if (agencia) q = q.where("agenciaId","==",agencia);
    const snap = await q.orderBy("nome").get().catch(()=>q.get());
    snap.forEach((doc)=>{
      const u = doc.data()||{};
      filtroRm.insertAdjacentHTML("beforeend",
        `<option value="${doc.id}">${u.nome||"(sem nome)"}</option>`);
    });
    return;
  }

  const rms = await rmlistFromEmpresas(agencia);
  rms.forEach(({uid,nome})=>{
    filtroRm.insertAdjacentHTML("beforeend", `<option value="${uid}">${nome}</option>`);
  });
}

/* onChange do select de Agência (FORM) */
function onAgenciaChangeForm() { carregarRMsFormulario(); }

/* onChange do filtro de Agência (LISTA) */
async function onFiltroAgenciaChange() {
  if ((perfilAtual === "gerente chefe") || isAdmin) await carregarRMsFiltro();
  carregarEmpresas();
}

/* Salvar empresa (criar/editar) */
async function salvarEmpresa() {
  const nome      = $('nome').value.trim();
  const cnpj      = $('cnpj').value.trim();
  const cidade    = $('cidade').value.trim();
  const estado    = $('estado').value.trim();
  let   agenciaId = $('agenciaId').value.trim();
  let   rmUid     = $('rmUid').value;
  const empresaId = $('empresaIdEditando').value;

  if (!nome || !cidade || !estado) return alert("Preencha todos os campos obrigatórios.");

  if (!isAdmin && perfilAtual === "rm") {
    agenciaId = minhaAgencia || "";
    rmUid     = meuUid;
  }
  if (!isAdmin && (perfilAtual === "gerente chefe")) {
    if (agenciaId && minhaAgencia && agenciaId !== minhaAgencia) {
      alert("Gerente Chefe só pode criar/editar empresas da própria agência.");
      return;
    }
  }
  if (!agenciaId || !rmUid) return alert("Selecione agência e RM.");

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
  const filtroRm = ((perfilAtual === "gerente chefe") || isAdmin) ? ($('filtroRm')?.value || "") : "";

  setStatus("Carregando...");

  try {
    let q = db.collection("empresas");

    if (filtroAg) q = q.where("agenciaId", "==", filtroAg);
    if (!isAdmin && perfilAtual === "rm") q = q.where("rmUid", "==", meuUid);
    if (((perfilAtual === "gerente chefe") || isAdmin) && filtroRm) q = q.where("rmUid", "==", filtroRm);

    let snapshot;
    try { snapshot = await q.orderBy("nome").get(); }
    catch (err) { console.warn("Sem índice p/ orderBy(nome); buscando sem ordenação:", err?.message); snapshot = await q.get(); }

    const rows = [];
    snapshot.forEach((doc) => {
      const e = doc.data() || {};
      rows.push({
        id: doc.id,
        nome: e.nome || "-",
        cidade: e.cidade || "-",
        estado: e.estado || "-",
        agencia: e.agenciaId ? (agenciasMap[e.agenciaId] || "") : "-",
        agenciaId: e.agenciaId || "",
        agenciaSort: e.agenciaId || "",
        rmUid: e.rmUid || "",
        criadoPorUid: e.criadoPorUid || "",
        rmNome: e.rmNome || "-"
      });
    });

    rowsCache = ordenarRows(rows);
    renderTabela(rowsCache);
    setStatus(`${rows.length} empresa(s) listada(s).`);
  } catch (e) {
    console.error("Erro ao carregar empresas:", e);
    setStatus("Erro ao carregar empresas. Verifique o console.");
  }
}

/* Ordenação */
function instalarOrdenacaoCabecalhos() {
  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-sort");
      if (sortKey === key) sortDir = (sortDir === "asc" ? "desc" : "asc");
      else { sortKey = key; sortDir = "asc"; }
      atualizarSetas();
      rowsCache = ordenarRows(rowsCache);
      renderTabela(rowsCache);
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
  return [...rows].sort((a,b)=>{
    const va = (a[key] || "").toString().toLowerCase();
    const vb = (b[key] || "").toString().toLowerCase();
    if (va < vb) return -1*dir;
    if (va > vb) return  1*dir;
    return 0;
  });
}

/* Render (com busca por nome em tempo real) */
function renderTabela(items){
  const tbody = $('listaEmpresas');
  if (!tbody) return;

  const busca = (buscaNomeAtual||"").trim();
  const filtrados = !busca ? items : items.filter(e => (e.nome||"").toLowerCase().includes(busca));

  tbody.innerHTML = "";
  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-3 py-3 text-center muted">Nenhuma empresa encontrada.</td></tr>`;
    return;
  }

  filtrados.forEach(e=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="px-3 py-2">${e.nome}</td>
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

/* Excluir (com RBAC e confirmação) */
async function excluirEmpresa(id, nome, agenciaId, ownerUid, criadoPorUid){
  // Permissões:
  // - Admin: qualquer empresa
  // - Gerente Chefe: empresa da mesma agência
  // - RM: empresas onde rmUid == meuUid ou criadoPorUid == meuUid
  let pode = false;
  if (isAdmin) pode = true;
  else if (perfilAtual === "gerente chefe" && agenciaId && minhaAgencia && agenciaId === minhaAgencia) pode = true;
  else if (perfilAtual === "rm" && (ownerUid === meuUid || (criadoPorUid && criadoPorUid === meuUid))) pode = true;

  if(!pode) return alert("Você não tem permissão para excluir esta empresa.");

  const ok = confirm(`Excluir a empresa "${nome}"? Esta ação não pode ser desfeita.`);
  if(!ok) return;

  try{
    await db.collection("empresas").doc(id).delete();
    rowsCache = rowsCache.filter(r => r.id !== id);
    renderTabela(rowsCache);
  }catch(e){
    console.error("Excluir empresa:", e);
    alert(e?.message || "Erro ao excluir.");
  }
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
    if (selAg) { selAg.value = minhaAgencia; selAg.disabled = true; }
  } else if (selAg) {
    selAg.value = ""; selAg.disabled = false;
  }
  if (selRm) selRm.value = "";
  $('buscaNome').value = ""; buscaNomeAtual = "";
  carregarEmpresas();
}

/* Expor para HTML */
window.onAgenciaChangeForm   = onAgenciaChangeForm;
window.onFiltroAgenciaChange = onFiltroAgenciaChange;
window.salvarEmpresa         = salvarEmpresa;
window.editarEmpresa         = editarEmpresa;
window.excluirEmpresa        = excluirEmpresa;
window.limparFormulario      = limparFormulario;
