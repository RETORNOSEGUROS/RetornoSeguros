// admin-banco/js/painel.js — versão SaaS

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };

// admins fallback (quando não há usuarios_banco/{uid})
const ADMIN_EMAILS = [
  "patrick@retornoseguros.com.br"
];

// ===== utils
const normalizarPerfil = (p)=>String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[-_]+/g," ").trim();

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
    li.innerHTML='<div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:20%"></div>';
    ul.appendChild(li);
  }
}

// ===== persistência no mobile
async function ensurePersistence() {
  try { await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); }
  catch (e1) {
    try { await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION); }
    catch (e2) { await auth.setPersistence(firebase.auth.Auth.Persistence.NONE); }
  }
}

// ===== init auth
async function initAuth() {
  await ensurePersistence();
  const failback = setTimeout(() => {
    if (!auth.currentUser) location.href = "login.html";
  }, 5000);

  auth.onAuthStateChanged(async (user)=>{
    if(!user){ clearTimeout(failback); location.href="login.html"; return; }
    clearTimeout(failback);

    CTX.uid = user.uid;
    let perfilSnap = null;
    try { perfilSnap = await db.collection("usuarios_banco").doc(user.uid).get(); }
    catch(e){}

    if (!perfilSnap || !perfilSnap.exists) {
      if (ADMIN_EMAILS.includes((user.email||"").toLowerCase())) {
        CTX.perfil="admin"; CTX.nome=user.email; CTX.agenciaId=null;
        document.getElementById("perfilUsuario").textContent = `${CTX.nome} (admin — fallback)`;
        montarMenuLateral(CTX.perfil); carregarResumoPainel(); return;
      } else {
        document.getElementById("perfilUsuario").textContent="Usuário sem perfil"; return;
      }
    }

    const d = perfilSnap.data();
    CTX.perfil    = normalizarPerfil(d.perfil||"");
    CTX.agenciaId = d.agenciaId || d.agenciaid || null;
    CTX.nome      = d.nome || user.email;
    document.getElementById("perfilUsuario").textContent = `${CTX.nome} (${d.perfil||"sem perfil"})`;

    montarMenuLateral(CTX.perfil);
    carregarResumoPainel();
  });
}

// ===== menu lateral moderno
function montarMenuLateral(perfilBruto){
  const nav=document.getElementById("menuNav"); if(!nav) return; nav.innerHTML="";
  const perfil=normalizarPerfil(perfilBruto);

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

  if(window.innerWidth>=1024) nav.classList.remove("hidden");
}

// ===== blocos do painel (mantidos iguais) ...
// [blocoVisitasAgendadas, blocoMinhasVisitas, blocoProducao, blocoMinhasCotacoes] 
// ===== troca de senha (mantido igual) ...

// ==== start
initAuth();
