// financeiro.js — Painel + Lançamento + Relatório (Firebase v8)

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };
let LISTA = []; // linhas renderizadas
let EMPRESAS_CACHE = new Map(); // empresaId -> {id,nome,rmUid,agenciaId}

// ===== Helpers comuns =====
const normalizarPerfil = (p)=>String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[-_]+/g," ").trim();

const toBRL = (n)=> (Number.isFinite(n) ? n.toLocaleString("pt-BR", {style:"currency", currency:"BRL"}) : "—");
const toPct = (n)=> (Number.isFinite(n) ? (n*100).toLocaleString("pt-BR", {maximumFractionDigits:1})+"%" : "—");
const safeDiv = (a,b)=> (b && Math.abs(b)>0 ? a/b : null);
const clamp2 = (n)=> Number.isFinite(n) ? Math.round(n*100)/100 : null;

function escapeHtml(s){
  return String(s==null?"":s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

// ===== Moeda BRL (máscara + parse) =====
function parseBRL(str){
  const onlyDigits = String(str||"").replace(/\D+/g, "");
  if (!onlyDigits) return 0;
  return Number(onlyDigits) / 100; // sempre em centavos
}
function formatBRL(n){
  return Number.isFinite(n) ? n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : "";
}
function moneyBindInputs(scope=document){
  scope.querySelectorAll("input.money").forEach(el=>{
    el.addEventListener("focus", ()=>{
      const val = parseBRL(el.value);
      el.value = val ? String(val.toFixed(2)).replace(".",",") : "";
    });
    el.addEventListener("input", ()=>{
      const raw = el.value;
      el.value = raw.replace(/[^\d,]/g,"");
    });
    el.addEventListener("blur", ()=>{
      const val = parseBRL(el.value);
      el.value = val ? formatBRL(val) : "";
    });
  });
}
function getMoney(id){ return parseBRL(document.getElementById(id)?.value || ""); }
function setMoney(id, v){
  const el = document.getElementById(id);
  if (!el) return;
  el.value = (v==null) ? "" : formatBRL(Number(v));
}

// ===== Perfil / Menu =====
auth.onAuthStateChanged(async (user)=>{
  if(!user) return location.href="login.html";
  CTX.uid = user.uid;

  const prof = await db.collection("usuarios_banco").doc(user.uid).get();
  if(!prof.exists){ document.getElementById("perfilUsuario").textContent="Usuário não encontrado"; return; }
  const d = prof.data();
  CTX.perfil    = normalizarPerfil(d.perfil || "");
  CTX.agenciaId = d.agenciaId || d.agenciaid || null;
  CTX.nome      = d.nome || user.email;
  document.getElementById("perfilUsuario").textContent = `${CTX.nome} (${d.perfil||"sem perfil"})`;

  montarMenuLateral(CTX.perfil);
  wireUi();
  preencherAnosSelect();
  carregarGrid();
});

function montarMenuLateral(perfilBruto){
  const menu=document.getElementById("menuNav"); if(!menu) return; menu.innerHTML="";
  const perfil=normalizarPerfil(perfilBruto);

  const CAT_BASE={
    "Cadastrar Gerentes":"cadastro-geral.html","Cadastrar Empresa":"cadastro-empresa.html","Agências":"agencias.html",
    "Agenda Visitas":"agenda-visitas.html","Visitas":"visitas.html","Empresas":"empresas.html",
    "Solicitações de Cotação":"cotacoes.html","Produção":"negocios-fechados.html","Consultar Dicas":"consultar-dicas.html",
    "Dicas Produtos":"dicas-produtos.html","Ramos Seguro":"ramos-seguro.html","Relatório Visitas":"visitas-relatorio.html",
    "Vencimentos":"vencimentos.html","Relatórios":"relatorios.html",
    "Funcionários":"funcionarios.html","Financeiro":"financeiro.html"
  };
  const CAT_ADMIN_ONLY={
    "Carteira":"carteira.html","Comissões":"comissoes.html","Resgates (Admin)":"resgates-admin.html"
  };
  const LABEL=Object.fromEntries(Object.entries({...CAT_BASE, ...CAT_ADMIN_ONLY}).map(([k,v])=>[v,k]));
  const ADMIN=[...Object.values(CAT_BASE), ...Object.values(CAT_ADMIN_ONLY)];
  const RM = ["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html","funcionarios.html","financeiro.html"];
  const GER= ["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html","funcionarios.html","financeiro.html"];
  const AST= ["agenda-visitas.html","visitas.html","cotacoes.html","consultar-dicas.html","funcionarios.html","financeiro.html"];

  let hrefs=[];
  switch(perfil){
    case "admin": hrefs=ADMIN; break;
    case "rm": hrefs=RM; break;
    case "gerente chefe":
    case "gerente-chefe":
    case "gerente_chefe": hrefs=GER; break;
    case "assistente":
    case "assistentes": hrefs=AST; break;
    default: hrefs=[];
  }
  hrefs.forEach(h=>{
    const a=document.createElement("a"); a.href=h;
    a.innerHTML=`🔹 ${LABEL[h]||h}`;
    menu.appendChild(a);
  });
}

// ===== UI handlers =====
function wireUi(){
  document.getElementById("btnRecarregar")?.addEventListener("click", carregarGrid);
  document.getElementById("busca")?.addEventListener("input", filtrarTabela);
  document.getElementById("filtroAno")?.addEventListener("change", carregarGrid);

  // Modal Lançar/Editar
  const modal = document.getElementById("modalFin");
  document.getElementById("finFechar")?.addEventListener("click", ()=> modal.style.display="none");
  modal?.addEventListener("click", (e)=>{ if(e.target===modal) modal.style.display="none"; });
  document.getElementById("toggleAvancado")?.addEventListener("click", ()=>{
    const adv = document.getElementById("avancado");
    adv.style.display = (adv.style.display==="none" || !adv.style.display) ? "grid" : "none";
    document.getElementById("toggleAvancado").textContent = adv.style.display==="grid" ? "– Avançado" : "+ Avançado";
  });
  document.getElementById("finSalvar")?.addEventListener("click", salvarFinanceiro);

  // Modal Detalhes
  const m2 = document.getElementById("modalDet");
  document.getElementById("detFechar")?.addEventListener("click", ()=> m2.style.display="none");
  m2?.addEventListener("click", (e)=>{ if(e.target===m2) m2.style.display="none"; });
}

// Preenche select de anos (ultimos 8 anos + Mais recente)
function preencherAnosSelect(){
  const sel = document.getElementById("filtroAno");
  if(!sel) return;
  const base = new Date().getFullYear();
  for(let y=base; y>=base-8; y--){
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = y;
    sel.appendChild(opt);
  }
}

// ===== Carregamento principal =====
async function carregarGrid(){
  const anoSel = document.getElementById("filtroAno").value;
  document.getElementById("statusLista").textContent = "Carregando…";
  document.getElementById("tbodyFin").innerHTML = "";
  LISTA = [];

  if(anoSel === "latest"){
    await carregarMaisRecenteViaEmpresas();
  }else{
    const ano = parseInt(anoSel,10);
    await carregarPorAnoViaCollectionGroup(ano);
  }

  renderTabela(LISTA);
  updateStatus(LISTA);
}

// Visão rápida — usa denormalizados na raiz de empresas
async function carregarMaisRecenteViaEmpresas(){
  let q = db.collection("empresas");
  if (CTX.perfil === "rm" && CTX.uid){
    q = q.where("rmUid","==",CTX.uid);
  } else if ((CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") && CTX.agenciaId){
    let snap = await q.where("agenciaId","==",CTX.agenciaId).limit(1000).get();
    if (snap.empty) snap = await db.collection("empresas").where("agenciaid","==",CTX.agenciaId).limit(1000).get();
    return montarLinhasMaisRecente(snap);
  }
  const snap = await q.limit(1000).get();
  await montarLinhasMaisRecente(snap);
}

async function montarLinhasMaisRecente(snap){
  if (snap.empty){
    document.getElementById("statusLista").textContent = "Nenhuma empresa encontrada.";
    return;
  }
  const arr=[];
  snap.forEach(doc=>{
    const d = doc.data()||{};
    EMPRESAS_CACHE.set(doc.id, { id:doc.id, nome:(d.nome||d.razaoSocial||d.fantasia||"Empresa"), rmUid:(d.rmUid||d.rm||null), agenciaId:(d.agenciaId||d.agenciaid||null) });
    arr.push({
      empresaId: doc.id,
      empresaNome: d.nome || d.razaoSocial || d.fantasia || "Empresa",
      ano: d.ultimoAnoFinanceiro || null,
      receita: d.ultimaReceita ?? null,
      ebitda: d.ultimoEbitda ?? null,
      margemEbitda: (Number.isFinite(d.ultimoEbitda) && Number.isFinite(d.ultimaReceita) && d.ultimaReceita>0) ? (d.ultimoEbitda/d.ultimaReceita) : null,
      dividaLiquida: d.ultimaDividaLiquida ?? null,
      alavancagem: d.ultimaAlavancagem ?? null,
      liquidez: d.ultimaLiquidez ?? null,
      selo: d.ultimoSeloRisco || null,
      origem: "denormalizado"
    });
  });
  arr.sort((a,b)=> String(a.empresaNome).localeCompare(String(b.empresaNome),'pt',{sensitivity:'base'}));
  LISTA = arr;
}

// Visão por ano — usa collectionGroup('financeiro')
async function carregarPorAnoViaCollectionGroup(ano){
  let q = db.collectionGroup("financeiro").where("ano","==",ano);
  if (CTX.perfil === "rm" && CTX.uid){
    q = q.where("rmUid","==",CTX.uid);
  } else if ((CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") && CTX.agenciaId){
    q = q.where("agenciaId","==",CTX.agenciaId);
  }
  const snap = await q.limit(2000).get();
  if (snap.empty){
    document.getElementById("statusLista").textContent = "Nenhum lançamento encontrado para o ano.";
    return;
  }
  const arr=[];
  snap.forEach(doc=>{
    const d = doc.data()||{};
    if(d.empresaId && d.empresaNome) {
      EMPRESAS_CACHE.set(d.empresaId, { id:d.empresaId, nome:d.empresaNome, rmUid:d.rmUid||null, agenciaId:d.agenciaId||null });
    }
    arr.push({
      empresaId: d.empresaId || doc.ref.parent.parent?.id || null,
      empresaNome: d.empresaNome || "Empresa",
      ano: d.ano || ano,
      receita: d.receitaLiquida ?? null,
      ebitda: d.ebitda ?? null,
      margemEbitda: (Number.isFinite(d.ebitda) && Number.isFinite(d.receitaLiquida) && d.receitaLiquida>0) ? (d.ebitda/d.receitaLiquida) : (d.margemEbitda ?? null),
      dividaLiquida: d.dividaLiquida ?? (Number.isFinite(d.dividaBruta) && Number.isFinite(d.caixa) ? Math.max(d.dividaBruta - d.caixa,0) : null),
      alavancagem: d.alavancagemDivLiqEbitda ?? null,
      liquidez: d.liquidezCorrente ?? null,
      selo: d.selo || null,
      origem: "anual"
    });
  });
  arr.sort((a,b)=> String(a.empresaNome).localeCompare(String(b.empresaNome),'pt',{sensitivity:'base'}));
  LISTA = arr;
}

// ===== Render / Filtro / Status =====
function renderTabela(lista){
  const tbody = document.getElementById("tbodyFin");
  tbody.innerHTML = "";

  if(!lista.length){
    tbody.innerHTML = `<tr><td colspan="10" class="muted" style="padding:18px">Nenhum registro.</td></tr>`;
    return;
  }

  for(const it of lista){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="sticky-left"><strong>${escapeHtml(it.empresaNome)}</strong></td>
      <td class="hide-sm">${it.ano ?? "—"}</td>
      <td class="hide-sm">${toBRL(it.receita)}</td>
      <td>${toBRL(it.ebitda)}</td>
      <td class="hide-sm">${toPct(it.margemEbitda)}</td>
      <td class="hide-sm">${toBRL(it.dividaLiquida)}</td>
      <td class="hide-sm">${Number.isFinite(it.alavancagem) ? clamp2(it.alavancagem) : "—"}</td>
      <td class="hide-sm">${Number.isFinite(it.liquidez) ? clamp2(it.liquidez) : "—"}</td>
      <td class="sticky-right">${renderSelo(it.selo)}</td>
      <td class="hide-sm">
        <button class="btn" data-edit="${it.empresaId}" data-ano="${it.ano ?? ""}">Lançar/Editar</button>
        <button class="btn outline" data-det="${it.empresaId}">Detalhes</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=> abrirModalFin(btn.getAttribute("data-edit"), btn.getAttribute("data-ano")));
  });
  tbody.querySelectorAll("[data-det]").forEach(btn=>{
    btn.addEventListener("click", ()=> abrirRelatorio(btn.getAttribute("data-det")));
  });
}

function renderSelo(s){
  const map = { "verde":"verde", "amarelo":"amarelo", "vermelho":"vermelho" };
  const cls = map[String(s||"").toLowerCase()] || "amarelo";
  const label = s ? s.toUpperCase() : "—";
  return `<span class="chip ${cls}">${label}</span>`;
}

function filtrarTabela(){
  const termo = (document.getElementById("busca").value || "").trim().toLowerCase();
  let base = LISTA.slice();
  if(termo){
    base = base.filter(it => String(it.empresaNome).toLowerCase().includes(termo));
  }
  renderTabela(base);
  updateStatus(base);
}

function updateStatus(lista){
  const totalEmpresas = lista.length;
  const somaReceita = lista.reduce((a,x)=> a + (Number.isFinite(x.receita)? x.receita : 0), 0);
  const somaEbitda  = lista.reduce((a,x)=> a + (Number.isFinite(x.ebitda)? x.ebitda : 0), 0);
  const mediaMargem = (somaReceita>0) ? (somaEbitda/somaReceita) : null;
  const status = document.getElementById("statusLista");
  status.textContent = `${totalEmpresas} empresa(s) no filtro · Receita total: ${toBRL(somaReceita)} · EBITDA total: ${toBRL(somaEbitda)} · % EBITDA média: ${toPct(mediaMargem)}`;
}

// ===== Permissão simples (UI) =====
function podeEditarEmpresa(empresaId){
  if(CTX.perfil === "admin") return true;
  const base = EMPRESAS_CACHE.get(empresaId);
  if(!base) return false;
  if(CTX.perfil === "rm" && base.rmUid === CTX.uid) return true;
  if((CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") && base.agenciaId === CTX.agenciaId) return true;
  return false;
}

// ===== Modal Lançar/Editar =====
let EMPRESA_ALVO = null; // {id, nome,...}
let ANO_ALVO = null;     // number | null

function abrirModalFin(empresaId, anoStr){
  EMPRESA_ALVO = EMPRESAS_CACHE.get(empresaId) || { id:empresaId, nome:"Empresa" };
  ANO_ALVO = anoStr ? parseInt(anoStr,10) : null;

  if(!podeEditarEmpresa(empresaId)){
    alert("Sem permissão para editar esta empresa.");
    return;
  }

  document.getElementById("finEmpresaAlvo").textContent = `${EMPRESA_ALVO.nome} (ID: ${EMPRESA_ALVO.id})`;
  document.getElementById("finErro").textContent = "";
  document.getElementById("finInfo").textContent = "";

  // limpa campos
  ["finAno","finReceita","finLucroBruto","finEbitda","finLucroLiq","finDividaBruta","finCaixa","finEstoques","finCR","finCP","finDespesaFin","finDistribLucro","finProLabore","finQtdSocios"].forEach(id=>{
    const el = document.getElementById(id); if(el) el.value = "";
  });

  // Máscara BRL ativa
  moneyBindInputs(document.getElementById("modalFin"));

  // se ano conhecido, pré‑preencher
  if(Number.isFinite(ANO_ALVO)){
    document.getElementById("finAno").value = ANO_ALVO;
    db.collection("empresas").doc(EMPRESA_ALVO.id).collection("financeiro").doc(String(ANO_ALVO)).get().then(doc=>{
      if(doc.exists){
        const d = doc.data()||{};
        setMoney("finReceita", d.receitaLiquida);
        setMoney("finLucroBruto", d.lucroBruto);
        setMoney("finEbitda", d.ebitda);
        setMoney("finLucroLiq", d.lucroLiquido);
        setMoney("finDividaBruta", d.dividaBruta);
        setMoney("finCaixa", d.caixa);
        setMoney("finEstoques", d.estoques);
        setMoney("finCR", d.contasAReceber);
        setMoney("finCP", d.contasAPagar);
        setMoney("finDespesaFin", d.despesaFinanceira);
        setMoney("finDistribLucro", d.distribuicaoLucros);
        setMoney("finProLabore", d.proLaboreTotalAnual);
        const qs = document.getElementById("finQtdSocios"); if(qs) qs.value = d.qtdSocios || 0;
      }
    });
  }

  document.getElementById("modalFin").style.display = "block";
}

async function salvarFinanceiro(){
  const err = document.getElementById("finErro");
  const info= document.getElementById("finInfo");
  err.textContent=""; info.textContent="";

  if(!EMPRESA_ALVO?.id){ err.textContent="Empresa inválida."; return; }
  if(!podeEditarEmpresa(EMPRESA_ALVO.id)){ err.textContent="Sem permissão."; return; }

  const ano = parseInt(document.getElementById("finAno").value,10);
  if(!Number.isFinite(ano) || ano<2000){ err.textContent="Ano inválido."; return; }

  // Núcleo
  const receita = getMoney("finReceita");
  const lucroBruto = getMoney("finLucroBruto");
  const ebitda = getMoney("finEbitda");
  const lucroLiq = getMoney("finLucroLiq");
  const dividaBruta = getMoney("finDividaBruta");
  const caixa = getMoney("finCaixa");
  const estoques = getMoney("finEstoques");
  const cr = getMoney("finCR");
  const cp = getMoney("finCP");

  // Avançado (opcional)
  const despFin = getMoney("finDespesaFin");
  const distrLuc = getMoney("finDistribLucro");
  const proLabore= getMoney("finProLabore");
  const qtdSocios= +document.getElementById("finQtdSocios").value || 0;

  // Derivados
  const margemBruta = safeDiv(lucroBruto, receita);
  const margemEbitda= safeDiv(ebitda, receita);
  const margemLiquida= safeDiv(lucroLiq, receita);
  const dividaLiquida = Math.max(dividaBruta - caixa, 0);
  const alavancagem = safeDiv(dividaLiquida, ebitda);
  const liquidez = safeDiv((caixa + cr + estoques), cp);
  const coberturaJuros = safeDiv(ebitda, despFin);

  // Sinais & selo
  const sinais = avaliarSinais({ margemEbitda, alavancagem, liquidez });
  const selo = consolidarSelo(sinais);

  try{
    const empresaRef = db.collection("empresas").doc(EMPRESA_ALVO.id);
    const finRef = empresaRef.collection("financeiro").doc(String(ano));

    // upsert no doc anual (com denormalizados p/ collectionGroup)
    await finRef.set({
      ano,
      receitaLiquida: receita,
      lucroBruto, ebitda, lucroLiquido: lucroLiq,
      dividaBruta, caixa, estoques,
      contasAReceber: cr, contasAPagar: cp,
      despesaFinanceira: despFin,
      distribuicaoLucros: distrLuc,
      proLaboreTotalAnual: proLabore,
      qtdSocios: qtdSocios,
      margemBruta, margemEbitda, margemLiquida,
      dividaLiquida, alavancagemDivLiqEbitda: alavancagem,
      liquidezCorrente: liquidez, coberturaJuros,
      sinais, selo,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoPor: CTX.uid,
      empresaId: EMPRESA_ALVO.id,
      empresaNome: EMPRESA_ALVO.nome,
      rmUid: EMPRESA_ALVO.rmUid || null,
      agenciaId: EMPRESA_ALVO.agenciaId || null
    }, { merge:true });

    // Atualiza denormalizados na raiz **apenas se for o mais recente**
    const snap = await empresaRef.get();
    const ultimo = snap.exists ? (snap.data().ultimoAnoFinanceiro || null) : null;
    const ehMaisRecente = (ultimo == null) || (ano >= Number(ultimo));
    if (ehMaisRecente) {
      await empresaRef.set({
        ultimoAnoFinanceiro: ano,
        ultimoEbitda: ebitda,
        ultimaReceita: receita,
        ultimaDividaLiquida: dividaLiquida,
        ultimaAlavancagem: Number.isFinite(alavancagem) ? alavancagem : null,
        ultimaLiquidez: Number.isFinite(liquidez) ? liquidez : null,
        ultimoSeloRisco: selo
      }, { merge:true });
    }

    info.textContent = "Lançamento salvo com sucesso!";
    await carregarGrid();
    setTimeout(()=> document.getElementById("modalFin").style.display="none", 600);
  }catch(e){
    console.error(e);
    err.textContent = e?.message || "Erro ao salvar.";
  }
}

// ===== Regras de avaliação (sinais + selo) =====
function avaliarSinais({ margemEbitda, alavancagem, liquidez }){
  // Saúde Operacional
  const op = (margemEbitda==null) ? "amarelo" :
             (margemEbitda < 0.04 ? "vermelho" :
              (margemEbitda < 0.08 ? "amarelo" : "verde"));

  // Solvência
  const sol = (alavancagem==null) ? "amarelo" :
              (alavancagem > 3.5 ? "vermelho" :
               (alavancagem >= 1.5 ? "amarelo" : "verde"));

  // Liquidez
  const liq = (liquidez==null) ? "amarelo" :
              (liquidez < 1.0 ? "vermelho" :
               (liquidez < 1.2 ? "amarelo" : "verde"));

  return { saudeOperacional:op, solvencia:sol, liquidez:liq };
}
function consolidarSelo(s){
  const arr = [s.saudeOperacional, s.solvencia, s.liquidez];
  const reds = arr.filter(x=>x==="vermelho").length;
  const ambs = arr.filter(x=>x==="amarelo").length;
  if(reds>=2) return "vermelho";
  if(reds===1 || ambs>=2) return "amarelo";
  return "verde";
}

// ====== Relatório Ano a Ano ======
async function abrirRelatorio(empresaId){
  const base = EMPRESAS_CACHE.get(empresaId) || { id:empresaId, nome:"Empresa" };
  document.getElementById("detEmpresaAlvo").textContent = `${base.nome} (ID: ${base.id})`;
  const tbody = document.getElementById("detTbody");
  tbody.innerHTML = `<tr><td colspan="13" class="muted">Carregando…</td></tr>`;
  document.getElementById("detResumo").innerHTML = "";

  try{
    const snap = await db.collection("empresas").doc(base.id).collection("financeiro").orderBy("ano","desc").limit(12).get();
    const rows = [];
    snap.forEach(doc=>{
      const d = doc.data()||{};
      rows.push({
        ano: d.ano,
        receita: d.receitaLiquida ?? null,
        ebitda: d.ebitda ?? null,
        margem: (Number.isFinite(d.ebitda) && Number.isFinite(d.receitaLiquida) && d.receitaLiquida>0) ? d.ebitda/d.receitaLiquida : (d.margemEbitda ?? null),
        dl: d.dividaLiquida ?? (Number.isFinite(d.dividaBruta) && Number.isFinite(d.caixa) ? Math.max(d.dividaBruta-d.caixa,0) : null),
        alav: d.alavancagemDivLiqEbitda ?? null,
        liq: d.liquidezCorrente ?? null,
        selo: d.selo || null
      });
    });
    rows.sort((a,b)=> b.ano - a.ano); // desc

    // monta linhas com deltas YoY (comparando com próximo da lista)
    tbody.innerHTML="";
    for(let i=0;i<rows.length;i++){
      const r = rows[i];
      const nxt = rows[i+1] || null;
      const delta = (a,b)=> (Number.isFinite(a)&&Number.isFinite(b)) ? a-b : null;
      const dRec = nxt ? delta(r.receita, nxt.receita) : null;
      const dEbt = nxt ? delta(r.ebitda, nxt.ebitda) : null;
      const dMar = nxt ? delta(r.margem, nxt.margem) : null;
      const dAlv = nxt ? delta(r.alav, nxt.alav) : null;
      const dLiq = nxt ? delta(r.liq, nxt.liq) : null;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${r.ano}</strong></td>
        <td>${toBRL(r.receita)}</td>
        <td>${toBRL(r.ebitda)}</td>
        <td>${toPct(r.margem)}</td>
        <td>${toBRL(r.dl)}</td>
        <td>${Number.isFinite(r.alav)?clamp2(r.alav):"—"}</td>
        <td>${Number.isFinite(r.liq)?clamp2(r.liq):"—"}</td>
        <td>${renderSelo(r.selo)}</td>
        <td>${renderDeltaMoeda(dRec)}</td>
        <td>${renderDeltaMoeda(dEbt)}</td>
        <td>${renderDeltaPct(dMar)}</td>
        <td>${renderDeltaNum(dAlv, true)}</td>
        <td>${renderDeltaNum(dLiq)}</td>
      `;
      tbody.appendChild(tr);
    }

    // resumo executivo (último ano vs anterior)
    if(rows.length>=2){
      const a = rows[0], b = rows[1];
      const mk = (label, val, fmt)=> `<div><strong>${label}:</strong> ${fmt(val)}</div>`;
      const bloco = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          ${mk("Receita", a.receita, toBRL)} ${mk("EBITDA", a.ebitda, toBRL)} ${mk("Margem EBITDA", a.margem, toPct)}
          ${mk("Dívida Líquida", a.dl, toBRL)} ${mk("DL/EBITDA", a.alav, (x)=>Number.isFinite(x)?clamp2(x):"—")} ${mk("Liquidez Corrente", a.liq, (x)=>Number.isFinite(x)?clamp2(x):"—")}
        </div>
      `;
      document.getElementById("detResumo").innerHTML = bloco;
    }
  }catch(e){
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="13" class="muted">Erro ao carregar (${e.message}).</td></tr>`;
  }

  document.getElementById("modalDet").style.display = "block";
}

function renderDeltaMoeda(v){
  if(v==null) return `<span class="delta neu">—</span>`;
  const cls = v>0 ? "pos" : (v<0 ? "neg" : "neu");
  return `<span class="delta ${cls}">${v>0? "↑":"↓"} ${toBRL(Math.abs(v))}</span>`;
}
function renderDeltaPct(v){
  if(v==null) return `<span class="delta neu">—</span>`;
  const cls = v>0 ? "pos" : (v<0 ? "neg" : "neu");
  const pct = (v*100);
  const str = (Number.isFinite(pct)? pct.toLocaleString("pt-BR",{maximumFractionDigits:1})+" p.p." : "—");
  return `<span class="delta ${cls}">${v>0? "↑":"↓"} ${str}</span>`;
}
function renderDeltaNum(v, invert=false){
  if(v==null) return `<span class="delta neu">—</span>`;
  // em alavancagem, queda é bom => invert=true (↓ = positivo)
  const good = invert ? (v<0) : (v>0);
  const bad  = invert ? (v>0) : (v<0);
  const cls = good ? "pos" : (bad ? "neg" : "neu");
  const arrow = v>0 ? "↑" : (v<0 ? "↓" : "•");
  const val = Number.isFinite(v)? clamp2(Math.abs(v)) : "—";
  return `<span class="delta ${cls}">${arrow} ${val}</span>`;
}
