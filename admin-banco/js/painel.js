// admin-banco/js/painel.js
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid: null, perfil: null, agenciaId: null, nome: null };

// ===== Utils =====
const normalizarPerfil = (p) => String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().trim();

const toDate = (x) => (x?.toDate ? x.toDate() : (x ? new Date(x) : null));
const fmtData = (d) => d ? d.toLocaleDateString("pt-BR") : "-";
const fmtHora = (d) => d ? d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "";

const parseValor = (v)=>{
  if (v==null) return 0;
  if (typeof v==="number") return v;
  const limp = String(v).replace(/[^0-9,.-]/g,"").replace(/\.(?=\d{3}(\D|$))/g,"").replace(",",".");
  const n = parseFloat(limp);
  return Number.isFinite(n) ? n : 0;
};
const fmtBRL = (n)=>`R$ ${parseValor(n).toLocaleString("pt-BR",{minimumFractionDigits:2, maximumFractionDigits:2})}`;

function skeleton(id, n=4){
  const ul = document.getElementById(id); if(!ul) return;
  ul.innerHTML = "";
  for(let i=0;i<n;i++){
    const li = document.createElement("li");
    li.innerHTML = `<div style="height:14px;border-radius:8px;background:linear-gradient(90deg,rgba(255,255,255,.06),rgba(255,255,255,.15),rgba(255,255,255,.06));background-size:200% 100%;animation:sk 1.1s infinite;"></div>`;
    ul.appendChild(li);
  }
}

// ===== Auth + contexto =====
auth.onAuthStateChanged(async (user)=>{
  if(!user) return window.location.href="login.html";
  CTX.uid = user.uid;

  const prof = await db.collection("usuarios_banco").doc(user.uid).get();
  if(!prof.exists){
    document.getElementById("perfilUsuario").textContent = "Usuário não encontrado.";
    return;
  }
  const d = prof.data();
  CTX.perfil    = normalizarPerfil(d.perfil || "");
  CTX.agenciaId = d.agenciaId || null;
  CTX.nome      = d.nome || user.email;

  document.getElementById("perfilUsuario").textContent = `${CTX.nome} (${d.perfil||"sem perfil"})`;

  montarMenuLateral(CTX.perfil);
  carregarResumoPainel();
});

// ===== Menu por perfil (sem mudanças de rota) =====
function montarMenuLateral(perfil){
  const menu = document.getElementById("menuNav");
  if(!menu) return;
  menu.innerHTML="";

  const CATALOGO = {
    "Cadastrar Gerentes":"cadastro-geral.html",
    "Cadastrar Empresa":"cadastro-empresa.html",
    "Agências":"agencias.html",
    "Agenda Visitas":"agenda-visitas.html",
    "Visitas":"visitas.html",
    "Empresas":"empresas.html",
    "Solicitações de Cotação":"cotacoes.html",
    "Produção":"negocios-fechados.html",
    "Consultar Dicas":"consultar-dicas.html",
    "Dicas Produtos":"dicas-produtos.html",
    "Ramos Seguro":"ramos-seguro.html",
    "Relatório Visitas":"visitas-relatorio.html",
    "Vencimentos":"vencimentos.html",
    "Relatórios":"relatorios.html"
  };
  const LABEL = Object.fromEntries(Object.entries(CATALOGO).map(([k,v])=>[v,k]));

  const MENU_ADMIN = Object.values(CATALOGO);
  const MENU_RM = [
    "cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html",
    "cotacoes.html","negocios-fechados.html","consultar-dicas.html",
    "visitas-relatorio.html","vencimentos.html"
  ];
  const MENU_GERENTE_CHEFE = [...MENU_RM];
  const MENU_ASSISTENTE = ["agenda-visitas.html","visitas.html","cotacoes.html","consultar-dicas.html"];

  let hrefs=[];
  switch(perfil){
    case "admin": hrefs = MENU_ADMIN; break;
    case "rm": hrefs = MENU_RM; break;
    case "gerente chefe":
    case "gerente-chefe":
    case "gerente_chefe": hrefs = MENU_GERENTE_CHEFE; break;
    case "assistente":
    case "assistentes": hrefs = MENU_ASSISTENTE; break;
    default: hrefs=[];
  }
  hrefs.forEach(h=>{ const a=document.createElement("a"); a.href=h; a.textContent=LABEL[h]||h; menu.appendChild(a); });
}

// ===== Painel (com escopo por perfil em TODOS os blocos) =====
async function carregarResumoPainel(){
  skeleton("listaVisitasAgendadas",5);
  skeleton("listaConversas",5);
  skeleton("listaVisitas",5);
  skeleton("listaProducao",5);
  skeleton("listaCotacoes",5);

  await Promise.all([
    blocoVisitasAgendadas(),
    blocoUltimasConversas(),
    blocoMinhasVisitas(),
    blocoProducao(),
    blocoMinhasCotacoes()
  ]);
}

// --- 1) Visitas Agendadas (próximas 10) ---
async function blocoVisitasAgendadas(){
  let q = db.collection("agenda_visitas");
  if (CTX.perfil==="rm") q = q.where("rmUid","==",CTX.uid);
  else if (CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") q = q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.get();
  const now = new Date();
  const arr = [];
  snap.forEach(doc=>{
    const d=doc.data();
    const dt = toDate(d.dataHoraTs) || toDate(d.dataHoraStr) || toDate(d.dataHora);
    if(dt && !isNaN(dt) && dt>=now){ arr.push({...d, dt}); }
  });
  arr.sort((a,b)=>a.dt-b.dt);
  const ul = document.getElementById("listaVisitasAgendadas");
  ul.innerHTML = arr.length? "" : "<li class='meta'>Nenhuma visita futura.</li>";
  arr.slice(0,10).forEach(v=>{
    ul.innerHTML += `<li>${fmtData(v.dt)} ${fmtHora(v.dt)} — <strong>${v.empresaNome||v.empresa||"-"}</strong> <span class="meta"> ${v.rmNome||v.rm||"-"} • ${v.tipo||"-"}</span></li>`;
  });
}

// --- 2) Últimas Conversas (pega a última interação das cotações visíveis) ---
async function blocoUltimasConversas(){
  // primeiro traga as cotações visíveis ao usuário
  let q = db.collection("cotacoes-gerentes");
  if (CTX.perfil==="rm") q = q.where("rmUid","==",CTX.uid);
  else if (CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") q = q.where("agenciaId","==",CTX.agenciaId);
  q = q.orderBy("dataCriacao","desc").limit(25);

  const cotSnap = await q.get();
  const ul = document.getElementById("listaConversas"); ul.innerHTML="";

  if (cotSnap.empty){ ul.innerHTML = "<li class='meta'>Nenhuma conversa recente.</li>"; return; }

  // para cada cotação, busca a última interação
  const itens = [];
  for (const doc of cotSnap.docs){
    const c = doc.data();
    const sub = await db.collection("cotacoes-gerentes").doc(doc.id)
      .collection("interacoes")
      .orderBy("dataHora","desc").limit(1).get();
    if (!sub.empty){
      const i = sub.docs[0].data();
      itens.push({
        empresa: c.empresaNome || "Empresa",
        status:  c.status || "-",
        produto: c.ramo || c.produto || "-",
        quando:  toDate(i.dataHora),
        autor:   i.usuarioNome || i.usuarioEmail || "-",
        msg:     i.mensagem || ""
      });
    }
  }

  if (!itens.length){ ul.innerHTML = "<li class='meta'>Sem interações recentes.</li>"; return; }

  itens.sort((a,b)=> b.quando - a.quando);
  itens.slice(0,5).forEach(it=>{
    const texto = it.msg.length>90 ? it.msg.slice(0,90)+"…" : it.msg;
    ul.innerHTML += `<li><strong>${it.empresa}</strong> · ${it.status} · ${it.produto} <span class="meta">— ${fmtData(it.quando)} ${fmtHora(it.quando)} • ${it.autor}</span><br>${texto}</li>`;
  });
}

// --- 3) Minhas Visitas (últimas 5 com nome da empresa) ---
async function blocoMinhasVisitas(){
  let q = db.collection("visitas");
  if (CTX.perfil==="rm") q = q.where("rmUid","==",CTX.uid);
  else if (CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") q = q.where("agenciaId","==",CTX.agenciaId);
  q = q.orderBy("data","desc").limit(20);

  const snap = await q.get();
  const ul = document.getElementById("listaVisitas"); ul.innerHTML="";
  if (snap.empty){ ul.innerHTML = "<li class='meta'>Nenhuma visita.</li>"; return; }

  // resolve nome da empresa quando vier só o ID
  const cacheEmp = new Map();
  async function getEmpresaNome(empresaId, fallback){
    if (fallback) return fallback;
    if (!empresaId) return "-";
    if (cacheEmp.has(empresaId)) return cacheEmp.get(empresaId);
    const d = await db.collection("empresas").doc(empresaId).get();
    const nome = d.exists ? (d.data().nome || d.data().razaoSocial || "-") : "-";
    cacheEmp.set(empresaId, nome);
    return nome;
  }

  const docs = snap.docs.slice(0,5);
  for (const doc of docs){
    const v = doc.data();
    const nomeEmp = await getEmpresaNome(v.empresaId, v.empresaNome);
    const dt = toDate(v.data);
    ul.innerHTML += `<li><strong>${nomeEmp}</strong> <span class="meta">— ${fmtData(dt)}${v.tipo? " • "+v.tipo: ""}</span></li>`;
  }
}

// --- 4) Produção (Negócios Fechados) com valor e início vigência ---
async function blocoProducao(){
  let q = db.collection("cotacoes-gerentes");
  if (CTX.perfil==="rm") q = q.where("rmUid","==",CTX.uid);
  else if (CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") q = q.where("agenciaId","==",CTX.agenciaId);
  q = q.orderBy("dataCriacao","desc").limit(50);

  const snap = await q.get();
  const ul = document.getElementById("listaProducao"); ul.innerHTML="";
  if (snap.empty){ ul.innerHTML = "<li class='meta'>Nenhum negócio.</li>"; return; }

  const emitidos = [];
  snap.forEach(doc=>{
    const d = doc.data();
    if (String(d.status||"").toLowerCase()==="negócio emitido") emitidos.push(d);
  });

  if (!emitidos.length){ ul.innerHTML = "<li class='meta'>Nenhum negócio emitido.</li>"; return; }

  emitidos.slice(0,5).forEach(d=>{
    const valor = d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0;
    const vIni  = toDate(d.vigenciaInicial) || toDate(d.vigenciaInicio) || toDate(d.vigencia_de) || null;
    ul.innerHTML += `<li><strong>${d.empresaNome || "Empresa"}</strong> — ${d.ramo || "Ramo"} <span class="meta">• ${fmtBRL(valor)} • início ${fmtData(vIni)}</span></li>`;
  });
}

// --- 5) Minhas Cotações (valor visível) ---
async function blocoMinhasCotacoes(){
  let q = db.collection("cotacoes-gerentes");
  if (CTX.perfil==="rm") q = q.where("rmUid","==",CTX.uid);
  else if (CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") q = q.where("agenciaId","==",CTX.agenciaId);
  q = q.orderBy("dataCriacao","desc").limit(10);

  const snap = await q.get();
  const ul = document.getElementById("listaCotacoes"); ul.innerHTML="";
  if (snap.empty){ ul.innerHTML = "<li class='meta'>Sem cotações.</li>"; return; }

  snap.docs.slice(0,5).forEach(doc=>{
    const d = doc.data();
    const valor = d.valorFinal ?? d.valorDesejado ?? 0;
    ul.innerHTML += `<li><strong>${d.empresaNome || "Empresa"}</strong> — ${d.ramo || "Ramo"} <span class="meta">• ${fmtBRL(valor)}</span></li>`;
  });
}
