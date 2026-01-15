/**
 * CAMPANHAS ADMIN - Painel de Gerenciamento
 * Sistema de campanhas de indicação para assistentes de banco
 */

// Variáveis globais
let campanhas = [];
let agencias = [];
let campanhaAtual = null;
let participanteAtual = null;
let campanhaFiltroId = null; // Campanha selecionada para filtrar ações/empresas
let campanhasExistentesCache = new Set(); // Cache de IDs de campanhas que existem

// Função auxiliar: obter Set de campanhas existentes
async function obterCampanhasExistentes() {
    const db = firebase.firestore();
    const campanhasSnap = await db.collection('campanhas').get();
    campanhasExistentesCache = new Set(campanhasSnap.docs.map(doc => doc.id));
    return campanhasExistentesCache;
}

// Verificar se campanha existe (usa cache)
function campanhaExiste(campanhaId) {
    return campanhasExistentesCache.has(campanhaId);
}

// Função auxiliar para pegar nome da empresa
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
    
    // Log para debug (pode remover depois)
    console.log('Empresa sem nome detectada:', Object.keys(emp));
    
    return 'Empresa';
}

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
    await waitForFirebase();
    
    // Verificar autenticação
    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        
        await carregarDados();
        configurarEventos();
    });
});

// Carregar dados iniciais
async function carregarDados() {
    const db = firebase.firestore();
    
    // Carregar agências
    const agenciasSnap = await db.collection('agencias_banco').get();
    agencias = agenciasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Carregar campanhas (também popula o cache)
    await carregarCampanhas();
    
    // Popular cache de campanhas existentes
    await obterCampanhasExistentes();
    
    // Popular seletores de campanha
    popularSeletoresCampanha();
    
    // Carregar stats
    await atualizarStats();
    
    // Carregar ações pendentes
    await carregarAcoesPendentes();
}

// Popular seletores de campanha nos filtros
function popularSeletoresCampanha() {
    const seletores = ['selectFiltroCampanha', 'selectFiltroCampanhaEmpresas', 'selectFiltroCampanhaPesquisas', 'selectFiltroCampanhaChecklists'];
    
    seletores.forEach(seletorId => {
        const select = document.getElementById(seletorId);
        if (!select) return;
        
        select.innerHTML = '<option value="">Todas as campanhas</option>' +
            campanhas.map(c => `
                <option value="${c.id}" ${c.status === 'ativa' ? '' : 'class="text-muted"'}>
                    ${c.nome} ${c.status !== 'ativa' ? '(Encerrada)' : ''}
                </option>
            `).join('');
    });
}

// Filtrar por campanha selecionada
function filtrarPorCampanha(campanhaId) {
    campanhaFiltroId = campanhaId || null;
    carregarAcoesPendentes();
}

// Filtrar empresas por campanha
function filtrarEmpresasPorCampanha(campanhaId) {
    campanhaFiltroId = campanhaId || null;
    carregarEmpresasCampanha();
}

// Filtrar pesquisas por campanha
function filtrarPesquisasPorCampanha(campanhaId) {
    campanhaFiltroId = campanhaId || null;
    carregarPesquisas();
}

// Filtrar checklists por campanha
function filtrarChecklistsPorCampanha(campanhaId) {
    campanhaFiltroId = campanhaId || null;
    carregarChecklists();
}

// Configurar eventos
function configurarEventos() {
    // Tabs principais
    document.querySelectorAll('#mainTabs .nav-link').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            document.querySelectorAll('#mainTabs .nav-link').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.card-custom').forEach(c => c.style.display = 'none');
            
            switch(tab) {
                case 'campanhas':
                    document.getElementById('tabCampanhas').style.display = 'block';
                    break;
                case 'pendentes':
                    document.getElementById('tabPendentes').style.display = 'block';
                    carregarAcoesPendentes();
                    break;
                case 'empresas':
                    document.getElementById('tabEmpresas').style.display = 'block';
                    carregarEmpresasCampanha();
                    break;
                case 'pesquisas':
                    document.getElementById('tabPesquisas').style.display = 'block';
                    carregarPesquisas();
                    break;
                case 'checklists':
                    document.getElementById('tabChecklists').style.display = 'block';
                    carregarChecklists();
                    break;
                case 'relatorios':
                    document.getElementById('tabRelatorios').style.display = 'block';
                    break;
            }
        });
    });
    
    // Filtro de status
    document.getElementById('filtroStatus').addEventListener('change', renderizarCampanhas);
    
    // Busca de empresas
    document.getElementById('buscaEmpresa').addEventListener('input', carregarEmpresasCampanha);
    
    // Tabs do modal
    document.querySelectorAll('[data-modal-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.modalTab;
            
            document.querySelectorAll('[data-modal-tab]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.getElementById('modalTabParticipantes').style.display = tab === 'participantes' ? 'block' : 'none';
            document.getElementById('modalTabRanking').style.display = tab === 'ranking' ? 'block' : 'none';
            document.getElementById('modalTabConfig').style.display = tab === 'config' ? 'block' : 'none';
            
            if (tab === 'ranking') carregarRankingCampanha();
        });
    });
}

// Carregar campanhas
async function carregarCampanhas() {
    const db = firebase.firestore();
    
    const campanhasSnap = await db.collection('campanhas')
        .orderBy('dataCriacao', 'desc')
        .get();
    
    campanhas = await Promise.all(campanhasSnap.docs.map(async doc => {
        const data = { id: doc.id, ...doc.data() };
        
        // Contar participantes
        const participantesSnap = await db.collection('campanhas').doc(doc.id)
            .collection('participantes').get();
        data.totalParticipantes = participantesSnap.size;
        
        // Somar pontos
        let totalPontos = 0;
        participantesSnap.docs.forEach(p => {
            totalPontos += p.data().pontos || 0;
        });
        data.totalPontos = totalPontos;
        
        return data;
    }));
    
    renderizarCampanhas();
}

// Renderizar campanhas
function renderizarCampanhas() {
    const filtro = document.getElementById('filtroStatus').value;
    const container = document.getElementById('listaCampanhas');
    
    const campanhasFiltradas = campanhas.filter(c => 
        filtro === 'todas' || c.status === filtro
    );
    
    if (campanhasFiltradas.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-megaphone" style="font-size: 2rem;"></i>
                <p class="mt-2">Nenhuma campanha encontrada</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = campanhasFiltradas.map(c => `
        <div class="campanha-item ${c.status}">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h5 class="mb-1">${c.nome || 'Campanha'}</h5>
                    <p class="text-muted mb-2">${c.descricao || ''}</p>
                    <div class="d-flex gap-3">
                        <span class="badge bg-${c.status === 'ativa' ? 'success' : 'secondary'}">${c.status === 'ativa' ? 'Ativa' : 'Encerrada'}</span>
                        <span class="text-muted small"><i class="bi bi-people"></i> ${c.totalParticipantes} participantes</span>
                        <span class="text-muted small"><i class="bi bi-star"></i> ${c.totalPontos} pontos</span>
                    </div>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-primary" onclick="abrirGerenciarCampanha('${c.id}')">
                        <i class="bi bi-gear"></i> Gerenciar
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Atualizar estatísticas
async function atualizarStats() {
    const db = firebase.firestore();
    
    // Campanhas ativas
    const campanhasAtivas = campanhas.filter(c => c.status === 'ativa').length;
    document.getElementById('statCampanhas').textContent = campanhasAtivas;
    
    // Total participantes
    let totalParticipantes = 0;
    let totalPontos = 0;
    campanhas.forEach(c => {
        totalParticipantes += c.totalParticipantes || 0;
        totalPontos += c.totalPontos || 0;
    });
    document.getElementById('statParticipantes').textContent = totalParticipantes;
    document.getElementById('statPontos').textContent = totalPontos;
    
    // Negócios fechados
    let negocios = 0;
    const empresasSnap = await db.collection('empresas')
        .where('campanha.dental.fechouNegocio', '==', true)
        .get();
    negocios += empresasSnap.size;
    
    const empresasSaudeSnap = await db.collection('empresas')
        .where('campanha.saude.fechouNegocio', '==', true)
        .get();
    negocios += empresasSaudeSnap.size;
    
    document.getElementById('statNegocios').textContent = negocios;
}

// Abrir modal nova campanha
async function abrirModalNovaCampanha() {
    // Carregar agências se ainda não foram carregadas
    if (agencias.length === 0) {
        const db = firebase.firestore();
        const agenciasSnap = await db.collection('agencias_banco').get();
        agencias = agenciasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    // Preencher checkboxes de agências
    const container = document.getElementById('checkboxAgencias');
    
    if (agencias.length === 0) {
        container.innerHTML = '<p class="text-muted">Nenhuma agência cadastrada</p>';
    } else {
        container.innerHTML = agencias.map(ag => `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="${ag.id}" id="ag_${ag.id}">
                <label class="form-check-label" for="ag_${ag.id}">${ag.nome || ag.nomeAgencia || ag.id}</label>
            </div>
        `).join('');
    }
    
    // Definir datas padrão
    const hoje = new Date();
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    document.getElementById('inputCampanhaInicio').value = hoje.toISOString().split('T')[0];
    document.getElementById('inputCampanhaFim').value = fimMes.toISOString().split('T')[0];
    
    // Limpar campos
    document.getElementById('inputCampanhaNome').value = '';
    document.getElementById('inputCampanhaDesc').value = '';
    
    new bootstrap.Modal(document.getElementById('modalNovaCampanha')).show();
}

// Criar campanha
async function criarCampanha() {
    const nome = document.getElementById('inputCampanhaNome').value.trim();
    const descricao = document.getElementById('inputCampanhaDesc').value.trim();
    const dataInicio = document.getElementById('inputCampanhaInicio').value;
    const dataFim = document.getElementById('inputCampanhaFim').value;
    
    const agenciasSelecionadas = [];
    document.querySelectorAll('#checkboxAgencias input:checked').forEach(cb => {
        agenciasSelecionadas.push(cb.value);
    });
    
    if (!nome) {
        alert('Informe o nome da campanha');
        return;
    }
    
    if (agenciasSelecionadas.length === 0) {
        alert('Selecione pelo menos uma agência');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        await db.collection('campanhas').add({
            nome,
            descricao,
            dataInicio,
            dataFim,
            agencias: agenciasSelecionadas,
            status: 'ativa',
            dataCriacao: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        bootstrap.Modal.getInstance(document.getElementById('modalNovaCampanha')).hide();
        
        alert('Campanha criada com sucesso!');
        await carregarCampanhas();
        await atualizarStats();
        
    } catch (error) {
        console.error('Erro ao criar campanha:', error);
        alert('Erro ao criar campanha');
    }
}

// Abrir gerenciar campanha
async function abrirGerenciarCampanha(campanhaId) {
    campanhaAtual = campanhas.find(c => c.id === campanhaId);
    if (!campanhaAtual) return;
    
    document.getElementById('modalGerenciarTitulo').textContent = campanhaAtual.nome || 'Gerenciar Campanha';
    document.getElementById('selectStatusCampanha').value = campanhaAtual.status;
    
    // Resetar tabs
    document.querySelectorAll('[data-modal-tab]').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-modal-tab="participantes"]').classList.add('active');
    document.getElementById('modalTabParticipantes').style.display = 'block';
    document.getElementById('modalTabRanking').style.display = 'none';
    document.getElementById('modalTabConfig').style.display = 'none';
    
    await carregarParticipantesCampanha();
    
    new bootstrap.Modal(document.getElementById('modalGerenciarCampanha')).show();
}

// Carregar participantes da campanha
async function carregarParticipantesCampanha() {
    const db = firebase.firestore();
    const container = document.getElementById('listaParticipantesCampanha');
    
    const participantesSnap = await db.collection('campanhas').doc(campanhaAtual.id)
        .collection('participantes')
        .orderBy('pontos', 'desc')
        .get();
    
    if (participantesSnap.empty) {
        container.innerHTML = '<p class="text-muted text-center py-3">Nenhum participante cadastrado</p>';
        return;
    }
    
    container.innerHTML = participantesSnap.docs.map((doc, idx) => {
        const p = doc.data();
        return `
            <div class="participante-card d-flex justify-content-between align-items-center">
                <div>
                    <span class="badge bg-secondary me-2">#${idx + 1}</span>
                    <strong>${p.nome || 'Participante'}</strong>
                    <span class="text-muted ms-2">${p.agenciaNome || ''}</span>
                    <span class="badge bg-primary ms-2">${p.pontos || 0} pts</span>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-success" onclick="abrirLinkParticipante('${doc.id}', '${p.nome}', '${p.telefone || ''}')">
                        <i class="bi bi-link-45deg"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="removerParticipante('${doc.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Carregar ranking da campanha
async function carregarRankingCampanha() {
    const db = firebase.firestore();
    const container = document.getElementById('rankingCampanha');
    
    const participantesSnap = await db.collection('campanhas').doc(campanhaAtual.id)
        .collection('participantes')
        .orderBy('pontos', 'desc')
        .get();
    
    if (participantesSnap.empty) {
        container.innerHTML = '<p class="text-muted text-center py-3">Nenhum participante</p>';
        return;
    }
    
    container.innerHTML = `
        <table class="table table-modern">
            <thead>
                <tr>
                    <th>Posição</th>
                    <th>Nome</th>
                    <th>Agência</th>
                    <th>Pontos</th>
                </tr>
            </thead>
            <tbody>
                ${participantesSnap.docs.map((doc, idx) => {
                    const p = doc.data();
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                    return `
                        <tr>
                            <td><strong>${medal}</strong></td>
                            <td>${p.nome || 'Participante'}</td>
                            <td>${p.agenciaNome || '-'}</td>
                            <td><strong class="text-primary">${p.pontos || 0}</strong></td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

// Abrir modal novo participante
function abrirModalNovoParticipante() {
    // Preencher select de agências
    const select = document.getElementById('selectParticipanteAgencia');
    select.innerHTML = '<option value="">Selecione...</option>' + 
        agencias.filter(ag => campanhaAtual.agencias?.includes(ag.id))
            .map(ag => `<option value="${ag.id}" data-nome="${ag.nome}">${ag.nome || ag.id}</option>`)
            .join('');
    
    // Limpar campos
    document.getElementById('inputParticipanteNome').value = '';
    document.getElementById('inputParticipanteCargo').value = '';
    document.getElementById('inputParticipanteEmail').value = '';
    document.getElementById('inputParticipanteTelefone').value = '';
    
    new bootstrap.Modal(document.getElementById('modalNovoParticipante')).show();
}

// Criar participante
async function criarParticipante() {
    const nome = document.getElementById('inputParticipanteNome').value.trim();
    const agenciaSelect = document.getElementById('selectParticipanteAgencia');
    const agenciaId = agenciaSelect.value;
    const agenciaNome = agenciaSelect.selectedOptions[0]?.dataset.nome || '';
    const cargo = document.getElementById('inputParticipanteCargo').value.trim();
    const email = document.getElementById('inputParticipanteEmail').value.trim();
    const telefone = document.getElementById('inputParticipanteTelefone').value.trim();
    
    if (!nome || !agenciaId) {
        alert('Preencha nome e agência');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        await db.collection('campanhas').doc(campanhaAtual.id)
            .collection('participantes').add({
                nome,
                agenciaId,
                agenciaNome,
                cargo,
                email,
                telefone,
                pontos: 0,
                dataCriacao: firebase.firestore.FieldValue.serverTimestamp()
            });
        
        bootstrap.Modal.getInstance(document.getElementById('modalNovoParticipante')).hide();
        
        await carregarParticipantesCampanha();
        await carregarCampanhas();
        
        alert('Participante adicionado com sucesso!');
        
    } catch (error) {
        console.error('Erro ao criar participante:', error);
        alert('Erro ao criar participante');
    }
}

// Abrir link do participante
function abrirLinkParticipante(participanteId, nome, telefone) {
    participanteAtual = { id: participanteId, nome, telefone };
    
    const baseUrl = window.location.origin + window.location.pathname.replace('campanhas-admin.html', 'campanha.html');
    const link = `${baseUrl}?c=${campanhaAtual.id}&p=${participanteId}`;
    
    document.getElementById('inputLinkParticipante').value = link;
    
    new bootstrap.Modal(document.getElementById('modalLinkParticipante')).show();
}

// Copiar link
function copiarLink() {
    const input = document.getElementById('inputLinkParticipante');
    input.select();
    document.execCommand('copy');
    alert('Link copiado!');
}

// Enviar WhatsApp
function enviarWhatsApp() {
    const link = document.getElementById('inputLinkParticipante').value;
    const nome = participanteAtual?.nome || 'participante';
    const telefone = participanteAtual?.telefone?.replace(/\D/g, '') || '';
    
    const mensagem = encodeURIComponent(
        `Olá ${nome}! 🎯\n\n` +
        `Você foi convidado(a) para participar da nossa Campanha de Indicação!\n\n` +
        `📊 *Sistema de Pontuação:*\n` +
        `• Funcionários atualizados: 5 pts\n` +
        `• Dados dos sócios: 10 pts\n` +
        `• E-mail + cotação dental: 8 pts\n` +
        `• E-mail + cotação saúde: 10 pts\n` +
        `• Reunião agendada: 15 pts\n` +
        `• Confirmou entendimento: 12 pts\n` +
        `• Decisão justificada: 8 pts\n` +
        `• Negócio fechado: 40 pts\n\n` +
        `🔗 Acesse pelo link:\n${link}\n\n` +
        `Boa sorte! 🚀`
    );
    
    const whatsappUrl = telefone 
        ? `https://wa.me/55${telefone}?text=${mensagem}`
        : `https://wa.me/?text=${mensagem}`;
    
    window.open(whatsappUrl, '_blank');
}

// Remover participante
async function removerParticipante(participanteId) {
    if (!confirm('Tem certeza que deseja remover este participante?')) return;
    
    try {
        const db = firebase.firestore();
        await db.collection('campanhas').doc(campanhaAtual.id)
            .collection('participantes').doc(participanteId).delete();
        
        await carregarParticipantesCampanha();
        alert('Participante removido');
        
    } catch (error) {
        console.error('Erro ao remover participante:', error);
        alert('Erro ao remover');
    }
}

// Carregar ações pendentes
async function carregarAcoesPendentes() {
    const db = firebase.firestore();
    const container = document.getElementById('listaAcoesPendentes');
    
    // Buscar empresas que têm ações pendentes de confirmação admin
    const empresasSnap = await db.collection('empresas').get();
    
    const pendentes = [];
    
    empresasSnap.docs.forEach(doc => {
        const emp = doc.data();
        const campanha = emp.campanha || {};
        
        // ⚠️ IMPORTANTE: Filtrar por campanhaId se selecionado
        if (campanhaFiltroId && campanha.campanhaId !== campanhaFiltroId) {
            return; // Pular empresas de outras campanhas
        }
        
        // Também pular se não tem campanhaId (dados órfãos)
        if (!campanha.campanhaId) {
            return;
        }
        
        // Buscar nome da campanha para exibição
        const campanhaNome = campanhas.find(c => c.id === campanha.campanhaId)?.nome || '';
        
        // Verificar pendências de dental
        if (campanha.dental?.emailEnviado && !campanha.dental?.reuniaoConfirmada) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: getNomeEmpresa(emp),
                campanhaId: campanha.campanhaId,
                campanhaNome,
                tipo: 'reuniaoDental',
                label: 'Confirmar Reunião Dental',
                pontos: 15
            });
        }
        if (campanha.dental?.reuniaoConfirmada && !campanha.dental?.entendeuConfirmado) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: getNomeEmpresa(emp),
                campanhaId: campanha.campanhaId,
                campanhaNome,
                tipo: 'entendeuDental',
                label: 'Confirmar Entendimento Dental',
                pontos: 12
            });
        }
        if (campanha.dental?.decisao === 'fechou' && !campanha.dental?.fechouNegocio) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: getNomeEmpresa(emp),
                campanhaId: campanha.campanhaId,
                campanhaNome,
                tipo: 'fechouDental',
                label: 'Confirmar Negócio Dental',
                pontos: 40
            });
        }
        
        // Verificar pendências de saúde
        if (campanha.saude?.emailEnviado && !campanha.saude?.reuniaoConfirmada) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: getNomeEmpresa(emp),
                campanhaId: campanha.campanhaId,
                campanhaNome,
                tipo: 'reuniaoSaude',
                label: 'Confirmar Reunião Saúde',
                pontos: 15
            });
        }
        if (campanha.saude?.reuniaoConfirmada && !campanha.saude?.entendeuConfirmado) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: getNomeEmpresa(emp),
                campanhaId: campanha.campanhaId,
                campanhaNome,
                tipo: 'entendeuSaude',
                label: 'Confirmar Entendimento Saúde',
                pontos: 12
            });
        }
        if (campanha.saude?.decisao === 'fechou' && !campanha.saude?.fechouNegocio) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: getNomeEmpresa(emp),
                campanhaId: campanha.campanhaId,
                campanhaNome,
                tipo: 'fechouSaude',
                label: 'Confirmar Negócio Saúde',
                pontos: 40
            });
        }
    });
    
    // Atualizar badge
    document.getElementById('badgePendentes').textContent = pendentes.length;
    
    if (pendentes.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-check-circle" style="font-size: 2rem;"></i>
                <p class="mt-2">Nenhuma ação pendente${campanhaFiltroId ? ' para esta campanha' : ''}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = pendentes.map(p => `
        <div class="acao-pendente">
            <div>
                <strong>${p.empresaNome}</strong>
                <span class="badge badge-tipo bg-warning text-dark ms-2">${p.label}</span>
                ${!campanhaFiltroId && p.campanhaNome ? `<br><small class="text-muted">📋 ${p.campanhaNome}</small>` : ''}
            </div>
            <button class="btn btn-sm btn-success" onclick="confirmarAcaoAdmin('${p.empresaId}', '${p.tipo}', ${p.pontos}, '${p.campanhaId}')">
                <i class="bi bi-check-lg"></i> Confirmar (+${p.pontos} pts)
            </button>
        </div>
    `).join('');
}

// Confirmar ação do admin
async function confirmarAcaoAdmin(empresaId, tipo, pontos, campanhaIdParam) {
    try {
        const db = firebase.firestore();
        
        // Determinar o ramo (dental ou saude)
        const ramo = tipo.toLowerCase().includes('dental') ? 'dental' : 'saude';
        
        // Determinar qual campo atualizar
        let campoUpdate = '';
        if (tipo.includes('reuniao')) {
            campoUpdate = 'reuniaoConfirmada';
        } else if (tipo.includes('entendeu')) {
            campoUpdate = 'entendeuConfirmado';
        } else if (tipo.includes('fechou')) {
            campoUpdate = 'fechouNegocio';
        }
        
        // Atualizar empresa
        await db.collection('empresas').doc(empresaId).update({
            [`campanha.${ramo}.${campoUpdate}`]: true,
            [`campanha.${ramo}.${campoUpdate}Em`]: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Encontrar participante que fez a ação e dar pontos
        const empresaDoc = await db.collection('empresas').doc(empresaId).get();
        const empresa = empresaDoc.data();
        const participanteId = empresa.campanha?.[ramo]?.emailEnviadoPor;
        
        // Usar o campanhaId passado diretamente (mais eficiente)
        const campanhaIdUsar = campanhaIdParam || empresa.campanha?.campanhaId;
        
        if (participanteId && campanhaIdUsar) {
            const partDoc = await db.collection('campanhas').doc(campanhaIdUsar)
                .collection('participantes').doc(participanteId).get();
            
            if (partDoc.exists) {
                const pontosAtuais = partDoc.data().pontos || 0;
                await partDoc.ref.update({ pontos: pontosAtuais + pontos });
                
                // Registrar ação
                await db.collection('campanhas').doc(campanhaIdUsar)
                    .collection('acoes').add({
                        tipo,
                        pontos,
                        empresaId,
                        empresaNome: getNomeEmpresa(empresa),
                        participanteId,
                        participanteNome: partDoc.data().nome,
                        confirmadoPorAdmin: true,
                        dataRegistro: firebase.firestore.FieldValue.serverTimestamp()
                    });
            }
        }
        
        alert('Ação confirmada com sucesso!');
        await carregarAcoesPendentes();
        await atualizarStats();
        
    } catch (error) {
        console.error('Erro ao confirmar ação:', error);
        alert('Erro ao confirmar');
    }
}

// Carregar empresas com dados de campanha
async function carregarEmpresasCampanha() {
    const db = firebase.firestore();
    const container = document.getElementById('listaEmpresasCampanha');
    const busca = document.getElementById('buscaEmpresa').value.toLowerCase();
    
    // Atualizar cache de campanhas existentes
    await obterCampanhasExistentes();
    
    const empresasSnap = await db.collection('empresas').get();
    
    const empresasComDados = empresasSnap.docs.filter(doc => {
        const emp = doc.data();
        const campanha = emp.campanha || {};
        
        // ⚠️ IMPORTANTE: Verificar se a campanha ainda existe
        if (!campanha.campanhaId || !campanhaExiste(campanha.campanhaId)) {
            return false;
        }
        
        // ⚠️ Filtrar por campanhaId se selecionado
        if (campanhaFiltroId && campanha.campanhaId !== campanhaFiltroId) {
            return false;
        }
        
        // Verificar se tem dados reais da campanha (não apenas campanhaId)
        const temDados = campanha.funcionariosQtd || campanha.socios?.length || campanha.dental || campanha.saude || campanha.pesquisa;
        if (!temDados) return false;
        
        // Filtrar por busca
        if (busca) {
            const nome = getNomeEmpresa(emp).toLowerCase();
            return nome.includes(busca);
        }
        return true;
    }).map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (empresasComDados.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-building" style="font-size: 2rem;"></i>
                <p class="mt-2">Nenhuma empresa com dados${campanhaFiltroId ? ' nesta campanha' : ''}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = empresasComDados.map(emp => {
        const campanha = emp.campanha || {};
        const nomeEmpresa = getNomeEmpresa(emp);
        const campanhaNome = campanhas.find(c => c.id === campanha.campanhaId)?.nome || '';
        
        return `
            <div class="empresa-card ${campanha.dental || campanha.saude ? 'tem-acao' : ''}">
                <div class="d-flex justify-content-between">
                    <div>
                        <strong>${nomeEmpresa}</strong>
                        ${!campanhaFiltroId && campanhaNome ? `<br><small class="text-muted">📋 ${campanhaNome}</small>` : ''}
                        <div class="small text-muted mt-1">
                            ${campanha.funcionariosQtd ? `<span class="badge bg-info me-1">👥 ${campanha.funcionariosQtd} func.</span>` : ''}
                            ${campanha.socios?.length ? `<span class="badge bg-info me-1">👤 ${campanha.socios.length} sócio(s)</span>` : ''}
                            ${campanha.dental?.emailEnviado ? '<span class="badge bg-success me-1">🦷 Dental</span>' : ''}
                            ${campanha.saude?.emailEnviado ? '<span class="badge bg-danger me-1">❤️ Saúde</span>' : ''}
                        </div>
                    </div>
                    <button class="btn btn-sm btn-outline-primary" onclick="abrirDetalheEmpresa('${emp.id}')">
                        <i class="bi bi-eye"></i> Ver
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Abrir detalhe da empresa
async function abrirDetalheEmpresa(empresaId) {
    const db = firebase.firestore();
    const doc = await db.collection('empresas').doc(empresaId).get();
    const emp = doc.data();
    
    document.getElementById('modalEmpresaTitulo').textContent = getNomeEmpresa(emp);
    
    const campanha = emp.campanha || {};
    
    let html = `
        <div class="row">
            <div class="col-md-6">
                <h6 class="text-muted">Informações Coletadas</h6>
                <table class="table table-sm">
                    <tr>
                        <th>Funcionários:</th>
                        <td>${campanha.funcionariosQtd || '-'}</td>
                    </tr>
                    <tr>
                        <th>E-mail Responsável:</th>
                        <td>${campanha.dental?.email || campanha.saude?.email || '-'}</td>
                    </tr>
                </table>
                
                ${campanha.socios?.length ? `
                    <h6 class="text-muted mt-3">Sócios</h6>
                    <ul class="list-group list-group-flush">
                        ${campanha.socios.map(s => `
                            <li class="list-group-item d-flex justify-content-between">
                                <span>${s.nome}</span>
                                <span class="text-muted">${formatarData(s.dataNascimento)}</span>
                            </li>
                        `).join('')}
                    </ul>
                ` : ''}
            </div>
            
            <div class="col-md-6">
                <h6 class="text-muted">Status Dental</h6>
                <ul class="list-group list-group-flush mb-3">
                    <li class="list-group-item">${campanha.dental?.emailEnviado ? '✅' : '⬜'} E-mail enviado ${campanha.dental?.email ? `(${campanha.dental.email})` : ''}</li>
                    <li class="list-group-item">${campanha.dental?.reuniaoConfirmada ? '✅' : '⬜'} Reunião confirmada</li>
                    <li class="list-group-item">${campanha.dental?.entendeuConfirmado ? '✅' : '⬜'} Entendeu benefícios</li>
                    <li class="list-group-item">${campanha.dental?.decisaoRegistrada ? '✅' : '⬜'} Decisão: ${campanha.dental?.decisao || '-'}</li>
                    ${campanha.dental?.justificativa ? `<li class="list-group-item text-muted small">"${campanha.dental.justificativa}"</li>` : ''}
                    <li class="list-group-item">${campanha.dental?.fechouNegocio ? '✅' : '⬜'} Negócio fechado</li>
                </ul>
                
                <h6 class="text-muted">Status Saúde</h6>
                <ul class="list-group list-group-flush">
                    <li class="list-group-item">${campanha.saude?.emailEnviado ? '✅' : '⬜'} E-mail enviado ${campanha.saude?.email ? `(${campanha.saude.email})` : ''}</li>
                    <li class="list-group-item">${campanha.saude?.reuniaoConfirmada ? '✅' : '⬜'} Reunião confirmada</li>
                    <li class="list-group-item">${campanha.saude?.entendeuConfirmado ? '✅' : '⬜'} Entendeu benefícios</li>
                    <li class="list-group-item">${campanha.saude?.decisaoRegistrada ? '✅' : '⬜'} Decisão: ${campanha.saude?.decisao || '-'}</li>
                    ${campanha.saude?.justificativa ? `<li class="list-group-item text-muted small">"${campanha.saude.justificativa}"</li>` : ''}
                    <li class="list-group-item">${campanha.saude?.fechouNegocio ? '✅' : '⬜'} Negócio fechado</li>
                </ul>
            </div>
        </div>
    `;
    
    document.getElementById('detalheEmpresaConteudo').innerHTML = html;
    
    new bootstrap.Modal(document.getElementById('modalDetalheEmpresa')).show();
}

// Exportar ranking
async function exportarRanking() {
    const db = firebase.firestore();
    const dados = [];
    
    for (const campanha of campanhas) {
        const participantesSnap = await db.collection('campanhas').doc(campanha.id)
            .collection('participantes')
            .orderBy('pontos', 'desc')
            .get();
        
        participantesSnap.docs.forEach((doc, idx) => {
            const p = doc.data();
            dados.push({
                Campanha: campanha.nome,
                Posicao: idx + 1,
                Nome: p.nome,
                Agencia: p.agenciaNome,
                Pontos: p.pontos || 0,
                Email: p.email,
                Telefone: p.telefone
            });
        });
    }
    
    exportarExcel(dados, 'ranking-campanhas');
}

// Exportar empresas
async function exportarEmpresas() {
    const db = firebase.firestore();
    const empresasSnap = await db.collection('empresas').get();
    
    const dados = empresasSnap.docs.filter(doc => {
        const emp = doc.data();
        const campanha = emp.campanha || {};
        return campanha.funcionariosQtd || campanha.socios?.length || campanha.dental || campanha.saude;
    }).map(doc => {
        const emp = doc.data();
        const campanha = emp.campanha || {};
        
        return {
            Empresa: getNomeEmpresa(emp),
            CNPJ: emp.cnpj,
            Funcionarios: campanha.funcionariosQtd || '',
            Socios: campanha.socios?.map(s => `${s.nome} (${s.dataNascimento})`).join('; ') || '',
            EmailDental: campanha.dental?.email || '',
            DentalDecisao: campanha.dental?.decisao || '',
            DentalJustificativa: campanha.dental?.justificativa || '',
            DentalFechou: campanha.dental?.fechouNegocio ? 'Sim' : 'Não',
            EmailSaude: campanha.saude?.email || '',
            SaudeDecisao: campanha.saude?.decisao || '',
            SaudeJustificativa: campanha.saude?.justificativa || '',
            SaudeFechou: campanha.saude?.fechouNegocio ? 'Sim' : 'Não'
        };
    });
    
    exportarExcel(dados, 'empresas-campanha');
}

// Exportar ações
async function exportarAcoes() {
    const db = firebase.firestore();
    const dados = [];
    
    for (const campanha of campanhas) {
        const acoesSnap = await db.collection('campanhas').doc(campanha.id)
            .collection('acoes')
            .orderBy('dataRegistro', 'desc')
            .get();
        
        acoesSnap.docs.forEach(doc => {
            const a = doc.data();
            dados.push({
                Campanha: campanha.nome,
                Participante: a.participanteNome,
                Empresa: a.empresaNome,
                Tipo: a.tipo,
                Pontos: a.pontos,
                Data: a.dataRegistro?.toDate().toLocaleDateString('pt-BR') || ''
            });
        });
    }
    
    exportarExcel(dados, 'acoes-campanhas');
}

// Função para exportar Excel
function exportarExcel(dados, nomeArquivo) {
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    XLSX.writeFile(wb, `${nomeArquivo}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Confirmar exclusão de campanha
async function confirmarExcluirCampanha() {
    if (!confirm('ATENÇÃO: Isso irá excluir a campanha e todos os dados de participantes. Continuar?')) return;
    
    try {
        const db = firebase.firestore();
        
        // Excluir participantes
        const participantesSnap = await db.collection('campanhas').doc(campanhaAtual.id)
            .collection('participantes').get();
        for (const doc of participantesSnap.docs) {
            await doc.ref.delete();
        }
        
        // Excluir ações
        const acoesSnap = await db.collection('campanhas').doc(campanhaAtual.id)
            .collection('acoes').get();
        for (const doc of acoesSnap.docs) {
            await doc.ref.delete();
        }
        
        // Excluir campanha
        await db.collection('campanhas').doc(campanhaAtual.id).delete();
        
        bootstrap.Modal.getInstance(document.getElementById('modalGerenciarCampanha')).hide();
        
        alert('Campanha excluída');
        await carregarCampanhas();
        
    } catch (error) {
        console.error('Erro ao excluir:', error);
        alert('Erro ao excluir campanha');
    }
}

// Utilitários
function formatarData(data) {
    if (!data) return '';
    const d = new Date(data + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
}

// =====================================================
// PESQUISAS DE COLABORADORES
// =====================================================

let pesquisaAtual = null;

// Carregar pesquisas
async function carregarPesquisas() {
    const db = firebase.firestore();
    const container = document.getElementById('listaPesquisas');
    
    try {
        // Atualizar cache de campanhas existentes
        await obterCampanhasExistentes();
        
        const pesquisasSnap = await db.collection('pesquisas_colaboradores')
            .orderBy('dataCriacao', 'desc')
            .get();
        
        // ⚠️ FILTRAR: Apenas pesquisas de campanhas que EXISTEM
        const pesquisasFiltradas = pesquisasSnap.docs.filter(doc => {
            const p = doc.data();
            
            // Se não tem campanhaId, ignorar (dado legado)
            if (!p.campanhaId) return false;
            
            // Verificar se a campanha ainda existe
            if (!campanhaExiste(p.campanhaId)) return false;
            
            // Se há filtro de campanha selecionado, aplicar
            if (campanhaFiltroId && p.campanhaId !== campanhaFiltroId) return false;
            
            return true;
        });
        
        if (pesquisasFiltradas.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-clipboard-data" style="font-size: 2rem;"></i>
                    <p class="mt-2">Nenhuma pesquisa criada ainda${campanhaFiltroId ? ' para esta campanha' : ''}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = pesquisasFiltradas.map(doc => {
            const p = doc.data();
            const progresso = Math.min((p.totalRespostas || 0) / 10 * 100, 100);
            const corProgresso = progresso >= 100 ? 'success' : progresso >= 50 ? 'warning' : 'info';
            const campanhaNome = campanhas.find(c => c.id === p.campanhaId)?.nome || '';
            
            return `
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <h5 class="mb-1">${p.empresaNome || 'Empresa'}</h5>
                                <p class="text-muted mb-2 small">
                                    <i class="bi bi-people"></i> ${p.funcionariosQtd || 0} funcionários
                                    • Enviada por: ${p.participanteNome || '-'}
                                    ${!campanhaFiltroId && campanhaNome ? `<br>📋 ${campanhaNome}` : ''}
                                </p>
                            </div>
                            <div class="text-end">
                                <span class="badge bg-${corProgresso}">${p.totalRespostas || 0} respostas</span>
                            </div>
                        </div>
                        
                        <div class="progress mb-2" style="height: 8px;">
                            <div class="progress-bar bg-${corProgresso}" style="width: ${progresso}%"></div>
                        </div>
                        <small class="text-muted">${Math.round(progresso)}% da meta (10 respostas)</small>
                        
                        <div class="mt-3">
                            <button class="btn btn-sm btn-primary" onclick="verDetalhesPesquisa('${doc.id}')">
                                <i class="bi bi-eye"></i> Ver Respostas
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="copiarLinkPesquisa('${doc.id}', '${p.empresaId}')">
                                <i class="bi bi-link-45deg"></i> Copiar Link
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erro ao carregar pesquisas:', error);
        container.innerHTML = '<p class="text-danger">Erro ao carregar pesquisas</p>';
    }
}

// Ver detalhes da pesquisa
async function verDetalhesPesquisa(pesquisaId) {
    const db = firebase.firestore();
    
    try {
        // Carregar pesquisa
        const pesquisaDoc = await db.collection('pesquisas_colaboradores').doc(pesquisaId).get();
        if (!pesquisaDoc.exists) {
            alert('Pesquisa não encontrada');
            return;
        }
        
        pesquisaAtual = { id: pesquisaDoc.id, ...pesquisaDoc.data() };
        
        // Carregar respostas
        const respostasSnap = await db.collection('pesquisas_colaboradores').doc(pesquisaId)
            .collection('respostas')
            .orderBy('dataResposta', 'desc')
            .get();
        
        pesquisaAtual.respostas = respostasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Atualizar modal
        document.getElementById('modalPesquisaTitulo').innerHTML = `
            <i class="bi bi-clipboard-data"></i> ${pesquisaAtual.empresaNome} - ${pesquisaAtual.respostas.length} respostas
        `;
        
        // Calcular estatísticas
        const stats = calcularEstatisticasPesquisa(pesquisaAtual.respostas);
        
        document.getElementById('detalhePesquisaConteudo').innerHTML = `
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="card bg-light text-center p-3">
                        <h3 class="mb-0 text-primary">${pesquisaAtual.respostas.length}</h3>
                        <small>Respostas</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-light text-center p-3">
                        <h3 class="mb-0 text-success">${stats.dentalSim}</h3>
                        <small>Interessados Dental</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-light text-center p-3">
                        <h3 class="mb-0 text-danger">${stats.saudeSim}</h3>
                        <small>Interessados Saúde</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-light text-center p-3">
                        <h3 class="mb-0 text-info">${stats.mediaIdade.toFixed(0)}</h3>
                        <small>Idade Média</small>
                    </div>
                </div>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header bg-success text-white">
                            <i class="bi bi-emoji-smile"></i> Plano Dental
                        </div>
                        <div class="card-body">
                            <div class="d-flex justify-content-around text-center">
                                <div>
                                    <h4 class="text-success">${stats.dentalSim}</h4>
                                    <small>Contratariam</small>
                                </div>
                                <div>
                                    <h4 class="text-danger">${stats.dentalNao}</h4>
                                    <small>Não contratariam</small>
                                </div>
                            </div>
                            <hr>
                            <p class="mb-1"><strong>Média de dependentes:</strong> ${stats.mediaDependentesDental.toFixed(1)}</p>
                            <p class="mb-0"><strong>Potencial mensal:</strong> R$ ${stats.potencialDental.toFixed(2).replace('.', ',')}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header bg-danger text-white">
                            <i class="bi bi-heart-pulse"></i> Plano Saúde
                        </div>
                        <div class="card-body">
                            <div class="d-flex justify-content-around text-center">
                                <div>
                                    <h4 class="text-success">${stats.saudeSim}</h4>
                                    <small>Contratariam</small>
                                </div>
                                <div>
                                    <h4 class="text-danger">${stats.saudeNao}</h4>
                                    <small>Não contratariam</small>
                                </div>
                            </div>
                            <hr>
                            <p class="mb-1"><strong>Média de dependentes:</strong> ${stats.mediaDependentesSaude.toFixed(1)}</p>
                            <p class="mb-0"><strong>Potencial mensal:</strong> R$ ${stats.potencialSaude.toFixed(2).replace('.', ',')}</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <h6 class="mb-3"><i class="bi bi-list-ul"></i> Respostas Individuais</h6>
            <div class="table-responsive">
                <table class="table table-sm table-striped">
                    <thead class="table-dark">
                        <tr>
                            <th>Idade</th>
                            <th>Dental?</th>
                            <th>Dep. Dental</th>
                            <th>Saúde?</th>
                            <th>Dep. Saúde</th>
                            <th>Data</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pesquisaAtual.respostas.map(r => `
                            <tr>
                                <td>${r.idade || '-'}</td>
                                <td>${r.dentalInteresse === 'sim' ? '✅' : '❌'}</td>
                                <td>${r.dentalDependentes || 0}</td>
                                <td>${r.saudeInteresse === 'sim' ? '✅' : '❌'}</td>
                                <td>${r.saudeDependentes?.length || 0}</td>
                                <td>${r.dataResposta?.toDate().toLocaleDateString('pt-BR') || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        new bootstrap.Modal(document.getElementById('modalDetalhePesquisa')).show();
        
    } catch (error) {
        console.error('Erro ao carregar pesquisa:', error);
        alert('Erro ao carregar detalhes');
    }
}

// Calcular estatísticas da pesquisa
function calcularEstatisticasPesquisa(respostas) {
    const stats = {
        dentalSim: 0,
        dentalNao: 0,
        saudeSim: 0,
        saudeNao: 0,
        mediaIdade: 0,
        mediaDependentesDental: 0,
        mediaDependentesSaude: 0,
        potencialDental: 0,
        potencialSaude: 0
    };
    
    if (respostas.length === 0) return stats;
    
    let totalIdade = 0;
    let totalDepDental = 0;
    let totalDepSaude = 0;
    
    const VALOR_DENTAL = 18.15;
    
    respostas.forEach(r => {
        totalIdade += r.idade || 0;
        
        // Dental
        if (r.dentalInteresse === 'sim') {
            stats.dentalSim++;
            stats.potencialDental += VALOR_DENTAL; // Titular
            const deps = r.dentalDependentes || 0;
            totalDepDental += deps;
            stats.potencialDental += deps * VALOR_DENTAL; // Dependentes
        } else {
            stats.dentalNao++;
        }
        
        // Saúde
        if (r.saudeInteresse === 'sim') {
            stats.saudeSim++;
            stats.potencialSaude += r.saudeValorTitular || 0;
            
            const depsSaude = r.saudeDependentes || [];
            totalDepSaude += depsSaude.length;
            depsSaude.forEach(d => {
                stats.potencialSaude += d.valor || 0;
            });
        } else {
            stats.saudeNao++;
        }
    });
    
    stats.mediaIdade = totalIdade / respostas.length;
    stats.mediaDependentesDental = stats.dentalSim > 0 ? totalDepDental / stats.dentalSim : 0;
    stats.mediaDependentesSaude = stats.saudeSim > 0 ? totalDepSaude / stats.saudeSim : 0;
    
    return stats;
}

// Copiar link da pesquisa
function copiarLinkPesquisa(pesquisaId, empresaId) {
    const baseUrl = window.location.origin + window.location.pathname.replace('campanhas-admin.html', 'pesquisa-colaboradores.html');
    const link = `${baseUrl}?p=${pesquisaId}&e=${empresaId}`;
    
    navigator.clipboard.writeText(link).then(() => {
        alert('Link copiado para a área de transferência!');
    }).catch(() => {
        prompt('Copie o link:', link);
    });
}

// Exportar respostas da pesquisa atual
function exportarRespostasPesquisa() {
    if (!pesquisaAtual || !pesquisaAtual.respostas) {
        alert('Nenhuma pesquisa selecionada');
        return;
    }
    
    const dados = pesquisaAtual.respostas.map(r => ({
        Idade: r.idade,
        'Dental - Interesse': r.dentalInteresse === 'sim' ? 'Sim' : 'Não',
        'Dental - Dependentes': r.dentalDependentes || 0,
        'Saúde - Interesse': r.saudeInteresse === 'sim' ? 'Sim' : 'Não',
        'Saúde - Valor Titular': r.saudeValorTitular || 0,
        'Saúde - Qtd Dependentes': r.saudeDependentes?.length || 0,
        'Saúde - Interesse Dependentes': r.saudeDepInteresse || '-',
        'Data Resposta': r.dataResposta?.toDate().toLocaleDateString('pt-BR') || ''
    }));
    
    exportarExcel(dados, `pesquisa-${pesquisaAtual.empresaNome || 'empresa'}`);
}

// Exportar todas as pesquisas
async function exportarPesquisas() {
    const db = firebase.firestore();
    const dados = [];
    
    try {
        const pesquisasSnap = await db.collection('pesquisas_colaboradores').get();
        
        for (const pesquisaDoc of pesquisasSnap.docs) {
            const p = pesquisaDoc.data();
            
            // Carregar respostas
            const respostasSnap = await db.collection('pesquisas_colaboradores').doc(pesquisaDoc.id)
                .collection('respostas').get();
            
            const stats = calcularEstatisticasPesquisa(respostasSnap.docs.map(d => d.data()));
            
            dados.push({
                Empresa: p.empresaNome,
                CNPJ: p.empresaCnpj,
                Funcionarios: p.funcionariosQtd,
                'Total Respostas': p.totalRespostas || 0,
                'Interessados Dental': stats.dentalSim,
                'Não Interessados Dental': stats.dentalNao,
                'Potencial Dental (R$)': stats.potencialDental.toFixed(2),
                'Interessados Saúde': stats.saudeSim,
                'Não Interessados Saúde': stats.saudeNao,
                'Potencial Saúde (R$)': stats.potencialSaude.toFixed(2),
                'Participante': p.participanteNome,
                'Data Criação': p.dataCriacao?.toDate().toLocaleDateString('pt-BR') || ''
            });
        }
        
        exportarExcel(dados, 'relatorio-pesquisas');
        
    } catch (error) {
        console.error('Erro ao exportar:', error);
        alert('Erro ao exportar pesquisas');
    }
}

// =====================================================
// CHECKLISTS DE ENTENDIMENTO
// =====================================================

let checklistAtual = null;

// Carregar checklists
async function carregarChecklists() {
    const db = firebase.firestore();
    const container = document.getElementById('listaChecklists');
    
    try {
        // Atualizar cache de campanhas existentes
        await obterCampanhasExistentes();
        
        const checklistsSnap = await db.collection('checklists_entendimento')
            .orderBy('dataCriacao', 'desc')
            .get();
        
        // ⚠️ FILTRAR: Apenas checklists de campanhas que EXISTEM
        const checklistsFiltrados = checklistsSnap.docs.filter(doc => {
            const c = doc.data();
            
            // Se não tem campanhaId, ignorar (dado legado)
            if (!c.campanhaId) return false;
            
            // Verificar se a campanha ainda existe
            if (!campanhaExiste(c.campanhaId)) return false;
            
            // Se há filtro de campanha selecionado, aplicar
            if (campanhaFiltroId && c.campanhaId !== campanhaFiltroId) return false;
            
            return true;
        });
        
        if (checklistsFiltrados.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-clipboard-check" style="font-size: 2rem;"></i>
                    <p class="mt-2">Nenhum checklist criado ainda${campanhaFiltroId ? ' para esta campanha' : ''}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = checklistsFiltrados.map(doc => {
            const c = doc.data();
            const stats = c.estatisticas || {};
            const saudeStats = stats.saude || {};
            const dentalStats = stats.dental || {};
            const campanhaNome = campanhas.find(camp => camp.id === c.campanhaId)?.nome || '';
            
            const corStatus = c.respondido ? 'success' : 'warning';
            const textStatus = c.respondido ? 'Respondido' : 'Aguardando';
            
            return `
                <div class="card mb-3 ${c.respondido ? 'border-success' : 'border-warning'}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <h5 class="mb-1">${c.empresaNome || 'Empresa'}</h5>
                                <p class="text-muted mb-2 small">
                                    <i class="bi bi-people"></i> ${c.funcionariosQtd || 0} funcionários
                                    • <i class="bi bi-person"></i> ${c.sociosQtd || 0} sócios
                                    • Enviado por: ${c.participanteNome || '-'}
                                    ${!campanhaFiltroId && campanhaNome ? `<br>📋 ${campanhaNome}` : ''}
                                </p>
                            </div>
                            <div class="text-end">
                                <span class="badge bg-${corStatus}">${textStatus}</span>
                            </div>
                        </div>
                        
                        ${c.respondido ? `
                            <div class="row mt-2">
                                <div class="col-6">
                                    <div class="small">
                                        <strong class="text-danger"><i class="bi bi-heart-pulse"></i> Saúde:</strong>
                                        ${saudeStats.porcentagemSim || 0}% entendeu
                                        <br><span class="text-muted">Prob: ${saudeStats.probabilidade ?? '-'}/10</span>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="small">
                                        <strong class="text-primary"><i class="bi bi-emoji-smile"></i> Dental:</strong>
                                        ${dentalStats.porcentagemSim || 0}% entendeu
                                        <br><span class="text-muted">Prob: ${dentalStats.probabilidade ?? '-'}/10</span>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="mt-3">
                            <button class="btn btn-sm btn-primary" onclick="verDetalhesChecklist('${doc.id}')" ${!c.respondido ? 'disabled' : ''}>
                                <i class="bi bi-eye"></i> Ver Respostas
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="copiarLinkChecklist('${doc.id}', '${c.empresaId}', '${c.campanhaId}', '${c.participanteId}')">
                                <i class="bi bi-link-45deg"></i> Copiar Link
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erro ao carregar checklists:', error);
        container.innerHTML = '<p class="text-danger">Erro ao carregar checklists</p>';
    }
}

// Ver detalhes do checklist
async function verDetalhesChecklist(checklistId) {
    const db = firebase.firestore();
    
    try {
        const checklistDoc = await db.collection('checklists_entendimento').doc(checklistId).get();
        if (!checklistDoc.exists) {
            alert('Checklist não encontrado');
            return;
        }
        
        checklistAtual = { id: checklistDoc.id, ...checklistDoc.data() };
        
        // Atualizar modal
        document.getElementById('modalChecklistTitulo').innerHTML = `
            <i class="bi bi-clipboard-check"></i> ${checklistAtual.empresaNome} - Checklist de Entendimento
        `;
        
        const respostas = checklistAtual.respostas || {};
        const stats = checklistAtual.estatisticas || {};
        const saudeStats = stats.saude || {};
        const dentalStats = stats.dental || {};
        const pesquisaStats = stats.pesquisa || {};
        
        // Perguntas de Saúde
        const perguntasSaude = [
            { id: 'saude_hotelaria', texto: 'Internação hotelaria (Sírio, Einstein)' },
            { id: 'saude_exterior', texto: 'Cobertura exterior + seguro viagem' },
            { id: 'saude_reembolso_fora_rede', texto: 'Reembolso fora da rede' },
            { id: 'saude_reembolso_10x', texto: 'Reembolso até 10x tabela ANS' },
            { id: 'saude_cobertura_nacional', texto: 'Cobertura Nacional' },
            { id: 'saude_dependentes', texto: 'Inclusão dependentes' },
            { id: 'saude_minimo_vidas', texto: 'Mínimo 3 pessoas, 1 titular' },
            { id: 'saude_colaborador_paga', texto: 'Colaborador paga 100%' },
            { id: 'saude_deducao_dre', texto: 'Dedutível na DRE' },
            { id: 'saude_pesquisa_colaboradores', texto: 'Já fez pesquisa colaboradores' }
        ];
        
        // Perguntas de Dental
        const perguntasDental = [
            { id: 'dental_cobertura_nacional', texto: 'Cobertura Nacional' },
            { id: 'dental_custo_20', texto: 'Custo < R$ 20/mês' },
            { id: 'dental_reter_talentos', texto: 'Ajuda reter talentos' },
            { id: 'dental_colaborador_100', texto: 'Colaborador paga 100%' },
            { id: 'dental_deducao_dre', texto: 'Dedutível na DRE' },
            { id: 'dental_nao_obrigatorio', texto: 'Não precisa todos no plano' },
            { id: 'dental_custo_anual', texto: 'Custo anual < limpeza particular' },
            { id: 'dental_coberturas', texto: 'Entendeu coberturas' },
            { id: 'dental_pesquisa_colaboradores', texto: 'Já fez pesquisa colaboradores' }
        ];
        
        // Perguntas de Pesquisa
        const perguntasPesquisa = [
            { id: 'pesquisa_recebeu_link', texto: 'Recebeu pesquisa colaboradores?' },
            { id: 'pesquisa_compartilhou', texto: 'Compartilhou link da pesquisa?' }
        ];
        
        // Função para renderizar resposta
        const renderResposta = (pergunta) => {
            const resposta = respostas[pergunta.id];
            if (!resposta) return '<span class="text-muted">-</span>';
            
            if (resposta.tipo === 'escala') {
                return `<span class="badge bg-info">${resposta.valor}/10</span>`;
            }
            
            return resposta.valor 
                ? '<span class="text-success fs-5">✓</span>'
                : '<span class="text-danger fs-5">✗</span>';
        };
        
        document.getElementById('detalheChecklistConteudo').innerHTML = `
            <!-- Resumo Estatísticas -->
            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card bg-danger bg-opacity-10">
                        <div class="card-body text-center">
                            <h3 class="text-danger">${saudeStats.porcentagemSim || 0}%</h3>
                            <small class="text-muted">Entendimento Saúde</small>
                            <div class="mt-2">
                                <span class="badge bg-success">${saudeStats.sim || 0} ✓</span>
                                <span class="badge bg-danger">${saudeStats.nao || 0} ✗</span>
                            </div>
                            <div class="mt-1">
                                <small>Probabilidade: <strong>${saudeStats.probabilidade ?? '-'}/10</strong></small>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card bg-primary bg-opacity-10">
                        <div class="card-body text-center">
                            <h3 class="text-primary">${dentalStats.porcentagemSim || 0}%</h3>
                            <small class="text-muted">Entendimento Dental</small>
                            <div class="mt-2">
                                <span class="badge bg-success">${dentalStats.sim || 0} ✓</span>
                                <span class="badge bg-danger">${dentalStats.nao || 0} ✗</span>
                            </div>
                            <div class="mt-1">
                                <small>Probabilidade: <strong>${dentalStats.probabilidade ?? '-'}/10</strong></small>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card bg-success bg-opacity-10">
                        <div class="card-body text-center">
                            <h3 class="text-success">${pesquisaStats.sim || 0}/${pesquisaStats.total || 2}</h3>
                            <small class="text-muted">Confirmações Pesquisa</small>
                            <div class="mt-2">
                                ${respostas.pesquisa_recebeu_link?.valor ? '<span class="badge bg-success">Recebeu ✓</span>' : '<span class="badge bg-secondary">Não recebeu</span>'}
                            </div>
                            <div class="mt-1">
                                ${respostas.pesquisa_compartilhou?.valor ? '<span class="badge bg-success">Compartilhou ✓</span>' : '<span class="badge bg-secondary">Não compartilhou</span>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Detalhes Saúde -->
            <div class="card mb-3">
                <div class="card-header bg-danger bg-opacity-10">
                    <h6 class="mb-0"><i class="bi bi-heart-pulse text-danger"></i> Plano de Saúde</h6>
                </div>
                <div class="card-body">
                    <table class="table table-sm mb-0">
                        <tbody>
                            ${perguntasSaude.map(p => `
                                <tr>
                                    <td style="width: 40px;">${renderResposta(p)}</td>
                                    <td>${p.texto}</td>
                                </tr>
                            `).join('')}
                            <tr class="table-warning">
                                <td><span class="badge bg-info">${respostas.saude_probabilidade?.valor ?? '-'}/10</span></td>
                                <td><strong>Probabilidade de contratação</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Detalhes Dental -->
            <div class="card mb-3">
                <div class="card-header bg-primary bg-opacity-10">
                    <h6 class="mb-0"><i class="bi bi-emoji-smile text-primary"></i> Plano Dental</h6>
                </div>
                <div class="card-body">
                    <table class="table table-sm mb-0">
                        <tbody>
                            ${perguntasDental.map(p => `
                                <tr>
                                    <td style="width: 40px;">${renderResposta(p)}</td>
                                    <td>${p.texto}</td>
                                </tr>
                            `).join('')}
                            <tr class="table-warning">
                                <td><span class="badge bg-info">${respostas.dental_probabilidade?.valor ?? '-'}/10</span></td>
                                <td><strong>Probabilidade de disponibilizar</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Detalhes Pesquisa -->
            <div class="card mb-3">
                <div class="card-header bg-success bg-opacity-10">
                    <h6 class="mb-0"><i class="bi bi-clipboard-check text-success"></i> Pesquisa de Colaboradores</h6>
                </div>
                <div class="card-body">
                    <table class="table table-sm mb-0">
                        <tbody>
                            ${perguntasPesquisa.map(p => `
                                <tr>
                                    <td style="width: 40px;">${renderResposta(p)}</td>
                                    <td>${p.texto}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Informações Adicionais -->
            <div class="card bg-light">
                <div class="card-body small">
                    <div class="row">
                        <div class="col-md-6">
                            <strong>Empresa:</strong> ${checklistAtual.empresaNome}<br>
                            <strong>CNPJ:</strong> ${checklistAtual.empresaCnpj || '-'}<br>
                            <strong>Funcionários:</strong> ${checklistAtual.funcionariosQtd || '-'}
                        </div>
                        <div class="col-md-6">
                            <strong>Assistente:</strong> ${checklistAtual.participanteNome || '-'}<br>
                            <strong>Agência:</strong> ${checklistAtual.agenciaNome || '-'}<br>
                            <strong>Respondido em:</strong> ${checklistAtual.respondidoEm?.toDate().toLocaleDateString('pt-BR') || '-'}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        new bootstrap.Modal(document.getElementById('modalDetalheChecklist')).show();
        
    } catch (error) {
        console.error('Erro ao carregar checklist:', error);
        alert('Erro ao carregar detalhes');
    }
}

// Copiar link do checklist
function copiarLinkChecklist(checklistId, empresaId, campanhaId, participanteId) {
    const baseUrl = window.location.origin + window.location.pathname.replace('campanhas-admin.html', 'checklist-empresa.html');
    const link = `${baseUrl}?ch=${checklistId}&e=${empresaId}&c=${campanhaId}&p=${participanteId}`;
    
    navigator.clipboard.writeText(link).then(() => {
        alert('Link copiado para a área de transferência!');
    }).catch(() => {
        prompt('Copie o link:', link);
    });
}

// Exportar checklist atual
function exportarChecklistAtual() {
    if (!checklistAtual || !checklistAtual.respostas) {
        alert('Nenhum checklist selecionado');
        return;
    }
    
    const respostas = checklistAtual.respostas;
    
    const dados = [{
        'Empresa': checklistAtual.empresaNome,
        'CNPJ': checklistAtual.empresaCnpj || '',
        'Funcionários': checklistAtual.funcionariosQtd || '',
        'Sócios': checklistAtual.sociosQtd || '',
        'Assistente': checklistAtual.participanteNome || '',
        'Agência': checklistAtual.agenciaNome || '',
        
        // Saúde
        'Saúde - Hotelaria': respostas.saude_hotelaria?.valor ? 'Sim' : 'Não',
        'Saúde - Exterior': respostas.saude_exterior?.valor ? 'Sim' : 'Não',
        'Saúde - Reembolso Fora Rede': respostas.saude_reembolso_fora_rede?.valor ? 'Sim' : 'Não',
        'Saúde - Reembolso 10x': respostas.saude_reembolso_10x?.valor ? 'Sim' : 'Não',
        'Saúde - Cobertura Nacional': respostas.saude_cobertura_nacional?.valor ? 'Sim' : 'Não',
        'Saúde - Dependentes': respostas.saude_dependentes?.valor ? 'Sim' : 'Não',
        'Saúde - Mínimo Vidas': respostas.saude_minimo_vidas?.valor ? 'Sim' : 'Não',
        'Saúde - Colaborador Paga': respostas.saude_colaborador_paga?.valor ? 'Sim' : 'Não',
        'Saúde - Dedução DRE': respostas.saude_deducao_dre?.valor ? 'Sim' : 'Não',
        'Saúde - Pesquisa': respostas.saude_pesquisa_colaboradores?.valor ? 'Sim' : 'Não',
        'Saúde - Probabilidade': respostas.saude_probabilidade?.valor ?? '',
        
        // Dental
        'Dental - Cobertura Nacional': respostas.dental_cobertura_nacional?.valor ? 'Sim' : 'Não',
        'Dental - Custo R$20': respostas.dental_custo_20?.valor ? 'Sim' : 'Não',
        'Dental - Reter Talentos': respostas.dental_reter_talentos?.valor ? 'Sim' : 'Não',
        'Dental - Colaborador 100%': respostas.dental_colaborador_100?.valor ? 'Sim' : 'Não',
        'Dental - Dedução DRE': respostas.dental_deducao_dre?.valor ? 'Sim' : 'Não',
        'Dental - Não Obrigatório': respostas.dental_nao_obrigatorio?.valor ? 'Sim' : 'Não',
        'Dental - Custo Anual': respostas.dental_custo_anual?.valor ? 'Sim' : 'Não',
        'Dental - Coberturas': respostas.dental_coberturas?.valor ? 'Sim' : 'Não',
        'Dental - Pesquisa': respostas.dental_pesquisa_colaboradores?.valor ? 'Sim' : 'Não',
        'Dental - Probabilidade': respostas.dental_probabilidade?.valor ?? '',
        
        // Pesquisa
        'Recebeu Pesquisa': respostas.pesquisa_recebeu_link?.valor ? 'Sim' : 'Não',
        'Compartilhou Link': respostas.pesquisa_compartilhou?.valor ? 'Sim' : 'Não',
        
        'Data Resposta': checklistAtual.respondidoEm?.toDate().toLocaleDateString('pt-BR') || ''
    }];
    
    exportarExcel(dados, `checklist-${checklistAtual.empresaNome || 'empresa'}`);
}

// Exportar todos os checklists
async function exportarTodosChecklists() {
    const db = firebase.firestore();
    const dados = [];
    
    try {
        const checklistsSnap = await db.collection('checklists_entendimento')
            .where('respondido', '==', true)
            .get();
        
        checklistsSnap.docs.forEach(doc => {
            const c = doc.data();
            const respostas = c.respostas || {};
            const stats = c.estatisticas || {};
            
            dados.push({
                'Empresa': c.empresaNome,
                'CNPJ': c.empresaCnpj || '',
                'Funcionários': c.funcionariosQtd || '',
                'Sócios': c.sociosQtd || '',
                'Assistente': c.participanteNome || '',
                'Agência': c.agenciaNome || '',
                'Entendimento Saúde (%)': stats.saude?.porcentagemSim || 0,
                'Probabilidade Saúde': stats.saude?.probabilidade ?? '',
                'Entendimento Dental (%)': stats.dental?.porcentagemSim || 0,
                'Probabilidade Dental': stats.dental?.probabilidade ?? '',
                'Recebeu Pesquisa': respostas.pesquisa_recebeu_link?.valor ? 'Sim' : 'Não',
                'Compartilhou Link': respostas.pesquisa_compartilhou?.valor ? 'Sim' : 'Não',
                'Data Resposta': c.respondidoEm?.toDate().toLocaleDateString('pt-BR') || ''
            });
        });
        
        exportarExcel(dados, 'relatorio-checklists');
        
    } catch (error) {
        console.error('Erro ao exportar:', error);
        alert('Erro ao exportar checklists');
    }
}

// =====================================================
// ENCERRAR CAMPANHA E ZERAR DADOS
// =====================================================

// Salvar status da campanha
async function salvarStatusCampanha() {
    if (!campanhaAtual) return;
    
    const novoStatus = document.getElementById('selectStatusCampanha').value;
    
    try {
        const db = firebase.firestore();
        
        await db.collection('campanhas').doc(campanhaAtual.id).update({
            status: novoStatus,
            statusAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        campanhaAtual.status = novoStatus;
        
        alert('Status atualizado!');
        await carregarCampanhas();
        
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        alert('Erro ao atualizar');
    }
}

// Encerrar campanha com opção de zerar dados
async function encerrarCampanhaComReset() {
    if (!campanhaAtual) return;
    
    const confirmar = confirm(
        `⚠️ ATENÇÃO!\n\n` +
        `Você está prestes a ENCERRAR a campanha "${campanhaAtual.nome}" e ZERAR todos os dados das empresas vinculadas.\n\n` +
        `Isso irá:\n` +
        `• Mudar o status da campanha para "Encerrada"\n` +
        `• Limpar todos os dados de funcionários, sócios, dental, saúde das empresas\n` +
        `• Os dados de pesquisas e checklists serão mantidos para histórico\n\n` +
        `Esta ação NÃO pode ser desfeita!\n\n` +
        `Deseja continuar?`
    );
    
    if (!confirmar) return;
    
    // Segunda confirmação
    const confirmar2 = prompt(
        `Para confirmar, digite o nome da campanha:\n"${campanhaAtual.nome}"`
    );
    
    if (confirmar2 !== campanhaAtual.nome) {
        alert('Nome incorreto. Operação cancelada.');
        return;
    }
    
    try {
        const db = firebase.firestore();
        const batch = db.batch();
        
        // 1. Atualizar status da campanha
        const campanhaRef = db.collection('campanhas').doc(campanhaAtual.id);
        batch.update(campanhaRef, {
            status: 'encerrada',
            encerradaEm: firebase.firestore.FieldValue.serverTimestamp(),
            dadosZerados: true
        });
        
        // 2. Buscar todas as empresas com dados desta campanha
        const empresasSnap = await db.collection('empresas')
            .where('campanha.campanhaId', '==', campanhaAtual.id)
            .get();
        
        console.log(`Encontradas ${empresasSnap.size} empresas para zerar`);
        
        // 3. Zerar dados de cada empresa
        empresasSnap.docs.forEach(doc => {
            const empresaRef = db.collection('empresas').doc(doc.id);
            batch.update(empresaRef, {
                'campanha': {
                    // Manter apenas histórico de qual foi a última campanha
                    ultimaCampanhaId: campanhaAtual.id,
                    ultimaCampanhaNome: campanhaAtual.nome,
                    zeradoEm: firebase.firestore.FieldValue.serverTimestamp()
                }
            });
        });
        
        // Executar batch
        await batch.commit();
        
        alert(`✅ Campanha "${campanhaAtual.nome}" encerrada com sucesso!\n\n${empresasSnap.size} empresas tiveram seus dados zerados.`);
        
        // Fechar modal e recarregar
        bootstrap.Modal.getInstance(document.getElementById('modalGerenciarCampanha')).hide();
        await carregarCampanhas();
        await atualizarStats();
        await carregarAcoesPendentes();
        
    } catch (error) {
        console.error('Erro ao encerrar campanha:', error);
        alert('Erro ao encerrar campanha: ' + error.message);
    }
}

// Zerar dados de uma campanha específica (sem encerrar)
async function zerarDadosCampanha(campanhaId) {
    const campanha = campanhas.find(c => c.id === campanhaId);
    if (!campanha) {
        alert('Campanha não encontrada');
        return;
    }
    
    const confirmar = confirm(
        `⚠️ ATENÇÃO!\n\n` +
        `Você está prestes a ZERAR todos os dados das empresas da campanha "${campanha.nome}".\n\n` +
        `A campanha continuará ativa, mas todas as empresas terão seus dados limpos.\n\n` +
        `Deseja continuar?`
    );
    
    if (!confirmar) return;
    
    try {
        const db = firebase.firestore();
        
        const empresasSnap = await db.collection('empresas')
            .where('campanha.campanhaId', '==', campanhaId)
            .get();
        
        if (empresasSnap.empty) {
            alert('Nenhuma empresa encontrada com dados desta campanha.');
            return;
        }
        
        const batch = db.batch();
        
        empresasSnap.docs.forEach(doc => {
            const empresaRef = db.collection('empresas').doc(doc.id);
            batch.update(empresaRef, {
                'campanha': {
                    campanhaId: campanhaId, // Manter vinculado
                    resetadoEm: firebase.firestore.FieldValue.serverTimestamp()
                }
            });
        });
        
        await batch.commit();
        
        alert(`✅ Dados zerados!\n\n${empresasSnap.size} empresas foram resetadas.`);
        
        await carregarAcoesPendentes();
        await carregarEmpresasCampanha();
        
    } catch (error) {
        console.error('Erro ao zerar dados:', error);
        alert('Erro: ' + error.message);
    }
}

// Confirmar exclusão de campanha
async function confirmarExcluirCampanha() {
    if (!campanhaAtual) return;
    
    const confirmar = confirm(
        `⚠️ ATENÇÃO!\n\n` +
        `Você está prestes a EXCLUIR permanentemente a campanha "${campanhaAtual.nome}".\n\n` +
        `Isso irá remover:\n` +
        `• A campanha\n` +
        `• Todos os participantes\n` +
        `• Todas as ações registradas\n\n` +
        `Os dados das empresas NÃO serão afetados.\n\n` +
        `Esta ação NÃO pode ser desfeita!`
    );
    
    if (!confirmar) return;
    
    try {
        const db = firebase.firestore();
        
        // Deletar participantes
        const participantesSnap = await db.collection('campanhas').doc(campanhaAtual.id)
            .collection('participantes').get();
        
        for (const doc of participantesSnap.docs) {
            await doc.ref.delete();
        }
        
        // Deletar ações
        const acoesSnap = await db.collection('campanhas').doc(campanhaAtual.id)
            .collection('acoes').get();
        
        for (const doc of acoesSnap.docs) {
            await doc.ref.delete();
        }
        
        // Deletar campanha
        await db.collection('campanhas').doc(campanhaAtual.id).delete();
        
        alert('Campanha excluída!');
        
        bootstrap.Modal.getInstance(document.getElementById('modalGerenciarCampanha')).hide();
        
        // Atualizar cache e recarregar tudo
        await carregarCampanhas();
        await obterCampanhasExistentes(); // ⚠️ Atualizar cache
        await atualizarStats();
        
        // Recarregar abas que podem ter dados antigos
        await carregarAcoesPendentes();
        
    } catch (error) {
        console.error('Erro ao excluir campanha:', error);
        alert('Erro ao excluir');
    }
}
