document.addEventListener('DOMContentLoaded', () => {
  preencherRMs();
  carregarVencimentos();
});

async function preencherRMs() {
  const select = document.getElementById("rmFiltro");
  const rmsSet = new Set();

  try {
    const visitasSnap = await firebase.firestore().collection("visitas").get();
    visitasSnap.forEach(doc => {
      const data = doc.data();
      if (data.rmNome) rmsSet.add(data.rmNome);
      if (data.rm) rmsSet.add(data.rm);
    });

    const negociosSnap = await firebase.firestore().collection("cotacoes-gerentes").where("status", "==", "Negócio Emitido").get();
    negociosSnap.forEach(doc => {
      const data = doc.data();
      if (data.rmNome) rmsSet.add(data.rmNome);
    });

    const rms = Array.from(rmsSet).filter(Boolean).sort();
    rms.forEach(rm => {
      const option = document.createElement("option");
      option.value = rm;
      option.textContent = rm;
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Erro ao preencher RMs:", error.message);
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
      const rm = data.rmNome || data.rm || '';

      const ramos = data.ramos || {};
      Object.keys(ramos).forEach(ramoKey => {
        const ramoData = ramos[ramoKey];
        if (!ramoData || !ramoData.vencimento) return;

        const vencimento = ramoData.vencimento;
        const [dia, mes] = vencimento.split('/');
        if (mesFiltro && mesFiltro !== mes) return;
        if (rmFiltro && rmFiltro !== '' && rm !== rmFiltro) return;

        vencimentos.push({
          empresa,
          ramo: capitalizar(ramoKey),
          rm,
          valor: ramoData.premio || 0,
          vencimento,
          origem: 'Mapeado em visita',
          estilo: 'mapeado'
        });
      });
    });

    // === NEGÓCIOS FECHADOS (COTAÇÕES GERENTES) ===
    const negociosSnap = await firebase.firestore()
      .collection('cotacoes-gerentes')
      .where("status", "==", "Negócio Emitido")
      .get();

    negociosSnap.forEach(doc => {
      const data = doc.data();
      const empresa = data.empresaNome || '';
      const rm = data.rmNome || '';
      const fimVigencia = data.fimVigencia || '';
      const ramo = data.ramo || '';

      if (!fimVigencia.includes('-')) return; // formato ISO
      const [ano, mes, dia] = fimVigencia.split('-');
      if (mesFiltro && mesFiltro !== mes) return;
      if (rmFiltro && rmFiltro !== '' && rm !== rmFiltro) return;

      const vencimentoFormatado = `${dia}/${mes}/${ano}`;

      vencimentos.push({
        empresa,
        ramo,
        rm,
        valor: data.premioLiquido || 0,
        vencimento: vencimentoFormatado,
        origem: 'Fechado conosco',
        estilo: 'fechado'
      });
    });

    // === Ordenar por data (mês/dia)
    vencimentos.sort((a, b) => {
      const [da, ma] = a.vencimento.split('/');
      const [db, mb] = b.vencimento.split('/');
      return parseInt(mb + db) - parseInt(ma + da);
    });

    // === Exibir na tabela
    if (vencimentos.length === 0) {
      tabela.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhum vencimento encontrado.</td></tr>';
    } else {
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

  } catch (error) {
    console.error("🔥 Erro ao carregar vencimentos:", error.message, error.stack);
    tabela.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Erro ao carregar dados.</td></tr>';
  }
}

// Função para capitalizar o nome do ramo
function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
