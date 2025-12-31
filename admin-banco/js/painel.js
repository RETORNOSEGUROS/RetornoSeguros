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

// ==== Persistência ====
async function ensurePersistence() {
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (e1) {
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    } catch (e2) {
      await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
    }
  }
}

// ==== Auth + contexto ====
async function initAuth() {
  await ensurePersistence();

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
        initDrawerMobile();
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

// ==== Menu lateral ====
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
      ["Dicas Produtos","dicas-produtos.html",ICON.dicas],          // <— só admin (filtrado abaixo)
      ["Consultar Dicas","consultar-dicas.html",ICON.consultar],    // <— todos
      ["Ramos Seguro","ramos-seguro.html",ICON.ramos]               // <— só admin (filtrado abaixo)
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

  // Perfis permitidos por rota (removido "Dicas Produtos" e "Ramos Seguro" para RM/GC/Assistente)
  const ROTAS_POR_PERFIL = {
    "admin": new Set([...GRUPOS.flatMap(g=>g.itens.map(i=>i[1]))]),
    "rm": new Set([
      "cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html",
      "cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html",
      "vencimentos.html","funcionarios.html","financeiro.html"
    ]),
    "gerente chefe": new Set([
      "cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html",
      "cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html",
      "vencimentos.html","funcionarios.html","financeiro.html"
    ]),
    "assistente": new Set([
      "agenda-visitas.html","visitas.html","cotacoes.html","consultar-dicas.html",
      "funcionarios.html","financeiro.html"
    ])
  };
  const perfilKey = ["gerente chefe","gerente-chefe","gerente_chefe"].includes(perfil) ? "gerente chefe" : perfil;
  const pode = ROTAS_POR_PERFIL[perfilKey] || new Set();

  const frag = document.createDocumentFragment();

  GRUPOS.forEach(grupo=>{
    if(grupo.adminOnly && perfilKey!=="admin") return;

    // itens permitidos por perfil
    let permitidos = grupo.itens.filter(([_,href])=> perfilKey==="admin" || pode.has(href));

    // guarda extra: se NÃO for admin, nunca mostrar "dicas-produtos" e "ramos-seguro"
    if (perfilKey !== "admin") {
      permitidos = permitidos.filter(([_,href])=> href!=="dicas-produtos.html" && href!=="ramos-seguro.html");
    }

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

// ==== Helper para queries por perfil ====
async function getDocsPerfil(colName, limitN=0){
  const col = db.collection(colName);
  const perfil = CTX.perfil;
  let snaps = [];

  try {
    if(perfil==="admin"){
      snaps = [ await (limitN? col.limit(limitN).get() : col.get()) ];
    } else if(perfil==="rm"){
      // RM: buscar por vários campos de vínculo
      const queries = [];
      try { queries.push(await col.where("rmUid","==",CTX.uid).get()); } catch(e){}
      try { queries.push(await col.where("rmId","==",CTX.uid).get()); } catch(e){}
      try { queries.push(await col.where("criadoPorUid","==",CTX.uid).get()); } catch(e){}
      snaps = queries.filter(q => q && q.docs);
    } else if(perfil==="assistente" || perfil==="gerente chefe"){
      // GC/Assistente: buscar por agenciaId com fallback
      let s1 = { forEach:()=>{}, empty:true, docs:[] };
      try {
        s1 = await (limitN? col.where("agenciaId","==",CTX.agenciaId).limit(limitN).get()
                          : col.where("agenciaId","==",CTX.agenciaId).get());
      } catch(e){
        console.warn(`[${colName}] Query agenciaId falhou, tentando fallback:`, e.message);
        // Fallback: pegar tudo e filtrar no cliente
        try {
          const allDocs = await (limitN ? col.limit(500).get() : col.get());
          s1 = {
            forEach: (fn) => {
              allDocs.forEach(doc => {
                const d = doc.data();
                if (d.agenciaId === CTX.agenciaId) fn(doc);
              });
            },
            docs: allDocs.docs.filter(doc => doc.data().agenciaId === CTX.agenciaId)
          };
        } catch(e2) {
          console.warn(`[${colName}] Fallback também falhou:`, e2.message);
        }
      }
      
      let s2 = { forEach:()=>{}, empty:true, docs:[] };
      try {
        s2 = await (limitN? col.where("gerenteChefeUid","==",CTX.uid).limit(limitN).get()
                          : col.where("gerenteChefeUid","==",CTX.uid).get());
      } catch(e){ /* opcional */ }
      snaps = [s1,s2];
    } else {
      snaps = [ await (limitN? col.limit(limitN).get() : col.get()) ];
    }
  } catch(e) {
    console.error(`[${colName}] Erro geral:`, e.message);
    return [];
  }

  const map = new Map();
  snaps.forEach(s=> {
    if(s && s.forEach) s.forEach(d=> map.set(d.id,d));
  });
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

// 1) Visitas Agendadas
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

// ==== Drawer Mobile (animação) ====
function initDrawerMobile(){
  const nav      = document.getElementById('menuNav');
  const body     = document.body;
  const overlay  = document.getElementById('sidebarOverlay');
  const topBtn   = document.getElementById('menuToggle'); // (se existir no header)
  const fabMenu  = document.getElementById('fabMenu');    // botão "Menu" do rodapé

  if(!nav || !overlay) return;

  if (window.innerWidth < 1024) {
    nav.classList.add('hidden');
    nav.style.transform  = 'translateY(-16px)';
    nav.style.opacity    = '0';
    nav.style.transition = 'transform .18s ease, opacity .18s ease';
  }

  const openNav = ()=>{
    if (window.innerWidth >= 1024) return;
    nav.classList.remove('hidden');
    overlay.classList.remove('hidden');
    overlay.classList.add('block');
    body.classList.add('overflow-hidden');
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
      if(erroEl) erroEl.textContent = err?.message || "Erro ao trocar senha.";
    }
  });
})();

// ==== Gráficos e Dados Adicionais ====
let COTACOES_CACHE = [];
let chartStatus = null;

const fmtBRLCompact = (v)=>{
  const n = parseValor(v);
  if(n >= 1000000) return `R$ ${(n/1000000).toFixed(1)}M`;
  if(n >= 1000) return `R$ ${(n/1000).toFixed(0)}K`;
  return fmtBRL(n);
};

async function carregarDadosGraficos() {
  try {
    const docs = await getDocsPerfil("cotacoes-gerentes");
    COTACOES_CACHE = docs.map(d => d.data ? d.data() : d);
    
    popularFiltroRamo();
    renderizarGraficoStatus();
    carregarVencimentosVertical();
  } catch(e) {
    console.warn("Erro gráficos:", e);
  }
}

function popularFiltroRamo() {
  const select = document.getElementById("filtroRamoGrafico");
  if (!select) return;
  
  const ramosSet = new Set();
  COTACOES_CACHE.forEach(c => {
    if (c.ramo) ramosSet.add(c.ramo);
  });
  
  select.innerHTML = '<option value="">Todos</option>';
  Array.from(ramosSet).sort().forEach(ramo => {
    select.innerHTML += `<option value="${ramo}">${ramo}</option>`;
  });
}

// Gráfico de Status - filtrado por ramo quando selecionado
function renderizarGraficoStatus() {
  const ctx = document.getElementById("chartStatus")?.getContext("2d");
  if (!ctx) return;
  
  const ramoFiltro = document.getElementById("filtroRamoGrafico")?.value || "";
  
  // Filtrar cotações pelo ramo selecionado
  const cotacoesFiltradas = ramoFiltro 
    ? COTACOES_CACHE.filter(c => c.ramo === ramoFiltro)
    : COTACOES_CACHE;
  
  const porStatus = {};
  cotacoesFiltradas.forEach(c => {
    const status = c.status || "Sem Status";
    if (!porStatus[status]) porStatus[status] = { qtd: 0, valor: 0 };
    porStatus[status].qtd++;
    porStatus[status].valor += parseValor(c.valorFinal ?? c.valorNegocio ?? c.premioLiquido ?? c.premio ?? c.valorDesejado ?? 0);
  });
  
  const labels = Object.keys(porStatus);
  const qtds = labels.map(s => porStatus[s].qtd);
  
  const cores = {
    'Negócio Emitido': 'rgba(16, 185, 129, 0.8)',
    'Em Negociação': 'rgba(59, 130, 246, 0.8)',
    'Aguardando Cotação': 'rgba(245, 158, 11, 0.8)',
    'Aguardando Proposta': 'rgba(139, 92, 246, 0.8)',
    'Pendente Cliente': 'rgba(251, 191, 36, 0.8)',
    'Pendente Agência': 'rgba(249, 115, 22, 0.8)',
    'Recusado Cliente': 'rgba(239, 68, 68, 0.8)',
    'Recusado Seguradora': 'rgba(220, 38, 38, 0.8)',
    'Negócio Iniciado': 'rgba(99, 102, 241, 0.8)',
    'Perdido': 'rgba(239, 68, 68, 0.8)',
    'Cancelado': 'rgba(100, 116, 139, 0.8)'
  };
  const bgColors = labels.map(s => cores[s] || 'rgba(148, 163, 184, 0.8)');
  
  if (chartStatus) chartStatus.destroy();
  
  chartStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: qtds,
        backgroundColor: bgColors,
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            usePointStyle: true,
            padding: 8,
            font: { size: 10 },
            generateLabels: function(chart) {
              const data = chart.data;
              return data.labels.map((label, i) => {
                const dados = porStatus[label];
                return {
                  text: `${label}: ${dados.qtd} • ${fmtBRLCompact(dados.valor)}`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  strokeStyle: '#fff',
                  lineWidth: 1,
                  hidden: false,
                  index: i
                };
              });
            }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const status = labels[ctx.dataIndex];
              const dados = porStatus[status];
              return `${status}: ${dados.qtd} cotações • ${fmtBRLCompact(dados.valor)}`;
            }
          }
        }
      }
    }
  });
  
  // Atualizar título se filtrado
  const titulo = document.querySelector('#chartStatus')?.closest('.card')?.querySelector('h3');
  if (titulo) {
    const baseTitle = 'Cotações por Status';
    titulo.innerHTML = titulo.innerHTML.replace(/Cotações por Status.*?(?=<|$)/, 
      ramoFiltro ? `Cotações por Status <span class="text-xs font-normal text-slate-400">(${ramoFiltro})</span>` : baseTitle);
  }
}

function atualizarGraficoRamo() {
  renderizarGraficoStatus();
}
window.atualizarGraficoRamo = atualizarGraficoRamo;

// Vencimentos Vertical
async function carregarVencimentosVertical() {
  const container = document.getElementById("listaVencimentos");
  if (!container) return;
  
  try {
    const vencimentos = [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    COTACOES_CACHE.forEach(c => {
      const st = String(c.status || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      if (st !== "negocio emitido") return;
      
      const fimVig = toDate(c.fimVigencia) || toDate(c.fimVigenciaStr) || toDate(c.vigenciaFinal) || toDate(c.vigencia_ate);
      if (!fimVig) return;
      
      const diffDias = Math.ceil((fimVig - hoje) / (1000 * 60 * 60 * 24));
      if (diffDias < -30) return;
      
      vencimentos.push({
        empresa: c.empresaNome || "Empresa",
        ramo: c.ramo || "-",
        data: fimVig,
        dataStr: fimVig.toLocaleDateString("pt-BR"),
        valor: parseValor(c.valorFinal ?? c.valorNegocio ?? c.premioLiquido ?? c.premio ?? 0),
        dias: diffDias,
        urgencia: diffDias < 0 ? "urgente" : diffDias <= 30 ? "proximo" : "normal"
      });
    });
    
    vencimentos.sort((a, b) => a.data - b.data);
    
    if (vencimentos.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="text-2xl mb-2">📅</div><div>Nenhum vencimento próximo</div></div>';
      return;
    }
    
    container.innerHTML = vencimentos.slice(0, 8).map(v => `
      <div class="venc-item ${v.urgencia}">
        <div class="venc-info">
          <div class="venc-empresa" title="${v.empresa}">${v.empresa}</div>
          <div class="venc-ramo">${v.ramo}</div>
        </div>
        <div class="venc-right">
          <div class="venc-data">${v.dataStr}</div>
          <div class="venc-valor">${fmtBRLCompact(v.valor)}</div>
        </div>
      </div>
    `).join('');
    
  } catch(e) {
    console.warn("Erro vencimentos:", e);
    container.innerHTML = '<div class="empty-state">Erro ao carregar</div>';
  }
}

// Override do carregarResumoPainel para incluir gráficos
const _carregarResumoPainelOriginal = carregarResumoPainel;
carregarResumoPainel = async function() {
  await _carregarResumoPainelOriginal();
  await carregarDadosGraficos();
  await carregarMovimentacoesComValor();
};

// Movimentações com valor
async function carregarMovimentacoesComValor() {
  const container = document.getElementById("feedMovimentacoes");
  if (!container) return;
  
  try {
    const docs = COTACOES_CACHE.slice().sort((a, b) => {
      const dtA = toDate(a.ultimaAtualizacao) || toDate(a.atualizadoEm) || toDate(a.dataCriacao) || new Date(0);
      const dtB = toDate(b.ultimaAtualizacao) || toDate(b.atualizadoEm) || toDate(b.dataCriacao) || new Date(0);
      return dtB - dtA;
    }).slice(0, 6);
    
    if (docs.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="text-2xl mb-2">📋</div><div>Sem movimentações</div></div>';
      return;
    }
    
    const statusColors = {
      'Negócio Emitido': 'bg-emerald-500',
      'Em Negociação': 'bg-blue-500',
      'Aguardando Cotação': 'bg-amber-500',
      'Aguardando Proposta': 'bg-violet-500',
      'Pendente Cliente': 'bg-yellow-500',
      'Pendente Agência': 'bg-orange-500',
      'Recusado Cliente': 'bg-red-500',
      'Recusado Seguradora': 'bg-red-600',
      'Negócio Iniciado': 'bg-indigo-500',
      'Perdido': 'bg-red-500',
      'Cancelado': 'bg-slate-400'
    };
    
    const statusBadgeColors = {
      'Negócio Emitido': 'badge-success',
      'Em Negociação': 'badge-info',
      'Aguardando Cotação': 'badge-warning',
      'Aguardando Proposta': 'badge-info',
      'Pendente Cliente': 'badge-warning',
      'Pendente Agência': 'badge-warning',
      'Recusado Cliente': 'badge-danger',
      'Recusado Seguradora': 'badge-danger',
      'Negócio Iniciado': 'badge-info',
      'Perdido': 'badge-danger',
      'Cancelado': 'badge-muted'
    };
    
    container.innerHTML = docs.map(d => {
      const valor = parseValor(d.valorFinal ?? d.valorNegocio ?? d.premioLiquido ?? d.premio ?? d.valorDesejado ?? 0);
      const dt = toDate(d.ultimaAtualizacao) || toDate(d.dataCriacao);
      const status = d.status || "-";
      const indicatorColor = statusColors[status] || 'bg-slate-300';
      const badgeColor = statusBadgeColors[status] || 'badge-muted';
      const obs = d.observacao || d.obs || d.descricao || "";
      
      return `
        <div class="activity-card">
          <div class="activity-indicator ${indicatorColor}"></div>
          <div class="pl-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="font-bold text-slate-800 text-sm">${d.empresaNome || "Empresa"}</div>
                <span class="badge ${badgeColor}">${status}</span>
              </div>
              <div class="text-right flex-shrink-0">
                <div class="text-[10px] text-slate-400">${d.rmNome || ""} • ${fmtData(dt)}</div>
                <div class="text-xs font-bold text-emerald-600">${fmtBRLCompact(valor)}</div>
              </div>
            </div>
            ${obs ? `<div class="text-xs text-slate-500 mt-1 truncate">${obs}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
    
  } catch(e) {
    console.warn("Erro movimentações:", e);
  }
}

// ==== Start ====
initAuth();
