<!-- certifique-se de ter estes ids no HTML (ou adapte os nomes no JS):
     filtroRM, filtroAno, filtroMes, btnAplicar, btnLimpar,
     numNegocios, premioTotal, listaNegocios, btnVoltarPainel
-->
<script>
/* ==================== Firebase ==================== */
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* ==================== Estado ==================== */
let usuarioAtual = null;
let perfilAtual  = "";        // "admin" | "gerente chefe" | "rm" | "assistente"
let minhaAgencia = "";
let isAdmin      = false;

/* ==================== Helpers ==================== */
const $ = (id) => document.getElementById(id);
const roleNorm = (s) =>
  (s || "")
    .toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .trim();

function fmtMoeda(v){
  const n = Number(v || 0);
  return n ? n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "R$ 0,00";
}
function toDate(ts){
  return ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
}

/* ==================== Boot ==================== */
window.addEventListener("DOMContentLoaded", () => {
  // voltar p/ painel se existir botão
  const voltar = $("btnVoltarPainel");
  if (voltar) voltar.addEventListener("click", () => (window.location.href="painel.html"));

  auth.onAuthStateChanged(async (user) => {
    if (!user) return (window.location.href = "login.html");
    usuarioAtual = user;

    const ctx = await getPerfilAgencia();
    perfilAtual  = ctx.perfil;           // já normalizado
    minhaAgencia = ctx.agenciaId;
    isAdmin      = ctx.isAdmin;

    await carregarFiltroRM();

    // listeners de filtros
    $("btnAplicar")?.addEventListener("click", carregarNegocios);
    $("btnLimpar")?.addEventListener("click", () => {
      if ($("filtroRM")) $("filtroRM").value = "";
      if ($("filtroAno")) $("filtroAno").value = "";
      if ($("filtroMes")) $("filtroMes").value = "";
      carregarNegocios();
    });

    await carregarNegocios();
  });
});

/* perfil + agência */
async function getPerfilAgencia(){
  const user = auth.currentUser;
  if (!user) return {perfil:"", agenciaId:"", isAdmin:false};
  const snap = await db.collection("usuarios_banco").doc(user.uid).get();
  const u = snap.exists ? (snap.data()||{}) : {};
  const perfil = roleNorm(u.perfil || u.roleId || "");
  const agenciaId = u.agenciaId || "";
  const admin = (perfil === "admin") || (user.email === "patrick@retornoseguros.com.br");
  return { perfil, agenciaId, isAdmin: admin };
}

/* ==================== Filtro de RM ==================== */
async function carregarFiltroRM(){
  const sel = $("filtroRM");
  if (!sel) return;

  // só mostra para admin/gerente-chefe
  if (!isAdmin && perfilAtual !== "gerente chefe") {
    sel.innerHTML = "";
    sel.style.display = "none";
    return;
  }

  sel.innerHTML = `<option value="">Todos</option>`;
  try {
    let q = db.collection("usuarios_banco").where("perfil","==","rm");
    if (!isAdmin && minhaAgencia) q = q.where("agenciaId","==",minhaAgencia);
    const snap = await q.get();
    const nomes = new Set();
    snap.forEach(doc => {
      const nome = doc.data()?.nome;
      if (nome && !nomes.has(nome)) {
        nomes.add(nome);
        const opt = document.createElement("option");
        opt.value = nome;
        opt.textContent = nome;
        sel.appendChild(opt);
      }
    });
  } catch (e) {
    console.warn("Falha ao carregar RMs p/ filtro:", e);
  }
}

/* ==================== Consulta ==================== */
// reúne os docs respeitando o escopo do perfil
async function listarNegociosPorPerfil(){
  const col = db.collection("negocios-fechados");

  if (isAdmin) {
    const snap = await col.get();
    return snap.docs.map(d => ({ id:d.id, ...(d.data()) }));
  }

  if (perfilAtual === "gerente chefe" || perfilAtual === "assistente") {
    // gerente‑chefe/assistente: somente a própria agência
    if (!minhaAgencia) return [];
    try {
      const snap = await col.where("agenciaId","==",minhaAgencia).get();
      return snap.docs.map(d => ({ id:d.id, ...(d.data()) }));
    } catch (e) {
      // fallback sem índice: filtra no cliente
      const snap = await col.get();
      return snap.docs
        .map(d => ({ id:d.id, ...(d.data()) }))
        .filter(n => (n.agenciaId || "") === minhaAgencia);
    }
  }

  // RM: somente os seus (cobre campos mais comuns)
  const buckets = [];
  try { buckets.push(await col.where("rmId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("usuarioId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("gerenteId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).get()); } catch {}

  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d.data())));
  return Array.from(map.entries()).map(([id,data]) => ({ id, ...data }));
}

/* aplica filtros UI sobre o conjunto obtido por perfil */
async function carregarNegocios(){
  const tbody = $("listaNegocios");
  const outQtd = $("numNegocios");
  const outPremio = $("premioTotal");

  if (tbody) tbody.innerHTML = `<tr><td colspan="99">Carregando...</td></tr>`;
  if (outQtd) outQtd.textContent = "0";
  if (outPremio) outPremio.textContent = "R$ 0,00";

  try {
    const lista = await listarNegociosPorPerfil();

    // filtros
    const filtroRM  = $("filtroRM")?.value || "";     // rmNome
    const filtroAno = $("filtroAno")?.value || "";
    const filtroMes = $("filtroMes")?.value || "";     // 1..12

    const itens = lista.filter(n => {
      if (filtroRM && (n.rmNome || "-") !== filtroRM) return false;

      // datas (usa fimVigencia ou dataFechamento; se não tiver, passa)
      const d = toDate(n.fimVigencia) || toDate(n.dataFechamento) || null;
      if (filtroAno && d && d.getFullYear().toString() !== filtroAno) return false;
      if (filtroMes && d && (d.getMonth()+1).toString().padStart(2,"0") !== filtroMes.padStart(2,"0")) return false;

      return true;
    });

    // totais
    const totalPremio = itens.reduce((acc, n) => acc + (Number(n.premio) || 0), 0);
    if (outQtd) outQtd.textContent = String(itens.length);
    if (outPremio) outPremio.textContent = fmtMoeda(totalPremio);

    // render
    if (!tbody) return;
    if (!itens.length) {
      tbody.innerHTML = `<tr><td colspan="99">Nenhum registro no filtro atual.</td></tr>`;
      return;
    }

    // ordena por data desc
    itens.sort((a,b) => {
      const da = (toDate(a.fimVigencia) || toDate(a.dataFechamento) || new Date(0)).getTime();
      const dbb= (toDate(b.fimVigencia) || toDate(b.dataFechamento) || new Date(0)).getTime();
      return dbb - da;
    });

    tbody.innerHTML = itens.map(n => {
      const dataObj = toDate(n.fimVigencia) || toDate(n.dataFechamento) || null;
      const dataFmt = dataObj ? dataObj.toLocaleDateString("pt-BR") : "-";
      const empresa = n.empresaNome || n.empresa || "-";
      const rm      = n.rmNome || "-";
      const ramo    = n.ramo || "-";
      const segur   = n.seguradora || "-";
      const premio  = fmtMoeda(n.premio);
      const obs     = n.observacoes || n.obs || "";

      return `<tr>
        <td>${dataFmt}</td>
        <td>${empresa}</td>
        <td>${rm}</td>
        <td>${ramo}</td>
        <td>${segur}</td>
        <td>${premio}</td>
        <td>${obs}</td>
      </tr>`;
    }).join("");
  } catch (e) {
    console.error("Erro ao carregar negócios fechados:", e);
    if (tbody) tbody.innerHTML = `<tr><td colspan="99">Erro ou sem permissão.</td></tr>`;
  }
}

/* exports se precisar chamar direto no HTML */
window.carregarNegocios = carregarNegocios;
</script>
