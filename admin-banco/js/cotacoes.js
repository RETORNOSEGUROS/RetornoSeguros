firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let usuarioAtual = null;
let empresasCache = [];

auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  usuarioAtual = user;
  await carregarEmpresas();
  listarCotacoes();
});

async function carregarEmpresas() {
  const select = document.getElementById("empresa");
  const snapshot = await db.collection("empresas").orderBy("nome").get();

  empresasCache = [];

  select.innerHTML = `<option value="">Selecione uma empresa</option>`;
  snapshot.forEach(doc => {
    const dados = doc.data();
    empresasCache.push({ id: doc.id, ...dados });

    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = dados.nome;
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

function enviarCotacao() {
  const empresaId = document.getElementById("empresa").value;
  const ramo = document.getElementById("ramo").value;
  const valor = parseFloat(document.getElementById("valorEstimado").value || 0);
  const observacoes = document.getElementById("observacoes").value.trim();

  if (!empresaId || !ramo) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  const empresa = empresasCache.find(e => e.id === empresaId);
  const novaCotacao = {
    empresaId,
    empresaNome: empresa?.nome || "",
    empresaCNPJ: empresa?.cnpj || "",
    rmId: empresa?.rmId || "",
    rmNome: empresa?.rm || "",
    ramo,
    valorDesejado: valor,
    valorFechado: null,
    status: "Negócio iniciado",
    dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
    criadoPorUid: usuarioAtual.uid,
    interacoes: observacoes
      ? [{
          autorNome: usuarioAtual.email,
          autorUid: usuarioAtual.uid,
          mensagem: observacoes,
          dataHora: firebase.firestore.FieldValue.serverTimestamp(),
          tipo: "observacao"
        }]
      : []
  };

  db.collection("cotacoes-gerentes").add(novaCotacao)
    .then(() => {
      alert("Negócio registrado com sucesso.");
      document.getElementById("empresa").value = "";
      document.getElementById("ramo").value = "";
      document.getElementById("valorEstimado").value = "";
      document.getElementById("observacoes").value = "";
      document.getElementById("info-cnpj").textContent = "";
      document.getElementById("info-rm").textContent = "";
      listarCotacoes();
    })
    .catch(err => {
      console.error("Erro ao salvar cotação:", err);
      alert("Erro ao criar cotação.");
    });
}

function listarCotacoes() {
  const lista = document.getElementById("listaCotacoes");
  lista.innerHTML = "Carregando...";

  db.collection("cotacoes-gerentes")
    .where("criadoPorUid", "==", usuarioAtual.uid)
    .orderBy("dataCriacao", "desc")
    .limit(10)
    .get()
    .then(snapshot => {
      lista.innerHTML = "";
      if (snapshot.empty) {
        lista.innerHTML = "<p>Nenhum negócio encontrado.</p>";
        return;
      }

      snapshot.forEach(doc => {
        const cot = doc.data
