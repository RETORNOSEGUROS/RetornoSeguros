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
  const idManual = document.getElementById("ramoId").value.trim(); // usado na edição
  const campo = document.getElementById("campo").value.trim();
  const nomeExibicao = document.getElementById("nomeExibicao").value.trim();
  const ordem = parseInt(document.getElementById("ordem").value);

  if (!campo || !nomeExibicao || isNaN(ordem)) {
    alert("Preencha todos os campos.");
    return;
  }

  const dados = { nomeExibicao, campo, ordem };
  const id = campo; // usar campo como ID no Firestore

  db.collection("ramos-seguro").doc(id).set(dados).then(() => {
    alert(idManual ? "Ramo atualizado com sucesso." : "Ramo criado com sucesso.");
    limparFormulario();
    carregarRamos();
  });
}

function editarRamo(id) {
  db.collection("ramos-seguro").doc(id).get().then(doc => {
    if (!doc.exists) return;
    const d = doc.data();
    document.getElementById("ramoId").value = id;
    document.getElementById("campo").value = d.campo;
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
