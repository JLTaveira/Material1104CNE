/* Detalhe da Requisição + Itens + Alocações + Botões
 src/pages/RequisicaoDetalhe.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) 
  2026-02-24 - revisão e optimização com Gemini */
 
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  where,
  limit,
  writeBatch,
  documentId // Importante para pedir vários documentos de uma vez
} from "firebase/firestore";
import { db } from "../firebase";
import AppLayout from "../layouts/AppLayout";

/* ---------------- Dicionário para Textos Amigáveis ---------------- */
const TEXTO_AMIGAVEL = {
  "SUBMETIDA": "Submetida",
  "EM_PREPARACAO": "Em preparação",
  "ENTREGUE": "Entregue",
  "DEVOLVIDA": "Devolvida",
  "CANCELADA": "Cancelada",
  "DISPONIVEL": "Disponível",
  "EM_USO": "Em uso",
  "EM_REPARACAO": "Em reparação",
  "ABATIDO": "Abatido",
  "OPERACIONAL": "Operacional",
  "RETIDO": "Retido"
};

function fmtLabel(val) {
  if (!val) return val;
  return TEXTO_AMIGAVEL[val] || val;
}

function toDate(v) {
  if (!v) return null;
  return v?.toDate ? v.toDate() : new Date(v);
}
function fmtTS(v) {
  const d = toDate(v);
  return d ? d.toLocaleString("pt-PT") : "-";
}
function fmtUltimaReq(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString("pt-PT") : "Nunca";
}

export default function RequisicaoDetalhe() {
  const { id } = useParams();

  const [req, setReq] = useState(null);
  const [itens, setItens] = useState([]);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [novoEquipId, setNovoEquipId] = useState("");

  // para listagem de equipamentos disponíveis
  const [equipDisponiveis, setEquipDisponiveis] = useState([]);
  const [utilizacoes, setUtilizacoes] = useState([]);
  const [tipos, setTipos] = useState([]);

  // filtros no painel de disponíveis
  const [fUtil, setFUtil] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [qText, setQText] = useState("");
  const [loadingDisp, setLoadingDisp] = useState(false);

  // notas internas por equipamento (descricao/observacoes)
  const [equipNotas, setEquipNotas] = useState({}); 
  const [saveBusy, setSaveBusy] = useState({}); 

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const reqRef = doc(db, "requisicoes", id);
      const reqSnap = await getDoc(reqRef);
      if (!reqSnap.exists()) {
        setReq(null);
        setItens([]);
        return;
      }
      setReq({ id: reqSnap.id, ...reqSnap.data() });

      const itensRef = collection(db, "requisicoes", id, "itens");
      const itensSnap = await getDocs(itensRef);
      const list = itensSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItens(list);

      // OTIMIZAÇÃO 1: Evitar chamadas "cascata" para carregar as notas
      await hydrateEquipNotasEficiente(list.map((x) => x.equipamentoId));
    } finally {
      setLoading(false);
    }
  }

  // NOVA FUNÇÃO OTIMIZADA: Pede a informação de até 30 equipamentos Numa única ida ao servidor
  async function hydrateEquipNotasEficiente(equipIds) {
    const uniq = Array.from(new Set((equipIds ?? []).filter(Boolean)));
    if (uniq.length === 0) return;

    try {
      const next = { ...equipNotas };
      const chunks = [];
      
      // O Firestore permite o operador 'in' para até 30 itens de cada vez
      for (let i = 0; i < uniq.length; i += 30) {
        chunks.push(uniq.slice(i, i + 30));
      }

      for (const chunk of chunks) {
        if (chunk.length === 0) continue;
        const q = query(collection(db, "equipamentos"), where(documentId(), "in", chunk));
        const snap = await getDocs(q);
        
        snap.forEach(docSnap => {
          const eq = docSnap.data();
          next[docSnap.id] = {
            descricao: eq.descricao ?? "",
            observacoes: eq.observacoes ?? "",
            dirty: false,
          };
        });
      }
      setEquipNotas(next);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadTaxonomias() {
    const uSnap = await getDocs(collection(db, "utilizacoes"));
    setUtilizacoes(uSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

    const tSnap = await getDocs(collection(db, "tipos"));
    setTipos(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadEquipDisponiveis() {
    setLoadingDisp(true);
    try {
      let q = query(
        collection(db, "equipamentos"),
        where("estado", "==", "DISPONIVEL"),
        limit(200) // Limite seguro para não sobrecarregar
      );

      if (fUtil) q = query(q, where("utilizacaoCodigo", "==", fUtil));
      if (fTipo) q = query(q, where("tipoCodigo", "==", fTipo));

      const snap = await getDocs(q);
      let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const alocados = new Set(itens.map((x) => x.equipamentoId));
      rows = rows.filter((r) => {
        const oper = r.estadoOperacional ?? "OPERACIONAL";
        if (oper === "RETIDO" || oper === "ABATIDO") return false;
        if (alocados.has(r.id)) return false;
        return true;
      });

      const t = qText.trim().toLowerCase();
      if (t) {
        rows = rows.filter((r) => {
          const hay = `${r.id} ${r.codigoCompleto ?? ""} ${r.nome ?? ""} ${r.descricao ?? ""} ${r.observacoes ?? ""}`.toLowerCase();
          return hay.includes(t);
        });
      }

      rows.sort((a, b) => {
        const da = toDate(a.ultimaRequisicaoEm)?.getTime?.() ?? 0;
        const dbb = toDate(b.ultimaRequisicaoEm)?.getTime?.() ?? 0;
        return da - dbb;
      });

      setEquipDisponiveis(rows);

      // OTIMIZAÇÃO 2: Já sacámos as descrições e observações na query acima!
      // Escusamos de ir ao Firebase outra vez pedir os mesmos dados.
      const newNotas = {};
      rows.forEach(r => {
        newNotas[r.id] = {
          descricao: r.descricao ?? "",
          observacoes: r.observacoes ?? "",
          dirty: false
        };
      });
      setEquipNotas(prev => ({...prev, ...newNotas}));

    } catch (e) {
      console.error(e);
      setMsg("Erro a carregar equipamentos disponíveis (ver consola).");
    } finally {
      setLoadingDisp(false);
    }
  }

  useEffect(() => {
    load();
    loadTaxonomias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!req) return;
    loadEquipDisponiveis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.id, fUtil, fTipo, qText, itens.length]);

  async function setEstado(novoEstado) {
    setMsg("");
    const reqRef = doc(db, "requisicoes", id);
    await updateDoc(reqRef, { estado: novoEstado, atualizadoEm: serverTimestamp() });
    await load();
    setMsg(`Estado atualizado para ${fmtLabel(novoEstado)}`);
  }

  async function validarEquipamentoDisponivel(equipId) {
    const eqRef = doc(db, "equipamentos", equipId);
    const eqSnap = await getDoc(eqRef);
    if (!eqSnap.exists()) return { ok: false, reason: "Equipamento não existe." };

    const eq = eqSnap.data();

    const estado = (eq.estado ?? "DISPONIVEL");
    if (estado === "ABATIDO") return { ok: false, reason: "Equipamento abatido." };
    if (estado !== "DISPONIVEL") {
      return { ok: false, reason: `Equipamento indisponível (estado = ${fmtLabel(estado)}).` };
    }

    const oper = (eq.estadoOperacional ?? "OPERACIONAL");
    if (oper === "RETIDO") return { ok: false, reason: "Equipamento retido." };
    if (oper === "ABATIDO") return { ok: false, reason: "Equipamento abatido." };

    return { ok: true, eq };
  }

  async function adicionarItemPorId(equipIdRaw) {
    setMsg("");
    const equipId = String(equipIdRaw ?? "").trim();
    if (!equipId) return;

    if (itens.some((x) => x.equipamentoId === equipId)) {
      setMsg(`Já está alocado: ${equipId}`);
      return;
    }

    const v = await validarEquipamentoDisponivel(equipId);
    if (!v.ok) {
      setMsg(`Não foi possível adicionar: ${v.reason}`);
      return;
    }

    const iRef = doc(db, "requisicoes", id, "itens", equipId);
    await setDoc(iRef, {
      equipamentoId: equipId,
      codigoCompleto: v.eq?.codigoCompleto ?? equipId,
      nome: v.eq?.nome ?? "",
      tipoCodigo: v.eq?.tipoCodigo ?? "",
      utilizacaoCodigo: v.eq?.utilizacaoCodigo ?? "",
      dataInicio: req?.dataInicio ?? null,
      dataFim: req?.dataFim ?? null,
      criadoEm: serverTimestamp(),
    });

    setNovoEquipId("");
    await load();
    setMsg(`Adicionado ao pedido: ${equipId}`);
  }

  async function adicionarItem() {
    return adicionarItemPorId(novoEquipId);
  }

  async function removerItem(equipId) {
    setMsg("");
    await deleteDoc(doc(db, "requisicoes", id, "itens", equipId));
    await load();
    setMsg(`Removido: ${equipId}`);
  }

  async function saveNotasEquip(equipId) {
    const cur = equipNotas[equipId];
    if (!cur || !cur.dirty) return;

    setSaveBusy((s) => ({ ...s, [equipId]: true }));
    try {
      await updateDoc(doc(db, "equipamentos", equipId), {
        descricao: cur.descricao ?? "",
        observacoes: cur.observacoes ?? "",
        atualizadoEm: serverTimestamp(),
      });
      setEquipNotas((s) => ({
        ...s,
        [equipId]: { ...s[equipId], dirty: false },
      }));
      setMsg(`Notas internas guardadas em ${equipId}.`);
    } catch (e) {
      console.error(e);
      setMsg("Erro a guardar notas internas (ver consola).");
    } finally {
      setSaveBusy((s) => ({ ...s, [equipId]: false }));
    }
  }

  // OTIMIZAÇÃO 3: Gravação em Batch (Tudo de uma vez de forma rápida e segura)
  async function marcarEntregue() {
    setMsg("");
    if (itens.length === 0) {
      setMsg("Sem itens. Adiciona equipamentos antes de marcar como Entregue.");
      return;
    }

    try {
      const base = req?.dataInicio ?? null;
      const batch = writeBatch(db);

      for (const it of itens) {
        batch.update(doc(db, "equipamentos", it.equipamentoId), {
          estado: "EM_USO",
          ultimaRequisicaoEm: base ? base : serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        });
      }

      batch.update(doc(db, "requisicoes", id), {
        estado: "ENTREGUE",
        atualizadoEm: serverTimestamp()
      });

      await batch.commit();
      await load();
      setMsg("ENTREGUE: equipamentos marcados como Em Uso.");
    } catch (e) {
      console.error(e);
      setMsg("Erro ao marcar como entregue (ver consola).");
    }
  }

  async function marcarDevolvida() {
    setMsg("");

    try {
      const batch = writeBatch(db);
      const reqRef = doc(db, "requisicoes", id);
      batch.update(reqRef, { estado: "DEVOLVIDA", atualizadoEm: serverTimestamp() });

      if (itens.length === 0) {
        await batch.commit();
        await load();
        setMsg("DEVOLVIDA.");
        return;
      }

      const isAbatido = (v) => String(v ?? "").toUpperCase() === "ABATIDO";
      const isRetido = (v) => String(v ?? "").toUpperCase() === "RETIDO";

      for (const it of itens) {
        const eqRef = doc(db, "equipamentos", it.equipamentoId);
        const eqSnap = await getDoc(eqRef);
        if (!eqSnap.exists()) continue;

        const eq = eqSnap.data();
        const oper = (eq.estadoOperacional ?? "OPERACIONAL");
        const est = (eq.estado ?? "DISPONIVEL");

        if (isAbatido(est) || isAbatido(oper)) continue;

        if (isRetido(oper)) {
          batch.update(eqRef, { estado: "EM_REPARACAO", atualizadoEm: serverTimestamp() });
        } else {
          batch.update(eqRef, { estado: "DISPONIVEL", atualizadoEm: serverTimestamp() });
        }
      }

      await batch.commit();
      await load();
      setMsg("DEVOLVIDA: equipamentos libertados e marcados como Disponíveis.");
    } catch (e) {
      console.error(e);
      setMsg("Erro ao marcar DEVOLVIDA (ver consola).");
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="card">A carregar...</div>
      </AppLayout>
    );
  }

  if (!req) {
    return (
      <AppLayout>
        <div className="card">
          Requisição não encontrada. <Link to="/admin/requisicoes">Voltar</Link>
        </div>
      </AppLayout>
    );
  }

  const tiposFiltrados = tipos
    .filter((t) => (fUtil ? String(t.utilizacaoCodigo ?? "") === String(fUtil) : true))
    .map((t) => ({
      id: t.id,
      codigo: String(t.codigo ?? ""),
      nome: t.nome ?? "",
      utilizacaoCodigo: String(t.utilizacaoCodigo ?? ""),
    }))
    .sort((a, b) => (a.codigo > b.codigo ? 1 : -1));

  return (
    <AppLayout>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 className="h3">Requisição</h3>
          <div className="mono" style={{ opacity: 0.75 }}>{id}</div>
        </div>

        <div className="row">
          <Link className="btn-secondary" to="/admin/requisicoes">Voltar</Link>
        </div>
      </div>

      {msg ? (
        <div className="card" style={{ marginTop: 12 }}>
          {msg}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Estado</div>
            <div className="chip">{fmtLabel(req.estado ?? "-")}</div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Período</div>
            <div>{fmtTS(req.dataInicio)} → {fmtTS(req.dataFim)}</div>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
          <b>Observações:</b> {req.observacoes ?? "-"}
        </div>

        <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={() => setEstado("EM_PREPARACAO")}>
            Marcar Em Preparação
          </button>
          <button className="btn" onClick={marcarEntregue}>
            Marcar Entregue
          </button>
          <button className="btn-secondary" onClick={marcarDevolvida}>
            Marcar Devolvida
          </button>
        </div>
      </div>

      {/* Itens alocados */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="h3">Itens alocados</h3>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {itens.length} equipamento(s)
          </div>
        </div>

        <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <input
            className="input mono"
            style={{ minWidth: 240 }}
            placeholder="Código do equipamento (ex: 0201003)"
            value={novoEquipId}
            onChange={(e) => setNovoEquipId(e.target.value)}
          />
          <button className="btn" onClick={adicionarItem}>Adicionar</button>
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Utilização</th>
                <th>Tipo</th>
                <th>Descrição (interna)</th>
                <th>Observações (internas)</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 ? (
                <tr><td colSpan={7}>Sem itens.</td></tr>
              ) : (
                itens.map((it) => {
                  const eid = it.equipamentoId;
                  const notas = equipNotas[eid] ?? { descricao: "", observacoes: "", dirty: false };

                  return (
                    <tr key={it.id}>
                      <td className="mono">{it.codigoCompleto ?? it.equipamentoId}</td>
                      <td>{it.nome ?? "-"}</td>
                      <td className="mono">{it.utilizacaoCodigo ?? "-"}</td>
                      <td className="mono">{it.tipoCodigo ?? "-"}</td>

                      <td style={{ minWidth: 260 }}>
                        <input
                          className="input"
                          value={notas.descricao}
                          placeholder="Descrição interna..."
                          onChange={(e) => {
                            const v = e.target.value;
                            setEquipNotas((s) => ({
                              ...s,
                              [eid]: { ...(s[eid] ?? notas), descricao: v, dirty: true },
                            }));
                          }}
                        />
                      </td>

                      <td style={{ minWidth: 280 }}>
                        <input
                          className="input"
                          value={notas.observacoes}
                          placeholder="Observações internas..."
                          onChange={(e) => {
                            const v = e.target.value;
                            setEquipNotas((s) => ({
                              ...s,
                              [eid]: { ...(s[eid] ?? notas), observacoes: v, dirty: true },
                            }));
                          }}
                        />
                        <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                          <button
                            className="btn-secondary"
                            disabled={!notas.dirty || !!saveBusy[eid]}
                            onClick={() => saveNotasEquip(eid)}
                          >
                            {saveBusy[eid] ? "A guardar..." : "Guardar"}
                          </button>
                        </div>
                      </td>

                      <td>
                        <button className="btn-secondary" onClick={() => removerItem(it.equipamentoId)}>
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
          Regra: só aloca equipamentos com <b>estado = Disponível</b> e <b>estadoOperacional ≠ Retido/Abatido</b>.
        </div>
      </div>

      {/* Equipamentos disponíveis */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="h3">Equipamentos disponíveis</h3>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {loadingDisp ? "A carregar..." : `${equipDisponiveis.length} disponíveis`}
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <select
            className="select"
            value={fUtil}
            onChange={(e) => { setFUtil(e.target.value); setFTipo(""); }}
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
            {tiposFiltrados.map((t) => (
              <option key={t.id} value={t.codigo}>
                {t.codigo} - {t.nome}
              </option>
            ))}
          </select>

          <input
            className="input"
            style={{ minWidth: 260, flex: 1 }}
            placeholder="Pesquisar (código/nome/descrição/obs...)"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
          />

          <button className="btn-secondary" onClick={() => { setFUtil(""); setFTipo(""); setQText(""); }}>
            Limpar
          </button>
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Utilização</th>
                <th>Tipo</th>
                <th>Última requisição</th>
                <th>Descrição (interna)</th>
                <th>Observações (internas)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loadingDisp ? (
                <tr><td colSpan={8}>A carregar...</td></tr>
              ) : equipDisponiveis.length === 0 ? (
                <tr><td colSpan={8}>Sem equipamentos disponíveis com estes filtros.</td></tr>
              ) : (
                equipDisponiveis.map((e) => {
                  const eid = e.id;
                  const notas = equipNotas[eid] ?? { descricao: e.descricao ?? "", observacoes: e.observacoes ?? "", dirty: false };

                  return (
                    <tr key={e.id}>
                      <td className="mono">{e.codigoCompleto ?? e.id}</td>
                      <td>{e.nome ?? "-"}</td>
                      <td className="mono">{e.utilizacaoCodigo ?? "-"}</td>
                      <td className="mono">{e.tipoCodigo ?? "-"}</td>
                      <td>{fmtUltimaReq(e.ultimaRequisicaoEm)}</td>

                      <td style={{ minWidth: 260 }}>
                        <input
                          className="input"
                          value={notas.descricao}
                          placeholder="Descrição interna..."
                          onChange={(ev) => {
                            const v = ev.target.value;
                            setEquipNotas((s) => ({
                              ...s,
                              [eid]: { ...(s[eid] ?? notas), descricao: v, dirty: true },
                            }));
                          }}
                        />
                      </td>

                      <td style={{ minWidth: 280 }}>
                        <input
                          className="input"
                          value={notas.observacoes}
                          placeholder="Observações internas..."
                          onChange={(ev) => {
                            const v = ev.target.value;
                            setEquipNotas((s) => ({
                              ...s,
                              [eid]: { ...(s[eid] ?? notas), observacoes: v, dirty: true },
                            }));
                          }}
                        />
                        <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                          <button
                            className="btn-secondary"
                            disabled={!notas.dirty || !!saveBusy[eid]}
                            onClick={() => saveNotasEquip(eid)}
                          >
                            {saveBusy[eid] ? "A guardar..." : "Guardar"}
                          </button>
                        </div>
                      </td>

                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn" onClick={() => adicionarItemPorId(e.id)}>
                          Adicionar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
          A lista está ordenada por <b>última requisição</b> (mais antigos primeiro) para equilibrar o uso.
        </div>
      </div>
    </AppLayout>
  );
}