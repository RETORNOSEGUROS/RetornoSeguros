// === Mapa de Produtos por Empresa (Agência → RM → Ano + % por Ramo) ===
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

let agencias = [];         // [{id, nome}]
let agenciaSel = "";       // agência selecionada (id)
let rmSel = "";            // RM selecionado (nome)
let anoSel = new Date().getFullYear(); // ano selecionado (padrão: corrente)

// ---- Utils ----
const normalize = (s) =>
  (s || "")
    .toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim();

const roleNorm = (s) => normalize(s).replace(/[-_]+/g, " ");

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

// Tenta deduzir o ano da cotação a partir de vários campos comuns
function getCotacaoAno(c) {
  // prioridades: campo explícito de ano, depois timestamps
  const candidatos = [
    c.ano, c.anoVigencia, c.anoReferencia, c.vigenciaAno,
    c.vigencia?.ano
  ].filter(Boolean);
  if (candidatos.length) {
    const n = parseInt(candidatos[0], 10);
    if (!isNaN(n)) return n;
  }
  // timestamps ou datas string
  const ts = c.createdAt || c.criadoEm || c.atualizadoEm || c.data || c.dataReferencia || c.updatedAt;
  try {
    if (ts && typeof ts.toDate === "function") {
      return ts.toDate().getFullYear();
    }
    if (typeof ts === "string") {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d.getFullYear();
    }
  } catch(_) {}
  // fallback: ano corrente
  return new Date().getFullYear();
}

function byTxt(a,b){ return (a||"").localeCompare(b||"","pt-BR"); }

function erroUI(msg){
  const cont = document.getElementById("tabelaEmpresas");
  if (cont) cont.innerHTML = `<div class="muted" style="padding:12px">${msg}</div>`;
}

function percent(n, d){ return d > 0 ? Math.round((n * 100) / d) : 0; }

// ---- Boot ----
auth.onAuthStateChanged(async (user) => {
  if (!user) return (window.location.href = "login.html");
  meuUid = user.uid;

  try {
    const up = await db.collection("usuarios_banco").doc(user.uid).get();
    const d  = up.exists ? (up.data()||{}) : {};
    perfilRaw     = d.perfil || d.roleId || "";
    perfil        = roleNorm(perfilRaw);
    minhaAgencia  = d.agenciaId || "";
  } catch {
    perfilRaw = ""; perfil = ""; minhaAgencia = "";
  }
  isAdmin = (perfil === "admin") || (user.email === "patrick@retornoseguros.com.br");

  // UI: RM escondido para papel RM
  if (perfil === "rm" && !isAdmin) {
    const sel = document.getElementById("filtroRM");
    if (sel) sel.style.display = "none";
  }

  // Preenche seletor de Ano (corrente + 3 anteriores + "Todos")
  montarComboAno();

  try {
    await carregarProdutos();
    await carregarAgencias();
    await carregarRM();
    await carregarEmpresas();
  } catch (e) {
    console.error("[empresas] boot:", e);
    erroUI("Erro ao carregar dados.");
  }

  // Handlers de filtro
  const ag = document.getElementById("filtroAgencia");
  const rm = document.getElementById("filtroRM");
  const an = document.getElementById("filtroAno");
  if (ag) ag.onchange = async () => {
    agenciaSel = ag.value || "";
    await carregarRM();
    await carregarEmpresas();
  };
  if (rm) rm.onchange = async () => {
    rmSel = rm.value || "";
    await carregarEmpresas();
  };
  if (an) an.onchange = async () => {
    const v = an.value;
    anoSel = v === "todos" ? "todos" : parseInt(v, 10);
    await carregarEmpresas();
  };
});

// ---- Monta combo de Ano ----
function montarComboAno() {
  const sel = document.getElementById("filtroAno");
  if (!sel) return;
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3];
  sel.innerHTML = "";
  // padrão: ano corrente
  anos.forEach(a => {
    const opt = document.createElement("option");
    opt.value = String(a);
    opt.textContent = String(a);
    sel.appendChild(opt);
  });
  const optTodos = document.createElement("option");
  optTodos.value = "todos";
  optTodos.textContent = "Todos os anos";
  sel.appendChild(optTodos);
  sel.value = String(anoAtual);
  anoSel = anoAtual;
}

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

// ---- Agências (combo 1) ----
async function carregarAgencias() {
  const select = document.getElementById("filtroAgencia");
  if (!select) return;

  if (!isAdmin && perfil === "rm") {
    select.style.display = "none";
    agenciaSel = minhaAgencia || "";
    return;
  }

  select.innerHTML = `<option value="">Todas</option>`;

  let q = db.collection("empresas");
  if (!isAdmin && perfil === "gerente chefe" && minhaAgencia) {
    q = q.where("agenciaId","==",minhaAgencia);
  }

  try {
    const snapshot = await q.get();
    const mapAg = new Map();
    snapshot.forEach(doc => {
      const e = doc.data() || {};
      const id   = e.agenciaId || "";
      const nome = e.agenciaNome || e.agencia || id || "";
      if (id) mapAg.set(id, nome);
    });

    agencias = Array.from(mapAg.entries())
      .map(([id, nome]) => ({id, nome}))
      .sort((a,b)=>byTxt(a.nome,b.nome));

    agencias.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.nome || a.id;
      select.appendChild(opt);
    });

    if (!isAdmin && perfil === "gerente chefe" && minhaAgencia) {
      select.value = minhaAgencia;
      agenciaSel = minhaAgencia;
    }
  } catch (e) {
    console.warn("[empresas] carregarAgencias:", e);
  }
}

// ---- Combo RM (depende da agência) ----
async function carregarRM() {
  const select = document.getElementById("filtroRM");
  if (!select) return;
  if (!isAdmin && perfil === "rm") return;

  select.innerHTML = `<option value="">Todos</option>`;

  let q = db.collection("empresas");
  if (!isAdmin) {
    if (perfil === "gerente chefe" && (agenciaSel || minhaAgencia)) {
      q = q.where("agenciaId","==",agenciaSel || minhaAgencia);
    }
  } else {
    if (agenciaSel) q = q.where("agenciaId","==",agenciaSel);
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
      .sort(byTxt)
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

// ---- Carregar Empresas (aplica filtros de Agência, RM e Ano) ----
async function carregarEmpresas() {
  const filtroRMNome = (rmSel || document.getElementById("filtroRM")?.value || "").trim();

  try {
    let docs = [];

    if (isAdmin) {
      let q = db.collection("empresas");
      if (agenciaSel) q = q.where("agenciaId","==",agenciaSel);
      docs = (await q.get()).docs;
    } else if (perfil === "gerente chefe") {
      const ag = agenciaSel || minhaAgencia;
      let q = db.collection("empresas");
      if (ag) q = q.where("agenciaId","==",ag);
      docs = (await q.get()).docs;
    } else if (perfil === "rm") {
      const buckets = [];
      try { buckets.push(await db.collection("empresas").where("rmUid","==",meuUid).get()); } catch(e){}
      try { buckets.push(await db.collection("empresas").where("rmId","==",meuUid).get()); } catch(e){}
      try { buckets.push(await db.collection("empresas").where("criadoPorUid","==",meuUid).get()); } catch(e){}
      const map = new Map();
      buckets.forEach(s => s?.docs?.forEach(d => map.set(d.id, d)));
      docs = Array.from(map.values());
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
          const ano = getCotacaoAno(c);
          // aplica filtro de ano (se "todos", ignora filtro)
          if (anoSel !== "todos" && ano !== anoSel) return;

          const ramo = c.ramo;
          const produtoId = produtos.find(id =>
            normalize(nomesProdutos[id]) === normalize(ramo)
          );
          if (!produtoId) return;
          // último status visto no ano selecionado vence (não fazemos rank por prioridade aqui)
          statusPorProduto[produtoId] = classFromStatus(c.status);
        });

        return { nome: empresa.nome, status: statusPorProduto };
      })
    );

    // Calcula % por ramo que saiu do zero (considerando o ano selecionado)
    const totalEmpresas = linhas.length;
    const contagemPorRamo = {};
    produtos.forEach(p => contagemPorRamo[p] = 0);
    linhas.forEach(linha => {
      produtos.forEach(p => {
        if (linha.status[p] !== "nenhum") contagemPorRamo[p] += 1;
      });
    });
    const pctPorRamo = {};
    produtos.forEach(p => pctPorRamo[p] = percent(contagemPorRamo[p], totalEmpresas));

    // Render
    let tituloAno = (anoSel === "todos") ? "Todos os anos" : String(anoSel);
    let html = `<table><thead><tr><th>Empresa <span class="badge">${tituloAno}</span></th>`;
    produtos.forEach(p => {
      const pct = pctPorRamo[p];
      html += `<th title="% de empresas com movimento neste ramo no período">${nomesProdutos[p]} <span class="badge">${pct}%</span></th>`;
    });
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
