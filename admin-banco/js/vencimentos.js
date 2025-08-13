/* global firebase, firebaseConfig */
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ======== RBAC (perfil/agência)
let usuarioAtual = null;
let perfilAtual = "";
let minhaAgencia = "";
let isAdmin = false;

async function getPerfilAtual() {
  const u = auth.currentUser;
  if (!u) return { perfil: "", agenciaId: "", isAdmin: false };
  try {
    const snap = await db.collection("usuarios_banco").doc(u.uid).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    const perfil = (d.perfil || d.roleId || "").toLowerCase();
    const admin = perfil === "admin" || u.email === "patrick@retornoseguros.com.br";
    return { perfil, agenciaId: d.agenciaId || "", isAdmin: admin };
  } catch {
    return { perfil: "", agenciaId: "", isAdmin: false };
  }
}

// ======== DOM
const tbody = document.getElementById("relatorioBody");
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

// ======== Caches básicos
const cacheUsuarios = {};
const cacheEmpresas = {};

async function getUsuarioNome(uid) {
  if (!uid) return "-";
  if (cacheUsuarios[uid]) return cacheUsuarios[uid];
  try {
    const snap = await db.collection("usuarios").doc(uid).get();
    const nome = snap.exists ? (snap.data().nome || uid) : uid;
    cacheUsuarios[uid] = nome;
    return nome;
  } catch {
    return uid;
  }
}

async function getEmpresaInfo(empId) {
  if (!empId) return { nome: "-", rmNome: "-", agenciaId: "-" };
  if (cacheEmpresas[empId]) return cacheEmpresas[empId];
  try {
    const snap = await db.collection("empresas").doc(empId).get();
    if (!snap.exists) {
      const info = { nome: empId, rmNome: "-", agenciaId: "-" };
      cacheEmpresas[empId] = info;
      return info;
    }
    const d = snap.data();
    const info = {
      nome: d?.nome || empId,
      rmNome: d?.rm || d?.rmNome || "-",
      agenciaId: d?.agencia || d?.agenciaId || d?.agencia_codigo || "-"
    };
    cacheEmpresas[empId] = info;
    return info;
  } catch {
    return { nome: empId, rmNome: "-", agenciaId: "-" };
  }
}

// ======== Helpers (datas e moeda)
function parseCurrency(input) {
  if (input == null) return 0;
  if (typeof input === "number") return input;
  let s = String(input).trim().replace(/[^\d.,-]/g, "");
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  if (hasComma && !hasDot) return Number(s.replace(",", ".")) || 0;
  if (!hasComma && hasDot) {
    const last = s.split(".").pop();
    return (last.length === 2 ? Number(s) : Number(s.replace(/\./g, ""))) || 0;
  }
  return Number(s) || 0;
}

function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseFimVigencia(value) {
  if (!value) return { date: null, dia: null, mes: null, ano: null, display: "-" };
  if (value && typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return { date: d, dia: d.getDate(), mes: d.getMonth() + 1, ano: d.getFullYear(), display: d.toLocaleDateString("pt-BR") };
  }
  if (value instanceof Date) {
    return { date: value, dia: value.getDate(), mes: value.getMonth() + 1, ano: value.getFullYear(), display: value.toLocaleDateString("pt-BR") };
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return { date: dt, dia: d, mes: m, ano: y, display: `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}` };
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/").map(Number);
    const dt = new Date(y, m - 1, d);
    return { date: dt, dia: d, mes: m, ano: y, display: `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}` };
  }
  if (/^\d{1,2}\/\d{1,2}$/.test(s)) {
    const [d, m] = s.split("/").map(Number);
    return { date: null, dia: d, mes: m, ano: null, display: `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}` };
  }
  return { date: null, dia: null, mes: null, ano: null, display: s };
}

// ======== Estrutura do registro unificado
let REGISTROS = [];

/* ===== Helpers RBAC de coleta ===== */
async function listarVisitasRBAC() {
  const col = db.collection("visitas");
  // Admin → tudo
  if (isAdmin) {
    try { return (await col.orderBy("criadoEm","desc").get()).docs; }
    catch { return (await col.get()).docs; }
  }
  // Chefe/Assistente → por agência (se o campo existir); senão filtra depois via empresa
  if (["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
    try { return (await col.where("agenciaId","==",minhaAgencia).get()).docs; }
    catch { return (await col.get()).docs; }
  }
  // RM → apenas dele (compat com vários campos)
  const buckets = [];
  try { buckets.push(await col.where("usuarioId","==",usuarioAtual.uid).get()); } catch(_){}
  try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); } catch(_){}
  try { buckets.push(await col.where("rmId","==",usuarioAtual.uid).get()); } catch(_){}
  try { buckets.push(await col.where("gerenteId","==",usuarioAtual.uid).get()); } catch(_){}
  try { buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).get()); } catch(_){}
  const map = new Map(); buckets.forEach(s=> s?.docs.forEach(d=> map.set(d.id,d)));
  return Array.from(map.values());
}

async function listarNegociosRBAC() {
  const col = db.collection("cotacoes-gerentes").where("status","==","Negócio Emitido");
  if (isAdmin) return (await col.get()).docs;

  // RM → só dele (compat)
  if (!["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual)) {
    const buckets = [];
    try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); } catch(_){}
    try { buckets.push(await col.where("rmId","==",usuarioAtual.uid).get()); } catch(_){}
    try { buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).get()); } catch(_){}
    const map = new Map(); buckets.forEach(s=> s?.docs.forEach(d=> map.set(d.id,d)));
    return Array.from(map.values());
  }

  // Chefe/Assistente → vamos buscar emitidos e filtrar por agência via empresa
  return (await col.get()).docs;
}

// ======== Carregar dados (com RBAC)
async function carregarDados() {
  REGISTROS = [];

  // ---- VISITAS
  const visitasDocs = await listarVisitasRBAC();
  for (const doc of visitasDocs) {
    const v = doc.data();
    const empresaId = v.empresaId;
    const emp = await getEmpresaInfo(empresaId);

    // Se Chefe/Assistente e a empresa não é da minha agência → pula
    if (!isAdmin && ["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
      if ((emp.agenciaId || "-") !== minhaAgencia) continue;
    }
    // Se RM e não é dono (por segurança extra) → pula
    if (!isAdmin && !["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual)) {
      const donos = [v.usuarioId, v.rmUid, v.rmId, v.gerenteId, v.criadoPorUid].filter(Boolean);
      if (!donos.includes(usuarioAtual.uid)) continue;
    }

    const ramos = v.ramos || {};
    for (const key of Object.keys(ramos)) {
      const item = ramos[key] || {};
      const fim = parseFimVigencia(item.vencimento || item.vencimentoStr || item.fimVigencia || v.vencimento);
      const premioNum = parseCurrency(item.premio);

      REGISTROS.push({
        origem: "Visita",
        empresaId,
        empresaNome: emp.nome,
        agenciaId: emp.agenciaId || "-",
        rmNome: emp.rmNome || "-",
        ramo: (key || item.ramo || "-").toString().replace(/_/g, " ").toUpperCase(),
        fim,
        premio: premioNum,
        seguradora: item.seguradora || "-",
        observacoes: item.observacoes || "-"
      });
    }
  }

  // ---- NEGÓCIOS FECHADOS
  const negDocs = await listarNegociosRBAC();
  for (const doc of negDocs) {
    const c = doc.data();
    const empresaId = c.empresaId;
    const emp = await getEmpresaInfo(empresaId);

    // Chefe/Assistente: filtra por agência da empresa
    if (!isAdmin && ["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
      const ag = c.agencia || c.agenciaId || emp.agenciaId || "-";
      if (ag !== minhaAgencia) continue;
    }

    const fim = parseFimVigencia(
      c.fimVigencia || c.fimVigenciaStr || c.vigenciaFinal || c.vigencia_final || c.fimVigenciaTs
    );

    const premioNum = parseCurrency(
      c.premioLiquido ??
      c.premio_liquido ??
      c.valorNegocio ??
      c.premio ??
      c.valorDesejado ??
      c.valor_desejado ??
      c.valorAnualDesejado ??
      c.valor_anual_desejado
    );

    let rmNome = c.rmNome || c.rm || emp.rmNome;
    if (!rmNome && c.autorUid) rmNome = await getUsuarioNome(c.autorUid);

    REGISTROS.push({
      origem: "Negócio Fechado",
      empresaId,
      empresaNome: emp.nome,
      agenciaId: c.agencia || c.agenciaId || emp.agenciaId || "-",
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

// ======== Popular selects (valores únicos a partir do dataset)
function uniqueSorted(arr){ return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>`${a}`.localeCompare(`${b}`,'pt-BR')); }

function popularFiltros(){
  const meses = [
    "", "01 - Janeiro","02 - Fevereiro","03 - Março","04 - Abril","05 - Maio","06 - Junho",
    "07 - Julho","08 - Agosto","09 - Setembro","10 - Outubro","11 - Novembro","12 - Dezembro"
  ];
  fMes.innerHTML = meses.map((m,i)=> i===0? `<option value="">Todos</option>` : `<option value="${String(i).padStart(2,'0')}">${m}</option>`).join("");

  const anos = uniqueSorted(REGISTROS.map(r=>r.fim.ano).filter(Boolean));
  fAno.innerHTML = `<option value="">Todos</option>` + anos.map(a=>`<option>${a}</option>`).join("");

  const ags = uniqueSorted(REGISTROS.map(r=>r.agenciaId));
  fAgencia.innerHTML = `<option value="">Todas</option>` + ags.map(a=>`<option>${a}</option>`).join("");

  const rms = uniqueSorted(REGISTROS.map(r=>r.rmNome));
  fRm.innerHTML = `<option value="">Todos</option>` + rms.map(a=>`<option>${a}</option>`).join("");

  const ramos = uniqueSorted(REGISTROS.map(r=>r.ramo));
  fRamo.innerHTML = `<option value="">Todos</option>` + ramos.map(a=>`<option>${a}</option>`).join("");
}

// ======== Aplicar / limpar filtros (inalterado)
btnAplicar.addEventListener("click", aplicarFiltros);
btnLimpar.addEventListener("click", ()=>{
  fAgencia.value = "";
  fRm.value = "";
  fEmpresa.value = "";
  fMes.value = "";
  fAno.value = "";
  fRamo.value = "";
  fOrigem.value = "";
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

  const fil = REGISTROS.filter(r=>{
    if (vAg && `${r.agenciaId}` !== vAg) return false;
    if (vRm && (r.rmNome || "").toLowerCase() !== vRm) return false;
    if (vEmp && !(`${r.empresaNome}`.toLowerCase().includes(vEmp))) return false;
    if (vRamo && !(`${r.ramo}`.toLowerCase() === vRamo)) return false;
    if (vOrig && r.origem !== vOrig) return false;

    const mesStr = r.fim.mes ? String(r.fim.mes).padStart(2,"0") : "";
    if (vMes && mesStr !== vMes) return false;
    if (vAno && r.fim.ano !== Number(vAno)) return false;

    return true;
  });

  renderTabela(fil);
  atualizarKPIs(fil);
}

function atualizarKPIs(data){
  kpiQtd.textContent = data.length.toString();
  const total = data.reduce((sum, r)=> sum + (Number(r.premio) || 0), 0);
  kpiTotal.textContent = fmtMoney(total);
}

function renderTabela(data){
  const rows = data
    .sort((a,b)=>{
      const ak = a.fim.ano ? `${a.fim.ano}-${String(a.fim.mes||0).padStart(2,"0")}-${String(a.fim.dia||0).padStart(2,"0")}` : `9999-99-99`;
      const bk = b.fim.ano ? `${b.fim.ano}-${String(b.fim.mes||0).padStart(2,"0")}-${String(b.fim.dia||0).padStart(2,"0")}` : `9999-99-99`;
      return ak.localeCompare(bk);
    })
    .map(r => {
      const badge = r.origem === "Visita" ? `<span class="badge visit">Visita</span>` : `<span class="badge negocio">Negócio Fechado</span>`;
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
        </tr>
      `;
    })
    .join("");

  tbody.innerHTML = rows || `<tr><td colspan="9" class="muted" style="padding:24px">Nenhum registro no filtro atual.</td></tr>`;
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ======== Boot (chama o seu fluxo normal, só esperando o usuário)
auth.onAuthStateChanged(async (user)=>{
  if (!user) { location.href = "login.html"; return; }
  usuarioAtual = user;
  const ctx = await getPerfilAtual();
  perfilAtual = ctx.perfil;
  minhaAgencia = ctx.agenciaId;
  isAdmin = ctx.isAdmin;
  await carregarDados();
});
