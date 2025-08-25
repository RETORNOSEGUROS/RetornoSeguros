if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };
let LISTA = [];
let EMPRESAS_CACHE = new Map();

const normalizarPerfil = (p)=>String(p||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[-_]+/g," ").trim();
const toBRL = (n)=> (Number.isFinite(n) ? n.toLocaleString("pt-BR", {style:"currency", currency:"BRL"}) : "—");
const toPct = (n)=> (Number.isFinite(n) ? (n*100).toLocaleString("pt-BR", {maximumFractionDigits:1})+"%" : "—");
const safeDiv = (a,b)=> (b && Math.abs(b)>0 ? a/b : null);
const clamp2 = (n)=> Number.isFinite(n) ? Math.round(n*100)/100 : null;

function escapeHtml(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}

// Dinheiro
function parseBRL(str){ const d=String(str||"").replace(/\D+/g,""); return d? Number(d)/100 : 0; }
function formatBRL(n){ return Number.isFinite(n)? n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : ""; }
function moneyBindInputs(scope=document){
  scope.querySelectorAll("input.money").forEach(el=>{
    el.addEventListener("focus", ()=>{ const v=parseBRL(el.value); el.value = v? String(v.toFixed(2)).replace(".",",") : ""; });
    el.addEventListener("input", ()=>{ el.value = el.value.replace(/[^\d,]/g,""); });
    el.addEventListener("blur",  ()=>{ const v=parseBRL(el.value); el.value = v? formatBRL(v) : ""; });
  });
}
const getMoney=(id)=> parseBRL(document.getElementById(id)?.value||"");
function setMoney(id,v){ const el=document.getElementById(id); if(el) el.value=(v==null)?"":formatBRL(Number(v)); }

// ===== Auth =====
auth.onAuthStateChanged(async (user)=>{
  if(!user) return location.href="login.html";
  CTX.uid = user.uid;
  const prof = await db.collection("usuarios_banco").doc(user.uid).get();
  if(!prof.exists){ document.getElementById("perfilUsuario").textContent="Usuário não encontrado"; return; }
  const d = prof.data();
  CTX.perfil    = normalizarPerfil(d.perfil||"");
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
  const CAT_ADMIN_ONLY={"Carteira":"carteira.html","Comissões":"comissoes.html","Resgates (Admin)":"resgates-admin.html"};
  const LABEL=Object.fromEntries(Object.entries({...CAT_BASE,...CAT_ADMIN_ONLY}).map(([k,v])=>[v,k]));
  const ADMIN=[...Object.values(CAT_BASE),...Object.values(CAT_ADMIN_ONLY)];
  const RM=["cadastro-empresa.html","agenda-visitas.html","visitas.html","empresas.html","cotacoes.html","negocios-fechados.html","consultar-dicas.html","visitas-relatorio.html","vencimentos.html","funcionarios.html","financeiro.html"];
  const GER=[...RM]; const AST=["agenda-visitas.html","visitas.html","cotacoes.html","consultar-dicas.html","funcionarios.html","financeiro.html"];
  let hrefs=[]; switch(perfil){case"admin":hrefs=ADMIN;break;case"rm":hrefs=RM;break;case"gerente chefe":case"gerente-chefe":case"gerente_chefe":hrefs=GER;break;case"assistente":case"assistentes":hrefs=AST;break;default:hrefs=[];}
  hrefs.forEach(h=>{const a=document.createElement("a");a.href=h;a.innerHTML=`🔹 ${LABEL[h]||h}`;menu.appendChild(a);});
}

function wireUi(){
  document.getElementById("btnRecarregar")?.addEventListener("click", carregarGrid);
  document.getElementById("busca")?.addEventListener("input", filtrarTabela);
  document.getElementById("filtroAno")?.addEventListener("change", carregarGrid);

  // Modal Fin
  const m1=document.getElementById("modalFin");
  document.getElementById("finFechar")?.addEventListener("click", ()=> m1.style.display="none");
  m1?.addEventListener("click", (e)=>{ if(e.target===m1) m1.style.display="none"; });
  document.getElementById("toggleAvancado")?.addEventListener("click", ()=>{
    const adv=document.getElementById("avancado");
    adv.style.display = (adv.style.display==="none"||!adv.style.display) ? "grid":"none";
    document.getElementById("toggleAvancado").textContent = adv.style.display==="grid" ? "– Avançado" : "+ Avançado";
  });
  document.getElementById("finSalvar")?.addEventListener("click", salvarFinanceiro);

  // Modal Detalhes
  const m2=document.getElementById("modalDet");
  document.getElementById("detFechar")?.addEventListener("click", ()=> m2.style.display="none");
  m2?.addEventListener("click", (e)=>{ if(e.target===m2) m2.style.display="none"; });

  // Toggle charts
  document.getElementById("btnToggleCharts")?.addEventListener("click", ()=>{
    const wrap=document.getElementById("chartsWrap");
    const btn=document.getElementById("btnToggleCharts");
    const showing = wrap.style.display!=="none";
    wrap.style.display = showing ? "none" : "grid";
    btn.textContent = showing ? "Mostrar gráficos" : "Ocultar gráficos";
  });
}

function preencherAnosSelect(){
  const sel=document.getElementById("filtroAno"); if(!sel) return;
  const base=new Date().getFullYear();
  for(let y=base;y>=base-8;y--){ const o=document.createElement("option"); o.value=String(y); o.textContent=y; sel.appendChild(o); }
}

// ===== Lista =====
async function carregarGrid(){
  const anoSel=document.getElementById("filtroAno").value;
  document.getElementById("statusLista").textContent="Carregando…";
  document.getElementById("tbodyFin").innerHTML=""; LISTA=[];

  if(anoSel==="latest") await carregarMaisRecenteViaEmpresas();
  else await carregarPorAnoViaCollectionGroup(parseInt(anoSel,10));

  renderTabela(LISTA); updateStatus(LISTA);
}

async function carregarMaisRecenteViaEmpresas(){
  let q=db.collection("empresas");
  if(CTX.perfil==="rm"&&CTX.uid) q=q.where("rmUid","==",CTX.uid);
  else if((CTX.perfil==="assistente"||CTX.perfil==="gerente chefe")&&CTX.agenciaId){
    let s=await q.where("agenciaId","==",CTX.agenciaId).limit(1000).get();
    if(s.empty) s=await db.collection("empresas").where("agenciaid","==",CTX.agenciaId).limit(1000).get();
    return montarLinhasMaisRecente(s);
  }
  const snap=await q.limit(1000).get(); await montarLinhasMaisRecente(snap);
}
async function montarLinhasMaisRecente(snap){
  if(snap.empty){ document.getElementById("statusLista").textContent="Nenhuma empresa encontrada."; return; }
  const arr=[]; snap.forEach(doc=>{
    const d=doc.data()||{};
    EMPRESAS_CACHE.set(doc.id,{id:doc.id,nome:(d.nome||d.razaoSocial||d.fantasia||"Empresa"),rmUid:(d.rmUid||d.rm||null),agenciaId:(d.agenciaId||d.agenciaid||null)});
    arr.push({
      empresaId:doc.id, empresaNome:d.nome||d.razaoSocial||d.fantasia||"Empresa",
      ano:d.ultimoAnoFinanceiro||null, receita:d.ultimaReceita??null, ebitda:d.ultimoEbitda??null,
      margemEbitda:(Number.isFinite(d.ultimoEbitda)&&Number.isFinite(d.ultimaReceita)&&d.ultimaReceita>0)?(d.ultimoEbitda/d.ultimaReceita):null,
      dividaLiquida:d.ultimaDividaLiquida??null, alavancagem:d.ultimaAlavancagem??null, liquidez:d.ultimaLiquidez??null,
      selo:d.ultimoSeloRisco||null, origem:"denormalizado"
    });
  });
  arr.sort((a,b)=> String(a.empresaNome).localeCompare(String(b.empresaNome),'pt',{sensitivity:'base'}));
  LISTA=arr;
}

async function carregarPorAnoViaCollectionGroup(ano){
  let q=db.collectionGroup("financeiro").where("ano","==",ano);
  if(CTX.perfil==="rm"&&CTX.uid) q=q.where("rmUid","==",CTX.uid);
  else if((CTX.perfil==="assistente"||CTX.perfil==="gerente chefe")&&CTX.agenciaId) q=q.where("agenciaId","==",CTX.agenciaId);
  const snap=await q.limit(2000).get();
  if(snap.empty){ document.getElementById("statusLista").textContent="Nenhum lançamento encontrado para o ano."; return; }
  const arr=[]; snap.forEach(doc=>{
    const d=doc.data()||{};
    if(d.empresaId&&d.empresaNome) EMPRESAS_CACHE.set(d.empresaId,{id:d.empresaId,nome:d.empresaNome,rmUid:d.rmUid||null,agenciaId:d.agenciaId||null});
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
  LISTA=arr;
}

function renderTabela(lista){
  const tbody=document.getElementById("tbodyFin"); tbody.innerHTML="";
  if(!lista.length){ tbody.innerHTML=`<tr><td colspan="10" class="muted" style="padding:18px">Nenhum registro.</td></tr>`; return; }
  for(const it of lista){
    const tr=document.createElement("tr");
    tr.innerHTML=`
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
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll("[data-edit]").forEach(btn=> btn.addEventListener("click", ()=> abrirModalFin(btn.getAttribute("data-edit"), btn.getAttribute("data-ano"))));
  tbody.querySelectorAll("[data-det]").forEach(btn=> btn.addEventListener("click", ()=> abrirRelatorio(btn.getAttribute("data-det"))));
}

function renderSelo(s){ const map={verde:"verde",amarelo:"amarelo",vermelho:"vermelho"}; const cls=map[String(s||"").toLowerCase()]||"amarelo"; const label=s? s.toUpperCase():"—"; return `<span class="chip ${cls}">${label}</span>`; }
function filtrarTabela(){ const termo=(document.getElementById("busca").value||"").trim().toLowerCase(); let base=LISTA.slice(); if(termo){ base=base.filter(it=> String(it.empresaNome).toLowerCase().includes(termo)); } renderTabela(base); updateStatus(base); }
function updateStatus(lista){ const tot=lista.length, rec=lista.reduce((a,x)=>a+(Number.isFinite(x.receita)?x.receita:0),0), ebt=lista.reduce((a,x)=>a+(Number.isFinite(x.ebitda)?x.ebitda:0),0), mm=(rec>0)?(ebt/rec):null; document.getElementById("statusLista").textContent=`${tot} empresa(s) no filtro · Receita total: ${toBRL(rec)} · EBITDA total: ${toBRL(ebt)} · % EBITDA média: ${toPct(mm)}`; }

// ===== Permissão (UI) =====
function podeEditarEmpresa(id){ if(CTX.perfil==="admin") return true; const b=EMPRESAS_CACHE.get(id); if(!b) return false; if(CTX.perfil==="rm"&&b.rmUid===CTX.uid) return true; if((CTX.perfil==="assistente"||CTX.perfil==="gerente chefe")&&b.agenciaId===CTX.agenciaId) return true; return false; }

// ===== Modal Fin =====
let EMPRESA_ALVO=null, ANO_ALVO=null;

function abrirModalFin(empresaId,anoStr){
  EMPRESA_ALVO=EMPRESAS_CACHE.get(empresaId)||{id:empresaId,nome:"Empresa"}; ANO_ALVO=anoStr?parseInt(anoStr,10):null;
  if(!podeEditarEmpresa(empresaId)){ alert("Sem permissão para editar esta empresa."); return; }
  document.getElementById("finEmpresaAlvo").textContent=`${EMPRESA_ALVO.nome} (ID: ${EMPRESA_ALVO.id})`;
  document.getElementById("finErro").textContent=""; document.getElementById("finInfo").textContent="";
  ["finAno","finReceita","finLucroBruto","finEbitda","finLucroLiq","finDividaBruta","finCaixa","finEstoques","finCR","finCP","finDespesaFin","finDistribLucro","finProLabore","finQtdSocios"].forEach(id=>{const el=document.getElementById(id); if(el) el.value="";});
  moneyBindInputs(document.getElementById("modalFin"));

  if(Number.isFinite(ANO_ALVO)){
    document.getElementById("finAno").value=ANO_ALVO;
    db.collection("empresas").doc(EMPRESA_ALVO.id).collection("financeiro").doc(String(ANO_ALVO)).get().then(doc=>{
      if(doc.exists){ const d=doc.data()||{}; setMoney("finReceita",d.receitaLiquida); setMoney("finLucroBruto",d.lucroBruto); setMoney("finEbitda",d.ebitda); setMoney("finLucroLiq",d.lucroLiquido); setMoney("finDividaBruta",d.dividaBruta); setMoney("finCaixa",d.caixa); setMoney("finEstoques",d.estoques); setMoney("finCR",d.contasAReceber); setMoney("finCP",d.contasAPagar); setMoney("finDespesaFin",d.despesaFinanceira); setMoney("finDistribLucro",d.distribuicaoLucros); setMoney("finProLabore",d.proLaboreTotalAnual); const qs=document.getElementById("finQtdSocios"); if(qs) qs.value=d.qtdSocios||0; }
    });
  }

  document.getElementById("modalFin").style.display="block";
}

async function salvarFinanceiro(){
  const err=document.getElementById("finErro"), info=document.getElementById("finInfo"); err.textContent=""; info.textContent="";
  if(!EMPRESA_ALVO?.id){ err.textContent="Empresa inválida."; return; }
  if(!podeEditarEmpresa(EMPRESA_ALVO.id)){ err.textContent="Sem permissão."; return; }
  const ano=parseInt(document.getElementById("finAno").value,10); if(!Number.isFinite(ano)||ano<2000){ err.textContent="Ano inválido."; return; }

  const receita=getMoney("finReceita"), lucroBruto=getMoney("finLucroBruto"), ebitda=getMoney("finEbitda"), lucroLiq=getMoney("finLucroLiq"),
        dividaBruta=getMoney("finDividaBruta"), caixa=getMoney("finCaixa"), estoques=getMoney("finEstoques"),
        cr=getMoney("finCR"), cp=getMoney("finCP");
  const despFin=getMoney("finDespesaFin"), distrLuc=getMoney("finDistribLucro"), proLabore=getMoney("finProLabore"),
        qtdSocios=+document.getElementById("finQtdSocios").value || 0;

  const margemBruta=safeDiv(lucroBruto,receita), margemEbitda=safeDiv(ebitda,receita), margemLiquida=safeDiv(lucroLiq,receita);
  const dividaLiquida=Math.max(dividaBruta - caixa, 0);
  const alavancagem=safeDiv(dividaLiquida, ebitda);
  const liquidez=safeDiv((caixa+cr+estoques), cp);
  const coberturaJuros=safeDiv(ebitda, despFin);

  const sinais=avaliarSinais({margemEbitda,alavancagem,liquidez});
  const selo=consolidarSelo(sinais);

  try{
    const empresaRef=db.collection("empresas").doc(EMPRESA_ALVO.id);
    const finRef=empresaRef.collection("financeiro").doc(String(ano));
    await finRef.set({
      ano, receitaLiquida:receita, lucroBruto, ebitda, lucroLiquido:lucroLiq, dividaBruta, caixa, estoques,
      contasAReceber:cr, contasAPagar:cp, despesaFinanceira:despFin, distribuicaoLucros:distrLuc, proLaboreTotalAnual:proLabore, qtdSocios,
      margemBruta, margemEbitda, margemLiquida, dividaLiquida, alavancagemDivLiqEbitda:alavancagem, liquidezCorrente:liquidez, coberturaJuros,
      sinais, selo, atualizadoEm:firebase.firestore.FieldValue.serverTimestamp(), atualizadoPor:CTX.uid,
      empresaId:EMPRESA_ALVO.id, empresaNome:EMPRESA_ALVO.nome, rmUid:EMPRESA_ALVO.rmUid||null, agenciaId:EMPRESA_ALVO.agenciaId||null
    }, {merge:true});

    await recomputarMaisRecente(empresaRef);

    info.textContent="Lançamento salvo com sucesso!";
    await carregarGrid();
    setTimeout(()=> document.getElementById("modalFin").style.display="none", 600);
  }catch(e){ console.error(e); err.textContent=e?.message||"Erro ao salvar."; }
}

async function recomputarMaisRecente(empresaRef){
  const snap=await empresaRef.collection("financeiro").orderBy("ano","desc").limit(1).get();
  if(snap.empty) return;
  const d=snap.docs[0].data()||{};
  const receita=d.receitaLiquida??null, ebitda=d.ebitda??null;
  const dividaLiquida=(d.dividaLiquida!=null)?d.dividaLiquida:(Number.isFinite(d.dividaBruta)&&Number.isFinite(d.caixa)?Math.max(d.dividaBruta-d.caixa,0):null);
  const alav=(d.alavancagemDivLiqEbitda!=null)?d.alavancagemDivLiqEbitda:(Number.isFinite(dividaLiquida)&&Number.isFinite(ebitda)&&ebitda!==0?dividaLiquida/ebitda:null);
  const liq=(d.liquidezCorrente!=null)?d.liquidezCorrente:null; const selo=d.selo||null;
  await empresaRef.set({ ultimoAnoFinanceiro:d.ano, ultimaReceita:receita, ultimoEbitda:ebitda, ultimaDividaLiquida:dividaLiquida, ultimaAlavancagem:Number.isFinite(alav)?alav:null, ultimaLiquidez:Number.isFinite(liq)?liq:null, ultimoSeloRisco:selo }, {merge:true});
}

// Sinais & selo
function avaliarSinais({margemEbitda,alavancagem,liquidez}){
  const op=(margemEbitda==null)?"amarelo":(margemEbitda<0.04?"vermelho":(margemEbitda<0.08?"amarelo":"verde"));
  const sol=(alavancagem==null)?"amarelo":(alavancagem>3.5?"vermelho":(alavancagem>=1.5?"amarelo":"verde"));
  const liq=(liquidez==null)?"amarelo":(liquidez<1.0?"vermelho":(liquidez<1.2?"amarelo":"verde"));
  return {saudeOperacional:op,solvencia:sol,liquidez:liq};
}
function consolidarSelo(s){ const arr=[s.saudeOperacional,s.solvencia,s.liquidez]; const reds=arr.filter(x=>x==="vermelho").length; const ambs=arr.filter(x=>x==="amarelo").length; if(reds>=2) return "vermelho"; if(reds===1||ambs>=2) return "amarelo"; return "verde"; }

// ===== Relatório com gráficos (colapsáveis) =====
let chart1=null, chart2=null, chart3=null;

async function abrirRelatorio(empresaId){
  const base=EMPRESAS_CACHE.get(empresaId)||{id:empresaId,nome:"Empresa"};
  document.getElementById("detEmpresaAlvo").textContent=`${base.nome} (ID: ${base.id})`;
  const tbody=document.getElementById("detTbody");
  tbody.innerHTML=`<tr><td colspan="14" class="muted">Carregando…</td></tr>`;
  document.getElementById("detResumo").innerHTML="";
  destroyCharts();
  // gráficos começam ocultos
  const chartsWrap=document.getElementById("chartsWrap"); const btn=document.getElementById("btnToggleCharts");
  chartsWrap.style.display="none"; btn.textContent="Mostrar gráficos";

  try{
    const snap=await db.collection("empresas").doc(base.id).collection("financeiro").orderBy("ano","desc").limit(12).get();
    const rows=[]; snap.forEach(doc=>{ const d=doc.data()||{}; rows.push({
      ano:d.ano, receita:d.receitaLiquida??null, ebitda:d.ebitda??null,
      margem:(Number.isFinite(d.ebitda)&&Number.isFinite(d.receitaLiquida)&&d.receitaLiquida>0)?d.ebitda/d.receitaLiquida:(d.margemEbitda??null),
      dl:d.dividaLiquida ?? (Number.isFinite(d.dividaBruta)&&Number.isFinite(d.caixa)?Math.max(d.dividaBruta-d.caixa,0):null),
      alav:d.alavancagemDivLiqEbitda??null, liq:d.liquidezCorrente??null, selo:d.selo||null
    }); });

    // gráficos: ascendente
    const asc=[...rows].sort((a,b)=> a.ano-b.ano);
    const labels=asc.map(r=>String(r.ano)), receita=asc.map(r=>r.receita??null), ebitda=asc.map(r=>r.ebitda??null),
          margem=asc.map(r=> r.margem!=null ? (r.margem*100) : null), alav=asc.map(r=>r.alav??null), liq=asc.map(r=>r.liq??null);

    // cria gráficos somente quando o usuário clicar para abrir
    const ensureCharts=()=>{
      if(chart1||chart2||chart3) return; // já criados
      chart1=new Chart(document.getElementById("chartReceitaEbitda").getContext("2d"),{
        type:"line", data:{labels, datasets:[{label:"Receita",data:receita,tension:.3,borderWidth:2,pointRadius:3},{label:"EBITDA",data:ebitda,tension:.3,borderWidth:2,pointRadius:3}]},
        options:{plugins:{legend:{display:true},tooltip:{mode:"index",intersect:false,callbacks:{label:(c)=>`${c.dataset.label}: ${toBRL(c.parsed.y)}`}}},
                 scales:{y:{ticks:{callback:(v)=>toBRL(v)}}}, responsive:true, maintainAspectRatio:false, elements:{line:{spanGaps:true}}}});
      chart2=new Chart(document.getElementById("chartMargem").getContext("2d"),{
        type:"bar", data:{labels,datasets:[{label:"Margem EBITDA (%)",data:margem,borderWidth:1}]},
        options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:(c)=>`Margem: ${Number(c.parsed.y).toLocaleString("pt-BR",{maximumFractionDigits:1})}%`}}},
                 scales:{y:{ticks:{callback:(v)=>`${Number(v).toLocaleString("pt-BR")} %`}}}, responsive:true, maintainAspectRatio:false}});
      chart3=new Chart(document.getElementById("chartAlavancagemLiquidez").getContext("2d"),{
        type:"line", data:{labels,datasets:[{label:"DL/EBITDA (x)",data:alav,yAxisID:"y1",tension:.3,borderWidth:2,pointRadius:3},{label:"Liquidez",data:liq,yAxisID:"y2",tension:.3,borderWidth:2,pointRadius:3}]},
        options:{plugins:{legend:{display:true},tooltip:{mode:"index",intersect:false,callbacks:{label:(c)=>{const v=Number(c.parsed.y);return `${c.dataset.label}: ${Number.isFinite(v)?v.toLocaleString("pt-BR",{maximumFractionDigits:2}):"—"}`;}}}},
                 scales:{y1:{position:"left",title:{display:true,text:"DL/EBITDA (x)"},ticks:{callback:(v)=>Number(v).toLocaleString("pt-BR")}},
                        y2:{position:"right",title:{display:true,text:"Liquidez"},grid:{drawOnChartArea:false},ticks:{callback:(v)=>Number(v).toLocaleString("pt-BR")}}},
                 responsive:true, maintainAspectRatio:false, elements:{line:{spanGaps:true}}});
    };

    // botão abre/fecha e cria gráficos no primeiro abrir
    document.getElementById("btnToggleCharts").onclick=()=>{
      const showing = chartsWrap.style.display!=="none";
      if(showing){ chartsWrap.style.display="none"; document.getElementById("btnToggleCharts").textContent="Mostrar gráficos"; }
      else { chartsWrap.style.display="grid"; document.getElementById("btnToggleCharts").textContent="Ocultar gráficos"; ensureCharts(); }
    };

    // tabela desc
    const desc=[...rows].sort((a,b)=> b.ano-a.ano);
    tbody.innerHTML="";
    for(let i=0;i<desc.length;i++){
      const r=desc[i], nxt=desc[i+1]||null;
      const delta=(a,b)=> (Number.isFinite(a)&&Number.isFinite(b))?a-b:null;
      const dRec=nxt?delta(r.receita,nxt.receita):null, dEbt=nxt?delta(r.ebitda,nxt.ebitda):null, dMar=nxt?delta(r.margem,nxt.margem):null, dAlv=nxt?delta(r.alav,nxt.alav):null, dLiq=nxt?delta(r.liq,nxt.liq):null;

      const tr=document.createElement("tr");
      tr.innerHTML=`
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
        <td>${renderDeltaNum(dAlv,true)}</td>
        <td>${renderDeltaNum(dLiq)}</td>
        <td><button class="btn outline" data-editano="${r.ano}" data-editempresa="${base.id}">Editar</button></td>`;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll("[data-editano]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const ano=btn.getAttribute("data-editano"), emp=btn.getAttribute("data-editempresa");
        document.getElementById("modalDet").style.display="none"; abrirModalFin(emp, ano);
      });
    });

    // Resumo
    const ord=[...rows].sort((a,b)=> b.ano-a.ano);
    if(ord.length>=2){
      const a=ord[0], b=ord[1];
      const mk=(label,val,fmt)=> `<div><strong>${label}:</strong> ${fmt(val)}</div>`;
      document.getElementById("detResumo").innerHTML=`
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          ${mk("Receita",a.receita,toBRL)} ${mk("EBITDA",a.ebitda,toBRL)} ${mk("Margem EBITDA",a.margem,toPct)}
          ${mk("Dívida Líquida",a.dl,toBRL)} ${mk("DL/EBITDA",a.alav,(x)=>Number.isFinite(x)?clamp2(x):"—")} ${mk("Liquidez Corrente",a.liq,(x)=>Number.isFinite(x)?clamp2(x):"—")}
        </div>`;
    }
  }catch(e){ console.error(e); tbody.innerHTML=`<tr><td colspan="14" class="muted">Erro ao carregar (${e.message}).</td></tr>`; }

  document.getElementById("modalDet").style.display="block";
}

function renderDeltaMoeda(v){ if(v==null) return `<span class="delta neu">—</span>`; const cls=v>0?"pos":(v<0?"neg":"neu"); return `<span class="delta ${cls}">${v>0?"↑":"↓"} ${toBRL(Math.abs(v))}</span>`; }
function renderDeltaPct(v){ if(v==null) return `<span class="delta neu">—</span>`; const cls=v>0?"pos":(v<0?"neg":"neu"); const pct=(v*100); const str=(Number.isFinite(pct)? pct.toLocaleString("pt-BR",{maximumFractionDigits:1})+" p.p.":"—"); return `<span class="delta ${cls}">${v>0?"↑":"↓"} ${str}</span>`; }
function renderDeltaNum(v,invert=false){ if(v==null) return `<span class="delta neu">—</span>`; const good=invert?(v<0):(v>0); const bad=invert?(v>0):(v<0); const cls=good?"pos":(bad?"neg":"neu"); const arrow=v>0?"↑":(v<0?"↓":"•"); const val=Number.isFinite(v)?clamp2(Math.abs(v)):"—"; return `<span class="delta ${cls}">${arrow} ${val}</span>`; }
function destroyCharts(){ try{chart1&&chart1.destroy();}catch(e){} try{chart2&&chart2.destroy();}catch(e){} try{chart3&&chart3.destroy();}catch(e){} chart1=chart2=chart3=null; }
