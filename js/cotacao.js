# Atualizar o cotacao.js com firebaseConfig real
cotacao_js_final = """
// Firebase Configuração
const firebaseConfig = {
  apiKey: "AIzaSyDlbEZfA_uAR1aoPZIr8T9B6KNcrwfMxm0",
  authDomain: "retorno-seguros.firebaseapp.com",
  projectId: "retorno-seguros",
  storageBucket: "retorno-seguros.appspot.com",
  messagingSenderId: "495712392972",
  appId: "1:495712392972:web:e1e78aedc48bdeea48db29",
  measurementId: "G-C6E44WXLPW"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Captura do formulário
document.addEventListener('DOMContentLoaded', function () {
  const form = document.querySelector('.cotacao form');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const nome = form.querySelector('input[type="text"]').value.trim();
    const telefone = form.querySelector('input[type="tel"]').value.trim();
    const produto = form.querySelector('select').value;

    if (!nome || !telefone || !produto) {
      alert("Preencha todos os campos!");
      return;
    }

    db.collection("cotacoes").add({
      nome: nome,
      telefone: telefone,
      produto: produto,
      dataEnvio: new Date(),
      status: "pendente"
    })
    .then(() => {
      alert("Cotação enviada com sucesso!");
      form.reset();
    })
    .catch((error) => {
      console.error("Erro ao enviar cotação:", error);
      alert("Erro ao enviar cotação. Tente novamente.");
    });
  });
});
"""

# Salvar como novo cotacao.js com Firebase configurado
cotacao_js_path = Path("/mnt/data/cotacao-configurado.js")
cotacao_js_path.write_text(cotacao_js_final, encoding="utf-8")

cotacao_js_path.name
