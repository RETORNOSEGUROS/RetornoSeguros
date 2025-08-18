/* === Agenda de Visitas (RBAC + legado, sem índices) === */
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* ---- DOM ---- */
const empresaSelect = document.getElementById("empresaSelect");
const rmInfo       = document.getElementById("rmInfo");
const tipoVisita   = document.getElementById("tipoVisita");
const dataHora     = document.getElementById("dataHora");
const observacoes  = document.getElementById("observacoes");
const lista        = document.getElementById("listaVisitas");
const vazio        = document.getElementById("vazio");

const filtroRm   = document.getElementById("filtroRm");
const filtroTipo = document.getElementById("filtroTipo");
const filtroDe   = document.getElementById("filtroDe");
const filtroAte  = document.getElementById("filtroAte");

document.getElementById("salvarVisita")?.addEventListener("click", () => { if(auth.currentUser) salvar(); });
document.getElementById("recarregar")?.addEventListener("click", listarTodas);
document.getElementById("btnFiltrar")?.addEventListener("click", listarTodas);
document.getElementById("btnLimpar")?.addEventListener("click", () => {
  if (filtroRm)   filtroRm.value   = "";
  if (filtroTipo) filtroTipo.value = "";
  if (filtroDe)   filtroDe.value   = "";
  if (filtroAte)  filtroAte.value  = "";
  listarTodas();
});

/* ---- Estado ---- */
let usuarioAtual = null;
let perfilAtual  = "";
let minhaAgencia = "";
let isAdmin      = false;

const empresaRMMap = new Map(); // empresaId -> { rmUid, rmNome, agenciaId, nome }

const fmtDate = new Intl.DateTimeFormat("pt-BR",{ dateStyle:"short" });
const fmtTime = new Intl.DateTimeFormat("pt-BR",{ timeStyle:"short" });

/* ---- Utils ---- */
function toDate(v){
  if (!v) return null;
  if (v.toDate) return v.toDate();
  const d = new Date(v);
  return isNaN(+d) ? null : d;
}
function getVisitaDate(d){
  return toDate(d.dataHoraTs || d.dataHoraStr || d.dataHora || d.datahora);
}
function roleNorm(p){ return String(p||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[-_]+/g," ").trim(); }
function chunk(arr, size){ const r=[]; for(let i=0;i<arr.length;i+=size) r.push(arr.slice(i,i+size)); return r; }

/* ---- Boot ---- */
auth.onAuthStateChanged(async (user) => {
  if (!user) return (window.location.href = "login.html");
  usuarioAtual = user;

  const up = await db.collection("usuarios_banco").doc(user.uid).get();
  const pd = up.data() || {};
  perfilAtual  = roleNorm(pd.perfil || pd.roleId);
  minhaAgencia = pd.agenciaId || "";
  isAdmin      = (perfilAtual === "admin") || (user.email === "patrick@retornoseguros.com.br");

  await carregarEmpresasPorPerfil();  // popula select empresa
  await carregarRMsFiltro();          // popula filtro RM
  await listarTodas();                // carrega lista
});

/* ---- Empresas por escopo (sem orderBy) ---- */
async function carregarEmpresasPorPerfil(){
  empresaRMMap.clear();
  if (empresaSelect) empresaSelect.innerHTML = `<option value="">Selecione...</option>`;

  const colEmp = db.collection("empresas");
  const buckets = [];

  try {
    if (isAdmin) {
      buckets.push(colEmp.get()); // admin pode ordenar depois em memória
    } else if (["gerente chefe","gerente-chefe","assistente"].includes(perfilAtual)) {
      if (minhaAgencia) buckets.push(colEmp.where("agenciaId","==",minhaAgencia).get());
    } else { // RM
      try { buckets.push(colEmp.where("rmUid","==",usuarioAtual.uid).get()); } catch(e){}
      try { buckets.push(colEmp.where("rmId","==",usuarioAtual.uid).get()); } catch(e){}
      try { buckets.push(colEmp.where("usuarioId","==",usuarioAtual.uid).get()); } catch(e){}
      try { buckets.push(colEmp.where("gerenteId","==",usuarioAtual.uid).get()); } catch(e){}
    }
  } catch(e) { /* segue */ }

  const seen = new Set();
  for (const p of buckets) {
    if (!p) continue;
    const snap = await p;
    snap.forEach(doc=>{
      if (seen.has(doc.id)) return;
      seen.add(doc.id);
      const d = doc.data() || {};
      const nome = d.nome || d.razaoSocial || d.nomeFantasia || doc.id;
      empresaRMMap.set(doc.id, {
        rmUid: d.rmUid || d.rmId || null,
        rmNome: d.rmNome || d.rm || "",
        agenciaId: d.agenciaId || "",
        nome
      });
    });
  }

  // Ordena em memória e renderiza
  const arr = [...empresaRMMap.entries()].map(([id,o])=>({id,...o}))
    .sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","pt-BR"));
  arr.forEach(emp=>{
    const opt = document.createElement("option");
    opt.value = emp.id;
    opt.textContent = emp.nome;
    opt.dataset.rmUid    = emp.rmUid || "";
    opt.dataset.rmNome   = emp.rmNome || "";
    opt.dataset.agenciaId= emp.agenciaId || "";
    empresaSelect?.appendChild(opt);
  });
}

/* RM label no formulário */
empresaSelect?.addEventListener("change", ()=>{
  const nome = empresaSelect.selectedOptions[0]?.dataset?.rmNome || "";
  if (rmInfo) rmInfo.textContent = nome ? `(RM: ${nome})` : "";
});

/* ---- Filtro de RMs (sem orderBy na query) ---- */
async function carregarRMsFiltro(){
  if (!filtroRm) return;
  // RM não precisa filtrar por RM (já é dele)
  if (!isAdmin && !["gerente chefe","gerente-chefe","assistente"].includes(perfilAtual)) {
    filtroRm.style.display = "none";
    return;
  }

  filtroRm.innerHTML = `<option value="">Todos os RMs</option>`;

  // Admin: pode ler usuarios_banco, mas sem orderBy direto.
  let viaUsuarios = false;
  if (isAdmin) {
    try {
      let q = db.collection("usuarios_banco").where("perfil","==","rm");
      if (minhaAgencia) q = q.where("agenciaId","==",minhaAgencia);
      const snap = await q.get();
      const arr = [];
      snap.forEach(doc=>{ const u=doc.data()||{}; arr.push({id:doc.id, nome:u.nome||doc.id}); });
      arr.sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","pt-BR"))
        .forEach(({id,nome})=>{
          const opt = document.createElement("option");
          opt.value = id; opt.textContent = nome;
          filtroRm.appendChild(opt);
        });
      viaUsuarios = true;
    } catch(e){ /* cai para fallback */ }
  }

  if (!viaUsuarios) {
    // Chefe/assistente: usa as empresas do escopo para descobrir RMs (sem tocar usuarios_banco)
    const m = new Map();
    empresaRMMap.forEach(({rmUid, rmNome})=>{
      if (rmUid && !m.has(rmUid)) m.set(rmUid, rmNome || rmUid);
    });
    [...m.entries()].sort((a,b)=>(a[1]||"").localeCompare(b[1]||"","pt-BR"))
      .forEach(([uid,nome])=>{
        const opt = document.createElement("option");
        opt.value = uid; opt.textContent = nome;
        filtroRm.appendChild(opt);
      });
  }
}

/* ---- Salvar visita (grava agenciaId) ---- */
async function salvar(){
  const empresaId = empresaSelect?.value;
  if (!empresaId) return alert("Selecione a empresa.");
  if (!dataHora?.value) return alert("Informe data e hora.");

  const meta = empresaRMMap.get(empresaId) || {};
  let agenciaId = meta.agenciaId || minhaAgencia || "";
  const rmUid   = meta.rmUid || null;
  const rmNome  = meta.rmNome || "";

  if (!isAdmin && perfilAtual === "rm" && agenciaId && minhaAgencia && agenciaId !== minhaAgencia) {
    return alert("Você só pode agendar visitas da sua agência.");
  }

  const dt = new Date(dataHora.value);
  if (isNaN(+dt)) return alert("Data/hora inválida.");

  const payload = {
    empresaId,
    empresaNome: meta.nome || empresaSelect.selectedOptions[0]?.textContent || "",
    agenciaId: agenciaId || "",
    rmUid: rmUid || null,
    rm: rmNome || "",
    tipo: (tipoVisita?.value || "").toString(),
    observacoes: (observacoes?.value || "").trim(),
    dataHoraTs:  firebase.firestore.Timestamp.fromDate(dt),
    dataHoraStr: dt.toISOString(),
    criadoPorUid: auth.currentUser.uid,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  };

  await db.collection("agenda_visitas").add(payload);
  if (observacoes) observacoes.value = "";
  if (dataHora) dataHora.value = "";
  await listarTodas();
  alert("Visita agendada!");
}

/* ---- Helpers: empresas da agência (para fallback legado) ---- */
async function getEmpresaIdsDaMinhaAgencia(){
  if (!minhaAgencia) return [];
  const ids = [];
  try {
    const snap = await db.collection("empresas").where("agenciaId","==",minhaAgencia).select().get();
    snap.forEach(d=>ids.push(d.id));
  } catch(e) {
    const snap = await db.collection("empresas").get();
    snap.forEach(d=>{
      const x = d.data()||{};
      if ((x.agenciaId||"") === minhaAgencia) ids.push(d.id);
    });
  }
  return ids;
}

/* ---- Listagem (sem orderBy na query; ordena em memória) ---- */
async function listarTodas(){
  if (lista) lista.innerHTML = "";
  if (vazio) vazio.style.display = "none";

  const rows = [];
  const col  = db.collection("agenda_visitas");

  const filtroRmVal   = filtroRm?.value || "";
  const filtroTipoVal = filtroTipo?.value || "";
  const de = filtroDe?.value ? new Date(filtroDe.value + "T00:00:00") : null;
  const ate= filtroAte?.value ? new Date(filtroAte.value + "T23:59:59") : null;

  let docs = [];

  try {
    if (isAdmin) {
      const s = await col.get(); // sem orderBy para evitar índice
      docs = s.docs;
    } else if (["gerente chefe","gerente-chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
      // Preferência: docs já com agenciaId
      let prefer = [];
      try { prefer = (await col.where("agenciaId","==",minhaAgencia).get()).docs || []; } catch(e){}

      // Fallback: visitas antigas sem agenciaId, via empresaId in [...]
      let legacy = [];
      try {
        const empIds = await getEmpresaIdsDaMinhaAgencia();
        for (let i=0;i<empIds.length;i+=10) {
          const pack = empIds.slice(i,i+10);
          const s2 = await col.where("empresaId","in", pack).get();
          legacy = legacy.concat(s2.docs || []);
        }
      } catch(e){}

      const map = new Map();
      prefer.forEach(d=>map.set(d.id,d));
      legacy.forEach(d=>map.set(d.id,d));
      docs = [...map.values()];
    } else {
      // RM: rmUid ou criadoPorUid
      const buckets = [];
      try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); } catch(e){}
      try { buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).get()); } catch(e){}
      const map = new Map();
      buckets.forEach(s=>s && s.docs.forEach(d=>map.set(d.id,d)));
      docs = [...map.values()];
    }
  } catch(e) {
    console.error("Erro na consulta de visitas:", e);
  }

  // Filtros (memória)
  docs.forEach(doc=>{
    const v = doc.data() || {};
    const dt = getVisitaDate(v);
    if (!dt) return;
    if (de && dt < de) return;
    if (ate && dt > ate) return;
    if (filtroTipoVal && (v.tipo||"") !== filtroTipoVal) return;
    if (filtroRmVal   && (v.rmUid||"") !== filtroRmVal) return;
    rows.push({ id: doc.id, v, dt });
  });

  // Ordena por data
  rows.sort((a,b)=> a.dt - b.dt);

  if (!rows.length){
    if (vazio) vazio.style.display = "block";
    return;
  }
  if (vazio) vazio.style.display = "none";

  const frag = document.createDocumentFragment();
  rows.forEach(({v})=>{
    const dt = getVisitaDate(v);
    const dataFmt = dt ? fmtDate.format(dt) : "-";
    const horaFmt = dt ? fmtTime.format(dt) : "-";
    let tipo = v.tipo || "";
    let obs  = v.observacoes || "";
    if (tipo && !["Presencial","Online"].includes(tipo) && !obs){ obs = tipo; tipo = ""; }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="DATA">${dataFmt}</td>
      <td data-label="HORA">${horaFmt}</td>
      <td data-label="EMPRESA">${v.empresaNome || "-"}</td>
      <td data-label="RM"><span class="rm-chip">${v.rm || "-"}</span></td>
      <td data-label="TIPO"><span class="badge">${tipo || "-"}</span></td>
      <td data-label="OBSERVAÇÕES">${obs || "-"}</td>
      <td data-label="AÇÕES"></td>
    `;
    frag.appendChild(tr);
  });
  lista.appendChild(frag);
}
