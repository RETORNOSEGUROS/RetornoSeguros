// /empresas/js/admin.js
(function(){
  const onlyDigits = (v) => (v || '').replace(/\D+/g,'');
  const formatCNPJ = (v) => {
    v = onlyDigits(v).slice(0,14);
    if (v.length <= 2) return v;
    if (v.length <= 5) return v.replace(/^(\d{2})(\d+)/, "$1.$2");
    if (v.length <= 8) return v.replace(/^(\d{2})(\d{3})(\d+)/, "$1.$2.$3");
    if (v.length <= 12) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d+)/, "$1.$2.$3/$4");
    return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, "$1.$2.$3/$4-$5");
  };

  let lastDoc = null;     // paginação
  let currentQuery = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const sess = await ensureAuthOrRedirect('admin');
    if (!sess) return;

    // === CRIAR EMPRESA ===
    const form = document.getElementById('formEmpresa');
    const msg  = document.getElementById('msgAdmin');
    const inputNome = document.getElementById('nomeEmpresa');
    const inputCnpj = document.getElementById('cnpjEmpresa');

    inputCnpj.addEventListener('input', (e)=>{
      const start = e.target.selectionStart;
      e.target.value = formatCNPJ(e.target.value);
      e.target.selectionStart = e.target.selectionEnd = start;
    });

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const nome = (inputNome.value || '').trim();
      const cnpjRaw = onlyDigits(inputCnpj.value);
      if(!nome){ alert('Informe o nome da empresa.'); return; }
      if(cnpjRaw.length !== 14){ alert('CNPJ inválido.'); return; }

      try{
        // Duplicidade
        const dup = await db.collection(COL.EMPRESAS).where('cnpjRaw','==',cnpjRaw).limit(1).get();
        if(!dup.empty){
          const idExistente = dup.docs[0].id;
          if(confirm('Já existe empresa com esse CNPJ. Abrir agora?')){
            window.location.href = `/empresas/empresa.html?empresaId=${idExistente}`;
          }
          return;
        }

        const ref = await db.collection(COL.EMPRESAS).add({
          nome,
          cnpj: formatCNPJ(cnpjRaw),
          cnpjRaw,
          status:'ativo',
          ownerUid: auth.currentUser.uid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // vincula criador como owner (útil p/ trilhar permissões depois)
        await db.collection(COL.USU_EMPRESA).doc(auth.currentUser.uid)
          .collection('vinculos').doc(ref.id).set({ role:'owner' });

        msg.innerHTML = `
          Empresa criada com ID <b>${ref.id}</b>.
          <a href="/empresas/empresa.html?empresaId=${ref.id}" class="text-indigo-700 underline">Abrir agora</a>
        `;
        msg.classList.remove('hidden');

        // já preenche campo para convite
        document.getElementById('empresaIdConvite').value = ref.id;

        // Recarrega a lista (se a aba estiver aberta)
        resetLista(); await carregarEmpresas();
      }catch(err){
        alert(err.message || String(err));
      }
    });

    // === CONVITES ===
    document.getElementById('btnGerarConvite').onclick = ()=>{
      const empresaId = document.getElementById('empresaIdConvite').value.trim();
      const role = document.getElementById('roleConvite').value;
      if(!empresaId){ alert('Informe o empresaId.'); return; }
      const link = `/empresas/login.html?join=${encodeURIComponent(empresaId)}&role=${encodeURIComponent(role)}`;
      document.getElementById('linkConvite').value = link;
    };

    // === LISTA / BUSCA ===
    document.getElementById('btnBuscar').onclick = async ()=>{
      resetLista();
      await carregarEmpresas();
    };
    document.getElementById('btnMais').onclick = async ()=>{
      await carregarEmpresas(true);
    };

    // carrega lista inicialmente (aba "lista" pode não estar visível, mas ok)
    resetLista();
    await carregarEmpresas();
  });

  function resetLista(){
    lastDoc = null;
    document.getElementById('tbodyEmpresas').innerHTML = '';
  }

  async function carregarEmpresas(more=false){
    const tbody = document.getElementById('tbodyEmpresas');
    const busca = (document.getElementById('buscaTexto').value || '').trim();
    const filtroStatus = document.getElementById('filtroStatus').value;

    let q = db.collection(COL.EMPRESAS).orderBy('createdAt','desc');

    // Filtros
    if (filtroStatus) q = q.where('status','==',filtroStatus);

    // Busca simples: se só números, tenta por CNPJ (cnpjRaw); caso contrário, por prefixo do nome (precisa de índice composto se adicionar where + orderBy)
    if (busca) {
      const digits = busca.replace(/\D+/g,'');
      if (digits.length >= 4) {
        q = q.where('cnpjRaw','>=',digits).where('cnpjRaw','<=',digits + '\uf8ff');
      } else {
        // prefix search por nome (requer campo auxiliar "nomeLower" salvo na criação/edição)
        // fallback: vamos filtrar em memória após fetch
      }
    }

    if (more && lastDoc) q = q.startAfter(lastDoc);
    q = q.limit(20);

    const snap = await q.get();
    if (snap.empty && !more) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500">Nenhuma empresa encontrada.</td></tr>`;
      return;
    }

    // render
    const rows = [];
    snap.docs.forEach(d=>{
      const x = d.data() || {};
      rows.push(`
        <tr class="border-t">
          <td class="px-4 py-2">${x.nome || '-'}</td>
          <td class="px-4 py-2">${x.cnpj || '-'}</td>
          <td class="px-4 py-2">${x.status || '-'}</td>
          <td class="px-4 py-2">
            <div class="flex flex-wrap gap-2">
              <a class="px-2 py-1 rounded bg-indigo-600 text-white" href="/empresas/empresa.html?empresaId=${d.id}">Abrir</a>
              <button class="px-2 py-1 rounded border" data-copy="${d.id}">Copiar ID</button>
              <button class="px-2 py-1 rounded border" data-conv-g="${d.id}">Convite gestor</button>
              <button class="px-2 py-1 rounded border" data-conv-c="${d.id}">Convite colaborador</button>
            </div>
          </td>
        </tr>
      `);
    });
    tbody.insertAdjacentHTML('beforeend', rows.join(''));

    // ações dos botões
    tbody.querySelectorAll('[data-copy]').forEach(b=>{
      b.onclick = ()=> {
        navigator.clipboard.writeText(b.getAttribute('data-copy'));
        b.textContent = 'Copiado!';
        setTimeout(()=> b.textContent = 'Copiar ID', 1200);
      };
    });
    tbody.querySelectorAll('[data-conv-g]').forEach(b=>{
      b.onclick = ()=> {
        const id = b.getAttribute('data-conv-g');
        document.getElementById('empresaIdConvite').value = id;
        document.getElementById('roleConvite').value = 'gestor_rh';
        document.getElementById('btnGerarConvite').click();
      };
    });
    tbody.querySelectorAll('[data-conv-c]').forEach(b=>{
      b.onclick = ()=> {
        const id = b.getAttribute('data-conv-c');
        document.getElementById('empresaIdConvite').value = id;
        document.getElementById('roleConvite').value = 'colaborador';
        document.getElementById('btnGerarConvite').click();
      };
    });

    // paginação
    if (!snap.empty) lastDoc = snap.docs[snap.docs.length - 1];
  }
})();
