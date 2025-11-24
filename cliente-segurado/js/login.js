// Login do Cliente - Retorno Seguros
import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Função para mostrar toast
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Toggle password visibility
window.togglePassword = function() {
    const senhaInput = document.getElementById('senha');
    const toggleBtn = document.querySelector('.toggle-password i');
    
    if (senhaInput.type === 'password') {
        senhaInput.type = 'text';
        toggleBtn.classList.remove('fa-eye');
        toggleBtn.classList.add('fa-eye-slash');
    } else {
        senhaInput.type = 'password';
        toggleBtn.classList.remove('fa-eye-slash');
        toggleBtn.classList.add('fa-eye');
    }
};

// Login com email e senha
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    const lembrar = document.getElementById('lembrar').checked;
    const btnLogin = document.getElementById('btnLogin');
    
    // Desabilitar botão
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<span>Entrando...</span><i class="fas fa-spinner fa-spin"></i>';
    
    try {
        // Definir persistência
        const persistence = lembrar ? browserLocalPersistence : browserSessionPersistence;
        await setPersistence(auth, persistence);
        
        // Fazer login
        const userCredential = await signInWithEmailAndPassword(auth, email, senha);
        const user = userCredential.user;
        
        // Verificar se o usuário existe na collection de clientes
        const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
        
        if (!userDoc.exists()) {
            throw new Error('Usuário não encontrado');
        }
        
        const userData = userDoc.data();
        
        // Verificar se está ativo
        if (userData.ativo === false) {
            await auth.signOut();
            throw new Error('Conta inativa. Entre em contato com o suporte.');
        }
        
        showToast('Login realizado com sucesso!', 'success');
        
        // Redirecionar para o dashboard
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);
        
    } catch (error) {
        console.error('Erro no login:', error);
        
        let mensagem = 'Erro ao fazer login. Tente novamente.';
        
        if (error.code === 'auth/invalid-credential') {
            mensagem = 'E-mail ou senha incorretos';
        } else if (error.code === 'auth/user-not-found') {
            mensagem = 'Usuário não encontrado';
        } else if (error.code === 'auth/wrong-password') {
            mensagem = 'Senha incorreta';
        } else if (error.code === 'auth/too-many-requests') {
            mensagem = 'Muitas tentativas. Tente novamente mais tarde.';
        } else if (error.message) {
            mensagem = error.message;
        }
        
        showToast(mensagem, 'error');
        
        // Reabilitar botão
        btnLogin.disabled = false;
        btnLogin.innerHTML = '<span>Entrar</span><i class="fas fa-arrow-right"></i>';
    }
});

// Login com Google
window.loginWithGoogle = async function() {
    const provider = new GoogleAuthProvider();
    
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        // Verificar se o usuário existe
        const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
        
        if (!userDoc.exists()) {
            // Se não existe, redirecionar para cadastro
            await auth.signOut();
            showToast('Conta não encontrada. Por favor, cadastre-se primeiro.', 'error');
            setTimeout(() => {
                window.location.href = 'cadastro.html';
            }, 2000);
            return;
        }
        
        const userData = userDoc.data();
        
        // Verificar se está ativo
        if (userData.ativo === false) {
            await auth.signOut();
            throw new Error('Conta inativa. Entre em contato com o suporte.');
        }
        
        showToast('Login realizado com sucesso!', 'success');
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);
        
    } catch (error) {
        console.error('Erro no login com Google:', error);
        showToast(error.message || 'Erro ao fazer login com Google', 'error');
    }
};

// Verificar se já está logado
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Verificar se o usuário existe no Firestore
        const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
        
        if (userDoc.exists() && userDoc.data().ativo !== false) {
            // Já está logado, redirecionar para dashboard
            window.location.href = 'dashboard.html';
        }
    }
});
