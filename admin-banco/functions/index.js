const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

exports.criarUsuarioBanco = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.email !== "patrick@retornoseguros.com.br") {
    throw new functions.https.HttpsError("unauthenticated", "Apenas o administrador pode criar usuários.");
  }

  const { nome, email, senha, perfil, agenciaId, gerenteChefeId } = data;

  if (!nome || !email || !senha || !perfil || !agenciaId) {
    throw new functions.https.HttpsError("invalid-argument", "Campos obrigatórios ausentes.");
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password: senha
    });

    await db.collection("usuarios_banco").doc(userRecord.uid).set({
      nome,
      email,
      perfil,
      agenciaId,
      ativo: true,
      gerenteChefeId: (perfil === "rm" || perfil === "assistente") ? gerenteChefeId || "" : ""
    });

    return { success: true, uid: userRecord.uid };
  } catch (error) {
    console.error("Erro na criação do usuário:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
