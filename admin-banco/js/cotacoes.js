
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

  const lista = document.getElementById("listaCotacoes");
  lista.innerHTML = "Carregando...";

  db.collection("cotacoes-gerentes")
    .where("autorUid", "==", user.uid)
    // .orderBy("dataCriacao", "desc") // desativado temporariamente para teste sem índice
    .limit(10)
    .get()
    .then(snapshot => {
      lista.innerHTML = "";
      if (snapshot.empty) {
        lista.innerHTML = "<p>Nenhum negócio encontrado.</p>";
        return;
      }

      snapshot.forEach(doc => {
        const cot = doc.data();
        const div = document.createElement("div");
        div.style.marginBottom = "20px";
        div.innerHTML = `
          <strong>${cot.empresaNome}</strong> (${cot.ramo})<br>
          Valor Desejado: R$ ${cot.valorDesejado?.toLocaleString("pt-BR") || "0,00"}<br>
          Status: <b>${cot.status}</b><br>
          <a href="chat-cotacao.html?id=${doc.id}">Abrir conversa</a>
        `;
        lista.appendChild(div);
      });
    })
    .catch(err => {
      console.error("Erro ao buscar cotações:", err);
      lista.innerHTML = "<p>Erro ao buscar dados.</p>";
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

    select.innerHTML = `<option value="">Selecione uma empresa</option>`;
    snapshot.forEach(doc => {
      const dados = doc.data();
      const nome = dados.nome || "(sem nome)";
      empresasCache.push({ id: doc.id, ...dados });

      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = nome;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Erro ao carregar empresas:", err);
    select.innerHTML = `<option value="">Erro ao carregar empresas</option>`;
  }
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

  if (!usuarioAtual) {
    alert("Usuário não autenticado corretamente.");
    return;
  }

  if (!empresaId || !ramo) {
    alert("Preencha todos os campos obrigatórios.");
    return;
  }

  const empresa = empresasCache.find(e => e.id === empresaId);
  if (!empresa) {
    alert("Empresa não encontrada. Aguarde o carregamento ou selecione novamente.");
    return;
  }

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
    autorUid: usuarioAtual.uid,
    autorNome: usuarioAtual.email,
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

  console.log("🟡 Criando cotação com dados:", novaCotacao);

  db.collection("cotacoes-gerentes").add(novaCotacao)
    .then(() => {
      alert("Negócio registrado com sucesso.");
      document.getElementById("empresa").value = "";
      document.getElementById("ramo").value = "";
      document.getElementById("valorEstimado").value = "";
      document.getElementById("observacoes").value = "";
      document.getElementById("info-cnpj").textContent = "";
      document.getElementById("info-rm").textContent = "";
      location.reload();
    })
    .catch(err => {
      console.error("Erro ao salvar cotação:", err);
      alert("Erro ao criar cotação.");
    });
}

window.enviarCotacao = enviarCotacao;
window.preencherEmpresa = preencherEmpresa;
