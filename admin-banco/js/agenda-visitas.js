// agenda-visitas.js (v10)
const VERSION = "agenda-visitas.v10";
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

// data em pt-BR
const fmt = new Intl.DateTimeFormat("pt-BR",{ dateStyle:"short", timeStyle:"short" });

/* Helpers */
const pickEmpresaNome = (emp)=>(emp?.nome||emp?.razaoSocial||emp?.razao_social||emp?.fantasia||emp?.nomeFantasia||"")+""; 
function getDateFromDoc(v){
  if (v?.dataHoraTs?.toDate) return v.dataHoraTs.toDate();
  if (v?.dataHoraStr)        return new Date(v.dataHoraStr);
  if (v?.dataHora)           return new Date(v.dataHora);
  return null;
}
function td(label, value){
  const el = document.createElement("td");
  el.setAttribute("data-label", label);
  el.innerHTML = value;
  return el;
}

/* Carregar empresas (com rmUid/rmNome em data-*) */
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
  });
}

/* Exibir RM imediatamente (sem segunda query) */
empresaSelect?.addEventListener("change", ()=>{
  const nome = empresaSelect.selectedOptions[0]?.dataset?.rmNome || "";
  rmInfo.textContent = `(RM: ${nome || "não cadastrado"})`;
});

/* Montar filtro RM a partir das empresas carregadas (à prova de regras) */
function montarFiltroRMFromEmpresas(){
  const set = new Map();
  [...empresaSelect.options].forEach(opt=>{
    const id = opt.dataset?.rmUid;
    const nm = opt.dataset?.rmNome;
    if (id) set.set(id, nm || id);
  });
  filtroRm.innerHTML = `<option value="">Todos</option>`;
  [...set.entries()]
    .sort((a,b)=> (a[1]||"").localeCompare(b[1]||""))
    .forEach(([id,nm])=>{
      const o = document.createElement("option");
      o.value = id; o.textContent = nm || id;
      filtroRm.appendChild(o);
    });
}

/* (Opcional) tentar pela coleção gerentes; se falhar, usa fromEmpresas */
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
  }catch(e){ /* ignore e usa fallback */ }
  montarFiltroRMFromEmpresas();
}

/* Salvar (usa rm do option selecionado) */
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

  const payload = {
    empresaId,
    empresaNome,
    rm: rmNom || null,
    rmUid: rmUid || null,
    tipo: (tipoVisita?.value || "").toString(),
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
}

/* Render (ordem correta + correção de registros antigos) */
function linhaTabela(id, v, isAdmin){
  const dt = getDateFromDoc(v);
  const formatted = dt ? fmt.format(dt) : "-";
  const [dataFmt, horaFmt] = dt ? [formatted.split(" ")[0], formatted.split(" ")[1]] : ["-","-"];

  // conserta legado: se tipo não for Presencial/Online e obs estiver vazia, invertemos para exibição
  let tipo = v.tipo || "";
  let obs  = v.observacoes || "";
  if (tipo && !["Presencial","Online"].includes(tipo) && !obs){
    obs = tipo; tipo = ""; // só para display
  }

  const tr = document.createElement("tr");
  tr.appendChild(td("Data", dataFmt));
  tr.appendChild(td("Hora", horaFmt));
  tr.appendChild(td("Empresa", v.empresaNome || "-"));
  tr.appendChild(td("RM", `<span class="rm-chip">${v.rm || "-"}</span>`));
  tr.appendChild(td("Tipo", `<span class="badge">${tipo || "-"}</span>`));
  tr.appendChild(td("Observações", obs || "-"));

  const act = td("Ações", "");
  act.className = "actions-col";
  tr.appendChild(act);
  return tr;
}

/* Listar + filtros (data em pt-BR) */
async function listarProximas(){
  lista.innerHTML = "";

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
    if (dt < agora) return;           // só futuras
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
  await carregarRMsFiltro();          // tenta gerentes
  montarFiltroRMFromEmpresas();       // garante via empresas
  await listarProximas();
});
