// relatorios.js — Página de relatórios “fora da curva”
// ----------------------------------------------------
// ⚙️ CONFIGURAÇÃO (ajuste aqui conforme seu schema/coleções)
const CFG = {
  collections: {
    cotacoes: "cotacoes-gerentes",     // base dos relatórios
    agencias:  "agencias",
    usuarios:  "usuarios_banco",       // deve conter perfil, agenciaId, nome, etc.
    empresas:  "empresas",             // opcional: para nomes/campos extras
  },
  fields: {
    // Campos nas cotações
    createdAt: ["createdAt", "dataCriacao", "criadoEm", "data"], // timestamp Firestore OU string dd/mm/aaaa
    updatedAt: ["updatedAt", "atualizadoEm"],
    empresaNome: ["empresaNome", "empresa", "razaoSocial", "nomeEmpresa"],
    empresaId: ["empresaId", "empresaID"],
    agenciaId: ["agenciaId", "agenciaID"],
    agenciaNome: ["agenciaNome", "agencia"], // se existir
    rmUid: ["rmUid", "rmId", "rmUID"],
    rmNome: ["rmNome", "rm", "responsavel"],
    status: ["status"],
    ramo: ["ramo", "produto"],
    seguradora: ["seguradora"],
    tipo: ["tipo"], // presencial/online (quando vier de visitas/chat-cotação)
    premio: ["premio", "premio_total", "valorPremio", "premioNegocio"],
    // Para identificar “negócio emitido”
    statusEmitidoMatch: ["Negócio Emitido", "Negócio Fechado", "Emitido", "Emissão concluída"],
  },
  // Mapa de Status (para agrupar parecidos)
  statusAliases: {
    "Negócio Emitido": "Negócio Emitido",
    "Negócio Fechado": "Negócio Emitido",
    "Em Emissão": "Em Emissão",
    "Pendente Agência": "Pendente",
    "Pendente Corretor": "Pendente",
    "Pendente Seguradora": "Pendente",
    "Pendente Cliente": "Pendente",
    "Recusado Cliente": "Recusado",
    "Recusado Seguradora": "Recusado",
    "Emitido Declinado": "Recusado"
  },
  currency: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
  number: new Intl.NumberFormat("pt-BR"),
  dateFmt(d){ // Date -> dd/mm/aaaa
    const day = String(d.getDate()).padStart(2,"0");
    const mo  = String(d.getMonth()+1).padStart(2,"0");
    const yr  = d.getFullYear();
    return `${day}/${mo}/${yr}`;
  }
};

// ------- Firebase imports (v9 modular) -------
import {
  getFirestore, collection, query, where, orderBy, getDocs, Timestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getApp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";

const db = getFirestore(getApp());

// ------- Utilidades -------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function pick(obj, keys, fallback=null){
  for(const k of keys){
    if(obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return fallback;
}
function parseMaybeDate(v){
  // Aceita Timestamp do Firestore, Date ou string dd/mm/aaaa
  if(!v) return null;
  if(v instanceof Timestamp) return v.toDate();
  if(v.toDate) return v.toDate();
  if(v instanceof Date) return v;
  if(typeof v === "string"){
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m){
      const d = Number(m[1]), mo = Number(m[2])-1, y = Number(m[3]);
      return new Date(y, mo, d, 12, 0, 0);
    }
    // ISO?
    const d = new Date(v);
    if(!isNaN(d)) return d;
  }
  return null;
}
function normalizeStatus(raw){
  if(!raw) return "Sem status";
  if(CFG.statusAliases[raw]) return CFG.statusAliases[raw];
  return raw;
}
function isEmitido(status){
  const s = normalizeStatus(status);
  return CFG.fields.statusEmitidoMatch.includes(s);
}
function toNumberPremio(v){
  if(typeof v === "number") return v;
  if(typeof v === "string"){
    // remove R$, pontos, vírgulas brasileiras
    const num = v.replace(/[R$\s\.]/g,"").replace(",",".");
    const n = parseFloat(num);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
function groupBy(arr, fnKey){
  const map = new Map();
  for(const it of arr){
    const k = fnKey(it);
    map.set(k, (map.get(k)||[]).concat(it));
  }
  return map;
}
function sum(arr, fn){
  let t=0;
  for(const it of arr){ t += fn(it)||0; }
  return t;
}
function monthKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function rangeMonths(year){
  return Array.from({length:12}, (_,i)=> `${year}-${String(i+1).padStart(2,"0")}`);
}
function pctDelta(curr, prev){
  if(prev === 0) return curr>0 ? 100 : 0;
  return ((curr - prev)/prev)*100;
}
function setDelta(el, value){
  if(!el) return;
  const s = value;
  const sign = s>0 ? "+" : (s<0 ? "":"");
  el.textContent = `${sign}${s.toFixed(1)}% vs a/a`;
  el.className = "delta " + (s>=0 ? "text-emerald-600" : "text-rose-600");
}
function multiSelectValues(sel){
  return Array.from(sel.selectedOptions).map(o=>o.value).filter(Boolean);
}
function downloadCSV(filename, rows){
  const escape = (v)=> `"${String(v??"").replaceAll(`"`,`""`)}"`;
  const csv = rows.map(r=> r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ------- Estado -------
let state = {
  raw: [],           // dados carregados (dentro do range de datas)
  filtered: [],      // após aplicar filtros
  yoy: false,
  agenciaMap: new Map(), // id->nome
  rmMap: new Map(),      // uid->nome
  statusSet: new Set(),
  ramoSet: new Set(),
  seguradoraSet: new Set()
};

// ------- Carregamento inicial -------
init().catch(console.error);

async function init(){
  initEvents();
  await carregarLookups();
  setDefaultDates();
  await aplicarFiltros(); // carrega e desenha tudo
}

function initEvents(){
  $("#btn-aplicar").addEventListener("click", aplicarFiltros);
  $("#btn-limpar").addEventListener("click", () => {
    $$("select").forEach(s=> s.value="");
    $("#f-empresa").value="";
    $("#f-tipo").value="";
    setDefaultDates(true);
  });
  $("#btn-export").addEventListener("click", exportarCSV);
  $("#btn-save-view").addEventListener("click", saveView);
  $("#btn-load-view").addEventListener("click", loadView);
  $("#chk-yoy").addEventListener("change", (e)=> {
    state.yoy = e.target.checked;
    desenhar();
  });
  $("#f-agencia").addEventListener("change", filtrarRMsPorAgencia);
}

function setDefaultDates(keep=false){
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  if(!keep){
    $("#f-data-inicio").value = inicio.toISOString().substring(0,10);
    $("#f-data-fim").value    = hoje.toISOString().substring(0,10);
  }
}

async function carregarLookups(){
  // Agências
  try{
    const snapAg = await getDocs(collection(db, CFG.collections.agencias));
    const selAg = $("#f-agencia");
    selAg.innerHTML = `<option value="">Todas</option>`;
    snapAg.forEach(doc=>{
      const d = doc.data();
      const nome = d.nome || d.descricao || d.titulo || doc.id;
      state.agenciaMap.set(doc.id, nome);
      const opt = document.createElement("option");
      opt.value = doc.id; opt.textContent = nome;
      selAg.appendChild(opt);
    });
  }catch(e){ console.warn("Agencias lookup:", e); }

  // Usuários (para RMs)
  try{
    const snapU = await getDocs(collection(db, CFG.collections.usuarios));
    const selRM = $("#f-rm");
    selRM.innerHTML = `<option value="">Todos</option>`;
    snapU.forEach(doc=>{
      const d = doc.data();
      const nome = d.nome || d.displayName || d.email || doc.id;
      state.rmMap.set(doc.id, nome);
      const opt = document.createElement("option");
      opt.value = doc.id; opt.textContent = `${nome}${d.agenciaId ? ` — ${state.agenciaMap.get(d.agenciaId)||d.agenciaId}`: ""}`;
      opt.dataset.agenciaId = d.agenciaId || "";
      selRM.appendChild(opt);
    });
  }catch(e){ console.warn("Usuarios lookup:", e); }
}

function filtrarRMsPorAgencia(){
  const ag = $("#f-agencia").value;
  const selRM = $("#f-rm");
  const all = Array.from(selRM.querySelectorAll("option"));
  all.forEach(o=>{
    if(!o.value) { o.hidden=false; return; }
    const a = o.dataset.agenciaId || "";
    o.hidden = ag && a && a !== ag;
  });
  // Mantém seleção válida
  if(ag){
    const curr = selRM.value;
    const currOpt = selRM.querySelector(`option[value="${curr}"]`);
    if(curr && currOpt && currOpt.hidden) selRM.value = "";
  }
}

// ------- Consulta de dados -------
async function aplicarFiltros(){
  const diStr = $("#f-data-inicio").value;
  const dfStr = $("#f-data-fim").value;
  const di = diStr ? new Date(diStr+"T00:00:00") : null;
  const df = dfStr ? new Date(dfStr+"T23:59:59") : null;

  // Consulta básica por data no Firestore (melhor performance)
  // Tenta com 'createdAt' e variantes; se não achar, busca tudo (cautela).
  let snap = null;
  const colRef = collection(db, CFG.collections.cotacoes);

  const tried = [];
  for(const key of CFG.fields.createdAt){
    tried.push(key);
    try{
      if(di && df){
        const qRef = query(colRef,
          where(key, ">=", Timestamp.fromDate(di)),
          where(key, "<=", Timestamp.fromDate(df)),
          orderBy(key, "asc")
        );
        snap = await getDocs(qRef);
        if(snap.size >= 0){ break; }
      }
    }catch(e){
      // campo pode ser string — cai para plano B
    }
  }

  if(!snap){
    // fallback: busca tudo e filtra em memória (para schemas com string de data)
    snap = await getDocs(colRef);
  }

  const dados = [];
  snap.forEach(doc=>{
    const d = doc.data();
    const createdRaw = pick(d, CFG.fields.createdAt) || pick(d, CFG.fields.updatedAt);
    const dt = parseMaybeDate(createdRaw);
    // Se intervalo foi escolhido mas não conseguimos filtrar por query, filtramos aqui:
    if(di && df && dt && (dt < di || dt > df)) return;

    const row = {
      id: doc.id,
      data: dt,
      empresa: pick(d, CFG.fields.empresaNome) || "",
      empresaId: pick(d, CFG.fields.empresaId) || "",
      agenciaId: pick(d, CFG.fields.agenciaId) || "",
      agenciaNome: pick(d, CFG.fields.agenciaNome) || (d.agenciaId ? (state.agenciaMap.get(d.agenciaId) || d.agenciaId) : ""),
      rmUid: pick(d, CFG.fields.rmUid) || "",
      rmNome: pick(d, CFG.fields.rmNome) || (state.rmMap.get(pick(d, CFG.fields.rmUid)) || ""),
      status: normalizeStatus(pick(d, CFG.fields.status) || ""),
      ramo: pick(d, CFG.fields.ramo) || "",
      seguradora: pick(d, CFG.fields.seguradora) || "",
      tipo: pick(d, CFG.fields.tipo) || "",
      premio: toNumberPremio(pick(d, CFG.fields.premio) || 0)
    };
    dados.push(row);
  });

  state.raw = dados;

  // Popular listas multi-select (Status/Ramo/Seguradora) dinamicamente
  popularFacetas(dados);

  // Aplicar filtros atuais sobre o raw
  state.filtered = filtrarMemoria(dados);
  state.yoy = $("#chk-yoy").checked;

  // Render
  desenhar();
}

function popularFacetas(dados){
  const sSel = $("#f-status");
  const rSel = $("#f-ramo");
  const sgSel = $("#f-seguradora");

  const sts = Array.from(new Set(dados.map(d=>d.status).filter(Boolean))).sort();
  const ramos = Array.from(new Set(dados.map(d=>d.ramo).filter(Boolean))).sort();
  const segs = Array.from(new Set(dados.map(d=>d.seguradora).filter(Boolean))).sort();

  if(!state.statusSet.size){ // só popula 1x; depois mantém seleção do usuário
    sSel.innerHTML = sts.map(s=>`<option value="${s}">${s}</option>`).join("");
    state.statusSet = new Set(sts);
  }
  if(!state.ramoSet.size){
    rSel.innerHTML = ramos.map(s=>`<option value="${s}">${s}</option>`).join("");
    state.ramoSet = new Set(ramos);
  }
  if(!state.seguradoraSet.size){
    sgSel.innerHTML = segs.map(s=>`<option value="${s}">${s}</option>`).join("");
    state.seguradoraSet = new Set(segs);
  }
}

function filtrarMemoria(arr){
  const ag = $("#f-agencia").value;
  const rm = $("#f-rm").value;
  const status = new Set(multiSelectValues($("#f-status")));
  const ramo   = new Set(multiSelectValues($("#f-ramo")));
  const segur  = new Set(multiSelectValues($("#f-seguradora")));
  const tipo   = $("#f-tipo").value;
  const empresa= ($("#f-empresa").value || "").toLowerCase().trim();

  return arr.filter(d=>{
    if(ag && d.agenciaId !== ag) return false;
    if(rm && d.rmUid !== rm) return false;
    if(status.size && !status.has(d.status)) return false;
    if(ramo.size && !ramo.has(d.ramo)) return false;
    if(segur.size && !segur.has(d.seguradora)) return false;
    if(tipo && d.tipo !== tipo) return false;
    if(empresa && !(d.empresa||"").toLowerCase().includes(empresa)) return false;
    return true;
  });
}

// ------- Desenho -------
let charts = {};
function destroyCharts(){
  Object.values(charts).forEach(ch => { try{ ch.destroy(); }catch{} });
  charts = {};
}

function desenhar(){
  // KPIs + Tabela
  desenharKPIs();
  desenharTabela();

  // Gráficos
  destroyCharts();
  desenharChartStatus();
  desenharChartLinhasYoY();
  desenharChartRamo();
  desenharChartRM();
  desenharChartSeguradora();
}

// KPIs com YoY
function desenharKPIs(){
  const data = state.filtered;

  const totalPremio = sum(data, d=>d.premio);
  const qtd = data.length;
  const emitidos = data.filter(d=> isEmitido(d.status)).length;
  const conv = qtd ? (emitidos / qtd) : 0;
  const ticket = qtd ? (totalPremio / qtd) : 0;

  $("#kpi-premio").textContent = CFG.currency.format(totalPremio);
  $("#kpi-qtd").textContent = CFG.number.format(qtd);
  $("#kpi-emitidos").textContent = CFG.number.format(emitidos);
  $("#kpi-conversao").textContent = (conv*100).toFixed(1) + "%";
  $("#kpi-ticket").textContent = CFG.currency.format(ticket);

  // YoY deltas
  const yoy = $("#chk-yoy").checked;
  const diStr = $("#f-data-inicio").value;
  const dfStr = $("#f-data-fim").value;
  if(yoy && diStr && dfStr){
    const di = new Date(diStr);
    const df = new Date(dfStr);
    const diPrev = new Date(di); diPrev.setFullYear(diPrev.getFullYear()-1);
    const dfPrev = new Date(df); dfPrev.setFullYear(dfPrev.getFullYear()-1);

    const prev = state.raw.filter(d => d.data && d.data >= diPrev && d.data <= dfPrev);
    const prevFilt = filtrarMemoria(prev);

    const totalPremioPrev = sum(prevFilt, d=>d.premio);
    const qtdPrev = prevFilt.length;
    const emitPrev = prevFilt.filter(d=> isEmitido(d.status)).length;
    const convPrev = qtdPrev ? (emitPrev/qtdPrev) : 0;
    const ticketPrev = qtdPrev ? (totalPremioPrev/qtdPrev) : 0;

    setDelta($("#kpi-premio-delta"), pctDelta(totalPremio, totalPremioPrev));
    setDelta($("#kpi-qtd-delta"), pctDelta(qtd, qtdPrev));
    setDelta($("#kpi-emitidos-delta"), pctDelta(emitidos, emitPrev));
    setDelta($("#kpi-conversao-delta"), pctDelta(conv, convPrev));
    setDelta($("#kpi-ticket-delta"), pctDelta(ticket, ticketPrev));
  } else {
    ["premio","qtd","emitidos","conversao","ticket"].forEach(k=>{
      $(`#kpi-${k}-delta`).textContent = "";
    });
  }
}

function desenharTabela(){
  const tb = $("#tbody");
  tb.innerHTML = "";
  const data = state.filtered.slice().sort((a,b)=> (b.data?.getTime()||0) - (a.data?.getTime()||0));
  $("#lbl-count").textContent = data.length;

  const frag = document.createDocumentFragment();
  for(const d of data.slice(0, 2000)){ // proteção
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.data ? CFG.dateFmt(d.data) : "—"}</td>
      <td>${d.empresa || "—"}</td>
      <td class="hide-sm">${d.agenciaNome || (state.agenciaMap.get(d.agenciaId)||"—")}</td>
      <td>${d.rmNome || (state.rmMap.get(d.rmUid)||"—")}</td>
      <td><span class="badge">${d.status||"—"}</span></td>
      <td class="hide-sm">${d.ramo || "—"}</td>
      <td class="hide-sm">${d.seguradora || "—"}</td>
      <td>${CFG.currency.format(d.premio||0)}</td>
      <td class="hide-sm">${d.tipo || "—"}</td>
    `;
    frag.appendChild(tr);
  }
  tb.appendChild(frag);
}

function baseChartCfg(){
  return {
    plugins: [ChartDataLabels],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        datalabels: {
          formatter: (v, ctx)=>{
            if(Array.isArray(v)) return "";
            if(typeof v === "number" && v >= 1000) return CFG.number.format(Math.round(v));
            if(typeof v === "number") return Math.round(v);
            return "";
          },
          anchor: 'end',
          align: 'top',
          offset: 4,
          clamp: true
        },
        tooltip: {
          callbacks: {
            label: (ctx)=>{
              const y = ctx.parsed?.y ?? ctx.parsed;
              if(typeof y === "number") return ` ${CFG.currency.format(y)}`;
              return ` ${y}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true }
      }
    }
  };
}

function desenharChartStatus(){
  const data = state.filtered;
  const by = groupBy(data, d=> d.status || "Sem status");
  const labels = Array.from(by.keys());
  const counts = labels.map(l => by.get(l).length);

  $("#legend-status").textContent = `${labels.length} status`;

  const cfg = baseChartCfg();
  cfg.data = {
    labels,
    datasets: [{
      type: 'doughnut',
      data: counts
    }]
  };
  cfg.options.plugins.datalabels.formatter = (v)=> CFG.number.format(v);
  cfg.options.plugins.tooltip.callbacks.label = (ctx)=> ` ${ctx.label}: ${CFG.number.format(ctx.parsed)}`;
  charts.status = new Chart($("#chartStatus"), cfg);
}

function desenharChartLinhasYoY(){
  const diStr = $("#f-data-inicio").value;
  const dfStr = $("#f-data-fim").value;
  if(!diStr || !dfStr) return;

  const di = new Date(diStr);
  const df = new Date(dfStr);

  const year = di.getFullYear(); // considera ano do início
  const months = rangeMonths(year);

  const dataCurr = state.filtered.filter(d=> d.data && d.data.getFullYear() === year);
  const gCurr = new Map(months.map(m=>[m,0]));
  dataCurr.forEach(d=>{
    gCurr.set(monthKey(d.data), (gCurr.get(monthKey(d.data))||0) + (d.premio||0));
  });

  let monthsPrev = rangeMonths(year-1);
  const dataPrevRaw = state.raw.filter(d=> d.data && d.data.getFullYear() === (year-1));
  const dataPrev = filtrarMemoria(dataPrevRaw); // aplica filtros (exceto datas absolutas)
  const gPrev = new Map(monthsPrev.map(m=>[m,0]));
  dataPrev.forEach(d=>{
    gPrev.set(monthKey(d.data), (gPrev.get(monthKey(d.data))||0) + (d.premio||0));
  });

  $("#legend-linhas").textContent = `Ano ${year}${state.yoy?` vs ${year-1}`:""}`;

  const cfg = baseChartCfg();
  cfg.data = {
    labels: months.map(m=> m.split("-")[1]+"/"+m.split("-")[0].slice(-2)),
    datasets: [{
      label: String(year),
      type: 'line',
      data: months.map(m=> gCurr.get(m)||0),
      tension: .3
    }]
  };
  if(state.yoy){
    cfg.data.datasets.push({
      label: String(year-1),
      type: 'line',
      data: monthsPrev.map(m=> gPrev.get(m)||0),
      tension: .3
    });
  }
  cfg.options.plugins.datalabels.display = false;

  charts.linhas = new Chart($("#chartLinhas"), cfg);
}

function topEntries(mapOrObj, limit=10){
  const entries = Array.isArray(mapOrObj)
    ? mapOrObj
    : Array.from(Object.entries(mapOrObj instanceof Map ? Object.fromEntries(mapOrObj) : mapOrObj));
  return entries.sort((a,b)=> b[1]-a[1]).slice(0, limit);
}

function desenharChartRamo(){
  const data = state.filtered;
  const grp = {};
  data.forEach(d=>{
    const k = d.ramo || "—";
    grp[k] = (grp[k]||0) + (d.premio||0);
  });
  const top = topEntries(grp, 10);
  $("#legend-ramo").textContent = `${top.length} ramos (Top 10)`;

  const cfg = baseChartCfg();
  cfg.data = {
    labels: top.map(t=>t[0]),
    datasets: [{ type:'bar', data: top.map(t=> t[1]) }]
  };
  charts.ramo = new Chart($("#chartRamo"), cfg);
}

function desenharChartRM(){
  const data = state.filtered;
  const grp = {};
  data.forEach(d=>{
    const k = d.rmNome || "—";
    grp[k] = (grp[k]||0) + (d.premio||0);
  });
  const top = topEntries(grp, 10);
  $("#legend-rm").textContent = `${top.length} RMs (Top 10)`;

  const cfg = baseChartCfg();
  cfg.data = {
    labels: top.map(t=>t[0]),
    datasets: [{ type:'bar', data: top.map(t=> t[1]) }]
  };
  cfg.options.indexAxis = 'y';
  charts.rm = new Chart($("#chartRM"), cfg);
}

function desenharChartSeguradora(){
  const data = state.filtered;
  const grp = {};
  data.forEach(d=>{
    const k = d.seguradora || "—";
    grp[k] = (grp[k]||0) + (d.premio||0);
  });
  const arr = Object.entries(grp);
  $("#legend-seguradora").textContent = `${arr.length} seguradoras`;

  const cfg = baseChartCfg();
  cfg.data = {
    labels: arr.map(t=>t[0]),
    datasets: [{ type:'bar', data: arr.map(t=> t[1]) }]
  };
  charts.seguradora = new Chart($("#chartSeguradora"), cfg);
}

// ------- Exportar CSV -------
function exportarCSV(){
  const rows = [
    ["Data","Empresa","Agência","RM","Status","Ramo","Seguradora","Prêmio","Tipo"]
  ];
  for(const d of state.filtered){
    rows.push([
      d.data ? CFG.dateFmt(d.data) : "",
      d.empresa || "",
      d.agenciaNome || (state.agenciaMap.get(d.agenciaId)||""),
      d.rmNome || (state.rmMap.get(d.rmUid)||""),
      d.status || "",
      d.ramo || "",
      d.seguradora || "",
      String(d.premio || 0).replace(".",","),
      d.tipo || ""
    ]);
  }
  downloadCSV(`relatorio_${Date.now()}.csv`, rows);
}

// ------- Salvar / Carregar Vistas de Filtros -------
function getFilters(){
  return {
    di: $("#f-data-inicio").value,
    df: $("#f-data-fim").value,
    agencia: $("#f-agencia").value,
    rm: $("#f-rm").value,
    status: multiSelectValues($("#f-status")),
    ramo: multiSelectValues($("#f-ramo")),
    seguradora: multiSelectValues($("#f-seguradora")),
    tipo: $("#f-tipo").value,
    empresa: $("#f-empresa").value,
    yoy: $("#chk-yoy").checked
  };
}
function setFilters(f){
  if(!f) return;
  $("#f-data-inicio").value = f.di || "";
  $("#f-data-fim").value = f.df || "";
  $("#f-agencia").value = f.agencia || "";
  filtrarRMsPorAgencia();
  $("#f-rm").value = f.rm || "";

  function setMulti(sel, values){
    const map = new Set(values||[]);
    Array.from(sel.options).forEach(o=> o.selected = map.has(o.value));
  }
  setMulti($("#f-status"), f.status);
  setMulti($("#f-ramo"), f.ramo);
  setMulti($("#f-seguradora"), f.seguradora);

  $("#f-tipo").value = f.tipo || "";
  $("#f-empresa").value = f.empresa || "";
  $("#chk-yoy").checked = !!f.yoy;
}
function saveView(){
  const name = prompt("Nome para salvar esta combinação de filtros:");
  if(!name) return;
  const key = `relatorios:view:${name}`;
  localStorage.setItem(key, JSON.stringify(getFilters()));
  alert("Vista salva!");
}
function loadView(){
  const keys = Object.keys(localStorage).filter(k=> k.startsWith("relatorios:view:"));
  if(!keys.length){ alert("Nenhuma vista salva."); return; }
  const name = prompt(`Qual vista carregar?\n\n${keys.map(k=> "- "+k.replace("relatorios:view:","")).join("\n")}`);
  if(!name) return;
  const key = `relatorios:view:${name}`;
  const v = localStorage.getItem(key);
  if(!v){ alert("Vista não encontrada."); return; }
  setFilters(JSON.parse(v));
  aplicarFiltros();
}
