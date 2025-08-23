// admin-banco/js/painel.js — persistência mobile + fallback admin por e‑mail + menu Funcionários

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };

// ===== Config: Admins por e‑mail (fallback quando não há usuarios_banco/{uid})
const ADMIN_EMAILS = [
  "patrick@retornoseguros.com.br"
  // adicione outros aqui, ex: "adm@retornoseguros.com.br"
];

// ===== Utils
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

// ===== Persistência (resolve sessão no mobile/Safari)
async function ensurePersistence() {
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (e1) {
    console.warn("LOCAL indisponível, tentando SESSION...", e1?.message);
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    } catch (e2) {
      console.warn("SESSION indisponível, usando NONE (memória).", e2?.message);
      await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
    }
  }
}

// ===== Init Auth com failback + fallback admin por e‑mail
async function initAuth() {
  await ensurePersistence();

  // Se em 5s não autenticou, volta pro login (evita “tela travada”)
  const failback = setTimeout(() => {
    if (!auth.currentUser) location.href = "login.html";
  }, 5000);

  auth.onAuthStateChanged(async (user)=>{
    if(!user){ clearTimeout(failback); location.href="login.html"; return; }
    clearTimeout(failback);

    CTX.uid = user.uid;

    // tenta carregar perfil em usuarios_banco
    let perfilSnap = null;
    try { perfilSnap = await db.collection("usuarios_banco").doc(user.uid).get(); }
    catch (e) { console.warn("Erro lendo usuarios_banco:", e?.message); }

    if (!perfilSnap || !perfilSnap.exists) {
      // Fallback: se o e‑mail for de admin conhecido, seguimos como admin
      if (ADMIN_EMAILS.includes((user.email||"").toLowerCase())) {
        CTX.perfil    = "admin";
        CTX.agenciaId = null;
        CTX.nome      = user.email || "admin";
        const elPerfil = document.getElementById("perfilUsuario");
        if (elPerfil) elPerfil.textContent = `${CTX.nome} (admin — fallback)`;
        montarMenuLateral(CTX.perfil);
        carregarResumoPainel();
        return;
      } else {
        const elPerfil = document.getElementById("perfilUsuario");
        if (elPerfil) elPerfil.textContent = "Usuário sem perfil cadastrado";
        console.error("Perfil não encontrado e e‑mail não é admin de fallback.");
        return;
      }
    }

    // Perfil encontrado normalmente
    const d = perfilSnap.data();
    CTX.perfil    = normalizarPerfil(d.perfil || "");
    CTX.agenciaId = d.agenciaId || d.agenciaid || null;
    CTX.nome      = d.nome || user.email;

    const elPerfil = document.getElementById("perfilUsuario");
    if (elPerfil) elPerfil.textContent = `${CTX.nome} (${d.perfil||"sem perfil"})`;

    montarMenuLateral(CTX.perfil);
    carregarResumoPainel();
  });
}

// ===== Menu lateral (inclui “Funcionários”)
function montarMenuLateral(perfilBruto){
  const menu=document.getElementById("menuNav"); if(!menu) return; menu.innerHTML="";
  const perfil=normalizarPerfil(perfilBruto);

  const CAT_BASE={
    "Cadastrar Gerentes":"cadastro-geral.html","Cadastrar Empresa":"cadastro-empresa.html","Agências":"agencias.html",
    "Agenda Visitas":"agenda-visitas.html","Visitas":"visitas.html","Empresas":"empresas.html",
    "Solicitações de Cotação":"cotacoes.html","Produção":"negocios-fechados.html","Consultar Dicas":"consultar-dicas.html",
    "Dicas Produtos":"dicas-produtos.html","Ramos Seguro":"ramos-seguro.html","Relatório Visitas":"visitas-relatorio.html",
    "Vencimentos":"vencimentos.html","Relatórios":"relatorios.html","Funcionários":"funcionarios.html"
  };
  const CAT_ADMIN_ONLY={
    "Carteira":"carteira.html","Comissões":"comissoes.html","Resgates (Admin)":"resgates-admin.html"
  };

  const LABEL=Object.fromEntries(Object.entries({...CAT_BASE, ...CAT_ADMIN_ONLY}).map(([k,v])=>[v,k]));
  const ADMIN=[...Object.values(CAT_BASE), ...Object.values(CAT_ADMIN_ONLY)];
  const RM = ["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html","funcionarios.html"];
  const GER= ["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html","funcionarios.html"];
  const AST= ["agenda-visitas.html","visitas.html","cotacoes.html","consultar-dicas.html","funcionarios.html"];

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
    a.innerHTML=`🔹 ${LABEL[h]||h}`;
    menu.appendChild(a);
  });
}

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

// --- 1) Visitas Agendadas ---
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

  document.getElementById("qtdVA").textContent = arr.length;
  const ul=document.getElementById("listaVisitasAgendadas");
  ul.innerHTML = arr.length?"":"<li class='row'><span class='meta'>Nenhuma visita futura.</span></li>";
  arr.forEach(v=>{
    ul.innerHTML += `<li class="row"><div class="title">${fmtData(v.dt)} ${fmtHora(v.dt)} — <strong>${v.empresaNome||v.empresa||"-"}</strong></div><div class="meta">${v.rmNome||v.rm||"-"} • ${v.tipo||"-"}</div></li>`;
  });
}

// --- 2) Minhas Visitas ---
async function blocoMinhasVisitas(){
  let q = db.collection("visitas");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.limit(50).get();
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

// --- 3) Produção ---
async function blocoProducao(){
  let q = db.collection("cotacoes-gerentes");
  if(CTX.perfil==="rm") q=q.where("rmUid","==",CTX.uid);
  else if(CTX.perfil==="assistente"||CTX.perfil==="gerente chefe") q=q.where("agenciaId","==",CTX.agenciaId);

  const snap = await q.limit(100).get();
  const ul = document.getElementById("listaProducao"); ul.innerHTML="";
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

  const docs=snap.docs.sort((a,b)=> (toDate(b.data().dataCriacao)||0)-(toDate(a.data().data)||0)).slice(0,5);
  docs.forEach(doc=>{
    const d=doc.data();
    const valor = d.valorFinal ?? d.valorDesejado ?? 0;
    ul.innerHTML += `<li class="row"><div class="title"><strong>${d.empresaNome||"Empresa"}</strong> — ${d.ramo||"Ramo"}</div><div class="meta">${fmtBRL(valor)}</div></li>`;
  });
}

// ====== Troca de Senha ======
(function initTrocaSenha(){
  const abrir   = document.getElementById("abrirTrocaSenha");
  const fechar  = document.getElementById("fecharTrocaSenha");
  const modal   = document.getElementById("modalTrocaSenha");
  const form    = document.getElementById("formTrocarSenha");
  const erroEl  = document.getElementById("trocaErro");
  const infoEl  = document.getElementById("trocaInfo");

  if(!abrir || !fechar || !modal || !form) return;

  const abrirModal  = ()=>{ erroEl.textContent=""; infoEl.textContent=""; form.reset(); modal.style.display="block"; };
  const fecharModal = ()=>{ modal.style.display="none"; };

  abrir.addEventListener("click", abrirModal);
  fechar.addEventListener("click", fecharModal);
  modal.addEventListener("click", (e)=>{ if(e.target===modal) fecharModal(); });

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    erroEl.textContent=""; infoEl.textContent="";

    const senhaAtual = document.getElementById("senhaAtual").value.trim();
    const novaSenha  = document.getElementById("novaSenha").value.trim();
    const novaSenha2 = document.getElementById("novaSenha2").value.trim();

    if(novaSenha !== novaSenha2){ erroEl.textContent = "As senhas novas não conferem."; return; }
    if(novaSenha.length < 6){ erroEl.textContent = "A nova senha deve ter pelo menos 6 caracteres."; return; }

    const user = auth.currentUser;
    if(!user || !user.email){ erroEl.textContent = "Você precisa estar logado."; return; }

    try {
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, senhaAtual);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(novaSenha);

      infoEl.textContent = "Senha atualizada com sucesso! Saindo...";
      setTimeout(()=>{ auth.signOut().then(()=> location.href="login.html"); }, 1200);
    } catch(err){
      console.error(err);
      erroEl.textContent = err?.message || "Erro ao trocar senha.";
    }
  });
})();

// ==== Start ====
initAuth();
