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

  // Limpar formulário
  ["finAno","finReceita","finLucroBruto","finEbitda","finLucroLiq","finDividaBruta","finCaixa",
   "finEstoques","finCR","finCP","finDespesaFin","finDistribLucro","finProLabore","finQtdSocios",
   "finPL","finAtivo","finCMV","finImobilizado","finDepreciacao","finPassivoCirc","finAtivoCirc"]
   .forEach(id=>{ 
     const el=document.getElementById(id);
     if(el) el.value="";
   });

  // Definir ano atual como padrão se não houver ano
  const anoAtual = new Date().getFullYear();
  document.getElementById("finAno").value = ano || anoAtual;

  // Se temos docId, carregar dados existentes
  if(docId && docId !== 'null' && docId !== ''){
    try{
      const finDoc = await db.collection("empresas").doc(empresaId).collection("financeiro").doc(docId).get();
      if(finDoc.exists){
        const d = finDoc.data() || {};
        document.getElementById("finAno").value = d.ano || anoAtual;
        setMoney("finReceita", d.receitaLiquida || d.receita);
        setMoney("finLucroBruto", d.lucroBruto);
        setMoney("finEbitda", d.ebitda);
        setMoney("finLucroLiq", d.lucroLiquido || d.lucroLiq);
        setMoney("finDividaBruta", d.dividaBruta);
        setMoney("finCaixa", d.caixa || d.disponibilidades);
        setMoney("finEstoques", d.estoques);
        setMoney("finCR", d.contasReceber || d.duplicatasReceber);
        setMoney("finCP", d.contasPagar || d.fornecedores);
        setMoney("finDespesaFin", d.despesasFinanceiras || d.despesaFin);
        setMoney("finDistribLucro", d.distribuicaoLucros || d.distribLucro);
        setMoney("finProLabore", d.proLabore);
        setMoney("finPL", d.patrimonioLiquido || d.pl);
        setMoney("finAtivo", d.ativoTotal || d.ativo);
        setMoney("finCMV", d.cmv || d.custoMercadorias);
        setMoney("finImobilizado", d.imobilizado);
        setMoney("finDepreciacao", d.depreciacao);
        setMoney("finPassivoCirc", d.passivoCirculante || d.passivoCirc);
        setMoney("finAtivoCirc", d.ativoCirculante || d.ativoCirc);
        document.getElementById("finQtdSocios").value = d.qtdSocios || "";
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

  // Usar nomes de campos compatíveis com o formato original
  const dados = {
    ano,
    receitaLiquida: getMoney("finReceita"),
    lucroBruto: getMoney("finLucroBruto"),
    ebitda: getMoney("finEbitda"),
    lucroLiquido: getMoney("finLucroLiq"),
    dividaBruta: getMoney("finDividaBruta"),
    caixa: getMoney("finCaixa"),
    estoques: getMoney("finEstoques"),
    contasReceber: getMoney("finCR"),
    contasPagar: getMoney("finCP"),
    despesasFinanceiras: getMoney("finDespesaFin"),
    distribuicaoLucros: getMoney("finDistribLucro"),
    proLabore: getMoney("finProLabore"),
    qtdSocios: Number(document.getElementById("finQtdSocios").value) || 0,
    patrimonioLiquido: getMoney("finPL"),
    ativoTotal: getMoney("finAtivo"),
    cmv: getMoney("finCMV"),
    imobilizado: getMoney("finImobilizado"),
    depreciacao: getMoney("finDepreciacao"),
    passivoCirculante: getMoney("finPassivoCirc"),
    ativoCirculante: getMoney("finAtivoCirc"),
    // Campos calculados
    dividaLiquida: getMoney("finDividaBruta") - getMoney("finCaixa"),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: CTX.uid
  };

  // Calcular indicadores automaticamente
  if(dados.receitaLiquida > 0 && dados.ebitda > 0){
    dados.margemEbitda = dados.ebitda / dados.receitaLiquida;
  }
  if(dados.ebitda > 0 && dados.dividaLiquida != null){
    dados.alavancagemDivLiqEbitda = dados.dividaLiquida / dados.ebitda;
  }
  if(dados.contasPagar > 0){
    dados.liquidezCorrente = (dados.caixa + dados.contasReceber + dados.estoques) / dados.contasPagar;
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
        <div style="font-weight:600; color:#0c4a6e; margin-bottom:12px">📊 Comparativo de Anos</div>
        <div style="overflow-x:auto">
          <table style="width:100%; border-collapse:collapse; font-size:12px; background:#fff; border-radius:8px">
            <thead>
              <tr style="background:#f1f5f9">
                <th style="padding:10px; text-align:left; border-bottom:1px solid #e2e8f0">Indicador</th>
                ${rows.slice(0,4).map(r => `<th style="padding:10px; text-align:right; border-bottom:1px solid #e2e8f0">${r.ano}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9"><strong>Receita</strong></td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toBRL(r.receita)}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9"><strong>EBITDA</strong></td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toBRL(r.ebitda)}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9"><strong>Margem EBITDA</strong></td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toPct(r.margem)}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9"><strong>DL/EBITDA</strong></td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${r.alav != null ? clamp2(r.alav) + 'x' : '—'}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9"><strong>Liquidez</strong></td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${r.liq != null ? clamp2(r.liq) : '—'}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px; border-bottom:1px solid #f1f5f9"><strong>ROE</strong></td>
                ${rows.slice(0,4).map(r => `<td style="padding:8px; text-align:right; border-bottom:1px solid #f1f5f9">${toPct(r.roe)}</td>`).join('')}
              </tr>
              <tr>
                <td style="padding:8px"><strong>Score</strong></td>
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
  `;
  
  container.innerHTML = html;
}

// ================== ABA 5: CONTEXTO QUALITATIVO ==================
function renderContexto(data){
  if(!data || !data.rows || !data.rows.length) return;
  
  const empresaId = data.empresaId;
  const latest = data.rows[0];
  const container = document.getElementById("contextoContent");
  
  // Formulário de contexto (será salvo no Firestore em versão futura)
  const html = `
    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:16px; margin-bottom:20px">
      <div style="font-size:15px; font-weight:700; color:#0c4a6e; margin-bottom:8px">
        📄 Informações Qualitativas - Exercício ${latest.ano}
      </div>
      <p style="font-size:13px; color:#0369a1">
        Registre informações qualitativas que contextualizam os números. 
        Estes dados ajudam na análise e na defesa de operações de crédito.
      </p>
    </div>
    
    <div class="context-form">
      <div class="context-group">
        <div class="context-group-title">📌 Eventos Relevantes do Ano</div>
        <div class="context-checkboxes">
          <label class="context-check"><input type="checkbox" name="evento" value="filial_aberta"> Abertura de filial/unidade</label>
          <label class="context-check"><input type="checkbox" name="evento" value="filial_fechada"> Fechamento de filial</label>
          <label class="context-check"><input type="checkbox" name="evento" value="aquisicao"> Aquisição de empresa/carteira</label>
          <label class="context-check"><input type="checkbox" name="evento" value="venda_ativos"> Venda de ativos relevantes</label>
          <label class="context-check"><input type="checkbox" name="evento" value="capex"> Investimento em equipamentos</label>
          <label class="context-check"><input type="checkbox" name="evento" value="reestruturacao"> Reestruturação organizacional</label>
          <label class="context-check"><input type="checkbox" name="evento" value="troca_gestao"> Troca de gestão/sócios</label>
          <label class="context-check"><input type="checkbox" name="evento" value="contrato"> Ganho/perda contrato relevante</label>
          <label class="context-check"><input type="checkbox" name="evento" value="judicial"> Processo judicial relevante</label>
          <label class="context-check"><input type="checkbox" name="evento" value="sinistro"> Evento climático/sinistro</label>
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">👥 Principais Clientes (% do faturamento)</div>
        <div style="display:grid; gap:12px">
          <div style="display:flex; gap:12px; align-items:center">
            <span style="width:20px; font-weight:600">1.</span>
            <input type="text" placeholder="Nome do cliente" style="flex:1; padding:10px; border:1px solid var(--border); border-radius:8px">
            <input type="number" placeholder="%" style="width:80px; padding:10px; border:1px solid var(--border); border-radius:8px">
          </div>
          <div style="display:flex; gap:12px; align-items:center">
            <span style="width:20px; font-weight:600">2.</span>
            <input type="text" placeholder="Nome do cliente" style="flex:1; padding:10px; border:1px solid var(--border); border-radius:8px">
            <input type="number" placeholder="%" style="width:80px; padding:10px; border:1px solid var(--border); border-radius:8px">
          </div>
          <div style="display:flex; gap:12px; align-items:center">
            <span style="width:20px; font-weight:600">3.</span>
            <input type="text" placeholder="Nome do cliente" style="flex:1; padding:10px; border:1px solid var(--border); border-radius:8px">
            <input type="number" placeholder="%" style="width:80px; padding:10px; border:1px solid var(--border); border-radius:8px">
          </div>
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">🏭 Principais Fornecedores</div>
        <div style="display:grid; gap:12px">
          <input type="text" placeholder="Fornecedor 1" style="padding:10px; border:1px solid var(--border); border-radius:8px">
          <input type="text" placeholder="Fornecedor 2" style="padding:10px; border:1px solid var(--border); border-radius:8px">
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">👨‍💼 Quadro de Funcionários</div>
        <div style="display:flex; gap:16px">
          <div style="flex:1">
            <label style="font-size:12px; color:var(--text-secondary)">Ano Atual</label>
            <input type="number" placeholder="Nº funcionários" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; margin-top:4px">
          </div>
          <div style="flex:1">
            <label style="font-size:12px; color:var(--text-secondary)">Ano Anterior</label>
            <input type="number" placeholder="Nº funcionários" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; margin-top:4px">
          </div>
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">🔮 Perspectiva para Próximo Ano</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap">
          <label class="context-check" style="padding:12px 20px; background:#d1fae5; border-radius:8px; cursor:pointer">
            <input type="radio" name="perspectiva" value="otimista"> 
            📈 Otimista (crescimento >10%)
          </label>
          <label class="context-check" style="padding:12px 20px; background:#fef3c7; border-radius:8px; cursor:pointer">
            <input type="radio" name="perspectiva" value="estavel"> 
            ➡️ Estável (±10%)
          </label>
          <label class="context-check" style="padding:12px 20px; background:#fee2e2; border-radius:8px; cursor:pointer">
            <input type="radio" name="perspectiva" value="pessimista"> 
            📉 Pessimista (queda >10%)
          </label>
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">📝 Justificativa da Perspectiva</div>
        <textarea placeholder="Descreva os motivos da perspectiva informada..." 
          style="width:100%; padding:12px; border:1px solid var(--border); border-radius:8px; min-height:100px; font-family:inherit; resize:vertical"></textarea>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">💰 Necessidade de Crédito Prevista</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px">
          <div>
            <label style="font-size:12px; color:var(--text-secondary)">Capital de Giro</label>
            <input type="text" placeholder="R$ 0,00" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; margin-top:4px">
          </div>
          <div>
            <label style="font-size:12px; color:var(--text-secondary)">Investimento (CAPEX)</label>
            <input type="text" placeholder="R$ 0,00" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; margin-top:4px">
          </div>
          <div>
            <label style="font-size:12px; color:var(--text-secondary)">Refinanciamento</label>
            <input type="text" placeholder="R$ 0,00" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; margin-top:4px">
          </div>
        </div>
      </div>
      
      <div class="context-group">
        <div class="context-group-title">📋 Observações Adicionais</div>
        <textarea placeholder="Informações adicionais relevantes para a análise..." 
          style="width:100%; padding:12px; border:1px solid var(--border); border-radius:8px; min-height:80px; font-family:inherit; resize:vertical"></textarea>
      </div>
    </div>
    
    <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:12px">
      <button class="btn btn-outline" onclick="alert('Funcionalidade de salvar contexto será implementada em breve!')">
        💾 Salvar Contexto
      </button>
    </div>
  `;
  
  container.innerHTML = html;
}

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
