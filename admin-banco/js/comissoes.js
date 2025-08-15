// ================= Firebase boot =================
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

const COL_COTACOES   = db.collection("cotacoes-gerentes");
const COL_USUARIOS   = db.collection("usuarios_banco");
const COL_AGENCIAS   = db.collection("agencias_banco");
const COL_COMISSOES  = db.collection("comissoes_negocios"); // < NOVA

// ================ Estado global ==================
let usuarioAtual = null;
let isAdmin      = false;

let negociosBase     = [];   // base vinda de "Negócio Emitido"
let comissoesCache   = new Map(); // cotacaoId -> doc comissão
let mapaRM           = new Map(); // rmUid -> { nome, agenciaId }
let mapaAgencias     = new Map(); // agenciaId -> "Nome — Banco / Cidade - UF"

let setRamos   = new Set();
let setAgNomes = new Set();

// ================ Helpers ========================
const $ = (id) => document.getElementById(id);
const fmtBRL = new Intl.NumberFormat("pt-BR",{ style:"currency", currency:"BRL" });
const money  = (n) => fmtBRL.format(Number(n||0));
const norm   = (s) => (s||"").toString().normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();

function parsePremio(val){
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const n = String(val)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const f = parseFloat(n);
  return isNaN(f) ? 0 : f;
}
function toISODate(v){
  try{
    if (!v) return "";
    if (typeof v === "string") {
      const d = new Date(v);
      return isNaN(+d) ? "" : d.toISOString().slice(0,10);
    }
    if (v instanceof Date) return v.toISOString().slice(0,10);
    if (v.toDate) return v.toDate().toISOString().slice(0,10);
  }catch(_){}
  return "";
}
function br(iso){ return iso ? iso.split("-").reverse().join("/") : "-"; }
function addMonths(date, months){
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  // corrige finais de mês (31 -> 30/28)
  if (date.getDate() !== d.getDate()) d.setDate(0);
  return d;
}

// ============== Boot (auth + carregamentos) ==============
window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (!user) return (location.href = "login.html");
    usuarioAtual = user;

    // Admin simples por e-mail (ajuste se preferir por perfil)
    isAdmin = (user.email === "patrick@retornoseguros.com.br");
    if (!isAdmin) {
      alert("A página de Comissões é exclusiva para Administrador.");
      return (location.href = "painel.html");
    }

    await Promise.all([
      carregarNegociosEmitidos(),  // base
      carregarComissoesExistentes()
    ]);
    montarFiltros();
    aplicarFiltros();

    $("btnAplicar")?.addEventListener("click", aplicarFiltros);
    $("btnLimpar")?.addEventListener("click", () => {
      ["fDataIni","fDataFim","fRm","fAgencia","fRamo","fEmpresa"].forEach(id=>{
        const el=$(id); if (el) el.value="";
      });
      aplicarFiltros();
    });
  });
});

// =================== Carregadores ===================
async function carregarNegociosEmitidos(){
  negociosBase = []; mapaRM.clear(); mapaAgencias.clear(); setRamos.clear(); setAgNomes.clear();

  // 1) Buscar cotações com status "Negócio Emitido"
  const docs = (await COL_COTACOES.where("status","==","Negócio Emitido").get()).docs;

  const rmUids = new Set();
  docs.forEach(d => {
    const c = d.data() || {};
    const item = {
      id: d.id,
      empresaId:   c.empresaId || "",
      empresaNome: c.empresaNome || "-",
      ramo:        c.ramo || "-",
      rmNome:      c.rmNome || "-",
      rmUid:       c.rmUid || c.rmId || null,
      agenciaId:   c.agenciaId || "",
      premio:      parsePremio(c.premioLiquido ?? c.valorNegocio ?? c.valorDesejado ?? c.valorProposta ?? c.valor),
      inicioISO:   toISODate(c.inicioVigencia),
      fimISO:      toISODate(c.fimVigencia)
    };
    negociosBase.push(item);
    setRamos.add(item.ramo);
    if (item.rmUid) rmUids.add(item.rmUid);
  });

  // 2) Resolver RM -> agência
  await Promise.all(Array.from(rmUids).map(async uid => {
    try {
      const snap = await COL_USUARIOS.doc(uid).get();
      const u = snap.exists ? (snap.data() || {}) : {};
      mapaRM.set(uid, { nome: u.nome || "", agenciaId: u.agenciaId || "" });
    } catch {
      mapaRM.set(uid, { nome: "", agenciaId: "" });
    }
  }));

  // 3) Carregar rótulos de agência
  const agIds = Array.from(new Set([
    ...negociosBase.map(x => x.agenciaId).filter(Boolean),
    ...Array.from(mapaRM.values()).map(v => v.agenciaId).filter(Boolean)
  ]));
  await Promise.all(agIds.map(async id => {
    if (!id || mapaAgencias.has(id)) return;
    try {
      const snap = await COL_AGENCIAS.doc(id).get();
      const a = snap.exists ? (snap.data() || {}) : {};
      const nome   = (a.nome || "(Sem nome)");
      const banco  = a.banco ? ` — ${a.banco}` : "";
      const cidade = (a.Cidade || a.cidade || "");
      const uf     = (a.estado || a.UF || "");
      const label  = `${nome}${banco}${cidade?` / ${cidade}`:""}${uf?` - ${uf.toUpperCase()}`:""}`;
      mapaAgencias.set(id, label);
    } catch {
      mapaAgencias.set(id, id);
    }
  }));

  // 4) Popular set de nomes de agências (para filtro)
  negociosBase.forEach(d => {
    const agId = d.agenciaId || (mapaRM.get(d.rmUid)?.agenciaId || "");
    const nome = agId ? (mapaAgencias.get(agId) || agId) : "";
    if (nome) setAgNomes.add(nome);
  });
}

async function carregarComissoesExistentes(){
  comissoesCache.clear();
  const snap = await COL_COMISSOES.get();
  snap.forEach(doc => comissoesCache.set(doc.id, { id: doc.id, ...(doc.data()||{}) }));
}

// ====================== Filtros ======================
function montarFiltros(){
  const selRm = $("fRm");
  selRm.innerHTML = `<option value="">Todos</option>`;
  const vistos = new Set();
  negociosBase.forEach(n => {
    const chave = n.rmUid || n.rmNome;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    selRm.insertAdjacentHTML("beforeend",
      `<option value="${chave}">${n.rmNome || n.rmUid || "RM"}</option>`);
  });

  const selAg = $("fAgencia");
  selAg.innerHTML = `<option value="">Todas</option>`;
  Array.from(setAgNomes).sort((a,b)=>a.localeCompare(b,"pt-BR"))
    .forEach(n => selAg.insertAdjacentHTML("beforeend", `<option value="${n}">${n}</option>`));

  const selRamo = $("fRamo");
  selRamo.innerHTML = `<option value="">Todos</option>`;
  Array.from(setRamos).sort((a,b)=>a.localeCompare(b,"pt-BR"))
    .forEach(r => selRamo.insertAdjacentHTML("beforeend", `<option value="${r}">${r}</option>`));
}

function aplicarFiltros(){
  const ini = $("fDataIni")?.value || "";
  const fim = $("fDataFim")?.value || "";
  const rm  = $("fRm")?.value || "";
  const ag  = $("fAgencia")?.value || "";
  const ra  = $("fRamo")?.value || "";
  const em  = norm($("fEmpresa")?.value || "");

  const lista = negociosBase.filter(n => {
    if (ini && (!n.inicioISO || n.inicioISO < ini)) return false;
    if (fim && (!n.inicioISO || n.inicioISO > fim)) return false;
    if (rm) {
      if (n.rmUid) { if (n.rmUid !== rm) return false; }
      else if (norm(n.rmNome) !== norm(rm)) return false;
    }
    if (ag) {
      const agId = n.agenciaId || (mapaRM.get(n.rmUid)?.agenciaId || "");
      const nome = agId ? (mapaAgencias.get(agId) || agId) : "";
      if (nome !== ag) return false;
    }
    if (ra && n.ramo !== ra) return false;
    if (em && !norm(n.empresaNome).includes(em)) return false;
    return true;
  });

  renderLista(lista);
}

// ===================== Listagem ======================
function renderLista(lista){
  const tbody = $("listaComissoes");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!lista.length){
    tbody.innerHTML = `<tr><td colspan="8" class="muted">Sem resultados para os filtros atuais.</td></tr>`;
    $("infoQtd").textContent = "0 negócio(s)";
    $("totalPremio").textContent   = `Prêmio: ${money(0)}`;
    $("totalComissao").textContent = `Comissão Base: ${money(0)}`;
    return;
  }

  let somaPremio = 0, somaBase = 0;

  for (const n of lista){
    const agId = n.agenciaId || (mapaRM.get(n.rmUid)?.agenciaId || "");
    const agLabel = agId ? (mapaAgencias.get(agId) || agId) : "-";
    somaPremio += n.premio;

    const cfg = comissoesCache.get(n.id);
    const base = cfg ? Number(cfg.baseComissao || 0) : 0;
    somaBase += base;

    const status = cfg
      ? `<span class="pill">${cfg.frequencia==="M"?"Mensal":"Anual"} — ${cfg.parcelas?.filter(p=>p.pago).length||0}/${cfg.parcelas?.length||0} pagos</span>`
      : `<span class="muted">Não configurado</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${n.empresaNome}</td>
      <td>${n.ramo}</td>
      <td>${n.rmNome || "-"}</td>
      <td>${agLabel}</td>
      <td>${money(n.premio)}</td>
      <td>${base ? money(base) : "-" } ${status}</td>
      <td>${br(n.inicioISO)} — ${br(n.fimISO)}</td>
      <td><a href="#" class="link" onclick="abrirDrawer('${n.id}')">Configurar Comissão</a></td>
    `;
    tbody.appendChild(tr);
  }

  $("infoQtd").textContent = `${lista.length} negócio(s)`;
  $("totalPremio").textContent   = `Prêmio: ${money(somaPremio)}`;
  $("totalComissao").textContent = `Comissão Base: ${money(somaBase)}`;
}

// =================== Drawer / Cálculo ===================
function abrirDrawer(cotacaoId){
  const n = negociosBase.find(x => x.id === cotacaoId);
  if (!n) return;

  $("dw-cotacaoId").value = cotacaoId;
  $("dw-empresa").textContent = n.empresaNome;

  const agId = n.agenciaId || (mapaRM.get(n.rmUid)?.agenciaId || "");
  const agLabel = agId ? (mapaAgencias.get(agId) || agId) : "-";
  $("dw-meta").textContent = `${n.ramo} • RM ${n.rmNome || "-"} • ${agLabel} • Prêmio ${money(n.premio)}`;

  const cfg = comissoesCache.get(cotacaoId);
  $("dw-comissaoPct").value = cfg?.comissaoPct ?? "";
  $("dw-impostoPct").value  = cfg?.impostoPct  ?? 0;
  $("dw-rmPct").value       = cfg?.rmPct       ?? 0;
  $("dw-gfPct").value       = cfg?.gfPct       ?? 0;
  $("dw-frequencia").value  = cfg?.frequencia  ?? "A";
  $("dw-obs").value         = cfg?.obs         ?? "";

  atualizarCalculos();
  $("drawer").classList.add("open");
}
function fecharDrawer(){ $("drawer").classList.remove("open"); }

// *** Regra pedida: imposto primeiro; RM/GF sobre líquida ***
function atualizarCalculos(){
  const cotacaoId = $("dw-cotacaoId").value;
  const n = negociosBase.find(x => x.id === cotacaoId);
  if (!n) return;

  const pct  = Number($("dw-comissaoPct").value || 0);
  const imp  = Number($("dw-impostoPct").value  || 0);
  const rm   = Number($("dw-rmPct").value       || 0);
  const gf   = Number($("dw-gfPct").value       || 0);
  const freq = $("dw-frequencia").value || "A";

  // 1) Comissão geral
  const baseComissao = n.premio * (pct/100);

  // 2) Imposto sobre a COMISSÃO GERAL
  const vImp = baseComissao * (imp/100);

  // 3) Comissão LÍQUIDA após imposto
  const comissaoLiquida = baseComissao - vImp;

  // 4) RM e GF percentuais sobre a LÍQUIDA
  const vRM = comissaoLiquida * (rm/100);
  const vGF = comissaoLiquida * (gf/100);

  // 5) Corretora recebe o restante da LÍQUIDA
  const vCor = comissaoLiquida - vRM - vGF;

  // Totais
  $("boxTotais").innerHTML = `
    <div class="grid2">
      <div><strong>Comissão Geral:</strong> ${money(baseComissao)}</div>
      <div><strong>Imposto:</strong> ${money(vImp)}</div>
      <div><strong>Comissão Líquida:</strong> ${money(comissaoLiquida)}</div>
      <div><strong>RM:</strong> ${money(vRM)}</div>
      <div><strong>GF:</strong> ${money(vGF)}</div>
      <div><strong>Corretora:</strong> ${money(vCor)}</div>
      <div><span class="badge">${freq==="M"?"Mensal (12x)":"Anual (1x)"}</span></div>
    </div>
  `;

  // Parcelas
  const nParc = (freq === "M") ? 12 : 1;
  const linhas = [];
  for (let i=0;i<nParc;i++){
    const d0 = n.inicioISO ? new Date(n.inicioISO+"T00:00:00") : new Date();
    const dt = (freq==="M") ? addMonths(d0, i) : d0;
    const baseParc = baseComissao   / nParc;
    const impParc  = vImp           / nParc;
    const liqParc  = comissaoLiquida/ nParc;
    const rmParc   = vRM            / nParc;
    const gfParc   = vGF            / nParc;
    const corParc  = vCor            / nParc;
    linhas.push({
      i: i+1,
      competencia: new Date(dt.getFullYear(), dt.getMonth(), 1),
      base: baseParc,
      imposto: impParc,
      liquida: liqParc,
      rm: rmParc,
      gf: gfParc,
      cor: corParc
    });
  }
  // Ajuste de centavos na última parcela
  function ajustar(lista, chave, total){
    const soma = lista.reduce((a,b)=> a + b[chave], 0);
    const delta = Number((total - soma).toFixed(2));
    if (Math.abs(delta) >= 0.01) lista[lista.length-1][chave] += delta;
  }
  ajustar(linhas, "base",    baseComissao);
  ajustar(linhas, "imposto", vImp);
  ajustar(linhas, "liquida", comissaoLiquida);
  ajustar(linhas, "rm",      vRM);
  ajustar(linhas, "gf",      vGF);
  ajustar(linhas, "cor",     vCor);

  const tb = $("dw-parcelas");
  tb.innerHTML = "";
  const cfgExist = comissoesCache.get(cotacaoId);
  linhas.forEach((p, idx) => {
    const pago = cfgExist?.parcelas?.[idx]?.pago || false;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.i}</td>
      <td>${("0"+(p.competencia.getMonth()+1)).slice(-2)}/${p.competencia.getFullYear()}</td>
      <td>${money(p.base)}</td>
      <td>${money(p.imposto)}</td>
      <td>${money(p.rm)}</td>
      <td>${money(p.gf)}</td>
      <td>${money(p.cor)}</td>
      <td><input type="checkbox" ${pago?"checked":""} onchange="togglePago(${idx}, this.checked)"></td>
    `;
    tb.appendChild(tr);
  });

  // Guarda rascunho
  window._draftCalculo = {
    baseComissao,
    comissaoLiquida,
    vImp, vRM, vGF, vCor,
    freq,
    linhas
  };
}
function togglePago(index, checked){
  if (!window._parcelasPagasTemp) window._parcelasPagasTemp = {};
  window._parcelasPagasTemp[index] = !!checked;
}

// ==================== Persistência ====================
async function salvarComissao(){
  if (!isAdmin) return alert("Apenas Admin.");

  const cotacaoId = $("dw-cotacaoId").value;
  const n = negociosBase.find(x => x.id === cotacaoId);
  if (!n) return;

  const pct  = Number($("dw-comissaoPct").value || 0);
  const imp  = Number($("dw-impostoPct").value  || 0);
  const rm   = Number($("dw-rmPct").value       || 0);
  const gf   = Number($("dw-gfPct").value       || 0);
  const freq = $("dw-frequencia").value || "A";
  const obs  = $("dw-obs").value || "";

  const calc = window._draftCalculo;
  if (!calc) return alert("Defina os percentuais para gerar as parcelas.");

  // Parcelas para gravar
  const parcelas = calc.linhas.map((p,idx)=>({
    numero: idx+1,
    competenciaISO: p.competencia.toISOString().slice(0,10),
    base:      Number(p.base.toFixed(2)),
    imposto:   Number(p.imposto.toFixed(2)),
    liquida:   Number(p.liquida.toFixed(2)),
    rm:        Number(p.rm.toFixed(2)),
    gf:        Number(p.gf.toFixed(2)),
    corretora: Number(p.cor.toFixed(2)),
    pago: (window._parcelasPagasTemp && window._parcelasPagasTemp[idx]) || false,
    pagoEm: null
  }));

  const payload = {
    cotacaoId,
    empresaId: n.empresaId,
    empresaNome: n.empresaNome,
    rmUid: n.rmUid || "",
    rmNome: n.rmNome || "",
    agenciaId: n.agenciaId || (mapaRM.get(n.rmUid)?.agenciaId || ""),

    premio: Number(n.premio || 0),

    comissaoPct: pct,
    impostoPct:  imp,
    rmPct:       rm,
    gfPct:       gf,
    frequencia:  freq,

    baseComissao:    Number(calc.baseComissao.toFixed(2)),
    comissaoLiquida: Number(calc.comissaoLiquida.toFixed(2)),
    valores: {
      imposto:   Number(calc.vImp.toFixed(2)),
      rm:        Number(calc.vRM.toFixed(2)),
      gf:        Number(calc.vGF.toFixed(2)),
      corretora: Number(calc.vCor.toFixed(2))
    },

    inicioVigenciaISO: n.inicioISO || "",
    fimVigenciaISO:    n.fimISO    || "",

    parcelas,
    obs,

    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  // cria se não existir
  if (!comissoesCache.has(cotacaoId)) {
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  }

  await COL_COMISSOES.doc(cotacaoId).set(payload, { merge: true });
  comissoesCache.set(cotacaoId, payload);

  alert("Comissão salva.");
  fecharDrawer();
  aplicarFiltros();
}

// ================ Exports para o HTML ================
window.abrirDrawer = abrirDrawer;
window.fecharDrawer = fecharDrawer;
window.atualizarCalculos = atualizarCalculos;
window.salvarComissao = salvarComissao;
window.togglePago = togglePago;
