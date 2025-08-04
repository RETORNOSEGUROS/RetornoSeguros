firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioAtual = null;
let empresasCache = [];
let isAdmin = false;

window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async user => {
    if (!user) return window.location.href = "login.html";

    usuarioAtual = user;
    isAdmin = user.email === "patrick@retornoseguros.com.br";

    await carregarEmpresas();
    await carregarRamos();
    await carregarRM();
    await carregarStatus();

    carregarCotacoesComFiltros();

    if (!isAdmin) document.getElementById("btnSalvarAlteracoes").style.display = "none";
  });
});

async function carregarEmpresas() {
  const campos = ["empresa", "novaEmpresa"];
  empresasCache = [];

  const snap = await db.collection("empresas").get();
  campos.forEach(id => document.getElementById(id).innerHTML = `<option value="">Selecione a empresa</option>`);

  snap.forEach(doc => {
    const dados = doc.data();
    empresasCache.push({ id: doc.id, ...dados });
    campos.forEach(id => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = dados.nome;
      document.getElementById(id).appendChild(opt);
    });
  });
}

async function carregarRamos() {
  const campos = ["ramo", "novaRamo"];
  const snap = await db.collection("ramos-seguro").orderBy("ordem").get();
  campos.forEach(id => document.getElementById(id).innerHTML = `<option value="">Selecione o ramo</option>`);

  snap.forEach(doc => {
    const nome = doc.data().nomeExibicao || doc.id;
    campos.forEach(id => {
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      document.getElementById(id).appendChild(opt);
    });
  });
}

async function carregarRM() {
  const select = document.getElementById("filtroRM");
  select.innerHTML = `<option value="">Todos</option>`;
  const snap = await db.collection("cotacoes-gerentes").get();
  const nomes = new Set();
  snap.forEach(doc => {
    const nome = doc.data().rmNome;
    if (nome && !nomes.has(nome)) {
      nomes.add(nome);
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      select.appendChild(opt);
    }
  });
}

async function carregarStatus() {
  const select = document.getElementById("filtroStatus");
  select.innerHTML = `<option value="">Todos</option>`;
  const snap = await db.doc("status-negociacao/config").get();
  const status = snap.data()?.statusFinais || [];
  status.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
}

function preencherEmpresaNova() {
  const id = document.getElementById("novaEmpresa").value;
  const empresa = empresasCache.find(e => e.id === id);
  document.getElementById("nova-info-cnpj").textContent = empresa ? `CNPJ: ${empresa.cnpj}` : "";
  document.getElementById("nova-info-rm").textContent = empresa ? `RM responsável: ${empresa.rm}` : "";
}

function preencherEmpresa() {
  const id = document.getElementById("empresa").value;
  const empresa = empresasCache.find(e => e.id === id);
  document.getElementById("info-cnpj").textContent = empresa ? `CNPJ: ${empresa.cnpj}` : "";
  document.getElementById("info-rm").textContent = empresa ? `RM responsável: ${empresa.rm}` : "";
}

async function criarNovaCotacao() {
  const empresaId = document.getElementById("novaEmpresa").value;
  const ramo = document.getElementById("novaRamo").value;
  const valor = parseFloat(document.getElementById("novaValor").value);
  const obs = document.getElementById("novaObservacoes").value.trim();
  const empresa = empresasCache.find(e => e.id === empresaId);

  if (!empresaId || !ramo || !empresa) return alert("Preencha todos os campos.");

  const cotacao = {
    empresaId,
    empresaNome: empresa.nome,
    empresaCNPJ: empresa.cnpj || "",
    rmId: empresa.rmId || "",
    rmNome: empresa.rm || "",
    ramo,
    valorDesejado: valor,
    status: "Negócio iniciado",
    dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPorUid: usuarioAtual.uid,
    autorUid: usuarioAtual.uid,
    autorNome: usuarioAtual.email,
    interacoes: obs ? [{
      autorUid: usuarioAtual.uid,
      autorNome: usuarioAtual.email,
      mensagem: obs,
      dataHora: new Date(),
      tipo: "observacao"
    }] : []
  };

  await db.collection("cotacoes-gerentes").add(cotacao);
  alert("Cotação criada com sucesso.");
  location.reload();
}

function carregarCotacoesComFiltros() {
  const lista = document.getElementById("listaCotacoes");
  lista.innerHTML = "Carregando...";
  let query = db.collection("cotacoes-gerentes");
  if (!isAdmin) query = query.where("criadoPorUid", "==", usuarioAtual.uid);

  query.get().then(snapshot => {
    let cotacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const ini = document.getElementById("filtroDataInicio").value;
    const fim = document.getElementById("filtroDataFim").value;
    const rm = document.getElementById("filtroRM").value;
    const status = document.getElementById("filtroStatus").value;

    cotacoes = cotacoes.filter(c => {
      const d = c.dataCriacao?.toDate?.();
      if (ini && d < new Date(ini)) return false;
      if (fim && d > new Date(fim + 'T23:59:59')) return false;
      if (rm && c.rmNome !== rm) return false;
      if (status && c.status !== status) return false;
      return true;
    });

    if (!cotacoes.length) return lista.innerHTML = "<p>Nenhuma cotação encontrada.</p>";

    let html = `<table><thead><tr><th>Empresa</th><th>Ramo</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>`;
    cotacoes.forEach(c => {
      const valor = c.valorDesejado?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "-";
      const data = c.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-";
      html += `<tr>
        <td>${c.empresaNome}</td>
        <td>${c.ramo}</td>
        <td>${valor}</td>
        <td>${c.status}</td>
        <td>${data}</td>
        <td>
          <a href="chat-cotacao.html?id=${c.id}" target="_blank">Abrir</a>
          ${isAdmin ? `
            | <a href="#" onclick="editarCotacao('${c.id}')">Editar</a>
            | <a href="#" onclick="excluirCotacao('${c.id}')" style="color:red;" title="Excluir cotação">🗑️</a>
          ` : ""}
        </td>
      </tr>`;
    });
    html += `</tbody></table>`;
    lista.innerHTML = html;
  });
}

function editarCotacao(id) {
  db.collection("cotacoes-gerentes").doc(id).get().then(doc => {
    if (!doc.exists) return alert("Cotação não encontrada");
    const c = doc.data();
    document.getElementById("cotacaoId").value = id;
    document.getElementById("empresa").value = c.empresaId;
    document.getElementById("ramo").value = c.ramo;
    document.getElementById("valorEstimado").value = c.valorDesejado;
    document.getElementById("observacoes").value = c.interacoes?.[0]?.mensagem || "";
    preencherEmpresa();
    document.getElementById("bloco-edicao").style.display = "block";
    window.scrollTo(0, document.body.scrollHeight);
  });
}

async function salvarAlteracoesCotacao() {
  const id = document.getElementById("cotacaoId").value;
  const empresaId = document.getElementById("empresa").value;
  const ramo = document.getElementById("ramo").value;
  const valor = parseFloat(document.getElementById("valorEstimado").value || 0);
  const obs = document.getElementById("observacoes").value.trim();
  const empresa = empresasCache.find(e => e.id === empresaId);
  if (!empresa) return alert("Empresa inválida.");

  const update = {
    empresaId,
    empresaNome: empresa.nome,
    empresaCNPJ: empresa.cnpj,
    rmId: empresa.rmId,
    rmNome: empresa.rm,
    ramo,
    valorDesejado: valor
  };

  if (obs) {
    update.interacoes = [{
      autorUid: usuarioAtual.uid,
      autorNome: usuarioAtual.email,
      dataHora: new Date(),
      mensagem: obs,
      tipo: "observacao"
    }];
  }

  await db.collection("cotacoes-gerentes").doc(id).update(update);
  alert("Alterações salvas.");
  document.getElementById("bloco-edicao").style.display = "none";
  carregarCotacoesComFiltros();
}

function excluirCotacao(id) {
  if (!confirm("Tem certeza que deseja excluir esta cotação? Essa ação não poderá ser desfeita.")) return;
  db.collection("cotacoes-gerentes").doc(id).delete()
    .then(() => {
      alert("Cotação excluída com sucesso.");
      carregarCotacoesComFiltros();
    })
    .catch(err => {
      console.error("Erro ao excluir cotação:", err);
      alert("Erro ao excluir cotação.");
    });
}

window.preencherEmpresa = preencherEmpresa;
window.preencherEmpresaNova = preencherEmpresaNova;
window.criarNovaCotacao = criarNovaCotacao;
window.carregarCotacoesComFiltros = carregarCotacoesComFiltros;
window.editarCotacao = editarCotacao;
window.salvarAlteracoesCotacao = salvarAlteracoesCotacao;
window.excluirCotacao = excluirCotacao;
