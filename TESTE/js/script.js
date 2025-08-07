
const faixasEtarias = [
  "0-18", "19-23", "24-28", "29-33", "34-38", "39-43", "44-48", "49-53", "54-58", "59+"
];

const planos = [
  {
    nome: "Hospitalar Compulsório",
    valores: [200.14, 236.16, 285.76, 342.92, 390.92, 402.65, 490.25, 576.63, 686.20, 1200.78]
  },
  {
    nome: "Nacional II Efetivo",
    valores: [null, null, null, null, null, null, null, null, null, null] // preencher depois
  },
  {
    nome: "Nacional II Compulsório",
    valores: [256.84, 303.07, 366.72, 440.06, 501.67, 516.72, 629.13, 739.99, 880.59, 1540.94]
  },
  {
    nome: "Nacional II Opcional",
    valores: [324.30, 382.67, 463.03, 555.64, 633.43, 652.43, 794.37, 934.34, 1111.86, 1945.65]
  },
  {
    nome: "Nacional III Sócios (2x tabela)",
    valores: [null, null, null, null, null, null, null, null, null, null]
  },
  {
    nome: "Nacional III Sócios (2x tabela)",
    valores: [null, null, null, null, null, null, null, null, null, null]
  },
  {
    nome: "Nacional Plus Sócios (4x tabela)",
    valores: [null, null, null, null, null, null, null, null, null, null]
  },
  {
    nome: "Nacional Plus Sócios (8x tabela)",
    valores: [null, null, null, null, null, null, null, null, null, null]
  },
  {
    nome: "Premium Sócios (6x tabela)",
    valores: [null, null, null, null, null, null, null, null, null, null]
  },
  {
    nome: "Premium Sócios (8x tabela)",
    valores: [null, null, null, null, null, null, null, null, null, null]
  }
];

function toggleMode() {
  const modoManual = document.getElementById("modoManual");
  const modoArquivo = document.getElementById("modoArquivo");
  const texto = document.getElementById("modoTexto");
  if (modoManual.style.display === "none") {
    modoManual.style.display = "block";
    modoArquivo.style.display = "none";
    texto.innerText = "Digitar";
  } else {
    modoManual.style.display = "none";
    modoArquivo.style.display = "block";
    texto.innerText = "Importar Planilha";
  }
}

function gerarInputs() {
  const container = document.getElementById("faixasContainer");
  container.innerHTML = "";
  faixasEtarias.forEach((faixa, i) => {
    const col = document.createElement("div");
    col.className = "col-md-2";
    col.innerHTML = `
      <label>${faixa}</label>
      <input type="number" class="form-control" id="faixa${i}" min="0" value="0" />
    `;
    container.appendChild(col);
  });
}

function calcularCustos(vidas = null) {
  let qtdVidas = vidas || faixasEtarias.map((_, i) => parseInt(document.getElementById("faixa" + i).value || 0));
  let resultadoHTML = '<h3>Resultado</h3>';
  resultadoHTML += '<div class="table-container"><table class="table table-bordered table-striped"><thead><tr><th>Plano</th>';

  faixasEtarias.forEach(f => resultadoHTML += `<th>${f}</th>`);
  resultadoHTML += '<th>Total</th><th>Total de vidas</th></tr></thead><tbody>';

  planos.forEach(plano => {
    let total = 0;
    let linha = `<tr><td class="plan-title">${plano.nome}</td>`;
    plano.valores.forEach((valor, i) => {
      const custo = valor ? valor * qtdVidas[i] : 0;
      total += custo;
      linha += `<td>${valor ? "R$ " + custo.toFixed(2) : "-"}</td>`;
    });
    const totalVidas = qtdVidas.reduce((a, b) => a + b, 0);
    linha += `<td><strong>R$ ${total.toFixed(2)}</strong></td><td>${totalVidas}</td></tr>`;
    resultadoHTML += linha;
  });

  resultadoHTML += '</tbody></table></div>';
  document.getElementById("resultadoContainer").innerHTML = resultadoHTML;
}

function carregarPlanilha() {
  const input = document.getElementById("csvInput");
  const reader = new FileReader();
  reader.onload = function (e) {
    const linhas = e.target.result.split("\n");
    const dados = linhas[1]?.split(",").map(v => parseInt(v.trim()) || 0);
    if (dados && dados.length === faixasEtarias.length) {
      calcularCustos(dados);
    } else {
      alert("Erro ao ler o arquivo CSV. Verifique o formato.");
    }
  };
  if (input.files[0]) {
    reader.readAsText(input.files[0]);
  } else {
    alert("Selecione um arquivo CSV primeiro.");
  }
}

window.onload = gerarInputs;
