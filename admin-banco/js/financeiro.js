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
    <button class="btn btn-outline" style="padding:6px 12px; font-size:13px" 
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
    zScore, capitalGiroAtivo, lucrosRetidos, ebitAtivo, plPassivo
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
    zScore:null, capitalGiroAtivo:null, lucrosRetidos:null, ebitAtivo:null, plPassivo:null
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
    "finLimiteTotal","finLimiteUsado","finTaxaMedia","finScoreExterno"
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

    // Armazenar dados para as outras abas
    CURRENT_ANALYSIS_DATA = {
      empresaId: empresaId,
      empresaNome: info.nome,
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
