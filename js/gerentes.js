firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

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
      id: uid,
      nome: doc.data().nome,
      cargo: doc.data().cargo || "gerente"
    };

    exibirSecao('visao');
  });
});

function logout() {
  auth.signOut().then(() => {
    window.location.href = "gerentes-login.html";
  });
}

// -------- Navegação
function exibirSecao(secao) {
  const container = document.getElementById('conteudo');
  container.innerHTML = "<p>Carregando...</p>";

  switch (secao) {
    case 'visao':
      carregarIndicadores();
      break;
    case 'cadastrar':
      exibirFormularioEmpresa();
      break;
    case 'visita':
      exibirFormularioVisita();
      break;
    case 'empresas':
      listarEmpresasDetalhadas();
      break;
  }
}

// -------- Indicadores
function carregarIndicadores() {
  const uid = window.gerenteLogado.id;
  const isChefe = window.gerenteLogado.cargo === "chefe";
  const container = document.getElementById('conteudo');
  container.innerHTML = "<h3>Visão Geral</h3>";

  const colecoes = ["empresas", "visitas", "cotacoes", "seguros"];
  const textos = ["Empresas", "Visitas", "Cotações", "Seguros"];

  colecoes.forEach((col, i) => {
    const ref = db.collection(col);
    const query = isChefe ? ref : ref.where("gerenteId", "==", uid);

    query.get().then(snapshot => {
      const qtd = snapshot.size;
      const bloco = document.createElement("div");
      bloco.className = "card";
      bloco.innerHTML = `<h3>${textos[i]}</h3><p>Total: <strong>${qtd}</strong></p>`;
      container.appendChild(bloco);
    });
  });
}

// -------- Cadastrar Empresa
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

// -------- Registrar Visita
function exibirFormularioVisita() {
  const container = document.getElementById('conteudo');
  container.innerHTML = `<h3>Registrar Visita</h3><p>Carregando empresas...</p>`;

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

// -------- Empresas Detalhadas
function listarEmpresasDetalhadas() {
  const uid = window.gerenteLogado.id;
  const isChefe = window.gerenteLogado.cargo === "chefe";
  const container = document.getElementById("conteudo");
  container.innerHTML = "<h3>Empresas Detalhadas</h3><p>Carregando...</p>";

  let query = db.collection("empresas");
  if (!isChefe) query = query.where("cadastradoPor", "==", uid);

  query.get().then(snapshot => {
    container.innerHTML = `<h3>Empresas Detalhadas</h3>`;
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
        <div id="extras-${doc.id}">Carregando visitas e cotações...</div>
      `;
      container.appendChild(div);

      carregarExtrasEmpresa(doc.id);
    });
  });
}

function carregarExtrasEmpresa(empresaId) {
  const destino = document.getElementById("extras-" + empresaId);

  Promise.all([
    db.collection("visitas").where("empresaId", "==", empresaId).get(),
    db.collection("cotacoes").where("empresaId", "==", empresaId).get()
  ]).then(([visitas, cotacoes]) => {
    let html = "<h4>Visitas:</h4><ul>";
    visitas.forEach(v => {
      const d = v.data();
      html += `<li>${new Date(d.dataVisita).toLocaleString()} - ${d.observacoes}</li>`;
    });
    html += "</ul><h4>Cotações:</h4><ul>";
    cotacoes.forEach(c => {
      const d = c.data();
      html += `<li>${d.produto} - R$ ${d.valorEstimado} (${d.status})</li>`;
    });
    html += "</ul>";
    destino.innerHTML = html;
  });
}
