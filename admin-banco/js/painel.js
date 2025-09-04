// admin-banco/js/painel.js — Painel (menu + KPIs + listas) — Retorno Seguros

// ==== Firebase base ====
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };

// Admins por e-mail (fallback quando não há usuarios_banco/{uid})
const ADMIN_EMAILS = [ "patrick@retornoseguros.com.br" ];

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

    let snap = null;
    try { snap = await db.collection("usuarios_banco").doc(user.uid).get(); }
    catch(e){ console.warn("Erro lendo usuarios_banco:", e?.message); }

    if (!snap || !snap.exists) {
      if (ADMIN_EMAILS.includes((user.email||"").toLowerCase())) {
        CTX.perfil    = "admin";
        CTX.agenciaId = null;
        CTX.nome      = user.email || "admin";
        atualizarTopo();
        montarMenuLateral(CTX.perfil);
        carregarKPIs();
        carregarResumoPainel();
        initDrawerMobile(); // garante drawer ativo mesmo sem perfil no doc
        return;
      } else {
        const elPerfil = document.getElementById("perfilUsuario");
        if (elPerfil) elPerfil.textContent = "Usuário sem perfil cadastrado";
        return;
      }
    }

    const d = snap.data();
    CTX.perfil    = normalizarPerfil(d.perfil || "");
    CTX.agenciaId = d.agenciaId || d.agenciaid || null;
    CTX.nome      = d.nome || user.email;

    atualizarTopo();
    montarMenuLateral(CTX.perfil);
    carregarKPIs();
    carregarResumoPainel();
    initDrawerMobile();
  });
}

// ==== Header (saudação + perfil enxuto) ====
function atualizarTopo(){
  const titulo = document.getElementById("tituloSaudacao");
  if (titulo) titulo.textContent = `Olá, ${CTX.nome}`;

  const elPerfil = document.getElementById("perfilUsuario");
  if (elPerfil) {
    const p = (CTX.perfil||"").toLowerCase();
    const label =
      p==="rm" ? "RM" :
      p==="admin" ? "ADMIN" :
      p==="assistente" ? "ASSISTENTE" :
      (p.includes("gerente") ? "GERENTE CHEFE" : (CTX.perfil||"").toUpperCase());
    elPerfil.textContent = label;
  }
}

// ==== Menu lateral (grupos + ícones emoji + perfis) ====
function montarMenuLateral(perfilBruto){
  const nav = document.getElementById("menuNav");
  if(!nav) return;
  nav.innerHTML = "";

  const perfil = normalizarPerfil(perfilBruto);

  const ICON = {
    gerentes:`<span class="text-slate-400">👤</span>`,
    empresa:`<span class="text-slate-400">🏢</span>`,
    agencia:`<span class="text-slate-400">🏦</span>`,
    agenda:`<span class="text-slate-400">📅</span>`,
    visitas:`<span class="text-slate-400">📌</span>`,
    cotacao:`<span class="text-slate-400">📄</span>`,
    producao:`<span class="text-slate-400">📈</span>`,
    dicas:`<span class="text-slate-400">💡</span>`,
    consultar:`<span class="text-slate-400">🔎</span>`,
    ramos:`<span class="text-slate-400">🧩</span>`,
    rel:`<span class="text-slate-400">📊</span>`,
    venc:`<span class="text-slate-400">⏰</span>`,
    func:`<span class="text-slate-400">🧍</span>`,
    carteira:`<span class="text-slate-400">👛</span>`,
    comissoes:`<span class="text-slate-400">💵</span>`,
    resgates:`<span class="text-slate-400">🔐</span>`,
    financeiro:`<span class="text-slate-400">💳</span>`
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
      ["Financeiro","financeiro.html",ICON.financeiro],
      ["Dicas Produtos","dicas-produtos.html",ICON.dicas],
      ["Consultar Dicas","consultar-dicas.html",ICON.consultar], // <= incluído
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
    "rm": new Set([
      "cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html",
      "cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html",
      "vencimentos.html","funcionarios.html","financeiro.html","dicas-produtos.html","ramos-seguro.html"
    ]),
    "gerente chefe": new Set([
      "cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html",
      "cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html",
      "vencimentos.html","funcionarios.html","financeiro.html","dicas-produtos.html","ramos-seguro.html"
    ]),
    "assistente": new Set([
      "agenda-visitas.html","visitas.html","cotacoes.html","consultar-dicas.html",
      "funcionarios.html","financeiro.html","dicas-produtos.html"
    ])
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

// ==== KPIs (topo) ====
// Para gerente_chefe: visitas e cotações do ANO; produção soma do ano.
async function carregarKPIs(){
  const perfil = CTX.perfil;
  const ano = new Date().getFullYear();
  const iniAno = new Date(ano,0,1);
  const fimAno = new Date(ano+1,0,1);

  // rótulos
  const lblV = document.getElementById("lblVisitas");
  const lblC = document.getElementById("lblCotacoes");
  if(lblV) lblV.textContent = (perfil==="gerente chefe" ? "Visitas (ano)" : "Visitas (últ. 30d)");
  if(lblC) lblC.textContent = (perfil==="gerente chefe" ? "Cotações (ano)" : "Cotações");

  // Empresas
  try{
    let docs = await getDocsPerfil("empresas");
    document.getElementById("kpiEmpresas").textContent = String(docs.length);
  }catch(e){}

  // Visitas
  try{
    let docs = await getDocsPerfil("visitas");
    if(perfil==="gerente chefe"){
      docs = docs.filter(d=> (toDate(d.data)||new Date(0)) >= iniAno && (toDate(d.data)||new Date(0)) < fimAno);
    } else {
      const d30 = new Date(); d30.setDate(d30.getDate()-30);
      docs = docs.filter(d=> (toDate(d.data)||new Date(0)) >= d30);
    }
    document.getElementById("kpiVisitas").textContent = String(docs.length);
  }catch(e){}

  // Cotações
  try{
    let docs = await getDocsPerfil("cotacoes-gerentes");
    if(perfil==="gerente chefe"){
      docs = docs.filter(d=> (toDate(d.dataCriacao)||toDate(d.data)||new Date(0)) >= iniAno &&
                              (toDate(d.dataCriacao)||toDate(d.data)||new Date(0)) <  fimAno);
    }
    document.getElementById("kpiCotacoes").textContent = String(docs.length);
  }catch(e){}

  // Produção (emissão) — soma do prêmio no ano atual
  try{
    let docs = await getDocsPerfil("cotacoes-gerentes");
    let total = 0;
    docs.forEach(doc=>{
      const d = doc.data ? doc.data() : doc;
      const st = String(d.status||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
      const dt = toDate(d.dataCriacao) || toDate(d.vigenciaInicial) || toDate(d.vigenciaInicio) || new Date(0);
      if(st === "negocio emitido" && dt >= iniAno && dt < fimAno){
        const v = d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0;
        total += parseValor(v);
      }
    });
    document.getElementById("kpiProducao").textContent = fmtBRL(total);
  }catch(e){}
}

// ==== Helper para queries por perfil (usado nos blocos e KPIs) ====
async function getDocsPerfil(colName, limitN=0){
  const col = db.collection(colName);
  const perfil = CTX.perfil;
  let snaps = [];

  if(perfil==="admin"){
    snaps = [ await (limitN? col.limit(limitN).get() : col.get()) ];
  } else if(perfil==="rm"){
    snaps = [ await (limitN? col.where("rmUid","==",CTX.uid).limit(limitN).get()
                     : col.where("rmUid","==",CTX.uid).get()) ];
  } else if(perfil==="assistente" || perfil==="gerente chefe"){
    const s1 = await (limitN? col.where("agenciaId","==",CTX.agenciaId).limit(limitN).get()
                            : col.where("agenciaId","==",CTX.agenciaId).get());
    let s2 = { forEach:()=>{}, empty:true, docs:[] };
    try {
      s2 = await (limitN? col.where("gerenteChefeUid","==",CTX.uid).limit(limitN).get()
                        : col.where("gerenteChefeUid","==",CTX.uid).get());
    } catch(e){ /* campo opcional */ }
    snaps = [s1,s2];
  } else {
    snaps = [ await (limitN? col.limit(limitN).get() : col.get()) ];
  }

  // merge simples por id
  const map = new Map();
  snaps.forEach(s=> s.forEach(d=> map.set(d.id,d)));
  return Array.from(map.values());
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

// 1) Visitas Agendadas (futuras; fallback 20 dias passados)
async function blocoVisitasAgendadas(){
  const now = Date.now();
  const docs = await getDocsPerfil("agenda_visitas");
  const futuros = [];

  docs.forEach(doc=>{
    const d = doc.data ? doc.data() : doc;
    const dt = toDate(d.dataHoraTs) || toDate(d.dataHoraStr) || toDate(d.dataHora);
    if(dt && !isNaN(dt) && dt.getTime()>=now) futuros.push({...d,dt});
  });
  futuros.sort((a,b)=>a.dt-b.dt);

  let arr=futuros.slice(0,10);
  if(arr.length===0){
    const limite = now - 20*24*60*60*1000;
    const recentes=[];
    docs.forEach(doc=>{
      const d = doc.data ? doc.data() : doc;
      const dt = toDate(d.dataHoraTs) || toDate(d.dataHoraStr) || toDate(d.dataHora);
      if(dt && !isNaN(dt) && dt.getTime()>=limite) recentes.push({...d,dt});
    });
    recentes.sort((a,b)=>a.dt-b.dt);
    arr=recentes.slice(0,10);
  }

  document.getElementById("qtdVA").textContent = String(arr.length);

  const ul=document.getElementById("listaVisitasAgendadas");
  ul.innerHTML = arr.length?"":"<li class='row'><span class='meta'>Nenhuma visita futura.</span></li>";
  arr.forEach(v=>{
    ul.innerHTML += `
      <li class="row">
        <div class="title">${fmtData(v.dt)} ${fmtHora(v.dt)} — <strong>${v.empresaNome||v.empresa||"-"}</strong></div>
        <div class="meta">${v.rmNome||v.rm||"-"} • ${v.tipo||"-"}</div>
      </li>`;
  });
}

// 2) Minhas Visitas (últimas 5)
async function blocoMinhasVisitas(){
  const docs = await getDocsPerfil("visitas");
  const ul = document.getElementById("listaVisitas"); ul.innerHTML="";
  if(!docs.length){ ul.innerHTML="<li class='row'><span class='meta'>Nenhuma visita.</span></li>"; return; }

  const cacheEmp=new Map();
  const getEmpresaNome=async(id,fb)=>{
    if(fb) return fb;
    if(!id) return "-";
    if(cacheEmp.has(id)) return cacheEmp.get(id);
    const dd=await db.collection("empresas").doc(id).get();
    const nome=dd.exists ? (dd.data().nome||dd.data().razaoSocial||"-") : "-";
    cacheEmp.set(id,nome); return nome;
  };

  const ord = (x)=> toDate((x.data?x.data().data:x.data) ) || new Date(0);
  const last5 = docs.sort((a,b)=> ord(b)-ord(a)).slice(0,5);

  for(const doc of last5){
    const v=doc.data ? doc.data() : doc; const dt=toDate(v.data);
    const nomeEmp = await getEmpresaNome(v.empresaId, v.empresaNome);
    ul.innerHTML += `
      <li class="row">
        <div class="title"><strong>${nomeEmp}</strong></div>
        <div class="meta">${fmtData(dt)}${v.tipo? " • "+v.tipo:""}</div>
      </li>`;
  }
}

// 3) Produção (emitidos) — mostra "início" só se existir
async function blocoProducao(){
  const docs = await getDocsPerfil("cotacoes-gerentes");
  const ul = document.getElementById("listaProducao"); ul.innerHTML="";
  if(!docs.length){ ul.innerHTML="<li class='row'><span class='meta'>Nenhum negócio.</span></li>"; return; }

  const emitidos=[];
  docs.forEach(doc=>{
    const d=doc.data ? doc.data() : doc;
    const st = String(d.status||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    if(st==="negocio emitido") emitidos.push(d);
  });

  if(!emitidos.length){ ul.innerHTML="<li class='row'><span class='meta'>Nenhum negócio emitido.</span></li>"; return; }

  emitidos.sort((a,b)=> (toDate(b.dataCriacao)||0)-(toDate(a.dataCriacao)||0));
  emitidos.slice(0,5).forEach(d=>{
    const valor = d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0;
    const vIni  = toDate(d.vigenciaInicial) || toDate(d.vigenciaInicio) || toDate(d.vigencia_de) || null;
    const inicio = vIni ? ` • início ${fmtData(vIni)}` : "";
    ul.innerHTML += `
      <li class="row">
        <div class="title"><strong>${d.empresaNome||"Empresa"}</strong> — ${d.ramo||"Ramo"}</div>
        <div class="meta">${fmtBRL(valor)}${inicio}</div>
      </li>`;
  });
}

// 4) Minhas Cotações — últimas 5
async function blocoMinhasCotacoes(){
  let docs = await getDocsPerfil("cotacoes-gerentes");
  const ul = document.getElementById("listaCotacoes"); ul.innerHTML="";
  if(!docs.length){ ul.innerHTML="<li class='row'><span class='meta'>Sem cotações.</span></li>"; return; }

  const ord = (x)=>{
    const d = x.data ? x.data() : x;
    return toDate(d.ultimaAtualizacao) || toDate(d.atualizadoEm) ||
           toDate(d.dataCriacao) || toDate(d.data) || new Date(0);
  };
  docs = docs.sort((a,b)=> ord(b)-ord(a)).slice(0,5);

  docs.forEach(x=>{
    const d = x.data ? x.data() : x;
    const valor = d.valorFinal ?? d.valorDesejado ?? d.premio ?? 0;
    ul.innerHTML += `
      <li class="row">
        <div class="title"><strong>${d.empresaNome||"Empresa"}</strong> — ${d.ramo||"Ramo"}</div>
        <div class="meta">${fmtBRL(valor)}</div>
      </li>`;
  });
}

// ==== Drawer Mobile (animação e controles) ====
function initDrawerMobile(){
  const nav      = document.getElementById('menuNav');
  const body     = document.body;
  const overlay  = document.getElementById('sidebarOverlay');
  const topBtn   = document.getElementById('menuToggle'); // se existir no header
  const fabMenu  = document.getElementById('fabMenu');    // botão do rodapé

  if(!nav || !overlay) return;

  // estado inicial (escondido no mobile)
  if (window.innerWidth < 1024) {
    nav.classList.add('hidden');
    nav.style.transform  = 'translateY(-16px)';
    nav.style.opacity    = '0';
    nav.style.transition = 'transform .18s ease, opacity .18s ease';
  }

  const openNav = ()=>{
    if (window.innerWidth >= 1024) return; // no desktop já está aberto
    nav.classList.remove('hidden');
    overlay.classList.remove('hidden');
    overlay.classList.add('block');
    body.classList.add('overflow-hidden');
    // anima
    requestAnimationFrame(()=>{
      nav.style.transform = 'translateY(0)';
      nav.style.opacity   = '1';
    });
  };

  const closeNav = ()=>{
    if (window.innerWidth >= 1024) return;
    nav.style.transform = 'translateY(-16px)';
    nav.style.opacity   = '0';
    setTimeout(()=>{
      nav.classList.add('hidden');
      overlay.classList.add('hidden');
      overlay.classList.remove('block');
      body.classList.remove('overflow-hidden');
    }, 180);
  };

  topBtn?.addEventListener('click', (e)=>{ e.preventDefault(); openNav(); });
  fabMenu?.addEventListener('click', (e)=>{ e.preventDefault(); openNav(); });
  overlay.addEventListener('click', closeNav);
  document.addEventListener('click', (e)=>{
    if(window.innerWidth >= 1024) return;
    if(!nav.contains(e.target) && !topBtn?.contains(e.target) && !fabMenu?.contains(e.target)) closeNav();
  });
  window.addEventListener('resize', ()=>{
    if(window.innerWidth >= 1024){
      overlay.classList.add('hidden');
      body.classList.remove('overflow-hidden');
      nav.classList.remove('hidden');
      nav.style.transform='';
      nav.style.opacity='';
    } else {
      nav.classList.add('hidden');
      nav.style.transform  = 'translateY(-16px)';
      nav.style.opacity    = '0';
    }
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
