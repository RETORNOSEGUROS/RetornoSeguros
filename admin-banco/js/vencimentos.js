const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', () => {
  preencherRMs();
  carregarVencimentos();
});

async function preencherRMs() {
  const select = document.getElementById("rmFiltro");
  const rmsSet = new Set();

  const visitasSnap = await db.collection("visitas").get();
  visitasSnap.forEach(doc => {
    const data = doc.data();
    if (data.rm) rmsSet.add(data.rm);
  });

  const negociosSnap = await db.collection("negocios-fechados").get();
  negociosSnap.forEach(doc => {
    const data = doc.data();
    if (data.rm) rmsSet.add(data.rm);
  });

  const rms = Array.from(rmsSet).sort();
  rms.forEach(rm => {
    const option = document.createElement("option");
    option.value = rm;
    option.textContent = rm;
    select.appendChild(option);
  });
}

async function carregarVencimentos() {
  const mesFiltro = document.getElementById('mesFiltro').value;
  const rmFiltro = document.getElementById('rmFiltro').value;
  const tabela = document.getElementById('tabelaVencimentos');
  tabela.innerHTML = '';

  const vencimentos = [];

  // --- VISITAS ---
  const visitasSnap = await db.collection('visitas').get();
  visitasSnap.forEach(doc => {
    const data = doc.data();
    const empresa = data.empresaNome || 'Empresa';
    const rm = data.rm || '';
    if (!data.seguros) return;

    data.seguros.forEach(seg => {
      if (!seg.vencimento) return;
      const [dia, mes] = seg.vencimento.split('/');
      if (mesFiltro && mesFiltro !== mes) return;
      if (rmFiltro && rmFiltro !== '' && rm !== rmFiltro) return;

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

  // --- NEGÓCIOS FECHADOS ---
  const negociosSnap = await db.collection('negocios-fechados').get();
  negociosSnap.forEach(doc => {
    const data = doc.data();
    const empresa = data.empresa || '';
    const rm = data.rm || '';
    const fim = data.fim || '';
    if (!fim.includes('/')) return;
    const [dia, mes] = fim.split('/');
    if (mesFiltro && mesFiltro !== mes) return;
    if (rmFiltro && rmFiltro !== '' && rm !== rmFiltro) return;

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

  // Ordenar por data
  vencimentos.sort((a, b) => {
    const [da, ma] = a.vencimento.split('/');
    const [db, mb] = b.vencimento.split('/');
    return parseInt(ma + da) - parseInt(mb + db);
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
