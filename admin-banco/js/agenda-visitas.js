// js/agenda-visitas.js
const auth = firebase.auth();
const db = firebase.firestore();

/* ====== DOM ====== */
const empresaSelect = document.getElementById("empresaSelect");
const tipoVisita    = document.getElementById("tipoVisita");
const dataHora      = document.getElementById("dataHora");
const observacoes   = document.getElementById("observacoes");
const lista         = document.getElementById("listaVisitas");
const vazio         = document.getElementById("vazio");

// filtros
const filtroRm   = document.getElementById("filtroRm");
const filtroTipo = document.getElementById("filtroTipo");
const filtroDe   = document.getElementById("filtroDe");
const filtroAte  = document.getElementById("filtroAte");

const fmt = new Intl.DateTimeFormat("pt-BR",{ dateStyle:"short", timeStyle:"short" });

/* ====== Helpers ====== */
function pickEmpresaNome(emp){
  if (!emp) return "";
  return emp.nome || emp.NOME || emp.razaoSocial || emp.razao_social || emp.fantasia || emp.nomeFantasia || "";
}
function pickRMNomeDireto(emp){
  if (!emp) return "";
  const direct = emp.rm || emp.RM || emp.responsavel || emp["responsável"] || emp.rm_nome || emp.nomeRM || emp.gerente || emp.rmBanco;
  if (direct) return direct;
  const k = Object.keys(emp).find(key => /^(rm|responsavel|responsável|gerente|nome_rm|rm_nome|nomeRM)$/i.test(key));
  return k ? emp[k] : "";
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

/* ====== Roles ======
   Espera encontrar um dos formatos:
   - usuarios/<uid> com campo role | perfil | tipoUsuario
   - gerentes/<uid> com campo cargo | perfil | role
*/
async function getUserRole(uid, email){
  if (!uid) return "desconhecido";
  // Admin por email (rápido)
  if (email === "patrick@retornoseguros.com.br") return "admin";

  const tryPaths = [
    ["usuarios", uid],
    ["gerentes", uid]
  ];
  for (const [col, id] of tryPaths){
    try{
      const snap = await db.collection(col).doc(id).get();
      if (snap.exists){
        const d = snap.data();
        const r = (d.role || d.perfil || d.tipoUsuario || d.cargo || "").toString().toLowerCase();
        if (r.includes("admin")) return "admin";
        if (r.includes("gerente chefe") || r.includes("gerente-chefe") || r.includes("gerente_chefe")) return "gerente-chefe";
        if (r.includes("assistente")) return "assistente";
        if (r.includes("rm")) return "rm";
      }
    }catch(_){}
  }
  return "rm"; // default conservador
}

/* ====== Empresas e RMs (para selects) ====== */
async function carregarEmpresas(){
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
  filtroRm.innerHTML = "<option value=''>Todos</option>";
  const snap = await db.collection("gerentes").orderBy("nome").get().catch(()=>null);
  if (!snap) return;
  snap.forEach(doc=>{
    const d = doc.data();
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = d.nome || d.displayName || doc.id;
    filtroRm.appendChild(opt);
  });
}

/* ====== Resolver RM (nome + uid) a partir da empresa ====== */
const rmCache = new Map();
async function resolveRMFromEmpresa(emp){
  const nomeDireto = pickRMNomeDireto(emp);
  const rmUid = emp.rmuid || emp.rmUid || emp.rmId || emp.RMUID || emp.RMId || emp.rm_uid || null;

  if (nomeDireto && rmUid) return { rmNome: nomeDireto, rmUid };

  if (rmUid){
    if (rmCache.has(rmUid)) return { rmNome: rmCache.get(rmUid), rmUid };
    try{
      const g = await db.collection("gerentes").doc(rmUid).get();
      const nome = g.exists ? (g.data().nome || g.data().displayName || "") : "";
      rmCache.set(rmUid, nome);
      return { rmNome: nome || nomeDireto || "", rmUid };
    }catch{
      return { rmNome: nomeDireto || "", rmUid };
    }
  }
  return { rmNome: nomeDireto || "", rmUid: null };
}

/* ====== Salvar ====== */
async function salvar(){
  const empresaId = empresaSelect.value;
  if (!empresaId){ alert("Selecione a empresa."); return; }
  if (!dataHora.value){ alert("Informe data e hora."); return; }

  const tipo = tipoVisita.value;
  const dh   = new Date(dataHora.value);
  const obs  = (observacoes.value || "").trim();
  const user = auth.currentUser;
  const uid  = user ? user.uid : null;

  try{
    const empDoc = await db.collection("empresas").doc(empresaId).get();
    if (!empDoc.exists) { alert("Empresa não encontrada."); return; }
    const emp = empDoc.data();
    const { rmNome, rmUid } = await resolveRMFromEmpresa(emp);

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

    dataHora.value=""; observacoes.value="";
    await listarProximas(); // refresh
    alert("Visita agendada!");
  }catch(e){
    console.error(e);
    alert("Erro ao salvar. Veja o console.");
  }
}

/* ====== Render linha ====== */
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

/* ====== Listagem com papéis + filtros ======
   Observação: para suportar legados e evitar índices, buscamos por 'criadoEm' e filtramos em memória.
*/
async function listarProximas(){
  lista.innerHTML = "";
  const user = auth.currentUser;
  const email = user?.email || "";
  const uid   = user?.uid || "";
  const role  = await getUserRole(uid, email);
  const isAdmin = role === "admin";

  // janela de busca ampla
  const snap = await db.collection("agenda_visitas")
    .orderBy("criadoEm", "desc")
    .limit(500)
    .get();

  const de = filtroDe.value ? new Date(filtroDe.value + "T00:00:00") : null;
  const ate = filtroAte.value ? new Date(filtroAte.value + "T23:59:59") : null;
  const rmSel = filtroRm.value || "";
  const tipoSel = filtroTipo.value || "";

  const rows = [];
  snap.forEach(doc=>{
    const v = doc.data();
    const dt = getDateFromDoc(v);
    if (!dt) return;

    // restrição por papel
    if (role === "rm" && v.rmUid && v.rmUid !== uid) return;

    // filtros
    if (de && dt < de) return;
    if (ate && dt > ate) return;
    if (rmSel && (v.rmUid !== rmSel)) return;
    if (tipoSel && v.tipo !== tipoSel) return;

    rows.push({ id: doc.id, v, dt });
  });

  rows.sort((a,b)=> a.dt - b.dt);

  if (!rows.length){ vazio.style.display="block"; return; }
  vazio.style.display="none";
  rows.forEach(({id, v})=> lista.appendChild(linhaTabela(id, v, isAdmin)));
}

/* ====== Eventos ====== */
document.getElementById("salvarVisita").addEventListener("click", ()=>{
  if (!auth.currentUser){ alert("Faça login novamente."); return; }
  salvar();
});
document.getElementById("recarregar").addEventListener("click", listarProximas);
document.getElementById("btnFiltrar").addEventListener("click", listarProximas);
document.getElementById("btnLimpar").addEventListener("click", ()=>{
  filtroRm.value = ""; filtroTipo.value=""; filtroDe.value=""; filtroAte.value="";
  listarProximas();
});

/* ====== Init ====== */
auth.onAuthStateChanged(async (u)=>{
  await carregarEmpresas();
  await carregarRMsFiltro();
  await listarProximas();
});
