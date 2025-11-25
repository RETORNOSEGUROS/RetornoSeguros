// ================== BOOT ==================
console.log("=== Financeiro.js carregado ===");
console.log("Firebase disponível:", typeof firebase !== 'undefined');
console.log("firebaseConfig disponível:", typeof firebaseConfig !== 'undefined');

if (!firebase.apps.length) {
  try {
    firebase.initializeApp(firebaseConfig);
    console.log("✅ Firebase inicializado com sucesso");
  } catch(e) {
    console.error("❌ Erro ao inicializar Firebase:", e);
  }
} else {
  console.log("✅ Firebase já estava inicializado");
}

const auth = firebase.auth();
const db   = firebase.firestore();

console.log("Auth disponível:", !!auth);
console.log("Firestore disponível:", !!db);

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };
let LISTA = [];
let EMPRESAS_CACHE = new Map();

// Charts
let chart1, chart2, chart3, chart4, chart5;

// ================== HELPERS ==================
const normalizarPerfil = (p)=>String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[-_]+/g," ").trim();
const toBRL = (n)=> (Number.isFinite(n) ? n.toLocaleString("pt-BR", {style:"currency", currency:"BRL"}) : "—");
const toPct = (n)=> (Number.isFinite(n) ? (n*100).toLocaleString("pt-BR", {maximumFractionDigits:1})+"%" : "—");
const safeDiv = (a,b)=> (b && Math.abs(b)>0 ? a/b : null);
const clamp2 = (n)=> Number.isFinite(n) ? Math.round(n*100)/100 : null;
function escapeHtml(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

// Moeda BRL
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

// ================== AUTH ==================
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
      const perfilEl = document.getElementById("perfilUsuario");
      if(perfilEl) {
        perfilEl.innerHTML = `<span>${CTX.nome}</span><span style="opacity:.7">${d.perfil||"admin"}</span>`;
      }
    } else {
      CTX.perfil = "admin";
      CTX.nome   = user.email || "Usuário";
      const perfilEl = document.getElementById("perfilUsuario");
      if(perfilEl) {
        perfilEl.innerHTML = `<span>${CTX.nome}</span><span style="opacity:.7">admin</span>`;
      }
    }
  } catch (e) {
    console.error("[AUTH] Erro ao carregar perfil:", e);
    CTX.perfil = "admin";
    CTX.nome   = user.email || "Usuário";
    const perfilEl = document.getElementById("perfilUsuario");
    if(perfilEl) {
      perfilEl.innerHTML = `<span>${CTX.nome}</span><span style="opacity:.7">admin</span>`;
    }
  }

  console.log("[AUTH] Usuário autenticado:", CTX.nome, "Perfil:", CTX.perfil);
  
  wireUi();
  preencherAnosSelect();
  moneyBindInputs();
  
  // Carrega os dados após um pequeno delay para garantir que o DOM está pronto
  setTimeout(()=> {
    carregarGrid();
  }, 100);
});

// ================== UI BINDINGS ==================
function wireUi(){
  console.log("[wireUi] Configurando event listeners...");
  
  const btnRecarregar = document.getElementById("btnRecarregar");
  if(btnRecarregar) btnRecarregar.addEventListener("click", carregarGrid);
  
  const busca = document.getElementById("busca");
  if(busca) busca.addEventListener("input", filtrarTabela);
  
  const filtroAno = document.getElementById("filtroAno");
  if(filtroAno) filtroAno.addEventListener("change", carregarGrid);
  
  const btnVoltarPainel = document.getElementById("btnVoltarPainel");
  if(btnVoltarPainel) {
    btnVoltarPainel.addEventListener("click", ()=>{
      if (document.referrer) history.back();
      else location.href = "empresas.html";
    });
  }

  // Modal Lançar/Editar
  const modal = document.getElementById("modalFin");
  const finFechar = document.getElementById("finFechar");
  const finCancelar = document.getElementById("finCancelar");
  
  if(finFechar) finFechar.addEventListener("click", ()=> {
    if(modal) modal.style.display="none";
  });
  
  if(finCancelar) finCancelar.addEventListener("click", ()=> {
    if(modal) modal.style.display="none";
  });
  
  if(modal) {
    modal.addEventListener("click", (e)=>{ 
      if(e.target===modal) modal.style.display="none"; 
    });
  }
  
  const toggleAvancado = document.getElementById("toggleAvancado");
  if(toggleAvancado) {
    toggleAvancado.addEventListener("click", ()=>{
      const adv = document.getElementById("avancado");
      if(!adv) return;
      const isVisible = adv.style.display === "block";
      adv.style.display = isVisible ? "none" : "block";
      toggleAvancado.textContent = isVisible ? "➕ Dados Complementares (Opcional)" : "➖ Dados Complementares (Opcional)";
    });
  }
  
  const finSalvar = document.getElementById("finSalvar");
  if(finSalvar) finSalvar.addEventListener("click", salvarFinanceiro);

  // Modal Detalhes
  const m2 = document.getElementById("modalDet");
  const detFechar = document.getElementById("detFechar");
  const detVoltar = document.getElementById("detVoltar");
  
  if(detFechar) detFechar.addEventListener("click", ()=> {
    if(m2) m2.style.display="none";
  });
  
  if(detVoltar) detVoltar.addEventListener("click", ()=> {
    if(m2) m2.style.display="none";
  });
  
  if(m2) {
    m2.addEventListener("click", (e)=>{ 
      if(e.target===m2) m2.style.display="none"; 
    });
  }
  
  console.log("[wireUi] Event listeners configurados");
}

function preencherAnosSelect(){
  const sel = document.getElementById("filtroAno");
  if(!sel) {
    console.error("[preencherAnosSelect] Elemento filtroAno não encontrado");
    return;
  }
  
  const base = new Date().getFullYear();
  for(let y=base; y>=base-8; y--){
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = y;
    sel.appendChild(opt);
  }
  
  console.log("[preencherAnosSelect] Anos adicionados ao select");
}

// ================== CARREGAMENTO PRINCIPAL ==================
async function carregarGrid(){
  const status = document.getElementById("statusLista");
  const tbody = document.getElementById("tbodyFin");
  status.innerHTML = '<div class="loading">Carregando dados financeiros...</div>';
  tbody.innerHTML = "";
  LISTA = [];

  try{
    const anoSel = document.getElementById("filtroAno").value;
    console.log("[carregarGrid] Ano selecionado:", anoSel);
    
    // Sempre usa a abordagem via empresas (mais compatível com regras de segurança)
    if(anoSel === "latest"){
      await carregarMaisRecenteViaEmpresas();
    }else{
      const ano = parseInt(anoSel,10);
      await carregarPorAnoViaEmpresas(ano);
    }
    
    console.log("[carregarGrid] Total de registros carregados:", LISTA.length);
    renderTabela(LISTA);
    updateStatus(LISTA);
  }catch(e){
    console.error("[carregarGrid] erro:", e);
    
    let mensagemErro = e.message || "Erro desconhecido";
    if(e.code === "permission-denied" || mensagemErro.includes("permission")){
      mensagemErro = "Sem permissão para acessar os dados. Verifique seu login.";
    }
    
    status.innerHTML = `<div style="color:#ef4444; padding:20px; text-align:center">
      ❌ ${mensagemErro}<br>
      <button class="btn btn-outline" onclick="carregarGrid()" style="margin-top:12px">Tentar novamente</button>
    </div>`;
    renderTabela([]);
  }
}

async function carregarMaisRecenteViaEmpresas(){
  console.log("[carregarMaisRecenteViaEmpresas] Iniciando carregamento...");
  
  try {
    const empSnap = await db.collection("empresas_banco").get();
    console.log("[carregarMaisRecenteViaEmpresas] Empresas encontradas:", empSnap.size);
    
    if(empSnap.empty){
      console.log("[carregarMaisRecenteViaEmpresas] Nenhuma empresa encontrada na coleção");
      return;
    }
    
    const proms = [];
    empSnap.forEach(empDoc=>{
      const empId = empDoc.id;
      const empData = empDoc.data();
      const nomeEmpresa = empData.nomeEmpresa || empData.nome || "(sem nome)";
      
      EMPRESAS_CACHE.set(empId, {
        id:empId, 
        nome:nomeEmpresa, 
        rmUid:empData.rmUid, 
        agenciaId:empData.agenciaId
      });
      
      proms.push(
        db.collection("empresas_banco").doc(empId).collection("fin_anual")
          .orderBy("ano","desc").limit(1).get()
          .then(s=>{
            if(!s.empty){
              const finDoc = s.docs[0];
              const fd = finDoc.data();
              console.log(`[OK] ${nomeEmpresa} - Ano: ${fd.ano}`);
              return {empresaId:empId, ano:fd.ano, docId:finDoc.id, ...fd};
            }
            console.log(`[INFO] ${nomeEmpresa} - Sem dados financeiros`);
            return null;
          })
          .catch(err=>{
            console.error(`[ERRO] ${nomeEmpresa}:`, err.message);
            return null;
          })
      );
    });
    
    const arr = await Promise.all(proms);
    LISTA = arr.filter(x=>x!=null);
    console.log("[carregarMaisRecenteViaEmpresas] Registros válidos:", LISTA.length);
  } catch(e) {
    console.error("[carregarMaisRecenteViaEmpresas] Erro geral:", e);
    throw e;
  }
}

// Carrega por ano específico iterando sobre empresas (não usa collectionGroup)
async function carregarPorAnoViaEmpresas(ano){
  console.log("[carregarPorAnoViaEmpresas] Carregando ano:", ano);
  
  try {
    const empSnap = await db.collection("empresas_banco").get();
    console.log("[carregarPorAnoViaEmpresas] Empresas encontradas:", empSnap.size);
    
    if(empSnap.empty){
      console.log("[carregarPorAnoViaEmpresas] Nenhuma empresa encontrada na coleção");
      return;
    }
    
    const proms = [];
    empSnap.forEach(empDoc=>{
      const empId = empDoc.id;
      const empData = empDoc.data();
      const nomeEmpresa = empData.nomeEmpresa || empData.nome || "(sem nome)";
      
      EMPRESAS_CACHE.set(empId, {
        id:empId, 
        nome:nomeEmpresa, 
        rmUid:empData.rmUid, 
        agenciaId:empData.agenciaId
      });
      
      proms.push(
        db.collection("empresas_banco").doc(empId).collection("fin_anual")
          .where("ano","==",ano).limit(1).get()
          .then(s=>{
            if(!s.empty){
              const finDoc = s.docs[0];
              const fd = finDoc.data();
              console.log(`[OK] ${nomeEmpresa} - Ano: ${fd.ano}`);
              return {empresaId:empId, ano:fd.ano, docId:finDoc.id, ...fd};
            }
            return null;
          })
          .catch(err=>{
            console.error(`[ERRO] ${nomeEmpresa}:`, err.message);
            return null;
          })
      );
    });
    
    const arr = await Promise.all(proms);
    LISTA = arr.filter(x=>x!=null);
    console.log("[carregarPorAnoViaEmpresas] Registros válidos:", LISTA.length);
  } catch(e) {
    console.error("[carregarPorAnoViaEmpresas] Erro geral:", e);
    throw e;
  }
}

function updateStatus(arr){
  const st = document.getElementById("statusLista");
  if(!st) {
    console.error("[updateStatus] Elemento statusLista não encontrado");
    return;
  }
  
  if(!arr || !arr.length){
    st.innerHTML = `
      <div style="padding:40px; text-align:center">
        <div style="font-size:48px; margin-bottom:16px">📊</div>
        <div style="font-size:16px; font-weight:600; color:var(--text-primary); margin-bottom:8px">
          Nenhum dado financeiro encontrado
        </div>
        <div style="font-size:14px; color:var(--text-muted)">
          Selecione outro ano ou adicione dados financeiros às empresas
        </div>
      </div>
    `;
  }else{
    st.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; padding:12px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px">
        <div style="font-size:24px">✅</div>
        <div>
          <div style="font-weight:600; color:var(--text-primary)">
            ${arr.length} ${arr.length===1? "empresa":"empresas"} encontrada(s)
          </div>
          <div style="font-size:12px; color:var(--text-secondary)">
            Dados carregados com sucesso
          </div>
        </div>
      </div>
    `;
  }
}

// ================== RENDERIZAR TABELA ==================
function renderTabela(arr){
  const tbody = document.getElementById("tbodyFin");
  if(!tbody) {
    console.error("[renderTabela] Elemento tbodyFin não encontrado");
    return;
  }
  
  tbody.innerHTML = "";
  
  if(!arr || !arr.length) {
    console.log("[renderTabela] Nenhum dado para renderizar");
    return;
  }

  console.log("[renderTabela] Renderizando", arr.length, "linhas");

  arr.forEach((row, index)=>{
    try {
      const info = EMPRESAS_CACHE.get(row.empresaId) || {nome:"(sem nome)"};
      const calc = calcularIndicadores(row);
      const score = calcularScore(calc);
      const status = getStatusFinanceiro(score);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight:600">${escapeHtml(info.nome)}</td>
        <td>${row.ano || "—"}</td>
        <td>
          <div style="display:flex; align-items:center; gap:8px">
            <div class="score-badge ${status.classe}" style="width:50px; height:50px; font-size:16px">
              ${score}
            </div>
            <div style="font-size:11px; color:var(--text-muted)">${status.label}</div>
          </div>
        </td>
        <td>${toBRL(calc.receita)}</td>
        <td>${toBRL(calc.ebitda)}</td>
        <td>
          <span class="chip ${calc.margem>=0.15? "chip-success" : calc.margem>=0.08? "chip-warning" : "chip-danger"}">
            ${toPct(calc.margem)}
          </span>
        </td>
        <td>
          <span class="chip ${calc.alav<=1.5? "chip-success" : calc.alav<=3? "chip-warning" : "chip-danger"}">
            ${calc.alav!=null? clamp2(calc.alav)+"x" : "—"}
          </span>
        </td>
        <td>
          <span class="chip ${calc.liq>=1.5? "chip-success" : calc.liq>=1? "chip-warning" : "chip-danger"}">
            ${calc.liq!=null? clamp2(calc.liq) : "—"}
          </span>
        </td>
        <td>
          <span class="chip ${calc.roe>=0.15? "chip-success" : calc.roe>=0.08? "chip-info" : "chip-neutral"}">
            ${calc.roe!=null? toPct(calc.roe) : "—"}
          </span>
        </td>
        <td>
          <span class="chip chip-${status.classe}">
            ${status.icon} ${status.label}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px">
            <button class="btn btn-outline" style="padding:6px 10px; font-size:12px" 
              onclick="abrirModalDetalhes('${row.empresaId}')">
              📊 Análise
            </button>
            <button class="btn btn-outline" style="padding:6px 10px; font-size:12px" 
              onclick="abrirModalEdicao('${row.empresaId}',${row.ano},'${row.docId || ''}')">
              ✏️ Editar
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    } catch(e) {
      console.error(`[renderTabela] Erro ao renderizar linha ${index}:`, e, row);
    }
  });
  
  console.log("[renderTabela] Renderização concluída");
}

function getStatusFinanceiro(score){
  if(score >= 80) return {classe:"success", label:"Excelente", icon:"🟢"};
  if(score >= 65) return {classe:"info", label:"Bom", icon:"🔵"};
  if(score >= 50) return {classe:"warning", label:"Regular", icon:"🟡"};
  return {classe:"danger", label:"Atenção", icon:"🔴"};
}

// ================== CALCULAR INDICADORES ==================
function calcularIndicadores(d){
  if(!d) {
    console.warn("[calcularIndicadores] Dados não fornecidos");
    return criarIndicadoresVazios();
  }
  
  // Garantir que todos os valores sejam números válidos
  const getNum = (val) => {
    const n = Number(val);
    return (isNaN(n) || !isFinite(n)) ? 0 : n;
  };
  
  const receita = getNum(d.receita);
  const ebitda = getNum(d.ebitda);
  const lucroBruto = getNum(d.lucroBruto);
  const lucroLiq = getNum(d.lucroLiq);
  const dividaBruta = getNum(d.dividaBruta);
  const caixa = getNum(d.caixa);
  const estoques = getNum(d.estoques);
  const cr = getNum(d.contasReceber);
  const cp = getNum(d.contasPagar);
  const despFin = getNum(d.despesaFin);
  const pl = getNum(d.pl);
  const ativo = getNum(d.ativo);
  const cmv = getNum(d.cmv);
  const ativoCirc = getNum(d.ativoCirc);
  const passivoCirc = getNum(d.passivoCirc);

  // Dívida Líquida
  const dl = dividaBruta - caixa;
  
  // Margens
  const margem = safeDiv(ebitda, receita);
  const margemBruta = safeDiv(lucroBruto, receita);
  const margemLiq = safeDiv(lucroLiq, receita);
  
  // Endividamento
  const alav = safeDiv(dl, ebitda);
  const dlSobrePL = safeDiv(dl, pl);
  const endividamento = safeDiv(dividaBruta, ativo);
  const composicaoEnd = safeDiv(dividaBruta, (dividaBruta + pl));
  
  // Liquidez
  const liq = safeDiv(caixa + cr + estoques, cp);
  const liqSeca = safeDiv(caixa + cr, cp);
  const liqImediata = safeDiv(caixa, cp);
  const liqCorrente = safeDiv(ativoCirc, passivoCirc);
  
  // Rentabilidade
  const roe = safeDiv(lucroLiq, pl);
  const roa = safeDiv(lucroLiq, ativo);
  const roic = safeDiv(lucroLiq, (pl + dividaBruta));
  
  // Eficiência
  const giroAtv = safeDiv(receita, ativo);
  const alavFin = safeDiv(ativo, pl);
  
  // Ciclo Operacional e Financeiro
  const giroEst = safeDiv(cmv, estoques);
  const diasEst = safeDiv(365, giroEst);
  const pmr = safeDiv(cr * 365, receita);
  const pmp = safeDiv(cp * 365, receita);
  const cicloOp = (diasEst || 0) + (pmr || 0);
  const ciclo = cicloOp - (pmp || 0);
  
  // Cobertura
  const juros = safeDiv(ebitda, despFin);
  const coberturaDiv = safeDiv(ebitda, dividaBruta);
  
  // Capital de Giro
  const capGiro = (caixa + cr + estoques) - cp;
  const ccl = ativoCirc - passivoCirc;
  const ncg = (cr + estoques) - cp;
  const ncgRec = safeDiv(ncg, receita);

  return {
    receita, ebitda, lucroBruto, lucroLiq, dividaBruta, caixa, dl,
    margem, margemBruta, margemLiq,
    alav, dlSobrePL, endividamento, composicaoEnd,
    liq, liqSeca, liqImediata, liqCorrente,
    roe, roa, roic,
    giroAtv, alavFin,
    giroEst, diasEst, pmr, pmp, cicloOp, ciclo,
    juros, coberturaDiv,
    capGiro, ccl, ncg, ncgRec,
    estoques, cr, cp, pl, ativo, despFin, cmv
  };
}

function criarIndicadoresVazios(){
  return {
    receita:0, ebitda:0, lucroBruto:0, lucroLiq:0, dividaBruta:0, caixa:0, dl:0,
    margem:null, margemBruta:null, margemLiq:null,
    alav:null, dlSobrePL:null, endividamento:null, composicaoEnd:null,
    liq:null, liqSeca:null, liqImediata:null, liqCorrente:null,
    roe:null, roa:null, roic:null,
    giroAtv:null, alavFin:null,
    giroEst:null, diasEst:null, pmr:null, pmp:null, cicloOp:null, ciclo:null,
    juros:null, coberturaDiv:null,
    capGiro:0, ccl:0, ncg:0, ncgRec:null,
    estoques:0, cr:0, cp:0, pl:0, ativo:0, despFin:0, cmv:0
  };
}

// ================== SISTEMA DE SCORING ==================
function calcularScore(calc){
  let pontos = 0;
  let max = 0;

  // 1. Rentabilidade (30 pontos)
  if(calc.roe !== null){
    max += 10;
    if(calc.roe >= 0.20) pontos += 10;
    else if(calc.roe >= 0.15) pontos += 8;
    else if(calc.roe >= 0.10) pontos += 6;
    else if(calc.roe >= 0.05) pontos += 4;
    else if(calc.roe > 0) pontos += 2;
  }
  
  if(calc.margem !== null){
    max += 10;
    if(calc.margem >= 0.20) pontos += 10;
    else if(calc.margem >= 0.15) pontos += 8;
    else if(calc.margem >= 0.10) pontos += 6;
    else if(calc.margem >= 0.05) pontos += 4;
    else if(calc.margem > 0) pontos += 2;
  }

  if(calc.roa !== null){
    max += 10;
    if(calc.roa >= 0.15) pontos += 10;
    else if(calc.roa >= 0.10) pontos += 8;
    else if(calc.roa >= 0.05) pontos += 6;
    else if(calc.roa > 0) pontos += 3;
  }

  // 2. Alavancagem e Endividamento (25 pontos)
  if(calc.alav !== null){
    max += 15;
    if(calc.alav <= 1.5) pontos += 15;
    else if(calc.alav <= 2.5) pontos += 10;
    else if(calc.alav <= 3.5) pontos += 6;
    else if(calc.alav <= 5) pontos += 3;
  }

  if(calc.composicaoEnd !== null){
    max += 10;
    if(calc.composicaoEnd <= 0.30) pontos += 10;
    else if(calc.composicaoEnd <= 0.50) pontos += 7;
    else if(calc.composicaoEnd <= 0.70) pontos += 4;
    else pontos += 1;
  }

  // 3. Liquidez (20 pontos)
  if(calc.liq !== null){
    max += 12;
    if(calc.liq >= 2.0) pontos += 12;
    else if(calc.liq >= 1.5) pontos += 10;
    else if(calc.liq >= 1.2) pontos += 7;
    else if(calc.liq >= 1.0) pontos += 4;
    else pontos += 1;
  }

  if(calc.liqCorrente !== null){
    max += 8;
    if(calc.liqCorrente >= 2.0) pontos += 8;
    else if(calc.liqCorrente >= 1.5) pontos += 6;
    else if(calc.liqCorrente >= 1.0) pontos += 4;
    else pontos += 1;
  }

  // 4. Eficiência Operacional (15 pontos)
  if(calc.ciclo !== null){
    max += 10;
    if(calc.ciclo <= 0) pontos += 10;
    else if(calc.ciclo <= 30) pontos += 8;
    else if(calc.ciclo <= 60) pontos += 5;
    else if(calc.ciclo <= 90) pontos += 3;
  }

  if(calc.giroAtv !== null){
    max += 5;
    if(calc.giroAtv >= 2.0) pontos += 5;
    else if(calc.giroAtv >= 1.5) pontos += 4;
    else if(calc.giroAtv >= 1.0) pontos += 3;
    else if(calc.giroAtv >= 0.5) pontos += 1;
  }

  // 5. Cobertura de Juros (10 pontos)
  if(calc.juros !== null){
    max += 10;
    if(calc.juros >= 5) pontos += 10;
    else if(calc.juros >= 3) pontos += 7;
    else if(calc.juros >= 2) pontos += 5;
    else if(calc.juros >= 1.5) pontos += 3;
    else if(calc.juros >= 1) pontos += 1;
  }

  return max > 0 ? Math.round((pontos / max) * 100) : 0;
}

// ================== FILTRAR TABELA ==================
function filtrarTabela(){
  const buscaEl = document.getElementById("busca");
  if(!buscaEl) return;
  
  const busca = buscaEl.value.toLowerCase().trim();
  const tbody = document.getElementById("tbodyFin");
  if(!tbody) return;
  
  let visibleCount = 0;
  Array.from(tbody.rows).forEach(row=>{
    try {
      const txt = row.cells[0].textContent.toLowerCase();
      if(txt.includes(busca)) {
        row.style.display = "";
        visibleCount++;
      } else {
        row.style.display = "none";
      }
    } catch(e) {
      console.error("[filtrarTabela] Erro ao filtrar linha:", e);
    }
  });
  
  console.log(`[filtrarTabela] ${visibleCount} empresas visíveis de ${tbody.rows.length}`);
}

// ================== MODAL EDIÇÃO ==================
let EDIT_CTX = null;

async function abrirModalEdicao(empresaId, ano=null, docId=null){
  EDIT_CTX = {empresaId, ano, docId};
  const info = EMPRESAS_CACHE.get(empresaId) || {nome:"(sem nome)"};
  document.getElementById("finEmpresaAlvo").textContent = `Empresa: ${info.nome}`;

  // Limpar formulário
  ["finAno","finReceita","finLucroBruto","finEbitda","finLucroLiq","finDividaBruta","finCaixa",
   "finEstoques","finCR","finCP","finDespesaFin","finDistribLucro","finProLabore","finQtdSocios",
   "finPL","finAtivo","finCMV","finImobilizado","finDepreciacao","finPassivoCirc","finAtivoCirc"]
   .forEach(id=>{ 
     const el=document.getElementById(id);
     if(el) el.value="";
   });

  // Se temos docId, carregar dados
  if(docId){
    try{
      const finDoc = await db.collection("empresas_banco").doc(empresaId).collection("fin_anual").doc(docId).get();
      if(finDoc.exists){
        const d = finDoc.data();
        document.getElementById("finAno").value = d.ano || "";
        setMoney("finReceita", d.receita);
        setMoney("finLucroBruto", d.lucroBruto);
        setMoney("finEbitda", d.ebitda);
        setMoney("finLucroLiq", d.lucroLiq);
        setMoney("finDividaBruta", d.dividaBruta);
        setMoney("finCaixa", d.caixa);
        setMoney("finEstoques", d.estoques);
        setMoney("finCR", d.contasReceber);
        setMoney("finCP", d.contasPagar);
        setMoney("finDespesaFin", d.despesaFin);
        setMoney("finDistribLucro", d.distribLucro);
        setMoney("finProLabore", d.proLabore);
        setMoney("finPL", d.pl);
        setMoney("finAtivo", d.ativo);
        setMoney("finCMV", d.cmv);
        setMoney("finImobilizado", d.imobilizado);
        setMoney("finDepreciacao", d.depreciacao);
        setMoney("finPassivoCirc", d.passivoCirc);
        setMoney("finAtivoCirc", d.ativoCirc);
        document.getElementById("finQtdSocios").value = d.qtdSocios || "";
      }
    }catch(e){
      console.error(e);
    }
  } else if(ano){
    document.getElementById("finAno").value = ano;
  }

  document.getElementById("finErro").style.display="none";
  document.getElementById("finInfo").style.display="none";
  document.getElementById("modalFin").style.display="block";
}
window.abrirModalEdicao = abrirModalEdicao;

async function salvarFinanceiro(){
  const empresaId = EDIT_CTX?.empresaId;
  if(!empresaId) return alert("Erro: empresa não identificada");

  const ano = Number(document.getElementById("finAno").value);
  if(!ano || ano<2000 || ano>2100) return mostrarErro("Ano inválido");

  const dados = {
    ano,
    receita: getMoney("finReceita"),
    lucroBruto: getMoney("finLucroBruto"),
    ebitda: getMoney("finEbitda"),
    lucroLiq: getMoney("finLucroLiq"),
    dividaBruta: getMoney("finDividaBruta"),
    caixa: getMoney("finCaixa"),
    estoques: getMoney("finEstoques"),
    contasReceber: getMoney("finCR"),
    contasPagar: getMoney("finCP"),
    despesaFin: getMoney("finDespesaFin"),
    distribLucro: getMoney("finDistribLucro"),
    proLabore: getMoney("finProLabore"),
    qtdSocios: Number(document.getElementById("finQtdSocios").value) || 0,
    pl: getMoney("finPL"),
    ativo: getMoney("finAtivo"),
    cmv: getMoney("finCMV"),
    imobilizado: getMoney("finImobilizado"),
    depreciacao: getMoney("finDepreciacao"),
    passivoCirc: getMoney("finPassivoCirc"),
    ativoCirc: getMoney("finAtivoCirc"),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try{
    const ref = db.collection("empresas_banco").doc(empresaId).collection("fin_anual");
    
    if(EDIT_CTX.docId){
      await ref.doc(EDIT_CTX.docId).update(dados);
      mostrarInfo("✅ Dados atualizados com sucesso!");
    }else{
      const snap = await ref.where("ano","==",ano).limit(1).get();
      if(!snap.empty){
        await ref.doc(snap.docs[0].id).update(dados);
        mostrarInfo("✅ Dados do ano já existiam e foram atualizados!");
      }else{
        await ref.add({...dados, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
        mostrarInfo("✅ Dados salvos com sucesso!");
      }
    }

    setTimeout(()=>{
      document.getElementById("modalFin").style.display="none";
      carregarGrid();
    }, 1500);
  }catch(e){
    console.error(e);
    mostrarErro("Erro ao salvar: " + e.message);
  }
}

function mostrarErro(msg){
  const el = document.getElementById("finErro");
  el.textContent = msg;
  el.style.display = "block";
  document.getElementById("finInfo").style.display="none";
}

function mostrarInfo(msg){
  const el = document.getElementById("finInfo");
  el.textContent = msg;
  el.style.display = "block";
  document.getElementById("finErro").style.display="none";
}

// ================== MODAL ANÁLISE DETALHADA ==================
async function abrirModalDetalhes(empresaId){
  const info = EMPRESAS_CACHE.get(empresaId) || {nome:"(sem nome)"};
  document.getElementById("detEmpresaAlvo").textContent = `Empresa: ${info.nome}`;

  try{
    const snap = await db.collection("empresas_banco").doc(empresaId)
      .collection("fin_anual").orderBy("ano","desc").get();
    
    const rows = snap.docs.map(doc=>({docId:doc.id, ...doc.data()}));
    const rowsCalc = rows.map(r=>({...r, ...calcularIndicadores(r)}));

    // Dashboard de Saúde
    renderHealthDashboard(rowsCalc);

    // Recomendações Inteligentes
    renderRecommendations(rowsCalc, info.nome);

    // Resumo Executivo
    renderResumoExecutivo(rowsCalc);

    // Gráficos
    renderCharts(rowsCalc);

    // Tabela detalhada
    renderTabelaDetalhes(rowsCalc, empresaId);

    // Exportar PDF
    document.getElementById("detPDF").onclick = ()=> exportarPDF(info.nome);

    document.getElementById("modalDet").style.display="block";
  }catch(e){
    console.error(e);
    alert("Erro ao carregar análise: " + e.message);
  }
}
window.abrirModalDetalhes = abrirModalDetalhes;

// ================== DASHBOARD DE SAÚDE FINANCEIRA ==================
function renderHealthDashboard(rows){
  if(!rows.length) return;
  const latest = rows[0];
  const score = calcularScore(latest);
  const status = getStatusFinanceiro(score);

  const html = `
    <div style="background:linear-gradient(135deg, #f8fafc, #e0f2fe); border:1px solid #bae6fd; border-radius:12px; padding:24px; margin-bottom:24px">
      <h4 style="font-size:18px; font-weight:700; margin-bottom:20px; color:#0c4a6e">
        🎯 Dashboard de Saúde Financeira - ${latest.ano}
      </h4>
      
      <div class="health-dashboard">
        <div class="health-card" style="border-left:4px solid var(--${status.classe})">
          <div class="health-label">Score Geral</div>
          <div class="health-value" style="color:var(--${status.classe})">${score}</div>
          <div class="chip chip-${status.classe}">${status.icon} ${status.label}</div>
        </div>
        
        <div class="health-card">
          <div class="health-label">Margem EBITDA</div>
          <div class="health-value">${toPct(latest.margem)}</div>
          <div class="health-trend ${getTrend(rows, 'margem')}">${getTrendText(rows, 'margem')}</div>
        </div>
        
        <div class="health-card">
          <div class="health-label">DL/EBITDA</div>
          <div class="health-value">${latest.alav!=null? clamp2(latest.alav)+"x" : "—"}</div>
          <div class="health-trend ${getTrend(rows, 'alav', true)}">${getTrendText(rows, 'alav', true)}</div>
        </div>
        
        <div class="health-card">
          <div class="health-label">Liquidez Corrente</div>
          <div class="health-value">${latest.liq!=null? clamp2(latest.liq) : "—"}</div>
          <div class="health-trend ${getTrend(rows, 'liq')}">${getTrendText(rows, 'liq')}</div>
        </div>
        
        <div class="health-card">
          <div class="health-label">ROE</div>
          <div class="health-value">${toPct(latest.roe)}</div>
          <div class="health-trend ${getTrend(rows, 'roe')}">${getTrendText(rows, 'roe')}</div>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById("healthDashboard").innerHTML = html;
}

function getTrend(rows, field, invert=false){
  if(rows.length < 2) return "neutral";
  const atual = rows[0][field];
  const anterior = rows[1][field];
  if(atual == null || anterior == null) return "neutral";
  
  const diff = atual - anterior;
  const isPositive = invert ? diff < 0 : diff > 0;
  
  if(Math.abs(diff) < 0.01) return "neutral";
  return isPositive ? "positive" : "negative";
}

function getTrendText(rows, field, invert=false){
  if(rows.length < 2) return "—";
  const atual = rows[0][field];
  const anterior = rows[1][field];
  if(atual == null || anterior == null) return "—";
  
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100;
  const abs = Math.abs(pct);
  const trend = getTrend(rows, field, invert);
  
  if(trend === "neutral") return "• Estável";
  const arrow = trend === "positive" ? "↑" : "↓";
  return `${arrow} ${abs.toFixed(1)}% vs ano anterior`;
}

// ================== RECOMENDAÇÕES INTELIGENTES ==================
function renderRecommendations(rows, nomeEmpresa){
  if(!rows.length) return;
  const latest = rows[0];
  const recomendacoes = gerarRecomendacoes(latest, rows);

  if(!recomendacoes.length){
    document.getElementById("recommendations").innerHTML = `
      <div class="recommendations">
        <h4>💡 Análise Financeira</h4>
        <div class="alert alert-success">
          <strong>✅ Excelente situação financeira!</strong><br>
          A empresa apresenta indicadores saudáveis em todas as áreas analisadas.
        </div>
      </div>
    `;
    return;
  }

  const html = `
    <div class="recommendations">
      <h4>💡 Recomendações e Oportunidades de Melhoria</h4>
      <div style="font-size:13px; color:var(--text-secondary); margin-bottom:16px">
        Análise baseada nos dados de ${latest.ano} • Sistema de diagnóstico automático
      </div>
      ${recomendacoes.map(rec=>`
        <div class="recommendation-item">
          <div class="recommendation-icon">${rec.icon}</div>
          <div class="recommendation-content">
            <div class="recommendation-title">${rec.titulo}</div>
            <div class="recommendation-desc">${rec.descricao}</div>
            ${rec.meta? `<div style="margin-top:6px; font-size:12px; color:var(--accent); font-weight:600">🎯 Meta: ${rec.meta}</div>` : ""}
          </div>
        </div>
      `).join("")}
      
      <div style="margin-top:16px; padding:12px; background:#fff; border-radius:8px; border:1px solid #bae6fd">
        <div style="font-size:13px; font-weight:600; color:#0c4a6e; margin-bottom:4px">
          📋 Para defesa de crédito:
        </div>
        <div style="font-size:12px; color:var(--text-secondary)">
          ${gerarPontosDefesaCredito(latest, recomendacoes)}
        </div>
      </div>
    </div>
  `;

  document.getElementById("recommendations").innerHTML = html;
}

function gerarRecomendacoes(calc, historico){
  const recs = [];
  const previo = historico[1] || null;

  // 1. Margem EBITDA
  if(calc.margem != null && calc.margem < 0.10){
    const metaMargem = calc.margem < 0.05 ? 8 : 12;
    recs.push({
      icon:"📉",
      titulo:"Margem EBITDA Baixa",
      descricao:`A margem EBITDA está em ${toPct(calc.margem)}, abaixo do ideal (≥10%). Isso indica baixa eficiência operacional. Recomenda-se: (1) Revisar estrutura de custos fixos, (2) Renegociar contratos com fornecedores, (3) Avaliar política de precificação, (4) Eliminar desperdícios operacionais.`,
      meta:`Alcançar ${metaMargem}% em 12 meses através de redução de custos em 15-20%`
    });
  } else if(calc.margem != null && calc.margem >= 0.10 && calc.margem < 0.15){
    recs.push({
      icon:"📊",
      titulo:"Oportunidade de Melhoria na Margem",
      descricao:`Margem EBITDA de ${toPct(calc.margem)} está na faixa aceitável, mas pode melhorar. Foque em: (1) Otimização de processos, (2) Automação de tarefas repetitivas, (3) Negociação de melhores condições com fornecedores estratégicos.`,
      meta:`Atingir 15-18% em 18 meses`
    });
  }

  // 2. Alavancagem
  if(calc.alav != null && calc.alav > 3.5){
    recs.push({
      icon:"⚠️",
      titulo:"Endividamento Elevado - Risco Alto",
      descricao:`DL/EBITDA de ${clamp2(calc.alav)}x está acima do limite recomendado (3.5x). Isso representa risco significativo. Ações urgentes: (1) Não contrair novas dívidas, (2) Priorizar geração de caixa para amortização, (3) Renegociar prazos com credores, (4) Considerar venda de ativos não estratégicos, (5) Implementar programa de redução de despesas.`,
      meta:`Reduzir para abaixo de 3.0x em 24 meses, idealmente 2.0x em 36 meses`
    });
  } else if(calc.alav != null && calc.alav >= 2.5 && calc.alav <= 3.5){
    recs.push({
      icon:"🟡",
      titulo:"Endividamento Moderado - Atenção",
      descricao:`DL/EBITDA de ${clamp2(calc.alav)}x está em zona de atenção. Recomenda-se: (1) Evitar novas dívidas até reduzir este índice, (2) Direcionar pelo menos 30% do EBITDA para amortização, (3) Melhorar geração de caixa operacional.`,
      meta:`Reduzir para 1.5-2.0x em 18 meses`
    });
  }

  // 3. Liquidez
  if(calc.liq != null && calc.liq < 1.0){
    recs.push({
      icon:"🚨",
      titulo:"Liquidez Crítica - Risco Imediato",
      descricao:`Liquidez de ${clamp2(calc.liq)} indica que a empresa não tem recursos suficientes para pagar obrigações de curto prazo. Ações imediatas: (1) Renegociar prazos com fornecedores, (2) Acelerar recebimentos (descontos para pagamento antecipado), (3) Reduzir estoques, (4) Buscar linhas de capital de giro, (5) Postergar investimentos não essenciais.`,
      meta:`Elevar para acima de 1.2 em 6 meses, idealmente 1.5+ em 12 meses`
    });
  } else if(calc.liq != null && calc.liq >= 1.0 && calc.liq < 1.3){
    recs.push({
      icon:"💧",
      titulo:"Liquidez Baixa - Atenção ao Fluxo de Caixa",
      descricao:`Liquidez de ${clamp2(calc.liq)} está no limite. Recomenda-se: (1) Monitoramento diário do fluxo de caixa, (2) Políticas mais agressivas de cobrança, (3) Revisar prazos de pagamento e recebimento, (4) Manter reserva de capital de giro.`,
      meta:`Atingir 1.5-2.0 em 12 meses`
    });
  }

  // 4. Ciclo Financeiro
  if(calc.ciclo != null && calc.ciclo > 90){
    const economiaCaixa = (calc.receita / 365) * (calc.ciclo - 60);
    recs.push({
      icon:"⏱️",
      titulo:"Ciclo Financeiro Longo - Caixa Travado",
      descricao:`Ciclo financeiro de ${clamp2(calc.ciclo)} dias está muito longo, travando ${toBRL(economiaCaixa)} em capital de giro. Ações: (1) Reduzir prazo médio de recebimento (oferecer descontos para pagamento à vista), (2) Negociar prazos maiores com fornecedores, (3) Otimizar giro de estoques, (4) Implementar sistema de gestão de crédito mais eficiente.`,
      meta:`Reduzir para 45-60 dias em 12 meses, liberando caixa para crescimento`
    });
  } else if(calc.ciclo != null && calc.ciclo >= 60 && calc.ciclo <= 90){
    recs.push({
      icon:"🔄",
      titulo:"Otimizar Ciclo de Conversão de Caixa",
      descricao:`Ciclo de ${clamp2(calc.ciclo)} dias pode ser melhorado. Foque em: (1) Reduzir PMR (prazo médio de recebimento), (2) Aumentar PMP (prazo médio de pagamento), (3) Melhorar giro de estoques.`,
      meta:`Reduzir para 30-45 dias em 18 meses`
    });
  }

  // 5. Rentabilidade
  if(calc.roe != null && calc.roe < 0.08){
    recs.push({
      icon:"📈",
      titulo:"Rentabilidade sobre Patrimônio Baixa",
      descricao:`ROE de ${toPct(calc.roe)} está abaixo do mínimo aceitável (8-10%). Isso indica baixo retorno para os sócios. Ações: (1) Revisar estratégia de precificação, (2) Melhorar margem operacional, (3) Aumentar giro de ativos, (4) Avaliar alavancagem financeira ótima, (5) Considerar desinvestimento em áreas não rentáveis.`,
      meta:`Atingir 10-15% em 18 meses`
    });
  } else if(calc.roe != null && calc.roe >= 0.08 && calc.roe < 0.12){
    recs.push({
      icon:"💹",
      titulo:"Oportunidade de Aumentar Rentabilidade",
      descricao:`ROE de ${toPct(calc.roe)} está aceitável, mas pode melhorar. Foque em: (1) Aumentar margem líquida, (2) Melhorar giro de ativos, (3) Otimizar estrutura de capital.`,
      meta:`Alcançar 15%+ em 24 meses`
    });
  }

  // 6. Cobertura de Juros
  if(calc.juros != null && calc.juros < 2){
    recs.push({
      icon:"💸",
      titulo:"Cobertura de Juros Insuficiente",
      descricao:`Cobertura de ${calc.juros!=null? clamp2(calc.juros)+"x" : "—"} está abaixo do recomendado (≥2x). A empresa está comprometendo muito EBITDA com despesas financeiras. Ações: (1) Renegociar dívidas para reduzir taxa de juros, (2) Amortizar dívidas mais caras primeiro, (3) Evitar novas dívidas, (4) Melhorar geração de EBITDA.`,
      meta:`Elevar para 3-5x em 24 meses`
    });
  }

  // 7. Capital de Giro Negativo
  if(calc.capGiro != null && calc.capGiro < 0){
    recs.push({
      icon:"⚡",
      titulo:"Capital de Giro Negativo",
      descricao:`Capital de giro negativo de ${toBRL(calc.capGiro)} indica que passivos de curto prazo superam ativos circulantes. Isso é insustentável a médio prazo. Ações urgentes: (1) Aporte de capital pelos sócios, (2) Linha de crédito para capital de giro, (3) Renegociação de dívidas de curto para longo prazo, (4) Melhoria imediata da geração de caixa.`,
      meta:`Tornar positivo em 6-12 meses`
    });
  }

  // 8. Comparação com ano anterior
  if(previo){
    if(calc.receita < previo.receita * 0.95){
      const queda = ((previo.receita - calc.receita) / previo.receita) * 100;
      recs.push({
        icon:"📉",
        titulo:"Queda de Receita",
        descricao:`Receita caiu ${queda.toFixed(1)}% vs ano anterior. Investigue: (1) Perda de clientes, (2) Redução de preços, (3) Fatores de mercado. Ações: (1) Plano de recuperação de market share, (2) Análise de concorrência, (3) Estratégia de retenção de clientes, (4) Novos canais de venda.`,
        meta:`Recuperar crescimento de 5-10% ao ano`
      });
    }

    if(calc.margem && previo.margem && calc.margem < previo.margem * 0.90){
      recs.push({
        icon:"⚠️",
        titulo:"Deterioração da Margem",
        descricao:`Margem EBITDA caiu significativamente vs ano anterior. Ações imediatas: (1) Análise detalhada de custos, (2) Identificar aumento de despesas, (3) Revisar política de preços, (4) Eliminar ineficiências operacionais.`,
        meta:`Recuperar margem anterior em 12 meses`
      });
    }
  }

  // 9. Pontos Fortes (para usar na defesa de crédito)
  const pontosFortes = [];
  if(calc.margem >= 0.15) pontosFortes.push("Margem EBITDA saudável");
  if(calc.alav <= 2) pontosFortes.push("Endividamento controlado");
  if(calc.liq >= 1.5) pontosFortes.push("Boa liquidez");
  if(calc.roe >= 0.15) pontosFortes.push("Excelente rentabilidade");
  if(calc.ciclo <= 45) pontosFortes.push("Ciclo financeiro eficiente");

  if(pontosFortes.length >= 3){
    recs.unshift({
      icon:"✅",
      titulo:"Pontos Fortes da Empresa",
      descricao:`A empresa apresenta ${pontosFortes.length} indicadores positivos: ${pontosFortes.join(", ")}. Estes são argumentos sólidos para negociação de crédito e devem ser destacados em apresentações para instituições financeiras.`,
      meta:null
    });
  }

  return recs;
}

function gerarPontosDefesaCredito(calc, recs){
  const pontos = [];
  
  // Pontos positivos
  if(calc.margem >= 0.12) pontos.push(`• Margem EBITDA de ${toPct(calc.margem)} demonstra boa eficiência operacional`);
  if(calc.alav <= 2.5) pontos.push(`• DL/EBITDA de ${calc.alav? clamp2(calc.alav)+"x" : "—"} indica capacidade de pagamento saudável`);
  if(calc.liq >= 1.2) pontos.push(`• Liquidez corrente de ${calc.liq? clamp2(calc.liq) : "—"} garante pagamento de obrigações de curto prazo`);
  if(calc.roe >= 0.10) pontos.push(`• ROE de ${toPct(calc.roe)} mostra boa rentabilidade para os sócios`);
  if(calc.juros >= 3) pontos.push(`• Cobertura de juros de ${calc.juros? clamp2(calc.juros)+"x" : "—"} demonstra folga para honrar compromissos financeiros`);

  // Pontos de atenção com plano de ação
  const problemasComPlano = recs.filter(r=> r.meta != null);
  if(problemasComPlano.length > 0){
    pontos.push(`• Empresa tem plano estruturado para melhorar ${problemasComPlano.length} indicador(es) com metas e prazos definidos`);
  }

  // Recomendações gerais
  pontos.push(`• Recomenda-se linha de crédito para ${calc.alav > 2.5? "reestruturação de dívidas" : "capital de giro"} com prazo ${calc.liq < 1.3? "mínimo de 24 meses" : "de 12-18 meses"}`);
  
  if(calc.receita > 1000000){
    pontos.push(`• Faturamento anual de ${toBRL(calc.receita)} qualifica para linhas corporativas com melhores condições`);
  }

  return pontos.join("<br>");
}

// ================== RESUMO EXECUTIVO ==================
function renderResumoExecutivo(rows){
  if(!rows.length) return;
  
  const rowsDesc = rows.sort((a,b)=> b.ano - a.ano);
  const latest = rowsDesc[0];
  const previo = rowsDesc[1];

  const bullets = [];
  
  // Comparação com ano anterior
  if(previo){
    const recYoY = ((latest.receita - previo.receita) / previo.receita) * 100;
    const ebtYoY = ((latest.ebitda - previo.ebitda) / previo.ebitda) * 100;
    
    bullets.push(`<strong>Receita:</strong> ${toBRL(latest.receita)} ${recYoY>=0? "↑" : "↓"} ${Math.abs(recYoY).toFixed(1)}% vs ${previo.ano}`);
    bullets.push(`<strong>EBITDA:</strong> ${toBRL(latest.ebitda)} ${ebtYoY>=0? "↑" : "↓"} ${Math.abs(ebtYoY).toFixed(1)}% vs ${previo.ano}`);
    
    if(latest.margem != null && previo.margem != null){
      const marDiff = (latest.margem - previo.margem) * 100;
      bullets.push(`<strong>Margem EBITDA:</strong> ${toPct(latest.margem)} ${marDiff>=0? "↑" : "↓"} ${Math.abs(marDiff).toFixed(1)} p.p.`);
    }
  } else {
    bullets.push(`<strong>Receita:</strong> ${toBRL(latest.receita)}`);
    bullets.push(`<strong>EBITDA:</strong> ${toBRL(latest.ebitda)}`);
    bullets.push(`<strong>Margem EBITDA:</strong> ${toPct(latest.margem)}`);
  }

  // Indicadores principais
  if(latest.alav != null) bullets.push(`<strong>DL/EBITDA:</strong> ${clamp2(latest.alav)}x ${latest.alav>3?"(alto risco)" : latest.alav>2?"(atenção)" : "(confortável)"}`);
  if(latest.liq != null) bullets.push(`<strong>Liquidez:</strong> ${clamp2(latest.liq)} ${latest.liq<1?"(crítico)" : latest.liq<1.3?"(baixo)" : "(adequado)"}`);
  if(latest.roe != null) bullets.push(`<strong>ROE:</strong> ${toPct(latest.roe)} ${latest.roe<0.08?"(baixo)" : latest.roe>0.15?"(excelente)" : "(bom)"}`);
  if(latest.ciclo != null) bullets.push(`<strong>Ciclo Financeiro:</strong> ${clamp2(latest.ciclo)} dias ${latest.ciclo>90?"(longo)" : latest.ciclo<45?"(ótimo)" : ""}`);

  const html = `
    <div style="background:#fff; border:1px solid var(--border); border-radius:12px; padding:20px; margin-bottom:24px">
      <h4 style="font-size:16px; font-weight:700; margin-bottom:12px; color:var(--text-primary)">
        📋 Resumo Executivo - ${latest.ano}
      </h4>
      <div style="font-size:13px; line-height:1.8; color:var(--text-secondary)">
        ${bullets.join("<br>")}
      </div>
    </div>
  `;

  document.getElementById("detResumo").innerHTML = html;
}

// ================== GRÁFICOS ==================
function renderCharts(rows){
  destroyCharts();
  if(!rows.length) return;

  const rowsAsc = rows.sort((a,b)=> a.ano - b.ano);
  const anos = rowsAsc.map(r=> r.ano);

  // Receita e EBITDA
  chart1 = new Chart(document.getElementById("chartReceitaEbitda"), {
    type:"line",
    data:{
      labels:anos,
      datasets:[
        {label:"Receita", data:rowsAsc.map(r=> r.receita/1000000), borderColor:"#3b82f6", backgroundColor:"rgba(59,130,246,.1)", tension:.3, fill:true},
        {label:"EBITDA", data:rowsAsc.map(r=> r.ebitda/1000000), borderColor:"#10b981", backgroundColor:"rgba(16,185,129,.1)", tension:.3, fill:true}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:"top"}, tooltip:{mode:"index"}},
      scales:{y:{beginAtZero:true, title:{display:true, text:"R$ Milhões"}}}
    }
  });

  // Margem EBITDA
  chart2 = new Chart(document.getElementById("chartMargem"), {
    type:"bar",
    data:{
      labels:anos,
      datasets:[{
        label:"Margem EBITDA (%)",
        data:rowsAsc.map(r=> r.margem*100),
        backgroundColor:rowsAsc.map(r=> r.margem>=0.15?"#10b981" : r.margem>=0.10?"#3b82f6" : "#ef4444")
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{y:{beginAtZero:true, title:{display:true, text:"%"}}}
    }
  });

  // ROE e ROA
  chart3 = new Chart(document.getElementById("chartRentab"), {
    type:"line",
    data:{
      labels:anos,
      datasets:[
        {label:"ROE (%)", data:rowsAsc.map(r=> r.roe? r.roe*100:null), borderColor:"#8b5cf6", tension:.3},
        {label:"ROA (%)", data:rowsAsc.map(r=> r.roa? r.roa*100:null), borderColor:"#f59e0b", tension:.3}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:"top"}},
      scales:{y:{beginAtZero:true, title:{display:true, text:"%"}}}
    }
  });

  // Estrutura de Capital
  chart4 = new Chart(document.getElementById("chartEstrutura"), {
    type:"line",
    data:{
      labels:anos,
      datasets:[
        {label:"DL/PL (x)", data:rowsAsc.map(r=> r.dlSobrePL), borderColor:"#ef4444", tension:.3},
        {label:"Ativo/PL (x)", data:rowsAsc.map(r=> r.alavFin), borderColor:"#06b6d4", tension:.3}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:"top"}},
      scales:{y:{beginAtZero:true, title:{display:true, text:"Múltiplo (x)"}}}
    }
  });

  // Alavancagem e Liquidez
  chart5 = new Chart(document.getElementById("chartAlavancagemLiquidez"), {
    type:"bar",
    data:{
      labels:anos,
      datasets:[
        {label:"DL/EBITDA (x)", data:rowsAsc.map(r=> r.alav), backgroundColor:"#ef4444", yAxisID:"y"},
        {label:"Liquidez", data:rowsAsc.map(r=> r.liq), backgroundColor:"#10b981", yAxisID:"y1"}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:"top"}},
      scales:{
        y:{type:"linear", position:"left", beginAtZero:true, title:{display:true, text:"DL/EBITDA (x)"}},
        y1:{type:"linear", position:"right", beginAtZero:true, title:{display:true, text:"Liquidez"}, grid:{drawOnChartArea:false}}
      }
    }
  });
}

function destroyCharts(){
  try{ chart1 && chart1.destroy(); }catch{}
  try{ chart2 && chart2.destroy(); }catch{}
  try{ chart3 && chart3.destroy(); }catch{}
  try{ chart4 && chart4.destroy(); }catch{}
  try{ chart5 && chart5.destroy(); }catch{}
  chart1=chart2=chart3=chart4=chart5=null;
}

// ================== TABELA DETALHADA ==================
function renderTabelaDetalhes(rows, empresaId){
  const tbody = document.getElementById("detTbody");
  tbody.innerHTML = "";

  const rowsDesc = rows.sort((a,b)=> b.ano - a.ano);

  rowsDesc.forEach((row, idx)=>{
    const previo = rowsDesc[idx + 1] || null;
    const score = calcularScore(row);
    const status = getStatusFinanceiro(score);

    // Deltas
    let deltaRec = null, deltaEbt = null, deltaMar = null;
    if(previo){
      deltaRec = ((row.receita - previo.receita) / previo.receita) * 100;
      deltaEbt = ((row.ebitda - previo.ebitda) / previo.ebitda) * 100;
      deltaMar = (row.margem - previo.margem) * 100;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:600">${row.ano}</td>
      <td>${toBRL(row.receita)}</td>
      <td>${toBRL(row.ebitda)}</td>
      <td>
        <span class="chip ${row.margem>=0.15? "chip-success" : row.margem>=0.08? "chip-warning" : "chip-danger"}">
          ${toPct(row.margem)}
        </span>
      </td>
      <td>${toBRL(row.dl)}</td>
      <td>
        <span class="chip ${row.alav<=1.5? "chip-success" : row.alav<=3? "chip-warning" : "chip-danger"}">
          ${row.alav!=null? clamp2(row.alav)+"x" : "—"}
        </span>
      </td>
      <td>
        <span class="chip ${row.liq>=1.5? "chip-success" : row.liq>=1? "chip-warning" : "chip-danger"}">
          ${row.liq!=null? clamp2(row.liq) : "—"}
        </span>
      </td>
      <td>
        <span class="chip ${row.roe>=0.15? "chip-success" : row.roe>=0.08? "chip-info" : "chip-neutral"}">
          ${toPct(row.roe)}
        </span>
      </td>
      <td>
        <div style="display:flex; align-items:center; gap:6px">
          <div class="score-badge ${status.classe}" style="width:40px; height:40px; font-size:14px">
            ${score}
          </div>
          <div style="font-size:10px; color:var(--text-muted)">${status.label}</div>
        </div>
      </td>
      <td>
        <span class="evolution-indicator ${deltaRec==null? "neutral" : deltaRec>=0? "positive" : "negative"}">
          ${deltaRec==null? "—" : (deltaRec>=0?"↑":"↓") + " " + Math.abs(deltaRec).toFixed(1)+"%"}
        </span>
      </td>
      <td>
        <span class="evolution-indicator ${deltaEbt==null? "neutral" : deltaEbt>=0? "positive" : "negative"}">
          ${deltaEbt==null? "—" : (deltaEbt>=0?"↑":"↓") + " " + Math.abs(deltaEbt).toFixed(1)+"%"}
        </span>
      </td>
      <td>
        <span class="evolution-indicator ${deltaMar==null? "neutral" : deltaMar>=0? "positive" : "negative"}">
          ${deltaMar==null? "—" : (deltaMar>=0?"↑":"↓") + " " + Math.abs(deltaMar).toFixed(1)+" p.p."}
        </span>
      </td>
      <td>
        <button class="btn btn-outline" style="padding:4px 8px; font-size:11px"
          onclick="abrirModalEdicao('${empresaId}',${row.ano},'${row.docId}')">
          ✏️ Editar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ================== EXPORTAR PDF ==================
function exportarPDF(nomeEmpresa){
  if(typeof html2pdf === "undefined"){
    return alert("Biblioteca html2pdf não encontrada.");
  }

  const box = document.getElementById("modalDetBox");
  const opt = {
    margin:8,
    filename:`Analise_Financeira_${nomeEmpresa.replace(/\s+/g,"_")}.pdf`,
    image:{ type:'jpeg', quality:0.98 },
    html2canvas:{ scale:2, useCORS:true },
    jsPDF:{ unit:'mm', format:'a4', orientation:'portrait' }
  };
  html2pdf().set(opt).from(box).save();
}

// ================== TOOLTIPS ==================
let _tipEl=null, _tipTimer=null;
function showTip(e, text){
  hideTip();
  _tipEl = document.createElement('div');
  _tipEl.className='custom-tooltip';
  _tipEl.innerHTML = text;
  document.body.appendChild(_tipEl);
  const r = e.target.getBoundingClientRect();
  const x = r.left + (r.width/2);
  const y = r.bottom + 8;
  _tipEl.style.left = Math.max(8, Math.min(window.innerWidth-8-_tipEl.offsetWidth, x - _tipEl.offsetWidth/2)) + 'px';
  _tipEl.style.top  = y + 'px';
}
function hideTip(){
  if(_tipEl){ _tipEl.remove(); _tipEl=null; }
}
document.addEventListener('mouseover', (ev)=>{
  const t = ev.target.closest('.info-pill');
  if(!t) return;
  const txt = t.getAttribute('title') || '';
  if(!txt) return;
  _tipTimer = setTimeout(()=> showTip(ev, txt), 120);
});
document.addEventListener('mouseout', (ev)=>{
  if(_tipTimer){ clearTimeout(_tipTimer); _tipTimer=null; }
  if(!ev.relatedTarget || !ev.relatedTarget.closest('.custom-tooltip')) hideTip();
});
document.addEventListener('click', (ev)=>{
  if(!ev.target.closest('.custom-tooltip') && !ev.target.closest('.info-pill')) hideTip();
});
