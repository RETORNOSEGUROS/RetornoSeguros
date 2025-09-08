/* === Agenda de Visitas (v12) — RBAC + melhorias de UX (autocomplete, filtros, ordenação, paginação) === */
/* Compatível com Firebase v8, sem orderBy obrigatório (ordena em memória) */

if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* ---- DOM (novo + legado) ---- */
const empresaInput   = document.getElementById("empresaInput");
const empresasDL     = document.getElementById("empresasDatalist");
const empresaHidden  = document.getElementById("empresaHiddenId");
const rmInfo         = document.getElementById("rmInfo");
const tipoVisita     = document.getElementById("tipoVisita");
const dataHora       = document.getElementById("dataHora");
const observacoes    = document.getElementById("observacoes");
const lista          = document.getElementById("listaVisitas");
const vazio          = document.getElementById("vazio");

const filtroAgencia  = document.getElementById("filtroAgencia");
const filtroRm       = document.getElementById("filtroRm");
const filtroTipo     = document.getElementById("filtroTipo");
const filtroEmpresa  = document.getElementById("filtroEmpresa");
const filtroDe       = document.getElementById("filtroDe");
const filtroAte      = document.getElementById("filtroAte");

const btnFiltrar     = document.getElementById("btnFiltrar");
const btnLimpar      = document.getElementById("btnLimpar");
const btnMostrarMais = document.getElementById("btnMostrarMais");
const btnAbrirTodos  = document.getElementById("btnAbrirTodos");
const recarregarBtn  = document.getElementById("recarregar");
const salvarBtn      = document.getElementById("salvarVisita");
const contadorVisitas= document.getElementById("contadorVisitas");
const paginacaoInfo  = document.getElementById("paginacaoInfo");

document.querySelectorAll(".sortable").forEach(el=>{
  el.addEventListener("click", ()=>{
    const key = el.dataset.sort || "data";
    toggleSort(key);
  });
});

/* ---- Estado ---- */
let usuarioAtual = null;
let perfilAtual  = "";
let minhaAgencia = "";
let isAdmin      = false;

const empresaRMMap = new Map(); // empresaId -> { rmUid, rmNome, agenciaId, nome, cidade }
const empresaNameToId = new Map(); // normalizado -> empresaId

const fmtDate = new Intl.DateTimeFormat("pt-BR",{ dateStyle:"short" });
const fmtTime = new Intl.DateTimeFormat("pt-BR",{ timeStyle:"short" });

let rowsAll = [];     // dataset completo pós-filtro de escopo (antes dos filtros da UI)
let rowsView = [];    // dataset pós-filtros da UI (Agência/RM/Tipo/Empresa/Período)
let pageSize = 15;
let pageShown = 0;
let sortDir = "asc";  // padrão: próximas primeiro (mais antigas ao final)

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
function norm(s){ return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim(); }

/* ---- Boot ---- */
auth.onAuthStateChanged(async (user) => {
  if (!user) return (window.location.href = "login.html");
  usuarioAtual = user;

  const up = await db.collection("usuarios_banco").doc(user.uid).get();
  const pd = up.data() || {};
  perfilAtual  = roleNorm(pd.perfil || pd.roleId);
  minhaAgencia = pd.agenciaId || "";
  isAdmin      = (perfilAtual === "admin") || (user.email === "patrick@retornoseguros.com.br");

  await carregarEmpresasPorPerfil();  // popula mapa de empresas (inclui cidade) e o autocomplete
  await carregarAgenciasFiltro();     // popula filtro de agências (admin/chefe)
  await carregarRMsFiltro();          // popula filtro de RM (dependente da agência selecionada)
  await listarTodas();                // carrega dataset completo (escopo) e desenha
});

/* ==== EMPRESAS (escopo + autocomplete) ==== */
async function carregarEmpresasPorPerfil(){
  empresaRMMap.clear();
  empresaNameToId.clear();
  if (empresasDL) empresasDL.innerHTML = "";

  const colEmp = db.collection("empresas");
  const buckets = [];

  try {
    if (isAdmin) {
      buckets.push(colEmp.get());
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
      const cidade = d.cidade || d.municipio || d.cidadeNome || "";
      const rmUid = d.rmUid || d.rmId || null;
      const rmNome = d.rmNome || d.rm || "";
      const agenciaId = d.agenciaId || "";
      empresaRMMap.set(doc.id, { rmUid, rmNome, agenciaId, nome, cidade });
    });
  }

  // Ordena e preenche datalist
  const arr = [...empresaRMMap.entries()].map(([id,o])=>({id,...o}))
    .sort((a,b)=>(a.nome||"").localeCompare(b.nome||"","pt-BR"));
  arr.forEach(emp=>{
    const opt = document.createElement("option");
    opt.value = emp.nome;
    opt.dataset.id = emp.id;
    opt.dataset.rm = emp.rmNome || "";
    empresasDL?.appendChild(opt);

    empresaNameToId.set(norm(emp.nome), emp.id);
  });
}

/* RM info quando escolhe empresa pelo autocomplete */
empresaInput?.addEventListener("input", ()=>{
  const val = empresaInput.value;
  let chosenId = "";
  let rmNome = "";
  // tenta casar com option do datalist
  const opts = empresasDL?.querySelectorAll("option") || [];
  for (const o of opts) {
    if (o.value === val) {
      chosenId = o.dataset.id || "";
      rmNome   = o.dataset.rm || "";
      break;
    }
  }
  // fallback: se usuário digitou parcial que coincide com um único nome
  if (!chosenId) {
    const key = norm(val);
    if (empresaNameToId.has(key)) chosenId = empresaNameToId.get(key);
  }
  empresaHidden.value = chosenId || "";
  if (rmInfo) rmInfo.textContent = rmNome ? `(RM: ${rmNome})` : "";
});

/* ==== Filtros: Agências & RMs ==== */
async function carregarAgenciasFiltro(){
  if (!filtroAgencia) return;
  // Só mostra para admin/chefe/assistente
  if (!isAdmin && !["gerente chefe","gerente-chefe","assistente"].includes(perfilAtual)) {
    filtroAgencia.style.display = "none";
    return;
  }
  // lista agências a partir das empresas do escopo (garante consistência)
  const ids = new Map();
  empresaRMMap.forEach(({agenciaId})=>{
    if (agenciaId) ids.set(agenciaId, agenciaId);
  });
  // adiciona a agência do usuário, se existir e não estiver no mapa
  if (minhaAgencia && !ids.has(minhaAgencia)) ids.set(minhaAgencia, minhaAgencia);

  filtroAgencia.innerHTML = `<option value="">Todas</option>`;
  [...ids.keys()].sort().forEach(a=>{
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a; // se tiver nome legível em outro campo no futuro, trocar aqui
    filtroAgencia.appendChild(opt);
  });

  filtroAgencia.addEventListener("change", ()=>carregarRMsFiltro());
}

async function carregarRMsFiltro(){
  if (!filtroRm) return;
  // RM não precisa ver filtro de RM
  if (!isAdmin && !["gerente chefe","gerente-chefe","assistente"].includes(perfilAtual)) {
    filtroRm.style.display = "none";
    return;
  }
  filtroRm.innerHTML = `<option value="">Todos</option>`;

  const agenciaSel = filtroAgencia?.value || "";
  // monta lista de RMs a partir das empresas (mantém operação sem tocar em índices)
  const m = new Map();
  empresaRMMap.forEach(({rmUid, rmNome, agenciaId})=>{
    if (agenciaSel && agenciaId !== agenciaSel) return;
    if (rmUid && !m.has(rmUid)) m.set(rmUid, rmNome || rmUid);
  });
  [...m.entries()].sort((a,b)=>(a[1]||"").localeCompare(b[1]||"","pt-BR"))
    .forEach(([uid,nome])=>{
      const opt = document.createElement("option");
      opt.value = uid; opt.textContent = nome;
      filtroRm.appendChild(opt);
    });
}

/* ==== Salvar visita ==== */
salvarBtn?.addEventListener("click", async ()=>{
  if(auth.currentUser) await salvar();
});
recarregarBtn?.addEventListener("click", listarTodas);
btnFiltrar?.addEventListener("click", aplicarFiltrosUI);
btnLimpar?.addEventListener("click", ()=>{
  if (filtroAgencia) filtroAgencia.value = "";
  if (filtroRm)      filtroRm.value = "";
  if (filtroTipo)    filtroTipo.value = "";
  if (filtroEmpresa) filtroEmpresa.value = "";
  if (filtroDe)      filtroDe.value = "";
  if (filtroAte)     filtroAte.value = "";
  sortDir = "asc";
  aplicarFiltrosUI();
});
btnMostrarMais?.addEventListener("click", ()=>{
  pageShown = Math.min(rowsView.length, pageShown + pageSize);
  desenharTabela();
});
btnAbrirTodos?.addEventListener("click", ()=>{
  pageShown = rowsView.length;
  desenharTabela();
});

async function salvar(){
  const empresaId = empresaHidden?.value || "";
  if (!empresaId) return alert("Escolha uma empresa válida no campo acima.");
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
    empresaNome: meta.nome || empresaInput.value || "",
    empresaCidade: meta.cidade || "",
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
  empresaInput.value = "";
  empresaHidden.value = "";
  if (rmInfo) rmInfo.textContent = "(RM: não cadastrado)";
  await listarTodas();
  alert("Visita agendada!");
}

/* ==== Helpers ==== */
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

/* ==== Listagem base (escopo por perfil) ==== */
async function listarTodas(){
  if (lista) lista.innerHTML = "";
  if (vazio) vazio.style.display = "none";
  rowsAll = [];

  const col  = db.collection("agenda_visitas");

  let docs = [];

  try {
    if (isAdmin) {
      const s = await col.get(); // sem orderBy
      docs = s.docs;
    } else if (["gerente chefe","gerente-chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
      let prefer = [];
      try { prefer = (await col.where("agenciaId","==",minhaAgencia).get()).docs || []; } catch(e){}

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
      // RM
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

  // Constrói rowsAll (pré-filtros de UI)
  docs.forEach(doc=>{
    const v = doc.data() || {};
    const dt = getVisitaDate(v);
    if (!dt) return;

    // adiciona cidade em memória se faltar no doc
    if (!v.empresaCidade && v.empresaId && empresaRMMap.has(v.empresaId)) {
      v.empresaCidade = empresaRMMap.get(v.empresaId).cidade || "";
    }

    rowsAll.push({ id: doc.id, v, dt });
  });

  // padrão: próximas primeiro (asc)
  sortDir = "asc";
  aplicarFiltrosUI(); // também desenha a tabela
}

/* ==== Filtros da UI + paginação ==== */
function aplicarFiltrosUI(){
  const rmVal      = filtroRm?.value || "";
  const tipoVal    = filtroTipo?.value || "";
  const agVal      = filtroAgencia?.value || "";
  const empresaTxt = norm(filtroEmpresa?.value || "");
  const de = filtroDe?.value ? new Date(filtroDe.value + "T00:00:00") : null;
  const ate= filtroAte?.value ? new Date(filtroAte.value + "T23:59:59") : null;

  rowsView = rowsAll.filter(({v,dt})=>{
    if (de && dt < de) return false;
    if (ate && dt > ate) return false;
    if (tipoVal && (v.tipo||"") !== tipoVal) return false;
    if (rmVal   && (v.rmUid||"") !== rmVal) return false;
    if (agVal){
      // tenta pelo campo agencia no doc; se ausente, tenta pela empresa
      const agDoc = v.agenciaId || (v.empresaId && empresaRMMap.get(v.empresaId)?.agenciaId) || "";
      if (agDoc !== agVal) return false;
    }
    if (empresaTxt){
      const nome = norm(v.empresaNome || "");
      if (!nome.includes(empresaTxt)) return false;
    }
    return true;
  });

  ordenarAtual();
  pageShown = Math.min(pageSize, rowsView.length);
  desenharTabela();
}

/* ==== Ordenação ==== */
function toggleSort(key){
  // por ora, só data (key === 'data')
  sortDir = (sortDir === "asc" ? "desc" : "asc");
  ordenarAtual();
  pageShown = Math.min(pageShown || pageSize, rowsView.length);
  desenharTabela();
}
function ordenarAtual(){
  rowsView.sort((a,b)=> sortDir === "asc" ? (a.dt - b.dt) : (b.dt - a.dt));
}

/* ==== Render ==== */
function desenharTabela(){
  if (!lista) return;
  lista.innerHTML = "";

  if (!rowsView.length){
    if (vazio) vazio.style.display = "block";
    contadorVisitas.textContent = "0 visitas";
    paginacaoInfo.textContent = "0 de 0";
    return;
  } else {
    if (vazio) vazio.style.display = "none";
  }

  const frag = document.createDocumentFragment();
  const limite = Math.min(rowsView.length, pageShown || pageSize);

  for (let i=0; i<limite; i++){
    const {v, dt} = rowsView[i];
    const dataFmt = dt ? fmtDate.format(dt) : "-";
    const horaFmt = dt ? fmtTime.format(dt) : "-";
    let tipo = v.tipo || "";
    let obs  = v.observacoes || "";
    if (tipo && !["Presencial","Online"].includes(tipo) && !obs){ obs = tipo; tipo = ""; }

    const cidade = v.empresaCidade || (v.empresaId && empresaRMMap.get(v.empresaId)?.cidade) || "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="DATA">${dataFmt}</td>
      <td data-label="HORA">${horaFmt}</td>
      <td data-label="EMPRESA">${v.empresaNome || "-"}</td>
      <td data-label="CIDADE">${cidade || "-"}</td>
      <td data-label="RM"><span class="rm-chip">${v.rm || "-"}</span></td>
      <td data-label="TIPO"><span class="badge">${tipo || "-"}</span></td>
      <td data-label="OBSERVAÇÕES">${obs || "-"}</td>
      <td data-label="AÇÕES" class="actions-col"></td>
    `;
    frag.appendChild(tr);
  }
  lista.appendChild(frag);

  // contador e paginação
  contadorVisitas.textContent = `${rowsView.length} visita${rowsView.length===1?"":"s"}`;
  paginacaoInfo.textContent = `${Math.min(limite, rowsView.length)} de ${rowsView.length}`;
}

/* ==== Qualquer mudança em filtro que impacte RM (encadeado) ==== */
filtroAgencia?.addEventListener("change", aplicarFiltrosUI);
filtroRm?.addEventListener("change", aplicarFiltrosUI);
filtroTipo?.addEventListener("change", aplicarFiltrosUI);
filtroEmpresa?.addEventListener("input", ()=>{
  // digitação livre, aplica em tempo real
  aplicarFiltrosUI();
});
filtroDe?.addEventListener("change", aplicarFiltrosUI);
filtroAte?.addEventListener("change", aplicarFiltrosUI);
