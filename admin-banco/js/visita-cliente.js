if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

const params = new URLSearchParams(location.search);
const empresaId = params.get("empresaId") || "";
const empresaNome = params.get("empresaNome") || "";
document.getElementById("empresaInfo").textContent = empresaNome ? `Empresa: ${empresaNome}` : "";

auth.signInAnonymously().catch(console.error);

// helpers
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

document.getElementById("vencimento").addEventListener("input", e => e.target.value = maskDDMMYYYY(e.target.value));
document.getElementById("premio").addEventListener("input", e => e.target.value = maskMoedaBR(e.target.value));

window.enviar = async function enviar() {
  const ramo = document.getElementById("ramo").value;
  const venc = document.getElementById("vencimento").value.trim();
  const premio = document.getElementById("premio").value.trim();
  const seguradora = document.getElementById("seguradora").value.trim();
  const obs = document.getElementById("obs").value.trim();

  if (!empresaId) return alert("Link inválido (sem empresa).");
  if (!ramo) return alert("Selecione o ramo.");
  if (!validaDDMMYYYY(venc)) return alert("Vencimento inválido. Use dd/mm/aaaa.");

  const user = auth.currentUser;
  const premioNum = parseFloat(premio.replace(/[R$\s\.]/g, "").replace(",", ".")) || 0;

  const visita = {
    empresaId,
    empresaNome,
    tipoVisita: "Cliente",
    agenciaId: "",           // (preencher no backend se quiser)
    usuarioId: user?.uid || null,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    source: "cliente_link",
    ramos: {
      [ramo]: {
        vencimento: venc,
        premio: premioNum,
        seguradora,
        observacoes: obs
      }
    }
  };

  try {
    await db.collection("visitas").add(visita);
    document.getElementById("ok").style.display = "block";
  } catch (e) {
    console.error(e);
    alert("Erro ao enviar. Tente novamente mais tarde.");
  }
}
