/* global firebase, firebaseConfig */
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* ==== Estado / RBAC ==== */
let usuarioAtual = null;
let perfilAtual  = "";
let minhaAgencia = "";
let isAdmin      = false;

/* ==== DOM ==== */
const tbody      = document.getElementById("relatorioBody");
const fAgencia   = document.getElementById("fAgencia");
const fRm        = document.getElementById("fRm");
const fEmpresa   = document.getElementById("fEmpresa");
const fMes       = document.getElementById("fMes");
const fAno       = document.getElementById("fAno");
const fRamo      = document.getElementById("fRamo");
const fOrigem    = document.getElementById("fOrigem");
const kpiQtd     = document.getElementById("kpiQtd");
const kpiTotal   = document.getElementById("kpiTotal");
const btnAplicar = document.getElementById("btnAplicar");
const btnLimpar  = document.getElementById("btnLimpar");

/* ==== Caches ==== */
const cacheUsuarios = {};
const cacheEmpresas = {};
const agenciasMap   = {};   // {id: "Nome — Banco / Cidade - UF"}

/* ==== Utils ==== */
function fmtMoney(n){ return (Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function parseCurrency(input){
  if (input == null) return 0;
  if (typeof input === "number") return input;
  let s = String(input).trim().replace(/[^\d.,-]/g,"");
  const hasC = s.includes(","), hasD = s.includes(".");
  if (hasC && hasD) return Number(s.replace(/\./g,"").replace(",", "."))||0;
  if (hasC && !hasD) return Number(s.replace(",", "."))||0;
  if (!hasC && hasD){ const last=s.split(".").pop(); return (last.length===2?Number(s):Number(s.replace(/\./g,"")))||0; }
  return Number(s)||0;
}
function parseFimVigencia(value){
  if (!value) return { date:null, dia:null, mes:null, ano:null, display:"-" };
  if (value && typeof value === "object" && typeof value.toDate === "function"){
    const d=value.toDate(); return {date:d,dia:d.getDate(),mes:d.getMonth()+1,ano:d.getFullYear(),display:d.toLocaleDateString("pt-BR")};
  }
  if (value instanceof Date){
    return {date:value,dia:value.getDate(),mes:value.getMonth()+1,ano:value.getFullYear(),display:value.toLocaleDateString("pt-BR")};
  }
  const s=String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)){ const [y,m,d]=s.split("-").map(Number); const dt=new Date(y,m-1,d);
    return {date:dt,dia:d,mes:m,ano:y,display:`${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`}; }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)){ const [d,m,y]=s.split("/").map(Number); const dt=new Date(y,m-1,d);
    return {date:dt,dia:d,mes:m,ano:y,display:`${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`}; }
  if (/^\d{1,2}\/\d{1,2}$/.test(s)){ const [d,m]=s.split("/").map(Number);
    return {date:null,dia:d,mes:m,ano:null,display:`${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}`}; }
  return {date:null,dia:null,mes:null,ano:null,display:s};
}

async function getPerfilAtual(){
  const u=auth.currentUser; if(!u) return {perfil:"",agenciaId:"",isAdmin:false};
  try{
    const snap=await db.collection("usuarios_banco").doc(u.uid).get();
    const d=snap.exists?(snap.data()||{}):{};
    const perfil=(d.perfil||d.roleId||"").toLowerCase();
    const admin = (perfil==="admin") || (u.email==="patrick@retornoseguros.com.br");
    return {perfil,agenciaId:d.agenciaId||"",isAdmin:admin};
  }catch{ return {perfil:"",agenciaId:"",isAdmin:false}; }
}

/* ==== Leitura básica (empresa & usuário) ==== */
async function getUsuarioNome(uid){
  if(!uid) return "-";
  if(cacheUsuarios[uid]) return cacheUsuarios[uid];
  try{
    const s=await db.collection("usuarios").doc(uid).get();
    const nome = s.exists ? (s.data().nome||uid) : uid;
    cacheUsuarios[uid]=nome; return nome;
  }catch{ return uid; }
}

async function getEmpresaInfo(empId){
  if(!empId) return {nome:"-", rmNome:"-", agenciaId:"-"};
  if(cacheEmpresas[empId]) return cacheEmpresas[empId];
  try{
    const s=await db.collection("empresas").doc(empId).get();
    if(!s.exists){ const info={nome:empId,rmNome:"-",agenciaId:"-"}; cacheEmpresas[empId]=info; return info; }
    const d=s.data();
    const info={
      nome: d?.nome || empId,
      rmNome: d?.rm || d?.rmNome || "-",
      agenciaId: d?.agencia || d?.agenciaId || d?.agencia_codigo || "-"
    };
    cacheEmpresas[empId]=info; return info;
  }catch{ return {nome:empId,rmNome:"-",agenciaId:"-"}; }
}

/* ==== Agências (para rótulo) ==== */
async function carregarAgenciasMap(){
  let snap;
  try{ snap = await db.collection("agencias_banco").orderBy("nome").get(); }
  catch{ snap = await db.collection("agencias_banco").get(); }
  snap.forEach(doc=>{
    const a = doc.data()||{};
    const id = doc.id;
    const nome   = (a.nome || "(Sem nome)").toString();
    const banco  = a.banco ? ` — ${a.banco}` : "";
    const cidade = (a.Cidade || a.cidade || "").toString();
    const cidadeFmt = cidade ? ` / ${cidade}` : "";
    const uf     = (a.estado || a.UF || "").toString().toUpperCase();
    const ufFmt  = uf ? ` - ${uf}` : "";
    agenciasMap[id] = `${nome}${banco}${cidadeFmt}${ufFmt}`;
  });
}

/* ==== RBAC – consultas ==== */
async function listarVisitasRBAC(){
  const col = db.collection("visitas");
  if (isAdmin){
    try{ return (await col.orderBy("criadoEm","desc").get()).docs; }
    catch{ return (await col.get()).docs; }
  }
  if (["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia){
    // tentar direto por agenciaId; docs legados serão filtrados via empresa
    try{ return (await col.where("agenciaId","==",minhaAgencia).get()).docs; }
    catch{ return (await col.get()).docs; }
  }
  // RM: apenas dele (aceitando vários campos)
  const buckets=[];
  try{ buckets.push(await col.where("usuarioId","==",usuarioAtual.uid).get()); }catch(_){}
  try{ buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); }catch(_){}
  try{ buckets.push(await col.where("rmId","==",usuarioAtual.uid).get()); }catch(_){}
  try{ buckets.push(await col.where("gerenteId","==",usuarioAtual.uid).get()); }catch(_){}
  try{ buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).get()); }catch(_){}
  const map=new Map(); buckets.forEach(s=> s?.docs.forEach(d=>map.set(d.id,d)));
  return Array.from(map.values());
}

async function listarNegociosRBAC(){
  const col = db.collection("cotacoes-gerentes").where("status","==","Negócio Emitido");
  if (isAdmin) return (await col.get()).docs;

  // RM: somente dele
  if (!["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual)){
    const buckets=[];
    try{ buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); }catch(_){}
    try{ buckets.push(await col.where("rmId","==",usuarioAtual.uid).get()); }catch(_){}
    try{ buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).get()); }catch(_){}
    const map=new Map(); buckets.forEach(s=> s?.docs.forEach(d=>map.set(d.id,d)));
    return Array.from(map.values());
  }
  // Chefe/Assistente: busca emitidos e filtra pela agência da empresa/doc
  return (await col.get()).docs;
}

/* ==== Dataset unificado ==== */
let REGISTROS = [];  // {origem, empresaNome, agenciaId, agenciaLabel, rmNome, ramo, fim:{...}, premio, ...}

async function carregarDados(){
  REGISTROS = [];

  // VISITAS -> um registro por ramo
  const visitasDocs = await listarVisitasRBAC();
  for (const doc of visitasDocs){
    const v = doc.data() || {};
    const emp = await getEmpresaInfo(v.empresaId);

    // GC/Assistente: precisa bater a agência (doc.agenciaId OU empresa.agenciaId)
    if (!isAdmin && ["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia){
      const ag = v.agenciaId || emp.agenciaId || "-";
      if (ag !== minhaAgencia) continue;
    }
    // RM: segurança extra – precisa ser "dono"
    if (!isAdmin && !["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual)){
      const donos=[v.usuarioId,v.rmUid,v.rmId,v.gerenteId,v.criadoPorUid].filter(Boolean);
      if (!donos.includes(usuarioAtual.uid)) continue;
    }

    const ramos = v.ramos || {};
    for (const key of Object.keys(ramos)){
      const item = ramos[key] || {};
      const fim  = parseFimVigencia(item.vencimento || item.vencimentoStr || item.fimVigencia || v.vencimento);
      const premioNum = parseCurrency(item.premio);

      const agId = v.agenciaId || emp.agenciaId || "-";
      REGISTROS.push({
        origem: "Visita",
        empresaId: v.empresaId,
        empresaNome: emp.nome,
        agenciaId: agId,
        agenciaLabel: agenciasMap[agId] || agId || "-",
        rmNome: emp.rmNome || "-",
        ramo: (key || item.ramo || "-").toString().replace(/_/g," ").toUpperCase(),
        fim,
        premio: premioNum,
        seguradora: item.seguradora || "-",
        observacoes: item.observacoes || "-"
      });
    }
  }

  // NEGÓCIOS FECHADOS
  const negDocs = await listarNegociosRBAC();
  for (const doc of negDocs){
    const c = doc.data() || {};
    const emp = await getEmpresaInfo(c.empresaId);

    // GC/Assistente: filtra por agência
    if (!isAdmin && ["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia){
      const ag = c.agencia || c.agenciaId || emp.agenciaId || "-";
      if (ag !== minhaAgencia) continue;
    }

    const fim = parseFimVigencia(
      c.fimVigencia || c.fimVigenciaStr || c.vigenciaFinal || c.vigencia_final || c.fimVigenciaTs
    );
    const premioNum = parseCurrency(
      c.premioLiquido ?? c.premio_liquido ?? c.valorNegocio ?? c.premio ??
      c.valorDesejado ?? c.valor_desejado ?? c.valorAnualDesejado ?? c.valor_anual_desejado
    );

    const agId = c.agencia || c.agenciaId || emp.agenciaId || "-";
    let rmNome = c.rmNome || c.rm || emp.rmNome;
    if (!rmNome && c.autorUid) rmNome = await getUsuarioNome(c.autorUid);

    REGISTROS.push({
      origem: "Negócio Fechado",
      empresaId: c.empresaId,
      empresaNome: emp.nome,
      agenciaId: agId,
      agenciaLabel: agenciasMap[agId] || agId || "-",
      rmNome: rmNome || "-",
      ramo: (c.ramo || "-").toString(),
      fim,
      premio: premioNum,
      seguradora: "Bradesco Seguros",
      observacoes: c.observacoes || "-"
    });
  }

  popularFiltros();
  aplicarFiltros();
}

/* ==== Filtros ==== */
function uniqueSorted(arr){ return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>`${a}`.localeCompare(`${b}`,"pt-BR")); }

function popularFiltros(){
  // Meses
  const meses = ["","01 - Janeiro","02 - Fevereiro","03 - Março","04 - Abril","05 - Maio","06 - Junho","07 - Julho","08 - Agosto","09 - Setembro","10 - Outubro","11 - Novembro","12 - Dezembro"];
  if (fMes){
    fMes.innerHTML = meses.map((m,i)=> i===0? `<option value="">Todos</option>` : `<option value="${String(i).padStart(2,"0")}">${m}</option>`).join("");
  }

  // Ano
  const anos = uniqueSorted(REGISTROS.map(r=>r.fim.ano).filter(Boolean));
  if (fAno) fAno.innerHTML = `<option value="">Todos</option>` + anos.map(a=>`<option>${a}</option>`).join("");

  // Agência (usa label)
  const ags = uniqueSorted(REGISTROS.map(r=>r.agenciaLabel||r.agenciaId).filter(Boolean));
  if (fAgencia) fAgencia.innerHTML = `<option value="">Todas</option>` + ags.map(a=>`<option>${a}</option>`).join("");

  // RM (nome)
  const rms = uniqueSorted(REGISTROS.map(r=>r.rmNome).filter(Boolean));
  if (fRm) fRm.innerHTML = `<option value="">Todos</option>` + rms.map(a=>`<option>${a}</option>`).join("");

  // Ramo
  const ramos = uniqueSorted(REGISTROS.map(r=>r.ramo));
  if (fRamo) fRamo.innerHTML = `<option value="">Todos</option>` + ramos.map(a=>`<option>${a}</option>`).join("");
}

/* ==== Aplicar / Limpar ==== */
btnAplicar?.addEventListener("click", aplicarFiltros);
btnLimpar?.addEventListener("click", ()=>{
  if (fAgencia) fAgencia.value="";
  if (fRm)      fRm.value="";
  if (fEmpresa) fEmpresa.value="";
  if (fMes)     fMes.value="";
  if (fAno)     fAno.value="";
  if (fRamo)    fRamo.value="";
  if (fOrigem)  fOrigem.value="";
  aplicarFiltros();
});

function aplicarFiltros(){
  const vAg   = (fAgencia?.value||"").trim();         // comparação por label
  const vRm   = (fRm?.value||"").trim().toLowerCase();
  const vEmp  = (fEmpresa?.value||"").trim().toLowerCase();
  const vMes  = (fMes?.value||"").trim();
  const vAno  = (fAno?.value||"").trim();
  const vRamo = (fRamo?.value||"").trim().toLowerCase();
  const vOrig = (fOrigem?.value||"").trim();

  const data = REGISTROS.filter(r=>{
    if (vAg   && (r.agenciaLabel||r.agenciaId) !== vAg) return false;
    if (vRm   && (r.rmNome||"").toLowerCase() !== vRm)  return false;
    if (vEmp  && !(`${r.empresaNome}`.toLowerCase().includes(vEmp))) return false;
    if (vRamo && (r.ramo||"").toLowerCase() !== vRamo)  return false;
    if (vOrig && r.origem !== vOrig) return false;

    const mesStr = r.fim.mes ? String(r.fim.mes).padStart(2,"0") : "";
    if (vMes && mesStr !== vMes) return false;
    if (vAno && r.fim.ano !== Number(vAno)) return false;
    return true;
  });

  renderTabela(data);
  atualizarKPIs(data);
}

function atualizarKPIs(rows){
  if (kpiQtd)   kpiQtd.textContent   = rows.length.toString();
  if (kpiTotal){
    const total = rows.reduce((s,r)=> s + (Number(r.premio)||0), 0);
    kpiTotal.textContent = fmtMoney(total);
  }
}

function escapeHtml(s){ return String(s ?? "").replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function renderTabela(rows){
  const html = rows
    .sort((a,b)=>{
      const ak = a.fim.ano ? `${a.fim.ano}-${String(a.fim.mes||0).padStart(2,"0")}-${String(a.fim.dia||0).padStart(2,"0")}` : "9999-99-99";
      const bk = b.fim.ano ? `${b.fim.ano}-${String(b.fim.mes||0).padStart(2,"0")}-${String(b.fim.dia||0).padStart(2,"0")}` : "9999-99-99";
      return ak.localeCompare(bk);
    })
    .map(r=>`
      <tr>
        <td>${r.origem==="Visita"
          ? '<span class="badge visit">Visita</span>'
          : '<span class="badge negocio">Negócio Fechado</span>'}</td>
        <td class="nowrap">${r.fim.display}</td>
        <td>${escapeHtml(r.empresaNome)}</td>
        <td>${escapeHtml(r.agenciaLabel || r.agenciaId || "-")}</td>
        <td>${escapeHtml(r.rmNome || "-")}</td>
        <td>${escapeHtml(r.ramo || "-")}</td>
        <td class="money nowrap">${fmtMoney(r.premio)}</td>
        <td>${escapeHtml(r.seguradora || "-")}</td>
        <td class="muted">${escapeHtml(r.observacoes || "-")}</td>
      </tr>
    `).join("");

  tbody.innerHTML = html || `<tr><td colspan="9" class="muted" style="padding:24px">Nenhum registro no filtro atual.</td></tr>`;
}

/* ==== Boot ==== */
auth.onAuthStateChanged(async (user)=>{
  if (!user){ location.href="login.html"; return; }
  usuarioAtual = user;

  const ctx = await getPerfilAtual();
  perfilAtual  = ctx.perfil;
  minhaAgencia = ctx.agenciaId;
  isAdmin      = ctx.isAdmin;

  await carregarAgenciasMap();
  await carregarDados();
});
