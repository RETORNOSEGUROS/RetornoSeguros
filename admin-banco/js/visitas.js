/* ============================================================
   🔽 ADIÇÕES: coleta, PDF editável e link para WhatsApp
   ============================================================ */

// Retorna um snapshot dos dados atuais do formulário (sem gravar no Firestore)
function coletarDadosFormulario() {
  const empresaSelect = document.getElementById("empresa");
  const tipoVisita = (document.getElementById("tipoVisita")?.value || "").trim();
  const empresaId = empresaSelect?.value || "";
  const empresaNome = empresaSelect?.options?.[empresaSelect.selectedIndex]?.textContent || "";
  const rmNome = document.getElementById("rmNome")?.textContent || "";
  const numFuncionarios = (document.getElementById("numFuncionarios")?.value || "").trim();

  const ramos = [];
  document.querySelectorAll(".ramo").forEach(input => {
    if (input.checked) {
      const id = input.value;
      ramos.push({
        id,
        vencimento: (document.getElementById(`${id}-vencimento`)?.value || "").trim(),
        premio: (document.getElementById(`${id}-premio`)?.value || "").trim(),
        seguradora: (document.getElementById(`${id}-seguradora`)?.value || "").trim(),
        observacoes: (document.getElementById(`${id}-observacoes`)?.value || "").trim(),
      });
    }
  });

  return { empresaId, empresaNome, tipoVisita, rmNome, numFuncionarios, ramos };
}

// Gera um PDF preenchível com os dados atuais do formulário (tablet-friendly e imprimível)
async function gerarPDF() {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const dados = coletarDadosFormulario();

  if (!dados.empresaId) { alert("Selecione a empresa para gerar o PDF."); return; }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 retrato
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = 800;
  const margin = 40;

  // Título
  page.drawText('Relatório de Visita - Retorno Seguros', { x: margin, y, size: 14, font, color: rgb(0,0.25,0.5) });
  y -= 14 + 8;

  // Cabeçalho
  const drawLabel = (label, value) => {
    page.drawText(label, { x: margin, y, size: 10, font, color: rgb(0.2,0.2,0.2) });
    const field = form.createTextField(`fld_${label.replace(/\W+/g,'_').toLowerCase()}`);
    field.setText(value || "");
    field.addToPage(page, { x: margin + 150, y: y - 2, width: 390, height: 16 });
    y -= 22;
  };

  drawLabel("Empresa", dados.empresaNome);
  drawLabel("Tipo de visita", dados.tipoVisita || "Presencial");
  drawLabel("RM responsável", dados.rmNome || "");
  drawLabel("Nº de funcionários", dados.numFuncionarios || "");

  // Linha divisória
  y -= 4;
  page.drawLine({ start: {x: margin, y}, end: {x: 555, y}, thickness: 1, color: rgb(0.85,0.88,0.93) });
  y -= 14;

  // Ramos
  page.drawText('Mapeamento de Seguros', { x: margin, y, size: 12, font, color: rgb(0,0.25,0.5) });
  y -= 16;

  if (!dados.ramos.length) {
    page.drawText('Nenhum ramo selecionado. (Este PDF é imprimível e também editável.)', { x: margin, y, size: 10, font });
    y -= 12;
  } else {
    for (const r of dados.ramos) {
      page.drawText(`• ${r.id.toUpperCase()}`, { x: margin, y, size: 11, font, color: rgb(0,0.25,0.5) });
      y -= 14;

      const addField = (label, value, width=390) => {
        page.drawText(label, { x: margin+14, y, size: 9, font, color: rgb(0.2,0.2,0.2) });
        const f = form.createTextField(`ramo_${r.id}_${label.replace(/\W+/g,'_').toLowerCase()}`);
        f.setText(value || "");
        f.addToPage(page, { x: margin + 120, y: y - 2, width, height: 14 });
        y -= 20;
      };

      addField("Vencimento (dd/mm/aaaa)", r.vencimento);
      addField("Prêmio (R$)", r.premio);
      addField("Seguradora", r.seguradora);
      // Campo maior para observações
      page.drawText("Observações", { x: margin+14, y, size: 9, font, color: rgb(0.2,0.2,0.2) });
      const obs = form.createTextField(`ramo_${r.id}_observacoes`);
      obs.setText(r.observacoes || "");
      obs.addToPage(page, { x: margin + 120, y: y - 2, width: 390, height: 40 });
      y -= 50;

      // Espaço entre ramos
      y -= 4;
      if (y < 140) { // quebra simples de página
        y = 800;
        pdfDoc.addPage([595.28, 841.89]);
      }
    }
  }

  // Área para anotações manuais na visita
  y -= 2;
  page.drawLine({ start: {x: margin, y}, end: {x: 555, y}, thickness: 1, color: rgb(0.85,0.88,0.93) });
  y -= 14;
  page.drawText('Anotações da visita (campo editável):', { x: margin, y, size: 11, font, color: rgb(0.2,0.2,0.2) });
  const notas = form.createTextField('anotacoes_visita');
  notas.setText('');
  notas.addToPage(page, { x: margin, y: y - 80, width: 515, height: 80 });

  form.updateFieldAppearances(font);
  const pdfBytes = await pdfDoc.save();

  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  // Força download (funciona em tablet e desktop); usuário também pode abrir e salvar localmente
  const a = document.createElement("a");
  a.href = url;
  a.download = `Visita_${(dados.empresaNome || "empresa").replace(/\s+/g,'_')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Gera um link para o cliente preencher (comunicação via WhatsApp)
function gerarLinkWhatsApp() {
  const empresaSel = document.getElementById("empresa");
  const empresaId = empresaSel?.value || "";
  const empresaNome = empresaSel?.options?.[empresaSel.selectedIndex]?.textContent || "";

  if (!empresaId) { alert("Selecione a empresa antes de gerar o link."); return; }

  // Link público sugerido (crie estes arquivos simples no seu projeto):
  // visita-cliente.html + visita-cliente.js (form simplificado que grava em 'visitas' com tipoVisita = 'Cliente')
  const baseUrl = `${location.origin}${location.pathname.replace(/[^\/]+$/, '')}visita-cliente.html`;
  const url = `${baseUrl}?empresaId=${encodeURIComponent(empresaId)}&empresaNome=${encodeURIComponent(empresaNome)}&tipoVisita=Cliente`;

  const msg = `Olá! Poderia preencher seus dados para atualizarmos seu seguro? %0A%0AEmpresa: ${encodeURIComponent(empresaNome)}%0AFormulário: ${encodeURIComponent(url)}%0A%0ALeva 2 min e agiliza nossa proposta. Obrigado!`;
  const wa = `https://wa.me/?text=${msg}`;

  // Abre a caixa de compartilhamento do WhatsApp
  window.open(wa, "_blank");

  // Dica rápida na tela (também copia para a área de transferência)
  try { navigator.clipboard.writeText(decodeURIComponent(msg.replace(/%0A/g, '\n')) + '\n' + url); } catch(e) {}
  alert("Link gerado! Abri o WhatsApp com a mensagem pronta e copiei o texto para sua área de transferência.");
}

// [OPCIONAL] Se vier com ?tipoVisita=Cliente no link (modo cliente), pré-seleciona e trava o campo
(function aplicarModoClienteSeNecessario(){
  const params = new URLSearchParams(location.search);
  const tipo = params.get("tipoVisita");
  const empresaId = params.get("empresaId");
  const empresaNome = params.get("empresaNome");

  if (tipo === "Cliente") {
    const tipoSel = document.getElementById("tipoVisita");
    if (tipoSel) {
      tipoSel.value = "Cliente";
      tipoSel.setAttribute("disabled", "disabled");
    }
    // preseleciona empresa se possível (após carregarEmpresas)
    const selecionarDepois = () => {
      const sel = document.getElementById("empresa");
      if (!sel) return;
      if (empresaId) {
        const opt = [...sel.options].find(o => o.value === empresaId || o.textContent === empresaNome);
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event("change"));
        }
      }
    };
    // dá um tempinho até o carregamento assíncrono terminar
    document.addEventListener("DOMContentLoaded", () => setTimeout(selecionarDepois, 600));
    setTimeout(selecionarDepois, 1200);
  }
})();
