// js/agenda-visitas.js
const auth = firebase.auth();
const db = firebase.firestore();

/* ===== DOM ===== */
const empresaSelect = document.getElementById("empresaSelect");
const tipoVisita    = document.getElementById("tipoVisita");
const dataHora      = document.getElementById("dataHora");
const observacoes   = document.getElementById("observacoes");
const lista         = document.getElementById("listaVisitas");
const vazio         = document.getElementById("vazio");

// campos opcionais (existem no HTML mais novo)
const filtroRm   = document.getElementById("filtroRm");
const filtroTipo = document.getElementById("filtroTipo");
const filtroDe   = document.getElementById("filtroDe");
const filtroAte  = document.getElementById("filtroAte");
const btnFiltrar = document.getElementById("btnFiltrar");
const btnLimpar  = document.getElementById("btnLimpar");
const rmForm     = document.getElementById("rmForm"); // readonly opcional

const fmt = new Intl.DateTimeFormat("pt-BR",{ dateStyle:"short", timeStyle:"short" });

/* ===== Helpers ===== */
function pickEmpresaNome(emp){
  if (!emp) return "";
  return emp.nome || emp.NOME || emp.razaoSocial || emp.razao_social || emp.fantasia || emp.nomeFantasia || "";
}
function getDateFromDoc(v){
  if (v.dataHoraTs && v.dataHoraTs.toDate) return v.dataHoraTs.toDate();
  if (v.dataHoraStr) return new Date(v.dataHoraStr);
  if (v.dataHora)    return new Date(v.dataHora); // legado
  return null;
}
function td(label, value){
  const el = document.createElement("td");
  el.setAttribute("data-label", label);
  el.innerHTML = value;
  return el;
}

/* ===== Roles ===== */
async function getUserRole(uid, email){
  if (!uid) return "desconhecido";
  if (email === "patrick@retornoseguros.com.br") return "admin";

  const places = [["usuarios", uid], ["gerentes", uid]];
  for (const [col, id] of places){
    try{
      const snap = await db.collection(col).doc(id).get();
      if (snap.exists){
        const d = snap.data();
        const r = (d.role || d.perfil || d.tipoUsuario || d.cargo || "").toString().toLowerCase();
        if (r.includes("admin")) return "admin";
        if (r.includes("gerente chefe") || r.includes("gerente-chefe")) return "gerente-chefe";
        if (r.includes("assistente")) return "assistente";
        if (r.includes("rm")) return "rm";
      }
    }catch(_){}
  }
  return "rm";
}

/* ===== Empresas / RMs (para selects) ===== */
async function carregarEmpresas(){
  if (!empresaSelect) return;
  empresaSelect.innerHTML = "<option value=''>Selecione...</option>";
  const snap = await db.collection("empresas").orderBy("nome").get();
  snap.forEach(doc=>{
    const d = doc.data();
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = pickEmpresaNome(d) || doc.id;
    empresaSelect.appendChild(opt);
  });
}

async function carregarRMsFiltro(){
  if (!filtroRm) return; // página sem filtros
  filtroRm.innerHTML = "<option value=''>Todos</option>";
  const snap = await db.collection("gerentes").orderBy("nome").get().catch(()=>null);
  if (!snap) return;
  snap.forEach(doc=>{
    const d = doc.data();
    const opt = document.createElement("option");
    opt.value = doc.id; // assumindo doc.id = uid do gerente
    opt.textContent = d.nome || d.displayName || doc.id;
    filtroRm.appendChild(opt);
  });
}

/* ===== Preencher RM do formulário ao selecionar empresa (opcional) ===== */
empresaSelect?.addEventListener("change", async ()=>{
  if (!rmForm) return;
  const id = empresaSelect.value;
  if (!id){ rmForm.value = ""; return; }
  const empDoc = await db.collection("empresas").doc(id).get();
  if (!empDoc.exists){ rmForm.value = ""; return; }
  const emp = empDoc.data();
  const nome = emp.rmNome || emp.rm || "";
  rmForm.value = nome || "(não cadastrado)";
});

/* ===== Salvar ===== */
async function salvar(){
  const empresaId = empresaSelect?.value;
  if (!empresaId){ alert("Selecione a empresa."); return; }
  if (!dataHora?.value){ alert("Informe data e hora."); return; }

  const user = auth.currentUser;
  const uid  = user ? user.uid : null;

  const tipo = tipoVisita?.value || "";
  const dh   = new Date(dataHora.value);
  const obs  = (observacoes?.value || "").trim();

  try{
    const empDoc = await db.collection("empresas").doc(empresaId).get();
    if (!empDoc.exists) { alert("Empresa não encontrada."); return; }
    const emp = empDoc.data();

    // >>>> do print: rmUid, rmNome, rm
    const rmUid  = emp.rmUid || emp.rmuid || emp.rmId || null;
    const rmNome = emp.rmNome || emp.rm || "";

    const payload = {
      empresaId,
      empresaNome: pickEmpresaNome(emp),
      rm: rmNome,
      rmUid: rmUid || null,
      tipo,
      observacoes: obs,
      dataHoraTs:  firebase.firestore.Timestamp.fromDate(dh),
      dataHoraStr: dh.toISOString(),
      criadoPorUid: uid,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("agenda_visitas").add(payload);
    if (dataHora) dataHora.value = "";
    if (observacoes) observacoes.value = "";
    await listarProximas();
    alert("Visita agendada!");
  }catch(e){
    console.error(e);
    alert("Erro ao salvar. Veja o console.");
  }
}

/* ===== Render linha ===== */
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

/* ===== Listagem com papéis + filtros ===== */
async function listarProximas(){
  if (!lista) return;
  lista.innerHTML = "";

  const user = auth.currentUser;
  const email = user?.email || "";
  const uid   = user?.uid || "";
  const role  = await getUserRole(uid, email);
  const isAdmin = role === "admin";

  // janela ampla (também cobre registros antigos sem índices por data)
  const snap = await db.collection("agenda_visitas")
    .orderBy("criadoEm", "desc")
    .limit(600)
    .get();

  // preparar filtros (se não houver campos, ficam nulos)
  const de   = filtroDe?.value ? new Date(filtroDe.value + "T00:00:00") : null;
  const ate  = filtroAte?.value ? new Date(filtroAte.value + "T23:59:59") : null;
  const rmId = filtroRm?.value || "";
  const tSel = filtroTipo?.value || "";

  const agora = new Date();
  const rows = [];

  snap.forEach(doc=>{
    const v = doc.data();
    const dt = getDateFromDoc(v);
    if (!dt) return;

    // Mostrar somente visitas futuras (como seu layout indica)
    if (dt < agora) return;

    // restrição por papel
    if (role === "rm" && v.rmUid && v.rmUid !== uid) return;

    // filtros
    if (de && dt < de) return;
    if (ate && dt > ate) return;
    if (rmId && (v.rmUid !== rmId)) return;
    if (tSel && v.tipo !== tSel) return;

    rows.push({ id: doc.id, v, dt });
  });

  rows.sort((a,b)=> a.dt - b.dt);

  if (!rows.length){ if (vazio) vazio.style.display="block"; return; }
  if (vazio) vazio.style.display="none";
  rows.forEach(({id, v})=> lista.appendChild(linhaTabela(id, v, isAdmin)));
}

/* ===== Eventos ===== */
document.getElementById("salvarVisita")?.addEventListener("click", ()=>{
  if (!auth.currentUser){ alert("Faça login novamente."); return; }
  salvar();
});
document.getElementById("recarregar")?.addEventListener("click", listarProximas);
btnFiltrar?.addEventListener("click", listarProximas);
btnLimpar?.addEventListener("click", ()=>{
  if (filtroRm)   filtroRm.value = "";
  if (filtroTipo) filtroTipo.value = "";
  if (filtroDe)   filtroDe.value = "";
  if (filtroAte)  filtroAte.value = "";
  listarProximas();
});

/* ===== Init ===== */
auth.onAuthStateChanged(async ()=>{
  await carregarEmpresas();
  await carregarRMsFiltro();
  await listarProximas();
});
