// js/agenda-visitas.js
const auth = firebase.auth();
const db   = firebase.firestore();

/* DOM */
const empresaSelect = document.getElementById("empresaSelect");
const rmInfo       = document.getElementById("rmInfo");
const tipoVisita   = document.getElementById("tipoVisita");
const dataHora     = document.getElementById("dataHora");
const observacoes  = document.getElementById("observacoes");
const lista        = document.getElementById("listaVisitas");
const vazio        = document.getElementById("vazio");

// filtros
const filtroRm   = document.getElementById("filtroRm");
const filtroTipo = document.getElementById("filtroTipo");
const filtroDe   = document.getElementById("filtroDe");
const filtroAte  = document.getElementById("filtroAte");
const btnFiltrar = document.getElementById("btnFiltrar");
const btnLimpar  = document.getElementById("btnLimpar");

const fmt = new Intl.DateTimeFormat("pt-BR",{ dateStyle:"short", timeStyle:"short" });

/* Helpers */
function pickEmpresaNome(emp){
  return (emp?.nome || emp?.razaoSocial || emp?.razao_social || emp?.fantasia || emp?.nomeFantasia || "").toString();
}
function getDateFromDoc(v){
  if (v.dataHoraTs?.toDate) return v.dataHoraTs.toDate();
  if (v.dataHoraStr) return new Date(v.dataHoraStr);
  if (v.dataHora)    return new Date(v.dataHora);
  return null;
}
function td(label, value){
  const el = document.createElement("td");
  el.setAttribute("data-label", label);
  el.innerHTML = value;
  return el;
}

/* Carregar empresas */
async function carregarEmpresas(){
  empresaSelect.innerHTML = `<option value=''>Selecione...</option>`;
  const snap = await db.collection("empresas").orderBy("nome").get();
  snap.forEach(doc=>{
    const d = doc.data();
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = pickEmpresaNome(d) || doc.id;
    empresaSelect.appendChild(opt);
  });
}

/* Exibir RM automaticamente ao selecionar empresa */
empresaSelect?.addEventListener("change", async ()=>{
  const id = empresaSelect.value;
  if (!id){ rmInfo.textContent = "(RM: não cadastrado)"; return; }
  try{
    const empDoc = await db.collection("empresas").doc(id).get();
    const emp = empDoc.exists ? empDoc.data() : null;
    const nome = emp?.rmNome || emp?.rm || "";
    rmInfo.textContent = `(RM: ${nome || "não cadastrado"})`;
  }catch(e){
    console.error("Erro lendo empresa:", e);
    rmInfo.textContent = "(RM: não cadastrado)";
  }
});

/* Carregar RMs para filtro (gerentes -> fallback empresas) */
async function carregarRMsFiltro(){
  filtroRm.innerHTML = `<option value="">Todos</option>`;
  const add = (id, nome) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = nome || id;
    filtroRm.appendChild(opt);
  };

  try{
    const snapG = await db.collection("gerentes").orderBy("nome").get();
    if (!snapG.empty){
      snapG.forEach(doc => add(doc.id, doc.data().nome || doc.data().displayName || doc.id));
      return;
    }
  }catch(_){}

  try{
    const set = new Map();
    const snapE = await db.collection("empresas").get();
    snapE.forEach(doc=>{
      const d = doc.data();
      const id  = d.rmUid || d.rmuid || d.rmId;
      const nom = d.rmNome || d.rm;
      if (id) set.set(id, nom || id);
    });
    [...set.entries()].sort((a,b)=> (a[1]||"").localeCompare(b[1]||""))
      .forEach(([id, nome])=> add(id, nome));
  }catch(e){
    console.error("Erro carregando RMs (fallback):", e);
  }
}

/* Salvar */
async function salvar(){
  const empresaId = empresaSelect?.value;
  if (!empresaId){ alert("Selecione a empresa."); return; }
  if (!dataHora?.value){ alert("Informe data e hora."); return; }

  const user = auth.currentUser;
  const uid  = user?.uid || null;

  const empDoc = await db.collection("empresas").doc(empresaId).get();
  if (!empDoc.exists){ alert("Empresa não encontrada."); return; }
  const emp = empDoc.data();

  const rmUid  = emp.rmUid || emp.rmuid || emp.rmId || null;
  const rmNome = emp.rmNome || emp.rm || "";

  const payload = {
    empresaId,
    empresaNome: pickEmpresaNome(emp),
    rm: rmNome || null,
    rmUid: rmUid || null,
    tipo: (tipoVisita?.value || "").toString(),
    observacoes: (observacoes?.value || "").trim(),
    dataHoraTs:  firebase.firestore.Timestamp.fromDate(new Date(dataHora.value)),
    dataHoraStr: new Date(dataHora.value).toISOString(),
    criadoPorUid: uid,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  };

  console.debug("Salvando agenda:", payload);
  await db.collection("agenda_visitas").add(payload);

  if (observacoes) observacoes.value = "";
  if (dataHora) dataHora.value = "";
  await listarProximas();
  alert("Visita agendada!");
}

/* Render linha */
function linhaTabela(id, v, isAdmin){
  const dt = getDateFromDoc(v);
  const formatted = dt ? fmt.format(dt) : "-";
  const [dataFmt, horaFmt] = dt ? [formatted.split(" ")[0], formatted.split(" ")[1]] : ["-","-"];

  const tr = document.createElement("tr");
  tr.appendChild(td("Data", dataFmt));
  tr.appendChild(td("Hora", horaFmt));
  tr.appendChild(td("Empresa", v.empresaNome || "-"));
  tr.appendChild(td("RM", `<span class="rm-chip">${v.rm || "-"}</span>`));
  tr.appendChild(td("Tipo", `<span class="badge">${v.tipo || "-"}</span>`));
  tr.appendChild(td("Observações", v.observacoes || "-"));

  const act = td("Ações", "");
  act.className = "actions-col";
  if (isAdmin){
    const b = document.createElement("button");
    b.textContent = "Excluir";
    b.className = "btn";
    b.addEventListener("click", ()=>{
      if (!confirm("Excluir este agendamento?")) return;
      db.collection("agenda_visitas").doc(id).delete().then(listarProximas);
    });
    act.appendChild(b);
  }
  tr.appendChild(act);
  return tr;
}

/* Listar + filtros */
async function listarProximas(){
  lista.innerHTML = "";

  // busca ampla e filtra no cliente (sem exigir índices novos)
  const snap = await db.collection("agenda_visitas")
    .orderBy("criadoEm", "desc")
    .limit(800)
    .get();

  const rmSel   = filtroRm?.value || "";
  const tipoSel = filtroTipo?.value || "";
  const de      = filtroDe?.value ? new Date(filtroDe.value + "T00:00:00") : null;
  const ate     = filtroAte?.value ? new Date(filtroAte.value + "T23:59:59") : null;

  const agora = new Date();
  const rows = [];

  snap.forEach(doc=>{
    const v = doc.data();
    const dt = getDateFromDoc(v);
    if (!dt) return;

    // apenas futuras (igual sua UI)
    if (dt < agora) return;

    // filtros
    if (de && dt < de) return;
    if (ate && dt > ate) return;
    if (rmSel && v.rmUid !== rmSel) return;
    if (tipoSel && v.tipo !== tipoSel) return;

    rows.push({ id: doc.id, v, dt });
  });

  rows.sort((a,b)=> a.dt - b.dt);

  if (!rows.length){ vazio.style.display="block"; return; }
  vazio.style.display="none";
  rows.forEach(({id, v})=> lista.appendChild(linhaTabela(id, v, false)));
}

/* Eventos */
document.getElementById("salvarVisita")?.addEventListener("click", ()=>{
  if (!auth.currentUser){ alert("Faça login novamente."); return; }
  salvar().catch(e=>{ console.error(e); alert("Erro ao salvar"); });
});
document.getElementById("recarregar")?.addEventListener("click", listarProximas);
btnFiltrar?.addEventListener("click", listarProximas);
btnLimpar?.addEventListener("click", ()=>{
  filtroRm.value = ""; filtroTipo.value = ""; filtroDe.value = ""; filtroAte.value = "";
  listarProximas();
});

/* Init */
auth.onAuthStateChanged(async ()=>{
  await carregarEmpresas();
  await carregarRMsFiltro();
  await listarProximas();
});
