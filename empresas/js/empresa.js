// empresa.js

(async function init(){
  const sess = await ensureAuthOrRedirect('empresa');
  const user = sess.user;
  const vinculos = sess.vinculos;

  document.getElementById('btnLogout').onclick = doLogout;

  if(!vinculos.length){
    alert('Seu usuário ainda não está vinculado a nenhuma empresa.');
    window.location.replace('./login.html');
    return;
  }

  // Se vier empresaId pela URL (?empresaId=xxx), respeita. Senão pega a primeira.
  const params = new URLSearchParams(location.search);
  const urlEmpresaId = params.get('empresaId');
  const atualEmpresaId = urlEmpresaId || vinculos[0].empresaId;
  const meuVinculo = vinculos.find(v => v.empresaId === atualEmpresaId) || vinculos[0];

  // Render menu
  renderMenu('menuList', (id)=> loadSection(id, atualEmpresaId, meuVinculo.role));

  // Header empresa
  const empresaSnap = await db.collection('empresas').doc(atualEmpresaId).get();
  const empresa = { id: atualEmpresaId, ...empresaSnap.data() };
  document.getElementById('empresaNome').textContent = empresa.nome || 'Minha Empresa';
  renderUserBox('usuarioBox', user, `acesso: ${meuVinculo.role}`);

  // Seção inicial
  await loadOverview(atualEmpresaId);
  await loadSeguros(atualEmpresaId);

  async function loadSection(sectionId, empresaId, role){
    const content = document.getElementById('content');
    if(sectionId === 'overview'){
      content.querySelector('#cards').innerHTML = ''; // recalculará
      await loadOverview(empresaId);
      await loadSeguros(empresaId);
    }
    if(sectionId === 'seguros'){
      content.querySelector('#cards').innerHTML = '';
      content.querySelector('#listaSeguros').innerHTML = tableSegurosHeader();
      await loadSeguros(empresaId);
      document.getElementById('btnNovoSeguro').onclick = () => {
        if(role === 'colaborador') return alert('Somente Gestor/Owner pode adicionar.');
        // aqui abriremos um modal simples numa próxima iteração
        alert('Em breve: modal para adicionar seguro.');
      };
    }
    // as demais seções vamos plugando depois...
  }

  async function loadOverview(empresaId){
    // KPIs simples: total seguros, prêmio total, próximos a vencer (<=30d)
    const snap = await db.collection('empresas').doc(empresaId).collection('seguros').get();
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
    const snap = await db.collection('empresas').doc(empresaId).collection('seguros').orderBy('fimVigencia','asc').get();
    const rows = snap.docs.map(d => rowSeguro({ id:d.id, ...d.data() })).join('');
    tbody.innerHTML = rows || `<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">Nenhuma apólice cadastrada ainda.</td></tr>`;
  }
})();
