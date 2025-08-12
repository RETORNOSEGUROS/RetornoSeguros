// ===== Firebase init (compat v8) =====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// ===== Estado global =====
let usuarioAtual = null;
let perfilAtual  = "";       // "admin" | "gerente-chefe" | "rm" | "assistente" | ...
let minhaAgencia = "";
let isAdmin      = false;

let empresasCache = [];      // [{id, nome, cnpj, agenciaId, rmUid, rmNome}, ...]

// ===== Helper: pega perfil + agência do usuário logado =====
async function getPerfilAgencia() {
  const user = auth.currentUser;
  if (!user) return { perfil: "", agenciaId: "", isAdmin: false };
  const udoc = await db.collection("usuarios_banco").doc(user.uid).get();
  const u = udoc.exists ? (udoc.data() || {}) : {};
  const perfil = (u.perfil || u.roleId || "").toString().toLowerCase();
  const agenciaId = u.agenciaId || "";
  const admin = (perfil === "admin") || (user.email === "patrick@retornoseguros.com.br");
  return { perfil, agenciaId, isAdmin: admin };
}

// ===== Boot =====
window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (!user) return (window.location.href = "login.html");
    usuarioAtual = user;

    const ctx = await getPerfilAgencia();
    perfilAtual  = ctx.perfil;
    minhaAgencia = ctx.agenciaId;
    isAdmin      = ctx.isAdmin;

    try {
      await Promise.all([
        carregarEmpresas(),   // agora carrega empresas obedecendo o escopo
        carregarRamos(),
        carregarFiltroRM(),   // RM filter por agência (Admin/Chefe/Assistente). RM não precisa.
        carregarStatus(),     // robusto com fallback
      ]);
    } catch (e) {
      console.error("Erro inicial:", e);
    }

    // botão de salvar só para admin (na sua UI atual)
    const btn = document.getElementById("btnSalvarAlteracoes");
    if (btn && !isAdmin) btn.style.display = "none";

    carregarCotacoesComFiltros(); // primeira carga
  });
});

// ======================================================
// Carrega EMPRESAS para os combos (empresa / novaEmpresa)
// respeitando regras de visibilidade por perfil
// ======================================================
async function carregarEmpresas() {
  const campos = ["empresa", "novaEmpresa"];
  empresasCache = [];

  // esqueleto dos combos
  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Selecione a empresa</option>`;
  });

  // Query base conforme perfil
  let qs = [];

  if (isAdmin) {
    // Admin: todas
    qs.push(db.collection("empresas").get());
  } else if (perfilAtual === "gerente-chefe" || perfilAtual === "gerente chefe" || perfilAtual === "assistente") {
    // Chefe/Assistente: tudo da própria agência
    if (minhaAgencia) {
      qs.push(db.collection("empresas").where("agenciaId", "==", minhaAgencia).get());
    } else {
      // fallback sem agenciaId (legado) — lista vazia para segurança
    }
  } else {
    // RM (ou outro perfil operacional): somente as próprias (tenta todos os campos de dono e mescla)
    const col = db.collection("empresas");
    qs.push(col.where("rmUid", "==", usuarioAtual.uid).get());
    qs.push(col.where("rmId", "==",  usuarioAtual.uid).get());
    qs.push(col.where("usuarioId", "==", usuarioAtual.uid).get());
    qs.push(col.where("gerenteId", "==", usuarioAtual.uid).get());
  }

  // Executa as queries e mescla por ID
  const map = new Map();
  for (const p of qs) {
    try {
      const snap = await p;
      snap.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }));
    } catch(e) {
      console.warn("Query empresas falhou (possível índice ausente). Detalhe:", e);
    }
  }

  empresasCache = Array.from(map.values()).sort((a,b) => (a.nome||"").localeCompare(b.nome||"", "pt-BR"));

  // Preenche os combos
  campos.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    empresasCache.forEach(emp => {
      const opt = document.createElement("option");
      opt.value = emp.id;
      opt.textContent = emp.nome;
      el.appendChild(opt);
    });
  });
}

// ======================================================
// Carrega RAMOS
// ======================================================
async function carregarRamos() {
  const campos = ["ramo", "novaRamo"];
  let snap;
  try {
    snap = await db.collection("ramos-seguro").orderBy("ordem").get();
  } catch {
    snap = await db.collection("ramos-seguro").get();
  }

  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Selecione o ramo</option>`;
  });

  snap.forEach(doc => {
    const nome = doc.data().nomeExibicao || doc.id;
    campos.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      el.appendChild(opt);
    });
  });
}

// ======================================================
// Carrega filtro de RM (Admin/Chefe/Assistente por agência)
// RM não precisa (é sempre o próprio)
// ======================================================
async function carregarFiltroRM() {
  const select = document.getElementById("filtroRM");
  if (!select) return;

  // RM não precisa filtro de RM
  if (!isAdmin && !(perfilAtual === "gerente-chefe" || perfilAtual === "gerente chefe" || perfilAtual === "assistente")) {
    select.innerHTML = "";
    select.style.display = "none";
    return;
  }

  select.innerHTML = `<option value="">Todos</option>`;

  try {
    let q = db.collection("usuarios_banco").where("perfil", "==", "rm");
    if (!isAdmin && minhaAgencia) q = q.where("agenciaId", "==", minhaAgencia);

    const snap = await q.get();
    const nomes = new Set();

    snap.forEach(doc => {
      const u = doc.data();
      const nome = u?.nome;
      if (nome && !nomes.has(nome)) {
        nomes.add(nome);
        const opt = document.createElement("option");
        opt.value = nome; // filtraremos por rmNome
        opt.textContent = nome;
        select.appendChild(opt);
      }
    });
  } catch (err) {
    console.error("Erro ao carregar filtro de RM:", err);
  }
}

// ======================================================
// STATUS (via config -> fallback)
// ======================================================
async function carregarStatus() {
  const select = document.getElementById("filtroStatus");
  if (!select) return;

  select.innerHTML = `<option value="">Todos</option>`;

  const preencher = (lista = []) => {
    Array.from(new Set(lista))
      .filter(s => typeof s === "string" && s.trim())
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        select.appendChild(opt);
      });
  };

  try {
    // 1) Tenta ler a config
    const snap = await db.collection("status-negociacao").doc("config").get();
    const lista = snap.exists ? (snap.data()?.statusFinais || []) : [];
    if (lista.length) {
      preencher(lista);
      return;
    }
    throw new Error("config-vazia");
  } catch (err) {
    console.warn("Status via config indisponível, usando fallback:", err?.message || err);
    // 2) Fallback: deduz dos registros (respeitando escopo)
    try {
      let docs = await listarCotacoesPorPerfil({ apenasCampos: ["status"] });
      const uniq = new Set();
      docs.forEach(c => { const s = c.status; if (s) uniq.add(s); });
      preencher(Array.from(uniq));
    } catch (e2) {
      console.error("Erro no fallback de status:", e2);
    }
  }
}

// ======================================================
// Helpers de empresa selecionada (infos no formulário)
// ======================================================
function preencherEmpresaNova() {
  const id = document.getElementById("novaEmpresa").value;
  const empresa = empresasCache.find(e => e.id === id);
  const rmNome = empresa ? (empresa.rmNome || empresa.rm || "") : "";
  document.getElementById("nova-info-cnpj").textContent = empresa ? `CNPJ: ${empresa.cnpj || "-"}` : "";
  document.getElementById("nova-info-rm").textContent   = empresa ? `RM responsável: ${rmNome || "-"}` : "";
}
function preencherEmpresa() {
  const id = document.getElementById("empresa").value;
  const empresa = empresasCache.find(e => e.id === id);
  const rmNome = empresa ? (empresa.rmNome || empresa.rm || "") : "";
  document.getElementById("info-cnpj").textContent = empresa ? `CNPJ: ${empresa.cnpj || "-"}` : "";
  document.getElementById("info-rm").textContent   = empresa ? `RM responsável: ${rmNome || "-"}` : "";
}

// ======================================================
// CRUD - criar/editar/excluir (grava agenciaId na cotação)
// ======================================================
async function criarNovaCotacao() {
  const empresaId = document.getElementById("novaEmpresa").value;
  const ramo      = document.getElementById("novaRamo").value;
  const valorFmt  = document.getElementById("novaValor").value;
  const valor     = desformatarMoeda(valorFmt); // função no HTML
  const obs       = document.getElementById("novaObservacoes").value.trim();
  const empresa   = empresasCache.find(e => e.id === empresaId);

  if (!empresaId || !ramo || !empresa) return alert("Preencha todos os campos.");

  // Compativel com dados legados
  const rmNome = empresa.rmNome || empresa.rm || "";
  const rmId   = empresa.rmUid  || empresa.rmId || "";

  const cotacao = {
    empresaId,
    empresaNome:  empresa.nome,
    empresaCNPJ:  empresa.cnpj || "",
    agenciaId:    empresa.agenciaId || minhaAgencia || "",   // << grava agência
    rmId,
    rmNome,
    ramo,
    valorDesejado: valor,
    status: "Negócio iniciado",
    dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPorUid: usuarioAtual.uid,
    autorUid:     usuarioAtual.uid,
    autorNome:    usuarioAtual.email,
    interacoes: obs
      ? [{
          autorUid:   usuarioAtual.uid,
          autorNome:  usuarioAtual.email,
          mensagem:   obs,
          dataHora:   new Date(),
          tipo:      "observacao",
        }]
      : [],
  };

  await db.collection("cotacoes-gerentes").add(cotacao);
  alert("Cotação criada com sucesso.");
  carregarCotacoesComFiltros();

  // limpa
  document.getElementById("novaEmpresa").value = "";
  document.getElementById("novaRamo").value = "";
  document.getElementById("novaValor").value = "R$ 0,00";
  document.getElementById("novaObservacoes").value = "";
  preencherEmpresaNova();
}

function editarCotacao(id) {
  db.collection("cotacoes-gerentes").doc(id).get().then(doc => {
    if (!doc.exists) return alert("Cotação não encontrada");
    const c = doc.data();

    document.getElementById("cotacaoId").value = id;
    document.getElementById("empresa").value   = c.empresaId || "";
    document.getElementById("ramo").value      = c.ramo || "";

    const inputValor = document.getElementById("valorEstimado");
    const num = typeof c.valorDesejado === "number" ? c.valorDesejado : 0;
    inputValor.value = "R$ " + num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    document.getElementById("observacoes").value = c.interacoes?.[0]?.mensagem || "";

    preencherEmpresa();
    document.getElementById("bloco-edicao").style.display = "block";
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
}

async function salvarAlteracoesCotacao() {
  const id        = document.getElementById("cotacaoId").value;
  const empresaId = document.getElementById("empresa").value;
  const ramo      = document.getElementById("ramo").value;
  const valorFmt  = document.getElementById("valorEstimado").value;
  const valor     = desformatarMoeda(valorFmt);
  const obs       = document.getElementById("observacoes").value.trim();

  const empresa = empresasCache.find(e => e.id === empresaId);
  if (!empresa) return alert("Empresa inválida.");

  const rmNome = empresa.rmNome || empresa.rm || "";
  const rmId   = empresa.rmUid  || empresa.rmId || "";

  const update = {
    empresaId,
    empresaNome:  empresa.nome,
    empresaCNPJ:  empresa.cnpj || "",
    agenciaId:    empresa.agenciaId || minhaAgencia || "",  // << garante agência
    rmId,
    rmNome,
    ramo,
    valorDesejado: valor,
  };

  if (obs) {
    update.interacoes = [{
      autorUid:   usuarioAtual.uid,
      autorNome:  usuarioAtual.email,
      dataHora:   new Date(),
      mensagem:   obs,
      tipo:      "observacao",
    }];
  }

  await db.collection("cotacoes-gerentes").doc(id).update(update);
  alert("Alterações salvas.");
  document.getElementById("bloco-edicao").style.display = "none";
  carregarCotacoesComFiltros();
}

function excluirCotacao(id) {
  if (!confirm("Tem certeza que deseja excluir esta cotação? Essa ação não poderá ser desfeita.")) return;
  db.collection("cotacoes-gerentes").doc(id).delete()
    .then(() => {
      alert("Cotação excluída com sucesso.");
      carregarCotacoesComFiltros();
    })
    .catch(err => {
      console.error("Erro ao excluir cotação:", err);
      alert("Erro ao excluir cotação.");
    });
}

// ======================================================
// Listagem + filtros, obedecendo o escopo por perfil
// ======================================================
async function listarCotacoesPorPerfil({ apenasCampos = [] } = {}) {
  // Retorna array de objetos de cotação
  const col = db.collection("cotacoes-gerentes");
  const campos = (apenasCampos.length ? apenasCampos : null);

  // Admin: tudo (uma query simples)
  if (isAdmin) {
    const snap = await col.get();
    return snap.docs.map(d => ({ id: d.id, ...(d.data()) }));
  }

  // Gerente-chefe / Assistente: tudo da agência
  if ((perfilAtual === "gerente-chefe" || perfilAtual === "gerente chefe" || perfilAtual === "assistente") && minhaAgencia) {
    try {
      const snap = await col.where("agenciaId", "==", minhaAgencia).get();
      return snap.docs.map(d => ({ id: d.id, ...(d.data()) }));
    } catch (e) {
      console.warn("Query cotacoes por agencia falhou (possível índice ausente).", e);
      // Fallback: sem filtro (não recomendado), mas evita travar UI
      const snap = await col.get();
      return snap.docs.map(d => ({ id: d.id, ...(d.data()) })).filter(c => (c.agenciaId || minhaAgencia) === minhaAgencia);
    }
  }

  // RM: somente suas cotações (fazemos várias queries e mesclamos)
  const buckets = [];
  try { buckets.push(await col.where("rmId",        "==", usuarioAtual.uid).get()); } catch(e){}
  try { buckets.push(await col.where("rmUid",       "==", usuarioAtual.uid).get()); } catch(e){}
  try { buckets.push(await col.where("usuarioId",   "==", usuarioAtual.uid).get()); } catch(e){}
  try { buckets.push(await col.where("gerenteId",   "==", usuarioAtual.uid).get()); } catch(e){}
  try { buckets.push(await col.where("criadoPorUid","==", usuarioAtual.uid).get()); } catch(e){}

  const map = new Map();
  buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d.data())));
  return Array.from(map.entries()).map(([id, data]) => ({ id, ...data }));
}

async function carregarCotacoesComFiltros() {
  const lista = document.getElementById("listaCotacoes");
  if (!lista) return;
  lista.innerHTML = "Carregando...";

  try {
    let cotacoes = await listarCotacoesPorPerfil();

    const ini    = document.getElementById("filtroDataInicio")?.value || "";
    const fim    = document.getElementById("filtroDataFim")?.value || "";
    const rm     = document.getElementById("filtroRM")?.value || "";     // rmNome
    const status = document.getElementById("filtroStatus")?.value || "";

    cotacoes = cotacoes.filter(c => {
      // Data (Timestamp | string)
      const d = c.dataCriacao?.toDate?.() || (typeof c.dataCriacao === "string" ? new Date(c.dataCriacao) : null);
      if (ini && d && d < new Date(ini)) return false;
      if (fim && d && d > new Date(fim + "T23:59:59")) return false;

      if (rm && (c.rmNome !== rm)) return false;
      if (status && c.status !== status) return false;

      // Escopo extra (por segurança visual; regras já barram):
      if (!isAdmin) {
        if (perfilAtual === "assistente" || perfilAtual === "gerente-chefe" || perfilAtual === "gerente chefe") {
          if (minhaAgencia && c.agenciaId && c.agenciaId !== minhaAgencia) return false;
        } else {
          // RM: tenta casar por campos de dono (além do que já fizemos na busca)
          if (![c.rmId, c.rmUid, c.usuarioId, c.gerenteId, c.criadoPorUid].includes(usuarioAtual.uid)) return false;
        }
      }
      return true;
    });

    if (!cotacoes.length) {
      lista.innerHTML = `<p class="muted">Nenhuma cotação encontrada.</p>`;
      return;
    }

    // Render
    let html = `<table><thead><tr>
      <th>Empresa</th><th>RM</th><th>Ramo</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th>
    </tr></thead><tbody>`;

    cotacoes.forEach(c => {
      const valor = typeof c.valorDesejado === "number"
        ? c.valorDesejado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "-";
      const data = (c.dataCriacao?.toDate?.()?.toLocaleDateString("pt-BR"))
        || (typeof c.dataCriacao === "string" ? new Date(c.dataCriacao).toLocaleDateString("pt-BR") : "-");

      html += `<tr>
        <td data-label="Empresa">${c.empresaNome || "-"}</td>
        <td data-label="RM">${c.rmNome || "-"}</td>
        <td data-label="Ramo">${c.ramo || "-"}</td>
        <td data-label="Valor">${valor}</td>
        <td data-label="Status">${c.status || "-"}</td>
        <td data-label="Data">${data}</td>
        <td data-label="Ações">
          <a href="chat-cotacao.html?id=${c.id}" target="_blank">Abrir</a>
          ${isAdmin ? ` | <a href="#" onclick="editarCotacao('${c.id}')">Editar</a>
          | <a href="#" onclick="excluirCotacao('${c.id}')" style="color:#c00">Excluir</a>` : ""}
        </td>
      </tr>`;
    });

    html += `</tbody></table>`;
    lista.innerHTML = html;
  } catch (err) {
    console.error("Erro ao carregar cotações:", err);
    lista.innerHTML = `<p class="muted">Sem permissão ou erro de rede. Verifique as regras e o login.</p>`;
  }
}

// ======================================================
// Utilidades da UI
// ======================================================
function limparFiltros(){
  ["filtroDataInicio","filtroDataFim","filtroRM","filtroStatus"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value="";
  });
  carregarCotacoesComFiltros();
}

// ===== Exports p/ onclick no HTML =====
window.preencherEmpresa       = preencherEmpresa;
window.preencherEmpresaNova   = preencherEmpresaNova;
window.criarNovaCotacao       = criarNovaCotacao;
window.carregarCotacoesComFiltros = carregarCotacoesComFiltros;
window.editarCotacao          = editarCotacao;
window.salvarAlteracoesCotacao= salvarAlteracoesCotacao;
window.excluirCotacao         = excluirCotacao;
window.limparFiltros          = limparFiltros;
