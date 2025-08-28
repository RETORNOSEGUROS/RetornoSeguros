// ===== Firebase init =====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// ===== Estado global =====
let usuarioAtual = null;
let perfilAtual  = "";        // "admin" | "gerente chefe" | "rm" | "assistente"
let minhaAgencia = "";
let isAdmin      = false;

let empresasCache = [];       // [{id, nome, cnpj, agenciaId, rmUid, rmNome}, ...]
let agenciasMap   = {};       // {agenciaId: "Nome — Banco / Cidade - UF"}

let sortKey = "lastUpdateMs"; // ordenação por última atualização
let sortDir = "desc";
let pagTamanho = 10;
let pagMostrando = 0;         // qtd atual renderizada
let rowsCache = [];           // cache após filtros para paginação
let selecionados = new Set();

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
      popularDatalistEmpresas();
    } catch (e) { console.error("Erro inicial:", e); }

    const btn = $("btnSalvarAlteracoes");
    if (btn && !isAdmin) btn.style.display = "none";

    instalarOrdenacaoCabecalhos();
    instalarLoadMore();
    carregarCotacoesComFiltros();
  });
});

// ===== Perfil / Agências / Empresas / Ramos / RM / Status (sem mudanças estruturais) =====
// (mesmo bloco do seu arquivo original, com pequenas adições)
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
  const campos = ["empresa", "novaEmpresa"];
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

  campos.forEach(id => {
    const el = $(id); if (!el) return;
    empresasCache.forEach(emp => {
      const opt = document.createElement("option");
      opt.value = emp.id; opt.textContent = emp.nome; el.appendChild(opt);
    });
  });
}
function popularDatalistEmpresas(){
  const dl = $("empresasList"); if (!dl) return;
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

// ===== CRUD (sem mudanças além do original) =====
function preencherEmpresaNova() {
  const id = $("novaEmpresa").value;
  const empresa = empresasCache.find(e => e.id === id);
  const rmNome = empresa ? (empresa.rmNome || empresa.rm || "") : "";
  $("nova-info-cnpj").textContent = empresa ? `CNPJ: ${empresa.cnpj || "-"}` : "";
  $("nova-info-rm").textContent   = empresa ? `RM responsável: ${rmNome || "-"}` : "";
}
function preencherEmpresa() {
  const id = $("empresa").value;
  const empresa = empresasCache.find(e => e.id === id);
  const rmNome = empresa ? (empresa.rmNome || empresa.rm || "") : "";
  $("info-cnpj").textContent = empresa ? `CNPJ: ${empresa.cnpj || "-"}` : "";
  $("info-rm").textContent   = empresa ? `RM responsável: ${rmNome || "-"}` : "";
}

async function criarNovaCotacao() {
  const empresaId = $("novaEmpresa").value;
  const ramo      = $("novaRamo").value;
  const valorFmt  = $("novaValor").value;
  const valor     = desformatarMoeda(valorFmt);
  const obs       = $("novaObservacoes").value.trim();
  const empresa   = empresasCache.find(e => e.id === empresaId);

  if (!empresaId || !ramo || !empresa) return alert("Preencha todos os campos.");

  const rmNome = empresa.rmNome || empresa.rm || "";
  const rmId   = empresa.rmUid  || empresa.rmId || "";

  const agora = firebase.firestore.FieldValue.serverTimestamp();

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
  $("novaEmpresa").value = ""; $("novaRamo").value = ""; $("novaValor").value = "R$ 0,00"; $("novaObservacoes").value = "";
  preencherEmpresaNova();
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

function getFiltroAgenciaSelecionada() {
  const sel = $("filtroAgencia"); if (!sel) return "";
  return sel.disabled ? (minhaAgencia || "") : (sel.value || "");
}
function computeLastUpdate(c){
  // Preferir campo dedicado; senão, maior entre dataCriacao e interacoes[].dataHora
  const ts = c.dataAtualizacao?.toDate?.() || c.dataAtualizacao
          || c.dataCriacao?.toDate?.() || c.dataCriacao || null;
  let max = ts ? new Date(ts) : null;
  if (Array.isArray(c.interacoes)){
    c.interacoes.forEach(i=>{
      const d = i?.dataHora ? new Date(i.dataHora) : null;
      if (d && (!max || d > max)) max = d;
    });
  }
  return max;
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
    const rm     = $("filtroRM")?.value || "";      // rmNome
    const status = $("filtroStatus")?.value || "";
    const empTxt = normalize($("filtroEmpresa")?.value || "");

    let cotacoes = await listarCotacoesPorPerfil();

    if (filtroAgencia) cotacoes = cotacoes.filter(c => (c.agenciaId || "") === filtroAgencia);

    cotacoes = cotacoes.filter(c => {
      // Filtro por data de criação
      const d = c.dataCriacao?.toDate?.() || (typeof c.dataCriacao === "string" ? new Date(c.dataCriacao) : null);
      if (ini && d && d < new Date(ini)) return false;
      if (fim && d && d > new Date(fim + "T23:59:59")) return false;
      if (rm && c.rmNome !== rm) return false;
      if (status && c.status !== status) return false;
      if (empTxt && !normalize(c.empresaNome||"").includes(empTxt)) return false;
      return true;
    });

    rowsCache = cotacoes.map(c => {
      const dataObj = c.dataCriacao?.toDate?.() || (typeof c.dataCriacao === "string" ? new Date(c.dataCriacao) : null);
      const dataMs  = dataObj ? dataObj.getTime() : 0;
      const last    = computeLastUpdate(c);
      const lastMs  = last ? last.getTime() : dataMs;
      const valorNum = typeof c.valorDesejado === "number" ? c.valorDesejado : 0;
      const agenciaLabel = c.agenciaId ? (agenciasMap[c.agenciaId] || c.agenciaId) : "-";
      return {
        id: c.id,
        empresaNome: c.empresaNome || "-",
        rmNome: c.rmNome || "-",
        ramo: c.ramo || "-",
        valor: valorNum,
        valorFmt: valorNum ? valorNum.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "-",
        status: c.status || "-",
        dataMs,
        dataFmt: dataObj ? dataObj.toLocaleDateString("pt-BR") : "-",
        lastUpdateMs: lastMs,
        lastUpdateFmt: last ? last.toLocaleString("pt-BR") : "-",
        agenciaLabel,
      };
    });

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
    else { sortKey = key; sortDir = (key === "lastUpdateMs" || key === "dataMs" || key === "valor") ? "desc" : "asc"; }
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

// --------- Status -> classe ---------
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
  return ""; // default chip
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
      <td data-label="Última atualização">${r.lastUpdateFmt}</td>
      <td data-label="Criado em">${r.dataFmt}</td>
      <td data-label="Ações">
        <a href="chat-cotacao.html?id=${r.id}" target="_blank">Abrir</a>
        ${isAdmin ? ` | <a href="#" onclick="editarCotacao('${r.id}')">Editar</a>
        | <a href="#" onclick="excluirCotacao('${r.id}')" style="color:#c00">Excluir</a>` : ""}
      </td>
    </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  // eventos seleção
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

  // botão carregar mais
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

// --------- Utilidades UI ---------
function limparFiltros(){
  ["filtroEmpresa","filtroDataInicio","filtroDataFim","filtroRM","filtroStatus"].forEach(id=>{
    const el=$(id); if(el) el.value="";
  });
  if (isAdmin) { const a=$("filtroAgencia"); if (a) a.value=""; }
  carregarCotacoesComFiltros();
}

// ===== Exports para onclick =====
window.preencherEmpresa         = preencherEmpresa;
window.preencherEmpresaNova     = preencherEmpresaNova;
window.criarNovaCotacao         = criarNovaCotacao;
window.carregarCotacoesComFiltros = carregarCotacoesComFiltros;
window.editarCotacao            = editarCotacao;
window.salvarAlteracoesCotacao  = salvarAlteracoesCotacao;
window.excluirCotacao           = excluirCotacao;
window.limparFiltros            = limparFiltros;
