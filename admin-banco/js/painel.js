// admin-banco/js/painel.js

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };

// ===== Utils
const normalizarPerfil = (p)=>String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase()
  .replace(/[-_]+/g," ")
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
  for(let i=0;i<n;i++){ const li=document.createElement("li");
    li.className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3";
    li.innerHTML='<div class="h-3 w-2/3 bg-slate-100 rounded"></div><div class="h-3 w-1/5 bg-slate-100 rounded"></div>';
    ul.appendChild(li);
  }
}

// ===== Auth + contexto
auth.onAuthStateChanged(async (user)=>{
  if(!user) return location.href="login.html";
  CTX.uid = user.uid;

  const prof = await db.collection("usuarios_banco").doc(user.uid).get();
  if(!prof.exists){ document.getElementById("perfilUsuario").textContent="Usuário não encontrado"; return; }

  const d = prof.data();
  CTX.perfil    = normalizarPerfil(d.perfil || "");
  CTX.agenciaId = d.agenciaId || d.agenciaid || null;
  CTX.nome      = d.nome || user.email;

  document.getElementById("perfilUsuario").textContent = `${CTX.nome} (${d.perfil||"sem perfil"})`;
  montarMenuLateral(CTX.perfil);
  carregarResumoPainel();
});

// ===== Menu por perfil (com “Funcionários” incluído)
function montarMenuLateral(perfilBruto){
  const menu=document.getElementById("menuNav"); if(!menu) return; menu.innerHTML="";
  const perfil=normalizarPerfil(perfilBruto);

  const CAT_BASE={
    "Cadastrar Gerentes":"cadastro-geral.html","Cadastrar Empresa":"cadastro-empresa.html","Agências":"agencias.html",
    "Agenda Visitas":"agenda-visitas.html","Visitas":"visitas.html","Empresas":"empresas.html",
    "Solicitações de Cotação":"cotacoes.html","Produção":"negocios-fechados.html","Consultar Dicas":"consultar-dicas.html",
    "Dicas Produtos":"dicas-produtos.html","Ramos Seguro":"ramos-seguro.html","Relatório Visitas":"visitas-relatorio.html",
    "Vencimentos":"vencimentos.html","Relatórios":"relatorios.html",
    "Funcionários":"funcionarios.html" // <— ADICIONADO
  };
  // Itens sigilosos — só ADMIN vê no menu
  const CAT_ADMIN_ONLY={
    "Carteira":"carteira.html",
    "Comissões":"comissoes.html",
    "Resgates (Admin)":"resgates-admin.html"
  };

  const LABEL=Object.fromEntries(Object.entries({...CAT_BASE, ...CAT_ADMIN_ONLY}).map(([k,v])=>[v,k]));
  const ADMIN=[...Object.values(CAT_BASE), ...Object.values(CAT_ADMIN_ONLY)];
  const RM=["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html","funcionarios.html"];
  const GER=["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html","funcionarios.html"];
  const AST=["agenda-visitas.html","visitas.html","cotacoes.html","consultar-dicas.html","funcionarios.html"];

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
    a.className = "flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-slate-100";
    a.innerHTML=`<span class="text-sm">🔹</span><span class="text-[15px]">${LABEL[h]||h}</span>`;
    menu.appendChild(a);
  });

  // garante que o nav apareça no mobile ao montar pela primeira vez
  if (window.innerWidth >= 1024) menu.classList.remove('hidden');
});

// ===== Painel
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

// --- 1) Visitas Agendadas (próximas; com fallback p/ últimos 20 dias) ---
async function blocoVisitasAgendadas(){
  const now = Date.now();

  // base + escopo
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

  document.getElementById("qtdVA").textContent = arr.length;
  const ul=document.getElementById("listaVisitasAgendadas");
  ul.innerHTML = arr.length?"":"<li class='text-slate-500 text-sm'>Nenhuma visita futura.</li>";
  arr.forEach(v=>{
    const li = document.createElement('li');
    li.className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3";
    li.innerHTML = `
      <div class="font-medium">${fmtData(v.dt)} ${fmtHora(v.dt)} — <strong>${v.empresaNome||v.empresa||"-"}</strong></div>
      <div class="text-slate-500 text-sm">${v.rmNome||v.rm||"-"} • ${v.tipo||"-"}</div>`;
    ul.appendChild(li);
  });
}

// --- 2) Minhas Visitas (últimas 5) ---
async function blocoMinhasVisitas(){
  let q = db.collection("visitas");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.limit(50).get();
  const ul = document.getElementById("listaVisitas"); ul.innerHTML="";
  if(snap.empty){ ul.innerHTML="<li class='text-slate-500 text-sm'>Nenhuma visita.</li>"; return; }

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
    const li = document.createElement('li');
    li.className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3";
    li.innerHTML = `<div class="font-medium"><strong>${nomeEmp}</strong></div><div class="text-slate-500 text-sm">${fmtData(dt)}${v.tipo? " • "+v.tipo:""}</div>`;
    ul.appendChild(li);
  }
}

// --- 3) Produção (Negócios Fechados via cotacoes-gerentes com status emitido) ---
async function blocoProducao(){
  let q = db.collection("cotacoes-gerentes");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.limit(100).get();
  const ul = document.getElementById("listaProducao"); ul.innerHTML="";
  if(snap.empty){ ul.innerHTML="<li class='text-slate-500 text-sm'>Nenhum negócio.</li>"; return; }

  const emitidos=[];
  snap.forEach(doc=>{
    const d=doc.data();
    const st = String(d.status||"")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().trim();
    if(st==="negocio emitido") emitidos.push(d);
  });

  if(!emitidos.length){ ul.innerHTML="<li class='text-slate-500 text-sm'>Nenhum negócio emitido.</li>"; return; }

  emitidos.sort((a,b)=> (toDate(b.dataCriacao)||0)-(toDate(a.dataCriacao)||0));
  emitidos.slice(0,5).forEach(d=>{
    const valor = d.valorFinal ?? d.valorNegocio ?? d.premio ?? d.valorDesejado ?? 0;
    const vIni  = toDate(d.vigenciaInicial) || toDate(d.vigenciaInicio) || toDate(d.vigencia_de) || null;
    const li = document.createElement('li');
    li.className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3";
    li.innerHTML = `<div class="font-medium"><strong>${d.empresaNome||"Empresa"}</strong> — ${d.ramo||"Ramo"}</div><div class="text-slate-500 text-sm">${fmtBRL(valor)} • início ${fmtData(vIni)}</div>`;
    ul.appendChild(li);
  });
}

// --- 4) Minhas Cotações ---
async function blocoMinhasCotacoes(){
  let q = db.collection("cotacoes-gerentes");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.limit(10).get();
  const ul = document.getElementById("listaCotacoes"); ul.innerHTML="";
  if(snap.empty){ ul.innerHTML="<li class='text-slate-500 text-sm'>Sem cotações.</li>"; return; }

  const docs=snap.docs.sort((a,b)=> (toDate(b.data().dataCriacao)||0)-(toDate(a.data().dataCriacao)||0)).slice(0,5);
  docs.forEach(doc=>{
    const d=doc.data();
    const valor = d.valorFinal ?? d.valorDesejado ?? 0;
    const li = document.createElement('li');
    li.className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3";
    li.innerHTML = `<div class="font-medium"><strong>${d.empresaNome||"Empresa"}</strong> — ${d.ramo||"Ramo"}</div><div class="text-slate-500 text-sm">${fmtBRL(valor)}</div>`;
    ul.appendChild(li);
  });
}

// ====== Troca de Senha (usuário logado)
(function initTrocaSenha(){
  const abrir   = document.getElementById("abrirTrocaSenha");
  const fechar  = document.getElementById("fecharTrocaSenha");
  const modal   = document.getElementById("modalTrocaSenha");
  const form    = document.getElementById("formTrocarSenha");
  const erroEl  = document.getElementById("trocaErro");
  const infoEl  = document.getElementById("trocaInfo");

  if(!abrir || !fechar || !modal || !form) return;

  const abrirModal  = ()=>{ erroEl.textContent=""; infoEl.textContent=""; form.reset(); modal.classList.remove('hidden'); };
  const fecharModal = ()=>{ modal.classList.add('hidden'); };

  abrir.addEventListener("click", abrirModal);
  fechar.addEventListener("click", fecharModal);
  modal.addEventListener("click", (e)=>{ if(e.target===modal) fecharModal(); });

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    erroEl.textContent=""; infoEl.textContent="";

    const senhaAtual = document.getElementById("senhaAtual").value.trim();
    const novaSenha  = document.getElementById("novaSenha").value.trim();
    const novaSenha2 = document.getElementById("novaSenha2").value.trim();

    if(novaSenha !== novaSenha2){
      erroEl.textContent = "As senhas novas não conferem.";
      return;
    }
    if(novaSenha.length < 6){
      erroEl.textContent = "A nova senha deve ter pelo menos 6 caracteres.";
      return;
    }

    const user = auth.currentUser;
    if(!user || !user.email){
      erroEl.textContent = "Você precisa estar logado.";
      return;
    }

    try {
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, senhaAtual);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(novaSenha);

      infoEl.textContent = "Senha atualizada com sucesso! Saindo...";
      setTimeout(()=>{
        auth.signOut().then(()=> location.href="login.html");
      }, 1200);

    } catch(err){
      console.error(err);
      erroEl.textContent = err?.message || "Erro ao trocar senha.";
    }
  });
})();
