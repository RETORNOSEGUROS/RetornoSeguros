// js/admin-indicacoes.js

(async () => {
  const db = firebase.firestore();
  const container = document.getElementById("conteudo-pagina");

  container.innerHTML = `
    <h2>📨 Indicações e Pontos</h2>
    <input type="text" id="buscaIndicador" placeholder="🔍 Buscar por nome ou ID do indicador" style="width: 100%; padding: 10px; margin-bottom: 20px; border-radius: 6px; border: 1px solid #ccc;" />
    <div id="listaIndicacoes">Carregando indicações...</div>
  `;

  const usuariosSnap = await db.collection("usuarios").get();
  const usuarios = {};
  usuariosSnap.forEach(doc => {
    usuarios[doc.id] = { ...doc.data(), id: doc.id };
  });

  const renderizarIndicacoes = (filtroTexto = "") => {
    const lista = document.getElementById("listaIndicacoes");
    lista.innerHTML = "";

    const indicacoesPorUsuario = {};

    // Agrupa quem indicou quem
    Object.values(usuarios).forEach(u => {
      const indicadorId = u.usuarioIndicadorId;
      if (indicadorId) {
        if (!indicacoesPorUsuario[indicadorId]) {
          indicacoesPorUsuario[indicadorId] = [];
        }
        indicacoesPorUsuario[indicadorId].push(u);
      }
    });

    Object.entries(indicacoesPorUsuario).forEach(([indicadorId, indicados]) => {
      const indicador = usuarios[indicadorId];
      if (!indicador) return;

      const nomeIndicador = indicador.nome || "Desconhecido";
      const textoBusca = `${nomeIndicador} ${indicadorId}`.toLowerCase();
      if (!textoBusca.includes(filtroTexto.toLowerCase())) return;

      let totalPontos = 0;

      let html = `
        <div style="background: #fff; border-radius: 8px; padding: 15px; margin-bottom: 20px; box-shadow: 0 0 6px rgba(0,0,0,0.1);">
          <strong>${nomeIndicador}</strong> (ID: ${indicadorId})<br/>
          Indicações: ${indicados.length}
          <ul style="margin-top: 10px;">
      `;

      indicados.forEach(indicado => {
        const nomeIndicado = indicado.nome || "Sem nome";
        const dataCadastro = indicado.dataCadastro || "-";
        const indicadoId = indicado.id;
        let pontos = 10;

        const apoliceConfirmada = Object.values(indicado.apolices || {}).some(a => a.pdfEnviado);
        if (apoliceConfirmada) {
          pontos += 20;
        }

        totalPontos += pontos;

        html += `<li>👤 ${nomeIndicado} (ID: ${indicadoId}) - ${pontos} pontos - Cadastro: ${dataCadastro}</li>`;
      });

      html += `
          </ul>
          <p><strong>Total de pontos: ${totalPontos}</strong></p>
        </div>
      `;

      lista.innerHTML += html;
    });

    if (lista.innerHTML.trim() === "") {
      lista.innerHTML = "<p>Nenhuma indicação encontrada.</p>";
    }
  };

  document.getElementById("buscaIndicador").addEventListener("input", (e) => {
    renderizarIndicacoes(e.target.value);
  });

  renderizarIndicacoes();
})();
