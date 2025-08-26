// auth.js

// Obtém vínculos do usuário com empresas
async function getUserVinculos(uid){
  const col = await db.collection('usuarios_empresa').doc(uid).collection('vinculos').get();
  return col.docs.map(d => ({ empresaId: d.id, ...d.data() }));
}

// Garante sessão nas páginas protegidas
async function ensureAuthOrRedirect(target='empresa'){
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if(!user){
        if (target === 'empresa') window.location.replace('./login.html');
        else resolve(null);
        return;
      }
      const vinculos = await getUserVinculos(user.uid);
      resolve({ user, vinculos });
    });
  });
}

// Logout padrão
async function doLogout(){
  await auth.signOut();
  window.location.replace('./login.html');
}
