function listarEmpresasDetalhadas() {
  const container = document.getElementById("conteudo");
  container.innerHTML = "<h3>Empresas Detalhadas</h3><p>Carregando...</p>";

  const nome = window.gerenteLogado.nome;
  const cargo = window.gerenteLogado.cargo.toLowerCase();

  let query = db.collection("empresas");

  if (cargo === "master") {
    // mostra todas
    query = query.orderBy("nomeFantasia");
  } else {
    // mostra só as do gerente logado
    query = query.where("gerenteResponsavel", "==", nome);
  }

  query.get().then(snapshot => {
    container.innerHTML = "<h3>Empresas Detalhadas</h3>";
    if (snapshot.empty) {
      container.innerHTML += "<p>Nenhuma empresa cadastrada.</p>";
      return;
    }

    snapshot.forEach(doc => {
      const empresa = doc.data();
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `
        <h3>${empresa.nomeFantasia || empresa.nome}</h3>
        <p><strong>CNPJ:</strong> ${empresa.cnpj || "-"}</p>
        <p><strong>Cidade:</strong> ${empresa.cidade || "-"} - ${empresa.estado || "-"}</p>
        <p><strong>Funcionários:</strong> ${empresa.qtdFuncionarios || empresa.funcionarios || "-"}</p>
        <p><strong>Gerente:</strong> ${empresa.gerenteResponsavel || "-"}</p>
      `;
      container.appendChild(div);
    });
  });
}
