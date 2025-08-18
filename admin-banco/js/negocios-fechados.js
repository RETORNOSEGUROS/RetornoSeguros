// ============================
// Negócios Fechados / Produção
// Escopo:
//  - Admin: tudo
//  - Gerente-chefe / Assistente: somente docs da própria agência
//  - RM: apenas docs "dele" (rmUid/rmId/usuarioId/gerenteId/criadoPorUid)
// Filtros (se existirem no HTML):
//  - #filtroAgencia   (admin pode trocar; demais ficam travados na própria)
//  - #filtroRm        (admin e gerente-chefe podem filtrar por RM da agência)
//  - #filtroAno, #filtroMes
// Saída: #listaNegocios (ou #tabelaProducao) recebe uma tabela
// ============================

if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// ------- Estado global -------
let usuarioAtual = null;
let perfilAtual  = "";        // "admin" | "gerente chefe" | "rm" | "assistente"
let minhaAgencia = "";
let isAdmin      = false;

const agenciasMap = {};       // {agenciaId: "Nome — Banco / Cidade - UF"}
let rmsCache      = [];       // [{uid, nome, agenciaId}]

// ordenação
let sortKey = "dataMs";       // dataMs | empresa | agencia | rm | ramo | premio
let sortDir = "desc";

const $ = (id) => document.getElementById(id);
const roleNorm = (s) =>
  (s || "")
    .toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[-_]+/g, " ").trim();

window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (!user) return (window.location.href = "login.html");
    usuarioAtual = user;

    // perfil + agência
    const up = await db.collection("usuarios_banco").doc(user.uid).get();
    const u  = up.exists ? (up.data() || {}) : {};
    perfilAtual  = roleNorm(u.perfil || "");
    minhaAgencia = u.agenciaId || "";
    isAdmin      = (perfilAtual === "admin") || (user.email === "patrick@retornoseguros.com.br");

    await Promise.all([
      carregarAgenciasParaFiltro(),
      carregarRMFiltro(),
    ]);

    instalarOrdenacaoCabecalhos();
    carregarNegocios();
  });
});

// ---------------- Agências ----------------
async function carregarAgenciasParaFiltro() {
  const sel = $("filtroAgencia");
  if (sel) sel.innerHTML = "";

  // admin pode ver todas; demais ficam travados
  if (isAdmin) {
    sel?.insertAdjacentHTML("beforeend", `<option value="">Todas as agências</option>`);
  } else if (sel) {
    sel.insertAdjacentHTML("beforeend", `<option value="${minhaAgencia}">Minha agência</option>`);
    sel.value = minhaAgencia || "";
    sel.disabled = true;
  }

  // carrega rótulos
  let snap;
  try { snap = await db.collection("agencias_banco").orderBy("nome").get(); }
  catch { snap = await db.collection("agencias_banco").get(); }

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

    if (isAdmin && sel) {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = agenciasMap[id];
      sel.appendChild(opt);
    }
  });

  // onchange: quando admin troca agência, recarrega RM e lista
  sel?.addEventListener("change", async () => {
    await carregarRMFiltro();
    carregarNegocios();
  });
}

// ---------------- RMs (filtro) ----------------
async function carregarRMFiltro() {
  const box = $("filtroRm");
  if (!box) return;

  // somente admin e gerente-chefe usam filtro de RM
  if (!isAdmin && perfilAtual !== "gerente chefe") {
    box.innerHTML = "";
    box.style.display = "none";
    return;
  }

  box.innerHTML = `<option value="">Todos os RMs</option>`;
  rmsCache = [];

  let q = db.collection("usuarios_banco").where("perfil", "==", "rm");
  const agSel = getAgenciaSelecionada();
  if (!isAdmin && minhaAgencia) q = q.where("agenciaId", "==", minhaAgencia);
  if (isAdmin && agSel)        q = q.where("agenciaId", "==", agSel);

  const snap = await q.get();
  snap.forEach(doc => {
    const d = doc.data() || {};
    rmsCache.push({ uid: doc.id, nome: d.nome || "(sem nome)", agenciaId: d.agenciaId || "" });
  });

  // por padrão filtro por uid (mais seguro)
  rmsCache
    .sort((a,b)=> (a.nome||"").localeCompare(b.nome||"", "pt-BR"))
    .forEach(rm => {
      const o = document.createElement("option");
      o.value = rm.uid; o.textContent = rm.nome;
      box.appendChild(o);
    });

  box.addEventListener("change", () => carregarNegocios());
}

function getAgenciaSelecionada() {
  const sel = $("filtroAgencia");
  if (!sel) return "";
  return sel.disabled ? (minhaAgencia || "") : (sel.value || "");
}

// --------------- Buscas por perfil ---------------
async function listarNegociosPorPerfil() {
  const col = db.collection("negocios-fechados");

  // Admin => tudo (com filtro de agência na UI depois)
  if (isAdmin) {
    const snap = await col.get();
    return snap.docs.map(d => ({ id: d.id, ...(d.data()) }));
  }

  // Gerente-chefe / Assistente => apenas agência
  if (perfilAtual === "gerente chefe" || perfilAtual === "assistente") {
    try {
      const snap = await col.where("agenciaId","==", minhaAgencia).get();
      return snap.docs.map(d => ({ id: d.id, ...(d.data()) }));
    } catch {
      // fallback sem índice: carrega tudo e filtra no cliente
      const snap = await col.get();
      return snap.docs
        .map(d => ({ id: d.id, ...(d.data()) }))
        .filter(x => (x.agenciaId || "") === minhaAgencia);
    }
  }

  // RM => união de possíveis chaves de "dono"
  const buckets = [];
  try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("rmId","==", usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("usuarioId","==", usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("gerenteId","==", usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("criadoPorUid","==", usuarioAtual.uid).get()); } catch {}

  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d.data())));
  return Array.from(map.entries()).map(([id, data]) => ({ id, ...data }));
}

// --------------- Carregar / Filtrar / Render ---------------
async function carregarNegocios() {
  const container = $("listaNegocios") || $("tabelaProducao");
  if (!container) return;
  container.innerHTML = "Carregando...";

  try {
    const filtroAg  = getAgenciaSelecionada(); // admin pode trocar
    const filtroRm  = $("filtroRm")?.value || ""; // uid
    const filtroAno = $("filtroAno")?.value || "";
    const filtroMes = $("filtroMes")?.value || ""; // 1..12

    let docs = await listarNegociosPorPerfil();

    // filtro por agência (admin pode escolher)
    if (filtroAg) docs = docs.filter(d => (d.agenciaId || "") === filtroAg);

    // filtro por RM (uid)
    if (filtroRm) {
      docs = docs.filter(d => [d.rmUid, d.rmId, d.usuarioId, d.gerenteId].includes(filtroRm));
    }

    // ano/mês (tenta vários campos comuns de data)
    docs = docs.filter(d => {
      const ts = d.emissaoData || d.dataEmissao || d.fimVigencia || d.inicioVigencia || d.data || d.createdAt;
      const dt = ts?.toDate ? ts.toDate() : (typeof ts === "string" ? new Date(ts) : (ts instanceof Date ? ts : null));
      if (!dt) return true;
      const ano = dt.getFullYear();
      const mes = dt.getMonth()+1;
      if (filtroAno && Number(filtroAno) !== ano) return false;
      if (filtroMes && Number(filtroMes) !== mes) return false;
      return true;
    });

    // normaliza linhas
    const rows = docs.map(d => {
      const nomeEmpresa = d.empresaNome || d.empresa || "-";
      const rmNome      = d.rmNome || d.rm || "-";
      const ramo        = d.ramo || d.ramoSeguro || "-";
      const premioNum   = typeof d.premio === "number" ? d.premio :
                          typeof d.valor === "number"  ? d.valor  :
                          typeof d.valorPremio === "number" ? d.valorPremio : 0;

      const ts = d.emissaoData || d.dataEmissao || d.fimVigencia || d.inicioVigencia || d.data || d.createdAt;
      const dataObj = ts?.toDate ? ts.toDate() : (typeof ts === "string" ? new Date(ts) : (ts instanceof Date ? ts : null));
      const dataMs  = dataObj ? dataObj.getTime() : 0;

      return {
        id: d.id,
        empresa: nomeEmpresa,
        agenciaId: d.agenciaId || "",
        agencia: d.agenciaId ? (agenciasMap[d.agenciaId] || d.agenciaId) : "-",
        rm: rmNome,
        ramo,
        premio: premioNum,
        premioFmt: premioNum ? premioNum.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "-",
        dataMs,
        dataFmt: dataObj ? dataObj.toLocaleDateString("pt-BR") : "-",
      };
    });

    ordenar(rows);
    renderTabela(rows, container);
  } catch (e) {
    console.error("Erro ao carregar negócios-fechados:", e);
    container.innerHTML = `<p class="muted">Sem permissão ou erro ao carregar. Verifique as regras e o login.</p>`;
  }
}

function ordenar(rows){
  const dir = (sortDir === "asc") ? 1 : -1;
  rows.sort((a,b)=>{
    const va = a[sortKey], vb = b[sortKey];
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    const sa = (va ?? "").toString().toLowerCase();
    const sb = (vb ?? "").toString().toLowerCase();
    if (sa < sb) return -1 * dir;
    if (sa > sb) return  1 * dir;
    return 0;
  });
}

function instalarOrdenacaoCabecalhos(){
  const host = $("listaNegocios") || $("tabelaProducao");
  if (!host) return;
  host.addEventListener("click", (e)=>{
    const th = e.target.closest("th.sortable");
    if (!th) return;
    const key = th.dataset.sort;
    if (sortKey === key) sortDir = (sortDir === "asc" ? "desc" : "asc");
    else { sortKey = key; sortDir = (key === "dataMs" ? "desc" : "asc"); }
    carregarNegocios();
  });
}

function renderTabela(rows, container){
  const arrow = (k) => sortKey===k ? (sortDir==="asc"?"↑":"↓") : "↕";

  let html = `<table class="tabela">
  <thead><tr>
    <th class="sortable" data-sort="empresa">Empresa <span class="arrow">${arrow("empresa")}</span></th>
    <th class="sortable" data-sort="agencia">Agência <span class="arrow">${arrow("agencia")}</span></th>
    <th class="sortable" data-sort="rm">RM <span class="arrow">${arrow("rm")}</span></th>
    <th class="sortable" data-sort="ramo">Ramo <span class="arrow">${arrow("ramo")}</span></th>
    <th class="sortable" data-sort="premio">Prêmio <span class="arrow">${arrow("premio")}</span></th>
    <th class="sortable" data-sort="dataMs">Data <span class="arrow">${arrow("dataMs")}</span></th>
  </tr></thead><tbody>`;

  if (!rows.length) {
    html += `<tr><td colspan="6" class="muted">Nenhum registro no escopo atual.</td></tr>`;
  } else {
    rows.forEach(r=>{
      html += `<tr>
        <td data-label="Empresa">${r.empresa}</td>
        <td data-label="Agência">${r.agencia}</td>
        <td data-label="RM">${r.rm}</td>
        <td data-label="Ramo">${r.ramo}</td>
        <td data-label="Prêmio">${r.premioFmt}</td>
        <td data-label="Data">${r.dataFmt}</td>
      </tr>`;
    });
  }

  html += `</tbody></table>`;
  container.innerHTML = html;
}

// ------------- Exports p/ filtros -------------
window.carregarNegocios = carregarNegocios; // para “Aplicar” caso exista
