// js/admin-visao.js

(async () => {
  const db = firebase.firestore();
  const container = document.getElementById("conteudo-pagina");

  // Funções auxiliares para contar registros
  const contarDocumentos = async (colecao, filtro = null) => {
    try {
      let query = db.collection(colecao);
      if (filtro) {
        Object.entries(filtro).forEach(([campo, valor]) => {
          query = query.where(campo, "==", valor);
        });
      }
      const snap = await query.get();
      return snap.size;
    } catch (err) {
      console.error(`Erro ao contar ${colecao}:`, err);
      return 0;
    }
  };

  // Coleta dados
  const totalUsuarios = await contarDocumentos("usuarios");
  const totalApolices = await contarDocumentos("apolices");
  const apolicesConfirmadas = await contarDocumentos("apolices", { pdfEnviado: true });
  const totalIndicacoes = await contarDocumentos("usuarios", { usuarioIndicadorId: firebase.auth().currentUser.uid });

  // Exibe painel
  container.innerHTML = `
    <h2>📊 Visão Geral</h2>
    <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-top: 20px;">
      <div style="flex: 1; min-width: 200px; background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 0 8px rgba(0,0,0,0.1);">
        <h3>👥 Usuários</h3>
        <p style="font-size: 24px; font-weight: bold;">${totalUsuarios}</p>
      </div>

      <div style="flex: 1; min-width: 200px; background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 0 8px rgba(0,0,0,0.1);">
        <h3>📄 Apólices</h3>
        <p style="font-size: 24px; font-weight: bold;">${totalApolices}</p>
      </div>

      <div style="flex: 1; min-width: 200px; background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 0 8px rgba(0,0,0,0.1);">
        <h3>✅ Apólices na Retorno</h3>
        <p style="font-size: 24px; font-weight: bold;">${apolicesConfirmadas}</p>
      </div>

      <div style="flex: 1; min-width: 200px; background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 0 8px rgba(0,0,0,0.1);">
        <h3>📨 Indicações</h3>
        <p style="font-size: 24px; font-weight: bold;">${totalIndicacoes}</p>
      </div>
    </div>
  `;
})();
