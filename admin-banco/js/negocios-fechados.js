const negociosRef = firebase.firestore().collection('cotacoes-gerentes');
const adminEmail = 'patrick@retornoseguros.com.br';

console.log('✅ JS carregado - negócios-fechados');

document.addEventListener('DOMContentLoaded', () => {
  console.log('📌 DOM carregado');
  if (!firebase || !firebase.auth) {
    console.error('❌ Firebase não está disponível');
    return;
  }
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      console.log('🔐 Usuário logado:', user.email);
      carregarNegociosFechados(user.email);
    } else {
      console.warn('⚠️ Usuário não está logado');
      alert('Você precisa estar logado para visualizar os dados.');
    }
  });
});

function carregarNegociosFechados(emailLogado) {
  console.log('📥 Buscando negócios com status "Negócio Emitido"...');
  negociosRef.where('status', '==', 'Negócio Emitido')
    .get()
    .then(snapshot => {
      console.log(`🔎 Total encontrado: ${snapshot.size}`);
      const container = document.getElementById('listaNegociosFechados');
      container.innerHTML = '';

      if (snapshot.empty) {
        container.innerHTML = '<p>Nenhum negócio emitido encontrado.</p>';
        return;
      }

      const tabela = document.createElement('table');
      tabela.style.width = '100%';
      tabela.style.borderCollapse = 'collapse';
      tabela.innerHTML = `
        <thead>
          <tr style='background:#eee'>
            <th>Empresa</th><th>Ramo</th><th>RM</th><th>Prêmio</th><th>%</th>
            <th>Comissão R$</th><th>Início</th><th>Fim</th><th>Observações</th><th>Ações</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const tbody = tabela.querySelector('tbody');

      snapshot.forEach(doc => {
        const data = doc.data();
        const id = doc.id;
        const isAdmin = emailLogado === adminEmail;
        console.log('📄 Documento carregado:', id, data);

        const linha = document.createElement('tr');
        linha.style.borderBottom = '1px solid #ccc';

        linha.innerHTML = `
          <td>${data.empresa || '-'}</td>
          <td>${data.ramo || '-'}</td>
          <td>${data.rmNome || '-'}</td>
          <td><input type='number' id='premio-${id}' value='${data.premioLiquido || ''}' ${!isAdmin ? 'readonly' : ''}></td>
          <td><input type='number' id='comissao-${id}' value='${data.comissaoPercentual || ''}' ${!isAdmin ? 'readonly' : ''}></td>
          <td><span id='comissaoValor-${id}'>${data.comissaoValor ? 'R$ ' + data.comissaoValor.toFixed(2) : 'R$ 0,00'}</span></td>
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
      console.error('❌ Erro ao carregar negócios:', err);
    });
}

function calcularComissao(id) {
  const premio = parseFloat(document.getElementById(`premio-${id}`).value || 0);
  const percentual = parseFloat(document.getElementById(`comissao-${id}`).value || 0);
  const valor = (premio * percentual / 100).toFixed(2);
  document.getElementById(`comissaoValor-${id}`).innerText = `R$ ${valor}`;
}

function salvarNegocio(id, botao) {
  console.log('💾 Salvando negócio:', id);
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
    console.log('✅ Dados salvos');
    alert('✅ Salvo com sucesso!');
    document.getElementById(`premio-${id}`).setAttribute('readonly', true);
    document.getElementById(`comissao-${id}`).setAttribute('readonly', true);
    document.getElementById(`inicio-${id}`).setAttribute('readonly', true);
    document.getElementById(`fim-${id}`).setAttribute('readonly', true);
    document.getElementById(`obs-${id}`).setAttribute('readonly', true);
    botao.remove();
  }).catch(err => {
    console.error('❌ Erro ao salvar:', err);
    alert('❌ Erro ao salvar dados.');
  });
}
