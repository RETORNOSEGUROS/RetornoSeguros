function parseDataToNumero(dataStr) {
  if (!dataStr || !dataStr.includes("/")) return 0;
  const [dia, mes] = dataStr.split("/");
  return parseInt(dia.padStart(2, "0") + mes.padStart(2, "0"));
}

function validarDataFormatada(data) {
  return /^\d{2}\/\d{2}$/.test(data);
}

function carregarRMs() {
  const select = document.getElementById("filtroRm");
  db.collection("gerentes").get().then(snapshot => {
    snapshot.forEach(doc => {
      const g = doc.data();
      const opt = document.createElement("option");
      opt.value = g.nome;
      opt.textContent = g.nome;
      select.appendChild(opt);
    });
  });
}

function carregarVencimentos() {
  const tbody = document.getElementById("tabelaVencimentos");
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>`;

  const dataDe = document.getElementById("dataDe").value.trim();
  const dataAte = document.getElementById("dataAte").value.trim();
  const filtroRm = document.getElementById("filtroRm").value;

  if (!validarDataFormatada(dataDe) || !validarDataFormatada(dataAte)) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Datas inválidas. Use formato dd/mm</td></tr>`;
    return;
  }

  const inicio = parseDataToNumero(dataDe);
  const fim = parseDataToNumero(dataAte);
  const resultados = [];

  // VISITAS
  db.collection("visitas").get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const empresa = data.empresaNome || "-";
      const rm = data.rmNome || "-";
      const ramos = data.ramos || {};

      Object.entries(ramos).forEach(([ramo, dados]) => {
        const venc = dados.vencimento;
        if (validarDataFormatada(venc)) {
          const n = parseDataToNumero(venc);
          if (n >= inicio && n <= fim && (filtroRm === "Todos" || filtroRm === rm)) {
            resultados.push({
              empresa,
              ramo: ramo.toUpperCase(),
              rm,
              valor: dados.premio || 0,
              data: venc,
              origem: "Mapeado em visita"
            });
          }
        }
      });
    });

    // NEGÓCIOS FECHADOS
    return db.collection("cotacoes-gerentes")
      .where("status", "==", "Negócio Emitido").get();
  }).then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const empresa = data.empresa || "-";
      const rm = data.rmNome || "-";
      const ramo = data.ramo || "-";
      const valor = data.valorFinal || 0;

      let dataStr = "";
      if (data.fimVigencia && typeof data.fimVigencia.toDate === "function") {
        const d = data.fimVigencia.toDate();
        const dia = String(d.getDate()).padStart(2, "0");
        const mes = String(d.getMonth() + 1).padStart(2, "0");
        dataStr = `${dia}/${mes}`;
      }

      const n = parseDataToNumero(dataStr);
      if (n >= inicio && n <= fim && (filtroRm === "Todos" || filtroRm === rm)) {
        resultados.push({
          empresa,
          ramo,
          rm,
          valor,
          data: dataStr,
          origem: "Fechado conosco"
        });
      }
    });

    exibirVencimentos(resultados);
  }).catch(err => {
    console.error("Erro:", err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Erro ao buscar dados</td></tr>`;
  });
}

function exibirVencimentos(lista) {
  const tbody = document.getElementById("tabelaVencimentos");
  tbody.innerHTML = "";

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Nenhum resultado encontrado.</td></tr>`;
    return;
  }

  lista.sort((a, b) => parseDataToNumero(a.data) - parseDataToNumero(b.data));

  lista.forEach(l => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.empresa}</td>
      <td>${l.ramo}</td>
      <td>${l.rm}</td>
      <td>${parseFloat(l.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
      <td>${l.data}</td>
      <td>${l.origem}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.addEventListener("load", () => {
  carregarRMs();

  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  document.getElementById("dataDe").value = `01/${mes}`;
  document.getElementById("dataAte").value = `31/${mes}`;
  carregarVencimentos();
});
