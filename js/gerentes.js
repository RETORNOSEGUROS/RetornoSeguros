// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Verifica login
auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "gerentes-login.html";
    return;
  }

  const uid = user.uid;

  db.collection("gerentes").doc(uid).get().then(doc => {
    if (!doc.exists || doc.data().ativo === false) {
      alert("Acesso negado.");
      auth.signOut();
      return;
    }

    window.gerenteLogado = {
    document.getElementById("tituloGerente").innerText = 
      `Painel — ${doc.data().nome} (${doc.data().cargo})`;
      id: uid,
      nome: doc.data().nome,
      cargo: doc.data().cargo || "gerente"
    };

    exibirSecao('visao');
  });
});

// Logout
function logout() {
  auth.signOut().then(() => {
    window.location.href = "gerentes-login.html";
  });
}

// Troca de seção
function exibirSecao(secao) {
  const container = document.getElementById('conteudo');
  container.innerHTML = "<p>Carregando...</p>";

  switch (secao) {
    case 'visao': carregarIndicadores(); break;
    case 'cadastrar': exibirFormularioEmpresa(); break;
    case 'visita': exibirFormularioVisita(); break;
    case 'empresas': listarEmpresasDetalhadas(); break;
    case 'visitas-relatorio': listarVisitasDetalhadas(); break;
    case 'cadastrar-usuario': exibirFormularioCadastroUsuario(); break;
  }
}

// Indicadores
function carregarIndicadores() {
  const uid = window.gerenteLogado.id;
  const container = document.getElementById('conteudo');
  container.innerHTML = "<h3>Visão Geral</h3>";

  const colecoes = ["empresas", "visitas", "cotacoes", "seguros"];
  const textos = ["Empresas", "Visitas", "Cotações", "Seguros"];

  colecoes.forEach((col, i) => {
    const ref = db.collection(col).where("gerenteId", "==", uid);
    ref.get().then(snapshot => {
      const qtd = snapshot.size;
      const bloco = document.createElement("div");
      bloco.className = "card";
      bloco.innerHTML = `<h3>${textos[i]}</h3><p>Total: <strong>${qtd}</strong></p>`;
      container.appendChild(bloco);
    });
  });
}

// Formulário de empresa
function exibirFormularioEmpresa() {
  const container = document.getElementById('conteudo');
  container.innerHTML = `
    <h3>Cadastrar Empresa</h3>
    <form id="formEmpresa">
      <input placeholder="Nome Fantasia" id="nomeFantasia" required><br><br>
      <input placeholder="CNPJ" id="cnpj" required><br><br>
      <input placeholder="Cidade" id="cidade"><br><br>
      <input placeholder="Estado" id="estado"><br><br>
      <input placeholder="Ramo de Atividade" id="ramo"><br><br>
      <input placeholder="Qtd Funcionários" id="qtd" type="number"><br><br>
      <button type="submit">Salvar</button>
    </form>
  `;

  document.getElementById("formEmpresa").onsubmit = (e) => {
    e.preventDefault();
    const dados = {
      nomeFantasia: document.getElementById("nomeFantasia").value,
      cnpj: document.getElementById("cnpj").value,
      cidade: document.getElementById("cidade").value,
      estado: document.getElementById("estado").value,
      ramoAtividade: document.getElementById("ramo").value,
      qtdFuncionarios: parseInt(document.getElementById("qtd").value || 0),
      cadastradoPor: window.gerenteLogado.id,
      dataCadastro: new Date().toISOString()
    };
    db.collection("empresas").add(dados).then(() => {
      alert("Empresa cadastrada!");
      exibirSecao("empresas");
    });
  };
}

// Visita
function exibirFormularioVisita() {
  const container = document.getElementById('conteudo');
  container.innerHTML = "<h3>Registrar Visita</h3><p>Carregando empresas...</p>";

  db.collection("empresas").where("cadastradoPor", "==", window.gerenteLogado.id).get().then(snapshot => {
    let html = `
      <form id="formVisita">
        <label>Empresa:</label>
        <select id="empresaId" required>
          ${snapshot.docs.map(doc => `<option value="${doc.id}">${doc.data().nomeFantasia}</option>`).join('')}
        </select><br><br>
        <input type="datetime-local" id="dataVisita" required><br><br>
        <textarea id="observacoes" placeholder="Observações" rows="4" style="width:100%;"></textarea><br><br>
        <button type="submit">Registrar</button>
      </form>
    `;
    container.innerHTML = html;

    document.getElementById("formVisita").onsubmit = (e) => {
      e.preventDefault();
      const dados = {
        empresaId: document.getElementById("empresaId").value,
        dataVisita: new Date(document.getElementById("dataVisita").value).toISOString(),
        observacoes: document.getElementById("observacoes").value,
        gerenteId: window.gerenteLogado.id,
        status: "realizada"
      };
      db.collection("visitas").add(dados).then(() => {
        alert("Visita registrada.");
        exibirSecao("empresas");
      });
    };
  });
}

// Listagem de empresas
function listarEmpresasDetalhadas() {
  const uid = window.gerenteLogado.id;
  const container = document.getElementById("conteudo");
  container.innerHTML = "<h3>Empresas Detalhadas</h3><p>Carregando...</p>";

  db.collection("empresas").where("cadastradoPor", "==", uid).get().then(snapshot => {
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
        <h3>${empresa.nomeFantasia}</h3>
        <p><strong>CNPJ:</strong> ${empresa.cnpj}</p>
        <p><strong>Cidade:</strong> ${empresa.cidade} - ${empresa.estado}</p>
        <p><strong>Funcionários:</strong> ${empresa.qtdFuncionarios}</p>
      `;
      container.appendChild(div);
    });
  });
}

// Relatório de visitas
function listarVisitasDetalhadas() {
  const uid = window.gerenteLogado.id;
  const container = document.getElementById("conteudo");
  container.innerHTML = "<h3>Relatório de Visitas</h3><p>Carregando visitas...</p>";

  db.collection("visitas").where("gerenteId", "==", uid).orderBy("dataVisita", "desc").get().then(snapshot => {
    if (snapshot.empty) {
      container.innerHTML = "<p>Nenhuma visita registrada.</p>";
      return;
    }

    container.innerHTML = "<h3>Relatório de Visitas</h3>";
    snapshot.forEach(doc => {
      const visita = doc.data();
      const card = document.createElement("div");
      card.className = "card";
      const dataFormatada = new Date(visita.dataVisita).toLocaleString("pt-BR");
      card.innerHTML = `
        <p><strong>Data:</strong> ${dataFormatada}</p>
        <p><strong>Empresa ID:</strong> ${visita.empresaId}</p>
        <p><strong>Observações:</strong><br>${visita.observacoes}</p>
      `;
      container.appendChild(card);
    });
  });
}

// Cadastro de usuário (gestor ou RM)
function exibirFormularioCadastroUsuario() {
  const container = document.getElementById("conteudo");
  container.innerHTML = `
    <h3>Cadastrar Gestor ou RM</h3>
    <form id="formCadastroInterno">
      <input type="text" id="nomeNovo" placeholder="Nome completo" required><br><br>
      <input type="email" id="emailNovo" placeholder="E-mail" required><br><br>
      <input type="password" id="senhaNovo" placeholder="Senha" required><br><br>
      <select id="cargoNovo" required>
        <option value="">Selecione o cargo</option>
        <option value="gestor">Gestor (chefe)</option>
        <option value="rm">RM (gerente)</option>
      </select><br><br>
      <input type="text" id="agenciaNova" placeholder="Número da agência (ex: 3495)" required><br><br>
      <button type="submit">Cadastrar</button>
    </form>
    <p id="mensagemCadastro" style="color: green; font-weight: bold;"></p>
  `;

  document.getElementById("formCadastroInterno").onsubmit = (e) => {
    e.preventDefault();
    const nome = document.getElementById("nomeNovo").value.trim();
    const email = document.getElementById("emailNovo").value.trim();
    const senha = document.getElementById("senhaNovo").value;
    const cargo = document.getElementById("cargoNovo").value;
    const agencia = document.getElementById("agenciaNova").value.trim();
    const msg = document.getElementById("mensagemCadastro");

    msg.textContent = "Criando usuário...";

    firebase.auth().createUserWithEmailAndPassword(email, senha)
      .then(userCredential => {
        const uid = userCredential.user.uid;
        return db.collection("gerentes").doc(uid).set({
          nome,
          email,
          cargo,
          agencia,
          ativo: true,
          uid
        });
      })
      .then(() => {
        msg.textContent = "✅ Usuário cadastrado com sucesso!";
        document.getElementById("formCadastroInterno").reset();
      })
      .catch(error => {
        console.error("Erro ao cadastrar:", error);
        msg.style.color = "red";
        msg.textContent = "❌ Erro: " + error.message;
      });
  };
}
