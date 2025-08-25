// financeiro.js — Esqueleto MVP (Firebase v8)

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };
let LISTA = []; // linhas renderizadas
let EMPRESAS_CACHE = new Map(); // empresaId -> dados básicos (nome, rmUid, agenciaId, etc.)

// ===== Helpers comuns =====
const normalizarPerfil = (p)=>String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[-_]+/g," ").trim();

const toBRL = (n)=> (Number.isFinite(n) ? n.toLocaleString("pt-BR", {style:"currency", currency:"BRL"}) : "—");
const toPct = (n)=> (Number.isFinite(n) ? (n*100).toLocaleString("pt-BR", {maximumFractionDigits:1})+"%" : "—");
const safeDiv = (a,b)=> (b && Math.abs(b)>0 ? a/b : null);
const clamp2 = (n)=> Number.isFinite(n) ? Math.round(n*100)/100 : null;

const toDate  = (x)=> x?.toDate ? x.toDate() : (x ? new Date(x) : null);
const fmtDataHora = (d)=> d ? d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-";

function escapeHtml(s){
  return String(s==null?"":s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
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

  // Modal
  const modal = document.getElementById("modalFin");
  document.getElementById("finFechar")?.addEventListener("click", ()=> modal.style.display="none");
  modal?.addEventListener("click", (e)=>{ if(e.target===modal) modal.style.display="none"; });

  const tgl = document.getElementById("toggleAvancado");
  tgl?.addEventListener("click", ()=>{
    const adv = document.getElementById("avancado");
    adv.style.display = (adv.style.display==="none" || !adv.style.display) ? "grid" : "none";
    tgl.textContent = adv.style.display==="grid" ? "– Avançado" : "+ Avançado";
  });

  document.getElementById("finSalvar")?.addEventListener("click", salvarFinanceiro);
}

// Preenche select de anos (ultimos 8 anos + Mais recente)
function preencherAnosSelect(){
  const sel = document.getElementById("filtroAno");
  if(!sel) return;
  const hoje = new Date();
  const base = hoje.getFullYear();
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
    // tenta agenciaId e fallback agenciaid
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

// Visão por ano — usa collectionGroup('financeiro') com campos denormalizados
async function carregarPorAnoViaCollectionGroup(ano){
  let q = db.collectionGroup("financeiro").where("ano","==",ano);

  // filtro por perfil (com base nos campos denormalizados do doc anual)
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
    // garantir empresa no cache para edição posterior
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
        <button class="btn" data-edit="${it.empresaId}" data-ano="${it.ano ?? ""}">Editar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=> abrirModalFin(btn.getAttribute("data-edit"), btn.getAttribute("data-ano")));
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
    base = base.filter(it =>
      String(it.empresaNome).toLowerCase().includes(termo)
    );
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

  // se ano conhecido, pré‑preencher com tentativa de buscar o doc
  if(Number.isFinite(ANO_ALVO)){
    document.getElementById("finAno").value = ANO_ALVO;
    // tenta ler o doc anual
    db.collection("empresas").doc(EMPRESA_ALVO.id).collection("financeiro").doc(String(ANO_ALVO)).get().then(doc=>{
      if(doc.exists){
        const d = doc.data()||{};
        setVal("finReceita", d.receitaLiquida);
        setVal("finLucroBruto", d.lucroBruto);
        setVal("finEbitda", d.ebitda);
        setVal("finLucroLiq", d.lucroLiquido);
        setVal("finDividaBruta", d.dividaBruta);
        setVal("finCaixa", d.caixa);
        setVal("finEstoques", d.estoques);
        setVal("finCR", d.contasAReceber);
        setVal("finCP", d.contasAPagar);
        setVal("finDespesaFin", d.despesaFinanceira);
        setVal("finDistribLucro", d.distribuicaoLucros);
        setVal("finProLabore", d.proLaboreTotalAnual);
        setVal("finQtdSocios", d.qtdSocios);
      }
    });
  }

  document.getElementById("modalFin").style.display = "block";
}
function setVal(id, v){ const el=document.getElementById(id); if(el && v!=null) el.value = v; }

// ===== Salvar =====
async function salvarFinanceiro(){
  const err = document.getElementById("finErro");
  const info= document.getElementById("finInfo");
  err.textContent=""; info.textContent="";

  if(!EMPRESA_ALVO?.id){ err.textContent="Empresa inválida."; return; }
  if(!podeEditarEmpresa(EMPRESA_ALVO.id)){ err.textContent="Sem permissão."; return; }

  const ano = parseInt(document.getElementById("finAno").value,10);
  if(!Number.isFinite(ano) || ano<2000){ err.textContent="Ano inválido."; return; }

  // Núcleo
  const receita = +document.getElementById("finReceita").value || 0;
  const lucroBruto = +document.getElementById("finLucroBruto").value || 0;
  const ebitda = +document.getElementById("finEbitda").value || 0;
  const lucroLiq = +document.getElementById("finLucroLiq").value || 0;
  const dividaBruta = +document.getElementById("finDividaBruta").value || 0;
  const caixa = +document.getElementById("finCaixa").value || 0;
  const estoques = +document.getElementById("finEstoques").value || 0;
  const cr = +document.getElementById("finCR").value || 0;
  const cp = +document.getElementById("finCP").value || 0;

  // Avançado (opcional)
  const despFin = +document.getElementById("finDespesaFin").value || 0;
  const distrLuc = +document.getElementById("finDistribLucro").value || 0;
  const proLabore= +document.getElementById("finProLabore").value || 0;
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
      // núcleo
      receitaLiquida: receita,
      lucroBruto, ebitda, lucroLiquido: lucroLiq,
      dividaBruta, caixa, estoques,
      contasAReceber: cr, contasAPagar: cp,
      // avançado
      despesaFinanceira: despFin,
      distribuicaoLucros: distrLuc,
      proLaboreTotalAnual: proLabore,
      qtdSocios: qtdSocios,
      // derivados
      margemBruta, margemEbitda, margemLiquida,
      dividaLiquida, alavancagemDivLiqEbitda: alavancagem,
      liquidezCorrente: liquidez, coberturaJuros,
      sinais, selo,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoPor: CTX.uid,

      // denormalizados p/ filtros rápidos na collectionGroup
      empresaId: EMPRESA_ALVO.id,
      empresaNome: EMPRESA_ALVO.nome,
      rmUid: EMPRESA_ALVO.rmUid || null,
      agenciaId: EMPRESA_ALVO.agenciaId || null
    }, { merge:true });

    // Atualiza denormalizados na raiz da empresa SE for o mais recente
    await empresaRef.set({
      ultimoAnoFinanceiro: ano,
      ultimoEbitda: ebitda,
      ultimaReceita: receita,
      ultimaDividaLiquida: dividaLiquida,
      ultimaAlavancagem: Number.isFinite(alavancagem) ? alavancagem : null,
      ultimaLiquidez: Number.isFinite(liquidez) ? liquidez : null,
      ultimoSeloRisco: selo
    }, { merge:true });

    info.textContent = "Lançamento salvo com sucesso!";
    // Atualiza a grade mantendo contexto de filtro
    await carregarGrid();
    setTimeout(()=> document.getElementById("modalFin").style.display="none", 700);
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
