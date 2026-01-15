/**
 * CAMPANHA DE INDICAÇÃO - Portal da Assistente (v2)
 * Sistema de pontuação gamificado para assistentes de banco
 * 
 * NOVIDADE: Checklist de Entendimento
 * - Gera link único para empresa confirmar entendimento dos planos
 * - Pontuação automática quando empresa responde
 * - Se empresa confirma que recebeu pesquisa, pontua automaticamente
 */

// Variáveis globais
let campanhaId = null;
let participanteId = null;
let campanhaData = null;
let participanteData = null;
let empresasData = [];
let empresaAtual = null;
let sociosTemp = [];

// Pontuação por ação
const PONTUACAO = {
    funcionarios: 5,
    socios: 10,
    emailDental: 8,
    emailSaude: 10,
    reuniaoDental: 15,
    reuniaoSaude: 15,
    entendeuDental: 12,
    entendeuSaude: 12,
    decisaoDental: 8,
    decisaoSaude: 8,
    fechouDental: 40,
    fechouSaude: 40,
    pesquisaEnviada: 20,
    pesquisaRespostas: 50,
    checklistGerado: 10,           // Pontos por gerar checklist
    checklistRespondido: 25,       // Pontos quando empresa responde (automático)
    pesquisaConfirmadaEmpresa: 20  // Pontos quando empresa confirma que recebeu pesquisa (automático)
};

// Mínimo de respostas para pontuar pesquisa
const MIN_RESPOSTAS_PESQUISA = 10;

// Aguardar Firebase carregar
function waitForFirebase() {
    return new Promise((resolve) => {
        const check = () => {
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
                resolve();
            } else if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length === 0) {
                const firebaseConfig = {
                    apiKey: "AIzaSyDlbEZfA_uAR1aoPZIr8T9B6KNcrwfMxm0",
                    authDomain: "retorno-seguros.firebaseapp.com",
                    projectId: "retorno-seguros",
                    storageBucket: "retorno-seguros.appspot.com",
                    messagingSenderId: "495712392972",
                    appId: "1:495712392972:web:e1e78aedc48bdeea48db29"
                };
                firebase.initializeApp(firebaseConfig);
                resolve();
            } else {
                setTimeout(check, 50);
            }
        };
        check();
    });
}

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    campanhaId = params.get('c');
    participanteId = params.get('p');
    
    if (!campanhaId || !participanteId) {
        mostrarLinkInvalido();
        return;
    }
    
    try {
        await waitForFirebase();
        await carregarDados();
        configurarEventos();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        mostrarLinkInvalido();
    }
});

// Carregar dados iniciais
async function carregarDados() {
    const db = firebase.firestore();
    
    // Carregar campanha
    const campanhaDoc = await db.collection('campanhas').doc(campanhaId).get();
    if (!campanhaDoc.exists) {
        throw new Error('Campanha não encontrada');
    }
    campanhaData = { id: campanhaDoc.id, ...campanhaDoc.data() };
    
    if (campanhaData.status !== 'ativa') {
        mostrarLinkInvalido();
        return;
    }
    
    // Carregar participante
    const participanteDoc = await db.collection('campanhas').doc(campanhaId)
        .collection('participantes').doc(participanteId).get();
    if (!participanteDoc.exists) {
        throw new Error('Participante não encontrado');
    }
    participanteData = { id: participanteDoc.id, ...participanteDoc.data() };
    
    // Atualizar último acesso
    await participanteDoc.ref.update({
        ultimoAcesso: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Carregar empresas da agência
    const agenciaId = participanteData.agenciaId;
    const empresasSnap = await db.collection('empresas')
        .where('agenciaId', '==', agenciaId)
        .get();
    
    empresasData = empresasSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    
    // Esconder loading e mostrar conteúdo
    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('conteudoPrincipal').style.display = 'block';
    
    // Atualizar interface
    atualizarHeader();
    renderizarEmpresas();
    carregarRanking();
    carregarMeusPontos();
}

// Função auxiliar para pegar nome da empresa
function getNomeEmpresa(emp) {
    if (!emp) return 'Empresa';
    if (emp.razaoSocial) return emp.razaoSocial;
    if (emp.nomeFantasia) return emp.nomeFantasia;
    if (emp.nome) return emp.nome;
    if (emp.empresa) return emp.empresa;
    if (emp.denominacao) return emp.denominacao;
    if (emp.razao_social) return emp.razao_social;
    if (emp.nome_fantasia) return emp.nome_fantasia;
    if (emp.campanha?.empresaNome) return emp.campanha.empresaNome;
    if (emp.dados?.razaoSocial) return emp.dados.razaoSocial;
    if (emp.dados?.nomeFantasia) return emp.dados.nomeFantasia;
    if (emp.dados?.nome) return emp.dados.nome;
    return 'Empresa';
}

// Atualizar header
function atualizarHeader() {
    const nome = participanteData.nome || 'Participante';
    const iniciais = nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    
    document.getElementById('avatarParticipante').textContent = iniciais;
    document.getElementById('nomeParticipante').textContent = nome;
    document.getElementById('agenciaParticipante').textContent = participanteData.agenciaNome || '-';
    document.getElementById('pontosTotal').textContent = participanteData.pontos || 0;
    document.getElementById('campanhaNome').textContent = `🎯 ${campanhaData.nome || 'Campanha'}`;
}

// Mostrar link inválido
function mostrarLinkInvalido() {
    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('linkInvalido').style.display = 'flex';
}

// Configurar eventos
function configurarEventos() {
    // Navegação por tabs
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
            
            switch(tab) {
                case 'empresas':
                    document.getElementById('tabEmpresas').style.display = 'block';
                    break;
                case 'ranking':
                    document.getElementById('tabRanking').style.display = 'block';
                    carregarRanking();
                    break;
                case 'meus-pontos':
                    document.getElementById('tabMeusPontos').style.display = 'block';
                    carregarMeusPontos();
                    break;
                case 'regras':
                    document.getElementById('tabRegras').style.display = 'block';
                    break;
            }
        });
    });
    
    // Busca de empresas
    document.getElementById('buscaEmpresa').addEventListener('input', (e) => {
        renderizarEmpresas(e.target.value);
    });
}

// Renderizar lista de empresas
function renderizarEmpresas(filtro = '') {
    const container = document.getElementById('listaEmpresas');
    const filtroLower = filtro.toLowerCase();
    
    const empresasFiltradas = empresasData.filter(emp => {
        if (!filtro) return true;
        const nome = getNomeEmpresa(emp).toLowerCase();
        return nome.includes(filtroLower) || emp.cnpj?.includes(filtro);
    });
    
    if (empresasFiltradas.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-search" style="font-size: 2rem;"></i>
                <p class="mt-2">Nenhuma empresa encontrada</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = empresasFiltradas.map(emp => {
        const campanha = emp.campanha || {};
        const status = calcularStatusEmpresa(emp);
        const progresso = calcularProgressoEmpresa(emp);
        const nomeEmpresa = getNomeEmpresa(emp);
        
        // Verificar se tem checklist respondido
        const checklistRespondido = campanha.checklist?.respondido;
        
        return `
            <div class="card-empresa ${status.classe}" onclick="abrirEmpresa('${emp.id}')">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <div class="empresa-nome">${nomeEmpresa}</div>
                        <div class="empresa-info">
                            ${emp.cnpj ? formatarCNPJ(emp.cnpj) : 'CNPJ não informado'}
                        </div>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-${status.cor}">${status.texto}</span>
                        <div class="small text-muted mt-1">${progresso}% concluído</div>
                    </div>
                </div>
                <div class="empresa-status">
                    ${campanha.funcionariosQtd ? `<span class="status-badge ok">👥 ${campanha.funcionariosQtd} func.</span>` : '<span class="status-badge pending">👥 Func. pendente</span>'}
                    ${campanha.socios?.length ? `<span class="status-badge ok">👤 ${campanha.socios.length} sócio(s)</span>` : '<span class="status-badge pending">👤 Sócios pendente</span>'}
                    ${campanha.dental?.emailEnviado ? '<span class="status-badge ok">🦷 Dental</span>' : ''}
                    ${campanha.saude?.emailEnviado ? '<span class="status-badge ok">❤️ Saúde</span>' : ''}
                    ${checklistRespondido ? '<span class="status-badge ok">📋 Checklist</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Calcular status da empresa
function calcularStatusEmpresa(emp) {
    const campanha = emp.campanha || {};
    
    if (campanha.dental?.fechouNegocio || campanha.saude?.fechouNegocio) {
        return { classe: 'concluida', cor: 'success', texto: '✅ Concluída' };
    }
    
    if (campanha.funcionariosQtd || campanha.socios?.length || campanha.dental?.emailEnviado || 
        campanha.saude?.emailEnviado || campanha.checklist?.respondido) {
        return { classe: 'andamento', cor: 'warning', texto: '🔄 Em andamento' };
    }
    
    return { classe: 'diamante', cor: 'info', texto: '💎 Nova' };
}

// Calcular progresso da empresa (atualizado com checklist)
function calcularProgressoEmpresa(emp) {
    const campanha = emp.campanha || {};
    let pontos = 0;
    let total = 218; // Total possível incluindo checklist
    
    if (campanha.funcionariosQtd) pontos += 5;
    if (campanha.socios?.length) pontos += 10;
    
    // Dental
    if (campanha.dental?.emailEnviado) pontos += 8;
    if (campanha.dental?.reuniaoConfirmada) pontos += 15;
    if (campanha.dental?.entendeuConfirmado) pontos += 12;
    if (campanha.dental?.decisaoRegistrada) pontos += 8;
    if (campanha.dental?.fechouNegocio) pontos += 40;
    
    // Saúde
    if (campanha.saude?.emailEnviado) pontos += 10;
    if (campanha.saude?.reuniaoConfirmada) pontos += 15;
    if (campanha.saude?.entendeuConfirmado) pontos += 12;
    if (campanha.saude?.decisaoRegistrada) pontos += 8;
    if (campanha.saude?.fechouNegocio) pontos += 40;
    
    // Checklist
    if (campanha.checklist?.gerado) pontos += 10;
    if (campanha.checklist?.respondido) pontos += 25;
    
    return Math.round((pontos / total) * 100);
}

// Formatar CNPJ
function formatarCNPJ(cnpj) {
    if (!cnpj) return '';
    const num = cnpj.replace(/\D/g, '');
    return num.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// Formatar data
function formatarData(data) {
    if (!data) return '-';
    if (data.toDate) data = data.toDate();
    return new Date(data).toLocaleDateString('pt-BR');
}

// Registrar ação e pontuar
async function registrarAcao(tipo, pontos, detalhes = {}) {
    const db = firebase.firestore();
    
    // Criar ação
    await db.collection('campanhas').doc(campanhaId)
        .collection('acoes').add({
            tipo,
            pontos,
            participanteId,
            empresaId: empresaAtual.id,
            detalhes,
            criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });
    
    // Atualizar pontos do participante
    await db.collection('campanhas').doc(campanhaId)
        .collection('participantes').doc(participanteId).update({
            pontos: firebase.firestore.FieldValue.increment(pontos)
        });
    
    // Atualizar local
    participanteData.pontos = (participanteData.pontos || 0) + pontos;
    document.getElementById('pontosTotal').textContent = participanteData.pontos;
}

// Mostrar animação de pontos
function mostrarPontos(pontos) {
    const anim = document.createElement('div');
    anim.className = 'pontos-animation';
    anim.innerHTML = `+${pontos} pts`;
    anim.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 2rem 3rem;
        border-radius: 20px;
        font-size: 2rem;
        font-weight: bold;
        z-index: 10000;
        animation: pontosAnim 1.5s ease forwards;
    `;
    
    if (!document.getElementById('pontosAnimStyle')) {
        const style = document.createElement('style');
        style.id = 'pontosAnimStyle';
        style.textContent = `
            @keyframes pontosAnim {
                0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
                20% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                80% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                100% { transform: translate(-50%, -150%) scale(0.8); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(anim);
    setTimeout(() => anim.remove(), 1500);
}

// =====================================================
// SEÇÃO DO CHECKLIST DE ENTENDIMENTO
// =====================================================

// Gerar checklist de entendimento
async function gerarChecklist() {
    const emp = empresaAtual;
    const campanha = emp.campanha || {};
    
    // Verificar se já existe
    if (campanha.checklist?.id) {
        alert('Checklist já foi gerado para esta empresa. Use o link existente.');
        return;
    }
    
    try {
        const db = firebase.firestore();
        const nomeEmpresa = getNomeEmpresa(emp);
        
        // Criar documento do checklist
        const checklistRef = await db.collection('checklists_entendimento').add({
            empresaId: emp.id,
            empresaNome: nomeEmpresa,
            campanhaId: campanhaId,
            participanteId: participanteId,
            participanteNome: participanteData.nome,
            agenciaId: participanteData.agenciaId,
            agenciaNome: participanteData.agenciaNome,
            respondido: false,
            criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Atualizar empresa
        await db.collection('empresas').doc(emp.id).update({
            'campanha.checklist': {
                id: checklistRef.id,
                gerado: true,
                geradoEm: firebase.firestore.FieldValue.serverTimestamp(),
                geradoPor: participanteId,
                respondido: false
            },
            'campanha.empresaNome': nomeEmpresa
        });
        
        // Registrar ação e pontuar
        await registrarAcao('checklistGerado', PONTUACAO.checklistGerado, {
            checklistId: checklistRef.id
        });
        
        // Atualizar dados locais
        empresaAtual.campanha = empresaAtual.campanha || {};
        empresaAtual.campanha.checklist = {
            id: checklistRef.id,
            gerado: true,
            respondido: false
        };
        
        const idx = empresasData.findIndex(e => e.id === empresaAtual.id);
        if (idx >= 0) empresasData[idx] = empresaAtual;
        
        // Mostrar pontos
        mostrarPontos(PONTUACAO.checklistGerado);
        
        // Gerar link
        const baseUrl = window.location.origin + window.location.pathname.replace('campanha.html', 'checklist-empresa.html');
        const link = `${baseUrl}?ch=${checklistRef.id}&e=${emp.id}&c=${campanhaId}&p=${participanteId}`;
        
        // Mostrar modal com link
        mostrarModalLinkChecklist(link);
        
        // Atualizar interface
        atualizarSecaoChecklist();
        
    } catch (error) {
        console.error('Erro ao gerar checklist:', error);
        alert('Erro ao gerar checklist. Tente novamente.');
    }
}

// Mostrar modal com link do checklist
function mostrarModalLinkChecklist(link) {
    const modal = document.createElement('div');
    modal.id = 'modalLinkChecklist';
    modal.innerHTML = `
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        " onclick="if(event.target === this) this.remove()">
            <div style="
                background: white;
                border-radius: 20px;
                padding: 2rem;
                max-width: 500px;
                margin: 1rem;
                text-align: center;
            ">
                <div style="
                    width: 60px;
                    height: 60px;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 1rem;
                    color: white;
                    font-size: 1.5rem;
                ">
                    <i class="bi bi-clipboard-check"></i>
                </div>
                
                <h4 style="margin-bottom: 0.5rem;">Checklist Gerado!</h4>
                <p style="color: #64748b; margin-bottom: 1.5rem;">
                    Envie este link para a empresa confirmar o entendimento sobre os planos.
                    <br><strong>Você ganhará +25 pontos quando a empresa responder!</strong>
                </p>
                
                <div style="
                    background: #f1f5f9;
                    border-radius: 10px;
                    padding: 1rem;
                    margin-bottom: 1rem;
                    word-break: break-all;
                    font-size: 0.85rem;
                ">
                    <input type="text" id="inputLinkChecklist" value="${link}" readonly style="
                        width: 100%;
                        border: none;
                        background: transparent;
                        text-align: center;
                        font-size: 0.85rem;
                        color: #334155;
                    ">
                </div>
                
                <div style="display: flex; gap: 0.75rem;">
                    <button onclick="copiarLinkChecklist()" style="
                        flex: 1;
                        padding: 0.75rem;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        border-radius: 10px;
                        font-weight: bold;
                        cursor: pointer;
                    ">
                        <i class="bi bi-clipboard"></i> Copiar
                    </button>
                    <button onclick="enviarChecklistWhatsApp('${link}')" style="
                        flex: 1;
                        padding: 0.75rem;
                        background: #25D366;
                        color: white;
                        border: none;
                        border-radius: 10px;
                        font-weight: bold;
                        cursor: pointer;
                    ">
                        <i class="bi bi-whatsapp"></i> WhatsApp
                    </button>
                </div>
                
                <button onclick="this.closest('#modalLinkChecklist').remove()" style="
                    margin-top: 1rem;
                    padding: 0.5rem 2rem;
                    background: #f1f5f9;
                    color: #64748b;
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                ">
                    Fechar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Copiar link do checklist
function copiarLinkChecklist() {
    const input = document.getElementById('inputLinkChecklist');
    input.select();
    document.execCommand('copy');
    alert('Link copiado!');
}

// Enviar checklist via WhatsApp
function enviarChecklistWhatsApp(link) {
    const emp = empresaAtual;
    const nomeEmp = getNomeEmpresa(emp);
    const mensagem = encodeURIComponent(
        `📋 *Checklist de Entendimento - Planos Saúde e Dental*\n\n` +
        `Olá! Para confirmar que as informações sobre os planos de saúde e dental foram bem apresentadas, ` +
        `pedimos que a empresa ${nomeEmp} responda este breve checklist:\n\n` +
        `👉 ${link}\n\n` +
        `São apenas alguns minutos e sua resposta é muito importante para nós! 🙏`
    );
    
    window.open(`https://wa.me/?text=${mensagem}`, '_blank');
}

// Ver link do checklist existente
function verLinkChecklist() {
    const checklist = empresaAtual.campanha?.checklist;
    if (!checklist?.id) return;
    
    const baseUrl = window.location.origin + window.location.pathname.replace('campanha.html', 'checklist-empresa.html');
    const link = `${baseUrl}?ch=${checklist.id}&e=${empresaAtual.id}&c=${campanhaId}&p=${participanteId}`;
    
    mostrarModalLinkChecklist(link);
}

// Atualizar seção do checklist no modal da empresa
function atualizarSecaoChecklist() {
    const emp = empresaAtual;
    const campanha = emp.campanha || {};
    const checklist = campanha.checklist || {};
    
    const container = document.getElementById('secaoChecklist');
    if (!container) return;
    
    let pontosChecklist = 0;
    if (checklist.gerado) pontosChecklist += 10;
    if (checklist.respondido) pontosChecklist += 25;
    
    let html = '';
    
    if (!checklist.gerado) {
        // Ainda não gerou checklist
        html = `
            <div class="text-center py-4">
                <i class="bi bi-clipboard-check" style="font-size: 3rem; color: #10b981;"></i>
                <h6 class="mt-3">Checklist de Entendimento</h6>
                <p class="text-muted">Gere um checklist para a empresa confirmar que entendeu os benefícios dos planos de saúde e dental.</p>
                <button class="btn-acao primary" onclick="gerarChecklist()" style="max-width: 300px; margin: 0 auto;">
                    <i class="bi bi-plus-circle"></i> Gerar Checklist (+10 pts)
                </button>
            </div>
        `;
    } else {
        // Já gerou checklist
        const stats = checklist.estatisticas || {};
        
        html = `
            <div class="acao-item ${checklist.gerado ? 'concluida' : ''}">
                <div class="acao-titulo">
                    <i class="bi bi-send"></i>
                    Checklist Gerado
                    <span class="acao-pontos">+10 pts</span>
                </div>
                <div class="text-success">
                    <i class="bi bi-check-circle-fill"></i> Link criado e disponível
                </div>
                <button class="btn btn-sm btn-outline-primary mt-2" onclick="verLinkChecklist()">
                    <i class="bi bi-link-45deg"></i> Ver Link
                </button>
            </div>
            
            <div class="acao-item ${checklist.respondido ? 'concluida' : ''}">
                <div class="acao-titulo">
                    <i class="bi bi-check2-all"></i>
                    Empresa Respondeu
                    <span class="acao-pontos">+25 pts</span>
                </div>
                ${checklist.respondido ? `
                    <div class="text-success">
                        <i class="bi bi-check-circle-fill"></i> Checklist respondido!
                    </div>
                    ${stats.geral ? `
                        <div class="mt-2 small">
                            <div class="row">
                                <div class="col-6">
                                    <strong>Saúde:</strong> ${stats.saude?.porcentagemSim || 0}% entendeu
                                    ${stats.saude?.probabilidade !== null ? `<br><small>Prob. contratação: ${stats.saude.probabilidade}/10</small>` : ''}
                                </div>
                                <div class="col-6">
                                    <strong>Dental:</strong> ${stats.dental?.porcentagemSim || 0}% entendeu
                                    ${stats.dental?.probabilidade !== null ? `<br><small>Prob. contratação: ${stats.dental.probabilidade}/10</small>` : ''}
                                </div>
                            </div>
                        </div>
                    ` : ''}
                ` : `
                    <div class="text-muted">
                        <i class="bi bi-clock"></i> Aguardando resposta da empresa
                    </div>
                `}
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    // Atualizar badge de pontos
    const badge = document.querySelector('#secaoChecklistCard .badge-pontos');
    if (badge) {
        badge.textContent = `${pontosChecklist}/35 pts`;
    }
}

// =====================================================
// VERIFICAÇÃO AUTOMÁTICA DE CHECKLIST RESPONDIDO
// =====================================================

// Verificar se checklist foi respondido
async function verificarChecklistRespondido() {
    const emp = empresaAtual;
    const checklist = emp.campanha?.checklist;
    
    if (!checklist?.id || checklist.respondido) return;
    
    try {
        const db = firebase.firestore();
        
        const checklistDoc = await db.collection('checklists_entendimento').doc(checklist.id).get();
        if (!checklistDoc.exists) return;
        
        const checklistData = checklistDoc.data();
        
        if (checklistData.respondido && !checklist.respondido) {
            // Checklist foi respondido! Atualizar dados locais
            empresaAtual.campanha.checklist.respondido = true;
            empresaAtual.campanha.checklist.estatisticas = checklistData.estatisticas;
            
            const idx = empresasData.findIndex(e => e.id === empresaAtual.id);
            if (idx >= 0) empresasData[idx] = empresaAtual;
            
            // Atualizar interface
            atualizarSecaoChecklist();
            
            // Mostrar notificação
            mostrarPontos(PONTUACAO.checklistRespondido);
        }
    } catch (error) {
        console.error('Erro ao verificar checklist:', error);
    }
}

// Verificação periódica quando modal está aberto
let intervalVerificarChecklist = null;

// =====================================================
// FUNÇÕES EXISTENTES (carregamento, ranking, etc.)
// Mantidas do sistema original
// =====================================================

// Abrir modal de empresa
async function abrirEmpresa(empresaId) {
    empresaAtual = empresasData.find(e => e.id === empresaId);
    if (!empresaAtual) return;
    
    const campanha = empresaAtual.campanha || {};
    sociosTemp = [...(campanha.socios || [])];
    
    const nomeEmpresa = getNomeEmpresa(empresaAtual);
    
    document.getElementById('modalEmpresaNome').textContent = nomeEmpresa;
    document.getElementById('modalEmpresaCnpj').textContent = empresaAtual.cnpj ? formatarCNPJ(empresaAtual.cnpj) : '';
    
    const progresso = calcularProgressoEmpresa(empresaAtual);
    document.getElementById('progressoFill').style.width = progresso + '%';
    document.getElementById('progressoTexto').textContent = progresso + '% concluído';
    
    // Atualizar seções
    atualizarSecaoInfo();
    atualizarSecaoDental();
    atualizarSecaoSaude();
    atualizarSecaoChecklist();
    atualizarSecaoPesquisa();
    
    // Mostrar modal
    document.getElementById('modalEmpresa').classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // Iniciar verificação periódica
    if (campanha.checklist?.id && !campanha.checklist?.respondido) {
        intervalVerificarChecklist = setInterval(verificarChecklistRespondido, 15000);
    }
}

// Fechar modal de empresa
function fecharModalEmpresa() {
    if (intervalVerificarChecklist) {
        clearInterval(intervalVerificarChecklist);
        intervalVerificarChecklist = null;
    }
    document.getElementById('modalEmpresa').classList.remove('show');
    document.body.style.overflow = '';
    renderizarEmpresas();
}

// Toggle seção
function toggleSecao(secao) {
    const body = document.getElementById('secao' + secao.charAt(0).toUpperCase() + secao.slice(1));
    body.classList.toggle('show');
}

// Carregar ranking
async function carregarRanking() {
    const db = firebase.firestore();
    const container = document.getElementById('listaRanking');
    
    try {
        const participantesSnap = await db.collection('campanhas').doc(campanhaId)
            .collection('participantes')
            .orderBy('pontos', 'desc')
            .limit(20)
            .get();
        
        if (participantesSnap.empty) {
            container.innerHTML = '<div class="text-center text-muted py-4">Nenhum participante ainda</div>';
            return;
        }
        
        container.innerHTML = participantesSnap.docs.map((doc, idx) => {
            const p = doc.data();
            const isMe = doc.id === participanteId;
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
            
            return `
                <div class="ranking-item ${isMe ? 'me' : ''}" style="
                    display: flex;
                    align-items: center;
                    padding: 1rem;
                    background: ${isMe ? 'linear-gradient(135deg, #667eea20 0%, #764ba220 100%)' : '#f8fafc'};
                    border-radius: 12px;
                    margin-bottom: 0.5rem;
                    border: ${isMe ? '2px solid #667eea' : 'none'};
                ">
                    <div style="
                        width: 40px;
                        height: 40px;
                        background: ${idx < 3 ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : '#e2e8f0'};
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                        color: ${idx < 3 ? 'white' : '#64748b'};
                        margin-right: 1rem;
                    ">
                        ${medal || (idx + 1)}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${p.nome || 'Participante'} ${isMe ? '(Você)' : ''}</div>
                        <div style="font-size: 0.85rem; color: #64748b;">${p.agenciaNome || '-'}</div>
                    </div>
                    <div style="font-weight: bold; color: #667eea;">${p.pontos || 0} pts</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erro ao carregar ranking:', error);
    }
}

// Carregar meus pontos
async function carregarMeusPontos() {
    const db = firebase.firestore();
    const container = document.getElementById('listaMeusPontos');
    
    try {
        const acoesSnap = await db.collection('campanhas').doc(campanhaId)
            .collection('acoes')
            .where('participanteId', '==', participanteId)
            .orderBy('criadoEm', 'desc')
            .limit(50)
            .get();
        
        if (acoesSnap.empty) {
            container.innerHTML = '<div class="text-center text-muted py-4">Nenhuma ação registrada</div>';
            return;
        }
        
        const tipoLabels = {
            funcionarios: '👥 Funcionários informados',
            socios: '👤 Sócios cadastrados',
            emailDental: '🦷 Email Dental enviado',
            emailSaude: '❤️ Email Saúde enviado',
            reuniaoDental: '🦷 Reunião Dental confirmada',
            reuniaoSaude: '❤️ Reunião Saúde confirmada',
            entendeuDental: '🦷 Entendimento Dental confirmado',
            entendeuSaude: '❤️ Entendimento Saúde confirmado',
            decisaoDental: '🦷 Decisão Dental registrada',
            decisaoSaude: '❤️ Decisão Saúde registrada',
            fechouDental: '🦷 Fechou negócio Dental',
            fechouSaude: '❤️ Fechou negócio Saúde',
            pesquisaEnviada: '📊 Pesquisa enviada',
            pesquisaRespostas: '📊 10+ respostas na pesquisa',
            checklistGerado: '📋 Checklist gerado',
            checklistRespondido: '📋 Checklist respondido',
            pesquisaConfirmadaEmpresa: '✅ Pesquisa confirmada pela empresa'
        };
        
        container.innerHTML = acoesSnap.docs.map(doc => {
            const a = doc.data();
            const data = a.criadoEm?.toDate ? a.criadoEm.toDate() : new Date();
            
            return `
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.75rem 1rem;
                    background: #f8fafc;
                    border-radius: 10px;
                    margin-bottom: 0.5rem;
                ">
                    <div>
                        <div style="font-weight: 500;">${tipoLabels[a.tipo] || a.tipo}</div>
                        <div style="font-size: 0.8rem; color: #64748b;">${data.toLocaleDateString('pt-BR')} ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div style="font-weight: bold; color: #10b981;">+${a.pontos} pts</div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erro ao carregar meus pontos:', error);
    }
}

// Atualizar seção de informações
function atualizarSecaoInfo() {
    const emp = empresaAtual;
    const campanha = emp.campanha || {};
    let pontosInfo = 0;
    
    if (campanha.funcionariosQtd) {
        pontosInfo += 5;
        document.getElementById('acaoFuncionarios').classList.add('concluida');
        document.getElementById('formFuncionarios').style.display = 'none';
        document.getElementById('funcionariosOk').style.display = 'block';
        document.getElementById('funcionariosValor').textContent = campanha.funcionariosQtd;
    } else {
        document.getElementById('acaoFuncionarios').classList.remove('concluida');
        document.getElementById('formFuncionarios').style.display = 'block';
        document.getElementById('funcionariosOk').style.display = 'none';
        document.getElementById('inputFuncionarios').value = '';
    }
    
    if (campanha.socios?.length) {
        pontosInfo += 10;
        document.getElementById('acaoSocios').classList.add('concluida');
        document.getElementById('formSocios').style.display = 'none';
        document.getElementById('btnConfirmarSocios').style.display = 'none';
        document.getElementById('sociosOk').style.display = 'block';
        renderizarListaSocios(campanha.socios, true);
    } else {
        document.getElementById('acaoSocios').classList.remove('concluida');
        document.getElementById('formSocios').style.display = 'block';
        document.getElementById('sociosOk').style.display = 'none';
        renderizarListaSocios(sociosTemp, false);
    }
    
    document.getElementById('pontosInfo').textContent = `${pontosInfo}/15 pts`;
}

// Renderizar lista de sócios
function renderizarListaSocios(socios, readonly = false) {
    const container = document.getElementById('listaSocios');
    
    if (!socios || socios.length === 0) {
        container.innerHTML = '';
        document.getElementById('btnConfirmarSocios').style.display = 'none';
        return;
    }
    
    container.innerHTML = socios.map((socio, idx) => `
        <div class="d-flex align-items-center justify-content-between bg-light rounded p-2 mb-2">
            <div>
                <div class="fw-bold">${socio.nome}</div>
                <small class="text-muted">${formatarData(socio.dataNascimento)}</small>
            </div>
            ${!readonly ? `<button class="btn btn-sm btn-outline-danger" onclick="removerSocio(${idx})">
                <i class="bi bi-trash"></i>
            </button>` : ''}
        </div>
    `).join('');
    
    if (!readonly && socios.length > 0) {
        document.getElementById('btnConfirmarSocios').style.display = 'block';
    }
}

// Adicionar sócio temporário
function adicionarSocio() {
    const nome = document.getElementById('inputSocioNome').value.trim();
    const nasc = document.getElementById('inputSocioNasc').value;
    
    if (!nome || !nasc) {
        alert('Preencha nome e data de nascimento do sócio');
        return;
    }
    
    sociosTemp.push({ nome, dataNascimento: nasc });
    renderizarListaSocios(sociosTemp, false);
    
    document.getElementById('inputSocioNome').value = '';
    document.getElementById('inputSocioNasc').value = '';
}

// Remover sócio temporário
function removerSocio(idx) {
    sociosTemp.splice(idx, 1);
    renderizarListaSocios(sociosTemp, false);
}

// Confirmar sócios
async function confirmarSocios() {
    if (sociosTemp.length === 0) {
        alert('Adicione pelo menos um sócio');
        return;
    }
    
    try {
        const db = firebase.firestore();
        const nomeEmpresa = getNomeEmpresa(empresaAtual);
        
        await db.collection('empresas').doc(empresaAtual.id).update({
            'campanha.socios': sociosTemp,
            'campanha.sociosAtualizadoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.sociosAtualizadoPor': participanteId,
            'campanha.empresaNome': nomeEmpresa
        });
        
        await registrarAcao('socios', PONTUACAO.socios, {
            quantidadeSocios: sociosTemp.length,
            socios: sociosTemp
        });
        
        empresaAtual.campanha = empresaAtual.campanha || {};
        empresaAtual.campanha.socios = [...sociosTemp];
        empresaAtual.campanha.empresaNome = nomeEmpresa;
        const idx = empresasData.findIndex(e => e.id === empresaAtual.id);
        if (idx >= 0) empresasData[idx] = empresaAtual;
        
        mostrarPontos(PONTUACAO.socios);
        atualizarSecaoInfo();
        atualizarSecaoSaude();
        
    } catch (error) {
        console.error('Erro ao salvar sócios:', error);
        alert('Erro ao salvar. Tente novamente.');
    }
}

// Salvar funcionários
async function salvarFuncionarios() {
    const qtd = parseInt(document.getElementById('inputFuncionarios').value);
    
    if (!qtd || qtd < 1) {
        alert('Informe uma quantidade válida');
        return;
    }
    
    try {
        const db = firebase.firestore();
        const nomeEmpresa = getNomeEmpresa(empresaAtual);
        
        await db.collection('empresas').doc(empresaAtual.id).update({
            'campanha.funcionariosQtd': qtd,
            'campanha.funcionariosAtualizadoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.funcionariosAtualizadoPor': participanteId,
            'campanha.empresaNome': nomeEmpresa
        });
        
        await registrarAcao('funcionarios', PONTUACAO.funcionarios, {
            quantidade: qtd
        });
        
        empresaAtual.campanha = empresaAtual.campanha || {};
        empresaAtual.campanha.funcionariosQtd = qtd;
        empresaAtual.campanha.empresaNome = nomeEmpresa;
        const idx = empresasData.findIndex(e => e.id === empresaAtual.id);
        if (idx >= 0) empresasData[idx] = empresaAtual;
        
        mostrarPontos(PONTUACAO.funcionarios);
        atualizarSecaoInfo();
        atualizarSecaoPesquisa();
        
    } catch (error) {
        console.error('Erro ao salvar funcionários:', error);
        alert('Erro ao salvar. Tente novamente.');
    }
}

// Atualizar seção Dental (placeholder - manter do original)
function atualizarSecaoDental() {
    // Implementação mantida do original
    console.log('Atualizar seção dental');
}

// Atualizar seção Saúde (placeholder - manter do original)
function atualizarSecaoSaude() {
    // Implementação mantida do original
    console.log('Atualizar seção saúde');
}

// Atualizar seção Pesquisa (placeholder - manter do original)
function atualizarSecaoPesquisa() {
    // Implementação mantida do original
    console.log('Atualizar seção pesquisa');
}
