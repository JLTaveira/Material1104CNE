/* Firebase Functions index
 functions/index.js
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) */

/* functions/index.js */
/* Firebase Cloud Functions - Alforge 1104
  Versão: 3.0 (Logística + Gestão de Utilizadores)
  Região: europe-southwest1 (Madrid)
  2026-02-25
*/

const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// Configurações Globais (Madrid)
setGlobalOptions({ region: "europe-southwest1", maxInstances: 10 });

const GERAL_1104 = "geral.1104@escutismo.pt";

/* --- AUXILIARES --- */
async function getMailer() {
  const snap = await admin.firestore().collection("config").doc("email").get();
  if (!snap.exists || !snap.data().ativo) return null;
  const cfg = snap.data();
  return nodemailer.createTransport({
    host: cfg.host || "smtp.gmail.com",
    port: cfg.port || 465,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass }
  });
}

function assertAdmin(request) {
  if (!request.auth || request.auth.token.role !== "ADMIN") {
    throw new HttpsError("permission-denied", "Acesso restrito a Administradores.");
  }
}

/* --- LOGÍSTICA DE EMAILS --- */

exports.onNovaRequisicao = onDocumentCreated("requisicoes/{id}", async (event) => {
  const req = event.data.data();
  const mailer = await getMailer();
  if (!mailer) return null;

  const staff = await admin.firestore().collection("users")
    .where("role", "in", ["ADMIN", "GESTOR"]).where("ativo", "==", true).get();
  
  const bcc = [GERAL_1104];
  staff.forEach(d => { if(d.data().email) bcc.push(d.data().email); });

  return mailer.sendMail({
    from: `"Alforge 1104" <${GERAL_1104}>`,
    to: GERAL_1104,
    bcc: bcc.join(","),
    subject: `📦 [SUBMETIDA] Nova Requisição - ${req.criadaPorNome}`,
    text: `Uma nova requisição foi submetida.\nUtilizador: ${req.criadaPorNome}\nDatas: ${req.dataInicio} a ${req.dataFim}\nObs: ${req.observacoes || "-"}`
  });
});

exports.onUpdateRequisicao = onDocumentUpdated("requisicoes/{id}", async (event) => {
  const novo = event.data.after.data();
  const antigo = event.data.before.data();
  if (novo.estado === antigo.estado) return null;

  const mailer = await getMailer();
  if (!mailer) return null;

  let subject = "";
  let body = "";

  if (novo.estado === "PRONTA") {
    subject = "✅ Material Pronto para Levantamento";
    body = `Olá ${novo.criadaPorNome},\n\nO teu pedido foi preparado por ${novo.preparadaPorNome} e já está disponível para levantamento.\n\nCumps, Equipa de Material.`;
  } else if (novo.estado === "DEVOLVIDA") {
    subject = "📥 Confirmação de Receção de Material";
    body = `Olá ${novo.criadaPorNome},\n\nO material foi recebido e conferido por ${novo.recebidaPorNome}.\nObrigado pela devolução!`;
  }

  if (!subject) return null;

  const uSnap = await admin.firestore().collection("users").doc(novo.criadaPorUid).get();
  const emailDest = uSnap.data()?.email;
  if (!emailDest) return null;

  return mailer.sendMail({
    from: `"Alforge 1104" <${GERAL_1104}>`,
    to: emailDest,
    cc: GERAL_1104,
    replyTo: GERAL_1104,
    subject: subject,
    text: body
  });
});

/* --- GESTÃO DE UTILIZADORES --- */

exports.adminUpdateUser = onCall(async (request) => {
  assertAdmin(request);
  const { uid, nome, email, role, ativo } = request.data;
  await admin.auth().updateUser(uid, { displayName: nome, email: email, disabled: !ativo });
  await admin.auth().setCustomUserClaims(uid, { role, ativo });
  if (!ativo) await admin.auth().revokeRefreshTokens(uid);
  await admin.firestore().collection("users").doc(uid).update({
    nome, email, role, ativo, atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
  });
  return { ok: true };
});

exports.bootstrapMakeAdmin = onCall(async (request) => {
  const allowed = "jltaveira@gmail.com";
  if (!request.auth || request.auth.token.email !== allowed) throw new HttpsError("permission-denied", "Proibido.");
  await admin.auth().setCustomUserClaims(request.auth.uid, { role: "ADMIN", ativo: true });
  return { ok: true };
});