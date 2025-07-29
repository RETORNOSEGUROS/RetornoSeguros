firebase.auth().onAuthStateChanged(function(user) {
  if (!user) {
    window.location.href = "gerentes-login.html";
    return;
  }

  const selectEmpresa = document.getElementById("empresa");
  const infoCNPJ = document.getElementById("info-cnpj");
  const infoRM = document.getElementById("info-rm");

  let empresasMap = {};

  firebase.firestore().collection("empresas")
    .where("agencia", "==", "3495") // ajuste conforme necessário
    .get()
    .then(snapshot => {
      selectEmpresa.innerHTML = '<option value="">Selecione a empresa</option>';
      snapshot.forEach(doc => {
        const empresa = doc.data();
        empresasMap[doc.id] = empresa;

        const option = document.createElement("option");
        option.value = doc.id;
        option.textContent = empresa.nome;
        selectEmpresa.appendChild(option);
      });
    });

  window.preencherEmpresa = function() {
    const empresaId = selectEmpresa.value;
    const empresa = empresasMap[empresaId];
    if (empresa) {
      infoCNPJ.textContent = "CNPJ: " + (empresa.cnpj || "Não informado");
      infoRM.textContent = "RM responsável: " + (empresa.rm || "Não informado");
    } else {
      infoCNPJ.textContent = "";
      infoRM.textContent = "";
    }
  };

  window.enviarCotacao = function() {
    const empresaId = document.getElementById("empresa").value;
    const ramo = document.getElementById("ramo").value;
    const valorEstimado = parseFloat(document.getElementById("valorEstimado").value);
    const observacoes = document.getElementById("observacoes").value;
    const empresa = empresasMap[empresaId];

    if (!empresaId || !ramo || isNaN(valorEstimado)) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    const cotacao = {
      empresaId: empresaId,
      empresaNome: empresa.nome || "",
      ramo: ramo,
      valor: valorEstimado,
      observacoes: observacoes,
      autorUid: user.uid,
      autorNome: user.displayName || "Usuário",
      dataCriacao: new Date(),
      status: "Negócio iniciado"
    };

    firebase.firestore().collection("cotacoes-gerentes").add(cotacao)
      .then(() => {
        alert("Cotação criada com sucesso!");
        document.getElementById("empresa").value = "";
        document.getElementById("ramo").value = "";
        document.getElementById("valorEstimado").value = "";
        document.getElementById("observacoes").value = "";
        infoCNPJ.textContent = "";
        infoRM.textContent = "";
        carregarCotacoes();
      })
      .catch(error => {
        console.error("Erro ao salvar cotação:", error);
        alert("Erro ao salvar. Tente novamente.");
      });
  };

  function carregarCotacoes() {
    const lista = document.getElementById("listaCotacoes");
    lista.innerHTML = "Carregando...";

    firebase.firestore().collection("cotacoes-gerentes")
      .where("autorUid", "==", user.uid)
      .orderBy("dataCriacao", "desc")
      .get()
      .then(snapshot => {
        if (snapshot.empty) {
          lista.innerHTML = "<p>Nenhuma cotação criada ainda.</p>";
          return;
        }

        let html = "<ul>";
        snapshot.forEach(doc => {
          const dados = doc.data();
          html += `<li><strong>${dados.empresaNome}</strong> - ${dados.ramo} - R$ ${dados.valor.toLocaleString('pt-BR')}<br>Status: ${dados.status}</li><hr>`;
        });
        html += "</ul>";
        lista.innerHTML = html;
      })
      .catch(error => {
        console.error("Erro ao carregar cotações:", error);
        lista.innerHTML = "<p>Erro ao carregar cotações.</p>";
      });
  }

  carregarCotacoes();
});
