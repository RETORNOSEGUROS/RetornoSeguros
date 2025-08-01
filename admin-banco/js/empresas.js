firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const produtos = [
  "vida_funcionarios",
  "saude",
  "saude_socios",
  "frota",
  "empresarial",
  "do",
  "dental",
  "pessoa_chave"
];

const nomesProdutos = {
  vida_funcionarios: "Vida Func.",
  saude: "Saúde",
  saude_socios: "Saúde Sócios",
  frota: "Frota",
  empresarial: "Empresarial",
  do: "D&O",
  dental: "Dental",
  pessoa_chave: "Pessoa-Chave"
};

auth.onAuthStateChanged(user => {
  if (!user) return window.location.href = "login.html";
  carregarEmpresas();
});

function carregarEmpresas() {
  db.collection("empresas").onSnapshot(snapshot => {
    let html = `
      <table>
        <thead>
          <tr>
            <th>Empresa</th>
            ${produtos.map(p => `<th>${nomesProdutos[p]}</th>`).join("")}
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
    `;

    const promises = [];

    snapshot.forEach(doc => {
      const empresa = doc.data();
      const empresaId = doc.id;

      const p = db.collection("produtos_empresa")
        .where("empresaId", "==", empresaId)
        .get()
        .then(prodSnap => {
          const statusMap = {};
          prodSnap.forEach(prodDoc => {
            const prod = prodDoc.data();
            statusMap[prod.ramo] = prod.status;
          });

          html += `
            <tr>
              <td>${empresa.nome}</td>
              ${produtos.map(p => {
                const s = statusMap[p] || "nao";
                const classe = s === "fechado" ? "status-fechado" :
                               s === "recusado" ? "status-recusado" : "status-nao";
                const simbolo = s === "fechado" ? "🟢" : s === "recusado" ? "🔴" : "⚪️";
                return `<td class="${classe}">${simbolo}</td>`;
              }).join("")}
              <td>
                <a class="btn" href="cotacoes.html?empresa=${encodeURIComponent(empresa.nome)}">Negociar</a><br>
                <a class="btn" href="#" onclick="editarEmpresa('${empresaId}')">Editar</a>
              </td>
            </tr>
          `;
        });

      promises.push(p);
    });

    Promise.all(promises).then(() => {
      html += "</tbody></table>";
      document.getElementById("tabelaEmpresas").innerHTML = html;
    });
  });
}

function editarEmpresa(empresaId) {
  db.collection("empresas").doc(empresaId).get().then(doc => {
    if (!doc.exists) return;

    const e = doc.data();
    const formDiv = document.getElementById("formularioEdicao");
    formDiv.innerHTML = `
      <h3>Editar Empresa: ${e.nome}</h3>
      <form onsubmit="salvarEdicao('${empresaId}'); return false;">
        <label>Nome da Empresa:<br>
          <input type="text" id="editNome" value="${e.nome || ''}" style="width:100%;">
        </label><br><br>
        <label>Ramo de Atividade:<br>
          <input type="text" id="editRamo" value="${e.ramo || ''}" style="width:100%;">
        </label><br><br>
        <label>Número de Funcionários:<br>
          <input type="number" id="editFuncionarios" value="${e.funcionarios || ''}" style="width:100%;">
        </label><br><br>
        <button type="submit" class="btn">💾 Salvar Alterações</button>
      </form>
    `;
  });
}

function salvarEdicao(empresaId) {
  const nome = document.getElementById("editNome").value.trim();
  const ramo = document.getElementById("editRamo").value.trim();
  const funcionarios = parseInt(document.getElementById("editFuncionarios").value) || 0;

  db.collection("empresas").doc(empresaId).update({
    nome,
    ramo,
    funcionarios
  }).then(() => {
    alert("Empresa atualizada com sucesso!");
    document.getElementById("formularioEdicao").innerHTML = "";
  }).catch(err => {
    console.error("Erro ao salvar:", err);
    alert("Erro ao salvar alterações.");
  });
}
