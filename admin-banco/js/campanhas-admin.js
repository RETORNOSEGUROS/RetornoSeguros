/**
 * CAMPANHAS ADMIN - Painel de Gerenciamento
 * Sistema de campanhas de indicação para assistentes de banco
 */

// Variáveis globais
let campanhas = [];
let agencias = [];
let campanhaAtual = null;
let participanteAtual = null;

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
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
    
    // Carregar campanhas
    await carregarCampanhas();
    
    // Carregar stats
    await atualizarStats();
    
    // Carregar ações pendentes
    await carregarAcoesPendentes();
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
function abrirModalNovaCampanha() {
    // Preencher checkboxes de agências
    const container = document.getElementById('checkboxAgencias');
    container.innerHTML = agencias.map(ag => `
        <div class="form-check">
            <input class="form-check-input" type="checkbox" value="${ag.id}" id="ag_${ag.id}">
            <label class="form-check-label" for="ag_${ag.id}">${ag.nome || ag.id}</label>
        </div>
    `).join('');
    
    // Definir datas padrão
    const hoje = new Date();
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    document.getElementById('inputCampanhaInicio').value = hoje.toISOString().split('T')[0];
    document.getElementById('inputCampanhaFim').value = fimMes.toISOString().split('T')[0];
    
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
        
        // Verificar pendências de dental
        if (campanha.dental?.emailEnviado && !campanha.dental?.reuniaoConfirmada) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: emp.razaoSocial || emp.nomeFantasia,
                tipo: 'reuniaoDental',
                label: 'Confirmar Reunião Dental',
                pontos: 15
            });
        }
        if (campanha.dental?.reuniaoConfirmada && !campanha.dental?.entendeuConfirmado) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: emp.razaoSocial || emp.nomeFantasia,
                tipo: 'entendeuDental',
                label: 'Confirmar Entendimento Dental',
                pontos: 12
            });
        }
        if (campanha.dental?.decisao === 'fechou' && !campanha.dental?.fechouNegocio) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: emp.razaoSocial || emp.nomeFantasia,
                tipo: 'fechouDental',
                label: 'Confirmar Negócio Dental',
                pontos: 40
            });
        }
        
        // Verificar pendências de saúde
        if (campanha.saude?.emailEnviado && !campanha.saude?.reuniaoConfirmada) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: emp.razaoSocial || emp.nomeFantasia,
                tipo: 'reuniaoSaude',
                label: 'Confirmar Reunião Saúde',
                pontos: 15
            });
        }
        if (campanha.saude?.reuniaoConfirmada && !campanha.saude?.entendeuConfirmado) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: emp.razaoSocial || emp.nomeFantasia,
                tipo: 'entendeuSaude',
                label: 'Confirmar Entendimento Saúde',
                pontos: 12
            });
        }
        if (campanha.saude?.decisao === 'fechou' && !campanha.saude?.fechouNegocio) {
            pendentes.push({
                empresaId: doc.id,
                empresaNome: emp.razaoSocial || emp.nomeFantasia,
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
                <p class="mt-2">Nenhuma ação pendente</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = pendentes.map(p => `
        <div class="acao-pendente">
            <div>
                <strong>${p.empresaNome}</strong>
                <span class="badge badge-tipo bg-warning text-dark ms-2">${p.label}</span>
            </div>
            <button class="btn btn-sm btn-success" onclick="confirmarAcaoAdmin('${p.empresaId}', '${p.tipo}', ${p.pontos})">
                <i class="bi bi-check-lg"></i> Confirmar (+${p.pontos} pts)
            </button>
        </div>
    `).join('');
}

// Confirmar ação do admin
async function confirmarAcaoAdmin(empresaId, tipo, pontos) {
    try {
        const db = firebase.firestore();
        
        // Atualizar empresa
        const campo = tipo.replace('reuniao', 'reuniaoConfirmada')
                        .replace('entendeu', 'entendeuConfirmado')
                        .replace('fechou', 'fechouNegocio');
        
        const ramo = tipo.toLowerCase().includes('dental') ? 'dental' : 'saude';
        
        await db.collection('empresas').doc(empresaId).update({
            [`campanha.${ramo}.${campo.replace(ramo.charAt(0).toUpperCase() + ramo.slice(1), '')}`]: true,
            [`campanha.${ramo}.${campo.replace(ramo.charAt(0).toUpperCase() + ramo.slice(1), '')}Em`]: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Encontrar participante que fez a ação e dar pontos
        const empresaDoc = await db.collection('empresas').doc(empresaId).get();
        const empresa = empresaDoc.data();
        const participanteId = empresa.campanha?.[ramo]?.emailEnviadoPor;
        
        if (participanteId) {
            // Encontrar em qual campanha está
            for (const campanha of campanhas) {
                const partDoc = await db.collection('campanhas').doc(campanha.id)
                    .collection('participantes').doc(participanteId).get();
                
                if (partDoc.exists) {
                    const pontosAtuais = partDoc.data().pontos || 0;
                    await partDoc.ref.update({ pontos: pontosAtuais + pontos });
                    
                    // Registrar ação
                    await db.collection('campanhas').doc(campanha.id)
                        .collection('acoes').add({
                            tipo,
                            pontos,
                            empresaId,
                            empresaNome: empresa.razaoSocial || empresa.nomeFantasia,
                            participanteId,
                            participanteNome: partDoc.data().nome,
                            confirmadoPorAdmin: true,
                            dataRegistro: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    
                    break;
                }
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
    
    const empresasSnap = await db.collection('empresas').get();
    
    const empresasComDados = empresasSnap.docs.filter(doc => {
        const emp = doc.data();
        const temDados = emp.funcionariosQtd || emp.socios?.length || emp.campanha;
        if (!temDados) return false;
        
        if (busca) {
            const nome = (emp.razaoSocial || emp.nomeFantasia || '').toLowerCase();
            return nome.includes(busca);
        }
        return true;
    }).map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (empresasComDados.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-building" style="font-size: 2rem;"></i>
                <p class="mt-2">Nenhuma empresa com dados de campanha</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = empresasComDados.map(emp => {
        const campanha = emp.campanha || {};
        return `
            <div class="empresa-card ${campanha.dental || campanha.saude ? 'tem-acao' : ''}">
                <div class="d-flex justify-content-between">
                    <div>
                        <strong>${emp.razaoSocial || emp.nomeFantasia}</strong>
                        <div class="small text-muted mt-1">
                            ${emp.funcionariosQtd ? `<span class="badge bg-info me-1">👥 ${emp.funcionariosQtd} func.</span>` : ''}
                            ${emp.socios?.length ? `<span class="badge bg-info me-1">👤 ${emp.socios.length} sócio(s)</span>` : ''}
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
    
    document.getElementById('modalEmpresaTitulo').textContent = emp.razaoSocial || emp.nomeFantasia;
    
    const campanha = emp.campanha || {};
    
    let html = `
        <div class="row">
            <div class="col-md-6">
                <h6 class="text-muted">Informações Coletadas</h6>
                <table class="table table-sm">
                    <tr>
                        <th>Funcionários:</th>
                        <td>${emp.funcionariosQtd || '-'}</td>
                    </tr>
                    <tr>
                        <th>E-mail Responsável:</th>
                        <td>${emp.emailResponsavel || '-'}</td>
                    </tr>
                </table>
                
                ${emp.socios?.length ? `
                    <h6 class="text-muted mt-3">Sócios</h6>
                    <ul class="list-group list-group-flush">
                        ${emp.socios.map(s => `
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
        return emp.funcionariosQtd || emp.socios?.length || emp.campanha;
    }).map(doc => {
        const emp = doc.data();
        const campanha = emp.campanha || {};
        
        return {
            Empresa: emp.razaoSocial || emp.nomeFantasia,
            CNPJ: emp.cnpj,
            Funcionarios: emp.funcionariosQtd || '',
            Socios: emp.socios?.map(s => `${s.nome} (${s.dataNascimento})`).join('; ') || '',
            EmailResponsavel: emp.emailResponsavel || '',
            DentalEmail: campanha.dental?.email || '',
            DentalDecisao: campanha.dental?.decisao || '',
            DentalJustificativa: campanha.dental?.justificativa || '',
            DentalFechou: campanha.dental?.fechouNegocio ? 'Sim' : 'Não',
            SaudeEmail: campanha.saude?.email || '',
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
        const pesquisasSnap = await db.collection('pesquisas_colaboradores')
            .orderBy('dataCriacao', 'desc')
            .get();
        
        if (pesquisasSnap.empty) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-clipboard-data" style="font-size: 2rem;"></i>
                    <p class="mt-2">Nenhuma pesquisa criada ainda</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = pesquisasSnap.docs.map(doc => {
            const p = doc.data();
            const progresso = Math.min((p.totalRespostas || 0) / 10 * 100, 100);
            const corProgresso = progresso >= 100 ? 'success' : progresso >= 50 ? 'warning' : 'info';
            
            return `
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <h5 class="mb-1">${p.empresaNome || 'Empresa'}</h5>
                                <p class="text-muted mb-2 small">
                                    <i class="bi bi-people"></i> ${p.funcionariosQtd || 0} funcionários
                                    • Enviada por: ${p.participanteNome || '-'}
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
