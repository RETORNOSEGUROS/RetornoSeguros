// Obtém vínculos do usuário (módulo c.*)
async function getUserVinculos(uid){
  const col = await db.collection(COL.USU_EMPRESA).doc(uid).collection('vinculos').get();
  return col.docs.map(d => ({ empresaId: d.id, ...d.data() }));
}

async function ensureAuthOrRedirect(target='empresa'){
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if(!user){
        if (target === 'empresa' || target === 'admin') window.location.replace('/empresas/login.html');
        else resolve(null);
        return;
      }
      const vinculos = await getUserVinculos(user.uid);
      resolve({ user, vinculos });
    });
  });
}

async function doLogout(){
  await auth.signOut();
  window.location.replace('/empresas/login.html');
}
