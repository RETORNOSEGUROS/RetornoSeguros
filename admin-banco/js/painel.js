// admin-banco/js/painel.js — SaaS + KPIs + persistência mobile

// ==== Firebase base ====
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };

// Admins por e-mail (fallback quando não há usuarios_banco/{uid})
const ADMIN_EMAILS = [
  "patrick@retornoseguros.com.br"
];

// ==== Utils ====
const normalizarPerfil = (p)=>String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[-_]+/g," ").trim();

const toDate  = (x)=> x?.toDate ? x.toDate() : (x ? new Date(x) : null);
const fmtData = (d)=> d ? d.toLocaleDateString("pt-BR") : "-";
const fmtHora = (d)=> d ? d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "";

const parseValor = (v)=>{
  if(v==null) return 0;
  if(typeof v==="number") return v;
  const limp = String(v)
    .replace(/[^0-9,.-]/g,"")
    .replace(/\.(?=\d{3}(\D|$))/g,"")
    .replace(",",".");
  const n = parseFloat(limp);
  return Number.isFinite(n) ? n : 0;
};
const fmtBRL = (n)=>`R$ ${parseValor(n).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function skeleton(id, n=4){
  const ul = document.getElementById(id); if(!ul) return; ul.innerHTML="";
  for(let i=0;i<n;i++){
    const li=document.createElement("li");
    li.className="row";
    li.innerHTML='<div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:20%"></div>';
    ul.appendChild(li);
  }
}

// ==== Persistência (resolve sessão no mobile/Safari) ====
async function ensurePersistence() {
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (e1) {
    console.warn("LOCAL indisponível, tentando SESSION...", e1?.message);
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    } catch (e2) {
      console.warn("SESSION indisponível, usando NONE.", e2?.message);
      await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
    }
  }
}

// ==== Auth + contexto (com failback e fallback admin) ====
async function initAuth() {
  await ensurePersistence();

  // Evita “tela travada” caso o navegador bloqueie storage
  const failback = setTimeout(() => {
    if (!auth.currentUser) location.href = "login.html";
  }, 5000);

  auth.onAuthStateChanged(async (user)=>{
    if(!user){ clearTimeout(failback); location.href="login.html"; return; }
    clearTimeout(failback);

    CTX.uid = user.uid;

    // tenta carregar perfil normal
    let snap = null;
    try { snap = await db.collection("usuarios_banco").doc(user.uid).get(); }
    catch(e){ console.warn("Erro lendo usuarios_banco:", e?.message); }

    if (!snap || !snap.exists) {
      // fallback admin por e-mail
      if (ADMIN_EMAILS.includes((user.email||"").toLowerCase())) {
        CTX.perfil    = "admin";
        CTX.agenciaId = null;
        CTX.nome      = user.email || "admin";
        const elPerfil = document.getElementById("perfilUsuario");
        if (elPerfil) elPerfil.textContent = `${CTX.nome} (admin — fallback)`;
        montarMenuLateral(CTX.perfil);
        carregarKPIs();          // KPIs
        carregarResumoPainel();  // listas
        return;
      } else {
        const elPerfil = document.getElementById("perfilUsuario");
        if (elPerfil) elPerfil.textContent = "Usuário sem perfil cadastrado";
        console.error("Perfil não encontrado e e‑mail não é admin fallback.");
        return;
      }
    }

    // perfil encontrado
    const d = snap.data();
    CTX.perfil    = normalizarPerfil(d.perfil || "");
    CTX.agenciaId = d.agenciaId || d.agenciaid || null;
    CTX.nome      = d.nome || user.email;

    const elPerfil = document.getElementById("perfilUsuario");
    if (elPerfil) elPerfil.textContent = `${CTX.nome} (${d.perfil||"sem perfil"})`;

    montarMenuLateral(CTX.perfil);
    carregarKPIs();
    carregarResumoPainel();
  });
}

// ==== Menu lateral (SaaS: grupos + ícones + perfis) ====
function montarMenuLateral(perfilBruto){
  const nav = document.getElementById("menuNav");
  if(!nav) return;
  nav.innerHTML = "";

  const perfil = normalizarPerfil(perfilBruto);

  // Ícones (Heroicons outline simplificados)
  const ICON = {
    gerentes:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 12a3 3 0 10-6 0 3 3 0 006 0Zm6 8a6 6 0 10-12 0h12ZM4 6h16M4 10h8"/></svg>`,
    empresa:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l7-7 7 7-7 7-7-7z"/></svg>`,
    agencia:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7h18M3 12h18M3 17h18"/></svg>`,
    agenda:`<svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12z"/></svg>`,
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

  // mostra no desktop; no mobile fica como drawer (controlado pelo HTML)
  if(window.innerWidth>=1024) nav.classList.remove("hidden");
}

// ==== KPIs (topo) ====
async function carregarKPIs(){
  // Empresas
  try{
    let q = db.collection("empresas");
    if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
    else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);
    const s = await q.get();
    const el = document.getElementById("kpiEmpresas"); if(el) el.textContent = String(s.size);
  }catch(e){}

  // Visitas últimos 30 dias
  try{
    const d30 = new Date(); d30.setDate(d30.getDate()-30);
    let q = db.collection("visitas").where("data",">=", d30);
    if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
    else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);
    const s = await q.get();
    const el = document.getElementById("kpiVisitas"); if(el) el.textContent = String(s.size);
  }catch(e){}

  // Cotações
  try{
    let q = db.collection("cotacoes-gerentes");
    if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
    else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);
    const s = await q.get();
    const el = document.getElementById("kpiCotacoes"); if(el) el.textContent = String(s.size);
  }catch(e){}

  // Produção (status "negocio emitido")
  try{
    let q = db.collection("cotacoes-gerentes");
    if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
    else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);
    const s = await q.get();
    let tot = 0;
    s.forEach(doc=>{
      const st = String(doc.data().status||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
      if(st==="negocio emitido") tot++;
    });
    const el = document.getElementById("kpiProducao"); if(el) el.textContent = String(tot);
  }catch(e){}
}

// ==== Painel: listas ====
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

// 1) Visitas Agendadas
async function blocoVisitasAgendadas(){
  const now = Date.now();
  let q = db.collection("agenda_visitas");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.get();
  const futuros=[];
  snap.forEach(doc=>{
    const d=doc.data();
    const dt = toDate(d.dataHoraTs) || toDate(d.dataHoraStr) || toDate(d.dataHora);
    if(dt && !isNaN(dt) && dt.getTime()>=now) futuros.push({...d,dt});
  });
  futuros.sort((a,b)=>a.dt-b.dt);

  let arr=futuros.slice(0,10);
  if(arr.length===0){
    const limite = now - 20*24*60*60*1000;
    const recentes=[];
    snap.forEach(doc=>{
      const d=doc.data();
      const dt = toDate(d.dataHoraTs) || toDate(d.dataHoraStr) || toDate(d.dataHora);
      if(dt && !isNaN(dt) && dt.getTime()>=limite) recentes.push({...d,dt});
    });
    recentes.sort((a,b)=>a.dt-b.dt);
    arr=recentes.slice(0,10);
  }

  const elQtd = document.getElementById("qtdVA");
  if(elQtd) elQtd.textContent = String(arr.length);

  const ul=document.getElementById("listaVisitasAgendadas");
  if(!ul) return;
  ul.innerHTML = arr.length?"":"<li class='row'><span class='meta'>Nenhuma visita futura.</span></li>";
  arr.forEach(v=>{
    ul.innerHTML += `
      <li class="row">
        <div class="title">${fmtData(v.dt)} ${fmtHora(v.dt)} — <strong>${v.empresaNome||v.empresa||"-"}</strong></div>
        <div class="meta">${v.rmNome||v.rm||"-"} • ${v.tipo||"-"}</div>
      </li>`;
  });
}

// 2) Minhas Visitas
async function blocoMinhasVisitas(){
  let q = db.collection("visitas");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.limit(50).get();
  const ul = document.getElementById("listaVisitas"); if(!ul) return; ul.innerHTML="";
  if(snap.empty){ ul.innerHTML="<li class='row'><span class='meta'>Nenhuma visita.</span></li>"; return; }

  const cacheEmp=new Map();
  const getEmpresaNome=async(id,fb)=>{
    if(fb) return fb;
    if(!id) return "-";
    if(cacheEmp.has(id)) return cacheEmp.get(id);
    const dd=await db.collection("empresas").doc(id).get();
    const nome=dd.exists ? (dd.data().nome||dd.data().razaoSocial||"-") : "-";
    cacheEmp.set(id,nome); return nome;
  };

  const docs=snap.docs.sort((a,b)=>(toDate(b.data().data)||0)-(toDate(a.data().data)||0)).slice(0,5);
  for(const doc of docs){
    const v=doc.data(); const dt=toDate(v.data);
    const nomeEmp = await getEmpresaNome(v.empresaId, v.empresaNome);
    ul.innerHTML += `
      <li class="row">
        <div class="title"><strong>${nomeEmp}</strong></div>
        <div class="meta">${fmtData(dt)}${v.tipo? " • "+v.tipo:""}</div>
      </li>`;
  }
}

// 3) Produção (emitidos)
async function blocoProducao(){
  let q = db.collection("cotacoes-gerentes");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.limit(100).get();
  const ul = document.getElementById("listaProducao"); if(!ul) return; ul.innerHTML="";
  if(snap.empty){ ul.innerHTML="<li class='row'><span class='meta'>Nenhum negócio.</span></li>"; return; }

  const emitidos=[];
  snap.forEach(doc=>{
    const d=doc.data();
    const st = String(d.status||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    if(st==="negocio emitido") emitidos.push(d);
  });

  if(!emitidos.length){ ul.innerHTML="<li class='row'><span class='meta'>Nenhum negócio emitido.</span></li>"; return; }

  emitidos.sort((a,b)=> (toDate(b.dataCriacao)||0)-(toDate(a.dataCriacao)||0));
  emitidos.slice(0,5).forEach(d=>{
    const valor = d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0;
    const vIni  = toDate(d.vigenciaInicial) || toDate(d.vigenciaInicio) || toDate(d.vigencia_de) || null;
    ul.innerHTML += `
      <li class="row">
        <div class="title"><strong>${d.empresaNome||"Empresa"}</strong> — ${d.ramo||"Ramo"}</div>
        <div class="meta">${fmtBRL(valor)} • início ${fmtData(vIni)}</div>
      </li>`;
  });
}

// 4) Minhas Cotações
async function blocoMinhasCotacoes(){
  let q = db.collection("cotacoes-gerentes");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.limit(10).get();
  const ul = document.getElementById("listaCotacoes"); if(!ul) return; ul.innerHTML="";
  if(snap.empty){ ul.innerHTML="<li class='row'><span class='meta'>Sem cotações.</span></li>"; return; }

  const docs=snap.docs.sort((a,b)=> (toDate(b.data().dataCriacao)||0)-(toDate(a.data().data)||0)).slice(0,5);
  docs.forEach(doc=>{
    const d=doc.data();
    const valor = d.valorFinal ?? d.valorDesejado ?? 0;
    ul.innerHTML += `
      <li class="row">
        <div class="title"><strong>${d.empresaNome||"Empresa"}</strong> — ${d.ramo||"Ramo"}</div>
        <div class="meta">${fmtBRL(valor)}</div>
      </li>`;
  });
}

// ==== Troca de senha ====
(function initTrocaSenha(){
  const abrir   = document.getElementById("abrirTrocaSenha");
  const fechar  = document.getElementById("fecharTrocaSenha");
  const modal   = document.getElementById("modalTrocaSenha");
  const form    = document.getElementById("formTrocarSenha");
  const erroEl  = document.getElementById("trocaErro");
  const infoEl  = document.getElementById("trocaInfo");

  if(!abrir || !fechar || !modal || !form) return;

  const abrirModal  = ()=>{ if(erroEl) erroEl.textContent=""; if(infoEl) infoEl.textContent=""; form.reset(); modal.classList.remove("hidden"); };
  const fecharModal = ()=>{ modal.classList.add("hidden"); };

  abrir.addEventListener("click", abrirModal);
  fechar.addEventListener("click", fecharModal);
  modal.addEventListener("click", (e)=>{ if(e.target===modal) fecharModal(); });

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(erroEl) erroEl.textContent="";
    if(infoEl) infoEl.textContent="";

    const senhaAtual = document.getElementById("senhaAtual").value.trim();
    const novaSenha  = document.getElementById("novaSenha").value.trim();
    const novaSenha2 = document.getElementById("novaSenha2").value.trim();

    if(novaSenha !== novaSenha2){ if(erroEl) erroEl.textContent = "As senhas novas não conferem."; return; }
    if(novaSenha.length < 6){ if(erroEl) erroEl.textContent = "A nova senha deve ter pelo menos 6 caracteres."; return; }

    const user = auth.currentUser;
    if(!user || !user.email){ if(erroEl) erroEl.textContent = "Você precisa estar logado."; return; }

    try {
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, senhaAtual);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(novaSenha);

      if(infoEl) infoEl.textContent = "Senha atualizada com sucesso! Saindo...";
      setTimeout(()=>{ auth.signOut().then(()=> location.href="login.html"); }, 1200);
    } catch(err){
      console.error(err);
      if(erroEl) erroEl.textContent = err?.message || "Erro ao trocar senha.";
    }
  });
})();

// ==== Start ====
initAuth();
