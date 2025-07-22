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
    case 'visita-detalhada':
      exibirFormularioVisitaDetalhada();
      break;
    case 'empresas':
      listarEmpresasDetalhadas();
      break;
    case 'visitas-relatorio':
      listarVisitasDetalhadas();
      break;
  }
}
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

function exibirFormularioVisita() {
  const container = document.getElementById('conteudo');
  container.innerHTML = `<h3>Registrar Visita Simples</h3><p>Carregando empresas...</p>`;

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
function exibirFormularioVisitaDetalhada() {
  const container = document.getElementById('conteudo');
  container.innerHTML = `<h3>Registrar Visita Detalhada</h3><p>Carregando empresas...</p>`;

  db.collection("empresas").where("cadastradoPor", "==", window.gerenteLogado.id).get().then(snapshot => {
    if (snapshot.empty) {
      container.innerHTML = "<p>Nenhuma empresa cadastrada ainda.</p>";
      return;
    }

    const opcoesEmpresa = snapshot.docs.map(doc =>
      `<option value="${doc.id}">${doc.data().nomeFantasia}</option>`
    ).join("");

    container.innerHTML = `
      <form id="formVisitaDetalhada">
        <label>Empresa:</label>
        <select id="empresaId" required>${opcoesEmpresa}</select><br><br>
        <label>Data e hora da visita:</label>
        <input type="datetime-local" id="dataVisita" required><br><br>
        <label><strong>Assuntos abordados:</strong></label><br>
        <label><input type="checkbox" name="assuntos" value="saude"> Cotação Saúde</label><br>
        <label><input type="checkbox" name="assuntos" value="vida"> Cotação Vida</label><br>
        <label><input type="checkbox" name="assuntos" value="empresarial"> Seguro Empresarial</label><br>
        <label><input type="checkbox" name="assuntos" value="previdencia"> Previdência Privada</label><br>
        <label><input type="checkbox" name="assuntos" value="rh"> Reunião com RH</label><br>
        <label><input type="checkbox" name="assuntos" value="diretoria"> Reunião com Diretoria</label><br>
        <label><input type="checkbox" name="assuntos" value="analise"> Análise de Apólices Atuais</label><br>
        <label><input type="checkbox" name="assuntos" value="outros"> Outros Assuntos</label><br><br>
        <label>Número atual de funcionários:</label>
        <input type="number" id="numeroFuncionarios"><br><br>
        <label>Tipo de seguro com maior interesse:</label><br>
        <label><input type="checkbox" name="interesse" value="saude"> Saúde</label>
        <label><input type="checkbox" name="interesse" value="vida"> Vida</label>
        <label><input type="checkbox" name="interesse" value="empresarial"> Empresarial</label>
        <label><input type="checkbox" name="interesse" value="previdencia"> Previdência</label><br><br>
        <label>Comentários gerais:</label><br>
        <textarea id="comentarios" rows="5" style="width:100%;"></textarea><br><br>
        <label>Status da visita:</label>
        <select id="status">
          <option value="realizada">Realizada</option>
          <option value="reagendada">Reagendada</option>
          <option value="cancelada">Cancelada</option>
          <option value="em_negociacao">Em negociação</option>
        </select><br><br>
        <label>Próxima ação:</label>
        <input type="text" id="proximaAcao"><br><br>
        <button type="submit">Salvar Visita</button>
      </form>
    `;

    document.getElementById("formVisitaDetalhada").onsubmit = salvarVisitaDetalhada;
  });
}

function salvarVisitaDetalhada(e) {
  e.preventDefault();

  const empresaId = document.getElementById("empresaId").value;
  const dataVisita = new Date(document.getElementById("dataVisita").value).toISOString();
  const numeroFuncionarios = parseInt(document.getElementById("numeroFuncionarios").value || 0);
  const comentarios = document.getElementById("comentarios").value;
  const status = document.getElementById("status").value;
  const proximaAcao = document.getElementById("proximaAcao").value;

  const assuntosMarcados = Array.from(document.querySelectorAll('input[name="assuntos"]:checked')).map(cb => cb.value);
  const interesses = Array.from(document.querySelectorAll('input[name="interesse"]:checked')).map(cb => cb.value);

  const assuntosObj = {};
  ["saude", "vida", "empresarial", "previdencia", "rh", "diretoria", "analise", "outros"].forEach(item => {
    assuntosObj[item] = assuntosMarcados.includes(item);
  });

  const dados = {
    empresaId,
    gerenteId: window.gerenteLogado.id,
    dataVisita,
    numeroFuncionariosAtual: numeroFuncionarios,
    comentarios,
    status,
    proximaAcao,
    assuntos: assuntosObj,
    tipoInteresse: interesses,
    criadoEm: new Date().toISOString()
  };

  db.collection("visitasDetalhadas").add(dados).then(() => {
    alert("Visita registrada com sucesso!");
    exibirSecao("empresas");
  });
}

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

function listarVisitasDetalhadas() {
  const uid = window.gerenteLogado.id;
  const isChefe = window.gerenteLogado.cargo === "chefe";
  const container = document.getElementById("conteudo");

  container.innerHTML = "<h3>Relatório de Visitas</h3><p>Carregando visitas...</p>";

  let query = db.collection("visitasDetalhadas").orderBy("dataVisita", "desc");
  if (!isChefe) query = query.where("gerenteId", "==", uid);

  query.get().then(snapshot => {
    if (snapshot.empty) {
      container.innerHTML = "<p>Nenhuma visita registrada.</p>";
      return;
    }

    container.innerHTML = "<h3>Relatório de Visitas</h3>";

    const visitas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    visitas.forEach(visita => {
      const card = document.createElement("div");
      card.className = "card";
      card.style.marginBottom = "20px";

      const assuntos = Object.entries(visita.assuntos || {})
        .filter(([_, marcado]) => marcado)
        .map(([chave]) => chave.charAt(0).toUpperCase() + chave.slice(1))
        .join(", ") || "Nenhum";

      const interesses = (visita.tipoInteresse || []).map(t => t.toUpperCase()).join(", ");
      const dataFormatada = new Date(visita.dataVisita).toLocaleString("pt-BR");

      card.innerHTML = `
        <h4>Empresa ID: ${visita.empresaId}</h4>
        <p><strong>Data:</strong> ${dataFormatada}</p>
        <p><strong>Status:</strong> ${visita.status.replace("_", " ")}</p>
        <p><strong>Assuntos abordados:</strong> ${assuntos}</p>
        <p><strong>Interesse principal:</strong> ${interesses}</p>
        <p><strong>Nº de Funcionários:</strong> ${visita.numeroFuncionariosAtual}</p>
        <p><strong>Próxima Ação:</strong> ${visita.proximaAcao || "—"}</p>
        <p><strong>Comentários:</strong><br>${visita.comentarios}</p>
      `;

      container.appendChild(card);
    });
  });
}
