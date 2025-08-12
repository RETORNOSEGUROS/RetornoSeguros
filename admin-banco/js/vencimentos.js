/* global firebase, firebaseConfig */
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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

// ======== Helpers de data e moeda
function brMoney(n) {
  const val = Number(String(n).replace(/\./g, "").replace(",", ".")) || 0;
  return val;
}
function fmtMoney(n) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// tenta parsear várias formas de fim de vigência
function parseFimVigencia(value) {
  // aceita: Timestamp, Date, "yyyy-mm-dd", "dd/mm/yyyy", "dd/mm"
  if (!value) return { date: null, dia: null, mes: null, ano: null, display: "-" };

  // Firestore Timestamp
  if (value && typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return { date: d, dia: d.getDate(), mes: d.getMonth() + 1, ano: d.getFullYear(), display: d.toLocaleDateString("pt-BR") };
  }

  if (value instanceof Date) {
    return { date: value, dia: value.getDate(), mes: value.getMonth() + 1, ano: value.getFullYear(), display: value.toLocaleDateString("pt-BR") };
  }

  const s = String(value).trim();

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return { date: dt, dia: d, mes: m, ano: y, display: `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}` };
  }

  // dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/").map(Number);
    const dt = new Date(y, m - 1, d);
    return { date: dt, dia: d, mes: m, ano: y, display: `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}` };
  }

  // dd/mm (legado – sem ano)
  if (/^\d{1,2}\/\d{1,2}$/.test(s)) {
    const [d, m] = s.split("/").map(Number);
    return { date: null, dia: d, mes: m, ano: null, display: `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}` };
  }

  return { date: null, dia: null, mes: null, ano: null, display: s };
}

// ======== Estrutura do registro unificado
/**
 * {
 *  origem: "Negócio Fechado" | "Visita",
 *  empresaId, empresaNome, agenciaId, rmNome,
 *  ramo, fim: {date, dia, mes, ano, display},
 *  premio: number, seguradora, observacoes
 * }
 */
let REGISTROS = [];

// ======== Carregar dados das duas origens
async function carregarDados() {
  REGISTROS = [];

  // ---- VISITAS
  const visitasSnap = await db.collection("visitas").get();
  for (const doc of visitasSnap.docs) {
    const v = doc.data();
    const empresaId = v.empresaId;
    const emp = await getEmpresaInfo(empresaId);

    const ramos = v.ramos || {};
    for (const key of Object.keys(ramos)) {
      const item = ramos[key] || {};
      const fim = parseFimVigencia(item.vencimento || item.vencimentoStr || item.fimVigencia || v.vencimento);
      const premioNum = brMoney(item.premio);

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

  // ---- NEGÓCIOS FECHADOS (cotacoes-gerentes com status Negócio Emitido)
  const negSnap = await db.collection("cotacoes-gerentes").where("status", "==", "Negócio Emitido").get();
  for (const doc of negSnap.docs) {
    const c = doc.data();
    const empresaId = c.empresaId;
    const emp = await getEmpresaInfo(empresaId);

    const fim = parseFimVigencia(
      c.fimVigencia || c.fimVigenciaStr || c.vigenciaFinal || c.vigencia_final || c.fimVigenciaTs
    );

    const premioNum = brMoney(c.premioLiquido ?? c.premio_liquido ?? c.valorNegocio ?? c.premio);

    // tenta RM por campos do documento; cai pra empresa ou autor
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
      seguradora: "Bradesco Seguros", // conforme solicitado
      observacoes: c.observacoes || "-"
    });
  }

  popularFiltros();
  aplicarFiltros(); // render inicial
}

// ======== Popular selects (valores únicos a partir do dataset)
function uniqueSorted(arr){ return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>`${a}`.localeCompare(`${b}`,'pt-BR')); }

function popularFiltros(){
  // Mês
  const meses = [
    "", "01 - Janeiro","02 - Fevereiro","03 - Março","04 - Abril","05 - Maio","06 - Junho",
    "07 - Julho","08 - Agosto","09 - Setembro","10 - Outubro","11 - Novembro","12 - Dezembro"
  ];
  fMes.innerHTML = meses.map((m,i)=> i===0? `<option value="">Todos</option>` : `<option value="${String(i).padStart(2,'0')}">${m}</option>`).join("");

  // Ano (varre dataset)
  const anos = uniqueSorted(REGISTROS.map(r=>r.fim.ano).filter(Boolean));
  fAno.innerHTML = `<option value="">Todos</option>` + anos.map(a=>`<option>${a}</option>`).join("");

  // Agência
  const ags = uniqueSorted(REGISTROS.map(r=>r.agenciaId));
  fAgencia.innerHTML = `<option value="">Todas</option>` + ags.map(a=>`<option>${a}</option>`).join("");

  // RM
  const rms = uniqueSorted(REGISTROS.map(r=>r.rmNome));
  fRm.innerHTML = `<option value="">Todos</option>` + rms.map(a=>`<option>${a}</option>`).join("");

  // Ramo
  const ramos = uniqueSorted(REGISTROS.map(r=>r.ramo));
  fRamo.innerHTML = `<option value="">Todos</option>` + ramos.map(a=>`<option>${a}</option>`).join("");
}

// ======== Aplicar / limpar filtros
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
  const vMes = fMes.value.trim(); // "01".."12"
  const vAno = fAno.value.trim();
  const vRamo = fRamo.value.trim().toLowerCase();
  const vOrig = fOrigem.value.trim();

  const fil = REGISTROS.filter(r=>{
    if (vAg && `${r.agenciaId}` !== vAg) return false;
    if (vRm && (r.rmNome || "").toLowerCase() !== vRm) return false;
    if (vEmp && !(`${r.empresaNome}`.toLowerCase().includes(vEmp))) return false;
    if (vRamo && !(`${r.ramo}`.toLowerCase() === vRamo)) return false;
    if (vOrig && r.origem !== vOrig) return false;

    // Mês/Ano: quando o registro não tem ano (legado dd/mm), só passa se ano não for filtrado
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
      // ordenar por fim de vigência (ano, mês, dia) — os sem ano vão ao final
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
          <td class="money nowrap">${fmtMoney(Number(r.premio)||0)}</td>
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

// ======== Boot
(async function init(){
  // Preenche meses logo de cara; demais selects serão populados depois do load
  await carregarDados();
})();
