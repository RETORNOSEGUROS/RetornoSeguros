// js/agenda-visitas.js
const auth = firebase.auth();
const db   = firebase.firestore();

/* ========== DOM ========== */
const empresaSelect = document.getElementById("empresaSelect");
const rmForm       = document.getElementById("rmForm");
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
const btnReload  = document.getElementById("recarregar");
const btnSalvar  = document.getElementById("salvarVisita");

const fmt = new Intl.DateTimeFormat("pt-BR",{ dateStyle:"short", timeStyle:"short" });

/* ========== HELPERS ========== */
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

/* ========== CARREGAR EMPRESAS ========== */
async function carregarEmpresas(){
  if (!empresaSelect) return;
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

/* ========== MOSTRAR RM AO ESCOLHER EMPRESA ========== */
empresaSelect?.addEventListener("change", async ()=>{
  if (!rmForm) return;
  const id = empresaSelect.value;
  if (!id){ rmForm.value = ""; return; }
  try{
    const empDoc = await db.collection("empresas").doc(id).get();
    const emp = empDoc.exists ? empDoc.data() : null;
    const nome = emp?.rmNome || emp?.rm || "";
    rmForm.value = nome || "(não cadastrado)";
  }catch(e){
    console.error("Erro lendo empresa:", e);
    rmForm.value = "";
  }
});

/* ========== CARREGAR RMs PARA FILTRO ========== */
async function carregarRMsFiltro(){
  if (!filtroRm) return;

  const add = (id, nome) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = nome || id;
    filtroRm.appendChild(opt);
  };

  filtroRm.innerHTML = `<option value="">Todos</option>`;

  // 1) tenta a coleção gerentes (ideal)
  try{
    const snapG = await db.collection("gerentes").orderBy("nome").get();
    if (!snapG.empty){
      snapG.forEach(doc => add(doc.id, doc.data().nome || doc.data().displayName || doc.id));
      return;
    }
  }catch(e){ /* pode falhar por regra; caímos no plano B */ }

  // 2) plano B: monta a lista a partir de empresas
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
    console.error("Erro carregando RMs para filtro:", e);
  }
}

/* ========== SALVAR AGENDAMENTO ========== */
async function salvar(){
  const empresaId = empresaSelect?.value;
  if (!empresaId){ alert("Selecione a empresa."); return; }
  if (!dataHora?.value){ alert("Informe data e hora."); return; }

  const user = auth.currentUser;
  const uid  = user?.uid || null;

  try{
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
      tipo: tipoVisita?.value || "",
      observacoes: (observacoes?.value || "").trim(),
      dataHoraTs:  firebase.firestore.Timestamp.fromDate(new Date(dataHora.value)),
      dataHoraStr: new Date(dataHora.value).toISOString(),
      criadoPorUid: uid,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("agenda_visitas").add(payload);
    if (observacoes) observacoes.value = "";
    if (dataHora) dataHora.value = "";
    await listarProximas();
    alert("Visita agendada!");
  }catch(e){
    console.error("Erro ao salvar:", e);
    alert("Erro ao salvar. Veja o console.");
  }
}

/* ========== RENDER LINHA ========== */
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

/* ========== LISTAGEM + FILTROS ========== */
async function listarProximas(){
  if (!lista) return;
  lista.innerHTML = "";

  // Busca ampla e filtra no cliente (mantém compatibilidade com legados)
  const snap = await db.collection("agenda_visitas")
    .orderBy("criadoEm", "desc")
    .limit(800)
    .get();

  const user  = auth.currentUser;
  const email = user?.email || "";
  const uid   = user?.uid || "";

  // Papel (simples): admin por email
  const isAdmin = (email === "patrick@retornoseguros.com.br");

  // filtros da UI
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

    // Mostra só futuras (igual ao seu layout atual)
    if (dt < agora) return;

    // Restrições de RM (se quiser travar RM só nas suas, descomente a linha abaixo)
    // if (!isAdmin && v.rmUid && uid && v.rmUid !== uid) return;

    // Filtros
    if (de && dt < de) return;
    if (ate && dt > ate) return;
    if (rmSel){
      // preferimos comparar por rmUid; se vazio no doc, tentamos por nome
      if (v.rmUid) { if (v.rmUid !== rmSel) return; }
      else if ((v.rm || "").toLowerCase() !== (filtroRm.options[filtroRm.selectedIndex]?.text || "").toLowerCase()) return;
    }
    if (tipoSel && v.tipo !== tipoSel) return;

    rows.push({ id: doc.id, v, dt });
  });

  // ordena por data/hora real
  rows.sort((a,b)=> a.dt - b.dt);

  if (!rows.length){ if (vazio) vazio.style.display="block"; return; }
  if (vazio) vazio.style.display="none";
  rows.forEach(({id, v})=> lista.appendChild(linhaTabela(id, v, isAdmin)));
}

/* ========== EVENTOS ========== */
btnSalvar?.addEventListener("click", ()=>{
  if (!auth.currentUser){ alert("Faça login novamente."); return; }
  salvar();
});
btnReload?.addEventListener("click", listarProximas);
btnFiltrar?.addEventListener("click", listarProximas);
btnLimpar?.addEventListener("click", ()=>{
  if (filtroRm)   filtroRm.value = "";
  if (filtroTipo) filtroTipo.value = "";
  if (filtroDe)   filtroDe.value = "";
  if (filtroAte)  filtroAte.value = "";
  listarProximas();
});

/* ========== INIT ========== */
auth.onAuthStateChanged(async ()=>{
  await carregarEmpresas();
  await carregarRMsFiltro();
  await listarProximas();
});
