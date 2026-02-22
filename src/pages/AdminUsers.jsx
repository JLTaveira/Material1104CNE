/* Admin Users
 src/pages/AdminUsers.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) */
 
import { useEffect, useMemo, useState } from "react";
import AppLayout from "../layouts/AppLayout";
import { useAuth } from "../authContext";
import { auth } from "../firebase";
import { db } from "../firebase";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";

function normEmail(v) {
  return (v || "").trim().toLowerCase();
}

function validatePwd(pwd) {
  if (!pwd || pwd.length < 16) return "Password deve ter no mínimo 16 caracteres.";
  if (!/[a-z]/.test(pwd)) return "Password deve conter pelo menos 1 letra minúscula.";
  if (!/[A-Z]/.test(pwd)) return "Password deve conter pelo menos 1 letra maiúscula.";
  if (!/[0-9]/.test(pwd)) return "Password deve conter pelo menos 1 número.";
  // símbolos comuns (sem espaços)
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd))
    return "Password deve conter pelo menos 1 símbolo.";
  if (/\s/.test(pwd)) return "Password não pode conter espaços.";
  return "";
}

/** Modal confirm “bonito” (igual conceito do inventário) */
function ConfirmModal({
  open,
  title,
  body,
  confirmText,
  cancelText,
  danger,
  onCancel,
  onConfirm,
  busy,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button
            className="modal-x"
            onClick={onCancel}
            aria-label="Fechar"
            disabled={busy}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {typeof body === "string" ? (
            <p style={{ margin: 0, whiteSpace: "pre-line" }}>{body}</p>
          ) : (
            body
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={busy} type="button">
            {cancelText ?? "Cancelar"}
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : ""}`}
            onClick={onConfirm}
            disabled={busy}
            type="button"
          >
            {busy ? "A processar..." : confirmText ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const { user, profile } = useAuth();
  const isAdmin = (profile?.role ?? "USER") === "ADMIN";

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [qText, setQText] = useState("");
  const [msg, setMsg] = useState("");

  // Alterar password (admin atual)
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  // modal
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  function openConfirm({
    title,
    body,
    danger = false,
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    onConfirm,
  }) {
    setConfirm({ title, body, danger, confirmText, cancelText, onConfirm });
  }
  function closeConfirm() {
    if (confirmBusy) return;
    setConfirm(null);
  }

  async function loadUsers() {
    setLoading(true);
    setMsg("");
    try {
      const ref = collection(db, "users");
      const qs = query(ref, orderBy("nome", "asc"), limit(500));
      const snap = await getDocs(qs);
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      setMsg("Erro ao carregar utilizadores (ver consola).");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((u) =>
      `${u.nome ?? ""} ${u.email ?? ""} ${u.role ?? ""} ${u.id ?? ""}`.toLowerCase().includes(t)
    );
  }, [rows, qText]);

  async function patchUser(uid, patchObj) {
    await updateDoc(doc(db, "users", uid), { ...patchObj, atualizadoEm: serverTimestamp() });
  }

  function toggleActive(u) {
    const uid = u.id;
    const ativoAtual = !(u.ativo === false);

    openConfirm({
      title: "Confirmar alteração — Ativo",
      body: `Utilizador: ${u.nome ?? "—"}\nEmail: ${u.email ?? "—"}\n\nDe: ${
        ativoAtual ? "Sim" : "Não"
      }\nPara: ${ativoAtual ? "Não" : "Sim"}`,
      danger: ativoAtual, // desativar = mais “perigoso”
      confirmText: ativoAtual ? "Desativar" : "Ativar",
      onConfirm: async () => {
        setConfirmBusy(true);
        try {
          await patchUser(uid, { ativo: !ativoAtual });
          await loadUsers();
          setConfirm(null);
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  }

  function toggleRole(u) {
    const uid = u.id;
    const from = u.role ?? "USER";
    const to = from === "ADMIN" ? "USER" : "ADMIN";

    openConfirm({
      title: "Confirmar alteração — Role",
      body: `Utilizador: ${u.nome ?? "—"}\nEmail: ${u.email ?? "—"}\n\nDe: ${from}\nPara: ${to}`,
      danger: to === "ADMIN",
      confirmText: "Aplicar",
      onConfirm: async () => {
        setConfirmBusy(true);
        try {
          await patchUser(uid, { role: to });
          await loadUsers();
          setConfirm(null);
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  }

  function resetPassword(u) {
    const email = normEmail(u.email);
    if (!email) {
      setMsg("Este utilizador não tem email no registo.");
      return;
    }

    openConfirm({
      title: "Confirmar — Reset password",
      body: `Vai ser enviado um email de reposição de password para:\n${email}\n\n(O utilizador define a nova password através do link.)`,
      confirmText: "Enviar email",
      onConfirm: async () => {
        setConfirmBusy(true);
        setMsg("");
        try {
          await sendPasswordResetEmail(auth, email);
          setMsg(`Email de reposição enviado para ${email}.`);
          setConfirm(null);
        } catch (e) {
          console.error(e);
          setMsg("Falha ao enviar email de reset (ver consola).");
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  }

  async function changeMyPassword(e) {
    e.preventDefault();
    setMsg("");

    if (!user?.email) return setMsg("Conta atual sem email — não é possível reautenticar.");
    if (!curPass) return setMsg("Indica a password atual.");
    if (newPass !== newPass2) return setMsg("As passwords novas não coincidem.");

    const v = validatePwd(newPass);
    if (v) return setMsg(v);

    setSavingPass(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, curPass);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPass);

      setCurPass("");
      setNewPass("");
      setNewPass2("");
      setMsg("Password atualizada com sucesso.");
    } catch (e2) {
      console.error(e2);
      setMsg("Falha a alterar password (pode exigir login recente). Ver consola.");
    } finally {
      setSavingPass(false);
    }
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="card" style={{ color: "crimson" }}>
          Acesso restrito a administradores.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 className="h3">Utilizadores</h3>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Gerir permissões e ativação. Reset de password por email. Alterar password do admin atual.
          </div>
        </div>
        <button className="btn-secondary" onClick={loadUsers} type="button">
          Recarregar
        </button>
      </div>

      {msg ? (
        <div className="card" style={{ marginTop: 12 }}>
          {msg}
        </div>
      ) : null}

      {/* Minha conta */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <h3 className="h3" style={{ marginBottom: 4 }}>
              Minha conta
            </h3>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Alterar password do admin atual.</div>
          </div>
        </div>

        <form onSubmit={changeMyPassword}>
          <div className="grid-3">
            <div>
              <label className="field-label">Password atual</label>
              <input
                className="input"
                type="password"
                value={curPass}
                onChange={(e) => setCurPass(e.target.value)}
                autoComplete="current-password"
                placeholder="********"
              />
            </div>

            <div>
              <label className="field-label">Nova password</label>
              <input
                className="input"
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                autoComplete="new-password"
                placeholder="********"
              />
            </div>

            <div>
              <label className="field-label">Confirmar nova password</label>
              <input
                className="input"
                type="password"
                value={newPass2}
                onChange={(e) => setNewPass2(e.target.value)}
                autoComplete="new-password"
                placeholder="********"
              />
            </div>
          </div>

          <div className="hint" style={{ marginTop: 10 }}>
            Regras: <b>16+</b> caracteres, <b>maiúsculas</b>, <b>minúsculas</b>, <b>número</b> e{" "}
            <b>símbolo</b>. Sem espaços.
          </div>

          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn" type="submit" disabled={savingPass}>
              {savingPass ? "A alterar..." : "Alterar password"}
            </button>
          </div>
        </form>
      </div>

      {/* Lista */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="h3">Lista</h3>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {loading ? "A carregar..." : `${filtered.length} utilizadores`}
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <input
            className="input"
            style={{ minWidth: 320 }}
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="Pesquisar (nome, email, role...)"
          />
          <button className="btn-secondary" onClick={() => setQText("")} type="button">
            Limpar
          </button>
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Role</th>
                <th>Ativo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>A carregar...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>Sem resultados.</td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id}>
                    <td>{u.nome ?? "—"}</td>
                    <td className="mono">{u.email ?? "—"}</td>
                    <td>
                      <span className="chip">{u.role ?? "USER"}</span>
                    </td>
                    <td>{u.ativo === false ? "Não" : "Sim"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn-secondary" onClick={() => toggleActive(u)} type="button">
                        {u.ativo === false ? "Ativar" : "Desativar"}
                      </button>{" "}
                      <button className="btn-secondary" onClick={() => toggleRole(u)} type="button">
                        {u.role === "ADMIN" ? "Tornar USER" : "Tornar ADMIN"}
                      </button>{" "}
                      <button className="btn" onClick={() => resetPassword(u)} type="button">
                        Reset password
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
          Nota: o “Ativo” aqui é o acesso à <b>plataforma</b> (via Firestore). O reset envia email pelo Firebase Auth.
        </div>
      </div>

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        body={confirm?.body}
        confirmText={confirm?.confirmText}
        cancelText={confirm?.cancelText}
        danger={confirm?.danger}
        busy={confirmBusy}
        onCancel={closeConfirm}
        onConfirm={confirm?.onConfirm}
      />
    </AppLayout>
  );
}
