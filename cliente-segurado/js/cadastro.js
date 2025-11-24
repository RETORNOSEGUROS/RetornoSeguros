// Cadastro de Cliente - Retorno Seguros
import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    doc, 
    setDoc, 
    getDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp,
    increment,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ============================================================
// NOMES DAS COLEÇÕES
// ============================================================
const COLECOES = {
    usuarios: 'usuarios',
    indicacoes: 'indicacoes',
    notificacoes: 'notificacoes_sistema'
};

// ============================================================
// VARIÁVEL GLOBAL PARA ARMAZENAR CÓDIGO DA URL
// ============================================================
let codigoDaURLGlobal = null;

// ============================================================
// CAPTURAR CÓDIGO DE INDICAÇÃO DA URL
// ============================================================
function capturarCodigoDaURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const codigo = urlParams.get('ref') || 
                   urlParams.get('codigo') || 
                   urlParams.get('indicacao') ||
                   urlParams.get('c');
    return codigo ? codigo.trim().toUpperCase() : null;
}

// Preencher código ao carregar a página (SEM validar ainda)
document.addEventListener('DOMContentLoaded', () => {
    codigoDaURLGlobal = capturarCodigoDaURL();
    
    if (codigoDaURLGlobal) {
        const campoCodigoIndicacao = document.getElementById('codigoIndicacao');
        campoCodigoIndicacao.value = codigoDaURLGlobal;
        
        // Destacar visualmente
        campoCodigoIndicacao.style.borderColor = 'var(--primary)';
        campoCodigoIndicacao.style.backgroundColor = '#f0f7ff';
        
        // Mostrar mensagem de que será validado
        const indicadorNome = document.getElementById('indicadorNome');
        indicadorNome.textContent = '⏳ Código será validado ao criar conta...';
        indicadorNome.style.color = 'var(--gray-600)';
    }
});

// Função para mostrar toast
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Gerar código de indicação único
async function gerarCodigoIndicacao() {
    const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigo = '';
    let tentativas = 0;
    const maxTentativas = 10;
    
    while (tentativas < maxTentativas) {
        codigo = '';
        for (let i = 0; i < 8; i++) {
            codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
        }
        
        const q = query(collection(db, COLECOES.usuarios), where('codigoIndicacao', '==', codigo));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            return codigo;
        }
        
        tentativas++;
    }
    
    throw new Error('Não foi possível gerar um código único. Tente novamente.');
}

// Verificar código de indicação quando usuário sai do campo
document.getElementById('codigoIndicacao').addEventListener('blur', async function() {
    const codigo = this.value.trim().toUpperCase();
    const indicadorNome = document.getElementById('indicadorNome');
    
    this.value = codigo;
    
    if (!codigo) {
        indicadorNome.textContent = '';
        this.style.borderColor = '';
        this.style.backgroundColor = '';
        return;
    }
    
    // Mostrar que está verificando
    indicadorNome.textContent = '⏳ Verificando código...';
    indicadorNome.style.color = 'var(--gray-600)';
    
    try {
        const q = query(collection(db, COLECOES.usuarios), where('codigoIndicacao', '==', codigo));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const indicador = querySnapshot.docs[0].data();
            indicadorNome.textContent = `✓ Você será indicado por ${indicador.nome}`;
            indicadorNome.style.color = 'var(--success)';
            this.style.borderColor = 'var(--success)';
            this.style.backgroundColor = '#f0fff4';
        } else {
            indicadorNome.textContent = '✗ Código de indicação inválido';
            indicadorNome.style.color = 'var(--danger)';
            this.style.borderColor = 'var(--danger)';
            this.style.backgroundColor = '#fff5f5';
        }
    } catch (error) {
        // Se der erro de permissão, avisa que será validado no cadastro
        console.log('Validação será feita no cadastro:', error.message);
        indicadorNome.textContent = '⏳ Código será validado ao criar conta';
        indicadorNome.style.color = 'var(--gray-600)';
        this.style.borderColor = 'var(--primary)';
        this.style.backgroundColor = '#f0f7ff';
    }
});

// Converter para maiúsculas enquanto digita
document.getElementById('codigoIndicacao').addEventListener('input', function() {
    this.value = this.value.toUpperCase();
});

// Formatar telefone
document.getElementById('telefone').addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    
    if (value.length <= 11) {
        if (value.length <= 2) {
            e.target.value = value;
        } else if (value.length <= 6) {
            e.target.value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
        } else if (value.length <= 10) {
            e.target.value = `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
        } else {
            e.target.value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7, 11)}`;
        }
    }
});

// Cadastro com email e senha
document.getElementById('cadastroForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nome = document.getElementById('nome').value.trim();
    const telefone = document.getElementById('telefone').value.replace(/\D/g, '');
    const cidade = document.getElementById('cidade').value.trim();
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;
    const confirmarSenha = document.getElementById('confirmarSenha').value;
    const codigoIndicacao = document.getElementById('codigoIndicacao').value.trim().toUpperCase();
    const btnCadastro = document.getElementById('btnCadastro');
    
    // Validações
    if (senha !== confirmarSenha) {
        showToast('As senhas não coincidem', 'error');
        return;
    }
    
    if (senha.length < 6) {
        showToast('A senha deve ter no mínimo 6 caracteres', 'error');
        return;
    }
    
    if (telefone.length < 10) {
        showToast('Telefone inválido', 'error');
        return;
    }
    
    // Desabilitar botão
    btnCadastro.disabled = true;
    btnCadastro.innerHTML = '<span>Criando conta...</span><i class="fas fa-spinner fa-spin"></i>';
    
    try {
        // PRIMEIRO: Criar usuário no Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;
        
        // Atualizar nome no perfil
        await updateProfile(user, {
            displayName: nome
        });
        
        // AGORA que está autenticado, verificar código de indicação
        let indicadoPorId = null;
        let indicadorNome = null;
        
        if (codigoIndicacao) {
            try {
                const q = query(collection(db, COLECOES.usuarios), where('codigoIndicacao', '==', codigoIndicacao));
                const querySnapshot = await getDocs(q);
                
                if (!querySnapshot.empty) {
                    indicadoPorId = querySnapshot.docs[0].id;
                    indicadorNome = querySnapshot.docs[0].data().nome;
                }
            } catch (err) {
                console.log('Erro ao buscar indicador:', err);
            }
        }
        
        // Gerar código de indicação único para este usuário
        const codigoUnico = await gerarCodigoIndicacao();
        
        // Criar documento do usuário no Firestore
        await setDoc(doc(db, COLECOES.usuarios, user.uid), {
            nome: nome,
            email: email,
            telefone: telefone,
            cidade: cidade,
            codigoIndicacao: codigoUnico,
            indicadoPor: indicadoPorId,
            indicadoPorCodigo: codigoIndicacao || null,
            pontosTotais: 0,
            pontosResgataveis: 0,
            pontosResgatados: 0,
            totalIndicacoes: 0,
            indicacoesConvertidas: 0,
            apolicesAtivas: 0,
            ativo: true,
            isCliente: false,
            dataCadastro: serverTimestamp(),
            ultimaAtualizacao: serverTimestamp()
        });
        
        // Se foi indicado por alguém, registrar a indicação
        if (indicadoPorId) {
            try {
                // Criar registro de indicação
                const indicacaoRef = doc(collection(db, COLECOES.indicacoes));
                await setDoc(indicacaoRef, {
                    indicadorId: indicadoPorId,
                    indicadorNome: indicadorNome,
                    indicadoId: user.uid,
                    indicadoNome: nome,
                    indicadoEmail: email,
                    indicadoTelefone: telefone,
                    codigoUsado: codigoIndicacao,
                    status: 'cadastrado',
                    pontos: 0,
                    dataCadastro: serverTimestamp(),
                    dataConversao: null
                });
                
                // Atualizar contador de indicações do indicador
                await updateDoc(doc(db, COLECOES.usuarios, indicadoPorId), {
                    totalIndicacoes: increment(1),
                    pontosTotais: increment(1),
                    pontosResgataveis: increment(1)
                });
                
                // Criar notificação para o indicador
                try {
                    await setDoc(doc(collection(db, COLECOES.notificacoes)), {
                        usuarioId: indicadoPorId,
                        tipo: 'nova_indicacao',
                        titulo: 'Nova Indicação!',
                        mensagem: `${nome} se cadastrou usando seu código de indicação. Você ganhou 1 ponto!`,
                        lida: false,
                        data: serverTimestamp()
                    });
                } catch (notifErr) {
                    console.log('Notificação não enviada:', notifErr);
                }
            } catch (indErr) {
                console.log('Erro ao registrar indicação:', indErr);
            }
        }
        
        showToast('Cadastro realizado com sucesso!', 'success');
        
        // Redirecionar para o dashboard
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
        
    } catch (error) {
        console.error('Erro no cadastro:', error);
        
        let mensagem = 'Erro ao criar conta. Tente novamente.';
        
        if (error.code === 'auth/email-already-in-use') {
            mensagem = 'Este e-mail já está cadastrado';
        } else if (error.code === 'auth/invalid-email') {
            mensagem = 'E-mail inválido';
        } else if (error.code === 'auth/weak-password') {
            mensagem = 'Senha muito fraca';
        } else if (error.message) {
            mensagem = error.message;
        }
        
        showToast(mensagem, 'error');
        
        // Reabilitar botão
        btnCadastro.disabled = false;
        btnCadastro.innerHTML = '<span>Criar minha conta</span><i class="fas fa-check"></i>';
    }
});

// Cadastro com Google
window.cadastroWithGoogle = async function() {
    const provider = new GoogleAuthProvider();
    
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        // Verificar se o usuário já existe
        const userDoc = await getDoc(doc(db, COLECOES.usuarios, user.uid));
        
        if (userDoc.exists()) {
            showToast('Você já tem uma conta. Faça login.', 'error');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
            return;
        }
        
        // Pegar código de indicação (do campo ou da URL)
        let codigoIndicacao = document.getElementById('codigoIndicacao').value.trim().toUpperCase();
        if (!codigoIndicacao) {
            codigoIndicacao = codigoDaURLGlobal;
        }
        
        let indicadoPorId = null;
        let indicadorNomeVal = null;
        
        if (codigoIndicacao) {
            try {
                const q = query(collection(db, COLECOES.usuarios), where('codigoIndicacao', '==', codigoIndicacao));
                const querySnapshot = await getDocs(q);
                
                if (!querySnapshot.empty) {
                    indicadoPorId = querySnapshot.docs[0].id;
                    indicadorNomeVal = querySnapshot.docs[0].data().nome;
                }
            } catch (err) {
                console.log('Erro ao buscar indicador:', err);
            }
        }
        
        // Gerar código de indicação único
        const codigoUnico = await gerarCodigoIndicacao();
        
        // Criar documento do usuário
        await setDoc(doc(db, COLECOES.usuarios, user.uid), {
            nome: user.displayName || 'Usuário',
            email: user.email,
            telefone: '',
            cidade: '',
            codigoIndicacao: codigoUnico,
            indicadoPor: indicadoPorId,
            indicadoPorCodigo: codigoIndicacao || null,
            pontosTotais: 0,
            pontosResgataveis: 0,
            pontosResgatados: 0,
            totalIndicacoes: 0,
            indicacoesConvertidas: 0,
            apolicesAtivas: 0,
            ativo: true,
            isCliente: false,
            dataCadastro: serverTimestamp(),
            ultimaAtualizacao: serverTimestamp()
        });
        
        // Se foi indicado, registrar indicação
        if (indicadoPorId) {
            try {
                const indicacaoRef = doc(collection(db, COLECOES.indicacoes));
                await setDoc(indicacaoRef, {
                    indicadorId: indicadoPorId,
                    indicadorNome: indicadorNomeVal,
                    indicadoId: user.uid,
                    indicadoNome: user.displayName || 'Usuário',
                    indicadoEmail: user.email,
                    indicadoTelefone: '',
                    codigoUsado: codigoIndicacao,
                    status: 'cadastrado',
                    pontos: 0,
                    dataCadastro: serverTimestamp(),
                    dataConversao: null
                });
                
                await updateDoc(doc(db, COLECOES.usuarios, indicadoPorId), {
                    totalIndicacoes: increment(1),
                    pontosTotais: increment(1),
                    pontosResgataveis: increment(1)
                });
                
                try {
                    await setDoc(doc(collection(db, COLECOES.notificacoes)), {
                        usuarioId: indicadoPorId,
                        tipo: 'nova_indicacao',
                        titulo: 'Nova Indicação!',
                        mensagem: `${user.displayName || 'Alguém'} se cadastrou usando seu código. Você ganhou 1 ponto!`,
                        lida: false,
                        data: serverTimestamp()
                    });
                } catch (notifErr) {
                    console.log('Notificação não enviada:', notifErr);
                }
            } catch (indErr) {
                console.log('Erro ao registrar indicação:', indErr);
            }
        }
        
        showToast('Cadastro realizado com sucesso!', 'success');
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
        
    } catch (error) {
        console.error('Erro no cadastro com Google:', error);
        showToast(error.message || 'Erro ao cadastrar com Google', 'error');
    }
};
