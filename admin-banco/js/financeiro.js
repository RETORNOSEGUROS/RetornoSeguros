// ================== BOOT ==================
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };
let LISTA = [];
let EMPRESAS_CACHE = new Map(); // empresaId -> {id,nome,rmUid,agenciaId}

// ================== HELPERS ==================
const normalizarPerfil = (p)=>String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[-_]+/g," ").trim();
const toBRL = (n)=> (Number.isFinite(n) ? n.toLocaleString("pt-BR", {style:"currency", currency:"BRL"}) : "—");
const toPct = (n)=> (Number.isFinite(n) ? (n*100).toLocaleString("pt-BR", {maximumFractionDigits:1})+"%" : "—");
const safeDiv = (a,b)=> (b && Math.abs(b)>0 ? a/b : null);
const clamp2 = (n)=> Number.isFinite(n) ? Math.round(n*100)/100 : null;
function escapeHtml(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

// Moeda BRL (máscara + parse)
function parseBRL(str){ const only=String(str||"").replace(/\D+/g,""); return only? Number(only)/100 : 0; }
function formatBRL(n){ return Number.isFinite(n) ? n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : ""; }
function moneyBindInputs(scope=document){
  scope.querySelectorAll("input.money").forEach(el=>{
    el.addEventListener("focus", ()=>{ const v=parseBRL(el.value); el.value=v? String(v.toFixed(2)).replace(".",","):""; });
    el.addEventListener("input", ()=> el.value = el.value.replace(/[^\d,]/g,""));
    el.addEventListener("blur", ()=>{ const v=parseBRL(el.value); el.value=v? formatBRL(v):""; });
  });
}
const getMoney = (id)=> parseBRL(document.getElementById(id)?.value || "");
function setMoney(id,v){ const el=document.getElementById(id); if(el) el.value = (v==null? "" : formatBRL(Number(v))); }

// ================== AUTH / MENU ==================
auth.onAuthStateChanged(async (user)=>{
  if(!user) return location.href="login.html";
  CTX.uid = user.uid;

  try {
    const prof = await db.collection("usuarios_banco").doc(user.uid).get();
    if (prof.exists) {
      const d = prof.data() || {};
      CTX.perfil    = normalizarPerfil(d.perfil || "admin");
      CTX.agenciaId = d.agenciaId || d.agenciaid || null;
      CTX.nome      = d.nome || user.email;
      document.getElementById("perfilUsuario").textContent = `${CTX.nome} (${d.perfil||"admin"})`;
    } else {
      // Fallback: assume admin
      CTX.perfil = "admin";
      CTX.nome   = user.email || "Usuário";
      document.getElementById("perfilUsuario").textContent = `${CTX.nome} (admin)`;
      console.warn("usuarios_banco não encontrado; usando perfil=admin (fallback).");
    }
  } catch (e) {
    CTX.perfil = "admin";
    CTX.nome   = user.email || "Usuário";
    document.getElementById("perfilUsuario").textContent = `${CTX.nome} (admin)`;
    console.error("Falha ao ler usuarios_banco; usando perfil=admin (fallback).", e);
  }

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
    "Vencimentos":"vencimentos.html","Relatórios":"relatorios.html","Funcionários":"funcionarios.html","Financeiro":"financeiro.html"
  };
  const CAT_ADMIN_ONLY={ "Carteira":"carteira.html","Comissões":"comissoes.html","Resgates (Admin)":"resgates-admin.html" };
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
  hrefs.forEach(h=>{ const a=document.createElement("a"); a.href=h; a.innerHTML=`🔹 ${LABEL[h]||h}`; menu.appendChild(a); });
}
// ================== UI (bindings básicos) ==================
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

  // Modal Detalhes/Relatório
  const m2 = document.getElementById("modalDet");
  const detBtn = document.getElementById("detFechar");
  if(detBtn){ detBtn.textContent = "Voltar ao painel"; }
  document.getElementById("detFechar")?.addEventListener("click", ()=> m2.style.display="none");
  m2?.addEventListener("click", (e)=>{ if(e.target===m2) m2.style.display="none"; });
}

// Preenche select de anos (últimos 8 anos + Mais recente)
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

// ================== CARREGAMENTO PRINCIPAL (GRID) ==================
async function carregarGrid(){
  const status = document.getElementById("statusLista");
  const tbody = document.getElementById("tbodyFin");
  status.textContent = "Carregando…";
  tbody.innerHTML = "";
  LISTA = [];

  try{
    const anoSel = document.getElementById("filtroAno").value;
    if(anoSel === "latest"){
      await carregarMaisRecenteViaEmpresas();
    }else{
      const ano = parseInt(anoSel,10);
      await carregarPorAnoViaCollectionGroup(ano);
    }
    renderTabela(LISTA);
    updateStatus(LISTA);
  }catch(e){
    console.error("[carregarGrid] erro:", e);
    status.textContent = "Erro ao carregar lista.";
    renderTabela([]);
  }finally{
    if(!LISTA.length){
      status.textContent = "Nenhum registro para este filtro.";
    }
  }
}

// Visão rápida — usa denormalizados na raiz de empresas (+ fallback na subcoleção)
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
      ano: d.ultimoAnoFinanceiro ?? null,
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

  // Fallback: se faltou “último ano”/valores, consulta subcoleção e corrige
  const NEED_FIX = arr.filter(x => !x.ano || x.receita==null || x.ebitda==null);
  const LIMIT_FIX = 100; // evita excesso de leituras
  await Promise.all(NEED_FIX.slice(0, LIMIT_FIX).map(async (it)=>{
    try{
      const sub = await db.collection("empresas").doc(it.empresaId).collection("financeiro").orderBy("ano","desc").limit(1).get();
      if(!sub.empty){
        const d = sub.docs[0].data()||{};
        it.ano     = d.ano ?? it.ano ?? null;
        it.receita = d.receitaLiquida ?? it.receita ?? null;
        it.ebitda  = d.ebitda ?? it.ebitda ?? null;
        it.margemEbitda = (Number.isFinite(it.ebitda) && Number.isFinite(it.receita) && it.receita>0) ? (it.ebitda/it.receita) : (d.margemEbitda ?? it.margemEbitda ?? null);
        it.dividaLiquida = (d.dividaLiquida!=null) ? d.dividaLiquida : (Number.isFinite(d.dividaBruta)&&Number.isFinite(d.caixa)? Math.max(d.dividaBruta-d.caixa,0) : it.dividaLiquida);
        it.alavancagem = d.alavancagemDivLiqEbitda ?? it.alavancagem ?? null;
        it.liquidez = d.liquidezCorrente ?? it.liquidez ?? null;
        it.selo = d.selo || it.selo || null;
      }
    }catch(e){ console.warn("fix latest fail", it.empresaId, e.message); }
  }));

  arr.sort((a,b)=> String(a.empresaNome).localeCompare(String(b.empresaNome),'pt',{sensitivity:'base'}));
  LISTA = arr;
}

// Visão por ano — collectionGroup('financeiro')
async function carregarPorAnoViaCollectionGroup(ano){
  let q = db.collectionGroup("financeiro").where("ano","==",ano);
  if (CTX.perfil === "rm" && CTX.uid){
    q = q.where("rmUid","==",CTX.uid);
  } else if ((CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") && CTX.agenciaId){
    q = q.where("agenciaId","==",CTX.agenciaId);
  }

  const snap = await q.limit(2000).get();
  if (snap.empty){ LISTA = []; return; }

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
      margemEbitda: (Number.isFinite(d.ebitda) && Number.isFinite(d.receitaLiquida) && d.receitaLiquida>0) ? d.ebitda/d.receitaLiquida : (d.margemEbitda ?? null),
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

// ================== RENDER / FILTRO / STATUS ==================
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
// ================== PERMISSÃO UI ==================
function podeEditarEmpresa(empresaId){
  if(CTX.perfil === "admin") return true;
  const base = EMPRESAS_CACHE.get(empresaId);
  if(!base) return false;
  if(CTX.perfil === "rm" && base.rmUid === CTX.uid) return true;
  if((CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") && base.agenciaId === CTX.agenciaId) return true;
  return false;
}

// ================== MODAL LANÇAR/EDITAR ==================
let EMPRESA_ALVO = null;
let ANO_ALVO = null;

function abrirModalFin(empresaId, anoStr){
  EMPRESA_ALVO = EMPRESAS_CACHE.get(empresaId) || { id:empresaId, nome:"Empresa" };
  ANO_ALVO = anoStr ? parseInt(anoStr,10) : null;

  if(!podeEditarEmpresa(empresaId)){ alert("Sem permissão para editar esta empresa."); return; }

  document.getElementById("finEmpresaAlvo").textContent = `${EMPRESA_ALVO.nome} (ID: ${EMPRESA_ALVO.id})`;
  document.getElementById("finErro").textContent = "";
  document.getElementById("finInfo").textContent = "";

  // limpa inputs
  ["finAno","finReceita","finLucroBruto","finEbitda","finLucroLiq","finDividaBruta","finCaixa","finEstoques","finCR","finCP","finDespesaFin","finDistribLucro","finProLabore","finQtdSocios","finPL","finAtivo"].forEach(id=>{
    const el = document.getElementById(id); if(el) el.value = "";
  });

  moneyBindInputs(document.getElementById("modalFin"));

  // carrega dados se já existir para o ano
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
        setMoney("finPL", d.patrimonioLiquido);
        setMoney("finAtivo", d.ativoTotal);
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
  const pl    = getMoney("finPL");     // Patrimônio Líquido
  const ativo = getMoney("finAtivo");  // Ativo Total

  // Derivados principais
  const margemBruta   = safeDiv(lucroBruto, receita);
  const margemEbitda  = safeDiv(ebitda, receita);
  const margemLiquida = safeDiv(lucroLiq, receita);
  const dividaLiquida = Math.max(dividaBruta - caixa, 0);
  const alavancagem   = safeDiv(dividaLiquida, ebitda);
  const liquidez      = safeDiv((caixa + cr + estoques), cp);
  const coberturaJuros= safeDiv(ebitda, despFin);

  // Indicadores adicionais
  const custoVendas    = (Number.isFinite(receita) && Number.isFinite(lucroBruto)) ? (receita - lucroBruto) : null;
  const giroEstoque    = safeDiv(custoVendas, estoques);             // vezes/ano
  const diasEstoque    = (giroEstoque ? (365 / giroEstoque) : null); // dias
  const pmrDias        = (safeDiv(cr, receita) ? (safeDiv(cr, receita) * 365) : null); // Prazo Médio Recebimento
  const pmpDias        = (safeDiv(cp, custoVendas) ? (safeDiv(cp, custoVendas) * 365) : null); // Prazo Médio Pagamento
  const cicloFinanceiro= (Number.isFinite(pmrDias) || Number.isFinite(diasEstoque) || Number.isFinite(pmpDias))
                          ? ( (pmrDias||0) + (diasEstoque||0) - (pmpDias||0) ) : null;

  const margemBrutaPct   = margemBruta;
  const margemLiquidaPct = margemLiquida;
  const roe              = safeDiv(lucroLiq, pl);
  const roa              = safeDiv(lucroLiq, ativo);
  const giroAtivos       = safeDiv(receita, ativo);
  const alavFinanceira   = safeDiv(ativo, pl); // Ativo/PL
  const endividLiqSobrePL= safeDiv(dividaLiquida, pl);
  const capitalDeGiro    = (Number.isFinite(caixa) && Number.isFinite(cr) && Number.isFinite(estoques) && Number.isFinite(cp))
                            ? (caixa + cr + estoques - cp) : null;
  const ncgSobreReceita  = safeDiv(capitalDeGiro, receita);

  // Sinais & selo
  const sinais = avaliarSinais({ margemEbitda, alavancagem, liquidez });
  const selo = consolidarSelo(sinais);

  try{
    const empresaRef = db.collection("empresas").doc(EMPRESA_ALVO.id);
    const finRef = empresaRef.collection("financeiro").doc(String(ano));

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

      // novos campos base
      patrimonioLiquido: pl,
      ativoTotal: ativo,

      // derivados
      margemBruta, margemEbitda, margemLiquida,
      dividaLiquida, alavancagemDivLiqEbitda: alavancagem,
      liquidezCorrente: liquidez, coberturaJuros,

      // adicionais
      custoVendas, giroEstoque, diasEstoque, pmrDias, pmpDias, cicloFinanceiro,

      margemBrutaPct: margemBrutaPct,
      margemLiquidaPct: margemLiquidaPct,
      roe, roa, giroAtivos, alavFinanceira, endividLiqSobrePL,
      capitalDeGiro, ncgSobreReceita,

      // meta/dados
      sinais, selo,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoPor: CTX.uid,
      empresaId: EMPRESA_ALVO.id,
      empresaNome: EMPRESA_ALVO.nome,
      rmUid: EMPRESA_ALVO.rmUid || null,
      agenciaId: EMPRESA_ALVO.agenciaId || null
    }, { merge:true });

    // garante “mais recente” baseado no MAIOR ano existente
    await recomputarMaisRecente(empresaRef);

    info.textContent = "Lançamento salvo com sucesso!";
    await carregarGrid();
    setTimeout(()=> document.getElementById("modalFin").style.display="none", 600);
  }catch(e){
    console.error(e);
    err.textContent = e?.message || "Erro ao salvar.";
  }
}

// Recalcula denormalizados “mais recente” na raiz
async function recomputarMaisRecente(empresaRef){
  const snap = await empresaRef.collection("financeiro").orderBy("ano","desc").limit(1).get();
  if (snap.empty) return;
  const d = snap.docs[0].data() || {};
  const receita = d.receitaLiquida ?? null;
  const ebitda  = d.ebitda ?? null;
  const dividaLiquida = (d.dividaLiquida != null)
    ? d.dividaLiquida
    : (Number.isFinite(d.dividaBruta) && Number.isFinite(d.caixa) ? Math.max(d.dividaBruta - d.caixa, 0) : null);
  const alav = (d.alavancagemDivLiqEbitda != null) ? d.alavancagemDivLiqEbitda
    : (Number.isFinite(dividaLiquida) && Number.isFinite(ebitda) && ebitda !== 0 ? dividaLiquida/ebitda : null);
  const liq  = (d.liquidezCorrente != null) ? d.liquidezCorrente : null;
  const selo = d.selo || null;

  await empresaRef.set({
    ultimoAnoFinanceiro: d.ano,
    ultimaReceita: receita,
    ultimoEbitda: ebitda,
    ultimaDividaLiquida: dividaLiquida,
    ultimaAlavancagem: Number.isFinite(alav) ? alav : null,
    ultimaLiquidez: Number.isFinite(liq) ? liq : null,
    ultimoSeloRisco: selo
  }, { merge:true });
}
// ================== REGRAS (sinais + selo) ==================
function avaliarSinais({ margemEbitda, alavancagem, liquidez }){
  const op  = (margemEbitda==null) ? "amarelo" : (margemEbitda < 0.04 ? "vermelho" : (margemEbitda < 0.08 ? "amarelo" : "verde"));
  const sol = (alavancagem==null) ? "amarelo" : (alavancagem > 3.5 ? "vermelho" : (alavancagem >= 1.5 ? "amarelo" : "verde"));
  const liq = (liquidez==null) ? "amarelo" : (liquidez < 1.0 ? "vermelho" : (liquidez < 1.2 ? "amarelo" : "verde"));
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

// ================== RELATÓRIO (Modal + Gráficos) ==================
let chart1=null, chart2=null, chart3=null, chart4=null, chart5=null;

async function abrirRelatorio(empresaId){
  const base = EMPRESAS_CACHE.get(empresaId) || { id:empresaId, nome:"Empresa" };
  document.getElementById("detEmpresaAlvo").textContent = `${base.nome} (ID: ${base.id})`;
  const tbody = document.getElementById("detTbody");
  tbody.innerHTML = `<tr><td colspan="14" class="muted">Carregando…</td></tr>`;
  document.getElementById("detResumo").innerHTML = "";
  destroyCharts();

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
        juros: d.coberturaJuros ?? null,
        giro: d.giroEstoque ?? null,
        diasEst: d.diasEstoque ?? null,
        pmr: d.pmrDias ?? null,
        pmp: d.pmpDias ?? null,
        ciclo: d.cicloFinanceiro ?? null,

        // novos:
        roe: d.roe ?? null,
        roa: d.roa ?? null,
        giroAtv: d.giroAtivos ?? null,
        alavFin: d.alavFinanceira ?? null,
        dlSobrePL: d.endividLiqSobrePL ?? null,
        capGiro: d.capitalDeGiro ?? null,
        ncgRec: d.ncgSobreReceita ?? null,

        selo: d.selo || null
      });
    });

    // ------ GRÁFICOS COMPACTOS ------
    rows.sort((a,b)=> a.ano - b.ano);
    const labels = rows.map(r=> String(r.ano));
    const receita = rows.map(r=> r.receita ?? null);
    const ebitda  = rows.map(r=> r.ebitda ?? null);
    const margem  = rows.map(r=> (r.margem!=null ? (r.margem*100) : null));
    const alav    = rows.map(r=> r.alav ?? null);
    const liq     = rows.map(r=> r.liq ?? null);

    const roePct  = rows.map(r=> r.roe!=null ? r.roe*100 : null);
    const roaPct  = rows.map(r=> r.roa!=null ? r.roa*100 : null);
    const dlpl    = rows.map(r=> r.dlSobrePL ?? null);
    const alavFin = rows.map(r=> r.alavFin ?? null);

    const commonOpts = { responsive:true, maintainAspectRatio:true, aspectRatio: 2 };

    // Receita x EBITDA
    chart1 = new Chart(document.getElementById("chartReceitaEbitda").getContext("2d"), {
      type: "line",
      data: { labels, datasets: [
        { label:"Receita", data: receita, tension:.3, borderWidth:2, pointRadius:2 },
        { label:"EBITDA",  data: ebitda,  tension:.3, borderWidth:2, pointRadius:2 }
      ]},
      options: {
        ...commonOpts,
        plugins:{ legend:{display:true} , tooltip:{mode:"index", intersect:false, callbacks:{ label:(ctx)=> `${ctx.dataset.label}: ${toBRL(ctx.parsed.y)}` }}},
        scales:{ y:{ ticks:{ callback:(v)=> toBRL(v) } } },
        elements:{ line:{ spanGaps:true } }
      }
    });

    // Margem EBITDA
    chart2 = new Chart(document.getElementById("chartMargem").getContext("2d"), {
      type: "bar",
      data: { labels, datasets: [{ label:"Margem EBITDA (%)", data: margem, borderWidth:1 }] },
      options: {
        ...commonOpts,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{ label:(ctx)=> `Margem: ${Number(ctx.parsed.y).toLocaleString("pt-BR",{maximumFractionDigits:1})}%` }}},
        scales:{ y:{ ticks:{ callback:(v)=> `${Number(v).toLocaleString("pt-BR")} %` } } }
      }
    });

    // DL/EBITDA x Liquidez
    chart3 = new Chart(document.getElementById("chartAlavancagemLiquidez").getContext("2d"), {
      type: "line",
      data: { labels, datasets: [
        { label:"DL/EBITDA (x)", data: alav, yAxisID:"y1", tension:.3, borderWidth:2, pointRadius:2 },
        { label:"Liquidez",      data: liq,  yAxisID:"y2", tension:.3, borderWidth:2, pointRadius:2 }
      ]},
      options: {
        ...commonOpts,
        plugins:{ legend:{display:true}, tooltip:{mode:"index", intersect:false, callbacks:{
          label:(ctx)=> {
            const v = Number(ctx.parsed.y);
            return `${ctx.dataset.label}: ${Number.isFinite(v)? v.toLocaleString("pt-BR",{maximumFractionDigits:2}) : "—"}`;
          }
        }}},
        scales:{
          y1:{ position:"left",  title:{display:true, text:"DL/EBITDA (x)"}, ticks:{ callback:(v)=> Number(v).toLocaleString("pt-BR") } },
          y2:{ position:"right", title:{display:true, text:"Liquidez"}, grid:{drawOnChartArea:false}, ticks:{ callback:(v)=> Number(v).toLocaleString("pt-BR") } }
        },
        elements:{ line:{ spanGaps:true } }
      }
    });

    // NOVO: ROE (%) e ROA (%)
    chart4 = new Chart(document.getElementById("chartRentab").getContext("2d"), {
      type: "line",
      data: { labels, datasets: [
        { label:"ROE (%)", data: roePct, tension:.3, borderWidth:2, pointRadius:2 },
        { label:"ROA (%)", data: roaPct, tension:.3, borderWidth:2, pointRadius:2 }
      ]},
      options: {
        ...commonOpts,
        plugins:{ legend:{display:true}, tooltip:{mode:"index", intersect:false, callbacks:{
          label:(ctx)=> `${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString("pt-BR",{maximumFractionDigits:1})}%`
        }}},
        scales:{ y:{ ticks:{ callback:(v)=> `${Number(v).toLocaleString("pt-BR")} %` } } },
        elements:{ line:{ spanGaps:true } }
      }
    });

    // NOVO: DL/PL (x) e Alav. (Ativo/PL) (x)
    chart5 = new Chart(document.getElementById("chartEstrutura").getContext("2d"), {
      type: "line",
      data: { labels, datasets: [
        { label:"DL/PL (x)", data: dlpl, tension:.3, borderWidth:2, pointRadius:2 },
        { label:"Alav. (Ativo/PL) (x)", data: alavFin, tension:.3, borderWidth:2, pointRadius:2 }
      ]},
      options: {
        ...commonOpts,
        plugins:{ legend:{display:true}, tooltip:{mode:"index", intersect:false, callbacks:{
          label:(ctx)=> `${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString("pt-BR",{maximumFractionDigits:2})}x`
        }}},
        scales:{ y:{ ticks:{ callback:(v)=> `${Number(v).toLocaleString("pt-BR")}x` } } },
        elements:{ line:{ spanGaps:true } }
      }
    });

    // ------ TABELA DETALHADA (linhas por ano) ------
    rows.sort((a,b)=> b.ano - a.ano);
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
        <td><button class="btn outline" data-editano="${r.ano}" data-editempresa="${base.id}">Editar</button></td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll("[data-editano]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const ano = btn.getAttribute("data-editano");
        const emp = btn.getAttribute("data-editempresa");
        document.getElementById("modalDet").style.display="none";
        abrirModalFin(emp, ano);
      });
    });

    // ------ ANÁLISE AUTOMÁTICA + VISÃO TRANSPOSTA ------
    const analise = gerarAnalise(rows);
    const transposta = montarTransposta(rows);
    document.getElementById("detResumo").innerHTML = analise + transposta;

  }catch(e){
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="14" class="muted">Erro ao carregar (${e.message}).</td></tr>`;
  }

  document.getElementById("modalDet").style.display = "block";
}

// Resumo executivo (bullets)
function gerarAnalise(rowsDesc){
  if(rowsDesc.length<1) return "";
  const a = rowsDesc[0], b = rowsDesc[1] || null;
  const pp = (x)=> Number.isFinite(x)? x.toLocaleString("pt-BR",{maximumFractionDigits:1}) : "—";
  const deltaPct = (n1,n0)=> (Number.isFinite(n1)&&Number.isFinite(n0)&&n0!==0)? ((n1-n0)/Math.abs(n0))*100 : null;

  let bullets=[];
  if(b){
    const recYoY = deltaPct(a.receita,b.receita);
    const ebtYoY = deltaPct(a.ebitda,b.ebitda);
    const marYoY = (Number.isFinite(a.margem) && Number.isFinite(b.margem)) ? ((a.margem-b.margem)*100) : null;

    if(recYoY!=null) bullets.push(`Receita ${recYoY>=0? "↑":"↓"} ${pp(Math.abs(recYoY))}% vs ${b.ano}.`);
    if(ebtYoY!=null) bullets.push(`EBITDA ${ebtYoY>=0? "↑":"↓"} ${pp(Math.abs(ebtYoY))}% vs ${b.ano}.`);
    if(marYoY!=null) bullets.push(`Margem EBITDA ${marYoY>=0? "↑":"↓"} ${pp(Math.abs(marYoY))} p.p.`);
  }
  if(Number.isFinite(a.alav)) bullets.push(`Alavancagem DL/EBITDA: ${pp(a.alav)}x (${a.alav>3.5?"alto risco":a.alav>=1.5?"atenção":"confortável"}).`);
  if(Number.isFinite(a.liq))  bullets.push(`Liquidez Corrente: ${pp(a.liq)} (${a.liq<1?"abaixo de 1,0 — risco":a.liq<1.2?"zona de atenção":"ok"}).`);
  if(Number.isFinite(a.juros)) bullets.push(`Cobertura de Juros: ${pp(a.juros)}x.`);
  if(Number.isFinite(a.ciclo)){
    bullets.push(`Ciclo Financeiro: ${pp(a.ciclo)} dias ${a.ciclo>60?"(longo — trava caixa)":a.ciclo<0?"(negativo — ótimo)":"."}`);
  }

  // Novos indicadores
  if(Number.isFinite(a.roe)) bullets.push(`ROE: ${pp(a.roe*100)}% ${a.roe<0.10?"(baixo)":a.roe>0.20?"(excelente)":"(ok)"}.`);
  if(Number.isFinite(a.roa)) bullets.push(`ROA: ${pp(a.roa*100)}%.`);
  if(Number.isFinite(a.giroAtv)) bullets.push(`Giro de Ativos: ${pp(a.giroAtv)}x.`);
  if(Number.isFinite(a.alavFin)) bullets.push(`Alavancagem financeira (Ativo/PL): ${pp(a.alavFin)}x.`);
  if(Number.isFinite(a.dlSobrePL)) bullets.push(`Endividamento líquido/PL: ${pp(a.dlSobrePL)}x.`);
  if(Number.isFinite(a.capGiro)) bullets.push(`Capital de Giro: ${toBRL(a.capGiro)}${Number.isFinite(a.ncgRec)?` · NCG/Receita: ${pp(a.ncgRec*100)}%`:""}.`);

  return `
    <div class="card" style="padding:10px; border:1px solid #dde4ef; border-radius:12px; background:#fff; margin:6px 0">
      <div style="font-weight:600; margin-bottom:6px">Resumo executivo — ${a.ano}${b?` vs ${b.ano}`:""}</div>
      <ul style="margin:6px 0 0 16px; padding:0; color:#334155">
        ${bullets.map(li=>`<li>${li}</li>`).join("")}
      </ul>
    </div>`;
}

// Visão transposta — todos os anos lado a lado
function montarTransposta(rowsDesc){
  const anos = rowsDesc.map(r=> r.ano);
  const linhas = [
    ["Receita (R$)", ...rowsDesc.map(r=> toBRL(r.receita))],
    ["EBITDA (R$)", ...rowsDesc.map(r=> toBRL(r.ebitda))],
    ["Margem EBITDA", ...rowsDesc.map(r=> toPct(r.margem))],
    ["Dívida Líquida (R$)", ...rowsDesc.map(r=> toBRL(r.dl))],
    ["DL/EBITDA (x)", ...rowsDesc.map(r=> Number.isFinite(r.alav)? clamp2(r.alav):"—")],
    ["Liquidez", ...rowsDesc.map(r=> Number.isFinite(r.liq)? clamp2(r.liq):"—")],
    ["Cobertura de Juros (x)", ...rowsDesc.map(r=> Number.isFinite(r.juros)? clamp2(r.juros):"—")],
    ["Giro Estoques (x)", ...rowsDesc.map(r=> Number.isFinite(r.giro)? clamp2(r.giro):"—")],
    ["Dias de Estoque", ...rowsDesc.map(r=> Number.isFinite(r.diasEst)? clamp2(r.diasEst):"—")],
    ["PMR (dias)", ...rowsDesc.map(r=> Number.isFinite(r.pmr)? clamp2(r.pmr):"—")],
    ["PMP (dias)", ...rowsDesc.map(r=> Number.isFinite(r.pmp)? clamp2(r.pmp):"—")],
    ["Ciclo Financeiro (dias)", ...rowsDesc.map(r=> Number.isFinite(r.ciclo)? clamp2(r.ciclo):"—")],

    // novos indicadores:
    ["ROE (Lucro/PL)", ...rowsDesc.map(r=> Number.isFinite(r.roe)? toPct(r.roe):"—")],
    ["ROA (Lucro/Ativo)", ...rowsDesc.map(r=> Number.isFinite(r.roa)? toPct(r.roa):"—")],
    ["Giro de Ativos (x)", ...rowsDesc.map(r=> Number.isFinite(r.giroAtv)? clamp2(r.giroAtv):"—")],
    ["Alav. Financeira (Ativo/PL)", ...rowsDesc.map(r=> Number.isFinite(r.alavFin)? clamp2(r.alavFin):"—")],
    ["DL/PL (x)", ...rowsDesc.map(r=> Number.isFinite(r.dlSobrePL)? clamp2(r.dlSobrePL):"—")],
    ["Capital de Giro (R$)", ...rowsDesc.map(r=> Number.isFinite(r.capGiro)? toBRL(r.capGiro):"—")],
    ["NCG/Receita", ...rowsDesc.map(r=> Number.isFinite(r.ncgRec)? toPct(r.ncgRec):"—")],
  ];

  const head = `<tr><th style="text-align:left">Indicador</th>${anos.map(a=>`<th>${a}</th>`).join("")}</tr>`;
  const body = linhas.map(l=> `<tr>${l.map((c,i)=> i? `<td style="white-space:nowrap">${c}</td>` : `<td><strong>${c}</strong></td>`).join("")}</tr>`).join("");
  return `
    <div class="table-wrap" style="border-radius:12px; margin-top:8px">
      <div style="font-weight:600; margin:6px 0">Visão geral — todos os anos em colunas</div>
      <table>
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

// ================== HELPERS DE DELTAS E CHART ==================
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
  const good = invert ? (v<0) : (v>0);
  const bad  = invert ? (v>0) : (v<0);
  const cls = good ? "pos" : (bad ? "neg" : "neu");
  const arrow = v>0 ? "↑" : (v<0 ? "↓" : "•");
  const val = Number.isFinite(v)? clamp2(Math.abs(v)) : "—";
  return `<span class="delta ${cls}">${arrow} ${val}</span>`;
}
function destroyCharts(){
  try{ chart1 && chart1.destroy(); }catch{}
  try{ chart2 && chart2.destroy(); }catch{}
  try{ chart3 && chart3.destroy(); }catch{}
  try{ chart4 && chart4.destroy(); }catch{}
  try{ chart5 && chart5.destroy(); }catch{}
  chart1=chart2=chart3=chart4=chart5=null;
}
