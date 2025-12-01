// empresas.js — Mapa de Produtos por Empresa
// Firebase v8

// ==== Firebase Init ====
if (!firebase.apps.length && typeof firebaseConfig !== "undefined") {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ==== Estado Global ====
let CTX = { uid: null, perfil: null, agenciaId: null, nome: null, email: null, isAdmin: false };
const ADMIN_EMAILS = ["patrick@retornoseguros.com.br"];

let EMPRESAS = [];
let EMPRESAS_FILTRADAS = [];
let COTACOES = [];
let RAMOS = [];
let AGENCIAS = {};
let RMS = {};

let MODAL_EMPRESA = null;
let MODAL_RAMO = null;

// ==== Helpers ====
const $ = id => document.getElementById(id);
const normalizar = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const toDate = x => {
  if (!x) return null;
  if (x.toDate) return x.toDate();
  if (x instanceof Date) return x;
  const d = new Date(x);
  return isNaN(d) ? null : d;
};

const fmtData = d => d ? d.toLocaleDateString("pt-BR") : "-";
const fmtBRL = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

// Status helpers
function categoriaStatus(status) {
  if (!status) return "sem";
  const s = normalizar(status);
  if (s.includes("emitido") && !s.includes("declinado")) return "emitido";
  if (s.includes("fechado") || s.includes("emissao") || s.includes("emissão")) return "emissao";
  if (s.includes("recusado") || s.includes("declinado") || s.includes("perdido")) return "recusado";
  if (s.includes("pendente") || s.includes("aguardando") || s.includes("analise") || s.includes("análise")) return "pendente";
  return "sem";
}

function statusIcon(cat) {
  switch (cat) {
    case "emitido": return "🟢";
    case "pendente": return "🟡";
    case "recusado": return "🔴";
    case "emissao": return "🔵";
    case "oportunidade": return "💎";
    default: return "⚪";
  }
}

function statusLabel(cat) {
  switch (cat) {
    case "emitido": return "Emitido";
    case "pendente": return "Pendente";
    case "recusado": return "Recusado";
    case "emissao": return "Em Emissão";
    case "oportunidade": return "Oportunidade";
    default: return "Não Cotado";
  }
}

// ==== Auth ====
auth.onAuthStateChanged(async user => {
  if (!user) { location.href = "login.html"; return; }
  
  CTX.uid = user.uid;
  CTX.email = user.email;
  
  try {
    const snap = await db.collection("usuarios_banco").doc(user.uid).get();
    if (snap.exists) {
      const d = snap.data();
      CTX.perfil = normalizar(d.perfil || "").replace(/[-_]/g, " ");
      CTX.agenciaId = d.agenciaId || null;
      CTX.nome = d.nome || user.email;
      CTX.isAdmin = CTX.perfil === "admin" || ADMIN_EMAILS.includes(user.email?.toLowerCase());
    } else if (ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
      CTX.perfil = "admin";
      CTX.isAdmin = true;
      CTX.nome = user.email;
    }
  } catch (e) { console.warn("Erro perfil:", e); }
  
  await init();
});

// ==== Inicialização ====
async function init() {
  await Promise.all([
    carregarRamos(),
    carregarLookups()
  ]);
  
  await Promise.all([
    carregarEmpresas(),
    carregarCotacoes()
  ]);
  
  processarDados();
  renderizarTudo();
}

// ==== Carregar Dados ====
async function carregarRamos() {
  try {
    let snap;
    try {
      snap = await db.collection("ramos-seguro").orderBy("ordem").get();
    } catch {
      snap = await db.collection("ramos-seguro").get();
    }
    
    snap.forEach(doc => {
      const d = doc.data();
      RAMOS.push({
        id: doc.id,
        nome: d.nomeExibicao || d.nome || doc.id,
        icon: getIcone(doc.id)
      });
    });
    
    if (RAMOS.length === 0) {
      // Fallback
      RAMOS = [
        { id: "saude", nome: "Saúde", icon: "🏥" },
        { id: "dental", nome: "Dental", icon: "🦷" },
        { id: "vida", nome: "Vida", icon: "❤️" },
        { id: "patrimonial", nome: "Patrimonial", icon: "🏢" },
        { id: "frota", nome: "Frota", icon: "🚗" },
        { id: "equipamentos", nome: "Equipamentos", icon: "⚙️" },
        { id: "garantia", nome: "Garantia", icon: "📜" },
        { id: "rc", nome: "RC", icon: "⚖️" }
      ];
    }
  } catch (e) { console.warn("Erro ramos:", e); }
}

function getIcone(id) {
  const icons = {
    "saude": "🏥", "dental": "🦷", "vida": "❤️", "vida-global": "🌍",
    "patrimonial": "🏢", "frota": "🚗", "equipamentos": "⚙️",
    "garantia": "📜", "rc": "⚖️", "cyber": "💻", "transporte": "🚚", "credito": "💳"
  };
  const idLower = (id || "").toLowerCase();
  for (const [key, icon] of Object.entries(icons)) {
    if (idLower.includes(key)) return icon;
  }
  return "📋";
}

async function carregarLookups() {
  // Agências
  try {
    const snap = await db.collection("agencias_banco").get();
    snap.forEach(doc => {
      AGENCIAS[doc.id] = doc.data().nome || doc.id;
    });
    
    const sel = $("filtroAgencia");
    if (sel) {
      sel.innerHTML = '<option value="">Todas</option>';
      Object.entries(AGENCIAS).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, nome]) => {
        sel.innerHTML += `<option value="${id}">${nome}</option>`;
      });
    }
  } catch (e) { console.warn("Erro agências:", e); }
  
  // RMs
  try {
    const snap = await db.collection("usuarios_banco").get();
    snap.forEach(doc => {
      const d = doc.data();
      if (d.nome) {
        RMS[doc.id] = { nome: d.nome, agenciaId: d.agenciaId };
      }
    });
    
    const sel = $("filtroRM");
    if (sel) {
      sel.innerHTML = '<option value="">Todos</option>';
      Object.entries(RMS).sort((a, b) => a[1].nome.localeCompare(b[1].nome)).forEach(([id, rm]) => {
        sel.innerHTML += `<option value="${id}">${rm.nome}</option>`;
      });
    }
  } catch (e) { console.warn("Erro RMs:", e); }
}

async function carregarEmpresas() {
  try {
    const snap = await db.collection("empresas").get();
    snap.forEach(doc => {
      const d = doc.data();
      EMPRESAS.push({
        id: doc.id,
        nome: d.nome || d.razaoSocial || "Empresa",
        cnpj: d.cnpj || "",
        cidade: d.cidade || "",
        estado: d.estado || d.uf || "",
        rmUid: d.rmUid || d.rmId || d.gerenteId || "",
        rmNome: d.rmNome || d.gerenteNome || "",
        agenciaId: d.agenciaId || "",
        numFuncionarios: d.numFuncionarios || 0
      });
    });
    
    EMPRESAS.sort((a, b) => a.nome.localeCompare(b.nome));
  } catch (e) { console.warn("Erro empresas:", e); }
}

async function carregarCotacoes() {
  try {
    const snap = await db.collection("cotacoes-gerentes").get();
    snap.forEach(doc => {
      const d = doc.data();
      COTACOES.push({
        id: doc.id,
        empresaId: d.empresaId || "",
        empresaNome: d.empresaNome || "",
        ramo: d.ramo || "",
        status: d.status || "",
        statusCat: categoriaStatus(d.status),
        valor: parseFloat(d.valorFinal || d.valorNegocio || d.premio || d.valorDesejado || 0),
        dataCriacao: toDate(d.dataCriacao),
        dataAtualizacao: toDate(d.dataAtualizacao),
        rmUid: d.rmUid || d.rmId || "",
        rmNome: d.rmNome || "",
        agenciaId: d.agenciaId || ""
      });
    });
  } catch (e) { console.warn("Erro cotações:", e); }
}

// ==== Processar Dados ====
function processarDados() {
  // Para cada empresa, calcular status por ramo
  EMPRESAS.forEach(emp => {
    emp.ramos = {};
    emp.totalEmitidos = 0;
    emp.totalPendentes = 0;
    emp.totalRecusados = 0;
    emp.totalValor = 0;
    emp.oportunidades = 0;
    
    // Buscar RM nome se não tiver
    if (!emp.rmNome && emp.rmUid && RMS[emp.rmUid]) {
      emp.rmNome = RMS[emp.rmUid].nome;
    }
    
    RAMOS.forEach(ramo => {
      // Buscar cotações desta empresa para este ramo
      const cotacoesRamo = COTACOES.filter(c => {
        const matchEmpresa = c.empresaId === emp.id || 
                            normalizar(c.empresaNome) === normalizar(emp.nome);
        const matchRamo = normalizar(c.ramo).includes(normalizar(ramo.id)) ||
                         normalizar(c.ramo).includes(normalizar(ramo.nome)) ||
                         normalizar(ramo.nome).includes(normalizar(c.ramo));
        return matchEmpresa && matchRamo;
      });
      
      if (cotacoesRamo.length === 0) {
        // Oportunidade!
        emp.ramos[ramo.id] = {
          status: "oportunidade",
          cotacoes: [],
          valor: 0
        };
        emp.oportunidades++;
      } else {
        // Ordenar por relevância: emitido > emissao > pendente > recusado
        const prioridade = { emitido: 4, emissao: 3, pendente: 2, recusado: 1 };
        cotacoesRamo.sort((a, b) => (prioridade[b.statusCat] || 0) - (prioridade[a.statusCat] || 0));
        
        const melhor = cotacoesRamo[0];
        emp.ramos[ramo.id] = {
          status: melhor.statusCat,
          cotacoes: cotacoesRamo,
          valor: melhor.valor
        };
        
        // Contadores
        if (melhor.statusCat === "emitido") {
          emp.totalEmitidos++;
          emp.totalValor += melhor.valor;
        } else if (melhor.statusCat === "pendente") {
          emp.totalPendentes++;
        } else if (melhor.statusCat === "recusado") {
          emp.totalRecusados++;
        }
      }
    });
    
    // Calcular cobertura
    emp.cobertura = Math.round(((RAMOS.length - emp.oportunidades) / RAMOS.length) * 100);
  });
  
  EMPRESAS_FILTRADAS = [...EMPRESAS];
}

// ==== Renderização ====
function renderizarTudo() {
  renderizarStats();
  renderizarTabela();
}

function renderizarStats() {
  const totalEmpresas = EMPRESAS_FILTRADAS.length;
  
  let totalEmitidos = 0;
  let totalPendentes = 0;
  let totalRecusados = 0;
  let totalOportunidades = 0;
  let somaCobertura = 0;
  
  EMPRESAS_FILTRADAS.forEach(emp => {
    totalEmitidos += emp.totalEmitidos;
    totalPendentes += emp.totalPendentes;
    totalRecusados += emp.totalRecusados;
    totalOportunidades += emp.oportunidades;
    somaCobertura += emp.cobertura;
  });
  
  const coberturaMedia = totalEmpresas > 0 ? Math.round(somaCobertura / totalEmpresas) : 0;
  
  $("statEmpresas").textContent = totalEmpresas;
  $("statEmitidos").textContent = totalEmitidos;
  $("statPendentes").textContent = totalPendentes;
  $("statRecusados").textContent = totalRecusados;
  $("statOportunidades").textContent = totalOportunidades;
  $("statCobertura").textContent = coberturaMedia + "%";
}

function renderizarTabela() {
  const container = $("tableScroll");
  
  if (EMPRESAS_FILTRADAS.length === 0) {
    container.innerHTML = `
      <div class="loading" style="padding: 40px;">
        <span style="font-size: 48px;">🔍</span>
        <span style="margin-top: 16px;">Nenhuma empresa encontrada</span>
      </div>
    `;
    $("tableCount").textContent = "0 empresas";
    return;
  }
  
  // Header
  let headerHtml = `<tr><th>Empresa</th>`;
  RAMOS.forEach(ramo => {
    headerHtml += `<th title="${ramo.nome}">${ramo.icon}</th>`;
  });
  headerHtml += `<th>Total</th><th>%</th></tr>`;
  
  // Body
  let bodyHtml = "";
  
  // Totais por ramo
  const totaisPorRamo = {};
  RAMOS.forEach(ramo => {
    totaisPorRamo[ramo.id] = { emitidos: 0, valor: 0 };
  });
  
  EMPRESAS_FILTRADAS.forEach(emp => {
    bodyHtml += `<tr>`;
    
    // Célula da empresa
    bodyHtml += `
      <td>
        <div class="empresa-cell">
          <div class="empresa-nome">${emp.nome}</div>
          <div class="empresa-meta">
            <span>👤 ${emp.rmNome || '-'}</span>
            ${emp.cidade ? `<span>📍 ${emp.cidade}</span>` : ''}
          </div>
          <div class="empresa-progress">
            <div class="empresa-progress-bar" style="width: ${emp.cobertura}%"></div>
          </div>
        </div>
      </td>
    `;
    
    // Células dos ramos
    RAMOS.forEach(ramo => {
      const ramoData = emp.ramos[ramo.id] || { status: "sem", cotacoes: [], valor: 0 };
      const statusClass = ramoData.status;
      const icon = statusIcon(ramoData.status);
      
      bodyHtml += `
        <td>
          <div class="status-cell ${statusClass}" 
               onclick="abrirModal('${emp.id}', '${ramo.id}')" 
               title="${ramo.nome}: ${statusLabel(ramoData.status)}">
            ${icon}
          </div>
        </td>
      `;
      
      // Totais
      if (ramoData.status === "emitido") {
        totaisPorRamo[ramo.id].emitidos++;
        totaisPorRamo[ramo.id].valor += ramoData.valor;
      }
    });
    
    // Total da empresa
    bodyHtml += `
      <td class="total-cell">
        <div class="total-valor">${fmtBRL(emp.totalValor)}</div>
      </td>
      <td class="total-cell">
        <div class="total-percent">${emp.cobertura}%</div>
      </td>
    `;
    
    bodyHtml += `</tr>`;
  });
  
  // Footer (totais)
  let footerHtml = `<tr><td><strong>TOTAL</strong></td>`;
  let totalGeral = 0;
  
  RAMOS.forEach(ramo => {
    const dados = totaisPorRamo[ramo.id];
    totalGeral += dados.valor;
    footerHtml += `
      <td class="total-cell">
        <div style="font-size: 11px;">${dados.emitidos}</div>
      </td>
    `;
  });
  
  footerHtml += `
    <td class="total-cell"><div class="total-valor">${fmtBRL(totalGeral)}</div></td>
    <td></td>
  </tr>`;
  
  container.innerHTML = `
    <table class="matrix-table">
      <thead>${headerHtml}</thead>
      <tbody>${bodyHtml}</tbody>
      <tfoot>${footerHtml}</tfoot>
    </table>
  `;
  
  $("tableCount").textContent = `${EMPRESAS_FILTRADAS.length} empresas × ${RAMOS.length} ramos`;
}

// ==== Filtros ====
function aplicarFiltros() {
  const busca = normalizar($("filtroEmpresa")?.value || "");
  const agencia = $("filtroAgencia")?.value || "";
  const rm = $("filtroRM")?.value || "";
  const exibir = $("filtroExibir")?.value || "todos";
  
  EMPRESAS_FILTRADAS = EMPRESAS.filter(emp => {
    // Busca por nome
    if (busca && !normalizar(emp.nome).includes(busca)) return false;
    
    // Agência
    if (agencia && emp.agenciaId !== agencia) return false;
    
    // RM
    if (rm && emp.rmUid !== rm) return false;
    
    // Exibir
    if (exibir === "oportunidades" && emp.oportunidades === 0) return false;
    if (exibir === "completas" && emp.cobertura < 100) return false;
    if (exibir === "vazias" && emp.cobertura > 0) return false;
    
    return true;
  });
  
  renderizarTudo();
}

function limparFiltros() {
  $("filtroEmpresa").value = "";
  $("filtroAgencia").value = "";
  $("filtroRM").value = "";
  $("filtroExibir").value = "todos";
  
  EMPRESAS_FILTRADAS = [...EMPRESAS];
  renderizarTudo();
}

// ==== Modal ====
function abrirModal(empresaId, ramoId) {
  const empresa = EMPRESAS.find(e => e.id === empresaId);
  const ramo = RAMOS.find(r => r.id === ramoId);
  
  if (!empresa || !ramo) return;
  
  MODAL_EMPRESA = empresa;
  MODAL_RAMO = ramo;
  
  const ramoData = empresa.ramos[ramoId] || { status: "sem", cotacoes: [], valor: 0 };
  
  $("modalTitle").innerHTML = `${ramo.icon} ${ramo.nome}`;
  
  let bodyHtml = `
    <div class="modal-empresa">
      <div class="modal-empresa-nome">${empresa.nome}</div>
      <div class="modal-empresa-info">
        👤 ${empresa.rmNome || 'Não vinculado'} 
        ${empresa.cidade ? `• 📍 ${empresa.cidade}` : ''}
      </div>
    </div>
  `;
  
  if (ramoData.status === "oportunidade") {
    bodyHtml += `
      <div class="oportunidade-card">
        <div class="oportunidade-icon">💎</div>
        <div class="oportunidade-title">Oportunidade de Negócio!</div>
        <div class="oportunidade-desc">Esta empresa ainda não possui cotação para ${ramo.nome}.</div>
      </div>
    `;
    $("btnCriarCotacao").style.display = "inline-flex";
  } else {
    // Mostrar status atual
    bodyHtml += `
      <div class="modal-status-card">
        <div class="modal-status-icon">${statusIcon(ramoData.status)}</div>
        <div class="modal-status-info">
          <div class="modal-status-label">Status Atual</div>
          <div class="modal-status-value">${statusLabel(ramoData.status)}</div>
          ${ramoData.valor > 0 ? `<div class="modal-status-detail">Valor: ${fmtBRL(ramoData.valor)}</div>` : ''}
        </div>
      </div>
    `;
    
    // Histórico de cotações
    if (ramoData.cotacoes.length > 0) {
      bodyHtml += `<h4 style="margin-bottom: 12px; font-size: 14px;">📋 Histórico de Cotações</h4>`;
      bodyHtml += `<div class="cotacoes-list">`;
      
      ramoData.cotacoes.slice(0, 5).forEach(cot => {
        bodyHtml += `
          <div class="cotacao-item">
            <div class="cotacao-item-left">
              <div class="cotacao-status-dot ${cot.statusCat}"></div>
              <div>
                <div style="font-weight: 600;">${cot.status || '-'}</div>
                <div style="font-size: 11px; color: var(--muted);">${fmtData(cot.dataCriacao)}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 600;">${fmtBRL(cot.valor)}</div>
              <div style="font-size: 11px; color: var(--muted);">${cot.rmNome || '-'}</div>
            </div>
          </div>
        `;
      });
      
      bodyHtml += `</div>`;
    }
    
    // Botão de nova cotação mesmo se já tem
    $("btnCriarCotacao").style.display = "inline-flex";
  }
  
  $("modalBody").innerHTML = bodyHtml;
  $("modalDetalhes").classList.add("active");
}

function fecharModal() {
  $("modalDetalhes").classList.remove("active");
  MODAL_EMPRESA = null;
  MODAL_RAMO = null;
}

function criarCotacaoDoModal() {
  if (!MODAL_EMPRESA || !MODAL_RAMO) return;
  
  // Redirecionar para cotações com parâmetros
  const params = new URLSearchParams({
    empresaId: MODAL_EMPRESA.id,
    empresaNome: MODAL_EMPRESA.nome,
    ramo: MODAL_RAMO.nome,
    nova: "1"
  });
  
  window.location.href = `cotacoes.html?${params}`;
}

// ==== Export ====
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  doc.setFontSize(18);
  doc.setTextColor(79, 70, 229);
  doc.text('Mapa de Produtos por Empresa', 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
  doc.text(`Total: ${EMPRESAS_FILTRADAS.length} empresas`, 14, 34);
  
  // Montar dados
  const headers = ['Empresa', ...RAMOS.map(r => r.nome), 'Total', '%'];
  const dados = EMPRESAS_FILTRADAS.map(emp => {
    const row = [emp.nome];
    RAMOS.forEach(ramo => {
      const ramoData = emp.ramos[ramo.id];
      row.push(statusLabel(ramoData?.status || 'sem').substring(0, 3));
    });
    row.push(fmtBRL(emp.totalValor));
    row.push(emp.cobertura + '%');
    return row;
  });
  
  doc.autoTable({
    startY: 40,
    head: [headers],
    body: dados,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [79, 70, 229] },
    columnStyles: { 0: { cellWidth: 40 } }
  });
  
  doc.save(`mapa-produtos-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportarExcel() {
  // Montar dados
  const dados = EMPRESAS_FILTRADAS.map(emp => {
    const row = {
      'Empresa': emp.nome,
      'Cidade': emp.cidade,
      'Gerente': emp.rmNome || '-'
    };
    
    RAMOS.forEach(ramo => {
      const ramoData = emp.ramos[ramo.id];
      row[ramo.nome] = statusLabel(ramoData?.status || 'sem');
    });
    
    row['Total Valor'] = emp.totalValor;
    row['Cobertura %'] = emp.cobertura;
    row['Oportunidades'] = emp.oportunidades;
    
    return row;
  });
  
  const ws = XLSX.utils.json_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mapa de Produtos");
  XLSX.writeFile(wb, `mapa-produtos-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==== Globals ====
window.aplicarFiltros = aplicarFiltros;
window.limparFiltros = limparFiltros;
window.abrirModal = abrirModal;
window.fecharModal = fecharModal;
window.criarCotacaoDoModal = criarCotacaoDoModal;
window.exportarPDF = exportarPDF;
window.exportarExcel = exportarExcel;
