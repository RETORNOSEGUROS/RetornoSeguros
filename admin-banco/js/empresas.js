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
let empresasCache = []; // cache das empresas (dados básicos)
let linhasRenderizadas = []; // cache p/ PDF

// filtros atuais
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

// tenta deduzir o ano da cotação
function getCotacaoAno(c) {
  const candidatos = [
    c.ano, c.anoVigencia, c.anoReferencia, c.vigenciaAno,
    c.vigencia?.ano
  ].filter(Boolean);
  if (candidatos.length) {
    const n = parseInt(candidatos[0], 10);
    if (!isNaN(n)) return n;
  }
  const ts = c.createdAt || c.criadoEm || c.atualizadoEm || c.data || c.dataReferencia || c.updatedAt;
  try {
    if (ts && typeof ts.toDate === "function") return ts.toDate().getFullYear();
    if (typeof ts === "string") {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d.getFullYear();
    }
  } catch(_) {}
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
  } catch { perfilRaw = ""; perfil = ""; minhaAgencia = ""; }
  isAdmin = (perfil === "admin") || (user.email === "patrick@retornoseguros.com.br");

  // UI: RM esconde seletor de RM
  if (perfil === "rm" && !isAdmin) {
    const sel = document.getElementById("filtroRM");
    if (sel) sel.style.display = "none";
  }

  montarComboAno();

  try {
    await carregarProdutos();
    await carregarAgencias(); // mostra NOME, não UID
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
  if (ag) ag.onchange = async () => { agenciaSel = ag.value || ""; await carregarRM(); await carregarEmpresas(); };
  if (rm) rm.onchange = async () => { rmSel = rm.value || ""; await carregarEmpresas(); };
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

// ---- Agências (combo) — usa agencias_banco p/ nome; fallback empresas
async function carregarAgencias() {
  const select = document.getElementById("filtroAgencia");
  if (!select) return;

  // RM não escolhe agência
  if (!isAdmin && perfil === "rm") {
    select.style.display = "none";
    agenciaSel = minhaAgencia || "";
    return;
  }

  select.innerHTML = `<option value="">Todas</option>`;
  const mapAg = new Map();

  // 1) preferencial
  try {
    const snapAg = await db.collection("agencias_banco").get();
    snapAg.forEach(doc => {
      const d = doc.data() || {};
      const id = doc.id;
      const nome = d.nome || d.nomeAgencia || d.nomeExibicao || id;
      if (id) mapAg.set(id, nome);
    });
  } catch (e) { console.warn("[empresas] agencias_banco:", e); }

  // 2) fallback/complemento
  try {
    let q = db.collection("empresas");
    if (!isAdmin && perfil === "gerente chefe" && minhaAgencia) {
      q = q.where("agenciaId","==",minhaAgencia);
    }
    const snapshot = await q.get();
    snapshot.forEach(doc => {
      const e = doc.data() || {};
      const id   = e.agenciaId || "";
      const nome = e.agenciaNome || e.agencia || mapAg.get(id) || id || "";
      if (id) mapAg.set(id, nome);
    });
  } catch (e) {
    console.warn("[empresas] carregarAgencias: fallback empresas", e);
  }

  agencias = Array.from(mapAg.entries())
    .map(([id, nome]) => ({id, nome}))
    .sort((a,b)=>byTxt(a.nome,b.nome));

  agencias.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.nome || a.id; // exibe NOME
    select.appendChild(opt);
  });

  if (!isAdmin && perfil === "gerente chefe" && minhaAgencia) {
    select.value = minhaAgencia;
    agenciaSel = minhaAgencia;
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
      linhasRenderizadas = [];
      return;
    }

    // Monta linhas com status por produto e % por empresa
    const linhas = await Promise.all(
      empresasCache.map(async (empresa) => {
        const cotDocs = await buscarCotacoesParaEmpresa(empresa.id);
        const statusPorProduto = {};
        produtos.forEach(p => statusPorProduto[p] = "nenhum");

        cotDocs.forEach(doc => {
          const c = doc.data() || {};
          const ano = getCotacaoAno(c);
          if (anoSel !== "todos" && ano !== anoSel) return;

          const ramo = c.ramo;
          const produtoId = produtos.find(id =>
            normalize(nomesProdutos[id]) === normalize(ramo)
          );
          if (!produtoId) return;
          statusPorProduto[produtoId] = classFromStatus(c.status);
        });

        const totalRamos = produtos.length;
        const ramosComMov = Object.values(statusPorProduto).filter(s => s !== "nenhum").length;
        const pctEmpresa = percent(ramosComMov, totalRamos);

        return { nome: empresa.nome, status: statusPorProduto, pctEmpresa };
      })
    );

    // % por ramo (cabeçalho)
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

    // Render — COM EMOJIS na tela, e badge % ao lado do nome da empresa
    let tituloAno = (anoSel === "todos") ? "Todos os anos" : String(anoSel);
    let html = `<table><thead><tr><th>Empresa <span class="badge">${tituloAno}</span></th>`;
    produtos.forEach(p => {
      const pct = pctPorRamo[p];
      html += `<th title="% de empresas com movimento neste ramo no período">${nomesProdutos[p]} <span class="badge">${pct}%</span></th>`;
    });
    html += `</tr></thead><tbody>`;

    linhas.forEach(linha => {
      html += `<tr><td>${linha.nome || "-"} <span class="badge" title="% de ramos com movimento nesta empresa">${linha.pctEmpresa}%</span></td>`;
      produtos.forEach(p => {
        const cor = linha.status[p];
        const classe = {
          verde: "status-verde",
          vermelho: "status-vermelho",
          amarelo: "status-amarelo",
          azul: "status-azul",
          nenhum: "status-cinza"
        }[cor] || "status-cinza";
        const simbolo = { verde:"🟢", amarelo:"🟡", vermelho:"🔴", azul:"🔵", nenhum:"⚪️" }[cor] || "⚪️";
        html += `<td class="${classe}">${simbolo}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    document.getElementById("tabelaEmpresas").innerHTML = html;

    // guarda para PDF
    linhasRenderizadas = linhas;

  } catch (err) {
    console.error("[empresas] carregarEmpresas:", err);
    erroUI("Erro ao carregar empresas.");
  }
}

// === Abrir Painel CRM em nova página com os filtros atuais ===
function abrirPainelCRM(){
  const ag = document.getElementById("filtroAgencia")?.value || "";
  const rm = document.getElementById("filtroRM")?.value || "";
  const an = document.getElementById("filtroAno")?.value || new Date().getFullYear();
  const url = `crm.html?agencia=${encodeURIComponent(ag)}&rm=${encodeURIComponent(rm)}&ano=${encodeURIComponent(an)}`;
  window.open(url, "_blank");
}

// === Exportar para PDF (pinta colunas > 0 e remove emoji nelas; mantém nome da empresa) ===
async function gerarPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("Biblioteca jsPDF não carregada. Inclua os scripts do jsPDF e do AutoTable no HTML.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("l", "pt", "a4");

  // Título
  doc.setFontSize(14);
  doc.setTextColor(0,64,128);
  doc.text("Mapa de Produtos por Empresa", 40, 40);

  // Legenda com quadradinhos (evita emoji no PDF)
  doc.setFontSize(10);
  doc.setTextColor(0,0,0);
  doc.text("Legenda:", 40, 60);
  const legend = [
    {label:"Emitido",   color:[212,237,218]},
    {label:"Pendente",  color:[255,243,205]},
    {label:"Recusado",  color:[248,215,218]},
    {label:"Fechado/Emissão", color:[207,226,255]},
    {label:"Sem cotação", color:[246,246,246]}
  ];
  let lx = 100;
  legend.forEach(item => {
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.rect(lx, 52, 14, 10, "F");
    doc.setTextColor(0,0,0);
    doc.text(item.label, lx + 20, 60);
    lx += 120;
  });

  // Tabela
  const tabela = document.querySelector("#tabelaEmpresas table");
  if (tabela && doc.autoTable) {
    doc.autoTable({
      html: tabela,
      startY: 80,
      styles: { fontSize: 7, halign: "center", valign: "middle" },
      headStyles: { fillColor: [0,64,128], textColor: 255 },
      didParseCell: (data) => {
        const cls = data.cell.raw?.getAttribute?.("class") || "";

        // pinta as células conforme a classe
        if (cls.includes("status-verde"))   data.cell.styles.fillColor = [212,237,218];
        if (cls.includes("status-amarelo")) data.cell.styles.fillColor = [255,243,205];
        if (cls.includes("status-vermelho"))data.cell.styles.fillColor = [248,215,218];
        if (cls.includes("status-azul"))    data.cell.styles.fillColor = [207,226,255];
        if (cls.includes("status-cinza"))   data.cell.styles.fillColor = [246,246,246];

        // mantém texto da 1ª coluna (nome da empresa + %). Limpa somente colunas de status.
        if (data.section === 'body' && data.column.index > 0) {
          data.cell.text = [' '];
        }
      }
    });
  } else {
    doc.text("Tabela não encontrada para exportação.", 40, 90);
  }

  doc.save("Mapa-Produtos.pdf");
}
