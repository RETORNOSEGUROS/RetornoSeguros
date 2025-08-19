// --- Firebase ---
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// Coleções
const colCotacoes = db.collection("cotacoes-gerentes");
const colUsuarios = db.collection("usuarios_banco");
const colAgencias = db.collection("agencias_banco");

// Estado / RBAC
let usuarioAtual=null, perfilAtual="", minhaAgencia="", isAdmin=false;
let docsBrutos = [];            // cotações emitidas (flatten)
let mapaRM = new Map();         // rmUid -> { nome, agenciaId, agenciaNome }
let mapaAgencia = new Map();    // agenciaId -> nome
let ramosUnicos = new Set();
let agenciasUnicas = new Set();

// Índice extra só para gerente-chefe (nome->bool) com RMs da sua agência
let nomesRMsDaMinhaAgencia = new Set();

// Utils
const fmtBRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const money  = n => fmtBRL.format(Number(n||0));
const norm   = s => (s||"").toString().normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();

function toISODate(v){
  try{
    if (!v) return "";
    if (typeof v==="string") { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const d=new Date(v); if(!isNaN(+d)) return d.toISOString().slice(0,10); return ""; }
    if (v.toDate) { const d=v.toDate(); return d.toISOString().slice(0,10); }
    if (v instanceof Date) return v.toISOString().slice(0,10);
  }catch(_){}
  return "";
}
const formatDateBR = iso => iso && iso.includes("-") ? iso.split("-").reverse().join("/") : "-";
function parsePremio(val){
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const n = String(val).replace(/[^\d,.-]/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".");
  const f = parseFloat(n); return isNaN(f) ? 0 : f;
}

async function getPerfilAgencia(){
  const u = auth.currentUser;
  if (!u) return {perfil:"",agenciaId:"",isAdmin:false};
  const doc = await colUsuarios.doc(u.uid).get();
  const d = doc.exists ? (doc.data()||{}) : {};
  const perfil = (d.perfil || d.roleId || "").toLowerCase();
  const admin = (perfil === "admin") || (u.email === "patrick@retornoseguros.com.br");
  return {perfil, agenciaId: d.agenciaId || "", isAdmin: admin, nome: d.nome || u.email};
}

auth.onAuthStateChanged(async (user)=>{
  if (!user) { location.href="login.html"; return; }
  usuarioAtual = user;
  const ctx = await getPerfilAgencia();
  perfilAtual  = ctx.perfil;
  minhaAgencia = ctx.agenciaId;
  isAdmin      = ctx.isAdmin;

  // Assistente não tem acesso a esta página
  if (perfilAtual === "assistente") {
    const tbody = document.getElementById("listaNegociosFechados");
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="muted">Seu perfil não possui acesso a Negócios Fechados.</td></tr>`;
    return;
  }

  await carregarNegociosRBAC();
  await montarFiltros();
  aplicarFiltros();

  document.getElementById('btnAplicar')?.addEventListener('click', aplicarFiltros);
  document.getElementById('btnLimpar')?.addEventListener('click', ()=>{
    ['fDataIni','fDataFim','fRm','fAgencia','fRamo','fEmpresa'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
    aplicarFiltros();
  });
});

/* ===== Coleta: somente o que o perfil pode ver ===== */
async function carregarNegociosRBAC(){
  docsBrutos = []; mapaRM.clear(); ramosUnicos.clear(); agenciasUnicas.clear();
  nomesRMsDaMinhaAgencia.clear();

  // 0) Se for gerente-chefe e tiver agência, pré-carrega os RMs da sua agência (para casar por nome quando faltar rmUid)
  if (!isAdmin && ["gerente-chefe","gerente chefe"].includes(perfilAtual) && minhaAgencia){
    const snap = await colUsuarios
      .where("agenciaId","==",minhaAgencia)
      .get();
    snap.forEach(doc=>{
      const u = doc.data()||{};
      const perfil = (u.perfil||u.roleId||"").toLowerCase();
      const ehRM = perfil === "rm" || perfil.includes("rm");
      if (ehRM && u.nome){
        nomesRMsDaMinhaAgencia.add(norm(u.nome));
      }
    });
  }

  // 1) Buscar cotações com status "Negócio Emitido"
  let docs = [];
  if (isAdmin) {
    docs = (await colCotacoes.where("status","==","Negócio Emitido").get()).docs;
  } else if (["gerente-chefe","gerente chefe"].includes(perfilAtual)) {
    // pega todas emitidas e filtra depois (por uid OU por nome)
    docs = (await colCotacoes.where("status","==","Negócio Emitido").get()).docs;
  } else {
    // RM: só dele (vários campos por compat)
    const buckets = [];
    try { buckets.push(await colCotacoes.where("status","==","Negócio Emitido").where("rmUid","==",usuarioAtual.uid).get()); } catch(_){}
    try { buckets.push(await colCotacoes.where("status","==","Negócio Emitido").where("rmId","==",usuarioAtual.uid).get()); } catch(_){}
    try { buckets.push(await colCotacoes.where("status","==","Negócio Emitido").where("criadoPorUid","==",usuarioAtual.uid).get()); } catch(_){}
    const map = new Map(); buckets.forEach(s=> s?.docs.forEach(d=> map.set(d.id,d)));
    docs = Array.from(map.values());
  }

  // 2) Montar base + coletar rmUids para resolver agência
  const rmUids = new Set();
  docs.forEach(doc=>{
    const d = doc.data()||{};
    const item = {
      id: doc.id,
      empresaNome: d.empresaNome || "-",
      ramo: d.ramo || "-",
      rmNome: d.rmNome || "-",
      rmUid: d.rmUid || d.rmUID || d.rmId || null,
      premioLiquido: parsePremio(d.premioLiquido ?? d.valorNegocio ?? d.valorDesejado ?? d.valorProposta ?? d.valor),
      inicioVigencia: toISODate(d.inicioVigencia),
      fimVigencia: toISODate(d.fimVigencia)
    };
    docsBrutos.push(item);
    ramosUnicos.add(item.ramo);
    if (item.rmUid) rmUids.add(item.rmUid);
  });

  // 3) Resolver RM -> agência (por uid)
  await Promise.all(Array.from(rmUids).map(async uid=>{
    try{
      const us = await colUsuarios.doc(uid).get();
      if (us.exists){
        const u = us.data()||{};
        mapaRM.set(uid, { nome: u.nome || "", agenciaId: u.agenciaId || "", agenciaNome: u.agenciaNome || "" });
      } else {
        mapaRM.set(uid, { nome: "", agenciaId: "", agenciaNome: "" });
      }
    }catch(_){ mapaRM.set(uid,{nome:"",agenciaId:"",agenciaNome:""}); }
  }));

  // 4) Agências (nome)
  const idsAg = Array.from(new Set(Array.from(mapaRM.values()).map(x=>x.agenciaId).filter(Boolean)));
  await Promise.all(idsAg.map(async id=>{
    if (!id || mapaAgencia.has(id)) return;
    try{
      const ag = await colAgencias.doc(id).get();
      mapaAgencia.set(id, ag.exists ? (ag.data().nome || ag.data().descricao || id) : id);
    }catch(_){ mapaAgencia.set(id,id); }
  }));

  // 5) Filtro RBAC para gerente-chefe -> somente negócios dos RMs da sua própria agência
  if (!isAdmin && ["gerente-chefe","gerente chefe"].includes(perfilAtual)) {
    if (minhaAgencia) {
      docsBrutos = docsBrutos.filter(d => {
        const info = d.rmUid ? (mapaRM.get(d.rmUid) || {}) : null;

        // Caso 1: tem rmUid -> valida agência pelo uid
        if (info && info.agenciaId) {
          return info.agenciaId === minhaAgencia;
        }

        // Caso 2: não tem rmUid -> tenta casar por nome com o índice de RMs da minha agência
        if (!d.rmUid && d.rmNome) {
          return nomesRMsDaMinhaAgencia.has(norm(d.rmNome));
        }

        // Sem rmUid e sem rmNome confiável -> não exibe
        return false;
      });
    } else {
      // Gerente-chefe sem agenciaId cadastrado: não restringe por RM para evitar lista vazia
      // (opcional: você pode trocar para docsBrutos = [] se preferir bloquear)
      docsBrutos = [];
    }
  }

  // set de nomes de agência para o filtro
  docsBrutos.forEach(d=>{
    const nomeAg = nomeAgenciaPorRmUid(d.rmUid);
    if (nomeAg && nomeAg !== "-") agenciasUnicas.add(nomeAg);
  });
}

function nomeAgenciaPorRmUid(rmUid){
  const info = mapaRM.get(rmUid);
  if (!info) return "-";
  if (info.agenciaNome) return info.agenciaNome;
  if (info.agenciaId && mapaAgencia.has(info.agenciaId)) return mapaAgencia.get(info.agenciaId);
  return info.agenciaId || "-";
}

/* ===== Filtros ===== */
async function montarFiltros(){
  const fRm = document.getElementById('fRm');
  if (fRm){
    fRm.innerHTML = `<option value="">Todos</option>`;
    const vistos = new Set();
    docsBrutos.forEach(d=>{
      const chave = d.rmUid || d.rmNome;
      if (!chave || vistos.has(chave)) return;
      vistos.add(chave);
      const rLabel = d.rmNome || (mapaRM.get(d.rmUid)?.nome) || d.rmUid || 'RM';
      fRm.insertAdjacentHTML('beforeend', `<option value="${chave}">${rLabel}</option>`);
    });
  }

  const fAg = document.getElementById('fAgencia');
  if (fAg){
    fAg.innerHTML = `<option value="">Todas</option>`;
    Array.from(agenciasUnicas).sort((a,b)=>a.localeCompare(b,'pt-BR'))
      .forEach(nome => fAg.insertAdjacentHTML('beforeend', `<option value="${nome}">${nome}</option>`));
  }

  const fRamo = document.getElementById('fRamo');
  if (fRamo){
    fRamo.innerHTML = `<option value="">Todos</option>`;
    Array.from(ramosUnicos).sort((a,b)=>a.localeCompare(b,'pt-BR'))
      .forEach(r => fRamo.insertAdjacentHTML('beforeend', `<option value="${r}">${r}</option>`));
  }
}

function aplicarFiltros(){
  const ini = document.getElementById('fDataIni')?.value || '';
  const fim = document.getElementById('fDataFim')?.value || '';
  const rmSel = document.getElementById('fRm')?.value || '';
  const agSel = document.getElementById('fAgencia')?.value || '';
  const ramoSel = document.getElementById('fRamo')?.value || '';
  const empTxt = norm(document.getElementById('fEmpresa')?.value || '');

  const lista = docsBrutos.filter(d=>{
    if (ini && (!d.inicioVigencia || d.inicioVigencia < ini)) return false;
    if (fim && (!d.inicioVigencia || d.inicioVigencia > fim)) return false;

    if (rmSel){
      if (d.rmUid){ if (d.rmUid !== rmSel) return false; }
      else if (norm(d.rmNome) !== norm(rmSel)) return false;
    }

    if (agSel){
      const agNome = nomeAgenciaPorRmUid(d.rmUid);
      if (agNome !== agSel) return false;
    }

    if (ramoSel && d.ramo !== ramoSel) return false;
    if (empTxt && !norm(d.empresaNome).includes(empTxt)) return false;

    return true;
  });

  renderTabela(lista);
  atualizarResumo(lista);
}

function atualizarResumo(lista){
  const infoQtd = document.getElementById('infoQtd');
  const totalPremio = document.getElementById('totalPremio');
  const soma = lista.reduce((acc,cur)=> acc + (Number(cur.premioLiquido)||0), 0);
  if (infoQtd) infoQtd.textContent = `${lista.length} negócio(s)`;
  if (totalPremio) totalPremio.textContent = `Total prêmio: ${money(soma)}`;
}

function renderTabela(lista){
  const tbody = document.getElementById('listaNegociosFechados');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!lista.length){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Sem resultados para os filtros atuais.</td></tr>`;
    return;
  }

  for (const d of lista){
    const agencia = nomeAgenciaPorRmUid(d.rmUid);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.empresaNome}</td>
      <td>${d.ramo}</td>
      <td>${d.rmNome || '-'}</td>
      <td>${agencia || '-'}</td>
      <td>${money(d.premioLiquido)}</td>
      <td>${formatDateBR(d.inicioVigencia)}</td>
      <td>${formatDateBR(d.fimVigencia)}</td>
    `;
    tbody.appendChild(tr);
  }
}
