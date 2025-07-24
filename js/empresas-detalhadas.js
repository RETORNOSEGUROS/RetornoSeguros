(async () => {
  const db = firebase.firestore();
  const container = document.getElementById("conteudo-painel");
  container.innerHTML = `<h2>🏢 Empresas Detalhadas</h2><p>Carregando empresas...</p>`;

  const user = firebase.auth().currentUser;
  if (!user) {
    container.innerHTML = "<p>Usuário não autenticado.</p>";
    return;
  }

  // Pega perfil do gerente logado
  const docUser = await db.collection("gerentes").doc(user.uid).get();
  const gerenteData = docUser.data();
  const nivel = gerenteData?.nivel || "rm";
  const nomeGerente = gerenteData?.nome || "";

  let query = db.collection("empresas");

  if (nivel !== "master") {
    query = query.where("gerenteResponsavel", "==", nomeGerente);
  }

  const snap = await query.orderBy("nome").get();
  if (snap.empty) {
    container.innerHTML = "<p>Nenhuma empresa cadastrada.</p>";
    return;
  }

  let html = `
    <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse: collapse;">
        <thead>
          <tr style="background:#002B5B; color:white;">
            <th style="padding:10px;">Nome</th>
            <th>CNPJ</th>
            <th>Cidade</th>
            <th>Estado</th>
            <th>Ramo</th>
            <th>Funcionários</th>
            <th>Gerente</th>
          </tr>
        </thead>
        <tbody>
  `;

  snap.forEach(doc => {
    const e = doc.data();
    html += `
      <tr style="background:#fff; border-bottom:1px solid #ddd;">
        <td style="padding:10px;">${e.nome || "-"}</td>
        <td>${e.cnpj || "-"}</td>
        <td>${e.cidade || "-"}</td>
        <td>${e.estado || "-"}</td>
        <td>${e.ramo || "-"}</td>
        <td>${e.funcionarios || "-"}</td>
        <td>${e.gerenteResponsavel || "-"}</td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
})();
