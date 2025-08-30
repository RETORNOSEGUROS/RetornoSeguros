// === Firebase v8 ===
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// --- Parâmetros do link ---
const params = new URLSearchParams(location.search);
const empresaId   = params.get("empresaId")   || "";
const empresaNome = decodeURIComponent(params.get("empresaNome") || "");
const rmNomeURL   = decodeURIComponent(params.get("rmNome") || ""); // opcional

// --- Cabeçalho fixo (sem escolha de empresa) ---
document.getElementById("empresaNome").textContent = empresaNome || "(Empresa)";
document.getElementById("empresaInfo").textContent = empresaNome ? `Empresa: ${empresaNome}` : "";

// --- Login anônimo (cliente não vê nada) ---
auth.signInAnonymously().catch(console.error);

/* =======================
   Helpers (mesmos do admin)
   ======================= */
function maskDDMMYYYY(value) {
  let v = (value || "").replace(/\D/g, "").slice(0, 8);
  if (v.length >= 5) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
  else if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
  return v;
}
function validaDDMMYYYY(v) {
  if (!v) return false;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return false;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo-1, d);
  return dt.getFullYear()===y && (dt.getMonth()+1)===mo && dt.getDate()===d;
}
function maskMoedaBR(v) {
  v = (v || "").toString().replace(/\D/g, "");
  if (!v) return "R$ 0,00";
  v = (parseInt(v, 10) / 100).toFixed(2);
  let [i, d] = v.split(".");
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "R$ " + i + "," + d;
}
function parseMoedaBRToNumber(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/[R$\s\.]/g, "").replace(",", ".")) || 0;
}

/* =======================
   Carregamentos (mesmo visual do gerente)
   ======================= */
function carregarSeguradoras() {
  return db.collection("seguradoras").get()
    .then(snap => {
      const arr = [];
      snap.forEach(doc => {
        const n = (doc.data() && doc.data().nome) ? String(doc.data().nome).trim() : null;
        if (n) arr.push(n);
      });
      return arr.sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"}));
    })
    .catch(()=>[]);
}

async function carregarRamosSeguro() {
  try {
    const snapshot = await db.collection("ramos-seguro").orderBy("ordem").get();
    const ramos = [];
    snapshot.forEach(doc => {
      const d = doc.data() || {};
      ramos.push({ id: doc.id, nome: d.nomeExibicao || d.nome || doc.id });
    });
    if (ramos.length) return ramos;
  } catch(e) {}
  // fallback simples
  return [
    { id:"auto", nome:"Automóvel" },
    { id:"vida", nome:"Vida" },
    { id:"saude", nome:"Saúde" },
    { id:"empresarial", nome:"Empresarial" },
    { id:"residencial", nome:"Residencial" },
  ];
}

async function gerarCamposRamos() {
  const seguradoras = await carregarSeguradoras();
  const ramos = await carregarRamosSeguro();
  const container = document.getElementById("ramos-container");
  container.innerHTML = "";

  ramos.forEach(ramo => {
    const box = document.createElement("div");
    box.className = "ramo-box";

    const head = document.createElement("div");
    head.className = "head";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ramo";
    checkbox.value = ramo.id;

    const labelCheck = document.createElement("label");
    labelCheck.style.margin = "0";
    labelCheck.append(` ${ramo.nome}`);

    head.appendChild(checkbox);
    head.appendChild(labelCheck);
    box.appendChild(head);

    const sub = document.createElement("div");
    sub.className = "subcampos";
    sub.id = `campos-${ramo.id}`;
    sub.innerHTML = `
      <label>Vencimento (dd/mm/aaaa):</label>
      <input type="text" id="${ramo.id}-vencimento" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10">

      <label>Prêmio anual (R$):</label>
      <input type="text" id="${ramo.id}-premio" placeholder="R$ 0,00">

      <label>Seguradora:</label>
      <select id="${ramo.id}-seguradora">
        <option value="">Selecione</option>
        ${seguradoras.map(s => `<option value="${s}">${s}</option>`).join("")}
      </select>

      <label>Observações:</label>
      <textarea id="${ramo.id}-observacoes" placeholder="Comentários ou detalhes adicionais..."></textarea>
    `;

    sub.querySelector(`#${ramo.id}-vencimento`).addEventListener("input", e => e.target.value = maskDDMMYYYY(e.target.value));
    const premioInput = sub.querySelector(`#${ramo.id}-premio`);
    premioInput.addEventListener("input", e => e.target.value = maskMoedaBR(e.target.value));
    premioInput.addEventListener("focus", e => { if (!e.target.value) e.target.value = "R$ 0,00"; });

    checkbox.addEventListener("change", () => { sub.style.display = checkbox.checked ? "block" : "none"; });

    box.appendChild(sub);
    container.appendChild(box);
  });
}

/* =======================
   Envio (salva em 'visitas' igual ao gerente)
   ======================= */
window.enviar = async function enviar() {
  if (!empresaId) return alert("Link inválido (sem empresa).");

  const tipoVisita = "Cliente";
  const numeroFuncionarios = (document.getElementById("numFuncionarios")?.value || "").trim();
  const rmNome = rmNomeURL || ""; // opcional via link

  const user = auth.currentUser;

  const visita = {
    empresaId,
    empresaNome,
    tipoVisita,
    rmNome,
    rmUid: null,
    agenciaId: "", // você pode preencher via Cloud Function se quiser
    usuarioId: user?.uid || null,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    source: "cliente_link",
    numeroFuncionarios: numeroFuncionarios === "" ? null : Math.max(0, parseInt(numeroFuncionarios,10) || 0),
    ramos: {}
  };

  let algumRamo = false;
  let erroVenc = null;

  document.querySelectorAll(".ramo").forEach(input => {
    if (!input.checked) return;
    algumRamo = true;
    const id = input.value;

    const vencimentoStr = (document.getElementById(`${id}-vencimento`)?.value || "").trim();
    const premioStr      = (document.getElementById(`${id}-premio`)?.value || "");
    const seguradoraSel  = (document.getElementById(`${id}-seguradora`)?.value || "");
    const obs            = (document.getElementById(`${id}-observacoes`)?.value || "");

    if (!validaDDMMYYYY(vencimentoStr)) erroVenc = `Vencimento inválido em ${id}. Use dd/mm/aaaa.`;

    visita.ramos[id] = {
      vencimento: vencimentoStr,
      premio: parseMoedaBRToNumber(premioStr),
      seguradora: seguradoraSel,
      observacoes: obs
    };
  });

  if (erroVenc) return alert(erroVenc);
  if (!algumRamo) return alert("Marque pelo menos um ramo e preencha os campos.");

  try {
    await db.collection("visitas").add(visita);
    document.getElementById("ok").style.display = "block";
    // opcional: limpar marcações após enviar
    // location.href = "obrigado.html";
  } catch (e) {
    console.error(e);
    alert("Erro ao enviar. Tente novamente mais tarde.");
  }
};

/* =======================
   Bootstrap
   ======================= */
document.addEventListener("DOMContentLoaded", gerarCamposRamos);
