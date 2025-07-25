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
            statusMap[prod.ramo] = prod.status; // campo 'ramo' corrigido
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
              <td><a class="btn" href="cotacoes.html?empresa=${encodeURIComponent(empresa.nome)}">Negociar</a></td>
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
