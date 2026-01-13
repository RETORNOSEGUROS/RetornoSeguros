/**
 * CAMPANHA DE INDICAÇÃO - Portal da Assistente
 * Sistema de pontuação gamificado para assistentes de banco
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
    pesquisaRespostas: 50  // Quando 10+ funcionários respondem
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
                // Firebase carregado mas não inicializado
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
    // Pegar parâmetros da URL
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
    
    // Verificar se campanha está ativa
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
            
            // Atualizar botões
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Mostrar tab correspondente
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
    
    const empresasFiltradas = empresasData.filter(emp => 
        emp.razaoSocial?.toLowerCase().includes(filtroLower) ||
        emp.nomeFantasia?.toLowerCase().includes(filtroLower) ||
        emp.cnpj?.includes(filtro)
    );
    
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
        
        return `
            <div class="card-empresa ${status.classe}" onclick="abrirEmpresa('${emp.id}')">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <div class="empresa-nome">${emp.razaoSocial || emp.nomeFantasia || 'Empresa'}</div>
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
                    ${emp.funcionariosQtd ? `<span class="status-badge ok">👥 ${emp.funcionariosQtd} func.</span>` : '<span class="status-badge pending">👥 Func. pendente</span>'}
                    ${emp.socios?.length ? `<span class="status-badge ok">👤 ${emp.socios.length} sócio(s)</span>` : '<span class="status-badge pending">👤 Sócios pendente</span>'}
                    ${campanha.dental?.emailEnviado ? '<span class="status-badge ok">🦷 Dental</span>' : ''}
                    ${campanha.saude?.emailEnviado ? '<span class="status-badge ok">❤️ Saúde</span>' : ''}
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
    
    if (emp.funcionariosQtd || emp.socios?.length || campanha.dental?.emailEnviado || campanha.saude?.emailEnviado) {
        return { classe: 'andamento', cor: 'warning', texto: '🔄 Em andamento' };
    }
    
    return { classe: 'diamante', cor: 'info', texto: '💎 Nova' };
}

// Calcular progresso da empresa
function calcularProgressoEmpresa(emp) {
    const campanha = emp.campanha || {};
    let pontos = 0;
    let total = 183; // Total possível: 5+10+8+10+15+15+12+12+8+8+40+40
    
    if (emp.funcionariosQtd) pontos += 5;
    if (emp.socios?.length) pontos += 10;
    
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
    
    return Math.round((pontos / total) * 100);
}

// Abrir modal de empresa
async function abrirEmpresa(empresaId) {
    empresaAtual = empresasData.find(e => e.id === empresaId);
    if (!empresaAtual) return;
    
    sociosTemp = [...(empresaAtual.socios || [])];
    
    // Atualizar header do modal
    document.getElementById('modalEmpresaNome').textContent = empresaAtual.razaoSocial || empresaAtual.nomeFantasia || 'Empresa';
    document.getElementById('modalEmpresaCnpj').textContent = empresaAtual.cnpj ? formatarCNPJ(empresaAtual.cnpj) : '';
    
    // Atualizar progresso
    const progresso = calcularProgressoEmpresa(empresaAtual);
    document.getElementById('progressoFill').style.width = progresso + '%';
    document.getElementById('progressoTexto').textContent = progresso + '% concluído';
    
    // Atualizar seções
    atualizarSecaoInfo();
    atualizarSecaoDental();
    atualizarSecaoSaude();
    
    // Mostrar modal
    document.getElementById('modalEmpresa').classList.add('show');
    document.body.style.overflow = 'hidden';
}

// Fechar modal de empresa
function fecharModalEmpresa() {
    document.getElementById('modalEmpresa').classList.remove('show');
    document.body.style.overflow = '';
    renderizarEmpresas();
}

// Toggle seção
function toggleSecao(secao) {
    const body = document.getElementById('secao' + secao.charAt(0).toUpperCase() + secao.slice(1));
    body.classList.toggle('show');
}

// Atualizar seção de informações
function atualizarSecaoInfo() {
    const emp = empresaAtual;
    let pontosInfo = 0;
    
    // Funcionários
    if (emp.funcionariosQtd) {
        pontosInfo += 5;
        document.getElementById('acaoFuncionarios').classList.add('concluida');
        document.getElementById('formFuncionarios').style.display = 'none';
        document.getElementById('funcionariosOk').style.display = 'block';
        document.getElementById('funcionariosValor').textContent = emp.funcionariosQtd;
    } else {
        document.getElementById('acaoFuncionarios').classList.remove('concluida');
        document.getElementById('formFuncionarios').style.display = 'block';
        document.getElementById('funcionariosOk').style.display = 'none';
        document.getElementById('inputFuncionarios').value = '';
    }
    
    // Sócios
    if (emp.socios?.length) {
        pontosInfo += 10;
        document.getElementById('acaoSocios').classList.add('concluida');
        document.getElementById('formSocios').style.display = 'none';
        document.getElementById('btnConfirmarSocios').style.display = 'none';
        document.getElementById('sociosOk').style.display = 'block';
        renderizarListaSocios(emp.socios, true);
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
    
    // Limpar campos
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
        
        // Atualizar empresa
        await db.collection('empresas').doc(empresaAtual.id).update({
            socios: sociosTemp,
            sociosAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            sociosAtualizadoPor: participanteId
        });
        
        // Registrar ação
        await registrarAcao('socios', PONTUACAO.socios, {
            quantidadeSocios: sociosTemp.length,
            socios: sociosTemp
        });
        
        // Atualizar dados locais
        empresaAtual.socios = [...sociosTemp];
        const idx = empresasData.findIndex(e => e.id === empresaAtual.id);
        if (idx >= 0) empresasData[idx] = empresaAtual;
        
        // Mostrar pontos
        mostrarPontos(PONTUACAO.socios);
        
        // Atualizar interface
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
        
        // Atualizar empresa
        await db.collection('empresas').doc(empresaAtual.id).update({
            funcionariosQtd: qtd,
            funcionariosAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            funcionariosAtualizadoPor: participanteId
        });
        
        // Registrar ação
        await registrarAcao('funcionarios', PONTUACAO.funcionarios, {
            quantidade: qtd
        });
        
        // Atualizar dados locais
        empresaAtual.funcionariosQtd = qtd;
        const idx = empresasData.findIndex(e => e.id === empresaAtual.id);
        if (idx >= 0) empresasData[idx] = empresaAtual;
        
        // Mostrar pontos
        mostrarPontos(PONTUACAO.funcionarios);
        
        // Atualizar interface
        atualizarSecaoInfo();
        atualizarSecaoDental();
        
    } catch (error) {
        console.error('Erro ao salvar funcionários:', error);
        alert('Erro ao salvar. Tente novamente.');
    }
}

// Atualizar seção Dental
function atualizarSecaoDental() {
    const emp = empresaAtual;
    const campanha = emp.campanha?.dental || {};
    let pontosDental = 0;
    
    // Verificar se está desbloqueado (precisa ter funcionários)
    const desbloqueado = !!emp.funcionariosQtd;
    
    if (desbloqueado) {
        document.getElementById('dentalBloqueado').style.display = 'none';
        document.getElementById('dentalConteudo').style.display = 'block';
    } else {
        document.getElementById('dentalBloqueado').style.display = 'block';
        document.getElementById('dentalConteudo').style.display = 'none';
        document.getElementById('pontosDental').textContent = '🔒 Bloqueado';
        return;
    }
    
    // E-mail
    if (campanha.emailEnviado) {
        pontosDental += 8;
        document.getElementById('acaoEmailDental').classList.add('concluida');
        document.getElementById('formEmailDental').style.display = 'none';
        document.getElementById('emailDentalOk').style.display = 'block';
        document.getElementById('emailDentalValor').textContent = campanha.email || '';
    } else {
        document.getElementById('acaoEmailDental').classList.remove('concluida');
        document.getElementById('formEmailDental').style.display = 'block';
        document.getElementById('emailDentalOk').style.display = 'none';
    }
    
    // Reunião
    if (campanha.reuniaoConfirmada) {
        pontosDental += 15;
        document.getElementById('acaoReuniaoDental').classList.add('concluida');
        document.getElementById('reuniaoDentalPendente').style.display = 'none';
        document.getElementById('reuniaoDentalOk').style.display = 'block';
    } else {
        document.getElementById('acaoReuniaoDental').classList.remove('concluida');
        document.getElementById('acaoReuniaoDental').classList.add('aguardando');
        document.getElementById('reuniaoDentalPendente').style.display = 'block';
        document.getElementById('reuniaoDentalOk').style.display = 'none';
    }
    
    // Entendeu
    if (campanha.entendeuConfirmado) {
        pontosDental += 12;
        document.getElementById('acaoEntendeuDental').classList.add('concluida');
        document.getElementById('entendeuDentalPendente').style.display = 'none';
        document.getElementById('entendeuDentalOk').style.display = 'block';
    } else {
        document.getElementById('acaoEntendeuDental').classList.remove('concluida');
        document.getElementById('acaoEntendeuDental').classList.add('aguardando');
        document.getElementById('entendeuDentalPendente').style.display = 'block';
        document.getElementById('entendeuDentalOk').style.display = 'none';
    }
    
    // Decisão
    if (campanha.decisaoRegistrada) {
        pontosDental += 8;
        document.getElementById('acaoDecisaoDental').classList.add('concluida');
        document.getElementById('formDecisaoDental').style.display = 'none';
        document.getElementById('decisaoDentalOk').style.display = 'block';
    } else {
        document.getElementById('acaoDecisaoDental').classList.remove('concluida');
        document.getElementById('formDecisaoDental').style.display = 'block';
        document.getElementById('decisaoDentalOk').style.display = 'none';
    }
    
    // Fechou negócio
    if (campanha.fechouNegocio) {
        pontosDental += 40;
        document.getElementById('acaoFechouDental').style.display = 'block';
    } else {
        document.getElementById('acaoFechouDental').style.display = 'none';
    }
    
    document.getElementById('pontosDental').textContent = `${pontosDental}/83 pts`;
}

// Atualizar seção Saúde
function atualizarSecaoSaude() {
    const emp = empresaAtual;
    const campanha = emp.campanha?.saude || {};
    let pontosSaude = 0;
    
    // Verificar se está desbloqueado (precisa ter sócios)
    const desbloqueado = emp.socios?.length > 0;
    
    if (desbloqueado) {
        document.getElementById('saudeBloqueado').style.display = 'none';
        document.getElementById('saudeConteudo').style.display = 'block';
    } else {
        document.getElementById('saudeBloqueado').style.display = 'block';
        document.getElementById('saudeConteudo').style.display = 'none';
        document.getElementById('pontosSaude').textContent = '🔒 Bloqueado';
        return;
    }
    
    // E-mail
    if (campanha.emailEnviado) {
        pontosSaude += 10;
        document.getElementById('acaoEmailSaude').classList.add('concluida');
        document.getElementById('formEmailSaude').style.display = 'none';
        document.getElementById('emailSaudeOk').style.display = 'block';
        document.getElementById('emailSaudeValor').textContent = campanha.email || '';
    } else {
        document.getElementById('acaoEmailSaude').classList.remove('concluida');
        document.getElementById('formEmailSaude').style.display = 'block';
        document.getElementById('emailSaudeOk').style.display = 'none';
    }
    
    // Reunião
    if (campanha.reuniaoConfirmada) {
        pontosSaude += 15;
        document.getElementById('acaoReuniaoSaude').classList.add('concluida');
        document.getElementById('reuniaoSaudePendente').style.display = 'none';
        document.getElementById('reuniaoSaudeOk').style.display = 'block';
    } else {
        document.getElementById('acaoReuniaoSaude').classList.remove('concluida');
        document.getElementById('acaoReuniaoSaude').classList.add('aguardando');
        document.getElementById('reuniaoSaudePendente').style.display = 'block';
        document.getElementById('reuniaoSaudeOk').style.display = 'none';
    }
    
    // Entendeu
    if (campanha.entendeuConfirmado) {
        pontosSaude += 12;
        document.getElementById('acaoEntendeuSaude').classList.add('concluida');
        document.getElementById('entendeuSaudePendente').style.display = 'none';
        document.getElementById('entendeuSaudeOk').style.display = 'block';
    } else {
        document.getElementById('acaoEntendeuSaude').classList.remove('concluida');
        document.getElementById('acaoEntendeuSaude').classList.add('aguardando');
        document.getElementById('entendeuSaudePendente').style.display = 'block';
        document.getElementById('entendeuSaudeOk').style.display = 'none';
    }
    
    // Decisão
    if (campanha.decisaoRegistrada) {
        pontosSaude += 8;
        document.getElementById('acaoDecisaoSaude').classList.add('concluida');
        document.getElementById('formDecisaoSaude').style.display = 'none';
        document.getElementById('decisaoSaudeOk').style.display = 'block';
    } else {
        document.getElementById('acaoDecisaoSaude').classList.remove('concluida');
        document.getElementById('formDecisaoSaude').style.display = 'block';
        document.getElementById('decisaoSaudeOk').style.display = 'none';
    }
    
    // Fechou negócio
    if (campanha.fechouNegocio) {
        pontosSaude += 40;
        document.getElementById('acaoFechouSaude').style.display = 'block';
    } else {
        document.getElementById('acaoFechouSaude').style.display = 'none';
    }
    
    document.getElementById('pontosSaude').textContent = `${pontosSaude}/85 pts`;
}

// Salvar e-mail dental
async function salvarEmailDental() {
    const email = document.getElementById('inputEmailDental').value.trim();
    
    if (!email || !validarEmail(email)) {
        alert('Informe um e-mail válido');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // Atualizar empresa
        const campanhaData = empresaAtual.campanha || {};
        campanhaData.dental = campanhaData.dental || {};
        campanhaData.dental.emailEnviado = true;
        campanhaData.dental.email = email;
        campanhaData.dental.emailEnviadoEm = new Date().toISOString();
        campanhaData.dental.emailEnviadoPor = participanteId;
        
        await db.collection('empresas').doc(empresaAtual.id).update({
            'campanha.dental.emailEnviado': true,
            'campanha.dental.email': email,
            'campanha.dental.emailEnviadoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.dental.emailEnviadoPor': participanteId,
            emailResponsavel: email
        });
        
        // Registrar ação
        await registrarAcao('emailDental', PONTUACAO.emailDental, { email });
        
        // Atualizar dados locais
        empresaAtual.campanha = campanhaData;
        
        // Mostrar pontos
        mostrarPontos(PONTUACAO.emailDental);
        
        // Atualizar interface
        atualizarSecaoDental();
        
    } catch (error) {
        console.error('Erro ao salvar e-mail:', error);
        alert('Erro ao salvar. Tente novamente.');
    }
}

// Salvar e-mail saúde
async function salvarEmailSaude() {
    const email = document.getElementById('inputEmailSaude').value.trim();
    
    if (!email || !validarEmail(email)) {
        alert('Informe um e-mail válido');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // Atualizar empresa
        const campanhaData = empresaAtual.campanha || {};
        campanhaData.saude = campanhaData.saude || {};
        campanhaData.saude.emailEnviado = true;
        campanhaData.saude.email = email;
        campanhaData.saude.emailEnviadoEm = new Date().toISOString();
        campanhaData.saude.emailEnviadoPor = participanteId;
        
        await db.collection('empresas').doc(empresaAtual.id).update({
            'campanha.saude.emailEnviado': true,
            'campanha.saude.email': email,
            'campanha.saude.emailEnviadoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.saude.emailEnviadoPor': participanteId,
            emailResponsavel: email
        });
        
        // Registrar ação
        await registrarAcao('emailSaude', PONTUACAO.emailSaude, { email });
        
        // Atualizar dados locais
        empresaAtual.campanha = campanhaData;
        
        // Mostrar pontos
        mostrarPontos(PONTUACAO.emailSaude);
        
        // Atualizar interface
        atualizarSecaoSaude();
        
    } catch (error) {
        console.error('Erro ao salvar e-mail:', error);
        alert('Erro ao salvar. Tente novamente.');
    }
}

// Salvar decisão dental
async function salvarDecisaoDental() {
    const decisao = document.getElementById('selectDecisaoDental').value;
    const justificativa = document.getElementById('inputJustificativaDental').value.trim();
    
    if (!decisao) {
        alert('Selecione uma decisão');
        return;
    }
    
    if (!justificativa) {
        alert('Informe a justificativa');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        await db.collection('empresas').doc(empresaAtual.id).update({
            'campanha.dental.decisaoRegistrada': true,
            'campanha.dental.decisao': decisao,
            'campanha.dental.justificativa': justificativa,
            'campanha.dental.decisaoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.dental.decisaoPor': participanteId
        });
        
        // Registrar ação
        await registrarAcao('decisaoDental', PONTUACAO.decisaoDental, { decisao, justificativa });
        
        // Atualizar dados locais
        empresaAtual.campanha = empresaAtual.campanha || {};
        empresaAtual.campanha.dental = empresaAtual.campanha.dental || {};
        empresaAtual.campanha.dental.decisaoRegistrada = true;
        empresaAtual.campanha.dental.decisao = decisao;
        empresaAtual.campanha.dental.justificativa = justificativa;
        
        // Mostrar pontos
        mostrarPontos(PONTUACAO.decisaoDental);
        
        // Atualizar interface
        atualizarSecaoDental();
        
    } catch (error) {
        console.error('Erro ao salvar decisão:', error);
        alert('Erro ao salvar. Tente novamente.');
    }
}

// Salvar decisão saúde
async function salvarDecisaoSaude() {
    const decisao = document.getElementById('selectDecisaoSaude').value;
    const justificativa = document.getElementById('inputJustificativaSaude').value.trim();
    
    if (!decisao) {
        alert('Selecione uma decisão');
        return;
    }
    
    if (!justificativa) {
        alert('Informe a justificativa');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        await db.collection('empresas').doc(empresaAtual.id).update({
            'campanha.saude.decisaoRegistrada': true,
            'campanha.saude.decisao': decisao,
            'campanha.saude.justificativa': justificativa,
            'campanha.saude.decisaoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.saude.decisaoPor': participanteId
        });
        
        // Registrar ação
        await registrarAcao('decisaoSaude', PONTUACAO.decisaoSaude, { decisao, justificativa });
        
        // Atualizar dados locais
        empresaAtual.campanha = empresaAtual.campanha || {};
        empresaAtual.campanha.saude = empresaAtual.campanha.saude || {};
        empresaAtual.campanha.saude.decisaoRegistrada = true;
        empresaAtual.campanha.saude.decisao = decisao;
        empresaAtual.campanha.saude.justificativa = justificativa;
        
        // Mostrar pontos
        mostrarPontos(PONTUACAO.decisaoSaude);
        
        // Atualizar interface
        atualizarSecaoSaude();
        
    } catch (error) {
        console.error('Erro ao salvar decisão:', error);
        alert('Erro ao salvar. Tente novamente.');
    }
}

// Registrar ação e atualizar pontos
async function registrarAcao(tipo, pontos, dados = {}) {
    const db = firebase.firestore();
    
    // Criar documento de ação
    await db.collection('campanhas').doc(campanhaId)
        .collection('acoes').add({
            tipo,
            pontos,
            dados,
            empresaId: empresaAtual.id,
            empresaNome: empresaAtual.razaoSocial || empresaAtual.nomeFantasia,
            participanteId,
            participanteNome: participanteData.nome,
            dataRegistro: firebase.firestore.FieldValue.serverTimestamp()
        });
    
    // Atualizar pontos do participante
    const novosPontos = (participanteData.pontos || 0) + pontos;
    await db.collection('campanhas').doc(campanhaId)
        .collection('participantes').doc(participanteId)
        .update({ pontos: novosPontos });
    
    participanteData.pontos = novosPontos;
    document.getElementById('pontosTotal').textContent = novosPontos;
}

// Mostrar animação de pontos
function mostrarPontos(pontos) {
    document.getElementById('pontosGanhos').textContent = pontos;
    const toast = document.getElementById('toastPontos');
    toast.classList.add('show');
    
    // Confetti!
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// Carregar ranking
async function carregarRanking() {
    const db = firebase.firestore();
    
    const participantesSnap = await db.collection('campanhas').doc(campanhaId)
        .collection('participantes')
        .orderBy('pontos', 'desc')
        .get();
    
    const participantes = participantesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    
    // Pódio
    const podioHtml = [];
    const ordem = [1, 0, 2]; // Prata, Ouro, Bronze (ordem visual)
    const classes = ['prata', 'ouro', 'bronze'];
    const emojis = ['🥈', '🥇', '🥉'];
    
    ordem.forEach((pos, idx) => {
        const p = participantes[pos];
        if (p) {
            podioHtml.push(`
                <div class="podio-item ${classes[idx]}">
                    <div class="podio-posicao">${emojis[idx]}</div>
                    <div class="podio-nome">${p.nome?.split(' ')[0] || 'Anônimo'}</div>
                    <div class="podio-pontos">${p.pontos || 0} pts</div>
                </div>
            `);
        }
    });
    
    document.getElementById('podio').innerHTML = podioHtml.join('');
    
    // Lista completa
    const listaHtml = participantes.slice(3).map((p, idx) => `
        <div class="ranking-item ${p.id === participanteId ? 'minha-posicao' : ''}">
            <div class="ranking-pos">${idx + 4}</div>
            <div class="flex-grow-1">
                <div class="fw-bold">${p.nome || 'Participante'}</div>
                <small class="text-muted">${p.agenciaNome || ''}</small>
            </div>
            <div class="fw-bold text-primary">${p.pontos || 0} pts</div>
        </div>
    `).join('');
    
    document.getElementById('rankingLista').innerHTML = listaHtml;
}

// Carregar meus pontos
async function carregarMeusPontos() {
    document.getElementById('meusPontosTotal').textContent = participanteData.pontos || 0;
    
    const db = firebase.firestore();
    
    // Carregar ações do participante
    const acoesSnap = await db.collection('campanhas').doc(campanhaId)
        .collection('acoes')
        .where('participanteId', '==', participanteId)
        .orderBy('dataRegistro', 'desc')
        .get();
    
    const acoes = acoesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    
    // Breakdown por tipo
    const breakdown = {};
    acoes.forEach(acao => {
        if (!breakdown[acao.tipo]) {
            breakdown[acao.tipo] = { count: 0, pontos: 0 };
        }
        breakdown[acao.tipo].count++;
        breakdown[acao.tipo].pontos += acao.pontos || 0;
    });
    
    const tipoLabels = {
        funcionarios: '👥 Funcionários',
        socios: '👤 Sócios',
        emailDental: '📧 E-mail Dental',
        emailSaude: '📧 E-mail Saúde',
        reuniaoDental: '📅 Reunião Dental',
        reuniaoSaude: '📅 Reunião Saúde',
        entendeuDental: '💬 Entendeu Dental',
        entendeuSaude: '💬 Entendeu Saúde',
        decisaoDental: '📝 Decisão Dental',
        decisaoSaude: '📝 Decisão Saúde',
        fechouDental: '✅ Fechou Dental',
        fechouSaude: '✅ Fechou Saúde'
    };
    
    document.getElementById('pontosBreakdown').innerHTML = Object.entries(breakdown).map(([tipo, data]) => `
        <div class="breakdown-item">
            <div>
                <span>${tipoLabels[tipo] || tipo}</span>
                <small class="text-muted ms-2">(${data.count}x)</small>
            </div>
            <span class="text-success fw-bold">+${data.pontos} pts</span>
        </div>
    `).join('');
    
    // Histórico
    document.getElementById('historicoAcoes').innerHTML = acoes.slice(0, 20).map(acao => `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
            <div>
                <div class="fw-bold">${tipoLabels[acao.tipo] || acao.tipo}</div>
                <small class="text-muted">${acao.empresaNome || ''}</small>
            </div>
            <span class="badge bg-success">+${acao.pontos} pts</span>
        </div>
    `).join('') || '<p class="text-muted text-center py-3">Nenhuma ação registrada ainda</p>';
}

// Utilitários
function formatarCNPJ(cnpj) {
    if (!cnpj) return '';
    cnpj = cnpj.replace(/\D/g, '');
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatarData(data) {
    if (!data) return '';
    const d = new Date(data + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
}

function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =====================================================
// PESQUISA DE COLABORADORES
// =====================================================

// Gerar pesquisa de colaboradores
async function gerarPesquisa() {
    const emp = empresaAtual;
    
    if (!emp.funcionariosQtd) {
        alert('Informe o número de funcionários antes de gerar a pesquisa');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // Criar documento de pesquisa
        const pesquisaRef = await db.collection('pesquisas_colaboradores').add({
            empresaId: emp.id,
            empresaNome: emp.razaoSocial || emp.nomeFantasia,
            empresaCnpj: emp.cnpj,
            funcionariosQtd: emp.funcionariosQtd,
            campanhaId: campanhaId,
            participanteId: participanteId,
            participanteNome: participanteData.nome,
            agenciaId: participanteData.agenciaId,
            totalRespostas: 0,
            status: 'ativa',
            dataCriacao: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Atualizar empresa com ID da pesquisa
        await db.collection('empresas').doc(emp.id).update({
            'campanha.pesquisa.id': pesquisaRef.id,
            'campanha.pesquisa.linkEnviado': true,
            'campanha.pesquisa.linkEnviadoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.pesquisa.linkEnviadoPor': participanteId,
            'campanha.pesquisa.totalRespostas': 0
        });
        
        // Registrar ação e ganhar pontos
        await registrarAcao('pesquisaEnviada', PONTUACAO.pesquisaEnviada, {
            pesquisaId: pesquisaRef.id
        });
        
        // Atualizar dados locais
        empresaAtual.campanha = empresaAtual.campanha || {};
        empresaAtual.campanha.pesquisa = {
            id: pesquisaRef.id,
            linkEnviado: true,
            totalRespostas: 0
        };
        
        // Mostrar pontos
        mostrarPontos(PONTUACAO.pesquisaEnviada);
        
        // Atualizar interface
        atualizarSecaoPesquisa();
        
        // Mostrar link para compartilhar
        const baseUrl = window.location.origin + window.location.pathname.replace('campanha.html', 'pesquisa-colaboradores.html');
        const link = `${baseUrl}?p=${pesquisaRef.id}&e=${emp.id}`;
        
        mostrarModalLinkPesquisa(link);
        
    } catch (error) {
        console.error('Erro ao gerar pesquisa:', error);
        alert('Erro ao gerar pesquisa. Tente novamente.');
    }
}

// Mostrar modal com link da pesquisa
function mostrarModalLinkPesquisa(link) {
    const modal = document.createElement('div');
    modal.className = 'modal-link-pesquisa';
    modal.innerHTML = `
        <div class="modal-link-content">
            <div class="modal-link-header">
                <h5><i class="bi bi-link-45deg"></i> Link da Pesquisa</h5>
                <button onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="modal-link-body">
                <p>Envie este link para a empresa compartilhar com os colaboradores:</p>
                <div class="link-box">
                    <input type="text" value="${link}" readonly id="inputLinkPesquisa">
                    <button onclick="copiarLinkPesquisa()"><i class="bi bi-clipboard"></i></button>
                </div>
                <button class="btn-whatsapp" onclick="enviarPesquisaWhatsApp('${link}')">
                    <i class="bi bi-whatsapp"></i> Enviar via WhatsApp
                </button>
            </div>
        </div>
    `;
    
    // Adicionar estilos se não existirem
    if (!document.getElementById('estilosModalLink')) {
        const style = document.createElement('style');
        style.id = 'estilosModalLink';
        style.textContent = `
            .modal-link-pesquisa {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
                padding: 20px;
            }
            .modal-link-content {
                background: white;
                border-radius: 16px;
                max-width: 500px;
                width: 100%;
                overflow: hidden;
            }
            .modal-link-header {
                background: linear-gradient(135deg, #4facfe, #00f2fe);
                color: white;
                padding: 15px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .modal-link-header h5 { margin: 0; }
            .modal-link-header button {
                background: none;
                border: none;
                color: white;
                font-size: 1.5rem;
                cursor: pointer;
            }
            .modal-link-body {
                padding: 20px;
            }
            .link-box {
                display: flex;
                gap: 10px;
                margin: 15px 0;
            }
            .link-box input {
                flex: 1;
                padding: 12px;
                border: 2px solid #e0e0e0;
                border-radius: 10px;
                font-size: 0.9rem;
            }
            .link-box button {
                padding: 12px 20px;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 10px;
                cursor: pointer;
            }
            .btn-whatsapp {
                width: 100%;
                padding: 15px;
                background: #25D366;
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 1rem;
                font-weight: bold;
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(modal);
}

// Copiar link da pesquisa
function copiarLinkPesquisa() {
    const input = document.getElementById('inputLinkPesquisa');
    input.select();
    document.execCommand('copy');
    alert('Link copiado!');
}

// Enviar pesquisa via WhatsApp
function enviarPesquisaWhatsApp(link) {
    const emp = empresaAtual;
    const mensagem = encodeURIComponent(
        `🎯 *Pesquisa de Benefícios*\n\n` +
        `Olá! A empresa ${emp.razaoSocial || emp.nomeFantasia} está avaliando a possibilidade de oferecer planos de saúde e dental para os colaboradores.\n\n` +
        `Por favor, responda esta pesquisa rápida (menos de 2 minutos) para entendermos seu interesse:\n\n` +
        `👉 ${link}\n\n` +
        `Sua participação é muito importante! 🙏`
    );
    
    window.open(`https://wa.me/?text=${mensagem}`, '_blank');
}

// Ver link da pesquisa existente
function verLinkPesquisa() {
    const pesquisa = empresaAtual.campanha?.pesquisa;
    if (!pesquisa?.id) return;
    
    const baseUrl = window.location.origin + window.location.pathname.replace('campanha.html', 'pesquisa-colaboradores.html');
    const link = `${baseUrl}?p=${pesquisa.id}&e=${empresaAtual.id}`;
    
    mostrarModalLinkPesquisa(link);
}

// Verificar respostas da pesquisa (chamado periodicamente)
async function verificarRespostasPesquisa() {
    const emp = empresaAtual;
    const pesquisa = emp.campanha?.pesquisa;
    
    if (!pesquisa?.id || pesquisa.pontuado10Respostas) return;
    
    try {
        const db = firebase.firestore();
        
        // Buscar total de respostas
        const pesquisaDoc = await db.collection('pesquisas_colaboradores').doc(pesquisa.id).get();
        if (!pesquisaDoc.exists) return;
        
        const totalRespostas = pesquisaDoc.data().totalRespostas || 0;
        
        // Atualizar na empresa
        if (totalRespostas !== pesquisa.totalRespostas) {
            await db.collection('empresas').doc(emp.id).update({
                'campanha.pesquisa.totalRespostas': totalRespostas
            });
            
            empresaAtual.campanha.pesquisa.totalRespostas = totalRespostas;
            
            // Verificar se atingiu 10 respostas e ainda não pontuou
            if (totalRespostas >= MIN_RESPOSTAS_PESQUISA && !pesquisa.pontuado10Respostas) {
                // Pontuar!
                await db.collection('empresas').doc(emp.id).update({
                    'campanha.pesquisa.pontuado10Respostas': true,
                    'campanha.pesquisa.pontuadoEm': firebase.firestore.FieldValue.serverTimestamp()
                });
                
                await registrarAcao('pesquisaRespostas', PONTUACAO.pesquisaRespostas, {
                    totalRespostas,
                    pesquisaId: pesquisa.id
                });
                
                empresaAtual.campanha.pesquisa.pontuado10Respostas = true;
                
                mostrarPontos(PONTUACAO.pesquisaRespostas);
            }
            
            atualizarSecaoPesquisa();
        }
    } catch (error) {
        console.error('Erro ao verificar respostas:', error);
    }
}

// Atualizar seção de pesquisa
function atualizarSecaoPesquisa() {
    const emp = empresaAtual;
    const pesquisa = emp.campanha?.pesquisa || {};
    const funcionarios = emp.funcionariosQtd || 0;
    
    const container = document.getElementById('secaoPesquisa');
    if (!container) return;
    
    // Verificar se está desbloqueado (precisa ter funcionários)
    if (!funcionarios) {
        container.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="bi bi-lock" style="font-size: 2rem;"></i>
                <p class="mt-2">Informe o número de funcionários para desbloquear</p>
            </div>
        `;
        return;
    }
    
    let pontosPesquisa = 0;
    if (pesquisa.linkEnviado) pontosPesquisa += 20;
    if (pesquisa.pontuado10Respostas) pontosPesquisa += 50;
    
    const totalRespostas = pesquisa.totalRespostas || 0;
    const progresso = Math.min((totalRespostas / MIN_RESPOSTAS_PESQUISA) * 100, 100);
    
    let html = '';
    
    if (!pesquisa.linkEnviado) {
        // Ainda não gerou pesquisa
        html = `
            <div class="text-center py-4">
                <i class="bi bi-clipboard-data" style="font-size: 3rem; color: #4facfe;"></i>
                <h6 class="mt-3">Pesquisa de Interesse</h6>
                <p class="text-muted">Gere uma pesquisa para os colaboradores responderem sobre interesse em planos de saúde e dental.</p>
                <button class="btn-acao primary" onclick="gerarPesquisa()" style="max-width: 300px; margin: 0 auto;">
                    <i class="bi bi-send"></i> Gerar Pesquisa (+20 pts)
                </button>
            </div>
        `;
    } else {
        // Já gerou pesquisa
        html = `
            <div class="acao-item ${pesquisa.linkEnviado ? 'concluida' : ''}">
                <div class="acao-titulo">
                    <i class="bi bi-send"></i>
                    Link Enviado
                    <span class="acao-pontos">+20 pts</span>
                </div>
                <div class="text-success">
                    <i class="bi bi-check-circle-fill"></i> Pesquisa criada e link disponível
                </div>
                <button class="btn btn-sm btn-outline-primary mt-2" onclick="verLinkPesquisa()">
                    <i class="bi bi-link-45deg"></i> Ver Link
                </button>
            </div>
            
            <div class="acao-item ${pesquisa.pontuado10Respostas ? 'concluida' : ''}">
                <div class="acao-titulo">
                    <i class="bi bi-graph-up"></i>
                    10+ Respostas
                    <span class="acao-pontos">+50 pts</span>
                </div>
                <div class="mt-2">
                    <div class="d-flex justify-content-between mb-1">
                        <small>${totalRespostas} de ${MIN_RESPOSTAS_PESQUISA} respostas</small>
                        <small>${Math.round(progresso)}%</small>
                    </div>
                    <div class="progress" style="height: 10px; border-radius: 5px;">
                        <div class="progress-bar ${pesquisa.pontuado10Respostas ? 'bg-success' : 'bg-info'}" 
                             style="width: ${progresso}%"></div>
                    </div>
                </div>
                ${pesquisa.pontuado10Respostas ? `
                    <div class="text-success mt-2">
                        <i class="bi bi-check-circle-fill"></i> Meta atingida! +50 pontos conquistados
                    </div>
                ` : `
                    <div class="text-muted mt-2">
                        <small><i class="bi bi-info-circle"></i> Continue compartilhando o link para atingir a meta</small>
                    </div>
                `}
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    // Atualizar badge de pontos da seção
    const badge = document.querySelector('#secaoPesquisaCard .badge-pontos');
    if (badge) {
        badge.textContent = `${pontosPesquisa}/70 pts`;
        badge.classList.remove('bg-secondary');
    }
}

// Iniciar verificação periódica de respostas quando modal está aberto
let intervalVerificarRespostas = null;

// Modificar abrirEmpresa para iniciar verificação
const _abrirEmpresaOriginal = abrirEmpresa;
abrirEmpresa = async function(empresaId) {
    await _abrirEmpresaOriginal(empresaId);
    
    // Atualizar seção pesquisa
    atualizarSecaoPesquisa();
    
    // Iniciar verificação periódica se tem pesquisa
    if (empresaAtual.campanha?.pesquisa?.id && !empresaAtual.campanha?.pesquisa?.pontuado10Respostas) {
        intervalVerificarRespostas = setInterval(verificarRespostasPesquisa, 30000); // A cada 30 segundos
    }
};

// Modificar fecharModalEmpresa para parar verificação
const _fecharModalEmpresaOriginal = fecharModalEmpresa;
fecharModalEmpresa = function() {
    if (intervalVerificarRespostas) {
        clearInterval(intervalVerificarRespostas);
        intervalVerificarRespostas = null;
    }
    _fecharModalEmpresaOriginal();
};
