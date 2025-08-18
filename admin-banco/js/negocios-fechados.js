/* ===== Firebase boot ===== */
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* ===== Estado ===== */
let user             = null;
let perfil           = "";              // "admin" | "gerente chefe" | "rm" | "assistente"
let agenciaDoUsuario = "";
let isAdmin          = false;

let agenciasMap = {};                   // {agenciaId: "Nome — Banco / Cidade - UF"}
let filtroSortKey = "empresa";          // empresa | ramo | rm | agencia | premio | ini | fim
let filtroSortDir = "asc";              // asc | desc

/* ===== Helpers DOM ===== */
const $  = (id) => document.getElementById(id);
const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
const toDate = (ts) => ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);

/* ===== Boot ===== */
window.addEventListener("DOMContentLoaded", () => {
  // Botão voltar
  const header = document.querySelector("h1, .titulo, body");
  if ($("voltarPainelLink") == null) {
    const a = document.createElement("a");
    a.id = "voltarPainelLink";
    a.href = "painel.html";
    a.textContent = "← Voltar ao Painel";
    a.style.display = "inline-block";
    a.style.margin = "8px 0 12px";
    a.style.color = "#0b5ed7";
    header?.insertAdjacentElement("afterbegin", a);
  }

  auth.onAuthStateChanged(async (u) => {
    if (!u) return (window.location.href = "login.html");
    user = u;

    // Perfil e agência
    const udoc = await db.collection("usuarios_banco").doc(u.uid).get();
    const ud   = udoc.exists ? (udoc.data() || {}) : {};
    const role = (ud.perfil || ud.roleId || "").toString().toLowerCase().replace(/[-_]+/g," ");
    perfil           = role;
    agenciaDoUsuario = ud.agenciaId || "";
    isAdmin          = (role === "admin") || (u.email === "patrick@retornoseguros.com.br");

    await Promise.all([carregarAgencias(), carregarFiltroRM()]);
    instalarOrdenacaoCabecalhos();
    carregarLista();
  });
});

/* ===== Carregar Agências (para rótulo e filtro) ===== */
async function carregarAgencias() {
  const selAg = $("filtroAgencia");
  if (selAg) selAg.innerHTML = "";

  // Admin pode escolher; outros ficam travados na própria
  if (isAdmin) {
    selAg?.insertAdjacentHTML("beforeend", `<option value="">Todas</option>`);
  } else {
    const minha = agenciaDoUsuario || "";
    selAg?.insertAdjacentHTML("beforeend", `<option value="${minha}">Minha agência</option>`);
    if (selAg) { selAg.value = minha; selAg.disabled = true; }
  }

  let snap;
  try {
    snap = await db.collection("agencias_banco").orderBy("nome").get();
    if (snap.empty) snap = await db.collection("agencias_banco").get();
  } catch {
    snap = await db.collection("agencias_banco").get();
  }

  snap.forEach(doc => {
    const a = doc.data() || {};
    const id = doc.id;

    const nome   = (a.nome || "(Sem nome)").toString();
    const banco  = a.banco ? ` — ${a.banco}` : "";
    const cidade = (a.Cidade || a.cidade || "").toString();
    const cidadeFmt = cidade ? ` / ${cidade}` : "";
    const uf = (a.estado || a.UF || "").toString().toUpperCase();
    const ufFmt = uf ? ` - ${uf}` : "";

    agenciasMap[id] = `${nome}${banco}${cidadeFmt}${ufFmt}`;

    if (isAdmin && selAg) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = agenciasMap[id];
      selAg.appendChild(opt);
    }
  });
}

/* ===== Carregar filtro de RM (apenas admin e gerente chefe/assistente) ===== */
async function carregarFiltroRM() {
  const sel = $("filtroRM");      // <select id="filtroRM">
  if (!sel) return;

  if (!isAdmin && !["gerente chefe","assistente"].includes(perfil)) {
    sel.innerHTML = "";
    sel.style.display = "none";   // RM não precisa filtrar por RM
    return;
  }

  sel.innerHTML = `<option value="">Todos</option>`;

  try {
    let q = db.collection("usuarios_banco").where("perfil","==","rm");
    if (!isAdmin && agenciaDoUsuario) q = q.where("agenciaId","==",agenciaDoUsuario);
    const snap = await q.get();
    const nomes = new Set();
    snap.forEach(d => {
      const nome = d.data()?.nome;
      if (nome && !nomes.has(nome)) {
        nomes.add(nome);
        const o = document.createElement("option");
        o.value = nome; o.textContent = nome;
        sel.appendChild(o);
      }
    });
  } catch (e) {
    console.warn("Filtro RM — fallback:", e);
  }
}

/* ===== Ler filtros de tela ===== */
function lerFiltros() {
  return {
    dataDe:  $("dataIni")?.value || "",
    dataAte: $("dataFim")?.value || "",
    rm:      $("filtroRM")?.value || "",          // rmNome
    agencia: $("filtroAgencia")?.value || ( $("filtroAgencia")?.disabled ? (agenciaDoUsuario || "") : "" ),
    ramo:    $("filtroRamo")?.value || "",
    empresa: $("filtroEmpresa")?.value?.trim() || "",
  };
}

/* ===== Carregar lista (com fallback se índice faltar) ===== */
async function carregarLista() {
  const tbody = $("tbodyNegocios");
  const totalBadge = $("totalPremioBadge");
  if (tbody) tbody.innerHTML = `<tr><td colspan="8">Carregando...</td></tr>`;
  if (totalBadge) totalBadge.textContent = fmtBRL(0);

  const f = lerFiltros();
  try {
    let docs = await buscarNegociosPorPerfil(f);
    // filtros adicionais no cliente
    if (f.empresa) {
      const texto = f.empresa.toLowerCase();
      docs = docs.filter(n => (n.empresa || n.empresaNome || "-").toString().toLowerCase().includes(texto));
    }
    if (f.ramo) docs = docs.filter(n => (n.ramo || n.ramoNome || "") === f.ramo);

    // período (com base em início de vigência)
    docs = docs.filter(n => {
      const ini = toDate(n.inicioVigencia) || (n.inicio ? toDate(n.inicio) : null);
      if (!ini) return true;
      if (f.dataDe  && ini < new Date(f.dataDe))               return false;
      if (f.dataAte && ini > new Date(f.dataAte + "T23:59:59")) return false;
      return true;
    });

    // ordenação
    const rows = docs.map(n => normalizarRow(n));
    ordenar(rows);
    render(rows);

  } catch (e) {
    console.error("Falha ao carregar negócios:", e);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8">Erro ao carregar. Verifique regras/índices.</td></tr>`;
  }
}

/* ===== Busca por perfil =====
   Coleção alvo: "negocios-fechados" (ajuste aqui se seu nome for outro)
   Campos aceitos por compatibilidade:
   - empresa | empresaNome
   - ramo | ramoNome
   - premio | valorPremio | premio_total
   - inicioVigencia | inicio
   - fimVigencia | fim
   - rmUid | rmId | usuarioId | gerenteId
   - rmNome
   - agenciaId
*/
async function buscarNegociosPorPerfil(f) {
  const col = db.collection("negocios-fechados"); // <-- ajuste se usar outro nome

  // ADMIN: pode vir por agência (ou todas)
  if (isAdmin) {
    if (f.agencia) {
      try {
        const s = await col.where("agenciaId","==",f.agencia).get();
        return s.docs.map(d => ({ id:d.id, ...d.data() }));
      } catch (e) {
        // fallback
      }
    }
    const s = await col.get();
    return s.docs.map(d => ({ id:d.id, ...d.data() }));
  }

  // GERENTE CHEFE / ASSISTENTE: somente a própria agência
  if (["gerente chefe","assistente"].includes(perfil)) {
    let base = [];
    try {
      if (agenciaDoUsuario) {
        const s = await col.where("agenciaId","==",agenciaDoUsuario).get();
        base = s.docs.map(d => ({ id:d.id, ...d.data() }));
      } else {
        const s = await col.get();
        base = s.docs.map(d => ({ id:d.id, ...d.data() }));
      }
    } catch (e) {
      const s = await col.get();
      base = s.docs.map(d => ({ id:d.id, ...d.data() }));
    }
    // Filtro RM por nome (opcional)
    if (f.rm) base = base.filter(n => (n.rmNome || "").toString() === f.rm);
    return base;
  }

  // RM: só os dele (considera vários campos de posse)
  const buckets = [];
  try { buckets.push(await col.where("rmUid","==",user.uid).get()); } catch {}
  try { buckets.push(await col.where("rmId","==", user.uid).get()); } catch {}
  try { buckets.push(await col.where("usuarioId","==",user.uid).get()); } catch {}
  try { buckets.push(await col.where("gerenteId","==",user.uid).get()); } catch {}

  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d.data())));
  const arr = Array.from(map.entries()).map(([id, data]) => ({ id, ...data }));
  return arr;
}

/* ===== Normalização para render ===== */
function normalizarRow(n) {
  const empresa = n.empresa || n.empresaNome || "-";
  const ramo    = n.ramo || n.ramoNome || "-";
  const rm      = n.rmNome || "-";
  const agId    = n.agenciaId || "";
  const agencia = agId ? (agenciasMap[agId] || agId) : "-";

  const premio  =
    Number(n.premio) ||
    Number(n.valorPremio) ||
    Number(n.premio_total) ||
    0;

  const iniD  = toDate(n.inicioVigencia) || (n.inicio ? toDate(n.inicio) : null);
  const fimD  = toDate(n.fimVigencia)    || (n.fim ? toDate(n.fim)    : null);

  return {
    id: n.id,
    empresa,
    ramo,
    rm,
    agencia,
    premioNum: premio,
    premioFmt: premio ? fmtBRL(premio) : "-",
    ini: iniD ? iniD.toLocaleDateString("pt-BR") : "-",
    fim: fimD ? fimD.toLocaleDateString("pt-BR") : "-",
    sortIni: iniD ? iniD.getTime() : 0,
    sortFim: fimD ? fimD.getTime() : 0,
  };
}

/* ===== Ordenação ===== */
function instalarOrdenacaoCabecalhos() {
  const head = document.querySelector("table thead") || document;
  head.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (!th) return;
    const key = th.dataset.sort;
    if (filtroSortKey === key) filtroSortDir = (filtroSortDir === "asc" ? "desc" : "asc");
    else { filtroSortKey = key; filtroSortDir = "asc"; }
    carregarLista();
  });
}
function ordenar(rows) {
  const key = filtroSortKey;
  const dir = (filtroSortDir === "asc" ? 1 : -1);
  rows.sort((a,b)=>{
    let va = a[key], vb = b[key];
    if (key === "premio") { va=a.premioNum; vb=b.premioNum; }
    if (key === "ini")    { va=a.sortIni;   vb=b.sortIni; }
    if (key === "fim")    { va=a.sortFim;   vb=b.sortFim; }

    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    const sa = (va ?? "").toString().toLowerCase();
    const sb = (vb ?? "").toString().toLowerCase();
    if (sa < sb) return -1 * dir;
    if (sa > sb) return  1 * dir;
    return 0;
  });
}

/* ===== Render ===== */
function render(rows) {
  const tbody = $("tbodyNegocios");
  const totalBadge = $("totalPremioBadge");

  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8">Sem resultados para os filtros atuais.</td></tr>`;
    if (totalBadge) totalBadge.textContent = fmtBRL(0);
    return;
  }

  let total = 0;
  tbody.innerHTML = rows.map(r => {
    total += r.premioNum;
    return `<tr>
      <td data-label="Empresa">${r.empresa}</td>
      <td data-label="Ramo">${r.ramo}</td>
      <td data-label="RM">${r.rm}</td>
      <td data-label="Agência">${r.agencia}</td>
      <td data-label="Prêmio">${r.premioFmt}</td>
      <td data-label="Início">${r.ini}</td>
      <td data-label="Fim">${r.fim}</td>
    </tr>`;
  }).join("");

  if (totalBadge) totalBadge.textContent = fmtBRL(total);
}

/* ===== UI: Aplicar / Limpar ===== */
async function aplicar() {
  await carregarLista();
}
function limpar() {
  ["dataIni","dataFim","filtroRM","filtroRamo","filtroEmpresa"].forEach(id=>{
    const el=$(id); if (el) el.value = "";
  });
  if (isAdmin) { const a=$("filtroAgencia"); if (a) a.value=""; }
  carregarLista();
}

/* ===== Exports ===== */
window.aplicar = aplicar;
window.limpar  = limpar;
