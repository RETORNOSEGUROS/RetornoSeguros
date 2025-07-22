
// Firebase Configuração (substitua com seu firebaseConfig real)
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_AUTH_DOMAIN",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_STORAGE_BUCKET",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
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
