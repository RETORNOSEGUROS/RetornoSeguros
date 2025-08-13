// visitas-relatorio.js (RBAC)
// Compatível com Firebase v8 compat (window.firebase / firebaseConfig já no HTML).

if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* ===== DOM ===== */
const tbody        = document.getElementById("tabela-visitas");
const vazio        = document.getElementById("vazio");
const filtroRm     = document.getElementById("filtroRm");     // value = rmUid
const filtroTipo   = document.getElementById("filtroTipo");   // "Presencial"|"Online"|"" 
const filtroDe     = document.getElementById("filtroDe");     // "YYYY-MM-DD"
const filtroAte    = document.getElementById("filtroAte");    // "YYYY-MM-DD"
const btnFiltrar   = document.getElementById("btnFiltrar");
const btnLimpar    = document.getElementById("btnLimpar");

const fmtDate = new Intl.DateTimeFormat("pt-BR",{ dateStyle:"short" });
const fmtTime = new Intl.DateTimeFormat("pt-BR",{ timeStyle:"short" });

/* ===== Estado/Perfil ===== */
let usuarioAtual = null;
let perfilAtual  = "";        // "admin" | "gerente-chefe" | "assistente" | "rm" | ...
let minhaAgencia = "";
let isAdmin      = false;

/* ===== Utils ===== */
function $(id){ return document.getElementById(id); }
function toDate(val){
  if (!val) return null;
  if (val.toDate) return val.toDate();         // Firestore Timestamp
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(+d) ? null : d;
  }
  if (val instanceof Date) return val;
  return null;
}
async function getPerfilAgencia() {
  const user = auth.currentUser;
  if (!user) return { perfil:"", agenciaId:"", isAdmin:false, nome:"" };
  const snap = await db.collection("usuarios_banco").doc(user.uid).get();
  const d = snap.exists ? (snap.data() || {}) : {};
  const perfil = (d.perfil || d.roleId || "").toLowerCase();
  const agenciaId = d.agenciaId || "";
  const admin = (perfil === "admin") || (user.email === "patrick@retornoseguros.com.br");
  return { perfil, agenciaId, isAdmin: admin, nome: d.nome || user.email || "" };
}

/* ===== Boot ===== */
auth.onAuthStateChanged(async (user) => {
  if (!user) return (window.location.href = "login.html");
  usuarioAtual = user;

  const ctx = await getPerfilAgencia();
  perfilAtual  = ctx.perfil;
  minhaAgencia = ctx.agenciaId;
  isAdmin      = ctx.isAdmin;

  await prepararFiltroRM();   // mostra/alimenta filtro de RM conforme escopo
  await carregarRelatorio();  // primeira carga
});

/* ===== Filtro de RM (Admin/Chefe/Assistente) ===== */
async function prepararFiltroRM(){
  if (!filtroRm) return;

  // RM não precisa filtro (ele já vê só o que é dele)
  const podeVerRM = isAdmin || ["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual);
  if (!podeVerRM) {
    filtroRm.style.display = "none";
    return;
  }

  filtroRm.innerHTML = `<option value="">Todos os RMs</option>`;

  try {
    let q = db.collection("usuarios_banco").where("perfil","==","rm");
    if (!isAdmin && minhaAgencia) q = q.where("agenciaId","==",minhaAgencia);

    const snap = await q.get();
    const items = [];
    snap.forEach(doc=>{
      const u = doc.data() || {};
      items.push({ uid: doc.id, nome: u.nome || doc.id });
    });
    items
      .sort((a,b)=> (a.nome||"").localeCompare(b.nome||"", "pt-BR"))
      .forEach(({uid,nome})=>{
        const opt = document.createElement("option");
        opt.value = uid;
        opt.textContent = nome;
        filtroRm.appendChild(opt);
      });
  } catch (e) {
    console.warn("Erro ao carregar RMs do filtro:", e);
    // Fallback: deixa só "Todos"
  }
}

/* ===== Coleta de visitas respeitando RBAC ===== */
async function coletarVisitasPorPerfil() {
  const col = db.collection("visitas");

  // Admin → tudo
  if (isAdmin) {
    try { return (await col.orderBy("criadoEm","desc").limit(2000).get()).docs; }
    catch { return (await col.limit(2000).get()).docs; }
  }

  // Gerente-chefe / Assistente → por agência
  if (["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
    try { return (await col.where("agenciaId","==",minhaAgencia).orderBy("criadoEm","desc").limit(2000).get()).docs; }
    catch { return (await col.where("agenciaId","==",minhaAgencia).limit(2000).get()).docs; }
  }

  // RM → somente próprias (mescla várias queries por segurança de legado)
  const buckets = [];
  try { buckets.push(await col.where("usuarioId","==",usuarioAtual.uid).limit(2000).get()); } catch(e){}
  try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).limit(2000).get()); } catch(e){}
  try { buckets.push(await col.where("rmId","==",usuarioAtual.uid).limit(2000).get()); } catch(e){}
  try { buckets.push(await col.where("gerenteId","==",usuarioAtual.uid).limit(2000).get()); } catch(e){}
  try { buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).limit(2000).get()); } catch(e){}

  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d)));
  return Array.from(map.values());
}

/* ===== Carrega e renderiza ===== */
async function carregarRelatorio(){
  if (tbody) tbody.innerHTML = "";
  if (vazio) vazio.style.display = "none";

  let docs = [];
  try {
    docs = await coletarVisitasPorPerfil();
  } catch (e) {
    console.error("Erro ao buscar visitas:", e);
    if (vazio) vazio.style.display = "block";
    return;
  }

  // Filtros de UI
  const rmFilter   = filtroRm?.value || "";     // rmUid
  const tipoFilter = filtroTipo?.value || "";
  const de         = filtroDe?.value ? new Date(filtroDe.value + "T00:00:00") : null;
  const ate        = filtroAte?.value ? new Date(filtroAte.value + "T23:59:59") : null;

  const rows = [];
  docs.forEach(doc=>{
    const v = doc.data() || {};
    // Data/hora (compat de campos)
    const dt = toDate(v.dataHoraTs) || toDate(v.dataHora) || toDate(v.dataHoraStr) || toDate(v.criadoEm);
    if (!dt) return;

    // Filtros de período
    if (de && dt < de) return;
    if (ate && dt > ate) return;

    // Filtro de tipo
    if (tipoFilter && (v.tipoVisita || "") !== tipoFilter) return;

    // Filtro de RM (apenas quando filtro visível)
    if (rmFilter) {
      const uidMatch = v.rmUid || v.rmId || v.gerenteId || null;
      if (uidMatch !== rmFilter) return;
    }

    // Segurança visual extra (as Rules já garantem o bloqueio):
    if (!isAdmin) {
      if (["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual)) {
        if (minhaAgencia && v.agenciaId && v.agenciaId !== minhaAgencia) return;
      } else {
        const donos = [v.usuarioId, v.rmUid, v.rmId, v.gerenteId, v.criadoPorUid].filter(Boolean);
        if (!donos.includes(usuarioAtual.uid)) return;
      }
    }

    rows.push({ id: doc.id, v, dt });
  });

  // Ordena por data/hora (mais recentes primeiro)
  rows.sort((a,b)=> b.dt - a.dt);

  if (!rows.length) {
    if (vazio) vazio.style.display = "block";
    return;
  }
  if (vazio) vazio.style.display = "none";

  const frag = document.createDocumentFragment();
  rows.forEach(({id, v, dt})=>{
    const tr = document.createElement("tr");

    const dataFmt = fmtDate.format(dt);
    const horaFmt = fmtTime.format(dt);

    const empresa  = v.empresaNome || "-";
    const tipo     = v.tipoVisita || "-";
    const rmNome   = v.rm || v.rmNome || "-";
    const agencia  = v.agenciaId || "-";

    // Se quiser exibir contagem de ramos preenchidos
    const ramosObj = v.ramos || {};
    const totalRamos = (typeof ramosObj === "object") ? Object.keys(ramosObj).length : 0;

    tr.innerHTML = `
      <td data-label="Data">${dataFmt}</td>
      <td data-label="Hora">${horaFmt}</td>
      <td data-label="Empresa">${empresa}</td>
      <td data-label="RM">${rmNome}</td>
      <td data-label="Tipo"><span class="badge">${tipo}</span></td>
      <td data-label="Ramos">${totalRamos}</td>
      <td data-label="Agência">${agencia}</td>
    `;
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
}

/* ===== Eventos ===== */
btnFiltrar?.addEventListener("click", carregarRelatorio);
btnLimpar?.addEventListener("click", ()=>{
  if (filtroRm)   filtroRm.value = "";
  if (filtroTipo) filtroTipo.value = "";
  if (filtroDe)   filtroDe.value   = "";
  if (filtroAte)  filtroAte.value  = "";
  carregarRelatorio();
});
