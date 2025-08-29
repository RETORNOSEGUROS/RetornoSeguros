// ===== Firebase init =====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// ===== Estado global =====
let usuarioAtual = null;
let perfilAtual  = "";
let minhaAgencia = "";
let isAdmin      = false;

let empresasCache = [];
let agenciasMap   = {};

let sortKey = "lastUpdateMs";
let sortDir = "desc";
let pagTamanho = 10;
let pagMostrando = 0;
let rowsCache = [];     // linhas filtradas (para paginação/export/relatórios)
let selecionados = new Set();

let chartRefs = [];     // guarda instâncias Chart.js do relatório

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const normalize = (s) =>
  (s || "").toString().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim();
const roleNorm = (s) => normalize(s).replace(/[-_]+/g, " ");

function desformatarMoeda(v) {
  if (typeof v !== "string") return Number(v || 0) || 0;
  const n = v.replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(n);
  return isNaN(num) ? 0 : num;
}
const toBRL = (n) => (Number(n||0)).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

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
        carregarAgencias(),
        carregarEmpresas(),
        carregarRamos(),
        carregarFiltroRM(),
        carregarStatus(),
      ]);
      popularDatalistEmpresas();          // filtro
      popularDatalistEmpresasNova();      // nova cotação
    } catch (e) { console.error("Erro inicial:", e); }

    const btn = $("btnSalvarAlteracoes");
    if (btn && !isAdmin) btn.style.display = "none";

    instalarOrdenacaoCabecalhos();
    instalarLoadMore();
    carregarCotacoesComFiltros();
  });
});

// ===== Perfil / Agências / Empesas / Ramos / RM / Status =====
async function getPerfilAgencia() {
  const user = auth.currentUser;
  if (!user) return { perfil: "", agenciaId: "", isAdmin: false };
  const udoc = await db.collection("usuarios_banco").doc(user.uid).get();
  const u = udoc.exists ? (udoc.data() || {}) : {};
  const perfil = roleNorm(u.perfil || u.roleId || "");
  const agenciaId = u.agenciaId || "";
  const admin = (perfil === "admin") || (user.email === "patrick@retornoseguros.com.br");
  return { perfil, agenciaId, isAdmin: admin };
}

async function carregarAgencias() {
  const sel = $("filtroAgencia");
  if (sel) sel.innerHTML = "";

  if (isAdmin) sel?.insertAdjacentHTML("beforeend", `<option value="">Todas as agências</option>`);
  else {
    const minha = minhaAgencia || "";
    sel?.insertAdjacentHTML("beforeend", `<option value="${minha}">Minha agência</option>`);
    if (sel) { sel.value = minha; sel.disabled = true; }
  }

  let snap;
  try { snap = await db.collection("agencias_banco").orderBy("nome").get(); }
  catch { snap = await db.collection("agencias_banco").get(); }

  snap.forEach(doc => {
    const a = doc.data() || {};
    const id = doc.id;
    const nome   = (a.nome || "(Sem nome)").toString();
    const banco  = a.banco ? ` — ${a.banco}` : "";
    const cidade = (a.Cidade || a.cidade || "").toString();
    const cidadeFmt = cidade ? ` / ${cidade}` : "";
    const uf = (a.estado || a.UF || "").toString().toUpperCase();
    const ufFmt = uf ? ` - ${uf}` : "";
    const label = `${nome}${banco}${cidadeFmt}${ufFmt}`;
    agenciasMap[id] = label;
    if (isAdmin && sel) {
      const opt = document.createElement("option");
      opt.value = id; opt.textContent = label; sel.appendChild(opt);
    }
  });
}

async function carregarEmpresas() {
  const campos = ["empresa"]; // (edição permanece select)
  empresasCache = [];
  campos.forEach(id => { const el = $(id); if (el) el.innerHTML = `<option value="">Selecione a empresa</option>`; });

  let qs = [];
  if (isAdmin) qs.push(db.collection("empresas").get());
  else if (["gerente chefe","assistente"].includes(perfilAtual)) {
    if (minhaAgencia) qs.push(db.collection("empresas").where("agenciaId","==",minhaAgencia).get());
  } else {
    const col = db.collection("empresas");
    qs.push(col.where("rmUid","==",usuarioAtual.uid).get());
    qs.push(col.where("rmId","==", usuarioAtual.uid).get());
    qs.push(col.where("usuarioId","==", usuarioAtual.uid).get());
    qs.push(col.where("gerenteId","==", usuarioAtual.uid).get());
  }

  const map = new Map();
  for (const p of qs) {
    try { (await p).forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() })); }
    catch(e) { console.warn("Query empresas falhou:", e); }
  }
  empresasCache = Array.from(map.values()).sort((a,b) => (a.nome||"").localeCompare(b.nome||"", "pt-BR"));

  // popular select da edição
  const el = $("empresa");
  if (el) {
    empresasCache.forEach(emp => {
      const opt = document.createElement("option");
      opt.value = emp.id; opt.textContent = emp.nome; el.appendChild(opt);
    });
  }
}
function popularDatalistEmpresas(){
  const dl = $("empresasList"); if (!dl) return;
  dl.innerHTML = "";
  empresasCache.forEach(e=>{
    const o=document.createElement("option");
    o.value = e.nome || ""; dl.appendChild(o);
  });
}
function popularDatalistEmpresasNova(){
  const dl = $("empresasListNova"); if (!dl) return;
  dl.innerHTML = "";
  empresasCache.forEach(e=>{
    const o=document.createElement("option");
    o.value = e.nome || ""; dl.appendChild(o);
  });
}
async function carregarRamos() {
  const campos = ["ramo", "novaRamo"];
  let snap;
  try { snap = await db.collection("ramos-seguro").orderBy("ordem").get(); }
  catch { snap = await db.collection("ramos-seguro").get(); }
  campos.forEach(id => { const el=$(id); if (el) el.innerHTML = `<option value="">Selecione o ramo</option>`; });
  snap.forEach(doc => {
    const nome = doc.data().nomeExibicao || doc.id;
    campos.forEach(id => { const el=$(id); if (!el) return; const opt=document.createElement("option");
      opt.value = nome; opt.textContent = nome; el.appendChild(opt); });
  });
}

async function coletarRMsVisiveis() {
  try {
    const cotas = await listarCotacoesPorPerfil();
    const set = new Set(); cotas.forEach(c => c?.rmNome && set.add(c.rmNome));
    if (set.size) return Array.from(set).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  } catch (_) {}
  const set2 = new Set(); (empresasCache || []).forEach(e => e?.rmNome && set2.add(e.rmNome));
  return Array.from(set2).sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
async function carregarFiltroRM() {
  const select = $("filtroRM"); if (!select) return;
  if (!isAdmin && !["gerente chefe","assistente"].includes(perfilAtual)) {
    select.innerHTML = ""; select.style.display = "none"; return;
  }
  select.innerHTML = `<option value="">Todos</option>`;
  if (isAdmin) {
    try {
      const snap = await db.collection("usuarios_banco").where("perfil","==","rm").get();
      const nomes = new Set(); snap.forEach(doc => { const n=doc.data()?.nome; if (n) nomes.add(n); });
      Array.from(nomes).sort((a,b)=>a.localeCompare(b,'pt-BR')).forEach(n => {
        const opt = document.createElement("option"); opt.value=n; opt.textContent=n; select.appendChild(opt);
      });
    } catch (err) { console.warn("Falha ao ler usuarios_banco (admin):", err); }
    return;
  }
  try {
    const nomes = await coletarRMsVisiveis();
    nomes.forEach(n => { const o=document.createElement("option"); o.value=n; o.textContent=n; select.appendChild(o); });
  } catch (e) { console.warn("Filtro RM via escopo:", e); }
}
async function carregarStatus() {
  const select = $("filtroStatus"); if (!select) return;
  select.innerHTML = `<option value="">Todos</option>`;
  const preencher = (lista=[]) => {
    Array.from(new Set(lista)).filter(s => typeof s === "string" && s.trim())
      .sort((a,b)=>a.localeCompare(b,"pt-BR"))
      .forEach(s => { const o=document.createElement("option"); o.value=s; o.textContent=s; select.appendChild(o); });
  };
  try {
    const snap = await db.collection("status-negociacao").doc("config").get();
    const lista = snap.exists ? (snap.data()?.statusFinais || []) : [];
    if (lista.length) return preencher(lista);
    throw new Error("config-vazia");
  } catch {
    try {
      let docs = await listarCotacoesPorPerfil();
      const uniq = new Set(); docs.forEach(c => c.status && uniq.add(c.status));
      preencher(Array.from(uniq));
    } catch(e2){ console.error("fallback status:", e2); }
  }
}

// ===== CRUD =====
function resolverEmpresaNova(){
  const nome = $("novaEmpresaNome").value || "";
  const emp = empresasCache.find(e => (e.nome||"") === nome);
  $("novaEmpresaId").value = emp ? emp.id : "";
  if (emp){
    $("nova-info-cnpj").textContent = `CNPJ: ${emp.cnpj || "-"}`;
    $("nova-info-rm").textContent   = `RM responsável: ${(emp.rmNome || emp.rm || "-")}`;
  } else {
    $("nova-info-cnpj").textContent = "";
    $("nova-info-rm").textContent = "";
  }
}
function preencherEmpresa() {
  const id = $("empresa").value;
  const empresa = empresasCache.find(e => e.id === id);
  const rmNome = empresa ? (empresa.rmNome || empresa.rm || "") : "";
  $("info-cnpj").textContent = empresa ? `CNPJ: ${empresa.cnpj || "-"}` : "";
  $("info-rm").textContent   = empresa ? `RM responsável: ${rmNome || "-"}` : "";
}

async function criarNovaCotacao() {
  const empresaId = $("novaEmpresaId").value;     // vem do datalist
  const ramo      = $("novaRamo").value;
  const valorFmt  = $("novaValor").value;
  const valor     = desformatarMoeda(valorFmt);
  const obs       = $("novaObservacoes").value.trim();
  const empresa   = empresasCache.find(e => e.id === empresaId);

  if (!empresaId || !ramo || !empresa) return alert("Selecione uma empresa válida e o ramo.");

  const rmNome = empresa.rmNome || empresa.rm || "";
  const rmId   = empresa.rmUid  || empresa.rmId || "";
  const agora  = firebase.firestore.FieldValue.serverTimestamp();

  const cotacao = {
    empresaId,
    empresaNome:  empresa.nome,
    empresaCNPJ:  empresa.cnpj || "",
    agenciaId:    empresa.agenciaId || minhaAgencia || "",
    rmId, rmNome,
    ramo,
    valorDesejado: valor,
    status: "Negócio iniciado",
    dataCriacao: agora,
    dataAtualizacao: agora,
    criadoPorUid: usuarioAtual.uid,
    autorUid:     usuarioAtual.uid,
    autorNome:    usuarioAtual.email,
    interacoes: obs ? [{
      autorUid: usuarioAtual.uid, autorNome: usuarioAtual.email,
      mensagem: obs, dataHora: new Date(), tipo: "observacao",
    }] : [],
  };

  await db.collection("cotacoes-gerentes").add(cotacao);
  alert("Cotação criada com sucesso.");
  $("novaEmpresaNome").value = ""; $("novaEmpresaId").value = "";
  $("novaRamo").value = ""; $("novaValor").value = "R$ 0,00"; $("novaObservacoes").value = "";
  $("nova-info-cnpj").textContent = ""; $("nova-info-rm").textContent = "";
  carregarCotacoesComFiltros();
}

function editarCotacao(id) {
  db.collection("cotacoes-gerentes").doc(id).get().then(doc => {
    if (!doc.exists) return alert("Cotação não encontrada");
    const c = doc.data();
    $("cotacaoId").value = id;
    $("empresa").value   = c.empresaId || "";
    $("ramo").value      = c.ramo || "";
    const inputValor = $("valorEstimado");
    const num = typeof c.valorDesejado === "number" ? c.valorDesejado : 0;
    inputValor.value = "R$ " + num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    $("observacoes").value = c.interacoes?.[0]?.mensagem || "";
    preencherEmpresa();
    $("bloco-edicao").style.display = "block";
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
}

async function salvarAlteracoesCotacao() {
  const id        = $("cotacaoId").value;
  const empresaId = $("empresa").value;
  const ramo      = $("ramo").value;
  const valorFmt  = $("valorEstimado").value;
  const valor     = desformatarMoeda(valorFmt);
  const obs       = $("observacoes").value.trim();

  const empresa = empresasCache.find(e => e.id === empresaId);
  if (!empresa) return alert("Empresa inválida.");

  const rmNome = empresa.rmNome || empresa.rm || "";
  const rmId   = empresa.rmUid  || empresa.rmId || "";

  const update = {
    empresaId,
    empresaNome:  empresa.nome,
    empresaCNPJ:  empresa.cnpj || "",
    agenciaId:    empresa.agenciaId || minhaAgencia || "",
    rmId, rmNome,
    ramo,
    valorDesejado: valor,
    dataAtualizacao: firebase.firestore.FieldValue.serverTimestamp(),
    atualizadoPorUid: usuarioAtual.uid,
    atualizadoPorNome: usuarioAtual.email,
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
  $("bloco-edicao").style.display = "none";
  carregarCotacoesComFiltros();
}

async function excluirCotacao(id){
  if (!isAdmin) return alert("Apenas administradores podem excluir.");
  if (!confirm("Excluir esta cotação?")) return;
  try { await db.collection("cotacoes-gerentes").doc(id).delete(); carregarCotacoesComFiltros(); }
  catch (e) { console.error("Erro ao excluir:", e); alert("Falha ao excluir a cotação."); }
}

// ===== Listagem + filtros + ordenação + paginação =====
async function listarCotacoesPorPerfil() {
  const col = db.collection("cotacoes-gerentes");
  if (isAdmin) { const snap = await col.get(); return snap.docs.map(d => ({ id: d.id, ...(d.data()) })); }
  if (["gerente chefe","assistente"].includes(perfilAtual) && minhaAgencia) {
    try { const snap = await col.where("agenciaId","==",minhaAgencia).get(); return snap.docs.map(d => ({ id:d.id, ...(d.data()) })); }
    catch { const snap = await col.get(); return snap.docs.map(d=>({id:d.id,...(d.data())})).filter(c => (c.agenciaId || minhaAgencia) === minhaAgencia); }
  }
  const buckets = [];
  try { buckets.push(await col.where("rmId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("rmUid","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("usuarioId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("gerenteId","==",usuarioAtual.uid).get()); } catch {}
  try { buckets.push(await col.where("criadoPorUid","==",usuarioAtual.uid).get()); } catch {}
  const map = new Map(); buckets.forEach(s => s && s.docs.forEach(d => map.set(d.id, d.data())));
  return Array.from(map.entries()).map(([id, data]) => ({ id, ...data }));
}

// Lê subcoleção de interações (se existir) e retorna a mais recente (data + autor)
async function buscarUltimaInteracaoDoc(cotId){
  try {
    // nomes possíveis de subcoleções
    const possiveis = ["interacoes", "mensagens", "chat", "chat-cotacao"];
    for (const nome of possiveis){
      const q = await db.collection("cotacoes-gerentes").doc(cotId).collection(nome)
        .orderBy("dataHora","desc").limit(1).get();
      if (!q.empty){
        const x = q.docs[0].data() || {};
        const when = x.dataHora?.toDate?.() || (x.dataHora ? new Date(x.dataHora) : null);
        const who  = x.autorNome || x.usuarioNome || x.autor || "";
        if (when) return { when, who };
      }
    }
  } catch(e){ /* silencioso */ }
  return null;
}

function pickFirstDate(...vals){
  for (const v of vals){
    if (!v) continue;
    const d = v?.toDate?.() || (typeof v==="string"||v instanceof Date ? new Date(v) : null);
    if (d && !isNaN(d.getTime())) return d;
  }
  return null;
}
function incluiEmitido(txt=""){
  const t = txt.toLowerCase();
  return t.includes("emitido") || t.includes("negócio fechado") || t.includes("negocio fechado");
}
function statusClass(s){
  const txt = (s||"").toLowerCase();
  if (txt === "negócio iniciado" || txt === "negocio iniciado") return "st-roxo";
  const ehPendente = ["pendente agência","pendente corretor","pendente seguradora","pendente cliente","pendente agencia"].some(k=>txt.includes(k));
  if (ehPendente) return "st-amarelo";
  const ehRecusado = ["recusado cliente","recusado seguradora","emitido declinado"].some(k=>txt.includes(k));
  if (ehRecusado) return "st-vermelho";
  const ehAzul = ["em emissão","em emissao","negócio fechado","negocio fechado"].some(k=>txt.includes(k));
  if (ehAzul) return "st-azulesc";
  if (txt === "negócio emitido" || txt === "negocio emitido") return "st-verde";
  return "";
}

// Calcula “última atualização” (robusto) + último autor
async function computeLastUpdateRich(c){
  // campos comuns onde outras telas/funcs gravam atualização:
  const aliases = [
    c.dataAtualizacao, c.ultimaAtualizacao, c.updatedAt, c.lastUpdate,
    c.statusMudadoEm, c.ultimaInteracao
  ];
  let last = pickFirstDate(...aliases);
  let lastWho = c.atualizadoPorNome || c.autorNome || "";

  // também verifica vetor embutido interacoes
  if (Array.isArray(c.interacoes) && c.interacoes.length){
    const ult = [...c.interacoes]
      .map(i => ({ when: i?.dataHora ? new Date(i.dataHora) : null, who: i?.autorNome || "" }))
      .filter(x => x.when && !isNaN(x.when))
      .sort((a,b)=>b.when - a.when)[0];
    if (ult && (!last || ult.when > last)){ last = ult.when; lastWho = ult.who || lastWho; }
  }

  // se ainda não for confiável, tenta subcoleções (1 read por cotação, só nos top 30 para não pesar)
  if (!last || isNaN(last)) {
    const sub = await buscarUltimaInteracaoDoc(c.id);
    if (sub && (!last || sub.when > last)){ last = sub.when; lastWho = sub.who || lastWho; }
  }

  // fallback para criação
  const created = pickFirstDate(c.dataCriacao);
  if (!last) last = created;

  return { last, lastWho };
}

function getFiltroAgenciaSelecionada() {
  const sel = $("filtroAgencia"); if (!sel) return "";
  return sel.disabled ? (minhaAgencia || "") : (sel.value || "");
}

async function carregarCotacoesComFiltros() {
  const container = $("listaCotacoes");
  if (!container) return;
  container.innerHTML = "Carregando...";
  selecionados.clear(); atualizarSelCount();

  try {
    const filtroAgencia = getFiltroAgenciaSelecionada();
    const ini    = $("filtroDataInicio")?.value || "";
    const fim    = $("filtroDataFim")?.value || "";
    const rm     = $("filtroRM")?.value || "";
    const status = $("filtroStatus")?.value || "";
    const empTxt = normalize($("filtroEmpresa")?.value || "");

    let cotacoes = await listarCotacoesPorPerfil();

    if (filtroAgencia) cotacoes = cotacoes.filter(c => (c.agenciaId || "") === filtroAgencia);

    // filtro por período usa a data de CRIAÇÃO (pedido), como já estava — relatório respeita isso também
    cotacoes = cotacoes.filter(c => {
      const d = c.dataCriacao?.toDate?.() || (typeof c.dataCriacao === "string" ? new Date(c.dataCriacao) : null);
      if (ini && d && d < new Date(ini)) return false;
      if (fim && d && d > new Date(fim + "T23:59:59")) return false;
      if (rm && c.rmNome !== rm) return false;
      if (status && c.status !== status) return false;
      if (empTxt && !normalize(c.empresaNome||"").includes(empTxt)) return false;
      return true;
    });

    // Monta linhas (com enriquecimento de última atualização/autor)
    rowsCache = [];
    const limiteEnriquecer = 30; // evita muitas leituras
    let idx = 0;

    for (const c of cotacoes) {
      const dataObj = c.dataCriacao?.toDate?.() || (typeof c.dataCriacao === "string" ? new Date(c.dataCriacao) : null);
      const dataMs  = dataObj ? dataObj.getTime() : 0;
      let last = c.dataAtualizacao?.toDate?.() || c.dataAtualizacao || dataObj;
      let lastWho = c.atualizadoPorNome || c.autorNome || "";

      if (idx < limiteEnriquecer) {
        const rich = await computeLastUpdateRich({ ...c, id: c.id });
        if (rich.last){ last = rich.last; lastWho = rich.lastWho || lastWho; }
      }
      idx++;

      const lastMs  = last ? new Date(last).getTime() : dataMs;
      const diasSemAtual = last ? Math.max(0, Math.floor((Date.now() - new Date(last)) / (1000*60*60*24))) : 0;

      const valorNum = typeof c.valorDesejado === "number" ? c.valorDesejado : 0;
      const agenciaLabel = c.agenciaId ? (agenciasMap[c.agenciaId] || c.agenciaId) : "-";

      rowsCache.push({
        id: c.id,
        empresaNome: c.empresaNome || "-",
        rmNome: c.rmNome || "-",
        ramo: c.ramo || "-",
        valor: valorNum,
        valorFmt: valorNum ? toBRL(valorNum) : "-",
        status: c.status || "-",
        dataMs,
        dataFmt: dataObj ? dataObj.toLocaleDateString("pt-BR") : "-",
        lastUpdateMs: lastMs,
        lastUpdateFmt: last ? new Date(last).toLocaleString("pt-BR") : "-",
        lastUser: lastWho || "-",
        diasSemAtual,
        agenciaLabel,
      });
    }

    ordenarRows(rowsCache);
    pagMostrando = 0;
    renderTabelaPaginada();
  } catch (err) {
    console.error("Erro ao carregar cotações:", err);
    container.innerHTML = `<p class="muted">Sem permissão ou erro de rede. Verifique as regras e o login.</p>`;
  }
}

// --------- Ordenação ----------
function instalarOrdenacaoCabecalhos() {
  const container = $("listaCotacoes");
  container.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable"); if (!th) return;
    const key = th.dataset.sort;
    if (sortKey === key) sortDir = (sortDir === "asc" ? "desc" : "asc");
    else { sortKey = key; sortDir = (key === "lastUpdateMs" || key === "dataMs" || key === "valor" || key==="diasSemAtual") ? "desc" : "asc"; }
    renderTabelaPaginada(true);
  });
}
function ordenarRows(rows){
  const key = sortKey;
  const dir = sortDir === "asc" ? 1 : -1;
  rows.sort((a,b)=>{
    const va = a[key]; const vb = b[key];
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    const sa = (va ?? "").toString().toLowerCase();
    const sb = (vb ?? "").toString().toLowerCase();
    if (sa < sb) return -1 * dir;
    if (sa > sb) return  1 * dir;
    return 0;
  });
}

// --------- Render + Paginação + Seleção ---------
function renderTabelaPaginada(reuseSort=false){
  if (!reuseSort) ordenarRows(rowsCache);
  const container = $("listaCotacoes");
  const total = rowsCache.length;
  const ate = Math.min(total, pagMostrando + pagTamanho);
  const rows = rowsCache.slice(0, ate);
  pagMostrando = rows.length;

  const arrow = (k) => sortKey===k ? (sortDir==="asc"?"↑":"↓") : "↕";

  let html = `<table><thead><tr>
    <th style="width:36px"><input type="checkbox" id="selAll" ${rows.every(r=>selecionados.has(r.id)) && rows.length? "checked":""}></th>
    <th class="sortable" data-sort="empresaNome">Cliente <span class="arrow">${arrow("empresaNome")}</span></th>
    <th class="sortable" data-sort="agenciaLabel">Agência <span class="arrow">${arrow("agenciaLabel")}</span></th>
    <th class="sortable" data-sort="rmNome">RM <span class="arrow">${arrow("rmNome")}</span></th>
    <th class="sortable" data-sort="ramo">Ramo <span class="arrow">${arrow("ramo")}</span></th>
    <th class="sortable" data-sort="valor">Valor <span class="arrow">${arrow("valor")}</span></th>
    <th class="sortable" data-sort="status">Status <span class="arrow">${arrow("status")}</span></th>
    <th class="sortable" data-sort="diasSemAtual">Dias sem atualização <span class="arrow">${arrow("diasSemAtual")}</span></th>
    <th class="sortable" data-sort="lastUpdateMs">Última atualização <span class="arrow">${arrow("lastUpdateMs")}</span></th>
    <th class="sortable" data-sort="dataMs">Criado em <span class="arrow">${arrow("dataMs")}</span></th>
    <th>Ações</th>
  </tr></thead><tbody>`;

  rows.forEach(r => {
    const checked = selecionados.has(r.id) ? "checked" : "";
    html += `<tr>
      <td data-label="Selecionar"><input type="checkbox" class="selrow" data-id="${r.id}" ${checked}></td>
      <td data-label="Cliente">
        <div class="empresa-strong">${r.empresaNome}</div>
        <div class="sub">${r.ramo} • ${r.rmNome}</div>
      </td>
      <td data-label="Agência">${r.agenciaLabel}</td>
      <td data-label="RM">${r.rmNome}</td>
      <td data-label="Ramo">${r.ramo}</td>
      <td data-label="Valor">${r.valorFmt}</td>
      <td data-label="Status"><span class="status-badge ${statusClass(r.status)}">${r.status}</span></td>
      <td data-label="Dias sem atualização">${r.diasSemAtual}</td>
      <td data-label="Última atualização">${r.lastUpdateFmt}${r.lastUser ? ` • ${r.lastUser}` : ""}</td>
      <td data-label="Criado em">${r.dataFmt}</td>
      <td data-label="Ações">
        <div class="actions">
          <a class="icon-btn" href="chat-cotacao.html?id=${r.id}" title="Abrir chat c/ cotação" target="_blank"><span class="lucide" data-lucide="message-square"></span></a>
          ${isAdmin ? `
            <button class="icon-btn" onclick="editarCotacao('${r.id}')" title="Editar"><span class="lucide" data-lucide="pencil"></span></button>
            <button class="icon-btn" onclick="excluirCotacao('${r.id}')" title="Excluir"><span class="lucide" data-lucide="trash-2"></span></button>
          ` : ``}
        </div>
      </td>
    </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  if (window.lucide) lucide.createIcons(container); // reidrata ícones após render

  container.querySelectorAll(".selrow").forEach(chk=>{
    chk.addEventListener("change", (e)=>{
      const id = e.target.dataset.id;
      if (e.target.checked) selecionados.add(id); else selecionados.delete(id);
      atualizarSelCount();
    });
  });
  const selAll = $("#selAll");
  if (selAll) selAll.addEventListener("change", (e)=>{
    const marcar = e.target.checked;
    container.querySelectorAll(".selrow").forEach(c=>{
      c.checked = marcar;
      const id = c.dataset.id;
      if (marcar) selecionados.add(id); else selecionados.delete(id);
    });
    atualizarSelCount();
  });

  const btnMore = $("btnLoadMore");
  if (btnMore) btnMore.style.display = (pagMostrando < rowsCache.length) ? "inline-flex" : "none";
}
function instalarLoadMore(){
  const btn = $("btnLoadMore");
  if (!btn) return;
  btn.addEventListener("click", ()=>{
    renderTabelaPaginada(true);
  });
}
function atualizarSelCount(){
  const el = $("selCount");
  if (el) el.textContent = `${selecionados.size} selecionadas`;
}

// ===== Exportações =====
function getLinhasParaExport(){
  if (selecionados.size === 0) return rowsCache; // exporta todas as filtradas
  const set = new Set(Array.from(selecionados));
  return rowsCache.filter(r => set.has(r.id));
}
function exportarExcel(){
  const dados = getLinhasParaExport().map(r => ({
    "Cliente": r.empresaNome,
    "Agência": r.agenciaLabel,
    "RM": r.rmNome,
    "Ramo": r.ramo,
    "Valor": r.valor,
    "Status": r.status,
    "Dias sem atualização": r.diasSemAtual,
    "Última atualização": r.lastUpdateFmt + (r.lastUser? ` • ${r.lastUser}`:""),
    "Criado em": r.dataFmt,
  }));
  if (!dados.length) return alert("Nada para exportar.");
  const ws = XLSX.utils.json_to_sheet(dados);
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = 1; R <= range.e.r; R++) {
    const cell = ws[XLSX.utils.encode_cell({r:R, c:4})];
    if (cell && typeof cell.v === "number") { cell.t = "n"; }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cotações");
  XLSX.writeFile(wb, "cotacoes.xlsx");
}
function exportarPDF(){
  const dados = getLinhasParaExport();
  if (!dados.length) return alert("Nada para exportar.");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(12);
  doc.text("Cotações - Retorno Seguros", 14, 14);
  const body = dados.map(r => [
    r.empresaNome, r.agenciaLabel, r.rmNome, r.ramo, r.valorFmt, r.status, r.diasSemAtual, (r.lastUpdateFmt + (r.lastUser? ` • ${r.lastUser}`:"")), r.dataFmt
  ]);
  doc.autoTable({
    head: [["Cliente","Agência","RM","Ramo","Valor","Status","Dias sem atualização","Última atualização","Criado em"]],
    body,
    startY: 18,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [0,64,128] }
  });
  doc.save("cotacoes.pdf");
}

// ===== Relatório (Modal) =====
function abrirRelatorio(){
  const m = $("modalRel"); if (!m) return;
  montarRelatorioDeRows(rowsCache);
  m.style.display = "flex";
}
function fecharRelatorio(){
  const m = $("modalRel"); if (!m) return;
  m.style.display = "none";
  // destrói charts
  chartRefs.forEach(ch => { try { ch.destroy(); } catch(_){} });
  chartRefs = [];
}

function groupBy(arr, key){
  const map = new Map();
  arr.forEach(o => {
    const k = (typeof key==="function") ? key(o) : (o[key] ?? "");
    map.set(k, (map.get(k)||[]).concat([o]));
  });
  return map;
}

function montarRelatorioDeRows(rows){
  // KPIs
  const total = rows.length;
  const totalValor = rows.reduce((s,r)=>s+(Number(r.valor)||0),0);
  const pendentes = rows.filter(r=> (r.status||"").toLowerCase().includes("pendente")).length;
  const emitidos = rows.filter(r=> incluiEmitido(r.status)).length;

  const kpis = $("kpisRel");
  kpis.innerHTML = `
    <div class="kpi"><div class="label">Qtde de cotações</div><div class="value">${total}</div></div>
    <div class="kpi"><div class="label">Valor total</div><div class="value">${toBRL(totalValor)}</div></div>
    <div class="kpi"><div class="label">Pendentes</div><div class="value">${pendentes}</div></div>
    <div class="kpi"><div class="label">Emitidos / Fechados</div><div class="value">${emitidos}</div></div>
  `;

  // Status -> quantidade/valor
  const byStatus = groupBy(rows, r => (r.status||"-"));
  const stLabels = Array.from(byStatus.keys());
  const stQtd = stLabels.map(l => byStatus.get(l).length);
  const stVal = stLabels.map(l => byStatus.get(l).reduce((s,x)=>s+(x.valor||0),0));

  // RM tops: por solicitações (mês corrente) e por emitidos (valor)
  const agora = new Date();
  const y = agora.getFullYear(), m = agora.getMonth();
  const inicioMes = new Date(y, m, 1).getTime(), fimMes = new Date(y, m+1, 0, 23,59,59).getTime();

  const rowsMes = rows.filter(r => r.dataMs >= inicioMes && r.dataMs <= fimMes);
  const byRM = groupBy(rowsMes, r => (r.rmNome||"-"));
  const rmLabels = Array.from(byRM.keys());
  const rmQtdMes = rmLabels.map(l => byRM.get(l).length);

  const byRMEmit = groupBy(rows.filter(r=>incluiEmitido(r.status)), r => (r.rmNome||"-"));
  const rmEmitLabels = Array.from(byRMEmit.keys());
  const rmEmitVal = rmEmitLabels.map(l => byRMEmit.get(l).reduce((s,x)=>s+(x.valor||0),0));

  // Ramo
  const byRamo = groupBy(rows, r => (r.ramo||"-"));
  const ramoLabels = Array.from(byRamo.keys());
  const ramoQtd = ramoLabels.map(l => byRamo.get(l).length);
  const ramoVal = ramoLabels.map(l => byRamo.get(l).reduce((s,x)=>s+(x.valor||0),0));

  // Desenha charts
  const mk = (id, type, data, options={}) => {
    const ctx = document.getElementById(id).getContext("2d");
    const ch = new Chart(ctx, { type, data, options: { responsive:true, maintainAspectRatio:false, ...options } });
    chartRefs.push(ch);
    return ch;
  };

  mk("chartStatusQtd","bar",{
    labels: stLabels,
    datasets: [{ label:"Qtd por status", data: stQtd }]
  });
  mk("chartStatusValor","bar",{
    labels: stLabels,
    datasets: [{ label:"Valor por status", data: stVal }]
  }, { scales:{ y:{ ticks:{ callback:v=>toBRL(v) }}} });

  mk("chartRMTopCotas","bar",{
    labels: rmLabels,
    datasets: [{ label:"RMs com mais solicitações (mês)", data: rmQtdMes }]
  });
  mk("chartRMEmitidos","bar",{
    labels: rmEmitLabels,
    datasets: [{ label:"Valor emitido por RM", data: rmEmitVal }]
  }, { scales:{ y:{ ticks:{ callback:v=>toBRL(v) }}} });

  mk("chartRamoQtd","bar",{
    labels: ramoLabels,
    datasets: [{ label:"Qtd por ramo", data: ramoQtd }]
  });
  mk("chartRamoValor","bar",{
    labels: ramoLabels,
    datasets: [{ label:"Valor por ramo", data: ramoVal }]
  }, { scales:{ y:{ ticks:{ callback:v=>toBRL(v) }}} });

  // Tabelas de apoio
  const tabelaRank = (titulo, labels, vals, fmtVal=(x)=>x) => {
    const zipped = labels.map((l,i)=>({l, v: vals[i]})).sort((a,b)=>b.v-a.v).slice(0, 10);
    const rows = zipped.map((z,i)=>`<tr><td>${i+1}º</td><td>${z.l}</td><td style="text-align:right">${fmtVal(z.v)}</td></tr>`).join("");
    return `
      <div class="card" style="margin-top:10px">
        <h4 style="margin:0 0 8px">${titulo}</h4>
        <table style="width:100%; border-collapse:collapse">
          <thead><tr><th>#</th><th>Item</th><th style="text-align:right">Valor</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="3" class="muted">Sem dados</td></tr>`}</tbody>
        </table>
      </div>
    `;
  };

  $("tabelasRel").innerHTML =
    tabelaRank("Top RMs (Qtde no mês)", rmLabels, rmQtdMes, x=>x) +
    tabelaRank("Top RMs (Valor emitido)", rmEmitLabels, rmEmitVal, v=>toBRL(v)) +
    tabelaRank("Ramos (Qtde)", ramoLabels, ramoQtd, x=>x) +
    tabelaRank("Ramos (Valor)", ramoLabels, ramoVal, v=>toBRL(v));
}

function exportarRelatorioPDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(12);
  doc.text("Relatório - Cotações (Filtros aplicados)", 14, 14);
  // Apenas um resumo textual + KPIs principais
  const total = rowsCache.length;
  const totalValor = rowsCache.reduce((s,r)=>s+(Number(r.valor)||0),0);
  const pendentes = rowsCache.filter(r=> (r.status||"").toLowerCase().includes("pendente")).length;
  const emitidos = rowsCache.filter(r=> incluiEmitido(r.status)).length;

  doc.text(`Qtde: ${total}  |  Valor: ${toBRL(totalValor)}  |  Pendentes: ${pendentes}  |  Emitidos/Fechados: ${emitidos}`, 14, 24);
  doc.save("relatorio-cotacoes.pdf");
}

// ===== Exports p/ onclick =====
window.resolverEmpresaNova       = resolverEmpresaNova;
window.preencherEmpresa          = preencherEmpresa;
window.criarNovaCotacao          = criarNovaCotacao;
window.carregarCotacoesComFiltros= carregarCotacoesComFiltros;
window.editarCotacao             = editarCotacao;
window.salvarAlteracoesCotacao   = salvarAlteracoesCotacao;
window.excluirCotacao            = excluirCotacao;
window.exportarExcel             = exportarExcel;
window.exportarPDF               = exportarPDF;

window.abrirRelatorio            = abrirRelatorio;
window.fecharRelatorio           = fecharRelatorio;
window.exportarRelatorioPDF      = exportarRelatorioPDF;
