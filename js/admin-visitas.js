// js/admin-visitas.js

(async () => {
  const db = firebase.firestore();
  const container = document.getElementById("conteudo-pagina");

  container.innerHTML = `
    <h2>📋 Relatórios de Visitas</h2>
    <div id="listaVisitas">Carregando registros...</div>
  `;

  const visitasSnap = await db.collection("visitas").orderBy("dataVisita", "desc").get();
  const lista = document.getElementById("listaVisitas");

  if (visitasSnap.empty) {
    lista.innerHTML = "<p>Nenhuma visita registrada ainda.</p>";
    return;
  }

  for (const doc of visitasSnap.docs) {
    const visita = doc.data();
    const data = visita.dataVisita 
      ? new Date(visita.dataVisita).toLocaleString("pt-BR") 
      : "-";
    const empresaId = visita.empresaId || "N/I";
    const gerente = visita.gerenteNome || "Desconhecido";
    const gerenteId = visita.gerenteId || "-";
    const funcionarios = visita.numeroFuncionarios || "-";
    const checklist = visita.checklist || [];
    const obs = visita.observacoes || "-";
    const com = visita.comentarios || {};

    lista.innerHTML += `
      <div style="background: #fff; padding: 15px; border-radius: 6px; margin-bottom: 12px; box-shadow: 0 0 5px rgba(0,0,0,0.08);">
        <strong>📁 Empresa ID:</strong> ${empresaId}<br/>
        📆 <strong>Data:</strong> ${data}<br/>
        👔 <strong>Gerente:</strong> ${gerente} (ID: ${gerenteId})<br/>
        🧑‍🤝‍🧑 <strong>Funcionários:</strong> ${funcionarios}<br/>
        ✅ <strong>Assuntos de Seguro Abordados:</strong>
        <ul style="margin-top: 4px;">
          ${checklist.map(item => `<li>${item}</li>`).join("") || "<li>Não informado</li>"}
        </ul>

        <details>
          <summary><strong>📝 Comentários Específicos</strong></summary>
          <ul style="margin-top: 8px;">
            <li><strong>Plano de Saúde:</strong> ${com.planoSaude || "-"}</li>
            <li><strong>Plano Dental:</strong> ${com.planoDental || "-"}</li>
            <li><strong>Seguro de Vida:</strong> ${com.vida || "-"}</li>
            <li><strong>Outros Seguros:</strong> ${com.outros || "-"}</li>
          </ul>
        </details>

        <p style="margin-top:10px;"><strong>🗒️ Observações:</strong><br>${obs}</p>
      </div>
    `;
  }
})();
