// Visita com checklist de seguros e comentários
function exibirFormularioVisita() {
  const container = document.getElementById('conteudo');
  container.innerHTML = "<h3>Registrar Visita</h3><p>Carregando empresas...</p>";

  db.collection("empresas").where("cadastradoPor", "==", window.gerenteLogado.id).get().then(snapshot => {
    let html = `
      <form id="formVisita">
        <label>Empresa:</label><br>
        <select id="empresaId" required style="width:100%; padding:8px;">
          ${snapshot.docs.map(doc => `<option value="${doc.id}">${doc.data().nomeFantasia}</option>`).join('')}
        </select><br><br>

        <label>Data da Visita:</label><br>
        <input type="datetime-local" id="dataVisita" required style="width:100%; padding:8px;"><br><br>

        <label>Número Atualizado de Funcionários:</label><br>
        <input type="number" id="numeroFuncionarios" placeholder="Ex: 45" style="width:100%; padding:8px;"><br><br>

        <label><strong>Assuntos de Seguros Abordados:</strong></label><br>
        <div id="checklistSeguros" style="margin-left:10px;">
          <label><input type="checkbox" value="Plano de saúde empresarial"> Plano de saúde empresarial</label><br>
          <label><input type="checkbox" value="Plano dental empresarial"> Plano dental empresarial</label><br>
          <label><input type="checkbox" value="Seguro de vida em grupo"> Seguro de vida em grupo</label><br>
          <label><input type="checkbox" value="Seguro frotas"> Seguro frotas</label><br>
          <label><input type="checkbox" value="Seguro de bens"> Seguro de bens (máquinas, estrutura)</label><br>
          <label><input type="checkbox" value="Seguro responsabilidade civil / D&O"> Seguro responsabilidade civil / D&O</label><br>
          <label><input type="checkbox" value="Previdência empresarial"> Previdência empresarial</label><br>
        </div><br>

        <label>Comentário Plano de Saúde:</label><br>
        <textarea id="comentarioSaude" rows="2" style="width:100%;"></textarea><br><br>

        <label>Comentário Plano Dental:</label><br>
        <textarea id="comentarioDental" rows="2" style="width:100%;"></textarea><br><br>

        <label>Comentário Seguro de Vida:</label><br>
        <textarea id="comentarioVida" rows="2" style="width:100%;"></textarea><br><br>

        <label>Comentário Outros Seguros:</label><br>
        <textarea id="comentarioOutros" rows="2" style="width:100%;"></textarea><br><br>

        <label>Observações Gerais:</label><br>
        <textarea id="observacoes" rows="4" style="width:100%;"></textarea><br><br>

        <button type="submit">Registrar Visita</button>
      </form>
    `;

    container.innerHTML = html;

    document.getElementById("formVisita").onsubmit = (e) => {
      e.preventDefault();

      const checklist = [];
      document.querySelectorAll('#checklistSeguros input[type=checkbox]').forEach(cb => {
        if (cb.checked) checklist.push(cb.value);
      });

      const dados = {
        empresaId: document.getElementById("empresaId").value,
        dataVisita: new Date(document.getElementById("dataVisita").value).toISOString(),
        numeroFuncionarios: parseInt(document.getElementById("numeroFuncionarios").value || 0),
        checklist,
        comentarios: {
          planoSaude: document.getElementById("comentarioSaude").value.trim(),
          planoDental: document.getElementById("comentarioDental").value.trim(),
          vida: document.getElementById("comentarioVida").value.trim(),
          outros: document.getElementById("comentarioOutros").value.trim()
        },
        observacoes: document.getElementById("observacoes").value.trim(),
        gerenteId: window.gerenteLogado.id,
        gerenteNome: window.gerenteLogado.nome,
        status: "realizada"
      };

      db.collection("visitas").add(dados).then(() => {
        alert("✅ Visita registrada com sucesso.");
