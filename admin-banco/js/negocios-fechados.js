// ====================== Firebase init ======================
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// ====================== Estado global ======================
let usuarioAtual = null;
let perfilAtual  = "";      // "admin" | "gerente chefe" | "rm" | "assistente"
let minhaAgencia = "";
let isAdmin      = false;

let linhas = [];            // linhas normalizadas para render
let agenciasMap = {};       // {agenciaId: "Nome — Banco / Cidade - UF"}
let ramosSet    = new Set();
let meusRmsSet  = new Set(); // UIDs dos RMs do gerente-chefe

const $ = (id) => document.getElementById(id);

// ====================== Helpers ======================
const normalize = (s) =>
  (s || "")
    .toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim();

const roleNorm = (s) => normalize(s).replace(/[-_]+/g, " ");
const moneyBR  = (n) => (Number(n||0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function toISODate(v){
  try{
    if (!v) return "";
    if (typeof v === "string"){
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const d=new Date(v); if(!isNaN(+d)) return d.toISOString().slice(0,10);
      return "";
    }
    if (v?.toDate){ const d=v.toDate(); return d.toISOString().slice(0,10); }
    if (v instanceof Date) return d.toISOString().slice(0,10);
  }catch(_){}
  return "";
}
const formatBR = iso => (iso && iso.includes("-")) ? iso.split("-").reverse().join("/") : "-";

// ====================== Boot ======================
window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (!user) return (window.location.href = "login.html");
    usuarioAtual = user;

    const ctx = await getPerfilAgencia();
    perfilAtual  = ctx.perfil;
    minhaAgencia = ctx.agenciaId;
    isAdmin      = ctx.isAdmin;

    adicionarBotaoVoltar();

    if (perfilAtual === "assistente") {
      renderVazio("Seu perfil não possui acesso a Negócios Fechados.");
      return;
    }

    try {
      await carregarAgencias();
      if (["gerente chefe","assistente"].includes(perfilAtual)) {
        await carregarMeusRms(); // lista de RMs do gerente-chefe
      }
      await carregarNegociosFechados();  // resolve agência e aplica escopo
      montarFiltros();
      aplicarFiltros();
    } catch (e) {
      console.error(e);
      renderVazio("Sem permissão ou erro ao carregar os dados.");
    }

    $("btnAplicar")?.addEventListener("click", aplicarFiltros);
    $("btnLimpar")?.addEventListener("click", ()=>{
      ["fDataIni","fDataFim","fRm","fAgencia","fRamo","fEmpresa"].forEach(id=>{ const el=$(id); if(el) el.value=""; });
      aplicarFiltros();
    });
  });
});

// ====================== Perfil + agência ======================
async function getPerfilAgencia() {
  const user = auth.currentUser;
  if (!user) return { perfil: "", agenciaId: "", isAdmin: false };
  const udoc = await db.collection("usuarios_banco").doc(user.uid).get();
  const u = udoc.exists ? (udoc.data() || {}) : {};
  const perfil = roleNorm(u.perfil || u.roleId || "");
  const agenciaId = u.agenciaId || "";
  const admin = (perfil === "admin") || (user.email === "patrick@retornoseguros.com.br");
  return { perfil, agenciaId, isAdmin: admin };
}

// ====================== Agências (id -> label) ======================
async function carregarAgencias() {
  let snap;
  try {
    snap = await db.collection("agencias_banco").orderBy("nome").get();
    if (snap.empty) snap = await db.collection("agencias_banco").get();
  } catch {
    snap = await db.collection("agencias_banco").get();
  }
  agenciasMap = {};
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
  });
}

// ====================== Meus RMs (gerente-chefe) ======================
async function carregarMeusRms(){
  meusRmsSet = new Set();
  const uid = usuarioAtual.uid;
  try {
    const q = await db.collection("usuarios_banco")
      .where("gerenteChefeId","==",uid)
      .where("ativo","==",true)
      .get();
    q.forEach(doc => meusRmsSet.add(doc.id));
  } catch (e) {
    console.warn("Não consegui ler usuarios_banco p/ meus RMs (seguimos):", e);
  }
}

// ====================== Escopo (igual cotações) ======================
async function listarNegociosFechadosPorPerfil() {
  const base = db.collection("cotacoes-gerentes").where("status","==","Negócio Emitido");

  if (isAdmin) {
    const snap = await base.get();
    return snap.docs.map(d=>({id:d.id, ...(d.data()||{})}));
  }

  // Gerente chefe: busca TODOS os emitidos (sem where por agência); filtraremos em memória
  if (["gerente chefe","assistente"].includes(perfilAtual)) {
    const snap = await base.get();
    return snap.docs.map(d=>({id:d.id, ...(d.data()||{})}));
  }

  // RM: une múltiplos campos de autoria/posse
  const buckets = [];
  try { buckets.push(await base.where("rmId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await base.where("rmUid","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await base.where("usuarioId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await base.where("gerenteId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await base.where("criadoPorUid","==",usuarioAtual.uid).get()); } catch {}
  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d.data())));
  return Array.from(map.entries()).map(([id, data]) => ({ id, ...data }));
}

// ====================== Resolve agência via rmUid ======================
async function resolverAgenciasPorRmUid(rmUidSet){
  if (!rmUidSet.size) return {};
  const resultado = {};
  const uids = Array.from(rmUidSet);
  for (let i=0;i<uids.length;i+=10){
    const group = uids.slice(i,i+10);
    try{
      const snap = await db.collection("usuarios_banco")
        .where(firebase.firestore.FieldPath.documentId(), "in", group)
        .get();
      snap.forEach(doc=>{
        const u = doc.data() || {};
        resultado[doc.id] = u.agenciaId || "";
      });
    }catch(_){
      // sem where-in (quota/permissão): tenta 1 a 1
      for (const id of group){
        try{
          const d = await db.collection("usuarios_banco").doc(id).get();
          if (d.exists){
            const u = d.data() || {};
            resultado[id] = u.agenciaId || "";
          }
        }catch(_){}
      }
    }
  }
  return resultado;
}

// ====================== Carregar e normalizar ======================
async function carregarNegociosFechados(){
  const tbody = $("listaNegociosFechados");
  if (tbody) tbody.innerHTML = `<tr><td colspan="7">Carregando...</td></tr>`;

  let docs = await listarNegociosFechadosPorPerfil();

  // mapear agenciaId via rmUid quando o doc não tem
  const rmUids = new Set();
  docs.forEach(d=>{
    const uid = d.rmUid || d.rmUID || d.rmId || "";
    if (uid) rmUids.add(uid);
  });
  const agenciaPorUid = await resolverAgenciasPorRmUid(rmUids);

  // Normaliza linhas
  let normalizados = docs.map(d => {
    const inicioIso = toISODate(d.inicioVigencia);
    const fimIso    = toISODate(d.fimVigencia);

    // valor robusto (aceita string pt-BR)
    const premioNum = (() => {
      const raw = d.premioLiquido ?? d.valorNegocio ?? d.valorDesejado ?? d.valorProposta ?? 0;
      if (typeof raw === "number") return raw;
      const n = String(raw).replace(/[^\d,.-]/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".");
      const f = parseFloat(n); return isNaN(f) ? 0 : f;
    })();

    // resolve agenciaId do documento:
    let agenciaId = d.agenciaId || "";
    if (!agenciaId){
      const uid = d.rmUid || d.rmUID || d.rmId || "";
      if (uid && agenciaPorUid[uid]) agenciaId = agenciaPorUid[uid];
    }

    // rótulo para exibir
    const agenciaLabel = agenciaId ? (agenciasMap[agenciaId] || agenciaId) : (d.agencia || d.agenciaNome || "-");

    ramosSet.add(d.ramo || "-");

    return {
      id: d.id,
      empresaNome: d.empresaNome || "-",
      ramo: d.ramo || "-",
      rmNome: d.rmNome || "-",
      rmUid: d.rmUid || d.rmUID || d.rmId || "",
      gerenteId: d.gerenteId || "",
      agenciaId,
      agenciaLabel,
      premioNum,
      inicioIso,
      fimIso
    };
  });

  // Gerente-chefe: filtra em memória (sem "inventar" agenciaId)
  if (!isAdmin && ["gerente chefe","assistente"].includes(perfilAtual)) {
    const meuUid = usuarioAtual.uid;
    normalizados = normalizados.filter(l =>
      (l.agenciaId && l.agenciaId === minhaAgencia) ||
      (l.rmUid && meusRmsSet.has(l.rmUid)) ||
      (l.gerenteId && l.gerenteId === meuUid)
    );
  }

  linhas = normalizados;
}

// ====================== Filtros/UI ======================
function montarFiltros(){
  // RM
  const selRm = $("fRm");
  if (selRm){
    selRm.innerHTML = `<option value="">Todos</option>`;
    const set = new Set();
    linhas.forEach(l => l.rmNome && set.add(l.rmNome));
    Array.from(set).sort((a,b)=>a.localeCompare(b,'pt-BR'))
      .forEach(nome => selRm.insertAdjacentHTML("beforeend", `<option value="${nome}">${nome}</option>`));
    selRm.value = "";
  }

  // Agência — admin: todas; demais: manter “Todas” (o filtro por agência é ignorado fora do admin)
  const selAg = $("fAgencia");
  if (selAg){
    selAg.innerHTML = `<option value="">Todas</option>`;
    if (isAdmin){
      const labels = Object.values(agenciasMap).sort((a,b)=>a.localeCompare(b,'pt-BR'));
      labels.forEach(label => selAg.insertAdjacentHTML("beforeend", `<option value="${label}">${label}</option>`));
      if (linhas.some(l=>!l.agenciaId)) selAg.insertAdjacentHTML("beforeend", `<option value="-">-</option>`);
    } else {
      if (minhaAgencia) {
        const label = agenciasMap[minhaAgencia] || minhaAgencia;
        selAg.insertAdjacentHTML("beforeend", `<option value="${label}">${label}</option>`);
      }
      selAg.value = ""; // garante “Todas”
    }
  }

  // Ramo
  const selRamo = $("fRamo");
  if (selRamo){
    selRamo.innerHTML = `<option value="">Todos</option>`;
    Array.from(ramosSet).sort((a,b)=>a.localeCompare(b,'pt-BR'))
      .forEach(r => selRamo.insertAdjacentHTML("beforeend", `<option value="${r}">${r}</option>`));
    selRamo.value = "";
  }
}

function aplicarFiltros(){
  const ini = $("fDataIni")?.value || "";  // yyyy-mm-dd
  const fim = $("fDataFim")?.value || "";
  const rm  = $("fRm")?.value || "";
  const ag  = isAdmin ? ($("fAgencia")?.value || "") : ""; // só admin filtra por agência
  const ramo= $("fRamo")?.value || "";
  const emp = normalize($("fEmpresa")?.value || "");

  const filtrados = linhas.filter(l => {
    if (ini && (!l.inicioIso || l.inicioIso < ini)) return false;
    if (fim && (!l.inicioIso || l.inicioIso > fim)) return false;
    if (rm   && l.rmNome !== rm) return false;
    if (ag   && l.agenciaLabel !== ag) return false;
    if (ramo && l.ramo !== ramo) return false;
    if (emp  && !normalize(l.empresaNome).includes(emp)) return false;
    return true;
  });

  renderTabela(filtrados);
  atualizarResumo(filtrados);
}

// ====================== Render ======================
function renderVazio(msg){
  const tbody = $("listaNegociosFechados");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="muted">${msg || "Sem resultados para os filtros atuais."}</td></tr>`;
}

function renderTabela(rows){
  const tbody = $("listaNegociosFechados");
  if (!tbody) return;
  if (!rows.length) { renderVazio(); return; }

  tbody.innerHTML = "";
  rows.forEach(l => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.empresaNome}</td>
      <td>${l.ramo}</td>
      <td>${l.rmNome}</td>
      <td>${l.agenciaLabel}</td>
      <td>${moneyBR(l.premioNum)}</td>
      <td>${formatBR(l.inicioIso)}</td>
      <td>${formatBR(l.fimIso)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function atualizarResumo(rows){
  const span = $("totalPremio");
  const info = $("infoQtd");
  const soma = rows.reduce((acc,cur)=> acc + (Number(cur.premioNum)||0), 0);
  if (info) info.textContent = `${rows.length} negócio(s)`;
  if (span) span.textContent = `Total prêmio: ${moneyBR(soma)}`;
}

// ====================== Botão Voltar ======================
function adicionarBotaoVoltar(){
  const container = document.querySelector(".toolbar, .topbar, .header-actions") || document.querySelector("h1")?.parentElement || document.body;
  const btn = document.createElement("a");
  btn.href = "painel.html";
  btn.textContent = "Voltar";
  btn.className = "btn btn-secondary";
  btn.style.marginRight = "12px";
  btn.style.display = "inline-block";
  btn.style.padding = "8px 14px";
  btn.style.borderRadius = "8px";
  btn.style.textDecoration = "none";
  container.prepend(btn);
}
