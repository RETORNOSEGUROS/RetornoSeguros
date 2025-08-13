// --- Firebase ---
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// --- Estado ---
let produtos = [];
let nomesProdutos = {};
let empresasCache = [];

// RBAC
let isAdmin = false;
let perfilAtual = "";
let minhaAgencia = "";
let meuUid = "";

// --- Utils ---
const normalize = (s) =>
  (s || "")
    .toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim();

function classFromStatus(statusRaw) {
  const s = normalize(statusRaw);

  // Verde
  if (["negocio emitido"].includes(s)) return "verde";

  // Amarelo (pendências + proposta enviada + iniciou pedido)
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

function bloquearAssistente() {
  const cont = document.getElementById("tabelaEmpresas");
  if (cont) cont.innerHTML = `
    <div style="padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#fff7ed;color:#7c2d12;">
      Seu perfil não possui acesso a <strong>Empresas</strong>.
    </div>`;
}

// --- Boot ---
auth.onAuthStateChanged(async user => {
  if (!user) return (window.location.href = "login.html");

  // Perfil
  meuUid = user.uid;
  try {
    const snap = await db.collection("usuarios_banco").doc(user.uid).get();
    const d = snap.exists ? (snap.data() || {}) : {};
    perfilAtual = (d.perfil || d.roleId || "").toLowerCase();
    minhaAgencia = d.agenciaId || "";
  } catch (_) {
    perfilAtual = "";
    minhaAgencia = "";
  }
  isAdmin = (perfilAtual === "admin") || (user.email === "patrick@retornoseguros.com.br");

  // Assistente não usa essa tela
  if (perfilAtual === "assistente" && !isAdmin) {
    bloquearAssistente();
    return;
  }

  await carregarProdutos();
  await carregarRM();        // combo de filtro RM, já respeitando RBAC
  await carregarEmpresas();  // tabela
});

// --- Dados base (produtos/colunas) ---
async function carregarProdutos() {
  let snap;
  try {
    snap = await db.collection("ramos-seguro").orderBy("ordem").get();
  } catch {
    snap = await db.collection("ramos-seguro").get();
  }
  produtos = [];
  nomesProdutos = {};
  snap.forEach(doc => {
    const id   = doc.id;
    const nome = doc.data().nomeExibicao || id;
    produtos.push(id);
    nomesProdutos[id] = nome;
  });
}

// --- Combo de RM (usa rmNome ou rm) ---
// Agora busca empresas já filtradas por RBAC para extrair os RMs corretos
async function carregarRM() {
  const select = document.getElementById("filtroRM");
  if (!select) return;
  select.innerHTML = `<option value="">Todos</option>`;

  let q = db.collection("empresas");
  if (!isAdmin) {
    if (perfilAtual === "rm") {
      q = q.where("rmUid", "==", meuUid);
    } else if (["gerente-chefe","gerente chefe"].includes(perfilAtual) && minhaAgencia) {
      q = q.where("agenciaId", "==", minhaAgencia);
    }
  }

  try {
    const snapshot = await q.get();
    const rms = new Set();
    snapshot.forEach(doc => {
      const dados = doc.data() || {};
      const nome = dados.rmNome || dados.rm;
      if (nome) rms.add(nome);
    });

    Array.from(rms).sort((a,b)=> (a||"").localeCompare(b||"", "pt-BR")).forEach(nome => {
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("Erro ao carregar RMs do filtro:", e);
  }
}

// --- Tabela ---
// Respeita RBAC + mantém seu filtro por RM (nome) já existente
async function carregarEmpresas() {
  const filtroRM = document.getElementById("filtroRM")?.value || ""; // é o NOME

  let q = db.collection("empresas");
  if (!isAdmin) {
    if (perfilAtual === "rm") {
      q = q.where("rmUid", "==", meuUid);
    } else if (["gerente-chefe","gerente chefe"].includes(perfilAtual) && minhaAgencia) {
      q = q.where("agenciaId", "==", minhaAgencia);
    }
  }

  try {
    const snapshot = await q.get();
    empresasCache = [];
    snapshot.forEach(doc => {
      const empresa = { id: doc.id, ...doc.data() };
      const nomeRM  = empresa.rmNome || empresa.rm;
      if (!filtroRM || nomeRM === filtroRM) {
        empresasCache.push(empresa);
      }
    });

    // Monta linhas: para cada empresa -> ler cotações e pintar status por produto
    const linhas = await Promise.all(
      empresasCache.map(async (empresa) => {
        // Busca cotações da empresa
        const cotacoesSnap = await db.collection("cotacoes-gerentes")
          .where("empresaId", "==", empresa.id).get();

        // Inicializa todos produtos como "sem cotação"
        const statusPorProduto = {};
        produtos.forEach(p => statusPorProduto[p] = "nenhum");

        cotacoesSnap.forEach(doc => {
          const c = doc.data() || {};
          const ramoCotado = c.ramo;
          const produtoId = produtos.find(id =>
            normalize(nomesProdutos[id]) === normalize(ramoCotado)
          );
          if (!produtoId) return;

          statusPorProduto[produtoId] = classFromStatus(c.status);
        });

        return {
          nome: empresa.nome,
          status: statusPorProduto
        };
      })
    );

    let html = `<table><thead><tr><th>Empresa</th>`;
    produtos.forEach(p => { html += `<th>${nomesProdutos[p]}</th>`; });
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
    const cont = document.getElementById("tabelaEmpresas");
    if (cont) cont.innerHTML = html;

  } catch (err) {
    console.error("Erro ao carregar empresas:", err);
    const cont = document.getElementById("tabelaEmpresas");
    if (cont) cont.innerHTML = `<div class="muted">Erro ao carregar empresas. Verifique as permissões e tente novamente.</div>`;
  }
}
