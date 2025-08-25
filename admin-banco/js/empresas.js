// === Mapa de Produtos por Empresa (RBAC + sem índices) ===
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// ---- Estado / RBAC ----
let meuUid = "";
let perfilRaw = "";
let perfil = "";           // normalizado
let minhaAgencia = "";
let isAdmin = false;

let produtos = [];
let nomesProdutos = {};
let empresasCache = [];

// ---- Utils ----
const normalize = (s) =>
  (s || "")
    .toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim();

const roleNorm = (s) => normalize(s).replace(/[-_]+/g, " "); // <- trata _, -, acentos

function classFromStatus(statusRaw) {
  const s = normalize(statusRaw);
  if (["negocio emitido"].includes(s)) return "verde";
  if ([
    "pendente agencia","pendente corretor","pendente seguradora","pendente cliente",
    "proposta enviada","proposta reenviada","cotacao iniciada","pedido de cotacao"
  ].includes(s)) return "amarelo";
  if (["recusado cliente","recusado seguradora","emitido declinado","negocio emitido declinado"].includes(s)) return "vermelho";
  if (["negocio fechado","em emissao"].includes(s)) return "azul";
  return "nenhum";
}

function erroUI(msg){
  const cont = document.getElementById("tabelaEmpresas");
  if (cont) cont.innerHTML = `<div class="muted" style="padding:12px">${msg}</div>`;
}

// ---- Boot ----
auth.onAuthStateChanged(async (user) => {
  if (!user) return (window.location.href = "login.html");
  meuUid = user.uid;

  try {
    const up = await db.collection("usuarios_banco").doc(user.uid).get();
    const d  = up.exists ? (up.data()||{}) : {};
    perfilRaw     = d.perfil || d.roleId || "";
    perfil        = roleNorm(perfilRaw);        // <<<<<<<<<<<<<< fix
    minhaAgencia  = d.agenciaId || "";
  } catch {
    perfilRaw = ""; perfil = ""; minhaAgencia = "";
  }
  isAdmin = (perfil === "admin") || (user.email === "patrick@retornoseguros.com.br");

  if (perfil === "rm" && !isAdmin) {
    // RM não precisa de filtro de RM
    const sel = document.getElementById("filtroRM");
    if (sel) sel.style.display = "none";
  }

  try {
    await carregarProdutos();
    await carregarRM();       // preenche combo RM (admin/chefe)
    await carregarEmpresas(); // monta tabela
  } catch (e) {
    console.error("[empresas] boot:", e);
    erroUI("Erro ao carregar dados.");
  }
});

// ---- Produtos (colunas) ----
async function carregarProdutos() {
  let snap;
  try { snap = await db.collection("ramos-seguro").orderBy("ordem").get(); }
  catch { snap = await db.collection("ramos-seguro").get(); }
  produtos = []; nomesProdutos = {};
  snap.forEach(doc => {
    const id   = doc.id;
    const nome = doc.data().nomeExibicao || id;
    produtos.push(id);
    nomesProdutos[id] = nome;
  });
}

// ---- Combo RM (usa empresas no mesmo escopo) ----
async function carregarRM() {
  const select = document.getElementById("filtroRM");
  if (!select) return;
  if (!isAdmin && perfil === "rm") return;

  select.innerHTML = `<option value="">Todos</option>`;

  let q = db.collection("empresas");
  if (!isAdmin) {
    if (perfil === "gerente chefe" && minhaAgencia) {
      q = q.where("agenciaId","==",minhaAgencia);
    }
  }
  try {
    const snapshot = await q.get();
    const rms = new Set();
    snapshot.forEach(doc => {
      const e = doc.data() || {};
      const nome = e.rmNome || e.rm;
      if (nome) rms.add(nome);
    });
    Array.from(rms)
      .sort((a,b)=>(a||"").localeCompare(b||"","pt-BR"))
      .forEach(nome => {
        const opt = document.createElement("option");
        opt.value = nome;
        opt.textContent = nome;
        select.appendChild(opt);
      });
  } catch (e) {
    console.warn("[empresas] carregarRM:", e);
  }
}

// ---- Busca de cotações por empresa (RBAC) ----
async function buscarCotacoesParaEmpresa(empresaId) {
  if (isAdmin || perfil === "gerente chefe") {
    try { return (await db.collection("cotacoes-gerentes").where("empresaId","==",empresaId).get()).docs; }
    catch(e){ console.warn("[empresas] cotacoes empresaId:", e); return []; }
  }
  if (perfil === "rm") {
    const buckets = [];
    try { buckets.push(await db.collection("cotacoes-gerentes").where("rmUid","==",meuUid).get()); } catch(e){}
    try { buckets.push(await db.collection("cotacoes-gerentes").where("rmId","==",meuUid).get()); } catch(e){}
    try { buckets.push(await db.collection("cotacoes-gerentes").where("usuarioId","==",meuUid).get()); } catch(e){}
    try { buckets.push(await db.collection("cotacoes-gerentes").where("gerenteId","==",meuUid).get()); } catch(e){}
    const map = new Map();
    buckets.forEach(s => s?.docs?.forEach(d => map.set(d.id, d)));
    return Array.from(map.values()).filter(d => (d.data()||{}).empresaId === empresaId);
  }
  return [];
}

// ---- Carregar Empresas (RBAC + sem índices) ----
async function carregarEmpresas() {
  const filtroRMNome = document.getElementById("filtroRM")?.value || "";

  try {
    let docs = [];

    if (isAdmin) {
      docs = (await db.collection("empresas").get()).docs;
    } else if (perfil === "gerente chefe" && minhaAgencia) {
      docs = (await db.collection("empresas").where("agenciaId","==",minhaAgencia).get()).docs;
    } else if (perfil === "rm") {
      const buckets = [];
      try { buckets.push(await db.collection("empresas").where("rmUid","==",meuUid).get()); } catch(e){}
      try { buckets.push(await db.collection("empresas").where("rmId","==",meuUid).get()); } catch(e){}
      try { buckets.push(await db.collection("empresas").where("criadoPorUid","==",meuUid).get()); } catch(e){}
      const map = new Map();
      buckets.forEach(s => s?.docs?.forEach(d => map.set(d.id, d)));
      docs = Array.from(map.values());
      // fallback: agência + filtra no cliente
      if (docs.length === 0 && minhaAgencia) {
        try {
          const snapAg = await db.collection("empresas").where("agenciaId","==",minhaAgencia).get();
          docs = snapAg.docs.filter(d => {
            const e = d.data() || {};
            const dono = e.rmUid || e.rmId || e.criadoPorUid || null;
            return dono === meuUid;
          });
        } catch(e){}
      }
    }

    empresasCache = [];
    docs.forEach(doc => {
      const e = { id: doc.id, ...doc.data() };
      const nomeRM = e.rmNome || e.rm || "";
      if (filtroRMNome && nomeRM !== filtroRMNome) return;
      empresasCache.push(e);
    });

    if (!empresasCache.length) {
      document.getElementById("tabelaEmpresas").innerHTML =
        `<div class="muted" style="padding:12px">Nenhuma empresa no escopo atual.</div>`;
      return;
    }

    // Monta linhas com status por produto
    const linhas = await Promise.all(
      empresasCache.map(async (empresa) => {
        const cotDocs = await buscarCotacoesParaEmpresa(empresa.id);
        const statusPorProduto = {};
        produtos.forEach(p => statusPorProduto[p] = "nenhum");

        cotDocs.forEach(doc => {
          const c = doc.data() || {};
          const ramo = c.ramo;
          const produtoId = produtos.find(id =>
            normalize(nomesProdutos[id]) === normalize(ramo)
          );
          if (!produtoId) return;
          statusPorProduto[produtoId] = classFromStatus(c.status);
        });

        return { nome: empresa.nome, status: statusPorProduto };
      })
    );

    // Render
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
          verde: "🟢", vermelho: "🔴", amarelo: "🟡", azul: "🔵", nenhum: "⚪️"
        }[cor] || "⚪️";
        html += `<td class="${classe}">${simbolo}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    document.getElementById("tabelaEmpresas").innerHTML = html;

  } catch (err) {
    console.error("[empresas] carregarEmpresas:", err);
    erroUI("Erro ao carregar empresas.");
  }
}
