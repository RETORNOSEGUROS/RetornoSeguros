// empresa.js
(async function init(){
  const sess = await ensureAuthOrRedirect('empresa');
  const user = sess.user;
  const vinculos = sess.vinculos || [];
  const isAdminGlobal = !!sess.isAdminGlobal;

  document.getElementById('btnLogout').onclick = doLogout;

  const params = new URLSearchParams(location.search);
  let atualEmpresaId = params.get('empresaId');

  // --- Decisão de acesso ---
  if (!vinculos.length && !isAdminGlobal) {
    alert('Seu usuário ainda não está vinculado a nenhuma empresa.');
    window.location.replace('/empresas/login.html');
    return;
  }

  // Se tem vínculo e não veio empresaId, usa o primeiro vínculo
  if (vinculos.length && !atualEmpresaId) {
    atualEmpresaId = vinculos[0].empresaId;
  }

  // Se é admin global e não tem empresaId nem vínculos, lista empresas e escolhe a primeira
  if (isAdminGlobal && !atualEmpresaId) {
    const lista = await db.collection(COL.EMPRESAS).limit(20).get();
    if (lista.empty) {
      document.getElementById('empresaNome').textContent = 'Sem empresas cadastradas';
      document.getElementById('usuarioBox').textContent = `${user.email} • admin`;
      // Nada para carregar
      return;
    }
    // monta seletor rápido
    const nav = document.getElementById('menuList');
    const wrap = document.createElement('div');
    wrap.className = 'p-3';
    const sel = document.createElement('select');
    sel.className = 'w-full border rounded-lg px-3 py-2 mb-3';
    lista.docs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id; opt.textContent = `${d.data().nome || '(sem nome)'} — ${d.id}`;
      sel.appendChild(opt);
    });
    const go = document.createElement('button');
    go.className = 'w-full px-3 py-2 rounded-lg bg-indigo-600 text-white';
    go.textContent = 'Abrir empresa selecionada';
    go.onclick = () => {
      const id = sel.value;
      window.location.replace('/empresas/empresa.html?empresaId='+encodeURIComponent(id));
    };
    wrap.appendChild(sel); wrap.appendChild(go);
    nav.appendChild(wrap);

    document.getElementById('empresaNome').textContent = 'Selecione uma empresa';
    document.getElementById('usuarioBox').textContent = `${user.email} • admin`;
    // Para aqui; aguarda escolha
    return;
  }

  // Neste ponto, já temos um empresaId válido
  const meuVinculo = vinculos.find(v => v.empresaId === atualEmpresaId) || { role: (isAdminGlobal ? 'admin' : 'colaborador') };

  // Render menu
  renderMenu('menuList', (id)=> loadSection(id, atualEmpresaId, meuVinculo.role));

  // Header
  const empresaSnap = await db.collection(COL.EMPRESAS).doc(atualEmpresaId).get();
  if (!empresaSnap.exists) {
    alert('Empresa não encontrada.');
    return;
  }
  const empresa = { id: atualEmpresaId, ...empresaSnap.data() };
  document.getElementById('empresaNome').textContent = empresa.nome || 'Minha Empresa';
  document.getElementById('usuarioBox').textContent = `${user.email} • ${meuVinculo.role}`;

  // Seção inicial
  await loadOverview(atualEmpresaId);
  await loadSeguros(atualEmpresaId);

  async function loadSection(sectionId, empresaId, role){
    const content = document.getElementById('content');
    if(sectionId === 'overview'){
      content.querySelector('#cards').innerHTML = '';
      await loadOverview(empresaId);
      await loadSeguros(empresaId);
    }
    if(sectionId === 'seguros'){
      content.querySelector('#cards').innerHTML = '';
      content.querySelector('#listaSeguros').innerHTML = tableSegurosHeader();
      await loadSeguros(empresaId);
      document.getElementById('btnNovoSeguro').onclick = () => {
        if(role === 'colaborador') return alert('Somente Gestor/Owner pode adicionar.');
        alert('Em breve: modal para adicionar seguro.');
      };
    }
  }

  async function loadOverview(empresaId){
    const snap = await db.collection(COL.EMPRESAS).doc(empresaId).collection(COL.APOLICES).get();
    const items = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    const total = items.length;
    const premioTotal = items.reduce((sum, s)=> sum + Number(s.premio||0), 0);

    const hoje = new Date();
    const plus30 = new Date(); plus30.setDate(hoje.getDate()+30);
    const proximos = items.filter(s => {
      const fim = s.fimVigencia ? new Date(s.fimVigencia) : null;
      return fim && fim >= hoje && fim <= plus30;
    }).length;

    const cards = document.getElementById('cards');
    cards.innerHTML = [
      cardMetric('Seguros ativos', total, 'Total de apólices vinculadas'),
      cardMetric('Prêmio total', 'R$ '+premioTotal.toLocaleString('pt-BR'), 'Soma R$ vigente'),
      cardMetric('Vencem em 30 dias', proximos, 'Atenção para renovação'),
      cardMetric('Indicações válidas', 0, 'em breve'),
    ].join('');
  }

  async function loadSeguros(empresaId){
    const box = document.getElementById('listaSeguros');
    if(!box.innerHTML.trim()) box.innerHTML = tableSegurosHeader();

    const tbody = document.getElementById('tbodySeguros');
    const snap = await db.collection(COL.EMPRESAS).doc(empresaId)
      .collection(COL.APOLICES)
      .orderBy('fimVigencia','asc').get();

    const rows = snap.docs.map(d => rowSeguro({ id:d.id, ...d.data() })).join('');
    tbody.innerHTML = rows || `<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">Nenhuma apólice cadastrada ainda.</td></tr>`;
  }
})();
