// agenda-visitas.js (v11)
const VERSION = "agenda-visitas.v11";
console.log(VERSION);

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

// formatadores BR sem vírgula
const fmtDate = new Intl.DateTimeFormat("pt-BR",{ dateStyle:"short" });
const fmtTime = new Intl.DateTimeFormat("pt-BR",{ timeStyle:"short" });

/* Helpers */
const empresaRMMap = new Map(); // empresaId -> { rmUid, rmNome }
const pickEmpresaNome = (emp)=>(emp?.nome||emp?.razaoSocial||emp?.razao_social||emp?.fantasia||emp?.nomeFantasia||"")+""; 

function getDateFromDoc(v){
  const toDateSafe = (val) => {
    const d = new Date(val);
    return isNaN(+d) ? null : d;
  };
  if (v?.dataHoraTs?.toDate) return v.dataHoraTs.toDate();
  if (v?.dataHoraStr)        { const d = toDateSafe(v.dataHoraStr); if (d) return d; }
  if (v?.dataHora)           { const d = toDateSafe(v.dataHora);    if (d) return d; }
  if (v?.datahora)           { const d = toDateSafe(v.datahora);    if (d) return d; } // legado minúsculo
  return null;
}
function td(label, value){
  const el = document.createElement("td");
  el.setAttribute("data-label", label);
  el.innerHTML = value;
  return el;
}

/* Empresas (carrega rmUid/rmNome em data-*, e preenche map para fallback) */
async function carregarEmpresas(){
  empresaSelect.innerHTML = `<option value=''>Selecione...</option>`;
  const snap = await db.collection("empresas").orderBy("nome").get();
  snap.forEach(doc=>{
    const d = doc.data();
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = pickEmpresaNome(d) || doc.id;
    opt.dataset.rmUid  = d.rmUid || d.rmuid || d.rmId || "";
    opt.dataset.rmNome = d.rmNome || d.rm || "";
    empresaSelect.appendChild(opt);
    empresaRMMap.set(doc.id, { rmUid: opt.dataset.rmUid || null, rmNome: opt.dataset.rmNome || "" });
  });
}

/* Mostrar RM ao escolher a empresa (sem query adicional) */
empresaSelect?.addEventListener("change", ()=>{
  const nome = empresaSelect.selectedOptions[0]?.dataset?.rmNome || "";
  rmInfo.textContent = `(RM: ${nome || "não cadastrado"})`;
});

/* Filtro RM (tenta 'gerentes', senão usa empresas) */
async function carregarRMsFiltro(){
  try{
    const snapG = await db.collection("gerentes").orderBy("nome").get();
    if (!snapG.empty){
      filtroRm.innerHTML = `<option value="">Todos</option>`;
      snapG.forEach(doc=>{
        const o = document.createElement("option");
        o.value = doc.id;
        o.textContent = doc.data().nome || doc.data().displayName || doc.id;
        filtroRm.appendChild(o);
      });
      return;
    }
  }catch(e){}
  filtroRm.innerHTML = `<option value="">Todos</option>`;
  [...empresaRMMap.entries()]
    .filter(([,v])=> !!v.rmUid)
    .sort((a,b)=> (a[1].rmNome||"").localeCompare(b[1].rmNome||""))
    .forEach(([_,v])=>{
      const o = document.createElement("option");
      o.value = v.rmUid;
      o.textContent = v.rmNome || v.rmUid;
      filtroRm.appendChild(o);
    });
}

/* Salvar (erro real no alert) */
async function salvar(){
  const empresaId = empresaSelect?.value;
  if (!empresaId){ alert("Selecione a empresa."); return; }
  if (!dataHora?.value){ alert("Informe data e hora."); return; }

  const user = auth.currentUser;
  const uid  = user?.uid || null;

  const opt   = empresaSelect.selectedOptions[0];
  const rmUid = opt?.dataset.rmUid || null;
  const rmNom = opt?.dataset.rmNome || "";
  const empresaNome = opt?.textContent || "";

  const dt = new Date(dataHora.value);
  if (isNaN(+dt)){ alert("Data/hora inválida."); return; }

  const payload = {
    empresaId,
    empresaNome,
    rm: rmNom || null,
    rmUid: rmUid || null,
    tipo: (tipoVisita?.value || "").toString(),
    observacoes: (observacoes?.value || "").trim(),
    dataHoraTs:  firebase.firestore.Timestamp.fromDate(dt),
    dataHoraStr: dt.toISOString(),
    criadoPorUid: uid,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  };

  await db.collection("agenda_visitas").add(payload);
  if (observacoes) observacoes.value = "";
  if (dataHora) dataHora.value = "";
  await listarTodas();
  alert("Visita agendada!");
}

/* Render (ordem correta + conserta legado tipo/obs) */
function linhaTabela(id, v){
  const dt = getDateFromDoc(v);
  const dataFmt = dt ? fmtDate.format(dt) : "-";
  const horaFmt = dt ? fmtTime.format(dt) : "-";

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
  tr.appendChild(td("Ações", ""));
  return tr;
}

/* Listar TODAS (sem corte de “só futuras”), com filtros */
async function listarTodas(){
  lista.innerHTML = "";

  const snap = await db.collection("agenda_visitas")
    .orderBy("criadoEm", "desc")
    .limit(1000)
    .get();

  const rmSel   = filtroRm?.value || "";
  const tipoSel = filtroTipo?.value || "";
  const de      = filtroDe?.value ? new Date(filtroDe.value + "T00:00:00") : null;
  const ate     = filtroAte?.value ? new Date(filtroAte.value + "T23:59:59") : null;

  const rows = [];
  snap.forEach(doc=>{
    const v = doc.data();
    const dt = getDateFromDoc(v);
    if (!dt) return;

    if (de && dt < de) return;
    if (ate && dt > ate) return;
    if (rmSel && v.rmUid !== rmSel) return;
    if (tipoSel && v.tipo !== tipoSel) return;

    rows.push({ id: doc.id, v, dt });
  });

  rows.sort((a,b)=> a.dt - b.dt); // por data da visita

  if (!rows.length){ vazio.style.display="block"; return; }
  vazio.style.display="none";
  rows.forEach(({id, v})=> lista.appendChild(linhaTabela(id, v)));
}

/* Eventos */
document.getElementById("salvarVisita")?.addEventListener("click", ()=>{
  if (!auth.currentUser){ alert("Faça login novamente."); return; }
  salvar().catch(e=>{
    console.error(e);
    alert("Erro ao salvar: " + (e?.message || e));
  });
});
document.getElementById("recarregar")?.addEventListener("click", listarTodas);
btnFiltrar?.addEventListener("click", listarTodas);
btnLimpar?.addEventListener("click", ()=>{
  filtroRm.value = ""; filtroTipo.value = ""; filtroDe.value = ""; filtroAte.value = "";
  listarTodas();
});

/* Init */
auth.onAuthStateChanged(async ()=>{
  await carregarEmpresas();
  await carregarRMsFiltro();
  await listarTodas();
});
