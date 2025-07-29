firebase.auth().onAuthStateChanged(function(user) {
  if (user) {
    const uid = user.uid;
    const empresaSelect = document.getElementById("empresa");
    const infoCNPJ = document.getElementById("info-cnpj");
    const infoRM = document.getElementById("info-rm");

    let empresas = {};

    firebase.firestore().collection("empresas")
      .get()
      .then(snapshot => {
        empresaSelect.innerHTML = '<option value="">Selecione a empresa</option>';
        snapshot.forEach(doc => {
          const dados = doc.data();
          empresas[doc.id] = dados;
          const option = document.createElement("option");
          option.value = doc.id;
          option.textContent = dados.nome;
          empresaSelect.appendChild(option);
        });
      });

    window.preencherEmpresa = function () {
      const empresaId = empresaSelect.value;
      const dados = empresas[empresaId];
      if (dados) {
        infoCNPJ.innerText = "CNPJ: " + (dados.cnpj || "Não informado");
        infoRM.innerText = "RM responsável: " + (dados.rm || "Não informado");
      } else {
        infoCNPJ.innerText = "";
        infoRM.innerText = "";
      }
    };

    window.enviarCotacao = function () {
      const empresaId = empresaSelect.value;
      const ramo = document.getElementById("ramo").value;
      const valorEstimado = parseFloat(document.getElementById("valorEstimado").value);
      const observacoes = document.getElementById("observacoes").value;

      if (!empresaId || !ramo || isNaN(valorEstimado)) {
        alert("Por favor, preencha todos os campos obrigatórios.");
        return;
      }

      const empresa = empresas[empresaId];

      const cotacao = {
        empresaId: empresaId,
        empresaNome: empresa?.nome || "",
        ramo: ramo,
        valor: valorEstimado,
        observacoes: observacoes,
        autorUid: uid,
        autorNome: user.displayName || "Usuário",
        dataCriacao: new Date(),
        status: "Negócio iniciado"
      };

      firebase.firestore().collection("cotacoes-gerentes")
        .add(cotacao)
        .then(() => {
          alert("Cotação criada com sucesso!");
          document.getElementById("empresa").value = "";
          document.getElementById("ramo").value = "";
          document.getElementById("valorEstimado").value = "";
          document.getElementById("observacoes").value = "";
          infoCNPJ.innerText = "";
          infoRM.innerText = "";
          carregarCotacoes();
        })
        .catch((error) => {
          console.error("Erro ao criar cotação: ", error);
          alert("Erro ao criar a cotação.");
        });
    };

    function carregarCotacoes() {
      const lista = document.getElementById("listaCotacoes");
      lista.innerHTML = "Carregando...";

      firebase.firestore().collection("cotacoes-gerentes")
        .where("autorUid", "==", uid)
        .orderBy("dataCriacao", "desc")
        .get()
        .then(snapshot => {
          if (snapshot.empty) {
            lista.innerHTML = "<p>Nenhuma cotação criada ainda.</p>";
            return;
          }

          let html = "<ul>";
          snapshot.forEach(doc => {
            const cotacao = doc.data();
            html += `<li><strong>${cotacao.empresaNome}</strong> - ${cotacao.ramo} - R$ ${cotacao.valor.toLocaleString("pt-BR")}<br>Status: ${cotacao.status}</li><hr>`;
          });
          html += "</ul>";
          lista.innerHTML = html;
        })
        .catch(error => {
          console.error("Erro ao carregar cotações: ", error);
          lista.innerHTML = "<p>Erro ao carregar cotações.</p>";
        });
    }

    carregarCotacoes();
  } else {
    window.location.href = "gerentes-login.html";
  }
});
