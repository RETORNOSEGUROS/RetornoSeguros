/* =========================================
   Negócios Fechados (Gerente Chefe por agência)
   ========================================= */

// Firebase
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// Estado
let usuario = null;
let perfil  = "";               // "admin" | "gerente chefe" | "rm" | "assistente"
let minhaAgencia = "";
let isAdmin = false;

let agenciasMap = {};           // {agId: "Nome — Banco / Cidade - UF"}
let ramos = [];                 // nomes de ramos
let rmsDaAgencia = [];          // [{uid, nome}]
let statusFechados = new Set([
  "Negócio Emitido",
  "Negócio Fechado",
  "Em Emissão"        // mantenho pq há páginas suas que usam esse “quase final”
]);

// Helpers
const $ = (id) => document.getElementById(id);
const byId = $;
const normaliza = (s) =>
  (s || "").toString().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .toLowerCase().replace(/[-_]+/g, " ").trim();

const toDate = (ts) => ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);

// botão voltar
(function ensureBackButton(){
  const anchor = document.createElement("a");
  anchor.href = "painel.html";
  anchor.textContent = "← Voltar ao Painel";
  anchor.style.display = "inline-block";
  anchor.style.margin = "16px 0 0 16px";
  anchor.style.textDecoration = "none";
  anchor.style.color = "#0a58ca";
  const h1 = document.querySelector("h1, .page-title") || document.body.firstElementChild;
  (h1?.parentNode || document.body).insertBefore(anchor, h1 || null);
})();

// Boot
auth.onAuthStateChanged(async (u) => {
  if (!u) return (window.location.href = "login.html");
  usuario = u;

  await lerPerfil();
  await Promise.all([
    carregarAgencias(),
    carregarRamos(),
    carregarRMsAgencia()
  ]);

  // Preenche filtros
  prepararFiltros();

  // Primeira carga
  await aplicarFiltros();

  // Clique dos botões
  $("btnAplicar")?.addEventListener("click", aplicarFiltros);
  $("btnLimpar")?.addEventListener("click", () => {
    ["fDataIni","fDataFim","fRM","fAgencia","fRamo","fEmpresa"].forEach(id=>{ const el=$(id); if(el) el.value=""; });
    // respeita travas de escopo:
    if (!isAdmin && minhaAgencia) {
      const sel = $("fAgencia");
      if (sel) { sel.value = minhaAgencia; sel.disabled = true; }
    }
    aplicarFiltros();
  });
});

async function lerPerfil(){
  const snap = await db.collection("usuarios_banco").doc(usuario.uid).get();
  const u = snap.exists ? (snap.data()||{}) : {};
  perfil = normaliza(u.perfil || u.roleId || "");
  minhaAgencia = u.agenciaId || "";
  isAdmin = (perfil === "admin") || (usuario.email === "patrick@retornoseguros.com.br");
}

/* ===============================
   Catálogos (agências, ramos, RMs)
   =============================== */
async function carregarAgencias(){
  // Agência no filtro: admin escolhe; demais travam a própria
  const sel = $("fAgencia");
  if (sel) sel.innerHTML = "";

  if (isAdmin) {
    sel?.insertAdjacentHTML("beforeend", `<option value="">Todas as agências</option>`);
  } else {
    const minha = minhaAgencia || "";
    sel?.insertAdjacentHTML("beforeend", `<option value="${minha}">Minha agência</option>`);
    if (sel) { sel.value = minha; sel.disabled = true; }
  }

  let qs;
  try {
    qs = await db.collection("agencias_banco").orderBy("nome").get();
    if (qs.empty) qs = await db.collection("agencias_banco").get();
  } catch {
    qs = await db.collection("agencias_banco").get();
  }
  qs.forEach(doc=>{
    const a = doc.data() || {};
    const id = doc.id;
    const nome   = (a.nome || "(Sem nome)").toString();
    const banco  = a.banco ? ` — ${a.banco}` : "";
    const cidade = (a.Cidade || a.cidade || "").toString();
    const uf     = (a.estado || a.UF || "").toString().toUpperCase();
    const label = `${nome}${banco}${cidade ? ` / ${cidade}`:""}${uf?` - ${uf}`:""}`;
    agenciasMap[id] = label;

    if (isAdmin && sel) {
      const op = document.createElement("option");
      op.value = id; op.textContent = label;
      sel.appendChild(op);
    }
  });
}

async function carregarRamos(){
  ramos = [];
  const sel = $("fRamo");
  if (sel) sel.innerHTML = `<option value="">Todos</option>`;
  let snap;
  try { snap = await db.collection("ramos-seguro").orderBy("ordem").get(); }
  catch { snap = await db.collection("ramos-seguro").get(); }
  snap.forEach(doc=>{
    const nome = doc.data()?.nomeExibicao || doc.id;
    ramos.push(nome);
    if (sel) {
      const op=document.createElement("option");
      op.value = nome; op.textContent = nome;
      sel.appendChild(op);
    }
  });
}

async function carregarRMsAgencia(){
  const sel = $("fRM");
  if (!sel) return;

  // RM próprio não precisa filtro por RM
  if (!isAdmin && perfil !== "gerente chefe" && perfil !== "assistente") {
    sel.innerHTML = "";
    sel.style.display = "none";
    return;
  }

  sel.innerHTML = `<option value="">Todos</option>`;

  let q = db.collection("usuarios_banco").where("perfil","==","rm");
  if (!isAdmin && minhaAgencia) q = q.where("agenciaId","==", minhaAgencia);
  const snap = await q.get();

  rmsDaAgencia = [];
  snap.forEach(doc=>{
    const d = doc.data() || {};
    if (!d.nome) return;
    rmsDaAgencia.push({ uid: doc.id, nome: d.nome });
    const op = document.createElement("option");
    op.value = doc.id;            // UID (filtro por UID é mais robusto)
    op.textContent = d.nome;
    sel.appendChild(op);
  });
}

/* ========================
   UI / filtros iniciais
   ======================== */
function prepararFiltros(){
  const ini = $("fDataIni");
  const fim = $("fDataFim");
  const hoje = new Date();
  const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  if (ini && !ini.value) ini.value = mesAtual.toISOString().slice(0,10);
  if (fim && !fim.value) fim.value = hoje.toISOString().slice(0,10);
}

/* ========================
   Consulta com escopo
   ======================== */

function baseQueryNegocios() {
  // === FONTE DOS NEGÓCIOS ===
  // Se seu projeto usa outra coleção p/ negócios fechados,
  // TROQUE a linha abaixo pelo nome correto.
  // Ex.: db.collection("negocios-fechados")
  let col = db.collection("cotacoes-gerentes"); // <-- TROQUE AQUI SE USAR OUTRA COLEÇÃO

  // Escopo por perfil:
  if (isAdmin) return col;
  if (perfil === "gerente chefe" || perfil === "assistente") {
    if (minhaAgencia) return col.where("agenciaId","==",minhaAgencia);
    return col; // fallback
  }
  // RM: amarra ao próprio UID (considerando possíveis campos do seu histórico)
  const uid = usuario.uid;
  // tentamos rmId (principal); se suas docs usam outro atributo (rmUid/usuarioId/gerenteId), ajuste aqui:
  return col.where("rmId","==", uid);
}

async function aplicarFiltros(){
  const tbodyInfo = $("statusInfo") || document.querySelector("[data-status-info]");
  if (tbodyInfo) tbodyInfo.textContent = "Carregando...";

  const lista = $("tbodyNegocios");
  if (lista) lista.innerHTML = `<tr><td colspan="8">Carregando...</td></tr>`;

  try {
    const fIni = $("fDataIni")?.value || "";
    const fFim = $("fDataFim")?.value || "";
    const fRM  = $("fRM")?.value || "";       // **UID** do RM
    const fAg  = $("fAgencia")?.value || "";
    const fR   = $("fRamo")?.value || "";
    const fEmp = ($("fEmpresa")?.value || "").toLowerCase().trim();

    // Monta query base dentro do escopo do usuário
    let q = baseQueryNegocios();

    // Admin pode filtrar por agência
    if (isAdmin && fAg) q = q.where("agenciaId","==", fAg);

    // Filtro por RM (quando foi preenchido no <select>)
    if (fRM) q = q.where("rmId","==", fRM);

    // Filtro por ramo
    if (fR) q = q.where("ramo","==", fR);

    // Pega docs (com segurança para orderBy ausente)
    let snap;
    try {
      // tentar reduzir no servidor (status finais)
      // se a sua coleção final já é “negócios-fechados”, remova este where:
      snap = await q.where("status", "in", Array.from(statusFechados)).get();
    } catch {
      snap = await q.get();
    }

    // Converte e filtra no cliente
    let dados = snap.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));

    // Filtro por status (se a collection não suportou where above)
    dados = dados.filter(c => statusFechados.has(c.status));

    // Filtro por data (considero início da vigência; ajuste se seu campo é outro)
    if (fIni || fFim) {
      const di = fIni ? new Date(fIni+"T00:00:00") : null;
      const df = fFim ? new Date(fFim+"T23:59:59") : null;
      dados = dados.filter(c => {
        const t = toDate(c.inicioVigencia) || toDate(c.dataCriacao) || null;
        if (!t) return false;
        if (di && t < di) return false;
        if (df && t > df) return false;
        return true;
      });
    }

    // Filtro por empresa (contains)
    if (fEmp) {
      dados = dados.filter(c => (c.empresaNome || "").toLowerCase().includes(fEmp));
    }

    // Render
    renderTabela(dados);
  } catch (err) {
    console.error(err);
    if (lista) lista.innerHTML = `<tr><td colspan="8">Erro ao carregar. Verifique as regras e tente novamente.</td></tr>`;
    if (tbodyInfo) tbodyInfo.textContent = "Erro ao carregar.";
  }
}

function renderTabela(docs){
  const corpo = $("tbodyNegocios");
  const totalBox = $("totalPremio");
  if (!corpo) return;

  if (!docs.length) {
    corpo.innerHTML = `<tr><td colspan="8">Nenhum registro no filtro atual.</td></tr>`;
    totalBox && (totalBox.textContent = "R$ 0,00");
    return;
  }

  // Normaliza campos e calcula total
  let total = 0;
  const linhas = docs.map(d => {
    const empresa = d.empresaNome || "-";
    const ramo    = d.ramo || "-";
    const rmNome  = d.rmNome || "-";
    const agRot   = d.agenciaId ? (agenciasMap[d.agenciaId] || d.agenciaId) : "-";
    const premio  = Number(d.premio || d.valorPremio || d.valorDesejado || 0) || 0;
    total += premio;
    const inicio  = toDate(d.inicioVigencia) ? toDate(d.inicioVigencia).toLocaleDateString("pt-BR") : "-";
    const fim     = toDate(d.fimVigencia)    ? toDate(d.fimVigencia).toLocaleDateString("pt-BR")    : "-";

    return `<tr>
      <td>${empresa}</td>
      <td>${ramo}</td>
      <td>${rmNome}</td>
      <td>${agRot}</td>
      <td>${premio.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
      <td>${inicio}</td>
      <td>${fim}</td>
    </tr>`;
  });

  corpo.innerHTML = linhas.join("");

  if (totalBox) totalBox.textContent = total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}
