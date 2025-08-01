firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const produtos = [
  "vida_funcionarios", "saude", "dental", "previdencia",
  "saude_socios", "vida_socios", "frota", "empresarial",
  "do", "equipamentos", "outros"
];

const nomesProdutos = {
  vida_funcionarios: "Vida Func.",
  saude: "Saúde",
  dental: "Dental",
  previdencia: "Previdência",
  saude_socios: "Saúde Sócios",
  vida_socios: "Vida Sócios",
  frota: "Frota",
  empresarial: "Patrimonial",
  do: "D&O",
  equipamentos: "Equip.",
  outros: "Outros"
};

auth.onAuthStateChanged(user => {
  if (!user) return window.location.href = "login.html";
  carregarEmpresas();
});

function carregarEmpresas() {
  db.collection("empresas").get().then(snapshot => {
    const empresas = [];
    snapshot.forEach(doc => {
      empresas.push({ id: doc.id, ...doc.data() });
    });

    Promise.all(empresas.map(async (empresa) => {
      const cotacoesSnap = await db.collection("cotacoes-gerentes")
        .where("empresaId", "==", empresa.id).get();

      const statusPorProduto = {};
      produtos.forEach(p => statusPorProduto[p] = "nenhum");

      cotacoesSnap.forEach(doc => {
        const c = doc.data();
        const ramo = c.ramo;
        if (!produtos.includes(ramo)) return;

        const status = c.status.toLowerCase();
        if (status.includes("pendente")) {
          statusPorProduto[ramo] = "amarelo";
        } else if (
          status.includes("recusado") ||
          status === "negócio emitido declinado"
        ) {
          statusPorProduto[ramo] = "vermelho";
        } else if (status === "negócio emitido") {
          statusPorProduto[ramo] = "verde";
        } else if (status === "negócio fechado" || status === "em emissão") {
          statusPorProduto[ramo] = "azul";
        }
      });

      return {
        nome: empresa.nome,
        status: statusPorProduto
      };
    })).then(linhas => {
      let html = `<table><thead><tr><th>Empresa</th>`;
      produtos.forEach(p => {
        html += `<th>${nomesProdutos[p]}</th>`;
      });
      html += `</tr></thead><tbody>`;

      linhas.forEach(linha => {
        html += `<tr><td>${linha.nome}</td>`;
        produtos.forEach(p => {
          const cor = linha.status[p];
          const classe = {
            verde: "status-verde",
            vermelho: "status-vermelho",
            amarelo: "status-amarelo",
            azul: "status-azul",
            nenhum: "status-cinza"
          }[cor] || "status-cinza";
          const simbolo = {
            verde: "🟢",
            vermelho: "🔴",
            amarelo: "🟡",
            azul: "🔵",
            nenhum: "⚪️"
          }[cor] || "⚪️";

          html += `<td class="${classe}">${simbolo}</td>`;
        });
        html += `</tr>`;
      });

      html += `</tbody></table>`;
      document.getElementById("tabelaEmpresas").innerHTML = html;
    });
  });
}
