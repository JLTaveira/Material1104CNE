/* Firebase Functions index
 functions/index.js
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) */

const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

// Mantém isto para controlo de custos (ok no teu caso)
setGlobalOptions({ maxInstances: 10 });

function assertAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Precisas de estar autenticado.");
  }
  const claims = request.auth.token || {};
  if (claims.role !== "ADMIN") {
    throw new HttpsError("permission-denied", "Apenas ADMIN pode executar esta operação.");
  }
}

exports.adminCreateUser = onCall(async (request) => {
  assertAdmin(request);

  const email = (request.data.email || "").trim().toLowerCase();
  const nome = (request.data.nome || "").trim();
  const role = (request.data.role || "USER").toUpperCase();
  const password = request.data.password || "";

  if (!email || !nome) {
    throw new HttpsError("invalid-argument", "email e nome são obrigatórios.");
  }
  if (!["ADMIN", "USER"].includes(role)) {
    throw new HttpsError("invalid-argument", "role inválido.");
  }
  if (!password || password.length < 16) {
    throw new HttpsError("invalid-argument", "Password temporária deve ter pelo menos 16 caracteres.");
  }

  // criar no Firebase Auth
  const userRecord = await admin.auth().createUser({
    email,
    password,
    displayName: nome,
    disabled: false,
  });

  // Custom claim role (para controlo de acesso na app)
  await admin.auth().setCustomUserClaims(userRecord.uid, { role });

  // users/{uid} no Firestore
  await admin.firestore().collection("users").doc(userRecord.uid).set(
    {
      email,
      nome,
      role,
      ativo: true,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { uid: userRecord.uid };
});

exports.adminSetUserRole = onCall(async (request) => {
  assertAdmin(request);

  const uid = request.data.uid;
  const role = (request.data.role || "USER").toUpperCase();

  if (!uid) throw new HttpsError("invalid-argument", "uid obrigatório.");
  if (!["ADMIN", "USER"].includes(role)) throw new HttpsError("invalid-argument", "role inválido.");

  await admin.auth().setCustomUserClaims(uid, { role });

  await admin.firestore().collection("users").doc(uid).set(
    {
      role,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
});

exports.adminSetUserActive = onCall(async (request) => {
  assertAdmin(request);

  const uid = request.data.uid;
  const ativo = !!request.data.ativo;

  if (!uid) throw new HttpsError("invalid-argument", "uid obrigatório.");

  // Se ativo=false, desativa login no Auth
  await admin.auth().updateUser(uid, { disabled: !ativo });

  await admin.firestore().collection("users").doc(uid).set(
    {
      ativo,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
});

exports.bootstrapMakeAdmin = onCall(async (request) => {
  // 🔒 Para segurança: só permite um email que será o SUPERADMIN
  const allowedEmail = "jltaveira@gmail.com";

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Precisas de login.");
  }

  const email = (request.auth.token.email || "").toLowerCase();
  if (email !== allowedEmail.toLowerCase()) {
    throw new HttpsError("permission-denied", "Não autorizado.");
  }

  const uid = request.auth.uid;

  await admin.auth().setCustomUserClaims(uid, { role: "ADMIN" });

  await admin.firestore().collection("users").doc(uid).set(
    {
      email: request.auth.token.email || "",
      role: "ADMIN",
      ativo: true,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, uid };
});

/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// }); */
