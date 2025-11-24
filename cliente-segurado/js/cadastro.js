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
        
        // Verificar se o código já existe
        const q = query(collection(db, 'usuarios'), where('codigoIndicacao', '==', codigo));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            return codigo;
        }
        
        tentativas++;
    }
    
    throw new Error('Não foi possível gerar um código único. Tente novamente.');
}

// Verificar código de indicação
document.getElementById('codigoIndicacao').addEventListener('blur', async function() {
    const codigo = this.value.trim().toUpperCase();
    const indicadorNome = document.getElementById('indicadorNome');
    
    if (!codigo) {
        indicadorNome.textContent = '';
        return;
    }
    
    try {
        const q = query(collection(db, 'usuarios'), where('codigoIndicacao', '==', codigo));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const indicador = querySnapshot.docs[0].data();
            indicadorNome.textContent = `✓ Você será indicado por ${indicador.nome}`;
            indicadorNome.style.color = 'var(--success)';
        } else {
            indicadorNome.textContent = '✗ Código de indicação inválido';
            indicadorNome.style.color = 'var(--danger)';
        }
    } catch (error) {
        console.error('Erro ao verificar código:', error);
    }
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
        // Verificar se o código de indicação é válido (se fornecido)
        let indicadoPorId = null;
        if (codigoIndicacao) {
            const q = query(collection(db, 'usuarios'), where('codigoIndicacao', '==', codigoIndicacao));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                throw new Error('Código de indicação inválido');
            }
            
            indicadoPorId = querySnapshot.docs[0].id;
        }
        
        // Criar usuário no Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;
        
        // Atualizar nome no perfil
        await updateProfile(user, {
            displayName: nome
        });
        
        // Gerar código de indicação único para este usuário
        const codigoUnico = await gerarCodigoIndicacao();
        
        // Criar documento do usuário no Firestore
        await setDoc(doc(db, 'usuarios', user.uid), {
            nome: nome,
            email: email,
            telefone: telefone,
            cidade: cidade,
            codigoIndicacao: codigoUnico,
            indicadoPor: indicadoPorId,
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
            // Criar registro de indicação
            const indicacaoRef = doc(collection(db, 'indicacoes'));
            await setDoc(indicacaoRef, {
                indicadorId: indicadoPorId,
                indicadoId: user.uid,
                indicadoNome: nome,
                indicadoEmail: email,
                indicadoTelefone: telefone,
                status: 'cadastrado',
                pontos: 0,
                dataCadastro: serverTimestamp(),
                dataConversao: null
            });
            
            // Atualizar contador de indicações do indicador
            await updateDoc(doc(db, 'usuarios', indicadoPorId), {
                totalIndicacoes: increment(1),
                pontosTotais: increment(1) // 1 ponto por indicação
            });
            
            // Criar notificação para o indicador
            await setDoc(doc(collection(db, 'notificacoes')), {
                usuarioId: indicadoPorId,
                tipo: 'nova_indicacao',
                titulo: 'Nova Indicação!',
                mensagem: `${nome} se cadastrou usando seu código de indicação`,
                lida: false,
                data: serverTimestamp()
            });
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
        const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
        
        if (userDoc.exists()) {
            showToast('Você já tem uma conta. Faça login.', 'error');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
            return;
        }
        
        // Pegar código de indicação se foi fornecido
        const codigoIndicacao = document.getElementById('codigoIndicacao').value.trim().toUpperCase();
        let indicadoPorId = null;
        
        if (codigoIndicacao) {
            const q = query(collection(db, 'usuarios'), where('codigoIndicacao', '==', codigoIndicacao));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                indicadoPorId = querySnapshot.docs[0].id;
            }
        }
        
        // Gerar código de indicação único
        const codigoUnico = await gerarCodigoIndicacao();
        
        // Criar documento do usuário
        await setDoc(doc(db, 'usuarios', user.uid), {
            nome: user.displayName || 'Usuário',
            email: user.email,
            telefone: '',
            cidade: '',
            codigoIndicacao: codigoUnico,
            indicadoPor: indicadoPorId,
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
            const indicacaoRef = doc(collection(db, 'indicacoes'));
            await setDoc(indicacaoRef, {
                indicadorId: indicadoPorId,
                indicadoId: user.uid,
                indicadoNome: user.displayName || 'Usuário',
                indicadoEmail: user.email,
                indicadoTelefone: '',
                status: 'cadastrado',
                pontos: 0,
                dataCadastro: serverTimestamp(),
                dataConversao: null
            });
            
            await updateDoc(doc(db, 'usuarios', indicadoPorId), {
                totalIndicacoes: increment(1),
                pontosTotais: increment(1)
            });
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
