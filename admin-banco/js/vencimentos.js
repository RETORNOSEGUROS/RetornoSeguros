/* global firebase, firebaseConfig */
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* ================= RBAC / contexto ================= */
let usuarioAtual = null;
let perfilAtual  = "";
let minhaAgencia = "";
let isAdmin      = false;

async function getPerfilAtual() {
  const u = auth.currentUser;
  if (!u) return { perfil:"", agenciaId:"", isAdmin:false };
  try {
    const snap = await db.collection("usuarios_banco").doc(u.uid).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    const perfil = (d.perfil || d.roleId || "").toLowerCase();
    const admin  = (perfil === "admin") || (u.email === "patrick@retornoseguros.com.br");
    return { perfil, agenciaId: d.agenciaId || "", isAdmin: admin };
  } catch {
    return { perfil:"", agenciaId:"", isAdmin:false };
  }
}

/* ================= DOM ================= */
const tbody    = document.getElementById("relatorioBody");
const fAgencia = document.getElementById("fAgencia");
const fRm      = document.getElementById("fRm");
const fEmpresa = document.getElementById("fEmpresa");
const fMes     = document.getElementById("fMes");
const fAno     = document.getElementById("fAno");
const fRamo    = document.getElementById("fRamo");
const fOrigem  = document.getElementById("fOrigem");
const kpiQtd   = document.getElementById("kpiQtd");
const kpiTotal = document.getElementById("kpiTotal");
const btnAplicar = document.getElementById("btnAplicar");
const btnLimpar  = document.getElementById("btnLimpar");

/* ================= Caches ================= */
const cacheEmpresas = {};
const cacheUsuarios = {}; // usamos só com try/catch

/* Empresas da minha agência (pra filtrar legado) */
let empresasDaMinhaAgencia = new Set();
async function carregarEmpresasDaMinhaAgencia() {
  empresasDaMinhaAgencia = new Set();
  if (!minhaAgencia) return;
  try {
    const snap = await db.collection("empresas").where("agenciaId","==",minhaAgencia).get();
    snap.forEach(doc => empresasDaMinhaAgencia.add(doc.id));
  } catch (e) {
    console.warn("Falha ao ler empresas da minha agência:", e);
  }
}

/* ================= Helpers ================= */
async function getEmpresaInfo(empId){
  if (!empId) return { nome:"-", rmNome:"-", agenciaId:"-" };
  if (cacheEmpresas[empId]) return cacheEmpresas[empId];
  try {
    const snap = await db.collection("empresas").doc(empId).get();
    if (!snap.exists) {
      const info = { nome: empId, rmNome:"-", agenciaId:"-" };
      cacheEmpresas[empId] = info; return info;
    }
    const d = snap.data() || {};
    const info = {
      nome: d.nome || empId,
      rmNome: d.rmNome || d.rm || "-",
      agenciaId: d.agenciaId || d.agencia || d.agencia_codigo || "-"
    };
    cacheEmpresas[empId] = info; return info;
  } catch {
    return { nome: empId, rmNome:"-", agenciaId:"-" };
  }
}

async function getUsuarioNome(uid){
  if (!uid) return "-";
  if (cacheUsuarios[uid]) return cacheUsuarios[uid];
  try {
    const s = await db.collection("usuarios").doc(uid).get(); // pode falhar p/ GC
    const nome = s.exists ? (s.data().nome || uid) : uid;
    cacheUsuarios[uid] = nome; return nome;
  } catch {
    return uid;
  }
}

function parseCurrency(v){
  if (v == null) return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/[^\d.,-]/g,"");
  const hasC = s.includes(","), hasD = s.includes(".");
  if (hasC && hasD) return Number(s.replace(/\./g,"").replace(",", ".")) || 0;
  if (hasC && !hasD) return Number(s.replace(",", ".")) || 0;
  if (!hasC && hasD) {
    const last = s.split(".").pop();
    return (last.length===2 ? Number(s) : Number(s.replace(/\./g,""))) || 0;
  }
  return Number(s) || 0;
}
function fmtMoney(n){ return (Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }

function parseFimVigencia(value){
  if (!value) return {date:null,dia:null,mes:null,ano:null,display:"-"};
  if (value && typeof value==="object" && typeof value.toDate==="function") {
    const d = value.toDate();
    return {date:d, dia:d.getDate(), mes:d.getMonth()+1, ano:d.getFullYear(), display:d.toLocaleDateString("pt-BR")};
  }
  if (value instanceof Date) {
    const d=value; return {date:d,dia:d.getDate(),mes:d.getMonth()+1,ano:d.getFullYear(),display:d.toLocaleDateString("pt-BR")};
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y,m,d] = s.split("-").map(Number); const dt=new Date(y,m-1,d);
    return {date:dt,dia:d,mes:m,ano:y,display:dt.toLocaleDateString("pt-BR")};
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d,m,y] = s.split("/").map(Number); const dt=new Date(y,m-1,d);
    return {date:dt,dia:d,mes:m,ano:y,display:`${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`};
  }
  if (/^\d{1,2}\/\d{1,2}$/.test(s)) {
    const [d,m]=s.split("/").map(Number);
    return {date:null,dia:d,mes:m,ano:null,display:`${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}`};
  }
  return {date:null,dia:null,mes:null,ano:null,display:s};
}

/* ================= Coletas com RBAC ================= */
async function listarVisitasRBAC(){
  const col = db.collection("visitas");

  // Admin → tudo
  if (isAdmin) {
    try { return (await col.orderBy("criadoEm","desc").get()).docs; }
    catch { return (await col.get()).docs; }
  }

  // Gerente‑chefe / Assistente
  if (["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
    const map = new Map();

    // 1) docs já com agenciaId
    try {
      const sA = await col.where("agenciaId","==",minhaAgencia).get();
      sA.forEach(d => map.set(d.id,d));
    } catch (e) {
      console.warn("visitas.agenciaId query falhou:", e);
    }

    // 2) complemento por empresaId (legado)
    if (empresasDaMinhaAgencia.size) {
      const ids = Array.from(empresasDaMinhaAgencia);
      for (let i=0;i<ids.length;i+=10) {
        const slice = ids.slice(i,i+10);
        try {
          const sB = await col.where("empresaId","in", slice).get();
          sB.forEach(d => map.set(d.id,d));
        } catch (e2) {
          // fallback custoso: pega tudo e filtra
          try {
            const sAll = await col.get();
            sAll.forEach(d => {
              const eid = (d.data()||{}).empresaId;
              if (eid && empresasDaMinhaAgencia.has(eid)) map.set(d.id,d);
            });
            break;
          } catch (_) {}
        }
      }
    }
    return Array.from(map.values());
  }

  // RM → próprios (compat com vários campos)
  const buckets = [];
  try { buckets.push(await col.where("usuarioId","==",usuarioAtual.uid).get()); } catch(_){}
  try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); } catch(_){}
  try { buckets.push(await col.where("rmId","==",usuarioAtual.uid).get()); } catch(_){}
  try { buckets.push(await col.where("gerenteId","==",usuarioAtual.uid).get()); } catch(_){}
  try { buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).get()); } catch(_){}
  const map = new Map(); buckets.forEach(s=> s?.docs.forEach(d=> map.set(d.id,d)));
  return Array.from(map.values());
}

async function listarNegociosEmitidosRBAC(){
  const base = db.collection("cotacoes-gerentes").where("status","==","Negócio Emitido");

  if (isAdmin) return (await base.get()).docs;

  // RM: somente próprios
  if (!["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual)) {
    const buckets = [];
    try { buckets.push(await base.where("rmUid","==",usuarioAtual.uid).get()); } catch(_){}
    try { buckets.push(await base.where("rmId","==",usuarioAtual.uid).get()); } catch(_){}
    try { buckets.push(await base.where("criadoPorUid","==",usuarioAtual.uid).get()); } catch(_){}
    const map = new Map(); buckets.forEach(s=> s?.docs.forEach(d=> map.set(d.id,d)));
    return Array.from(map.values());
  }

  // Gerente‑chefe/Assistente: lê emitidos e filtra por agência (agenciaId do doc ou da empresa)
  return (await base.get()).docs;
}

/* ================= Montagem do dataset ================= */
let REGISTROS = [];

async function carregarDados(){
  REGISTROS = [];

  // VISITAS
  const vDocs = await listarVisitasRBAC();
  for (const doc of vDocs) {
    const v = doc.data() || {};
    const empresaId = v.empresaId;
    const emp = await getEmpresaInfo(empresaId);

    // segurança extra para GC/assistente
    if (!isAdmin && ["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
      const ag = v.agenciaId || emp.agenciaId || "-";
      if (ag !== minhaAgencia) continue;
    }
    // segurança extra para RM
    if (!isAdmin && !["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual)) {
      const donos = [v.usuarioId, v.rmUid, v.rmId, v.gerenteId, v.criadoPorUid].filter(Boolean);
      if (!donos.includes(usuarioAtual.uid)) continue;
    }

    const ramos = v.ramos || {};
    for (const key of Object.keys(ramos)) {
      const item = ramos[key] || {};
      const fim = parseFimVigencia(item.vencimento || item.fimVigencia || v.vencimento);
      REGISTROS.push({
        origem: "Visita",
        empresaId,
        empresaNome: emp.nome,
        agenciaId: v.agenciaId || emp.agenciaId || "-",
        rmNome: v.rmNome || emp.rmNome || "-",
        ramo: (key || item.ramo || "-").toString().replace(/_/g," ").toUpperCase(),
        fim,
        premio: parseCurrency(item.premio),
        seguradora: item.seguradora || "-",
        observacoes: item.observacoes || "-"
      });
    }
  }

  // NEGÓCIOS EMITIDOS
  const nDocs = await listarNegociosEmitidosRBAC();
  for (const doc of nDocs) {
    const c = doc.data() || {};
    const emp = await getEmpresaInfo(c.empresaId);

    // GC/assistente: filtra por agência (doc ou empresa)
    if (!isAdmin && ["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
      const ag = c.agencia || c.agenciaId || emp.agenciaId || "-";
      if (ag !== minhaAgencia) continue;
    }

    const fim = parseFimVigencia(
      c.fimVigencia || c.fimVigenciaStr || c.vigenciaFinal || c.vigencia_final || c.fimVigenciaTs
    );

    let rmNome = c.rmNome || c.rm || emp.rmNome;
    if (!rmNome && c.autorUid) rmNome = await getUsuarioNome(c.autorUid);

    REGISTROS.push({
      origem: "Negócio Fechado",
      empresaId: c.empresaId,
      empresaNome: c.empresaNome || emp.nome,
      agenciaId: c.agencia || c.agenciaId || emp.agenciaId || "-",
      rmNome: rmNome || "-",
      ramo: (c.ramo || "-").toString(),
      fim,
      premio: parseCurrency(c.premioLiquido ?? c.premio_liquido ?? c.valorNegocio ?? c.premio ?? c.valorDesejado ?? c.valor_desejado ?? c.valorAnualDesejado ?? c.valor_anual_desejado),
      seguradora: c.seguradora || "Bradesco Seguros",
      observacoes: c.observacoes || "-"
    });
  }

  popularFiltros();
  aplicarFiltros();
}

/* ================= Filtros / render ================= */
function uniqueSorted(arr){ return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>`${a}`.localeCompare(`${b}`,'pt-BR')); }

function popularFiltros(){
  // mês
  const meses = ["", "01 - Janeiro","02 - Fevereiro","03 - Março","04 - Abril","05 - Maio","06 - Junho","07 - Julho","08 - Agosto","09 - Setembro","10 - Outubro","11 - Novembro","12 - Dezembro"];
  fMes.innerHTML = meses.map((m,i)=> i===0? `<option value="">Todos</option>` : `<option value="${String(i).padStart(2,"0")}">${m}</option>`).join("");

  // demais selects a partir do dataset
  const anos = uniqueSorted(REGISTROS.map(r=>r.fim.ano).filter(Boolean));
  fAno.innerHTML = `<option value="">Todos</option>` + anos.map(a=>`<option>${a}</option>`).join("");

  const ags = uniqueSorted(REGISTROS.map(r=>r.agenciaId));
  fAgencia.innerHTML = `<option value="">Todas</option>` + ags.map(a=>`<option>${a}</option>`).join("");

  const rms = uniqueSorted(REGISTROS.map(r=>r.rmNome));
  fRm.innerHTML = `<option value="">Todos</option>` + rms.map(a=>`<option>${a}</option>`).join("");

  const ramos = uniqueSorted(REGISTROS.map(r=>r.ramo));
  fRamo.innerHTML = `<option value="">Todos</option>` + ramos.map(a=>`<option>${a}</option>`).join("");
}

btnAplicar.addEventListener("click", aplicarFiltros);
btnLimpar.addEventListener("click", ()=>{
  fAgencia.value=""; fRm.value=""; fEmpresa.value=""; fMes.value=""; fAno.value=""; fRamo.value=""; fOrigem.value="";
  aplicarFiltros();
});

function aplicarFiltros(){
  const vAg = fAgencia.value.trim();
  const vRm = fRm.value.trim().toLowerCase();
  const vEmp = fEmpresa.value.trim().toLowerCase();
  const vMes = fMes.value.trim();
  const vAno = fAno.value.trim();
  const vRamo = fRamo.value.trim().toLowerCase();
  const vOrig = fOrigem.value.trim();

  const data = REGISTROS.filter(r=>{
    if (vAg && `${r.agenciaId}` !== vAg) return false;
    if (vRm && (r.rmNome||"").toLowerCase() !== vRm) return false;
    if (vEmp && !(`${r.empresaNome}`.toLowerCase().includes(vEmp))) return false;
    if (vRamo && (r.ramo||"").toLowerCase() !== vRamo) return false;
    if (vOrig && r.origem !== vOrig) return false;

    const mesStr = r.fim.mes ? String(r.fim.mes).padStart(2,"0") : "";
    if (vMes && mesStr !== vMes) return false;
    if (vAno && r.fim.ano !== Number(vAno)) return false;
    return true;
  });

  renderTabela(data);
  atualizarKPIs(data);
}

function atualizarKPIs(data){
  kpiQtd.textContent = data.length.toString();
  const total = data.reduce((s,r)=> s + (Number(r.premio)||0), 0);
  kpiTotal.textContent = fmtMoney(total);
}

function renderTabela(data){
  const rows = data
    .sort((a,b)=>{
      const ak = a.fim.ano ? `${a.fim.ano}-${String(a.fim.mes||0).padStart(2,"0")}-${String(a.fim.dia||0).padStart(2,"0")}` : "9999-99-99";
      const bk = b.fim.ano ? `${b.fim.ano}-${String(b.fim.mes||0).padStart(2,"0")}-${String(b.fim.dia||0).padStart(2,"0")}` : "9999-99-99";
      return ak.localeCompare(bk);
    })
    .map(r=>{
      const badge = r.origem==="Visita" ? `<span class="badge visit">Visita</span>` : `<span class="badge negocio">Negócio Fechado</span>`;
      return `
        <tr>
          <td>${badge}</td>
          <td class="nowrap">${r.fim.display}</td>
          <td>${escapeHtml(r.empresaNome)}</td>
          <td>${escapeHtml(r.agenciaId || "-")}</td>
          <td>${escapeHtml(r.rmNome || "-")}</td>
          <td>${escapeHtml(r.ramo || "-")}</td>
          <td class="money nowrap">${fmtMoney(r.premio)}</td>
          <td>${escapeHtml(r.seguradora || "-")}</td>
          <td class="muted">${escapeHtml(r.observacoes || "-")}</td>
        </tr>`;
    }).join("");

  tbody.innerHTML = rows || `<tr><td colspan="9" class="muted" style="padding:24px">Nenhum registro no filtro atual.</td></tr>`;
}
function escapeHtml(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* ================= Boot ================= */
auth.onAuthStateChanged(async (user)=>{
  if (!user) { location.href = "login.html"; return; }
  usuarioAtual = user;

  const ctx = await getPerfilAtual();
  perfilAtual  = ctx.perfil;
  minhaAgencia = ctx.agenciaId;
  isAdmin      = ctx.isAdmin;

  if (!isAdmin && ["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
    await carregarEmpresasDaMinhaAgencia();
  }

  await carregarDados();
});
