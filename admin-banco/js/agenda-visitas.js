// js/agenda-visitas.js
const auth = firebase.auth();
const db = firebase.firestore();

const empresaSelect = document.getElementById("empresaSelect");
const tipoVisita   = document.getElementById("tipoVisita");
const dataHora     = document.getElementById("dataHora");
const observacoes  = document.getElementById("observacoes");
const lista        = document.getElementById("listaVisitas");
const vazio        = document.getElementById("vazio");

const fmt = new Intl.DateTimeFormat("pt-BR",{ dateStyle:"short", timeStyle:"short" });

/* ========= helpers ========= */
function pickEmpresaNome(emp){
  if (!emp) return "";
  return emp.nome || emp.NOME || emp.razaoSocial || emp.razao_social || emp.fantasia || emp.nomeFantasia || "";
}
function pickRMNomeDireto(emp){
  if (!emp) return "";
  const direct = emp.rm || emp.RM || emp.responsavel || emp["responsável"] || emp.rm_nome || emp.nomeRM || emp.gerente || emp.rmBanco;
  if (direct) return direct;
  const k = Object.keys(emp).find(key =>
    /^(rm|responsavel|responsável|gerente|nome_rm|rm_nome|nomeRM)$/i.test(key)
  );
  return k ? emp[k] : "";
}
function td(label, value){
  const el = document.createElement("td");
  el.setAttribute("data-label", label);
  el.innerHTML = value;
  return el;
}

/* ========= RM resolver (busca em gerentes quando vier rmuid) ========= */
const rmCache = new Map();
async function resolveRM(emp){
  // 1) tenta nome direto na empresa
  const direto = pickRMNomeDireto(emp);
  if (direto) return direto;

  // 2) tenta por id do RM
  const rmId = emp.rmuid || emp.rmUid || emp.rmId || emp.RMUID || emp.RMId || emp.rm_uid;
  if (!rmId) return ""; // sem referência

  if (rmCache.has(rmId)) return rmCache.get(rmId);

  try {
    const doc = await db.collection("gerentes").doc(rmId).get();
    const nome = doc.exists ? (doc.data().nome || doc.data().NOME || doc.data().displayName || "") : "";
    rmCache.set(rmId, nome);
    return nome;
  } catch {
    return "";
  }
}

/* ========= carregar empresas ========= */
function carregarEmpresas(){
  empresaSelect.innerHTML = "<option value=''>Selecione...</option>";
  db.collection("empresas").orderBy("nome").get().then(snap=>{
    snap.forEach(doc=>{
      const d = doc.data();
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = pickEmpresaNome(d) || doc.id;
      empresaSelect.appendChild(opt);
    });
  }).catch(console.error);
}

/* ========= salvar visita ========= */
async function salvar(){
  const empresaId = empresaSelect.value;
  if (!empresaId)     { alert("Selecione a empresa."); return; }
  if (!dataHora.value){ alert("Informe data e hora."); return; }

  const tipo   = tipoVisita.value;
  const dh     = new Date(dataHora.value);
  const obs    = (observacoes.value || "").trim();
  const uid    = auth.currentUser ? auth.currentUser.uid : null;

  try {
    const empDoc = await db.collection("empresas").doc(empresaId).get();
    if (!empDoc.exists){ alert("Empresa não encontrada."); return; }
    const emp = empDoc.data();

    const rmNome = await resolveRM(emp);

    const payload = {
      empresaId,
      empresaNome: pickEmpresaNome(emp),
      rm: rmNome,                               // ✅ nome do RM resolvido
      tipo,                                     // ✅ Presencial/Online
      observacoes: obs,
      dataHoraTs:  firebase.firestore.Timestamp.fromDate(dh), // ✅ timestamp
      dataHoraStr: dh.toISOString(),                           // ✅ ISO string (fallback)
      criadoPorUid: uid,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("agenda_visitas").add(payload);
    dataHora.value=""; observacoes.value="";
    await listarProximas();
    alert("Visita agendada!");
  } catch (err){
    console.error("Erro ao salvar:", err);
    alert("Erro ao salvar. Veja o console.");
  }
}

/* ========= parse genérico p/ legados ========= */
function getDateFromDoc(v){
  if (v.dataHoraTs && v.dataHoraTs.toDate) return v.dataHoraTs.toDate();
  if (v.dataHoraStr) return new Date(v.dataHoraStr);
  if (v.dataHora)    return new Date(v.dataHora);  // legado que você tem no print
  return null;
}

/* ========= render ========= */
function linhaTabela(id, v, isAdmin){
  const dt = getDateFromDoc(v);
  const formatted = dt ? fmt.format(dt) : "-";
  const [dataFmt, horaFmt] = dt ? [formatted.split(" ")[0], formatted.split(" ")[1]] : ["-","-"];

  const tr = document.createElement("tr");
  tr.appendChild(td("Data", dataFmt));
  tr.appendChild(td("Hora", horaFmt));
  tr.appendChild(td("Empresa", v.empresaNome || "-"));
  tr.appendChild(td("RM", `<span class="rm-chip">${(v.rm || "-")}</span>`));
  tr.appendChild(td("Tipo", `<span class="badge">${(v.tipo || "-")}</span>`));
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

/* ========= listar próximas (compatível com legados) ========= */
async function listarProximas(){
  lista.innerHTML = "";
  const agora = new Date();
  const user = auth.currentUser;
  const isAdmin = !!(user && user.email === "patrick@retornoseguros.com.br");

  try {
    // Pega um volume razoável e filtra no cliente para suportar documentos antigos sem dataHoraTs
    const snap = await db.collection("agenda_visitas")
      .orderBy("criadoEm", "desc")
      .limit(300)
      .get();

    const rows = [];
    snap.forEach(doc=>{
      const v = doc.data();
      const dt = getDateFromDoc(v);
      if (!dt) return;
      if (dt >= agora) rows.push({ id: doc.id, v, dt });
    });

    rows.sort((a,b)=> a.dt - b.dt);

    if (!rows.length){ vazio.style.display="block"; return; }
    vazio.style.display="none";

    rows.forEach(({id, v})=>{
      lista.appendChild(linhaTabela(id, v, isAdmin));
    });
  } catch (err){
    console.error("Erro ao listar visitas:", err);
  }
}

/* ========= eventos ========= */
document.getElementById("salvarVisita").addEventListener("click", ()=>{
  if (!auth.currentUser){ alert("Faça login novamente."); return; }
  salvar();
});
document.getElementById("recarregar").addEventListener("click", listarProximas);

/* ========= init ========= */
auth.onAuthStateChanged(()=>{
  carregarEmpresas();
  listarProximas();
});
