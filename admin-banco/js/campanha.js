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
    pesquisaRespostas: 50,  // Quando 10+ funcionários respondem
    // CHECKLIST DE ENTENDIMENTO (pontuação automática quando empresa responde)
    checklistGerado: 5,           // Assistente gera o link
    checklistRespondido: 25,      // Automático - empresa respondeu
    pesquisaConfirmada: 20        // Automático - empresa confirmou que recebeu pesquisa
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
// Função auxiliar para pegar nome da empresa (global)
function getNomeEmpresa(emp) {
    if (!emp) return 'Empresa';
    
    // Tentar campos diretos primeiro
    if (emp.razaoSocial) return emp.razaoSocial;
    if (emp.nomeFantasia) return emp.nomeFantasia;
    if (emp.nome) return emp.nome;
    if (emp.empresa) return emp.empresa;
    if (emp.denominacao) return emp.denominacao;
    if (emp.razao_social) return emp.razao_social;
    if (emp.nome_fantasia) return emp.nome_fantasia;
    
    // Tentar dentro de campanha
    if (emp.campanha?.empresaNome) return emp.campanha.empresaNome;
    
    // Tentar dentro de dados
    if (emp.dados?.razaoSocial) return emp.dados.razaoSocial;
    if (emp.dados?.nomeFantasia) return emp.dados.nomeFantasia;
    if (emp.dados?.nome) return emp.dados.nome;
    
    return 'Empresa';
}

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
        
        // CORREÇÃO: Só usar dados se forem da campanha atual
        // Se não tem campanhaId ou é de outra campanha, ignorar os dados
        const isDadosCampanhaAtual = campanha.campanhaId === campanhaId;
        const dadosCampanha = isDadosCampanhaAtual ? campanha : {};
        
        const status = calcularStatusEmpresa(emp);
        const progresso = calcularProgressoEmpresa(emp);
        const nomeEmpresa = getNomeEmpresa(emp);
        
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
                    ${dadosCampanha.funcionariosQtd ? `<span class="status-badge ok">👥 ${dadosCampanha.funcionariosQtd} func.</span>` : ''}
                    ${dadosCampanha.socios?.length ? `<span class="status-badge ok">👤 ${dadosCampanha.socios.length} sócio(s)</span>` : ''}
                    ${dadosCampanha.dental?.emailEnviado ? '<span class="status-badge ok">🦷 Dental</span>' : ''}
                    ${dadosCampanha.saude?.emailEnviado ? '<span class="status-badge ok">❤️ Saúde</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Calcular status da empresa
function calcularStatusEmpresa(emp) {
    const campanha = emp.campanha || {};
    
    // IMPORTANTE: Ignorar dados de outras campanhas
    // Se campanhaId existe e é diferente, considerar como nova
    // Se campanhaId não existe mas tem dados, também pode ser de campanha antiga (antes dessa feature)
    if (campanha.campanhaId && campanha.campanhaId !== campanhaId) {
        return { classe: 'diamante', cor: 'info', texto: '💎 Nova' };
    }
    
    // Se tem dados mas não tem campanhaId, verificar se há dados reais (pode ser de antes da feature)
    // Por segurança, considerar como "em andamento" só se tiver campanhaId correto
    if (!campanha.campanhaId && (campanha.funcionariosQtd || campanha.dental || campanha.saude)) {
        // Dados sem campanhaId = provável de campanha antiga, tratar como nova
        return { classe: 'diamante', cor: 'info', texto: '💎 Nova' };
    }
    
    if (campanha.dental?.fechouNegocio || campanha.saude?.fechouNegocio) {
        return { classe: 'concluida', cor: 'success', texto: '✅ Concluída' };
    }
    
    // Usar campos da campanha (separados do sistema existente)
    if (campanha.funcionariosQtd || campanha.socios?.length || campanha.dental?.emailEnviado || campanha.saude?.emailEnviado) {
        return { classe: 'andamento', cor: 'warning', texto: '🔄 Em andamento' };
    }
    
    return { classe: 'diamante', cor: 'info', texto: '💎 Nova' };
}

// Calcular progresso da empresa
function calcularProgressoEmpresa(emp) {
    const campanha = emp.campanha || {};
    
    // IMPORTANTE: Ignorar dados de outras campanhas ou sem campanhaId
    if (campanha.campanhaId && campanha.campanhaId !== campanhaId) {
        return 0;
    }
    
    // Se tem dados mas não tem campanhaId, provavelmente é de campanha antiga
    if (!campanha.campanhaId && (campanha.funcionariosQtd || campanha.dental || campanha.saude)) {
        return 0;
    }
    
    let pontos = 0;
    let total = 159; // Total possível: 5+10+8+10+15+15+8+8+40+40 (sem os 12+12 de entendimento)
    
    // Usar campos da campanha (separados do sistema existente)
    if (campanha.funcionariosQtd) pontos += 5;
    if (campanha.socios?.length) pontos += 10;
    
    // Dental
    if (campanha.dental?.emailEnviado) pontos += 8;
    if (campanha.dental?.reuniaoConfirmada) pontos += 15;
    if (campanha.dental?.decisaoRegistrada) pontos += 8;
    if (campanha.dental?.fechouNegocio) pontos += 40;
    
    // Saúde
    if (campanha.saude?.emailEnviado) pontos += 10;
    if (campanha.saude?.reuniaoConfirmada) pontos += 15;
    if (campanha.saude?.decisaoRegistrada) pontos += 8;
    if (campanha.saude?.fechouNegocio) pontos += 40;
    
    return Math.round((pontos / total) * 100);
}

// Abrir modal de empresa
async function abrirEmpresa(empresaId) {
    empresaAtual = empresasData.find(e => e.id === empresaId);
    if (!empresaAtual) return;
    
    const campanha = empresaAtual.campanha || {};
    
    // IMPORTANTE: Verificar se os dados de campanha são desta campanha
    // Caso 1: Tem campanhaId mas é de outra campanha
    // Caso 2: Tem dados mas não tem campanhaId (campanha antiga antes dessa feature)
    const isOutraCampanha = campanha.campanhaId && campanha.campanhaId !== campanhaId;
    const isDadosSemCampanhaId = !campanha.campanhaId && (campanha.funcionariosQtd || campanha.dental || campanha.saude);
    
    if (isOutraCampanha || isDadosSemCampanhaId) {
        console.log('Dados de campanha antiga detectados, fazendo reset...');
        
        // Reset no Firebase - limpar dados da campanha anterior
        try {
            const db = firebase.firestore();
            await db.collection('empresas').doc(empresaId).update({
                'campanha': {
                    campanhaId: campanhaId,
                    resetadoEm: firebase.firestore.FieldValue.serverTimestamp()
                }
            });
            console.log('Dados resetados no Firebase');
        } catch (error) {
            console.error('Erro ao resetar dados:', error);
        }
        
        // Reset local
        empresaAtual.campanha = { campanhaId: campanhaId };
        
        // Atualizar no array
        const idx = empresasData.findIndex(e => e.id === empresaId);
        if (idx >= 0) empresasData[idx] = empresaAtual;
    }
    
    // Se não tem campanhaId, setar o atual
    if (empresaAtual.campanha && !empresaAtual.campanha.campanhaId) {
        empresaAtual.campanha.campanhaId = campanhaId;
    }
    
    // Usar sócios da campanha (separados do sistema existente)
    sociosTemp = [...(empresaAtual.campanha?.socios || [])];
    
    // Função auxiliar para pegar nome da empresa
    const nomeEmpresa = getNomeEmpresa(empresaAtual);
    
    // Atualizar header do modal
    document.getElementById('modalEmpresaNome').textContent = nomeEmpresa;
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
    const campanha = emp.campanha || {};
    let pontosInfo = 0;
    
    // Funcionários (usar campo da campanha)
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
    
    // Sócios (usar campo da campanha)
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
        
        // Pegar nome da empresa para salvar junto
        const nomeEmpresa = getNomeEmpresa(empresaAtual);
        
        // Atualizar empresa - salvar dentro de campanha para não interferir no sistema existente
        await db.collection('empresas').doc(empresaAtual.id).update({
            'campanha.socios': sociosTemp,
            'campanha.sociosAtualizadoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.sociosAtualizadoPor': participanteId,
            'campanha.empresaNome': nomeEmpresa // Salvar nome para facilitar listagem
        });
        
        // Registrar ação
        await registrarAcao('socios', PONTUACAO.socios, {
            quantidadeSocios: sociosTemp.length,
            socios: sociosTemp
        });
        
        // Atualizar dados locais
        empresaAtual.campanha = empresaAtual.campanha || {};
        empresaAtual.campanha.socios = [...sociosTemp];
        empresaAtual.campanha.empresaNome = nomeEmpresa;
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
        
        // Pegar nome da empresa para salvar junto
        const nomeEmpresa = getNomeEmpresa(empresaAtual);
        
        // Atualizar empresa - salvar dentro de campanha para não interferir no sistema existente
        // IMPORTANTE: Incluir campanhaId para identificar de qual campanha são os dados
        await db.collection('empresas').doc(empresaAtual.id).update({
            'campanha.campanhaId': campanhaId,
            'campanha.funcionariosQtd': qtd,
            'campanha.funcionariosAtualizadoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.funcionariosAtualizadoPor': participanteId,
            'campanha.empresaNome': nomeEmpresa // Salvar nome para facilitar listagem
        });
        
        // Registrar ação
        await registrarAcao('funcionarios', PONTUACAO.funcionarios, {
            quantidade: qtd
        });
        
        // Atualizar dados locais
        empresaAtual.campanha = empresaAtual.campanha || {};
        empresaAtual.campanha.campanhaId = campanhaId;
        empresaAtual.campanha.funcionariosQtd = qtd;
        empresaAtual.campanha.empresaNome = nomeEmpresa;
        const idx = empresasData.findIndex(e => e.id === empresaAtual.id);
        if (idx >= 0) empresasData[idx] = empresaAtual;
        
        // Mostrar pontos
        mostrarPontos(PONTUACAO.funcionarios);
        
        // Atualizar interface
        atualizarSecaoInfo();
        atualizarSecaoDental();
        atualizarSecaoPesquisa();
        
    } catch (error) {
        console.error('Erro ao salvar funcionários:', error);
        alert('Erro ao salvar. Tente novamente.');
    }
}

// Atualizar seção Dental
function atualizarSecaoDental() {
    const emp = empresaAtual;
    const campanha = emp.campanha || {};
    const campanhaD = campanha.dental || {};
    let pontosDental = 0;
    
    // Verificar se está desbloqueado (precisa ter funcionários na campanha)
    const desbloqueado = !!campanha.funcionariosQtd;
    
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
    if (campanhaD.emailEnviado) {
        pontosDental += 8;
        document.getElementById('acaoEmailDental').classList.add('concluida');
        document.getElementById('formEmailDental').style.display = 'none';
        document.getElementById('emailDentalOk').style.display = 'block';
        document.getElementById('emailDentalValor').textContent = campanhaD.email || '';
    } else {
        document.getElementById('acaoEmailDental').classList.remove('concluida');
        document.getElementById('formEmailDental').style.display = 'block';
        document.getElementById('emailDentalOk').style.display = 'none';
    }
    
    // Reunião
    if (campanhaD.reuniaoConfirmada) {
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
    
    // Decisão
    if (campanhaD.decisaoRegistrada) {
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
    const acaoFechouDental = document.getElementById('acaoFechouDental');
    const fechouDentalOk = acaoFechouDental.querySelector('.fechou-ok');
    const fechouDentalAguardando = acaoFechouDental.querySelector('.fechou-aguardando');
    
    if (campanhaD.fechouNegocio) {
        pontosDental += 40;
        acaoFechouDental.style.display = 'block';
        acaoFechouDental.classList.add('concluida');
        acaoFechouDental.classList.remove('aguardando');
        if (fechouDentalOk) fechouDentalOk.style.display = 'block';
        if (fechouDentalAguardando) fechouDentalAguardando.style.display = 'none';
    } else if (campanhaD.decisao === 'fechou') {
        // Decisão foi "fechou" mas admin ainda não confirmou
        acaoFechouDental.style.display = 'block';
        acaoFechouDental.classList.add('aguardando');
        acaoFechouDental.classList.remove('concluida');
        if (fechouDentalOk) fechouDentalOk.style.display = 'none';
        if (fechouDentalAguardando) fechouDentalAguardando.style.display = 'block';
    } else {
        acaoFechouDental.style.display = 'none';
    }
    
    document.getElementById('pontosDental').textContent = `${pontosDental}/71 pts`;
}

// Atualizar seção Saúde
function atualizarSecaoSaude() {
    const emp = empresaAtual;
    const campanha = emp.campanha || {};
    const campanhaS = campanha.saude || {};
    let pontosSaude = 0;
    
    // Verificar se está desbloqueado (precisa ter sócios na campanha)
    const desbloqueado = campanha.socios?.length > 0;
    
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
    if (campanhaS.emailEnviado) {
        pontosSaude += 10;
        document.getElementById('acaoEmailSaude').classList.add('concluida');
        document.getElementById('formEmailSaude').style.display = 'none';
        document.getElementById('emailSaudeOk').style.display = 'block';
        document.getElementById('emailSaudeValor').textContent = campanhaS.email || '';
    } else {
        document.getElementById('acaoEmailSaude').classList.remove('concluida');
        document.getElementById('formEmailSaude').style.display = 'block';
        document.getElementById('emailSaudeOk').style.display = 'none';
    }
    
    // Reunião
    if (campanhaS.reuniaoConfirmada) {
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
    
    // Decisão
    if (campanhaS.decisaoRegistrada) {
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
    const acaoFechouSaude = document.getElementById('acaoFechouSaude');
    const fechouSaudeOk = acaoFechouSaude.querySelector('.fechou-ok');
    const fechouSaudeAguardando = acaoFechouSaude.querySelector('.fechou-aguardando');
    
    if (campanhaS.fechouNegocio) {
        pontosSaude += 40;
        acaoFechouSaude.style.display = 'block';
        acaoFechouSaude.classList.add('concluida');
        acaoFechouSaude.classList.remove('aguardando');
        if (fechouSaudeOk) fechouSaudeOk.style.display = 'block';
        if (fechouSaudeAguardando) fechouSaudeAguardando.style.display = 'none';
    } else if (campanhaS.decisao === 'fechou') {
        // Decisão foi "fechou" mas admin ainda não confirmou
        acaoFechouSaude.style.display = 'block';
        acaoFechouSaude.classList.add('aguardando');
        acaoFechouSaude.classList.remove('concluida');
        if (fechouSaudeOk) fechouSaudeOk.style.display = 'none';
        if (fechouSaudeAguardando) fechouSaudeAguardando.style.display = 'block';
    } else {
        acaoFechouSaude.style.display = 'none';
    }
    
    document.getElementById('pontosSaude').textContent = `${pontosSaude}/73 pts`;
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
        
        // Pegar nome da empresa para salvar junto
        const nomeEmpresa = getNomeEmpresa(empresaAtual);
        
        // Atualizar empresa
        const campanhaData = empresaAtual.campanha || {};
        campanhaData.dental = campanhaData.dental || {};
        campanhaData.dental.emailEnviado = true;
        campanhaData.dental.email = email;
        campanhaData.dental.emailEnviadoEm = new Date().toISOString();
        campanhaData.dental.emailEnviadoPor = participanteId;
        campanhaData.empresaNome = nomeEmpresa;
        
        await db.collection('empresas').doc(empresaAtual.id).update({
            'campanha.dental.emailEnviado': true,
            'campanha.dental.email': email,
            'campanha.dental.emailEnviadoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.dental.emailEnviadoPor': participanteId,
            'campanha.empresaNome': nomeEmpresa,
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
        
        // Pegar nome da empresa para salvar junto
        const nomeEmpresa = getNomeEmpresa(empresaAtual);
        
        // Atualizar empresa
        const campanhaData = empresaAtual.campanha || {};
        campanhaData.saude = campanhaData.saude || {};
        campanhaData.saude.emailEnviado = true;
        campanhaData.saude.email = email;
        campanhaData.saude.emailEnviadoEm = new Date().toISOString();
        campanhaData.saude.emailEnviadoPor = participanteId;
        campanhaData.empresaNome = nomeEmpresa;
        
        await db.collection('empresas').doc(empresaAtual.id).update({
            'campanha.saude.emailEnviado': true,
            'campanha.saude.email': email,
            'campanha.saude.emailEnviadoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.saude.emailEnviadoPor': participanteId,
            'campanha.empresaNome': nomeEmpresa,
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
    
    try {
        // Verificar se participante existe na campanha
        const participanteRef = db.collection('campanhas').doc(campanhaId)
            .collection('participantes').doc(participanteId);
        
        const participanteSnap = await participanteRef.get();
        if (!participanteSnap.exists) {
            console.error('Participante não encontrado na campanha:', participanteId);
            throw new Error('Participante não encontrado nesta campanha');
        }
        
        // Criar documento de ação
        await db.collection('campanhas').doc(campanhaId)
            .collection('acoes').add({
                tipo,
                pontos,
                dados,
                empresaId: empresaAtual.id,
                empresaNome: getNomeEmpresa(empresaAtual),
                participanteId,
                participanteNome: participanteData.nome,
                dataRegistro: firebase.firestore.FieldValue.serverTimestamp()
            });
        
        // Atualizar pontos do participante (usando set com merge para maior robustez)
        const novosPontos = (participanteData.pontos || 0) + pontos;
        await participanteRef.set({ 
            pontos: novosPontos,
            ultimaAtualizacao: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        participanteData.pontos = novosPontos;
        document.getElementById('pontosTotal').textContent = novosPontos;
        
    } catch (error) {
        console.error('Erro ao registrar ação:', error);
        throw error;
    }
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
        fechouSaude: '✅ Fechou Saúde',
        pesquisaEnviada: '📊 Pesquisa Enviada',
        pesquisaRespostas: '📊 10+ Respostas',
        checklistGerado: '📋 Checklist Gerado',
        checklistRespondido: '📋 Checklist Respondido',
        pesquisaConfirmada: '✉️ Pesquisa Confirmada',
        pesquisaConfirmadaEmpresa: '✉️ Pesquisa Confirmada'
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
    const campanha = emp.campanha || {};
    
    if (!campanha.funcionariosQtd) {
        alert('Informe o número de funcionários antes de gerar a pesquisa');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // VERIFICAR SE JÁ EXISTE PESQUISA PARA ESTA EMPRESA
        if (campanha.pesquisa?.id) {
            // Já existe pesquisa, apenas mostrar o link
            const baseUrl = window.location.origin + window.location.pathname.replace('campanha.html', 'pesquisa-colaboradores.html');
            const link = `${baseUrl}?p=${campanha.pesquisa.id}&e=${emp.id}`;
            mostrarModalLinkPesquisa(link);
            return;
        }
        
        // Verificar também na coleção (caso tenha pesquisa mas não salvou na empresa)
        const pesquisaExistente = await db.collection('pesquisas_colaboradores')
            .where('empresaId', '==', emp.id)
            .where('campanhaId', '==', campanhaId)
            .limit(1)
            .get();
        
        if (!pesquisaExistente.empty) {
            // Já existe pesquisa na coleção
            const pesquisaDoc = pesquisaExistente.docs[0];
            
            // Atualizar empresa com ID da pesquisa existente
            await db.collection('empresas').doc(emp.id).update({
                'campanha.pesquisa.id': pesquisaDoc.id,
                'campanha.pesquisa.linkEnviado': true,
                'campanha.pesquisa.totalRespostas': pesquisaDoc.data().totalRespostas || 0
            });
            
            // Atualizar dados locais
            empresaAtual.campanha = empresaAtual.campanha || {};
            empresaAtual.campanha.pesquisa = {
                id: pesquisaDoc.id,
                linkEnviado: true,
                totalRespostas: pesquisaDoc.data().totalRespostas || 0
            };
            
            // Mostrar link existente
            const baseUrl = window.location.origin + window.location.pathname.replace('campanha.html', 'pesquisa-colaboradores.html');
            const link = `${baseUrl}?p=${pesquisaDoc.id}&e=${emp.id}`;
            mostrarModalLinkPesquisa(link);
            return;
        }
        
        // Criar novo documento de pesquisa
        const pesquisaRef = await db.collection('pesquisas_colaboradores').add({
            empresaId: emp.id,
            empresaNome: getNomeEmpresa(emp),
            empresaCnpj: emp.cnpj,
            funcionariosQtd: campanha.funcionariosQtd,
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
    const nomeEmp = getNomeEmpresa(emp);
    const mensagem = encodeURIComponent(
        `🎯 *Pesquisa de Benefícios*\n\n` +
        `Olá! A empresa ${nomeEmp} está avaliando a possibilidade de oferecer planos de saúde e dental para os colaboradores.\n\n` +
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
    const campanha = emp.campanha || {};
    const pesquisa = campanha.pesquisa || {};
    const funcionarios = campanha.funcionariosQtd || 0;
    
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
    // Parar verificação do checklist também
    if (intervalVerificarChecklist) {
        clearInterval(intervalVerificarChecklist);
        intervalVerificarChecklist = null;
    }
    _fecharModalEmpresaOriginal();
};

// =====================================================
// CHECKLIST DE ENTENDIMENTO
// =====================================================

// Intervalo para verificar status do checklist
let intervalVerificarChecklist = null;

// Gerar checklist de entendimento
async function gerarChecklist() {
    const emp = empresaAtual;
    const campanha = emp.campanha || {};
    
    // Verificar pré-requisitos
    if (!campanha.funcionariosQtd) {
        alert('Informe o número de funcionários antes de gerar o checklist');
        return;
    }
    
    if (!campanha.socios?.length) {
        alert('Informe os dados dos sócios antes de gerar o checklist');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // Verificar se já existe checklist
        if (campanha.checklist?.id) {
            // Já existe, mostrar link
            verLinkChecklist();
            return;
        }
        
        // Verificar na coleção também
        const checklistExistente = await db.collection('checklists_entendimento')
            .where('empresaId', '==', emp.id)
            .where('campanhaId', '==', campanhaId)
            .limit(1)
            .get();
        
        if (!checklistExistente.empty) {
            // Já existe na coleção
            const checklistDoc = checklistExistente.docs[0];
            
            // Atualizar empresa com ID existente
            await db.collection('empresas').doc(emp.id).update({
                'campanha.checklist.id': checklistDoc.id,
                'campanha.checklist.linkEnviado': true,
                'campanha.checklist.respondido': checklistDoc.data().respondido || false
            });
            
            empresaAtual.campanha.checklist = {
                id: checklistDoc.id,
                linkEnviado: true,
                respondido: checklistDoc.data().respondido || false
            };
            
            await atualizarSecaoChecklist();
            verLinkChecklist();
            return;
        }
        
        const nomeEmpresa = getNomeEmpresa(emp);
        
        // Criar novo checklist
        const checklistRef = await db.collection('checklists_entendimento').add({
            empresaId: emp.id,
            empresaNome: nomeEmpresa,
            empresaCnpj: emp.cnpj,
            campanhaId: campanhaId,
            participanteId: participanteId,
            participanteNome: participanteData.nome,
            agenciaId: participanteData.agenciaId,
            agenciaNome: participanteData.agenciaNome,
            funcionariosQtd: campanha.funcionariosQtd,
            sociosQtd: campanha.socios.length,
            respondido: false,
            dataCriacao: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Atualizar empresa
        await db.collection('empresas').doc(emp.id).update({
            'campanha.checklist.id': checklistRef.id,
            'campanha.checklist.linkEnviado': true,
            'campanha.checklist.linkEnviadoEm': firebase.firestore.FieldValue.serverTimestamp(),
            'campanha.checklist.linkEnviadoPor': participanteId,
            'campanha.checklist.respondido': false
        });
        
        // Registrar ação e ganhar pontos
        await registrarAcao('checklistGerado', PONTUACAO.checklistGerado, {
            checklistId: checklistRef.id
        });
        
        // Atualizar dados locais
        empresaAtual.campanha = empresaAtual.campanha || {};
        empresaAtual.campanha.checklist = {
            id: checklistRef.id,
            linkEnviado: true,
            respondido: false
        };
        
        // Mostrar pontos
        mostrarPontos(PONTUACAO.checklistGerado);
        
        // Atualizar interface
        await atualizarSecaoChecklist();
        
        // Mostrar link
        const baseUrl = window.location.origin + window.location.pathname.replace('campanha.html', 'checklist-empresa.html');
        const link = `${baseUrl}?ch=${checklistRef.id}&e=${emp.id}&c=${campanhaId}&p=${participanteId}`;
        
        mostrarModalLinkChecklist(link);
        
    } catch (error) {
        console.error('Erro ao gerar checklist:', error);
        alert('Erro ao gerar checklist. Tente novamente.');
    }
}

// Ver link do checklist existente
async function verLinkChecklist() {
    let checklist = empresaAtual?.campanha?.checklist;
    console.log('verLinkChecklist - checklist inicial:', checklist);
    
    // Se não tem ID local, buscar do Firebase
    if (!checklist?.id) {
        try {
            const db = firebase.firestore();
            // Busca simples sem índice composto
            const checklistSnap = await db.collection('checklists_entendimento')
                .where('empresaId', '==', empresaAtual.id)
                .get();
            
            // Filtrar pelo campanhaId manualmente
            const docs = checklistSnap.docs.filter(doc => doc.data().campanhaId === campanhaId);
            
            if (docs.length > 0) {
                const checklistDoc = docs[0];
                checklist = {
                    id: checklistDoc.id,
                    linkEnviado: true,
                    respondido: checklistDoc.data().respondido || false,
                    estatisticas: checklistDoc.data().estatisticas
                };
                
                // Atualizar dados locais
                empresaAtual.campanha = empresaAtual.campanha || {};
                empresaAtual.campanha.checklist = checklist;
                
                console.log('Checklist encontrado no Firebase:', checklist);
            }
        } catch (error) {
            console.error('Erro ao buscar checklist:', error);
        }
    }
    
    if (!checklist?.id) {
        alert('Checklist não encontrado. Tente gerar novamente.');
        return;
    }
    
    const baseUrl = window.location.origin + window.location.pathname.replace('campanha.html', 'checklist-empresa.html');
    const link = `${baseUrl}?ch=${checklist.id}&e=${empresaAtual.id}&c=${campanhaId}&p=${participanteId}`;
    
    console.log('Link gerado:', link);
    mostrarModalLinkChecklist(link);
}

// Mostrar modal com link do checklist
function mostrarModalLinkChecklist(link) {
    const nomeEmp = getNomeEmpresa(empresaAtual);
    
    // Remover modal existente se houver
    const existente = document.querySelector('.modal-link-checklist');
    if (existente) existente.remove();
    
    const modal = document.createElement('div');
    modal.className = 'modal-link-checklist';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 20px;
    `;
    
    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
            animation: slideUp 0.3s ease;
        ">
            <div style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h5 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                    <i class="bi bi-clipboard-check"></i> Checklist de Entendimento
                </h5>
                <button onclick="this.closest('.modal-link-checklist').remove()" style="
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    width: 35px;
                    height: 35px;
                    border-radius: 50%;
                    font-size: 1.5rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">×</button>
            </div>
            <div style="padding: 25px;">
                <p style="margin-bottom: 20px; color: #333;">
                    Envie este link para a empresa <strong>${nomeEmp}</strong> responder o checklist de entendimento sobre os planos:
                </p>
                <div style="
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                ">
                    <input type="text" value="${link}" readonly id="inputLinkChecklist" style="
                        flex: 1;
                        padding: 12px 15px;
                        border: 2px solid #e0e0e0;
                        border-radius: 10px;
                        font-size: 0.9rem;
                        background: #f8f9fa;
                    ">
                    <button onclick="copiarLinkChecklist()" style="
                        padding: 12px 20px;
                        background: linear-gradient(135deg, #667eea, #764ba2);
                        color: white;
                        border: none;
                        border-radius: 10px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 5px;
                    ">
                        <i class="bi bi-clipboard"></i> Copiar
                    </button>
                </div>
                <button onclick="enviarChecklistWhatsApp('${link}')" style="
                    width: 100%;
                    padding: 15px;
                    background: linear-gradient(135deg, #25D366, #128C7E);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                ">
                    <i class="bi bi-whatsapp"></i> Enviar via WhatsApp
                </button>
                <div style="
                    margin-top: 20px;
                    text-align: center;
                    padding: 15px;
                    background: #e8f5e9;
                    border-radius: 10px;
                    color: #2e7d32;
                ">
                    <i class="bi bi-info-circle"></i> Quando a empresa responder, você ganhará automaticamente:<br>
                    <strong>+25 pts</strong> (respondido) + <strong>+12 pts</strong> (entendeu dental) + <strong>+12 pts</strong> (entendeu saúde)
                </div>
            </div>
        </div>
    `;
    
    // Adicionar animação CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(modal);
    
    // Fechar ao clicar fora
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
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
    const nomeEmp = getNomeEmpresa(empresaAtual);
    const mensagem = encodeURIComponent(
        `📋 *Pesquisa de Entendimento - Planos de Saúde e Dental*\n\n` +
        `Olá! Segue a pesquisa para confirmar o entendimento sobre os benefícios dos planos apresentados para a empresa *${nomeEmp}*.\n\n` +
        `Por favor, responda as perguntas clicando no link abaixo:\n\n` +
        `👉 ${link}\n\n` +
        `São apenas alguns minutos! Obrigado! 🙏`
    );
    
    window.open(`https://wa.me/?text=${mensagem}`, '_blank');
}

// Verificar status do checklist (chamado periodicamente)
async function verificarStatusChecklist() {
    const emp = empresaAtual;
    const checklist = emp.campanha?.checklist;
    
    if (!checklist?.id || checklist.respondido) return;
    
    try {
        const db = firebase.firestore();
        
        const checklistDoc = await db.collection('checklists_entendimento').doc(checklist.id).get();
        if (!checklistDoc.exists) return;
        
        const data = checklistDoc.data();
        
        if (data.respondido && !checklist.respondido) {
            // Checklist foi respondido! Atualizar dados locais
            empresaAtual.campanha.checklist = {
                ...checklist,
                respondido: true,
                respondidoEm: data.respondidoEm,
                estatisticas: data.estatisticas
            };
            
            // Atualizar empresa no Firestore
            await db.collection('empresas').doc(emp.id).update({
                'campanha.checklist.respondido': true,
                'campanha.checklist.respondidoEm': data.respondidoEm,
                'campanha.checklist.estatisticas': data.estatisticas
            });
            
            // Atualizar interface
            await atualizarSecaoChecklist();
            
            // Recarregar pontos (os pontos já foram adicionados pelo checklist-empresa.js)
            const participanteDoc = await db.collection('campanhas').doc(campanhaId)
                .collection('participantes').doc(participanteId).get();
            if (participanteDoc.exists) {
                participanteData.pontos = participanteDoc.data().pontos || 0;
                document.getElementById('pontosTotal').textContent = participanteData.pontos;
            }
        }
        
    } catch (error) {
        console.error('Erro ao verificar checklist:', error);
    }
}

// Atualizar seção do checklist
async function atualizarSecaoChecklist() {
    const emp = empresaAtual;
    const campanha = emp.campanha || {};
    let checklist = campanha.checklist || {};
    const funcionarios = campanha.funcionariosQtd || 0;
    const socios = campanha.socios || [];
    
    const container = document.getElementById('secaoChecklist');
    if (!container) return;
    
    // Se não tem checklist local, buscar do Firebase
    if (!checklist.id && funcionarios && socios.length > 0) {
        try {
            const db = firebase.firestore();
            // Busca simples sem índice composto
            const checklistSnap = await db.collection('checklists_entendimento')
                .where('empresaId', '==', emp.id)
                .get();
            
            // Filtrar pelo campanhaId manualmente
            const docs = checklistSnap.docs.filter(doc => doc.data().campanhaId === campanhaId);
            
            if (docs.length > 0) {
                const checklistDoc = docs[0];
                checklist = {
                    id: checklistDoc.id,
                    linkEnviado: true,
                    respondido: checklistDoc.data().respondido || false,
                    estatisticas: checklistDoc.data().estatisticas
                };
                
                // Atualizar dados locais
                empresaAtual.campanha = empresaAtual.campanha || {};
                empresaAtual.campanha.checklist = checklist;
            }
        } catch (error) {
            console.log('Erro ao buscar checklist:', error);
        }
    }
    
    // Verificar se está desbloqueado
    if (!funcionarios || socios.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="bi bi-lock" style="font-size: 2rem;"></i>
                <p class="mt-2">Informe funcionários e sócios para desbloquear</p>
            </div>
        `;
        document.getElementById('pontosChecklist').textContent = '🔒 Bloqueado';
        return;
    }
    
    // Verificar se gerou pesquisa de colaboradores
    const pesquisaGerada = campanha.pesquisa?.id || campanha.pesquisa?.linkEnviado;
    if (!pesquisaGerada) {
        container.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="bi bi-lock" style="font-size: 2rem; color: #ffc107;"></i>
                <p class="mt-2"><strong>Gere primeiro a Pesquisa de Colaboradores</strong></p>
                <p class="small text-muted">O checklist pergunta se a empresa recebeu a pesquisa, então é necessário gerar a pesquisa antes.</p>
            </div>
        `;
        document.getElementById('pontosChecklist').textContent = '🔒 Aguardando Pesquisa';
        return;
    }
    
    let pontosChecklist = 0;
    if (checklist.linkEnviado) pontosChecklist += 5;
    if (checklist.respondido) pontosChecklist += 25 + 12 + 12; // +25 checklist +12 dental +12 saúde
    if (checklist.estatisticas?.pesquisa?.sim >= 1) pontosChecklist += 20; // Se confirmou pesquisa
    
    let html = '';
    
    if (!checklist.id) {
        // Ainda não gerou checklist
        html = `
            <div class="text-center py-4">
                <i class="bi bi-clipboard-check" style="font-size: 3rem; color: #667eea;"></i>
                <h6 class="mt-3">Checklist de Entendimento</h6>
                <p class="text-muted">Gere um checklist para a empresa confirmar que entendeu os benefícios dos planos.</p>
                <button class="btn-acao primary" onclick="gerarChecklist()" style="max-width: 300px; margin: 0 auto;">
                    <i class="bi bi-send"></i> Gerar Checklist (+5 pts)
                </button>
            </div>
        `;
    } else {
        // Já gerou checklist
        const stats = checklist.estatisticas || {};
        const saudeStats = stats.saude || {};
        const dentalStats = stats.dental || {};
        
        html = `
            <div class="acao-item concluida">
                <div class="acao-titulo">
                    <i class="bi bi-send"></i>
                    Link Gerado
                    <span class="acao-pontos">+5 pts</span>
                </div>
                <div class="text-success">
                    <i class="bi bi-check-circle-fill"></i> Checklist criado
                </div>
                <button class="btn btn-sm btn-outline-primary mt-2" onclick="verLinkChecklist()">
                    <i class="bi bi-link-45deg"></i> Ver Link
                </button>
            </div>
            
            <div class="acao-item ${checklist.respondido ? 'concluida' : 'aguardando'}">
                <div class="acao-titulo">
                    <i class="bi bi-clipboard-check"></i>
                    Empresa Respondeu
                    <span class="acao-pontos">+49 pts</span>
                </div>
                ${checklist.respondido ? `
                    <div class="text-success">
                        <i class="bi bi-check-circle-fill"></i> Checklist respondido!
                    </div>
                    <div class="mt-2 small">
                        <div class="mb-2">
                            <span class="badge bg-success me-1">+25 respondido</span>
                            <span class="badge bg-danger me-1">+12 entendeu saúde</span>
                            <span class="badge bg-primary">+12 entendeu dental</span>
                        </div>
                        <div class="row">
                            <div class="col-6">
                                <strong class="text-danger"><i class="bi bi-heart-pulse"></i> Saúde:</strong>
                                <span>${saudeStats.porcentagemSim || 0}% entendeu</span>
                                <br><small class="text-muted">Probabilidade: ${saudeStats.probabilidade ?? '-'}/10</small>
                            </div>
                            <div class="col-6">
                                <strong class="text-info"><i class="bi bi-emoji-smile"></i> Dental:</strong>
                                <span>${dentalStats.porcentagemSim || 0}% entendeu</span>
                                <br><small class="text-muted">Probabilidade: ${dentalStats.probabilidade ?? '-'}/10</small>
                            </div>
                        </div>
                    </div>
                ` : `
                    <div class="text-warning">
                        <i class="bi bi-clock"></i> Aguardando empresa responder...
                    </div>
                    <small class="text-muted d-block mt-1">
                        <i class="bi bi-info-circle"></i> +25 respondido +12 entendeu saúde +12 entendeu dental
                    </small>
                `}
            </div>
            
            ${checklist.respondido ? `
                <div class="acao-item ${stats.pesquisa?.sim >= 1 ? 'concluida' : ''}">
                    <div class="acao-titulo">
                        <i class="bi bi-envelope-check"></i>
                        Pesquisa Confirmada
                        <span class="acao-pontos">+20 pts</span>
                    </div>
                    ${stats.pesquisa?.sim >= 1 ? `
                        <div class="text-success">
                            <i class="bi bi-check-circle-fill"></i> Empresa confirmou que recebeu a pesquisa!
                        </div>
                    ` : `
                        <div class="text-muted">
                            <i class="bi bi-x-circle"></i> Empresa ainda não confirmou recebimento da pesquisa
                        </div>
                    `}
                </div>
            ` : ''}
        `;
    }
    
    container.innerHTML = html;
    
    // Atualizar badge de pontos (5 + 25 + 12 + 12 + 20 = 74)
    document.getElementById('pontosChecklist').textContent = `${pontosChecklist}/74 pts`;
}

// Integrar checklist na abertura da empresa
const _abrirEmpresaComPesquisa = abrirEmpresa;
abrirEmpresa = async function(empresaId) {
    await _abrirEmpresaComPesquisa(empresaId);
    
    // Atualizar seção checklist (agora é async)
    await atualizarSecaoChecklist();
    
    // Iniciar verificação periódica do checklist
    const checklist = empresaAtual.campanha?.checklist;
    if (checklist?.id && !checklist?.respondido) {
        intervalVerificarChecklist = setInterval(verificarStatusChecklist, 30000);
    }
};
