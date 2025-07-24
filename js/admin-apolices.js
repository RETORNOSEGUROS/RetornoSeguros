// js/admin-apolices.js

(async () => {
  const db = firebase.firestore();
  const container = document.getElementById("conteudo-pagina");

  container.innerHTML = `
    <h2>📄 Apólices Cadastradas</h2>
    <select id="filtroTipo" style="padding: 8px; margin: 10px 0; border-radius: 5px;">
      <option value="">🔍 Filtrar por tipo</option>
      <option value="Auto">Auto</option>
      <option value="Residencial">Residencial</option>
      <option value="Vida">Vida</option>
    </select>
    <select id="filtroPdf" style="padding: 8px; margin: 10px 10px 10px 0; border-radius: 5px;">
      <option value="">📂 PDF Enviado?</option>
      <option value="true">Sim</option>
      <option value="false">Não</option>
    </select>
    <div id="listaApolices">Carregando apólices...</div>
  `;

  const renderizarApolices = async () => {
    const tipoSelecionado = document.getElementById("filtroTipo").value;
    const filtroPdf = document.getElementById("filtroPdf").value;

    let query = db.collection("apolices");

    if (tipoSelecionado) {
      query = query.where("tipo", "==", tipoSelecionado);
    }
    if (filtroPdf) {
      query = query.where("pdfEnviado", "==", filtroPdf === "true");
    }

    const snap = await query.orderBy("dataRenovacao", "desc").get();
    const lista = document.getElementById("listaApolices");
    lista.innerHTML = "";

    if (snap.empty) {
      lista.innerHTML = "<p>Nenhuma apólice encontrada.</p>";
      return;
    }

    snap.forEach((doc) => {
      const apolice = doc.data();
      const tipo = apolice.tipo || "-";
      const seguradora = apolice.seguradora || "-";
      const valor = apolice.valorPago || 0;
      const data = apoli
