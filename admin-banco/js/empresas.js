// js/empresas.js — Empresas com layout moderno + menu + busca + máscara + excluir

// ==== Firebase base ====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// ==== Contexto/Estado ====
let CTX = { uid:null, email:null, perfil:"", agenciaId:null, nome:null, isAdmin:false };
let produtos = [];
let nomesProdutos = {};
let empresasCache = [];  // tudo no escopo
let filtroRMAtual = "";
let buscaNomeAtual = "";

// ==== Utils ====
const normalize = (s) =>
  (s || "").toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim();

const normalizarPerfil = (p)=>String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[-_]+/g," ").trim();

function fmtCNPJ(v){
  const d = String(v||"").replace(/\D/g,"").slice(0,14);
  const p = d.replace(/^(\d{2})(\d)/,"$1.$2")
             .replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3")
             .replace(/\.(\d{3})(\d)/,".$1/$2")
             .replace(/(\d{4})(\d)/,"$1-$2");
  return p;
}

function classFromStatus(statusRaw) {
  const s = normalize(statusRaw);
  if (["negocio emitido"].includes(s)) return "verde";
  if ([
    "pendente agencia","pendente corretor","pendente seguradora","pendente cliente",
    "proposta enviada","proposta reenviada","cotacao iniciada","pedido de cotacao"
  ].includes(s)) return "amarelo";
  if (["recusado cliente","recusado seguradora","emitido declinado","negocio emitido declinado"].includes(s)) return "vermelho";
  if (["negocio fechado","em emissao"].includes(s)) return "azul";
  return "nenhum";
}

function erroUI(msg){
  const cont = document.getElementById("tabelaEmpresas");
  if (cont) cont.innerHTML = `<div class="p-4 muted">${msg}</div>`;
}

// ==== Menu lateral (mesma lógica do painel) ====
function montarMenuLateral(perfilBruto){
  const nav = document.getElementById("menuNav");
  if(!nav) return;
  nav.innerHTML = "";

  const perfil = normalizarPerfil(perfilBruto);

  const ICON = {
    gerentes:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 12a3 3 0 10-6 0 3 3 0 006 0Zm6 8a6 6 0 10-12 0h12ZM4 6h16M4 10h8"/></svg>`,
    empresa:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l7-7 7 7-7 7-7-7z"/></svg>`,
    agencia:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7h18M3 12h18M3 17h18"/></svg>`,
    agenda:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2 2v12z"/></svg>`,
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

// ==== Auth + contexto ====
auth.onAuthStateChanged(async (user) => {
  if (!user) return (window.location.href = "login.html");
  CTX.uid   = user.uid;
  CTX.email = user.email || "";

  try {
    const up = await db.collection("usuarios_banco").doc(user.uid).get();
    if (up.exists) {
      const d = up.data()||{};
      CTX.perfil    = normalizarPerfil(d.perfil||d.roleId||"");
      CTX.agenciaId = d.agenciaId || d.agenciaid || null;
      CTX.nome      = d.nome || user.email || "-";
    }
  } catch(e){
    console.warn("usuarios_banco erro:", e?.message);
  }

  CTX.isAdmin = (CTX.perfil === "admin") || (CTX.email.toLowerCase() === "patrick@retornoseguros.com.br");

  const elPerfil = document.getElementById("perfilUsuario");
  if (elPerfil) elPerfil.textContent = `${CTX.nome||CTX.email} (${CTX.perfil||"sem perfil"})`;

  // Menu
  montarMenuLateral(CTX.perfil);

  // Se for RM, some com o select de RM
  if (CTX.perfil === "rm" && !CTX.isAdmin) {
    const sel = document.getElementById("filtroRM");
    if (sel) sel.style.display = "none";
  }

  // Boot
  try {
    await carregarProdutos();
    await carregarRM();
    await carregarEmpresas(); // popula empresasCache e tabela
    ligarFiltros();
    ligarMascaraCNPJ();
  } catch (e) {
    console.error("[empresas] boot:", e);
    erroUI("Erro ao carregar dados.");
  }
});

// ==== Produtos (colunas) ====
async function carregarProdutos() {
  let snap;
  try { snap = await db.collection("ramos-seguro").orderBy("ordem").get(); }
  catch { snap = await db.collection("ramos-seguro").get(); }
  produtos = []; nomesProdutos = {};
  snap.forEach(doc => {
    const id   = doc.id;
    const nome = doc.data().nomeExibicao || id;
    produtos.push(id);
    nomesProdutos[id] = nome;
  });
}

// ==== Combo RM ====
async function carregarRM() {
  const select = document.getElementById("filtroRM");
  if (!select) return;
  if (!CTX.isAdmin && CTX.perfil === "rm") return;

  select.innerHTML = `<option value="">Todos</option>`;

  let q = db.collection("empresas");
  if (!CTX.isAdmin) {
    if (CTX.perfil === "gerente chefe" && CTX.agenciaId) {
      q = q.where("agenciaId","==",CTX.agenciaId);
    }
  }
  try {
    const snapshot = await q.get();
    const rms = new Set();
    snapshot.forEach(doc => {
      const e = doc.data() || {};
      const nome = e.rmNome || e.rm;
      if (nome) rms.add(nome);
    });
    Array.from(rms)
      .sort((a,b)=>(a||"").localeCompare(b||"","pt-BR"))
      .forEach(nome => {
        const opt = document.createElement("option");
        opt.value = nome;
        opt.textContent = nome;
        select.appendChild(opt);
      });
  } catch (e) {
    console.warn("[empresas] carregarRM:", e);
  }
}

// ==== Buscar cotações por empresa (RBAC) ====
async function buscarCotacoesParaEmpresa(empresaId) {
  if (CTX.isAdmin || CTX.perfil === "gerente chefe") {
    try { return (await db.collection("cotacoes-gerentes").where("empresaId","==",empresaId).get()).docs; }
    catch(e){ console.warn("[empresas] cotacoes empresaId:", e); return []; }
  }
  if (CTX.perfil === "rm") {
    const buckets = [];
    try { buckets.push(await db.collection("cotacoes-gerentes").where("rmUid","==",CTX.uid).get()); } catch(e){}
    try { buckets.push(await db.collection("cotacoes-gerentes").where("rmId","==",CTX.uid).get()); } catch(e){}
    try { buckets.push(await db.collection("cotacoes-gerentes").where("usuarioId","==",CTX.uid).get()); } catch(e){}
    try { buckets.push(await db.collection("cotacoes-gerentes").where("gerenteId","==",CTX.uid).get()); } catch(e){}
    const map = new Map();
    buckets.forEach(s => s?.docs?.forEach(d => map.set(d.id, d)));
    return Array.from(map.values()).filter(d => (d.data()||{}).empresaId === empresaId);
  }
  return [];
}

// ==== Carregar Empresas (respeita RBAC) ====
async function carregarEmpresas() {
  const filtroRMNome = document.getElementById("filtroRM")?.value || "";

  try {
    let docs = [];

    if (CTX.isAdmin) {
      docs = (await db.collection("empresas").get()).docs;
    } else if (CTX.perfil === "gerente chefe" && CTX.agenciaId) {
      docs = (await db.collection("empresas").where("agenciaId","==",CTX.agenciaId).get()).docs;
    } else if (CTX.perfil === "rm") {
      const buckets = [];
      try { buckets.push(await db.collection("empresas").where("rmUid","==",CTX.uid).get()); } catch(e){}
      try { buckets.push(await db.collection("empresas").where("rmId","==",CTX.uid).get()); } catch(e){}
      try { buckets.push(await db.collection("empresas").where("criadoPorUid","==",CTX.uid).get()); } catch(e){}
      const map = new Map();
      buckets.forEach(s => s?.docs?.forEach(d => map.set(d.id, d)));
      docs = Array.from(map.values());
      // fallback: agência + filtro no cliente pelo owner
      if (docs.length === 0 && CTX.agenciaId) {
        try {
          const snapAg = await db.collection("empresas").where("agenciaId","==",CTX.agenciaId).get();
          docs = snapAg.docs.filter(d => {
            const e = d.data() || {};
            const dono = e.rmUid || e.rmId || e.criadoPorUid || null;
            return dono === CTX.uid;
          });
        } catch(e){}
      }
    }

    empresasCache = [];
    docs.forEach(doc => {
      const e = { id: doc.id, ...doc.data() };
      const nomeRM = e.rmNome || e.rm || "";
      if (filtroRMNome && nomeRM !== filtroRMNome) return;
      empresasCache.push(e);
    });

    renderTabela(); // renderiza com filtros atuais (inclui busca por nome)

  } catch (err) {
    console.error("[empresas] carregarEmpresas:", err);
    erroUI("Erro ao carregar empresas.");
  }
}

// ==== Render Tabela com filtros (RM + busca por nome) ====
async function renderTabela(){
  const wrap = document.getElementById("tabelaEmpresas");
  const totalEl = document.getElementById("totalEmpresas");
  if (!wrap) return;

  const busca = normalize(buscaNomeAtual);
  const listaFiltrada = empresasCache.filter(e=>{
    const okNome = !busca || normalize(e.nome||e.razaoSocial||"").includes(busca);
    return okNome;
  });

  totalEl && (totalEl.textContent = String(listaFiltrada.length || "0"));

  if (!listaFiltrada.length) {
    wrap.innerHTML = `<div class="p-4 muted">Nenhuma empresa no escopo atual.</div>`;
    return;
  }

  // monta status por produto
  const linhas = await Promise.all(
    listaFiltrada.map(async (empresa) => {
      const cotDocs = await buscarCotacoesParaEmpresa(empresa.id);
      const statusPorProduto = {};
      produtos.forEach(p => statusPorProduto[p] = "nenhum");

      cotDocs.forEach(doc => {
        const c = doc.data() || {};
        const ramo = c.ramo;
        const produtoId = produtos.find(id =>
          normalize(nomesProdutos[id]) === normalize(ramo)
        );
        if (!produtoId) return;
        statusPorProduto[produtoId] = classFromStatus(c.status);
      });

      return { empresa, status: statusPorProduto };
    })
  );

  let html = `<table class="min-w-full text-sm">
    <thead class="bg-slate-100 sticky top-0">
      <tr>
        <th class="text-left px-3 py-2">Empresa</th>
        ${produtos.map(p=>`<th class="px-2 py-2 whitespace-nowrap">${nomesProdutos[p]}</th>`).join("")}
        <th class="px-2 py-2">Ações</th>
      </tr>
    </thead>
    <tbody>`;

  linhas.forEach(l => {
    const e = l.empresa;
    html += `<tr class="border-t border-slate-200">
      <td class="px-3 py-2 text-left">
        <div class="font-medium">${e.nome || e.razaoSocial || "-"}</div>
        <div class="text-xs muted">${e.rmNome || e.rm || "-"}</div>
      </td>`;
    produtos.forEach(p => {
      const cor = l.status[p];
      const classe = {
        verde: "bg-green-100",
        vermelho: "bg-red-100",
        amarelo: "bg-yellow-100",
        azul: "bg-blue-100",
        nenhum: "bg-slate-100"
      }[cor] || "bg-slate-100";
      const simbolo = {
        verde: "🟢", vermelho: "🔴", amarelo: "🟡", azul: "🔵", nenhum: "⚪️"
      }[cor] || "⚪️";
      html += `<td class="px-2 py-2 text-center">
        <span class="inline-flex items-center justify-center w-7 h-7 rounded-full ${classe}">${simbolo}</span>
      </td>`;
    });

    // Ações: excluir (com RBAC dinâmico por data-attrs)
    html += `<td class="px-2 py-2 text-center">
      <button class="btn btn-outline hover:bg-red-50" data-del="${e.id}" data-nome="${e.nome||e.razaoSocial||""}" data-owner="${e.rmUid||e.rmId||e.criadoPorUid||""}" data-agencia="${e.agenciaId||""}">
        🗑️ Excluir
      </button>
    </td>`;

    html += `</tr>`;
  });

  html += `</tbody></table>`;
  wrap.innerHTML = html;

  // ligar botões de excluir
  wrap.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", abrirModalExcluir);
  });
}

// ==== Filtros (RM + busca) ====
function ligarFiltros(){
  const selRM = document.getElementById("filtroRM");
  const txtBusca = document.getElementById("buscaEmpresa");
  selRM?.addEventListener("change", async ()=>{
    filtroRMAtual = selRM.value || "";
    await carregarEmpresas();
  });
  txtBusca?.addEventListener("input", ()=>{
    buscaNomeAtual = txtBusca.value || "";
    renderTabela();
  });
}

// ==== Máscara de CNPJ ao digitar ====
function ligarMascaraCNPJ(){
  function applyMask(el){
    el.addEventListener("input", ()=>{
      const cur = el.selectionStart;
      const raw = el.value;
      const masked = fmtCNPJ(raw);
      el.value = masked;
      // não forço caret para simplificar
    });
  }
  document.querySelectorAll("input.cnpj-mask,[data-mask='cnpj'],input[name='cnpj']").forEach(applyMask);
}

// ==== Exclusão de empresa (modal + permissões) ====
// Permissões:
// - Admin: qualquer empresa.
// - Gerente Chefe: empresa da mesma agência.
// - RM: apenas empresas onde rmUid/rmId/criadoPorUid === CTX.uid.
const modal = document.getElementById("modalExcluir");
const inputConfirm = document.getElementById("confirmNomeEmpresa");
const btnCancelar = document.getElementById("cancelarExcluir");
const btnConfirmar = document.getElementById("confirmarExcluir");
const elErro = document.getElementById("excluirErro");

let empresaAlvo = null;

function abrirModalExcluir(e){
  const btn = e.currentTarget;
  empresaAlvo = {
    id: btn.dataset.del,
    nome: btn.dataset.nome || "",
    ownerUid: btn.dataset.owner || "",
    agenciaId: btn.dataset.agencia || ""
  };
  inputConfirm.value = "";
  elErro.textContent = "";
  modal.classList.remove("hidden");
}

btnCancelar?.addEventListener("click", ()=> modal.classList.add("hidden"));
modal?.addEventListener("click", (e)=>{ if(e.target===modal) modal.classList.add("hidden"); });

btnConfirmar?.addEventListener("click", async ()=>{
  if(!empresaAlvo) return;
  elErro.textContent = "";

  // valida nome
  const esperado = (empresaAlvo.nome||"").trim().toLowerCase();
  const digitado = (inputConfirm.value||"").trim().toLowerCase();
  if(!esperado || digitado !== esperado){
    elErro.textContent = "Nome não confere. Digite exatamente o nome da empresa.";
    return;
  }

  // checa permissão
  let pode = false;
  if(CTX.isAdmin) pode = true;
  else if(CTX.perfil === "gerente chefe" && empresaAlvo.agenciaId && CTX.agenciaId && empresaAlvo.agenciaId === CTX.agenciaId) pode = true;
  else if(CTX.perfil === "rm" && empresaAlvo.ownerUid && empresaAlvo.ownerUid === CTX.uid) pode = true;

  if(!pode){
    elErro.textContent = "Você não tem permissão para excluir esta empresa.";
    return;
  }

  // exclui
  try{
    await db.collection("empresas").doc(empresaAlvo.id).delete();
    modal.classList.add("hidden");
    // remove do cache e re-render
    empresasCache = empresasCache.filter(e=> e.id !== empresaAlvo.id);
    renderTabela();
  }catch(err){
    console.error("Excluir empresa:", err);
    elErro.textContent = err?.message || "Erro ao excluir.";
  }
});
