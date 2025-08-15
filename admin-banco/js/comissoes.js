// ---------- Firebase ----------
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

const colCotacoes  = db.collection("cotacoes-gerentes");
const colUsuarios  = db.collection("usuarios_banco");
const colAgencias  = db.collection("agencias_banco");
const colComissoes = db.collection("comissoes_negocios");   // << NOVA COLEÇÃO

// ---------- Estado ----------
let isAdmin = false;
let usuarioAtual = null;

let docsBrutos = [];      // negócios emitidos (base)
let mapaRM = new Map();   // rmUid -> { nome, agenciaId }
let mapaAg = new Map();   // agenciaId -> label amigável
let ramosSet = new Set();
let agenciasSet = new Set();

let comissoesMap = new Map(); // cotacaoId -> doc de comissão (para preencher status/painel)

// ---------- Utils ----------
const fmtBRL = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const money  = n => fmtBRL.format(Number(n||0));
const norm   = s => (s||"").toString().normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();

function parsePremio(val){
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const n = String(val).replace(/[^\d,.-]/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".");
  const f = parseFloat(n); return isNaN(f) ? 0 : f;
}
function toISODate(v){
  try{
    if (!v) return "";
    if (typeof v==="string") { const d=new Date(v); if(!isNaN(+d)) return d.toISOString().slice(0,10); return ""; }
    if (v.toDate) { const d=v.toDate(); return d.toISOString().slice(0,10); }
    if (v instanceof Date) return v.toISOString().slice(0,10);
  }catch(_){}
  return "";
}
function br(iso){ return iso ? iso.split("-").reverse().join("/") : "-"; }
function addMonths(date, months){
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  // corrigir final de mês
  if (date.getDate() !== d.getDate()) d.setDate(0);
  return d;
}

// ---------- Boot ----------
window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (!user) { location.href="login.html"; return; }
    usuarioAtual = user;
    // admin por email (igual ao seu padrão atual)
    isAdmin = (user.email === "patrick@retornoseguros.com.br");
    if (!isAdmin) {
      alert("A página de Comissões é exclusiva para Administrador.");
      location.href="painel.html";
      return;
    }

    await Promise.all([
      carregarNegociosEmitidos(),
      carregarComissoesExistentes(),
    ]);
    montarFiltros();
    aplicarFiltros();

    document.getElementById("btnAplicar")?.addEventListener("click", aplicarFiltros);
    document.getElementById("btnLimpar")?.addEventListener("click", ()=>{
      ['fDataIni','fDataFim','fRm','fAgencia','fRamo','fEmpresa'].forEach(id=>{
        const el=document.getElementById(id); if(el) el.value="";
      });
      aplicarFiltros();
    });
  });
});

// ---------- Carregamento base ----------
async function carregarNegociosEmitidos(){
  docsBrutos = []; mapaRM.clear(); mapaAg.clear(); ramosSet.clear(); agenciasSet.clear();

  // 1) cotações emitidas
  const docs = (await colCotacoes.where("status","==","Negócio Emitido").get()).docs;

  const rmUids = new Set();
  docs.forEach(d=>{
    const c = d.data()||{};
    const item = {
      id: d.id,
      empresaId: c.empresaId || "",
      empresaNome: c.empresaNome || "-",
      ramo: c.ramo || "-",
      rmNome: c.rmNome || "-",
      rmUid:  c.rmUid || c.rmId || null,
      agenciaId: c.agenciaId || "",
      premio: parsePremio(c.premioLiquido ?? c.valorNegocio ?? c.valorDesejado ?? c.valorProposta ?? c.valor),
      inicioISO: toISODate(c.inicioVigencia),
      fimISO:    toISODate(c.fimVigencia),
    };
    docsBrutos.push(item);
    ramosSet.add(item.ramo);
    if (item.rmUid) rmUids.add(item.rmUid);
  });

  // 2) resolver RM -> agência
  await Promise.all(Array.from(rmUids).map(async uid=>{
    try{
      const us = await colUsuarios.doc(uid).get();
      const u = us.exists ? (us.data()||{}) : {};
      mapaRM.set(uid, { nome:u.nome||"", agenciaId:u.agenciaId||"" });
    }catch(_){ mapaRM.set(uid,{nome:"",agenciaId:""}); }
  }));

  // 3) nomes de agências (rótulo amigável)
  const agIds = Array.from(new Set([
    ...docsBrutos.map(x=>x.agenciaId).filter(Boolean),
    ...Array.from(mapaRM.values()).map(x=>x.agenciaId).filter(Boolean),
  ]));
  await Promise.all(agIds.map(async id=>{
    if (!id || mapaAg.has(id)) return;
    try{
      const ag = await colAgencias.doc(id).get();
      const a  = ag.exists ? (ag.data()||{}) : {};
      const nome   = (a.nome || "(Sem nome)");
      const banco  = a.banco ? ` — ${a.banco}` : "";
      const cidade = (a.Cidade || a.cidade || "");
      const uf     = (a.estado || a.UF || "");
      const rotulo = `${nome}${banco}${cidade?` / ${cidade}`:""}${uf?` - ${uf.toUpperCase()}`:""}`;
      mapaAg.set(id, rotulo);
    }catch(_){ mapaAg.set(id,id); }
  }));

  // 4) set nomes p/ filtro
  docsBrutos.forEach(d=>{
    const agId = d.agenciaId || (mapaRM.get(d.rmUid)?.agenciaId||"");
    const agNome = agId ? (mapaAg.get(agId) || agId) : "";
    if (agNome) agenciasSet.add(agNome);
  });
}

async function carregarComissoesExistentes(){
  // puxamos todos para montar chips de status
  const snap = await colComissoes.get();
  snap.forEach(doc => comissoesMap.set(doc.id, { id: doc.id, ...(doc.data()||{}) }));
}

// ---------- Filtros ----------
function montarFiltros(){
  const fRm = document.getElementById('fRm');
  fRm.innerHTML = `<option value="">Todos</option>`;
  const vistos = new Set();
  docsBrutos.forEach(d=>{
    const chave = d.rmUid || d.rmNome;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    const label = d.rmNome || d.rmUid || "RM";
    fRm.insertAdjacentHTML('beforeend', `<option value="${chave}">${label}</option>`);
  });

  const fAg = document.getElementById('fAgencia');
  fAg.innerHTML = `<option value="">Todas</option>`;
  Array.from(agenciasSet).sort((a,b)=>a.localeCompare(b,'pt-BR'))
    .forEach(nome => fAg.insertAdjacentHTML('beforeend', `<option value="${nome}">${nome}</option>`));

  const fRamo = document.getElementById('fRamo');
  fRamo.innerHTML = `<option value="">Todos</option>`;
  Array.from(ramosSet).sort((a,b)=>a.localeCompare(b,'pt-BR'))
    .forEach(r => fRamo.insertAdjacentHTML('beforeend', `<option value="${r}">${r}</option>`));
}

function aplicarFiltros(){
  const ini = document.getElementById('fDataIni')?.value || '';
  const fim = document.getElementById('fDataFim')?.value || '';
  const rm  = document.getElementById('fRm')?.value || '';
  const ag  = document.getElementById('fAgencia')?.value || '';
  const ram = document.getElementById('fRamo')?.value || '';
  const emp = norm(document.getElementById('fEmpresa')?.value || '');

  const lista = docsBrutos.filter(d=>{
    if (ini && (!d.inicioISO || d.inicioISO < ini)) return false;
    if (fim && (!d.inicioISO || d.inicioISO > fim)) return false;
    if (rm){
      if (d.rmUid){ if (d.rmUid !== rm) return false; }
      else if (norm(d.rmNome) !== norm(rm)) return false;
    }
    if (ag){
      // compara com nome amigável
      const agId   = d.agenciaId || (mapaRM.get(d.rmUid)?.agenciaId||"");
      const agNome = agId ? (mapaAg.get(agId) || agId) : "";
      if (agNome !== ag) return false;
    }
    if (ram && d.ramo !== ram) return false;
    if (emp && !norm(d.empresaNome).includes(emp)) return false;
    return true;
  });

  renderLista(lista);
}

// ---------- Lista ----------
function renderLista(lista){
  const tbody = document.getElementById('listaComissoes');
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!lista.length){
    tbody.innerHTML = `<tr><td colspan="8" class="muted">Sem resultados para os filtros atuais.</td></tr>`;
    document.getElementById('infoQtd').textContent = "0 negócio(s)";
    document.getElementById('totalPremio').textContent   = `Prêmio: ${money(0)}`;
    document.getElementById('totalComissao').textContent = `Comissão Base: ${money(0)}`;
    return;
  }

  let somaPremio = 0, somaComissaoBase = 0;

  for (const d of lista){
    const agId = d.agenciaId || (mapaRM.get(d.rmUid)?.agenciaId||"");
    const agNome = agId ? (mapaAg.get(agId) || agId) : "-";
    somaPremio += d.premio;

    const cfg = comissoesMap.get(d.id);
    const base = cfg ? Number(cfg.baseComissao||0) : 0;
    somaComissaoBase += base;

    const status = cfg
      ? `<span class="pill">${cfg.frequencia==="M"?"Mensal":"Anual"} — ${cfg.parcelas?.filter(p=>p.pago).length||0}/${cfg.parcelas?.length||0} pagos</span>`
      : `<span class="muted">Não configurado</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.empresaNome}</td>
      <td>${d.ramo}</td>
      <td>${d.rmNome||"-"}</td>
      <td>${agNome}</td>
      <td>${money(d.premio)}</td>
      <td>${base?money(base):"-"} ${status}</td>
      <td>${br(d.inicioISO)} — ${br(d.fimISO)}</td>
      <td><a href="#" class="link" onclick="abrirDrawer('${d.id}')">Configurar Comissão</a></td>
    `;
    tbody.appendChild(tr);
  }

  document.getElementById('infoQtd').textContent = `${lista.length} negócio(s)`;
  document.getElementById('totalPremio').textContent   = `Prêmio: ${money(somaPremio)}`;
  document.getElementById('totalComissao').textContent = `Comissão Base: ${money(somaComissaoBase)}`;
}

// ---------- Drawer ----------
function abrirDrawer(cotacaoId){
  const base = docsBrutos.find(x=>x.id===cotacaoId);
  if (!base) return;

  // header
  document.getElementById("dw-cotacaoId").value = cotacaoId;
  document.getElementById("dw-empresa").textContent = base.empresaNome;
  const agId = base.agenciaId || (mapaRM.get(base.rmUid)?.agenciaId||"");
  const agNome = agId ? (mapaAg.get(agId) || agId) : "-";
  document.getElementById("dw-meta").textContent = `${base.ramo} • RM ${base.rmNome||"-"} • ${agNome} • Prêmio ${money(base.premio)}`;

  // preencher se já houver doc
  const cfg = comissoesMap.get(cotacaoId);
  document.getElementById("dw-comissaoPct").value = cfg?.comissaoPct ?? "";
  document.getElementById("dw-impostoPct").value  = cfg?.impostoPct  ?? 0;
  document.getElementById("dw-rmPct").value       = cfg?.rmPct       ?? 0;
  document.getElementById("dw-gfPct").value       = cfg?.gfPct       ?? 0;
  document.getElementById("dw-frequencia").value  = cfg?.frequencia  ?? "A";
  document.getElementById("dw-obs").value         = cfg?.obs         ?? "";

  atualizarCalculos(); // gera totais + parcelas
  document.getElementById("drawer").classList.add("open");
}
function fecharDrawer(){ document.getElementById("drawer").classList.remove("open"); }

// recalcula totais/parcelas (somente UI)
function atualizarCalculos(){
  const cotacaoId = document.getElementById("dw-cotacaoId").value;
  const base      = docsBrutos.find(x=>x.id===cotacaoId);
  if (!base) return;

  const pct  = Number(document.getElementById("dw-comissaoPct").value||0);
  const imp  = Number(document.getElementById("dw-impostoPct").value||0);
  const rm   = Number(document.getElementById("dw-rmPct").value||0);
  const gf   = Number(document.getElementById("dw-gfPct").value||0);
  const freq = document.getElementById("dw-frequencia").value || "A";

  const comissaoBase = base.premio * (pct/100); // prêmio x %
  const vImp = comissaoBase * (imp/100);
  const vRM  = comissaoBase * (rm/100);
  const vGF  = comissaoBase * (gf/100);
  const vCor = comissaoBase - vImp - vRM - vGF;

  // totais
  document.getElementById("boxTotais").innerHTML = `
    <div class="grid2">
      <div><strong>Comissão Base:</strong> ${money(comissaoBase)}</div>
      <div><strong>Imposto:</strong> ${money(vImp)}</div>
      <div><strong>RM:</strong> ${money(vRM)}</div>
      <div><strong>GF:</strong> ${money(vGF)}</div>
      <div><strong>Corretora:</strong> ${money(vCor)}</div>
      <div><span class="badge">${freq==="M"?"Mensal (12x)":"Anual (1x)"}</span></div>
    </div>
  `;

  // parcelas
  const n = (freq==="M") ? 12 : 1;
  const linhas = [];
  for (let i=0;i<n;i++){
    const d0 = base.inicioISO ? new Date(base.inicioISO+"T00:00:00") : new Date();
    const dt = (freq==="M") ? addMonths(d0, i) : d0;
    const baseParc = comissaoBase / n;
    const impParc  = vImp / n;
    const rmParc   = vRM / n;
    const gfParc   = vGF / n;
    const corParc  = vCor / n;
    linhas.push({i:i+1, competencia: new Date(dt.getFullYear(), dt.getMonth(), 1), base:baseParc, imp:impParc, rm:rmParc, gf:gfParc, cor:corParc});
  }
  // ajustar centavos na última parcela pra fechar exato
  function ajustar(lista, chave, total){
    const soma = lista.reduce((a,b)=>a + b[chave], 0);
    const delta = Number((total - soma).toFixed(2));
    if (Math.abs(delta) >= 0.01) {
      lista[lista.length-1][chave] += delta;
    }
  }
  ajustar(linhas, "base", comissaoBase);
  ajustar(linhas, "imp",  vImp);
  ajustar(linhas, "rm",   vRM);
  ajustar(linhas, "gf",   vGF);
  ajustar(linhas, "cor",  vCor);

  const tb = document.getElementById("dw-parcelas");
  tb.innerHTML = "";
  const cfgExist = comissoesMap.get(cotacaoId);

  linhas.forEach((p,idx)=>{
    const pago = cfgExist?.parcelas?.[idx]?.pago || false;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.i}</td>
      <td>${("0"+(p.competencia.getMonth()+1)).slice(-2)}/${p.competencia.getFullYear()}</td>
      <td>${money(p.base)}</td>
      <td>${money(p.imp)}</td>
      <td>${money(p.rm)}</td>
      <td>${money(p.gf)}</td>
      <td>${money(p.cor)}</td>
      <td><input type="checkbox" ${pago?"checked":""} onchange="togglePago(${idx}, this.checked)"></td>
    `;
    tb.appendChild(tr);
  });

  // guarda temporário no estado do drawer para salvar
  window._draftCalculo = { comissaoBase, vImp, vRM, vGF, vCor, freq, linhas };
}

function togglePago(index, checked){
  // apenas marca visualmente; persistimos no salvar ou em salvarParcelaPago
  if (!window._parcelasPagasTemp) window._parcelasPagasTemp = {};
  window._parcelasPagasTemp[index] = !!checked;
}

// ---------- Persistência ----------
async function salvarComissao(){
  if (!isAdmin) return alert("Apenas Admin.");

  const cotacaoId = document.getElementById("dw-cotacaoId").value;
  const base = docsBrutos.find(x=>x.id===cotacaoId);
  if (!base) return;

  const pct  = Number(document.getElementById("dw-comissaoPct").value||0);
  const imp  = Number(document.getElementById("dw-impostoPct").value||0);
  const rm   = Number(document.getElementById("dw-rmPct").value||0);
  const gf   = Number(document.getElementById("dw-gfPct").value||0);
  const freq = document.getElementById("dw-frequencia").value || "A";
  const obs  = document.getElementById("dw-obs").value || "";

  const calc = window._draftCalculo;
  if (!calc) return alert("Defina os percentuais para gerar as parcelas.");

  // monta parcelas
  const parcelas = calc.linhas.map((p,idx)=>({
    numero: idx+1,
    competenciaISO: p.competencia.toISOString().slice(0,10),
    base: Number(p.base.toFixed(2)),
    imposto: Number(p.imp.toFixed(2)),
    rm: Number(p.rm.toFixed(2)),
    gf: Number(p.gf.toFixed(2)),
    corretora: Number(p.cor.toFixed(2)),
    pago: (window._parcelasPagasTemp && window._parcelasPagasTemp[idx]) || false,
    pagoEm: null
  }));

  const payload = {
    cotacaoId,
    empresaId: base.empresaId,
    empresaNome: base.empresaNome,
    rmUid: base.rmUid || "",
    rmNome: base.rmNome || "",
    agenciaId: base.agenciaId || (mapaRM.get(base.rmUid)?.agenciaId || ""),
    premio: Number(base.premio||0),
    comissaoPct: pct,
    impostoPct: imp,
    rmPct: rm,
    gfPct: gf,
    frequencia: freq,
    baseComissao: Number(calc.comissaoBase.toFixed(2)),
    valores: {
      imposto: Number(calc.vImp.toFixed(2)),
      rm:      Number(calc.vRM.toFixed(2)),
      gf:      Number(calc.vGF.toFixed(2)),
      corretora: Number(calc.vCor.toFixed(2)),
    },
    inicioVigenciaISO: base.inicioISO || "",
    fimVigenciaISO:    base.fimISO    || "",
    parcelas,
    obs,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  await colComissoes.doc(cotacaoId).set(payload, { merge:true });
  // atualizar cache local e UI
  comissoesMap.set(cotacaoId, payload);
  alert("Comissão salva.");
  fecharDrawer();
  aplicarFiltros();
}
window.abrirDrawer = abrirDrawer;
window.fecharDrawer = fecharDrawer;
window.atualizarCalculos = atualizarCalculos;
window.salvarComissao = salvarComissao;
window.togglePago = togglePago;
