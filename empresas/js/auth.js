// auth.js

// === Admin global do módulo c.* (mesmo e-mail das rules) ===
function isCGlobalAdmin(user) {
  if (!user || !user.email) return false;
  const adminEmails = [
    "patrick@retornoseguros.com.br",
  ];
  return adminEmails.includes(user.email.toLowerCase());
}

// Obtém vínculos do usuário (módulo c.*)
async function getUserVinculos(uid){
  const col = await db.collection(COL.USU_EMPRESA).doc(uid).collection('vinculos').get();
  return col.docs.map(d => ({ empresaId: d.id, ...d.data() }));
}

// Guarda de rota para páginas protegidas
async function ensureAuthOrRedirect(target='empresa'){
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if(!user){
        if (target === 'empresa' || target === 'admin') window.location.replace('/empresas/login.html');
        else resolve(null);
        return;
      }
      const vinculos = await getUserVinculos(user.uid);
      const isAdminGlobal = isCGlobalAdmin(user);
      resolve({ user, vinculos, isAdminGlobal });
    });
  });
}

// Logout
async function doLogout(){
  await auth.signOut();
  window.location.replace('/empresas/login.html');
}
