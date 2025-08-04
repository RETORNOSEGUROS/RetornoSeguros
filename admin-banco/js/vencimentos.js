const db = firebase.firestore();

document.addEventListener("DOMContentLoaded", () => {
  carregarRMs().then(() => carregarVencimentos());
});

async function carregarRMs() {
  const rmSelect = document.getElementById("rmFiltro");
  rmSelect.innerHTML = `<option value="">Todos</option>`;

  const rmsSet = new Set();

  const visitasSnap = await db.collection("visitas").get();
  visitasSnap.forEach(doc => {
    const data = doc.data();
    if (data.rmNome) rmsSet.add(data.rmNome);
    if (data.rm) rmsSet.add(data.rm);
  });

  const negociosSnap = await db.collection("cotacoes-gerentes").where("status", "==", "Negócio Emitido").get();
  negociosSnap.forEach(doc => {
    const data = doc.data();
    if (data.rmNome) rmsSet.add(data.rmNome);
  });

  const lista = Array.from(rmsSet).filter(Boolean).sort();
  lista.forEach(rm => {
    const opt = document.createElement("option");
    opt.value = rm;
    opt.textContent = rm;
    rmSelect.appendChild(opt);
  });
}

async function carregarVencimentos() {
  const mes = document.getElementById("mesFiltro").value;
  const rmFiltro = document.getElementById("rmFiltro").value;
  const tbody = document.getElementById("tabelaVencimentos");
  tbody.innerHTML = '';

  const vencimentos = [];

  // VISITAS
  const visitasSnap = await db.collection("visitas").get();
  visitasSnap.forEach(doc => {
    const data = doc.data();
    const empresa = data.empresaNome || data.empresa || 'Empresa';
    const rm = data.rmNome || data.rm || '';
    const ramos = data.ramos || {};

    Object.entries(ramos).forEach(([ramo, info]) => {
      if (!info.vencimento) return;

      const [dia, mesDoc] = info.vencimento.split('/');
      if (mes && mes !== mesDoc) return;
      if (rmFiltro && rm !== rmFiltro) return;

      vencimentos.push({
        empresa,
        ramo: capitalizar(ramo),
        rm,
        valor: info.premio || 0,
        vencimento: info.vencimento,
        origem: 'Mapeado em visita',
        estilo: 'mapeado'
      });
    });
  });

  // NEGÓCIOS FECHADOS
  const negociosSnap = await db.collection("cotacoes-gerentes")
    .where("status", "==", "Negócio Emitido")
    .get();

  negociosSnap.forEach(doc => {
    const data = doc.data();
    const rm = data.rmNome || '';
    const fim = data.fimVigencia || '';
    if (!fim.includes('-')) return;

    const [ano, mesDoc, dia] = fim.split('-');
    if (mes && mes !== mesDoc) return;
    if (rmFiltro && rm !== rmFiltro) return;

    vencimentos.push({
      empresa: data.empresaNome || 'Empresa',
      ramo: data.ramo || 'Ramo',
      rm,
      valor: data.premioLiquido || 0,
      vencimento: `${dia}/${mesDoc}/${ano}`,
      origem: 'Fechado conosco',
      estilo: 'fechado'
    });
  });

  // Exibir
  if (vencimentos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum vencimento encontrado.</td></tr>';
    return;
  }

  vencimentos.sort((a, b) => {
    const [da, ma] = a.vencimento.split('/');
    const [db, mb] = b.vencimento.split('/');
    return parseInt(ma + da) - parseInt(mb + db);
  });

  vencimentos.forEach(v => {
    const tr = document.createElement("tr");
    tr.className = v.estilo;
    tr.innerHTML = `
      <td>${v.empresa}</td>
      <td>${v.ramo}</td>
      <td>${v.rm}</td>
      <td>R$ ${parseFloat(v.valor).toLocaleString('pt-BR')}</td>
      <td>${v.vencimento}</td>
      <td>${v.origem}</td>
    `;
    tbody.appendChild(tr);
  });
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
