/**
 * CHECKLIST DE ENTENDIMENTO - Página da Empresa
 * Sistema para empresa confirmar entendimento sobre planos de saúde e dental
 * 
 * Funcionalidades:
 * - Link único por empresa
 * - Perguntas de Sim/Não sobre entendimento
 * - Escala de probabilidade (0-10)
 * - Pontua automaticamente a assistente quando empresa responde
 * - Se responder "sim" para pesquisa recebida, pontua automaticamente
 */

// Configuração Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDlbEZfA_uAR1aoPZIr8T9B6KNcrwfMxm0",
    authDomain: "retorno-seguros.firebaseapp.com",
    projectId: "retorno-seguros",
    storageBucket: "retorno-seguros.appspot.com",
    messagingSenderId: "495712392972",
    appId: "1:495712392972:web:e1e78aedc48bdeea48db29"
};

// Variáveis globais
let checklistId = null;
let empresaId = null;
let campanhaId = null;
let participanteId = null;
let empresaData = null;
let checklistData = null;
let respostas = {};

// Pontuação
const PONTUACAO = {
    checklistRespondido: 25, // Pontos por completar o checklist
    pesquisaConfirmada: 20   // Pontos quando confirma que recebeu pesquisa (substitui o envio manual)
};

// Perguntas do checklist
const PERGUNTAS = {
    saude: [
        {
            id: 'saude_hotelaria',
            texto: 'Ficou claro que o Plano de saúde dos sócios disponibiliza internação de hotelaria em hospitais de ponta, exemplo Sírio Libanês, Albert Einstein dentre outros?',
            tipo: 'sim_nao'
        },
        {
            id: 'saude_exterior',
            texto: 'Ficou claro que o Plano de saúde dos sócios tem cobertura no exterior mediante reembolso e seguro viagem incluso?',
            tipo: 'sim_nao'
        },
        {
            id: 'saude_reembolso_fora_rede',
            texto: 'Ficou claro que o Plano de saúde dos sócios possuí reembolso fora da rede credenciada? Exemplo: Consultou no seu médico particular (que não faz parte do plano) é possível solicitar reembolso no aplicativo Bradesco saúde.',
            tipo: 'sim_nao'
        },
        {
            id: 'saude_reembolso_10x',
            texto: 'Ficou claro que o plano tem reembolso que vão até 10 vezes a tabela da ANS? Exemplo: consulta - tabela padrão reembolso de R$ 109,00, vezes 10, reembolsa até R$ 1.090,00 por uma consulta fora da rede de médicos conveniados no plano.',
            tipo: 'sim_nao'
        },
        {
            id: 'saude_cobertura_nacional',
            texto: 'Ficou claro que o plano de saúde tem cobertura Nacional e reembolso em todas as faixas?',
            tipo: 'sim_nao'
        },
        {
            id: 'saude_dependentes',
            texto: 'Ficou claro que é possível incluir os dependentes no plano?',
            tipo: 'sim_nao'
        },
        {
            id: 'saude_minimo_vidas',
            texto: 'Ficou claro que o mínimo para implantar uma apólice tem que ter no mínimo 3 pessoas e apenas 1 titular?',
            tipo: 'sim_nao'
        },
        {
            id: 'saude_colaborador_paga',
            texto: 'Ficou claro que a empresa pode implantar uma apólice e que o colaborador pague integralmente seu plano? Oportunizando que o colaborador tenha acesso ao plano de saúde sem a empresa arcar com nenhum valor.',
            tipo: 'sim_nao'
        },
        {
            id: 'saude_deducao_dre',
            texto: 'Ficou claro que gastos da empresa com plano de saúde são dedutíveis integralmente das despesas da empresa na DRE?',
            tipo: 'sim_nao'
        },
        {
            id: 'saude_pesquisa_colaboradores',
            texto: 'A empresa já fez uma pesquisa de interesse dos colaboradores no plano de saúde?',
            tipo: 'sim_nao'
        },
        {
            id: 'saude_probabilidade',
            texto: 'Em uma escala de 0 a 10 (0 pouco provável e 10 muito provável) qual a probabilidade dos sócios contratarem o plano de saúde?',
            tipo: 'escala'
        }
    ],
    dental: [
        {
            id: 'dental_cobertura_nacional',
            texto: 'Ficou claro que o plano Dental para colaboradores possuí cobertura Nacional na rede credenciada?',
            tipo: 'sim_nao'
        },
        {
            id: 'dental_custo_20',
            texto: 'Ficou claro que o custo do plano dental pode custar menos de R$ 20,00 por pessoa mês?',
            tipo: 'sim_nao'
        },
        {
            id: 'dental_reter_talentos',
            texto: 'No seu entendimento, o plano dental pode ajudar a reter talentos?',
            tipo: 'sim_nao'
        },
        {
            id: 'dental_colaborador_100',
            texto: 'Ficou claro que o colaborador pode arcar com 100% do plano próprio ou dos dependentes?',
            tipo: 'sim_nao'
        },
        {
            id: 'dental_deducao_dre',
            texto: 'Ficou claro que os gastos da empresa com plano dental podem ser dedutíveis na DRE da empresa e a empresa ter esse benefício fiscal?',
            tipo: 'sim_nao'
        },
        {
            id: 'dental_nao_obrigatorio',
            texto: 'Ficou claro que nem todos os colaboradores precisam estar no plano? Que pode ser apenas os que tiverem interesse?',
            tipo: 'sim_nao'
        },
        {
            id: 'dental_custo_anual',
            texto: 'A empresa entende que o custo do plano dental de um ano inteiro, não chega no valor de uma limpeza que o funcionário pagaria de forma particular?',
            tipo: 'sim_nao'
        },
        {
            id: 'dental_coberturas',
            texto: 'Você entendeu as coberturas e procedimentos cobertos do plano dental?',
            tipo: 'sim_nao'
        },
        {
            id: 'dental_pesquisa_colaboradores',
            texto: 'A empresa já fez uma pesquisa de interesse dos colaboradores no plano dental?',
            tipo: 'sim_nao'
        },
        {
            id: 'dental_probabilidade',
            texto: 'Em uma escala de 0 a 10 (0 pouco provável e 10 muito provável) qual a probabilidade da empresa disponibilizar o benefício do plano dental para os colaboradores?',
            tipo: 'escala'
        }
    ],
    pesquisa: [
        {
            id: 'pesquisa_recebeu_link',
            texto: 'A empresa recebeu a pesquisa sobre interesse dos colaboradores no plano de saúde e dental?',
            tipo: 'sim_nao',
            pontuaSeTrue: true // Este campo pontua automaticamente se responder SIM
        },
        {
            id: 'pesquisa_compartilhou',
            texto: 'A empresa compartilhou o link da pesquisa com os colaboradores?',
            tipo: 'sim_nao'
        }
    ]
};

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    // Pegar parâmetros da URL
    const params = new URLSearchParams(window.location.search);
    checklistId = params.get('ch');
    empresaId = params.get('e');
    campanhaId = params.get('c');
    participanteId = params.get('p');
    
    if (!checklistId || !empresaId) {
        mostrarLinkInvalido();
        return;
    }
    
    try {
        await inicializarFirebase();
        await carregarDados();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        mostrarLinkInvalido();
    }
});

// Inicializar Firebase
async function inicializarFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    // Autenticar anonimamente
    await firebase.auth().signInAnonymously();
}

// Carregar dados
async function carregarDados() {
    const db = firebase.firestore();
    
    // Carregar checklist
    const checklistDoc = await db.collection('checklists_entendimento').doc(checklistId).get();
    if (!checklistDoc.exists) {
        throw new Error('Checklist não encontrado');
    }
    checklistData = { id: checklistDoc.id, ...checklistDoc.data() };
    
    // Verificar se já foi respondido
    if (checklistData.respondido) {
        mostrarJaRespondido();
        return;
    }
    
    // Carregar empresa
    const empresaDoc = await db.collection('empresas').doc(empresaId).get();
    if (!empresaDoc.exists) {
        throw new Error('Empresa não encontrada');
    }
    empresaData = { id: empresaDoc.id, ...empresaDoc.data() };
    
    // Pegar campanhaId e participanteId do checklist se não vieram na URL
    if (!campanhaId) campanhaId = checklistData.campanhaId;
    if (!participanteId) participanteId = checklistData.participanteId;
    
    // Esconder loading
    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    
    // Atualizar interface
    atualizarHeader();
    renderizarPerguntas();
    atualizarProgresso();
}

// Atualizar header
function atualizarHeader() {
    const nomeEmpresa = getNomeEmpresa(empresaData);
    document.getElementById('empresaNome').innerHTML = `
        <i class="bi bi-building me-2"></i>
        ${nomeEmpresa}
    `;
}

// Helper para pegar nome da empresa
function getNomeEmpresa(emp) {
    if (!emp) return 'Empresa';
    return emp.razaoSocial || emp.nomeFantasia || emp.nome || emp.empresa || 
           emp.denominacao || emp.razao_social || emp.nome_fantasia ||
           emp.campanha?.empresaNome || emp.dados?.razaoSocial || 'Empresa';
}

// Renderizar perguntas
function renderizarPerguntas() {
    // Saúde
    document.getElementById('questionsSaude').innerHTML = PERGUNTAS.saude.map(p => 
        renderizarPergunta(p, 'saude')
    ).join('');
    
    // Dental
    document.getElementById('questionsDental').innerHTML = PERGUNTAS.dental.map(p => 
        renderizarPergunta(p, 'dental')
    ).join('');
    
    // Pesquisa
    document.getElementById('questionsPesquisa').innerHTML = PERGUNTAS.pesquisa.map(p => 
        renderizarPergunta(p, 'pesquisa')
    ).join('');
    
    // Total de perguntas
    const total = PERGUNTAS.saude.length + PERGUNTAS.dental.length + PERGUNTAS.pesquisa.length;
    document.getElementById('totalQuestions').textContent = total;
}

// Renderizar uma pergunta
function renderizarPergunta(pergunta, secao) {
    if (pergunta.tipo === 'escala') {
        return `
            <div class="question-item" id="q_${pergunta.id}">
                <div class="question-text">${pergunta.texto}</div>
                <div class="scale-container">
                    <div class="scale-label">
                        <span>0 - Pouco provável</span>
                        <span>10 - Muito provável</span>
                    </div>
                    <div class="scale-buttons">
                        ${[0,1,2,3,4,5,6,7,8,9,10].map(n => `
                            <button class="scale-btn" onclick="responderEscala('${pergunta.id}', ${n})">${n}</button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="question-item" id="q_${pergunta.id}">
            <div class="question-text">${pergunta.texto}</div>
            <div class="question-actions">
                <button class="btn-answer btn-yes" onclick="responderSimNao('${pergunta.id}', true, ${pergunta.pontuaSeTrue || false})">
                    <i class="bi bi-check-lg"></i> Sim
                </button>
                <button class="btn-answer btn-no" onclick="responderSimNao('${pergunta.id}', false, false)">
                    <i class="bi bi-x-lg"></i> Não
                </button>
            </div>
        </div>
    `;
}

// Responder Sim/Não
function responderSimNao(perguntaId, valor, pontuaSeTrue) {
    respostas[perguntaId] = {
        valor: valor === true, // Garantir que seja boolean
        tipo: 'sim_nao',
        pontuaSeTrue: pontuaSeTrue === true // Garantir que seja boolean, não undefined
    };
    
    // Atualizar visual
    const container = document.getElementById(`q_${perguntaId}`);
    container.classList.remove('answered-yes', 'answered-no');
    container.classList.add(valor ? 'answered-yes' : 'answered-no');
    
    // Atualizar botões
    const buttons = container.querySelectorAll('.btn-answer');
    buttons.forEach(btn => btn.classList.remove('selected'));
    buttons[valor ? 0 : 1].classList.add('selected');
    
    atualizarProgresso();
}

// Responder Escala
function responderEscala(perguntaId, valor) {
    respostas[perguntaId] = {
        valor: parseInt(valor) || 0, // Garantir que seja número
        tipo: 'escala'
    };
    
    // Atualizar visual
    const container = document.getElementById(`q_${perguntaId}`);
    container.classList.add('answered-yes');
    
    // Atualizar botões
    const buttons = container.querySelectorAll('.scale-btn');
    buttons.forEach(btn => btn.classList.remove('selected'));
    buttons[valor].classList.add('selected');
    
    atualizarProgresso();
}

// Atualizar progresso
function atualizarProgresso() {
    const total = PERGUNTAS.saude.length + PERGUNTAS.dental.length + PERGUNTAS.pesquisa.length;
    const respondidas = Object.keys(respostas).length;
    const porcentagem = Math.round((respondidas / total) * 100);
    
    document.getElementById('answeredCount').textContent = respondidas;
    document.getElementById('progressBar').style.width = `${porcentagem}%`;
    
    // Habilitar botão quando todas respondidas
    document.getElementById('btnSubmit').disabled = respondidas < total;
}

// Função para remover valores undefined (Firebase não aceita)
function sanitizarParaFirebase(obj) {
    if (obj === null || obj === undefined) {
        return null;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizarParaFirebase(item));
    }
    if (typeof obj === 'object') {
        const resultado = {};
        for (const [key, value] of Object.entries(obj)) {
            const valorSanitizado = sanitizarParaFirebase(value);
            // Só inclui se não for undefined
            if (valorSanitizado !== undefined) {
                resultado[key] = valorSanitizado === undefined ? null : valorSanitizado;
            }
        }
        return resultado;
    }
    return obj;
}

// Enviar respostas
async function enviarRespostas() {
    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i> Enviando...';
    
    try {
        const db = firebase.firestore();
        const batch = db.batch();
        
        // Calcular estatísticas
        const stats = calcularEstatisticas();
        
        // Sanitizar dados para remover undefined (Firebase não aceita)
        const respostasSanitizadas = sanitizarParaFirebase(respostas);
        const statsSanitizadas = sanitizarParaFirebase(stats);
        
        // Atualizar checklist como respondido
        const checklistRef = db.collection('checklists_entendimento').doc(checklistId);
        batch.update(checklistRef, {
            respondido: true,
            respondidoEm: firebase.firestore.FieldValue.serverTimestamp(),
            respostas: respostasSanitizadas,
            estatisticas: statsSanitizadas
        });
        
        // Verificar se precisa pontuar por pesquisa confirmada
        let pontosPesquisa = 0;
        if (respostas['pesquisa_recebeu_link']?.valor === true) {
            // Se respondeu SIM para recebeu pesquisa, pontua automaticamente
            pontosPesquisa = PONTUACAO.pesquisaConfirmada;
            
            // Atualizar empresa para marcar que pesquisa foi confirmada pela empresa
            const empresaRef = db.collection('empresas').doc(empresaId);
            batch.update(empresaRef, {
                'campanha.pesquisa.confirmadaPelaEmpresa': true,
                'campanha.pesquisa.confirmadaEm': firebase.firestore.FieldValue.serverTimestamp(),
                'campanha.checklist.respondido': true,
                'campanha.checklist.respondidoEm': firebase.firestore.FieldValue.serverTimestamp(),
                'campanha.checklist.estatisticas': statsSanitizadas
            });
        } else {
            // Apenas marcar checklist como respondido
            const empresaRef = db.collection('empresas').doc(empresaId);
            batch.update(empresaRef, {
                'campanha.checklist.respondido': true,
                'campanha.checklist.respondidoEm': firebase.firestore.FieldValue.serverTimestamp(),
                'campanha.checklist.estatisticas': statsSanitizadas
            });
        }
        
        // Pontuar assistente
        const pontosTotal = PONTUACAO.checklistRespondido + pontosPesquisa;
        
        if (campanhaId && participanteId) {
            // Atualizar pontos do participante
            const participanteRef = db.collection('campanhas').doc(campanhaId)
                .collection('participantes').doc(participanteId);
            batch.update(participanteRef, {
                pontos: firebase.firestore.FieldValue.increment(pontosTotal)
            });
            
            // Registrar ação do checklist
            const acaoChecklistRef = db.collection('campanhas').doc(campanhaId)
                .collection('acoes').doc();
            batch.set(acaoChecklistRef, {
                tipo: 'checklistRespondido',
                participanteId: participanteId,
                empresaId: empresaId,
                checklistId: checklistId,
                pontos: PONTUACAO.checklistRespondido,
                estatisticas: statsSanitizadas,
                criadoEm: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Se confirmou pesquisa, registrar ação adicional
            if (pontosPesquisa > 0) {
                const acaoPesquisaRef = db.collection('campanhas').doc(campanhaId)
                    .collection('acoes').doc();
                batch.set(acaoPesquisaRef, {
                    tipo: 'pesquisaConfirmadaEmpresa',
                    participanteId: participanteId,
                    empresaId: empresaId,
                    pontos: PONTUACAO.pesquisaConfirmada,
                    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        await batch.commit();
        
        // Mostrar sucesso
        document.getElementById('successOverlay').style.display = 'flex';
        
    } catch (error) {
        console.error('Erro ao enviar respostas:', error);
        alert('Erro ao enviar respostas. Por favor, tente novamente.');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-send-fill"></i> Enviar Respostas';
    }
}

// Calcular estatísticas das respostas
function calcularEstatisticas() {
    const stats = {
        saude: { sim: 0, nao: 0, total: PERGUNTAS.saude.length - 1, probabilidade: null },
        dental: { sim: 0, nao: 0, total: PERGUNTAS.dental.length - 1, probabilidade: null },
        pesquisa: { sim: 0, nao: 0, total: PERGUNTAS.pesquisa.length },
        geral: { sim: 0, nao: 0, total: 0 }
    };
    
    // Processar saúde
    PERGUNTAS.saude.forEach(p => {
        if (p.tipo === 'escala') {
            // Garantir que probabilidade seja número ou null, nunca undefined
            const valor = respostas[p.id]?.valor;
            stats.saude.probabilidade = (valor !== undefined && valor !== null) ? valor : null;
        } else if (respostas[p.id]) {
            if (respostas[p.id].valor === true) {
                stats.saude.sim++;
                stats.geral.sim++;
            } else {
                stats.saude.nao++;
                stats.geral.nao++;
            }
        }
    });
    
    // Processar dental
    PERGUNTAS.dental.forEach(p => {
        if (p.tipo === 'escala') {
            // Garantir que probabilidade seja número ou null, nunca undefined
            const valor = respostas[p.id]?.valor;
            stats.dental.probabilidade = (valor !== undefined && valor !== null) ? valor : null;
        } else if (respostas[p.id]) {
            if (respostas[p.id].valor === true) {
                stats.dental.sim++;
                stats.geral.sim++;
            } else {
                stats.dental.nao++;
                stats.geral.nao++;
            }
        }
    });
    
    // Processar pesquisa
    PERGUNTAS.pesquisa.forEach(p => {
        if (respostas[p.id]) {
            if (respostas[p.id].valor === true) {
                stats.pesquisa.sim++;
                stats.geral.sim++;
            } else {
                stats.pesquisa.nao++;
                stats.geral.nao++;
            }
        }
    });
    
    stats.geral.total = stats.saude.total + stats.dental.total + stats.pesquisa.total;
    
    // Calcular porcentagem de entendimento
    stats.saude.porcentagemSim = stats.saude.total > 0 ? Math.round((stats.saude.sim / stats.saude.total) * 100) : 0;
    stats.dental.porcentagemSim = stats.dental.total > 0 ? Math.round((stats.dental.sim / stats.dental.total) * 100) : 0;
    stats.geral.porcentagemSim = stats.geral.total > 0 ? Math.round((stats.geral.sim / stats.geral.total) * 100) : 0;
    
    return stats;
}

// Mostrar link inválido
function mostrarLinkInvalido() {
    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('invalidLink').style.display = 'flex';
}

// Mostrar já respondido
function mostrarJaRespondido() {
    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('alreadyAnswered').style.display = 'flex';
}
