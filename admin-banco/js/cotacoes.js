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
let chartRefs = [];

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const normalize = (s) =>
  (s || "").toString().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim();
const roleNorm = (s) => normalize(s).replace(/[-_]+/g, " ");
const toBRL = (n) => (Number(n||0)).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

// ⚠️ Alias p/ evitar conflito com a função global do HTML
const parseMoeda = (typeof window.desformatarMoeda === "function")
  ? window.desformatarMoeda
  : (str)=>{ if(!str) return 0; return parseFloat(String(str).replace(/[^\d]/g,'')/100); };

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
    carregarCotacoesComFiltros();
  });
});

// ===== Perfil / Agências / Base =====
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
  const empresaId = $("novaEmpresaId").value;
  const ramo      = $("novaRamo").value;
  const valor     = parseMoeda($("novaValor").value);
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
  alert("Cotação criada.");
  ["novaEmpresaNome","novaEmpresaId","novaRamo","novaValor","novaObservacoes"].forEach(id=>$(id).value="");
  $("nova-info-cnpj").textContent = ""; $("nova-info-rm").textContent = "";
  carregarCotacoesComFiltros();
}

function editarCotacao(id) {
  db.collection("cotacoes-gerentes").doc(id).get().then(doc => {
    if (!doc.exists) return alert("Cotação não encontrado");
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
  const valor     = parseMoeda($("valorEstimado").value);
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

// ===== Listagem + filtros =====
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

// ===== Última atualização ROBUSTA =====
const SUBS_POSSIVEIS = [
  "interacoes","mensagens","chat","chat-cotacao",
  "historico","logs","timeline","atualizacoes","updates","observacoes"
];
const CAMPOS_DATA = ["dataHora","timestamp","criadoEm","createdAt","data","when"];
const CAMPOS_AUTOR = ["autorNome","usuarioNome","autor","user","quem"];

function parseDateFromText(txt=""){
  // ex.: 30/08/2025, 10:01:05
  const m = String(txt).match(/(\d{2}\/\d{2}\/\d{4}),\s*(\d{2}:\d{2}:\d{2})/);
  if(!m) return null;
  const [_, d, t] = m;
  const [dd,mm,yy] = d.split("/").map(Number);
  const [HH,MM,SS] = t.split(":").map(Number);
  const dt = new Date(yy, mm-1, dd, HH, MM, SS);
  return isNaN(dt.getTime()) ? null : dt;
}

async function buscarUltimaInteracaoDoc(cotId){
  for (const base of SUBS_POSSIVEIS){
    try {
      // 1) tentar ordenar por campos comuns
      for (const f of CAMPOS_DATA){
        try{
          const q = await db.collection("cotacoes-gerentes").doc(cotId).collection(base)
            .orderBy(f,"desc").limit(1).get();
          if (!q.empty){
            const d = q.docs[0].data() || {};
            const when = d[f]?.toDate?.() || (d[f] ? new Date(d[f]) : null) || parseDateFromText(d.mensagem||d.texto||d.descricao||"");
            const who  = CAMPOS_AUTOR.map(k=>d[k]).find(Boolean) || "";
            if (when) return { when, who };
          }
        }catch(_){}
      }
      // 2) fallback: ler tudo e calcular manualmente (inclui data no texto)
      const all = await db.collection("cotacoes-gerentes").doc(cotId).collection(base).get();
      if (!all.empty){
        let best = null, who = "";
        all.forEach(doc=>{
          const x = doc.data() || {};
          const datas = [
            ...CAMPOS_DATA.map(k=>x[k]),
            parseDateFromText(x.mensagem||x.texto||x.descricao||"")
          ];
          const w = datas.map(v=> v?.toDate?.() || (v? new Date(v):null))
                         .filter(Boolean).sort((a,b)=>b-a)[0];
          if (w && (!best || w>best)){ best = w; who = CAMPOS_AUTOR.map(k=>x[k]).find(Boolean) || who; }
        });
        if (best) return { when: best, who };
      }
    } catch(_){}
  }
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

// Enriquecimento paralelo nas subcoleções do chat
async function enrichSubcollectionsParallel(rows, limit=30){
  const alvo = rows.slice(0, limit).map(r => ({ id:r.id, lastMs:r.lastUpdateMs }));
  const tasks = alvo.map(async (r) => {
    try{
      const sub = await buscarUltimaInteracaoDoc(r.id);
      if (!sub) return null;
      return { id:r.id, when: sub.when, who: sub.who || "" };
    }catch{ return null; }
  });
  const res = await Promise.allSettled(tasks);
  let alterou = false;
  res.forEach(out => {
    if (out.status !== "fulfilled" || !out.value) return;
    const { id, when, who } = out.value;
    const row = rows.find(x => x.id === id);
    if (!row) return;
    const ms = when ? new Date(when).getTime() : 0;
    if (ms && ms > (row.lastUpdateMs||0)){
      row.lastUpdateMs = ms;
      row.lastUpdateFmt = new Date(ms).toLocaleString("pt-BR");
      if (who) row.lastUser = who;
      row.diasSemAtual = Math.max(0, Math.floor((Date.now() - ms)/86400000));
      alterou = true;
    }
  });
  return alterou;
}

// Processa TODAS as linhas em lotes e re-renderiza quando houver mudanças
async function enrichAllInBatches(fullRows, batchSize = 40){
  for (let i = 0; i < fullRows.length; i += batchSize){
    const slice = fullRows.slice(i, i + batchSize);
    const mudou = await enrichSubcollectionsParallel(slice, slice.length);
    if (mudou){
      ordenarRows(rowsCache);
      renderTabelaPaginada(true);
      atualizarResumoFiltro();
    }
  }
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

    // período com base na criação (pedido)
    cotacoes = cotacoes.filter(c => {
      const d = c.dataCriacao?.toDate?.() || (typeof c.dataCriacao === "string" ? new Date(c.dataCriacao) : null);
      if (ini && d && d < new Date(ini)) return false;
      if (fim && d && d > new Date(fim + "T23:59:59")) return false;
      if (rm && c.rmNome !== rm) return false;
      if (status && c.status !== status) return false;
      if (empTxt && !normalize(c.empresaNome||"").includes(empTxt)) return false;
      return true;
    });

    // Enriquecimento: última atualização (doc, vetor interacoes)
    rowsCache = [];
    for (const c of cotacoes) {
      const dataCriacao = pickFirstDate(c.dataCriacao);
      let last = pickFirstDate(c.dataAtualizacao, c.ultimaAtualizacao, c.updatedAt, c.statusMudadoEm);
      let lastWho = c.atualizadoPorNome || c.autorNome || "";

      if (Array.isArray(c.interacoes) && c.interacoes.length){
        const ult = [...c.interacoes]
          .map(i => ({
            when: i?.dataHora ? new Date(i.dataHora) : parseDateFromText(i?.mensagem||i?.texto||""),
            who:  i?.autorNome || ""
          }))
          .filter(x => x.when && !isNaN(x.when)).sort((a,b)=>b.when-a.when)[0];
        if (ult && (!last || ult.when > last)){ last = ult.when; lastWho = ult.who || lastWho; }
      }

      if (!last) last = dataCriacao;

      const valorNum = typeof c.valorDesejado === "number" ? c.valorDesejado : 0;
      const agenciaLabel = c.agenciaId ? (agenciasMap[c.agenciaId] || c.agenciaId) : "-";

      const lastMs = (last instanceof Date) ? last.getTime()
                    : (typeof last === "number" ? last
                    : (last ? new Date(last).getTime() : 0));
      const dataMs = dataCriacao ? new Date(dataCriacao).getTime() : 0;
      const dias = lastMs ? Math.max(0, Math.floor((Date.now() - lastMs)/86400000)) : 0;

      rowsCache.push({
        id: c.id,
        empresaNome: c.empresaNome || "-",
        rmNome: c.rmNome || "-",
        ramo: c.ramo || "-",
        valor: valorNum,
        valorFmt: valorNum ? toBRL(valorNum) : "-",
        status: c.status || "-",
        dataMs,
        dataFmt: dataCriacao ? new Date(dataCriacao).toLocaleDateString("pt-BR") : "-",
        lastUpdateMs: lastMs,
        lastUpdateFmt: lastMs ? new Date(lastMs).toLocaleString("pt-BR") : "-",
        lastUser: lastWho || "",
        diasSemAtual: dias,
        agenciaLabel,
      });
    }

    // Ordena e renderiza
    ordenarRows(rowsCache);
    pagMostrando = 0;
    renderTabelaPaginada();
    atualizarResumoFiltro();

    // Enriquecer TODA a lista em lotes (corrige itens que estavam fora do top inicial)
    enrichAllInBatches(rowsCache, 40);
  } catch (err) {
    console.error("Erro ao carregar cotações:", err);
    container.innerHTML = `<p class="muted">Sem permissão ou erro de rede.</p>`;
  }
}

function getFiltroAgenciaSelecionada() {
  const sel = $("filtroAgencia"); if (!sel) return "";
  return sel.disabled ? (minhaAgencia || "") : (sel.value || "");
}

// --------- Ordenação ----------
function instalarOrdenacaoCabecalhos() {
  const container = $("listaCotacoes");
  container.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable"); if (!th) return;
    const key = th.dataset.sort;
    if (sortKey === key) sortDir = (sortDir === "asc" ? "desc" : "asc");
    else { sortKey = key; sortDir = (["lastUpdateMs","dataMs","valor","diasSemAtual"].includes(key)) ? "desc" : "asc"; }
    ordenarRows(rowsCache);        // ✅ reordena o dataset completo
    renderTabelaPaginada(true);    // reaproveita paginação atual
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
  let ate;
  if (pagTamanho === 'all') { ate = total; }
  else { ate = Math.min(total, pagMostrando + pagTamanho); }
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
    const diasBadgeClass = r.diasSemAtual >= 15 ? "status-badge st-vermelho"
                         : r.diasSemAtual >= 7 ? "status-badge st-amarelo"
                         : "status-badge";
    const diasBadge = `<span class="${diasBadgeClass}">${r.diasSemAtual}</span>`;

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
      <td data-label="Dias sem atualização">${diasBadge}</td>
      <td data-label="Última atualização">${r.lastUpdateFmt}${r.lastUser ? ` • ${r.lastUser}` : ""}</td>
      <td data-label="Criado em">${r.dataFmt}</td>
      <td data-label="Ações" class="td-actions">
        <div class="actions">
          <a class="icon-btn" href="chat-cotacao.html?id=${r.id}" title="Abrir chat" target="_blank">
            <i data-lucide="message-square"></i>
          </a>
          ${isAdmin ? `
            <button class="icon-btn" title="Editar" onclick="editarCotacao('${r.id}')">
              <i data-lucide="pencil"></i>
            </button>
            <button class="icon-btn" title="Excluir" onclick="excluirCotacao('${r.id}')">
              <i data-lucide="trash-2"></i>
            </button>
          ` : ``}
        </div>
      </td>
    </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  // hidrata ícones (escopo global)
  if (window.lucide && typeof lucide.createIcons === "function") { lucide.createIcons(); }

  // seleção linha a linha
  container.querySelectorAll(".selrow").forEach(chk=>{
    chk.addEventListener("change", (e)=>{
      const id = e.target.dataset.id;
      if (e.target.checked) selecionados.add(id); else selecionados.delete(id);
      atualizarSelCount();
    });
  });

  // selecionar todos
  const selAll = $("#selAll");
  if (selAll){
    const toggle = (marcar)=>{
      container.querySelectorAll(".selrow").forEach(c=>{
        c.checked = marcar;
        const id = c.dataset.id;
        if (marcar) selecionados.add(id); else selecionados.delete(id);
      });
      atualizarSelCount();
    };
    selAll.addEventListener("change", e => toggle(e.target.checked));
    selAll.addEventListener("click",  e => toggle(e.target.checked));
  }
}

function setPaginacao(n){
  pagTamanho = (n === 'all') ? 'all' : Number(n||10);
  pagMostrando = 0;
  ordenarRows(rowsCache);       // mantém ordenação aplicada
  renderTabelaPaginada(true);
  enrichAllInBatches(rowsCache, 40);
}
function atualizarSelCount(){
  const el = $("selCount");
  if (el) el.textContent = `${selecionados.size} selecionadas`;
}
function atualizarResumoFiltro(){
  const total = rowsCache.length;
  const soma = rowsCache.reduce((s,r)=>s+(Number(r.valor)||0),0);
  const el = $("resumoFiltro");
  if (el) el.textContent = `${total} negócios • ${toBRL(soma)}`;
}

// --------- Classes de Status ---------
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

// ===== Exportações =====
function getLinhasParaExport(){
  if (selecionados.size === 0) return rowsCache; // exporta todas as filtradas
  const set = new Set(Array.from(selecionados));
  return rowsCache.filter(r => set.has(r.id));
}
function exportarExcel(){
  if (typeof XLSX === "undefined") { alert("Biblioteca XLSX não carregada."); return; }
  const dados = getLinhasParaExport().map(r => ({
    "Cliente": r.empresaNome,
    "Agência": r.agenciaLabel,
    "RM": r.rmNome,
    "Ramo": r.ramo,
    "Valor": Number(r.valor)||0,
    "Status": r.status,
    "Dias sem atualização": r.diasSemAtual,
    "Última atualização": r.lastUpdateFmt + (r.lastUser? ` • ${r.lastUser}`:""),
    "Criado em": r.dataFmt,
  }));
  if (!dados.length) return alert("Nada para exportar.");
  const ws = XLSX.utils.json_to_sheet(dados);
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
    r.empresaNome, r.agenciaLabel, r.rmNome, r.ramo, toBRL(r.valor), r.status, r.diasSemAtual,
    r.lastUpdateFmt + (r.lastUser? ` • ${r.lastUser}`:""), r.dataFmt
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

// ===== Relatório (seleção > filtro) =====
function abrirRelatorio(){
  const m = $("modalRel"); if (!m) return;
  const base = getLinhasParaExport(); // selecionados, se houver; senão filtrados
  montarRelatorioDeRows(base);
  m.style.display = "flex";
}
function fecharRelatorio(){
  const m = $("modalRel"); if (!m) return;
  m.style.display = "none";
  chartRefs.forEach(ch => { try { ch.destroy(); } catch(_){} });
  chartRefs = [];
}
function incluiEmitido(txt=""){
  const t = (txt||"").toLowerCase();
  return t.includes("emitido") || t.includes("negócio fechado") || t.includes("negocio fechado");
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
  const total = rows.length;
  const totalValor = rows.reduce((s,r)=>s+(Number(r.valor)||0),0);
  const pendentes = rows.filter(r=> (r.status||"").toLowerCase().includes("pendente")).length;
  const emitidos = rows.filter(r=> incluiEmitido(r.status)).length;

  $("kpisRel").innerHTML = `
    <div class="kpi"><div class="label">Qtde de cotações</div><div class="value">${total}</div></div>
    <div class="kpi"><div class="label">Valor total</div><div class="value">${toBRL(totalValor)}</div></div>
    <div class="kpi"><div class="label">Pendentes</div><div class="value">${pendentes}</div></div>
    <div class="kpi"><div class="label">Emitidos / Fechados</div><div class="value">${emitidos}</div></div>
  `;

  const byStatus = groupBy(rows, r => (r.status||"-"));
  const stLabels = Array.from(byStatus.keys());
  const stQtd = stLabels.map(l => byStatus.get(l).length);
  const stVal = stLabels.map(l => byStatus.get(l).reduce((s,x)=>s+(x.valor||0),0));

  const agora = new Date(); const y = agora.getFullYear(), m = agora.getMonth();
  const inicioMes = new Date(y, m, 1).getTime(), fimMes = new Date(y, m+1, 0, 23,59,59).getTime();
  const rowsMes = rows.filter(r => r.dataMs >= inicioMes && r.dataMs <= fimMes);
  const byRM = groupBy(rowsMes, r => (r.rmNome||"-"));
  const rmLabels = Array.from(byRM.keys());
  const rmQtdMes = rmLabels.map(l => byRM.get(l).length);

  const byRMEmit = groupBy(rows.filter(r=>incluiEmitido(r.status)), r => (r.rmNome||"-"));
  const rmEmitLabels = Array.from(byRMEmit.keys());
  const rmEmitVal = rmEmitLabels.map(l => byRMEmit.get(l).reduce((s,x)=>s+(x.valor||0),0));

  const byRamo = groupBy(rows, r => (r.ramo||"-"));
  const ramoLabels = Array.from(byRamo.keys());
  const ramoQtd = ramoLabels.map(l => byRamo.get(l).length);
  const ramoVal = ramoLabels.map(l => byRamo.get(l).reduce((s,x)=>s+(x.valor||0),0));

  const mk = (id, type, data, options={}) => {
    const ctx = document.getElementById(id).getContext("2d");
    const ch = new Chart(ctx, { type, data, options: { responsive:true, maintainAspectRatio:false, ...options } });
    chartRefs.push(ch);
    return ch;
  };
  mk("chartStatusQtd","bar",{ labels: stLabels, datasets:[{label:"Qtd por status", data: stQtd}] });
  mk("chartStatusValor","bar",{ labels: stLabels, datasets:[{label:"Valor por status", data: stVal}] }, { scales:{ y:{ ticks:{ callback:v=>toBRL(v) }}} });
  mk("chartRMTopCotas","bar",{ labels: rmLabels, datasets:[{label:"RMs com mais solicitações (mês)", data: rmQtdMes}] });
  mk("chartRMEmitidos","bar",{ labels: rmEmitLabels, datasets:[{label:"Valor emitido por RM", data: rmEmitVal}] }, { scales:{ y:{ ticks:{ callback:v=>toBRL(v) }}} });
  mk("chartRamoQtd","bar",{ labels: ramoLabels, datasets:[{label:"Qtd por ramo", data: ramoQtd}] });
  mk("chartRamoValor","bar",{ labels: ramoLabels, datasets:[{label:"Valor por ramo", data: ramoVal}] }, { scales:{ y:{ ticks:{ callback:v=>toBRL(v) }}} });

  const tabelaRank = (titulo, labels, vals, fmtVal=(x)=>x) => {
    const zipped = labels.map((l,i)=>({l, v: vals[i]})).sort((a,b)=>b.v-a.v).slice(0, 10);
    const rows = zipped.map((z,i)=>`<tr><td>${i+1}º</td><td>${z.l}</td><td style="text-align:right">${fmtVal(z.v)}</td></tr>`).join("");
    return `
      <div class="card" style="margin-top:10px">
        <h4 style="margin:0 0 8px">${titulo}</h4>
        <table class="tab-rel">
          <thead><tr><th>#</th><th>Item</th><th style="text-align:right">Valor</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="3" class="muted">Sem dados</td></tr>`}</tbody>
        </table>
      </div>`;
  };
  $("tabelasRel").innerHTML =
    tabelaRank("Top RMs (Qtde no mês)", rmLabels, rmQtdMes) +
    tabelaRank("Top RMs (Valor emitido)", rmEmitLabels, rmEmitVal, v=>toBRL(v)) +
    tabelaRank("Ramos (Qtde)", ramoLabels, ramoQtd) +
    tabelaRank("Ramos (Valor)", ramoLabels, ramoVal, v=>toBRL(v));
}

function exportarRelatorioPDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  const total = rowsCache.length;
  const totalValor = rowsCache.reduce((s,r)=>s+(Number(r.valor)||0),0);
  const pendentes = rowsCache.filter(r=> (r.status||"").toLowerCase().includes("pendente")).length;
  const emitidos = rowsCache.filter(r=> incluiEmitido(r.status)).length;
  doc.setFontSize(12);
  doc.text("Relatório - Cotações (Filtros/Seleção)", 14, 14);
  doc.text(`Qtde: ${total} | Valor: ${toBRL(totalValor)} | Pendentes: ${pendentes} | Emitidos/Fechados: ${emitidos}`, 14, 24);
  doc.save("relatorio-cotacoes.pdf");
}

// ===== Util =====
function limparFiltros(){
  ["filtroEmpresa","filtroStatus","filtroRM"].forEach(id=>{ const el=$(id); if(el) el.value=""; });
  const a=$("filtroAgencia"); if (a && isAdmin) a.value="";
  ["filtroDataInicio","filtroDataFim"].forEach(id=>{ const el=$(id); if(el) el.value=""; });
  carregarCotacoesComFiltros();
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
window.setPaginacao              = setPaginacao;
window.abrirRelatorio            = abrirRelatorio;
window.fecharRelatorio           = fecharRelatorio;
window.exportarRelatorioPDF      = exportarRelatorioPDF;
window.limparFiltros             = limparFiltros;
