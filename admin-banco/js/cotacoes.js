firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioAtual = null;
let empresasCache = [];
let isAdmin = false;

window.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    usuarioAtual = user;
    isAdmin = user.email === "patrick@retornoseguros.com.br"; // ajuste se necessário

    console.log("✅ Logado como:", user.email, "| Admin:", isAdmin);

    await Promise.all([
      carregarEmpresas(),
      carregarRamosSeguro(),
      carregarRM(),
      carregarStatus()
    ]);

    carregarCotacoesComFiltros();
    if (!isAdmin) document.getElementById("btnSalvarAlteracoes").style.display = "none";
  });
});

async function carregarEmpresas() {
  const select = document.getElementById("empresa");
  select.innerHTML = `<option value="">Carregando...</option>`;

  try {
    const snapshot = await db.collection("empresas").get();
    empresasCache = [];

    if (snapshot.empty) {
      select.innerHTML = `<option value="">Nenhuma empresa encontrada</option>`;
      return;
    }

    select.innerHTML = `<option value="">Selecione a empresa</option>`;
    snapshot.forEach(doc => {
      const dados = doc.data();
      empresasCache.push({ id: doc.id, ...dados });

      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = dados.nome;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Erro ao carregar empresas:", err);
    select.innerHTML = `<option value="">Erro ao carregar</option>`;
  }
}

async function carregarRamosSeguro() {
  const select = document.getElementById("ramo");
  try {
    const snapshot = await db.collection("ramos-seguro").orderBy("ordem").get();
    select.innerHTML = `<option value="">Selecione o ramo</option>`;
    snapshot.forEach(doc => {
      const d = doc.data();
      const opt = document.createElement("option");
      opt.value = d.nomeExibicao || doc.id;
      opt.textContent = d.nomeExibicao || doc.id;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Erro ao carregar ramos:", err);
    select.innerHTML = `<option value="">Erro ao carregar ramos</option>`;
  }
}

async function carregarRM() {
  const select = document.getElementById("filtroRM");
  const snapshot = await db.collection("cotacoes-gerentes").get();
  const nomesUnicos = new Set();
  snapshot.forEach(doc => {
    const nome = doc.data().rmNome;
    if (nome && !nomesUnicos.has(nome)) {
      nomesUnicos.add(nome);
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      select.appendChild(opt);
    }
  });
}

async function carregarStatus() {
  const select = document.getElementById("filtroStatus");
  const snap = await db.doc("status-negociacao/config").get();
  const status = snap.data()?.statusFinais || [];

  select.innerHTML = `<option value="">Todos</option>`;
  status.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
}

function preencherEmpresa() {
  const empresaId = document.getElementById("empresa").value;
  const infoCNPJ = document.getElementById("info-cnpj");
  const infoRM = document.getElementById("info-rm");

  const empresa = empresasCache.find(e => e.id === empresaId);
  if (empresa) {
    infoCNPJ.textContent = `CNPJ: ${empresa.cnpj || "Não informado"}`;
    infoRM.textContent = `RM responsável: ${empresa.rm || "Não vinculado"}`;
  } else {
    infoCNPJ.textContent = "";
    infoRM.textContent = "";
  }
}

function carregarCotacoesComFiltros() {
  const lista = document.getElementById("listaCotacoes");
  lista.innerHTML = "Carregando...";

  let query = db.collection("cotacoes-gerentes");

  if (!isAdmin) {
    query = query.where("criadoPorUid", "==", usuarioAtual.uid);
  }

  query.get().then(snapshot => {
    let cotacoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // filtros
    const dataInicio = document.getElementById("filtroDataInicio").value;
    const dataFim = document.getElementById("filtroDataFim").value;
    const rm = document.getElementById("filtroRM").value;
    const status = document.getElementById("filtroStatus").value;

    cotacoes = cotacoes.filter(c => {
      const d = c.dataCriacao?.toDate?.();
      if (dataInicio && d < new Date(dataInicio)) return false;
      if (dataFim && d > new Date(dataFim + 'T23:59:59')) return false;
      if (rm && c.rmNome !== rm) return false;
      if (status && c.status !== status) return false;
      return true;
    });

    if (!cotacoes.length) {
      lista.innerHTML = "<p>Nenhuma cotação encontrada.</p>";
      return;
    }

    let html = `<table><thead><tr><th>Empresa</th><th>Ramo</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>`;
    cotacoes.forEach(c => {
      const data = c.dataCriacao?.toDate?.().toLocaleDateString("pt-BR") || "-";
      const valor = c.valorDesejado?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "-";
      html += `<tr>
        <td>${c.empresaNome}</td>
        <td>${c.ramo}</td>
        <td>${valor}</td>
        <td>${c.status}</td>
        <td>${data}</td>
        <td>
          <a href="chat-cotacao.html?id=${c.id}" target="_blank">Abrir</a> |
          ${isAdmin ? `<a href="#" onclick="editarCotacao('${c.id}')">Editar</a>` : ""}
        </td>
      </tr>`;
    });
    html += `</tbody></table>`;
    lista.innerHTML = html;
  });
}

function editarCotacao(id) {
  db.collection("cotacoes-gerentes").doc(id).get().then(doc => {
    if (!doc.exists) return alert("Cotação não encontrada.");

    const cot = doc.data();
    document.getElementById("cotacaoId").value = id;
    document.getElementById("empresa").value = cot.empresaId || "";
    document.getElementById("ramo").value = cot.ramo || "";
    document.getElementById("valorEstimado").value = cot.valorDesejado || "";
    document.getElementById("observacoes").value = cot.interacoes?.[0]?.mensagem || "";
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
  const observacoes = document.getElementById("observacoes").value.trim();

  const empresa = empresasCache.find(e => e.id === empresaId);
  if (!empresa) return alert("Empresa inválida.");

  const atualizacao = {
    empresaId,
    empresaNome: empresa.nome || "",
    empresaCNPJ: empresa.cnpj || "",
    rmId: empresa.rmId || "",
    rmNome: empresa.rm || "",
    ramo,
    valorDesejado: valor
  };

  if (observacoes) {
    atualizacao.interacoes = [{
      autorUid: usuarioAtual.uid,
      autorNome: usuarioAtual.email,
      dataHora: new Date(),
      mensagem: observacoes,
      tipo: "observacao"
    }];
  }

  try {
    await db.collection("cotacoes-gerentes").doc(id).update(atualizacao);
    alert("✅ Cotação atualizada com sucesso.");
    document.getElementById("bloco-edicao").style.display = "none";
    carregarCotacoesComFiltros();
  } catch (err) {
    console.error("Erro ao atualizar:", err);
    alert("Erro ao atualizar cotação.");
  }
}

window.preencherEmpresa = preencherEmpresa;
window.editarCotacao = editarCotacao;
window.salvarAlteracoesCotacao = salvarAlteracoesCotacao;
window.carregarCotacoesComFiltros = carregarCotacoesComFiltros;
