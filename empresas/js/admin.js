// admin.js
(async function init(){
  const sess = await ensureAuthOrRedirect('admin');

  const form = document.getElementById('formEmpresa');
  const msg  = document.getElementById('msgAdmin');

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const nome = document.getElementById('nomeEmpresa').value.trim();
    const cnpj = document.getElementById('cnpjEmpresa').value.trim();
    if(!nome){ alert('Informe o nome da empresa.'); return; }

    try{
      const ref = await db.collection(COL.EMPRESAS).add({
        nome, cnpj, status:'ativo',
        ownerUid: auth.currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await db.collection(COL.USU_EMPRESA).doc(auth.currentUser.uid)
        .collection('vinculos').doc(ref.id).set({ role:'owner' });

      msg.textContent = `Empresa criada com ID ${ref.id}`;
      msg.classList.remove('hidden');
      (document.getElementById('empresaIdConvite')).value = ref.id;
    }catch(err){
      alert(err.message || String(err));
    }
  });

  document.getElementById('btnGerarConvite').onclick = async ()=>{
    const empresaId = document.getElementById('empresaIdConvite').value.trim();
    const role = document.getElementById('roleConvite').value;
    if(!empresaId){ alert('Informe o empresaId.'); return; }

    const link = `/empresas/login.html?join=${encodeURIComponent(empresaId)}&role=${encodeURIComponent(role)}`;
    document.getElementById('linkConvite').value = link;
  };
})();
