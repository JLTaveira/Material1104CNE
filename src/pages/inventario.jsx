/* Inventario page
 src/pages/inventario.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) */
 
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import AppLayout from "../layouts/AppLayout";
import { downloadCSV } from "../utils/csv";
import { useAuth } from "../authContext";

// Campo "estado"
const ESTADO_EQ = ["DISPONIVEL", "EM_USO", "EM_REPARACAO", "ABATIDO"];
// Campo "estadoOperacional"
const ESTADO_OPERACIONAL = ["OPERACIONAL", "RETIDO", "ABATIDO"];
// Condição física
const CONDICOES = ["NOVO", "BOM", "USADO", "DANIFICADO", "INSEGURO"];

/* ---------------- Utils ---------------- */

function fmtDate(v) {
  if (!v) return "";
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function onlyDigits2(v) {
  const s = String(v ?? "").trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(0, 2);
  return digits.padStart(2, "0");
}

// Normaliza "codigo" dos docs de tipos (aceita codigo/Codigo)
function tipoCodigo(t) {
  return String(t?.codigo ?? t?.Codigo ?? "").trim();
}

function safeNome(v) {
  return String(v ?? "").trim();
}

/* ---------------- Modal confirm bonito ---------------- */

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
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelText ?? "Cancelar"}
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : ""}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "A processar..." : confirmText ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Página ---------------- */

export default function Inventario() {
  const { profile } = useAuth();
  const isAdmin = (profile?.role ?? "USER") === "ADMIN";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [utilizacoes, setUtilizacoes] = useState([]);
  const [tipos, setTipos] = useState([]);

  const [showNew, setShowNew] = useState(false);

  // filtros
  const [fEstado, setFEstado] = useState("");
  const [fOper, setFOper] = useState("");
  const [fUtil, setFUtil] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [qText, setQText] = useState("");

  // novo equipamento (só admin)
  const [newItem, setNewItem] = useState({
    utilizacaoCodigo: "",
    tipoCodigo: "",
    numeroSeq: "",
    codigoCompleto: "",
    nome: "",
    descricao: "",
    observacoes: "",
    dataAquisicao: "",
    dataAbate: "",
    estado: "DISPONIVEL",
    estadoOperacional: "OPERACIONAL",
    condicao: "BOM",
  });

  // edição rápida (admin) de descricao/observacoes
  const [edit, setEdit] = useState({}); // { [equipId]: { descricao, observacoes, dirty } }
  const [saveBusy, setSaveBusy] = useState({}); // { [equipId]: true }

  // Confirm modal state (só admin)
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

  function askChange({ titulo, cod, from, to, danger, apply }) {
    openConfirm({
      title: `Confirmar alteração — ${titulo}`,
      body: `Equipamento: ${cod}\nDe: ${from}\nPara: ${to}`,
      danger: !!danger,
      confirmText: danger ? "Confirmar" : "Aplicar",
      cancelText: "Cancelar",
      onConfirm: async () => {
        setConfirmBusy(true);
        try {
          await apply();
          setConfirm(null);
        } catch (e) {
          console.error(e);
          alert("Ocorreu um erro ao aplicar a alteração. Vê a consola.");
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  }

  /* ---------------- Loads ---------------- */

  async function loadEquipamentos() {
    setLoading(true);
    const snap = await getDocs(query(collection(db, "equipamentos"), orderBy("__name__")));
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setRows(data);

    // prepara cache de edição para admin
    if (isAdmin) {
      const m = {};
      for (const r of data) {
        m[r.id] = {
          descricao: r.descricao ?? "",
          observacoes: r.observacoes ?? "",
          dirty: false,
        };
      }
      setEdit(m);
    }

    setLoading(false);
  }

  async function loadUtilizacoes() {
    const snap = await getDocs(collection(db, "utilizacoes"));
    setUtilizacoes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadTipos(utilizacaoCodigoRaw) {
    const u = onlyDigits2(utilizacaoCodigoRaw);
    if (!u || u === "00") {
      setTipos([]);
      return;
    }

    const snap = await getDocs(query(collection(db, "tipos"), where("utilizacaoCodigo", "==", u)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => tipoCodigo(a).localeCompare(tipoCodigo(b), "pt-PT"));
    setTipos(list);
  }

  useEffect(() => {
    loadEquipamentos();
    loadUtilizacoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // só relevante para o formulário "Novo equipamento"
    if (!isAdmin) return;
    loadTipos(newItem.utilizacaoCodigo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, newItem.utilizacaoCodigo]);

  /* ---------------- Geração do código (admin) ---------------- */

  async function gerarCodigo(utilizacaoRaw, tipoRaw) {
    const u = onlyDigits2(utilizacaoRaw);
    const t = onlyDigits2(tipoRaw);
    if (!u || !t || u === "00" || t === "00") return;

    const snap = await getDocs(
      query(
        collection(db, "equipamentos"),
        where("utilizacaoCodigo", "==", u),
        where("tipoCodigo", "==", t)
      )
    );

    let max = 0;
    snap.forEach((d) => {
      const data = d.data();
      const n = Number(data.numeroSeq || 0);
      if (n > max) max = n;

      const code = String(data.codigoCompleto ?? d.id ?? "");
      const prefix = `${u}${t}`;
      if (code.startsWith(prefix)) {
        const tail = Number(code.slice(prefix.length));
        if (!Number.isNaN(tail) && tail > max) max = tail;
      }
    });

    const next = max + 1;
    const seq = String(next).padStart(3, "0");
    const codigo = `${u}${t}${seq}`;

    setNewItem((s) => ({
      ...s,
      utilizacaoCodigo: u,
      tipoCodigo: t,
      numeroSeq: next,
      codigoCompleto: codigo,
    }));
  }

  /* ---------------- CRUD (admin) ---------------- */

  async function createEquipamento() {
    if (!isAdmin) return;

    const u = onlyDigits2(newItem.utilizacaoCodigo);
    const t = onlyDigits2(newItem.tipoCodigo);

    if (!u || u === "00" || !t || t === "00") return alert("Escolhe Utilização e Tipo.");
    if (!newItem.codigoCompleto) return alert("Código não foi gerado.");
    if (!safeNome(newItem.nome)) return alert("Nome é obrigatório.");

    const ref = doc(db, "equipamentos", newItem.codigoCompleto);

    await setDoc(ref, {
      codigoCompleto: newItem.codigoCompleto,
      utilizacaoCodigo: u,
      tipoCodigo: t,
      numeroSeq: Number(newItem.numeroSeq || 0),

      nome: safeNome(newItem.nome),
      descricao: newItem.descricao ?? "",
      observacoes: newItem.observacoes ?? "",

      dataAquisicao: newItem.dataAquisicao ? new Date(newItem.dataAquisicao) : null,
      dataAbate: newItem.dataAbate ? new Date(newItem.dataAbate) : null,

      estado: newItem.estado,
      estadoOperacional: newItem.estadoOperacional,
      condicao: newItem.condicao,

      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });

    setShowNew(false);
    setNewItem({
      utilizacaoCodigo: "",
      tipoCodigo: "",
      numeroSeq: "",
      codigoCompleto: "",
      nome: "",
      descricao: "",
      observacoes: "",
      dataAquisicao: "",
      dataAbate: "",
      estado: "DISPONIVEL",
      estadoOperacional: "OPERACIONAL",
      condicao: "BOM",
    });

    await loadEquipamentos();
  }

  async function patch(id, patchObj) {
    if (!isAdmin) return;
    const ref = doc(db, "equipamentos", id);
    await updateDoc(ref, { ...patchObj, atualizadoEm: serverTimestamp() });
    await loadEquipamentos();
  }

  async function saveNotas(equipId) {
    if (!isAdmin) return;
    const cur = edit[equipId];
    if (!cur || !cur.dirty) return;

    setSaveBusy((s) => ({ ...s, [equipId]: true }));
    try {
      await updateDoc(doc(db, "equipamentos", equipId), {
        descricao: cur.descricao ?? "",
        observacoes: cur.observacoes ?? "",
        atualizadoEm: serverTimestamp(),
      });
      setEdit((s) => ({
        ...s,
        [equipId]: { ...s[equipId], dirty: false },
      }));
    } catch (e) {
      console.error(e);
      alert("Erro a guardar notas (ver consola).");
    } finally {
      setSaveBusy((s) => ({ ...s, [equipId]: false }));
    }
  }

  /* ---------------- Filtrar ---------------- */

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();

    return rows
      .filter((r) => (fEstado ? (r.estado ?? "DISPONIVEL") === fEstado : true))
      .filter((r) => (fOper ? (r.estadoOperacional ?? "OPERACIONAL") === fOper : true))
      .filter((r) => (fUtil ? String(r.utilizacaoCodigo ?? "") === String(fUtil) : true))
      .filter((r) => (fTipo ? String(r.tipoCodigo ?? "") === String(fTipo) : true))
      .filter((r) => {
        if (!t) return true;
        const hay = `${r.id} ${r.codigoCompleto ?? ""} ${r.nome ?? ""} ${r.descricao ?? ""} ${r.observacoes ?? ""}`.toLowerCase();
        return hay.includes(t);
      });
  }, [rows, fEstado, fOper, fUtil, fTipo, qText]);

  /* ---------------- Export CSV (admin) ---------------- */

  function exportCSV() {
    if (!isAdmin) return;

    const headers = [
      { key: "codigoCompleto", label: "codigoCompleto" },
      { key: "nome", label: "nome" },
      { key: "utilizacaoCodigo", label: "utilizacaoCodigo" },
      { key: "tipoCodigo", label: "tipoCodigo" },
      { key: "numeroSeq", label: "numeroSeq" },
      { key: "estado", label: "estado" },
      { key: "estadoOperacional", label: "estadoOperacional" },
      { key: "condicao", label: "condicao" },
      { key: "dataAquisicao", label: "dataAquisicao" },
      { key: "dataAbate", label: "dataAbate" },
      { key: "descricao", label: "descricao" },
      { key: "observacoes", label: "observacoes" },
    ];

    const out = filtered.map((r) => ({
      codigoCompleto: r.codigoCompleto ?? r.id,
      nome: r.nome ?? "",
      utilizacaoCodigo: r.utilizacaoCodigo ?? "",
      tipoCodigo: r.tipoCodigo ?? "",
      numeroSeq: r.numeroSeq ?? "",
      estado: r.estado ?? "DISPONIVEL",
      estadoOperacional: r.estadoOperacional ?? "OPERACIONAL",
      condicao: r.condicao ?? "",
      dataAquisicao: fmtDate(r.dataAquisicao),
      dataAbate: fmtDate(r.dataAbate),
      descricao: r.descricao ?? "",
      observacoes: r.observacoes ?? "",
    }));

    const fn = `inventario_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(fn, out, headers);
  }

  /* ---------------- UI ---------------- */

  return (
    <AppLayout>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 className="h3">Inventário</h3>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {isAdmin
              ? "Gestão de equipamentos (estado, condição, notas internas, abate e export)."
              : "Consulta de equipamentos (apenas Estado e Condição)."}
          </div>
        </div>

        {isAdmin ? (
          <div className="row">
            <button className="btn-secondary" onClick={exportCSV}>
              Export CSV
            </button>
            <button className="btn" onClick={() => setShowNew((v) => !v)}>
              {showNew ? "Fechar" : "+ Novo"}
            </button>
          </div>
        ) : null}
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <select className="select" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            <option value="">Estado (todos)</option>
            {ESTADO_EQ.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select className="select" value={fOper} onChange={(e) => setFOper(e.target.value)}>
            <option value="">Operacional (todos)</option>
            {ESTADO_OPERACIONAL.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            className="select"
            value={fUtil}
            onChange={(e) => {
              setFUtil(e.target.value);
              setFTipo("");
            }}
          >
            <option value="">Utilização (todas)</option>
            {utilizacoes.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id} - {u.nome}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={fTipo}
            onChange={(e) => setFTipo(e.target.value)}
            disabled={!fUtil}
          >
            <option value="">Tipo (todos)</option>
            {tipos
              .filter((t) => String(t.utilizacaoCodigo ?? "") === String(fUtil))
              .map((t) => {
                const code = tipoCodigo(t);
                return (
                  <option key={t.id} value={code}>
                    {code} - {t.nome}
                  </option>
                );
              })}
          </select>

          <input
            className="input"
            style={{ minWidth: 280, flex: 1 }}
            placeholder="Pesquisar (código, nome, descrição, observações...)"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
          />

          <button
            className="btn-secondary"
            onClick={() => {
              setFEstado("");
              setFOper("");
              setFUtil("");
              setFTipo("");
              setQText("");
            }}
          >
            Limpar
          </button>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
          A mostrar <b>{filtered.length}</b> de <b>{rows.length}</b> equipamentos.
        </div>
      </div>

      {/* Novo equipamento (só admin) */}
      {isAdmin && showNew && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 className="h3">Novo equipamento</h3>

          <div className="row" style={{ flexWrap: "wrap" }}>
            <div style={{ minWidth: 220 }}>
              <label style={lbl}>Utilização</label>
              <select
                className="select"
                value={newItem.utilizacaoCodigo}
                onChange={(e) => {
                  const u = e.target.value;
                  setNewItem((s) => ({
                    ...s,
                    utilizacaoCodigo: u,
                    tipoCodigo: "",
                    codigoCompleto: "",
                    numeroSeq: "",
                  }));
                }}
              >
                <option value="">-- escolher --</option>
                {utilizacoes.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id} - {u.nome}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 220 }}>
              <label style={lbl}>Tipo</label>
              <select
                className="select"
                value={newItem.tipoCodigo}
                onChange={async (e) => {
                  const tipo = e.target.value;
                  setNewItem((s) => ({ ...s, tipoCodigo: tipo }));
                  await gerarCodigo(newItem.utilizacaoCodigo, tipo);
                }}
                disabled={!newItem.utilizacaoCodigo}
              >
                <option value="">-- escolher --</option>
                {tipos.map((t) => {
                  const code = tipoCodigo(t);
                  return (
                    <option key={t.id} value={code}>
                      {code} - {t.nome}
                    </option>
                  );
                })}
              </select>
            </div>

            <div style={{ minWidth: 180 }}>
              <label style={lbl}>Código (auto)</label>
              <input className="input mono" value={newItem.codigoCompleto} disabled />
            </div>

            <div style={{ minWidth: 280, flex: 1 }}>
              <label style={lbl}>Nome</label>
              <input
                className="input"
                value={newItem.nome}
                onChange={(e) => setNewItem((s) => ({ ...s, nome: e.target.value }))}
              />
            </div>
          </div>

          <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>
            <div style={{ minWidth: 220 }}>
              <label style={lbl}>Estado</label>
              <select
                className="select"
                value={newItem.estado}
                onChange={(e) => setNewItem((s) => ({ ...s, estado: e.target.value }))}
              >
                {ESTADO_EQ.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ minWidth: 220 }}>
              <label style={lbl}>Estado Operacional</label>
              <select
                className="select"
                value={newItem.estadoOperacional}
                onChange={(e) => setNewItem((s) => ({ ...s, estadoOperacional: e.target.value }))}
              >
                {ESTADO_OPERACIONAL.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ minWidth: 220 }}>
              <label style={lbl}>Condição</label>
              <select
                className="select"
                value={newItem.condicao}
                onChange={(e) => setNewItem((s) => ({ ...s, condicao: e.target.value }))}
              >
                {CONDICOES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ minWidth: 220 }}>
              <label style={lbl}>Data aquisição</label>
              <input
                className="input"
                type="date"
                value={newItem.dataAquisicao}
                onChange={(e) => setNewItem((s) => ({ ...s, dataAquisicao: e.target.value }))}
              />
            </div>

            <div style={{ minWidth: 220 }}>
              <label style={lbl}>Data abate</label>
              <input
                className="input"
                type="date"
                value={newItem.dataAbate}
                onChange={(e) => setNewItem((s) => ({ ...s, dataAbate: e.target.value }))}
              />
            </div>
          </div>

          <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>
            <div style={{ minWidth: 320, flex: 1 }}>
              <label style={lbl}>Descrição (interna)</label>
              <input
                className="input"
                value={newItem.descricao}
                onChange={(e) => setNewItem((s) => ({ ...s, descricao: e.target.value }))}
              />
            </div>
            <div style={{ minWidth: 320, flex: 1 }}>
              <label style={lbl}>Observações (internas)</label>
              <input
                className="input"
                value={newItem.observacoes}
                onChange={(e) => setNewItem((s) => ({ ...s, observacoes: e.target.value }))}
              />
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={createEquipamento}>Criar</button>
            <button className="btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>

                {/* ADMIN: ver/editar notas internas */}
                {isAdmin ? <th>Descrição (interna)</th> : null}
                {isAdmin ? <th>Observações (internas)</th> : null}

                {/* USER: só Estado + Condição */}
                <th>Estado</th>
                {isAdmin ? <th>Operacional</th> : null}
                <th>Condição</th>
                {isAdmin ? <th>Abate</th> : null}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr><td colSpan={isAdmin ? 8 : 4}>A carregar...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={isAdmin ? 8 : 4}>Sem resultados.</td></tr>
              ) : (
                filtered.map((r) => {
                  const cod = r.codigoCompleto ?? r.id;
                  const ed = edit[r.id] ?? { descricao: r.descricao ?? "", observacoes: r.observacoes ?? "", dirty: false };

                  return (
                    <tr key={r.id}>
                      <td className="mono">{cod}</td>
                      <td>{r.nome ?? "—"}</td>

                      {/* ADMIN: descrição/observações editáveis */}
                      {isAdmin ? (
                        <td style={{ minWidth: 260 }}>
                          <input
                            className="input"
                            value={ed.descricao}
                            placeholder="Descrição interna..."
                            onChange={(e) => {
                              const v = e.target.value;
                              setEdit((s) => ({
                                ...s,
                                [r.id]: { ...(s[r.id] ?? ed), descricao: v, dirty: true },
                              }));
                            }}
                          />
                        </td>
                      ) : null}

                      {isAdmin ? (
                        <td style={{ minWidth: 280 }}>
                          <input
                            className="input"
                            value={ed.observacoes}
                            placeholder="Observações internas..."
                            onChange={(e) => {
                              const v = e.target.value;
                              setEdit((s) => ({
                                ...s,
                                [r.id]: { ...(s[r.id] ?? ed), observacoes: v, dirty: true },
                              }));
                            }}
                          />
                          <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                            <button
                              className="btn-secondary"
                              disabled={!ed.dirty || !!saveBusy[r.id]}
                              onClick={() => saveNotas(r.id)}
                            >
                              {saveBusy[r.id] ? "A guardar..." : "Guardar notas"}
                            </button>
                          </div>
                        </td>
                      ) : null}

                      {/* Estado */}
                      <td>
                        {isAdmin ? (
                          <select
                            className="select"
                            value={r.estado ?? "DISPONIVEL"}
                            onChange={(e) => {
                              const to = e.target.value;
                              const from = r.estado ?? "DISPONIVEL";
                              if (to === from) return;

                              askChange({
                                titulo: "Estado",
                                cod,
                                from,
                                to,
                                danger: to === "ABATIDO",
                                apply: async () => patch(r.id, { estado: to }),
                              });
                            }}
                          >
                            {ESTADO_EQ.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className="chip">{r.estado ?? "DISPONIVEL"}</span>
                        )}
                      </td>

                      {/* Operacional (só admin) */}
                      {isAdmin ? (
                        <td>
                          <select
                            className="select"
                            value={r.estadoOperacional ?? "OPERACIONAL"}
                            onChange={(e) => {
                              const to = e.target.value;
                              const from = r.estadoOperacional ?? "OPERACIONAL";
                              if (to === from) return;

                              askChange({
                                titulo: "Estado Operacional",
                                cod,
                                from,
                                to,
                                danger: to === "ABATIDO",
                                apply: async () => {
                                  const extra =
                                    to === "ABATIDO"
                                      ? { estado: "ABATIDO", dataAbate: r.dataAbate ?? new Date() }
                                      : {};
                                  await patch(r.id, { estadoOperacional: to, ...extra });
                                },
                              });
                            }}
                          >
                            {ESTADO_OPERACIONAL.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      ) : null}

                      {/* Condição */}
                      <td>
                        {isAdmin ? (
                          <select
                            className="select"
                            value={r.condicao ?? "BOM"}
                            onChange={(e) => {
                              const to = e.target.value;
                              const from = r.condicao ?? "BOM";
                              if (to === from) return;

                              askChange({
                                titulo: "Condição",
                                cod,
                                from,
                                to,
                                danger: to === "INSEGURO" || to === "DANIFICADO",
                                apply: async () => patch(r.id, { condicao: to }),
                              });
                            }}
                          >
                            {CONDICOES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : (
                          <span className="chip">{r.condicao ?? "—"}</span>
                        )}
                      </td>

                      {/* Abate (só admin) */}
                      {isAdmin ? (
                        <td className="mono">
                          {fmtDate(r.dataAbate)}{" "}
                          <button
                            className="btn-secondary"
                            style={{ marginLeft: 8 }}
                            onClick={() => {
                              const isAb =
                                (r.estado ?? "") === "ABATIDO" ||
                                (r.estadoOperacional ?? "") === "ABATIDO";

                              openConfirm({
                                title: `Confirmar — ${isAb ? "Reativar" : "Abater"}`,
                                body: `Equipamento: ${cod}\n\nEsta ação altera:\n- estado\n- estado operacional\n- data de abate`,
                                danger: !isAb,
                                confirmText: isAb ? "Reativar" : "Abater",
                                cancelText: "Cancelar",
                                onConfirm: async () => {
                                  setConfirmBusy(true);
                                  try {
                                    if (!isAb) {
                                      await patch(r.id, {
                                        estado: "ABATIDO",
                                        estadoOperacional: "ABATIDO",
                                        dataAbate: new Date(),
                                      });
                                    } else {
                                      await patch(r.id, {
                                        estado: "DISPONIVEL",
                                        estadoOperacional: "OPERACIONAL",
                                        dataAbate: null,
                                      });
                                    }
                                    setConfirm(null);
                                  } catch (e) {
                                    console.error(e);
                                    alert("Ocorreu um erro ao aplicar a alteração. Vê a consola.");
                                  } finally {
                                    setConfirmBusy(false);
                                  }
                                },
                              });
                            }}
                          >
                            {((r.estado ?? "") === "ABATIDO" || (r.estadoOperacional ?? "") === "ABATIDO")
                              ? "Reativar"
                              : "Abater"}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal (só admin) */}
      {isAdmin ? (
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
      ) : null}
    </AppLayout>
  );
}

const lbl = { display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6 };