// js/admin-visitas.js

(async () => {
  const db = firebase.firestore();
  const container = document.getElementById("conteudo-pagina");

  container.innerHTML = `
    <h2>📋 Relatórios de Visitas</h2>
    <div id="listaVisitas">Carregando registros...</div>
  `;

  const visitasSnap = await db.collection("visitas").orderBy("data", "desc").get();
  const lista = document.getElementById("listaVisitas");

  if (visitasSnap.empty) {
    lista.innerHTML = "<p>Nenhuma visita registrada ainda.</p>";
    return;
  }

  for (const doc of visitasSnap.docs) {
    const visita = doc.data();
    const id = doc.id;
    const data = visita.data || "-";
    const empresa = visita.empresa || "Não informado";
    const gerente = visita.gerenteNome || "Desconhecido";
    const gerenteId = visita.gerenteId || "";
    const funcionarios = visita.numeroFuncionarios || "-";
    const checklist = visita.checklist || [];
    const comentarios = visita.comentarios || "-";

    lista.innerHTML += `
      <div style="background: #fff; padding: 15px; border-radius: 6px; margin-bottom: 12px; box-shadow: 0 0 5px rgba(0,0,0,0.08);">
        <strong>${empresa}</strong><br/>
        📆 Data: ${data} | 👔 Gerente: ${gerente} (ID: ${gerenteId})<br/>
        🧑‍🤝‍🧑 Funcionários: ${funcionarios}<br/>
        ✅ Assuntos abordados:
        <ul>${checklist.map(item => `<li>${item}</li>`).join("")}</ul>
        🗒️ Comentários: <i>${comentarios}</i>
      </div>
    `;
  }
})();
