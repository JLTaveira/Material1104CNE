/* Inventario page
 src/pages/inventario.jsx
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) 
 2026-02-24 - revisão e optimização com Gemini */
 
import { useEffect, useState, useMemo } from "react";
import { 
  collection, getDocs, query, where, addDoc, updateDoc, doc, serverTimestamp, orderBy 
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../authContext";
import AppLayout from "../layouts/AppLayout";

// --- UTILITÁRIO DE FORMATAÇÃO SEGURO ---
const fmtTS = (ts) => {
  if (!ts) return "—";
  if (typeof ts === 'string') return ts;
  if (ts.toDate) return ts.toDate().toLocaleDateString("pt-PT");
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString("pt-PT");
  return "—";
};

export default function Inventario() {
  const { profile } = useAuth();
  const [equipamentos, setEquipamentos] = useState([]);
  const [listaUtils, setListaUtils] = useState([]);
  const [listaTipos, setListaTipos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados de UI
  const [fUtil, setFUtil] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [qText, setQText] = useState("");
  const [showNovo, setShowNovo] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [tempData, setTempData] = useState({});

  // Estado Novo Equipamento
  const [novo, setNovo] = useState({ 
    utilizacaoCodigo: "", tipoCodigo: "", numeroSeq: 0, codigoCompleto: "",
    nome: "", descricao: "", observacoes: "", condicao: "BOM", 
    estadoOperacional: "OPERACIONAL", estado: "DISPONIVEL",
    dataAquisicao: "", dataAbate: ""
  });

  const load = async () => {
    setLoading(true);
    try {
      const [eSnap, uSnap, tSnap] = await Promise.all([
        getDocs(query(collection(db, "equipamentos"), orderBy("codigoCompleto", "asc"))),
        getDocs(collection(db, "utilizacoes")),
        getDocs(collection(db, "tipos"))
      ]);
      setEquipamentos(eSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setListaUtils(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setListaTipos(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // --- GERADOR DE CÓDIGO AUTOMÁTICO ---
  useEffect(() => {
    async function updateCodigo() {
      if (novo.utilizacaoCodigo && novo.tipoCodigo) {
        const q = query(collection(db, "equipamentos"), 
          where("utilizacaoCodigo", "==", novo.utilizacaoCodigo),
          where("tipoCodigo", "==", novo.tipoCodigo)
        );
        const snap = await getDocs(q);
        const numeros = snap.docs.map(d => d.data().numeroSeq || 0);
        const proximo = Math.max(0, ...numeros) + 1;
        setNovo(prev => ({
          ...prev,
          numeroSeq: proximo,
          codigoCompleto: `${prev.utilizacaoCodigo}${prev.tipoCodigo}${String(proximo).padStart(3, '0')}`
        }));
      }
    }
    updateCodigo();
  }, [novo.utilizacaoCodigo, novo.tipoCodigo]);

  const exportToCSV = () => {
    const headers = ["Codigo", "Nome", "Estado", "Operacional", "Condicao", "Aquisicao", "Descricao"];
    const rows = filteredEquip.map(e => [
      e.codigoCompleto, e.nome, e.estado, e.estadoOperacional, e.condicao, e.dataAquisicao || "", e.descricao || ""
    ]);
    const csvContent = "\uFEFF" + [headers, ...rows].map(r => r.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `inventario_material.csv`);
    link.click();
  };

  async function handleCreate() {
    if (!novo.nome || !novo.codigoCompleto) return alert("Nome e Categorias são obrigatórios.");
    try {
      await addDoc(collection(db, "equipamentos"), {
        ...novo, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
      });
      alert("Equipamento registado com sucesso!");
      setShowNovo(false);
      load();
    } catch (e) { console.error(e); }
  }

  async function saveEdit(id) {
    try {
      await updateDoc(doc(db, "equipamentos", id), { ...tempData[id], atualizadoEm: serverTimestamp() });
      setEditingId(null);
      load();
    } catch (e) { console.error(e); }
  }

  const filteredEquip = useMemo(() => {
    return equipamentos.filter(e => {
      const matchText = (e.nome + e.codigoCompleto).toLowerCase().includes(qText.toLowerCase());
      return matchText && (!fUtil || e.utilizacaoCodigo === fUtil) && (!fTipo || e.tipoCodigo === fTipo);
    });
  }, [equipamentos, qText, fUtil, fTipo]);

  return (
    <AppLayout>
      {/* --- CABEÇALHO --- */}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 25, alignItems: 'center' }}>
        <div>
          <h3 className="h3" style={{ marginBottom: 4 }}>Inventário Material</h3>
          <p style={{ fontSize: 13, opacity: 0.6 }}>Gestão de equipamentos, estados e manutenção.</p>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <button className="btn-secondary" onClick={exportToCSV}>Exportar CSV</button>
          <button className="btn" style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setShowNovo(!showNovo)}>
            {showNovo ? "Fechar" : "+ Novo Equipamento"}
          </button>
        </div>
      </div>

      {/* --- FORMULÁRIO "NOVO" --- */}
      {showNovo && (
        <div className="equip-form">
          <div className="equip-form__header">
            <div>
              <div className="equip-form__title">Registo de Novo Equipamento</div>
              <div className="equip-form__subtitle">
                Preenche os dados principais do material. Podes editar mais tarde.
              </div>
            </div>
            <div className="equip-form__code">
              <span className="equip-form__code-label">CÓDIGO</span>
              <span className="equip-form__code-value">{novo.codigoCompleto || "---"}</span>
            </div>
          </div>

          <div className="equip-form__body">
            {/* Bloco 1: Identidade */}
            <section className="equip-section">
              <div className="equip-section__header">
                <h4>Identificação</h4>
                <p>Define a utilização, tipo e nome comercial do material.</p>
              </div>

              <div className="equip-grid equip-grid--3">
                <div className="field">
                  <label className="field__label">Utilização</label>
                  <select
                    className="field__control"
                    value={novo.utilizacaoCodigo}
                    onChange={e =>
                      setNovo({ ...novo, utilizacaoCodigo: e.target.value, tipoCodigo: "" })
                    }
                  >
                    <option value="">-- selecionar --</option>
                    {listaUtils.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.id} · {u.nome}
                      </option>
                    ))}
                  </select>
                  <p className="field__hint">Ex.: Acampamento, Atividades de Sede, Cozinha…</p>
                </div>

                <div className="field">
                  <label className="field__label">Tipo</label>
                  <select
                    className="field__control"
                    value={novo.tipoCodigo}
                    disabled={!novo.utilizacaoCodigo}
                    onChange={e => setNovo({ ...novo, tipoCodigo: e.target.value })}
                  >
                    <option value="">-- selecionar --</option>
                    {listaTipos
                      .filter(t => t.utilizacaoCodigo === novo.utilizacaoCodigo)
                      .map(t => (
                        <option key={t.id} value={t.Codigo}>
                          {t.Codigo} · {t.nome}
                        </option>
                      ))}
                  </select>
                  <p className="field__hint">Filtrado pela utilização escolhida.</p>
                </div>

                <div className="field">
                  <label className="field__label">Nome do Material</label>
                  <input
                    className="field__control"
                    placeholder="Ex.: Tenda Familiar Quechua"
                    value={novo.nome}
                    onChange={e => setNovo({ ...novo, nome: e.target.value })}
                  />
                </div>
              </div>
            </section>

            {/* Bloco 2: Estado e datas */}
            <section className="equip-section equip-section--muted">
              <div className="equip-section__header">
                <h4>Estado e Ciclo de Vida</h4>
                <p>Controla disponibilidade, condição e datas relevantes.</p>
              </div>

              <div className="equip-grid equip-grid--5">
                <div className="field">
                  <label className="field__label">Estado</label>
                  <select
                    className="field__control"
                    value={novo.estado}
                    onChange={e => setNovo({ ...novo, estado: e.target.value })}
                  >
                    <option value="DISPONIVEL">Disponível</option>
                    <option value="MANUTENCAO">Em manutenção</option>
                  </select>
                </div>

                <div className="field">
                  <label className="field__label">Operacional</label>
                  <select
                    className="field__control"
                    value={novo.estadoOperacional}
                    onChange={e => setNovo({ ...novo, estadoOperacional: e.target.value })}
                  >
                    <option value="OPERACIONAL">Operacional</option>
                    <option value="DANIFICADO">Danificado</option>
                  </select>
                </div>

                <div className="field">
                  <label className="field__label">Condição</label>
                  <select
                    className="field__control"
                    value={novo.condicao}
                    onChange={e => setNovo({ ...novo, condicao: e.target.value })}
                  >
                    <option value="NOVO">Novo</option>
                    <option value="BOM">Bom</option>
                    <option value="USADO">Usado</option>
                  </select>
                </div>

                <div className="field">
                  <label className="field__label">Aquisição</label>
                  <input
                    type="date"
                    className="field__control"
                    value={novo.dataAquisicao}
                    onChange={e => setNovo({ ...novo, dataAquisicao: e.target.value })}
                  />
                </div>

                <div className="field">
                  <label className="field__label">Abate (prev.)</label>
                  <input
                    type="date"
                    className="field__control"
                    value={novo.dataAbate}
                    onChange={e => setNovo({ ...novo, dataAbate: e.target.value })}
                  />
                </div>
              </div>
            </section>

            {/* Bloco 3: Notas */}
            <section className="equip-section">
              <div className="equip-grid equip-grid--2">
                <div className="field">
                  <label className="field__label">Descrição Interna</label>
                  <textarea
                    className="field__control field__control--textarea"
                    value={novo.descricao}
                    onChange={e => setNovo({ ...novo, descricao: e.target.value })}
                    placeholder="Notas técnicas, conteúdo do kit, medidas, etc."
                  />
                </div>

                <div className="field">
                  <label className="field__label">Observações de Gestão</label>
                  <textarea
                    className="field__control field__control--textarea"
                    value={novo.observacoes}
                    onChange={e => setNovo({ ...novo, observacoes: e.target.value })}
                    placeholder="Restrições de uso, histórico de incidentes, prioridade de substituição…"
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="equip-form__footer">
            <button className="btn-secondary" onClick={() => setShowNovo(false)}>
              Cancelar
            </button>
            <button className="btn" onClick={handleCreate}>
              Confirmar registo
            </button>
          </div>
        </div>
      )}


      {/* --- BARRA DE PESQUISA --- */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <input className="input" style={{flex: 1}} placeholder="Pesquisar por código, nome ou descrição..." value={qText} onChange={e => setQText(e.target.value)} />
        <select className="select" style={{width:160}} value={fUtil} onChange={e => setFUtil(e.target.value)}><option value="">Utilização (todas)</option>{listaUtils.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
        <select className="select" style={{width:160}} value={fTipo} onChange={e => setFTipo(e.target.value)} disabled={!fUtil}><option value="">Tipo (todos)</option>{listaTipos.filter(t => t.utilizacaoCodigo === fUtil).map(t => <option key={t.id} value={t.Codigo}>{t.nome}</option>)}</select>
      </div>

      {/* --- TABELA DE INVENTÁRIO (EDIÇÃO TOTAL) --- */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <th style={{ width: 100 }}>Código</th>
                <th>Equipamento / Detalhes</th>
                <th style={{ width: 220 }}>Estado & Operacional</th>
                <th style={{ width: 120 }}>Condição</th>
                <th style={{ width: 120 }}>Datas</th>
                <th style={{ width: 100, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredEquip.map(e => {
                const isEd = editingId === e.id;
                const d = isEd ? (tempData[e.id] || e) : e;
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td className="mono" style={{ fontWeight: 'bold', color: '#334155' }}>{e.codigoCompleto}</td>
                    <td>
                      {isEd ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input className="input" value={d.nome} onChange={el => setTempData({...tempData, [e.id]: {...d, nome: el.target.value}})} />
                          <input className="input" style={{ fontSize: 11 }} placeholder="Descrição..." value={d.descricao || ""} onChange={el => setTempData({...tempData, [e.id]: {...d, descricao: el.target.value}})} />
                          <input className="input" style={{ fontSize: 11 }} placeholder="Observações..." value={d.observacoes || ""} onChange={el => setTempData({...tempData, [e.id]: {...d, observacoes: el.target.value}})} />
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: '500' }}>{e.nome}</div>
                          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>{e.descricao} {e.observacoes && `| ${e.observacoes}`}</div>
                        </div>
                      )}
                    </td>
                    <td>
                      {isEd ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select className="select" value={d.estado} onChange={el => setTempData({...tempData, [e.id]: {...d, estado: el.target.value}})}><option value="DISPONIVEL">DISP</option><option value="EM_USO">USO</option><option value="MANUTENCAO">MANUT</option></select>
                          <select className="select" value={d.estadoOperacional} onChange={el => setTempData({...tempData, [e.id]: {...d, estadoOperacional: el.target.value}})}><option value="OPERACIONAL">OPER</option><option value="DANIFICADO">DANI</option></select>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={`chip chip-${e.estado?.toLowerCase()}`}>{e.estado}</span>
                          <small style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>{e.estadoOperacional}</small>
                        </div>
                      )}
                    </td>
                    <td>{isEd ? <select className="select" value={d.condicao} onChange={el => setTempData({...tempData, [e.id]: {...d, condicao: el.target.value}})}><option value="NOVO">NOVO</option><option value="BOM">BOM</option><option value="DANIFICADO">DANI</option></select> : e.condicao}</td>
                    <td><div style={{ fontSize: 11, color: '#64748b' }}>Aq: {fmtTS(e.dataAquisicao)}<br/>Req: {fmtTS(e.ultimaRequisicaoEm)}</div></td>
                    <td style={{ textAlign: 'right' }}>
                      {isEd ? (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn" style={{ padding: '4px 10px' }} onClick={() => saveEdit(e.id)}>Gravar</button>
                          <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setEditingId(null)}>X</button>
                        </div>
                      ) : <button className="btn-secondary" onClick={() => { setEditingId(e.id); setTempData({...tempData, [e.id]: e}); }}>Editar</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}