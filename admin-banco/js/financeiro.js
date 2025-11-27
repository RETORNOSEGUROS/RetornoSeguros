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
let LISTA_CALCULADA = []; // Lista com indicadores calculados para ordenação
let EMPRESAS_CACHE = new Map();
let AGENCIAS_CACHE = new Map();
let RMS_CACHE = new Map();
let SORT_STATE = { field: 'nome', dir: 'asc' };
let CURRENT_ANALYSIS_DATA = null; // Dados atuais para as abas de análise

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

  console.log("[AUTH] Usuário autenticado:", CTX.nome, "Perfil:", CTX.perfil, "Agência:", CTX.agenciaId);
  
  wireUi();
  preencherAnosSelect();
  moneyBindInputs();
  
  // Carregar filtros de agência/RM para admin e gerente_chefe
  if(CTX.perfil === "admin"){
    await carregarFiltrosAdmin();
  } else if(CTX.perfil === "gerente_chefe" || CTX.perfil === "gerente chefe"){
    await carregarFiltrosGerenteChefe();
  }
  
  // Carrega os dados após um pequeno delay para garantir que o DOM está pronto
  setTimeout(()=> {
    carregarGrid();
  }, 100);
});

// Carregar agências e RMs para filtros (apenas admin)
async function carregarFiltrosAdmin(){
  try{
    // Mostrar selects de filtro
    document.getElementById("filtroAgencia").style.display = "block";
    document.getElementById("filtroRM").style.display = "block";
    
    // Carregar agências
    const agSnap = await db.collection("agencias_banco").get();
    const selAgencia = document.getElementById("filtroAgencia");
    agSnap.forEach(doc=>{
      const d = doc.data() || {};
      AGENCIAS_CACHE.set(doc.id, d.nome || doc.id);
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = d.nome || doc.id;
      selAgencia.appendChild(opt);
    });
    
    // Carregar todos os RMs
    const rmSnap = await db.collection("usuarios_banco").where("perfil","==","rm").get();
    const selRM = document.getElementById("filtroRM");
    rmSnap.forEach(doc=>{
      const d = doc.data() || {};
      RMS_CACHE.set(doc.id, {nome: d.nome || d.email, agenciaId: d.agenciaId});
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = d.nome || d.email;
      selRM.appendChild(opt);
    });
    
    console.log("[carregarFiltrosAdmin] Agências:", AGENCIAS_CACHE.size, "RMs:", RMS_CACHE.size);
  }catch(e){
    console.error("[carregarFiltrosAdmin] Erro:", e);
  }
}

// Carregar filtros para Gerente Chefe (só RMs da sua agência)
async function carregarFiltrosGerenteChefe(){
  try{
    // Mostrar apenas filtro de RM
    document.getElementById("filtroRM").style.display = "block";
    
    // Carregar RMs da agência do gerente chefe
    if(CTX.agenciaId){
      const rmSnap = await db.collection("usuarios_banco")
        .where("perfil","==","rm")
        .where("agenciaId","==",CTX.agenciaId)
        .get();
      
      const selRM = document.getElementById("filtroRM");
      rmSnap.forEach(doc=>{
        const d = doc.data() || {};
        RMS_CACHE.set(doc.id, {nome: d.nome || d.email, agenciaId: d.agenciaId});
        const opt = document.createElement("option");
        opt.value = doc.id;
        opt.textContent = d.nome || d.email;
        selRM.appendChild(opt);
      });
      
      console.log("[carregarFiltrosGerenteChefe] RMs da agência:", RMS_CACHE.size);
    }
  }catch(e){
    console.error("[carregarFiltrosGerenteChefe] Erro:", e);
  }
}

// ================== UI BINDINGS ==================
function wireUi(){
  console.log("[wireUi] Configurando event listeners...");
  
  const btnRecarregar = document.getElementById("btnRecarregar");
  if(btnRecarregar) btnRecarregar.addEventListener("click", carregarGrid);
  
  const busca = document.getElementById("busca");
  if(busca) busca.addEventListener("input", filtrarTabela);
  
  const filtroAno = document.getElementById("filtroAno");
  if(filtroAno) filtroAno.addEventListener("change", carregarGrid);
  
  // Filtros de agência e RM (para admin)
  const filtroAgencia = document.getElementById("filtroAgencia");
  if(filtroAgencia) filtroAgencia.addEventListener("change", carregarGrid);
  
  const filtroRM = document.getElementById("filtroRM");
  if(filtroRM) filtroRM.addEventListener("change", carregarGrid);
  
  const btnVoltarPainel = document.getElementById("btnVoltarPainel");
  if(btnVoltarPainel) {
    btnVoltarPainel.addEventListener("click", ()=>{
      if (document.referrer) history.back();
      else location.href = "empresas.html";
    });
  }

  // Ordenação por colunas
  document.querySelectorAll("th.sortable").forEach(th=>{
    th.addEventListener("click", ()=>{
      const field = th.dataset.sort;
      if(SORT_STATE.field === field){
        SORT_STATE.dir = SORT_STATE.dir === 'asc' ? 'desc' : 'asc';
      }else{
        SORT_STATE.field = field;
        SORT_STATE.dir = 'asc';
      }
      // Atualizar visual
      document.querySelectorAll("th.sortable").forEach(t=> t.classList.remove('asc','desc'));
      th.classList.add(SORT_STATE.dir);
      // Re-renderizar
      renderTabela(LISTA_CALCULADA);
    });
  });

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

  // Botões de PDF no modal de edição
  const btnImportarPdf = document.getElementById("btnImportarPdfEdicao");
  if(btnImportarPdf) {
    btnImportarPdf.addEventListener("click", () => {
      abrirSeletorPDF();
    });
  }
  
  const btnBaixarPdf = document.getElementById("btnBaixarPdfEdicao");
  if(btnBaixarPdf) {
    btnBaixarPdf.addEventListener("click", () => {
      baixarPDFTemplate();
    });
  }

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
  
  // Sistema de Abas do Modal de Detalhes
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      
      // Atualizar botões
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      // Atualizar conteúdo
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      document.getElementById("tab-" + tabId).classList.add("active");
      
      // Renderizar conteúdo da aba se necessário
      if(tabId === "diagnostico" && CURRENT_ANALYSIS_DATA){
        renderDiagnostico(CURRENT_ANALYSIS_DATA);
      } else if(tabId === "planejamento" && CURRENT_ANALYSIS_DATA){
        renderPlanejamento(
          CURRENT_ANALYSIS_DATA.rows, 
          CURRENT_ANALYSIS_DATA.empresa, 
          CURRENT_ANALYSIS_DATA.setor || 'industria'
        );
      } else if(tabId === "dividas" && CURRENT_ANALYSIS_DATA){
        renderDividasBancarias(CURRENT_ANALYSIS_DATA);
      } else if(tabId === "plano" && CURRENT_ANALYSIS_DATA){
        renderPlanoAcao(CURRENT_ANALYSIS_DATA);
      } else if(tabId === "defesa" && CURRENT_ANALYSIS_DATA){
        renderDefesaCredito(CURRENT_ANALYSIS_DATA);
      } else if(tabId === "roteiro" && CURRENT_ANALYSIS_DATA){
        renderRoteiroVisita(CURRENT_ANALYSIS_DATA);
      } else if(tabId === "contexto" && CURRENT_ANALYSIS_DATA){
        renderContexto(CURRENT_ANALYSIS_DATA);
      }
    });
  });
  
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
    // Obter filtros selecionados
    const filtroAgencia = document.getElementById("filtroAgencia")?.value || "";
    const filtroRM = document.getElementById("filtroRM")?.value || "";
    
    // Monta query baseada no perfil do usuário
    let q = db.collection("empresas");
    
    if (CTX.perfil === "admin"){
      // Admin pode filtrar por agência e/ou RM
      if(filtroAgencia){
        q = q.where("agenciaId","==",filtroAgencia);
      }
      if(filtroRM){
        q = q.where("rmUid","==",filtroRM);
      }
    } else if (CTX.perfil === "rm"){
      // RM vê apenas suas empresas
      q = q.where("rmUid","==",CTX.uid);
    } else if (CTX.perfil === "gerente chefe" || CTX.perfil === "gerente_chefe"){
      // Gerente Chefe vê todas da sua agência, pode filtrar por RM
      if(CTX.agenciaId){
        q = q.where("agenciaId","==",CTX.agenciaId);
      }
      if(filtroRM){
        q = q.where("rmUid","==",filtroRM);
      }
    } else if (CTX.perfil === "assistente"){
      // Assistente vê da sua agência
      if(CTX.agenciaId){
        q = q.where("agenciaId","==",CTX.agenciaId);
      }
    }
    
    const empSnap = await q.limit(1000).get();
    console.log("[carregarMaisRecenteViaEmpresas] Empresas encontradas:", empSnap.size);
    
    if(empSnap.empty){
      console.log("[carregarMaisRecenteViaEmpresas] Nenhuma empresa encontrada na coleção");
      mostrarMensagemSemEmpresas();
      return;
    }
    
    const proms = [];
    const empresasSemDados = [];
    
    empSnap.forEach(empDoc=>{
      const empId = empDoc.id;
      const empData = empDoc.data() || {};
      const nomeEmpresa = empData.nome || empData.razaoSocial || empData.fantasia || "(sem nome)";
      const rmUid = empData.rmUid || empData.rm || null;
      const agenciaId = empData.agenciaId || empData.agenciaid || null;
      
      // Buscar nome do RM se disponível
      const rmNome = RMS_CACHE.get(rmUid)?.nome || "";
      const agenciaNome = AGENCIAS_CACHE.get(agenciaId) || "";
      
      EMPRESAS_CACHE.set(empId, {
        id: empId, 
        nome: nomeEmpresa, 
        rmUid: rmUid,
        rmNome: rmNome,
        agenciaId: agenciaId,
        agenciaNome: agenciaNome
      });
      
      proms.push(
        db.collection("empresas").doc(empId).collection("financeiro")
          .orderBy("ano","desc").limit(1).get()
          .then(s=>{
            if(!s.empty){
              const finDoc = s.docs[0];
              const fd = finDoc.data() || {};
              console.log(`[OK] ${nomeEmpresa} - Ano: ${fd.ano}`);
              return {
                empresaId: empId, 
                ano: fd.ano, 
                docId: finDoc.id,
                rmUid: rmUid,
                agenciaId: agenciaId,
                // Mapear campos do formato original
                receita: fd.receitaLiquida || fd.receita || 0,
                ebitda: fd.ebitda || 0,
                lucroBruto: fd.lucroBruto || 0,
                lucroLiq: fd.lucroLiquido || fd.lucroLiq || 0,
                dividaBruta: fd.dividaBruta || 0,
                caixa: fd.caixa || fd.disponibilidades || 0,
                estoques: fd.estoques || 0,
                contasReceber: fd.contasReceber || fd.duplicatasReceber || 0,
                contasPagar: fd.contasPagar || fd.fornecedores || 0,
                despesaFin: fd.despesasFinanceiras || fd.despesaFin || 0,
                pl: fd.patrimonioLiquido || fd.pl || 0,
                ativo: fd.ativoTotal || fd.ativo || 0,
                cmv: fd.cmv || fd.custoMercadorias || 0,
                ativoCirc: fd.ativoCirculante || fd.ativoCirc || 0,
                passivoCirc: fd.passivoCirculante || fd.passivoCirc || 0,
                ...fd
              };
            }
            console.log(`[INFO] ${nomeEmpresa} - Sem dados financeiros`);
            empresasSemDados.push({id:empId, nome:nomeEmpresa});
            return null;
          })
          .catch(err=>{
            console.error(`[ERRO] ${nomeEmpresa}:`, err.message);
            empresasSemDados.push({id:empId, nome:nomeEmpresa});
            return null;
          })
      );
    });
    
    const arr = await Promise.all(proms);
    LISTA = arr.filter(x=>x!=null);
    console.log("[carregarMaisRecenteViaEmpresas] Registros válidos:", LISTA.length);
    console.log("[carregarMaisRecenteViaEmpresas] Empresas sem dados:", empresasSemDados.length);
    
    // Mostrar empresas sem dados
    mostrarEmpresasSemDados(empresasSemDados);
    
  } catch(e) {
    console.error("[carregarMaisRecenteViaEmpresas] Erro geral:", e);
    throw e;
  }
}

// Mostra empresas que não têm dados financeiros
function mostrarEmpresasSemDados(empresas){
  const container = document.getElementById("empresasSemDados");
  const lista = document.getElementById("listaEmpresasSemDados");
  
  if(!container || !lista) return;
  
  if(empresas.length === 0){
    container.style.display = "none";
    return;
  }
  
  container.style.display = "block";
  lista.innerHTML = empresas.map(emp => `
    <button class="btn" style="padding:8px 14px; font-size:12px; background:linear-gradient(135deg, #fef3c7, #fde68a); border:1px solid #f59e0b; color:#92400e; border-radius:8px" 
      onclick="abrirModalEdicao('${emp.id}', null, null)">
      ➕ ${escapeHtml(emp.nome)}
    </button>
  `).join("");
}

// Mensagem quando não há empresas cadastradas
function mostrarMensagemSemEmpresas(){
  const status = document.getElementById("statusLista");
  if(status){
    status.innerHTML = `
      <div style="padding:40px; text-align:center">
        <div style="font-size:48px; margin-bottom:16px">🏢</div>
        <div style="font-size:16px; font-weight:600; color:var(--text-primary); margin-bottom:8px">
          Nenhuma empresa cadastrada
        </div>
        <div style="font-size:14px; color:var(--text-muted); margin-bottom:16px">
          Cadastre empresas primeiro em "Empresas" para depois adicionar dados financeiros
        </div>
        <a href="empresas.html" class="btn btn-primary">Ir para Cadastro de Empresas</a>
      </div>
    `;
  }
}

// Carrega por ano específico iterando sobre empresas
async function carregarPorAnoViaEmpresas(ano){
  console.log("[carregarPorAnoViaEmpresas] Carregando ano:", ano);
  
  try {
    // Obter filtros selecionados
    const filtroAgencia = document.getElementById("filtroAgencia")?.value || "";
    const filtroRM = document.getElementById("filtroRM")?.value || "";
    
    // Monta query baseada no perfil do usuário
    let q = db.collection("empresas");
    
    if (CTX.perfil === "admin"){
      // Admin pode filtrar por agência e/ou RM
      if(filtroAgencia){
        q = q.where("agenciaId","==",filtroAgencia);
      }
      if(filtroRM){
        q = q.where("rmUid","==",filtroRM);
      }
    } else if (CTX.perfil === "rm"){
      // RM vê apenas suas empresas
      q = q.where("rmUid","==",CTX.uid);
    } else if (CTX.perfil === "gerente chefe" || CTX.perfil === "gerente_chefe"){
      // Gerente Chefe vê todas da sua agência, pode filtrar por RM
      if(CTX.agenciaId){
        q = q.where("agenciaId","==",CTX.agenciaId);
      }
      if(filtroRM){
        q = q.where("rmUid","==",filtroRM);
      }
    } else if (CTX.perfil === "assistente"){
      // Assistente vê da sua agência
      if(CTX.agenciaId){
        q = q.where("agenciaId","==",CTX.agenciaId);
      }
    }
    
    const empSnap = await q.limit(1000).get();
    console.log("[carregarPorAnoViaEmpresas] Empresas encontradas:", empSnap.size);
    
    if(empSnap.empty){
      console.log("[carregarPorAnoViaEmpresas] Nenhuma empresa encontrada na coleção");
      mostrarMensagemSemEmpresas();
      return;
    }
    
    const proms = [];
    const empresasSemDados = [];
    
    empSnap.forEach(empDoc=>{
      const empId = empDoc.id;
      const empData = empDoc.data() || {};
      const nomeEmpresa = empData.nome || empData.razaoSocial || empData.fantasia || "(sem nome)";
      const rmUid = empData.rmUid || empData.rm || null;
      const agenciaId = empData.agenciaId || empData.agenciaid || null;
      
      // Buscar nome do RM se disponível
      const rmNome = RMS_CACHE.get(rmUid)?.nome || "";
      const agenciaNome = AGENCIAS_CACHE.get(agenciaId) || "";
      
      EMPRESAS_CACHE.set(empId, {
        id: empId, 
        nome: nomeEmpresa, 
        rmUid: rmUid,
        rmNome: rmNome,
        agenciaId: agenciaId,
        agenciaNome: agenciaNome
      });
      
      proms.push(
        db.collection("empresas").doc(empId).collection("financeiro")
          .where("ano","==",ano).limit(1).get()
          .then(s=>{
            if(!s.empty){
              const finDoc = s.docs[0];
              const fd = finDoc.data() || {};
              console.log(`[OK] ${nomeEmpresa} - Ano: ${fd.ano}`);
              return {
                empresaId: empId, 
                ano: fd.ano, 
                docId: finDoc.id,
                rmUid: rmUid,
                agenciaId: agenciaId,
                // Mapear campos do formato original
                receita: fd.receitaLiquida || fd.receita || 0,
                ebitda: fd.ebitda || 0,
                lucroBruto: fd.lucroBruto || 0,
                lucroLiq: fd.lucroLiquido || fd.lucroLiq || 0,
                dividaBruta: fd.dividaBruta || 0,
                caixa: fd.caixa || fd.disponibilidades || 0,
                estoques: fd.estoques || 0,
                contasReceber: fd.contasReceber || fd.duplicatasReceber || 0,
                contasPagar: fd.contasPagar || fd.fornecedores || 0,
                despesaFin: fd.despesasFinanceiras || fd.despesaFin || 0,
                pl: fd.patrimonioLiquido || fd.pl || 0,
                ativo: fd.ativoTotal || fd.ativo || 0,
                cmv: fd.cmv || fd.custoMercadorias || 0,
                ativoCirc: fd.ativoCirculante || fd.ativoCirc || 0,
                passivoCirc: fd.passivoCirculante || fd.passivoCirc || 0,
                ...fd
              };
            }
            empresasSemDados.push({id:empId, nome:nomeEmpresa});
            return null;
          })
          .catch(err=>{
            console.error(`[ERRO] ${nomeEmpresa}:`, err.message);
            empresasSemDados.push({id:empId, nome:nomeEmpresa});
            return null;
          })
      );
    });
    
    const arr = await Promise.all(proms);
    LISTA = arr.filter(x=>x!=null);
    console.log("[carregarPorAnoViaEmpresas] Registros válidos:", LISTA.length);
    
    // Mostrar empresas sem dados para este ano
    mostrarEmpresasSemDados(empresasSemDados);
    
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
  
  // Esconder container de empresas sem dados se tiver resultados
  const containerSemDados = document.getElementById("empresasSemDados");
  
  if(!arr || !arr.length){
    // Verificar se há empresas no cache
    if(EMPRESAS_CACHE.size > 0){
      st.innerHTML = `
        <div style="padding:40px; text-align:center">
          <div style="font-size:48px; margin-bottom:16px">📊</div>
          <div style="font-size:16px; font-weight:600; color:var(--text-primary); margin-bottom:8px">
            Nenhum dado financeiro encontrado
          </div>
          <div style="font-size:14px; color:var(--text-muted)">
            Selecione outro ano ou clique nos botões acima para adicionar dados financeiros às empresas
          </div>
        </div>
      `;
    } else {
      st.innerHTML = `
        <div style="padding:40px; text-align:center">
          <div style="font-size:48px; margin-bottom:16px">🏢</div>
          <div style="font-size:16px; font-weight:600; color:var(--text-primary); margin-bottom:8px">
            Nenhuma empresa cadastrada
          </div>
          <div style="font-size:14px; color:var(--text-muted); margin-bottom:16px">
            Cadastre empresas primeiro para depois adicionar dados financeiros
          </div>
          <a href="empresas.html" class="btn btn-primary">Ir para Cadastro de Empresas</a>
        </div>
      `;
      if(containerSemDados) containerSemDados.style.display = "none";
    }
    // Esconder dashboard consolidado
    document.getElementById("dashboardConsolidado").style.display = "none";
  }else{
    st.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; padding:12px; background:#d1fae5; border:1px solid #10b981; border-radius:8px">
        <div style="font-size:24px">✅</div>
        <div>
          <div style="font-weight:600; color:#065f46">
            ${arr.length} ${arr.length===1? "empresa":"empresas"} com dados financeiros
          </div>
          <div style="font-size:12px; color:#047857">
            Dados carregados com sucesso
          </div>
        </div>
      </div>
    `;
    
    // Atualizar Dashboard Consolidado
    atualizarDashboardConsolidado(arr);
  }
}

// ================== DASHBOARD CONSOLIDADO ==================
function atualizarDashboardConsolidado(arr){
  const dash = document.getElementById("dashboardConsolidado");
  if(!dash || !arr || !arr.length) {
    if(dash) dash.style.display = "none";
    return;
  }
  
  dash.style.display = "block";
  
  // Calcular métricas consolidadas
  let totalReceita = 0;
  let somaScore = 0;
  let somaMargem = 0;
  let somaAlav = 0;
  let somaLiq = 0;
  let countMargem = 0;
  let countAlav = 0;
  let countLiq = 0;
  let excelentes = 0, bons = 0, regulares = 0, criticos = 0;
  
  arr.forEach(row => {
    const calc = calcularIndicadores(row);
    const score = calcularScore(calc);
    
    totalReceita += calc.receita || 0;
    somaScore += score;
    
    if(calc.margem != null && isFinite(calc.margem)){
      somaMargem += calc.margem;
      countMargem++;
    }
    if(calc.alav != null && isFinite(calc.alav) && calc.alav > 0){
      somaAlav += calc.alav;
      countAlav++;
    }
    if(calc.liq != null && isFinite(calc.liq)){
      somaLiq += calc.liq;
      countLiq++;
    }
    
    // Classificar por score
    if(score >= 80) excelentes++;
    else if(score >= 65) bons++;
    else if(score >= 50) regulares++;
    else criticos++;
  });
  
  const scoreMedio = Math.round(somaScore / arr.length);
  const margemMedia = countMargem > 0 ? (somaMargem / countMargem) : 0;
  const alavMedia = countAlav > 0 ? (somaAlav / countAlav) : 0;
  const liqMedia = countLiq > 0 ? (somaLiq / countLiq) : 0;
  
  // Atualizar título conforme perfil
  const tituloEl = document.getElementById("dashTitulo");
  const subtituloEl = document.getElementById("dashSubtitulo");
  
  if(CTX.perfil === "admin"){
    const filtroAg = document.getElementById("filtroAgencia")?.value;
    const filtroRm = document.getElementById("filtroRM")?.value;
    if(filtroAg || filtroRm){
      tituloEl.textContent = "Visão Consolidada - Filtro Aplicado";
      let sub = [];
      if(filtroAg) sub.push("Agência: " + (AGENCIAS_CACHE.get(filtroAg) || filtroAg));
      if(filtroRm) sub.push("RM: " + (RMS_CACHE.get(filtroRm)?.nome || filtroRm));
      subtituloEl.textContent = sub.join(" | ");
    } else {
      tituloEl.textContent = "Visão Consolidada - Todas as Empresas";
      subtituloEl.textContent = "Panorama geral do banco";
    }
  } else if(CTX.perfil === "rm"){
    tituloEl.textContent = "Visão Consolidada da Minha Carteira";
    subtituloEl.textContent = CTX.nome || "";
  } else if(CTX.perfil === "gerente chefe" || CTX.perfil === "gerente_chefe"){
    tituloEl.textContent = "Visão Consolidada da Agência";
    subtituloEl.textContent = AGENCIAS_CACHE.get(CTX.agenciaId) || CTX.agenciaId || "";
  } else {
    tituloEl.textContent = "Visão Consolidada";
    subtituloEl.textContent = "";
  }
  
  // Atualizar valores
  document.getElementById("dashTotalEmpresas").textContent = arr.length;
  document.getElementById("dashScoreMedio").textContent = scoreMedio;
  document.getElementById("dashReceitaTotal").textContent = toBRL(totalReceita);
  document.getElementById("dashMargemMedia").textContent = toPct(margemMedia);
  document.getElementById("dashAlavMedia").textContent = alavMedia > 0 ? clamp2(alavMedia) + "x" : "—";
  document.getElementById("dashLiqMedia").textContent = liqMedia > 0 ? clamp2(liqMedia) : "—";
  
  document.getElementById("dashExcelentes").textContent = excelentes;
  document.getElementById("dashBons").textContent = bons;
  document.getElementById("dashRegulares").textContent = regulares;
  document.getElementById("dashCriticos").textContent = criticos;
  
  // Atualizar barra de score
  const scoreBar = document.getElementById("dashScoreBar");
  if(scoreBar){
    scoreBar.style.setProperty('--score-width', scoreMedio + '%');
    scoreBar.innerHTML = `<div style="width:${scoreMedio}%; height:100%; background:#fff; border-radius:2px"></div>`;
  }
  
  console.log("[atualizarDashboardConsolidado] Score médio:", scoreMedio, "Empresas:", arr.length);
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

  // Calcular indicadores e preparar para ordenação
  const listaComCalc = arr.map(row => {
    const info = EMPRESAS_CACHE.get(row.empresaId) || {nome:"(sem nome)"};
    const calc = calcularIndicadores(row);
    const score = calcularScore(calc);
    return {
      ...row,
      ...calc,
      nome: info.nome,
      rmNome: info.rmNome || "",
      agenciaNome: info.agenciaNome || "",
      score: score
    };
  });
  
  // Salvar para uso na ordenação
  LISTA_CALCULADA = listaComCalc;
  
  // Ordenar
  listaComCalc.sort((a, b) => {
    let valA = a[SORT_STATE.field];
    let valB = b[SORT_STATE.field];
    
    // Tratar nulos
    if(valA == null) valA = SORT_STATE.dir === 'asc' ? Infinity : -Infinity;
    if(valB == null) valB = SORT_STATE.dir === 'asc' ? Infinity : -Infinity;
    
    // Ordenar strings
    if(typeof valA === 'string'){
      valA = valA.toLowerCase();
      valB = (valB || '').toLowerCase();
      return SORT_STATE.dir === 'asc' 
        ? valA.localeCompare(valB, 'pt') 
        : valB.localeCompare(valA, 'pt');
    }
    
    // Ordenar números
    return SORT_STATE.dir === 'asc' ? valA - valB : valB - valA;
  });

  console.log("[renderTabela] Renderizando", listaComCalc.length, "linhas, ordenado por:", SORT_STATE.field, SORT_STATE.dir);

  listaComCalc.forEach((row, index)=>{
    try {
      const status = getStatusFinanceiro(row.score);
      const lead = calcularLeadScore(row);
      row.oportunidade = lead.score; // Para ordenação
      row.lead = lead;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="font-weight:600">${escapeHtml(row.nome)}</div>
          ${CTX.perfil === 'admin' && row.rmNome ? `<div style="font-size:11px; color:var(--text-muted)">👤 ${escapeHtml(row.rmNome)}</div>` : ''}
        </td>
        <td>${row.ano || "—"}</td>
        <td>
          <div style="display:flex; align-items:center; gap:8px">
            <div class="score-badge ${status.classe}" style="width:50px; height:50px; font-size:16px">
              ${row.score}
            </div>
          </div>
        </td>
        <td>${toBRL(row.receita)}</td>
        <td>${toBRL(row.ebitda)}</td>
        <td>
          <span class="chip ${row.margem>=0.15? "chip-success" : row.margem>=0.08? "chip-warning" : "chip-danger"}">
            ${toPct(row.margem)}
          </span>
        </td>
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
            ${row.roe!=null? toPct(row.roe) : "—"}
          </span>
        </td>
        <td>
          <span class="chip chip-${status.classe}">
            ${status.icon} ${status.label}
          </span>
        </td>
        <td>
          ${gerarColunaOportunidade(lead)}
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
  
  // Atualizar painel de oportunidades
  atualizarPainelOportunidades(listaComCalc);
  
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
  
  // === DADOS BÁSICOS ===
  const receita = getNum(d.receita) || getNum(d.receitaLiquida);
  const receitaBruta = getNum(d.receitaBruta);
  const ebitda = getNum(d.ebitda);
  const ebit = getNum(d.ebit);
  const lucroBruto = getNum(d.lucroBruto);
  const lucroLiq = getNum(d.lucroLiq) || getNum(d.lucroLiquido);
  const dividaBruta = getNum(d.dividaBruta);
  const caixa = getNum(d.caixa) || getNum(d.disponiveis);
  const aplicacoesCP = getNum(d.aplicacoesFinanceirasCP);
  const disponiveis = caixa + aplicacoesCP;
  const estoques = getNum(d.estoques);
  const cr = getNum(d.contasReceber);
  const cp = getNum(d.contasPagar);
  const despFin = getNum(d.despesaFin) || getNum(d.despesasFinanceiras);
  const recFin = getNum(d.receitasFinanceiras);
  const pl = getNum(d.pl) || getNum(d.patrimonioLiquido);
  const ativo = getNum(d.ativo) || getNum(d.ativoTotal);
  const cmv = getNum(d.cmv);
  const ativoCirc = getNum(d.ativoCirc) || getNum(d.ativoCirculante);
  const passivoCirc = getNum(d.passivoCirc) || getNum(d.passivoCirculante);
  const passivoNaoCirc = getNum(d.passivoNaoCirculante);
  const ativoNaoCirc = getNum(d.ativoNaoCirculante);
  const realizavelLP = getNum(d.realizavelLP);
  const imobilizado = getNum(d.imobilizado);
  const depreciacao = getNum(d.depreciacao) || getNum(d.depreciacaoAmortizacao);
  const intangivel = getNum(d.intangivel);
  const capitalSocial = getNum(d.capitalSocial);
  const funcionarios = getNum(d.funcionarios);
  
  // === EMPRÉSTIMOS ===
  const emprestimosCP = getNum(d.emprestimosCP);
  const emprestimosLP = getNum(d.emprestimosLP);
  const debentures = getNum(d.debentures);
  
  // === CONTINGÊNCIAS JUDICIAIS ===
  const processosTrab = getNum(d.processosTrabalhistas);
  const processosTrib = getNum(d.processosTributarios);
  const processosCiv = getNum(d.processosCiveis);
  const processosAmb = getNum(d.processosAmbientais);
  const qtdProcessos = getNum(d.qtdProcessos);
  const depositosJudiciais = getNum(d.depositosJudiciais);
  const provisaoContingencias = getNum(d.provisaoContingencias);
  const passivoContingente = getNum(d.passivoContingente);
  
  // Contingência Total = Trabalhista + Tributário + Cível + Ambiental
  const contingenciaTotal = processosTrab + processosTrib + processosCiv + processosAmb;
  
  // Exposição Total = Contingência + Passivo Contingente (possível)
  const exposicaoTotal = contingenciaTotal + passivoContingente;
  
  // PDD (Provisão para Devedores Duvidosos)
  const pdd = getNum(d.pdd);
  
  // Investimentos e outros ativos
  const investimentos = getNum(d.investimentos);
  
  // === CÁLCULOS DERIVADOS ===
  
  // Dívida Bruta calculada (se não vier pronta)
  const dividaBrutaCalc = dividaBruta || (emprestimosCP + emprestimosLP + debentures);
  
  // Dívida Líquida
  const dl = dividaBrutaCalc - disponiveis;
  
  // Passivo Total
  const passivoTotal = passivoCirc + passivoNaoCirc;
  
  // Imobilizado Líquido
  const imobilizadoLiq = imobilizado - depreciacao;
  
  // === MARGENS ===
  const margem = safeDiv(ebitda, receita);
  const margemBruta = safeDiv(lucroBruto, receita);
  const margemLiq = safeDiv(lucroLiq, receita);
  const margemOperacional = safeDiv(ebit, receita);
  
  // === ENDIVIDAMENTO ===
  const alav = safeDiv(dl, ebitda);
  const dlSobrePL = safeDiv(dl, pl);
  const endividamento = safeDiv(dividaBrutaCalc, ativo);
  const composicaoEnd = safeDiv(dividaBrutaCalc, (dividaBrutaCalc + pl));
  const endividamentoGeral = safeDiv(passivoTotal, ativo);
  const composicaoEndCP = safeDiv(passivoCirc, passivoTotal);
  const ctcp = safeDiv(passivoTotal, pl); // Capital Terceiros / Capital Próprio
  
  // === LIQUIDEZ ===
  const liq = safeDiv(caixa + cr + estoques, cp || passivoCirc);
  const liqSeca = safeDiv(caixa + cr, cp || passivoCirc);
  const liqImediata = safeDiv(disponiveis, cp || passivoCirc);
  const liqCorrente = safeDiv(ativoCirc, passivoCirc) || liq;
  const liqGeral = safeDiv(ativoCirc + realizavelLP, passivoTotal);
  
  // === RENTABILIDADE ===
  const roe = safeDiv(lucroLiq, pl);
  const roa = safeDiv(lucroLiq, ativo);
  const nopat = ebit * 0.66; // EBIT * (1 - 34% imposto)
  const capitalInvestido = pl + dividaBrutaCalc;
  const roic = safeDiv(nopat, capitalInvestido);
  
  // === EFICIÊNCIA / GIRO ===
  const giroAtv = safeDiv(receita, ativo);
  const giroPL = safeDiv(receita, pl);
  const giroEstoque = safeDiv(receita, estoques);
  const alavFin = safeDiv(ativo, pl);
  const gaf = safeDiv(roe, roa); // Grau Alavancagem Financeira
  
  // === IMOBILIZAÇÃO ===
  const imobPL = safeDiv(imobilizado, pl);
  const imobRecursosNC = safeDiv(ativoNaoCirc, (pl + passivoNaoCirc));
  
  // === CICLO OPERACIONAL E FINANCEIRO ===
  const cmvUsar = cmv || receita * 0.7; // Estimar CMV se não tiver
  const giroEst = safeDiv(cmvUsar, estoques);
  const diasEst = safeDiv(365, giroEst); // PME
  const pmr = safeDiv(cr * 360, receita);
  const pmp = safeDiv(cp * 360, cmvUsar);
  const cicloOp = (diasEst || 0) + (pmr || 0);
  const ciclo = cicloOp - (pmp || 0);
  
  // === COBERTURA ===
  const juros = safeDiv(ebitda, despFin); // Cobertura de juros
  const coberturaDiv = safeDiv(ebitda, dividaBrutaCalc);
  const resultadoFin = recFin - despFin;
  
  // === CAPITAL DE GIRO ===
  const capGiro = (disponiveis + cr + estoques) - cp;
  const ccl = ativoCirc - passivoCirc; // Capital Circulante Líquido
  const ncg = (cr + estoques) - cp; // Necessidade de Capital de Giro
  const ncgRec = safeDiv(ncg, receita);
  
  // === ANÁLISE DUPONT ===
  // ROE = Margem Líquida × Giro do Ativo × Alavancagem Financeira
  const dupontMargem = margemLiq;
  const dupontGiro = giroAtv;
  const dupontAlav = alavFin;
  const roeDupont = (dupontMargem || 0) * (dupontGiro || 0) * (dupontAlav || 0);
  
  // === PRODUTIVIDADE ===
  const receitaPorFunc = funcionarios > 0 ? receita / funcionarios : null;
  const ebitdaPorFunc = funcionarios > 0 ? ebitda / funcionarios : null;
  const lucroLiqPorFunc = funcionarios > 0 ? lucroLiq / funcionarios : null;
  
  // === VALUATION SIMPLES ===
  const valorEmpresa = ebitda * 5; // Múltiplo 5x EBITDA
  const valorEquity = valorEmpresa - dl;
  
  // === ALTMAN Z-SCORE (adaptado) ===
  const capitalGiroAtivo = safeDiv(ccl, ativo);
  const lucrosRetidos = safeDiv(pl - capitalSocial, ativo);
  const ebitAtivo = safeDiv(ebit || ebitda, ativo);
  const plPassivo = safeDiv(pl, passivoTotal);
  const receitaAtivo = giroAtv;
  // Z = 1.2×A + 1.4×B + 3.3×C + 0.6×D + 1.0×E
  const zScore = (1.2 * (capitalGiroAtivo || 0)) + 
                 (1.4 * (lucrosRetidos || 0)) + 
                 (3.3 * (ebitAtivo || 0)) + 
                 (0.6 * (plPassivo || 0)) + 
                 (1.0 * (receitaAtivo || 0));

  return {
    // Dados brutos
    receita, receitaBruta, ebitda, ebit, lucroBruto, lucroLiq, 
    dividaBruta: dividaBrutaCalc, caixa, disponiveis, dl,
    estoques, cr, cp, pl, ativo, despFin, recFin, cmv,
    ativoCirc, passivoCirc, passivoNaoCirc, passivoTotal,
    imobilizado, imobilizadoLiq, intangivel, funcionarios,
    emprestimosCP, emprestimosLP, debentures, capitalSocial,
    
    // Margens
    margem, margemBruta, margemLiq, margemOperacional,
    
    // Endividamento
    alav, dlSobrePL, endividamento, composicaoEnd,
    endividamentoGeral, composicaoEndCP, ctcp,
    
    // Liquidez
    liq, liqSeca, liqImediata, liqCorrente, liqGeral,
    
    // Rentabilidade
    roe, roa, roic,
    
    // Eficiência
    giroAtv, giroPL, giroEstoque, alavFin, gaf,
    
    // Imobilização
    imobPL, imobRecursosNC,
    
    // Ciclo
    giroEst, diasEst, pmr, pmp, cicloOp, ciclo,
    
    // Cobertura
    juros, coberturaDiv, resultadoFin,
    
    // Capital de Giro
    capGiro, ccl, ncg, ncgRec,
    
    // DuPont
    dupontMargem, dupontGiro, dupontAlav, roeDupont,
    
    // Produtividade
    receitaPorFunc, ebitdaPorFunc, lucroLiqPorFunc,
    
    // Valuation
    valorEmpresa, valorEquity,
    
    // Z-Score
    zScore, capitalGiroAtivo, lucrosRetidos, ebitAtivo, plPassivo,
    
    // === CONTINGÊNCIAS JUDICIAIS ===
    processosTrab, processosTrib, processosCiv, processosAmb,
    qtdProcessos, depositosJudiciais, provisaoContingencias, passivoContingente,
    contingenciaTotal, exposicaoTotal,
    
    // Indicadores de Contingência
    contingenciaSobrePL: safeDiv(contingenciaTotal, pl),
    contingenciaSobreAtivo: safeDiv(contingenciaTotal, ativo),
    exposicaoSobreReceita: safeDiv(exposicaoTotal, receita),
    coberturaContinProvisao: safeDiv(provisaoContingencias, contingenciaTotal),
    
    // === QUALIDADE DO ATIVO ===
    pdd,
    qualidadeRecebiveis: safeDiv(pdd, cr), // % de inadimplência esperada
    idadeAtivos: safeDiv(depreciacao, imobilizado), // Quão "velhos" são os ativos
    pesoIntangiveis: safeDiv(intangivel, ativo), // Quanto é "ar" no balanço
    investimentos,
    
    // === ANÁLISE VERTICAL (% do total) ===
    // Ativo
    acSobreAtivo: safeDiv(ativoCirc, ativo),
    ancSobreAtivo: safeDiv(ativoNaoCirc, ativo),
    caixaSobreAtivo: safeDiv(disponiveis, ativo),
    crSobreAtivo: safeDiv(cr, ativo),
    estoqueSobreAtivo: safeDiv(estoques, ativo),
    imobSobreAtivo: safeDiv(imobilizado, ativo),
    
    // Passivo
    pcSobrePassivo: safeDiv(passivoCirc, passivoTotal + pl),
    pncSobrePassivo: safeDiv(passivoNaoCirc, passivoTotal + pl),
    plSobrePassivo: safeDiv(pl, passivoTotal + pl),
    
    // DRE (% da Receita)
    cmvSobreReceita: safeDiv(cmv, receita),
    despFinSobreReceita: safeDiv(despFin, receita)
  };
}

function criarIndicadoresVazios(){
  return {
    // Dados brutos
    receita:0, receitaBruta:0, ebitda:0, ebit:0, lucroBruto:0, lucroLiq:0, 
    dividaBruta:0, caixa:0, disponiveis:0, dl:0,
    estoques:0, cr:0, cp:0, pl:0, ativo:0, despFin:0, recFin:0, cmv:0,
    ativoCirc:0, passivoCirc:0, passivoNaoCirc:0, passivoTotal:0,
    imobilizado:0, imobilizadoLiq:0, intangivel:0, funcionarios:0,
    emprestimosCP:0, emprestimosLP:0, debentures:0, capitalSocial:0,
    
    // Margens
    margem:null, margemBruta:null, margemLiq:null, margemOperacional:null,
    
    // Endividamento
    alav:null, dlSobrePL:null, endividamento:null, composicaoEnd:null,
    endividamentoGeral:null, composicaoEndCP:null, ctcp:null,
    
    // Liquidez
    liq:null, liqSeca:null, liqImediata:null, liqCorrente:null, liqGeral:null,
    
    // Rentabilidade
    roe:null, roa:null, roic:null,
    
    // Eficiência
    giroAtv:null, giroPL:null, giroEstoque:null, alavFin:null, gaf:null,
    
    // Imobilização
    imobPL:null, imobRecursosNC:null,
    
    // Ciclo
    giroEst:null, diasEst:null, pmr:null, pmp:null, cicloOp:null, ciclo:null,
    
    // Cobertura
    juros:null, coberturaDiv:null, resultadoFin:null,
    
    // Capital de Giro
    capGiro:0, ccl:0, ncg:0, ncgRec:null,
    
    // DuPont
    dupontMargem:null, dupontGiro:null, dupontAlav:null, roeDupont:null,
    
    // Produtividade
    receitaPorFunc:null, ebitdaPorFunc:null, lucroLiqPorFunc:null,
    
    // Valuation
    valorEmpresa:null, valorEquity:null,
    
    // Z-Score
    zScore:null, capitalGiroAtivo:null, lucrosRetidos:null, ebitAtivo:null, plPassivo:null,
    
    // Contingências Judiciais
    processosTrab:0, processosTrib:0, processosCiv:0, processosAmb:0,
    qtdProcessos:0, depositosJudiciais:0, provisaoContingencias:0, passivoContingente:0,
    contingenciaTotal:0, exposicaoTotal:0,
    contingenciaSobrePL:null, contingenciaSobreAtivo:null, exposicaoSobreReceita:null, coberturaContinProvisao:null,
    
    // Qualidade do Ativo
    pdd:0, qualidadeRecebiveis:null, idadeAtivos:null, pesoIntangiveis:null, investimentos:0,
    
    // Análise Vertical
    acSobreAtivo:null, ancSobreAtivo:null, caixaSobreAtivo:null, crSobreAtivo:null, estoqueSobreAtivo:null, imobSobreAtivo:null,
    pcSobrePassivo:null, pncSobrePassivo:null, plSobrePassivo:null,
    cmvSobreReceita:null, despFinSobreReceita:null
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
  
  // Buscar nome da empresa se não estiver no cache
  let info = EMPRESAS_CACHE.get(empresaId);
  if(!info){
    try{
      const empDoc = await db.collection("empresas").doc(empresaId).get();
      if(empDoc.exists){
        const ed = empDoc.data() || {};
        info = {id:empresaId, nome: ed.nome || ed.razaoSocial || ed.fantasia || "(sem nome)"};
        EMPRESAS_CACHE.set(empresaId, info);
      }
    }catch(e){
      console.error("Erro ao buscar empresa:", e);
    }
  }
  
  const nomeEmpresa = info?.nome || "(Empresa)";
  document.getElementById("finEmpresaAlvo").textContent = `Empresa: ${nomeEmpresa}`;

  // Lista completa de campos para limpar
  const todosOsCampos = [
    // Básico
    "finAno","finReceita","finEbitda","finLucroLiq","finPL","finAtivo","finDividaBruta","finCaixa",
    // DRE
    "finReceitaBruta","finDeducoes","finReceitaLiq","finCMV","finLucroBruto",
    "finDespVendas","finDespAdm","finDepAmort","finOutrasDesp","finEBIT","finEbitdaDRE",
    "finReceitaFin","finDespesaFin","finResultadoFin","finLAIR","finIRCS","finLucroLiqDRE",
    // Ativo Circulante
    "finACCaixa","finACAplicacoes","finCR","finACPDD","finEstoques","finACImpostos",
    "finACAdiantFornec","finACDespAntecip","finACOutros","finAtivoCirc",
    // Ativo Não Circulante
    "finANCRealizavel","finANCInvest","finImobilizado","finDepreciacao","finANCIntangivel","finAtivoNaoCirc","finAtivoTotal",
    // Passivo Circulante
    "finCP","finPCEmprestimos","finPCSalarios","finPCImpostos","finPCAdiantClientes",
    "finPCDividendos","finPCProvisoes","finPCOutros","finPassivoCirc",
    // Passivo Não Circulante
    "finPNCEmprestimos","finPNCDebentures","finPNCProvisoes","finPNCOutros","finPassivoNaoCirc",
    // Patrimônio Líquido
    "finPLCapital","finPLReservasCapital","finPLReservasLucro","finPLLucrosAcum","finPLAjustes","finPLTotal","finPassivoTotal",
    // Outros
    "finQtdSocios","finFuncionarios","finDistribLucro","finProLabore",
    "finMarketShare","finCrescSetor","finMargemSetor","finRankingSetor",
    "finValorImoveis","finValorMaquinas","finValorVeiculos","finInadimplencia",
    "finLimiteTotal","finLimiteUsado","finTaxaMedia","finScoreExterno",
    // Contingências Judiciais
    "finProcessosTrab","finProcessosTrib","finProcessosCiv","finProcessosAmb",
    "finQtdProcessos","finDepJudiciais","finProvisaoContingencias","finPassivoContingente"
  ];
  
  // Limpar todos os campos
  todosOsCampos.forEach(id => { 
    const el = document.getElementById(id);
    if(el) el.value = "";
  });

  // Definir ano atual como padrão se não houver ano
  const anoAtual = new Date().getFullYear();
  document.getElementById("finAno").value = ano || anoAtual;
  
  // Resetar para primeira aba do formulário
  document.querySelectorAll('.form-tab-btn').forEach(b => {
    b.style.background = 'var(--border)';
    b.style.color = 'var(--text-secondary)';
  });
  const primeiraAba = document.querySelector('.form-tab-btn[data-formtab="basico"]');
  if(primeiraAba){
    primeiraAba.style.background = 'var(--accent)';
    primeiraAba.style.color = '#fff';
  }
  document.querySelectorAll('.form-tab-content').forEach(c => c.style.display = 'none');
  const primeiroConteudo = document.getElementById('formtab-basico');
  if(primeiroConteudo) primeiroConteudo.style.display = 'block';

  // Se temos docId, carregar dados existentes
  if(docId && docId !== 'null' && docId !== ''){
    try{
      const finDoc = await db.collection("empresas").doc(empresaId).collection("financeiro").doc(docId).get();
      if(finDoc.exists){
        const d = finDoc.data() || {};
        document.getElementById("finAno").value = d.ano || anoAtual;
        
        // Setor
        const setorSelect = document.getElementById("finSetor");
        if(setorSelect && d.setor){
          setorSelect.value = d.setor;
        }
        
        // === BÁSICO ===
        setMoney("finReceita", d.receitaLiquida || d.receita);
        setMoney("finEbitda", d.ebitda);
        setMoney("finLucroLiq", d.lucroLiquido || d.lucroLiq);
        setMoney("finPL", d.patrimonioLiquido || d.pl);
        setMoney("finAtivo", d.ativoTotal || d.ativo);
        setMoney("finDividaBruta", d.dividaBruta);
        setMoney("finCaixa", d.caixa || d.disponibilidades || d.disponiveis);
        
        // === DRE ===
        setMoney("finReceitaBruta", d.receitaBruta);
        setMoney("finDeducoes", d.deducoes);
        setMoney("finReceitaLiq", d.receitaLiquida || d.receita);
        setMoney("finCMV", d.cmv || d.custoMercadorias);
        setMoney("finLucroBruto", d.lucroBruto);
        setMoney("finDespVendas", d.despesasVendas);
        setMoney("finDespAdm", d.despesasAdm);
        setMoney("finDepAmort", d.depreciacaoAmortizacao);
        setMoney("finOutrasDesp", d.outrasDespesas);
        setMoney("finEBIT", d.ebit);
        setMoney("finEbitdaDRE", d.ebitda);
        setMoney("finReceitaFin", d.receitasFinanceiras);
        setMoney("finDespesaFin", d.despesasFinanceiras || d.despesaFin);
        setMoney("finResultadoFin", d.resultadoFinanceiro);
        setMoney("finLAIR", d.lucroAntesIR);
        setMoney("finIRCS", d.ircs);
        setMoney("finLucroLiqDRE", d.lucroLiquido || d.lucroLiq);
        
        // === ATIVO CIRCULANTE ===
        setMoney("finACCaixa", d.caixa || d.disponibilidades || d.disponiveis);
        setMoney("finACAplicacoes", d.aplicacoesFinanceirasCP);
        setMoney("finCR", d.contasReceber || d.duplicatasReceber);
        setMoney("finACPDD", d.pdd);
        setMoney("finEstoques", d.estoques);
        setMoney("finACImpostos", d.impostosRecuperar);
        setMoney("finACAdiantFornec", d.adiantamentoFornecedores);
        setMoney("finACDespAntecip", d.despesasAntecipadas);
        setMoney("finACOutros", d.outrosAC);
        setMoney("finAtivoCirc", d.ativoCirculante || d.ativoCirc);
        
        // === ATIVO NÃO CIRCULANTE ===
        setMoney("finANCRealizavel", d.realizavelLP);
        setMoney("finANCInvest", d.investimentos);
        setMoney("finImobilizado", d.imobilizado);
        setMoney("finDepreciacao", d.depreciacao);
        setMoney("finANCIntangivel", d.intangivel);
        setMoney("finAtivoNaoCirc", d.ativoNaoCirculante);
        setMoney("finAtivoTotal", d.ativoTotal || d.ativo);
        
        // === PASSIVO CIRCULANTE ===
        setMoney("finCP", d.contasPagar || d.fornecedores);
        setMoney("finPCEmprestimos", d.emprestimosCP);
        setMoney("finPCSalarios", d.salariosPagar);
        setMoney("finPCImpostos", d.impostosPagar);
        setMoney("finPCAdiantClientes", d.adiantamentoClientes);
        setMoney("finPCDividendos", d.dividendosPagar);
        setMoney("finPCProvisoes", d.provisoesCP);
        setMoney("finPCOutros", d.outrosPC);
        setMoney("finPassivoCirc", d.passivoCirculante || d.passivoCirc);
        
        // === PASSIVO NÃO CIRCULANTE ===
        setMoney("finPNCEmprestimos", d.emprestimosLP);
        setMoney("finPNCDebentures", d.debentures);
        setMoney("finPNCProvisoes", d.provisoesLP);
        setMoney("finPNCOutros", d.outrosPNC);
        setMoney("finPassivoNaoCirc", d.passivoNaoCirculante);
        
        // === PATRIMÔNIO LÍQUIDO ===
        setMoney("finPLCapital", d.capitalSocial);
        setMoney("finPLReservasCapital", d.reservasCapital);
        setMoney("finPLReservasLucro", d.reservasLucro);
        setMoney("finPLLucrosAcum", d.lucrosAcumulados);
        setMoney("finPLAjustes", d.ajustesAvaliacao);
        setMoney("finPLTotal", d.patrimonioLiquido || d.pl);
        
        // === OUTROS ===
        const setNum = (id, val) => {
          const el = document.getElementById(id);
          if(el && val != null) el.value = val;
        };
        setNum("finQtdSocios", d.qtdSocios);
        setNum("finFuncionarios", d.funcionarios);
        setMoney("finDistribLucro", d.distribuicaoLucros || d.distribLucro);
        setMoney("finProLabore", d.proLabore);
        setNum("finMarketShare", d.marketShare);
        setNum("finCrescSetor", d.crescimentoSetor);
        setNum("finMargemSetor", d.margemSetor);
        setNum("finRankingSetor", d.rankingSetor);
        setMoney("finValorImoveis", d.valorImoveis);
        setMoney("finValorMaquinas", d.valorMaquinas);
        setMoney("finValorVeiculos", d.valorVeiculos);
        setNum("finInadimplencia", d.inadimplencia);
        setMoney("finLimiteTotal", d.limiteTotal);
        setMoney("finLimiteUsado", d.limiteUsado);
        setNum("finTaxaMedia", d.taxaMedia);
        setNum("finScoreExterno", d.scoreExterno);
        
        // Contingências Judiciais
        setMoney("finProcessosTrab", d.processosTrabalhistas);
        setMoney("finProcessosTrib", d.processosTributarios);
        setMoney("finProcessosCiv", d.processosCiveis);
        setMoney("finProcessosAmb", d.processosAmbientais);
        setNum("finQtdProcessos", d.qtdProcessos);
        setMoney("finDepJudiciais", d.depositosJudiciais);
        setMoney("finProvisaoContingencias", d.provisaoContingencias);
        setMoney("finPassivoContingente", d.passivoContingente);
      }
    }catch(e){
      console.error("Erro ao carregar dados:", e);
    }
  }

  // Esconder mensagens de erro/info
  const erroEl = document.getElementById("finErro");
  const infoEl = document.getElementById("finInfo");
  if(erroEl) erroEl.style.display="none";
  if(infoEl) infoEl.style.display="none";
  
  // Mostrar modal
  document.getElementById("modalFin").style.display="block";
  
  // Re-aplicar máscaras de moeda
  moneyBindInputs(document.getElementById("modalFin"));
}
window.abrirModalEdicao = abrirModalEdicao;

async function salvarFinanceiro(){
  const empresaId = EDIT_CTX?.empresaId;
  if(!empresaId) return mostrarErro("Erro: empresa não identificada");

  const ano = Number(document.getElementById("finAno").value);
  if(!ano || ano<2000 || ano>2100) return mostrarErro("Ano inválido (deve ser entre 2000 e 2100)");

  // Desabilitar botão durante salvamento
  const btnSalvar = document.getElementById("finSalvar");
  if(btnSalvar){
    btnSalvar.disabled = true;
    btnSalvar.textContent = "💾 Salvando...";
  }

  // Função helper para pegar valor numérico de campo
  const getNum = (id) => {
    const el = document.getElementById(id);
    return el ? (Number(el.value) || 0) : 0;
  };

  // ========== DADOS COMPLETOS ==========
  const dados = {
    ano,
    setor: document.getElementById("finSetor")?.value || 'industria',
    
    // === DRE - RECEITAS ===
    receitaBruta: getMoney("finReceitaBruta"),
    deducoes: getMoney("finDeducoes"),
    receitaLiquida: getMoney("finReceita") || getMoney("finReceitaLiq"),
    
    // === DRE - CUSTOS E LUCROS ===
    cmv: getMoney("finCMV"),
    lucroBruto: getMoney("finLucroBruto"),
    
    // === DRE - DESPESAS OPERACIONAIS ===
    despesasVendas: getMoney("finDespVendas"),
    despesasAdm: getMoney("finDespAdm"),
    depreciacaoAmortizacao: getMoney("finDepAmort"),
    outrasDespesas: getMoney("finOutrasDesp"),
    ebit: getMoney("finEBIT"),
    ebitda: getMoney("finEbitda") || getMoney("finEbitdaDRE"),
    
    // === DRE - RESULTADO FINANCEIRO ===
    receitasFinanceiras: getMoney("finReceitaFin"),
    despesasFinanceiras: getMoney("finDespesaFin"),
    resultadoFinanceiro: getMoney("finResultadoFin"),
    
    // === DRE - RESULTADO FINAL ===
    lucroAntesIR: getMoney("finLAIR"),
    ircs: getMoney("finIRCS"),
    lucroLiquido: getMoney("finLucroLiq") || getMoney("finLucroLiqDRE"),
    
    // === ATIVO CIRCULANTE ===
    caixa: getMoney("finCaixa") || getMoney("finACCaixa"),
    aplicacoesFinanceirasCP: getMoney("finACAplicacoes"),
    contasReceber: getMoney("finCR"),
    pdd: getMoney("finACPDD"),
    estoques: getMoney("finEstoques"),
    impostosRecuperar: getMoney("finACImpostos"),
    adiantamentoFornecedores: getMoney("finACAdiantFornec"),
    despesasAntecipadas: getMoney("finACDespAntecip"),
    outrosAC: getMoney("finACOutros"),
    ativoCirculante: getMoney("finAtivoCirc"),
    
    // === ATIVO NÃO CIRCULANTE ===
    realizavelLP: getMoney("finANCRealizavel"),
    investimentos: getMoney("finANCInvest"),
    imobilizado: getMoney("finImobilizado"),
    depreciacao: getMoney("finDepreciacao"),
    intangivel: getMoney("finANCIntangivel"),
    ativoNaoCirculante: getMoney("finAtivoNaoCirc"),
    ativoTotal: getMoney("finAtivo") || getMoney("finAtivoTotal"),
    
    // === PASSIVO CIRCULANTE ===
    contasPagar: getMoney("finCP"),
    emprestimosCP: getMoney("finPCEmprestimos"),
    salariosPagar: getMoney("finPCSalarios"),
    impostosPagar: getMoney("finPCImpostos"),
    adiantamentoClientes: getMoney("finPCAdiantClientes"),
    dividendosPagar: getMoney("finPCDividendos"),
    provisoesCP: getMoney("finPCProvisoes"),
    outrosPC: getMoney("finPCOutros"),
    passivoCirculante: getMoney("finPassivoCirc"),
    
    // === PASSIVO NÃO CIRCULANTE ===
    emprestimosLP: getMoney("finPNCEmprestimos"),
    debentures: getMoney("finPNCDebentures"),
    provisoesLP: getMoney("finPNCProvisoes"),
    outrosPNC: getMoney("finPNCOutros"),
    passivoNaoCirculante: getMoney("finPassivoNaoCirc"),
    
    // === PATRIMÔNIO LÍQUIDO ===
    capitalSocial: getMoney("finPLCapital"),
    reservasCapital: getMoney("finPLReservasCapital"),
    reservasLucro: getMoney("finPLReservasLucro"),
    lucrosAcumulados: getMoney("finPLLucrosAcum"),
    ajustesAvaliacao: getMoney("finPLAjustes"),
    patrimonioLiquido: getMoney("finPL") || getMoney("finPLTotal"),
    
    // === INFORMAÇÕES SOCIETÁRIAS ===
    qtdSocios: getNum("finQtdSocios"),
    funcionarios: getNum("finFuncionarios"),
    distribuicaoLucros: getMoney("finDistribLucro"),
    proLabore: getMoney("finProLabore"),
    
    // === INDICADORES DE MERCADO ===
    marketShare: getNum("finMarketShare"),
    crescimentoSetor: getNum("finCrescSetor"),
    margemSetor: getNum("finMargemSetor"),
    rankingSetor: getNum("finRankingSetor"),
    
    // === QUALIDADE DO ATIVO ===
    valorImoveis: getMoney("finValorImoveis"),
    valorMaquinas: getMoney("finValorMaquinas"),
    valorVeiculos: getMoney("finValorVeiculos"),
    inadimplencia: getNum("finInadimplencia"),
    
    // === INFORMAÇÕES DE CRÉDITO ===
    limiteTotal: getMoney("finLimiteTotal"),
    limiteUsado: getMoney("finLimiteUsado"),
    taxaMedia: getNum("finTaxaMedia"),
    scoreExterno: getNum("finScoreExterno"),
    
    // === CONTINGÊNCIAS E RISCOS JUDICIAIS ===
    processosTrabalhistas: getMoney("finProcessosTrab"),
    processosTributarios: getMoney("finProcessosTrib"),
    processosCiveis: getMoney("finProcessosCiv"),
    processosAmbientais: getMoney("finProcessosAmb"),
    qtdProcessos: getNum("finQtdProcessos"),
    depositosJudiciais: getMoney("finDepJudiciais"),
    provisaoContingencias: getMoney("finProvisaoContingencias"),
    passivoContingente: getMoney("finPassivoContingente"),
    
    // === CAMPOS CALCULADOS ===
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: CTX.uid
  };

  // ========== CALCULAR DÍVIDAS E INDICADORES ==========
  
  // Dívida Bruta = Empréstimos CP + LP + Debêntures
  dados.dividaBruta = (dados.emprestimosCP || 0) + (dados.emprestimosLP || 0) + (dados.debentures || 0);
  if(dados.dividaBruta === 0){
    dados.dividaBruta = getMoney("finDividaBruta"); // fallback campo simples
  }
  
  // Disponibilidades = Caixa + Aplicações CP
  dados.disponiveis = (dados.caixa || 0) + (dados.aplicacoesFinanceirasCP || 0);
  
  // Dívida Líquida = Dívida Bruta - Disponibilidades
  dados.dividaLiquida = dados.dividaBruta - dados.disponiveis;
  
  // ========== INDICADORES AUTOMÁTICOS ==========
  
  // Margem Bruta
  if(dados.receitaLiquida > 0 && dados.lucroBruto){
    dados.margemBruta = dados.lucroBruto / dados.receitaLiquida;
  }
  
  // Margem EBITDA
  if(dados.receitaLiquida > 0 && dados.ebitda > 0){
    dados.margemEbitda = dados.ebitda / dados.receitaLiquida;
  }
  
  // Margem Operacional (EBIT)
  if(dados.receitaLiquida > 0 && dados.ebit){
    dados.margemOperacional = dados.ebit / dados.receitaLiquida;
  }
  
  // Margem Líquida
  if(dados.receitaLiquida > 0 && dados.lucroLiquido){
    dados.margemLiquida = dados.lucroLiquido / dados.receitaLiquida;
  }
  
  // DL/EBITDA (Alavancagem)
  if(dados.ebitda > 0 && dados.dividaLiquida != null){
    dados.alavancagemDivLiqEbitda = dados.dividaLiquida / dados.ebitda;
  }
  
  // Liquidez Corrente = AC / PC
  if(dados.passivoCirculante > 0){
    dados.liquidezCorrente = dados.ativoCirculante / dados.passivoCirculante;
  } else if(dados.contasPagar > 0){
    // Fallback se não tiver PC total
    const acEstimado = (dados.caixa || 0) + (dados.contasReceber || 0) + (dados.estoques || 0);
    dados.liquidezCorrente = acEstimado / dados.contasPagar;
  }
  
  // Liquidez Seca = (AC - Estoques) / PC
  if(dados.passivoCirculante > 0 && dados.ativoCirculante > 0){
    dados.liquidezSeca = (dados.ativoCirculante - (dados.estoques || 0)) / dados.passivoCirculante;
  }
  
  // Liquidez Imediata = Disponível / PC
  if(dados.passivoCirculante > 0){
    dados.liquidezImediata = dados.disponiveis / dados.passivoCirculante;
  }
  
  // Liquidez Geral = (AC + RLP) / (PC + PNC)
  const passivoTotal = (dados.passivoCirculante || 0) + (dados.passivoNaoCirculante || 0);
  if(passivoTotal > 0){
    dados.liquidezGeral = ((dados.ativoCirculante || 0) + (dados.realizavelLP || 0)) / passivoTotal;
  }
  
  // ROE = Lucro Líquido / PL
  if(dados.patrimonioLiquido > 0 && dados.lucroLiquido){
    dados.roe = dados.lucroLiquido / dados.patrimonioLiquido;
  }
  
  // ROA = Lucro Líquido / Ativo Total
  if(dados.ativoTotal > 0 && dados.lucroLiquido){
    dados.roa = dados.lucroLiquido / dados.ativoTotal;
  }
  
  // ROIC = NOPAT / Capital Investido
  if(dados.ebit && dados.ativoTotal > 0){
    const nopat = dados.ebit * 0.66; // EBIT * (1 - 34% imposto)
    const capitalInvestido = (dados.patrimonioLiquido || 0) + (dados.dividaBruta || 0);
    if(capitalInvestido > 0){
      dados.roic = nopat / capitalInvestido;
    }
  }
  
  // Giro do Ativo = Receita / Ativo Total
  if(dados.ativoTotal > 0 && dados.receitaLiquida > 0){
    dados.giroAtivo = dados.receitaLiquida / dados.ativoTotal;
  }
  
  // Endividamento Geral = (PC + PNC) / Ativo Total
  if(dados.ativoTotal > 0){
    dados.endividamentoGeral = passivoTotal / dados.ativoTotal;
  }
  
  // Composição do Endividamento = PC / (PC + PNC)
  if(passivoTotal > 0 && dados.passivoCirculante > 0){
    dados.composicaoEndividamento = dados.passivoCirculante / passivoTotal;
  }
  
  // Imobilização do PL = Imobilizado / PL
  if(dados.patrimonioLiquido > 0 && dados.imobilizado > 0){
    dados.imobilizacaoPL = dados.imobilizado / dados.patrimonioLiquido;
  }
  
  // Cobertura de Juros = EBITDA / Despesas Financeiras
  if(dados.despesasFinanceiras > 0 && dados.ebitda > 0){
    dados.coberturaJuros = dados.ebitda / dados.despesasFinanceiras;
  }
  
  // Capital Terceiros / Capital Próprio
  if(dados.patrimonioLiquido > 0){
    dados.ctcp = passivoTotal / dados.patrimonioLiquido;
  }
  
  // Grau de Alavancagem Financeira = ROE / ROA
  if(dados.roa > 0 && dados.roe){
    dados.gaf = dados.roe / dados.roa;
  }

  try{
    const ref = db.collection("empresas").doc(empresaId).collection("financeiro");
    
    if(EDIT_CTX.docId && EDIT_CTX.docId !== 'null' && EDIT_CTX.docId !== ''){
      await ref.doc(EDIT_CTX.docId).update(dados);
      mostrarInfo("✅ Dados atualizados com sucesso!");
    }else{
      // Verificar se já existe registro para este ano
      const snap = await ref.where("ano","==",ano).limit(1).get();
      if(!snap.empty){
        await ref.doc(snap.docs[0].id).update(dados);
        mostrarInfo("✅ Dados do ano já existiam e foram atualizados!");
      }else{
        await ref.add({
          ...dados,
          empresaId: empresaId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: CTX.uid
        });
        mostrarInfo("✅ Dados salvos com sucesso!");
      }
    }

    // Atualizar dados denormalizados na empresa (para visão rápida)
    try{
      await db.collection("empresas").doc(empresaId).update({
        ultimoAnoFinanceiro: ano,
        ultimaReceita: dados.receitaLiquida,
        ultimoEbitda: dados.ebitda,
        ultimaDividaLiquida: dados.dividaLiquida,
        ultimaAlavancagem: dados.alavancagemDivLiqEbitda || null,
        ultimaLiquidez: dados.liquidezCorrente || null,
        ultimaMargemBruta: dados.margemBruta || null,
        ultimaMargemLiquida: dados.margemLiquida || null,
        ultimoROE: dados.roe || null,
        ultimoROA: dados.roa || null,
        financeiroAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
    }catch(e){
      console.warn("Não foi possível atualizar dados denormalizados:", e);
    }

    setTimeout(()=>{
      document.getElementById("modalFin").style.display="none";
      carregarGrid();
    }, 1200);
    
  }catch(e){
    console.error("Erro ao salvar:", e);
    mostrarErro("Erro ao salvar: " + e.message);
  }finally{
    // Reabilitar botão
    if(btnSalvar){
      btnSalvar.disabled = false;
      btnSalvar.textContent = "💾 Salvar Dados";
    }
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

  // Resetar para aba Dashboard
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(".tab-btn[data-tab='dashboard']")?.classList.add("active");
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById("tab-dashboard")?.classList.add("active");

  try{
    const snap = await db.collection("empresas").doc(empresaId)
      .collection("financeiro").orderBy("ano","desc").get();
    
    // Mapear dados para formato padronizado
    const rows = snap.docs.map(doc=>{
      const fd = doc.data() || {};
      return {
        docId: doc.id,
        ano: fd.ano,
        receita: fd.receitaLiquida || fd.receita || 0,
        ebitda: fd.ebitda || 0,
        lucroBruto: fd.lucroBruto || 0,
        lucroLiq: fd.lucroLiquido || fd.lucroLiq || 0,
        dividaBruta: fd.dividaBruta || 0,
        caixa: fd.caixa || fd.disponibilidades || 0,
        estoques: fd.estoques || 0,
        contasReceber: fd.contasReceber || fd.duplicatasReceber || 0,
        contasPagar: fd.contasPagar || fd.fornecedores || 0,
        despesaFin: fd.despesasFinanceiras || fd.despesaFin || 0,
        pl: fd.patrimonioLiquido || fd.pl || 0,
        ativo: fd.ativoTotal || fd.ativo || 0,
        cmv: fd.cmv || fd.custoMercadorias || 0,
        ativoCirc: fd.ativoCirculante || fd.ativoCirc || 0,
        passivoCirc: fd.passivoCirculante || fd.passivoCirc || 0,
        ...fd
      };
    });
    
    const rowsCalc = rows.map(r=>({...r, ...calcularIndicadores(r)}));
    
    // Detectar setor mais recente ou usar default
    const setorMaisRecente = rows.find(r => r.setor)?.setor || 'industria';

    // Armazenar dados para as outras abas
    CURRENT_ANALYSIS_DATA = {
      empresaId: empresaId,
      empresaNome: info.nome,
      empresa: info.nome,
      setor: setorMaisRecente,
      rows: rowsCalc
    };

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
  const previo = rows[1] || null;
  const score = calcularScore(latest);
  const status = getStatusFinanceiro(score);

  // Calcular variações
  const varReceita = previo ? ((latest.receita - previo.receita) / previo.receita * 100) : null;
  const varEbitda = previo ? ((latest.ebitda - previo.ebitda) / previo.ebitda * 100) : null;
  const varMargem = previo ? ((latest.margem - previo.margem) * 100) : null;

  let html = `
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
          <div class="health-label">Receita</div>
          <div class="health-value" style="font-size:18px">${toBRL(latest.receita)}</div>
          ${varReceita !== null ? `<div class="health-trend ${varReceita >= 0 ? 'positive' : 'negative'}" style="color:${varReceita >= 0 ? '#10b981' : '#ef4444'}">
            ${varReceita >= 0 ? '↑' : '↓'} ${Math.abs(varReceita).toFixed(1)}%
          </div>` : ''}
        </div>
        
        <div class="health-card">
          <div class="health-label">Margem EBITDA</div>
          <div class="health-value">${toPct(latest.margem)}</div>
          ${varMargem !== null ? `<div class="health-trend ${varMargem >= 0 ? 'positive' : 'negative'}" style="color:${varMargem >= 0 ? '#10b981' : '#ef4444'}">
            ${varMargem >= 0 ? '↑' : '↓'} ${Math.abs(varMargem).toFixed(1)} p.p.
          </div>` : ''}
        </div>
        
        <div class="health-card">
          <div class="health-label">DL/EBITDA</div>
          <div class="health-value">${latest.alav!=null? clamp2(latest.alav)+"x" : "—"}</div>
          <div class="health-trend" style="color:${latest.alav <= 2 ? '#10b981' : latest.alav <= 3.5 ? '#f59e0b' : '#ef4444'}">
            ${latest.alav <= 2 ? '✓ Saudável' : latest.alav <= 3.5 ? '⚠ Atenção' : '⚠ Alto'}
          </div>
        </div>
        
        <div class="health-card">
          <div class="health-label">Liquidez Corrente</div>
          <div class="health-value">${latest.liq!=null? clamp2(latest.liq) : "—"}</div>
          <div class="health-trend" style="color:${latest.liq >= 1.5 ? '#10b981' : latest.liq >= 1 ? '#f59e0b' : '#ef4444'}">
            ${latest.liq >= 1.5 ? '✓ Adequada' : latest.liq >= 1 ? '⚠ Baixa' : '⚠ Crítica'}
          </div>
        </div>
        
        <div class="health-card">
          <div class="health-label">ROE</div>
          <div class="health-value">${toPct(latest.roe)}</div>
          <div class="health-trend" style="color:${latest.roe >= 0.15 ? '#10b981' : latest.roe >= 0.08 ? '#3b82f6' : '#94a3b8'}">
            ${latest.roe >= 0.15 ? '✓ Excelente' : latest.roe >= 0.08 ? '→ Bom' : '→ Abaixo'}
          </div>
        </div>
      </div>
      
      ${rows.length > 1 ? `
      <div style="margin-top:20px; padding-top:16px; border-top:1px solid #bae6fd">
        <div style="font-weight:600; color:#0c4a6e; margin-bottom:12px">📊 Comparativo de Anos - Indicadores Completos</div>
        <div style="overflow-x:auto">
          <table style="width:100%; border-collapse:collapse; font-size:11px; background:#fff; border-radius:8px">
            <thead>
              <tr style="background:#f1f5f9">
                <th style="padding:10px; text-align:left; border-bottom:1px solid #e2e8f0">Indicador</th>
                ${rows.slice(0,4).map(r => `<th style="padding:10px; text-align:right; border-bottom:1px solid #e2e8f0">${r.ano}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              <!-- RESULTADOS -->
              <tr style="background:#f0f9ff">
                <td colspan="${rows.slice(0,4).length + 1}" style="padding:8px; font-weight:700; color:#0369a1; font-size:10px">📈 RESULTADOS</td>
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Receita Líquida</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toBRL(r.receita)}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">EBITDA</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toBRL(r.ebitda)}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Lucro Líquido</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toBRL(r.lucroLiq)}</td>`).join('')}
              </tr>
              
              <!-- MARGENS -->
              <tr style="background:#ecfdf5">
                <td colspan="${rows.slice(0,4).length + 1}" style="padding:8px; font-weight:700; color:#065f46; font-size:10px">📊 MARGENS</td>
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Margem Bruta</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toPct(r.margemBruta)}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Margem EBITDA</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toPct(r.margem)}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Margem Líquida</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toPct(r.margemLiq)}</td>`).join('')}
              </tr>
              
              <!-- RENTABILIDADE -->
              <tr style="background:#fef3c7">
                <td colspan="${rows.slice(0,4).length + 1}" style="padding:8px; font-weight:700; color:#92400e; font-size:10px">💰 RENTABILIDADE</td>
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">ROE</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toPct(r.roe)}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">ROA</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toPct(r.roa)}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">ROIC</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toPct(r.roic)}</td>`).join('')}
              </tr>
              
              <!-- LIQUIDEZ -->
              <tr style="background:#dbeafe">
                <td colspan="${rows.slice(0,4).length + 1}" style="padding:8px; font-weight:700; color:#1e40af; font-size:10px">💧 LIQUIDEZ</td>
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Liq. Corrente</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${r.liqCorrente != null ? clamp2(r.liqCorrente) : r.liq != null ? clamp2(r.liq) : '—'}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Liq. Seca</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${r.liqSeca != null ? clamp2(r.liqSeca) : '—'}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Liq. Imediata</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${r.liqImediata != null ? clamp2(r.liqImediata) : '—'}</td>`).join('')}
              </tr>
              
              <!-- ENDIVIDAMENTO -->
              <tr style="background:#fee2e2">
                <td colspan="${rows.slice(0,4).length + 1}" style="padding:8px; font-weight:700; color:#991b1b; font-size:10px">🏦 ENDIVIDAMENTO</td>
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">DL/EBITDA</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${r.alav != null ? clamp2(r.alav) + 'x' : '—'}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Endiv. Geral</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${r.endividamentoGeral != null ? (r.endividamentoGeral * 100).toFixed(0) + '%' : '—'}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">CT/CP</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${r.ctcp != null ? clamp2(r.ctcp) : '—'}</td>`).join('')}
              </tr>
              
              <!-- EFICIÊNCIA -->
              <tr style="background:#f3e8ff">
                <td colspan="${rows.slice(0,4).length + 1}" style="padding:8px; font-weight:700; color:#7c3aed; font-size:10px">⚡ EFICIÊNCIA</td>
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Giro do Ativo</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${r.giroAtv != null ? clamp2(r.giroAtv) + 'x' : '—'}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Ciclo Financeiro</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${r.ciclo != null ? Math.round(r.ciclo) + ' dias' : '—'}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9">Cobert. Juros</td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${r.juros != null ? clamp2(r.juros) + 'x' : '—'}</td>`).join('')}
              </tr>
              
              <!-- SCORE -->
              <tr style="background:#f1f5f9">
                <td style="padding:8px; font-weight:700">🎯 Score Final</td>
                ${rows.slice(0,4).map(r => {
                  const sc = calcularScore(r);
                  const st = getStatusFinanceiro(sc);
                  return `<td style="padding:8px; text-align:right"><span class="chip chip-${st.classe}">${sc}</span></td>`;
                }).join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}
    </div>
  `;
  
  // Adicionar Benchmarking Setorial
  const benchmarkHtml = gerarBenchmarkHtml(latest);
  html += benchmarkHtml;
  
  // Adicionar Análises Avançadas (O QUE NINGUÉM MOSTRA)
  const analiseAvancadaHtml = gerarAnaliseAvancadaHtml(latest, rows);
  html += analiseAvancadaHtml;
  
  document.getElementById("healthDashboard").innerHTML = html;
}

// Função separada para gerar HTML do Benchmarking
function gerarBenchmarkHtml(latest){
  // Referências setoriais (médias de mercado)
  const setorRef = {
    margem: 0.12,      // 12% média
    alav: 2.0,         // 2.0x média
    liq: 1.3,          // 1.3 média
    roe: 0.15          // 15% média
  };
  
  const comparativos = [
    { nome: 'Margem EBITDA', valor: latest.margem, setor: setorRef.margem, formato: 'pct', melhorMaior: true },
    { nome: 'DL/EBITDA', valor: latest.alav, setor: setorRef.alav, formato: 'x', melhorMaior: false },
    { nome: 'Liquidez', valor: latest.liq, setor: setorRef.liq, formato: 'num', melhorMaior: true },
    { nome: 'ROE', valor: latest.roe, setor: setorRef.roe, formato: 'pct', melhorMaior: true }
  ];
  
  let barrasHtml = '';
  comparativos.forEach(c => {
    const isMelhor = c.melhorMaior ? c.valor >= c.setor : c.valor <= c.setor;
    const posicao = Math.min(Math.max((c.valor / (c.setor * 2)) * 100, 5), 95);
    
    const valorFmt = c.formato === 'pct' ? toPct(c.valor) : 
                    c.formato === 'x' ? clamp2(c.valor) + 'x' : 
                    clamp2(c.valor);
    const setorFmt = c.formato === 'pct' ? toPct(c.setor) : 
                    c.formato === 'x' ? clamp2(c.setor) + 'x' : 
                    clamp2(c.setor);
    
    barrasHtml += `
      <div style="background:#fff; border-radius:8px; padding:14px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
          <span style="font-weight:600; font-size:13px">${c.nome}</span>
          <span style="font-size:12px; color:${isMelhor ? '#10b981' : '#ef4444'}; font-weight:600">
            ${isMelhor ? '✓ Acima' : '⚠ Abaixo'} do setor
          </span>
        </div>
        <div style="position:relative; height:24px; background:#e2e8f0; border-radius:12px; overflow:hidden">
          <div style="position:absolute; left:50%; top:0; bottom:0; width:2px; background:#6366f1; z-index:1"></div>
          <div style="position:absolute; left:calc(${posicao}% - 12px); top:2px; width:24px; height:20px; background:${isMelhor ? '#10b981' : '#f59e0b'}; border-radius:10px; display:flex; align-items:center; justify-content:center; z-index:2">
            <span style="color:#fff; font-size:10px; font-weight:700">●</span>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:11px; color:#6b7280">
          <span>Você: <strong>${valorFmt}</strong></span>
          <span>Setor: <strong>${setorFmt}</strong></span>
        </div>
      </div>
    `;
  });
  
  // Gerar insight
  const insights = [];
  if(latest.margem > 0.12) insights.push('margem operacional acima da média');
  else insights.push('margem operacional pode melhorar');
  if(latest.alav < 2.0) insights.push('alavancagem conservadora');
  else if(latest.alav > 2.5) insights.push('alavancagem requer atenção');
  if(latest.liq > 1.3) insights.push('liquidez confortável');
  else if(latest.liq < 1.0) insights.push('liquidez abaixo do ideal');
  const insightTexto = 'Empresa apresenta ' + insights.slice(0,2).join(' e ') + '.';
  
  return `
    <div style="margin-top:24px; background:linear-gradient(135deg, #f8fafc, #e0e7ff); border:1px solid #c7d2fe; border-radius:12px; padding:20px">
      <h4 style="font-size:16px; font-weight:700; color:#3730a3; margin-bottom:16px; display:flex; align-items:center; gap:8px">
        📊 Posicionamento vs Mercado
        <span style="font-size:11px; font-weight:400; background:#e0e7ff; padding:2px 8px; border-radius:4px">Benchmarking</span>
      </h4>
      
      <div style="display:grid; gap:16px">
        ${barrasHtml}
      </div>
      
      <div style="margin-top:16px; padding:12px; background:#fff; border-radius:8px; border-left:4px solid #6366f1">
        <div style="font-size:13px; color:#3730a3">
          <strong>💡 Insight:</strong> ${insightTexto}
        </div>
      </div>
    </div>
  `;
}

// ================== ANÁLISES AVANÇADAS - O QUE NINGUÉM MOSTRA ==================
function gerarAnaliseAvancadaHtml(latest, rows){
  const previo = rows[1] || null;
  
  // ===== 1. VALUATION DA EMPRESA =====
  // Múltiplo de EBITDA típico por setor (usando 5x como média)
  const multiploEbitda = 5;
  const valorEmpresa = latest.ebitda > 0 ? latest.ebitda * multiploEbitda : 0;
  const valorEmpresaAnterior = previo && previo.ebitda > 0 ? previo.ebitda * multiploEbitda : 0;
  const variacaoValor = valorEmpresaAnterior > 0 ? valorEmpresa - valorEmpresaAnterior : null;
  
  // ===== 2. CUSTO DO DINHEIRO PARADO =====
  // Taxa de oportunidade: 1.5% ao mês (CDI + spread)
  const taxaMensal = 0.015;
  const dinheiroEmEstoque = latest.estoques || 0;
  const dinheiroEmRecebiveis = latest.contasReceber || 0;
  const dinheiroParado = dinheiroEmEstoque + dinheiroEmRecebiveis;
  const custoMensalDinheiroParado = dinheiroParado * taxaMensal;
  const custoAnualDinheiroParado = custoMensalDinheiroParado * 12;
  
  // ===== 3. ALTMAN Z-SCORE (Probabilidade de Falência) =====
  // Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 1.0*X5
  // X1 = Capital de Giro / Ativo Total
  // X2 = Lucros Retidos / Ativo Total (usamos PL como proxy)
  // X3 = EBITDA / Ativo Total
  // X4 = Valor de Mercado PL / Passivo Total (usamos PL / Dívida)
  // X5 = Receita / Ativo Total
  const ativo = latest.ativo || latest.receita * 1.5; // Estimar se não tiver
  const capitalGiro = (latest.ativoCirc || 0) - (latest.passivoCirc || 0);
  const X1 = ativo > 0 ? capitalGiro / ativo : 0;
  const X2 = ativo > 0 ? (latest.pl || 0) / ativo : 0;
  const X3 = ativo > 0 ? latest.ebitda / ativo : 0;
  const X4 = latest.dividaLiq > 0 ? (latest.pl || 0) / latest.dividaLiq : 3;
  const X5 = ativo > 0 ? latest.receita / ativo : 0;
  const zScore = (1.2 * X1) + (1.4 * X2) + (3.3 * X3) + (0.6 * X4) + (1.0 * X5);
  
  let zScoreStatus, zScoreCor, zScoreTexto;
  if(zScore > 2.99){
    zScoreStatus = 'ZONA SEGURA';
    zScoreCor = '#10b981';
    zScoreTexto = 'Baixa probabilidade de insolvência';
  } else if(zScore > 1.81){
    zScoreStatus = 'ZONA CINZENTA';
    zScoreCor = '#f59e0b';
    zScoreTexto = 'Situação incerta - monitorar de perto';
  } else {
    zScoreStatus = 'ZONA DE PERIGO';
    zScoreCor = '#ef4444';
    zScoreTexto = 'Alta probabilidade de dificuldades financeiras em 2 anos';
  }
  
  // ===== 4. PONTO DE EQUILÍBRIO =====
  // Custos Fixos estimados = Receita - EBITDA - (margem variável estimada * Receita)
  const margemContribuicao = 0.35; // Estimativa conservadora
  const custoFixoEstimado = latest.receita * (1 - latest.margem) * 0.6; // 60% dos custos são fixos
  const pontoEquilibrio = margemContribuicao > 0 ? custoFixoEstimado / margemContribuicao : 0;
  const margemSeguranca = latest.receita > 0 ? ((latest.receita - pontoEquilibrio) / latest.receita * 100) : 0;
  
  // ===== 5. CAPACIDADE DE CRESCIMENTO SUSTENTÁVEL =====
  // g = ROE * (1 - payout)
  // Assumindo payout de 30%
  const payout = 0.30;
  const crescimentoSustentavel = latest.roe * (1 - payout) * 100;
  
  // ===== 6. PRODUTIVIDADE POR FUNCIONÁRIO =====
  // Estimativa: Receita / 150K por funcionário (média Brasil)
  const funcionariosEstimado = Math.round(latest.receita / 150000) || 1;
  const receitaPorFunc = latest.receita / funcionariosEstimado;
  const ebitdaPorFunc = latest.ebitda / funcionariosEstimado;
  const setorReceitaFunc = 200000; // Média de mercado
  const produtividadeVsSetor = ((receitaPorFunc / setorReceitaFunc) - 1) * 100;
  
  // ===== 7. CUSTO REAL DA DÍVIDA =====
  const despesaFinanceira = latest.despesaFin || (latest.dividaLiq * 0.15); // Estimar 15% a.a. se não tiver
  const custoSobreReceita = latest.receita > 0 ? (despesaFinanceira / latest.receita * 100) : 0;
  const custoSobreEbitda = latest.ebitda > 0 ? (despesaFinanceira / latest.ebitda * 100) : 0;
  
  // ===== 8. CRIAÇÃO/DESTRUIÇÃO DE VALOR (EVA Simplificado) =====
  // EVA = NOPAT - (Capital Investido * WACC)
  // Simplificado: EVA = EBITDA - Impostos - (Ativo * 12%)
  const wacc = 0.12; // 12% custo de capital
  const capitalInvestido = ativo;
  const nopat = latest.ebitda * 0.75; // EBITDA - 25% impostos
  const eva = nopat - (capitalInvestido * wacc);
  
  // ===== 9. PROJEÇÃO 3 ANOS =====
  let taxaCrescimento = 0;
  if(rows.length >= 2){
    const receitaInicial = rows[rows.length - 1].receita;
    const receitaFinal = rows[0].receita;
    const anos = rows.length - 1;
    taxaCrescimento = anos > 0 ? (Math.pow(receitaFinal / receitaInicial, 1/anos) - 1) : 0;
  }
  const receitaAno1 = latest.receita * (1 + taxaCrescimento);
  const receitaAno2 = receitaAno1 * (1 + taxaCrescimento);
  const receitaAno3 = receitaAno2 * (1 + taxaCrescimento);
  const ebitdaAno3 = receitaAno3 * latest.margem;
  const valorAno3 = ebitdaAno3 * multiploEbitda;
  const variacaoValor3Anos = valorEmpresa > 0 ? ((valorAno3 / valorEmpresa) - 1) * 100 : 0;
  
  // ===== 10. MAPA DE CALOR (SCORES POR ÁREA) =====
  const scoreRentabilidade = Math.min(100, Math.max(0, (latest.margem / 0.20) * 100));
  const scoreAlavancagem = Math.min(100, Math.max(0, ((4 - latest.alav) / 4) * 100));
  const scoreLiquidez = Math.min(100, Math.max(0, (latest.liq / 2) * 100));
  const scoreEficiencia = Math.min(100, Math.max(0, (latest.roe / 0.25) * 100));
  const scoreCrescimento = Math.min(100, Math.max(0, (taxaCrescimento + 0.10) / 0.30 * 100));
  
  // Gerar HTML
  let html = `
    <div style="margin-top:24px">
      <div style="background:linear-gradient(135deg, #0f172a, #1e293b); color:#fff; border-radius:16px; padding:24px; margin-bottom:20px">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px">
          <span style="font-size:28px">🧠</span>
          <div>
            <h4 style="font-size:20px; font-weight:800; margin:0">Análise Profunda</h4>
            <p style="font-size:12px; opacity:0.7; margin:4px 0 0 0">O que nenhum banco mostra • O que seu CFO deveria calcular</p>
          </div>
        </div>
      </div>
      
      <!-- LINHA 1: Valuation + Custo do Dinheiro Parado -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px; margin-bottom:16px">
        
        <!-- VALUATION DA EMPRESA -->
        <div style="background:linear-gradient(135deg, #fef3c7, #fde68a); border-radius:12px; padding:20px; position:relative; overflow:hidden">
          <div style="position:absolute; right:-20px; top:-20px; font-size:80px; opacity:0.1">💰</div>
          <div style="font-size:12px; font-weight:600; color:#92400e; margin-bottom:8px">💰 VALUATION DA EMPRESA</div>
          <div style="font-size:32px; font-weight:800; color:#78350f">${toBRL(valorEmpresa)}</div>
          <div style="font-size:11px; color:#92400e; margin-top:4px">Baseado em ${multiploEbitda}x EBITDA (múltiplo de mercado)</div>
          ${variacaoValor !== null ? `
            <div style="margin-top:16px; padding:12px; background:${variacaoValor >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; border-radius:8px">
              <div style="font-size:13px; font-weight:700; color:${variacaoValor >= 0 ? '#065f46' : '#991b1b'}">
                ${variacaoValor >= 0 ? '📈 Valorização' : '📉 Desvalorização'}: ${toBRL(Math.abs(variacaoValor))}
              </div>
              <div style="font-size:11px; color:${variacaoValor >= 0 ? '#065f46' : '#991b1b'}">
                ${variacaoValor >= 0 ? 'Parabéns! Seu patrimônio cresceu.' : 'Você PERDEU esse valor em patrimônio no último ano.'}
              </div>
            </div>
          ` : ''}
        </div>
        
        <!-- CUSTO DO DINHEIRO PARADO -->
        <div style="background:linear-gradient(135deg, #fee2e2, #fecaca); border-radius:12px; padding:20px; position:relative; overflow:hidden">
          <div style="position:absolute; right:-20px; top:-20px; font-size:80px; opacity:0.1">🔥</div>
          <div style="font-size:12px; font-weight:600; color:#991b1b; margin-bottom:8px">🔥 CUSTO DO DINHEIRO PARADO</div>
          <div style="font-size:32px; font-weight:800; color:#7f1d1d">${toBRL(custoMensalDinheiroParado)}<span style="font-size:16px">/mês</span></div>
          <div style="font-size:11px; color:#991b1b; margin-top:4px">
            Estoque: ${toBRL(dinheiroEmEstoque)} + Recebíveis: ${toBRL(dinheiroEmRecebiveis)}
          </div>
          <div style="margin-top:16px; padding:12px; background:rgba(255,255,255,0.5); border-radius:8px">
            <div style="font-size:13px; font-weight:700; color:#7f1d1d">
              💸 ${toBRL(custoAnualDinheiroParado)}/ano queimando
            </div>
            <div style="font-size:11px; color:#991b1b">
              Isso pagaria ${Math.round(custoAnualDinheiroParado / 36000)} funcionários com salário de R$ 3.000
            </div>
          </div>
        </div>
      </div>
      
      <!-- LINHA 2: Z-Score + Ponto de Equilíbrio -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px; margin-bottom:16px">
        
        <!-- ALTMAN Z-SCORE -->
        <div style="background:#fff; border:2px solid ${zScoreCor}; border-radius:12px; padding:20px">
          <div style="font-size:12px; font-weight:600; color:#6b7280; margin-bottom:8px">☠️ ALTMAN Z-SCORE (Risco de Falência)</div>
          <div style="display:flex; align-items:center; gap:16px">
            <div style="width:80px; height:80px; border-radius:50%; background:${zScoreCor}; display:flex; align-items:center; justify-content:center">
              <span style="font-size:24px; font-weight:800; color:#fff">${zScore.toFixed(2)}</span>
            </div>
            <div>
              <div style="font-size:18px; font-weight:800; color:${zScoreCor}">${zScoreStatus}</div>
              <div style="font-size:12px; color:#6b7280; margin-top:4px">${zScoreTexto}</div>
            </div>
          </div>
          <div style="margin-top:16px; background:#f8fafc; border-radius:8px; padding:12px">
            <div style="display:flex; justify-content:space-between; font-size:11px; color:#6b7280; margin-bottom:8px">
              <span>Perigo</span><span>Cinzento</span><span>Seguro</span>
            </div>
            <div style="height:8px; background:#e2e8f0; border-radius:4px; position:relative">
              <div style="position:absolute; left:0; top:0; bottom:0; width:30%; background:#ef4444; border-radius:4px 0 0 4px"></div>
              <div style="position:absolute; left:30%; top:0; bottom:0; width:20%; background:#f59e0b"></div>
              <div style="position:absolute; left:50%; top:0; bottom:0; width:50%; background:#10b981; border-radius:0 4px 4px 0"></div>
              <div style="position:absolute; left:${Math.min(95, Math.max(5, (zScore / 4) * 100))}%; top:-4px; width:16px; height:16px; background:#1e293b; border-radius:50%; border:2px solid #fff; transform:translateX(-50%)"></div>
            </div>
            <div style="font-size:10px; color:#9ca3af; margin-top:8px; text-align:center">
              Modelo de Edward Altman (1968) - Precisão histórica de 80-90%
            </div>
          </div>
        </div>
        
        <!-- PONTO DE EQUILÍBRIO -->
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px">
          <div style="font-size:12px; font-weight:600; color:#6b7280; margin-bottom:8px">⚖️ PONTO DE EQUILÍBRIO</div>
          <div style="font-size:28px; font-weight:800; color:#1e293b">${toBRL(pontoEquilibrio)}</div>
          <div style="font-size:11px; color:#6b7280">Faturamento mínimo para não ter prejuízo</div>
          
          <div style="margin-top:16px">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
              <span style="font-size:12px; color:#6b7280">Margem de Segurança</span>
              <span style="font-size:14px; font-weight:700; color:${margemSeguranca > 20 ? '#10b981' : margemSeguranca > 10 ? '#f59e0b' : '#ef4444'}">${margemSeguranca.toFixed(1)}%</span>
            </div>
            <div style="height:12px; background:#e2e8f0; border-radius:6px; overflow:hidden">
              <div style="height:100%; width:${Math.min(100, (pontoEquilibrio / latest.receita) * 100)}%; background:linear-gradient(90deg, #ef4444, #f59e0b, #10b981)"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:10px; color:#9ca3af; margin-top:4px">
              <span>Break-even: ${toBRL(pontoEquilibrio)}</span>
              <span>Atual: ${toBRL(latest.receita)}</span>
            </div>
          </div>
          
          ${margemSeguranca < 15 ? `
            <div style="margin-top:12px; padding:10px; background:#fef2f2; border-radius:6px; font-size:11px; color:#991b1b">
              ⚠️ <strong>Alerta:</strong> Margem de segurança baixa. Uma queda de ${margemSeguranca.toFixed(0)}% na receita já gera prejuízo.
            </div>
          ` : ''}
        </div>
      </div>
      
      <!-- LINHA 3: Crescimento Sustentável + Produtividade -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px; margin-bottom:16px">
        
        <!-- CAPACIDADE DE CRESCIMENTO -->
        <div style="background:linear-gradient(135deg, #ecfdf5, #d1fae5); border-radius:12px; padding:20px">
          <div style="font-size:12px; font-weight:600; color:#065f46; margin-bottom:8px">🚀 CRESCIMENTO SUSTENTÁVEL</div>
          <div style="font-size:32px; font-weight:800; color:#047857">${crescimentoSustentavel.toFixed(1)}%<span style="font-size:16px">/ano</span></div>
          <div style="font-size:11px; color:#065f46; margin-top:4px">Quanto pode crescer SEM precisar de banco</div>
          
          <div style="margin-top:16px; padding:12px; background:rgba(255,255,255,0.6); border-radius:8px">
            <div style="font-size:12px; color:#065f46">
              ${crescimentoSustentavel > 15 ? 
                '✅ Excelente! Pode financiar crescimento com recursos próprios.' :
                crescimentoSustentavel > 8 ?
                '⚠️ Crescimento moderado. Para expandir mais rápido, precisará de capital.' :
                '🚨 Capacidade limitada. Crescimento agressivo exigirá aporte ou dívida.'
              }
            </div>
          </div>
          
          <div style="margin-top:12px; font-size:11px; color:#065f46">
            <strong>Se quiser crescer 20%:</strong> Precisará de ${toBRL(latest.receita * 0.20 * 0.3)} em capital adicional
          </div>
        </div>
        
        <!-- PRODUTIVIDADE POR FUNCIONÁRIO -->
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px">
          <div style="font-size:12px; font-weight:600; color:#6b7280; margin-bottom:8px">👷 PRODUTIVIDADE POR FUNCIONÁRIO</div>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px">
            <div style="text-align:center; padding:12px; background:#f8fafc; border-radius:8px">
              <div style="font-size:10px; color:#6b7280">Receita/Func.</div>
              <div style="font-size:18px; font-weight:700; color:#1e293b">${toBRL(receitaPorFunc)}</div>
            </div>
            <div style="text-align:center; padding:12px; background:#f8fafc; border-radius:8px">
              <div style="font-size:10px; color:#6b7280">EBITDA/Func.</div>
              <div style="font-size:18px; font-weight:700; color:#1e293b">${toBRL(ebitdaPorFunc)}</div>
            </div>
          </div>
          
          <div style="padding:12px; background:${produtividadeVsSetor >= 0 ? '#ecfdf5' : '#fef2f2'}; border-radius:8px">
            <div style="font-size:13px; font-weight:700; color:${produtividadeVsSetor >= 0 ? '#065f46' : '#991b1b'}">
              ${produtividadeVsSetor >= 0 ? '📈' : '📉'} ${Math.abs(produtividadeVsSetor).toFixed(0)}% ${produtividadeVsSetor >= 0 ? 'ACIMA' : 'ABAIXO'} do setor
            </div>
            <div style="font-size:11px; color:${produtividadeVsSetor >= 0 ? '#065f46' : '#991b1b'}">
              Média do setor: ${toBRL(setorReceitaFunc)}/funcionário
            </div>
          </div>
          
          <div style="margin-top:12px; font-size:10px; color:#9ca3af">
            *Estimativa baseada em ~${funcionariosEstimado} funcionários (R$ 150K receita/func)
          </div>
        </div>
      </div>
      
      <!-- LINHA 4: Custo da Dívida + Criação de Valor -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px; margin-bottom:16px">
        
        <!-- CUSTO REAL DA DÍVIDA -->
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px">
          <div style="font-size:12px; font-weight:600; color:#6b7280; margin-bottom:8px">💸 CUSTO REAL DA DÍVIDA</div>
          
          <div style="display:flex; align-items:center; gap:20px; margin-bottom:16px">
            <div style="position:relative; width:100px; height:100px">
              <svg viewBox="0 0 36 36" style="transform:rotate(-90deg)">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e2e8f0" stroke-width="3"/>
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${custoSobreReceita > 10 ? '#ef4444' : custoSobreReceita > 5 ? '#f59e0b' : '#10b981'}" stroke-width="3" stroke-dasharray="${Math.min(100, custoSobreReceita * 2)}, 100"/>
              </svg>
              <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center">
                <div style="font-size:20px; font-weight:800; color:${custoSobreReceita > 10 ? '#ef4444' : '#1e293b'}">${custoSobreReceita.toFixed(1)}%</div>
                <div style="font-size:9px; color:#6b7280">da receita</div>
              </div>
            </div>
            <div>
              <div style="font-size:24px; font-weight:700; color:#1e293b">${toBRL(despesaFinanceira)}</div>
              <div style="font-size:11px; color:#6b7280">Despesa financeira anual</div>
              <div style="font-size:12px; color:${custoSobreEbitda > 30 ? '#ef4444' : '#6b7280'}; margin-top:8px">
                ${custoSobreEbitda.toFixed(0)}% do EBITDA vai para juros
              </div>
            </div>
          </div>
          
          <div style="padding:10px; background:${custoSobreReceita > 8 ? '#fef2f2' : '#f8fafc'}; border-radius:6px; font-size:11px">
            ${custoSobreReceita > 10 ? 
              '<span style="color:#991b1b">🚨 <strong>Crítico:</strong> Mais de 10% da receita vai para juros. Renegociar urgente!</span>' :
              custoSobreReceita > 5 ?
              '<span style="color:#92400e">⚠️ <strong>Atenção:</strong> Custo financeiro elevado. Considere renegociar taxas.</span>' :
              '<span style="color:#065f46">✅ <strong>Saudável:</strong> Custo financeiro sob controle.</span>'
            }
          </div>
        </div>
        
        <!-- CRIAÇÃO/DESTRUIÇÃO DE VALOR (EVA) -->
        <div style="background:${eva >= 0 ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)' : 'linear-gradient(135deg, #fef2f2, #fecaca)'}; border-radius:12px; padding:20px; position:relative; overflow:hidden">
          <div style="position:absolute; right:-20px; top:-20px; font-size:80px; opacity:0.1">${eva >= 0 ? '📈' : '📉'}</div>
          <div style="font-size:12px; font-weight:600; color:${eva >= 0 ? '#065f46' : '#991b1b'}; margin-bottom:8px">
            ${eva >= 0 ? '✨ CRIAÇÃO DE VALOR' : '💀 DESTRUIÇÃO DE VALOR'}
          </div>
          <div style="font-size:32px; font-weight:800; color:${eva >= 0 ? '#047857' : '#dc2626'}">${toBRL(Math.abs(eva))}</div>
          <div style="font-size:11px; color:${eva >= 0 ? '#065f46' : '#991b1b'}; margin-top:4px">
            ${eva >= 0 ? 'Valor CRIADO para os sócios este ano' : 'Valor DESTRUÍDO dos sócios este ano'}
          </div>
          
          <div style="margin-top:16px; padding:12px; background:rgba(255,255,255,0.6); border-radius:8px; font-size:11px">
            <div style="color:${eva >= 0 ? '#065f46' : '#991b1b'}">
              ${eva >= 0 ? 
                '✅ A empresa está gerando retorno acima do custo de capital. Os sócios estão ganhando dinheiro de verdade.' :
                '⚠️ O retorno está abaixo do custo de capital (12%). Os sócios perderiam menos deixando o dinheiro aplicado.'
              }
            </div>
          </div>
          
          <div style="margin-top:12px; font-size:10px; color:${eva >= 0 ? '#065f46' : '#991b1b'}">
            EVA = NOPAT (${toBRL(nopat)}) - Capital × WACC (${toBRL(capitalInvestido * wacc)})
          </div>
        </div>
      </div>
      
      <!-- LINHA 5: Projeção 3 Anos -->
      <div style="background:linear-gradient(135deg, #1e293b, #334155); color:#fff; border-radius:12px; padding:20px; margin-bottom:16px">
        <div style="font-size:12px; font-weight:600; opacity:0.8; margin-bottom:8px">🔮 PROJEÇÃO - SE CONTINUAR ASSIM...</div>
        
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; margin-bottom:20px">
          <div style="text-align:center; padding:16px; background:rgba(255,255,255,0.1); border-radius:8px">
            <div style="font-size:11px; opacity:0.7">Hoje</div>
            <div style="font-size:11px; opacity:0.5">${latest.ano}</div>
            <div style="font-size:18px; font-weight:700; margin-top:8px">${toBRL(latest.receita)}</div>
          </div>
          <div style="text-align:center; padding:16px; background:rgba(255,255,255,0.1); border-radius:8px">
            <div style="font-size:11px; opacity:0.7">Ano 1</div>
            <div style="font-size:11px; opacity:0.5">${latest.ano + 1}</div>
            <div style="font-size:18px; font-weight:700; margin-top:8px">${toBRL(receitaAno1)}</div>
          </div>
          <div style="text-align:center; padding:16px; background:rgba(255,255,255,0.1); border-radius:8px">
            <div style="font-size:11px; opacity:0.7">Ano 2</div>
            <div style="font-size:11px; opacity:0.5">${latest.ano + 2}</div>
            <div style="font-size:18px; font-weight:700; margin-top:8px">${toBRL(receitaAno2)}</div>
          </div>
          <div style="text-align:center; padding:16px; background:rgba(255,255,255,0.15); border-radius:8px; border:1px solid rgba(255,255,255,0.3)">
            <div style="font-size:11px; opacity:0.7">Ano 3</div>
            <div style="font-size:11px; opacity:0.5">${latest.ano + 3}</div>
            <div style="font-size:18px; font-weight:700; margin-top:8px">${toBRL(receitaAno3)}</div>
          </div>
        </div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">
          <div style="padding:16px; background:rgba(255,255,255,0.1); border-radius:8px">
            <div style="font-size:11px; opacity:0.7">Valor da Empresa em 3 Anos</div>
            <div style="font-size:24px; font-weight:700; margin-top:4px">${toBRL(valorAno3)}</div>
            <div style="font-size:12px; margin-top:8px; color:${variacaoValor3Anos >= 0 ? '#4ade80' : '#f87171'}">
              ${variacaoValor3Anos >= 0 ? '📈' : '📉'} ${variacaoValor3Anos >= 0 ? '+' : ''}${variacaoValor3Anos.toFixed(1)}% vs hoje
            </div>
          </div>
          <div style="padding:16px; background:rgba(255,255,255,0.1); border-radius:8px">
            <div style="font-size:11px; opacity:0.7">Taxa de Crescimento Histórica</div>
            <div style="font-size:24px; font-weight:700; margin-top:4px; color:${taxaCrescimento >= 0 ? '#4ade80' : '#f87171'}">
              ${(taxaCrescimento * 100).toFixed(1)}%<span style="font-size:14px">/ano</span>
            </div>
            <div style="font-size:12px; margin-top:8px; opacity:0.7">
              ${taxaCrescimento >= 0.10 ? '🚀 Crescimento acelerado' :
                taxaCrescimento >= 0 ? '➡️ Crescimento moderado' :
                '📉 Empresa encolhendo'}
            </div>
          </div>
        </div>
        
        ${taxaCrescimento < 0 ? `
          <div style="margin-top:16px; padding:12px; background:rgba(248,113,113,0.2); border-radius:8px; font-size:12px">
            🚨 <strong>Alerta:</strong> A empresa está encolhendo ${(Math.abs(taxaCrescimento) * 100).toFixed(1)}% ao ano. 
            Se continuar assim, em 3 anos a receita será ${toPct(Math.pow(1 + taxaCrescimento, 3))} do que é hoje.
          </div>
        ` : ''}
      </div>
      
      <!-- LINHA 6: Mapa de Calor de Riscos -->
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px">
        <div style="font-size:12px; font-weight:600; color:#6b7280; margin-bottom:16px">🗺️ MAPA DE CALOR - ONDE ESTÃO OS PROBLEMAS</div>
        
        <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:8px">
          ${[
            { nome: 'Rentabilidade', score: scoreRentabilidade, icon: '💰' },
            { nome: 'Alavancagem', score: scoreAlavancagem, icon: '🏦' },
            { nome: 'Liquidez', score: scoreLiquidez, icon: '💧' },
            { nome: 'Eficiência', score: scoreEficiencia, icon: '⚡' },
            { nome: 'Crescimento', score: scoreCrescimento, icon: '📈' }
          ].map(item => {
            const cor = item.score >= 70 ? '#10b981' : item.score >= 40 ? '#f59e0b' : '#ef4444';
            return `
              <div style="text-align:center">
                <div style="width:100%; padding-bottom:100%; background:${cor}; border-radius:12px; position:relative; opacity:${0.3 + (item.score/100) * 0.7}">
                  <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%)">
                    <div style="font-size:24px">${item.icon}</div>
                    <div style="font-size:16px; font-weight:800; color:#fff">${Math.round(item.score)}</div>
                  </div>
                </div>
                <div style="font-size:10px; color:#6b7280; margin-top:4px">${item.nome}</div>
              </div>
            `;
          }).join('')}
        </div>
        
        <div style="margin-top:16px; display:flex; justify-content:center; gap:16px; font-size:11px; color:#6b7280">
          <span><span style="display:inline-block; width:12px; height:12px; background:#10b981; border-radius:2px; margin-right:4px"></span>Bom (≥70)</span>
          <span><span style="display:inline-block; width:12px; height:12px; background:#f59e0b; border-radius:2px; margin-right:4px"></span>Atenção (40-69)</span>
          <span><span style="display:inline-block; width:12px; height:12px; background:#ef4444; border-radius:2px; margin-right:4px"></span>Crítico (<40)</span>
        </div>
        
        <div style="margin-top:16px; padding:12px; background:#f8fafc; border-radius:8px">
          <div style="font-size:12px; font-weight:600; color:#1e293b; margin-bottom:8px">📋 Prioridade de Ação:</div>
          <div style="font-size:12px; color:#6b7280">
            ${[
              { nome: 'Rentabilidade', score: scoreRentabilidade },
              { nome: 'Alavancagem', score: scoreAlavancagem },
              { nome: 'Liquidez', score: scoreLiquidez },
              { nome: 'Eficiência', score: scoreEficiencia },
              { nome: 'Crescimento', score: scoreCrescimento }
            ].filter(i => i.score < 50).sort((a,b) => a.score - b.score).slice(0,3).map((item, idx) => 
              `<div style="margin-top:4px">${idx + 1}. <strong>${item.nome}</strong> (Score: ${Math.round(item.score)}) - Precisa de atenção urgente</div>`
            ).join('') || '<div style="color:#10b981">✅ Todos os indicadores estão em níveis aceitáveis!</div>'}
          </div>
        </div>
      </div>
    </div>
  `;
  
  // ========== NOVOS PAINÉIS AVANÇADOS ==========
  
  // ===== PAINEL 1: ANÁLISE DUPONT (Decomposição do ROE) =====
  const dupontMargem = latest.margemLiq || (latest.margem * 0.6);
  const dupontGiro = latest.giroAtv || (latest.receita / ativo);
  const dupontAlav = latest.alavFin || (ativo / latest.pl);
  const roeDupont = dupontMargem * dupontGiro * dupontAlav;
  
  html += `
    <div style="margin-top:16px">
      <div style="background:linear-gradient(135deg, #4f46e5, #7c3aed); color:#fff; border-radius:12px; padding:20px; margin-bottom:16px">
        <div style="font-size:12px; font-weight:600; opacity:0.9; margin-bottom:8px">🔬 ANÁLISE DUPONT - Decomposição do ROE</div>
        <div style="font-size:11px; opacity:0.7; margin-bottom:20px">Entenda DE ONDE vem (ou deveria vir) a rentabilidade</div>
        
        <div style="display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:8px">
          <div style="text-align:center; padding:16px 20px; background:rgba(255,255,255,0.15); border-radius:12px; min-width:120px">
            <div style="font-size:10px; opacity:0.8">Margem Líquida</div>
            <div style="font-size:24px; font-weight:800">${(dupontMargem * 100).toFixed(1)}%</div>
            <div style="font-size:10px; opacity:0.7; margin-top:4px">Lucro / Receita</div>
          </div>
          <div style="font-size:24px; font-weight:300">×</div>
          <div style="text-align:center; padding:16px 20px; background:rgba(255,255,255,0.15); border-radius:12px; min-width:120px">
            <div style="font-size:10px; opacity:0.8">Giro do Ativo</div>
            <div style="font-size:24px; font-weight:800">${dupontGiro.toFixed(2)}x</div>
            <div style="font-size:10px; opacity:0.7; margin-top:4px">Receita / Ativo</div>
          </div>
          <div style="font-size:24px; font-weight:300">×</div>
          <div style="text-align:center; padding:16px 20px; background:rgba(255,255,255,0.15); border-radius:12px; min-width:120px">
            <div style="font-size:10px; opacity:0.8">Alavancagem</div>
            <div style="font-size:24px; font-weight:800">${dupontAlav.toFixed(2)}x</div>
            <div style="font-size:10px; opacity:0.7; margin-top:4px">Ativo / PL</div>
          </div>
          <div style="font-size:24px; font-weight:300">=</div>
          <div style="text-align:center; padding:16px 20px; background:rgba(255,255,255,0.25); border-radius:12px; border:2px solid rgba(255,255,255,0.3); min-width:120px">
            <div style="font-size:10px; opacity:0.8">ROE</div>
            <div style="font-size:28px; font-weight:800">${(roeDupont * 100).toFixed(1)}%</div>
            <div style="font-size:10px; opacity:0.7; margin-top:4px">Retorno / Equity</div>
          </div>
        </div>
        
        <div style="margin-top:20px; padding:16px; background:rgba(255,255,255,0.1); border-radius:10px">
          <div style="font-size:12px; font-weight:600; margin-bottom:8px">💡 Diagnóstico DuPont:</div>
          <div style="font-size:12px; opacity:0.9">
            ${dupontMargem < 0.05 && dupontGiro < 1 ? 
              '⚠️ <strong>Duplo problema:</strong> Margem baixa E giro lento. Precisa revisar preços E otimizar ativos.' :
              dupontMargem < 0.05 ? 
              '📉 <strong>Margem comprimida:</strong> O ROE depende muito de volume. Trabalhe preços e custos.' :
              dupontGiro < 0.8 ?
              '🐌 <strong>Ativos subutilizados:</strong> Muitos recursos parados. Aumente vendas ou reduza ativos.' :
              dupontAlav > 3 ?
              '🏦 <strong>Muito alavancada:</strong> ROE alto, mas com risco. Depende demais de dívida.' :
              '✅ <strong>Equilíbrio saudável:</strong> ROE bem distribuído entre margem, giro e alavancagem.'
            }
          </div>
        </div>
      </div>
      
      <!-- ===== PAINEL 2: LIQUIDEZ COMPLETA (4 tipos) ===== -->
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:16px">
        <div style="font-size:12px; font-weight:600; color:#6b7280; margin-bottom:16px">💧 PAINEL DE LIQUIDEZ - Capacidade de Pagamento</div>
        
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px">
          ${[
            { nome: 'Imediata', valor: latest.liqImediata, formula: 'Disponível/PC', ideal: '≥0.3', cor: latest.liqImediata >= 0.3 ? '#10b981' : latest.liqImediata >= 0.1 ? '#f59e0b' : '#ef4444' },
            { nome: 'Seca', valor: latest.liqSeca, formula: '(AC-Estoque)/PC', ideal: '≥1.0', cor: latest.liqSeca >= 1 ? '#10b981' : latest.liqSeca >= 0.7 ? '#f59e0b' : '#ef4444' },
            { nome: 'Corrente', valor: latest.liqCorrente || latest.liq, formula: 'AC/PC', ideal: '≥1.5', cor: (latest.liqCorrente || latest.liq) >= 1.5 ? '#10b981' : (latest.liqCorrente || latest.liq) >= 1 ? '#f59e0b' : '#ef4444' },
            { nome: 'Geral', valor: latest.liqGeral, formula: '(AC+RLP)/(PC+PNC)', ideal: '≥1.0', cor: latest.liqGeral >= 1 ? '#10b981' : latest.liqGeral >= 0.7 ? '#f59e0b' : '#ef4444' }
          ].map(item => `
            <div style="text-align:center; padding:16px; background:#f8fafc; border-radius:10px; border-bottom:4px solid ${item.cor}">
              <div style="font-size:10px; color:#6b7280; margin-bottom:4px">${item.nome}</div>
              <div style="font-size:28px; font-weight:800; color:${item.cor}">${item.valor != null ? item.valor.toFixed(2) : '—'}</div>
              <div style="font-size:9px; color:#9ca3af; margin-top:4px">${item.formula}</div>
              <div style="font-size:9px; color:#6b7280; margin-top:2px">Ideal: ${item.ideal}</div>
            </div>
          `).join('')}
        </div>
        
        <div style="margin-top:16px; padding:12px; background:#f0f9ff; border-radius:8px">
          <div style="font-size:12px; color:#0369a1">
            ${latest.liqImediata < 0.1 ? '🚨 <strong>Liquidez Imediata crítica:</strong> Não tem caixa para emergências. Risco de inadimplência.' :
              latest.liqSeca < 0.7 ? '⚠️ <strong>Liquidez Seca baixa:</strong> Depende de vender estoque para pagar contas.' :
              (latest.liqCorrente || latest.liq) < 1 ? '⚠️ <strong>Capital de Giro negativo:</strong> Passivo de curto prazo maior que ativo. Perigoso!' :
              '✅ <strong>Liquidez adequada:</strong> Capacidade de honrar compromissos de curto e longo prazo.'
            }
          </div>
        </div>
      </div>
      
      <!-- ===== PAINEL 3: ANÁLISE FLEURIET (Modelo Brasileiro) ===== -->
      ${gerarFleurietHtml(latest)}
      
      <!-- ===== PAINEL 4: ESTRUTURA DE CAPITAL ===== -->
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:16px">
        <div style="font-size:12px; font-weight:600; color:#6b7280; margin-bottom:16px">🏗️ ESTRUTURA DE CAPITAL</div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">
          <!-- Composição do Financiamento -->
          <div>
            <div style="font-size:11px; color:#6b7280; margin-bottom:8px">Composição do Financiamento</div>
            <div style="height:24px; background:#e2e8f0; border-radius:12px; overflow:hidden; display:flex">
              ${latest.pl > 0 && ativo > 0 ? `
                <div style="width:${(latest.pl / ativo * 100).toFixed(0)}%; background:linear-gradient(90deg, #10b981, #34d399); display:flex; align-items:center; justify-content:center">
                  <span style="font-size:10px; color:#fff; font-weight:600">${(latest.pl / ativo * 100).toFixed(0)}% Próprio</span>
                </div>
                <div style="flex:1; background:linear-gradient(90deg, #f59e0b, #fbbf24); display:flex; align-items:center; justify-content:center">
                  <span style="font-size:10px; color:#fff; font-weight:600">${(100 - latest.pl / ativo * 100).toFixed(0)}% Terceiros</span>
                </div>
              ` : '<div style="flex:1; display:flex; align-items:center; justify-content:center; font-size:10px; color:#6b7280">Sem dados</div>'}
            </div>
          </div>
          
          <!-- Composição da Dívida -->
          <div>
            <div style="font-size:11px; color:#6b7280; margin-bottom:8px">Composição da Dívida (CP vs LP)</div>
            <div style="height:24px; background:#e2e8f0; border-radius:12px; overflow:hidden; display:flex">
              ${latest.composicaoEndCP != null ? `
                <div style="width:${(latest.composicaoEndCP * 100).toFixed(0)}%; background:linear-gradient(90deg, #ef4444, #f87171); display:flex; align-items:center; justify-content:center">
                  <span style="font-size:10px; color:#fff; font-weight:600">${(latest.composicaoEndCP * 100).toFixed(0)}% CP</span>
                </div>
                <div style="flex:1; background:linear-gradient(90deg, #3b82f6, #60a5fa); display:flex; align-items:center; justify-content:center">
                  <span style="font-size:10px; color:#fff; font-weight:600">${(100 - latest.composicaoEndCP * 100).toFixed(0)}% LP</span>
                </div>
              ` : '<div style="flex:1; display:flex; align-items:center; justify-content:center; font-size:10px; color:#6b7280">Sem dados</div>'}
            </div>
          </div>
        </div>
        
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-top:16px">
          <div style="text-align:center; padding:12px; background:#f8fafc; border-radius:8px">
            <div style="font-size:10px; color:#6b7280">CT/CP</div>
            <div style="font-size:18px; font-weight:700; color:${latest.ctcp > 2 ? '#ef4444' : latest.ctcp > 1 ? '#f59e0b' : '#10b981'}">${latest.ctcp != null ? latest.ctcp.toFixed(2) : '—'}</div>
            <div style="font-size:9px; color:#9ca3af">Ideal: ≤1.0</div>
          </div>
          <div style="text-align:center; padding:12px; background:#f8fafc; border-radius:8px">
            <div style="font-size:10px; color:#6b7280">End. Geral</div>
            <div style="font-size:18px; font-weight:700; color:${latest.endividamentoGeral > 0.7 ? '#ef4444' : latest.endividamentoGeral > 0.5 ? '#f59e0b' : '#10b981'}">${latest.endividamentoGeral != null ? (latest.endividamentoGeral * 100).toFixed(0) + '%' : '—'}</div>
            <div style="font-size:9px; color:#9ca3af">Ideal: ≤50%</div>
          </div>
          <div style="text-align:center; padding:12px; background:#f8fafc; border-radius:8px">
            <div style="font-size:10px; color:#6b7280">Imob/PL</div>
            <div style="font-size:18px; font-weight:700; color:${latest.imobPL > 1 ? '#ef4444' : latest.imobPL > 0.7 ? '#f59e0b' : '#10b981'}">${latest.imobPL != null ? (latest.imobPL * 100).toFixed(0) + '%' : '—'}</div>
            <div style="font-size:9px; color:#9ca3af">Ideal: ≤70%</div>
          </div>
          <div style="text-align:center; padding:12px; background:#f8fafc; border-radius:8px">
            <div style="font-size:10px; color:#6b7280">GAF</div>
            <div style="font-size:18px; font-weight:700; color:${latest.gaf > 2 ? '#f59e0b' : '#3b82f6'}">${latest.gaf != null ? latest.gaf.toFixed(2) : '—'}</div>
            <div style="font-size:9px; color:#9ca3af">Grau Alav. Fin.</div>
          </div>
        </div>
      </div>
      
      <!-- ===== PAINEL 5: CICLO FINANCEIRO ===== -->
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:16px">
        <div style="font-size:12px; font-weight:600; color:#6b7280; margin-bottom:16px">🔄 CICLO FINANCEIRO - Quanto tempo seu dinheiro fica "preso"</div>
        
        <div style="display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:4px; margin-bottom:20px">
          <div style="text-align:center; padding:12px 16px; background:#fef3c7; border-radius:8px">
            <div style="font-size:10px; color:#92400e">PME (Estoque)</div>
            <div style="font-size:20px; font-weight:700; color:#78350f">${latest.diasEst != null ? Math.round(latest.diasEst) : '—'}</div>
            <div style="font-size:9px; color:#92400e">dias</div>
          </div>
          <div style="font-size:20px; color:#9ca3af">+</div>
          <div style="text-align:center; padding:12px 16px; background:#dbeafe; border-radius:8px">
            <div style="font-size:10px; color:#1e40af">PMR (Receber)</div>
            <div style="font-size:20px; font-weight:700; color:#1e3a8a">${latest.pmr != null ? Math.round(latest.pmr) : '—'}</div>
            <div style="font-size:9px; color:#1e40af">dias</div>
          </div>
          <div style="font-size:20px; color:#9ca3af">−</div>
          <div style="text-align:center; padding:12px 16px; background:#dcfce7; border-radius:8px">
            <div style="font-size:10px; color:#166534">PMP (Pagar)</div>
            <div style="font-size:20px; font-weight:700; color:#14532d">${latest.pmp != null ? Math.round(latest.pmp) : '—'}</div>
            <div style="font-size:9px; color:#166534">dias</div>
          </div>
          <div style="font-size:20px; color:#9ca3af">=</div>
          <div style="text-align:center; padding:12px 20px; background:${latest.ciclo > 60 ? '#fee2e2' : latest.ciclo > 30 ? '#fef3c7' : '#dcfce7'}; border-radius:8px; border:2px solid ${latest.ciclo > 60 ? '#ef4444' : latest.ciclo > 30 ? '#f59e0b' : '#10b981'}">
            <div style="font-size:10px; color:#6b7280">Ciclo Financeiro</div>
            <div style="font-size:24px; font-weight:800; color:${latest.ciclo > 60 ? '#dc2626' : latest.ciclo > 30 ? '#d97706' : '#16a34a'}">${latest.ciclo != null ? Math.round(latest.ciclo) : '—'}</div>
            <div style="font-size:9px; color:#6b7280">dias</div>
          </div>
        </div>
        
        <div style="padding:12px; background:#f8fafc; border-radius:8px; font-size:12px; color:#6b7280">
          ${latest.ciclo > 90 ? 
            '🚨 <strong>Ciclo muito longo:</strong> Mais de 90 dias com dinheiro parado. Urgente otimizar estoque e cobrança.' :
            latest.ciclo > 60 ?
            '⚠️ <strong>Ciclo extenso:</strong> Empresa precisa financiar 2 meses de operação. Negocie prazos.' :
            latest.ciclo > 30 ?
            '➡️ <strong>Ciclo moderado:</strong> Dentro do normal para maioria dos setores.' :
            latest.ciclo <= 0 ?
            '✅ <strong>Ciclo negativo:</strong> Fornecedores financiam a operação. Excelente gestão de capital!' :
            '✅ <strong>Ciclo curto:</strong> Boa eficiência operacional. Pouca necessidade de capital de giro.'
          }
        </div>
      </div>
      
      <!-- ===== PAINEL 6: ANÁLISE VERTICAL DO BALANÇO ===== -->
      ${gerarAnaliseVerticalHtml(latest, rows[1])}
      
      <!-- ===== PAINEL 7: QUALIDADE DO ATIVO ===== -->
      ${gerarQualidadeAtivoHtml(latest)}
      
      <!-- ===== PAINEL 8: CONTINGÊNCIAS JUDICIAIS ===== -->
      ${gerarContingenciasHtml(latest)}
      
      <!-- ===== PAINEL 9: ANÁLISE HORIZONTAL (Evolução) ===== -->
      ${gerarAnaliseHorizontalHtml(rows)}
    </div>
  `;
  
  return html;
}

// ===== FUNÇÃO AUXILIAR: ANÁLISE FLEURIET =====
function gerarFleurietHtml(latest){
  // Modelo Fleuriet - Classificação Financeira Brasileira
  // CDG = PL + PNC - (Imobilizado + Investimentos + Intangível)
  // NCG = (CR + Estoques + Outros AC Operacionais) - (Fornecedores + Salários + Impostos + Outros PC Operacionais)
  // ST = CDG - NCG (ou Caixa - Empréstimos CP)
  
  const pl = latest.pl || 0;
  const pnc = latest.passivoNaoCirc || 0;
  const anc = (latest.imobilizado || 0) + (latest.investimentos || 0) + (latest.intangivel || 0);
  const cdg = pl + pnc - anc;
  
  const ncg = latest.ncg || ((latest.cr || 0) + (latest.estoques || 0) - (latest.cp || 0));
  const st = latest.ccl || (latest.disponiveis || latest.caixa || 0) - (latest.emprestimosCP || 0);
  
  // Classificação Fleuriet
  let tipoFleuriet, corFleuriet, descricaoFleuriet, iconeFleuriet;
  
  if(cdg > 0 && ncg < 0 && st > 0){
    tipoFleuriet = 'EXCELENTE';
    corFleuriet = '#10b981';
    iconeFleuriet = '🏆';
    descricaoFleuriet = 'Folga financeira total. CDG positivo, NCG negativo (fornecedores financiam) e Saldo de Tesouraria positivo.';
  } else if(cdg > 0 && ncg > 0 && st > 0 && cdg > ncg){
    tipoFleuriet = 'SÓLIDA';
    corFleuriet = '#22c55e';
    iconeFleuriet = '✅';
    descricaoFleuriet = 'Estrutura saudável. CDG financia a NCG e ainda sobra caixa.';
  } else if(cdg > 0 && ncg > 0 && st > 0 && cdg < ncg){
    tipoFleuriet = 'SATISFATÓRIA';
    corFleuriet = '#84cc16';
    iconeFleuriet = '👍';
    descricaoFleuriet = 'Aceitável. CDG positivo mas não cobre toda NCG. Usa empréstimos de curto prazo.';
  } else if(cdg > 0 && ncg > 0 && st < 0){
    tipoFleuriet = 'INSUFICIENTE';
    corFleuriet = '#f59e0b';
    iconeFleuriet = '⚠️';
    descricaoFleuriet = 'Atenção! CDG positivo mas NCG maior. Dependência de empréstimos de curto prazo (Efeito Tesoura).';
  } else if(cdg < 0 && ncg > 0 && st < 0){
    tipoFleuriet = 'RUIM';
    corFleuriet = '#ef4444';
    iconeFleuriet = '🔴';
    descricaoFleuriet = 'Situação crítica. CDG negativo e empresa depende totalmente de dívida de curto prazo.';
  } else if(cdg < 0 && ncg < 0 && st < 0){
    tipoFleuriet = 'PÉSSIMA';
    corFleuriet = '#dc2626';
    iconeFleuriet = '☠️';
    descricaoFleuriet = 'Alto risco de insolvência. Mesmo com NCG negativo, não consegue gerar caixa.';
  } else {
    tipoFleuriet = 'INDEFINIDA';
    corFleuriet = '#6b7280';
    iconeFleuriet = '❓';
    descricaoFleuriet = 'Dados insuficientes para classificar. Preencha mais campos do Balanço.';
  }
  
  return `
    <div style="background:linear-gradient(135deg, ${corFleuriet}15, ${corFleuriet}25); border:2px solid ${corFleuriet}; border-radius:12px; padding:20px; margin-bottom:16px">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px">
        <div style="font-size:40px">${iconeFleuriet}</div>
        <div>
          <div style="font-size:12px; font-weight:600; color:#6b7280">📊 MODELO FLEURIET (Análise Dinâmica)</div>
          <div style="font-size:24px; font-weight:800; color:${corFleuriet}">Situação ${tipoFleuriet}</div>
        </div>
      </div>
      
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:16px">
        <div style="text-align:center; padding:16px; background:#fff; border-radius:10px">
          <div style="font-size:10px; color:#6b7280">CDG</div>
          <div style="font-size:11px; color:#9ca3af; margin-bottom:4px">Capital de Giro</div>
          <div style="font-size:20px; font-weight:800; color:${cdg >= 0 ? '#10b981' : '#ef4444'}">${toBRL(cdg)}</div>
        </div>
        <div style="text-align:center; padding:16px; background:#fff; border-radius:10px">
          <div style="font-size:10px; color:#6b7280">NCG</div>
          <div style="font-size:11px; color:#9ca3af; margin-bottom:4px">Necessidade C.G.</div>
          <div style="font-size:20px; font-weight:800; color:${ncg <= 0 ? '#10b981' : ncg < cdg ? '#f59e0b' : '#ef4444'}">${toBRL(ncg)}</div>
        </div>
        <div style="text-align:center; padding:16px; background:#fff; border-radius:10px">
          <div style="font-size:10px; color:#6b7280">ST</div>
          <div style="font-size:11px; color:#9ca3af; margin-bottom:4px">Saldo Tesouraria</div>
          <div style="font-size:20px; font-weight:800; color:${st >= 0 ? '#10b981' : '#ef4444'}">${toBRL(st)}</div>
        </div>
      </div>
      
      <div style="padding:12px; background:#fff; border-radius:8px; font-size:12px; color:#6b7280">
        <strong>Diagnóstico:</strong> ${descricaoFleuriet}
      </div>
      
      <div style="margin-top:12px; font-size:10px; color:#6b7280; text-align:center">
        Modelo de Michel Fleuriet - Padrão de análise de crédito no Brasil
      </div>
    </div>
  `;
}

// ===== FUNÇÃO: ANÁLISE VERTICAL DO BALANÇO =====
function gerarAnaliseVerticalHtml(latest, previo){
  if(!latest.ativo || latest.ativo === 0) return '';
  
  const ativo = latest.ativo;
  const passivoMaisPL = (latest.passivoCirc || 0) + (latest.passivoNaoCirc || 0) + (latest.pl || 0);
  
  // Calcular variações se tiver ano anterior
  const calcVar = (atual, anterior) => {
    if(!anterior || anterior === 0) return null;
    return ((atual - anterior) / anterior * 100);
  };
  
  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:16px">
      <div style="font-size:12px; font-weight:600; color:#6b7280; margin-bottom:16px">📊 ANÁLISE VERTICAL DO BALANÇO</div>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px">
        <!-- ATIVO -->
        <div>
          <div style="font-size:11px; font-weight:700; color:#1e40af; margin-bottom:8px; padding-bottom:4px; border-bottom:2px solid #1e40af">ATIVO</div>
          
          <div style="font-size:10px; color:#6b7280; margin-bottom:6px">
            <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f1f5f9">
              <span>Total Ativo</span>
              <span style="font-weight:700">${toBRL(ativo)}</span>
            </div>
          </div>
          
          <!-- Ativo Circulante -->
          <div style="background:#dbeafe; border-radius:6px; padding:8px; margin-bottom:8px">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:600; color:#1e40af">
              <span>Circulante</span>
              <span>${latest.acSobreAtivo != null ? (latest.acSobreAtivo * 100).toFixed(1) + '%' : '—'}</span>
            </div>
            <div style="font-size:10px; color:#3b82f6; margin-top:4px">
              ${[
                latest.caixaSobreAtivo ? `Caixa: ${(latest.caixaSobreAtivo * 100).toFixed(1)}%` : null,
                latest.crSobreAtivo ? `Receb: ${(latest.crSobreAtivo * 100).toFixed(1)}%` : null,
                latest.estoqueSobreAtivo ? `Estoq: ${(latest.estoqueSobreAtivo * 100).toFixed(1)}%` : null
              ].filter(Boolean).join(' | ') || 'Sem detalhe'}
            </div>
          </div>
          
          <!-- Ativo Não Circulante -->
          <div style="background:#e0e7ff; border-radius:6px; padding:8px">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:600; color:#4338ca">
              <span>Não Circulante</span>
              <span>${latest.ancSobreAtivo != null ? (latest.ancSobreAtivo * 100).toFixed(1) + '%' : '—'}</span>
            </div>
            <div style="font-size:10px; color:#6366f1; margin-top:4px">
              ${latest.imobSobreAtivo ? `Imobilizado: ${(latest.imobSobreAtivo * 100).toFixed(1)}%` : 'Sem detalhe'}
              ${latest.pesoIntangiveis ? ` | Intang: ${(latest.pesoIntangiveis * 100).toFixed(1)}%` : ''}
            </div>
          </div>
        </div>
        
        <!-- PASSIVO + PL -->
        <div>
          <div style="font-size:11px; font-weight:700; color:#dc2626; margin-bottom:8px; padding-bottom:4px; border-bottom:2px solid #dc2626">PASSIVO + PL</div>
          
          <div style="font-size:10px; color:#6b7280; margin-bottom:6px">
            <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f1f5f9">
              <span>Total</span>
              <span style="font-weight:700">${toBRL(passivoMaisPL)}</span>
            </div>
          </div>
          
          <!-- Passivo Circulante -->
          <div style="background:#fee2e2; border-radius:6px; padding:8px; margin-bottom:8px">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:600; color:#dc2626">
              <span>Circulante</span>
              <span>${latest.pcSobrePassivo != null ? (latest.pcSobrePassivo * 100).toFixed(1) + '%' : '—'}</span>
            </div>
          </div>
          
          <!-- Passivo Não Circulante -->
          <div style="background:#fecaca; border-radius:6px; padding:8px; margin-bottom:8px">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:600; color:#b91c1c">
              <span>Não Circulante</span>
              <span>${latest.pncSobrePassivo != null ? (latest.pncSobrePassivo * 100).toFixed(1) + '%' : '—'}</span>
            </div>
          </div>
          
          <!-- Patrimônio Líquido -->
          <div style="background:#dcfce7; border-radius:6px; padding:8px">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:600; color:#16a34a">
              <span>Patrimônio Líquido</span>
              <span>${latest.plSobrePassivo != null ? (latest.plSobrePassivo * 100).toFixed(1) + '%' : '—'}</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Barra visual de composição -->
      <div style="margin-top:16px">
        <div style="font-size:10px; color:#6b7280; margin-bottom:6px">Composição do Financiamento:</div>
        <div style="height:20px; border-radius:10px; overflow:hidden; display:flex; background:#e2e8f0">
          ${latest.pcSobrePassivo ? `<div style="width:${(latest.pcSobrePassivo * 100).toFixed(0)}%; background:#ef4444; display:flex; align-items:center; justify-content:center; font-size:9px; color:#fff; font-weight:600">${(latest.pcSobrePassivo * 100).toFixed(0)}% CP</div>` : ''}
          ${latest.pncSobrePassivo ? `<div style="width:${(latest.pncSobrePassivo * 100).toFixed(0)}%; background:#f59e0b; display:flex; align-items:center; justify-content:center; font-size:9px; color:#fff; font-weight:600">${(latest.pncSobrePassivo * 100).toFixed(0)}% LP</div>` : ''}
          ${latest.plSobrePassivo ? `<div style="width:${(latest.plSobrePassivo * 100).toFixed(0)}%; background:#10b981; display:flex; align-items:center; justify-content:center; font-size:9px; color:#fff; font-weight:600">${(latest.plSobrePassivo * 100).toFixed(0)}% PL</div>` : ''}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:9px; color:#6b7280; margin-top:4px">
          <span>🔴 Curto Prazo</span>
          <span>🟡 Longo Prazo</span>
          <span>🟢 Capital Próprio</span>
        </div>
      </div>
    </div>
  `;
}

// ===== FUNÇÃO: QUALIDADE DO ATIVO =====
function gerarQualidadeAtivoHtml(latest){
  const temDados = latest.qualidadeRecebiveis != null || latest.idadeAtivos != null || latest.pesoIntangiveis != null;
  if(!temDados) return '';
  
  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:16px">
      <div style="font-size:12px; font-weight:600; color:#6b7280; margin-bottom:16px">🔍 QUALIDADE DO ATIVO</div>
      
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px">
        <!-- Qualidade dos Recebíveis -->
        <div style="text-align:center; padding:12px; background:${latest.qualidadeRecebiveis > 0.10 ? '#fef2f2' : latest.qualidadeRecebiveis > 0.05 ? '#fffbeb' : '#ecfdf5'}; border-radius:8px">
          <div style="font-size:10px; color:#6b7280">PDD/Recebíveis</div>
          <div style="font-size:20px; font-weight:700; color:${latest.qualidadeRecebiveis > 0.10 ? '#dc2626' : latest.qualidadeRecebiveis > 0.05 ? '#d97706' : '#16a34a'}">
            ${latest.qualidadeRecebiveis != null ? (latest.qualidadeRecebiveis * 100).toFixed(1) + '%' : '—'}
          </div>
          <div style="font-size:9px; color:#6b7280; margin-top:4px">
            ${latest.qualidadeRecebiveis > 0.10 ? '⚠️ Inadimplência alta' : latest.qualidadeRecebiveis > 0.05 ? 'Atenção' : '✓ Saudável'}
          </div>
        </div>
        
        <!-- Idade dos Ativos -->
        <div style="text-align:center; padding:12px; background:${latest.idadeAtivos > 0.7 ? '#fef2f2' : latest.idadeAtivos > 0.5 ? '#fffbeb' : '#ecfdf5'}; border-radius:8px">
          <div style="font-size:10px; color:#6b7280">Idade Ativos</div>
          <div style="font-size:20px; font-weight:700; color:${latest.idadeAtivos > 0.7 ? '#dc2626' : latest.idadeAtivos > 0.5 ? '#d97706' : '#16a34a'}">
            ${latest.idadeAtivos != null ? (latest.idadeAtivos * 100).toFixed(0) + '%' : '—'}
          </div>
          <div style="font-size:9px; color:#6b7280; margin-top:4px">
            ${latest.idadeAtivos > 0.7 ? '⚠️ Ativos velhos' : latest.idadeAtivos > 0.5 ? 'Moderado' : '✓ Ativos novos'}
          </div>
        </div>
        
        <!-- Peso Intangíveis -->
        <div style="text-align:center; padding:12px; background:${latest.pesoIntangiveis > 0.3 ? '#fef2f2' : latest.pesoIntangiveis > 0.15 ? '#fffbeb' : '#f8fafc'}; border-radius:8px">
          <div style="font-size:10px; color:#6b7280">Intangíveis/Ativo</div>
          <div style="font-size:20px; font-weight:700; color:${latest.pesoIntangiveis > 0.3 ? '#dc2626' : latest.pesoIntangiveis > 0.15 ? '#d97706' : '#3b82f6'}">
            ${latest.pesoIntangiveis != null ? (latest.pesoIntangiveis * 100).toFixed(1) + '%' : '—'}
          </div>
          <div style="font-size:9px; color:#6b7280; margin-top:4px">
            ${latest.pesoIntangiveis > 0.3 ? '⚠️ Muito intangível' : latest.pesoIntangiveis > 0.15 ? 'Atenção' : '→ Normal'}
          </div>
        </div>
        
        <!-- Imobilização do PL -->
        <div style="text-align:center; padding:12px; background:${latest.imobPL > 1 ? '#fef2f2' : latest.imobPL > 0.7 ? '#fffbeb' : '#ecfdf5'}; border-radius:8px">
          <div style="font-size:10px; color:#6b7280">Imob/PL</div>
          <div style="font-size:20px; font-weight:700; color:${latest.imobPL > 1 ? '#dc2626' : latest.imobPL > 0.7 ? '#d97706' : '#16a34a'}">
            ${latest.imobPL != null ? (latest.imobPL * 100).toFixed(0) + '%' : '—'}
          </div>
          <div style="font-size:9px; color:#6b7280; margin-top:4px">
            ${latest.imobPL > 1 ? '⚠️ Capital preso' : latest.imobPL > 0.7 ? 'Alto' : '✓ Equilibrado'}
          </div>
        </div>
      </div>
      
      <div style="margin-top:12px; padding:10px; background:#f8fafc; border-radius:6px; font-size:11px; color:#6b7280">
        💡 <strong>Interpretação:</strong> 
        PDD/Receb alto indica problemas de crédito com clientes. 
        Idade dos ativos >70% sugere necessidade de investimento. 
        Intangíveis altos podem indicar ágio de aquisições.
      </div>
    </div>
  `;
}

// ===== FUNÇÃO: CONTINGÊNCIAS JUDICIAIS =====
function gerarContingenciasHtml(latest){
  const temContingencias = latest.contingenciaTotal > 0 || latest.exposicaoTotal > 0 || latest.qtdProcessos > 0;
  if(!temContingencias) return '';
  
  // Determinar nível de risco
  let nivelRisco, corRisco, iconeRisco;
  const contingenciaSobrePL = latest.contingenciaSobrePL || 0;
  const exposicaoSobreReceita = latest.exposicaoSobreReceita || 0;
  
  if(contingenciaSobrePL > 0.3 || exposicaoSobreReceita > 0.2){
    nivelRisco = 'CRÍTICO';
    corRisco = '#dc2626';
    iconeRisco = '🚨';
  } else if(contingenciaSobrePL > 0.15 || exposicaoSobreReceita > 0.1){
    nivelRisco = 'ALTO';
    corRisco = '#f59e0b';
    iconeRisco = '⚠️';
  } else if(contingenciaSobrePL > 0.05 || exposicaoSobreReceita > 0.05){
    nivelRisco = 'MODERADO';
    corRisco = '#3b82f6';
    iconeRisco = '📋';
  } else {
    nivelRisco = 'BAIXO';
    corRisco = '#10b981';
    iconeRisco = '✓';
  }
  
  return `
    <div style="background:linear-gradient(135deg, ${corRisco}10, ${corRisco}20); border:2px solid ${corRisco}; border-radius:12px; padding:20px; margin-bottom:16px">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px">
        <div style="display:flex; align-items:center; gap:10px">
          <span style="font-size:28px">⚖️</span>
          <div>
            <div style="font-size:12px; font-weight:600; color:#6b7280">CONTINGÊNCIAS JUDICIAIS</div>
            <div style="font-size:18px; font-weight:800; color:${corRisco}">Risco ${nivelRisco}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px; color:#6b7280">Qtd Processos</div>
          <div style="font-size:24px; font-weight:700; color:${corRisco}">${latest.qtdProcessos || '—'}</div>
        </div>
      </div>
      
      <!-- Breakdown por tipo -->
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:16px">
        <div style="text-align:center; padding:10px; background:#fff; border-radius:8px">
          <div style="font-size:18px">👷</div>
          <div style="font-size:9px; color:#6b7280">Trabalhista</div>
          <div style="font-size:14px; font-weight:700; color:#374151">${toBRL(latest.processosTrab)}</div>
        </div>
        <div style="text-align:center; padding:10px; background:#fff; border-radius:8px">
          <div style="font-size:18px">🏛️</div>
          <div style="font-size:9px; color:#6b7280">Tributário</div>
          <div style="font-size:14px; font-weight:700; color:#374151">${toBRL(latest.processosTrib)}</div>
        </div>
        <div style="text-align:center; padding:10px; background:#fff; border-radius:8px">
          <div style="font-size:18px">📜</div>
          <div style="font-size:9px; color:#6b7280">Cível</div>
          <div style="font-size:14px; font-weight:700; color:#374151">${toBRL(latest.processosCiv)}</div>
        </div>
        <div style="text-align:center; padding:10px; background:#fff; border-radius:8px">
          <div style="font-size:18px">🌿</div>
          <div style="font-size:9px; color:#6b7280">Ambiental</div>
          <div style="font-size:14px; font-weight:700; color:#374151">${toBRL(latest.processosAmb)}</div>
        </div>
      </div>
      
      <!-- Totais e Cobertura -->
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:16px">
        <div style="background:#fff; border-radius:8px; padding:12px; text-align:center">
          <div style="font-size:10px; color:#6b7280">Contingência Total</div>
          <div style="font-size:18px; font-weight:700; color:#dc2626">${toBRL(latest.contingenciaTotal)}</div>
          <div style="font-size:9px; color:#6b7280">${latest.contingenciaSobrePL ? (latest.contingenciaSobrePL * 100).toFixed(1) + '% do PL' : ''}</div>
        </div>
        <div style="background:#fff; border-radius:8px; padding:12px; text-align:center">
          <div style="font-size:10px; color:#6b7280">Exposição Total</div>
          <div style="font-size:18px; font-weight:700; color:#b91c1c">${toBRL(latest.exposicaoTotal)}</div>
          <div style="font-size:9px; color:#6b7280">${latest.exposicaoSobreReceita ? (latest.exposicaoSobreReceita * 100).toFixed(1) + '% da Receita' : ''}</div>
        </div>
        <div style="background:#fff; border-radius:8px; padding:12px; text-align:center">
          <div style="font-size:10px; color:#6b7280">Provisão Constituída</div>
          <div style="font-size:18px; font-weight:700; color:#16a34a">${toBRL(latest.provisaoContingencias)}</div>
          <div style="font-size:9px; color:#6b7280">${latest.coberturaContinProvisao ? 'Cobre ' + (latest.coberturaContinProvisao * 100).toFixed(0) + '%' : ''}</div>
        </div>
      </div>
      
      <!-- Análise de Cobertura -->
      <div style="background:#fff; border-radius:8px; padding:12px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
          <span style="font-size:11px; color:#6b7280">Cobertura da Provisão</span>
          <span style="font-size:12px; font-weight:600; color:${latest.coberturaContinProvisao >= 1 ? '#10b981' : latest.coberturaContinProvisao >= 0.5 ? '#f59e0b' : '#dc2626'}">
            ${latest.coberturaContinProvisao ? (latest.coberturaContinProvisao * 100).toFixed(0) + '%' : '—'}
          </span>
        </div>
        <div style="height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden">
          <div style="height:100%; width:${Math.min(100, (latest.coberturaContinProvisao || 0) * 100)}%; background:${latest.coberturaContinProvisao >= 1 ? '#10b981' : latest.coberturaContinProvisao >= 0.5 ? '#f59e0b' : '#dc2626'}"></div>
        </div>
        <div style="font-size:10px; color:#6b7280; margin-top:8px">
          ${iconeRisco} ${latest.coberturaContinProvisao >= 1 ? 
            'Provisão cobre 100% das contingências prováveis. Situação adequada.' :
            latest.coberturaContinProvisao >= 0.5 ?
            'Provisão cobre apenas parte das contingências. Risco de impacto no resultado.' :
            'Provisão insuficiente! Risco significativo de perdas não provisionadas.'
          }
        </div>
      </div>
      
      ${latest.depositosJudiciais > 0 ? `
        <div style="margin-top:12px; padding:10px; background:rgba(255,255,255,0.7); border-radius:6px">
          <div style="font-size:11px; color:#6b7280">
            💰 <strong>Depósitos Judiciais:</strong> ${toBRL(latest.depositosJudiciais)} 
            (valores que podem ser recuperados se a empresa vencer)
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// ===== FUNÇÃO: ANÁLISE HORIZONTAL (Evolução) =====
function gerarAnaliseHorizontalHtml(rows){
  if(rows.length < 2) return '';
  
  const atual = rows[0];
  const anterior = rows[1];
  
  const calcVar = (a, b) => {
    if(!b || b === 0) return null;
    return ((a - b) / Math.abs(b) * 100);
  };
  
  const formatVar = (val) => {
    if(val === null) return '—';
    const cor = val >= 0 ? '#10b981' : '#ef4444';
    const seta = val >= 0 ? '↑' : '↓';
    return `<span style="color:${cor}; font-weight:600">${seta} ${Math.abs(val).toFixed(1)}%</span>`;
  };
  
  const itens = [
    { nome: 'Receita', atual: atual.receita, ant: anterior.receita },
    { nome: 'EBITDA', atual: atual.ebitda, ant: anterior.ebitda },
    { nome: 'Lucro Líquido', atual: atual.lucroLiq, ant: anterior.lucroLiq },
    { nome: 'Ativo Total', atual: atual.ativo, ant: anterior.ativo },
    { nome: 'Patrimônio Líquido', atual: atual.pl, ant: anterior.pl },
    { nome: 'Dívida Líquida', atual: atual.dl, ant: anterior.dl, inverso: true },
    { nome: 'Caixa', atual: atual.disponiveis, ant: anterior.disponiveis },
    { nome: 'Recebíveis', atual: atual.cr, ant: anterior.cr },
    { nome: 'Estoques', atual: atual.estoques, ant: anterior.estoques }
  ].filter(i => i.atual > 0 || i.ant > 0);
  
  if(itens.length === 0) return '';
  
  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:16px">
      <div style="font-size:12px; font-weight:600; color:#6b7280; margin-bottom:16px">📈 ANÁLISE HORIZONTAL - Evolução ${anterior.ano || 'Ant.'} → ${atual.ano || 'Atual'}</div>
      
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px">
        ${itens.map(item => {
          const varPct = calcVar(item.atual, item.ant);
          const corFundo = item.inverso ? 
            (varPct > 0 ? '#fef2f2' : '#ecfdf5') :
            (varPct >= 0 ? '#ecfdf5' : '#fef2f2');
          
          return `
            <div style="background:${corFundo}; border-radius:8px; padding:10px">
              <div style="font-size:10px; color:#6b7280; margin-bottom:4px">${item.nome}</div>
              <div style="display:flex; justify-content:space-between; align-items:center">
                <span style="font-size:13px; font-weight:600">${toBRL(item.atual)}</span>
                ${formatVar(varPct)}
              </div>
              <div style="font-size:9px; color:#9ca3af; margin-top:2px">Ant: ${toBRL(item.ant)}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
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

  // Contar por tipo
  const criticos = recomendacoes.filter(r => r.tipo === 'critico').length;
  const serios = recomendacoes.filter(r => r.tipo === 'serio').length;
  const atencao = recomendacoes.filter(r => r.tipo === 'atencao').length;
  const positivos = recomendacoes.filter(r => r.tipo === 'positivo').length;

  // Definir cores por tipo
  const getCores = (tipo) => {
    switch(tipo){
      case 'critico': return {bg: '#fef2f2', border: '#ef4444', text: '#991b1b', badge: '#dc2626'};
      case 'serio': return {bg: '#fffbeb', border: '#f59e0b', text: '#92400e', badge: '#d97706'};
      case 'atencao': return {bg: '#f0f9ff', border: '#3b82f6', text: '#1e40af', badge: '#2563eb'};
      case 'positivo': return {bg: '#ecfdf5', border: '#10b981', text: '#065f46', badge: '#059669'};
      default: return {bg: '#f8fafc', border: '#e2e8f0', text: '#475569', badge: '#64748b'};
    }
  };

  const html = `
    <div style="margin-bottom:24px">
      <!-- Header com resumo -->
      <div style="background:linear-gradient(135deg, #1e293b, #334155); color:#fff; border-radius:12px; padding:20px; margin-bottom:20px">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px">
          <div>
            <h4 style="font-size:18px; font-weight:700; margin:0">💡 Diagnóstico Inteligente</h4>
            <div style="font-size:12px; opacity:0.8; margin-top:4px">
              ${recomendacoes.length} ${recomendacoes.length === 1 ? 'item identificado' : 'itens identificados'} • Análise de ${latest.ano}
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            ${criticos > 0 ? `<span style="background:#dc2626; color:#fff; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:600">🚨 ${criticos} Crítico${criticos > 1 ? 's' : ''}</span>` : ''}
            ${serios > 0 ? `<span style="background:#d97706; color:#fff; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:600">⚠️ ${serios} Sério${serios > 1 ? 's' : ''}</span>` : ''}
            ${atencao > 0 ? `<span style="background:#2563eb; color:#fff; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:600">📋 ${atencao} Atenção</span>` : ''}
            ${positivos > 0 ? `<span style="background:#059669; color:#fff; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:600">✅ ${positivos} Forte${positivos > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
      </div>
      
      <!-- Lista de Recomendações -->
      <div style="display:flex; flex-direction:column; gap:12px">
        ${recomendacoes.map(rec => {
          const cores = getCores(rec.tipo);
          return `
            <div style="background:${cores.bg}; border:1px solid ${cores.border}; border-left:4px solid ${cores.border}; border-radius:8px; padding:16px; position:relative">
              <div style="display:flex; gap:12px">
                <div style="font-size:28px; flex-shrink:0">${rec.icon}</div>
                <div style="flex:1; min-width:0">
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px">
                    <span style="font-size:15px; font-weight:700; color:${cores.text}">${rec.titulo}</span>
                    <span style="background:${cores.badge}; color:#fff; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; text-transform:uppercase">
                      ${rec.tipo === 'critico' ? 'URGENTE' : rec.tipo === 'serio' ? 'IMPORTANTE' : rec.tipo === 'atencao' ? 'MONITORAR' : 'DESTAQUE'}
                    </span>
                  </div>
                  <div style="font-size:13px; color:#374151; line-height:1.5">${rec.descricao}</div>
                  ${rec.meta ? `
                    <div style="margin-top:12px; padding:10px; background:rgba(255,255,255,0.7); border-radius:6px; display:flex; flex-wrap:wrap; gap:16px">
                      <div>
                        <div style="font-size:10px; color:#6b7280; text-transform:uppercase; font-weight:600">🎯 Meta</div>
                        <div style="font-size:12px; color:${cores.text}; font-weight:600; margin-top:2px">${rec.meta}</div>
                      </div>
                      ${rec.impacto ? `
                        <div>
                          <div style="font-size:10px; color:#6b7280; text-transform:uppercase; font-weight:600">💰 Impacto</div>
                          <div style="font-size:12px; color:#047857; font-weight:600; margin-top:2px">${rec.impacto}</div>
                        </div>
                      ` : ''}
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      
      <!-- Resumo para Defesa de Crédito -->
      <div style="margin-top:20px; background:linear-gradient(135deg, #dbeafe, #e0e7ff); border:1px solid #93c5fd; border-radius:12px; padding:16px">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px">
          <span style="font-size:20px">🏦</span>
          <span style="font-size:14px; font-weight:700; color:#1e40af">Argumentos para Negociação com Banco</span>
        </div>
        <div style="font-size:12px; color:#1e40af; line-height:1.6">
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

  // ========== CATEGORIA 1: PROBLEMAS CRÍTICOS (VERMELHO) ==========
  
  // 1.1 Z-Score em zona de perigo
  if(calc.zScore != null && calc.zScore < 1.81){
    recs.push({
      icon:"☠️",
      tipo:"critico",
      titulo:"ALERTA: Z-Score em Zona de Perigo",
      descricao:`Z-Score de ${calc.zScore.toFixed(2)} indica ALTA probabilidade de dificuldades financeiras em 24 meses. Este é o indicador mais grave. Ações URGENTES: (1) Convoque reunião de sócios, (2) Contrate consultoria de reestruturação, (3) Negocie com credores ANTES de atrasar, (4) Corte despesas não essenciais imediatamente, (5) Venda ativos não operacionais.`,
      meta:`Elevar Z-Score para acima de 1.81 (zona cinzenta) em 12 meses`,
      impacto: "Evitar insolvência e preservar a empresa"
    });
  }
  
  // 1.2 Capital de Giro Negativo
  if(calc.ccl != null && calc.ccl < 0){
    const deficit = Math.abs(calc.ccl);
    recs.push({
      icon:"🚨",
      tipo:"critico",
      titulo:"Capital de Giro NEGATIVO",
      descricao:`Déficit de ${toBRL(deficit)} no capital de giro. Passivo de curto prazo maior que ativo circulante. Isso significa que a empresa NÃO consegue pagar suas contas no prazo. Ações: (1) Aporte emergencial de capital, (2) Alongar dívidas de CP para LP, (3) Antecipar recebíveis, (4) Liquidar estoques parados, (5) Renegociar com fornecedores.`,
      meta:`Tornar CCL positivo em R$ ${toBRL(deficit * 1.2)} nos próximos 6 meses`,
      impacto: `Recuperar capacidade de pagamento e evitar inadimplência`
    });
  }
  
  // 1.3 Liquidez Imediata Crítica
  if(calc.liqImediata != null && calc.liqImediata < 0.1){
    recs.push({
      icon:"💀",
      tipo:"critico",
      titulo:"Sem Caixa para Emergências",
      descricao:`Liquidez imediata de ${clamp2(calc.liqImediata)} indica que a empresa não tem dinheiro em caixa para pagar nem 10% das dívidas de curto prazo. Qualquer imprevisto (cliente que atrasa, despesa inesperada) pode causar inadimplência. Ações: (1) Constituir reserva de emergência, (2) Linha de crédito pré-aprovada, (3) Reduzir distribuição de lucros, (4) Acelerar recebimentos.`,
      meta:`Elevar liquidez imediata para 0.3+ em 6 meses`,
      impacto: "Ter pelo menos 1 mês de folga de caixa"
    });
  }
  
  // 1.4 Cobertura de Juros Insuficiente
  if(calc.juros != null && calc.juros < 1.5){
    recs.push({
      icon:"💸",
      tipo:"critico",
      titulo:"EBITDA Não Cobre os Juros",
      descricao:`Cobertura de juros de apenas ${clamp2(calc.juros)}x significa que quase todo o EBITDA vai para pagar juros. Não sobra para investir, crescer ou distribuir. Ações URGENTES: (1) Renegociar taxas de juros, (2) Trocar dívida cara por mais barata, (3) Amortizar dívidas mais caras primeiro, (4) NÃO contrair novas dívidas.`,
      meta:`Elevar cobertura para 2.5x+ em 18 meses`,
      impacto: `Liberar ${toBRL(calc.despFin * 0.3)}/ano para reinvestimento`
    });
  }

  // ========== CATEGORIA 2: PROBLEMAS SÉRIOS (AMARELO) ==========
  
  // 2.1 Endividamento Alto
  if(calc.alav != null && calc.alav > 3.5){
    recs.push({
      icon:"⚠️",
      tipo:"serio",
      titulo:"Endividamento Elevado - DL/EBITDA > 3.5x",
      descricao:`Alavancagem de ${clamp2(calc.alav)}x está acima do limite de risco. Bancos consideram >3.5x como "distress". Isso dificulta novos créditos e pode ativar cláusulas de vencimento antecipado. Ações: (1) Não contrair novas dívidas, (2) Direcionar 50%+ do EBITDA para amortização, (3) Renegociar prazos mais longos, (4) Considerar venda de ativos não estratégicos.`,
      meta:`Reduzir para 2.5x em 24 meses`,
      impacto: "Recuperar acesso a crédito e reduzir custo de capital"
    });
  } else if(calc.alav != null && calc.alav > 2.5){
    recs.push({
      icon:"🟡",
      tipo:"atencao",
      titulo:"Endividamento em Zona de Atenção",
      descricao:`DL/EBITDA de ${clamp2(calc.alav)}x está em zona de monitoramento. Recomenda-se: (1) Evitar novas dívidas até reduzir, (2) Destinar 30% do EBITDA para amortização, (3) Melhorar geração de caixa operacional.`,
      meta:`Reduzir para 2.0x em 18 meses`,
      impacto: "Melhores condições em futuras operações de crédito"
    });
  }
  
  // 2.2 Margem EBITDA Baixa
  if(calc.margem != null && calc.margem < 0.08){
    recs.push({
      icon:"📉",
      tipo:"serio",
      titulo:"Margem EBITDA Muito Baixa",
      descricao:`Margem de ${toPct(calc.margem)} está abaixo de 8%, indicando operação com baixa rentabilidade. A empresa trabalha muito para lucrar pouco. Ações: (1) Análise ABC de clientes (cortar não rentáveis), (2) Revisão de preços, (3) Renegociar com fornecedores estratégicos, (4) Automatizar processos, (5) Reduzir custos fixos em 15%.`,
      meta:`Alcançar 12% em 12 meses`,
      impacto: `Gerar mais ${toBRL(calc.receita * 0.04)}/ano de EBITDA`
    });
  } else if(calc.margem != null && calc.margem < 0.12){
    recs.push({
      icon:"📊",
      tipo:"atencao",
      titulo:"Oportunidade de Melhorar Margem",
      descricao:`Margem EBITDA de ${toPct(calc.margem)} está aceitável mas pode melhorar. Foque em: (1) Otimização de processos, (2) Renegociação de contratos, (3) Revisão de mix de produtos/serviços.`,
      meta:`Atingir 15% em 18 meses`,
      impacto: `Adicionar ${toBRL(calc.receita * 0.03)}/ano ao EBITDA`
    });
  }
  
  // 2.3 Ciclo Financeiro Longo
  if(calc.ciclo != null && calc.ciclo > 90){
    const dinheiroTravado = (calc.receita / 365) * calc.ciclo;
    const economiaPotencial = (calc.receita / 365) * (calc.ciclo - 45);
    recs.push({
      icon:"⏰",
      tipo:"serio",
      titulo:"Ciclo Financeiro Muito Longo",
      descricao:`Ciclo de ${Math.round(calc.ciclo)} dias significa ${toBRL(dinheiroTravado)} travados na operação. Ações: (1) PMR de ${Math.round(calc.pmr || 0)} dias → reduzir para 25 com descontos para pagamento antecipado, (2) PME de ${Math.round(calc.diasEst || 0)} dias → reduzir estoque mínimo, (3) PMP de ${Math.round(calc.pmp || 0)} dias → negociar prazos maiores com fornecedores.`,
      meta:`Reduzir para 45 dias em 12 meses`,
      impacto: `Liberar ${toBRL(economiaPotencial)} de capital de giro`
    });
  } else if(calc.ciclo != null && calc.ciclo > 60){
    recs.push({
      icon:"🔄",
      tipo:"atencao",
      titulo:"Otimizar Ciclo de Caixa",
      descricao:`Ciclo de ${Math.round(calc.ciclo)} dias pode ser reduzido. Priorize: reduzir prazo de recebimento (PMR: ${Math.round(calc.pmr || 0)} dias) e aumentar prazo de pagamento (PMP: ${Math.round(calc.pmp || 0)} dias).`,
      meta:`Reduzir para 45 dias em 18 meses`,
      impacto: "Melhorar fluxo de caixa e reduzir necessidade de capital"
    });
  }
  
  // 2.4 Liquidez Corrente Baixa
  if(calc.liqCorrente != null && calc.liqCorrente < 1.0){
    recs.push({
      icon:"💧",
      tipo:"serio",
      titulo:"Liquidez Corrente Crítica",
      descricao:`Liquidez de ${clamp2(calc.liqCorrente)} indica que o ativo circulante não cobre o passivo circulante. Ações: (1) Alongar dívidas de curto prazo, (2) Reduzir estoques, (3) Acelerar cobranças, (4) Renegociar prazos com fornecedores.`,
      meta:`Elevar para 1.3+ em 6 meses`,
      impacto: "Restaurar capacidade de pagamento"
    });
  } else if((calc.liqCorrente || calc.liq) != null && (calc.liqCorrente || calc.liq) < 1.3){
    recs.push({
      icon:"💧",
      tipo:"atencao",
      titulo:"Liquidez Apertada",
      descricao:`Liquidez de ${clamp2(calc.liqCorrente || calc.liq)} está no limite. Monitore o fluxo de caixa diariamente e mantenha uma reserva mínima.`,
      meta:`Atingir 1.5+ em 12 meses`,
      impacto: "Ter folga para imprevistos"
    });
  }
  
  // 2.5 ROE Baixo
  if(calc.roe != null && calc.roe < 0.08){
    recs.push({
      icon:"📈",
      tipo:"serio",
      titulo:"Baixo Retorno sobre Patrimônio",
      descricao:`ROE de ${toPct(calc.roe)} está abaixo do mínimo aceitável (8%). Os sócios ganhariam mais deixando o dinheiro em aplicações financeiras. Análise DuPont mostra: Margem ${toPct(calc.margemLiq || calc.margem * 0.6)} × Giro ${clamp2(calc.giroAtv || 0)} × Alav ${clamp2(calc.alavFin || 0)}. Foque no componente mais fraco.`,
      meta:`Atingir 12% em 18 meses`,
      impacto: "Justificar o capital investido pelos sócios"
    });
  }

  // ========== CATEGORIA 3: OPORTUNIDADES DE MELHORIA ==========
  
  // 3.1 Estrutura de Capital (CT/CP alto)
  if(calc.ctcp != null && calc.ctcp > 2){
    recs.push({
      icon:"🏗️",
      tipo:"atencao",
      titulo:"Estrutura de Capital Desequilibrada",
      descricao:`Relação Capital Terceiros/Próprio de ${clamp2(calc.ctcp)} indica excesso de financiamento por dívida. Ideal seria abaixo de 1.5. Considere: (1) Reinvestir lucros ao invés de distribuir, (2) Aporte de capital pelos sócios, (3) Amortização acelerada de dívidas.`,
      meta:`Reduzir CT/CP para 1.5 em 24 meses`,
      impacto: "Reduzir risco financeiro e custo de capital"
    });
  }
  
  // 3.2 Imobilização Alta
  if(calc.imobPL != null && calc.imobPL > 1){
    recs.push({
      icon:"🏢",
      tipo:"atencao",
      titulo:"Muito Capital Preso em Imobilizado",
      descricao:`Imobilização do PL de ${(calc.imobPL * 100).toFixed(0)}% indica que todo o patrimônio líquido (e mais) está investido em ativos fixos, não sobrando para capital de giro. Considere: (1) Venda de imóveis não operacionais, (2) Sale-leaseback de ativos, (3) Aporte de capital.`,
      meta:`Reduzir para 80% em 24 meses`,
      impacto: "Liberar recursos para capital de giro"
    });
  }
  
  // 3.3 Composição de Dívida (muito no CP)
  if(calc.composicaoEndCP != null && calc.composicaoEndCP > 0.6){
    recs.push({
      icon:"📅",
      tipo:"atencao",
      titulo:"Dívida Concentrada no Curto Prazo",
      descricao:`${(calc.composicaoEndCP * 100).toFixed(0)}% da dívida vence em até 12 meses. Isso pressiona o caixa e aumenta o risco de refinanciamento. Ações: (1) Alongar dívidas para LP, (2) Trocar linhas de capital de giro por empréstimos de longo prazo, (3) Negociar carência em novas operações.`,
      meta:`Reduzir dívida CP para 40% do total em 18 meses`,
      impacto: "Aliviar pressão no fluxo de caixa"
    });
  }
  
  // 3.4 Giro do Ativo Baixo
  if(calc.giroAtv != null && calc.giroAtv < 0.8){
    recs.push({
      icon:"⚡",
      tipo:"atencao",
      titulo:"Ativos Subutilizados",
      descricao:`Giro do ativo de ${clamp2(calc.giroAtv)}x indica que os ativos não estão gerando receita proporcional. Para cada R$ 1 de ativo, a empresa gera apenas R$ ${clamp2(calc.giroAtv)} de receita. Ações: (1) Vender ativos ociosos, (2) Aumentar vendas com mesma estrutura, (3) Revisar investimentos em ativos fixos.`,
      meta:`Elevar giro para 1.2x em 18 meses`,
      impacto: "Melhorar rentabilidade via eficiência"
    });
  }
  
  // 3.5 Qualidade dos Recebíveis (PDD Alta)
  if(calc.qualidadeRecebiveis != null && calc.qualidadeRecebiveis > 0.10){
    recs.push({
      icon:"💳",
      tipo:"serio",
      titulo:"Alta Inadimplência de Clientes",
      descricao:`PDD de ${(calc.qualidadeRecebiveis * 100).toFixed(1)}% sobre recebíveis indica problemas de crédito com clientes. Isso corrói a margem e pode virar prejuízo. Ações: (1) Revisar política de crédito, (2) Endurecer análise de novos clientes, (3) Cobrar mais ativamente, (4) Considerar venda de carteira.`,
      meta:`Reduzir inadimplência para 5% em 12 meses`,
      impacto: `Recuperar ${toBRL(calc.cr * (calc.qualidadeRecebiveis - 0.05))} em recebíveis`
    });
  } else if(calc.qualidadeRecebiveis != null && calc.qualidadeRecebiveis > 0.05){
    recs.push({
      icon:"💳",
      tipo:"atencao",
      titulo:"Inadimplência em Nível de Atenção",
      descricao:`PDD de ${(calc.qualidadeRecebiveis * 100).toFixed(1)}% indica inadimplência moderada. Monitore e ajuste políticas de crédito se necessário.`,
      meta:`Manter abaixo de 5%`,
      impacto: "Preservar qualidade da carteira de clientes"
    });
  }
  
  // 3.6 Ativos Muito Velhos
  if(calc.idadeAtivos != null && calc.idadeAtivos > 0.7){
    recs.push({
      icon:"🏭",
      tipo:"atencao",
      titulo:"Ativos Imobilizados Envelhecidos",
      descricao:`${(calc.idadeAtivos * 100).toFixed(0)}% dos ativos já estão depreciados. Isso pode indicar: (1) Necessidade de reinvestimento, (2) Equipamentos obsoletos, (3) Perda de competitividade. Avalie plano de CAPEX para renovação.`,
      meta:`Planejar renovação de ativos críticos`,
      impacto: "Manter competitividade operacional"
    });
  }
  
  // 3.7 Muito Intangível no Balanço
  if(calc.pesoIntangiveis != null && calc.pesoIntangiveis > 0.3){
    recs.push({
      icon:"☁️",
      tipo:"atencao",
      titulo:"Alto Peso de Intangíveis",
      descricao:`${(calc.pesoIntangiveis * 100).toFixed(1)}% do ativo é intangível (ágio, marcas, softwares). Isso pode ser: (1) Ágio de aquisições que pode virar impairment, (2) Capitalização agressiva de despesas. Bancos costumam descontar intangíveis na análise.`,
      meta:`Monitorar teste de impairment anual`,
      impacto: "Evitar surpresas com baixa de ativos"
    });
  }

  // ========== CATEGORIA 3B: CONTINGÊNCIAS JUDICIAIS ==========
  
  // Contingências altas em relação ao PL
  if(calc.contingenciaSobrePL != null && calc.contingenciaSobrePL > 0.15){
    recs.push({
      icon:"⚖️",
      tipo: calc.contingenciaSobrePL > 0.3 ? "critico" : "serio",
      titulo:"Contingências Judiciais Elevadas",
      descricao:`Contingências de ${toBRL(calc.contingenciaTotal)} representam ${(calc.contingenciaSobrePL * 100).toFixed(1)}% do PL. Tipos: Trabalhista ${toBRL(calc.processosTrab)}, Tributário ${toBRL(calc.processosTrib)}, Cível ${toBRL(calc.processosCiv)}, Ambiental ${toBRL(calc.processosAmb)}. Ações: (1) Priorizar acordos, (2) Provisionar adequadamente, (3) Revisar práticas que geram processos.`,
      meta:`Reduzir exposição judicial para menos de 10% do PL`,
      impacto: `Eliminar risco de ${toBRL(calc.contingenciaTotal)} em perdas`
    });
  }
  
  // Provisão insuficiente
  if(calc.coberturaContinProvisao != null && calc.coberturaContinProvisao < 0.5 && calc.contingenciaTotal > 0){
    recs.push({
      icon:"📋",
      tipo:"serio",
      titulo:"Provisão para Contingências Insuficiente",
      descricao:`Provisão cobre apenas ${(calc.coberturaContinProvisao * 100).toFixed(0)}% das contingências prováveis. Faltam ${toBRL(calc.contingenciaTotal - calc.provisaoContingencias)} para cobertura total. Isso pode resultar em impacto não esperado no resultado se perder ações.`,
      meta:`Elevar provisão para 100% das perdas prováveis`,
      impacto: `Evitar surpresa de ${toBRL(calc.contingenciaTotal - calc.provisaoContingencias)} no resultado`
    });
  }
  
  // Muitos processos trabalhistas
  if(calc.processosTrab > 0 && calc.funcionarios > 0){
    const processosPorFunc = calc.qtdProcessos / calc.funcionarios;
    if(processosPorFunc > 0.1){
      recs.push({
        icon:"👷",
        tipo:"atencao",
        titulo:"Volume Alto de Processos Trabalhistas",
        descricao:`${calc.qtdProcessos} processos para ${calc.funcionarios} funcionários (${(processosPorFunc * 100).toFixed(0)}%). Isso sugere problemas de gestão de pessoas ou práticas trabalhistas inadequadas. Ações: (1) Auditoria trabalhista, (2) Revisar práticas de RH, (3) Treinar gestores.`,
        meta:`Reduzir novos processos em 50%`,
        impacto: "Melhorar ambiente de trabalho e reduzir custos"
      });
    }
  }
  
  // Processos tributários altos
  if(calc.processosTrib > 0 && calc.receita > 0 && (calc.processosTrib / calc.receita) > 0.05){
    recs.push({
      icon:"🏛️",
      tipo:"serio",
      titulo:"Exposição Tributária Relevante",
      descricao:`Processos tributários de ${toBRL(calc.processosTrib)} representam ${((calc.processosTrib / calc.receita) * 100).toFixed(1)}% da receita. Ações: (1) Avaliar parcelamento ou adesão a refis, (2) Revisar planejamento tributário, (3) Buscar teses de defesa.`,
      meta:`Resolver ou parcelar contingências tributárias`,
      impacto: `Eliminar risco fiscal de ${toBRL(calc.processosTrib)}`
    });
  }

  // ========== CATEGORIA 4: ANÁLISE DE TENDÊNCIA ==========
  
  if(previo){
    // Queda de Receita
    if(calc.receita < previo.receita * 0.95){
      const queda = ((previo.receita - calc.receita) / previo.receita) * 100;
      recs.push({
        icon:"📉",
        tipo:"serio",
        titulo:`Queda de ${queda.toFixed(1)}% na Receita`,
        descricao:`Receita caiu de ${toBRL(previo.receita)} para ${toBRL(calc.receita)}. Investigue: perda de clientes, redução de preços, fatores de mercado. Ações: (1) Análise de churn, (2) Pesquisa com clientes perdidos, (3) Revisão de estratégia comercial.`,
        meta:`Reverter queda e crescer 5% no próximo ano`,
        impacto: `Recuperar ${toBRL(previo.receita - calc.receita)} em faturamento`
      });
    }
    
    // Deterioração da Margem
    if(calc.margem && previo.margem && calc.margem < previo.margem * 0.85){
      const quedaMargem = ((previo.margem - calc.margem) * 100).toFixed(1);
      recs.push({
        icon:"⚠️",
        tipo:"serio",
        titulo:`Margem Caiu ${quedaMargem} pontos percentuais`,
        descricao:`Margem EBITDA foi de ${toPct(previo.margem)} para ${toPct(calc.margem)}. Isso representa perda de ${toBRL(calc.receita * (previo.margem - calc.margem))} em EBITDA. Analise: aumento de custos, guerra de preços, ineficiências.`,
        meta:`Recuperar margem de ${toPct(previo.margem)} em 12 meses`,
        impacto: `Voltar a gerar ${toBRL(calc.receita * previo.margem)} de EBITDA`
      });
    }
    
    // Piora no Z-Score
    if(calc.zScore && previo.zScore && calc.zScore < previo.zScore * 0.85){
      recs.push({
        icon:"📊",
        tipo:"serio",
        titulo:"Deterioração do Z-Score",
        descricao:`Z-Score piorou de ${previo.zScore.toFixed(2)} para ${calc.zScore.toFixed(2)}, indicando aumento do risco de insolvência. Identifique os componentes que pioraram e corrija.`,
        meta:`Estabilizar e melhorar Z-Score em 12 meses`,
        impacto: "Sair da trajetória de risco"
      });
    }
  }

  // ========== CATEGORIA 5: PONTOS FORTES (para defesa de crédito) ==========
  
  const pontosFortes = [];
  if(calc.margem >= 0.15) pontosFortes.push({ind: "Margem EBITDA", val: toPct(calc.margem), desc: "acima de 15%"});
  if(calc.alav != null && calc.alav <= 2) pontosFortes.push({ind: "DL/EBITDA", val: clamp2(calc.alav) + "x", desc: "baixa alavancagem"});
  if((calc.liqCorrente || calc.liq) >= 1.5) pontosFortes.push({ind: "Liquidez", val: clamp2(calc.liqCorrente || calc.liq), desc: "boa folga"});
  if(calc.roe >= 0.15) pontosFortes.push({ind: "ROE", val: toPct(calc.roe), desc: "excelente retorno"});
  if(calc.ciclo != null && calc.ciclo <= 45) pontosFortes.push({ind: "Ciclo Financeiro", val: Math.round(calc.ciclo) + " dias", desc: "muito eficiente"});
  if(calc.juros >= 4) pontosFortes.push({ind: "Cobertura Juros", val: clamp2(calc.juros) + "x", desc: "folga para honrar"});
  if(calc.zScore > 2.99) pontosFortes.push({ind: "Z-Score", val: calc.zScore.toFixed(2), desc: "zona segura"});
  if(calc.giroAtv >= 1.5) pontosFortes.push({ind: "Giro do Ativo", val: clamp2(calc.giroAtv) + "x", desc: "ativos produtivos"});

  if(pontosFortes.length >= 2){
    recs.unshift({
      icon:"✅",
      tipo:"positivo",
      titulo:`${pontosFortes.length} Pontos Fortes Identificados`,
      descricao:`A empresa apresenta indicadores positivos que devem ser destacados: ${pontosFortes.map(p => `<strong>${p.ind}</strong> (${p.val} - ${p.desc})`).join(", ")}. Use estes argumentos em negociações com bancos e fornecedores.`,
      meta: null,
      impacto: "Maior poder de barganha em negociações"
    });
  }

  // ========== ORDENAR POR PRIORIDADE ==========
  const prioridade = {critico: 0, serio: 1, atencao: 2, positivo: 3};
  recs.sort((a, b) => (prioridade[a.tipo] || 99) - (prioridade[b.tipo] || 99));

  return recs;
}

function gerarPontosDefesaCredito(calc, recs){
  const pontos = [];
  
  // Pontos positivos baseados nos novos indicadores
  if(calc.margem >= 0.12) pontos.push(`✓ <strong>Margem EBITDA</strong> de ${toPct(calc.margem)} demonstra eficiência operacional`);
  if(calc.alav != null && calc.alav <= 2.5) pontos.push(`✓ <strong>DL/EBITDA</strong> de ${clamp2(calc.alav)}x indica baixo risco de crédito`);
  if((calc.liqCorrente || calc.liq) >= 1.2) pontos.push(`✓ <strong>Liquidez</strong> de ${clamp2(calc.liqCorrente || calc.liq)} garante capacidade de pagamento`);
  if(calc.roe >= 0.10) pontos.push(`✓ <strong>ROE</strong> de ${toPct(calc.roe)} demonstra rentabilidade para os sócios`);
  if(calc.juros >= 3) pontos.push(`✓ <strong>Cobertura de juros</strong> de ${clamp2(calc.juros)}x - folga para honrar compromissos`);
  if(calc.zScore > 2.5) pontos.push(`✓ <strong>Z-Score</strong> de ${calc.zScore.toFixed(2)} coloca empresa em zona segura`);
  if(calc.giroAtv >= 1) pontos.push(`✓ <strong>Giro do ativo</strong> de ${clamp2(calc.giroAtv)}x indica boa utilização de recursos`);
  if(calc.ciclo != null && calc.ciclo <= 60) pontos.push(`✓ <strong>Ciclo financeiro</strong> de ${Math.round(calc.ciclo)} dias é eficiente`);

  // Se tem planos de melhoria
  const problemasComPlano = recs.filter(r => r.meta != null && r.tipo !== 'positivo');
  if(problemasComPlano.length > 0){
    pontos.push(`📋 Empresa possui <strong>plano estruturado</strong> para ${problemasComPlano.length} ponto(s) de melhoria com metas definidas`);
  }

  // Recomendação de produto
  let produtoRecomendado = "capital de giro";
  let prazoRecomendado = "12-24 meses";
  
  if(calc.alav > 3){
    produtoRecomendado = "reestruturação de dívidas";
    prazoRecomendado = "36-48 meses";
  } else if(calc.ciclo > 60){
    produtoRecomendado = "antecipação de recebíveis";
    prazoRecomendado = "rotativo";
  } else if(calc.imobPL > 0.8){
    produtoRecomendado = "financiamento de longo prazo";
    prazoRecomendado = "48-60 meses";
  }
  
  pontos.push(`🏦 <strong>Produto indicado:</strong> ${produtoRecomendado} com prazo ${prazoRecomendado}`);
  
  if(calc.receita > 5000000){
    pontos.push(`💼 Faturamento de <strong>${toBRL(calc.receita)}</strong> qualifica para linhas corporate`);
  } else if(calc.receita > 1000000){
    pontos.push(`💼 Faturamento de <strong>${toBRL(calc.receita)}</strong> qualifica para linhas middle market`);
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
    if(previo && previo.receita > 0){
      deltaRec = ((row.receita - previo.receita) / previo.receita) * 100;
    }
    if(previo && previo.ebitda > 0){
      deltaEbt = ((row.ebitda - previo.ebitda) / previo.ebitda) * 100;
    }
    if(previo && row.margem != null && previo.margem != null){
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
      <td>${row.alav!=null? clamp2(row.alav)+"x" : "—"}</td>
      <td>${row.liq!=null? clamp2(row.liq) : "—"}</td>
      <td>${toPct(row.roe)}</td>
      <td>
        <span class="chip chip-${status.classe}">
          ${score}
        </span>
      </td>
      <td style="color:${deltaRec==null? '#94a3b8' : deltaRec>=0? '#10b981' : '#ef4444'}">
        ${deltaRec==null? "—" : (deltaRec>=0?"↑":"↓") + " " + Math.abs(deltaRec).toFixed(1)+"%"}
      </td>
      <td style="color:${deltaEbt==null? '#94a3b8' : deltaEbt>=0? '#10b981' : '#ef4444'}">
        ${deltaEbt==null? "—" : (deltaEbt>=0?"↑":"↓") + " " + Math.abs(deltaEbt).toFixed(1)+"%"}
      </td>
      <td style="color:${deltaMar==null? '#94a3b8' : deltaMar>=0? '#10b981' : '#ef4444'}">
        ${deltaMar==null? "—" : (deltaMar>=0?"↑":"↓") + " " + Math.abs(deltaMar).toFixed(1)+" p.p."}
      </td>
      <td>
        <button class="btn btn-outline" style="padding:4px 8px; font-size:11px"
          onclick="abrirModalEdicao('${empresaId}',${row.ano},'${row.docId}')">
          ✏️
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ================== ABA 2: DIAGNÓSTICO INTELIGENTE ==================
function renderDiagnostico(data){
  if(!data || !data.rows || !data.rows.length) return;
  
  const rows = data.rows;
  const latest = rows[0];
  const previo = rows[1] || null;
  const container = document.getElementById("diagnosticoContent");
  
  let html = '';
  
  // Detectar variações significativas (>15%)
  const variacoes = [];
  
  if(previo){
    // Variação de Receita
    const varReceita = ((latest.receita - previo.receita) / previo.receita * 100);
    if(Math.abs(varReceita) > 15){
      variacoes.push({
        indicador: 'Receita',
        de: toBRL(previo.receita),
        para: toBRL(latest.receita),
        variacao: varReceita,
        tipo: varReceita > 0 ? 'aumento' : 'queda',
        perguntas: varReceita > 0 ? [
          'Ganhou novos clientes relevantes? Quais e qual o potencial de recorrência?',
          'Aumentou preços? O mercado absorveu bem?',
          'Lançou novos produtos/serviços? Qual a margem deles?',
          'Ganhou algum contrato/licitação relevante?',
          'Concorrente fechou ou perdeu mercado?'
        ] : [
          'Perdeu algum cliente relevante (>10% do faturamento)? Por quê?',
          'Reduziu equipe comercial ou capacidade produtiva?',
          'Problemas de entrega, qualidade ou prazo?',
          'O setor como um todo está em queda?',
          'Há perspectiva de recuperação? Em quanto tempo?'
        ],
        dica: varReceita > 0 
          ? 'Crescimento acelerado pode pressionar capital de giro. Avaliar se há estrutura para suportar.'
          : 'Queda de receita impacta diretamente o fluxo de caixa. Monitorar liquidez.'
      });
    }
    
    // Variação de Margem EBITDA
    const varMargem = (latest.margem - previo.margem) * 100;
    if(Math.abs(varMargem) > 3){ // 3 pontos percentuais
      variacoes.push({
        indicador: 'Margem EBITDA',
        de: toPct(previo.margem),
        para: toPct(latest.margem),
        variacao: varMargem,
        unidade: 'p.p.',
        tipo: varMargem > 0 ? 'aumento' : 'queda',
        perguntas: varMargem > 0 ? [
          'A receita aumentou ou os custos diminuíram?',
          'Houve corte de pessoal ou renegociação com fornecedores?',
          'Mudou o mix de produtos para itens de maior margem?',
          'Houve eventos não-recorrentes (venda de ativos, créditos tributários)?',
          'Esse ganho é sustentável ou pontual?'
        ] : [
          'Houve aumento de custos de matéria-prima ou mão de obra?',
          'Precisou baixar preços para competir?',
          'Houve ociosidade operacional?',
          'Custos fixos aumentaram (aluguel, folha)?',
          'Há plano para recuperar a margem?'
        ],
        dica: varMargem > 0
          ? 'Margem que sobe muito rápido pode cair igualmente rápido. Investigar se é estrutural.'
          : 'Compressão de margem afeta capacidade de pagamento. Avaliar impacto no fluxo.'
      });
    }
    
    // Variação de Alavancagem
    if(previo.alav && latest.alav){
      const varAlav = latest.alav - previo.alav;
      if(Math.abs(varAlav) > 0.5){
        variacoes.push({
          indicador: 'DL/EBITDA (Alavancagem)',
          de: clamp2(previo.alav) + 'x',
          para: clamp2(latest.alav) + 'x',
          variacao: varAlav,
          unidade: 'x',
          tipo: varAlav > 0 ? 'aumento' : 'queda',
          perguntas: varAlav > 0 ? [
            'Contraiu novas dívidas? Para qual finalidade?',
            'O EBITDA caiu? Por qual motivo?',
            'Houve investimentos (CAPEX) financiados com dívida?',
            'Distribuiu dividendos acima da capacidade?',
            'Qual o cronograma de amortização das dívidas?'
          ] : [
            'Pagou dívidas ou renegociou para longo prazo?',
            'O EBITDA aumentou significativamente?',
            'Recebeu aporte de capital dos sócios?',
            'Vendeu ativos para abater dívida?',
            'A redução é sustentável?'
          ],
          dica: varAlav > 0
            ? 'Aumento de alavancagem reduz margem de segurança. Monitorar capacidade de pagamento.'
            : 'Desalavancagem é positiva, mas verificar se não foi às custas de crescimento.'
        });
      }
    }
    
    // Variação de Liquidez
    if(previo.liq && latest.liq){
      const varLiq = latest.liq - previo.liq;
      if(Math.abs(varLiq) > 0.3){
        variacoes.push({
          indicador: 'Liquidez Corrente',
          de: clamp2(previo.liq),
          para: clamp2(latest.liq),
          variacao: varLiq,
          unidade: '',
          tipo: varLiq > 0 ? 'aumento' : 'queda',
          perguntas: varLiq > 0 ? [
            'Acumulou caixa de operações?',
            'Recebeu linhas de crédito de longo prazo?',
            'Reduziu passivos de curto prazo?',
            'O aumento veio de recebíveis ou estoques (menos líquidos)?'
          ] : [
            'Houve queima de caixa operacional?',
            'Dívidas de longo prazo viraram curto prazo?',
            'Antecipou pagamentos ou distribuiu dividendos?',
            'Capital de giro está pressionado?',
            'Há necessidade de reforço de liquidez?'
          ],
          dica: varLiq < 0
            ? 'Liquidez em queda é sinal de alerta. Avaliar se há acesso a linhas de crédito.'
            : 'Liquidez alta pode indicar conservadorismo ou oportunidade de investimento.'
        });
      }
    }
  }
  
  // Renderizar alertas de variações
  if(variacoes.length > 0){
    html += `
      <div class="diag-card alert">
        <div class="diag-title">
          <span style="font-size:24px">⚠️</span>
          Variações Significativas Detectadas
        </div>
        <p style="font-size:13px; color:#92400e; margin-bottom:16px">
          O sistema identificou ${variacoes.length} variação(ões) relevante(s) entre ${previo.ano} e ${latest.ano} que merecem investigação.
        </p>
      </div>
    `;
    
    variacoes.forEach(v => {
      const isPositive = (v.tipo === 'aumento' && v.indicador !== 'DL/EBITDA (Alavancagem)') ||
                        (v.tipo === 'queda' && v.indicador === 'DL/EBITDA (Alavancagem)');
      
      html += `
        <div class="diag-card ${isPositive ? 'success' : 'danger'}">
          <div class="diag-title">
            <span style="font-size:20px">${isPositive ? '📈' : '📉'}</span>
            ${v.indicador}: ${v.tipo} de ${v.de} para ${v.para}
            <span style="margin-left:auto; font-size:14px; font-weight:800; color:${isPositive ? '#10b981' : '#ef4444'}">
              ${v.variacao > 0 ? '+' : ''}${v.unidade ? clamp2(v.variacao) + v.unidade : toPct(v.variacao/100)}
            </span>
          </div>
          
          <div style="font-size:13px; font-weight:600; margin-bottom:8px; color:var(--text-secondary)">
            🔍 Perguntas para investigar:
          </div>
          <ul class="diag-questions">
            ${v.perguntas.map(p => `<li>□ ${p}</li>`).join('')}
          </ul>
          
          <div class="diag-tip">
            <span style="font-size:16px">💡</span>
            <span><strong>Dica:</strong> ${v.dica}</span>
          </div>
        </div>
      `;
    });
  } else if(previo) {
    html += `
      <div class="diag-card success">
        <div class="diag-title">
          <span style="font-size:24px">✅</span>
          Estabilidade nos Indicadores
        </div>
        <p style="font-size:13px; color:#166534">
          Não foram detectadas variações significativas entre ${previo.ano} e ${latest.ano}. 
          Os indicadores mantiveram-se dentro de faixas normais de flutuação.
        </p>
      </div>
    `;
  }
  
  // Pontos Positivos e de Atenção
  const score = calcularScore(latest);
  const pontosPositivos = [];
  const pontosAtencao = [];
  
  // Analisar cada indicador
  if(latest.margem >= 0.15) pontosPositivos.push('Margem EBITDA saudável (≥15%)');
  else if(latest.margem < 0.08) pontosAtencao.push('Margem EBITDA baixa (<8%) - pressão na geração de caixa');
  
  if(latest.alav <= 2) pontosPositivos.push('Alavancagem confortável (DL/EBITDA ≤ 2x)');
  else if(latest.alav > 3) pontosAtencao.push('Alavancagem elevada (DL/EBITDA > 3x) - risco de solvência');
  
  if(latest.liq >= 1.5) pontosPositivos.push('Liquidez confortável (≥1.5x)');
  else if(latest.liq < 1) pontosAtencao.push('Liquidez crítica (<1.0x) - risco de inadimplência');
  
  if(latest.roe >= 0.15) pontosPositivos.push('ROE atrativo (≥15%) - boa rentabilidade para sócios');
  else if(latest.roe < 0.08) pontosAtencao.push('ROE baixo (<8%) - rentabilidade pode não compensar risco');
  
  // Verificar tendências de crescimento
  if(rows.length >= 3){
    let crescimentoConsistente = true;
    for(let i = 0; i < rows.length - 1; i++){
      if(rows[i].receita < rows[i+1].receita * 0.95){ // tolerância de 5%
        crescimentoConsistente = false;
        break;
      }
    }
    if(crescimentoConsistente) pontosPositivos.push(`Receita crescendo consistentemente há ${rows.length} anos`);
  }
  
  if(pontosPositivos.length > 0){
    html += `
      <div class="diag-card success">
        <div class="diag-title">
          <span style="font-size:24px">✅</span>
          Pontos Positivos
        </div>
        <ul style="list-style:none; padding:0; margin:0">
          ${pontosPositivos.map(p => `<li style="padding:8px 0; border-bottom:1px solid #d1fae5; display:flex; align-items:center; gap:8px">
            <span style="color:#10b981">✓</span> ${p}
          </li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  if(pontosAtencao.length > 0){
    html += `
      <div class="diag-card danger">
        <div class="diag-title">
          <span style="font-size:24px">⚡</span>
          Pontos de Atenção
        </div>
        <ul style="list-style:none; padding:0; margin:0">
          ${pontosAtencao.map(p => `<li style="padding:8px 0; border-bottom:1px solid #fecaca; display:flex; align-items:center; gap:8px">
            <span style="color:#ef4444">⚠</span> ${p}
          </li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  // ========== RED FLAGS (ALERTAS ANTECIPADOS) ==========
  const redFlags = [];
  
  if(previo){
    // Red Flag 1: Receita sobe mas caixa cai
    if(latest.receita > previo.receita && latest.caixa < previo.caixa * 0.9){
      redFlags.push({
        titulo: 'Receita ↑ mas Caixa ↓',
        descricao: 'Receita cresceu mas caixa diminuiu mais de 10%',
        significado: 'Ciclo financeiro pode estar descontrolado. Empresa está vendendo mais mas não está recebendo ou está pagando antes de receber.',
        acao: 'Verificar prazo médio de recebimento e política de crédito'
      });
    }
    
    // Red Flag 2: Estoque cresce mais que receita
    if(latest.estoques && previo.estoques){
      const varEstoque = (latest.estoques - previo.estoques) / previo.estoques;
      const varRec = (latest.receita - previo.receita) / previo.receita;
      if(varEstoque > varRec + 0.15){
        redFlags.push({
          titulo: 'Estoque ↑ mais que Receita',
          descricao: `Estoque cresceu ${toPct(varEstoque)} vs Receita ${toPct(varRec)}`,
          significado: 'Pode indicar produto encalhado, perda de vendas ou compras excessivas. Capital de giro está sendo consumido.',
          acao: 'Analisar giro de estoque e identificar itens parados >90 dias'
        });
      }
    }
    
    // Red Flag 3: Contas a receber cresce mais que receita
    if(latest.contasReceber && previo.contasReceber){
      const varCR = (latest.contasReceber - previo.contasReceber) / previo.contasReceber;
      const varRec = (latest.receita - previo.receita) / previo.receita;
      if(varCR > varRec + 0.20){
        redFlags.push({
          titulo: 'Recebíveis ↑ mais que Receita',
          descricao: `Contas a receber cresceu ${toPct(varCR)} vs Receita ${toPct(varRec)}`,
          significado: 'Inadimplência pode estar crescendo ou prazo de recebimento aumentou. Risco de provisão futura.',
          acao: 'Solicitar aging de recebíveis e analisar concentração'
        });
      }
    }
    
    // Red Flag 4: Margem sobe muito rápido (pode ser não-recorrente)
    if(latest.margem > previo.margem * 1.5 && previo.margem > 0.03){
      redFlags.push({
        titulo: 'Margem subiu muito rápido (+50%)',
        descricao: `Margem foi de ${toPct(previo.margem)} para ${toPct(latest.margem)}`,
        significado: 'Melhoria muito rápida pode indicar eventos não-recorrentes (venda de ativo, crédito tributário, reversão de provisão).',
        acao: 'Perguntar especificamente sobre eventos extraordinários no período'
      });
    }
    
    // Red Flag 5: EBITDA sobe mas Lucro Líquido cai
    if(latest.ebitda > previo.ebitda && latest.lucroLiq < previo.lucroLiq * 0.85){
      redFlags.push({
        titulo: 'EBITDA ↑ mas Lucro ↓',
        descricao: 'EBITDA cresceu mas lucro líquido caiu mais de 15%',
        significado: 'Dívida cara está consumindo o resultado operacional. Despesas financeiras podem estar fora de controle.',
        acao: 'Analisar estrutura de dívida e custo médio do endividamento'
      });
    }
    
    // Red Flag 6: Fornecedores cai com estoque estável (pagando à vista)
    if(latest.contasPagar && previo.contasPagar && latest.estoques && previo.estoques){
      const varForn = (latest.contasPagar - previo.contasPagar) / previo.contasPagar;
      const varEst = (latest.estoques - previo.estoques) / previo.estoques;
      if(varForn < -0.20 && Math.abs(varEst) < 0.10){
        redFlags.push({
          titulo: 'Fornecedores ↓ com Estoque estável',
          descricao: `Fornecedores caiu ${toPct(Math.abs(varForn))} mas estoque manteve`,
          significado: 'Empresa pode estar pagando à vista por pressão de fornecedores ou perda de crédito. Caixa pressionado.',
          acao: 'Verificar se perdeu prazo com fornecedores e por quê'
        });
      }
    }
    
    // Red Flag 7: Patrimônio Líquido caindo
    if(latest.pl && previo.pl && latest.pl < previo.pl * 0.9){
      redFlags.push({
        titulo: 'Patrimônio Líquido ↓',
        descricao: `PL caiu de ${toBRL(previo.pl)} para ${toBRL(latest.pl)}`,
        significado: 'Prejuízos acumulados estão corroendo o patrimônio. Empresa está destruindo valor.',
        acao: 'Analisar se há plano de recuperação ou necessidade de aporte'
      });
    }
  }
  
  // Red Flag 8: Indicadores inconsistentes (EBITDA muito alto vs Lucro)
  if(latest.ebitda > 0 && latest.lucroLiq < 0){
    redFlags.push({
      titulo: 'EBITDA positivo mas Prejuízo',
      descricao: `EBITDA ${toBRL(latest.ebitda)} vs Prejuízo ${toBRL(latest.lucroLiq)}`,
      significado: 'Operação gera caixa mas despesas financeiras/depreciação consomem tudo. Estrutura de capital problemática.',
      acao: 'Avaliar viabilidade de longo prazo e necessidade de reestruturação'
    });
  }
  
  if(redFlags.length > 0){
    html += `
      <div class="diag-card danger" style="border-left-width:4px; border-left-color:#dc2626">
        <div class="diag-title" style="color:#dc2626">
          <span style="font-size:24px">🚨</span>
          Red Flags Detectados - O que o banco não vê
        </div>
        <p style="font-size:12px; color:#991b1b; margin-bottom:16px">
          Padrões que indicam problemas ANTES de aparecerem claramente nos indicadores tradicionais.
        </p>
        
        ${redFlags.map((rf, idx) => `
          <div style="background:#fff; border:1px solid #fecaca; border-radius:8px; padding:14px; margin-bottom:12px">
            <div style="font-weight:700; color:#dc2626; margin-bottom:8px; display:flex; align-items:center; gap:8px">
              <span style="background:#dc2626; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px">#${idx+1}</span>
              ${rf.titulo}
            </div>
            <div style="font-size:13px; color:#7f1d1d; margin-bottom:8px">${rf.descricao}</div>
            <div style="font-size:12px; background:#fef2f2; padding:10px; border-radius:6px; margin-bottom:8px">
              <strong>🔍 O que isso significa:</strong> ${rf.significado}
            </div>
            <div style="font-size:12px; color:#166534; background:#dcfce7; padding:8px 10px; border-radius:6px">
              <strong>✅ Ação recomendada:</strong> ${rf.acao}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // ========== CICLO FINANCEIRO (NCG) ==========
  // Calcular PMR, PMP, PME e NCG
  const diasAno = 360;
  const receitaDia = latest.receita / diasAno;
  const cmvDia = (latest.cmv || latest.receita * 0.6) / diasAno; // Estimar CMV se não tiver
  
  // PMR - Prazo Médio de Recebimento
  const pmr = latest.contasReceber ? Math.round(latest.contasReceber / receitaDia) : null;
  
  // PME - Prazo Médio de Estocagem
  const pme = latest.estoques ? Math.round(latest.estoques / cmvDia) : null;
  
  // PMP - Prazo Médio de Pagamento
  const pmp = latest.contasPagar ? Math.round(latest.contasPagar / cmvDia) : null;
  
  // Ciclo Operacional e Financeiro
  const cicloOperacional = (pmr || 0) + (pme || 0);
  const cicloFinanceiro = cicloOperacional - (pmp || 0);
  
  // NCG - Necessidade de Capital de Giro
  const ncg = cicloFinanceiro > 0 ? cicloFinanceiro * receitaDia : 0;
  
  // Capital de Giro disponível
  const cdg = (latest.ativoCirc || 0) - (latest.passivoCirc || 0);
  
  // Saldo de Tesouraria
  const saldoTesouraria = cdg - ncg;
  
  if(pmr !== null || pme !== null || pmp !== null){
    html += `
      <div class="diag-card info" style="background:linear-gradient(135deg, #eff6ff, #dbeafe)">
        <div class="diag-title" style="color:#1e40af">
          <span style="font-size:24px">⏱️</span>
          Ciclo Financeiro e NCG
        </div>
        <p style="font-size:12px; color:#1e40af; margin-bottom:20px">
          Análise do ciclo de conversão de caixa - quanto tempo o dinheiro fica "preso" na operação.
        </p>
        
        <div style="display:flex; flex-wrap:wrap; gap:16px; margin-bottom:20px">
          ${pmr !== null ? `
            <div style="flex:1; min-width:120px; background:#fff; border-radius:8px; padding:16px; text-align:center">
              <div style="font-size:11px; color:#6b7280; text-transform:uppercase; margin-bottom:4px">PMR</div>
              <div style="font-size:28px; font-weight:800; color:#1e40af">${pmr}</div>
              <div style="font-size:11px; color:#6b7280">dias p/ receber</div>
            </div>
          ` : ''}
          ${pme !== null ? `
            <div style="flex:1; min-width:120px; background:#fff; border-radius:8px; padding:16px; text-align:center">
              <div style="font-size:11px; color:#6b7280; text-transform:uppercase; margin-bottom:4px">PME</div>
              <div style="font-size:28px; font-weight:800; color:#f59e0b">${pme}</div>
              <div style="font-size:11px; color:#6b7280">dias em estoque</div>
            </div>
          ` : ''}
          ${pmp !== null ? `
            <div style="flex:1; min-width:120px; background:#fff; border-radius:8px; padding:16px; text-align:center">
              <div style="font-size:11px; color:#6b7280; text-transform:uppercase; margin-bottom:4px">PMP</div>
              <div style="font-size:28px; font-weight:800; color:#10b981">${pmp}</div>
              <div style="font-size:11px; color:#6b7280">dias p/ pagar</div>
            </div>
          ` : ''}
          <div style="flex:1; min-width:120px; background:${cicloFinanceiro > 60 ? '#fef2f2' : cicloFinanceiro > 30 ? '#fffbeb' : '#ecfdf5'}; border-radius:8px; padding:16px; text-align:center">
            <div style="font-size:11px; color:#6b7280; text-transform:uppercase; margin-bottom:4px">CICLO FINANCEIRO</div>
            <div style="font-size:28px; font-weight:800; color:${cicloFinanceiro > 60 ? '#dc2626' : cicloFinanceiro > 30 ? '#f59e0b' : '#10b981'}">${cicloFinanceiro}</div>
            <div style="font-size:11px; color:#6b7280">dias</div>
          </div>
        </div>
        
        <!-- Visualização do Ciclo -->
        <div style="background:#fff; border-radius:8px; padding:16px; margin-bottom:16px">
          <div style="font-size:12px; font-weight:600; margin-bottom:12px">📊 Visualização do Ciclo</div>
          <div style="position:relative; height:80px; background:#f1f5f9; border-radius:8px; overflow:hidden">
            ${pme !== null ? `
              <div style="position:absolute; left:0; top:10px; height:25px; width:${Math.min(pme/2, 45)}%; background:#f59e0b; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:600">
                Estoque ${pme}d
              </div>
            ` : ''}
            ${pmr !== null ? `
              <div style="position:absolute; left:${pme ? Math.min(pme/2, 45) : 0}%; top:10px; height:25px; width:${Math.min(pmr/2, 45)}%; background:#3b82f6; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:600">
                Receber ${pmr}d
              </div>
            ` : ''}
            ${pmp !== null ? `
              <div style="position:absolute; left:0; top:45px; height:25px; width:${Math.min(pmp/2, 45)}%; background:#10b981; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:600">
                Pagar ${pmp}d
              </div>
            ` : ''}
          </div>
          <div style="font-size:11px; color:#6b7280; margin-top:8px; text-align:center">
            Ciclo Operacional: ${cicloOperacional} dias | Ciclo Financeiro: ${cicloFinanceiro} dias
          </div>
        </div>
        
        <!-- NCG -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px">
          <div style="background:#fff; border-radius:8px; padding:14px">
            <div style="font-size:11px; color:#6b7280; margin-bottom:4px">NCG (Necessidade de Capital de Giro)</div>
            <div style="font-size:20px; font-weight:700; color:#1e40af">${toBRL(ncg)}</div>
            <div style="font-size:11px; color:#6b7280">Quanto precisa para financiar o ciclo</div>
          </div>
          <div style="background:#fff; border-radius:8px; padding:14px">
            <div style="font-size:11px; color:#6b7280; margin-bottom:4px">Capital de Giro Disponível</div>
            <div style="font-size:20px; font-weight:700; color:${cdg >= 0 ? '#10b981' : '#dc2626'}">${toBRL(cdg)}</div>
            <div style="font-size:11px; color:#6b7280">AC - PC</div>
          </div>
          <div style="background:${saldoTesouraria >= 0 ? '#ecfdf5' : '#fef2f2'}; border-radius:8px; padding:14px">
            <div style="font-size:11px; color:#6b7280; margin-bottom:4px">Saldo de Tesouraria</div>
            <div style="font-size:20px; font-weight:700; color:${saldoTesouraria >= 0 ? '#10b981' : '#dc2626'}">${toBRL(saldoTesouraria)}</div>
            <div style="font-size:11px; color:${saldoTesouraria >= 0 ? '#166534' : '#991b1b'}">
              ${saldoTesouraria >= 0 ? '✓ Folga financeira' : '⚠️ Precisa de financiamento'}
            </div>
          </div>
        </div>
        
        ${saldoTesouraria < 0 ? `
          <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; margin-top:16px">
            <div style="font-size:13px; color:#991b1b">
              <strong>⚠️ Alerta:</strong> A NCG (${toBRL(ncg)}) é maior que o Capital de Giro disponível (${toBRL(cdg)}). 
              A empresa precisa de <strong>${toBRL(Math.abs(saldoTesouraria))}</strong> de financiamento externo para fechar o ciclo.
            </div>
          </div>
        ` : ''}
        
        ${cicloFinanceiro > 60 ? `
          <div style="background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; padding:12px; margin-top:16px">
            <div style="font-size:13px; color:#92400e">
              <strong>💡 Oportunidade:</strong> Ciclo financeiro de ${cicloFinanceiro} dias é longo. 
              Reduzir PMR em 10 dias liberaria aproximadamente <strong>${toBRL(receitaDia * 10)}</strong> de caixa.
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }
  
  // Score geral
  html += `
    <div class="diag-card info">
      <div class="diag-title">
        <span style="font-size:24px">🎯</span>
        Resumo do Diagnóstico
      </div>
      <div style="display:flex; align-items:center; gap:16px; margin-top:12px">
        <div class="score-badge ${getStatusFinanceiro(score).classe}" style="width:60px; height:60px; font-size:20px">
          ${score}
        </div>
        <div>
          <div style="font-size:16px; font-weight:700">${getStatusFinanceiro(score).label}</div>
          <div style="font-size:13px; color:var(--text-secondary)">
            ${score >= 80 ? 'Empresa com indicadores sólidos. Baixo risco de crédito.' :
              score >= 65 ? 'Empresa saudável com alguns pontos de melhoria.' :
              score >= 50 ? 'Empresa com indicadores medianos. Monitorar de perto.' :
              'Empresa com indicadores frágeis. Alto risco de crédito.'}
          </div>
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

// ================== ABA 3: PLANO DE AÇÃO ==================
function renderPlanoAcao(data){
  if(!data || !data.rows || !data.rows.length) return;
  
  const rows = data.rows;
  const latest = rows[0];
  const container = document.getElementById("planoAcaoContent");
  
  let html = '';
  
  // Identificar indicadores problemáticos e gerar planos
  const problemas = [];
  
  // Liquidez crítica
  if(latest.liq < 1.2){
    problemas.push({
      indicador: 'Liquidez Corrente',
      valor: clamp2(latest.liq),
      meta: '1.2 a 1.5',
      severidade: latest.liq < 1 ? 'alta' : 'media',
      acoes: [
        {
          fase: 'Imediato (0-30 dias)',
          items: [
            'Levantar aging completo de contas a receber',
            'Identificar inadimplentes >60 dias e acionar cobrança',
            'Revisar política de crédito para novos clientes',
            'Suspender compras não essenciais'
          ]
        },
        {
          fase: 'Curto Prazo (30-90 dias)',
          items: [
            'Renegociar prazo com 5 maiores fornecedores (30→45-60 dias)',
            'Oferecer desconto de 2-3% para pagamento antecipado',
            'Avaliar antecipação de recebíveis (custo vs benefício)',
            'Identificar estoques parados >90 dias para liquidar'
          ]
        },
        {
          fase: 'Médio Prazo (90-180 dias)',
          items: [
            'Buscar linha de capital de giro de longo prazo',
            'Implementar gestão de estoque mínimo/máximo',
            'Automatizar régua de cobrança',
            'Revisar ciclo financeiro completo (PMR, PMP, PME)'
          ]
        }
      ],
      impacto: `Estimativa: redução PMR em 10 dias + aumento PMP em 15 dias pode liberar até ${toBRL(latest.receita * 0.07)}`
    });
  }
  
  // Alavancagem alta
  if(latest.alav > 2.5){
    problemas.push({
      indicador: 'DL/EBITDA (Alavancagem)',
      valor: clamp2(latest.alav) + 'x',
      meta: '< 2.5x',
      severidade: latest.alav > 3.5 ? 'alta' : 'media',
      acoes: [
        {
          fase: 'Imediato (0-30 dias)',
          items: [
            'Mapear todas as dívidas com taxas, prazos e garantias',
            'Identificar dívidas com taxas mais altas para priorizar',
            'Calcular capacidade real de pagamento mensal',
            'Verificar possibilidade de carência em contratos vigentes'
          ]
        },
        {
          fase: 'Curto Prazo (30-90 dias)',
          items: [
            'Renegociar dívidas de curto para longo prazo',
            'Buscar consolidação com taxa menor',
            'Suspender distribuição de dividendos',
            'Avaliar venda de ativos não operacionais'
          ]
        },
        {
          fase: 'Médio Prazo (90-180 dias)',
          items: [
            'Focar em aumento de EBITDA (receita ou custos)',
            'Considerar aporte de capital dos sócios',
            'Estabelecer meta de redução: 0.5x por semestre',
            'Criar reserva para amortizações extraordinárias'
          ]
        }
      ],
      impacto: `Meta: reduzir DL/EBITDA de ${clamp2(latest.alav)}x para 2.5x em 12 meses. Necessário aumentar EBITDA em ${toPct((latest.alav/2.5 - 1))} ou reduzir dívida em ${toBRL(latest.dividaLiq - latest.ebitda * 2.5)}`
    });
  }
  
  // Margem baixa
  if(latest.margem < 0.10){
    problemas.push({
      indicador: 'Margem EBITDA',
      valor: toPct(latest.margem),
      meta: '≥ 12%',
      severidade: latest.margem < 0.05 ? 'alta' : 'media',
      acoes: [
        {
          fase: 'Imediato (0-30 dias)',
          items: [
            'Fazer análise detalhada da DRE por linha de produto/serviço',
            'Identificar produtos/serviços deficitários',
            'Revisar precificação - há espaço para reajuste?',
            'Mapear custos fixos vs variáveis'
          ]
        },
        {
          fase: 'Curto Prazo (30-90 dias)',
          items: [
            'Renegociar com 3 maiores fornecedores (meta: -5%)',
            'Revisar contratos de serviços recorrentes (TI, limpeza, segurança)',
            'Avaliar descontinuação de linhas deficitárias',
            'Otimizar mix de vendas para produtos de maior margem'
          ]
        },
        {
          fase: 'Médio Prazo (90-180 dias)',
          items: [
            'Automatizar processos para reduzir custos operacionais',
            'Avaliar terceirização de atividades não-core',
            'Investir em eficiência energética se relevante',
            'Revisar estrutura organizacional (níveis hierárquicos)'
          ]
        }
      ],
      impacto: `Meta: aumentar margem de ${toPct(latest.margem)} para 12%. Com receita atual, significa adicionar ${toBRL(latest.receita * (0.12 - latest.margem))} ao EBITDA anual.`
    });
  }
  
  // ROE baixo
  if(latest.roe < 0.10 && latest.roe > 0){
    problemas.push({
      indicador: 'ROE (Rentabilidade)',
      valor: toPct(latest.roe),
      meta: '≥ 12%',
      severidade: 'baixa',
      acoes: [
        {
          fase: 'Análise Imediata',
          items: [
            'Comparar ROE com custo de oportunidade dos sócios',
            'Verificar se há capital excessivo imobilizado',
            'Analisar se patrimônio está inflado por reavaliações',
            'Calcular ROIC para visão mais ampla'
          ]
        },
        {
          fase: 'Ações Estruturais',
          items: [
            'Aumentar eficiência do capital empregado',
            'Considerar distribuição de reservas se houver excesso',
            'Revisar ativos não produtivos',
            'Melhorar giro do ativo operacional'
          ]
        }
      ],
      impacto: 'ROE baixo pode indicar uso ineficiente do capital ou margem insuficiente.'
    });
  }
  
  // Renderizar planos
  if(problemas.length === 0){
    html = `
      <div class="diag-card success">
        <div class="diag-title">
          <span style="font-size:24px">✅</span>
          Indicadores Saudáveis
        </div>
        <p style="font-size:14px; color:#166534">
          Todos os principais indicadores estão dentro de parâmetros aceitáveis. 
          Não há plano de ação urgente necessário.
        </p>
        <p style="font-size:13px; color:#166534; margin-top:12px">
          <strong>Recomendação:</strong> Manter monitoramento trimestral e focar em melhoria contínua.
        </p>
      </div>
    `;
  } else {
    html += `
      <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:16px; margin-bottom:20px">
        <div style="font-size:15px; font-weight:700; color:#0c4a6e; margin-bottom:8px">
          📋 Planos de Ação Identificados
        </div>
        <p style="font-size:13px; color:#0369a1">
          Foram identificados ${problemas.length} indicador(es) que requerem atenção. 
          Abaixo estão os planos de ação recomendados para cada um.
        </p>
      </div>
    `;
    
    problemas.forEach((p, idx) => {
      html += `
        <div class="diag-card ${p.severidade === 'alta' ? 'danger' : p.severidade === 'media' ? 'alert' : 'info'}" style="margin-bottom:24px">
          <div class="diag-title">
            <span style="font-size:20px">${p.severidade === 'alta' ? '🚨' : p.severidade === 'media' ? '⚠️' : '💡'}</span>
            ${p.indicador}
            <span style="margin-left:auto; font-size:14px">
              Atual: <strong>${p.valor}</strong> → Meta: <strong>${p.meta}</strong>
            </span>
          </div>
          
          <div class="action-timeline" style="margin-top:20px">
            ${p.acoes.map(fase => `
              <div class="action-phase">
                <div class="action-phase-title">📅 ${fase.fase}</div>
                ${fase.items.map(item => `
                  <div class="action-item">
                    <div class="action-checkbox"></div>
                    <span>${item}</span>
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </div>
          
          <div style="background:rgba(255,255,255,0.5); border-radius:8px; padding:12px; margin-top:16px">
            <div style="font-size:12px; font-weight:600; color:var(--brand); margin-bottom:4px">📊 IMPACTO ESTIMADO:</div>
            <div style="font-size:13px">${p.impacto}</div>
          </div>
        </div>
      `;
    });
  }
  
  // ========== STRESS TEST (CENÁRIOS ADVERSOS) ==========
  html += `
    <div style="background:linear-gradient(135deg, #1e293b, #334155); color:#fff; border-radius:12px; padding:20px; margin-top:24px">
      <div style="font-size:18px; font-weight:700; margin-bottom:16px; display:flex; align-items:center; gap:10px">
        🔥 Stress Test - Cenários Adversos
      </div>
      <p style="font-size:13px; opacity:0.8; margin-bottom:20px">
        Simulação de cenários negativos para avaliar a resiliência da empresa.
      </p>
  `;
  
  // Cenário 1: Receita cai 20%
  const receitaStress1 = latest.receita * 0.8;
  const ebitdaStress1 = latest.ebitda - (latest.receita * 0.2 * 0.6); // 60% margem contribuição
  const alavStress1 = ebitdaStress1 > 0 ? latest.dividaLiq / ebitdaStress1 : 99;
  const liqStress1 = latest.liq * 0.85; // Reduz liquidez
  
  html += `
    <div style="background:rgba(255,255,255,0.1); border-radius:10px; padding:16px; margin-bottom:16px">
      <div style="font-size:14px; font-weight:700; margin-bottom:12px; color:#fbbf24">
        📉 CENÁRIO 1: Receita cai 20%
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px">
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">Receita</div>
          <div style="font-size:11px; text-decoration:line-through; opacity:0.5">${toBRL(latest.receita)}</div>
          <div style="font-size:16px; font-weight:700">${toBRL(receitaStress1)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">EBITDA</div>
          <div style="font-size:11px; text-decoration:line-through; opacity:0.5">${toBRL(latest.ebitda)}</div>
          <div style="font-size:16px; font-weight:700; color:${ebitdaStress1 < 0 ? '#f87171' : '#fff'}">${toBRL(ebitdaStress1)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">DL/EBITDA</div>
          <div style="font-size:11px; text-decoration:line-through; opacity:0.5">${clamp2(latest.alav)}x</div>
          <div style="font-size:16px; font-weight:700; color:${alavStress1 > 3 ? '#f87171' : alavStress1 > 2.5 ? '#fbbf24' : '#4ade80'}">${alavStress1 > 10 ? '>10x' : clamp2(alavStress1) + 'x'}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">Liquidez</div>
          <div style="font-size:11px; text-decoration:line-through; opacity:0.5">${clamp2(latest.liq)}</div>
          <div style="font-size:16px; font-weight:700; color:${liqStress1 < 1 ? '#f87171' : '#fff'}">${clamp2(liqStress1)}</div>
        </div>
      </div>
      <div style="margin-top:12px; padding:10px; background:${alavStress1 > 3 || liqStress1 < 1 ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.2)'}; border-radius:6px; font-size:12px">
        ${alavStress1 > 3 || liqStress1 < 1 ? '⚠️ Capacidade de pagamento COMPROMETIDA' : '✓ Empresa sobrevive com folga'}
      </div>
    </div>
  `;
  
  // Cenário 2: Custos sobem 15%
  const ebitdaStress2 = latest.ebitda - (latest.receita * (1 - latest.margem) * 0.15);
  const margemStress2 = ebitdaStress2 / latest.receita;
  const alavStress2 = ebitdaStress2 > 0 ? latest.dividaLiq / ebitdaStress2 : 99;
  
  html += `
    <div style="background:rgba(255,255,255,0.1); border-radius:10px; padding:16px; margin-bottom:16px">
      <div style="font-size:14px; font-weight:700; margin-bottom:12px; color:#fb923c">
        📈 CENÁRIO 2: Custos sobem 15%
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px">
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">EBITDA</div>
          <div style="font-size:11px; text-decoration:line-through; opacity:0.5">${toBRL(latest.ebitda)}</div>
          <div style="font-size:16px; font-weight:700; color:${ebitdaStress2 < 0 ? '#f87171' : '#fff'}">${toBRL(ebitdaStress2)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">Margem EBITDA</div>
          <div style="font-size:11px; text-decoration:line-through; opacity:0.5">${toPct(latest.margem)}</div>
          <div style="font-size:16px; font-weight:700; color:${margemStress2 < 0.08 ? '#f87171' : '#fff'}">${toPct(margemStress2)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">DL/EBITDA</div>
          <div style="font-size:11px; text-decoration:line-through; opacity:0.5">${clamp2(latest.alav)}x</div>
          <div style="font-size:16px; font-weight:700; color:${alavStress2 > 3 ? '#f87171' : alavStress2 > 2.5 ? '#fbbf24' : '#4ade80'}">${alavStress2 > 10 ? '>10x' : clamp2(alavStress2) + 'x'}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">Variação EBITDA</div>
          <div style="font-size:16px; font-weight:700; color:#f87171">${toPct((ebitdaStress2 - latest.ebitda) / latest.ebitda)}</div>
        </div>
      </div>
      <div style="margin-top:12px; padding:10px; background:${alavStress2 > 3 ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.2)'}; border-radius:6px; font-size:12px">
        ${alavStress2 > 3 ? '⚠️ Alavancagem ultrapassa limite prudencial' : '✓ Impacto absorvível'}
      </div>
    </div>
  `;
  
  // Cenário 3: Combinado (Receita -10% + Custos +10%)
  const receitaStress3 = latest.receita * 0.9;
  const custoBase = latest.receita * (1 - latest.margem);
  const custoStress3 = custoBase * 1.10;
  const ebitdaStress3 = receitaStress3 - custoStress3;
  const alavStress3 = ebitdaStress3 > 0 ? latest.dividaLiq / ebitdaStress3 : 99;
  
  html += `
    <div style="background:rgba(255,255,255,0.1); border-radius:10px; padding:16px; margin-bottom:16px">
      <div style="font-size:14px; font-weight:700; margin-bottom:12px; color:#f87171">
        💥 CENÁRIO 3: Combinado (Receita -10% E Custos +10%)
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px">
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">Receita</div>
          <div style="font-size:11px; text-decoration:line-through; opacity:0.5">${toBRL(latest.receita)}</div>
          <div style="font-size:16px; font-weight:700">${toBRL(receitaStress3)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">EBITDA</div>
          <div style="font-size:11px; text-decoration:line-through; opacity:0.5">${toBRL(latest.ebitda)}</div>
          <div style="font-size:16px; font-weight:700; color:${ebitdaStress3 < 0 ? '#f87171' : '#fff'}">${toBRL(ebitdaStress3)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">DL/EBITDA</div>
          <div style="font-size:11px; text-decoration:line-through; opacity:0.5">${clamp2(latest.alav)}x</div>
          <div style="font-size:16px; font-weight:700; color:${alavStress3 > 3 ? '#f87171' : '#4ade80'}">${alavStress3 > 10 ? '>10x' : clamp2(alavStress3) + 'x'}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px; opacity:0.7">Variação EBITDA</div>
          <div style="font-size:16px; font-weight:700; color:#f87171">${latest.ebitda > 0 ? toPct((ebitdaStress3 - latest.ebitda) / latest.ebitda) : 'N/A'}</div>
        </div>
      </div>
      <div style="margin-top:12px; padding:10px; background:${ebitdaStress3 < 0 || alavStress3 > 3.5 ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)'}; border-radius:6px; font-size:12px">
        ${ebitdaStress3 < 0 ? '🚨 EBITDA NEGATIVO - Empresa não sobrevive este cenário' : 
          alavStress3 > 3.5 ? '⚠️ Situação CRÍTICA - Renegociação necessária' : '⚠️ Cenário difícil mas gerenciável'}
      </div>
    </div>
  `;
  
  // Índice de Resiliência
  let pontuacaoResiliencia = 100;
  if(alavStress1 > 3) pontuacaoResiliencia -= 25;
  if(liqStress1 < 1) pontuacaoResiliencia -= 25;
  if(alavStress2 > 3) pontuacaoResiliencia -= 15;
  if(ebitdaStress3 < 0) pontuacaoResiliencia -= 35;
  else if(alavStress3 > 3.5) pontuacaoResiliencia -= 20;
  
  const resilienciaLabel = pontuacaoResiliencia >= 80 ? 'ALTA' : pontuacaoResiliencia >= 50 ? 'MÉDIA' : 'BAIXA';
  const resilienciaCor = pontuacaoResiliencia >= 80 ? '#4ade80' : pontuacaoResiliencia >= 50 ? '#fbbf24' : '#f87171';
  
  html += `
    <div style="background:rgba(255,255,255,0.15); border-radius:10px; padding:16px; text-align:center">
      <div style="font-size:12px; opacity:0.7; margin-bottom:8px">ÍNDICE DE RESILIÊNCIA</div>
      <div style="font-size:36px; font-weight:800; color:${resilienciaCor}">${resilienciaLabel}</div>
      <div style="font-size:13px; margin-top:8px; opacity:0.8">
        ${pontuacaoResiliencia >= 80 ? 'Empresa aguenta cenários adversos com folga' :
          pontuacaoResiliencia >= 50 ? 'Empresa aguenta cenário moderado, mas não severo' :
          'Empresa vulnerável a cenários adversos - monitorar de perto'}
      </div>
    </div>
  </div>
  `;
  
  container.innerHTML = html;
}

// ================== ABA 4: DEFESA DE CRÉDITO ==================
function renderDefesaCredito(data){
  if(!data || !data.rows || !data.rows.length) return;
  
  const rows = data.rows;
  const latest = rows[0];
  const empresaNome = data.empresaNome;
  const container = document.getElementById("defesaCreditoContent");
  const score = calcularScore(latest);
  
  // Calcular médias
  const mediaEbitda = rows.reduce((sum, r) => sum + (r.ebitda || 0), 0) / rows.length;
  
  // Gerar argumentos positivos
  const argumentosFavoraveis = [];
  
  if(mediaEbitda > 0){
    argumentosFavoraveis.push({
      titulo: 'GERAÇÃO DE CAIXA CONSISTENTE',
      texto: `A empresa apresenta EBITDA positivo nos últimos ${rows.length} anos, com média de ${toBRL(mediaEbitda)}/ano, demonstrando capacidade operacional de geração de caixa.`
    });
  }
  
  if(rows.length >= 2 && rows[0].margem > rows[rows.length-1].margem){
    argumentosFavoraveis.push({
      titulo: 'TENDÊNCIA DE MELHORIA NA MARGEM',
      texto: `A margem EBITDA evoluiu de ${toPct(rows[rows.length-1].margem)} (${rows[rows.length-1].ano}) para ${toPct(latest.margem)} (${latest.ano}), demonstrando ganho de eficiência operacional ao longo do período.`
    });
  }
  
  if(latest.alav <= 2.5){
    argumentosFavoraveis.push({
      titulo: 'ALAVANCAGEM CONTROLADA',
      texto: `DL/EBITDA de ${clamp2(latest.alav)}x está abaixo do limite prudencial de 3.0x, oferecendo margem de segurança para absorver a operação proposta sem comprometer a estrutura de capital.`
    });
  }
  
  if(latest.liq >= 1.2){
    argumentosFavoraveis.push({
      titulo: 'LIQUIDEZ ADEQUADA',
      texto: `Liquidez corrente de ${clamp2(latest.liq)}x garante capacidade de honrar compromissos de curto prazo, indicando gestão prudente do capital de giro.`
    });
  }
  
  if(rows.length >= 3){
    let crescendo = true;
    for(let i = 0; i < rows.length - 1; i++){
      if(rows[i].receita < rows[i+1].receita) { crescendo = false; break; }
    }
    if(crescendo){
      const crescimento = ((rows[0].receita / rows[rows.length-1].receita) - 1) * 100;
      argumentosFavoraveis.push({
        titulo: 'CRESCIMENTO SUSTENTADO',
        texto: `Receita crescendo consistentemente nos últimos ${rows.length} anos, com evolução total de ${clamp2(crescimento)}%, demonstrando posicionamento competitivo e capacidade de expansão.`
      });
    }
  }
  
  // Gerar pontos de atenção com mitigantes
  const pontosRisco = [];
  
  if(latest.alav > 2){
    pontosRisco.push({
      risco: 'Alavancagem acima do ideal',
      mitigante: `Embora o DL/EBITDA de ${clamp2(latest.alav)}x esteja acima de 2x, a empresa apresenta geração de caixa consistente e o cronograma de amortização está adequado ao fluxo. A operação proposta não elevará significativamente este indicador.`
    });
  }
  
  if(latest.liq < 1.3){
    pontosRisco.push({
      risco: 'Liquidez em monitoramento',
      mitigante: `A liquidez corrente de ${clamp2(latest.liq)}x, embora adequada, merece acompanhamento. A empresa tem acesso a linhas de crédito pré-aprovadas e o ciclo financeiro está sendo otimizado com metas de melhoria.`
    });
  }
  
  if(latest.margem < 0.12){
    pontosRisco.push({
      risco: 'Margem operacional apertada',
      mitigante: `A margem EBITDA de ${toPct(latest.margem)} está abaixo da média setorial, porém a empresa tem plano estruturado de redução de custos em implementação, com meta de atingir 12% em 12 meses.`
    });
  }
  
  // Cálculo de capacidade de pagamento
  const ebitdaAnual = latest.ebitda || 0;
  const ircsEstimado = ebitdaAnual * 0.15; // Estimativa conservadora
  const servicoDividaAtual = (latest.dividaLiq || 0) * 0.20; // Estimativa de 20% ao ano
  const disponivel = ebitdaAnual - ircsEstimado - servicoDividaAtual;
  
  let html = `
    <div style="background:linear-gradient(135deg, #0a3c7d, #1e40af); color:#fff; border-radius:12px; padding:20px; margin-bottom:20px">
      <div style="font-size:18px; font-weight:700; margin-bottom:8px">🎯 Relatório de Defesa de Crédito</div>
      <div style="font-size:14px; opacity:0.9">${empresaNome}</div>
      <div style="font-size:12px; opacity:0.7; margin-top:4px">Baseado em dados de ${rows.length} exercício(s) fiscal(is)</div>
    </div>
    
    <div class="defense-section">
      <div class="defense-section-title">
        <span style="font-size:20px">✅</span>
        Argumentos Favoráveis
      </div>
      ${argumentosFavoraveis.map((a, i) => `
        <div class="argument-card">
          <div class="argument-title">${i+1}. ${a.titulo}</div>
          <div class="argument-text">"${a.texto}"</div>
          <button class="copy-btn" onclick="navigator.clipboard.writeText('${a.texto.replace(/'/g, "\\'")}'); this.textContent='✓ Copiado!'">📋 Copiar argumento</button>
        </div>
      `).join('')}
    </div>
    
    ${pontosRisco.length > 0 ? `
    <div class="defense-section">
      <div class="defense-section-title">
        <span style="font-size:20px">⚠️</span>
        Pontos de Atenção + Mitigantes
      </div>
      ${pontosRisco.map(p => `
        <div class="argument-card risk">
          <div class="argument-title">RISCO: ${p.risco}</div>
          <div class="argument-text"><strong>MITIGANTE:</strong> "${p.mitigante}"</div>
          <button class="copy-btn" onclick="navigator.clipboard.writeText('${p.mitigante.replace(/'/g, "\\'")}'); this.textContent='✓ Copiado!'">📋 Copiar mitigante</button>
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    <div class="defense-section">
      <div class="defense-section-title">
        <span style="font-size:20px">📊</span>
        Capacidade de Pagamento
      </div>
      <table class="capacity-table">
        <tr>
          <td>EBITDA anual (${latest.ano})</td>
          <td>${toBRL(ebitdaAnual)}</td>
        </tr>
        <tr>
          <td>(-) IR/CS estimado (15%)</td>
          <td>${toBRL(ircsEstimado)}</td>
        </tr>
        <tr>
          <td>(-) Serviço dívida atual (estimado)</td>
          <td>${toBRL(servicoDividaAtual)}</td>
        </tr>
        <tr>
          <td>(=) DISPONÍVEL PARA NOVA OPERAÇÃO</td>
          <td style="color:${disponivel > 0 ? '#10b981' : '#ef4444'}">${toBRL(disponivel)}</td>
        </tr>
      </table>
      
      <div style="margin-top:16px; padding:12px; background:#f8fafc; border-radius:8px">
        <div style="font-size:13px; color:var(--text-secondary)">
          <strong>Linha sugerida:</strong> Capital de Giro ou BNDES<br>
          <strong>Valor máximo recomendado:</strong> ${toBRL(disponivel * 2)} (prestação ≈ ${toBRL(disponivel * 0.5)}/mês)<br>
          <strong>Prazo sugerido:</strong> 24-36 meses
        </div>
      </div>
    </div>
    
    <div class="defense-section">
      <div class="defense-section-title">
        <span style="font-size:20px">📋</span>
        Score e Classificação
      </div>
      <div style="display:flex; align-items:center; gap:20px">
        <div class="score-badge ${getStatusFinanceiro(score).classe}" style="width:70px; height:70px; font-size:24px">
          ${score}
        </div>
        <div>
          <div style="font-size:18px; font-weight:700">${getStatusFinanceiro(score).label}</div>
          <div style="font-size:13px; color:var(--text-secondary); margin-top:4px">
            ${score >= 80 ? 'Cliente com excelente perfil de crédito. Aprovação recomendada.' :
              score >= 65 ? 'Cliente com bom perfil. Operação aprovável com monitoramento padrão.' :
              score >= 50 ? 'Cliente com perfil mediano. Operação aprovável com garantias adicionais.' :
              'Cliente com perfil frágil. Operação requer análise especial e garantias reforçadas.'}
          </div>
        </div>
      </div>
    </div>
    
    <!-- RECOMENDAÇÃO INTELIGENTE DE CRÉDITO -->
    <div class="defense-section" style="background:linear-gradient(135deg, #059669, #047857); color:#fff; border:none">
      <div class="defense-section-title" style="color:#fff">
        <span style="font-size:20px">🎯</span>
        Recomendação Inteligente de Crédito
      </div>
      <p style="font-size:13px; opacity:0.9; margin-bottom:20px">
        Baseado na análise completa da empresa, esta é a recomendação personalizada de crédito.
      </p>
      
      ${gerarRecomendacaoCredito(latest, rows, disponivel)}
    </div>
    
    <!-- SIMULADOR DE OPERAÇÕES -->
    <div class="defense-section" style="background:linear-gradient(135deg, #0f172a, #1e293b); color:#fff; border:none">
      <div class="defense-section-title" style="color:#fff">
        <span style="font-size:20px">🧮</span>
        Simulador de Operações
      </div>
      <p style="font-size:13px; opacity:0.8; margin-bottom:20px">
        Simule o impacto de uma nova operação de crédito nos indicadores da empresa.
      </p>
      
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:16px; margin-bottom:20px">
        <div>
          <label style="font-size:12px; opacity:0.7">Valor da Operação</label>
          <input type="text" id="simValor" placeholder="R$ 500.000" 
            style="width:100%; padding:10px; border:none; border-radius:8px; margin-top:4px; font-size:14px"
            value="${toBRL(disponivel * 1.5)}">
        </div>
        <div>
          <label style="font-size:12px; opacity:0.7">Prazo (meses)</label>
          <input type="number" id="simPrazo" placeholder="36" value="36"
            style="width:100%; padding:10px; border:none; border-radius:8px; margin-top:4px; font-size:14px">
        </div>
        <div>
          <label style="font-size:12px; opacity:0.7">Taxa a.m. (%)</label>
          <input type="number" id="simTaxa" placeholder="1.5" value="1.5" step="0.1"
            style="width:100%; padding:10px; border:none; border-radius:8px; margin-top:4px; font-size:14px">
        </div>
        <div style="display:flex; align-items:flex-end">
          <button onclick="simularOperacao()" 
            style="width:100%; padding:12px; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-weight:600; cursor:pointer">
            ▶ Simular
          </button>
        </div>
      </div>
      
      <div id="simResultado" style="display:none">
        <!-- Resultado será inserido aqui -->
      </div>
    </div>
  `;
  
  // Armazenar dados para o simulador
  window.SIMULADOR_DATA = {
    ebitda: ebitdaAnual,
    dividaLiq: latest.dividaLiq || 0,
    liq: latest.liq,
    pl: latest.pl || 0,
    ativoTotal: latest.ativo || 0,
    servicoDividaAtual: servicoDividaAtual,
    disponivel: disponivel,
    alav: latest.alav
  };
  
  container.innerHTML = html;
}

// ================== RECOMENDAÇÃO INTELIGENTE DE CRÉDITO ==================
function gerarRecomendacaoCredito(latest, rows, disponivelBase){
  const previo = rows[1] || null;
  
  // Análise da situação da empresa
  const receita = latest.receita || 0;
  const ebitda = latest.ebitda || 0;
  const dividaLiq = latest.dividaLiq || 0;
  const liq = latest.liq || 1;
  const alav = latest.alav || 0;
  const margem = latest.margem || 0;
  const roe = latest.roe || 0;
  const caixa = latest.disponiveis || 0;
  const estoques = latest.estoques || 0;
  const receber = latest.contasReceber || 0;
  const pagar = latest.contasPagar || 0;
  const pl = latest.pl || receita * 0.3;
  const ativoCirc = latest.ativoCirc || 0;
  const passivoCirc = latest.passivoCirc || 0;
  
  // Calcular ciclo financeiro
  const pmr = receber > 0 ? (receber / (receita / 360)) : 30;
  const pme = estoques > 0 ? (estoques / ((receita * 0.7) / 360)) : 45;
  const pmp = pagar > 0 ? (pagar / ((receita * 0.7) / 360)) : 30;
  const cicloFinanceiro = pmr + pme - pmp;
  const ncg = cicloFinanceiro > 0 ? (cicloFinanceiro * (receita / 360)) : 0;
  
  // Crescimento histórico
  let taxaCrescimento = 0;
  if(previo && previo.receita > 0){
    taxaCrescimento = (receita - previo.receita) / previo.receita;
  }
  
  // Variação de margem
  let varMargem = 0;
  if(previo){
    varMargem = (margem - previo.margem) * 100;
  }
  
  // ===== DIAGNÓSTICO COMPLETO =====
  const diagnostico = {
    liquidezBaixa: liq < 1.2,
    liquidezCritica: liq < 1.0,
    alavancagemAlta: alav > 2.5,
    alavancagemCritica: alav > 3.5,
    margemBaixa: margem < 0.10,
    margemCritica: margem < 0.05,
    roeBaixo: roe < 0.10,
    cicloLongo: cicloFinanceiro > 60,
    cicloCritico: cicloFinanceiro > 90,
    pmrAlto: pmr > 45,
    pmeAlto: pme > 60,
    pmpCurto: pmp < 20,
    crescimentoNegativo: taxaCrescimento < 0,
    crescimentoBaixo: taxaCrescimento < 0.05 && taxaCrescimento >= 0,
    crescimentoAlto: taxaCrescimento > 0.15,
    estoqueAlto: estoques > receita * 0.15,
    caixaBaixo: caixa < receita * 0.05,
    margemCaindo: varMargem < -2,
    empresaGrande: receita > 50000000,
    empresaMedia: receita > 10000000 && receita <= 50000000,
    empresaSaudavel: liq >= 1.3 && alav <= 2.0 && margem >= 0.12
  };
  
  // ===== GERAR RECOMENDAÇÕES BASEADAS NO DIAGNÓSTICO =====
  let recomendacoes = [];
  let valorTotal = 0;
  
  // ----- BLOCO 1: LIQUIDEZ -----
  if(diagnostico.liquidezCritica){
    // Emergencial: quitar passivo circulante
    const valorQuitar = Math.min(passivoCirc * 0.3, receita * 0.08);
    recomendacoes.push({
      tipo: 'Quitação de Passivo Circulante',
      valor: valorQuitar,
      finalidade: 'Pagar obrigações vencidas e reduzir pressão de curto prazo',
      motivo: `Liquidez crítica de ${clamp2(liq)}x. Passivo circulante pressionando caixa. Necessário quitar dívidas de curto prazo para estabilizar.`,
      produto: 'CCB Curto Prazo ou Conta Garantida',
      prazo: '6-12 meses',
      garantia: 'Recebíveis + Aval sócios',
      prioridade: 1,
      impacto: `Liquidez deve subir para ~${clamp2(liq * 1.3)}x`,
      icon: '🚨',
      cor: '#dc2626',
      categoria: 'Emergencial'
    });
    valorTotal += valorQuitar;
  }
  
  if(diagnostico.liquidezBaixa && !diagnostico.liquidezCritica){
    const valorCaixa = Math.max(receita * 0.05 - caixa, receita * 0.03);
    recomendacoes.push({
      tipo: 'Reforço de Caixa',
      valor: valorCaixa,
      finalidade: 'Aumentar disponibilidades para folga operacional',
      motivo: `Liquidez de ${clamp2(liq)}x está abaixo do ideal (1.3x). Caixa atual de ${toBRL(caixa)} representa apenas ${Math.round(caixa/receita*100)}% da receita.`,
      produto: 'Capital de Giro Rotativo',
      prazo: '12-24 meses',
      garantia: 'Aval dos sócios',
      prioridade: 1,
      impacto: `Liquidez deve subir para ~${clamp2((ativoCirc + valorCaixa) / passivoCirc)}x`,
      icon: '💵',
      cor: '#3b82f6',
      categoria: 'Capital de Giro'
    });
    valorTotal += valorCaixa;
  }
  
  // ----- BLOCO 2: CICLO FINANCEIRO -----
  if(diagnostico.pmeAlto || diagnostico.estoqueAlto){
    const valorEstoque = Math.min(estoques * 0.4, receita * 0.06);
    recomendacoes.push({
      tipo: 'Financiamento de Estoque',
      valor: valorEstoque,
      finalidade: 'Liberar capital imobilizado em mercadorias',
      motivo: `PME de ${Math.round(pme)} dias indica estoque elevado (${toBRL(estoques)}). Capital parado que poderia gerar retorno.`,
      produto: 'Vendor Finance / Floor Plan',
      prazo: '6-12 meses (renovável)',
      garantia: 'Alienação fiduciária do estoque',
      prioridade: 2,
      impacto: `Libera ${toBRL(valorEstoque)} de caixa imediato`,
      icon: '📦',
      cor: '#8b5cf6',
      categoria: 'Capital de Giro'
    });
    valorTotal += valorEstoque;
  }
  
  if(diagnostico.pmrAlto){
    const valorAntecipacao = receber * 0.5;
    recomendacoes.push({
      tipo: 'Antecipação de Recebíveis',
      valor: valorAntecipacao,
      finalidade: 'Acelerar entrada de caixa e reduzir ciclo financeiro',
      motivo: `PMR de ${Math.round(pmr)} dias é elevado. Antecipar ${toBRL(valorAntecipacao)} em recebíveis reduz ciclo em ~${Math.round(pmr * 0.5)} dias.`,
      produto: 'Desconto de Duplicatas / FIDC',
      prazo: 'Conforme vencimento dos títulos',
      garantia: 'Cessão fiduciária dos recebíveis',
      prioridade: 2,
      impacto: `Ciclo financeiro cai de ${Math.round(cicloFinanceiro)} para ~${Math.round(cicloFinanceiro - pmr*0.5)} dias`,
      icon: '📄',
      cor: '#06b6d4',
      categoria: 'Capital de Giro'
    });
    // Não soma no total - operação rotativa
  }
  
  if(diagnostico.pmpCurto && pagar > 0){
    const aumentoPMP = receita * 0.03;
    recomendacoes.push({
      tipo: 'Renegociação com Fornecedores',
      valor: aumentoPMP,
      finalidade: 'Aumentar prazo de pagamento a fornecedores',
      motivo: `PMP de apenas ${Math.round(pmp)} dias indica pouco prazo com fornecedores. Negociar prazos maiores libera caixa.`,
      produto: 'Confirming / Risco Sacado',
      prazo: '30-60 dias adicionais',
      garantia: 'Cessão de crédito ao fornecedor',
      prioridade: 3,
      impacto: `Aumentar PMP para ${Math.round(pmp + 15)} dias libera ${toBRL(aumentoPMP)}`,
      icon: '🤝',
      cor: '#14b8a6',
      categoria: 'Capital de Giro'
    });
  }
  
  // ----- BLOCO 3: ALAVANCAGEM / DÍVIDA -----
  if(diagnostico.alavancagemAlta){
    const valorRefin = dividaLiq * 0.6;
    const economiaEstimada = valorRefin * 0.04; // 4% economia em juros
    recomendacoes.push({
      tipo: 'Refinanciamento de Dívidas',
      valor: valorRefin,
      finalidade: 'Trocar dívida cara por mais barata e alongar prazo',
      motivo: `DL/EBITDA de ${clamp2(alav)}x está ${alav > 3 ? 'CRÍTICO' : 'elevado'}. Refinanciar pode reduzir custo financeiro em até ${toBRL(economiaEstimada)}/ano.`,
      produto: 'CCB Longo Prazo / Debênture',
      prazo: '48-72 meses',
      garantia: 'Imóveis + Fiança bancária',
      prioridade: diagnostico.alavancagemCritica ? 1 : 2,
      impacto: `Reduz parcela mensal e melhora fluxo de caixa`,
      icon: '🔄',
      cor: '#f59e0b',
      categoria: 'Reestruturação'
    });
    // Não soma - substitui dívida existente
  }
  
  if(diagnostico.alavancagemCritica && pl > 0){
    const aporteIdeal = dividaLiq * 0.2;
    recomendacoes.push({
      tipo: 'Aporte de Capital dos Sócios',
      valor: aporteIdeal,
      finalidade: 'Reforçar patrimônio e reduzir alavancagem',
      motivo: `DL/EBITDA de ${clamp2(alav)}x é insustentável. Sócios precisam aportar capital para reequilibrar estrutura.`,
      produto: 'Aumento de capital social',
      prazo: 'Imediato',
      garantia: 'N/A - recursos próprios',
      prioridade: 1,
      impacto: `DL/EBITDA cairia para ~${clamp2((dividaLiq - aporteIdeal) / ebitda)}x`,
      icon: '💼',
      cor: '#64748b',
      categoria: 'Reestruturação'
    });
  }
  
  // ----- BLOCO 4: MARGEM / EFICIÊNCIA -----
  if(diagnostico.margemBaixa || diagnostico.margemCaindo){
    // Automação
    const valorAutomacao = receita * 0.02;
    recomendacoes.push({
      tipo: 'Automação e Tecnologia',
      valor: valorAutomacao,
      finalidade: 'Reduzir custos operacionais com sistemas e automação',
      motivo: `Margem de ${toPct(margem)} ${diagnostico.margemCaindo ? 'em queda' : 'abaixo do ideal'}. Automação pode reduzir custos em 5-15%.`,
      produto: 'BNDES Inovação / Finep',
      prazo: '36-60 meses',
      garantia: 'Aval sócios',
      prioridade: 3,
      impacto: `Potencial ganho de 2-3 p.p. na margem`,
      icon: '🤖',
      cor: '#6366f1',
      categoria: 'Investimento'
    });
    valorTotal += valorAutomacao;
    
    // Equipamentos mais eficientes
    if(diagnostico.empresaMedia || diagnostico.empresaGrande){
      const valorEquip = receita * 0.03;
      recomendacoes.push({
        tipo: 'Modernização de Equipamentos',
        valor: valorEquip,
        finalidade: 'Substituir máquinas antigas por mais eficientes',
        motivo: `Equipamentos modernos consomem menos energia, têm menor custo de manutenção e maior produtividade.`,
        produto: 'BNDES Finame / Leasing',
        prazo: '48-84 meses',
        garantia: 'Alienação fiduciária do equipamento',
        prioridade: 3,
        impacto: `Redução de 10-20% nos custos de produção`,
        icon: '⚙️',
        cor: '#0ea5e9',
        categoria: 'Investimento'
      });
      valorTotal += valorEquip;
    }
    
    // Consultoria de processos
    const valorConsult = receita * 0.005;
    recomendacoes.push({
      tipo: 'Consultoria de Processos',
      valor: valorConsult,
      finalidade: 'Mapear e otimizar processos para ganho de eficiência',
      motivo: `Diagnóstico profissional pode identificar gargalos e desperdícios que impactam a margem.`,
      produto: 'Capital de giro (recursos próprios)',
      prazo: '3-6 meses',
      garantia: 'N/A',
      prioridade: 4,
      impacto: `Empresas reportam ganhos de 5-10% em eficiência`,
      icon: '📋',
      cor: '#84cc16',
      categoria: 'Investimento'
    });
    valorTotal += valorConsult;
  }
  
  // ----- BLOCO 5: ROE / RENTABILIDADE -----
  if(diagnostico.roeBaixo && !diagnostico.margemBaixa){
    const valorProdutivo = receita * 0.04;
    recomendacoes.push({
      tipo: 'Investimento em Ativos Produtivos',
      valor: valorProdutivo,
      finalidade: 'Aumentar capacidade de geração de lucro',
      motivo: `ROE de ${toPct(roe)} está baixo. Investir em ativos que gerem retorno acima do custo de capital.`,
      produto: 'BNDES / Linha de Investimento',
      prazo: '48-72 meses',
      garantia: 'Alienação dos ativos',
      prioridade: 3,
      impacto: `Potencial aumento de 3-5 p.p. no ROE`,
      icon: '📈',
      cor: '#10b981',
      categoria: 'Investimento'
    });
    valorTotal += valorProdutivo;
  }
  
  // ----- BLOCO 6: CRESCIMENTO -----
  if(diagnostico.crescimentoNegativo){
    // Marketing urgente
    const valorMkt = receita * 0.03;
    recomendacoes.push({
      tipo: 'Marketing e Vendas',
      valor: valorMkt,
      finalidade: 'Reverter queda de receita com ações comerciais',
      motivo: `Receita caiu ${toPct(Math.abs(taxaCrescimento))} no último ano. Investir em marketing para recuperar vendas.`,
      produto: 'Capital de Giro',
      prazo: '12-18 meses',
      garantia: 'Aval sócios',
      prioridade: 2,
      impacto: `Cada R$ 1 em marketing pode gerar R$ 3-5 em vendas`,
      icon: '📣',
      cor: '#ec4899',
      categoria: 'Comercial'
    });
    valorTotal += valorMkt;
    
    // E-commerce se não tiver
    const valorEcomm = receita * 0.015;
    recomendacoes.push({
      tipo: 'Canal Digital / E-commerce',
      valor: valorEcomm,
      finalidade: 'Criar ou fortalecer canal de vendas online',
      motivo: `Diversificar canais de venda reduz dependência e abre novos mercados.`,
      produto: 'Capital de Giro / Finep',
      prazo: '12-24 meses',
      garantia: 'Aval sócios',
      prioridade: 3,
      impacto: `E-commerce pode representar 15-30% das vendas em 2 anos`,
      icon: '🛒',
      cor: '#a855f7',
      categoria: 'Comercial'
    });
    valorTotal += valorEcomm;
  }
  
  if(diagnostico.crescimentoBaixo && diagnostico.empresaSaudavel){
    // Expansão geográfica
    const valorExpGeo = receita * 0.08;
    recomendacoes.push({
      tipo: 'Expansão Geográfica',
      valor: valorExpGeo,
      finalidade: 'Abrir filial ou representação em nova região',
      motivo: `Empresa saudável com crescimento baixo (${toPct(taxaCrescimento)}). Hora de expandir geograficamente.`,
      produto: 'BNDES / Project Finance',
      prazo: '48-72 meses',
      garantia: 'Imóvel + Aval sócios',
      prioridade: 3,
      impacto: `Nova unidade pode adicionar 20-40% de receita em 3 anos`,
      icon: '🗺️',
      cor: '#0891b2',
      categoria: 'Expansão'
    });
    valorTotal += valorExpGeo;
    
    // Nova linha de produtos
    const valorNovaLinha = receita * 0.05;
    recomendacoes.push({
      tipo: 'Nova Linha de Produtos',
      valor: valorNovaLinha,
      finalidade: 'Diversificar portfólio com novos produtos/serviços',
      motivo: `Diversificação reduz risco e abre novas fontes de receita.`,
      produto: 'Capital de Giro / BNDES',
      prazo: '24-48 meses',
      garantia: 'Aval sócios + Estoque',
      prioridade: 3,
      impacto: `Nova linha pode representar 10-25% da receita`,
      icon: '🆕',
      cor: '#f97316',
      categoria: 'Expansão'
    });
    valorTotal += valorNovaLinha;
  }
  
  if(diagnostico.crescimentoAlto && diagnostico.empresaSaudavel){
    // Aquisição de concorrente
    const valorAquisicao = receita * 0.25;
    recomendacoes.push({
      tipo: 'Aquisição de Concorrente',
      valor: valorAquisicao,
      finalidade: 'Comprar concorrente para acelerar crescimento',
      motivo: `Crescimento de ${toPct(taxaCrescimento)} com indicadores saudáveis. Momento ideal para consolidação de mercado.`,
      produto: 'M&A Finance / FIP',
      prazo: '60-120 meses',
      garantia: 'Ações da empresa adquirida + Imóveis',
      prioridade: 4,
      impacto: `Pode dobrar market share rapidamente`,
      icon: '🏢',
      cor: '#7c3aed',
      categoria: 'Expansão'
    });
    valorTotal += valorAquisicao;
    
    // Capacidade produtiva
    const valorCapacidade = receita * 0.10;
    recomendacoes.push({
      tipo: 'Ampliação de Capacidade',
      valor: valorCapacidade,
      finalidade: 'Aumentar capacidade produtiva para atender demanda',
      motivo: `Crescimento acelerado pode estar limitado pela capacidade atual. Investir antes de perder vendas.`,
      produto: 'BNDES Finame / Leasing',
      prazo: '48-84 meses',
      garantia: 'Alienação do bem',
      prioridade: 2,
      impacto: `Aumentar capacidade em 30-50%`,
      icon: '🏭',
      cor: '#059669',
      categoria: 'Investimento'
    });
    valorTotal += valorCapacidade;
  }
  
  // ----- BLOCO 7: INOVAÇÃO / P&D -----
  if(diagnostico.empresaMedia || diagnostico.empresaGrande){
    if(margem > 0.08 && !diagnostico.crescimentoNegativo){
      const valorPD = receita * 0.02;
      recomendacoes.push({
        tipo: 'Pesquisa e Desenvolvimento',
        valor: valorPD,
        finalidade: 'Desenvolver novos produtos e processos inovadores',
        motivo: `Inovação é essencial para manter competitividade no longo prazo.`,
        produto: 'Finep / BNDES Inovação / Lei do Bem',
        prazo: '36-60 meses',
        garantia: 'Aval sócios',
        prioridade: 4,
        impacto: `P&D gera diferenciação e margens maiores`,
        icon: '🔬',
        cor: '#4f46e5',
        categoria: 'Investimento'
      });
      valorTotal += valorPD;
    }
  }
  
  // ----- BLOCO 8: REGULARIZAÇÃO / RISCOS -----
  // Sempre sugerir reserva para contingências se empresa grande
  if(diagnostico.empresaMedia || diagnostico.empresaGrande){
    const valorContingencia = receita * 0.01;
    recomendacoes.push({
      tipo: 'Provisão para Contingências',
      valor: valorContingencia,
      finalidade: 'Reserva para passivos trabalhistas, fiscais ou cíveis',
      motivo: `Empresas deste porte costumam ter contingências. Provisionar evita surpresas no caixa.`,
      produto: 'Aplicação financeira reservada',
      prazo: 'Manter em reserva',
      garantia: 'N/A',
      prioridade: 4,
      impacto: `Proteção contra riscos judiciais`,
      icon: '⚖️',
      cor: '#78716c',
      categoria: 'Proteção'
    });
    valorTotal += valorContingencia;
  }
  
  // Certificações se margem baixa
  if(diagnostico.margemBaixa && receita > 5000000){
    const valorCert = receita * 0.005;
    recomendacoes.push({
      tipo: 'Certificações (ISO/Qualidade)',
      valor: valorCert,
      finalidade: 'Obter certificações que abrem portas comerciais',
      motivo: `Certificações podem ser exigência de grandes clientes e melhoram processos internos.`,
      produto: 'Capital de Giro',
      prazo: '12-18 meses',
      garantia: 'N/A',
      prioridade: 4,
      impacto: `Acesso a novos mercados e clientes`,
      icon: '🏅',
      cor: '#ca8a04',
      categoria: 'Investimento'
    });
    valorTotal += valorCert;
  }
  
  // ESG/Sustentabilidade para empresas grandes
  if(diagnostico.empresaGrande){
    const valorESG = receita * 0.01;
    recomendacoes.push({
      tipo: 'Investimento ESG/Sustentabilidade',
      valor: valorESG,
      finalidade: 'Adequação ambiental, social e governança',
      motivo: `ESG é cada vez mais exigido por investidores e grandes compradores. Também abre acesso a linhas de crédito verdes.`,
      produto: 'Green Bonds / BNDES Clima',
      prazo: '36-60 meses',
      garantia: 'Aval sócios',
      prioridade: 4,
      impacto: `Acesso a taxas menores e novos mercados`,
      icon: '🌱',
      cor: '#16a34a',
      categoria: 'Investimento'
    });
    valorTotal += valorESG;
  }
  
  // ----- BLOCO 9: EMPRESA SAUDÁVEL - OPORTUNIDADES -----
  if(diagnostico.empresaSaudavel && recomendacoes.length < 3){
    // Linha preventiva
    const valorPreventivo = receita * 0.05;
    recomendacoes.push({
      tipo: 'Linha de Crédito Preventiva',
      valor: valorPreventivo,
      finalidade: 'Manter linha aprovada para oportunidades e emergências',
      motivo: `Empresa com indicadores saudáveis. Ter linha aprovada permite agir rápido em oportunidades.`,
      produto: 'Limite Rotativo / Conta Garantida',
      prazo: '12 meses (renovável)',
      garantia: 'Aval dos sócios',
      prioridade: 3,
      impacto: `Flexibilidade para aproveitar oportunidades`,
      icon: '🛡️',
      cor: '#64748b',
      categoria: 'Proteção'
    });
    valorTotal += valorPreventivo;
    
    // Reserva de caixa estratégica
    const valorReserva = receita * 0.03;
    recomendacoes.push({
      tipo: 'Reserva Estratégica de Caixa',
      valor: valorReserva,
      finalidade: 'Aumentar colchão de liquidez para 3 meses de operação',
      motivo: `Empresa saudável deve manter reserva equivalente a 3 meses de custos fixos.`,
      produto: 'Capital de Giro',
      prazo: '24-36 meses',
      garantia: 'Aval sócios',
      prioridade: 4,
      impacto: `Segurança para enfrentar imprevistos`,
      icon: '💰',
      cor: '#0284c7',
      categoria: 'Proteção'
    });
    valorTotal += valorReserva;
  }
  
  // Ordenar por prioridade
  recomendacoes.sort((a, b) => a.prioridade - b.prioridade);
  
  // Calcular limite seguro do banco
  const limiteSeguro = Math.min(disponivelBase * 2.5, ebitda * 3, pl * 0.8);
  const limiteBanco = Math.max(0, limiteSeguro);
  
  // ===== ALOCAÇÃO INTELIGENTE POR PRIORIDADE =====
  // Em vez de dividir proporcionalmente, aloca primeiro nas prioridades mais altas
  let saldoDisponivel = limiteBanco;
  
  recomendacoes.forEach(r => {
    r.valorNecessario = r.valor; // Necessidade total identificada
    
    if(saldoDisponivel > 0){
      // Aloca o que couber nessa operação
      r.valorBanco = Math.min(r.valor, saldoDisponivel);
      saldoDisponivel -= r.valorBanco;
      
      // Calcular % do necessário que foi atendido
      r.pctAtendido = r.valor > 0 ? (r.valorBanco / r.valor * 100) : 0;
    } else {
      r.valorBanco = 0;
      r.pctAtendido = 0;
    }
    
    // Gap não atendido
    r.valorGap = r.valor - r.valorBanco;
  });
  
  // Agrupar por categoria
  const categorias = {};
  recomendacoes.forEach(r => {
    if(!categorias[r.categoria]) categorias[r.categoria] = [];
    categorias[r.categoria].push(r);
  });
  
  // Calcular totais
  const totalNecessario = recomendacoes.reduce((s, r) => s + r.valorNecessario, 0);
  const totalBanco = recomendacoes.reduce((s, r) => s + r.valorBanco, 0);
  const totalGap = totalNecessario - totalBanco;
  const pctAtendidoGeral = totalNecessario > 0 ? (totalBanco / totalNecessario * 100) : 0;
  
  // Operações que receberam algo do banco
  const operacoesBanco = recomendacoes.filter(r => r.valorBanco > 0);
  const operacoesNaoAtendidas = recomendacoes.filter(r => r.valorBanco === 0);
  
  // ===== GERAR HTML =====
  let html = `
    <!-- Diagnóstico Visual -->
    <div style="background:rgba(0,0,0,0.2); border-radius:12px; padding:16px; margin-bottom:20px">
      <div style="font-size:13px; font-weight:600; margin-bottom:12px">🔍 Diagnóstico Identificado</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px">
        ${diagnostico.liquidezCritica ? '<span style="padding:4px 10px; background:#dc2626; border-radius:20px; font-size:11px">🚨 Liquidez Crítica</span>' : ''}
        ${diagnostico.liquidezBaixa && !diagnostico.liquidezCritica ? '<span style="padding:4px 10px; background:#f59e0b; border-radius:20px; font-size:11px">⚠️ Liquidez Baixa</span>' : ''}
        ${diagnostico.alavancagemCritica ? '<span style="padding:4px 10px; background:#dc2626; border-radius:20px; font-size:11px">🚨 Alavancagem Crítica</span>' : ''}
        ${diagnostico.alavancagemAlta && !diagnostico.alavancagemCritica ? '<span style="padding:4px 10px; background:#f59e0b; border-radius:20px; font-size:11px">⚠️ Alavancagem Alta</span>' : ''}
        ${diagnostico.margemBaixa ? '<span style="padding:4px 10px; background:#f59e0b; border-radius:20px; font-size:11px">⚠️ Margem Baixa</span>' : ''}
        ${diagnostico.margemCaindo ? '<span style="padding:4px 10px; background:#f59e0b; border-radius:20px; font-size:11px">📉 Margem Caindo</span>' : ''}
        ${diagnostico.cicloLongo ? '<span style="padding:4px 10px; background:#f59e0b; border-radius:20px; font-size:11px">⏱️ Ciclo Longo</span>' : ''}
        ${diagnostico.crescimentoNegativo ? '<span style="padding:4px 10px; background:#dc2626; border-radius:20px; font-size:11px">📉 Receita Caindo</span>' : ''}
        ${diagnostico.crescimentoBaixo ? '<span style="padding:4px 10px; background:#f59e0b; border-radius:20px; font-size:11px">🐢 Crescimento Baixo</span>' : ''}
        ${diagnostico.crescimentoAlto ? '<span style="padding:4px 10px; background:#10b981; border-radius:20px; font-size:11px">🚀 Alto Crescimento</span>' : ''}
        ${diagnostico.empresaSaudavel ? '<span style="padding:4px 10px; background:#10b981; border-radius:20px; font-size:11px">✅ Empresa Saudável</span>' : ''}
        ${diagnostico.roeBaixo ? '<span style="padding:4px 10px; background:#f59e0b; border-radius:20px; font-size:11px">📊 ROE Baixo</span>' : ''}
      </div>
    </div>
    
    <!-- ========== VISÃO 1: NECESSIDADE TOTAL DA EMPRESA ========== -->
    <div style="background:linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); border-radius:12px; padding:20px; margin-bottom:20px">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
        <span style="font-size:24px">🏢</span>
        <div>
          <div style="font-size:16px; font-weight:700">NECESSIDADE TOTAL DA EMPRESA</div>
          <div style="font-size:11px; opacity:0.8">Para resolver TODOS os problemas identificados</div>
        </div>
      </div>
      
      <div style="text-align:center; padding:20px; background:rgba(255,255,255,0.15); border-radius:10px; margin-bottom:16px">
        <div style="font-size:12px; opacity:0.8">💰 Investimento Total Necessário</div>
        <div style="font-size:32px; font-weight:800; margin-top:8px">${toBRL(totalNecessario)}</div>
        <div style="font-size:11px; opacity:0.7; margin-top:4px">${recomendacoes.length} áreas de atuação identificadas</div>
      </div>
      
      <!-- Breakdown por categoria -->
      <div style="font-size:12px; font-weight:600; margin-bottom:10px; opacity:0.9">📊 Distribuição por Categoria:</div>
      <div style="display:grid; gap:6px; margin-bottom:16px">
        ${Object.entries(categorias).map(([cat, items]) => {
          const totalCat = items.reduce((s, i) => s + i.valorNecessario, 0);
          const pctCat = totalNecessario > 0 ? (totalCat / totalNecessario * 100) : 0;
          const corCat = items[0].cor;
          return `
            <div style="display:flex; align-items:center; gap:10px">
              <div style="width:100px; font-size:11px; font-weight:600">${cat}</div>
              <div style="flex:1; height:20px; background:rgba(0,0,0,0.3); border-radius:4px; overflow:hidden">
                <div style="height:100%; width:${Math.min(pctCat, 100)}%; background:${corCat}; display:flex; align-items:center; padding-left:8px">
                  <span style="font-size:10px; font-weight:600">${toBRL(totalCat)}</span>
                </div>
              </div>
              <div style="width:40px; text-align:right; font-size:10px; opacity:0.8">${pctCat.toFixed(0)}%</div>
            </div>
          `;
        }).join('')}
      </div>
      
      <!-- Lista resumida de todas as necessidades -->
      <div style="font-size:11px; opacity:0.9; padding:12px; background:rgba(0,0,0,0.2); border-radius:8px">
        <div style="font-weight:600; margin-bottom:8px">📋 Detalhamento das Necessidades:</div>
        <div style="display:grid; gap:4px">
          ${recomendacoes.map(r => `
            <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.1)">
              <span>${r.icon} ${r.tipo}</span>
              <span style="font-weight:600">${toBRL(r.valorNecessario)}</span>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div style="margin-top:12px; padding:10px; background:rgba(255,255,255,0.1); border-radius:6px; font-size:11px">
        💡 <strong>Fontes possíveis:</strong> Crédito bancário, Aporte dos sócios, Investidores, Venda de ativos, 
        Renegociação com fornecedores, Incentivos fiscais, Linhas de fomento (BNDES, Finep)
      </div>
    </div>
    
    <!-- ========== VISÃO 2: RECOMENDAÇÃO DO BANCO ========== -->
    <div style="background:linear-gradient(135deg, #059669 0%, #047857 100%); border-radius:12px; padding:20px; margin-bottom:20px">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
        <span style="font-size:24px">🏦</span>
        <div>
          <div style="font-size:16px; font-weight:700">RECOMENDAÇÃO DO BANCO</div>
          <div style="font-size:11px; opacity:0.8">Limite aprovável e alocação prioritária</div>
        </div>
      </div>
      
      <!-- Cards de resumo -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; margin-bottom:16px">
        <div style="text-align:center; padding:14px; background:rgba(255,255,255,0.15); border-radius:10px">
          <div style="font-size:11px; opacity:0.8">💰 Limite Aprovável</div>
          <div style="font-size:22px; font-weight:800; margin-top:6px">${toBRL(limiteBanco)}</div>
        </div>
        <div style="text-align:center; padding:14px; background:rgba(255,255,255,0.15); border-radius:10px">
          <div style="font-size:11px; opacity:0.8">📊 % da Necessidade</div>
          <div style="font-size:22px; font-weight:800; margin-top:6px">${pctAtendidoGeral.toFixed(1)}%</div>
        </div>
        <div style="text-align:center; padding:14px; background:rgba(255,255,255,0.15); border-radius:10px">
          <div style="font-size:11px; opacity:0.8">✅ Operações Atendidas</div>
          <div style="font-size:22px; font-weight:800; margin-top:6px">${operacoesBanco.length}/${recomendacoes.length}</div>
        </div>
        <div style="text-align:center; padding:14px; background:rgba(255,255,255,0.15); border-radius:10px">
          <div style="font-size:11px; opacity:0.8">🔴 Gap Restante</div>
          <div style="font-size:22px; font-weight:800; margin-top:6px">${toBRL(totalGap)}</div>
        </div>
      </div>
      
      <!-- Barra visual de cobertura -->
      <div style="margin-bottom:16px">
        <div style="font-size:11px; margin-bottom:6px; opacity:0.8">Cobertura do Banco vs Necessidade Total:</div>
        <div style="height:24px; background:rgba(0,0,0,0.3); border-radius:6px; overflow:hidden; position:relative">
          <div style="height:100%; width:${Math.min(pctAtendidoGeral, 100)}%; background:linear-gradient(90deg, #10b981, #34d399); display:flex; align-items:center; justify-content:center">
            <span style="font-size:11px; font-weight:700">${toBRL(totalBanco)} (${pctAtendidoGeral.toFixed(1)}%)</span>
          </div>
          <div style="position:absolute; right:8px; top:50%; transform:translateY(-50%); font-size:10px; opacity:0.7">
            Gap: ${toBRL(totalGap)}
          </div>
        </div>
      </div>
      
      <!-- Alocação Prioritária -->
      <div style="font-size:13px; font-weight:600; margin-bottom:12px">⚡ Alocação por Prioridade (Máximo Impacto):</div>
      
      ${operacoesBanco.length > 0 ? `
        <div style="display:grid; gap:10px; margin-bottom:16px">
          ${operacoesBanco.map((r, idx) => `
            <div style="background:rgba(255,255,255,0.1); border-radius:8px; padding:14px; border-left:4px solid ${r.cor}">
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px">
                <div style="width:36px; height:36px; background:${r.cor}; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:18px">
                  ${r.icon}
                </div>
                <div style="flex:1">
                  <div style="display:flex; align-items:center; gap:6px">
                    <span style="font-size:13px; font-weight:700">${r.tipo}</span>
                    <span style="font-size:9px; padding:2px 6px; background:rgba(255,255,255,0.2); border-radius:4px">P${r.prioridade}</span>
                    ${r.pctAtendido >= 100 ? '<span style="font-size:9px; padding:2px 6px; background:#10b981; border-radius:4px">✓ 100%</span>' : `<span style="font-size:9px; padding:2px 6px; background:#f59e0b; border-radius:4px">${r.pctAtendido.toFixed(0)}%</span>`}
                  </div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:18px; font-weight:800; color:#fef08a">${toBRL(r.valorBanco)}</div>
                  ${r.valorGap > 0 ? `<div style="font-size:9px; opacity:0.7">de ${toBRL(r.valorNecessario)}</div>` : ''}
                </div>
              </div>
              
              <div style="font-size:11px; opacity:0.9; margin-bottom:8px; padding:8px; background:rgba(0,0,0,0.2); border-radius:6px">
                📌 ${r.finalidade}
              </div>
              
              <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; font-size:10px">
                <div style="padding:6px; background:rgba(255,255,255,0.1); border-radius:4px; text-align:center">
                  <div style="opacity:0.7">Produto</div>
                  <div style="font-weight:600">${r.produto.split('/')[0].trim()}</div>
                </div>
                <div style="padding:6px; background:rgba(255,255,255,0.1); border-radius:4px; text-align:center">
                  <div style="opacity:0.7">Prazo</div>
                  <div style="font-weight:600">${r.prazo}</div>
                </div>
                <div style="padding:6px; background:rgba(255,255,255,0.1); border-radius:4px; text-align:center">
                  <div style="opacity:0.7">Garantia</div>
                  <div style="font-weight:600">${r.garantia.split('+')[0].trim()}</div>
                </div>
              </div>
              
              ${r.impacto ? `
                <div style="margin-top:8px; padding:6px 10px; background:rgba(16,185,129,0.2); border-radius:4px; font-size:10px">
                  📈 <strong>Impacto:</strong> ${r.impacto}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="padding:20px; background:rgba(0,0,0,0.2); border-radius:8px; text-align:center; font-size:12px; opacity:0.8">
          ⚠️ Limite aprovável não cobre nenhuma operação completa
        </div>
      `}
      
      ${operacoesNaoAtendidas.length > 0 ? `
        <!-- Operações não atendidas pelo banco -->
        <div style="background:rgba(0,0,0,0.2); border-radius:8px; padding:12px; margin-bottom:16px">
          <div style="font-size:11px; font-weight:600; margin-bottom:8px; color:#fca5a5">
            ❌ Não cobertas pelo limite do banco (${operacoesNaoAtendidas.length} operações):
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px">
            ${operacoesNaoAtendidas.map(r => `
              <span style="font-size:10px; padding:4px 8px; background:rgba(220,38,38,0.3); border-radius:4px">
                ${r.icon} ${r.tipo}: ${toBRL(r.valorNecessario)}
              </span>
            `).join('')}
          </div>
          <div style="font-size:10px; opacity:0.7; margin-top:8px">
            💡 Buscar essas necessidades em: aporte de sócios, investidores, outras instituições, linhas de fomento
          </div>
        </div>
      ` : ''}
      
      <!-- Alerta importante -->
      ${pctAtendidoGeral < 50 ? `
        <div style="padding:12px; background:rgba(251,191,36,0.2); border:1px solid rgba(251,191,36,0.5); border-radius:8px; margin-bottom:16px">
          <div style="font-size:12px; font-weight:600; color:#fef08a; margin-bottom:4px">⚠️ Atenção: Cobertura Parcial</div>
          <div style="font-size:11px; opacity:0.9">
            O crédito bancário cobre apenas ${pctAtendidoGeral.toFixed(1)}% da necessidade total.
            A empresa deve buscar os ${toBRL(totalGap)} restantes em outras fontes para solução completa.
            ${operacoesBanco.length > 0 ? `Com este valor, priorizamos ${operacoesBanco[0].tipo} para máximo impacto imediato.` : ''}
          </div>
        </div>
      ` : ''}
    </div>
    
    <!-- ========== RESUMO EXECUTIVO ========== -->
    <div style="background:rgba(255,255,255,0.15); border-radius:10px; padding:16px">
      <div style="font-size:13px; font-weight:600; margin-bottom:12px">📝 Resumo Executivo para Proposta</div>
      <div style="font-size:12px; line-height:1.7; opacity:0.9">
        <p><strong>DIAGNÓSTICO:</strong> Identificamos ${recomendacoes.length} áreas de atuação que demandam 
        investimento total de <strong>${toBRL(totalNecessario)}</strong>.</p>
        
        <p><strong>CAPACIDADE DO BANCO:</strong> Podemos aprovar até <strong>${toBRL(limiteBanco)}</strong>, 
        o que cobre ${pctAtendidoGeral.toFixed(1)}% da necessidade total.</p>
        
        <p><strong>ALOCAÇÃO RECOMENDADA:</strong></p>
        <ul style="margin:8px 0; padding-left:20px">
          ${operacoesBanco.map(r => `
            <li><strong>${r.tipo}:</strong> ${toBRL(r.valorBanco)} ${r.pctAtendido < 100 ? `(${r.pctAtendido.toFixed(0)}% da necessidade)` : '(100%)'}</li>
          `).join('')}
        </ul>
        
        ${operacoesNaoAtendidas.length > 0 ? `
          <p><strong>FORA DO ESCOPO BANCÁRIO:</strong> ${operacoesNaoAtendidas.map(r => r.tipo).join(', ')} 
          (total de ${toBRL(totalGap)}) - sugerir busca em outras fontes.</p>
        ` : ''}
        
        <p><strong>INDICADORES:</strong> DL/EBITDA ${clamp2(alav)}x | Liquidez ${clamp2(liq)}x | 
        Margem ${toPct(margem)} | Capacidade ${toBRL(disponivelBase)}/ano</p>
      </div>
      
      <button onclick="copiarRecomendacao()" style="margin-top:12px; padding:10px 20px; background:#fff; color:#059669; border:none; border-radius:6px; font-weight:600; cursor:pointer; font-size:12px">
        📋 Copiar Resumo Completo
      </button>
    </div>
  `;
  
  // Armazenar para copiar
  window.RECOMENDACAO_TEXTO = `RECOMENDAÇÃO DE CRÉDITO - ANÁLISE COMPLETA
${'='.repeat(60)}

PARTE 1: NECESSIDADE TOTAL DA EMPRESA
${'─'.repeat(60)}
Investimento Total Necessário: ${toBRL(totalNecessario)}

Por Categoria:
${Object.entries(categorias).map(([cat, items]) => {
  const totalCat = items.reduce((s, i) => s + i.valorNecessario, 0);
  return `• ${cat}: ${toBRL(totalCat)}`;
}).join('\n')}

Detalhamento:
${recomendacoes.map((r, i) => `${i+1}. ${r.tipo}: ${toBRL(r.valorNecessario)}`).join('\n')}


PARTE 2: RECOMENDAÇÃO DO BANCO
${'─'.repeat(60)}
Limite Aprovável: ${toBRL(limiteBanco)}
Cobertura: ${pctAtendidoGeral.toFixed(1)}% da necessidade total
Gap Restante: ${toBRL(totalGap)}

ALOCAÇÃO POR PRIORIDADE:
${operacoesBanco.map((r, i) => `
${i+1}. ${r.tipo.toUpperCase()} [Prioridade ${r.prioridade}]
   Valor Banco: ${toBRL(r.valorBanco)} (${r.pctAtendido.toFixed(0)}% da necessidade)
   Necessidade Total: ${toBRL(r.valorNecessario)}
   Finalidade: ${r.finalidade}
   Produto: ${r.produto}
   Prazo: ${r.prazo}
   Garantia: ${r.garantia}
   Impacto: ${r.impacto}
`).join('')}

${operacoesNaoAtendidas.length > 0 ? `
NÃO COBERTAS PELO BANCO:
${operacoesNaoAtendidas.map(r => `• ${r.tipo}: ${toBRL(r.valorNecessario)}`).join('\n')}
Sugestão: Buscar em aporte de sócios, investidores, linhas de fomento
` : ''}

INDICADORES ATUAIS:
• DL/EBITDA: ${clamp2(alav)}x
• Liquidez: ${clamp2(liq)}x
• Margem EBITDA: ${toPct(margem)}
• ROE: ${toPct(roe)}
• Capacidade de Pagamento: ${toBRL(disponivelBase)}/ano
`;
  
  return html;
}

// Função para copiar recomendação
function copiarRecomendacao(){
  if(window.RECOMENDACAO_TEXTO){
    navigator.clipboard.writeText(window.RECOMENDACAO_TEXTO)
      .then(() => alert('Recomendação copiada!'))
      .catch(() => alert('Erro ao copiar'));
  }
}
window.copiarRecomendacao = copiarRecomendacao;

// ================== SIMULADOR DE OPERAÇÕES ==================
function simularOperacao(){
  const data = window.SIMULADOR_DATA;
  if(!data) return alert('Dados não disponíveis');
  
  // Pegar valores do formulário
  const valorStr = document.getElementById('simValor')?.value || '0';
  const valor = parseFloat(valorStr.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  const prazo = parseInt(document.getElementById('simPrazo')?.value) || 36;
  const taxa = parseFloat(document.getElementById('simTaxa')?.value) || 1.5;
  
  if(valor <= 0){
    return alert('Informe um valor válido para a operação');
  }
  
  // Calcular parcela (Price)
  const taxaMensal = taxa / 100;
  const parcela = valor * (taxaMensal * Math.pow(1 + taxaMensal, prazo)) / (Math.pow(1 + taxaMensal, prazo) - 1);
  const parcelaAnual = parcela * 12;
  
  // Calcular impactos
  const novaDividaLiq = data.dividaLiq + valor;
  const novoAlav = data.ebitda > 0 ? novaDividaLiq / data.ebitda : 99;
  const novaLiq = data.liq * (1 + valor / (data.ativoTotal * 0.3 || 1)); // Melhora liquidez
  const novaCobertura = data.ebitda / (data.servicoDividaAtual + parcelaAnual);
  const novoEndividamento = (data.pl > 0) ? novaDividaLiq / data.pl * 100 : 0;
  
  // Determinar status de cada indicador
  const getStatus = (valor, limiteOk, limiteAtencao, inverter = false) => {
    if(inverter){
      if(valor >= limiteOk) return { cor: '#4ade80', icon: '✓', texto: 'OK' };
      if(valor >= limiteAtencao) return { cor: '#fbbf24', icon: '⚠', texto: 'Atenção' };
      return { cor: '#f87171', icon: '⛔', texto: 'Crítico' };
    }
    if(valor <= limiteOk) return { cor: '#4ade80', icon: '✓', texto: 'OK' };
    if(valor <= limiteAtencao) return { cor: '#fbbf24', icon: '⚠', texto: 'Atenção' };
    return { cor: '#f87171', icon: '⛔', texto: 'Crítico' };
  };
  
  const statusAlav = getStatus(novoAlav, 2.5, 3.5);
  const statusLiq = getStatus(novaLiq, 1.2, 1.0, true);
  const statusCobertura = getStatus(novaCobertura, 2.0, 1.5, true);
  const statusEndiv = getStatus(novoEndividamento, 60, 80);
  
  // Veredicto geral
  let veredicto = 'APROVÁVEL';
  let verdictoCor = '#4ade80';
  let veredictIcon = '✓';
  
  if(statusAlav.texto === 'Crítico' || statusCobertura.texto === 'Crítico'){
    veredicto = 'NÃO RECOMENDADO';
    verdictoCor = '#f87171';
    veredictIcon = '⛔';
  } else if(statusAlav.texto === 'Atenção' || statusCobertura.texto === 'Atenção'){
    veredicto = 'APROVÁVEL COM RESSALVAS';
    verdictoCor = '#fbbf24';
    veredictIcon = '⚠';
  }
  
  const resultado = document.getElementById('simResultado');
  resultado.style.display = 'block';
  resultado.innerHTML = `
    <div style="background:rgba(255,255,255,0.1); border-radius:10px; padding:16px; margin-bottom:16px">
      <div style="font-size:13px; opacity:0.7; margin-bottom:8px">Resumo da Operação</div>
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; text-align:center">
        <div>
          <div style="font-size:11px; opacity:0.6">Valor</div>
          <div style="font-size:18px; font-weight:700">${toBRL(valor)}</div>
        </div>
        <div>
          <div style="font-size:11px; opacity:0.6">Parcela Mensal</div>
          <div style="font-size:18px; font-weight:700">${toBRL(parcela)}</div>
        </div>
        <div>
          <div style="font-size:11px; opacity:0.6">Custo Total</div>
          <div style="font-size:18px; font-weight:700">${toBRL(parcela * prazo)}</div>
        </div>
      </div>
    </div>
    
    <div style="background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden">
      <table style="width:100%; font-size:13px; border-collapse:collapse">
        <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
          <td style="padding:12px">Indicador</td>
          <td style="padding:12px; text-align:center">Atual</td>
          <td style="padding:12px; text-align:center">Pós-Operação</td>
          <td style="padding:12px; text-align:center">Status</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
          <td style="padding:12px">DL/EBITDA</td>
          <td style="padding:12px; text-align:center">${clamp2(data.alav)}x</td>
          <td style="padding:12px; text-align:center; font-weight:700">${clamp2(novoAlav)}x</td>
          <td style="padding:12px; text-align:center; color:${statusAlav.cor}">${statusAlav.icon} ${statusAlav.texto}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
          <td style="padding:12px">Liquidez</td>
          <td style="padding:12px; text-align:center">${clamp2(data.liq)}</td>
          <td style="padding:12px; text-align:center; font-weight:700">${clamp2(novaLiq)}</td>
          <td style="padding:12px; text-align:center; color:${statusLiq.cor}">${statusLiq.icon} ${statusLiq.texto}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
          <td style="padding:12px">Cobertura do Serviço da Dívida</td>
          <td style="padding:12px; text-align:center">—</td>
          <td style="padding:12px; text-align:center; font-weight:700">${clamp2(novaCobertura)}x</td>
          <td style="padding:12px; text-align:center; color:${statusCobertura.cor}">${statusCobertura.icon} ${statusCobertura.texto}</td>
        </tr>
        <tr>
          <td style="padding:12px">Endividamento (DL/PL)</td>
          <td style="padding:12px; text-align:center">${clamp2(data.dividaLiq / (data.pl || 1) * 100)}%</td>
          <td style="padding:12px; text-align:center; font-weight:700">${clamp2(novoEndividamento)}%</td>
          <td style="padding:12px; text-align:center; color:${statusEndiv.cor}">${statusEndiv.icon} ${statusEndiv.texto}</td>
        </tr>
      </table>
    </div>
    
    <div style="margin-top:16px; padding:16px; background:${verdictoCor}20; border:1px solid ${verdictoCor}; border-radius:10px; text-align:center">
      <div style="font-size:24px; font-weight:800; color:${verdictoCor}">${veredictIcon} ${veredicto}</div>
      <div style="font-size:13px; margin-top:8px; opacity:0.9">
        ${veredicto === 'APROVÁVEL' ? 'A operação está dentro dos parâmetros de risco aceitáveis.' :
          veredicto === 'APROVÁVEL COM RESSALVAS' ? 'Operação possível, mas recomenda-se garantias adicionais ou covenants.' :
          'Operação comprometeria a capacidade de pagamento. Não recomendada.'}
      </div>
    </div>
    
    ${veredicto !== 'APROVÁVEL' ? `
      <div style="margin-top:12px; padding:12px; background:rgba(255,255,255,0.1); border-radius:8px; font-size:12px">
        <strong>💡 Sugestão:</strong> 
        ${novoAlav > 3 ? `Reduzir valor para ${toBRL(data.ebitda * 2.5 - data.dividaLiq)} para manter DL/EBITDA ≤ 2.5x. ` : ''}
        ${novaCobertura < 1.5 ? `Aumentar prazo para ${Math.ceil(parcelaAnual / (data.ebitda * 0.5))} meses para melhorar cobertura. ` : ''}
      </div>
    ` : ''}
  `;
}
window.simularOperacao = simularOperacao;

// ================== ABA 5: ROTEIRO DE VISITA ==================
function renderRoteiroVisita(data){
  if(!data || !data.rows || !data.rows.length) return;
  
  const rows = data.rows;
  const latest = rows[0];
  const previo = rows[1] || null;
  const empresaNome = data.empresaNome;
  const container = document.getElementById("roteiroVisitaContent");
  const score = calcularScore(latest);
  
  // Gerar perguntas baseadas nos dados
  const perguntasInvestigar = [];
  const checklistVisual = [];
  const documentosSolicitar = [];
  
  // Análise de variações para perguntas
  if(previo){
    const varReceita = ((latest.receita - previo.receita) / previo.receita * 100);
    const varMargem = (latest.margem - previo.margem) * 100;
    
    if(Math.abs(varReceita) > 15){
      perguntasInvestigar.push({
        categoria: 'Receita',
        contexto: `Variou ${varReceita > 0 ? '+' : ''}${clamp2(varReceita)}% vs ano anterior`,
        perguntas: varReceita > 0 ? [
          'Quais foram os principais motores do crescimento?',
          'Novos clientes ou aumento de volume dos existentes?',
          'Este crescimento é sustentável?',
          'Houve aumento de capacidade produtiva?'
        ] : [
          'O que causou a queda nas vendas?',
          'Perdeu algum cliente importante?',
          'Qual a perspectiva de recuperação?',
          'O mercado como um todo está em queda?'
        ]
      });
    }
    
    if(Math.abs(varMargem) > 3){
      perguntasInvestigar.push({
        categoria: 'Margem',
        contexto: `Variou ${varMargem > 0 ? '+' : ''}${clamp2(varMargem)} p.p. vs ano anterior`,
        perguntas: varMargem > 0 ? [
          'O que explica a melhoria da margem?',
          'Houve eventos não-recorrentes?',
          'Renegociou com fornecedores?',
          'Este ganho é estrutural ou pontual?'
        ] : [
          'Custos subiram ou preços caíram?',
          'Houve ociosidade operacional?',
          'Qual o plano para recuperar margem?',
          'Concorrência está mais agressiva?'
        ]
      });
    }
  }
  
  // Perguntas sobre alavancagem
  if(latest.alav > 2){
    perguntasInvestigar.push({
      categoria: 'Endividamento',
      contexto: `DL/EBITDA de ${clamp2(latest.alav)}x`,
      perguntas: [
        'Qual foi a finalidade das dívidas contraídas?',
        'Qual o cronograma de amortização?',
        'Há plano de desalavancagem?',
        'Qual a taxa média do endividamento?'
      ]
    });
  }
  
  // Perguntas sobre liquidez
  if(latest.liq < 1.2){
    perguntasInvestigar.push({
      categoria: 'Liquidez',
      contexto: `Liquidez corrente de ${clamp2(latest.liq)}`,
      perguntas: [
        'Como está o fluxo de caixa atual?',
        'Há recebíveis vencidos relevantes?',
        'Qual o prazo médio de recebimento?',
        'Tem acesso a linhas de crédito emergencial?'
      ]
    });
  }
  
  // Perguntas sobre concentração (se tiver contexto)
  perguntasInvestigar.push({
    categoria: 'Clientes e Mercado',
    contexto: 'Análise de risco comercial',
    perguntas: [
      'Quem são os 3 maiores clientes e % do faturamento?',
      'Há contratos formais com principais clientes?',
      'Qual o tempo de relacionamento com eles?',
      'Há risco de perda de algum cliente relevante?',
      'Como está a carteira de pedidos/contratos?'
    ]
  });
  
  // Perguntas sobre fornecedores
  perguntasInvestigar.push({
    categoria: 'Fornecedores',
    contexto: 'Análise de risco operacional',
    perguntas: [
      'Quem são os principais fornecedores?',
      'Há dependência de fornecedor único para algum insumo?',
      'Os prazos de pagamento estão sendo cumpridos?',
      'Houve mudança nos termos comerciais recentemente?'
    ]
  });
  
  // Checklist visual
  checklistVisual.push(
    { item: 'Estado geral das instalações (conservação, limpeza, organização)', icon: '🏭' },
    { item: 'Movimentação de pessoas (funcionários trabalhando, clientes)', icon: '👥' },
    { item: 'Equipamentos em operação (máquinas ligadas, produção ativa)', icon: '⚙️' },
    { item: 'Estoque físico (volume, organização, produtos parados)', icon: '📦' },
    { item: 'Frota de veículos (estado, quantidade, utilização)', icon: '🚚' },
    { item: 'Clima organizacional (ambiente de trabalho, equipe motivada)', icon: '😊' },
    { item: 'Placas, letreiros e identidade visual (manutenção da marca)', icon: '🏪' },
    { item: 'Segurança (câmeras, portaria, controle de acesso)', icon: '🔒' }
  );
  
  // Documentos a solicitar
  documentosSolicitar.push(
    { doc: 'Balancete atualizado (último trimestre)', prioridade: 'alta' },
    { doc: 'Faturamento mensal dos últimos 6 meses', prioridade: 'alta' },
    { doc: 'Posição de endividamento bancário atualizada', prioridade: 'alta' },
    { doc: 'Relação de clientes com % do faturamento', prioridade: 'media' },
    { doc: 'Contratos vigentes com principais clientes', prioridade: 'media' },
    { doc: 'Aging de contas a receber', prioridade: 'media' },
    { doc: 'Certidões negativas (FGTS, INSS, Federal, Estadual, Municipal)', prioridade: 'alta' },
    { doc: 'Declaração de faturamento assinada', prioridade: 'baixa' }
  );
  
  // Se tiver indicadores problemáticos, adicionar documentos específicos
  if(latest.alav > 2.5){
    documentosSolicitar.unshift({ doc: 'Cronograma de amortização de dívidas', prioridade: 'alta' });
  }
  if(latest.liq < 1){
    documentosSolicitar.unshift({ doc: 'Fluxo de caixa projetado próximos 6 meses', prioridade: 'alta' });
  }
  
  let html = `
    <div style="background:linear-gradient(135deg, #059669, #10b981); color:#fff; border-radius:12px; padding:20px; margin-bottom:20px">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px">
        <div>
          <div style="font-size:18px; font-weight:700">📋 Roteiro de Visita</div>
          <div style="font-size:14px; opacity:0.9; margin-top:4px">${empresaNome}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px; opacity:0.8">Score Atual</div>
          <div style="font-size:24px; font-weight:800">${score}</div>
        </div>
      </div>
      <div style="margin-top:16px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.2); font-size:13px; opacity:0.9">
        <strong>💡 Objetivo:</strong> Validar os números, entender o contexto e identificar riscos não aparentes nos demonstrativos.
      </div>
    </div>
    
    <!-- PERGUNTAS PARA INVESTIGAR -->
    <div class="diag-card" style="border-left:4px solid #3b82f6">
      <div class="diag-title" style="color:#1e40af">
        <span style="font-size:24px">🔍</span>
        Perguntas para Investigar
      </div>
      <p style="font-size:12px; color:#6b7280; margin-bottom:16px">
        Baseadas na análise dos demonstrativos. Marque as que foram respondidas.
      </p>
      
      ${perguntasInvestigar.map((grupo, idx) => `
        <div style="background:#f8fafc; border-radius:8px; padding:16px; margin-bottom:12px">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
            <div style="font-weight:700; color:#1e40af">${grupo.categoria}</div>
            <div style="font-size:11px; background:#dbeafe; color:#1e40af; padding:4px 8px; border-radius:4px">
              ${grupo.contexto}
            </div>
          </div>
          ${grupo.perguntas.map((p, i) => `
            <div style="display:flex; align-items:flex-start; gap:10px; padding:8px 0; ${i < grupo.perguntas.length - 1 ? 'border-bottom:1px solid #e2e8f0' : ''}">
              <input type="checkbox" style="margin-top:3px; width:16px; height:16px; cursor:pointer">
              <span style="font-size:13px">${p}</span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
    
    <!-- CHECKLIST VISUAL -->
    <div class="diag-card" style="border-left:4px solid #f59e0b">
      <div class="diag-title" style="color:#b45309">
        <span style="font-size:24px">👁️</span>
        Checklist de Observação Visual
      </div>
      <p style="font-size:12px; color:#6b7280; margin-bottom:16px">
        Itens para observar durante a visita presencial.
      </p>
      
      <div style="display:grid; gap:8px">
        ${checklistVisual.map(item => `
          <div style="display:flex; align-items:center; gap:12px; padding:12px; background:#fffbeb; border-radius:8px">
            <input type="checkbox" style="width:18px; height:18px; cursor:pointer">
            <span style="font-size:18px">${item.icon}</span>
            <span style="font-size:13px">${item.item}</span>
          </div>
        `).join('')}
      </div>
      
      <div style="margin-top:16px">
        <div style="font-size:13px; font-weight:600; margin-bottom:8px">📸 Observações da Visita:</div>
        <textarea placeholder="Anote aqui suas observações durante a visita..." 
          style="width:100%; padding:12px; border:1px solid #fcd34d; border-radius:8px; min-height:100px; font-family:inherit; resize:vertical; background:#fff"></textarea>
      </div>
    </div>
    
    <!-- DOCUMENTOS A SOLICITAR -->
    <div class="diag-card" style="border-left:4px solid #8b5cf6">
      <div class="diag-title" style="color:#6d28d9">
        <span style="font-size:24px">📄</span>
        Documentos a Solicitar
      </div>
      <p style="font-size:12px; color:#6b7280; margin-bottom:16px">
        Lista de documentos para completar a análise.
      </p>
      
      <div style="display:grid; gap:8px">
        ${documentosSolicitar.map(d => `
          <div style="display:flex; align-items:center; gap:12px; padding:12px; background:${d.prioridade === 'alta' ? '#fef2f2' : d.prioridade === 'media' ? '#fffbeb' : '#f8fafc'}; border-radius:8px; border-left:3px solid ${d.prioridade === 'alta' ? '#ef4444' : d.prioridade === 'media' ? '#f59e0b' : '#9ca3af'}">
            <input type="checkbox" style="width:18px; height:18px; cursor:pointer">
            <span style="font-size:13px; flex:1">${d.doc}</span>
            <span style="font-size:10px; padding:2px 6px; border-radius:3px; background:${d.prioridade === 'alta' ? '#fee2e2' : d.prioridade === 'media' ? '#fef3c7' : '#f3f4f6'}; color:${d.prioridade === 'alta' ? '#991b1b' : d.prioridade === 'media' ? '#92400e' : '#6b7280'}">
              ${d.prioridade.toUpperCase()}
            </span>
          </div>
        `).join('')}
      </div>
    </div>
    
    <!-- RESUMO PARA VISITA -->
    <div class="diag-card info">
      <div class="diag-title">
        <span style="font-size:24px">📊</span>
        Resumo Rápido para Visita
      </div>
      
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:16px; margin-top:16px">
        <div style="text-align:center; padding:16px; background:#f8fafc; border-radius:8px">
          <div style="font-size:11px; color:#6b7280; margin-bottom:4px">Receita</div>
          <div style="font-size:18px; font-weight:700">${toBRL(latest.receita)}</div>
          ${previo ? `<div style="font-size:11px; color:${latest.receita >= previo.receita ? '#10b981' : '#ef4444'}">${latest.receita >= previo.receita ? '↑' : '↓'} vs ${previo.ano}</div>` : ''}
        </div>
        <div style="text-align:center; padding:16px; background:#f8fafc; border-radius:8px">
          <div style="font-size:11px; color:#6b7280; margin-bottom:4px">Margem EBITDA</div>
          <div style="font-size:18px; font-weight:700">${toPct(latest.margem)}</div>
          ${previo ? `<div style="font-size:11px; color:${latest.margem >= previo.margem ? '#10b981' : '#ef4444'}">${latest.margem >= previo.margem ? '↑' : '↓'} vs ${previo.ano}</div>` : ''}
        </div>
        <div style="text-align:center; padding:16px; background:#f8fafc; border-radius:8px">
          <div style="font-size:11px; color:#6b7280; margin-bottom:4px">DL/EBITDA</div>
          <div style="font-size:18px; font-weight:700; color:${latest.alav > 3 ? '#ef4444' : latest.alav > 2 ? '#f59e0b' : '#10b981'}">${clamp2(latest.alav)}x</div>
        </div>
        <div style="text-align:center; padding:16px; background:#f8fafc; border-radius:8px">
          <div style="font-size:11px; color:#6b7280; margin-bottom:4px">Liquidez</div>
          <div style="font-size:18px; font-weight:700; color:${latest.liq < 1 ? '#ef4444' : latest.liq < 1.2 ? '#f59e0b' : '#10b981'}">${clamp2(latest.liq)}</div>
        </div>
      </div>
      
      <div style="margin-top:20px; padding:16px; background:linear-gradient(135deg, #0a3c7d, #1e40af); color:#fff; border-radius:8px">
        <div style="font-size:14px; font-weight:700; margin-bottom:8px">🎯 Foco Principal da Visita:</div>
        <div style="font-size:13px; line-height:1.6">
          ${latest.alav > 2.5 ? '• Entender o endividamento e plano de desalavancagem<br>' : ''}
          ${latest.liq < 1.2 ? '• Verificar situação de caixa e necessidade de capital de giro<br>' : ''}
          ${previo && latest.margem < previo.margem ? '• Investigar queda na margem operacional<br>' : ''}
          ${previo && latest.receita < previo.receita ? '• Entender motivos da queda de receita<br>' : ''}
          ${score < 65 ? '• Avaliar riscos e garantias necessárias<br>' : ''}
          ${score >= 80 ? '• Identificar oportunidades de novos negócios<br>' : ''}
          • Validar informações qualitativas (clientes, fornecedores, mercado)
        </div>
      </div>
    </div>
    
    <!-- BOTÕES DE AÇÃO -->
    <div style="margin-top:20px; display:flex; gap:12px; flex-wrap:wrap">
      <button class="btn btn-outline" onclick="window.print()">
        🖨️ Imprimir Roteiro
      </button>
      <button class="btn btn-primary" onclick="copiarRoteiroTexto()">
        📋 Copiar como Texto
      </button>
    </div>
  `;
  
  container.innerHTML = html;
}

// Função para copiar roteiro como texto
function copiarRoteiroTexto(){
  const data = CURRENT_ANALYSIS_DATA;
  if(!data) return;
  
  const latest = data.rows[0];
  const texto = `
ROTEIRO DE VISITA - ${data.empresaNome}
Data: ${new Date().toLocaleDateString('pt-BR')}

INDICADORES PRINCIPAIS:
- Receita: ${toBRL(latest.receita)}
- Margem EBITDA: ${toPct(latest.margem)}
- DL/EBITDA: ${clamp2(latest.alav)}x
- Liquidez: ${clamp2(latest.liq)}
- Score: ${calcularScore(latest)}

PERGUNTAS PARA FAZER:
□ Quem são os 3 maiores clientes e % do faturamento?
□ Há contratos formais com principais clientes?
□ Quem são os principais fornecedores?
□ Como está o fluxo de caixa atual?
□ Qual a perspectiva para os próximos 12 meses?

DOCUMENTOS A SOLICITAR:
□ Balancete atualizado
□ Faturamento mensal últimos 6 meses
□ Posição de endividamento bancário
□ Certidões negativas
□ Aging de contas a receber

OBSERVAÇÕES:
_______________________________
_______________________________
_______________________________
  `.trim();
  
  navigator.clipboard.writeText(texto);
  alert('Roteiro copiado para a área de transferência!');
}
window.copiarRoteiroTexto = copiarRoteiroTexto;

// ================== ABA 6: CONTEXTO QUALITATIVO ==================
async function renderContexto(data){
  if(!data || !data.rows || !data.rows.length) return;
  
  const empresaId = data.empresaId;
  const latest = data.rows[0];
  const docId = latest.docId; // ID do documento financeiro
  const container = document.getElementById("contextoContent");
  
  // Mostrar loading enquanto carrega
  container.innerHTML = `
    <div style="text-align:center; padding:40px; color:var(--text-muted)">
      <div class="loading">Carregando contexto...</div>
    </div>
  `;
  
  // Tentar carregar contexto salvo
  let contextoSalvo = null;
  try {
    if(docId){
      const docRef = await db.collection("empresas").doc(empresaId)
        .collection("financeiro").doc(docId).get();
      if(docRef.exists){
        contextoSalvo = docRef.data().contexto || null;
      }
    }
  } catch(e){
    console.log("[renderContexto] Erro ao carregar contexto:", e);
  }
  
  // Preparar valores salvos
  const ctx = contextoSalvo || {};
  const eventos = ctx.eventos || [];
  const clientes = ctx.clientes || [{}, {}, {}];
  const fornecedores = ctx.fornecedores || ['', ''];
  const funcAtual = ctx.funcionariosAtual || '';
  const funcAnterior = ctx.funcionariosAnterior || '';
  const perspectiva = ctx.perspectiva || '';
  const justificativa = ctx.justificativa || '';
  const credito = ctx.necessidadeCredito || {};
  const observacoes = ctx.observacoes || '';
  const ultimaAtualizacao = ctx.atualizadoEm ? new Date(ctx.atualizadoEm.seconds * 1000).toLocaleString('pt-BR') : null;
  
  const html = `
    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:16px; margin-bottom:20px">
      <div style="display:flex; justify-content:space-between; align-items:center">
        <div>
          <div style="font-size:15px; font-weight:700; color:#0c4a6e; margin-bottom:8px">
            📄 Informações Qualitativas - Exercício ${latest.ano}
          </div>
          <p style="font-size:13px; color:#0369a1; margin:0">
            Registre informações que contextualizam os números e ajudam na análise de crédito.
          </p>
        </div>
        ${ultimaAtualizacao ? `
          <div style="text-align:right">
            <div style="font-size:11px; color:#10b981; font-weight:600">✓ Salvo</div>
            <div style="font-size:10px; color:var(--text-muted)">${ultimaAtualizacao}</div>
          </div>
        ` : `
          <div style="text-align:right">
            <div style="font-size:11px; color:#f59e0b; font-weight:600">⚠ Não salvo</div>
          </div>
        `}
      </div>
    </div>
    
    <input type="hidden" id="ctxEmpresaId" value="${empresaId}">
    <input type="hidden" id="ctxDocId" value="${docId || ''}">
    <input type="hidden" id="ctxAno" value="${latest.ano}">
    
    <div class="context-form">
      <div class="context-group">
        <div class="context-group-title">📌 Eventos Relevantes do Ano</div>
        <div class="context-checkboxes" id="ctxEventos">
          <label class="context-check"><input type="checkbox" name="evento" value="filial_aberta" ${eventos.includes('filial_aberta') ? 'checked' : ''}> Abertura de filial/unidade</label>
          <label class="context-check"><input type="checkbox" name="evento" value="filial_fechada" ${eventos.includes('filial_fechada') ? 'checked' : ''}> Fechamento de filial</label>
          <label class="context-check"><input type="checkbox" name="evento" value="aquisicao" ${eventos.includes('aquisicao') ? 'checked' : ''}> Aquisição de empresa/carteira</label>
          <label class="context-check"><input type="checkbox" name="evento" value="venda_ativos" ${eventos.includes('venda_ativos') ? 'checked' : ''}> Venda de ativos relevantes</label>
          <label class="context-check"><input type="checkbox" name="evento" value="capex" ${eventos.includes('capex') ? 'checked' : ''}> Investimento em equipamentos</label>
          <label class="context-check"><input type="checkbox" name="evento" value="reestruturacao" ${eventos.includes('reestruturacao') ? 'checked' : ''}> Reestruturação organizacional</label>
          <label class="context-check"><input type="checkbox" name="evento" value="troca_gestao" ${eventos.includes('troca_gestao') ? 'checked' : ''}> Troca de gestão/sócios</label>
          <label class="context-check"><input type="checkbox" name="evento" value="contrato_ganho" ${eventos.includes('contrato_ganho') ? 'checked' : ''}> Ganhou contrato relevante</label>
          <label class="context-check"><input type="checkbox" name="evento" value="contrato_perdido" ${eventos.includes('contrato_perdido') ? 'checked' : ''}> Perdeu contrato relevante</label>
          <label class="context-check"><input type="checkbox" name="evento" value="judicial" ${eventos.includes('judicial') ? 'checked' : ''}> Processo judicial relevante</label>
          <label class="context-check"><input type="checkbox" name="evento" value="sinistro" ${eventos.includes('sinistro') ? 'checked' : ''}> Evento climático/sinistro</label>
          <label class="context-check"><input type="checkbox" name="evento" value="pandemia" ${eventos.includes('pandemia') ? 'checked' : ''}> Impacto de pandemia/crise</label>
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">👥 Principais Clientes (% do faturamento)</div>
        <div style="display:grid; gap:12px">
          <div style="display:flex; gap:12px; align-items:center">
            <span style="width:20px; font-weight:600">1.</span>
            <input type="text" id="ctxCliente1Nome" placeholder="Nome do cliente" value="${escapeHtml(clientes[0]?.nome || '')}" style="flex:1; padding:10px; border:1px solid var(--border); border-radius:8px">
            <input type="number" id="ctxCliente1Pct" placeholder="%" value="${clientes[0]?.percentual || ''}" style="width:80px; padding:10px; border:1px solid var(--border); border-radius:8px">
          </div>
          <div style="display:flex; gap:12px; align-items:center">
            <span style="width:20px; font-weight:600">2.</span>
            <input type="text" id="ctxCliente2Nome" placeholder="Nome do cliente" value="${escapeHtml(clientes[1]?.nome || '')}" style="flex:1; padding:10px; border:1px solid var(--border); border-radius:8px">
            <input type="number" id="ctxCliente2Pct" placeholder="%" value="${clientes[1]?.percentual || ''}" style="width:80px; padding:10px; border:1px solid var(--border); border-radius:8px">
          </div>
          <div style="display:flex; gap:12px; align-items:center">
            <span style="width:20px; font-weight:600">3.</span>
            <input type="text" id="ctxCliente3Nome" placeholder="Nome do cliente" value="${escapeHtml(clientes[2]?.nome || '')}" style="flex:1; padding:10px; border:1px solid var(--border); border-radius:8px">
            <input type="number" id="ctxCliente3Pct" placeholder="%" value="${clientes[2]?.percentual || ''}" style="width:80px; padding:10px; border:1px solid var(--border); border-radius:8px">
          </div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:8px">
          💡 Concentração >30% em um cliente é ponto de atenção para análise de risco.
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">🏭 Principais Fornecedores</div>
        <div style="display:grid; gap:12px">
          <input type="text" id="ctxFornecedor1" placeholder="Fornecedor 1" value="${escapeHtml(fornecedores[0] || '')}" style="padding:10px; border:1px solid var(--border); border-radius:8px">
          <input type="text" id="ctxFornecedor2" placeholder="Fornecedor 2" value="${escapeHtml(fornecedores[1] || '')}" style="padding:10px; border:1px solid var(--border); border-radius:8px">
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">👨‍💼 Quadro de Funcionários</div>
        <div style="display:flex; gap:16px">
          <div style="flex:1">
            <label style="font-size:12px; color:var(--text-secondary)">Ano Atual (${latest.ano})</label>
            <input type="number" id="ctxFuncAtual" placeholder="Nº funcionários" value="${funcAtual}" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; margin-top:4px">
          </div>
          <div style="flex:1">
            <label style="font-size:12px; color:var(--text-secondary)">Ano Anterior (${latest.ano - 1})</label>
            <input type="number" id="ctxFuncAnterior" placeholder="Nº funcionários" value="${funcAnterior}" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; margin-top:4px">
          </div>
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">🔮 Perspectiva para ${latest.ano + 1}</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap">
          <label class="context-check" style="padding:12px 20px; background:${perspectiva === 'otimista' ? '#10b981' : '#d1fae5'}; color:${perspectiva === 'otimista' ? '#fff' : 'inherit'}; border-radius:8px; cursor:pointer; transition:all .2s">
            <input type="radio" name="perspectiva" value="otimista" ${perspectiva === 'otimista' ? 'checked' : ''} style="margin-right:6px"> 
            📈 Otimista (crescimento >10%)
          </label>
          <label class="context-check" style="padding:12px 20px; background:${perspectiva === 'estavel' ? '#f59e0b' : '#fef3c7'}; color:${perspectiva === 'estavel' ? '#fff' : 'inherit'}; border-radius:8px; cursor:pointer; transition:all .2s">
            <input type="radio" name="perspectiva" value="estavel" ${perspectiva === 'estavel' ? 'checked' : ''} style="margin-right:6px"> 
            ➡️ Estável (±10%)
          </label>
          <label class="context-check" style="padding:12px 20px; background:${perspectiva === 'pessimista' ? '#ef4444' : '#fee2e2'}; color:${perspectiva === 'pessimista' ? '#fff' : 'inherit'}; border-radius:8px; cursor:pointer; transition:all .2s">
            <input type="radio" name="perspectiva" value="pessimista" ${perspectiva === 'pessimista' ? 'checked' : ''} style="margin-right:6px"> 
            📉 Pessimista (queda >10%)
          </label>
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">📝 Justificativa da Perspectiva</div>
        <textarea id="ctxJustificativa" placeholder="Descreva os motivos da perspectiva informada: novos contratos, expansão, perda de clientes, cenário econômico..." 
          style="width:100%; padding:12px; border:1px solid var(--border); border-radius:8px; min-height:100px; font-family:inherit; resize:vertical">${escapeHtml(justificativa)}</textarea>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">💰 Necessidade de Crédito Prevista (próximos 12 meses)</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px">
          <div>
            <label style="font-size:12px; color:var(--text-secondary)">Capital de Giro</label>
            <input type="text" id="ctxCreditoGiro" placeholder="R$ 0,00" value="${credito.capitalGiro ? toBRL(credito.capitalGiro) : ''}" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; margin-top:4px">
          </div>
          <div>
            <label style="font-size:12px; color:var(--text-secondary)">Investimento (CAPEX)</label>
            <input type="text" id="ctxCreditoInvest" placeholder="R$ 0,00" value="${credito.investimento ? toBRL(credito.investimento) : ''}" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; margin-top:4px">
          </div>
          <div>
            <label style="font-size:12px; color:var(--text-secondary)">Refinanciamento</label>
            <input type="text" id="ctxCreditoRefin" placeholder="R$ 0,00" value="${credito.refinanciamento ? toBRL(credito.refinanciamento) : ''}" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; margin-top:4px">
          </div>
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">📋 Observações Adicionais</div>
        <textarea id="ctxObservacoes" placeholder="Informações adicionais relevantes: histórico com o banco, garantias disponíveis, projetos em andamento..." 
          style="width:100%; padding:12px; border:1px solid var(--border); border-radius:8px; min-height:80px; font-family:inherit; resize:vertical">${escapeHtml(observacoes)}</textarea>
      </div>
    </div>
    
    <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center">
      <div id="ctxStatus" style="font-size:13px; color:var(--text-muted)"></div>
      <div style="display:flex; gap:12px">
        <button class="btn btn-outline" onclick="limparContexto()">
          🗑️ Limpar
        </button>
        <button class="btn btn-primary" id="btnSalvarContexto" onclick="salvarContexto()">
          💾 Salvar Contexto
        </button>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Aplicar máscaras de moeda nos campos de crédito
  ['ctxCreditoGiro', 'ctxCreditoInvest', 'ctxCreditoRefin'].forEach(id => {
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('input', function(){
        let v = this.value.replace(/\D/g, '');
        if(v){
          v = (parseInt(v) / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
          this.value = v;
        }
      });
    }
  });
}

// Função para salvar contexto no Firestore
async function salvarContexto(){
  const btn = document.getElementById("btnSalvarContexto");
  const status = document.getElementById("ctxStatus");
  
  const empresaId = document.getElementById("ctxEmpresaId")?.value;
  const docId = document.getElementById("ctxDocId")?.value;
  const ano = document.getElementById("ctxAno")?.value;
  
  if(!empresaId || !docId){
    status.innerHTML = '<span style="color:#ef4444">❌ Erro: documento não identificado</span>';
    return;
  }
  
  // Mostrar loading
  btn.disabled = true;
  btn.innerHTML = '⏳ Salvando...';
  status.innerHTML = '<span style="color:#3b82f6">Salvando contexto...</span>';
  
  try {
    // Coletar eventos marcados
    const eventos = [];
    document.querySelectorAll('#ctxEventos input[type="checkbox"]:checked').forEach(cb => {
      eventos.push(cb.value);
    });
    
    // Coletar clientes
    const clientes = [];
    for(let i = 1; i <= 3; i++){
      const nome = document.getElementById(`ctxCliente${i}Nome`)?.value?.trim() || '';
      const pct = parseFloat(document.getElementById(`ctxCliente${i}Pct`)?.value) || 0;
      if(nome || pct){
        clientes.push({ nome, percentual: pct });
      }
    }
    
    // Coletar fornecedores
    const fornecedores = [
      document.getElementById("ctxFornecedor1")?.value?.trim() || '',
      document.getElementById("ctxFornecedor2")?.value?.trim() || ''
    ].filter(f => f);
    
    // Coletar perspectiva
    const perspectiva = document.querySelector('input[name="perspectiva"]:checked')?.value || '';
    
    // Parsear valores de crédito
    const parseCredito = (id) => {
      const val = document.getElementById(id)?.value || '';
      return parseFloat(val.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    };
    
    // Montar objeto de contexto
    const contexto = {
      eventos,
      clientes,
      fornecedores,
      funcionariosAtual: parseInt(document.getElementById("ctxFuncAtual")?.value) || null,
      funcionariosAnterior: parseInt(document.getElementById("ctxFuncAnterior")?.value) || null,
      perspectiva,
      justificativa: document.getElementById("ctxJustificativa")?.value?.trim() || '',
      necessidadeCredito: {
        capitalGiro: parseCredito("ctxCreditoGiro"),
        investimento: parseCredito("ctxCreditoInvest"),
        refinanciamento: parseCredito("ctxCreditoRefin")
      },
      observacoes: document.getElementById("ctxObservacoes")?.value?.trim() || '',
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoPor: CTX.uid,
      atualizadoPorNome: CTX.nome
    };
    
    // Salvar no Firestore (merge para não sobrescrever outros campos)
    await db.collection("empresas").doc(empresaId)
      .collection("financeiro").doc(docId)
      .set({ contexto }, { merge: true });
    
    console.log("[salvarContexto] Contexto salvo com sucesso:", contexto);
    
    // Feedback de sucesso
    status.innerHTML = '<span style="color:#10b981">✅ Contexto salvo com sucesso!</span>';
    btn.innerHTML = '✓ Salvo!';
    btn.style.background = '#10b981';
    
    // Restaurar botão após 2s
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '💾 Salvar Contexto';
      btn.style.background = '';
    }, 2000);
    
  } catch(e) {
    console.error("[salvarContexto] Erro:", e);
    status.innerHTML = `<span style="color:#ef4444">❌ Erro ao salvar: ${e.message}</span>`;
    btn.disabled = false;
    btn.innerHTML = '💾 Salvar Contexto';
  }
}
window.salvarContexto = salvarContexto;

// Função para limpar formulário de contexto
function limparContexto(){
  if(!confirm('Tem certeza que deseja limpar todos os campos?')) return;
  
  // Limpar checkboxes
  document.querySelectorAll('#ctxEventos input[type="checkbox"]').forEach(cb => cb.checked = false);
  
  // Limpar inputs de texto
  ['ctxCliente1Nome', 'ctxCliente1Pct', 'ctxCliente2Nome', 'ctxCliente2Pct', 
   'ctxCliente3Nome', 'ctxCliente3Pct', 'ctxFornecedor1', 'ctxFornecedor2',
   'ctxFuncAtual', 'ctxFuncAnterior', 'ctxCreditoGiro', 'ctxCreditoInvest',
   'ctxCreditoRefin'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  
  // Limpar radio buttons
  document.querySelectorAll('input[name="perspectiva"]').forEach(rb => rb.checked = false);
  
  // Limpar textareas
  ['ctxJustificativa', 'ctxObservacoes'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  
  document.getElementById("ctxStatus").innerHTML = '<span style="color:#f59e0b">⚠ Campos limpos - não esqueça de salvar</span>';
}
window.limparContexto = limparContexto;

// ================== EXPORTAR PDF ==================
async function exportarPDF(nomeEmpresa){
  if(typeof html2pdf === "undefined"){
    return alert("Biblioteca html2pdf não encontrada. Verifique se o script está carregado.");
  }

  const btnPDF = document.getElementById("detPDF");
  const originalText = btnPDF ? btnPDF.textContent : "";
  if(btnPDF) {
    btnPDF.disabled = true;
    btnPDF.textContent = "⏳ Gerando PDF...";
  }

  try {
    const healthDashboard = document.getElementById('healthDashboard')?.innerHTML || "";
    const recommendations = document.getElementById('recommendations')?.innerHTML || "";
    const detResumo = document.getElementById('detResumo')?.innerHTML || "";
    const detTbody = document.getElementById('detTbody')?.innerHTML || "";
    const dataAtual = new Date().toLocaleDateString('pt-BR', {day:'2-digit', month:'long', year:'numeric'});
    
    // Overlay de loading
    const overlay = document.createElement('div');
    overlay.id = 'pdf-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.95); z-index:99998; display:flex; align-items:center; justify-content:center;';
    overlay.innerHTML = '<div style="font-size:18px; color:#0a3c7d; font-weight:600;">📄 Gerando PDF...</div>';
    document.body.appendChild(overlay);
    
    // Container do PDF
    const pdfContainer = document.createElement('div');
    pdfContainer.id = 'pdf-export-container';
    pdfContainer.style.cssText = 'position:absolute; left:0; top:0; width:794px; background:#fff; padding:30px; font-family:Arial,sans-serif;';
    
    pdfContainer.innerHTML = '<div style="text-align:center; padding:25px; background:linear-gradient(135deg, #0a3c7d 0%, #2563eb 100%); color:#fff; border-radius:12px; margin-bottom:25px;"><div style="font-size:24px; font-weight:700; margin-bottom:8px;">📊 Análise Financeira</div><div style="font-size:18px; font-weight:600;">' + escapeHtml(nomeEmpresa) + '</div><div style="font-size:12px; margin-top:8px; opacity:0.9;">Relatório gerado em ' + dataAtual + '</div></div><div style="margin-bottom:25px;"><div style="font-size:16px; font-weight:700; color:#0a3c7d; margin-bottom:15px; padding-bottom:8px; border-bottom:2px solid #e2e8f0;">🎯 Dashboard de Saúde Financeira</div><div style="background:#f8fafc; padding:15px; border-radius:8px;">' + healthDashboard + '</div></div><div style="margin-bottom:25px;"><div style="font-size:16px; font-weight:700; color:#0a3c7d; margin-bottom:15px; padding-bottom:8px; border-bottom:2px solid #e2e8f0;">💡 Recomendações</div><div style="background:#f0f9ff; padding:15px; border-radius:8px;">' + recommendations + '</div></div><div style="margin-bottom:25px;"><div style="font-size:16px; font-weight:700; color:#0a3c7d; margin-bottom:15px; padding-bottom:8px; border-bottom:2px solid #e2e8f0;">📋 Resumo Executivo</div><div style="background:#f8fafc; padding:15px; border-radius:8px;">' + detResumo + '</div></div><div style="margin-bottom:25px;"><div style="font-size:16px; font-weight:700; color:#0a3c7d; margin-bottom:15px; padding-bottom:8px; border-bottom:2px solid #e2e8f0;">📈 Histórico de Indicadores</div><table style="width:100%; border-collapse:collapse; font-size:11px; background:#fff;"><thead><tr style="background:#f1f5f9;"><th style="border:1px solid #e2e8f0; padding:10px;">Ano</th><th style="border:1px solid #e2e8f0; padding:10px;">Receita</th><th style="border:1px solid #e2e8f0; padding:10px;">EBITDA</th><th style="border:1px solid #e2e8f0; padding:10px;">Margem</th><th style="border:1px solid #e2e8f0; padding:10px;">DL/EBITDA</th><th style="border:1px solid #e2e8f0; padding:10px;">Liquidez</th><th style="border:1px solid #e2e8f0; padding:10px;">ROE</th><th style="border:1px solid #e2e8f0; padding:10px;">Score</th></tr></thead><tbody>' + detTbody + '</tbody></table></div><div style="margin-top:30px; padding-top:20px; border-top:1px solid #e2e8f0; text-align:center; font-size:11px; color:#94a3b8;"><p>Sistema de Análise Financeira Inteligente • Retorno Seguros</p></div>';
    
    document.body.appendChild(pdfContainer);
    await new Promise(r => setTimeout(r, 500));
    
    const opt = {
      margin: 10,
      filename: 'Analise_Financeira_' + nomeEmpresa.replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().toISOString().slice(0,10) + '.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    await html2pdf().set(opt).from(pdfContainer).save();
    document.body.removeChild(pdfContainer);
    document.body.removeChild(overlay);
    console.log("[exportarPDF] PDF gerado com sucesso");
    
  } catch(e) {
    console.error("[exportarPDF] Erro:", e);
    alert("Erro ao gerar PDF: " + e.message);
    const ov = document.getElementById('pdf-overlay');
    if(ov) ov.remove();
    const pc = document.getElementById('pdf-export-container');
    if(pc) pc.remove();
  } finally {
    if(btnPDF) {
      btnPDF.disabled = false;
      btnPDF.textContent = originalText || "📥 Exportar PDF";
    }
  }
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

// ================================================================================
// ==================== MÓDULO DE PLANEJAMENTO FINANCEIRO ====================
// ================================================================================

// ===== BENCHMARKS POR SETOR =====
const BENCHMARKS_SETOR = {
  'industria': {
    nome: 'Indústria',
    margemBruta: 0.30,
    margemEbitda: 0.12,
    margemLiquida: 0.06,
    liquidezCorrente: 1.5,
    liquidezSeca: 1.0,
    dlEbitda: 2.5,
    roe: 0.12,
    roa: 0.06,
    giroAtivo: 1.0,
    cicloFinanceiro: 60,
    endividamentoGeral: 0.55
  },
  'comercio': {
    nome: 'Comércio',
    margemBruta: 0.25,
    margemEbitda: 0.08,
    margemLiquida: 0.04,
    liquidezCorrente: 1.3,
    liquidezSeca: 0.8,
    dlEbitda: 2.0,
    roe: 0.15,
    roa: 0.08,
    giroAtivo: 2.0,
    cicloFinanceiro: 45,
    endividamentoGeral: 0.50
  },
  'servicos': {
    nome: 'Serviços',
    margemBruta: 0.45,
    margemEbitda: 0.18,
    margemLiquida: 0.10,
    liquidezCorrente: 1.4,
    liquidezSeca: 1.3,
    dlEbitda: 1.5,
    roe: 0.18,
    roa: 0.12,
    giroAtivo: 1.2,
    cicloFinanceiro: 30,
    endividamentoGeral: 0.40
  },
  'agronegocio': {
    nome: 'Agronegócio',
    margemBruta: 0.28,
    margemEbitda: 0.15,
    margemLiquida: 0.08,
    liquidezCorrente: 1.2,
    liquidezSeca: 0.7,
    dlEbitda: 3.0,
    roe: 0.14,
    roa: 0.07,
    giroAtivo: 0.8,
    cicloFinanceiro: 90,
    endividamentoGeral: 0.60
  },
  'tecnologia': {
    nome: 'Tecnologia',
    margemBruta: 0.60,
    margemEbitda: 0.22,
    margemLiquida: 0.12,
    liquidezCorrente: 2.0,
    liquidezSeca: 1.8,
    dlEbitda: 1.0,
    roe: 0.20,
    roa: 0.15,
    giroAtivo: 1.5,
    cicloFinanceiro: 20,
    endividamentoGeral: 0.30
  },
  'construcao': {
    nome: 'Construção Civil',
    margemBruta: 0.25,
    margemEbitda: 0.10,
    margemLiquida: 0.05,
    liquidezCorrente: 1.4,
    liquidezSeca: 1.0,
    dlEbitda: 3.0,
    roe: 0.10,
    roa: 0.05,
    giroAtivo: 0.6,
    cicloFinanceiro: 120,
    endividamentoGeral: 0.60
  },
  'saude': {
    nome: 'Saúde',
    margemBruta: 0.40,
    margemEbitda: 0.15,
    margemLiquida: 0.08,
    liquidezCorrente: 1.5,
    liquidezSeca: 1.2,
    dlEbitda: 2.0,
    roe: 0.15,
    roa: 0.10,
    giroAtivo: 1.3,
    cicloFinanceiro: 40,
    endividamentoGeral: 0.45
  },
  'transporte': {
    nome: 'Transporte/Logística',
    margemBruta: 0.22,
    margemEbitda: 0.10,
    margemLiquida: 0.04,
    liquidezCorrente: 1.2,
    liquidezSeca: 1.0,
    dlEbitda: 3.5,
    roe: 0.12,
    roa: 0.05,
    giroAtivo: 1.0,
    cicloFinanceiro: 35,
    endividamentoGeral: 0.65
  },
  'educacao': {
    nome: 'Educação',
    margemBruta: 0.50,
    margemEbitda: 0.20,
    margemLiquida: 0.10,
    liquidezCorrente: 1.3,
    liquidezSeca: 1.2,
    dlEbitda: 2.0,
    roe: 0.16,
    roa: 0.10,
    giroAtivo: 1.0,
    cicloFinanceiro: 25,
    endividamentoGeral: 0.45
  },
  'varejo': {
    nome: 'Varejo',
    margemBruta: 0.30,
    margemEbitda: 0.06,
    margemLiquida: 0.03,
    liquidezCorrente: 1.2,
    liquidezSeca: 0.6,
    dlEbitda: 2.5,
    roe: 0.12,
    roa: 0.06,
    giroAtivo: 2.5,
    cicloFinanceiro: 50,
    endividamentoGeral: 0.55
  }
};

// ===== FUNÇÃO: CALCULAR TAXA DE CRESCIMENTO HISTÓRICA =====
function calcularTaxaCrescimento(rows, campo){
  if(rows.length < 2) return 0.05; // Default 5%
  
  const valores = rows.map(r => r[campo]).filter(v => v && v > 0);
  if(valores.length < 2) return 0.05;
  
  // CAGR = (Valor Final / Valor Inicial)^(1/n) - 1
  const inicial = valores[valores.length - 1];
  const final = valores[0];
  const anos = valores.length - 1;
  
  if(inicial <= 0) return 0.05;
  
  const cagr = Math.pow(final / inicial, 1 / anos) - 1;
  
  // Limitar entre -20% e +50%
  return Math.max(-0.20, Math.min(0.50, cagr));
}

// ===== FUNÇÃO: PROJETAR LINHA DO BALANÇO/DRE =====
function projetarValor(valorAtual, taxaCrescimento, anos){
  return valorAtual * Math.pow(1 + taxaCrescimento, anos);
}

// ===== FUNÇÃO: GERAR PROJEÇÕES 3 ANOS =====
function gerarProjecoes(rows, setor){
  const latest = rows[0];
  const benchmark = BENCHMARKS_SETOR[setor] || BENCHMARKS_SETOR['industria'];
  
  // Calcular taxas de crescimento históricas
  const txReceita = calcularTaxaCrescimento(rows, 'receita');
  const txEbitda = calcularTaxaCrescimento(rows, 'ebitda');
  const txLucro = calcularTaxaCrescimento(rows, 'lucroLiq');
  const txAtivo = calcularTaxaCrescimento(rows, 'ativo');
  
  const anoAtual = latest.ano || new Date().getFullYear();
  
  // Cenários de crescimento
  const cenarios = {
    pessimista: {
      nome: 'Pessimista',
      cor: '#ef4444',
      fator: 0.5 // 50% do crescimento histórico
    },
    realista: {
      nome: 'Realista',
      cor: '#3b82f6',
      fator: 1.0 // Mantém crescimento histórico
    },
    otimista: {
      nome: 'Otimista',
      cor: '#10b981',
      fator: 1.5 // 150% do crescimento histórico
    }
  };
  
  const projecoes = {};
  
  Object.keys(cenarios).forEach(cenario => {
    const fator = cenarios[cenario].fator;
    projecoes[cenario] = {
      ...cenarios[cenario],
      anos: []
    };
    
    for(let i = 1; i <= 3; i++){
      const ano = anoAtual + i;
      const txReceitaAjustada = txReceita * fator;
      
      // Projetar valores principais
      const receita = projetarValor(latest.receita || 0, txReceitaAjustada, i);
      const ebitda = receita * (latest.margem || benchmark.margemEbitda);
      const lucroLiq = receita * (latest.margemLiq || benchmark.margemLiquida);
      
      // Projetar balanço baseado em giro/ciclo
      const giro = latest.giroAtv || benchmark.giroAtivo;
      const ativo = receita / giro;
      
      // Manter estrutura de capital similar
      const plRatio = latest.plSobrePassivo || 0.4;
      const pl = ativo * plRatio;
      
      // Estimar capital de giro baseado no ciclo
      const ciclo = latest.ciclo || benchmark.cicloFinanceiro;
      const ncg = (receita / 360) * ciclo;
      
      // Dívida para fechar o balanço
      const passivo = ativo - pl;
      const dlEbitda = ebitda > 0 ? (passivo * 0.6) / ebitda : 0;
      
      projecoes[cenario].anos.push({
        ano,
        receita,
        ebitda,
        margemEbitda: receita > 0 ? ebitda / receita : 0,
        lucroLiq,
        margemLiq: receita > 0 ? lucroLiq / receita : 0,
        ativo,
        pl,
        passivo,
        ncg,
        dlEbitda,
        roe: pl > 0 ? lucroLiq / pl : 0,
        roa: ativo > 0 ? lucroLiq / ativo : 0
      });
    }
  });
  
  return {
    taxas: { receita: txReceita, ebitda: txEbitda, lucro: txLucro, ativo: txAtivo },
    cenarios: projecoes,
    benchmark
  };
}

// ===== FUNÇÃO: SIMULAR META =====
function simularMeta(latest, meta, tipoMeta, setor){
  const benchmark = BENCHMARKS_SETOR[setor] || BENCHMARKS_SETOR['industria'];
  const resultado = { necessidades: [], balanco: {}, dre: {} };
  
  switch(tipoMeta){
    case 'receita':
      // Meta: crescer X% na receita
      const novaReceita = latest.receita * (1 + meta / 100);
      const crescReceita = novaReceita - latest.receita;
      
      // Manter margem atual
      const margem = latest.margem || benchmark.margemEbitda;
      const novoEbitda = novaReceita * margem;
      const margemLiq = latest.margemLiq || benchmark.margemLiquida;
      const novoLucro = novaReceita * margemLiq;
      
      // Calcular necessidade de capital de giro
      const pmr = latest.pmr || 30;
      const pme = latest.diasEst || 45;
      const pmp = latest.pmp || 30;
      
      const aumentoCR = (crescReceita / 360) * pmr;
      const aumentoEstoque = (crescReceita * 0.6 / 360) * pme; // CMV ~60% receita
      const aumentoFornec = (crescReceita * 0.6 / 360) * pmp;
      const ncgAdicional = aumentoCR + aumentoEstoque - aumentoFornec;
      
      // Necessidade de financiamento
      const lucroRetido = novoLucro * 0.7; // 70% reinvestido
      const necessidadeFinanc = Math.max(0, ncgAdicional - lucroRetido);
      
      resultado.dre = {
        receita: novaReceita,
        cmv: novaReceita * 0.6,
        lucroBruto: novaReceita * 0.4,
        ebitda: novoEbitda,
        lucroLiq: novoLucro
      };
      
      resultado.balanco = {
        contasReceber: (latest.cr || 0) + aumentoCR,
        estoques: (latest.estoques || 0) + aumentoEstoque,
        fornecedores: (latest.cp || 0) + aumentoFornec,
        ncg: (latest.ncg || 0) + ncgAdicional
      };
      
      resultado.necessidades = [
        { desc: `Aumentar vendas em ${toBRL(crescReceita)}/ano`, valor: crescReceita },
        { desc: `Capital de giro adicional necessário`, valor: ncgAdicional },
        { desc: `Lucro retido disponível para reinvestir`, valor: lucroRetido },
        { desc: `Necessidade de financiamento externo`, valor: necessidadeFinanc }
      ];
      
      if(necessidadeFinanc > 0){
        resultado.necessidades.push({
          desc: `Sugestão: Linha de capital de giro de ${toBRL(necessidadeFinanc * 1.2)}`,
          tipo: 'acao'
        });
      }
      break;
      
    case 'lucro':
      // Meta: atingir lucro de X reais
      const lucroMeta = meta;
      const lucroAtual = latest.lucroLiq || 0;
      const margemLiqAtual = latest.margemLiq || benchmark.margemLiquida;
      
      // Opção 1: Aumentar receita mantendo margem
      const receitaNecessaria1 = lucroMeta / margemLiqAtual;
      const crescNecessario1 = latest.receita > 0 ? 
        ((receitaNecessaria1 / latest.receita) - 1) * 100 : 0;
      
      // Opção 2: Aumentar margem mantendo receita
      const margemNecessaria = latest.receita > 0 ? lucroMeta / latest.receita : 0;
      
      // Opção 3: Combinação (meio a meio)
      const receitaComb = latest.receita * 1.15; // +15%
      const margemComb = lucroMeta / receitaComb;
      
      resultado.dre = {
        opcao1: { receita: receitaNecessaria1, margem: margemLiqAtual, lucro: lucroMeta },
        opcao2: { receita: latest.receita, margem: margemNecessaria, lucro: lucroMeta },
        opcao3: { receita: receitaComb, margem: margemComb, lucro: lucroMeta }
      };
      
      resultado.necessidades = [
        { desc: `Lucro atual: ${toBRL(lucroAtual)}`, valor: lucroAtual },
        { desc: `Meta de lucro: ${toBRL(lucroMeta)}`, valor: lucroMeta },
        { desc: `Gap a superar: ${toBRL(lucroMeta - lucroAtual)}`, valor: lucroMeta - lucroAtual },
        { desc: `---`, tipo: 'separador' },
        { desc: `OPÇÃO 1: Aumentar receita em ${crescNecessario1.toFixed(1)}%`, tipo: 'opcao' },
        { desc: `• Receita necessária: ${toBRL(receitaNecessaria1)}` },
        { desc: `• Mantendo margem de ${(margemLiqAtual * 100).toFixed(1)}%` },
        { desc: `---`, tipo: 'separador' },
        { desc: `OPÇÃO 2: Aumentar margem líquida`, tipo: 'opcao' },
        { desc: `• Margem necessária: ${(margemNecessaria * 100).toFixed(1)}%` },
        { desc: `• Aumento de ${((margemNecessaria - margemLiqAtual) * 100).toFixed(1)}pp` },
        { desc: `---`, tipo: 'separador' },
        { desc: `OPÇÃO 3: Combinação (+15% receita + margem)`, tipo: 'opcao' },
        { desc: `• Receita: ${toBRL(receitaComb)}` },
        { desc: `• Margem necessária: ${(margemComb * 100).toFixed(1)}%` }
      ];
      break;
      
    case 'alavancagem':
      // Meta: reduzir DL/EBITDA para Xx
      const dlEbitdaMeta = meta;
      const dlAtual = latest.dl || 0;
      const ebitdaAtual = latest.ebitda || 0;
      const dlEbitdaAtual = ebitdaAtual > 0 ? dlAtual / ebitdaAtual : 0;
      
      // Dívida máxima para atingir meta
      const dlMaxima = ebitdaAtual * dlEbitdaMeta;
      const amortizacaoNecessaria = dlAtual - dlMaxima;
      
      // Ou EBITDA mínimo para atingir meta
      const ebitdaMinimo = dlAtual / dlEbitdaMeta;
      const crescEbitdaNecessario = ebitdaAtual > 0 ?
        ((ebitdaMinimo / ebitdaAtual) - 1) * 100 : 0;
      
      resultado.necessidades = [
        { desc: `DL/EBITDA atual: ${dlEbitdaAtual.toFixed(2)}x`, valor: dlEbitdaAtual },
        { desc: `Meta: ${dlEbitdaMeta.toFixed(2)}x`, valor: dlEbitdaMeta },
        { desc: `---`, tipo: 'separador' },
        { desc: `OPÇÃO 1: Amortizar dívida`, tipo: 'opcao' },
        { desc: `• Dívida líquida atual: ${toBRL(dlAtual)}` },
        { desc: `• Dívida máxima permitida: ${toBRL(dlMaxima)}` },
        { desc: `• Amortização necessária: ${toBRL(amortizacaoNecessaria)}` },
        { desc: `---`, tipo: 'separador' },
        { desc: `OPÇÃO 2: Aumentar EBITDA`, tipo: 'opcao' },
        { desc: `• EBITDA atual: ${toBRL(ebitdaAtual)}` },
        { desc: `• EBITDA necessário: ${toBRL(ebitdaMinimo)}` },
        { desc: `• Crescimento necessário: ${crescEbitdaNecessario.toFixed(1)}%` }
      ];
      break;
      
    case 'benchmark':
      // Meta: igualar benchmark do setor
      const gaps = [];
      
      if(latest.margem < benchmark.margemEbitda){
        gaps.push({
          indicador: 'Margem EBITDA',
          atual: latest.margem,
          meta: benchmark.margemEbitda,
          gap: benchmark.margemEbitda - latest.margem,
          impacto: (benchmark.margemEbitda - latest.margem) * latest.receita
        });
      }
      
      if(latest.liqCorrente < benchmark.liquidezCorrente){
        gaps.push({
          indicador: 'Liquidez Corrente',
          atual: latest.liqCorrente,
          meta: benchmark.liquidezCorrente,
          gap: benchmark.liquidezCorrente - latest.liqCorrente
        });
      }
      
      if(latest.alav > benchmark.dlEbitda && latest.alav > 0){
        gaps.push({
          indicador: 'DL/EBITDA',
          atual: latest.alav,
          meta: benchmark.dlEbitda,
          gap: latest.alav - benchmark.dlEbitda,
          tipo: 'inverso'
        });
      }
      
      if(latest.roe < benchmark.roe){
        gaps.push({
          indicador: 'ROE',
          atual: latest.roe,
          meta: benchmark.roe,
          gap: benchmark.roe - latest.roe
        });
      }
      
      if(latest.ciclo > benchmark.cicloFinanceiro){
        gaps.push({
          indicador: 'Ciclo Financeiro',
          atual: latest.ciclo,
          meta: benchmark.cicloFinanceiro,
          gap: latest.ciclo - benchmark.cicloFinanceiro,
          tipo: 'inverso'
        });
      }
      
      resultado.gaps = gaps;
      resultado.benchmark = benchmark;
      
      resultado.necessidades = [
        { desc: `Comparação com setor: ${benchmark.nome}`, tipo: 'titulo' },
        { desc: `---`, tipo: 'separador' }
      ];
      
      gaps.forEach(g => {
        const formatVal = g.indicador.includes('%') || g.indicador.includes('Margem') || g.indicador.includes('ROE') ?
          (v) => (v * 100).toFixed(1) + '%' :
          g.indicador.includes('dias') || g.indicador.includes('Ciclo') ?
          (v) => Math.round(v) + ' dias' :
          (v) => v.toFixed(2);
          
        resultado.necessidades.push({
          desc: `${g.indicador}: ${formatVal(g.atual)} → ${formatVal(g.meta)}`,
          tipo: 'gap',
          status: g.tipo === 'inverso' ? 'reduzir' : 'aumentar'
        });
        
        if(g.impacto){
          resultado.necessidades.push({
            desc: `  → Impacto: +${toBRL(g.impacto)} no EBITDA`
          });
        }
      });
      break;
  }
  
  return resultado;
}

// ===== FUNÇÃO: GERAR ROADMAP DE AÇÕES =====
function gerarRoadmap(latest, projecoes, metas, setor){
  const benchmark = BENCHMARKS_SETOR[setor] || BENCHMARKS_SETOR['industria'];
  const roadmap = { Q1: [], Q2: [], Q3: [], Q4: [] };
  
  // Q1: Ações de curto prazo (caixa e capital de giro)
  if(latest.liqImediata < 0.3){
    roadmap.Q1.push({
      acao: 'Constituir reserva de caixa',
      meta: 'Elevar liquidez imediata para 0.3',
      impacto: 'Ter 1 mês de folga para emergências'
    });
  }
  
  if(latest.pmr > 35){
    roadmap.Q1.push({
      acao: 'Implementar cobrança ativa',
      meta: `Reduzir PMR de ${Math.round(latest.pmr)} para 30 dias`,
      impacto: toBRL((latest.pmr - 30) * latest.receita / 360) + ' liberados'
    });
  }
  
  if(latest.pmp < 25){
    roadmap.Q1.push({
      acao: 'Renegociar prazos com fornecedores',
      meta: `Aumentar PMP de ${Math.round(latest.pmp || 0)} para 30 dias`,
      impacto: 'Reduzir necessidade de capital de giro'
    });
  }
  
  // Q2: Eficiência operacional
  if(latest.diasEst > 60){
    roadmap.Q2.push({
      acao: 'Revisar política de estoques',
      meta: `Reduzir PME de ${Math.round(latest.diasEst)} para 45 dias`,
      impacto: toBRL((latest.diasEst - 45) * (latest.receita * 0.6) / 360) + ' liberados'
    });
  }
  
  if(latest.margem < benchmark.margemEbitda){
    roadmap.Q2.push({
      acao: 'Programa de redução de custos',
      meta: `Elevar margem de ${(latest.margem * 100).toFixed(1)}% para ${(benchmark.margemEbitda * 100).toFixed(1)}%`,
      impacto: toBRL((benchmark.margemEbitda - latest.margem) * latest.receita) + '/ano'
    });
  }
  
  if(latest.giroAtv < benchmark.giroAtivo){
    roadmap.Q2.push({
      acao: 'Otimizar utilização de ativos',
      meta: `Elevar giro de ${(latest.giroAtv || 0).toFixed(2)}x para ${benchmark.giroAtivo.toFixed(2)}x`,
      impacto: 'Mais receita com mesma estrutura'
    });
  }
  
  // Q3: Estrutura de capital
  if(latest.alav > 2.5){
    const amortizacaoTri = latest.ebitda * 0.5 / 4; // 50% EBITDA anual / 4
    roadmap.Q3.push({
      acao: 'Programa de desalavancagem',
      meta: `Amortizar ${toBRL(amortizacaoTri)} por trimestre`,
      impacto: `Reduzir DL/EBITDA de ${latest.alav.toFixed(1)}x para 2.5x`
    });
  }
  
  if(latest.composicaoEndCP > 0.6){
    roadmap.Q3.push({
      acao: 'Alongar perfil da dívida',
      meta: 'Trocar dívida CP por LP',
      impacto: 'Aliviar pressão no fluxo de caixa'
    });
  }
  
  if(latest.juros < 3){
    roadmap.Q3.push({
      acao: 'Renegociar taxas de juros',
      meta: 'Reduzir custo médio da dívida',
      impacto: 'Melhorar cobertura de juros'
    });
  }
  
  // Q4: Avaliação e planejamento
  roadmap.Q4.push({
    acao: 'Avaliar resultados do ano',
    meta: 'Comparar realizado vs planejado',
    impacto: 'Base para plano do próximo ano'
  });
  
  roadmap.Q4.push({
    acao: 'Definir metas para próximo ano',
    meta: 'Elaborar orçamento anual',
    impacto: 'Direcionamento estratégico'
  });
  
  if(latest.roe < benchmark.roe){
    roadmap.Q4.push({
      acao: 'Revisão estratégica de rentabilidade',
      meta: `Plano para elevar ROE de ${(latest.roe * 100).toFixed(1)}% para ${(benchmark.roe * 100).toFixed(1)}%`,
      impacto: 'Justificar capital investido'
    });
  }
  
  return roadmap;
}

// ===== FUNÇÃO: RENDERIZAR ABA DE PLANEJAMENTO =====
function renderPlanejamento(rows, nomeEmpresa, setor = 'industria'){
  const container = document.getElementById('planejamentoContent');
  if(!container) return;
  
  if(!rows || rows.length === 0){
    container.innerHTML = `
      <div style="text-align:center; padding:40px; color:var(--text-muted)">
        <div style="font-size:48px; margin-bottom:16px">📊</div>
        <div style="font-size:16px; font-weight:600">Sem dados para planejamento</div>
        <div style="font-size:13px; margin-top:8px">Lance pelo menos 1 ano de dados financeiros</div>
      </div>
    `;
    return;
  }
  
  const latest = rows[0];
  const projecoes = gerarProjecoes(rows, setor);
  const roadmap = gerarRoadmap(latest, projecoes, {}, setor);
  const benchmark = BENCHMARKS_SETOR[setor] || BENCHMARKS_SETOR['industria'];
  
  // Anos históricos
  const anosHistoricos = rows.slice(0, 4).reverse();
  const anoAtual = latest.ano || new Date().getFullYear();
  
  let html = `
    <!-- CABEÇALHO -->
    <div style="background:linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius:12px; padding:24px; margin-bottom:24px; color:#fff">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px">
        <div>
          <div style="font-size:24px; font-weight:800">📈 Planejamento Financeiro</div>
          <div style="font-size:14px; opacity:0.9; margin-top:4px">${nomeEmpresa}</div>
        </div>
        <div style="display:flex; gap:12px; align-items:center">
          <label style="font-size:12px">Setor:</label>
          <select id="setorSelect" style="padding:8px 12px; border-radius:6px; border:none; font-size:13px; background:#fff; color:#1e40af; font-weight:600">
            ${Object.keys(BENCHMARKS_SETOR).map(s => 
              `<option value="${s}" ${s === setor ? 'selected' : ''}>${BENCHMARKS_SETOR[s].nome}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    </div>
    
    <!-- SEÇÃO 1: HISTÓRICO + PROJEÇÕES -->
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:24px">
      <div style="font-size:14px; font-weight:700; color:#1e40af; margin-bottom:16px; display:flex; align-items:center; gap:8px">
        <span>📊</span> HISTÓRICO E PROJEÇÕES (3 ANOS)
      </div>
      
      <div style="overflow-x:auto">
        <table style="width:100%; border-collapse:collapse; font-size:12px">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:10px; text-align:left; border-bottom:2px solid #e2e8f0; min-width:140px">Indicador</th>
              ${anosHistoricos.map(r => `
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e2e8f0; background:#e0f2fe">
                  ${r.ano || '—'}
                </th>
              `).join('')}
              ${projecoes.cenarios.realista.anos.map((a, i) => `
                <th style="padding:10px; text-align:right; border-bottom:2px solid #e2e8f0; background:#dcfce7">
                  ${a.ano}p
                </th>
              `).join('')}
              <th style="padding:10px; text-align:right; border-bottom:2px solid #e2e8f0; background:#fef3c7">
                Benchmark
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- Receita -->
            <tr>
              <td style="padding:10px; border-bottom:1px solid #f1f5f9; font-weight:600">Receita Líquida</td>
              ${anosHistoricos.map(r => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9">${toBRL(r.receita)}</td>
              `).join('')}
              ${projecoes.cenarios.realista.anos.map(a => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#16a34a; font-weight:500">${toBRL(a.receita)}</td>
              `).join('')}
              <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#6b7280">—</td>
            </tr>
            
            <!-- EBITDA -->
            <tr>
              <td style="padding:10px; border-bottom:1px solid #f1f5f9; font-weight:600">EBITDA</td>
              ${anosHistoricos.map(r => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9">${toBRL(r.ebitda)}</td>
              `).join('')}
              ${projecoes.cenarios.realista.anos.map(a => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#16a34a; font-weight:500">${toBRL(a.ebitda)}</td>
              `).join('')}
              <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#6b7280">—</td>
            </tr>
            
            <!-- Margem EBITDA -->
            <tr style="background:#f8fafc">
              <td style="padding:10px; border-bottom:1px solid #f1f5f9">↳ Margem EBITDA</td>
              ${anosHistoricos.map(r => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:${r.margem >= benchmark.margemEbitda ? '#16a34a' : '#dc2626'}">${r.margem ? (r.margem * 100).toFixed(1) + '%' : '—'}</td>
              `).join('')}
              ${projecoes.cenarios.realista.anos.map(a => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#16a34a">${(a.margemEbitda * 100).toFixed(1)}%</td>
              `).join('')}
              <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#d97706; font-weight:600">${(benchmark.margemEbitda * 100).toFixed(1)}%</td>
            </tr>
            
            <!-- Lucro Líquido -->
            <tr>
              <td style="padding:10px; border-bottom:1px solid #f1f5f9; font-weight:600">Lucro Líquido</td>
              ${anosHistoricos.map(r => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9">${toBRL(r.lucroLiq)}</td>
              `).join('')}
              ${projecoes.cenarios.realista.anos.map(a => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#16a34a; font-weight:500">${toBRL(a.lucroLiq)}</td>
              `).join('')}
              <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#6b7280">—</td>
            </tr>
            
            <!-- ROE -->
            <tr style="background:#f8fafc">
              <td style="padding:10px; border-bottom:1px solid #f1f5f9">ROE</td>
              ${anosHistoricos.map(r => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:${r.roe >= benchmark.roe ? '#16a34a' : '#dc2626'}">${r.roe ? (r.roe * 100).toFixed(1) + '%' : '—'}</td>
              `).join('')}
              ${projecoes.cenarios.realista.anos.map(a => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#16a34a">${(a.roe * 100).toFixed(1)}%</td>
              `).join('')}
              <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#d97706; font-weight:600">${(benchmark.roe * 100).toFixed(1)}%</td>
            </tr>
            
            <!-- DL/EBITDA -->
            <tr>
              <td style="padding:10px; border-bottom:1px solid #f1f5f9">DL/EBITDA</td>
              ${anosHistoricos.map(r => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:${r.alav <= benchmark.dlEbitda ? '#16a34a' : '#dc2626'}">${r.alav != null ? r.alav.toFixed(2) + 'x' : '—'}</td>
              `).join('')}
              ${projecoes.cenarios.realista.anos.map(a => `
                <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#16a34a">${a.dlEbitda.toFixed(2)}x</td>
              `).join('')}
              <td style="padding:10px; text-align:right; border-bottom:1px solid #f1f5f9; color:#d97706; font-weight:600">${benchmark.dlEbitda.toFixed(1)}x</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div style="margin-top:16px; padding:12px; background:#f0f9ff; border-radius:8px; font-size:11px; color:#1e40af">
        📈 <strong>Taxa de crescimento histórica:</strong> 
        Receita ${(projecoes.taxas.receita * 100).toFixed(1)}%/ano | 
        EBITDA ${(projecoes.taxas.ebitda * 100).toFixed(1)}%/ano | 
        Lucro ${(projecoes.taxas.lucro * 100).toFixed(1)}%/ano
      </div>
    </div>
    
    <!-- SEÇÃO 2: CENÁRIOS -->
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:24px">
      <div style="font-size:14px; font-weight:700; color:#1e40af; margin-bottom:16px; display:flex; align-items:center; gap:8px">
        <span>🎯</span> CENÁRIOS PROJETADOS (${anoAtual + 3})
      </div>
      
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px">
        ${Object.keys(projecoes.cenarios).map(cenario => {
          const c = projecoes.cenarios[cenario];
          const ultimo = c.anos[2];
          return `
            <div style="background:${c.cor}10; border:2px solid ${c.cor}; border-radius:12px; padding:16px">
              <div style="font-size:13px; font-weight:700; color:${c.cor}; margin-bottom:12px">${c.nome.toUpperCase()}</div>
              
              <div style="display:grid; gap:8px">
                <div style="display:flex; justify-content:space-between">
                  <span style="font-size:11px; color:#6b7280">Receita</span>
                  <span style="font-size:12px; font-weight:600">${toBRL(ultimo.receita)}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                  <span style="font-size:11px; color:#6b7280">EBITDA</span>
                  <span style="font-size:12px; font-weight:600">${toBRL(ultimo.ebitda)}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                  <span style="font-size:11px; color:#6b7280">Lucro Líq.</span>
                  <span style="font-size:12px; font-weight:600">${toBRL(ultimo.lucroLiq)}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                  <span style="font-size:11px; color:#6b7280">ROE</span>
                  <span style="font-size:12px; font-weight:600">${(ultimo.roe * 100).toFixed(1)}%</span>
                </div>
              </div>
              
              <div style="margin-top:12px; padding-top:12px; border-top:1px solid ${c.cor}30; font-size:10px; color:#6b7280; text-align:center">
                Crescimento: ${cenario === 'pessimista' ? '50%' : cenario === 'realista' ? '100%' : '150%'} do histórico
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    
    <!-- SEÇÃO 3: BENCHMARK DO SETOR -->
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:24px">
      <div style="font-size:14px; font-weight:700; color:#1e40af; margin-bottom:16px; display:flex; align-items:center; gap:8px">
        <span>📊</span> COMPARAÇÃO COM BENCHMARK - ${benchmark.nome.toUpperCase()}
      </div>
      
      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:16px">
        ${[
          { nome: 'Margem EBITDA', atual: latest.margem, bench: benchmark.margemEbitda, formato: 'pct', melhor: 'maior' },
          { nome: 'Margem Líquida', atual: latest.margemLiq, bench: benchmark.margemLiquida, formato: 'pct', melhor: 'maior' },
          { nome: 'Liquidez Corrente', atual: latest.liqCorrente, bench: benchmark.liquidezCorrente, formato: 'dec', melhor: 'maior' },
          { nome: 'DL/EBITDA', atual: latest.alav, bench: benchmark.dlEbitda, formato: 'x', melhor: 'menor' },
          { nome: 'ROE', atual: latest.roe, bench: benchmark.roe, formato: 'pct', melhor: 'maior' },
          { nome: 'ROA', atual: latest.roa, bench: benchmark.roa, formato: 'pct', melhor: 'maior' },
          { nome: 'Giro do Ativo', atual: latest.giroAtv, bench: benchmark.giroAtivo, formato: 'x', melhor: 'maior' },
          { nome: 'Ciclo Financeiro', atual: latest.ciclo, bench: benchmark.cicloFinanceiro, formato: 'dias', melhor: 'menor' }
        ].map(item => {
          const formatVal = (v) => {
            if(v == null) return '—';
            if(item.formato === 'pct') return (v * 100).toFixed(1) + '%';
            if(item.formato === 'x') return v.toFixed(2) + 'x';
            if(item.formato === 'dias') return Math.round(v) + ' dias';
            return v.toFixed(2);
          };
          
          const atual = item.atual || 0;
          const bench = item.bench;
          const isBom = item.melhor === 'maior' ? atual >= bench : atual <= bench;
          const gap = item.melhor === 'maior' ? bench - atual : atual - bench;
          const pctGap = bench !== 0 ? Math.abs(gap / bench * 100) : 0;
          
          return `
            <div style="display:flex; align-items:center; gap:12px; padding:12px; background:#f8fafc; border-radius:8px">
              <div style="width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px; background:${isBom ? '#dcfce7' : '#fef2f2'}">
                ${isBom ? '✓' : '↑'}
              </div>
              <div style="flex:1">
                <div style="font-size:11px; color:#6b7280">${item.nome}</div>
                <div style="display:flex; align-items:baseline; gap:8px">
                  <span style="font-size:16px; font-weight:700; color:${isBom ? '#16a34a' : '#dc2626'}">${formatVal(atual)}</span>
                  <span style="font-size:11px; color:#6b7280">vs ${formatVal(bench)}</span>
                </div>
              </div>
              ${!isBom ? `
                <div style="text-align:right">
                  <div style="font-size:10px; color:#dc2626">Gap</div>
                  <div style="font-size:12px; font-weight:600; color:#dc2626">${pctGap.toFixed(0)}%</div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
    
    <!-- SEÇÃO 4: SIMULADOR DE METAS -->
    <div style="background:linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border:2px solid #f59e0b; border-radius:12px; padding:20px; margin-bottom:24px">
      <div style="font-size:14px; font-weight:700; color:#92400e; margin-bottom:16px; display:flex; align-items:center; gap:8px">
        <span>🎯</span> SIMULADOR DE METAS
      </div>
      
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:16px">
        <button class="sim-btn" data-tipo="receita" style="padding:16px; background:#fff; border:2px solid #d97706; border-radius:8px; cursor:pointer; transition:all 0.2s">
          <div style="font-size:24px; margin-bottom:8px">📈</div>
          <div style="font-size:12px; font-weight:600; color:#92400e">Crescer Receita</div>
          <div style="font-size:10px; color:#6b7280; margin-top:4px">Definir % de crescimento</div>
        </button>
        
        <button class="sim-btn" data-tipo="lucro" style="padding:16px; background:#fff; border:2px solid #d97706; border-radius:8px; cursor:pointer; transition:all 0.2s">
          <div style="font-size:24px; margin-bottom:8px">💰</div>
          <div style="font-size:12px; font-weight:600; color:#92400e">Meta de Lucro</div>
          <div style="font-size:10px; color:#6b7280; margin-top:4px">Definir valor desejado</div>
        </button>
        
        <button class="sim-btn" data-tipo="alavancagem" style="padding:16px; background:#fff; border:2px solid #d97706; border-radius:8px; cursor:pointer; transition:all 0.2s">
          <div style="font-size:24px; margin-bottom:8px">🏦</div>
          <div style="font-size:12px; font-weight:600; color:#92400e">Desalavancar</div>
          <div style="font-size:10px; color:#6b7280; margin-top:4px">Reduzir DL/EBITDA</div>
        </button>
        
        <button class="sim-btn" data-tipo="benchmark" style="padding:16px; background:#fff; border:2px solid #d97706; border-radius:8px; cursor:pointer; transition:all 0.2s">
          <div style="font-size:24px; margin-bottom:8px">🏆</div>
          <div style="font-size:12px; font-weight:600; color:#92400e">Igualar Setor</div>
          <div style="font-size:10px; color:#6b7280; margin-top:4px">Alcançar benchmark</div>
        </button>
      </div>
      
      <div id="simuladorInput" style="display:none; padding:16px; background:#fff; border-radius:8px; margin-bottom:16px">
        <!-- Preenchido dinamicamente -->
      </div>
      
      <div id="simuladorResultado" style="display:none; padding:16px; background:#fff; border-radius:8px">
        <!-- Preenchido dinamicamente -->
      </div>
    </div>
    
    <!-- SEÇÃO 5: ROADMAP TRIMESTRAL -->
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:24px">
      <div style="font-size:14px; font-weight:700; color:#1e40af; margin-bottom:16px; display:flex; align-items:center; gap:8px">
        <span>🗺️</span> ROADMAP DE AÇÕES - ${anoAtual + 1}
      </div>
      
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px">
        ${['Q1', 'Q2', 'Q3', 'Q4'].map((q, idx) => {
          const cores = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
          const acoes = roadmap[q] || [];
          return `
            <div style="border:2px solid ${cores[idx]}; border-radius:12px; overflow:hidden">
              <div style="background:${cores[idx]}; color:#fff; padding:12px; text-align:center; font-weight:700">
                ${q}/${anoAtual + 1}
              </div>
              <div style="padding:12px">
                ${acoes.length > 0 ? acoes.map(a => `
                  <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #f1f5f9">
                    <div style="font-size:12px; font-weight:600; color:#1e293b">${a.acao}</div>
                    <div style="font-size:10px; color:#6b7280; margin-top:4px">Meta: ${a.meta}</div>
                    <div style="font-size:10px; color:${cores[idx]}; margin-top:2px; font-weight:500">→ ${a.impacto}</div>
                  </div>
                `).join('') : `
                  <div style="font-size:11px; color:#9ca3af; text-align:center; padding:20px 0">
                    Sem ações prioritárias
                  </div>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    
    <!-- SEÇÃO 6: RESUMO EXECUTIVO -->
    <div style="background:linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius:12px; padding:24px; color:#fff">
      <div style="font-size:14px; font-weight:700; margin-bottom:16px; display:flex; align-items:center; gap:8px">
        <span>📋</span> RESUMO EXECUTIVO DO PLANEJAMENTO
      </div>
      
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px">
        <div style="background:rgba(255,255,255,0.1); border-radius:8px; padding:16px">
          <div style="font-size:11px; opacity:0.7; margin-bottom:8px">PROJEÇÃO ${anoAtual + 3} (Realista)</div>
          <div style="font-size:20px; font-weight:700">${toBRL(projecoes.cenarios.realista.anos[2].receita)}</div>
          <div style="font-size:11px; opacity:0.7; margin-top:4px">Receita projetada</div>
        </div>
        
        <div style="background:rgba(255,255,255,0.1); border-radius:8px; padding:16px">
          <div style="font-size:11px; opacity:0.7; margin-bottom:8px">POTENCIAL DE MELHORIA</div>
          <div style="font-size:20px; font-weight:700">${toBRL((benchmark.margemEbitda - (latest.margem || 0)) * latest.receita)}</div>
          <div style="font-size:11px; opacity:0.7; margin-top:4px">Se atingir margem do setor</div>
        </div>
        
        <div style="background:rgba(255,255,255,0.1); border-radius:8px; padding:16px">
          <div style="font-size:11px; opacity:0.7; margin-bottom:8px">AÇÕES PRIORITÁRIAS</div>
          <div style="font-size:20px; font-weight:700">${Object.values(roadmap).flat().length}</div>
          <div style="font-size:11px; opacity:0.7; margin-top:4px">Iniciativas mapeadas</div>
        </div>
      </div>
      
      <div style="margin-top:16px; padding:12px; background:rgba(255,255,255,0.1); border-radius:8px; font-size:12px">
        💡 <strong>Próximos passos:</strong> 
        Revisar metas com a empresa, validar premissas de crescimento, definir responsáveis por cada ação do roadmap, 
        e acompanhar trimestralmente o progresso vs planejado.
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Event listeners para o simulador
  container.querySelectorAll('.sim-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tipo = btn.dataset.tipo;
      mostrarSimulador(tipo, latest, setor);
    });
    
    btn.addEventListener('mouseover', () => {
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
    });
    
    btn.addEventListener('mouseout', () => {
      btn.style.transform = '';
      btn.style.boxShadow = '';
    });
  });
  
  // Event listener para mudança de setor
  const setorSelect = document.getElementById('setorSelect');
  if(setorSelect){
    setorSelect.addEventListener('change', () => {
      renderPlanejamento(rows, nomeEmpresa, setorSelect.value);
    });
  }
}

// ===== FUNÇÃO: MOSTRAR SIMULADOR =====
function mostrarSimulador(tipo, latest, setor){
  const inputDiv = document.getElementById('simuladorInput');
  const resultDiv = document.getElementById('simuladorResultado');
  
  if(!inputDiv || !resultDiv) return;
  
  inputDiv.style.display = 'block';
  resultDiv.style.display = 'none';
  
  let inputHtml = '';
  
  switch(tipo){
    case 'receita':
      inputHtml = `
        <div style="font-size:13px; font-weight:600; color:#92400e; margin-bottom:12px">📈 Definir meta de crescimento de receita</div>
        <div style="display:flex; align-items:center; gap:12px">
          <span style="font-size:13px">Crescer</span>
          <input type="number" id="simValor" value="20" min="0" max="200" style="width:80px; padding:8px; border:2px solid #d97706; border-radius:6px; font-size:14px; font-weight:600; text-align:center">
          <span style="font-size:13px">% em relação ao ano atual (${toBRL(latest.receita)})</span>
          <button id="simCalcular" style="padding:10px 20px; background:#d97706; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer">Calcular</button>
        </div>
      `;
      break;
      
    case 'lucro':
      inputHtml = `
        <div style="font-size:13px; font-weight:600; color:#92400e; margin-bottom:12px">💰 Definir meta de lucro líquido</div>
        <div style="display:flex; align-items:center; gap:12px">
          <span style="font-size:13px">Atingir lucro de R$</span>
          <input type="number" id="simValor" value="${Math.round((latest.lucroLiq || 0) * 1.5)}" style="width:120px; padding:8px; border:2px solid #d97706; border-radius:6px; font-size:14px; font-weight:600; text-align:center">
          <span style="font-size:13px">(atual: ${toBRL(latest.lucroLiq)})</span>
          <button id="simCalcular" style="padding:10px 20px; background:#d97706; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer">Calcular</button>
        </div>
      `;
      break;
      
    case 'alavancagem':
      inputHtml = `
        <div style="font-size:13px; font-weight:600; color:#92400e; margin-bottom:12px">🏦 Definir meta de desalavancagem</div>
        <div style="display:flex; align-items:center; gap:12px">
          <span style="font-size:13px">Reduzir DL/EBITDA para</span>
          <input type="number" id="simValor" value="2.0" step="0.1" min="0" max="10" style="width:80px; padding:8px; border:2px solid #d97706; border-radius:6px; font-size:14px; font-weight:600; text-align:center">
          <span style="font-size:13px">x (atual: ${latest.alav ? latest.alav.toFixed(2) : '—'}x)</span>
          <button id="simCalcular" style="padding:10px 20px; background:#d97706; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer">Calcular</button>
        </div>
      `;
      break;
      
    case 'benchmark':
      inputHtml = `
        <div style="font-size:13px; font-weight:600; color:#92400e; margin-bottom:12px">🏆 Igualar benchmark do setor</div>
        <div style="display:flex; align-items:center; gap:12px">
          <span style="font-size:13px">Calcular gap para atingir indicadores médios do setor</span>
          <button id="simCalcular" style="padding:10px 20px; background:#d97706; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer">Analisar Gaps</button>
        </div>
      `;
      break;
  }
  
  inputDiv.innerHTML = inputHtml;
  
  // Event listener para calcular
  const btnCalcular = document.getElementById('simCalcular');
  if(btnCalcular){
    btnCalcular.addEventListener('click', () => {
      const inputValor = document.getElementById('simValor');
      const valor = inputValor ? parseFloat(inputValor.value) : 0;
      
      const resultado = simularMeta(latest, valor, tipo, setor);
      mostrarResultadoSimulacao(resultado, tipo);
    });
  }
}

// ===== FUNÇÃO: MOSTRAR RESULTADO DA SIMULAÇÃO =====
function mostrarResultadoSimulacao(resultado, tipo){
  const resultDiv = document.getElementById('simuladorResultado');
  if(!resultDiv) return;
  
  resultDiv.style.display = 'block';
  
  let html = `<div style="font-size:13px; font-weight:600; color:#16a34a; margin-bottom:12px">✅ RESULTADO DA SIMULAÇÃO</div>`;
  
  html += `<div style="display:grid; gap:8px">`;
  
  resultado.necessidades.forEach(item => {
    if(item.tipo === 'separador'){
      html += `<div style="border-top:1px solid #e2e8f0; margin:4px 0"></div>`;
    } else if(item.tipo === 'titulo'){
      html += `<div style="font-size:12px; font-weight:700; color:#1e293b">${item.desc}</div>`;
    } else if(item.tipo === 'opcao'){
      html += `<div style="font-size:12px; font-weight:600; color:#3b82f6; margin-top:8px">${item.desc}</div>`;
    } else if(item.tipo === 'acao'){
      html += `<div style="font-size:11px; padding:8px; background:#dcfce7; border-radius:6px; color:#16a34a">💡 ${item.desc}</div>`;
    } else if(item.tipo === 'gap'){
      html += `<div style="font-size:12px; padding:6px 10px; background:${item.status === 'reduzir' ? '#fef2f2' : '#f0f9ff'}; border-radius:4px; display:flex; align-items:center; gap:8px">
        <span style="color:${item.status === 'reduzir' ? '#dc2626' : '#2563eb'}">${item.status === 'reduzir' ? '↓' : '↑'}</span>
        ${item.desc}
      </div>`;
    } else {
      html += `<div style="font-size:12px; color:#374151; padding:4px 0; display:flex; justify-content:space-between">
        <span>${item.desc}</span>
        ${item.valor !== undefined ? `<span style="font-weight:600">${typeof item.valor === 'number' ? toBRL(item.valor) : item.valor}</span>` : ''}
      </div>`;
    }
  });
  
  html += `</div>`;
  
  // Se tem DRE projetada
  if(resultado.dre && resultado.dre.receita){
    html += `
      <div style="margin-top:16px; padding:12px; background:#f0f9ff; border-radius:8px">
        <div style="font-size:11px; font-weight:600; color:#1e40af; margin-bottom:8px">📊 DRE PROJETADA</div>
        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; font-size:11px">
          <div>Receita: <strong>${toBRL(resultado.dre.receita)}</strong></div>
          <div>CMV: <strong>${toBRL(resultado.dre.cmv)}</strong></div>
          <div>Lucro Bruto: <strong>${toBRL(resultado.dre.lucroBruto)}</strong></div>
          <div>EBITDA: <strong>${toBRL(resultado.dre.ebitda)}</strong></div>
        </div>
      </div>
    `;
  }
  
  // Se tem balanço projetado
  if(resultado.balanco && resultado.balanco.ncg){
    html += `
      <div style="margin-top:12px; padding:12px; background:#ecfdf5; border-radius:8px">
        <div style="font-size:11px; font-weight:600; color:#16a34a; margin-bottom:8px">📋 BALANÇO PROJETADO (parcial)</div>
        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; font-size:11px">
          <div>Contas a Receber: <strong>${toBRL(resultado.balanco.contasReceber)}</strong></div>
          <div>Estoques: <strong>${toBRL(resultado.balanco.estoques)}</strong></div>
          <div>Fornecedores: <strong>${toBRL(resultado.balanco.fornecedores)}</strong></div>
          <div>NCG: <strong>${toBRL(resultado.balanco.ncg)}</strong></div>
        </div>
      </div>
    `;
  }
  
  resultDiv.innerHTML = html;
}

// Expor função globalmente
window.renderPlanejamento = renderPlanejamento;
window.BENCHMARKS_SETOR = BENCHMARKS_SETOR;

// ================================================================================
// ==================== MÓDULO DE DÍVIDAS BANCÁRIAS ====================
// ================================================================================

// ===== LISTAS DE REFERÊNCIA =====
const LISTA_BANCOS = [
  { id: 'bb', nome: 'Banco do Brasil' },
  { id: 'caixa', nome: 'Caixa Econômica Federal' },
  { id: 'bradesco', nome: 'Bradesco' },
  { id: 'itau', nome: 'Itaú' },
  { id: 'santander', nome: 'Santander' },
  { id: 'safra', nome: 'Safra' },
  { id: 'btg', nome: 'BTG Pactual' },
  { id: 'sicredi', nome: 'Sicredi' },
  { id: 'sicoob', nome: 'Sicoob' },
  { id: 'banrisul', nome: 'Banrisul' },
  { id: 'brde', nome: 'BRDE' },
  { id: 'bndes', nome: 'BNDES' },
  { id: 'abc', nome: 'Banco ABC Brasil' },
  { id: 'votorantim', nome: 'Banco Votorantim' },
  { id: 'daycoval', nome: 'Daycoval' },
  { id: 'pine', nome: 'Pine' },
  { id: 'sofisa', nome: 'Sofisa' },
  { id: 'inter', nome: 'Banco Inter' },
  { id: 'c6', nome: 'C6 Bank' },
  { id: 'original', nome: 'Banco Original' },
  { id: 'outro', nome: 'Outro' }
];

const TIPOS_OPERACAO = [
  { id: 'conta_garantida', nome: 'Conta Garantida / Cheque Especial', categoria: 'giro' },
  { id: 'capital_giro', nome: 'Capital de Giro', categoria: 'giro' },
  { id: 'antecip_recebiveis', nome: 'Antecipação de Recebíveis', categoria: 'giro' },
  { id: 'desconto_duplicatas', nome: 'Desconto de Duplicatas', categoria: 'giro' },
  { id: 'desconto_cheques', nome: 'Desconto de Cheques', categoria: 'giro' },
  { id: 'cartao_credito', nome: 'Antecipação de Cartões', categoria: 'giro' },
  { id: 'credito_rotativo', nome: 'Crédito Rotativo', categoria: 'giro' },
  { id: 'bndes_automatico', nome: 'BNDES Automático', categoria: 'investimento' },
  { id: 'finame', nome: 'Finame', categoria: 'investimento' },
  { id: 'finame_direto', nome: 'Finame Direto', categoria: 'investimento' },
  { id: 'financ_maquinas', nome: 'Financiamento de Máquinas', categoria: 'investimento' },
  { id: 'financ_veiculos', nome: 'Financiamento de Veículos', categoria: 'investimento' },
  { id: 'financ_imobiliario', nome: 'Financiamento Imobiliário', categoria: 'investimento' },
  { id: 'leasing', nome: 'Leasing/Arrendamento', categoria: 'investimento' },
  { id: 'proger', nome: 'Proger', categoria: 'investimento' },
  { id: 'fce', nome: 'FCO/FNE/FNO', categoria: 'investimento' },
  { id: 'acc', nome: 'ACC', categoria: 'comex' },
  { id: 'ace', nome: 'ACE', categoria: 'comex' },
  { id: 'finimp', nome: 'Finimp', categoria: 'comex' },
  { id: 'prorural', nome: 'Crédito Rural', categoria: 'rural' },
  { id: 'custeio', nome: 'Custeio Agrícola', categoria: 'rural' },
  { id: 'investimento_rural', nome: 'Investimento Rural', categoria: 'rural' },
  { id: 'cpr', nome: 'CPR Financeira', categoria: 'rural' },
  { id: 'debentures', nome: 'Debêntures', categoria: 'mercado' },
  { id: 'cri', nome: 'CRI', categoria: 'mercado' },
  { id: 'cra', nome: 'CRA', categoria: 'mercado' },
  { id: 'nota_comercial', nome: 'Nota Comercial', categoria: 'mercado' },
  { id: 'outro', nome: 'Outro', categoria: 'outro' }
];

const TIPOS_GARANTIA = [
  { id: 'imovel_urbano', nome: 'Imóvel Urbano', tipo: 'real' },
  { id: 'imovel_rural', nome: 'Imóvel Rural', tipo: 'real' },
  { id: 'maquinas', nome: 'Máquinas e Equipamentos', tipo: 'real' },
  { id: 'veiculos', nome: 'Veículos', tipo: 'real' },
  { id: 'estoques', nome: 'Estoques', tipo: 'real' },
  { id: 'recebiveis', nome: 'Recebíveis/Duplicatas', tipo: 'real' },
  { id: 'aplicacoes', nome: 'Aplicações Financeiras', tipo: 'real' },
  { id: 'aval', nome: 'Aval dos Sócios', tipo: 'pessoal' },
  { id: 'fianca', nome: 'Fiança', tipo: 'pessoal' },
  { id: 'carta_fianca', nome: 'Carta de Fiança Bancária', tipo: 'pessoal' },
  { id: 'fgi', nome: 'FGI (Fundo Garantidor)', tipo: 'fundo' },
  { id: 'fampe', nome: 'Fampe (Sebrae)', tipo: 'fundo' },
  { id: 'seguro_credito', nome: 'Seguro de Crédito', tipo: 'seguro' },
  { id: 'sem_garantia', nome: 'Sem Garantia (Clean)', tipo: 'nenhuma' }
];

const TIPOS_INDEXADOR = [
  { id: 'pre', nome: 'Pré-fixado' },
  { id: 'cdi', nome: 'CDI +' },
  { id: 'selic', nome: 'SELIC +' },
  { id: 'ipca', nome: 'IPCA +' },
  { id: 'igpm', nome: 'IGP-M +' },
  { id: 'tlp', nome: 'TLP +' },
  { id: 'tjlp', nome: 'TJLP +' },
  { id: 'tr', nome: 'TR +' },
  { id: 'dolar', nome: 'Variação Cambial +' }
];

let OPERACOES_DIVIDA = [];

function gerarIdOperacao() {
  return 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function calcularTaxaAnual(taxaMensal) {
  return (Math.pow(1 + taxaMensal / 100, 12) - 1) * 100;
}

function calcularCustoTotalReciprocidades(operacao) {
  let custoMensal = 0;
  if (operacao.reciprocidades) {
    custoMensal += operacao.reciprocidades.seguroPrestamistaValor || 0;
    custoMensal += operacao.reciprocidades.seguroBemValor || 0;
    custoMensal += operacao.reciprocidades.capitalizacaoValor || 0;
    custoMensal += operacao.reciprocidades.consorcioValor || 0;
    custoMensal += operacao.reciprocidades.tarifasValor || 0;
    custoMensal += operacao.reciprocidades.outrosCustos || 0;
  }
  return custoMensal;
}

function calcularCustoEfetivo(operacao) {
  const custoRecip = calcularCustoTotalReciprocidades(operacao);
  const saldo = operacao.saldoDevedor || 0;
  if (saldo <= 0) return operacao.taxaMensal || 0;
  const custoRecipPct = (custoRecip / saldo) * 100;
  return (operacao.taxaMensal || 0) + custoRecipPct;
}

async function carregarOperacoesDivida(empresaId) {
  try {
    const snap = await db.collection('empresas').doc(empresaId).collection('operacoes_divida').get();
    OPERACOES_DIVIDA = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return OPERACOES_DIVIDA;
  } catch (e) {
    console.error('[carregarOperacoesDivida] Erro:', e);
    OPERACOES_DIVIDA = [];
    return [];
  }
}

async function salvarOperacaoDivida(empresaId, operacao) {
  try {
    const ref = db.collection('empresas').doc(empresaId).collection('operacoes_divida');
    if (operacao.id && !operacao.id.startsWith('op_')) {
      await ref.doc(operacao.id).update({...operacao, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()});
    } else {
      const docRef = await ref.add({...operacao, criadoEm: firebase.firestore.FieldValue.serverTimestamp()});
      operacao.id = docRef.id;
    }
    await carregarOperacoesDivida(empresaId);
    return true;
  } catch (e) {
    console.error('[salvarOperacaoDivida] Erro:', e);
    alert('Erro ao salvar: ' + e.message);
    return false;
  }
}

async function excluirOperacaoDivida(empresaId, operacaoId) {
  try {
    await db.collection('empresas').doc(empresaId).collection('operacoes_divida').doc(operacaoId).delete();
    await carregarOperacoesDivida(empresaId);
    return true;
  } catch (e) {
    console.error('[excluirOperacaoDivida] Erro:', e);
    return false;
  }
}

function calcularConsolidadoDividas(operacoes, dadosEmpresa) {
  const consolidado = {
    totalDividaBruta: 0, totalParcelas: 0, custoMedioPonderado: 0,
    custoEfetivoPonderado: 0, totalReciprocidades: 0, qtdOperacoes: operacoes.length,
    porBanco: {}, porTipo: {}, porIndexador: {}, porCategoria: {},
    vencimentos: [], operacoesOrdenadas: []
  };
  
  let somaPonderadaTaxa = 0, somaPonderadaCET = 0;
  
  operacoes.forEach(op => {
    const saldo = op.saldoDevedor || 0;
    const parcela = op.valorParcela || 0;
    const taxaMensal = op.taxaMensal || 0;
    const custoEfetivo = calcularCustoEfetivo(op);
    const custoRecip = calcularCustoTotalReciprocidades(op);
    
    consolidado.totalDividaBruta += saldo;
    consolidado.totalParcelas += parcela;
    consolidado.totalReciprocidades += custoRecip;
    somaPonderadaTaxa += saldo * taxaMensal;
    somaPonderadaCET += saldo * custoEfetivo;
    
    const bancoNome = LISTA_BANCOS.find(b => b.id === op.banco)?.nome || op.bancoOutro || 'Outro';
    if (!consolidado.porBanco[bancoNome]) consolidado.porBanco[bancoNome] = { saldo: 0, parcelas: 0, qtd: 0 };
    consolidado.porBanco[bancoNome].saldo += saldo;
    consolidado.porBanco[bancoNome].parcelas += parcela;
    consolidado.porBanco[bancoNome].qtd++;
    
    const tipoInfo = TIPOS_OPERACAO.find(t => t.id === op.tipoOperacao);
    const tipoNome = tipoInfo?.nome || 'Outro';
    const categoria = tipoInfo?.categoria || 'outro';
    if (!consolidado.porTipo[tipoNome]) consolidado.porTipo[tipoNome] = { saldo: 0, parcelas: 0, qtd: 0 };
    consolidado.porTipo[tipoNome].saldo += saldo;
    consolidado.porTipo[tipoNome].qtd++;
    
    const categoriaNome = { giro: 'Capital de Giro', investimento: 'Investimento', comex: 'Comércio Exterior', rural: 'Rural', mercado: 'Mercado de Capitais', outro: 'Outros' }[categoria] || 'Outros';
    if (!consolidado.porCategoria[categoriaNome]) consolidado.porCategoria[categoriaNome] = { saldo: 0, parcelas: 0, qtd: 0 };
    consolidado.porCategoria[categoriaNome].saldo += saldo;
    consolidado.porCategoria[categoriaNome].qtd++;
    
    const indexadorNome = TIPOS_INDEXADOR.find(i => i.id === op.indexador)?.nome || 'Outro';
    if (!consolidado.porIndexador[indexadorNome]) consolidado.porIndexador[indexadorNome] = { saldo: 0, qtd: 0 };
    consolidado.porIndexador[indexadorNome].saldo += saldo;
    consolidado.porIndexador[indexadorNome].qtd++;
  });
  
  if (consolidado.totalDividaBruta > 0) {
    consolidado.custoMedioPonderado = somaPonderadaTaxa / consolidado.totalDividaBruta;
    consolidado.custoEfetivoPonderado = somaPonderadaCET / consolidado.totalDividaBruta;
  }
  
  consolidado.operacoesOrdenadas = operacoes.map(op => ({ ...op, custoEfetivo: calcularCustoEfetivo(op) })).sort((a, b) => b.custoEfetivo - a.custoEfetivo);
  
  if (dadosEmpresa) {
    const ebitda = dadosEmpresa.ebitda || 0;
    consolidado.dlEbitda = ebitda > 0 ? consolidado.totalDividaBruta / ebitda : null;
    consolidado.parcelasSobreEbitda = ebitda > 0 ? (consolidado.totalParcelas * 12) / ebitda : null;
    consolidado.custoAnualJuros = consolidado.totalDividaBruta * consolidado.custoMedioPonderado * 12 / 100;
  }
  
  return consolidado;
}

function gerarRecomendacoesDividas(operacoes, consolidado, dadosEmpresa) {
  const recomendacoes = [];
  if (operacoes.length === 0) return recomendacoes;
  
  const taxaMedia = consolidado.custoMedioPonderado;
  consolidado.operacoesOrdenadas.slice(0, 3).forEach(op => {
    if (op.custoEfetivo > taxaMedia * 1.15) {
      const economia = op.saldoDevedor * (op.custoEfetivo - taxaMedia) * 12 / 100;
      const bancoNome = LISTA_BANCOS.find(b => b.id === op.banco)?.nome || 'Banco';
      recomendacoes.push({
        tipo: 'critico', titulo: 'Renegociar/Portar operação ' + bancoNome,
        descricao: 'Taxa de ' + op.custoEfetivo.toFixed(2) + '% a.m. está ' + ((op.custoEfetivo / taxaMedia - 1) * 100).toFixed(0) + '% acima da média. Saldo: ' + toBRL(op.saldoDevedor),
        economia: economia, operacaoId: op.id
      });
    }
  });
  
  operacoes.forEach(op => {
    const custoRecip = calcularCustoTotalReciprocidades(op);
    if (custoRecip > 10000) {
      const bancoNome = LISTA_BANCOS.find(b => b.id === op.banco)?.nome || 'Banco';
      recomendacoes.push({
        tipo: 'atencao', titulo: 'Reciprocidades elevadas - ' + bancoNome,
        descricao: 'Custos extras de ' + toBRL(custoRecip) + '/mês com seguros, capitalização, etc.',
        economia: custoRecip * 12
      });
    }
  });
  
  Object.entries(consolidado.porBanco).forEach(([banco, dados]) => {
    const pct = dados.saldo / consolidado.totalDividaBruta;
    if (pct > 0.4 && Object.keys(consolidado.porBanco).length > 1) {
      recomendacoes.push({
        tipo: 'atencao', titulo: 'Alta concentração em ' + banco,
        descricao: (pct * 100).toFixed(0) + '% da dívida está neste banco. Isso reduz poder de negociação.'
      });
    }
  });
  
  const operacoesGiro = operacoes.filter(op => TIPOS_OPERACAO.find(t => t.id === op.tipoOperacao)?.categoria === 'giro');
  if (operacoesGiro.length >= 3) {
    const totalGiro = operacoesGiro.reduce((s, op) => s + (op.saldoDevedor || 0), 0);
    recomendacoes.push({
      tipo: 'oportunidade', titulo: 'Consolidar operações de capital de giro',
      descricao: operacoesGiro.length + ' operações de giro totalizam ' + toBRL(totalGiro) + '. Consolidar pode reduzir taxa.',
      economia: totalGiro * 0.003 * 12
    });
  }
  
  if (consolidado.dlEbitda && consolidado.dlEbitda > 3) {
    recomendacoes.push({
      tipo: 'critico', titulo: 'Alavancagem elevada',
      descricao: 'DL/EBITDA de ' + consolidado.dlEbitda.toFixed(1) + 'x está acima do recomendado (2.5x).'
    });
  }
  
  const ordem = { urgente: 0, critico: 1, atencao: 2, oportunidade: 3 };
  recomendacoes.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
  return recomendacoes;
}

function simularPortabilidade(operacao, novaTaxa, novoPrazo) {
  const saldo = operacao.saldoDevedor || 0;
  const parcelaAtual = operacao.valorParcela || 0;
  const parcelasRestantes = operacao.parcelasRestantes || 0;
  const custoRecipAtual = calcularCustoTotalReciprocidades(operacao);
  
  const novaTaxaDec = novaTaxa / 100;
  const novaParcela = novoPrazo > 0 ? saldo * (novaTaxaDec * Math.pow(1 + novaTaxaDec, novoPrazo)) / (Math.pow(1 + novaTaxaDec, novoPrazo) - 1) : 0;
  
  const custoTotalAtual = (parcelaAtual * parcelasRestantes) + (custoRecipAtual * parcelasRestantes);
  const custoTotalNovo = novaParcela * novoPrazo;
  
  const multaLiquidacao = saldo * ((operacao.multaLiquidacao || 2) / 100);
  const iofNovo = saldo * 0.0038;
  const custosSaida = multaLiquidacao + iofNovo;
  
  const economiaTotal = custoTotalAtual - custoTotalNovo - custosSaida;
  const economiaMensal = parcelaAtual + custoRecipAtual - novaParcela;
  const paybackMeses = custosSaida > 0 && economiaMensal > 0 ? Math.ceil(custosSaida / economiaMensal) : 0;
  
  return {
    saldo, parcelaAtual, novaParcela,
    reducaoParcela: parcelaAtual - novaParcela,
    reducaoParcelaPct: parcelaAtual > 0 ? ((parcelaAtual - novaParcela) / parcelaAtual) * 100 : 0,
    custoTotalAtual, custoTotalNovo, custosSaida, multaLiquidacao, iofNovo,
    economiaTotal, economiaMensal, paybackMeses,
    vale: economiaTotal > 0
  };
}

function simularConsolidacao(operacoes, novaTaxa, novoPrazo) {
  const totalSaldo = operacoes.reduce((s, op) => s + (op.saldoDevedor || 0), 0);
  const totalParcelas = operacoes.reduce((s, op) => s + (op.valorParcela || 0), 0);
  const totalRecip = operacoes.reduce((s, op) => s + calcularCustoTotalReciprocidades(op), 0);
  
  const mediaParcelasRestantes = operacoes.reduce((s, op) => s + (op.parcelasRestantes || 0), 0) / operacoes.length;
  const custoTotalAtual = (totalParcelas + totalRecip) * mediaParcelasRestantes;
  
  const novaTaxaDec = novaTaxa / 100;
  const novaParcela = novoPrazo > 0 ? totalSaldo * (novaTaxaDec * Math.pow(1 + novaTaxaDec, novoPrazo)) / (Math.pow(1 + novaTaxaDec, novoPrazo) - 1) : 0;
  const custoTotalNovo = novaParcela * novoPrazo;
  
  const custosSaida = operacoes.reduce((s, op) => s + (op.saldoDevedor || 0) * ((op.multaLiquidacao || 2) / 100), 0) + (totalSaldo * 0.0038);
  const economiaMensal = totalParcelas + totalRecip - novaParcela;
  
  return {
    qtdOperacoes: operacoes.length, totalSaldo, totalParcelas, totalRecip, novaParcela,
    reducaoParcela: totalParcelas - novaParcela,
    reducaoParcelaPct: totalParcelas > 0 ? ((totalParcelas - novaParcela) / totalParcelas) * 100 : 0,
    custoTotalAtual, custoTotalNovo, custosSaida, economiaMensal,
    liberacaoMensal: economiaMensal > 0 ? economiaMensal : 0
  };
}

async function renderDividasBancarias(data) {
  const container = document.getElementById('dividasContent');
  if (!container) return;
  
  const empresaId = data.empresaId;
  const empresaNome = data.empresa || data.empresaNome;
  const latest = data.rows?.[0] || {};
  
  container.innerHTML = '<div style="text-align:center; padding:40px"><div class="loading">Carregando...</div></div>';
  
  await carregarOperacoesDivida(empresaId);
  const operacoes = OPERACOES_DIVIDA;
  const dadosEmpresa = { ebitda: latest.ebitda || 0, receita: latest.receita || 0, pl: latest.pl || 0 };
  const consolidado = calcularConsolidadoDividas(operacoes, dadosEmpresa);
  const recomendacoes = gerarRecomendacoesDividas(operacoes, consolidado, dadosEmpresa);
  
  let html = '<div style="background:linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); border-radius:12px; padding:24px; margin-bottom:24px; color:#fff">' +
    '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px">' +
    '<div><div style="font-size:24px; font-weight:800">🏦 Dívidas Bancárias</div>' +
    '<div style="font-size:14px; opacity:0.9; margin-top:4px">' + empresaNome + '</div></div>' +
    '<button id="btnNovaOperacao" style="padding:12px 24px; background:#fff; color:#1e3a5f; border:none; border-radius:8px; font-weight:700; cursor:pointer">➕ Nova Operação</button>' +
    '</div></div>';
  
  if (operacoes.length === 0) {
    html += '<div style="background:#fff; border:2px dashed #e2e8f0; border-radius:12px; padding:60px; text-align:center">' +
      '<div style="font-size:64px; margin-bottom:16px">🏦</div>' +
      '<div style="font-size:18px; font-weight:600; color:#1e293b">Nenhuma operação cadastrada</div>' +
      '<div style="font-size:14px; color:#64748b; margin-top:8px; margin-bottom:24px">Cadastre as dívidas bancárias para ter visão completa</div>' +
      '<button id="btnNovaOperacao2" style="padding:12px 24px; background:#2563eb; color:#fff; border:none; border-radius:8px; font-weight:600; cursor:pointer">Cadastrar Primeira Operação</button></div>';
  } else {
    // Resumo consolidado
    html += '<div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:24px">' +
      '<div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:16px">📊 VISÃO CONSOLIDADA</div>' +
      '<div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:16px; margin-bottom:20px">' +
      '<div style="background:#f8fafc; border-radius:8px; padding:16px; text-align:center">' +
      '<div style="font-size:11px; color:#64748b; margin-bottom:4px">DÍVIDA BRUTA</div>' +
      '<div style="font-size:20px; font-weight:800; color:#1e293b">' + toBRL(consolidado.totalDividaBruta) + '</div></div>' +
      '<div style="background:#f8fafc; border-radius:8px; padding:16px; text-align:center">' +
      '<div style="font-size:11px; color:#64748b; margin-bottom:4px">PARCELAS/MÊS</div>' +
      '<div style="font-size:20px; font-weight:800; color:#1e293b">' + toBRL(consolidado.totalParcelas) + '</div></div>' +
      '<div style="background:#f8fafc; border-radius:8px; padding:16px; text-align:center">' +
      '<div style="font-size:11px; color:#64748b; margin-bottom:4px">CUSTO MÉDIO</div>' +
      '<div style="font-size:20px; font-weight:800; color:#1e293b">' + consolidado.custoMedioPonderado.toFixed(2) + '% <small style="font-size:11px">a.m.</small></div>' +
      '<div style="font-size:10px; color:#64748b">' + calcularTaxaAnual(consolidado.custoMedioPonderado).toFixed(1) + '% a.a.</div></div>' +
      '<div style="background:#f8fafc; border-radius:8px; padding:16px; text-align:center">' +
      '<div style="font-size:11px; color:#64748b; margin-bottom:4px">DL/EBITDA</div>' +
      '<div style="font-size:20px; font-weight:800; color:' + (consolidado.dlEbitda > 3 ? '#dc2626' : consolidado.dlEbitda > 2.5 ? '#f59e0b' : '#16a34a') + '">' + (consolidado.dlEbitda ? consolidado.dlEbitda.toFixed(1) + 'x' : '—') + '</div></div>' +
      '<div style="background:#f8fafc; border-radius:8px; padding:16px; text-align:center">' +
      '<div style="font-size:11px; color:#64748b; margin-bottom:4px">OPERAÇÕES</div>' +
      '<div style="font-size:20px; font-weight:800; color:#1e293b">' + consolidado.qtdOperacoes + '</div></div></div>';
    
    if (consolidado.totalReciprocidades > 0) {
      html += '<div style="background:#fef3c7; border-radius:8px; padding:12px; font-size:12px; color:#92400e">' +
        '⚠️ <strong>Custos com Reciprocidades:</strong> ' + toBRL(consolidado.totalReciprocidades) + '/mês (' + toBRL(consolidado.totalReciprocidades * 12) + '/ano)</div>';
    }
    html += '</div>';
    
    // Por Banco e Categoria
    html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:24px">' +
      '<div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px">' +
      '<div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:16px">🏦 POR BANCO</div>';
    
    Object.entries(consolidado.porBanco).sort((a,b) => b[1].saldo - a[1].saldo).forEach(([banco, dados]) => {
      const pct = (dados.saldo / consolidado.totalDividaBruta) * 100;
      html += '<div style="margin-bottom:12px"><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px">' +
        '<span style="font-weight:600">' + banco + '</span><span>' + toBRL(dados.saldo) + ' (' + pct.toFixed(0) + '%)</span></div>' +
        '<div style="background:#e2e8f0; border-radius:4px; height:8px; overflow:hidden">' +
        '<div style="background:' + (pct > 40 ? '#f59e0b' : '#3b82f6') + '; height:100%; width:' + pct + '%"></div></div></div>';
    });
    html += '</div>';
    
    html += '<div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px">' +
      '<div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:16px">📊 POR TIPO</div>';
    
    const cores = { 'Capital de Giro': '#ef4444', 'Investimento': '#22c55e', 'Comércio Exterior': '#3b82f6', 'Rural': '#84cc16', 'Mercado de Capitais': '#8b5cf6', 'Outros': '#6b7280' };
    Object.entries(consolidado.porCategoria).sort((a,b) => b[1].saldo - a[1].saldo).forEach(([cat, dados]) => {
      const pct = (dados.saldo / consolidado.totalDividaBruta) * 100;
      html += '<div style="margin-bottom:12px"><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px">' +
        '<span style="font-weight:600">' + cat + '</span><span>' + toBRL(dados.saldo) + ' (' + pct.toFixed(0) + '%)</span></div>' +
        '<div style="background:#e2e8f0; border-radius:4px; height:8px; overflow:hidden">' +
        '<div style="background:' + (cores[cat] || '#6b7280') + '; height:100%; width:' + pct + '%"></div></div></div>';
    });
    html += '</div></div>';
    
    // Cronograma
    html += '<div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:24px">' +
      '<div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:16px">📅 CRONOGRAMA DE AMORTIZAÇÕES (12 meses)</div>' +
      gerarCronogramaHtml(operacoes) + '</div>';
    
    // Ranking
    html += '<div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:24px">' +
      '<div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:16px">🏆 RANKING DE CUSTO</div>' +
      '<div style="overflow-x:auto"><table style="width:100%; border-collapse:collapse; font-size:12px">' +
      '<thead><tr style="background:#f8fafc">' +
      '<th style="padding:10px; text-align:left; border-bottom:2px solid #e2e8f0">#</th>' +
      '<th style="padding:10px; text-align:left; border-bottom:2px solid #e2e8f0">Banco</th>' +
      '<th style="padding:10px; text-align:left; border-bottom:2px solid #e2e8f0">Tipo</th>' +
      '<th style="padding:10px; text-align:right; border-bottom:2px solid #e2e8f0">Saldo</th>' +
      '<th style="padding:10px; text-align:right; border-bottom:2px solid #e2e8f0">Taxa</th>' +
      '<th style="padding:10px; text-align:right; border-bottom:2px solid #e2e8f0">CET</th>' +
      '<th style="padding:10px; text-align:center; border-bottom:2px solid #e2e8f0">Status</th>' +
      '<th style="padding:10px; text-align:center; border-bottom:2px solid #e2e8f0">Ações</th></tr></thead><tbody>';
    
    consolidado.operacoesOrdenadas.forEach((op, idx) => {
      const bancoNome = LISTA_BANCOS.find(b => b.id === op.banco)?.nome || op.bancoOutro || 'Outro';
      const tipoNome = TIPOS_OPERACAO.find(t => t.id === op.tipoOperacao)?.nome || 'Outro';
      const isAcima = op.custoEfetivo > consolidado.custoMedioPonderado * 1.1;
      const isAbaixo = op.custoEfetivo < consolidado.custoMedioPonderado * 0.9;
      
      html += '<tr style="border-bottom:1px solid #f1f5f9">' +
        '<td style="padding:10px; font-weight:700">' + (idx + 1) + '</td>' +
        '<td style="padding:10px; font-weight:600">' + bancoNome + '</td>' +
        '<td style="padding:10px; color:#64748b">' + tipoNome + '</td>' +
        '<td style="padding:10px; text-align:right">' + toBRL(op.saldoDevedor) + '</td>' +
        '<td style="padding:10px; text-align:right">' + (op.taxaMensal || 0).toFixed(2) + '%</td>' +
        '<td style="padding:10px; text-align:right; font-weight:700; color:' + (isAcima ? '#dc2626' : isAbaixo ? '#16a34a' : '#1e293b') + '">' + op.custoEfetivo.toFixed(2) + '%</td>' +
        '<td style="padding:10px; text-align:center">' +
        (isAcima ? '<span style="background:#fef2f2; color:#dc2626; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600">CARA</span>' :
         isAbaixo ? '<span style="background:#f0fdf4; color:#16a34a; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600">BOA</span>' :
         '<span style="background:#f8fafc; color:#64748b; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600">OK</span>') + '</td>' +
        '<td style="padding:10px; text-align:center">' +
        '<button class="btn-editar-op" data-id="' + op.id + '" style="padding:4px 8px; font-size:10px; background:#f1f5f9; border:none; border-radius:4px; cursor:pointer; margin-right:4px">✏️</button>' +
        '<button class="btn-simular-op" data-id="' + op.id + '" style="padding:4px 8px; font-size:10px; background:#dbeafe; border:none; border-radius:4px; cursor:pointer">🔄</button></td></tr>';
    });
    html += '</tbody></table></div></div>';
    
    // Simuladores
    html += '<div style="background:linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border:2px solid #f59e0b; border-radius:12px; padding:20px; margin-bottom:24px">' +
      '<div style="font-size:14px; font-weight:700; color:#92400e; margin-bottom:16px">🎯 SIMULADORES</div>' +
      '<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px">' +
      '<button id="btnSimPortabilidade" style="padding:20px; background:#fff; border:2px solid #d97706; border-radius:8px; cursor:pointer; text-align:center">' +
      '<div style="font-size:28px; margin-bottom:8px">🔄</div><div style="font-size:13px; font-weight:700; color:#92400e">Portabilidade</div>' +
      '<div style="font-size:10px; color:#6b7280; margin-top:4px">Trazer operação para seu banco</div></button>' +
      '<button id="btnSimConsolidacao" style="padding:20px; background:#fff; border:2px solid #d97706; border-radius:8px; cursor:pointer; text-align:center">' +
      '<div style="font-size:28px; margin-bottom:8px">🔗</div><div style="font-size:13px; font-weight:700; color:#92400e">Consolidação</div>' +
      '<div style="font-size:10px; color:#6b7280; margin-top:4px">Juntar várias operações</div></button>' +
      '<button id="btnSimImpacto" style="padding:20px; background:#fff; border:2px solid #d97706; border-radius:8px; cursor:pointer; text-align:center">' +
      '<div style="font-size:28px; margin-bottom:8px">📊</div><div style="font-size:13px; font-weight:700; color:#92400e">Impacto</div>' +
      '<div style="font-size:10px; color:#6b7280; margin-top:4px">Ver efeito nos indicadores</div></button></div>' +
      '<div id="areaSimulador" style="margin-top:16px; display:none"></div></div>';
    
    // Recomendações
    if (recomendacoes.length > 0) {
      html += '<div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:24px">' +
        '<div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:16px">💡 RECOMENDAÇÕES</div><div style="display:grid; gap:12px">';
      
      const coresRec = { urgente: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', icon: '🚨' }, critico: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', icon: '🔴' }, atencao: { bg: '#fefce8', border: '#fef08a', text: '#a16207', icon: '🟡' }, oportunidade: { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', icon: '🟢' } };
      
      recomendacoes.slice(0, 5).forEach(rec => {
        const cor = coresRec[rec.tipo] || coresRec.atencao;
        html += '<div style="background:' + cor.bg + '; border:1px solid ' + cor.border + '; border-radius:8px; padding:16px">' +
          '<div style="display:flex; gap:12px; align-items:flex-start"><div style="font-size:20px">' + cor.icon + '</div>' +
          '<div style="flex:1"><div style="font-size:13px; font-weight:700; color:' + cor.text + '">' + rec.titulo + '</div>' +
          '<div style="font-size:12px; color:#4b5563; margin-top:4px">' + rec.descricao + '</div>' +
          (rec.economia ? '<div style="font-size:11px; color:#16a34a; margin-top:8px; font-weight:600">💰 Economia potencial: ' + toBRL(rec.economia) + '/ano</div>' : '') +
          '</div></div></div>';
      });
      html += '</div></div>';
    }
  }
  
  html += gerarModalCadastroHtml();
  container.innerHTML = html;
  configurarEventListenersDividas(empresaId, data);
}

function gerarCronogramaHtml(operacoes) {
  const hoje = new Date();
  const meses = [];
  for (let i = 0; i < 12; i++) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    meses.push({ data, label: data.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), parcelas: 0 });
  }
  operacoes.forEach(op => {
    const parcela = op.valorParcela || 0;
    const parcelasRestantes = op.parcelasRestantes || 0;
    for (let i = 0; i < Math.min(parcelasRestantes, 12); i++) {
      if (meses[i]) meses[i].parcelas += parcela;
    }
  });
  const maxParcela = Math.max(...meses.map(m => m.parcelas), 1);
  
  let html = '<div style="display:grid; grid-template-columns:repeat(12, 1fr); gap:8px">';
  meses.forEach(m => {
    const altura = (m.parcelas / maxParcela) * 100;
    html += '<div style="text-align:center"><div style="height:80px; display:flex; align-items:flex-end; justify-content:center; margin-bottom:8px">' +
      '<div style="background:#3b82f6; width:100%; border-radius:4px 4px 0 0; height:' + Math.max(altura, 5) + '%"></div></div>' +
      '<div style="font-size:10px; font-weight:600; color:#1e293b">' + m.label + '</div>' +
      '<div style="font-size:9px; color:#64748b">' + (m.parcelas > 0 ? toBRL(m.parcelas) : '—') + '</div></div>';
  });
  return html + '</div>';
}

function gerarModalCadastroHtml() {
  let html = '<div id="modalOperacao" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; overflow-y:auto">' +
    '<div style="background:#fff; max-width:800px; margin:40px auto; border-radius:12px; max-height:90vh; overflow-y:auto">' +
    '<div style="background:#1e3a5f; color:#fff; padding:20px; border-radius:12px 12px 0 0; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:1">' +
    '<div style="font-size:18px; font-weight:700">🏦 Cadastrar Operação de Crédito</div>' +
    '<button id="btnFecharModal" style="background:none; border:none; color:#fff; font-size:24px; cursor:pointer">×</button></div>' +
    '<div style="padding:24px"><input type="hidden" id="opId" value="">';
  
  // Identificação
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">📋 Identificação</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Banco/Instituição *</label>' +
    '<select id="opBanco" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px">';
  LISTA_BANCOS.forEach(b => { html += '<option value="' + b.id + '">' + b.nome + '</option>'; });
  html += '</select></div>' +
    '<div id="divBancoOutro" style="display:none"><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Nome do Banco</label>' +
    '<input type="text" id="opBancoOutro" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="Informe o banco"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Tipo de Operação *</label>' +
    '<select id="opTipo" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px">' +
    '<optgroup label="Capital de Giro">';
  TIPOS_OPERACAO.filter(t => t.categoria === 'giro').forEach(t => { html += '<option value="' + t.id + '">' + t.nome + '</option>'; });
  html += '</optgroup><optgroup label="Investimento">';
  TIPOS_OPERACAO.filter(t => t.categoria === 'investimento').forEach(t => { html += '<option value="' + t.id + '">' + t.nome + '</option>'; });
  html += '</optgroup><optgroup label="Comércio Exterior">';
  TIPOS_OPERACAO.filter(t => t.categoria === 'comex').forEach(t => { html += '<option value="' + t.id + '">' + t.nome + '</option>'; });
  html += '</optgroup><optgroup label="Rural">';
  TIPOS_OPERACAO.filter(t => t.categoria === 'rural').forEach(t => { html += '<option value="' + t.id + '">' + t.nome + '</option>'; });
  html += '</optgroup><optgroup label="Mercado de Capitais">';
  TIPOS_OPERACAO.filter(t => t.categoria === 'mercado').forEach(t => { html += '<option value="' + t.id + '">' + t.nome + '</option>'; });
  html += '</optgroup></select></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Data de Contratação</label>' +
    '<input type="date" id="opDataContratacao" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Finalidade</label>' +
    '<input type="text" id="opFinalidade" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="Ex: Capital de giro, Máquina X..."></div></div></div>';
  
  // Valores
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">💰 Valores e Prazos</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px">' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Valor Original Contratado</label>' +
    '<input type="text" id="opValorOriginal" class="money-div" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="R$ 0,00"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Saldo Devedor Atual *</label>' +
    '<input type="text" id="opSaldoDevedor" class="money-div" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="R$ 0,00"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Prazo Total (meses)</label>' +
    '<input type="number" id="opPrazoTotal" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="48"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Carência (meses)</label>' +
    '<input type="number" id="opCarencia" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="0" value="0"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Parcelas Restantes *</label>' +
    '<input type="number" id="opParcelasRestantes" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="24"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Valor da Parcela *</label>' +
    '<input type="text" id="opValorParcela" class="money-div" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="R$ 0,00"></div></div></div>';
  
  // Taxa
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">📈 Taxa de Juros</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px">' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Indexador</label>' +
    '<select id="opIndexador" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px">';
  TIPOS_INDEXADOR.forEach(i => { html += '<option value="' + i.id + '">' + i.nome + '</option>'; });
  html += '</select></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Taxa Total (% a.m.) *</label>' +
    '<input type="number" id="opTaxaMensal" step="0.01" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="1.50"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Taxa Anual (auto)</label>' +
    '<input type="text" id="opTaxaAnual" readonly style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:6px; font-size:13px; background:#f9fafb" placeholder="—"></div></div></div>';
  
  // Garantias
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">🔒 Garantias</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Tipo de Garantia</label>' +
    '<select id="opGarantia" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px">';
  TIPOS_GARANTIA.forEach(g => { html += '<option value="' + g.id + '">' + g.nome + '</option>'; });
  html += '</select></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Valor das Garantias</label>' +
    '<input type="text" id="opValorGarantia" class="money-div" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="R$ 0,00"></div></div></div>';
  
  // Reciprocidades
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">🤝 Reciprocidades (Custos Ocultos)</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px">' +
    '<label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer"><input type="checkbox" id="opRecFolha"> Folha de Pagamento</label>' +
    '<label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer"><input type="checkbox" id="opRecDomicilio"> Domicílio Bancário</label>' +
    '<label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer"><input type="checkbox" id="opRecCobranca"> Cobrança Registrada</label></div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">' +
    '<div><label style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:8px"><input type="checkbox" id="opRecSeguroPrest"> Seguro Prestamista</label>' +
    '<input type="text" id="opRecSeguroPrestValor" class="money-div" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px; font-size:12px" placeholder="Valor mensal R$"></div>' +
    '<div><label style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:8px"><input type="checkbox" id="opRecCapitalizacao"> Capitalização</label>' +
    '<input type="text" id="opRecCapitalizacaoValor" class="money-div" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px; font-size:12px" placeholder="Valor mensal R$"></div>' +
    '<div><label style="display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:8px"><input type="checkbox" id="opRecTarifas"> Tarifas Bancárias</label>' +
    '<input type="text" id="opRecTarifasValor" class="money-div" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px; font-size:12px" placeholder="Valor mensal R$"></div>' +
    '<div><label style="font-size:12px; font-weight:600; display:block; margin-bottom:8px">Outros Custos Mensais</label>' +
    '<input type="text" id="opRecOutros" class="money-div" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px; font-size:12px" placeholder="R$ 0,00"></div></div></div>';
  
  // Saída
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">🚪 Condições de Saída</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Multa Liquidação Antecipada (%)</label>' +
    '<input type="number" id="opMulta" step="0.1" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="2.0" value="2"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Lock-up (meses)</label>' +
    '<input type="number" id="opLockup" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="0" value="0"></div></div></div>';
  
  // Botões
  html += '<div style="display:flex; gap:12px; justify-content:flex-end; padding-top:16px; border-top:1px solid #e2e8f0">' +
    '<button id="btnCancelarOp" style="padding:12px 24px; background:#f1f5f9; color:#374151; border:none; border-radius:8px; font-weight:600; cursor:pointer">Cancelar</button>' +
    '<button id="btnExcluirOp" style="padding:12px 24px; background:#fee2e2; color:#dc2626; border:none; border-radius:8px; font-weight:600; cursor:pointer; display:none">Excluir</button>' +
    '<button id="btnSalvarOp" style="padding:12px 24px; background:#2563eb; color:#fff; border:none; border-radius:8px; font-weight:600; cursor:pointer">Salvar Operação</button></div>' +
    '</div></div></div>';
  
  return html;
}

function parseMoney(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}

function formatMoney(val) {
  return 'R$ ' + val.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function configurarEventListenersDividas(empresaId, data) {
  document.getElementById('btnNovaOperacao')?.addEventListener('click', () => abrirModalOperacao(null));
  document.getElementById('btnNovaOperacao2')?.addEventListener('click', () => abrirModalOperacao(null));
  document.getElementById('btnFecharModal')?.addEventListener('click', fecharModalOperacao);
  document.getElementById('btnCancelarOp')?.addEventListener('click', fecharModalOperacao);
  
  document.getElementById('opBanco')?.addEventListener('change', (e) => {
    document.getElementById('divBancoOutro').style.display = e.target.value === 'outro' ? 'block' : 'none';
  });
  
  document.getElementById('opTaxaMensal')?.addEventListener('input', (e) => {
    const taxaMensal = parseFloat(e.target.value) || 0;
    document.getElementById('opTaxaAnual').value = calcularTaxaAnual(taxaMensal).toFixed(2) + '% a.a.';
  });
  
  document.querySelectorAll('#modalOperacao .money-div').forEach(input => {
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      v = (parseInt(v, 10) / 100).toFixed(2);
      e.target.value = 'R$ ' + v.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    });
  });
  
  document.getElementById('btnSalvarOp')?.addEventListener('click', async () => {
    const operacao = {
      id: document.getElementById('opId').value || null,
      banco: document.getElementById('opBanco').value,
      bancoOutro: document.getElementById('opBancoOutro').value,
      tipoOperacao: document.getElementById('opTipo').value,
      dataContratacao: document.getElementById('opDataContratacao').value,
      finalidade: document.getElementById('opFinalidade').value,
      valorOriginal: parseMoney(document.getElementById('opValorOriginal').value),
      saldoDevedor: parseMoney(document.getElementById('opSaldoDevedor').value),
      prazoTotal: parseInt(document.getElementById('opPrazoTotal').value) || 0,
      carencia: parseInt(document.getElementById('opCarencia').value) || 0,
      parcelasRestantes: parseInt(document.getElementById('opParcelasRestantes').value) || 0,
      valorParcela: parseMoney(document.getElementById('opValorParcela').value),
      indexador: document.getElementById('opIndexador').value,
      taxaMensal: parseFloat(document.getElementById('opTaxaMensal').value) || 0,
      garantia: document.getElementById('opGarantia').value,
      valorGarantia: parseMoney(document.getElementById('opValorGarantia').value),
      multaLiquidacao: parseFloat(document.getElementById('opMulta').value) || 2,
      lockup: parseInt(document.getElementById('opLockup').value) || 0,
      reciprocidades: {
        folhaPagamento: document.getElementById('opRecFolha').checked,
        domicilioBancario: document.getElementById('opRecDomicilio').checked,
        cobranca: document.getElementById('opRecCobranca').checked,
        seguroPrestamista: document.getElementById('opRecSeguroPrest').checked,
        seguroPrestamistaValor: parseMoney(document.getElementById('opRecSeguroPrestValor').value),
        capitalizacao: document.getElementById('opRecCapitalizacao').checked,
        capitalizacaoValor: parseMoney(document.getElementById('opRecCapitalizacaoValor').value),
        tarifas: document.getElementById('opRecTarifas').checked,
        tarifasValor: parseMoney(document.getElementById('opRecTarifasValor').value),
        outrosCustos: parseMoney(document.getElementById('opRecOutros').value)
      }
    };
    
    if (!operacao.saldoDevedor || !operacao.taxaMensal) {
      alert('Preencha pelo menos o saldo devedor e a taxa mensal.');
      return;
    }
    
    const sucesso = await salvarOperacaoDivida(empresaId, operacao);
    if (sucesso) {
      fecharModalOperacao();
      renderDividasBancarias(data);
    }
  });
  
  document.getElementById('btnExcluirOp')?.addEventListener('click', async () => {
    const id = document.getElementById('opId').value;
    if (id && confirm('Tem certeza que deseja excluir esta operação?')) {
      await excluirOperacaoDivida(empresaId, id);
      fecharModalOperacao();
      renderDividasBancarias(data);
    }
  });
  
  document.querySelectorAll('.btn-editar-op').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = OPERACOES_DIVIDA.find(o => o.id === btn.dataset.id);
      if (op) abrirModalOperacao(op);
    });
  });
  
  document.querySelectorAll('.btn-simular-op').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = OPERACOES_DIVIDA.find(o => o.id === btn.dataset.id);
      if (op) abrirSimuladorPortabilidade(op, data);
    });
  });
  
  document.getElementById('btnSimPortabilidade')?.addEventListener('click', () => abrirSimuladorPortabilidade(null, data));
  document.getElementById('btnSimConsolidacao')?.addEventListener('click', () => abrirSimuladorConsolidacao(data));
  document.getElementById('btnSimImpacto')?.addEventListener('click', () => abrirSimuladorImpacto(data));
}

function abrirModalOperacao(operacao) {
  const modal = document.getElementById('modalOperacao');
  if (!modal) return;
  
  // Limpar
  document.getElementById('opId').value = '';
  document.getElementById('opBanco').value = 'bb';
  document.getElementById('opBancoOutro').value = '';
  document.getElementById('opTipo').value = 'capital_giro';
  document.getElementById('opDataContratacao').value = '';
  document.getElementById('opFinalidade').value = '';
  document.getElementById('opValorOriginal').value = '';
  document.getElementById('opSaldoDevedor').value = '';
  document.getElementById('opPrazoTotal').value = '';
  document.getElementById('opCarencia').value = '0';
  document.getElementById('opParcelasRestantes').value = '';
  document.getElementById('opValorParcela').value = '';
  document.getElementById('opIndexador').value = 'cdi';
  document.getElementById('opTaxaMensal').value = '';
  document.getElementById('opTaxaAnual').value = '';
  document.getElementById('opGarantia').value = 'aval';
  document.getElementById('opValorGarantia').value = '';
  document.getElementById('opRecFolha').checked = false;
  document.getElementById('opRecDomicilio').checked = false;
  document.getElementById('opRecCobranca').checked = false;
  document.getElementById('opRecSeguroPrest').checked = false;
  document.getElementById('opRecSeguroPrestValor').value = '';
  document.getElementById('opRecCapitalizacao').checked = false;
  document.getElementById('opRecCapitalizacaoValor').value = '';
  document.getElementById('opRecTarifas').checked = false;
  document.getElementById('opRecTarifasValor').value = '';
  document.getElementById('opRecOutros').value = '';
  document.getElementById('opMulta').value = '2';
  document.getElementById('opLockup').value = '0';
  document.getElementById('divBancoOutro').style.display = 'none';
  document.getElementById('btnExcluirOp').style.display = 'none';
  
  if (operacao) {
    document.getElementById('opId').value = operacao.id || '';
    document.getElementById('opBanco').value = operacao.banco || 'bb';
    document.getElementById('opBancoOutro').value = operacao.bancoOutro || '';
    document.getElementById('opTipo').value = operacao.tipoOperacao || 'capital_giro';
    document.getElementById('opDataContratacao').value = operacao.dataContratacao || '';
    document.getElementById('opFinalidade').value = operacao.finalidade || '';
    if (operacao.valorOriginal) document.getElementById('opValorOriginal').value = formatMoney(operacao.valorOriginal);
    if (operacao.saldoDevedor) document.getElementById('opSaldoDevedor').value = formatMoney(operacao.saldoDevedor);
    document.getElementById('opPrazoTotal').value = operacao.prazoTotal || '';
    document.getElementById('opCarencia').value = operacao.carencia || '0';
    document.getElementById('opParcelasRestantes').value = operacao.parcelasRestantes || '';
    if (operacao.valorParcela) document.getElementById('opValorParcela').value = formatMoney(operacao.valorParcela);
    document.getElementById('opIndexador').value = operacao.indexador || 'cdi';
    document.getElementById('opTaxaMensal').value = operacao.taxaMensal || '';
    if (operacao.taxaMensal) document.getElementById('opTaxaAnual').value = calcularTaxaAnual(operacao.taxaMensal).toFixed(2) + '% a.a.';
    document.getElementById('opGarantia').value = operacao.garantia || 'aval';
    if (operacao.valorGarantia) document.getElementById('opValorGarantia').value = formatMoney(operacao.valorGarantia);
    
    if (operacao.reciprocidades) {
      document.getElementById('opRecFolha').checked = operacao.reciprocidades.folhaPagamento || false;
      document.getElementById('opRecDomicilio').checked = operacao.reciprocidades.domicilioBancario || false;
      document.getElementById('opRecCobranca').checked = operacao.reciprocidades.cobranca || false;
      document.getElementById('opRecSeguroPrest').checked = operacao.reciprocidades.seguroPrestamista || false;
      if (operacao.reciprocidades.seguroPrestamistaValor) document.getElementById('opRecSeguroPrestValor').value = formatMoney(operacao.reciprocidades.seguroPrestamistaValor);
      document.getElementById('opRecCapitalizacao').checked = operacao.reciprocidades.capitalizacao || false;
      if (operacao.reciprocidades.capitalizacaoValor) document.getElementById('opRecCapitalizacaoValor').value = formatMoney(operacao.reciprocidades.capitalizacaoValor);
      document.getElementById('opRecTarifas').checked = operacao.reciprocidades.tarifas || false;
      if (operacao.reciprocidades.tarifasValor) document.getElementById('opRecTarifasValor').value = formatMoney(operacao.reciprocidades.tarifasValor);
      if (operacao.reciprocidades.outrosCustos) document.getElementById('opRecOutros').value = formatMoney(operacao.reciprocidades.outrosCustos);
    }
    
    document.getElementById('opMulta').value = operacao.multaLiquidacao || '2';
    document.getElementById('opLockup').value = operacao.lockup || '0';
    if (operacao.banco === 'outro') document.getElementById('divBancoOutro').style.display = 'block';
    document.getElementById('btnExcluirOp').style.display = 'inline-block';
  }
  
  modal.style.display = 'block';
}

function fecharModalOperacao() {
  document.getElementById('modalOperacao').style.display = 'none';
}

function gerarModalCadastroHtml() {
  let html = '<div id="modalOperacao" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; overflow-y:auto">' +
    '<div style="background:#fff; max-width:800px; margin:40px auto; border-radius:12px; max-height:90vh; overflow-y:auto">' +
    '<div style="background:#1e3a5f; color:#fff; padding:20px; border-radius:12px 12px 0 0; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:1">' +
    '<div style="font-size:18px; font-weight:700">🏦 Cadastrar Operação de Crédito</div>' +
    '<button id="btnFecharModal" style="background:none; border:none; color:#fff; font-size:24px; cursor:pointer">×</button></div>' +
    '<div style="padding:24px"><input type="hidden" id="opId" value="">';
  
  // Identificação
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">📋 Identificação</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Banco/Instituição *</label>' +
    '<select id="opBanco" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px">';
  LISTA_BANCOS.forEach(b => { html += '<option value="' + b.id + '">' + b.nome + '</option>'; });
  html += '</select></div>' +
    '<div id="divBancoOutro" style="display:none"><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Nome do Banco</label>' +
    '<input type="text" id="opBancoOutro" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="Informe o banco"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Tipo de Operação *</label>' +
    '<select id="opTipo" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px">' +
    '<optgroup label="Capital de Giro">';
  TIPOS_OPERACAO.filter(t => t.categoria === 'giro').forEach(t => { html += '<option value="' + t.id + '">' + t.nome + '</option>'; });
  html += '</optgroup><optgroup label="Investimento">';
  TIPOS_OPERACAO.filter(t => t.categoria === 'investimento').forEach(t => { html += '<option value="' + t.id + '">' + t.nome + '</option>'; });
  html += '</optgroup><optgroup label="Comércio Exterior">';
  TIPOS_OPERACAO.filter(t => t.categoria === 'comex').forEach(t => { html += '<option value="' + t.id + '">' + t.nome + '</option>'; });
  html += '</optgroup><optgroup label="Rural">';
  TIPOS_OPERACAO.filter(t => t.categoria === 'rural').forEach(t => { html += '<option value="' + t.id + '">' + t.nome + '</option>'; });
  html += '</optgroup><optgroup label="Mercado de Capitais">';
  TIPOS_OPERACAO.filter(t => t.categoria === 'mercado').forEach(t => { html += '<option value="' + t.id + '">' + t.nome + '</option>'; });
  html += '</optgroup></select></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Data de Contratação</label>' +
    '<input type="date" id="opDataContratacao" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Finalidade</label>' +
    '<input type="text" id="opFinalidade" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="Ex: Capital de giro, Máquina X..."></div></div></div>';
  
  // Valores
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">💰 Valores e Prazos</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px">' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Valor Original</label>' +
    '<input type="text" id="opValorOriginal" class="money-input" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="R$ 0,00"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Saldo Devedor Atual *</label>' +
    '<input type="text" id="opSaldoDevedor" class="money-input" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="R$ 0,00"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Prazo Total (meses)</label>' +
    '<input type="number" id="opPrazoTotal" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="48"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Carência (meses)</label>' +
    '<input type="number" id="opCarencia" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="0" value="0"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Parcelas Restantes *</label>' +
    '<input type="number" id="opParcelasRestantes" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="24"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Valor da Parcela *</label>' +
    '<input type="text" id="opValorParcela" class="money-input" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="R$ 0,00"></div></div></div>';
  
  // Taxas
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">📈 Taxa de Juros</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px">' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Indexador</label>' +
    '<select id="opIndexador" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px">';
  TIPOS_INDEXADOR.forEach(i => { html += '<option value="' + i.id + '">' + i.nome + '</option>'; });
  html += '</select></div>' +
    '<div id="divSpread" style="display:none"><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Spread (% a.a.)</label>' +
    '<input type="number" id="opSpread" step="0.01" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="3.50"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Taxa Total (% a.m.) *</label>' +
    '<input type="number" id="opTaxaMensal" step="0.01" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="1.50"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Taxa Anual (auto)</label>' +
    '<input type="text" id="opTaxaAnual" readonly style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:6px; font-size:13px; background:#f9fafb" placeholder="—"></div></div></div>';
  
  // Garantias
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">🔒 Garantias</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Tipo de Garantia</label>' +
    '<select id="opGarantia" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px">';
  TIPOS_GARANTIA.forEach(g => { html += '<option value="' + g.id + '">' + g.nome + '</option>'; });
  html += '</select></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Valor das Garantias</label>' +
    '<input type="text" id="opValorGarantia" class="money-input" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="R$ 0,00"></div></div></div>';
  
  // Reciprocidades
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">🤝 Reciprocidades e Custos Adicionais</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-bottom:16px">' +
    '<div style="display:flex; align-items:center; gap:8px"><input type="checkbox" id="opRecFolha"><label for="opRecFolha" style="font-size:12px">Folha de Pagamento</label></div>' +
    '<div style="display:flex; align-items:center; gap:8px"><input type="checkbox" id="opRecDomicilio"><label for="opRecDomicilio" style="font-size:12px">Domicílio Bancário</label></div>' +
    '<div style="display:flex; align-items:center; gap:8px"><input type="checkbox" id="opRecCobranca"><label for="opRecCobranca" style="font-size:12px">Cobrança Registrada</label></div></div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">' +
    '<div><div style="display:flex; align-items:center; gap:8px; margin-bottom:8px"><input type="checkbox" id="opRecSeguroPrest"><label for="opRecSeguroPrest" style="font-size:12px">Seguro Prestamista</label></div>' +
    '<input type="text" id="opRecSeguroPrestValor" class="money-input" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px; font-size:12px" placeholder="Valor mensal R$"></div>' +
    '<div><div style="display:flex; align-items:center; gap:8px; margin-bottom:8px"><input type="checkbox" id="opRecCapitalizacao"><label for="opRecCapitalizacao" style="font-size:12px">Capitalização</label></div>' +
    '<input type="text" id="opRecCapitalizacaoValor" class="money-input" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px; font-size:12px" placeholder="Valor mensal R$"></div>' +
    '<div><div style="display:flex; align-items:center; gap:8px; margin-bottom:8px"><input type="checkbox" id="opRecTarifas"><label for="opRecTarifas" style="font-size:12px">Tarifas Bancárias</label></div>' +
    '<input type="text" id="opRecTarifasValor" class="money-input" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px; font-size:12px" placeholder="Valor mensal R$"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Outros Custos Mensais</label>' +
    '<input type="text" id="opRecOutros" class="money-input" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="R$ 0,00"></div></div></div>';
  
  // Condições de Saída
  html += '<div style="margin-bottom:24px"><div style="font-size:14px; font-weight:700; color:#1e3a5f; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #e2e8f0">🚪 Condições de Saída</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px">' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Multa por Liquidação (%)</label>' +
    '<input type="number" id="opMulta" step="0.1" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="2.0" value="2"></div>' +
    '<div><label style="font-size:12px; font-weight:600; color:#374151; display:block; margin-bottom:4px">Lock-up (meses)</label>' +
    '<input type="number" id="opLockup" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px" placeholder="0" value="0"></div></div></div>';
  
  // Botões
  html += '<div style="display:flex; gap:12px; justify-content:flex-end; padding-top:16px; border-top:1px solid #e2e8f0">' +
    '<button id="btnCancelarOp" style="padding:12px 24px; background:#f1f5f9; color:#374151; border:none; border-radius:8px; font-weight:600; cursor:pointer">Cancelar</button>' +
    '<button id="btnExcluirOp" style="padding:12px 24px; background:#fee2e2; color:#dc2626; border:none; border-radius:8px; font-weight:600; cursor:pointer; display:none">Excluir</button>' +
    '<button id="btnSalvarOp" style="padding:12px 24px; background:#2563eb; color:#fff; border:none; border-radius:8px; font-weight:600; cursor:pointer">Salvar Operação</button></div>' +
    '</div></div></div>';
  
  return html;
}

function parseMoneyDivida(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}

function formatMoneyInput(input) {
  let v = input.value.replace(/\D/g, '');
  v = (parseInt(v, 10) / 100).toFixed(2);
  input.value = 'R$ ' + v.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function configurarEventListenersDividas(empresaId, data) {
  document.getElementById('btnNovaOperacao')?.addEventListener('click', () => abrirModalOperacao(null));
  document.getElementById('btnNovaOperacao2')?.addEventListener('click', () => abrirModalOperacao(null));
  document.getElementById('btnFecharModal')?.addEventListener('click', fecharModalOperacao);
  document.getElementById('btnCancelarOp')?.addEventListener('click', fecharModalOperacao);
  
  document.getElementById('opBanco')?.addEventListener('change', (e) => {
    document.getElementById('divBancoOutro').style.display = e.target.value === 'outro' ? 'block' : 'none';
  });
  
  document.getElementById('opIndexador')?.addEventListener('change', (e) => {
    document.getElementById('divSpread').style.display = e.target.value !== 'pre' ? 'block' : 'none';
  });
  
  document.getElementById('opTaxaMensal')?.addEventListener('input', (e) => {
    const taxaMensal = parseFloat(e.target.value) || 0;
    document.getElementById('opTaxaAnual').value = calcularTaxaAnual(taxaMensal).toFixed(2) + '% a.a.';
  });
  
  document.querySelectorAll('#modalOperacao .money-input').forEach(input => {
    input.addEventListener('input', () => formatMoneyInput(input));
  });
  
  document.getElementById('btnSalvarOp')?.addEventListener('click', async () => {
    const operacao = {
      id: document.getElementById('opId').value || null,
      banco: document.getElementById('opBanco').value,
      bancoOutro: document.getElementById('opBancoOutro').value,
      tipoOperacao: document.getElementById('opTipo').value,
      dataContratacao: document.getElementById('opDataContratacao').value,
      finalidade: document.getElementById('opFinalidade').value,
      valorOriginal: parseMoneyDivida(document.getElementById('opValorOriginal').value),
      saldoDevedor: parseMoneyDivida(document.getElementById('opSaldoDevedor').value),
      prazoTotal: parseInt(document.getElementById('opPrazoTotal').value) || 0,
      carencia: parseInt(document.getElementById('opCarencia').value) || 0,
      parcelasRestantes: parseInt(document.getElementById('opParcelasRestantes').value) || 0,
      valorParcela: parseMoneyDivida(document.getElementById('opValorParcela').value),
      indexador: document.getElementById('opIndexador').value,
      spread: parseFloat(document.getElementById('opSpread').value) || 0,
      taxaMensal: parseFloat(document.getElementById('opTaxaMensal').value) || 0,
      garantia: document.getElementById('opGarantia').value,
      valorGarantia: parseMoneyDivida(document.getElementById('opValorGarantia').value),
      multaLiquidacao: parseFloat(document.getElementById('opMulta').value) || 2,
      lockup: parseInt(document.getElementById('opLockup').value) || 0,
      reciprocidades: {
        folhaPagamento: document.getElementById('opRecFolha').checked,
        domicilioBancario: document.getElementById('opRecDomicilio').checked,
        cobranca: document.getElementById('opRecCobranca').checked,
        seguroPrestamista: document.getElementById('opRecSeguroPrest').checked,
        seguroPrestamistaValor: parseMoneyDivida(document.getElementById('opRecSeguroPrestValor').value),
        capitalizacao: document.getElementById('opRecCapitalizacao').checked,
        capitalizacaoValor: parseMoneyDivida(document.getElementById('opRecCapitalizacaoValor').value),
        tarifas: document.getElementById('opRecTarifas').checked,
        tarifasValor: parseMoneyDivida(document.getElementById('opRecTarifasValor').value),
        outrosCustos: parseMoneyDivida(document.getElementById('opRecOutros').value)
      }
    };
    
    if (!operacao.saldoDevedor || !operacao.taxaMensal) {
      alert('Preencha pelo menos o saldo devedor e a taxa mensal.');
      return;
    }
    
    const sucesso = await salvarOperacaoDivida(empresaId, operacao);
    if (sucesso) {
      fecharModalOperacao();
      renderDividasBancarias(data);
    }
  });
  
  document.getElementById('btnExcluirOp')?.addEventListener('click', async () => {
    const id = document.getElementById('opId').value;
    if (id && confirm('Tem certeza que deseja excluir esta operação?')) {
      await excluirOperacaoDivida(empresaId, id);
      fecharModalOperacao();
      renderDividasBancarias(data);
    }
  });
  
  document.querySelectorAll('.btn-editar-op').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = OPERACOES_DIVIDA.find(o => o.id === btn.dataset.id);
      if (op) abrirModalOperacao(op);
    });
  });
  
  document.querySelectorAll('.btn-simular-op').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = OPERACOES_DIVIDA.find(o => o.id === btn.dataset.id);
      if (op) abrirSimuladorPortabilidade(op, data);
    });
  });
  
  document.getElementById('btnSimPortabilidade')?.addEventListener('click', () => abrirSimuladorPortabilidade(null, data));
  document.getElementById('btnSimConsolidacao')?.addEventListener('click', () => abrirSimuladorConsolidacao(data));
  document.getElementById('btnSimImpacto')?.addEventListener('click', () => abrirSimuladorImpacto(data));
}

function abrirModalOperacao(operacao) {
  const modal = document.getElementById('modalOperacao');
  if (!modal) return;
  
  // Limpar formulário
  document.getElementById('opId').value = '';
  document.getElementById('opBanco').value = 'bb';
  document.getElementById('opBancoOutro').value = '';
  document.getElementById('opTipo').value = 'capital_giro';
  document.getElementById('opDataContratacao').value = '';
  document.getElementById('opFinalidade').value = '';
  document.getElementById('opValorOriginal').value = '';
  document.getElementById('opSaldoDevedor').value = '';
  document.getElementById('opPrazoTotal').value = '';
  document.getElementById('opCarencia').value = '0';
  document.getElementById('opParcelasRestantes').value = '';
  document.getElementById('opValorParcela').value = '';
  document.getElementById('opIndexador').value = 'cdi';
  document.getElementById('opSpread').value = '';
  document.getElementById('opTaxaMensal').value = '';
  document.getElementById('opTaxaAnual').value = '';
  document.getElementById('opGarantia').value = 'aval';
  document.getElementById('opValorGarantia').value = '';
  document.getElementById('opRecFolha').checked = false;
  document.getElementById('opRecDomicilio').checked = false;
  document.getElementById('opRecCobranca').checked = false;
  document.getElementById('opRecSeguroPrest').checked = false;
  document.getElementById('opRecSeguroPrestValor').value = '';
  document.getElementById('opRecCapitalizacao').checked = false;
  document.getElementById('opRecCapitalizacaoValor').value = '';
  document.getElementById('opRecTarifas').checked = false;
  document.getElementById('opRecTarifasValor').value = '';
  document.getElementById('opRecOutros').value = '';
  document.getElementById('opMulta').value = '2';
  document.getElementById('opLockup').value = '0';
  document.getElementById('divBancoOutro').style.display = 'none';
  document.getElementById('divSpread').style.display = 'block';
  document.getElementById('btnExcluirOp').style.display = 'none';
  
  if (operacao) {
    document.getElementById('opId').value = operacao.id || '';
    document.getElementById('opBanco').value = operacao.banco || 'bb';
    document.getElementById('opBancoOutro').value = operacao.bancoOutro || '';
    document.getElementById('opTipo').value = operacao.tipoOperacao || 'capital_giro';
    document.getElementById('opDataContratacao').value = operacao.dataContratacao || '';
    document.getElementById('opFinalidade').value = operacao.finalidade || '';
    if (operacao.valorOriginal) document.getElementById('opValorOriginal').value = 'R$ ' + operacao.valorOriginal.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (operacao.saldoDevedor) document.getElementById('opSaldoDevedor').value = 'R$ ' + operacao.saldoDevedor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    document.getElementById('opPrazoTotal').value = operacao.prazoTotal || '';
    document.getElementById('opCarencia').value = operacao.carencia || '0';
    document.getElementById('opParcelasRestantes').value = operacao.parcelasRestantes || '';
    if (operacao.valorParcela) document.getElementById('opValorParcela').value = 'R$ ' + operacao.valorParcela.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    document.getElementById('opIndexador').value = operacao.indexador || 'cdi';
    document.getElementById('opSpread').value = operacao.spread || '';
    document.getElementById('opTaxaMensal').value = operacao.taxaMensal || '';
    if (operacao.taxaMensal) document.getElementById('opTaxaAnual').value = calcularTaxaAnual(operacao.taxaMensal).toFixed(2) + '% a.a.';
    document.getElementById('opGarantia').value = operacao.garantia || 'aval';
    if (operacao.valorGarantia) document.getElementById('opValorGarantia').value = 'R$ ' + operacao.valorGarantia.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (operacao.reciprocidades) {
      document.getElementById('opRecFolha').checked = operacao.reciprocidades.folhaPagamento || false;
      document.getElementById('opRecDomicilio').checked = operacao.reciprocidades.domicilioBancario || false;
      document.getElementById('opRecCobranca').checked = operacao.reciprocidades.cobranca || false;
      document.getElementById('opRecSeguroPrest').checked = operacao.reciprocidades.seguroPrestamista || false;
      if (operacao.reciprocidades.seguroPrestamistaValor) document.getElementById('opRecSeguroPrestValor').value = 'R$ ' + operacao.reciprocidades.seguroPrestamistaValor.toFixed(2).replace('.', ',');
      document.getElementById('opRecCapitalizacao').checked = operacao.reciprocidades.capitalizacao || false;
      if (operacao.reciprocidades.capitalizacaoValor) document.getElementById('opRecCapitalizacaoValor').value = 'R$ ' + operacao.reciprocidades.capitalizacaoValor.toFixed(2).replace('.', ',');
      document.getElementById('opRecTarifas').checked = operacao.reciprocidades.tarifas || false;
      if (operacao.reciprocidades.tarifasValor) document.getElementById('opRecTarifasValor').value = 'R$ ' + operacao.reciprocidades.tarifasValor.toFixed(2).replace('.', ',');
      if (operacao.reciprocidades.outrosCustos) document.getElementById('opRecOutros').value = 'R$ ' + operacao.reciprocidades.outrosCustos.toFixed(2).replace('.', ',');
    }
    document.getElementById('opMulta').value = operacao.multaLiquidacao || '2';
    document.getElementById('opLockup').value = operacao.lockup || '0';
    if (operacao.banco === 'outro') document.getElementById('divBancoOutro').style.display = 'block';
    if (operacao.indexador === 'pre') document.getElementById('divSpread').style.display = 'none';
    document.getElementById('btnExcluirOp').style.display = 'inline-block';
  }
  modal.style.display = 'block';
}

function fecharModalOperacao() {
  document.getElementById('modalOperacao').style.display = 'none';
}

function abrirSimuladorPortabilidade(operacaoSelecionada, data) {
  const area = document.getElementById('areaSimulador');
  if (!area) return;
  
  let html = '<div style="background:#fff; border-radius:8px; padding:20px">' +
    '<div style="font-size:14px; font-weight:700; color:#92400e; margin-bottom:16px">🔄 Simulador de Portabilidade</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-bottom:16px">' +
    '<div><label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">Operação a Portar</label>' +
    '<select id="simOpSelecionada" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px">';
  
  OPERACOES_DIVIDA.forEach(op => {
    const banco = LISTA_BANCOS.find(b => b.id === op.banco)?.nome || op.bancoOutro || 'Outro';
    html += '<option value="' + op.id + '" ' + (operacaoSelecionada?.id === op.id ? 'selected' : '') + '>' + banco + ' - ' + toBRL(op.saldoDevedor) + ' @ ' + (op.taxaMensal || 0).toFixed(2) + '%</option>';
  });
  
  html += '</select></div>' +
    '<div><label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">Nova Taxa (% a.m.)</label>' +
    '<input type="number" id="simNovaTaxa" step="0.01" value="1.30" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px"></div>' +
    '<div><label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">Novo Prazo (meses)</label>' +
    '<input type="number" id="simNovoPrazo" value="' + (operacaoSelecionada?.parcelasRestantes || 36) + '" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px"></div></div>' +
    '<button id="btnCalcularPort" style="padding:10px 20px; background:#d97706; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer">Calcular</button>' +
    '<div id="resultadoPortabilidade" style="margin-top:16px"></div></div>';
  
  area.innerHTML = html;
  area.style.display = 'block';
  
  document.getElementById('btnCalcularPort')?.addEventListener('click', () => {
    const opId = document.getElementById('simOpSelecionada').value;
    const op = OPERACOES_DIVIDA.find(o => o.id === opId);
    const novaTaxa = parseFloat(document.getElementById('simNovaTaxa').value) || 0;
    const novoPrazo = parseInt(document.getElementById('simNovoPrazo').value) || 0;
    if (!op) return;
    
    const r = simularPortabilidade(op, novaTaxa, novoPrazo);
    
    document.getElementById('resultadoPortabilidade').innerHTML = 
      '<div style="background:' + (r.vale ? '#f0fdf4' : '#fef2f2') + '; border:1px solid ' + (r.vale ? '#bbf7d0' : '#fecaca') + '; border-radius:8px; padding:16px">' +
      '<div style="font-size:14px; font-weight:700; color:' + (r.vale ? '#16a34a' : '#dc2626') + '; margin-bottom:12px">' + (r.vale ? '✅ VALE A PENA!' : '❌ NÃO COMPENSA') + '</div>' +
      '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; font-size:12px">' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Parcela Atual</div><div style="font-size:16px; font-weight:700">' + toBRL(r.parcelaAtual) + '</div></div>' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Nova Parcela</div><div style="font-size:16px; font-weight:700; color:#16a34a">' + toBRL(r.novaParcela) + '</div></div>' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Redução Mensal</div><div style="font-size:16px; font-weight:700; color:#16a34a">' + toBRL(r.reducaoParcela) + ' (-' + r.reducaoParcelaPct.toFixed(0) + '%)</div></div>' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Custos de Saída</div><div style="font-size:16px; font-weight:700; color:#dc2626">' + toBRL(r.custosSaida) + '</div></div>' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Economia Total</div><div style="font-size:16px; font-weight:700; color:' + (r.economiaTotal >= 0 ? '#16a34a' : '#dc2626') + '">' + toBRL(r.economiaTotal) + '</div></div>' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Payback</div><div style="font-size:16px; font-weight:700">' + r.paybackMeses + ' meses</div></div></div></div>';
  });
}

function abrirSimuladorConsolidacao(data) {
  const area = document.getElementById('areaSimulador');
  if (!area) return;
  
  let html = '<div style="background:#fff; border-radius:8px; padding:20px">' +
    '<div style="font-size:14px; font-weight:700; color:#92400e; margin-bottom:16px">🔗 Simulador de Consolidação</div>' +
    '<div style="margin-bottom:16px"><label style="font-size:12px; font-weight:600; display:block; margin-bottom:8px">Selecione as operações:</label>' +
    '<div style="display:grid; gap:8px; max-height:200px; overflow-y:auto; padding:8px; background:#f9fafb; border-radius:6px">';
  
  OPERACOES_DIVIDA.forEach(op => {
    const banco = LISTA_BANCOS.find(b => b.id === op.banco)?.nome || op.bancoOutro || 'Outro';
    html += '<label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer">' +
      '<input type="checkbox" class="consolidar-check" value="' + op.id + '">' +
      '<span>' + banco + ' - ' + toBRL(op.saldoDevedor) + ' @ ' + (op.taxaMensal || 0).toFixed(2) + '%</span></label>';
  });
  
  html += '</div></div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px">' +
    '<div><label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">Nova Taxa (% a.m.)</label>' +
    '<input type="number" id="simConsTaxa" step="0.01" value="1.30" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px"></div>' +
    '<div><label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">Novo Prazo (meses)</label>' +
    '<input type="number" id="simConsPrazo" value="48" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px"></div></div>' +
    '<button id="btnCalcularCons" style="padding:10px 20px; background:#d97706; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer">Calcular</button>' +
    '<div id="resultadoConsolidacao" style="margin-top:16px"></div></div>';
  
  area.innerHTML = html;
  area.style.display = 'block';
  
  document.getElementById('btnCalcularCons')?.addEventListener('click', () => {
    const selecionados = Array.from(document.querySelectorAll('.consolidar-check:checked')).map(c => c.value);
    const ops = OPERACOES_DIVIDA.filter(op => selecionados.includes(op.id));
    if (ops.length < 2) { alert('Selecione pelo menos 2 operações.'); return; }
    
    const novaTaxa = parseFloat(document.getElementById('simConsTaxa').value) || 0;
    const novoPrazo = parseInt(document.getElementById('simConsPrazo').value) || 0;
    const r = simularConsolidacao(ops, novaTaxa, novoPrazo);
    
    document.getElementById('resultadoConsolidacao').innerHTML = 
      '<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px">' +
      '<div style="font-size:14px; font-weight:700; color:#16a34a; margin-bottom:12px">📊 Resultado (' + r.qtdOperacoes + ' operações)</div>' +
      '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; font-size:12px">' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Total Consolidado</div><div style="font-size:16px; font-weight:700">' + toBRL(r.totalSaldo) + '</div></div>' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Parcelas Atuais</div><div style="font-size:16px; font-weight:700">' + toBRL(r.totalParcelas) + '</div></div>' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Nova Parcela</div><div style="font-size:16px; font-weight:700; color:#16a34a">' + toBRL(r.novaParcela) + '</div></div>' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Redução Mensal</div><div style="font-size:16px; font-weight:700; color:#16a34a">' + toBRL(r.reducaoParcela) + '</div></div>' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Liberação/Mês</div><div style="font-size:16px; font-weight:700; color:#16a34a">' + toBRL(r.liberacaoMensal) + '</div></div>' +
      '<div><div style="color:#6b7280; margin-bottom:4px">Custos Saída</div><div style="font-size:16px; font-weight:700; color:#dc2626">' + toBRL(r.custosSaida) + '</div></div></div></div>';
  });
}

function abrirSimuladorImpacto(data) {
  const area = document.getElementById('areaSimulador');
  if (!area) return;
  
  const latest = data.rows?.[0] || {};
  const consolidado = calcularConsolidadoDividas(OPERACOES_DIVIDA, { ebitda: latest.ebitda || 0 });
  
  let html = '<div style="background:#fff; border-radius:8px; padding:20px">' +
    '<div style="font-size:14px; font-weight:700; color:#92400e; margin-bottom:16px">📊 Impacto nos Indicadores</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px">' +
    '<div><label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">Reduzir dívida em</label>' +
    '<input type="text" id="simReducao" class="money-input" value="R$ 1.000.000,00" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px"></div>' +
    '<div><label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px">E/ou nova taxa (% a.m.)</label>' +
    '<input type="number" id="simNovaTaxaImp" step="0.01" value="' + (consolidado.custoMedioPonderado * 0.85).toFixed(2) + '" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px"></div></div>' +
    '<button id="btnCalcularImpacto" style="padding:10px 20px; background:#d97706; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer">Calcular</button>' +
    '<div id="resultadoImpacto" style="margin-top:16px"></div></div>';
  
  area.innerHTML = html;
  area.style.display = 'block';
  
  document.getElementById('simReducao')?.addEventListener('input', (e) => formatMoneyInput(e.target));
  
  document.getElementById('btnCalcularImpacto')?.addEventListener('click', () => {
    const reducao = parseMoneyDivida(document.getElementById('simReducao').value);
    const novaTaxa = parseFloat(document.getElementById('simNovaTaxaImp').value) || consolidado.custoMedioPonderado;
    const ebitda = latest.ebitda || 1;
    const novaDivida = consolidado.totalDividaBruta - reducao;
    const novoDlEbitda = novaDivida / ebitda;
    const novoJurosAnual = novaDivida * novaTaxa * 12 / 100;
    const economiaJuros = consolidado.custoAnualJuros - novoJurosAnual;
    
    document.getElementById('resultadoImpacto').innerHTML = 
      '<div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:16px">' +
      '<div style="font-size:14px; font-weight:700; color:#0369a1; margin-bottom:12px">📈 Impacto do Cenário</div>' +
      '<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; font-size:12px">' +
      '<div style="text-align:center; padding:12px; background:#fff; border-radius:6px"><div style="color:#6b7280; margin-bottom:4px">DL/EBITDA</div>' +
      '<div style="font-size:14px"><span style="color:#dc2626">' + (consolidado.dlEbitda?.toFixed(1) || '—') + 'x</span> → <span style="color:#16a34a; font-weight:700">' + novoDlEbitda.toFixed(1) + 'x</span></div></div>' +
      '<div style="text-align:center; padding:12px; background:#fff; border-radius:6px"><div style="color:#6b7280; margin-bottom:4px">Custo Médio</div>' +
      '<div style="font-size:14px"><span style="color:#dc2626">' + consolidado.custoMedioPonderado.toFixed(2) + '%</span> → <span style="color:#16a34a; font-weight:700">' + novaTaxa.toFixed(2) + '%</span></div></div>' +
      '<div style="text-align:center; padding:12px; background:#fff; border-radius:6px"><div style="color:#6b7280; margin-bottom:4px">Juros/Ano</div>' +
      '<div style="font-size:14px"><span style="color:#dc2626">' + toBRL(consolidado.custoAnualJuros) + '</span> → <span style="color:#16a34a; font-weight:700">' + toBRL(novoJurosAnual) + '</span></div></div>' +
      '<div style="text-align:center; padding:12px; background:#dcfce7; border-radius:6px"><div style="color:#16a34a; margin-bottom:4px; font-weight:600">Economia/Ano</div>' +
      '<div style="font-size:18px; font-weight:800; color:#16a34a">' + toBRL(economiaJuros) + '</div></div></div></div>';
  });
}

window.renderDividasBancarias = renderDividasBancarias;
window.OPERACOES_DIVIDA = OPERACOES_DIVIDA;

// ================================================================================
// ==================== MÓDULO DE LEAD SCORING DE CRÉDITO ====================
// ================================================================================

/**
 * LEAD SCORING DE CRÉDITO
 * Identifica clientes com maior probabilidade de fechar negócio:
 * - NECESSIDADE: Precisa de crédito (liquidez apertada, crescimento, etc.)
 * - CAPACIDADE: Banco vai aprovar (indicadores saudáveis, sem risco alto)
 * - PRODUTO IDEAL: Sugere o produto mais adequado para a situação
 */

// Calcula score de NECESSIDADE de crédito (0-100)
function calcularScoreNecessidade(calc) {
  let score = 0;
  let sinais = [];
  
  // 1. Liquidez apertada (0.8 a 1.3 = precisa de giro)
  if (calc.liq != null && calc.liq >= 0.7 && calc.liq <= 1.3) {
    const pontos = calc.liq < 1.0 ? 25 : 15;
    score += pontos;
    sinais.push({ fator: 'Liquidez apertada', valor: calc.liq?.toFixed(2), pontos });
  }
  
  // 2. NCG positiva alta (capital de giro sendo consumido)
  if (calc.ncg != null && calc.ncg > 0 && calc.receita > 0) {
    const ncgSobreReceita = calc.ncg / calc.receita;
    if (ncgSobreReceita > 0.15) {
      const pontos = Math.min(20, Math.round(ncgSobreReceita * 50));
      score += pontos;
      sinais.push({ fator: 'NCG elevada', valor: (ncgSobreReceita * 100).toFixed(0) + '% da receita', pontos });
    }
  }
  
  // 3. Ciclo financeiro longo (usando calc.ciclo)
  if (calc.ciclo != null && calc.ciclo > 45) {
    const pontos = Math.min(15, Math.round((calc.ciclo - 45) / 5));
    score += pontos;
    sinais.push({ fator: 'Ciclo financeiro longo', valor: calc.ciclo?.toFixed(0) + ' dias', pontos });
  }
  
  // 4. Crescimento de receita (verificar se existe variação)
  // Se não tiver histórico, estimar pela margem e tamanho
  if (calc.margem > 0.10 && calc.receita > 5000000) {
    score += 10;
    sinais.push({ fator: 'Empresa em crescimento', valor: 'Margem ' + (calc.margem * 100).toFixed(0) + '%', pontos: 10 });
  }
  
  // 5. Imobilização alta (pode precisar renovar)
  if (calc.imobPL != null && calc.imobPL > 0.5 && calc.margem > 0.08) {
    score += 10;
    sinais.push({ fator: 'Potencial renovação ativos', valor: 'Imob/PL: ' + (calc.imobPL * 100).toFixed(0) + '%', pontos: 10 });
  }
  
  // 6. Dívida baixa = espaço para captar
  if (calc.alav != null && calc.alav < 1.5 && calc.alav >= 0) {
    score += 15;
    sinais.push({ fator: 'Espaço para nova dívida', valor: 'DL/EBITDA: ' + calc.alav?.toFixed(1) + 'x', pontos: 15 });
  }
  
  // 7. Sazonalidade (Q4 = preparação para próximo ano)
  const mesAtual = new Date().getMonth();
  if (mesAtual >= 9) { // Out, Nov, Dez
    score += 5;
    sinais.push({ fator: 'Período de planejamento', valor: 'Q4 - preparação', pontos: 5 });
  }
  
  return { score: Math.min(100, score), sinais };
}

// Calcula score de CAPACIDADE de pagamento (0-100)
function calcularScoreCapacidade(calc) {
  let score = 0;
  let sinais = [];
  
  // 1. DL/EBITDA saudável (< 2.5 = ótimo, < 3.5 = ok)
  if (calc.alav != null) {
    if (calc.alav < 0) {
      score += 25; // Caixa líquido
      sinais.push({ fator: 'Caixa líquido', valor: 'DL/EBITDA negativo', pontos: 25 });
    } else if (calc.alav <= 1.5) {
      score += 25;
      sinais.push({ fator: 'Baixa alavancagem', valor: calc.alav.toFixed(1) + 'x', pontos: 25 });
    } else if (calc.alav <= 2.5) {
      score += 18;
      sinais.push({ fator: 'Alavancagem moderada', valor: calc.alav.toFixed(1) + 'x', pontos: 18 });
    } else if (calc.alav <= 3.5) {
      score += 8;
      sinais.push({ fator: 'Alavancagem aceitável', valor: calc.alav.toFixed(1) + 'x', pontos: 8 });
    }
    // > 3.5 = não pontua
  }
  
  // 2. Margem EBITDA (gera caixa para pagar)
  if (calc.margem != null) {
    if (calc.margem >= 0.15) {
      score += 25;
      sinais.push({ fator: 'Margem excelente', valor: (calc.margem * 100).toFixed(0) + '%', pontos: 25 });
    } else if (calc.margem >= 0.10) {
      score += 18;
      sinais.push({ fator: 'Margem boa', valor: (calc.margem * 100).toFixed(0) + '%', pontos: 18 });
    } else if (calc.margem >= 0.06) {
      score += 10;
      sinais.push({ fator: 'Margem aceitável', valor: (calc.margem * 100).toFixed(0) + '%', pontos: 10 });
    }
  }
  
  // 3. Cobertura de juros (calc.juros = EBITDA / Despesa Financeira)
  if (calc.juros != null && calc.juros > 0) {
    if (calc.juros >= 3) {
      score += 20;
      sinais.push({ fator: 'Ótima cobertura de juros', valor: calc.juros.toFixed(1) + 'x', pontos: 20 });
    } else if (calc.juros >= 2) {
      score += 12;
      sinais.push({ fator: 'Cobertura adequada', valor: calc.juros.toFixed(1) + 'x', pontos: 12 });
    } else if (calc.juros >= 1.5) {
      score += 5;
      sinais.push({ fator: 'Cobertura mínima', valor: calc.juros.toFixed(1) + 'x', pontos: 5 });
    }
  }
  
  // 4. Liquidez corrente (não muito baixa nem muito alta)
  if (calc.liq != null) {
    if (calc.liq >= 1.2 && calc.liq <= 2.5) {
      score += 15;
      sinais.push({ fator: 'Liquidez equilibrada', valor: calc.liq.toFixed(2), pontos: 15 });
    } else if (calc.liq >= 1.0 && calc.liq < 1.2) {
      score += 8;
      sinais.push({ fator: 'Liquidez adequada', valor: calc.liq.toFixed(2), pontos: 8 });
    }
  }
  
  // 5. ROE positivo (empresa rentável)
  if (calc.roe != null && calc.roe > 0) {
    if (calc.roe >= 0.15) {
      score += 15;
      sinais.push({ fator: 'Alta rentabilidade', valor: (calc.roe * 100).toFixed(0) + '%', pontos: 15 });
    } else if (calc.roe >= 0.08) {
      score += 10;
      sinais.push({ fator: 'Boa rentabilidade', valor: (calc.roe * 100).toFixed(0) + '%', pontos: 10 });
    } else if (calc.roe > 0) {
      score += 5;
      sinais.push({ fator: 'Empresa lucrativa', valor: (calc.roe * 100).toFixed(0) + '%', pontos: 5 });
    }
  }
  
  return { score: Math.min(100, score), sinais };
}

// Sugere o produto ideal baseado na situação
function sugerirProdutoIdeal(calc, necessidade, capacidade) {
  const produtos = [];
  
  // 1. Capital de Giro - liquidez apertada ou NCG alta
  if (calc.liq < 1.2 || (calc.ncg && calc.ncg > 0 && calc.receita && calc.ncg / calc.receita > 0.1)) {
    const valor = calc.ncg > 0 ? calc.ncg : (calc.receita * 0.15);
    produtos.push({
      produto: 'Capital de Giro',
      icon: '💰',
      motivo: calc.liq < 1.0 ? 'Liquidez abaixo de 1.0' : 'NCG consumindo caixa',
      valorEstimado: Math.max(valor, 100000),
      prioridade: calc.liq < 1.0 ? 1 : 2
    });
  }
  
  // 2. Antecipação de Recebíveis - ciclo financeiro longo
  if (calc.ciclo > 45 && calc.cr > 0) {
    produtos.push({
      produto: 'Antecipação de Recebíveis',
      icon: '📄',
      motivo: 'Ciclo de ' + (calc.ciclo || 0).toFixed(0) + ' dias',
      valorEstimado: calc.cr * 0.7,
      prioridade: 2
    });
  }
  
  // 3. Finame/BNDES - empresa com margem boa e baixa alavancagem
  if (calc.margem >= 0.10 && calc.alav < 2.5 && calc.receita > 2000000) {
    const valorEstimado = calc.receita * 0.2;
    produtos.push({
      produto: 'Finame / BNDES',
      icon: '🏭',
      motivo: 'Perfil para investimento',
      valorEstimado: valorEstimado,
      prioridade: 3
    });
  }
  
  // 4. Financiamento de veículos/máquinas - empresa estável
  if (calc.margem >= 0.08 && calc.liq >= 1.0 && calc.alav < 3) {
    produtos.push({
      produto: 'Financ. Máquinas/Veículos',
      icon: '🚛',
      motivo: 'Empresa estável para investir',
      valorEstimado: calc.receita * 0.1,
      prioridade: 3
    });
  }
  
  // 5. Refinanciamento/Portabilidade - se já tem dívida e paga juros altos
  if (calc.alav > 1.5 && calc.alav < 3 && calc.despFin > 0 && calc.juros && calc.juros < 3) {
    produtos.push({
      produto: 'Refinanciamento/Portabilidade',
      icon: '🔄',
      motivo: 'Potencial redução de custo',
      valorEstimado: calc.dividaBruta || calc.dl,
      prioridade: 2
    });
  }
  
  // 6. Conta Garantida - necessidade pontual
  if (calc.liq >= 0.9 && calc.liq < 1.3 && calc.margem >= 0.06) {
    produtos.push({
      produto: 'Conta Garantida',
      icon: '💳',
      motivo: 'Colchão para sazonalidade',
      valorEstimado: calc.receita / 12,
      prioridade: 4
    });
  }
  
  // Ordenar por prioridade
  produtos.sort((a, b) => a.prioridade - b.prioridade);
  
  return produtos.slice(0, 2);
}

// Calcula o LEAD SCORE final (combinação de necessidade e capacidade)
function calcularLeadScore(calc) {
  const necessidade = calcularScoreNecessidade(calc);
  const capacidade = calcularScoreCapacidade(calc);
  
  // Se capacidade muito baixa (< 30), não é lead qualificado
  if (capacidade.score < 30) {
    return {
      score: 0,
      classificacao: 'frio',
      icon: '⚪',
      label: 'Risco Alto',
      cor: '#9ca3af',
      motivo: 'Indicadores fracos para aprovação',
      necessidade,
      capacidade,
      produtos: []
    };
  }
  
  // Se capacidade muito alta (> 85) mas necessidade baixa (< 30)
  if (capacidade.score > 85 && necessidade.score < 30) {
    return {
      score: Math.round((necessidade.score + capacidade.score) / 2 * 0.5),
      classificacao: 'morno',
      icon: '⚪',
      label: 'Sem Necessidade',
      cor: '#6b7280',
      motivo: 'Empresa saudável, baixa necessidade',
      necessidade,
      capacidade,
      produtos: []
    };
  }
  
  // Score combinado: média ponderada (necessidade 40% + capacidade 60%)
  const scoreFinal = Math.round(necessidade.score * 0.4 + capacidade.score * 0.6);
  const produtos = sugerirProdutoIdeal(calc, necessidade, capacidade);
  
  // Classificação
  let classificacao, icon, label, cor;
  
  if (scoreFinal >= 70 && necessidade.score >= 40 && capacidade.score >= 50) {
    classificacao = 'quente';
    icon = '🔥';
    label = 'Hot Lead';
    cor = '#dc2626';
  } else if (scoreFinal >= 55 && necessidade.score >= 30 && capacidade.score >= 40) {
    classificacao = 'morno_alto';
    icon = '🟡';
    label = 'Boa Chance';
    cor = '#f59e0b';
  } else if (scoreFinal >= 40 && capacidade.score >= 35) {
    classificacao = 'morno';
    icon = '🟢';
    label = 'Potencial';
    cor = '#22c55e';
  } else {
    classificacao = 'frio';
    icon = '⚪';
    label = 'Baixo Potencial';
    cor = '#9ca3af';
  }
  
  return {
    score: scoreFinal,
    classificacao,
    icon,
    label,
    cor,
    motivo: produtos.length > 0 ? produtos[0].motivo : 'Avaliar oportunidade',
    necessidade,
    capacidade,
    produtos
  };
}

// Atualiza o painel de oportunidades na tela inicial
function atualizarPainelOportunidades(listaComCalc) {
  const painel = document.getElementById('painelOportunidades');
  const lista = document.getElementById('listaOportunidades');
  const qtdEl = document.getElementById('qtdOportunidades');
  
  if (!painel || !lista) return;
  
  // Calcular lead score para cada empresa
  const empresasComLead = listaComCalc.map(row => {
    const lead = calcularLeadScore(row);
    return { ...row, lead };
  });
  
  // Filtrar apenas hot leads e boas chances
  const oportunidades = empresasComLead
    .filter(e => e.lead.classificacao === 'quente' || e.lead.classificacao === 'morno_alto')
    .sort((a, b) => b.lead.score - a.lead.score)
    .slice(0, 5);
  
  if (oportunidades.length === 0) {
    painel.style.display = 'none';
    return;
  }
  
  painel.style.display = 'block';
  qtdEl.textContent = oportunidades.filter(o => o.lead.classificacao === 'quente').length + ' hot leads';
  
  lista.innerHTML = oportunidades.map(emp => {
    const produtos = emp.lead.produtos;
    const produtoPrincipal = produtos[0];
    
    return `
      <div style="background:rgba(255,255,255,.95); border-radius:10px; padding:16px; color:#1e293b; display:flex; justify-content:space-between; align-items:center; gap:16px">
        <div style="flex:1">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px">
            <span style="font-size:20px">${emp.lead.icon}</span>
            <span style="font-weight:700; font-size:15px">${escapeHtml(emp.nome)}</span>
            <span style="background:${emp.lead.cor}; color:#fff; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600">${emp.lead.label}</span>
          </div>
          <div style="display:flex; gap:16px; font-size:12px; color:#64748b; flex-wrap:wrap">
            <span>📊 Score: <strong style="color:#1e293b">${emp.score}</strong></span>
            <span>💰 Receita: <strong style="color:#1e293b">${toBRL(emp.receita)}</strong></span>
            <span>📈 Margem: <strong style="color:#1e293b">${toPct(emp.margem)}</strong></span>
            <span>⚖️ DL/EBITDA: <strong style="color:#1e293b">${emp.alav != null ? emp.alav.toFixed(1) + 'x' : '—'}</strong></span>
          </div>
        </div>
        <div style="text-align:right; min-width:180px">
          ${produtoPrincipal ? `
            <div style="background:#fef3c7; border:1px solid #f59e0b; border-radius:6px; padding:8px 12px; margin-bottom:8px">
              <div style="font-size:11px; color:#92400e; margin-bottom:2px">Produto Sugerido</div>
              <div style="font-weight:700; color:#78350f; font-size:13px">${produtoPrincipal.icon} ${produtoPrincipal.produto}</div>
              <div style="font-size:11px; color:#92400e">~ ${toBRL(produtoPrincipal.valorEstimado)}</div>
            </div>
          ` : ''}
          <button class="btn btn-outline" style="padding:6px 12px; font-size:11px; background:#fff" onclick="abrirModalDetalhes('${emp.empresaId}')">
            📊 Ver Análise
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Gera HTML da coluna de oportunidade para a tabela
function gerarColunaOportunidade(lead) {
  if (lead.classificacao === 'frio' || !lead.produtos.length) {
    return `
      <div style="text-align:center">
        <span style="color:${lead.cor}; font-size:16px">${lead.icon}</span>
        <div style="font-size:10px; color:#9ca3af">${lead.label}</div>
      </div>
    `;
  }
  
  const produto = lead.produtos[0];
  return `
    <div style="text-align:center">
      <div style="display:flex; align-items:center; justify-content:center; gap:4px; margin-bottom:2px">
        <span style="font-size:14px">${lead.icon}</span>
        <span style="font-size:12px; font-weight:700; color:${lead.cor}">${lead.score}</span>
      </div>
      <div style="font-size:10px; color:#64748b; white-space:nowrap">${produto.icon} ${produto.produto}</div>
      <div style="font-size:9px; color:#9ca3af">~${toBRL(produto.valorEstimado)}</div>
    </div>
  `;
}

// Expor funções
window.calcularLeadScore = calcularLeadScore;
window.atualizarPainelOportunidades = atualizarPainelOportunidades;
window.gerarColunaOportunidade = gerarColunaOportunidade;

// ================================================================================
// ==================== MÓDULO DE IMPORTAÇÃO DE PDF EDITÁVEL ====================
// ================================================================================

/**
 * IMPORTAÇÃO DE PDF EDITÁVEL
 * - Baixa PDF com CNPJ pré-preenchido
 * - Lê PDF preenchido e extrai dados automaticamente
 * - Usa pdf-lib (biblioteca JS pura)
 */

// Mapeamento dos campos do PDF para campos do sistema
const MAPEAMENTO_PDF_CAMPOS = {
  // Identificação
  'razao_social': 'razaoSocial',
  'cnpj': 'cnpj',
  'setor': 'setor',
  
  // DRE - usando o ano mais recente (será ajustado dinamicamente)
  '=_RECEITA_LÍQUIDA': 'receitaLiquida',
  '+_Receita_Bruta': 'receitaBruta',
  '-_Deduções': 'deducoes',
  '-_CMV___CSV': 'cmv',
  '=_LUCRO_BRUTO': 'lucroBruto',
  '-_Despesas_com_Venda': 'despesasVendas',
  '-_Despesas_Administr': 'despesasAdministrativas',
  '-_Depreciação_Amorti': 'depreciacaoAmortizacao',
  '-_Outras_Desp._Opera': 'outrasDespesas',
  '=_EBIT_Lucro_Operaci': 'ebit',
  '=_EBITDA_': 'ebitda',
  '+_Receitas_Financeir': 'receitasFinanceiras',
  '-_Despesas_Financeir': 'despesasFinanceiras',
  '=_Lucro_Antes_IR_LAI': 'lair',
  '-_IR_e_CSLL': 'ircsll',
  '=_LUCRO_LÍQUIDO': 'lucroLiquido',
  
  // Ativo
  'ativo___Caixa_e_Bancos': 'caixa',
  'ativo___Aplicações_Finance': 'aplicacoesFinanceirasCP',
  'ativo___Contas_a_Receber': 'contasReceber',
  'ativo___Estoques': 'estoques',
  'ativo___Outros_Ativos_Circ': 'outrosAtivosCirc',
  'ativo_TOTAL_ATIVO_CIRCULAN': 'ativoCirculante',
  'ativo___Realizável_LP': 'realizavelLP',
  'ativo___Imobilizado': 'imobilizado',
  'ativo___-_Depreciação_Acum': 'depreciacaoAcumulada',
  'ativo___Intangível': 'intangivel',
  'ativo_TOTAL_ATIVO_NÃO_CIRC': 'ativoNaoCirculante',
  'ativo_ATIVO_TOTAL': 'ativoTotal',
  
  // Passivo
  'passivo___Fornecedores': 'fornecedores',
  'passivo___Empréstimos_CP_até': 'emprestimosCP',
  'passivo___Obrigações_Trabalh': 'obrigacoesTrabalhistas',
  'passivo___Obrigações_Tributá': 'obrigacoesTributarias',
  'passivo_TOTAL_PASSIVO_CIRCUL': 'passivoCirculante',
  'passivo___Empréstimos_LP_>_1': 'emprestimosLP',
  'passivo___Outras_Obrigações_': 'outrasObrigacoesLP',
  'passivo_TOTAL_PASSIVO_NÃO_CI': 'passivoNaoCirculante',
  
  // Patrimônio Líquido
  'passivo___Capital_Social': 'capitalSocial',
  'passivo___Reservas': 'reservas',
  'passivo___Lucros_Prej._Acumu': 'lucrosAcumulados',
  'passivo_TOTAL_PATRIMÔNIO_LÍQ': 'patrimonioLiquido',
  
  // Informações complementares
  'info_Nº_de_Funcionários_(': 'funcionarios',
  'info_Prazo_Médio_Recebime': 'pmr',
  'info_Prazo_Médio_Pagament': 'pmp',
  'info_Giro_de_Estoque_(dia': 'giroEstoque'
};

// Anos disponíveis no PDF (ajustado dinamicamente)
let PDF_ANOS_DISPONIVEIS = ['2023', '2024', '2025'];

// Função para carregar pdf-lib dinamicamente
async function carregarPdfLib() {
  if (window.PDFLib) return window.PDFLib;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
    script.onload = () => resolve(window.PDFLib);
    script.onerror = () => reject(new Error('Falha ao carregar pdf-lib'));
    document.head.appendChild(script);
  });
}

// Função para baixar PDF com CNPJ pré-preenchido
async function baixarPdfEditavel(empresaId) {
  try {
    const empresa = EMPRESAS_CACHE.get(empresaId);
    if (!empresa) {
      alert('Empresa não encontrada no cache');
      return;
    }
    
    // Buscar dados completos da empresa
    const empDoc = await db.collection('empresas').doc(empresaId).get();
    const empData = empDoc.data() || {};
    
    const cnpj = empData.cnpj || '';
    const razaoSocial = empData.nome || empData.razaoSocial || empresa.nome || '';
    
    // Carregar pdf-lib
    const PDFLib = await carregarPdfLib();
    
    // Carregar o PDF modelo
    const pdfUrl = 'formulario_coleta_EDITAVEL.pdf'; // Deve estar na mesma pasta
    const existingPdfBytes = await fetch(pdfUrl).then(res => res.arrayBuffer());
    
    // Carregar o documento
    const pdfDoc = await PDFLib.PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();
    
    // Preencher CNPJ e Razão Social
    try {
      const campoCnpj = form.getTextField('cnpj');
      if (campoCnpj) campoCnpj.setText(cnpj);
    } catch(e) { console.log('Campo cnpj não encontrado'); }
    
    try {
      const campoRazao = form.getTextField('razao_social');
      if (campoRazao) campoRazao.setText(razaoSocial);
    } catch(e) { console.log('Campo razao_social não encontrado'); }
    
    // Preencher data base
    try {
      const campoData = form.getTextField('data_base');
      if (campoData) campoData.setText(new Date().toLocaleDateString('pt-BR'));
    } catch(e) { console.log('Campo data_base não encontrado'); }
    
    // Salvar PDF modificado
    const pdfBytes = await pdfDoc.save();
    
    // Criar download
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `coleta_${cnpj.replace(/\D/g, '') || empresaId}_${new Date().getFullYear()}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    
    console.log('[baixarPdfEditavel] PDF baixado com sucesso');
    
  } catch(e) {
    console.error('[baixarPdfEditavel] Erro:', e);
    alert('Erro ao gerar PDF: ' + e.message + '\n\nVerifique se o arquivo formulario_coleta_EDITAVEL.pdf está na pasta do sistema.');
  }
}

// Função para ler PDF preenchido e extrair dados
async function lerPdfPreenchido(file) {
  try {
    const PDFLib = await carregarPdfLib();
    
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
    const form = pdfDoc.getForm();
    
    const dados = {
      cnpj: '',
      razaoSocial: '',
      anos: {}
    };
    
    // Extrair todos os campos
    const fields = form.getFields();
    
    fields.forEach(field => {
      const nome = field.getName();
      let valor = '';
      
      try {
        if (field.constructor.name === 'PDFTextField') {
          valor = field.getText() || '';
        }
      } catch(e) {
        console.log('Erro ao ler campo:', nome);
      }
      
      if (!valor) return;
      
      // CNPJ
      if (nome === 'cnpj') {
        dados.cnpj = valor;
        return;
      }
      
      // Razão Social
      if (nome === 'razao_social') {
        dados.razaoSocial = valor;
        return;
      }
      
      // Verificar se tem ano no nome do campo
      for (const ano of PDF_ANOS_DISPONIVEIS) {
        if (nome.endsWith('_' + ano)) {
          // Extrair nome base do campo (sem o ano)
          const nomeBase = nome.slice(0, -(ano.length + 1));
          
          // Inicializar objeto do ano se não existir
          if (!dados.anos[ano]) {
            dados.anos[ano] = {};
          }
          
          // Mapear para campo do sistema
          const campoSistema = MAPEAMENTO_PDF_CAMPOS[nomeBase];
          if (campoSistema) {
            // Converter para número se possível
            const valorNumerico = parseFloat(valor.replace(/[^\d,.-]/g, '').replace(',', '.'));
            dados.anos[ano][campoSistema] = isNaN(valorNumerico) ? valor : valorNumerico;
          }
          break;
        }
      }
    });
    
    console.log('[lerPdfPreenchido] Dados extraídos:', dados);
    return dados;
    
  } catch(e) {
    console.error('[lerPdfPreenchido] Erro:', e);
    throw e;
  }
}

// Função para processar upload de PDF
async function processarUploadPdf(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    alert('Por favor, selecione um arquivo PDF');
    return;
  }
  
  try {
    // Mostrar loading
    const btnUpload = document.getElementById('btnUploadPdf');
    const textoOriginal = btnUpload.innerHTML;
    btnUpload.innerHTML = '⏳ Processando...';
    btnUpload.disabled = true;
    
    // Ler PDF
    const dados = await lerPdfPreenchido(file);
    
    if (!dados.cnpj) {
      alert('CNPJ não encontrado no PDF. Verifique se o PDF foi preenchido corretamente.');
      btnUpload.innerHTML = textoOriginal;
      btnUpload.disabled = false;
      return;
    }
    
    // Buscar empresa pelo CNPJ
    const cnpjLimpo = dados.cnpj.replace(/\D/g, '');
    let empresaId = null;
    let empresaNome = '';
    
    // Procurar no cache primeiro
    for (const [id, emp] of EMPRESAS_CACHE.entries()) {
      const empCnpj = (emp.cnpj || '').replace(/\D/g, '');
      if (empCnpj === cnpjLimpo) {
        empresaId = id;
        empresaNome = emp.nome;
        break;
      }
    }
    
    // Se não achou no cache, buscar no Firebase
    if (!empresaId) {
      const empQuery = await db.collection('empresas')
        .where('cnpj', '==', dados.cnpj)
        .limit(1)
        .get();
      
      if (!empQuery.empty) {
        empresaId = empQuery.docs[0].id;
        empresaNome = empQuery.docs[0].data().nome || dados.razaoSocial;
      }
    }
    
    if (!empresaId) {
      alert(`Empresa com CNPJ ${dados.cnpj} não encontrada no sistema.\n\nCadastre a empresa primeiro antes de importar os dados.`);
      btnUpload.innerHTML = textoOriginal;
      btnUpload.disabled = false;
      return;
    }
    
    // Verificar quais anos têm dados
    const anosComDados = Object.keys(dados.anos).filter(ano => {
      const dadosAno = dados.anos[ano];
      return Object.keys(dadosAno).length > 0;
    });
    
    if (anosComDados.length === 0) {
      alert('Nenhum dado financeiro encontrado no PDF. Verifique se os campos foram preenchidos.');
      btnUpload.innerHTML = textoOriginal;
      btnUpload.disabled = false;
      return;
    }
    
    // Confirmar importação
    const confirmMsg = `📊 Dados encontrados para: ${empresaNome}\n\n` +
      `Anos com dados: ${anosComDados.join(', ')}\n\n` +
      `Deseja importar os dados para o sistema?`;
    
    if (!confirm(confirmMsg)) {
      btnUpload.innerHTML = textoOriginal;
      btnUpload.disabled = false;
      return;
    }
    
    // Salvar dados no Firebase
    let salvos = 0;
    for (const ano of anosComDados) {
      const dadosAno = dados.anos[ano];
      
      // Adicionar metadados
      dadosAno.ano = parseInt(ano);
      dadosAno.importadoDePdf = true;
      dadosAno.dataImportacao = new Date().toISOString();
      dadosAno.atualizadoEm = firebase.firestore.FieldValue.serverTimestamp();
      
      // Calcular campos derivados se possível
      if (dadosAno.receitaBruta && dadosAno.deducoes) {
        dadosAno.receitaLiquida = dadosAno.receitaBruta - dadosAno.deducoes;
      }
      if (dadosAno.emprestimosCP && dadosAno.emprestimosLP) {
        dadosAno.dividaBruta = dadosAno.emprestimosCP + dadosAno.emprestimosLP;
      }
      
      // Verificar se já existe registro para este ano
      const existente = await db.collection('empresas').doc(empresaId)
        .collection('financeiro')
        .where('ano', '==', parseInt(ano))
        .limit(1)
        .get();
      
      if (!existente.empty) {
        // Atualizar existente
        await existente.docs[0].ref.update(dadosAno);
      } else {
        // Criar novo
        dadosAno.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('empresas').doc(empresaId)
          .collection('financeiro')
          .add(dadosAno);
      }
      
      salvos++;
    }
    
    alert(`✅ Importação concluída!\n\n${salvos} ano(s) importado(s) para ${empresaNome}`);
    
    // Recarregar dados
    btnUpload.innerHTML = textoOriginal;
    btnUpload.disabled = false;
    event.target.value = ''; // Limpar input
    
    // Recarregar lista
    if (typeof recarregarDados === 'function') {
      recarregarDados();
    } else {
      location.reload();
    }
    
  } catch(e) {
    console.error('[processarUploadPdf] Erro:', e);
    alert('Erro ao processar PDF: ' + e.message);
    
    const btnUpload = document.getElementById('btnUploadPdf');
    if (btnUpload) {
      btnUpload.innerHTML = '📤 Upload PDF Preenchido';
      btnUpload.disabled = false;
    }
  }
}

// Função para adicionar botão de download na tela de edição
function adicionarBotaoDownloadPdf(empresaId, container) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-outline';
  btn.style.cssText = 'padding:8px 16px; font-size:13px; background:linear-gradient(135deg, #fef3c7, #fde68a); border-color:#f59e0b; color:#92400e;';
  btn.innerHTML = '📥 Baixar PDF Editável';
  btn.onclick = () => baixarPdfEditavel(empresaId);
  
  if (container) {
    container.appendChild(btn);
  }
  
  return btn;
}

// Expor funções globalmente
window.baixarPdfEditavel = baixarPdfEditavel;
window.lerPdfPreenchido = lerPdfPreenchido;
window.processarUploadPdf = processarUploadPdf;
window.adicionarBotaoDownloadPdf = adicionarBotaoDownloadPdf;

// ================================================================================
// ==================== MÓDULO DE IMPORTAÇÃO DE PDF ====================
// ================================================================================

/**
 * SISTEMA DE COLETA VIA PDF - VERSÃO SIMPLIFICADA
 * 1. Usuário abre modal de edição de uma empresa
 * 2. Faz upload do PDF preenchido
 * 3. Sistema lê os campos e preenche o formulário automaticamente
 * 4. Usuário confere e salva (pode salvar múltiplos anos)
 * 
 * NÃO VALIDA CNPJ - lê qualquer PDF do formato correto
 */

// Mapeamento de campos do PDF para IDs do formulário HTML
const MAPEAMENTO_PDF_PARA_FORM = {
  // Campos básicos (aba Básico)
  'dre_receita_liquida': 'finReceita',
  'dre_ebitda': 'finEbitda',
  'dre_lucro_liquido': 'finLucroLiq',
  'passivo_total_pl': 'finPL',
  'ativo_ativo_total': 'finAtivo',
  'ativo_caixa': 'finCaixa',
  
  // DRE Completa
  'dre_receita_bruta': 'finReceitaBruta',
  'dre_deducoes': 'finDeducoes',
  'dre_cmv': 'finCMV',
  'dre_lucro_bruto': 'finLucroBruto',
  'dre_desp_vendas': 'finDespVendas',
  'dre_desp_admin': 'finDespAdm',
  'dre_depreciacao': 'finDepAmort',
  'dre_outras_desp': 'finOutrasDesp',
  'dre_ebit': 'finEBIT',
  'dre_receitas_fin': 'finReceitaFin',
  'dre_despesas_fin': 'finDespesaFin',
  'dre_lair': 'finLAIR',
  'dre_ir_csll': 'finIRCS',
  
  // Ativo
  'ativo_aplicacoes_cp': 'finACAplicacoes',
  'ativo_contas_receber': 'finCR',
  'ativo_estoques': 'finEstoques',
  'ativo_outros_ac': 'finACOutros',
  'ativo_total_ac': 'finAtivoCirc',
  'ativo_realizavel_lp': 'finANCRealizavel',
  'ativo_imobilizado': 'finImobilizado',
  'ativo_deprec_acum': 'finDepreciacao',
  'ativo_intangivel': 'finANCIntangivel',
  'ativo_total_anc': 'finAtivoNaoCirc',
  
  // Passivo
  'passivo_fornecedores': 'finCP',
  'passivo_emprestimos_cp': 'finPCEmprestimos',
  'passivo_obrig_trab': 'finPCSalarios',
  'passivo_obrig_trib': 'finPCImpostos',
  'passivo_outros_pc': 'finPCOutros',
  'passivo_total_pc': 'finPassivoCirc',
  'passivo_emprestimos_lp': 'finPNCEmprestimos',
  'passivo_outros_pnc': 'finPNCOutros',
  'passivo_total_pnc': 'finPassivoNaoCirc',
  'passivo_capital_social': 'finPLCapital',
  'passivo_reservas': 'finPLReservasLucro',
  'passivo_lucros_acum': 'finPLLucrosAcum',
  
  // Info complementares
  'info_funcionarios': 'finFuncionarios'
};

// Mapeamento para campos de sistema (para salvar no Firebase)
const MAPEAMENTO_CAMPOS_PDF = {
  'dre_receita_bruta': 'receitaBruta',
  'dre_deducoes': 'deducoes',
  'dre_receita_liquida': 'receitaLiquida',
  'dre_cmv': 'cmv',
  'dre_lucro_bruto': 'lucroBruto',
  'dre_desp_vendas': 'despesasVendas',
  'dre_desp_admin': 'despesasAdministrativas',
  'dre_depreciacao': 'depreciacaoAmortizacao',
  'dre_outras_desp': 'outrasDespesas',
  'dre_ebit': 'ebit',
  'dre_ebitda': 'ebitda',
  'dre_receitas_fin': 'receitasFinanceiras',
  'dre_despesas_fin': 'despesasFinanceiras',
  'dre_lair': 'lair',
  'dre_ir_csll': 'irCsll',
  'dre_lucro_liquido': 'lucroLiquido',
  'ativo_caixa': 'caixa',
  'ativo_aplicacoes_cp': 'aplicacoesFinanceirasCP',
  'ativo_contas_receber': 'contasReceber',
  'ativo_estoques': 'estoques',
  'ativo_outros_ac': 'outrosAtivosCirculantes',
  'ativo_total_ac': 'ativoCirculante',
  'ativo_realizavel_lp': 'realizavelLP',
  'ativo_imobilizado': 'imobilizado',
  'ativo_deprec_acum': 'depreciacaoAcumulada',
  'ativo_intangivel': 'intangivel',
  'ativo_total_anc': 'ativoNaoCirculante',
  'ativo_ativo_total': 'ativoTotal',
  'passivo_fornecedores': 'fornecedores',
  'passivo_emprestimos_cp': 'emprestimosCP',
  'passivo_obrig_trab': 'obrigacoesTrabalhistas',
  'passivo_obrig_trib': 'obrigacoesTributarias',
  'passivo_outros_pc': 'outrosPassivosCirculantes',
  'passivo_total_pc': 'passivoCirculante',
  'passivo_emprestimos_lp': 'emprestimosLP',
  'passivo_outros_pnc': 'outrosPassivosNaoCirculantes',
  'passivo_total_pnc': 'passivoNaoCirculante',
  'passivo_capital_social': 'capitalSocial',
  'passivo_reservas': 'reservas',
  'passivo_lucros_acum': 'lucrosAcumulados',
  'passivo_total_pl': 'patrimonioLiquido',
  'passivo_passivo_pl_total': 'passivoTotal',
  'info_funcionarios': 'funcionarios'
};

// Carrega biblioteca PDF.js dinamicamente se necessário
async function carregarPDFJS() {
  if (typeof pdfjsLib !== 'undefined') return;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Lê campos de um PDF preenchido
async function lerCamposPDF(file) {
  await carregarPDFJS();
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const campos = {};
  
  // Iterar por todas as páginas
  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const annotations = await page.getAnnotations();
      
      for (const annot of annotations) {
        try {
          if (annot.subtype === 'Widget' && annot.fieldName) {
            let valor = annot.fieldValue || '';
            if (typeof valor === 'string') {
              valor = valor.trim();
            }
            campos[annot.fieldName] = valor;
          }
        } catch (e) {
          // Ignora erro em campo individual
        }
      }
    } catch (e) {
      console.warn(`[lerCamposPDF] Erro na página ${i}:`, e);
    }
  }
  
  console.log('[lerCamposPDF] Campos encontrados:', Object.keys(campos).length, campos);
  return campos;
}

// Converte valor de string para número
function parseValorPDF(valor) {
  if (!valor || valor === '') return 0;
  
  // Remove R$, pontos de milhar, e converte vírgula para ponto
  let limpo = String(valor)
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
    .trim();
  
  const num = parseFloat(limpo);
  return isNaN(num) ? 0 : num;
}

// Variável global para armazenar dados do PDF
let DADOS_PDF_IMPORTADO = null;

// Processa PDF e preenche formulário direto no modal de edição
async function processarPDFNoFormulario(file, anoEscolhido = null) {
  try {
    console.log('[processarPDFNoFormulario] Iniciando leitura do PDF...');
    const campos = await lerCamposPDF(file);
    
    if (Object.keys(campos).length === 0) {
      alert('❌ Não foi possível ler campos do PDF.\n\n' +
            '⚠️ IMPORTANTE:\n' +
            '• O Chrome/Edge NÃO salvam campos de PDF editável corretamente\n' +
            '• Use o Adobe Acrobat Reader (gratuito) para preencher e salvar\n' +
            '• Ou use outro leitor de PDF que suporte formulários\n\n' +
            'Baixe o Adobe Reader: https://get.adobe.com/br/reader/');
      return { sucesso: false, camposPreenchidos: 0 };
    }
    
    // Detectar anos disponíveis no PDF
    const anosDisponiveis = [];
    for (let i = 1; i <= 3; i++) {
      const anoVal = campos[`ano_${i}`];
      if (anoVal && anoVal.trim() !== '') {
        const anoNum = parseInt(anoVal);
        if (!isNaN(anoNum) && anoNum >= 2000 && anoNum <= 2100) {
          anosDisponiveis.push({ indice: i, ano: anoNum });
        }
      }
    }
    
    console.log('[processarPDFNoFormulario] Anos detectados:', anosDisponiveis);
    
    // Se não escolheu ano específico e tem múltiplos anos, perguntar
    let indiceAno = 3; // Default: ano mais recente (ano_3)
    
    if (anosDisponiveis.length > 1 && !anoEscolhido) {
      const opcoes = anosDisponiveis.map(a => `${a.ano}`).join(', ');
      const escolha = prompt(
        `📅 O PDF tem dados de ${anosDisponiveis.length} anos: ${opcoes}\n\n` +
        `Digite qual ano deseja importar agora:\n` +
        `(você pode importar os outros anos depois)`
      );
      
      if (!escolha) return { sucesso: false, camposPreenchidos: 0 };
      
      const anoEscolhidoNum = parseInt(escolha);
      const encontrado = anosDisponiveis.find(a => a.ano === anoEscolhidoNum);
      if (encontrado) {
        indiceAno = encontrado.indice;
        anoEscolhido = encontrado.ano;
      }
    } else if (anosDisponiveis.length === 1) {
      indiceAno = anosDisponiveis[0].indice;
      anoEscolhido = anosDisponiveis[0].ano;
    } else if (anoEscolhido) {
      const encontrado = anosDisponiveis.find(a => a.ano === anoEscolhido);
      if (encontrado) {
        indiceAno = encontrado.indice;
      }
    }
    
    // Preencher campo de ano
    if (anoEscolhido) {
      const elAno = document.getElementById('finAno');
      if (elAno) elAno.value = anoEscolhido;
    }
    
    let camposPreenchidos = 0;
    
    // Preencher campos do formulário
    for (const [campoPDF, campoForm] of Object.entries(MAPEAMENTO_PDF_PARA_FORM)) {
      try {
        const chavePDF = `${campoPDF}_ano${indiceAno}`;
        const valor = campos[chavePDF];
        
        if (valor !== undefined && valor !== '') {
          const el = document.getElementById(campoForm);
          if (el) {
            const valorNumerico = parseValorPDF(valor);
            el.value = valorNumerico || '';
            camposPreenchidos++;
            console.log(`[PDF] ${campoForm} = ${valorNumerico}`);
          }
        }
      } catch (e) {
        // Ignora erro em campo individual
      }
    }
    
    // Campos especiais que precisam de mapeamento adicional
    // Dívida Bruta = Empréstimos CP + LP
    try {
      const empCP = parseValorPDF(campos[`passivo_emprestimos_cp_ano${indiceAno}`]) || 0;
      const empLP = parseValorPDF(campos[`passivo_emprestimos_lp_ano${indiceAno}`]) || 0;
      const divBruta = empCP + empLP;
      const elDivida = document.getElementById('finDividaBruta');
      if (elDivida && divBruta > 0) {
        elDivida.value = divBruta;
      }
    } catch(e) {}
    
    // DRE no modo básico - preencher finReceita com receita líquida
    try {
      const recLiq = parseValorPDF(campos[`dre_receita_liquida_ano${indiceAno}`]);
      if (recLiq) {
        const elReceita = document.getElementById('finReceita');
        if (elReceita) elReceita.value = recLiq;
      }
    } catch(e) {}
    
    // Armazenar dados completos para possível salvamento de múltiplos anos
    DADOS_PDF_IMPORTADO = {
      campos: campos,
      anosDisponiveis: anosDisponiveis
    };
    
    if (camposPreenchidos > 0) {
      alert(`✅ PDF lido com sucesso!\n\n` +
            `• ${camposPreenchidos} campos preenchidos\n` +
            `• Ano: ${anoEscolhido || 'Não informado'}\n\n` +
            `Confira os dados e clique em "Salvar Dados".` +
            (anosDisponiveis.length > 1 ? `\n\n💡 O PDF tem ${anosDisponiveis.length} anos. Salve este e depois importe novamente para os outros.` : ''));
    } else {
      alert('⚠️ PDF lido, mas nenhum campo foi preenchido.\n\n' +
            'Verifique se o PDF foi preenchido corretamente.');
    }
    
    return { sucesso: true, camposPreenchidos, anosDisponiveis };
    
  } catch (error) {
    console.error('[processarPDFNoFormulario] Erro:', error);
    alert('❌ Erro ao processar PDF:\n' + error.message);
    return { sucesso: false, camposPreenchidos: 0 };
  }
}

// Função chamada pelo input file no modal de edição
async function importarPDFModal(input) {
  const file = input.files[0];
  if (!file) return;
  
  // Mostrar loading
  const btnImportar = document.getElementById('btnImportarPdfEdicao');
  if (btnImportar) {
    btnImportar.disabled = true;
    btnImportar.innerHTML = '⏳ Lendo...';
  }
  
  try {
    await processarPDFNoFormulario(file);
  } finally {
    // Restaurar botão
    if (btnImportar) {
      btnImportar.disabled = false;
      btnImportar.innerHTML = '📤 Importar PDF';
    }
    // Limpar input para permitir reimportar mesmo arquivo
    input.value = '';
  }
}

// Abre seletor de arquivo para importar PDF
function abrirSeletorPDF() {
  // Criar input file temporário
  let inputPDF = document.getElementById('inputPDFHidden');
  if (!inputPDF) {
    inputPDF = document.createElement('input');
    inputPDF.type = 'file';
    inputPDF.id = 'inputPDFHidden';
    inputPDF.accept = '.pdf';
    inputPDF.style.display = 'none';
    inputPDF.onchange = function() { importarPDFModal(this); };
    document.body.appendChild(inputPDF);
  }
  inputPDF.click();
}

// Função para download do PDF template
function baixarPDFTemplate() {
  // Baixar o PDF editável
  const link = document.createElement('a');
  link.href = 'formulario_coleta_EDITAVEL.pdf';
  link.download = 'formulario_coleta_dados_financeiros.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Mostrar dicas
  setTimeout(() => {
    alert('📄 PDF baixado!\n\n' +
          '⚠️ IMPORTANTE para o cliente:\n\n' +
          '1. Abrir com Adobe Acrobat Reader (não Chrome/Edge)\n' +
          '2. Preencher os campos clicáveis\n' +
          '3. Informar os 3 anos (ex: 2022, 2023, 2024)\n' +
          '4. Salvar (Ctrl+S) e devolver\n\n' +
          '💡 Download gratuito do Adobe Reader:\n' +
          'https://get.adobe.com/br/reader/');
  }, 500);
}

// Função de compatibilidade (chamada da lista de empresas sem dados)
function abrirModalImportacaoPDF(empresaId) {
  // Abre o modal de edição normal
  abrirModalEdicao(empresaId, null, null);
  
  // Aguarda modal abrir e clica no importar
  setTimeout(() => {
    abrirSeletorPDF();
  }, 300);
}

function fecharModalImportPDF() {
  // Compatibilidade - não faz nada, usa o modal padrão
}

// Expor funções globalmente
window.lerCamposPDF = lerCamposPDF;
window.processarPDFNoFormulario = processarPDFNoFormulario;
window.importarPDFModal = importarPDFModal;
window.abrirSeletorPDF = abrirSeletorPDF;
window.baixarPDFTemplate = baixarPDFTemplate;
window.abrirModalImportacaoPDF = abrirModalImportacaoPDF;
window.fecharModalImportPDF = fecharModalImportPDF;
