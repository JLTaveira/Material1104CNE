/* Admin Users
 src/pages/AdminUsers.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) */
 
import { useEffect, useMemo, useState } from "react";

import AppLayout from "../layouts/AppLayout";

import { useAuth } from "../authContext";

import { auth, db } from "../firebase";

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

import { sendPasswordResetEmail } from "firebase/auth";



/* ---------------- Dicionário para Textos Amigáveis ---------------- */

const TEXTO_AMIGAVEL = {

  "ADMIN": "Administrador",

  "GESTOR": "Gestor de Material",

  "USER": "Utilizador (Escuteiro)",

};



function fmtLabel(val) {

  return TEXTO_AMIGAVEL[val] || val;

}



/* ---------------- Componente: Modal de Edição Completa ---------------- */

function EditUserModal({ open, user, onCancel, onSave, busy }) {

  const [formData, setFormData] = useState({

    nome: "",

    email: "",

    role: "USER",

    ativo: true

  });



  // Carrega os dados do utilizador quando o modal abre

  useEffect(() => {

    if (user) {

      setFormData({

        nome: user.nome || "",

        email: user.email || "",

        role: user.role || "USER",

        ativo: user.ativo !== false

      });

    }

  }, [user, open]);



  if (!open || !user) return null;



  return (

    <div className="modal-backdrop">

      <div className="modal-card">

        <div className="modal-header">

          <div className="modal-title">Editar Utilizador</div>

          <button className="modal-x" onClick={onCancel} disabled={busy}>✕</button>

        </div>



        <div className="modal-body">

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            <div>

              <label className="field-label" style={{display: "block", marginBottom: "4px", fontSize: "12px", opacity: 0.8}}>Nome Completo</label>

              <input

                className="input"

                style={{width: "100%"}}

                value={formData.nome}

                onChange={e => setFormData({...formData, nome: e.target.value})}

              />

            </div>

           

            <div>

              <label className="field-label" style={{display: "block", marginBottom: "4px", fontSize: "12px", opacity: 0.8}}>Email (Apenas consulta na BD)</label>

              <input

                className="input"

                style={{width: "100%"}}

                value={formData.email}

                onChange={e => setFormData({...formData, email: e.target.value})}

              />

              <small style={{fontSize: "11px", opacity: 0.6}}>Nota: Alterar o email aqui não altera o login no Auth.</small>

            </div>



            <div className="row">

              <div style={{flex: 1}}>

                <label className="field-label" style={{display: "block", marginBottom: "4px", fontSize: "12px", opacity: 0.8}}>Perfil de Acesso</label>

                <select

                  className="select"

                  style={{width: "100%"}}

                  value={formData.role}

                  onChange={e => setFormData({...formData, role: e.target.value})}

                >

                  <option value="USER">Utilizador (USER)</option>

                  <option value="GESTOR">Gestor Material (GESTOR)</option>

                  <option value="ADMIN">Administrador (ADMIN)</option>

                </select>

              </div>



              <div style={{flex: 1}}>

                <label className="field-label" style={{display: "block", marginBottom: "4px", fontSize: "12px", opacity: 0.8}}>Estado da Conta</label>

                <select

                  className="select"

                  style={{width: "100%"}}

                  value={formData.ativo}

                  onChange={e => setFormData({...formData, ativo: e.target.value === "true"})}

                >

                  <option value="true">Conta Ativa</option>

                  <option value="false">Conta Suspensa</option>

                </select>

              </div>

            </div>

          </div>

        </div>



        <div className="modal-actions">

          <button className="btn-secondary" onClick={onCancel} disabled={busy}>Cancelar</button>

          <button className="btn" onClick={() => onSave(user.id, formData)} disabled={busy}>

            {busy ? "A gravar..." : "Guardar Alterações"}

          </button>

        </div>

      </div>

    </div>

  );

}



/* ---------------- Página Principal ---------------- */

export default function AdminUsers() {

  const { profile } = useAuth();

  const isAdmin = profile?.role === "ADMIN";



  const [loading, setLoading] = useState(true);

  const [rows, setRows] = useState([]);

  const [qText, setQText] = useState("");

  const [msg, setMsg] = useState("");



  // Estados dos Modais

  const [editingUser, setEditingUser] = useState(null);

  const [saveBusy, setSaveBusy] = useState(false);



  async function loadUsers() {

    setLoading(true);

    try {

      const ref = collection(db, "users");

      const qs = query(ref, orderBy("nome", "asc"), limit(500));

      const snap = await getDocs(qs);

      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));

    } catch (e) {

      setMsg("Erro ao carregar utilizadores.");

    } finally {

      setLoading(false);

    }

  }



  useEffect(() => { loadUsers(); }, []);



  const filtered = useMemo(() => {

    const t = qText.trim().toLowerCase();

    if (!t) return rows;

    return rows.filter((u) =>

      `${u.nome ?? ""} ${u.email ?? ""} ${u.role ?? ""}`.toLowerCase().includes(t)

    );

  }, [rows, qText]);



  /** Grava as alterações do modal no Firestore */

  async function handleUpdateUser(uid, updatedData) {

    setSaveBusy(true);

    try {

      const ref = doc(db, "users", uid);

      const patch = {

        ...updatedData,

        atualizadoEm: serverTimestamp()

      };

      await updateDoc(ref, patch);

     

      // Atualiza a lista local para refletir as mudanças instantaneamente

      setRows(prev => prev.map(r => r.id === uid ? { ...r, ...patch } : r));

      setEditingUser(null);

      setMsg(`Utilizador ${updatedData.nome} atualizado.`);

    } catch (e) {

      alert("Erro ao guardar alterações.");

    } finally {

      setSaveBusy(false);

    }

  }



  function handleResetPassword(u) {

    if (!u.email) return alert("Utilizador sem email registado.");

    if (window.confirm(`Enviar email de recuperação para ${u.email}?`)) {

      sendPasswordResetEmail(auth, u.email)

        .then(() => setMsg("Email de reset enviado."))

        .catch(() => alert("Erro ao enviar email."));

    }

  }



  if (!isAdmin) return <AppLayout><div className="card">Acesso restrito.</div></AppLayout>;



  return (

    <AppLayout>

      <div className="row" style={{ justifyContent: "space-between" }}>

        <div>

          <h3 className="h3">Gestão de Utilizadores</h3>

          <div style={{ fontSize: 13, opacity: 0.7 }}>Controlo centralizado de perfis, dados e acessos.</div>

        </div>

        <button className="btn-secondary" onClick={loadUsers}>Recarregar</button>

      </div>



      {msg && <div className="card" style={{ marginTop: 12, backgroundColor: "#f0fdf4", borderColor: "#bbf7d0", color: "#166534" }}>{msg}</div>}



      <div className="card" style={{ marginTop: 12 }}>

        <input

          className="input"

          style={{ width: "100%", marginBottom: "12px" }}

          placeholder="Pesquisar utilizadores..."

          value={qText}

          onChange={(e) => setQText(e.target.value)}

        />



        <div className="table-wrap">

          <table className="table">

            <thead>

              <tr>

                <th>Nome</th>

                <th>Email</th>

                <th>Cargo / Perfil</th>

                <th>Estado</th>

                <th style={{textAlign: "right"}}>Ações</th>

              </tr>

            </thead>

            <tbody>

              {loading ? (

                <tr><td colSpan={5}>A carregar...</td></tr>

              ) : (

                filtered.map((u) => (

                  <tr key={u.id}>

                    <td style={{fontWeight: 600}}>{u.nome ?? "—"}</td>

                    <td className="mono" style={{fontSize: "13px"}}>{u.email ?? "—"}</td>

                    <td><span className="chip">{fmtLabel(u.role)}</span></td>

                    <td>

                      <span className={`chip ${u.ativo === false ? 'chip-can' : 'chip-dev'}`}>

                        {u.ativo === false ? "Inativo" : "Ativo"}

                      </span>

                    </td>

                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>

                      <button className="btn-secondary" onClick={() => setEditingUser(u)}>

                        Editar

                      </button>{" "}

                      <button className="btn" onClick={() => handleResetPassword(u)}>Reset Pwd</button>

                    </td>

                  </tr>

                ))

              )}

            </tbody>

          </table>

        </div>

      </div>



      {/* Modal de Edição (Só renderiza se houver um user selecionado) */}

      <EditUserModal

        open={!!editingUser}

        user={editingUser}

        onCancel={() => setEditingUser(null)}

        onSave={handleUpdateUser}

        busy={saveBusy}

      />

    </AppLayout>

  );

}