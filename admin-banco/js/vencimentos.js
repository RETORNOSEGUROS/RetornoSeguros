// js/vencimentos.js

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const tableBody = document.querySelector("tbody");
const selectRM = document.getElementById("selectRM");
const dataInicio = document.getElementById("dataInicio");
const dataFim = document.getElementById("dataFim");
const btnFiltrar = document.getElementById("btnFiltrar");

const carregarRMs = async () => {
  const rms = new Set();

  const visitasSnap = await db.collection("visitas").get();
  visitasSnap.forEach((doc) => {
    const rm = doc.data().rmNome || "-";
    rms.add(rm);
  });

  const negociosSnap = await db
    .collection("cotacoes-gerentes")
    .where("status", "==", "Negócio Emitido")
    .get();
  negociosSnap.forEach((doc) => {
    const rm = doc.data().rmNome || "-";
    rms.add(rm);
  });

  const rmsOrdenados = Array.from(rms).sort();
  for (const rm of rmsOrdenados) {
    const option = document.createElement("option");
    option.value = rm;
    option.textContent = rm;
    selectRM.appendChild(option);
  }
};

const formatarData = (data) => {
  const d = data.toDate();
  const dia = ("0" + d.getDate()).slice(-2);
  const mes = ("0" + (d.getMonth() + 1)).slice(-2);
  return `${dia}/${mes}`;
};

const formatarValor = (valor) => {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};

const filtrarDados = async () => {
  tableBody.innerHTML = `<tr><td colspan='6'>Carregando...</td></tr>`;
  const filtroRM = selectRM.value;

  const inicio = dataInicio.value ? parseInt(dataInicio.value.split("/")[0]) : null;
  const fim = dataFim.value ? parseInt(dataFim.value.split("/")[0]) : null;

  let resultados = [];

  // VISITAS
  const visitasSnap = await db.collection("visitas").get();
  visitasSnap.forEach((doc) => {
    const data = doc.data();
    const ramos = data.ramos || {};
    const rm = data.rmNome || "-";

    Object.entries(ramos).forEach(([ramo, info]) => {
      if (info.vencimento) {
        const [dia, mes] = info.vencimento.split("/").map(Number);
        if (
          (!inicio || mes >= inicio) &&
          (!fim || mes <= fim) &&
          (filtroRM === "Todos" || rm === filtroRM)
        ) {
          resultados.push({
            empresa: data.nomeEmpresa || "-",
            ramo,
            rm,
            valor: info.premio || 0,
            dataRenovacao: info.vencimento,
            origem: "Mapeado em visita",
          });
        }
      }
    });
  });

  // NEGÓCIOS FECHADOS
  const negociosSnap = await db
    .collection("cotacoes-gerentes")
    .where("status", "==", "Negócio Emitido")
    .get();
  negociosSnap.forEach((doc) => {
    const data = doc.data();
    const rm = data.rmNome || "-";
    const fimVigencia = data.fimVigencia;

    if (fimVigencia && fimVigencia.toDate) {
      const mes = fimVigencia.toDate().getMonth() + 1;
      if (
        (!inicio || mes >= inicio) &&
        (!fim || mes <= fim) &&
        (filtroRM === "Todos" || rm === filtroRM)
      ) {
        resultados.push({
          empresa: data.nomeEmpresa || "-",
          ramo: data.ramo || "-",
          rm,
          valor: data.valorEstimado || 0,
          dataRenovacao: formatarData(fimVigencia),
          origem: "Fechado conosco",
        });
      }
    }
  });

  if (resultados.length === 0) {
    tableBody.innerHTML = `<tr><td colspan='6'>Nenhum resultado encontrado.</td></tr>`;
    return;
  }

  tableBody.innerHTML = resultados
    .map(
      (item) => `
    <tr>
      <td>${item.empresa}</td>
      <td>${item.ramo}</td>
      <td>${item.rm}</td>
      <td>${formatarValor(item.valor)}</td>
      <td>${item.dataRenovacao}</td>
      <td>${item.origem}</td>
    </tr>`
    )
    .join("");
};

carregarRMs();
btnFiltrar.addEventListener("click", filtrarDados);
filtrarDados();
