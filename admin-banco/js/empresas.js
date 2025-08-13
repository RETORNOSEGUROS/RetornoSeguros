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

// --- Boot ---
auth.onAuthStateChanged(async user => {
  if (!user) return (window.location.href = "login.html");

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

  // RM não precisa do filtro por RM
  if (perfilAtual === "rm" && !isAdmin) {
    const sel = document.getElementById("filtroRM");
    if (sel) sel.style.display = "none";
  }

  try {
    await carregarProdutos();
    await carregarRM();        // preenche o combo (admin/chefe)
    await carregarEmpresas();  // monta a tabela
  } catch (e) {
    console.error("[empresas] erro inesperado no boot:", e);
    erroUI("Erro ao carregar empresas. Verifique as permissões e tente novamente.");
  }
});

// --- Dados base (produtos/colunas) ---
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

// --- Combo de RM (usa empresas já no escopo do usuário) ---
async function carregarRM() {
  const select = document.getElementById("filtroRM");
  if (!select) return;

  // RM não usa filtro
  if (!isAdmin && perfilAtual === "rm") return;

  select.innerHTML = `<option value="">Todos</option>`;

  // base no mesmo escopo de visibilidade
  let q = db.collection("empresas");
  if (!isAdmin) {
    if (["gerente-chefe","gerente chefe"].includes(perfilAtual) && minhaAgencia) {
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
    Array.from(rms)
      .sort((a,b)=> (a||"").localeCompare(b||"", "pt-BR"))
      .forEach(nome => {
        const opt = document.createElement("option");
        opt.value = nome;
        opt.textContent = nome;
        select.appendChild(opt);
      });
  } catch (e) {
    console.warn("[empresas] carregarRM falhou:", e);
  }
}

// --- Tabela (RBAC + compat campos legados) ---
async function carregarEmpresas() {
  const filtroRMNome = document.getElementById("filtroRM")?.value || ""; // nome do RM (só admin/chefe usa)

  try {
    let docs = [];

    if (isAdmin) {
      // Admin: tudo
      const snap = await db.collection("empresas").get();
      docs = snap.docs;
    } else if (["gerente-chefe","gerente chefe"].includes(perfilAtual) && minhaAgencia) {
      // Chefe: por agência
      const snap = await db.collection("empresas")
        .where("agenciaId","==",minhaAgencia).get();
      docs = snap.docs;
    } else if (perfilAtual === "rm") {
      // RM: precisa bater com as rules de "dono"
      const buckets = [];

      try { buckets.push(await db.collection("empresas").where("rmUid","==",meuUid).get()); } catch(e){ console.warn("[empresas] where rmUid== falhou:", e); }
      try { buckets.push(await db.collection("empresas").where("rmId","==",meuUid).get()); } catch(e){ console.warn("[empresas] where rmId== falhou:", e); }
      try { buckets.push(await db.collection("empresas").where("criadoPorUid","==",meuUid).get()); } catch(e){ console.warn("[empresas] where criadoPorUid== falhou:", e); }

      // mescla resultados (sem duplicates)
      const map = new Map();
      buckets.forEach(s => s?.docs?.forEach(d => map.set(d.id, d)));
      docs = Array.from(map.values());

      // fallback: se ainda vazio e você grava agência certinha, tenta por agência e filtra no cliente
      if (docs.length === 0 && minhaAgencia) {
        try {
          const snapAg = await db.collection("empresas").where("agenciaId","==",minhaAgencia).get();
          docs = snapAg.docs.filter(d => {
            const e = d.data() || {};
            const dono = e.rmUid || e.rmId || e.criadoPorUid || null;
            return dono === meuUid;
          });
        } catch(e){ console.warn("[empresas] fallback por agência falhou:", e); }
      }
    }

    empresasCache = [];
    docs.forEach(doc => {
      const e = { id: doc.id, ...doc.data() };

      // Filtro por RM (nome) – apenas admin/chefe
      const nomeRM = e.rmNome || e.rm || "";
      if (filtroRMNome && nomeRM !== filtroRMNome) return;

      empresasCache.push(e);
    });

    if (!empresasCache.length) {
      const cont = document.getElementById("tabelaEmpresas");
      if (cont) cont.innerHTML = `<div class="muted" style="padding:12px">Nenhuma empresa no escopo atual.</div>`;
      return;
    }

    // Para cada empresa, mapeia status por produto a partir das cotações
    const linhas = await Promise.all(
      empresasCache.map(async (empresa) => {
        let cotacoesSnap;
        try {
          cotacoesSnap = await db.collection("cotacoes-gerentes")
            .where("empresaId", "==", empresa.id).get();
        } catch (e) {
          console.warn("Erro ao ler cotações da empresa", empresa.id, e);
          cotacoesSnap = { forEach: () => {} };
        }

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
    console.error("[empresas] carregarEmpresas erro:", err);
    erroUI("Erro ao carregar empresas. Verifique as permissões e tente novamente.");
  }
}
