// js/agenda-visitas.js
const auth = firebase.auth();
const db = firebase.firestore();

const empresaSelect = document.getElementById("empresaSelect");
const tipoVisita = document.getElementById("tipoVisita");
const dataHora = document.getElementById("dataHora");
const observacoes = document.getElementById("observacoes");
const lista = document.getElementById("listaVisitas");
const vazio = document.getElementById("vazio");

// Util: formata data/hora pt-BR
const fmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short"
});

function carregarEmpresas() {
  empresaSelect.innerHTML = "<option value=''>Selecione...</option>";
  db.collection("empresas").orderBy("nome").get().then(snap => {
    snap.forEach(doc => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = doc.data().nome || doc.id;
      empresaSelect.appendChild(opt);
    });
  }).catch(console.error);
}

function salvar() {
  const empId = empresaSelect.value;
  if (!empId) { alert("Selecione a empresa."); return; }
  if (!dataHora.value) { alert("Informe data e hora."); return; }

  const empNome = empresaSelect.selectedOptions[0].text;
  const tipo = tipoVisita.value;
  const dhLocal = new Date(dataHora.value); // do input local
  const rmNome =
    (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || "";

  const payload = {
    empresaId: empId,
    empresaNome: empNome,
    rm: rmNome,
    tipo,
    observacoes: observacoes.value || "",
    // guardamos um Timestamp para query + string para exibição/backup
    dataHoraTs: firebase.firestore.Timestamp.fromDate(dhLocal),
    dataHoraStr: dhLocal.toISOString(),
    criadoPorUid: auth.currentUser ? auth.currentUser.uid : null,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection("agenda_visitas").add(payload).then(() => {
    dataHora.value = ""; observacoes.value = "";
    listarProximas();
    alert("Visita agendada!");
  }).catch(err => {
    console.error(err);
    alert("Erro ao salvar. Veja o console.");
  });
}

function linhaTabela(id, v, isAdmin) {
  const dt = v.dataHoraTs ? v.dataHoraTs.toDate() : (v.dataHoraStr ? new Date(v.dataHoraStr) : null);
  const [dataFmt, horaFmt] = dt ? [fmt.format(dt).split(" ")[0], fmt.format(dt).split(" ")[1]] : ["-", "-"];

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${dataFmt}</td>
    <td>${horaFmt}</td>
    <td>${v.empresaNome || "-"}</td>
    <td>${v.rm || "-"}</td>
    <td><span class="badge">${v.tipo || "-"}</span></td>
    <td>${v.observacoes || "-"}</td>
    <td style="width:80px">${isAdmin ? `<button data-id="${id}" class="delBtn">Excluir</button>` : ""}</td>
  `;
  return tr;
}

function listarProximas() {
  lista.innerHTML = "";
  const agora = firebase.firestore.Timestamp.fromDate(new Date());

  // Próximas visitas (>= agora), ordenadas
  db.collection("agenda_visitas")
    .where("dataHoraTs", ">=", agora)
    .orderBy("dataHoraTs", "asc")
    .get()
    .then(async snap => {
      const user = auth.currentUser;
      const isAdmin = !!(user && user.email === "patrick@retornoseguros.com.br");

      if (snap.empty) {
        vazio.style.display = "block";
        return;
      }
      vazio.style.display = "none";

      snap.forEach(doc => {
        const v = doc.data();
        lista.appendChild(linhaTabela(doc.id, v, isAdmin));
      });

      // bind excluir (somente admin)
      if (isAdmin) {
        document.querySelectorAll(".delBtn").forEach(btn => {
          btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            if (!confirm("Excluir este agendamento?")) return;
            db.collection("agenda_visitas").doc(id).delete().then(listarProximas);
          });
        });
      }
    })
    .catch(err => {
      console.error("Erro ao listar visitas:", err);
    });
}

// Eventos
document.getElementById("salvarVisita").addEventListener("click", () => {
  if (!auth.currentUser) { alert("Faça login novamente."); return; }
  salvar();
});
document.getElementById("recarregar").addEventListener("click", listarProxima
