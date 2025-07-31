const negociosRef = firebase.firestore().collection('cotacoes-gerentes');
const empresasRef = firebase.firestore().collection('empresas');
const adminEmail = 'patrick@retornoseguros.com.br';

console.log('✅ JS carregado com layout e formatação');

document.addEventListener('DOMContentLoaded', () => {
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      carregarNegociosFechados(user.email);
    } else {
      alert('Você precisa estar logado.');
    }
  });
});

function carregarNegociosFechados(emailLogado) {
  negociosRef.where('status', '==', 'Negócio Emitido')
    .get()
    .then(snapshot => {
      const container = document.getElementById('listaNegociosFechados');
      container.innerHTML = '';

      const tabela = document.createElement('table');
      tabela.style.width = '100%';
      tabela.style.borderCollapse = 'collapse';
      tabela.style.fontSize = '14px';
      tabela.innerHTML = `
        <thead>
          <tr style='background:#f0f0f0; font-weight:bold; text-align:left'>
            <th>Empresa</th><th>Ramo</th><th>RM</th><th>Prêmio</th><th>%</th>
            <th>Comissão R$</th><th>Início</th><th>Fim</th><th>Observações</th><th>Ações</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = tabela.querySelector('tbody');

      snapshot.forEach(async doc => {
        const data = doc.data();
        const id = doc.id;
        const isAdmin = emailLogado === adminEmail;

        // Buscar nome da empresa se houver ID
        let nomeEmpresa = data.empresa || '-';
        if (!nomeEmpresa && data.empresaId) {
          try {
            const empresaSnap = await empresasRef.doc(data.empresaId).get();
            if (empresaSnap.exists) nomeEmpresa = empresaSnap.data().nome || '-';
          } catch (e) {
            console.log('Erro ao buscar empresa:', e);
          }
        }

        const linha = document.createElement('tr');
        linha.style.borderBottom = '1px solid #ccc';
        linha.innerHTML = `
          <td>${nomeEmpresa}</td>
          <td>${data.ramo || '-'}</td>
          <td>${data.rmNome || '-'}</td>
          <td><input type='number' id='premio-${id}' value='${data.premioLiquido || ''}' ${!isAdmin ? 'readonly' : ''} style='width:100px'></td>
          <td><input type='number' id='comissao-${id}' value='${data.comissaoPercentual || ''}' ${!isAdmin ? 'readonly' : ''} style='width:60px'></td>
          <td><span id='comissaoValor-${id}'>${formatarValor(data.comissaoValor)}</span></td>
          <td><input type='date' id='inicio-${id}' value='${data.inicioVigencia || ''}' ${!isAdmin ? 'readonly' : ''}></td>
          <td><input type='date' id='fim-${id}' value='${data.fimVigencia || ''}' ${!isAdmin ? 'readonly' : ''}></td>
          <td><textarea id='obs-${id}' rows='2' style='width:180px' ${!isAdmin ? 'readonly' : ''}>${data.observacoes || ''}</textarea></td>
          <td>${isAdmin ? `<button onclick="salvarNegocio('${id}', this)">💾</button>` : '-'}</td>
        `;

        tbody.appendChild(linha);

        if (isAdmin) {
          document.getElementById(`premio-${id}`).addEventListener('input', () => calcularComissao(id));
          document.getElementById(`comissao-${id}`).addEventListener('input', () => calcularComissao(id));
        }
      });

      container.appendChild(tabela);
    })
    .catch(err => {
      console.error('Erro ao carregar:', err);
    });
}

function formatarValor(valor) {
  if (!valor || isNaN(valor)) return 'R$ 0,00';
  return 'R$ ' + valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function calcularComissao(id) {
  const premio = parseFloat(document.getElementById(`premio-${id}`).value || 0);
  const percentual = parseFloat(document.getElementById(`comissao-${id}`).value || 0);
  const valor = (premio * percentual / 100).toFixed(2);
  document.getElementById(`comissaoValor-${id}`).innerText = formatarValor(parseFloat(valor));
}

function salvarNegocio(id, botao) {
  const premio = parseFloat(document.getElementById(`premio-${id}`).value || 0);
  const comissaoPercentual = parseFloat(document.getElementById(`comissao-${id}`).value || 0);
  const comissaoValor = parseFloat((premio * comissaoPercentual / 100).toFixed(2));
  const inicio = document.getElementById(`inicio-${id}`).value;
  const fim = document.getElementById(`fim-${id}`).value;
  const obs = document.getElementById(`obs-${id}`).value;

  negociosRef.doc(id).update({
    premioLiquido: premio,
    comissaoPercentual,
    comissaoValor,
    inicioVigencia: inicio,
    fimVigencia: fim,
    observacoes: obs
  }).then(() => {
    alert('✅ Dados salvos!');
    document.getElementById(`premio-${id}`).setAttribute('readonly', true);
    document.getElementById(`comissao-${id}`).setAttribute('readonly', true);
    document.getElementById(`inicio-${id}`).setAttribute('readonly', true);
    document.getElementById(`fim-${id}`).setAttribute('readonly', true);
    document.getElementById(`obs-${id}`).setAttribute('readonly', true);
    botao.remove();
  }).catch(err => {
    console.error('Erro ao salvar:', err);
    alert('❌ Erro ao salvar.');
  });
}
