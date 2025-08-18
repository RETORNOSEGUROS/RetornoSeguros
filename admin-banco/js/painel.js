// admin-banco/js/painel.js
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };

// ===== Utils
const normalizarPerfil = (p) => String(p || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
  .toLowerCase()
  .replace(/[-_]+/g, " ")                            // << adiciona isto
  .trim();
const toDate  = (x)=> x?.toDate ? x.toDate() : (x ? new Date(x) : null);
const fmtData = (d)=> d ? d.toLocaleDateString("pt-BR") : "-";
const fmtHora = (d)=> d ? d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "";
const parseValor = (v)=>{ if(v==null) return 0; if(typeof v==="number") return v;
  const limp = String(v).replace(/[^0-9,.-]/g,"").replace(/\.(?=\d{3}(\D|$))/g,"").replace(",",".");
  const n = parseFloat(limp); return Number.isFinite(n) ? n : 0; };
const fmtBRL = (n)=>`R$ ${parseValor(n).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function skeleton(id, n=4){
  const ul = document.getElementById(id); if(!ul) return; ul.innerHTML="";
  for(let i=0;i<n;i++){ const li=document.createElement("li"); li.className="row";
    li.innerHTML='<div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:20%"></div>'; ul.appendChild(li);}
}

// ===== Auth + contexto
auth.onAuthStateChanged(async (user)=>{
  if(!user) return location.href="login.html";
  CTX.uid = user.uid;

  const prof = await db.collection("usuarios_banco").doc(user.uid).get();
  if(!prof.exists){ document.getElementById("perfilUsuario").textContent="Usuário não encontrado"; return; }

  const d = prof.data();
  CTX.perfil    = normalizarPerfil(d.perfil || "");
  CTX.agenciaId = d.agenciaId || null;
  CTX.nome      = d.nome || user.email;

  document.getElementById("perfilUsuario").textContent = `${CTX.nome} (${d.perfil||"sem perfil"})`;
  montarMenuLateral(CTX.perfil);
  carregarResumoPainel();
});

// ===== Menu por perfil (inclui páginas sigilosas só para ADMIN no menu)
function montarMenuLateral(perfilBruto){
  const menu=document.getElementById("menuNav"); if(!menu) return; menu.innerHTML="";
  const perfil=normalizarPerfil(perfilBruto);

  const CAT_BASE={
    "Cadastrar Gerentes":"cadastro-geral.html","Cadastrar Empresa":"cadastro-empresa.html","Agências":"agencias.html",
    "Agenda Visitas":"agenda-visitas.html","Visitas":"visitas.html","Empresas":"empresas.html",
    "Solicitações de Cotação":"cotacoes.html","Produção":"negocios-fechados.html","Consultar Dicas":"consultar-dicas.html",
    "Dicas Produtos":"dicas-produtos.html","Ramos Seguro":"ramos-seguro.html","Relatório Visitas":"visitas-relatorio.html",
    "Vencimentos":"vencimentos.html","Relatórios":"relatorios.html"
  };
  // Itens sigilosos — só ADMIN vê no menu
  const CAT_ADMIN_ONLY={
    "Carteira":"carteira.html",
    "Comissões":"comissoes.html",
    "Resgates (Admin)":"resgates-admin.html"
  };

  const LABEL=Object.fromEntries(Object.entries({...CAT_BASE, ...CAT_ADMIN_ONLY}).map(([k,v])=>[v,k]));
  const ADMIN=[...Object.values(CAT_BASE), ...Object.values(CAT_ADMIN_ONLY)];
  const RM=["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html"];
  const GER=["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html"];
  const AST=["agenda-visitas.html","visitas.html","cotacoes.html","consultar-dicas.html"];

  let hrefs=[];
  switch(perfil){
    case "admin": hrefs=ADMIN; break;
    case "rm": hrefs=RM; break;
    case "gerente chefe":
    case "gerente-chefe":
    case "gerente_chefe": hrefs=GER; break;
    case "assistente":
    case "assistentes": hrefs=AST; break;
    default: hrefs=[];
  }

  hrefs.forEach(h=>{
    const a=document.createElement("a"); a.href=h;
    const emoji = "🔹"; // discreto no tema claro
    a.innerHTML=`${emoji} ${LABEL[h]||h}`;
    menu.appendChild(a);
  });
}

// ===== Painel (sem “Últimas Conversas”)
async function carregarResumoPainel(){
  skeleton("listaVisitasAgendadas",5);
  skeleton("listaVisitas",5);
  skeleton("listaProducao",5);
  skeleton("listaCotacoes",5);
  await Promise.all([
    blocoVisitasAgendadas(),
    blocoMinhasVisitas(),
    blocoProducao(),
    blocoMinhasCotacoes()
  ]);
}

// --- 1) Visitas Agendadas (próximas 10) ---
async function blocoVisitasAgendadas(){
  let q = db.collection("agenda_visitas");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.get();
  const now=new Date(); const todos=[];
  snap.forEach(doc=>{
    const d=doc.data();
    const dt = toDate(d.dataHoraTs) || toDate(d.dataHoraStr) || toDate(d.dataHora);
    if(dt && !isNaN(dt) && dt>=now) todos.push({...d,dt});
  });
  todos.sort((a,b)=>a.dt-b.dt);
  const arr=todos.slice(0,10);
  document.getElementById("qtdVA").textContent = arr.length;
  const ul=document.getElementById("listaVisitasAgendadas");
  ul.innerHTML = arr.length?"":"<li class='row'><span class='meta'>Nenhuma visita futura.</span></li>";
  arr.forEach(v=>{
    ul.innerHTML += `<li class="row"><div class="title">${fmtData(v.dt)} ${fmtHora(v.dt)} — <strong>${v.empresaNome||v.empresa||"-"}</strong></div><div class="meta">${v.rmNome||v.rm||"-"} • ${v.tipo||"-"}</div></li>`;
  });
}

// --- 2) Minhas Visitas (últimas 5) ---
async function blocoMinhasVisitas(){
  let q = db.collection("visitas");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.limit(20).get();
  const ul = document.getElementById("listaVisitas"); ul.innerHTML="";
  if(snap.empty){ ul.innerHTML="<li class='row'><span class='meta'>Nenhuma visita.</span></li>"; return; }

  const cacheEmp=new Map();
  const getEmpresaNome=async(id,fb)=>{ if(fb) return fb; if(!id) return "-";
    if(cacheEmp.has(id)) return cacheEmp.get(id);
    const d=await db.collection("empresas").doc(id).get();
    const nome=d.exists ? (d.data().nome||d.data().razaoSocial||"-") : "-";
    cacheEmp.set(id,nome); return nome; };

  const docs=snap.docs.sort((a,b)=>(toDate(b.data().data)||0)-(toDate(a.data().data)||0)).slice(0,5);
  for(const doc of docs){
    const v=doc.data(); const dt=toDate(v.data);
    const nomeEmp = await getEmpresaNome(v.empresaId, v.empresaNome);
    ul.innerHTML += `<li class="row"><div class="title"><strong>${nomeEmp}</strong></div><div class="meta">${fmtData(dt)}${v.tipo? " • "+v.tipo:""}</div></li>`;
  }
}

// --- 3) Produção (Negócios Fechados) ---
async function blocoProducao(){
  let q = db.collection("cotacoes-gerentes");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.limit(50).get();
  const ul = document.getElementById("listaProducao"); ul.innerHTML="";
  if(snap.empty){ ul.innerHTML="<li class='row'><span class='meta'>Nenhum negócio.</span></li>"; return; }

  const emitidos=[];
  snap.forEach(doc=>{ const d=doc.data(); if(String(d.status||"").toLowerCase()==="negócio emitido") emitidos.push(d);});
  if(!emitidos.length){ ul.innerHTML="<li class='row'><span class='meta'>Nenhum negócio emitido.</span></li>"; return; }

  emitidos.sort((a,b)=> (toDate(b.dataCriacao)||0)-(toDate(a.dataCriacao)||0));
  emitidos.slice(0,5).forEach(d=>{
    const valor = d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0;
    const vIni  = toDate(d.vigenciaInicial) || toDate(d.vigenciaInicio) || toDate(d.vigencia_de) || null;
    ul.innerHTML += `<li class="row"><div class="title"><strong>${d.empresaNome||"Empresa"}</strong> — ${d.ramo||"Ramo"}</div><div class="meta">${fmtBRL(valor)} • início ${fmtData(vIni)}</div></li>`;
  });
}

// --- 4) Minhas Cotações ---
async function blocoMinhasCotacoes(){
  let q = db.collection("cotacoes-gerentes");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.limit(10).get();
  const ul = document.getElementById("listaCotacoes"); ul.innerHTML="";
  if(snap.empty){ ul.innerHTML="<li class='row'><span class='meta'>Sem cotações.</span></li>"; return; }

  const docs=snap.docs.sort((a,b)=> (toDate(b.data().dataCriacao)||0)-(toDate(a.data().dataCriacao)||0)).slice(0,5);
  docs.forEach(doc=>{
    const d=doc.data();
    const valor = d.valorFinal ?? d.valorDesejado ?? 0;
    ul.innerHTML += `<li class="row"><div class="title"><strong>${d.empresaNome||"Empresa"}</strong> — ${d.ramo||"Ramo"}</div><div class="meta">${fmtBRL(valor)}</div></li>`;
  });
}

