firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

function carregarRamos() {
  db.collection("ramos-seguro").orderBy("ordem").get().then(snapshot => {
    let html = `
      <table>
        <thead>
          <tr>
            <th>Campo (ID)</th>
            <th>Nome de Exibição</th>
            <th>Ordem</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
    `;

    snapshot.forEach(doc => {
      const d = doc.data();
      html += `
        <tr>
          <td>${doc.id}</td>
          <td>${d.nomeExibicao || ""}</td>
          <td>${d.ordem || ""}</td>
          <td>
            <button class="btn-sm" onclick="editarRamo('${doc.id}')">Editar</button>
            <button class="btn-sm" onclick="excluirRamo('${doc.id}')">Excluir</button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    document.getElementById("listaRamos").innerHTML = html;
  });
}

function salvarRamo() {
  const idEdicao = document.getElementById("ramoId").value.trim();
  const campo = document.getElementById("campo").value.trim().toLowerCase().replace(/\s/g, "-");
  const nomeExibicao = document.getElementById("nomeExibicao").value.trim();
  const ordem = parseInt(document.getElementById("ordem").value);

  if (!campo || !nomeExibicao || isNaN(ordem)) {
    alert("Preencha todos os campos.");
    return;
  }

  const dados = { nomeExibicao, campo, ordem };

  db.collection("ramos-seguro").doc(campo).set(dados).then(() => {
    alert(idEdicao ? "Ramo atualizado com sucesso." : "Ramo criado com sucesso.");
    limparFormulario();
    carregarRamos();
  });
}

function editarRamo(id) {
  db.collection("ramos-seguro").doc(id).get().then(doc => {
    if (!doc.exists) return;
    const d = doc.data();
    document.getElementById("ramoId").value = id;
    document.getElementById("campo").value = id;
    document.getElementById("nomeExibicao").value = d.nomeExibicao;
    document.getElementById("ordem").value = d.ordem;
  });
}

function excluirRamo(id) {
  if (!confirm("Tem certeza que deseja excluir este ramo?")) return;
  db.collection("ramos-seguro").doc(id).delete().then(() => {
    alert("Ramo excluído com sucesso.");
    carregarRamos();
  });
}

function limparFormulario() {
  document.getElementById("ramoId").value = "";
  document.getElementById("campo").value = "";
  document.getElementById("nomeExibicao").value = "";
  document.getElementById("ordem").value = "";
}

window.addEventListener("DOMContentLoaded", carregarRamos);
