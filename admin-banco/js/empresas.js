firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let produtos = [];
let nomesProdutos = {};
let empresasCache = [];

// ---------- Helpers ----------
const normalize = (s) =>
  (s || "")
    .toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim();

function classFromStatus(statusRaw) {
  const s = normalize(statusRaw);

  // Verde
  if (["negocio emitido"].includes(s)) return "verde";

  // Amarelo (pendências + proposta enviada)
  if ([
    "pendente agencia",
    "pendente corretor",
    "pendente seguradora",
    "pendente cliente",
    "proposta enviada",
    "proposta reenviada",
    "cotacao iniciada",
    "pedido de cotacao"
  ].includes(s)) return "amarelo";

  // Vermelho
  if ([
    "recusado cliente",
    "recusado seguradora",
    "emitido declinado",
    "negocio emitido declinado"
  ].includes(s)) return "vermelho";

  // Azul
  if ([
    "negocio fechado",
    "em emissao"
  ].includes(s)) return "azul";

  return "nenhum";
}

// ---------- Fluxo ----------
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

        // Match do ramo por nome exibido, com normalização
        const ramoCotado = c.ramo;
        const produtoId = produtos.find(id =>
          normalize(nomesProdutos[id]) === normalize(ramoCotado)
        );
        if (!produtoId) return;

        // Mapeia status -> cor (com sinônimos)
        const classe = classFromStatus(c.status);
        statusPorProduto[produtoId] = classe;
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
