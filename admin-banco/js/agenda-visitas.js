// js/agenda-visitas.js
const auth = firebase.auth();
const db = firebase.firestore();

const empresaSelect = document.getElementById("empresaSelect");
const tipoVisita = document.getElementById("tipoVisita");
const dataHora = document.getElementById("dataHora");
const observacoes = document.getElementById("observacoes");
const lista = document.getElementById("listaVisitas");
const vazio = document.getElementById("vazio");

const fmt = new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"});

/* ========= EMPRESAS NO SELECT ========= */
function carregarEmpresas(){
  empresaSelect.innerHTML = "<option value=''>Selecione...</option>";
  db.collection("empresas").orderBy("nome").get().then(snap=>{
    snap.forEach(doc=>{
      const o=document.createElement("option");
      o.value=doc.id; 
      o.textContent=doc.data().nome || doc.id;
      empresaSelect.appendChild(o);
    });
  }).catch(console.error);
}

/* ========= SALVAR VISITA (com RM da EMPRESA) ========= */
function salvar(){
  const empresaId = empresaSelect.value;
  if(!empresaId){ alert("Selecione a empresa."); return; }
  if(!dataHora.value){ alert("Informe data e hora."); return; }

  const tipo = tipoVisita.value;
  const dhLocal = new Date(dataHora.value);
  const obs = (observacoes.value || "").trim();
  const criadoPorUid = auth.currentUser ? auth.currentUser.uid : null;

  // 1) Buscamos a empresa para pegar nome + RM corretos
  db.collection("empresas").doc(empresaId).get().then(empDoc=>{
    if(!empDoc.exists){ alert("Empresa não encontrada."); return Promise.reject("empresa_nao_encontrada"); }
    const emp = empDoc.data();

    // 2) Monta payload usando RM e nome da empresa
    const payload = {
      empresaId,
      empresaNome: emp.nome || "",
      rm: emp.rm || "",                       // ✅ RM vindo da EMPRESA
      tipo,
      observacoes: obs,
      dataHoraTs: firebase.firestore.Timestamp.fromDate(dhLocal),
      dataHoraStr: dhLocal.toISOString(),
      criadoPorUid,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };

    // 3) Grava
    return db.collection("agenda_visitas").add(payload);
  }).then(()=>{
    dataHora.value = "";
    observacoes.value = "";
    listarProximas();
    alert("Visita agendada!");
  }).catch(err=>{
    if(err !== "empresa_nao_encontrada"){
      console.error("Erro ao salvar agendamento:", err);
      alert("Erro ao salvar. Veja o console.");
    }
  });
}

/* ========= RENDER ========= */
function td(label, value, extra=""){
  const el = document.createElement("td");
  el.setAttribute("data-label", label);
  el.innerHTML = value + extra;
  return el;
}

function linhaTabela(id, v, isAdmin){
  const dt = v.dataHoraTs ? v.dataHoraTs.toDate() : (v.dataHoraStr ? new Date(v.dataHoraStr) : null);
  const formatted = dt ? fmt.format(dt) : "-";
  const [dataFmt, horaFmt] = dt ? [formatted.split(" ")[0], formatted.split(" ")[1]] : ["-","-"];

  const tr=document.createElement("tr");
  tr.appendChild(td("Data", dataFmt));
  tr.appendChild(td("Hora", horaFmt));
  tr.appendChild(td("Empresa", v.empresaNome || "-"));
  tr.appendChild(td("RM", `<span class="rm-chip">${v.rm || "-"}</span>`));     // ✅ agora preenche
  tr.appendChild(td("Tipo", `<span class="badge">${v.tipo || "-"}</span>`));
  tr.appendChild(td("Observações", v.observacoes || "-"));

  const tdActions = td("Ações", "");
  tdActions.className = "actions-col";
  if(isAdmin){
    const b=document.createElement("button");
    b.textContent="Excluir";
    b.className="btn";
    b.addEventListener("click", ()=>{
      if(!confirm("Excluir este agendamento?")) return;
      db.collection("agenda_visitas").doc(id).delete().then(listarProximas);
    });
    tdActions.appendChild(b);
  }
  tr.appendChild(tdActions);
  return tr;
}

/* ========= LISTAR PRÓXIMAS ========= */
function listarProximas(){
  lista.innerHTML="";
  const agora = firebase.firestore.Timestamp.fromDate(new Date());

  const user = auth.currentUser;
  const isAdmin = !!(user && user.email === "patrick@retornoseguros.com.br");

  db.collection("agenda_visitas")
    .where("dataHoraTs", ">=", agora)
    .orderBy("dataHoraTs","asc")
    .get()
    .then(snap=>{
      if(snap.empty){ vazio.style.display="block"; return; }
      vazio.style.display="none";
      snap.forEach(doc=>{
        lista.appendChild(linhaTabela(doc.id, doc.data(), isAdmin));
      });
    })
    .catch(err=>console.error("Erro ao listar visitas:",err));
}

/* ========= EVENTOS ========= */
document.getElementById("salvarVisita").addEventListener("click", ()=>{
  if(!auth.currentUser){ alert("Faça login novamente."); return; }
  salvar();
});
document.getElementById("recarregar").addEventListener("click", listarProximas);

/* ========= INIT ========= */
auth.onAuthStateChanged(()=>{ carregarEmpresas(); listarProximas(); });
