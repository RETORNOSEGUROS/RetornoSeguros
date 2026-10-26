/* ============================================================
   RETORNO SEGUROS — Cabeçalho (menu) compartilhado
   ------------------------------------------------------------
   Edite o menu do site INTEIRO aqui, em um único lugar.
   Toda página que tiver  <div id="site-header"></div>  e carregar
   este arquivo vai mostrar automaticamente este menu.
   ============================================================ */
(function () {
  // Marca o link da página atual como ativo
  var current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  var navHTML =
  '<nav>' +
    '<div class="logo-container">' +
      '<a href="index.html" aria-label="Página inicial">' +
        '<img src="logo-retorno-completa.png" alt="Retorno Seguros e Benefícios" class="logo">' +
      '</a>' +
    '</div>' +
    '<button class="mobile-toggle" onclick="toggleMenu()" aria-label="Abrir menu">' +
      '<svg viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h18" stroke-linecap="round"/></svg>' +
    '</button>' +
    '<ul class="nav-links" id="navLinks">' +
      '<li><a href="index.html#quem-somos">Sobre</a></li>' +

      '<li class="dropdown">' +
        '<a href="para-voce.html">Individuais</a>' +
        '<div class="dropdown-content">' +
          '<a href="seguro-auto.html">Seguro Auto</a>' +
          '<a href="seguro-residencial.html">Seguro Residencial</a>' +
          '<a href="seguro-vida.html">Seguro de Vida</a>' +
          '<a href="seguro-viagem.html">Seguro Viagem</a>' +
          '<a href="seguro-moto.html">Seguro Moto</a>' +
          '<a href="rc-profissional.html">RC Profissional</a>' +
          '<a href="eletronicos-portateis.html">Eletrônicos Portáteis</a>' +
          '<a href="seguro-painel-solar.html">Painel Solar</a>' +
          '<a href="acidentes-pessoais.html">Acidentes Pessoais</a>' +
        '</div>' +
      '</li>' +

      '<li class="dropdown">' +
        '<a href="para-sua-empresa.html">Empresa</a>' +
        '<div class="dropdown-content">' +
          '<a href="seguro-empresarial.html">Empresarial</a>' +
          '<a href="seguro-do.html">D&amp;O</a>' +
          '<a href="seguro-garantia.html">Garantia</a>' +
          '<a href="maquinas-equipamentos.html">Máquinas e Equipamentos</a>' +
          '<a href="seguro-frota.html">Frota</a>' +
          '<a href="riscos-ciberneticos.html">Riscos Cibernéticos</a>' +
          '<a href="riscos-engenharia.html">Riscos de Engenharia</a>' +
          '<a href="transporte-carga.html">Transporte de Carga</a>' +
          '<a href="seguro-condominio.html">Condomínio</a>' +
          '<a href="seguro-agronegocio.html">Agronegócio</a>' +
          '<a href="seguro-pessoa-chave.html">Pessoa-Chave</a>' +
        '</div>' +
      '</li>' +

      '<li class="dropdown">' +
        '<a href="beneficios.html">Benefícios PJ</a>' +
        '<div class="dropdown-content">' +
          '<a href="vida-em-grupo.html">Seguro de Vida</a>' +
          '<a href="plano-saude.html">Plano de Saúde</a>' +
          '<a href="plano-dental.html">Plano Dental</a>' +
          '<a href="previdencia-privada.html">Previdência</a>' +
        '</div>' +
      '</li>' +

      '<li><a href="index.html#diagnostico">Diagnóstico</a></li>' +

      '<li class="dropdown">' +
        '<a href="programa-parceria.html">Parcerias</a>' +
        '<div class="dropdown-content">' +
          '<a href="programa-parceria.html">Programa de Parceria</a>' +
        '</div>' +
      '</li>' +

      '<li class="dropdown">' +
        '<a href="para-voce.html" class="nav-cta" style="background:var(--teal);color:#fff;font-weight:700;letter-spacing:.5px;border-radius:10px;">COTAR AGORA</a>' +
        '<div class="dropdown-content">' +
          '<a href="cotacao-auto.html">Seguro Auto</a>' +
          '<a href="cotacao-residencial.html">Seguro Residencial</a>' +
          '<a href="cotacao-vida.html">Seguro de Vida</a>' +
          '<a href="cotacao-empresarial.html">Seguro Empresarial</a>' +
          '<a href="cotacao-frota.html">Seguro de Frota</a>' +
          '<a href="cotacao-vida-empresarial.html">Vida em Grupo</a>' +
          '<a href="cotacao-saude.html">Plano de Saúde</a>' +
          '<a href="cotacao-dental.html">Plano Dental</a>' +
        '</div>' +
      '</li>' +
    '</ul>' +
  '</nav>';

  // Função de abrir/fechar menu no mobile (global, usada pelo botão)
  window.toggleMenu = function () {
    var n = document.getElementById('navLinks');
    if (n) n.classList.toggle('active');
  };

  function mount() {
    var mountPoint = document.getElementById('site-header');
    if (!mountPoint) return;
    var header = document.createElement('header');
    header.innerHTML = navHTML;
    mountPoint.parentNode.replaceChild(header, mountPoint);

    // Marca o item ativo (link cujo href aponta para a página atual)
    try {
      header.querySelectorAll('.nav-links > li > a').forEach(function (a) {
        var href = (a.getAttribute('href') || '').split('#')[0].toLowerCase();
        if (href && href === current) a.classList.add('active');
      });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
