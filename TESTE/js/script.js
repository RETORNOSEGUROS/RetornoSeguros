
const produtos = {
  "1. Nacional II Compuls\u00f3rio": {
    "0-18": 256.84,
    "19-23": 303.07,
    "24-28": 366.72,
    "29-33": 440.06,
    "34-38": 501.67,
    "39-43": 516.72,
    "44-48": 629.13,
    "49-53": 739.99,
    "54-58": 880.59,
    "59+": 1540.94
  },
  "2. Nacional II Opcional": {
    "0-18": 324.3,
    "19-23": 382.67,
    "24-28": 463.03,
    "29-33": 555.64,
    "34-38": 633.43,
    "39-43": 652.43,
    "44-48": 794.37,
    "49-53": 934.34,
    "54-58": 1111.86,
    "59+": 1945.65
  },
  "3. Hospitalar Compuls\u00f3rio": {
    "0-18": 200.14,
    "19-23": 236.16,
    "24-28": 285.76,
    "29-33": 342.92,
    "34-38": 390.92,
    "39-43": 402.65,
    "44-48": 490.25,
    "49-53": 576.63,
    "54-58": 686.2,
    "59+": 1200.78
  },
  "4. Nacional II Efetivo": {
    "0-18": 211.44,
    "19-23": 249.5,
    "24-28": 301.89,
    "29-33": 362.27,
    "34-38": 412.98,
    "39-43": 425.38,
    "44-48": 517.92,
    "49-53": 609.17,
    "54-58": 724.91,
    "59+": 1268.52
  },
  "5. Nacional Plus S\u00f3cios (4x tabela)": {
    "0-18": 857.32,
    "19-23": 1011.64,
    "24-28": 1224.07,
    "29-33": 1468.9,
    "34-38": 1674.53,
    "39-43": 1724.77,
    "44-48": 2100.01,
    "49-53": 2470.02,
    "54-58": 2939.33,
    "59+": 5143.53
  },
  "6. Nacional III S\u00f3cios (3x tabela)": {
    "0-18": 449.83,
    "19-23": 530.8,
    "24-28": 642.27,
    "29-33": 770.72,
    "34-38": 878.62,
    "39-43": 904.98,
    "44-48": 1101.86,
    "49-53": 1296.04,
    "54-58": 1542.95,
    "59+": 2698.79
  },
  "7. Nacional III S\u00f3cios (2x tabela)": {
    "0-18": 416.51,
    "19-23": 491.48,
    "24-28": 594.68,
    "29-33": 713.63,
    "34-38": 813.53,
    "39-43": 837.94,
    "44-48": 1020.24,
    "49-53": 1200.01,
    "54-58": 1351.4,
    "59+": 2498.86
  },
  "8. Premium S\u00f3cios (8x tabela)": {
    "0-18": 1365.02,
    "19-23": 1610.72,
    "24-28": 1948.96,
    "29-33": 2338.77,
    "34-38": 2666.17,
    "39-43": 2746.15,
    "44-48": 3343.61,
    "49-53": 3932.75,
    "54-58": 4679.97,
    "59+": 8189.49
  },
  "9. Premium S\u00f3cios (6x tabela)": {
    "0-18": 1183.99,
    "19-23": 1397.11,
    "24-28": 1690.49,
    "29-33": 2028.6,
    "34-38": 2312.59,
    "39-43": 2381.97,
    "44-48": 2916.32,
    "49-53": 3410.04,
    "54-58": 3854.2,
    "59+": 7103.41
  },
  "10. Nacional Plus S\u00f3cios (8x tabela)": {
    "0-18": 1218.77,
    "19-23": 1438.15,
    "24-28": 1740.14,
    "29-33": 2088.19,
    "34-38": 2380.52,
    "39-43": 2451.93,
    "44-48": 2985.37,
    "49-53": 3514.01,
    "54-58": 4017.36,
    "59+": 7312.06
  }
};
const faixas = ["0-18", "19-23", "24-28", "29-33", "34-38", "39-43", "44-48", "49-53", "54-58", "59+"];
let dadosExcel = [];

window.onload = () => {
  const select = document.getElementById("produto");
  for (const nome in produtos) {
    const option = document.createElement("option");
    option.value = nome;
    option.textContent = nome;
    select.appendChild(option);
  }
  select.addEventListener('change', () => calcular());
};

document.getElementById('file-input').addEventListener('change', handleFile, false);

function handleFile(e) {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = function(event) {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, {type: 'array'});
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    dadosExcel = XLSX.utils.sheet_to_json(sheet);
    calcular();
  };
  reader.readAsArrayBuffer(file);
}

function calcular() {
  const produtoSelecionado = document.getElementById("produto").value;
  const valores = produtos[produtoSelecionado];
  if (!valores || dadosExcel.length === 0) return;

  const contagem = {};
  faixas.forEach(f => contagem[f] = 0);

  dadosExcel.forEach(row => {
    const nascimento = row.dataNascimento;
    if (!nascimento) return;

    const [dia, mes, ano] = nascimento.split('/');
    const nascimentoDate = new Date(ano, mes - 1, dia);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nascimentoDate.getFullYear();
    const m = hoje.getMonth() - nascimentoDate.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nascimentoDate.getDate())) idade--;

    const faixa = faixas.find(f => {
      const [min, max] = f.includes("+") ? [parseInt(f), 200] : f.split("-").map(Number);
      return idade >= min && idade <= max;
    });
    if (faixa) contagem[faixa]++;
  });

  let total = 0;
  let html = "<table><tr><th>Faixa</th><th>Qtd</th><th>Valor</th><th>Subtotal</th></tr>";
  faixas.forEach(f => {
    const qtd = contagem[f];
    const valor = valores[f];
    const subtotal = qtd * valor;
    total += subtotal;
    html += `<tr><td>${f}</td><td>${qtd}</td><td>R$ ${valor.toFixed(2)}</td><td>R$ ${subtotal.toFixed(2)}</td></tr>`;
  });
  html += `<tr><th colspan="3">Total</th><th>R$ ${total.toFixed(2)}</th></tr></table>`;
  document.getElementById("resultado").innerHTML = html;
}
