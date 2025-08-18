/* ===== Firebase ===== */
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* ===== Estado ===== */
let usuario   = null;
let perfil    = "";            // "admin" | "gerente chefe" | "rm" | "assistente"
let agenciaId = "";
let isAdmin   = false;

let agenciasMap = {};          // { id: "Nome — Banco / Cidade - UF" }
let rmsMap      = {};          // { uid: "Nome do RM" }

/* ===== Helpers DOM ===== */
const $  = (id) => document.getElementById(id);
const asMoney = (n) => (Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const toDate  = (ts) => ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);

function setStatus(msg){
  const el = $("statusCarregando");
  if (el) el.textContent = msg || "";
}

/* ===== Boot ===== */
auth.onAuthStateChanged(async (u) => {
  if (!u) return (window.location.href="login.html");
  usuario = u;

  // perfil + agência
  const us = await db.collection("usuarios_banco").doc(u.uid).get();
  const ud = us.exists ? (us.data()||{}) : {};
  perfil    = String(ud.perfil||ud.roleId||"").normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[-_]+/g," ");
  agenciaId = ud.agenciaId || "";
  isAdmin   = (perfil==="admin") || (u.email==="patrick@retornoseguros.com.br");

  await carregarAgencias();
  await carregarRMsFiltro();
  prepararFiltrosPorPerfil();
  instalarEventos();

  setStatus("Carregando...");
  await listarNegocios();
});

/* ===== UI por perfil ===== */
function prepararFiltrosPorPerfil(){
  const selAg = $("filtroAgencia");
  const boxRM = $("boxRm"); // <div> envolvendo o select de RM (se existir)
  if (!selAg) return;

  if (isAdmin){
    selAg.disabled = false; // admin escolhe qualquer agência
  } else if (perfil==="gerente chefe" || perfil==="assistente"){
    if (agenciaId){
      selAg.value = agenciaId;
      selAg.disabled = true;     // chefe fica travado na agência dele
    }
  } else {
    // RM logado: não precisa ver filtro de RM e nem de agência
    selAg.value    = agenciaId || "";
    selAg.disabled = true;
    if (boxRM) boxRM.style.display = "none";
  }
}

/* ===== Agências ===== */
async function carregarAgencias(){
  const sel = $("filtroAgencia");
  if (sel) sel.innerHTML = "";

  if (isAdmin){
    sel?.insertAdjacentHTML("beforeend", `<option value="">Todas</option>`);
  } else {
    sel?.insertAdjacentHTML("beforeend", `<option value="${agenciaId||""}">Minha agência</option>`);
  }

  let snap;
  try {
    snap = await db.collection("agencias_banco").orderBy("nome").get();
    if (snap.empty) snap = await db.collection("agencias_banco").get();
  } catch {
    snap = await db.collection("agencias_banco").get();
  }

  snap.forEach(doc=>{
    const a  = doc.data()||{};
    const id = doc.id;
    const nome   = (a.nome||"(Sem nome)").toString();
    const banco  = a.banco ? ` — ${a.banco}` : "";
    const cidade = (a.Cidade||a.cidade||"").toString();
    const uf     = (a.estado||a.UF||"").toString().toUpperCase();
    const label  = `${nome}${banco}${cidade?` / ${cidade}`:""}${uf?` - ${uf}`:""}`;
    agenciasMap[id]=label;

    // para admin, mostra na lista; para chefe, o select já ficou travado
    if (isAdmin && sel){
      const opt=document.createElement("option");
      opt.value=id; opt.textContent=label;
      sel.appendChild(opt);
    }
  });

  // default
  if (!isAdmin && sel && agenciaId) sel.value = agenciaId;
}

/* ===== RMs para filtro ===== */
async function carregarRMsFiltro(){
  const sel = $("filtroRm");
  if (!sel) return;

  // RM logado não precisa de filtro
  if (!isAdmin && !(perfil==="gerente chefe" || perfil==="assistente")){
    sel.innerHTML = "";
    sel.disabled  = true;
    return;
  }

  sel.innerHTML = `<option value="">Todos</option>`;

  let q = db.collection("usuarios_banco").where("perfil","==","rm");
  if (!isAdmin && agenciaId) q = q.where("agenciaId","==",agenciaId);

  try{
    const snap = await q.get();
    snap.forEach(doc=>{
      const d = doc.data()||{};
      rmsMap[doc.id] = d.nome || "(sem nome)";
      const opt = document.createElement("option");
      opt.value = doc.id;     // value = uid do RM
      opt.textContent = d.nome || "(sem nome)";
      sel.appendChild(opt);
    });
  }catch(e){
    console.error("carregarRMsFiltro:", e);
  }
}

/* ===== Listagem ===== */
async function listarNegocios(){
  const tbody  = $("tbRows");
  const totalP = $("badgeTotalPremio");
  if (!tbody) return;

  tbody.innerHTML = "";
  setStatus("Carregando...");

  // filtros
  const deStr   = $("iniDe")?.value || "";
  const ateStr  = $("iniAte")?.value || "";
  const rmUid   = $("filtroRm")?.value || "";
  const agSel   = $("filtroAgencia")?.value || "";
  const ramo    = $("filtroRamo")?.value || "";
  const busca   = ($("filtroEmpresa")?.value || "").toLowerCase().trim();

  // coleção fonte: as cotações que viraram produção
  const col = db.collection("cotacoes-gerentes");

  // Escopo por perfil
  let buckets = [];
  try{
    if (isAdmin){
      // admin: por agência se escolhida
      if (agSel){
        buckets.push(await col.where("agenciaId","==",agSel).get());
      }else{
        buckets.push(await col.get());
      }
    } else if (perfil==="gerente chefe" || perfil==="assistente"){
      // chefe: sempre por agência dele
      if (agenciaId){
        buckets.push(await col.where("agenciaId","==",agenciaId).get());
      }else{
        buckets.push(await col.get());
      }
    } else {
      // RM: somente dele (tentamos pelos campos mais comuns)
      try{ buckets.push(await col.where("rmId","==",usuario.uid).get()); }catch{}
      try{ buckets.push(await col.where("rmUid","==",usuario.uid).get()); }catch{}
      try{ buckets.push(await col.where("usuarioId","==",usuario.uid).get()); }catch{}
      try{ buckets.push(await col.where("gerenteId","==",usuario.uid).get()); }catch{}
      try{ buckets.push(await col.where("criadoPorUid","==",usuario.uid).get()); }catch{}
    }
  }catch(e){
    console.warn("consulta principal (queda em fallback):", e);
    const snap = await col.get();
    buckets=[snap];
  }

  // junta resultados (evita duplicados)
  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d.data())));
  let rows = Array.from(map.entries()).map(([id,data]) => ({ id, ...data }));

  // só produção: mantemos status "Negócio Emitido" ou "Negócio Fechado" (ajuste se quiser incluir outros)
  rows = rows.filter(r => ["Negócio Emitido","Negócio Fechado","Em Emissão"].includes(r.status));

  // filtros adicionais
  if (rmUid) rows = rows.filter(r => (r.rmId || r.rmUid) === rmUid);
  if (agSel) rows = rows.filter(r => (r.agenciaId || "") === agSel);
  if (ramo)  rows = rows.filter(r => (r.ramo||"") === ramo);
  if (busca) rows = rows.filter(r => (r.empresaNome||"").toLowerCase().includes(busca));

  // datas (usamos início de vigência)
  const de  = deStr ? new Date(deStr+"T00:00:00") : null;
  const ate = ateStr? new Date(ateStr+"T23:59:59") : null;
  rows = rows.filter(r=>{
    const d = toDate(r.inicioVigencia);
    if (de && d && d < de)  return false;
    if (ate&& d && d > ate) return false;
    return true;
  });

  // render + total prêmio
  let total = 0;
  const html = [];
  rows.sort((a,b)=>{
    const da = toDate(a.inicioVigencia)?.getTime()||0;
    const dbb= toDate(b.inicioVigencia)?.getTime()||0;
    return dbb - da; // mais recente primeiro
  });

  rows.forEach(r=>{
    const empresa  = r.empresaNome || "-";
    const ramo     = r.ramo || "-";
    const rmNome   = r.rmNome || "-";
    const agLabel  = r.agenciaId ? (agenciasMap[r.agenciaId] || r.agenciaId) : "-";
    const inicio   = toDate(r.inicioVigencia)?.toLocaleDateString("pt-BR") || "-";
    const fim      = toDate(r.fimVigencia)?.toLocaleDateString("pt-BR") || "-";

    // prêmio: usa r.premio se existir; senão valorDesejado como aproximação
    const premio = (typeof r.premio === "number" ? r.premio : (typeof r.valorDesejado === "number" ? r.valorDesejado : 0));
    total += Number(premio)||0;

    html.push(`<tr>
      <td>${empresa}</td>
      <td>${ramo}</td>
      <td>${rmNome}</td>
      <td>${agLabel}</td>
      <td>${asMoney(premio)}</td>
      <td>${inicio}</td>
      <td>${fim}</td>
    </tr>`);
  });

  tbody.innerHTML = html.join("") || `<tr><td colspan="7" style="text-align:center;color:#777;">Nenhum registro no escopo atual.</td></tr>`;
  if (totalP) totalP.textContent = asMoney(total);
  setStatus("");
}

/* ===== Eventos ===== */
function instalarEventos(){
  ["iniDe","iniAte","filtroAgencia","filtroRm","filtroRamo","filtroEmpresa"].forEach(id=>{
    const el=$(id); if(!el) return;
    el.addEventListener("change", async ()=>{
      if (id==="filtroAgencia"){
        // ao trocar agência: recarrega RMs (admin)
        if (isAdmin) await recarregarRMsPelaAgencia();
      }
      listarNegocios();
    });
  });

  $("btnAplicar")?.addEventListener("click", listarNegocios);
  $("btnLimpar")?.addEventListener("click", async ()=>{
    ["iniDe","iniAte","filtroRm","filtroRamo","filtroEmpresa"].forEach(id=>{ const el=$(id); if (el) el.value=""; });
    if (isAdmin){ const a=$("filtroAgencia"); if (a) a.value=""; await recarregarRMsPelaAgencia(); }
    listarNegocios();
  });
}

async function recarregarRMsPelaAgencia(){
  const sel = $("filtroRm");
  if (!sel) return;

  const agSel = $("filtroAgencia")?.value || "";
  sel.innerHTML = `<option value="">Todos</option>`;

  let q = db.collection("usuarios_banco").where("perfil","==","rm");
  if (agSel) q = q.where("agenciaId","==",agSel);

  try{
    const snap = await q.get();
    snap.forEach(doc=>{
      const d = doc.data()||{};
      const opt=document.createElement("option");
      opt.value = doc.id;              // uid do RM
      opt.textContent = d.nome || "(sem nome)";
      sel.appendChild(opt);
    });
  }catch(e){ console.warn("recarregarRMsPelaAgencia:",e); }
}

/* ===== Expose (se precisar em onclick) ===== */
window.listarNegocios = listarNegocios;
