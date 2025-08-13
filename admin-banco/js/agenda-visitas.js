// agenda-visitas.js (RBAC)
// Compatível com Firebase v8 compat. Requer firebaseConfig carregado no HTML.

if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* ===== DOM ===== */
const empresaSelect = document.getElementById("empresaSelect");
const rmInfo       = document.getElementById("rmInfo");
const tipoVisita   = document.getElementById("tipoVisita");
const dataHora     = document.getElementById("dataHora");
const observacoes  = document.getElementById("observacoes");
const lista        = document.getElementById("listaVisitas");
const vazio        = document.getElementById("vazio");

const filtroRm   = document.getElementById("filtroRm");   // value = rmUid
const filtroTipo = document.getElementById("filtroTipo"); // "Presencial"|"Online"|"" 
const filtroDe   = document.getElementById("filtroDe");   // "YYYY-MM-DD"
const filtroAte  = document.getElementById("filtroAte");  // "YYYY-MM-DD"
const btnFiltrar = document.getElementById("btnFiltrar");
const btnLimpar  = document.getElementById("btnLimpar");

const fmtDate = new Intl.DateTimeFormat("pt-BR",{ dateStyle:"short" });
const fmtTime = new Intl.DateTimeFormat("pt-BR",{ timeStyle:"short" });

/* ===== Estado/Perfil ===== */
let usuarioAtual = null;
let perfilAtual  = "";       // "admin" | "gerente-chefe" | "assistente" | "rm" | ...
let minhaAgencia = "";
let isAdmin      = false;

const empresaRMMap = new Map(); // empresaId -> { rmUid, rmNome, agenciaId, nome }

/* ===== Helpers ===== */
function $(id){ return document.getElementById(id); }
function toDate(val){
  if (!val) return null;
  if (val.toDate) return val.toDate();     // Firestore Timestamp
  const d = new Date(val);
  return isNaN(+d) ? null : d;
}
function getDateFromDoc(v){
  // Aceita campos variados (compatibilidade legado)
  if (v?.dataHoraTs)  return toDate(v.dataHoraTs);
  if (v?.dataHoraStr) return toDate(v.dataHoraStr);
  if (v?.dataHora)    return toDate(v.dataHora);
  if (v?.datahora)    return toDate(v.datahora);
  return null;
}
async function getPerfilAgencia() {
  const user = auth.currentUser;
  if (!user) return { perfil:"", agenciaId:"", isAdmin:false };
  const snap = await db.collection("usuarios_banco").doc(user.uid).get();
  const d = snap.data() || {};
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

  // Assistente tem acesso a agenda-visitas (ok). Ninguém sem login passa daqui.

  await carregarEmpresasPorPerfil();  // popula combo de empresas conforme escopo
  await carregarRMsFiltro();          // popula filtro de RM (admin/chefe/assistente)
  await listarTodas();                // primeira carga
});

/* ===== Empresas (filtradas por perfil) ===== */
async function carregarEmpresasPorPerfil(){
  empresaSelect.innerHTML = `<option value="">Selecione...</option>`;
  empresaRMMap.clear();

  const mapSet = (doc) => {
    const d = doc.data() || {};
    const id = doc.id;
    const nome = d.nome || d.razaoSocial || d.razao_social || d.fantasia || d.nomeFantasia || id;
    const rmUid  = d.rmUid || d.rmId || d.rmuid || null;
    const rmNome = d.rmNome || d.rm || "";
    const agenciaId = d.agenciaId || "";
    empresaRMMap.set(id, { rmUid, rmNome, agenciaId, nome });
  };

  // Constrói buckets de queries conforme o perfil:
  const buckets = [];
  const colEmp = db.collection("empresas");

  if (isAdmin) {
    buckets.push(colEmp.orderBy("nome").get());
  } else if (["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual)) {
    if (minhaAgencia) {
      try { buckets.push(colEmp.where("agenciaId","==",minhaAgencia).orderBy("nome").get()); }
      catch { buckets.push(colEmp.where("agenciaId","==",minhaAgencia).get()); }
    }
  } else {
    // RM: apenas as próprias — tentar rmUid/rmId/usuarioId/gerenteId
    try { buckets.push(colEmp.where("rmUid","==",usuarioAtual.uid).get()); } catch(e){}
    try { buckets.push(colEmp.where("rmId","==", usuarioAtual.uid).get()); } catch(e){}
    try { buckets.push(colEmp.where("usuarioId","==",usuarioAtual.uid).get()); } catch(e){}
    try { buckets.push(colEmp.where("gerenteId","==",usuarioAtual.uid).get()); } catch(e){}
  }

  const seen = new Set();
  for (const p of buckets) {
    try {
      const snap = await p;
      snap.forEach(doc => { if (!seen.has(doc.id)) { seen.add(doc.id); mapSet(doc); }});
    } catch(e) {
      console.warn("Falha ao buscar empresas (índice?)", e);
    }
  }

  // Render no select
  const empresasOrdenadas = [...empresaRMMap.entries()]
    .map(([id, o]) => ({ id, ...o }))
    .sort((a,b)=> (a.nome||"").localeCompare(b.nome||"", "pt-BR"));

  for (const emp of empresasOrdenadas) {
    const opt = document.createElement("option");
    opt.value = emp.id;
    opt.textContent = emp.nome;
    opt.dataset.rmUid  = emp.rmUid || "";
    opt.dataset.rmNome = emp.rmNome || "";
    opt.dataset.agenciaId = emp.agenciaId || "";
    empresaSelect.appendChild(opt);
  }
}

/* Mostrar RM ao escolher a empresa */
empresaSelect?.addEventListener("change", ()=>{
  const nome = empresaSelect.selectedOptions[0]?.dataset?.rmNome || "";
  rmInfo.textContent = nome ? `(RM: ${nome})` : "";
});

/* ===== Filtro RM (admin/chefe/assistente) ===== */
async function carregarRMsFiltro(){
  if (!filtroRm) return;

  // RM não precisa filtro (ele já vê só o que é dele)
  if (!isAdmin && !["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual)) {
    filtroRm.style.display = "none";
    return;
  }

  filtroRm.innerHTML = `<option value="">Todos os RMs</option>`;

  let q = db.collection("usuarios_banco").where("perfil","==","rm");
  if (!isAdmin && minhaAgencia) q = q.where("agenciaId","==",minhaAgencia);

  try {
    const snap = await q.get();
    snap.forEach(doc=>{
      const u = doc.data() || {};
      const opt = document.createElement("option");
      opt.value = doc.id;     // rmUid
      opt.textContent = u.nome || doc.id;
      filtroRm.appendChild(opt);
    });
  } catch(e) {
    console.warn("Erro ao carregar RMs do filtro:", e);
    // Fallback com empresas carregadas
    const rmMap = new Map(); // uid -> nome
    empresaRMMap.forEach(({rmUid, rmNome})=>{
      if (rmUid && !rmMap.has(rmUid)) rmMap.set(rmUid, rmNome || rmUid);
    });
    [...rmMap.entries()].sort((a,b)=> (a[1]||"").localeCompare(b[1]||"","pt-BR"))
      .forEach(([uid,nome])=>{
        const opt = document.createElement("option");
        opt.value = uid;
        opt.textContent = nome;
        filtroRm.appendChild(opt);
      });
  }
}

/* ===== Salvar Visita ===== */
async function salvar(){
  const empresaId = empresaSelect?.value;
  if (!empresaId){ alert("Selecione a empresa."); return; }
  if (!dataHora?.value){ alert("Informe data e hora."); return; }

  // Resgata dados da empresa escolhida (agenciaId/rm)
  const meta = empresaRMMap.get(empresaId) || {};
  let agenciaId = meta.agenciaId || minhaAgencia || "";
  const rmUid   = meta.rmUid || null;
  const rmNome  = meta.rmNome || "";

  // Respeita perfil: RM só cria na própria agência
  if (!isAdmin && perfilAtual === "rm") {
    if (agenciaId && minhaAgencia && agenciaId !== minhaAgencia) {
      alert("Você só pode agendar visitas da sua agência.");
      return;
    }
  }
  const dt = new Date(dataHora.value);
  if (isNaN(+dt)){ alert("Data/hora inválida."); return; }

  const payload = {
    empresaId,
    empresaNome: meta.nome || empresaSelect.selectedOptions[0]?.textContent || "",
    agenciaId: agenciaId || "",               // <<< grava agência
    rmUid: rmUid || null,
    rm: rmNome || "",
    tipo: (tipoVisita?.value || "").toString(),
    observacoes: (observacoes?.value || "").trim(),
    dataHoraTs:  firebase.firestore.Timestamp.fromDate(dt),
    dataHoraStr: dt.toISOString(),
    criadoPorUid: usuarioAtual.uid,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection("agenda_visitas").add(payload);
    if (observacoes) observacoes.value = "";
    if (dataHora) dataHora.value = "";
    await listarTodas();
    alert("Visita agendada!");
  } catch(e) {
    console.error("Erro ao salvar visita:", e);
    alert("Erro ao salvar visita.");
  }
}
document.getElementById("salvarVisita")?.addEventListener("click", ()=>{
  if (!auth.currentUser) { alert("Faça login novamente."); return; }
  salvar();
});

/* ===== Render da Tabela ===== */
function td(label, value){
  const el = document.createElement("td");
  el.setAttribute("data-label", label);
  el.innerHTML = value;
  return el;
}
function linhaTabela(id, v){
  const dt = getDateFromDoc(v);
  const dataFmt = dt ? fmtDate.format(dt) : "-";
  const horaFmt = dt ? fmtTime.format(dt) : "-";

  // Compatibilidade: alguns registros antigos guardaram "tipo" dentro de observações
  let tipo = v.tipo || "";
  let obs  = v.observacoes || "";
  if (tipo && !["Presencial","Online"].includes(tipo) && !obs){
    obs = tipo; tipo = "";
  }

  const info = empresaRMMap.get(v.empresaId) || {};
  const rmNomeDisplay = v.rm || info.rmNome || "-";

  const tr = document.createElement("tr");
  tr.appendChild(td("Data", dataFmt));
  tr.appendChild(td("Hora", horaFmt));
  tr.appendChild(td("Empresa", v.empresaNome || "-"));
  tr.appendChild(td("RM", `<span class="rm-chip">${rmNomeDisplay}</span>`));
  tr.appendChild(td("Tipo", `<span class="badge">${tipo || "-"}</span>`));
  tr.appendChild(td("Observações", obs || "-"));
  tr.appendChild(td("Ações", "")); // espaço para futuros botões/links
  return tr;
}

/* ===== Listagem com filtros + RBAC ===== */
async function listarTodas(){
  if (lista) lista.innerHTML = "";
  if (vazio) vazio.style.display = "none";

  const rows = [];
  const col  = db.collection("agenda_visitas");

  let snapshots = [];

  try {
    if (isAdmin) {
      // Admin: tudo
      try { snapshots.push(await col.orderBy("criadoEm","desc").limit(1000).get()); }
      catch { snapshots.push(await col.limit(1000).get()); }
    } else if (["gerente-chefe","gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
      // Chefe/Assistente: apenas da agência
      try { snapshots.push(await col.where("agenciaId","==",minhaAgencia).orderBy("criadoEm","desc").limit(1000).get()); }
      catch { snapshots.push(await col.where("agenciaId","==",minhaAgencia).limit(1000).get()); }
    } else {
      // RM: apenas as próprias (rmUid, criadoPorUid como fallback)
      const buckets = [];
      try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).limit(1000).get()); } catch(e){}
      try { buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).limit(1000).get()); } catch(e){}
      // merge buckets
      const map = new Map();
      buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d)));
      snapshots = [ { docs: Array.from(map.values()) } ];
    }
  } catch(e) {
    console.error("Erro nas queries de visitas:", e);
    try { snapshots.push(await col.limit(400).get()); } catch(e2){}
  }

  const filtroRmVal   = filtroRm?.value || "";     // rmUid
  const filtroTipoVal = filtroTipo?.value || "";
  const de = filtroDe?.value ? new Date(filtroDe.value + "T00:00:00") : null;
  const ate= filtroAte?.value ? new Date(filtroAte.value + "T23:59:59") : null;

  // Agregação e filtros em memória (após RBAC)
  snapshots.forEach(snap=>{
    snap.docs.forEach(doc=>{
      const v = doc.data() || {};
      const dt = getDateFromDoc(v);
      if (!dt) return;

      // Filtros de UI
      if (de && dt < de) return;
      if (ate && dt > ate) return;
      if (filtroTipoVal && (v.tipo || "") !== filtroTipoVal) return;
      if (filtroRmVal && (v.rmUid || "") !== filtroRmVal) return;

      rows.push({ id: doc.id, v, dt });
    });
  });

  // Ordena por data/hora da visita
  rows.sort((a,b)=> a.dt - b.dt);

  if (!rows.length) {
    if (vazio) vazio.style.display = "block";
    return;
  }
  if (vazio) vazio.style.display = "none";
  const frag = document.createDocumentFragment();
  rows.forEach(({id, v})=> frag.appendChild(linhaTabela(id, v)));
  lista.appendChild(frag);
}

/* ===== Eventos de filtro ===== */
document.getElementById("recarregar")?.addEventListener("click", listarTodas);
btnFiltrar?.addEventListener("click", listarTodas);
btnLimpar?.addEventListener("click", ()=>{
  if (filtroRm)   filtroRm.value = "";
  if (filtroTipo) filtroTipo.value = "";
  if (filtroDe)   filtroDe.value   = "";
  if (filtroAte)  filtroAte.value  = "";
  listarTodas();
});

/* ===== Observação =====
   - As Firestore Rules garantem o bloqueio por perfil/agência.
   - Aqui só ajustamos a experiência (queries coerentes) e
     garantimos que agenda_visitas sempre grave 'agenciaId'.
*/
