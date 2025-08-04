// Aguarda Firebase estar disponível antes de continuar
function aguardarFirebase(callback) {
  if (typeof firebase !== 'undefined' && firebase.firestore) {
    callback();
  } else {
    setTimeout(() => aguardarFirebase(callback), 200);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  aguardarFirebase(() => {
    preencherRMs();
    carregarVencimentos();
  });
});

async function preencherRMs() {
  const select = document.getElementById("rmFiltro");
  const rmsSet = new Set();

  try {
    const visitasSnap = await firebase.firestore().collection("visitas").get();
    visitasSnap.forEach(doc => {
      const data = doc.data();
      if (data.rm && data.rm.trim() !== "") {
        rmsSet.add(data.rm.trim());
      }
    });

    const negociosSnap = await firebase.firestore().collection("negocios-fechados").get();
    negociosSnap.forEach(doc => {
      const data = doc.data();
      if (data.rm && data.rm.trim() !== "") {
        rmsSet.add(data.rm.trim());
      }
    });

    const rms = Array.from(rmsSet).sort();
    rms.forEach(rm => {
      const option = document.createElement("option");
      option.value = rm;
      option.textContent = rm;
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Erro ao preencher RMs:", error);
  }
}

async function carregarVencimentos() {
  const mesFiltro = document.getElementById('mesFiltro').value;
  const rmFiltro = document.getElementById('rmFiltro').value;
  const tabela = document.getElementById('tabelaVencimentos');
  tabela.innerHTML = '';

  const vencimentos = [];

  try {
    // === VISITAS ===
    const visitasSnap = await firebase.firestore().collection('visitas').get();
    visitasSnap.forEach(doc => {
      const data = doc.data();
      const empresa = data.empresaNome || data.empresa || 'Empresa';
      const rm = data.rm || '';

      if (!Array.isArray(data.seguros)) return;

      data.seguros.forEach(seg => {
        if (!seg.vencimento || !seg.ramo) return;
        const [dia, mes] = seg.vencimento.split('/');
        if (mesFiltro && mesFiltro !== mes) return;
        if (rmFiltro && rmFiltro !== '' && rm !== rmFiltro) return;

        vencimentos.push({
          empresa,
          ramo: seg.ramo,
          rm,
          valor: seg.valor || 0,
          vencimento: seg.vencimento,
          origem: 'Mapeado em visita',
          estilo: 'mapeado'
        });
      });
    });

    // === NEGÓCIOS FECHADOS ===
    const negociosSnap = await firebase.firestore().collection('negocios-fechados').get();
    negociosSnap.forEach(doc => {
      const data = doc.data();
      const empresa = data.empresa || '';
      const rm = data.rm || '';
      const fim = data.fim || '';
      const ramo = data.ramo || '';

      if (!fim.includes('/')) return;
      const [dia, mes] = fim.split('/');
      if (mesFiltro && mesFiltro !== mes) return;
      if (rmFiltro && rmFiltro !== '' && rm !== rmFiltro) return;

      vencimentos.push({
        empresa,
        ramo,
        rm,
        valor: data.premio || 0,
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

    if (vencimentos.length === 0) {
      tabela.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhum vencimento encontrado.</td></tr>';
    }

  } catch (error) {
    console.error("Erro ao carregar vencimentos:", error);
    tabela.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Erro ao carregar dados.</td></tr>';
  }
}
