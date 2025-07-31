// negocios-fechados.js
const negociosRef = firebase.firestore().collection('cotacoes-gerentes'); // Corrigido

document.addEventListener('DOMContentLoaded', carregarNegociosFechados);

function carregarNegociosFechados() {
  negociosRef.where('status', '==', 'Negócio Emitido')
    .get()
    .then(snapshot => {
      console.log("Total de negócios emitidos encontrados:", snapshot.size);
      const container = document.getElementById('listaNegociosFechados');
      container.innerHTML = '';

      if (snapshot.empty) {
        container.innerHTML = '<p>Nenhum negócio emitido encontrado.</p>';
        return;
      }

      snapshot.forEach(doc => {
        const data = doc.data();
        const id = doc.id;
        console.log("Documento:", id, data);

        const div = document.createElement('div');
        div.classList.add('negocio');
        div.innerHTML = `
          <div style="border:1px solid #ccc; padding:15px; margin-bottom:20px; border-radius:8px">
            <p><b>Empresa:</b> ${data.empresa || '-'} | <b>Ramo:</b> ${data.ramo || '-'} | <b>RM:</b> ${data.rmNome || '-'} | <b>Autor:</b> ${data.autorNome || '-'}</p>

            <label>Prêmio Líquido (R$): <input type="number" id="premio-${id}" value="${data.premioLiquido || ''}" /></label><br>
            <label>Comissão (%): <input type="number" id="comissao-${id}" value="${data.comissaoPercentual || ''}" /></label><br>
            <p><b>Valor Comissão (R$):</b> <span id="comissaoValor-${id}">${data.comissaoValor || '0,00'}</span></p>

            <label>Início Vigência: <input type="date" id="inicio-${id}" value="${data.inicioVigencia || ''}"/></label><br>
            <label>Fim Vigência: <input type="date" id="fim-${id}" value="${data.fimVigencia || ''}"/></label><br>

            <label>Observações:<br/><textarea id="obs-${id}" rows="3" style="width:100%">${data.observacoes || ''}</textarea></label><br>
            <button onclick="salvarNegocio('${id}')">💾 Salvar</button>
          </div>
        `;

        container.appendChild(div);

        document.getElementById(`premio-${id}`).addEventListener('input', () => calcularComissao(id));
        document.getElementById(`comissao-${id}`).addEventListener('input', () => calcularComissao(id));
      });
    })
    .catch(err => {
      console.error('Erro ao carregar negócios:', err);
    });
}

function calcularComissao(id) {
  const premio = parseFloat(document.getElementById(`premio-${id}`).value || 0);
  const percentual = parseFloat(document.getElementById(`comissao-${id}`).value || 0);
  const valor = (premio * percentual / 100).toFixed(2);
  document.getElementById(`comissaoValor-${id}`).innerText = `R$ ${valor}`;
}

function salvarNegocio(id) {
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
    alert('✅ Dados salvos com sucesso!');
  }).catch(err => {
    alert('❌ Erro ao salvar dados. Veja o console.');
    console.error(err);
  });
}
