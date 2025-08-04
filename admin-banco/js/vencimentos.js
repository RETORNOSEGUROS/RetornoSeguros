const db = firebase.firestore();

async function carregarVencimentos() {
  const mesFiltro = document.getElementById('mesFiltro').value;
  const rmFiltro = document.getElementById('rmFiltro').value.toLowerCase();
  const tabela = document.getElementById('tabelaVencimentos');
  tabela.innerHTML = '';

  const vencimentos = [];

  // --- COLEÇÃO VENCIMENTOS ---
  const vencimentosSnap = await db.collection('vencimentos').get();
  vencimentosSnap.forEach(doc => {
    const data = doc.data();
    const empresa = data.empresaNome || 'Empresa';
    const rm = data.rm || '';
    if (!data.seguros) return;

    data.seguros.forEach(seg => {
      if (!seg.vencimento) return;
      const [dia, mes] = seg.vencimento.split('/');
      if (mesFiltro && mesFiltro !== mes) return;
      if (rmFiltro && !rm.toLowerCase().includes(rmFiltro)) return;

      vencimentos.push({
        empresa,
        ramo: seg.ramo,
        rm,
        valor: seg.valor,
        vencimento: seg.vencimento,
        origem: 'Mapeado em visita',
        estilo: 'mapeado'
      });
    });
  });

  // --- COLEÇÃO NEGÓCIOS-FECHADOS ---
  const negociosSnap = await db.collection('negocios-fechados').get();
  negociosSnap.forEach(doc => {
    const data = doc.data();
    const empresa = data.empresa || '';
    const rm = data.rm || '';
    const fim = data.fim || '';
    if (!fim.includes('/')) return;
    const [dia, mes] = fim.split('/');
    if (mesFiltro && mesFiltro !== mes) return;
    if (rmFiltro && !rm.toLowerCase().includes(rmFiltro)) return;

    vencimentos.push({
      empresa,
      ramo: data.ramo,
      rm,
      valor: data.premio,
      vencimento: fim,
      origem: 'Fechado conosco',
      estilo: 'fechado'
    });
  });

  // Exibir na tabela
  vencimentos.forEach(v => {
    const tr = document.createElement('tr');
    tr.className = v.estilo;
    tr.innerHTML = `
      <td>${v.empresa}</td>
      <td>${v.ramo}</td>
      <td>${v.rm}</td>
      <td>R$ ${parseFloat(v.valor).toLocaleString('pt-BR')}</td>
      <td>${v.vencimento}</td>
      <td>${v.origem}</td>
    `;
    tabela.appendChild(tr);
  });
}
