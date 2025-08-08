const db = firebase.firestore();

// Carregar empresas no select
db.collection("empresas").orderBy("nome").get().then(snapshot => {
  let select = document.getElementById("empresaSelect");
  snapshot.forEach(doc => {
    let opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = doc.data().nome;
    select.appendChild(opt);
  });
});

// Salvar nova visita
document.getElementById("salvarVisita").addEventListener("click", () => {
  const empresaId = document.getElementById("empresaSelect").value;
  const empresaNome = document.getElementById("empresaSelect").selectedOptions[0].text;
  const tipo = document.getElementById("tipoVisita").value;
  const dataHora = document.getElementById("dataHora").value;
  const observacoes = document.getElementById("observacoes").value;

  if (!empresaId || !dataHora) {
    alert("Selecione a empresa e a data/hora da visita.");
    return;
  }

  db.collection("agenda_visitas").add({
    empresaId,
    empresaNome,
    rm: firebase.auth().currentUser.displayName || "",
    tipo,
    dataHora,
    observacoes,
    criadoPorUid: firebase.auth().currentUser.uid,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    alert("Visita agendada!");
    carregarVisitas();
  }).catch(err => {
    console.error("Erro ao salvar visita:", err);
  });
});

// Listar próximas visitas
function carregarVisitas() {
  const hoje = new Date().toISOString();
  db.collection("agenda_visitas")
    .where("dataHora", ">=", hoje)
    .orderBy("dataHora", "asc")
    .get()
    .then(snapshot => {
      let tbody = document.getElementById("listaVisitas");
      tbody.innerHTML = "";
      snapshot.forEach(doc => {
        const v = doc.data();
        const [data, hora] = v.dataHora.split("T");
        tbody.innerHTML += `<tr>
          <td>${data}</td>
          <td>${hora}</td>
          <td>${v.empresaNome}</td>
          <td>${v.rm}</td>
          <td>${v.tipo}</td>
          <td>${v.observacoes}</td>
        </tr>`;
      });
    });
}

carregarVisitas();
