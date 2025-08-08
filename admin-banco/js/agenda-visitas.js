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
function pickRM(emp){
  if (!emp) return "";
  // tentativas explícitas
  const direct = emp.rm || emp.RM || emp.responsavel || emp["responsável"] || emp.rm_nome || emp.nomeRM || emp.gerente || emp.rmBanco;
  if (direct) return direct;
  // fallback por regex em qualquer chave parecida
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

/* ========= salvar visita (busca RM na empresa) ========= */
function salvar(){
  const empresaId = empresaSelect.value;
  if (!empresaId)     { alert("Selecione a empresa."); return; }
  if (!dataHora.value){ alert("Informe data e hora."); return; }

  const tipo   = tipoVisita.value;
  const dh     = new Date(dataHora.value);
  const obs    = (observacoes.value || "").trim();
  const uid    = auth.currentUser ? auth.currentUser.uid : null;

  return db.collection("empresas").doc(empresaId).get()
    .then(empDoc=>{
      if (!empDoc.exists){ alert("Empresa não encontrada."); throw new Error("empresa_nao_encontrada"); }
      const emp = empDoc.data();

      const payload = {
        empresaId,
        empresaNome: pickEmpresaNome(emp),
        rm: pickRM(emp),                                 // ✅ Pega RM robusto
        tipo,
        observacoes: obs,
        dataHoraTs:  firebase.firestore.Timestamp.fromDate(dh),
        dataHoraStr: dh.toISOString(),
        criadoPorUid: uid,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      };

      return db.collection("agenda_visitas").add(payload);
    })
    .then(()=>{
      dataHora.value=""; observacoes.value="";
      listarProximas();
      alert("Visita agendada!");
    })
    .catch(err=>{
      if (err.message !== "empresa_nao_encontrada"){
        console.error("Erro ao salvar:", err);
        alert("Erro ao salvar. Veja o console.");
      }
    });
}

/* ========= render ========= */
function linhaTabela(id, v, isAdmin){
  const dt = v.dataHoraTs ? v.dataHoraTs.toDate() : (v.dataHoraStr ? new Date(v.dataHoraStr) : null);
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

/* ========= listar próximas ========= */
function listarProximas(){
  lista.innerHTML = "";
  const agora = firebase.firestore.Timestamp.fromDate(new Date());
  const user = auth.currentUser;
  const isAdmin = !!(user && user.email === "patrick@retornoseguros.com.br");

  db.collection("agenda_visitas")
    .where("dataHoraTs", ">=", agora)
    .orderBy("dataHoraTs", "asc")
    .get()
    .then(snap=>{
      if (snap.empty){ vazio.style.display="block"; return; }
      vazio.style.display="none";
      snap.forEach(doc=>{
        lista.appendChild(linhaTabela(doc.id, doc.data(), isAdmin));
      });
    })
    .catch(err=>console.error("Erro ao listar visitas:", err));
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
