// --- Firebase ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// --- Estado ---
let produtos = [];
let nomesProdutos = {};
let empresasCache = [];

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

// ===== Helpers de perfil/escopo =====
async function getPerfilAgencia() {
  const user = auth.currentUser;
  const snap = await db.collection("usuarios_banco").doc(user.uid).get();
  const data = snap.data() || {};
  const perfil = (data.perfil || data.roleId || "").toString().toLowerCase();
  return {
    uid: user.uid,
    agenciaId: data.agenciaId || null,
    perfil,
    isAdmin:     perfil === "admin" || (user.email === "patrick@retornoseguros.com.br"),
    isRM:        perfil === "rm" || perfil === "rm (gerente de conta)" || perfil === "gerente",
    isGerente:   perfil === "gerente", // tratamos como RM em escopo "próprio"
    isChefe:     perfil === "gerente-chefe" || perfil === "gerente chefe",
    isAssist:    perfil === "assistente"
  };
}

// --- Boot ---
auth.onAuthStateChanged(async (user) => {
  if (!user) return (window.location.href = "login.html");

  const ctx = await getPerfilAgencia();

  // Assistente não acessa EMPRESAS (visual); segurança real fica nas Rules
  if (ctx.isAssist && !ctx.isAdmin) {
    alert("Seu perfil não tem acesso à página de Empresas.");
    return (window.location.href = "painel.html");
  }

  await carregarProdutos();
  await carregarRM(ctx);
  await carregarEmpresas(ctx);
});

// --- Dados base (produtos/colunas) ---
async function carregarProdutos() {
  const snap = await db.collection("ramos-seguro").orderBy("ordem").get();
  produtos = [];
  nomesProdutos = {};
  snap.forEach(doc => {
    const id   = doc.id;
    const nome = doc.data().nomeExibicao || id;
    produtos.push(id);
    nomesProdutos[id] = nome;
  });
}

// --- Combo de RM (por perfil) ---
async function carregarRM(ctx) {
  const select = document.getElementById("filtroRM");
  select.innerHTML = `<option value="">Todos</option>`;

  // Admin: tudo | Chefe: só da agência | RM/Gerente: só ele
  let query = db.collection("empresas");

  if (ctx.isChefe && ctx.agenciaId) {
    query = query.where("agenciaId", "==", ctx.agenciaId);
  } else if ((ctx.isRM || ctx.isGerente) && !ctx.isAdmin) {
    // Para RM/Gerente, mostra só o próprio nome no filtro
    const opt = document.createElement("option");
    opt.value = "__self__";
    opt.textContent = "Minhas empresas";
    select.appendChild(opt);
    select.value = "__self__";
    return; // não precisa montar lista de todos os RMs
  }

  const snapshot = await query.get();
  const rms = new Set();

  snapshot.forEach(doc => {
    const dados = doc.data();
    const nome = dados.rmNome || dados.rm;
    if (nome) rms.add(nome);
  });

  Array.from(rms).sort().forEach(nome => {
    const opt = document.createElement("option");
    opt.value = nome;
    opt.textContent = nome;
    select.appendChild(opt);
  });
}

// --- Consulta de empresas por perfil ---
// Retorna um array de docs (já mesclando quando precisa)
async function fetchEmpresasPorPerfil(ctx) {
  // Admin: tudo
  if (ctx.isAdmin) {
    const snap = await db.collection("empresas").get();
    return snap.docs;
  }

  // Gerente-chefe: tudo da própria agência
  if (ctx.isChefe && ctx.agenciaId) {
    const snap = await db.collection("empresas")
      .where("agenciaId", "==", ctx.agenciaId)
      .get();
    return snap.docs;
  }

  // RM / Gerente: somente as próprias (aceita rmUid, rmId, usuarioId, gerenteId)
  const col = db.collection("empresas");
  const buckets = [];

  try { buckets.push(await col.where("rmUid",    "==", ctx.uid).get()); } catch(e){}
  try { buckets.push(await col.where("rmId",     "==", ctx.uid).get()); } catch(e){}
  try { buckets.push(await col.where("usuarioId","==", ctx.uid).get()); } catch(e){}
  try { buckets.push(await col.where("gerenteId","==", ctx.uid).get()); } catch(e){}

  // Mescla por ID para evitar duplicados
  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d)));
  return Array.from(map.values());
}

// --- Tabela ---
async function carregarEmpresas(ctx) {
  const filtroRM = (document.getElementById("filtroRM")?.value || ""); // nome ou "__self__"

  const docs = await fetchEmpresasPorPerfil(ctx);

  empresasCache = [];
  docs.forEach(doc => {
    const empresa = { id: doc.id, ...doc.data() };
    const nomeRM  = empresa.rmNome || empresa.rm;

    // Filtro por RM (para admin/chefe). Para RM, usamos "__self__"
    if (!filtroRM || filtroRM === "__self__" || nomeRM === filtroRM) {
      empresasCache.push(empresa);
    }
  });

  // Monta estrutura com status por produto
  const linhas = await Promise.all(
    empresasCache.map(async (empresa) => {
      // Busca cotações da empresa
      // (As rules garantem escopo; não precisa filtrar mais aqui)
      const cotacoesSnap = await db.collection("cotacoes-gerentes")
        .where("empresaId", "==", empresa.id)
        .get();

      // Inicializa todos produtos como "sem cotação"
      const statusPorProduto = {};
      produtos.forEach(p => statusPorProduto[p] = "nenhum");

      cotacoesSnap.forEach(doc => {
        const c = doc.data();

        // Match de ramo robusto (normaliza nomeExibicao x c.ramo)
        const ramoCotado = c.ramo;
        const produtoId = produtos.find(id =>
          normalize(nomesProdutos[id]) === normalize(ramoCotado)
        );
        if (!produtoId) return;

        // Status -> cor
        statusPorProduto[produtoId] = classFromStatus(c.status);
      });

      return {
        nome: empresa.nome,
        status: statusPorProduto
      };
    })
  );

  // Render
  let html = `<table><thead><tr><th>Empresa</th>`;
  produtos.forEach(p => { html += `<th>${nomesProdutos[p]}</th>`; });
  html += `</tr></thead><tbody>`;

  linhas.forEach(linha => {
    html += `<tr><td>${linha.nome || "-"}</td>`;
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
        azu
