firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let produtos = [];
let nomesProdutos = [];
let empresasCache = [];

auth.onAuthStateChanged(user => {
  if (!user) return window.location.href = "login.html";
  carregarProdutos().then(() => {
    carregarRM();
    carregarEmpresas();
  });
});

async function carregarProdutos() {
  const snap = await db.collection("ramos-seguro").orderBy("ordem").get();
  produtos = [];
  nomesProdutos = {};
  snap.forEach(doc => {
    const id = doc.id;
    const nome = doc.data().nomeExibicao || id;
    produtos.push(id);
    nomesProdutos[id] = nome;
  });
}

async function carregarRM() {
  const select = document.getElementById("filtroRM");
  const snapshot = await db.collection("empresas").get();
  const rms = new Set();

  snapshot.forEach(doc => {
    const dados = doc.data();
    if (dados.rm) rms.add(dados.rm);
  });

  select.innerHTML = `<option value="">Todos</option>`;
  Array.from(rms).sort().forEach(rm => {
    const opt = document.createElement("option");
    opt.value = rm;
    opt.textContent = rm;
    select.appendChild(opt);
  });
}

function carregarEmpresas() {
  const filtroRM = document.getElementById("filtroRM").value;

  db.collection("empresas").get().then(snapshot => {
    empresasCache = [];
    snapshot.forEach(doc => {
      const empresa = { id: doc.id, ...doc.data() };
      if (!filtroRM || empresa.rm === filtroRM) {
        empresasCache.push(empresa);
      }
    });

    Promise.all(empresasCache.map(async (empresa) => {
      const cotacoesSnap = await db.collection("cotacoes-gerentes")
        .where("empresaId", "==", empresa.id).get();

      const statusPorProduto = {};
      produtos.forEach(p => statusPorProduto[p] = "nenhum");

      cotacoesSnap.forEach(doc => {
        const c = doc.data();
        const ramoCotado = c.ramo;
        const produtoId = produtos.find(id => nomesProdutos[id] === ramoCotado);
        if (!produtoId) return;

        const status = c.status?.toLowerCase() || "";

        if (status === "negócio emitido") {
          statusPorProduto[produtoId] = "verde";
        } else if (
          status === "pendente agência" ||
          status === "pendente corretor" ||
          status === "pendente seguradora" ||
          status === "pendente cliente"
        ) {
          statusPorProduto[produtoId] = "amarelo";
        } else if (
          status === "recusado cliente" ||
          status === "recusado seguradora" ||
          status === "negócio emitido declinado"
        ) {
          statusPorProduto[produtoId] = "vermelho";
        } else if (
          status === "negócio fechado" ||
          status === "em emissão"
        ) {
          statusPorProduto[produtoId] = "azul";
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
