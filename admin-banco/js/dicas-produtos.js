const dicasProdutos = [
  {
    campo: "dental-funcionarios",
    nome: "Dental Funcionários",
    descricao: "Plano odontológico voltado a funcionários, com rede nacional.",
    oQuePedir: "Quantidade de vidas, CNPJ, cobertura desejada, plano atual se houver.",
    dicas: "Planos odontológicos aumentam a satisfação dos colaboradores com custo reduzido.",
    gatilhos: "Economia, valorização, retenção, convenção coletiva."
  },
  {
    campo: "frota",
    nome: "Frota",
    descricao: "Seguro para veículos de empresas com condições especiais.",
    oQuePedir: "Placas, renavam, perfil de uso, tipo de cobertura desejada.",
    dicas: "Você pode economizar até 30% com um seguro de frota estruturado.",
    gatilhos: "Redução de custos, proteção patrimonial, previsibilidade."
  },
  {
    campo: "vida-resgatável",
    nome: "Vida Resgatável",
    descricao: "Seguro de vida com possibilidade de resgate e blindagem patrimonial.",
    oQuePedir: "Idade dos sócios, valor de cobertura desejado, estrutura societária.",
    dicas: "Ideal para blindagem de patrimônio e planejamento sucessório.",
    gatilhos: "Blindagem, sucessão, rentabilidade, proteção."
  },
  {
    campo: "saude-funcionarios",
    nome: "Saúde Funcionários",
    descricao: "Plano de saúde empresarial com redes e coberturas flexíveis.",
    oQuePedir: "Quantidade de vidas, operadora atual, carências, região de cobertura.",
    dicas: "Reduz turnover e melhora a produtividade com benefícios reais.",
    gatilhos: "Retenção, benefício valorizado, saúde preventiva."
  },
  {
    campo: "empresarial-patrimonial",
    nome: "Empresarial Patrimonial",
    descricao: "Proteção contra incêndios, roubo, danos elétricos e mais.",
    oQuePedir: "Valor do imóvel, tipo de atividade, endereço, proteções existentes.",
    dicas: "Proteja seu negócio contra imprevistos com custo acessível.",
    gatilhos: "Segurança, continuidade, proteção do patrimônio."
  }
];

function renderizarDicasProdutos(containerId = 'produtosContainer') {
  const container = document.getElementById(containerId);
  if (!container) return;

  dicasProdutos.forEach(produto => {
    const card = document.createElement('div');
    card.className = 'produto';
    card.innerHTML = `
      <h2>${produto.nome}</h2>
      <div class="campo"><strong>O que é:</strong> ${produto.descricao}</div>
      <div class="campo"><strong>O que pedir para cotar:</strong> ${produto.oQuePedir}</div>
      <div class="campo"><strong>Dicas comerciais:</strong> ${produto.dicas}</div>
      <div class="campo"><strong>Gatilhos mentais:</strong> ${produto.gatilhos}</div>
    `;
    container.appendChild(card);
  });
}
