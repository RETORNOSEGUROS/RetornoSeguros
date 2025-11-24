// Dashboard Cliente - Retorno Seguros
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    doc, 
    getDoc, 
    collection, 
    query, 
    where, 
    orderBy, 
    limit,
    getDocs,
    onSnapshot,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentUser = null;
let userData = null;

// ============================================================
// NOMES DAS COLEÇÕES (Centralizados para fácil manutenção)
// ============================================================
const COLECOES = {
    usuarios: 'usuarios',
    indicacoes: 'indicacoes',
    resgates: 'resgates',
    apolices: 'apolices_cliente',           // ALTERADO
    cotacoes: 'cotacoes_cliente',            // ALTERADO
    empresas: 'empresas_gamificacao',        // ALTERADO
    campanhas: 'campanhas',                  // Nova coleção
    historico_pontos: 'historico_pontos',    // Nova coleção
    notificacoes: 'notificacoes_sistema'     // ALTERADO
};

// Função para mostrar toast
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Verificar autenticação
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await carregarDadosUsuario(user.uid);
        await carregarDashboard();
    } else {
        window.location.href = 'login.html';
    }
});

// Carregar dados do usuário
async function carregarDadosUsuario(uid) {
    try {
        const userDoc = await getDoc(doc(db, COLECOES.usuarios, uid));
        
        if (!userDoc.exists()) {
            showToast('Usuário não encontrado', 'error');
            await signOut(auth);
            return;
        }
        
        userData = userDoc.data();
        
        // Atualizar informações do usuário na UI
        document.getElementById('userName').textContent = userData.nome.split(' ')[0];
        
        // Atualizar avatar
        const avatar = document.getElementById('userAvatar');
        if (currentUser.photoURL) {
            avatar.src = currentUser.photoURL;
        } else {
            avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.nome)}&background=0066cc&color=fff`;
        }
        
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
        showToast('Erro ao carregar dados', 'error');
    }
}

// Carregar dashboard
async function carregarDashboard() {
    try {
        // Carregar cards de resumo
        document.getElementById('pontosTotais').textContent = userData.pontosTotais || 0;
        document.getElementById('pontosResgataveis').textContent = userData.pontosResgataveis || 0;
        document.getElementById('totalIndicacoes').textContent = userData.totalIndicacoes || 0;
        document.getElementById('apolicesAtivas').textContent = userData.apolicesAtivas || 0;
        
        // Carregar código de indicação
        document.getElementById('codigoIndicacao').textContent = userData.codigoIndicacao;
        document.getElementById('indicacoesAtivas').textContent = userData.totalIndicacoes || 0;
        document.getElementById('indicacoesConvertidas').textContent = userData.indicacoesConvertidas || 0;
        
        // Carregar últimas indicações
        await carregarUltimasIndicacoes();
        
        // Carregar campanhas ativas
        await carregarCampanhasAtivas();
        
        // Carregar progresso de pontos
        await carregarProgressoPontos();
        
        // Carregar próximos vencimentos
        await carregarProximosVencimentos();
        
        // Carregar notificações
        await carregarNotificacoes();
        
        // Atualizar badges
        document.getElementById('indicacoesBadge').textContent = userData.totalIndicacoes || 0;
        
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
    }
}

// Carregar últimas indicações
async function carregarUltimasIndicacoes() {
    try {
        const q = query(
            collection(db, COLECOES.indicacoes),  // Usando constante
            where('indicadorId', '==', currentUser.uid),
            orderBy('dataCadastro', 'desc'),
            limit(5)
        );
        
        const querySnapshot = await getDocs(q);
        const container = document.getElementById('ultimasIndicacoes');
        
        if (querySnapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-plus"></i>
                    <p>Você ainda não fez nenhuma indicação</p>
                    <small>Compartilhe seu código e comece a ganhar pontos!</small>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        querySnapshot.forEach((doc) => {
            const indicacao = doc.data();
            const statusBadge = {
                'cadastrado': { class: 'info', text: 'Cadastrado' },
                'apolice_cadastrada': { class: 'warning', text: 'Apólice Cadastrada' },
                'cotacao': { class: 'warning', text: 'Cotando' },
                'cliente': { class: 'success', text: 'Cliente' }
            };
            
            const status = statusBadge[indicacao.status] || statusBadge['cadastrado'];
            
            const data = indicacao.dataCadastro?.toDate();
            const dataFormatada = data ? data.toLocaleDateString('pt-BR') : '-';
            
            container.innerHTML += `
                <div class="indicacao-item">
                    <div class="indicacao-info">
                        <strong>${indicacao.indicadoNome}</strong>
                        <small>${dataFormatada}</small>
                    </div>
                    <div class="indicacao-status">
                        <span class="badge badge-${status.class}">${status.text}</span>
                        <span class="pontos">+${indicacao.pontos || 0} pts</span>
                    </div>
                </div>
            `;
        });
        
    } catch (error) {
        console.error('Erro ao carregar indicações:', error);
    }
}

// Carregar campanhas ativas
async function carregarCampanhasAtivas() {
    try {
        const hoje = new Date();
        
        const q = query(
            collection(db, COLECOES.campanhas),  // Usando constante
            where('ativo', '==', true),
            where('dataFim', '>=', hoje),
            orderBy('dataFim', 'asc'),
            limit(3)
        );
        
        const querySnapshot = await getDocs(q);
        const container = document.getElementById('campanhasAtivas');
        
        if (querySnapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-trophy"></i>
                    <p>Nenhuma campanha ativa no momento</p>
                    <small>Fique atento às próximas oportunidades!</small>
                </div>
            `;
            document.getElementById('campanhasBadge').textContent = '0';
            return;
        }
        
        container.innerHTML = '';
        document.getElementById('campanhasBadge').textContent = querySnapshot.size;
        
        querySnapshot.forEach((doc) => {
            const campanha = doc.data();
            const dataFim = campanha.dataFim?.toDate();
            const dataFimFormatada = dataFim ? dataFim.toLocaleDateString('pt-BR') : '-';
            
            container.innerHTML += `
                <div class="campanha-item">
                    <div class="campanha-header">
                        <i class="fas fa-trophy"></i>
                        <h4>${campanha.titulo}</h4>
                    </div>
                    <p>${campanha.descricao}</p>
                    <div class="campanha-footer">
                        <small>Termina em ${dataFimFormatada}</small>
                        <a href="campanhas.html?id=${doc.id}" class="btn-link">Ver detalhes</a>
                    </div>
                </div>
            `;
        });
        
    } catch (error) {
        console.error('Erro ao carregar campanhas:', error);
        document.getElementById('campanhasBadge').textContent = '0';
    }
}

// Carregar progresso de pontos
async function carregarProgressoPontos() {
    try {
        // Obter pontos do mês atual
        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        
        const q = query(
            collection(db, COLECOES.historico_pontos),  // Usando constante
            where('usuarioId', '==', currentUser.uid),
            where('data', '>=', inicioMes),
            orderBy('data', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        
        let pontosMes = 0;
        querySnapshot.forEach((doc) => {
            pontosMes += doc.data().pontos || 0;
        });
        
        // Atualizar UI se existir o elemento
        const elementoPontosMes = document.getElementById('pontosMes');
        if (elementoPontosMes) {
            elementoPontosMes.textContent = pontosMes;
        }
        
    } catch (error) {
        console.error('Erro ao carregar progresso:', error);
    }
}

// Carregar próximos vencimentos
async function carregarProximosVencimentos() {
    try {
        const hoje = new Date();
        const daquiA30Dias = new Date();
        daquiA30Dias.setDate(hoje.getDate() + 30);
        
        const q = query(
            collection(db, COLECOES.apolices),  // ALTERADO: usando apolices_cliente
            where('usuarioId', '==', currentUser.uid),
            where('dataVencimento', '>=', hoje),
            where('dataVencimento', '<=', daquiA30Dias),
            orderBy('dataVencimento', 'asc'),
            limit(3)
        );
        
        const querySnapshot = await getDocs(q);
        const container = document.getElementById('proximosVencimentos');
        
        if (querySnapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-check"></i>
                    <p>Nenhum vencimento próximo</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        querySnapshot.forEach((doc) => {
            const apolice = doc.data();
            const dataVencimento = apolice.dataVencimento?.toDate();
            const dataFormatada = dataVencimento ? dataVencimento.toLocaleDateString('pt-BR') : '-';
            
            // Calcular dias restantes
            const diasRestantes = Math.ceil((dataVencimento - hoje) / (1000 * 60 * 60 * 24));
            
            let urgenciaClass = '';
            if (diasRestantes <= 7) {
                urgenciaClass = 'urgente';
            } else if (diasRestantes <= 15) {
                urgenciaClass = 'atencao';
            }
            
            container.innerHTML += `
                <div class="vencimento-item ${urgenciaClass}">
                    <div class="vencimento-icon">
                        <i class="fas fa-${apolice.ramo === 'auto' ? 'car' : apolice.ramo === 'residencial' ? 'home' : 'heart'}"></i>
                    </div>
                    <div class="vencimento-info">
                        <strong>${apolice.ramo.charAt(0).toUpperCase() + apolice.ramo.slice(1)}</strong>
                        <small>Vence em ${diasRestantes} dias (${dataFormatada})</small>
                    </div>
                    <button class="btn-renovar" onclick="renovarApolice('${doc.id}')">
                        Renovar
                    </button>
                </div>
            `;
        });
        
    } catch (error) {
        console.error('Erro ao carregar vencimentos:', error);
    }
}

// Carregar notificações
async function carregarNotificacoes() {
    try {
        const q = query(
            collection(db, COLECOES.notificacoes),  // ALTERADO: usando notificacoes_sistema
            where('usuarioId', '==', currentUser.uid),
            where('lida', '==', false),
            orderBy('data', 'desc'),
            limit(10)
        );
        
        onSnapshot(q, (querySnapshot) => {
            const container = document.getElementById('notificationList');
            const badge = document.getElementById('notificationCount');
            
            if (querySnapshot.empty) {
                container.innerHTML = '<div class="notification-empty">Nenhuma notificação</div>';
                badge.style.display = 'none';
                return;
            }
            
            badge.textContent = querySnapshot.size;
            badge.style.display = 'flex';
            container.innerHTML = '';
            
            querySnapshot.forEach((doc) => {
                const notif = doc.data();
                const data = notif.data?.toDate();
                const dataFormatada = data ? data.toLocaleString('pt-BR') : '-';
                
                container.innerHTML += `
                    <div class="notification-item" onclick="marcarComoLida('${doc.id}')">
                        <div class="notification-icon">
                            <i class="fas fa-${getNotificationIcon(notif.tipo)}"></i>
                        </div>
                        <div class="notification-content">
                            <strong>${notif.titulo}</strong>
                            <p>${notif.mensagem}</p>
                            <small>${dataFormatada}</small>
                        </div>
                    </div>
                `;
            });
        });
        
    } catch (error) {
        console.error('Erro ao carregar notificações:', error);
    }
}

// Obter ícone de notificação
function getNotificationIcon(tipo) {
    const icons = {
        'nova_indicacao': 'user-plus',
        'pontos': 'star',
        'campanha': 'trophy',
        'vencimento': 'calendar-alt',
        'resgate': 'money-bill-wave'
    };
    return icons[tipo] || 'bell';
}

// Copiar código de indicação
window.copiarCodigo = function() {
    const codigo = document.getElementById('codigoIndicacao').textContent;
    navigator.clipboard.writeText(codigo).then(() => {
        showToast('Código copiado!', 'success');
    }).catch(() => {
        showToast('Erro ao copiar código', 'error');
    });
};

// Compartilhar código
window.compartilharCodigo = function() {
    const codigo = userData.codigoIndicacao;
    const texto = `Use meu código ${codigo} para se cadastrar na Retorno Seguros e ganhe pontos!`;
    const url = `${window.location.origin}/cliente-segurado/cadastro.html?ref=${codigo}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Retorno Seguros - Indicação',
            text: texto,
            url: url
        }).catch(() => {});
    } else {
        // Copiar link para clipboard
        navigator.clipboard.writeText(`${texto}\n\n${url}`).then(() => {
            showToast('Link copiado!', 'success');
        });
    }
};

// Toggle sidebar
window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('active');
};

// Toggle notificações
window.toggleNotifications = function() {
    document.getElementById('notificationDropdown').classList.toggle('active');
};

// Toggle menu de usuário
window.toggleUserMenu = function() {
    document.getElementById('userDropdown').classList.toggle('active');
};

// Marcar notificação como lida
window.marcarComoLida = async function(notifId) {
    try {
        await updateDoc(doc(db, COLECOES.notificacoes, notifId), {  // ALTERADO
            lida: true
        });
    } catch (error) {
        console.error('Erro ao marcar notificação:', error);
    }
};

// Marcar todas como lidas
window.marcarTodasLidas = async function() {
    try {
        const q = query(
            collection(db, COLECOES.notificacoes),  // ALTERADO
            where('usuarioId', '==', currentUser.uid),
            where('lida', '==', false)
        );
        
        const querySnapshot = await getDocs(q);
        const promises = [];
        
        querySnapshot.forEach((doc) => {
            promises.push(updateDoc(doc.ref, { lida: true }));
        });
        
        await Promise.all(promises);
        showToast('Todas as notificações foram marcadas como lidas', 'success');
        
    } catch (error) {
        console.error('Erro ao marcar notificações:', error);
    }
};

// Renovar apólice
window.renovarApolice = function(apoliceId) {
    // Redirecionar para página de renovação ou abrir modal
    window.location.href = `renovacao.html?id=${apoliceId}`;
};

// Logout
window.logout = async function() {
    if (confirm('Deseja realmente sair?')) {
        try {
            await signOut(auth);
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Erro ao sair:', error);
            showToast('Erro ao sair', 'error');
        }
    }
};

// Fechar dropdowns ao clicar fora
document.addEventListener('click', function(event) {
    if (!event.target.closest('.notifications')) {
        document.getElementById('notificationDropdown').classList.remove('active');
    }
    if (!event.target.closest('.user-menu')) {
        document.getElementById('userDropdown').classList.remove('active');
    }
});
