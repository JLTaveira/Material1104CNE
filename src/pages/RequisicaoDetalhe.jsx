/* Detalhe da Requisição + Itens + Alocações + Botões
 src/pages/RequisicaoDetalhe.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) */
 
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { writeBatch } from "firebase/firestore";
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
} from "firebase/firestore";
import { db } from "../firebase";
import AppLayout from "../layouts/AppLayout";

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
  const [fUtil, setFUtil] = useState(""); // "01", "02", ...
  const [fTipo, setFTipo] = useState(""); // "01", "02", ...
  const [qText, setQText] = useState("");
  const [loadingDisp, setLoadingDisp] = useState(false);

  // notas internas por equipamento (descricao/observacoes) — editáveis aqui também
  const [equipNotas, setEquipNotas] = useState({}); // { [equipId]: { descricao, observacoes, dirty } }
  const [saveBusy, setSaveBusy] = useState({}); // { [equipId]: true }

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

      // carrega notas internas dos equipamentos já alocados (para editar)
      await hydrateEquipNotas(list.map((x) => x.equipamentoId));
    } finally {
      setLoading(false);
    }
  }

  async function hydrateEquipNotas(equipIds) {
    const uniq = Array.from(new Set((equipIds ?? []).filter(Boolean)));
    if (uniq.length === 0) return;

    try {
      const next = { ...equipNotas };
      // lê em série (simples e estável para poucos itens)
      for (const eid of uniq) {
        if (next[eid]) continue;
        const snap = await getDoc(doc(db, "equipamentos", eid));
        if (!snap.exists()) {
          next[eid] = { descricao: "", observacoes: "", dirty: false };
        } else {
          const eq = snap.data();
          next[eid] = {
            descricao: eq.descricao ?? "",
            observacoes: eq.observacoes ?? "",
            dirty: false,
          };
        }
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
        limit(500)
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

      // também garante notas carregadas para os disponíveis (para editar ali)
      await hydrateEquipNotas(rows.map((x) => x.id));
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

  const periodo = useMemo(() => {
    const s = toDate(req?.dataInicio);
    const e = toDate(req?.dataFim);
    return { s, e };
  }, [req]);

  async function setEstado(novoEstado) {
    setMsg("");
    const reqRef = doc(db, "requisicoes", id);
    await updateDoc(reqRef, { estado: novoEstado, atualizadoEm: serverTimestamp() });
    await load();
    setMsg(`Estado atualizado para ${novoEstado}`);
  }

  async function validarEquipamentoDisponivel(equipId) {
    const eqRef = doc(db, "equipamentos", equipId);
    const eqSnap = await getDoc(eqRef);
    if (!eqSnap.exists()) return { ok: false, reason: "Equipamento não existe." };

    const eq = eqSnap.data();

    const estado = (eq.estado ?? "DISPONIVEL");
    if (estado === "ABATIDO") return { ok: false, reason: "Equipamento abatido." };
    if (estado !== "DISPONIVEL") {
      return { ok: false, reason: `Equipamento indisponível (estado=${estado}).` };
    }

    const oper = (eq.estadoOperacional ?? "OPERACIONAL");
    if (oper === "RETIDO") return { ok: false, reason: "Equipamento retido (estadoOperacional=RETIDO)." };
    if (oper === "ABATIDO") return { ok: false, reason: "Equipamento operacional=ABATIDO." };

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

  async function marcarEntregue() {
    setMsg("");
    if (itens.length === 0) {
      setMsg("Sem itens. Adiciona equipamentos antes de marcar ENTREGUE.");
      return;
    }

    const base = req?.dataInicio ?? null;

    for (const it of itens) {
      await updateDoc(doc(db, "equipamentos", it.equipamentoId), {
        estado: "EM_USO",
        ultimaRequisicaoEm: base ? base : serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      });
    }

    await setEstado("ENTREGUE");
    setMsg("ENTREGUE: equipamentos marcados como EM_USO e ultimaRequisicaoEm atualizada.");
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
      setMsg("DEVOLVIDA: equipamentos libertados.");
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
            <div className="chip">{req.estado ?? "-"}</div>
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
            EM_PREPARACAO
          </button>
          <button className="btn" onClick={marcarEntregue}>
            Marcar ENTREGUE
          </button>
          <button className="btn-secondary" onClick={marcarDevolvida}>
            Marcar DEVOLVIDA
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
          Regra: só aloca equipamentos com <b>estado=DISPONIVEL</b> e <b>estadoOperacional≠RETIDO/ABATIDO</b>.
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