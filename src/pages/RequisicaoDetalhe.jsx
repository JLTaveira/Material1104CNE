/* Detalhe da Requisição + Itens + Alocações + Botões
 src/pages/RequisicaoDetalhe.jsx
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) 
  2026-02-24 - revisão e optimização com Gemini */

import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  doc, getDoc, getDocs, collection, query, where, 
  updateDoc, serverTimestamp, writeBatch, deleteDoc, addDoc 
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../authContext";
import AppLayout from "../layouts/AppLayout";
import emailjs from '@emailjs/browser';

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v && typeof v === 'object' && 'seconds' in v) return v.toDate();
  return new Date(v);
}

function fmtTS(v) {
  const d = toDate(v);
  if (!d || isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-PT");
}

export default function RequisicaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  
  const [req, setReq] = useState(null);
  const [itens, setItens] = useState([]);
  const [equipamentos, setEquipamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  // Dados das Tabelas de Apoio (Filtros Dinâmicos)
  const [listaUtils, setListaUtils] = useState([]); // Coleção utilizacoes
  const [listaTipos, setListaTipos] = useState([]); // Coleção tipos

  // Estados dos Filtros
  const [qEquip, setQEquip] = useState("");
  const [fUtil, setFUtil] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [tempData, setTempData] = useState({});

  const labelEstado = {
  "SUBMETIDA": "Submetida",
  "EM_PREPARACAO": "Em preparação",
  "PRONTA": "Pronta",
  "ENTREGUE": "Entregue",
  "DEVOLVIDA": "Devolvida",
  "ANULADA": "Anulada"
  };

  async function load() {
  setLoading(true);
  try {
    const snap = await getDoc(doc(db, "requisicoes", id));
    if (!snap.exists()) return navigate("/admin/requisicoes");
    setReq({ id: snap.id, ...snap.data() });

    const iSnap = await getDocs(collection(db, "requisicoes", id, "itens"));
    setItens(iSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    // Carregar Utilizações e Tipos para os dropdowns
    const [uSnap, tSnap, eSnap] = await Promise.all([
      getDocs(collection(db, "utilizacoes")),
      getDocs(collection(db, "tipos")),
      getDocs(query(collection(db, "equipamentos"), where("estado", "==", "DISPONIVEL")))
    ]);

    setListaUtils(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setListaTipos(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setEquipamentos(eSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { console.error(e); }
  setLoading(false);
  }
    
  useEffect(() => { load(); }, [id]);

  const handleEdit = (targetId, field, value) => {
    setTempData(prev => ({
      ...prev,
      [targetId]: { ...prev[targetId], [field]: value }
    }));
  };

  // --- Lógica de Filtragem Dinâmica (Utilização -> Tipo) ---
  const tiposFiltrados = useMemo(() => {
  if (!fUtil) return [];
  return listaTipos.filter(t => t.utilizacaoCodigo === fUtil);
  }, [fUtil, listaTipos]);

  const filteredEquip = useMemo(() => {
  return equipamentos.filter(e => {
    const matchText = !qEquip || (e.nome + e.codigoCompleto).toLowerCase().includes(qEquip.toLowerCase());
    const matchUtil = !fUtil || e.utilizacaoCodigo === fUtil;
    const matchTipo = !fTipo || e.tipoCodigo === fTipo;
    const jaAlocado = itens.some(it => it.equipamentoId === e.id);
    return matchText && matchUtil && matchTipo && !jaAlocado;
  });
  }, [equipamentos, itens, qEquip, fUtil, fTipo]);
  
  // Função envio de email com EmailJS
  async function dispararEmailEstado(novo, preparador, dataHora) {
    try {
      let emailDest = req.criadaPorEmail;
      if (!emailDest) {
        const uSnap = await getDoc(doc(db, "users", req.criadaPorUid));
        emailDest = uSnap.exists() ? uSnap.data().email : null;
      }
      if (emailDest) {
        const templateParams = {
          to_email: emailDest,
          id_curto: id.substring(0, 8),
          timestamp: dataHora.toLocaleString("pt-PT"),
          mensagem_principal: novo === "PRONTA" 
            ? `A requisição ${id}, foi preparada por ${preparador} e está pronta para entrega.`
            : `A requisição ${id}, foi registada como DEVOLVIDA e o material foi rececionado por ${preparador}.`
        };
        await emailjs.send('service_sx1klqh', 'template_oq5qqda', templateParams, 'PngEeenmXc-Fv3VP8');
        return true;
      }
    } catch (err) { console.error("Erro EmailJS:", err); return false; }
  }

  async function handleAnulacao() {
      // 1. Justificação obrigatória
      const motivo = window.prompt("Indique o motivo da anulação (obrigatório):");
      
      if (!motivo || motivo.trim() === "") {
        alert("É obrigatório indicar um motivo para anular.");
        return;
      }

      if (!window.confirm("Tem a certeza que deseja ANULAR este pedido? Os equipamentos serão libertados.")) return;

      const gestor = profile?.nome || "Gestor";
      const agora = new Date();
      const batch = writeBatch(db);

      try {
        // 2. Atualizar pedido para ANULADA
        batch.update(doc(db, "requisicoes", id), {
          estado: "ANULADA",
          anuladaPorNome: gestor,
          anuladaEm: serverTimestamp(),
          motivoAnulacao: motivo,
          atualizadoEm: serverTimestamp()
        });

        // 3. Libertar equipamentos (Voltar a DISPONÍVEL)
        itens.forEach(it => {
          batch.update(doc(db, "equipamentos", it.equipamentoId), {
            estado: "DISPONIVEL"
          });
        });

        await batch.commit();

        // 4. Notificar via e-mail
        await dispararEmailEstado("ANULADA", gestor, agora);

        alert("Requisição anulada com sucesso.");
        load();
      } catch (err) {
        console.error(err);
        alert("Erro ao anular.");
      }
    }

  // --- MUDAR ESTADO (CORRIGIDA) ---
  async function handleMudarEstado(novo) {
    const agora = new Date();
    const preparador = profile?.nome || "Gestor de Material";
    try {
      const updateData = { estado: novo, atualizadoEm: serverTimestamp() };
      if (novo === "EM_PREPARACAO") {
        updateData.preparadaPorNome = preparador;
        updateData.preparadaEm = serverTimestamp();
      }
      await updateDoc(doc(db, "requisicoes", id), updateData);
      if (novo === "PRONTA" || novo === "DEVOLVIDA") {
        await dispararEmailEstado(novo, preparador, agora);
        alert("Estado atualizado e e-mail enviado!");
      }
      load();
    } catch (err) { console.error("Erro:", err); alert("Erro ao mudar estado."); }
  } // <--- Faltava fechar esta função no teu código!

  // --- DEVOLUÇÃO (COMPLETA) ---
  async function handleDevolucao() {
    const agora = new Date();
    const gestor = profile?.nome || "Gestor";
    const batch = writeBatch(db);
    try {
      // 1. Atualiza Requisicao
      batch.update(doc(db, "requisicoes", id), { 
        estado: "DEVOLVIDA", 
        rececionadaPorNome: gestor,
        rececionadaEm: serverTimestamp(),
        atualizadoEm: serverTimestamp() 
      });
      // 2. Liberta equipamentos para DISPONIVEL
      itens.forEach(it => {
        batch.update(doc(db, "equipamentos", it.equipamentoId), { 
          estado: "DISPONIVEL",
          ultimaRequisicaoEm: serverTimestamp() 
        });
      });
      await batch.commit();
      await dispararEmailEstado("DEVOLVIDA", gestor, agora);
      alert("Material rececionado e e-mail enviado!");
      load();
    } catch (err) { console.error(err); alert("Erro na devolução."); }
  }

  async function handleEntrega() {
    const batch = writeBatch(db);
    batch.update(doc(db, "requisicoes", id), { 
      estado: "ENTREGUE", 
      atualizadoEm: serverTimestamp(),
      recebidaPorNome: profile?.nome,
      recebidaEm: serverTimestamp()
    });
    itens.forEach(it => {
      batch.update(doc(db, "equipamentos", it.equipamentoId), { estado: "EM_USO" });
    });
    await batch.commit();
    load();
  }

  async function handleDevolucao() {
    const agora = new Date();
    const gestor = profile?.nome || "Gestor";
    const batch = writeBatch(db);

    try {
      // 1. Atualiza a Requisição para DEVOLVIDA
      batch.update(doc(db, "requisicoes", id), { 
        estado: "DEVOLVIDA", 
        rececionadaPorNome: gestor,
        rececionadaEm: serverTimestamp(),
        atualizadoEm: serverTimestamp() 
      });

      // 2. Liberta os equipamentos para ficarem DISPONÍVEL na BD
      itens.forEach(it => {
        batch.update(doc(db, "equipamentos", it.equipamentoId), { 
          estado: "DISPONIVEL",
          ultimaRequisicaoEm: serverTimestamp() 
        });
      });

      await batch.commit();

      // 3. Envia o e-mail (usando a tua função partilhada)
      await dispararEmailEstado("DEVOLVIDA", gestor, agora);
      
      alert("Material rececionado e e-mail enviado!");
      load(); 
    } catch (err) {
      console.error(err);
      alert("Erro ao registar devolução.");
    }
  }

  async function alocar(equip) {
    const batch = writeBatch(db);
    const itemRef = doc(collection(db, "requisicoes", id, "itens"));
    
    // Pega o que está escrito no ecrã (tempData) ou o que já está na BD
    const dadosNovos = tempData[equip.id] || {};
    const desc = dadosNovos.descInterna ?? equip.descInterna ?? "";
    const obs = dadosNovos.obsInternas ?? equip.obsInternas ?? "";

    batch.set(itemRef, { 
      equipamentoId: equip.id, 
      nome: equip.nome, 
      codigoCompleto: equip.codigoCompleto,
      descInterna: desc,
      obsInternas: obs,
      criadoEm: serverTimestamp() 
    });
    batch.update(doc(db, "equipamentos", equip.id), { estado: "RESERVADO" });
    await batch.commit();
    
    // Limpa o temporário deste item
    setTempData(prev => { const c = {...prev}; delete c[equip.id]; return c; });
    load();
  }

  if (loading) return <AppLayout><div>A carregar...</div></AppLayout>;

  return (
    <AppLayout>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 className="h3">Pedido {id.substring(0, 8)}</h3>
          <span className={`chip chip-${(req?.estado || "").toLowerCase()}`}>
            {labelEstado[req?.estado] || req?.estado}
          </span>

        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn-secondary" onClick={() => navigate("/admin")}>Voltar</button>
          {req?.estado === "SUBMETIDA" && (
            <>
              <button 
                className="btn" 
                style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', marginRight: 10 }} 
                onClick={handleAnulacao}
              >
                Anular Pedido
              </button>
              <button className="btn" onClick={() => handleMudarEstado("EM_PREPARACAO")}>
                Começar Preparação
              </button>
            </>
          )}
          {req?.estado === "EM_PREPARACAO" && <button className="btn" onClick={() => handleMudarEstado("PRONTA")}>Marcar PRONTA</button>}
          {req?.estado === "PRONTA" && (
            <>
              <button className="btn-secondary" onClick={() => handleMudarEstado("EM_PREPARACAO")}>Retroceder para Preparação</button>
              <button className="btn" onClick={handleEntrega}>Marcar ENTREGUE</button>
            </>
          )}

          {req?.estado === "ENTREGUE" && (
            <button className="btn" onClick={handleDevolucao}>
              Marcar DEVOLVIDA
            </button>
            )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
        <div className="card">
          <h4 className="h4" style={{borderBottom: '1px solid #eee', paddingBottom: 8, marginBottom: 12}}>Informação Geral</h4>
          <p><b>Requisitante:</b> {req?.criadaPorNome}</p>
          <p><b>Início:</b> {fmtTS(req?.dataInicio)} → {fmtTS(req?.dataFim)}</p>
          <p style={{marginTop: 8}}><b>Obs. Utilizador:</b> {req?.observacoes || "—"}</p>
        </div>
        <div className="card">
          <h4 className="h4" style={{borderBottom: '1px solid #eee', paddingBottom: 8, marginBottom: 12}}>Registos (Gestão)</h4>
          
          {req?.estado === "ANULADA" ? (
            <div style={{ color: '#b91c1c' }}>
              <p><b>Anulado por:</b> {req?.anuladaPorNome} ({fmtTS(req?.anuladaEm)})</p>
              <p style={{ marginTop: 8 }}><b>Motivo:</b> {req?.motivoAnulacao}</p>
            </div>
          ) : (
            <>
              <p><b>Preparada por:</b> {req?.preparadaPorNome || "—"} {req?.preparadaEm && <small>({fmtTS(req.preparadaEm)})</small>}</p>
              <p><b>Entregue por:</b> {req?.recebidaPorNome || "—"} {req?.recebidaEm && <small>({fmtTS(req.recebidaEm)})</small>}</p>
              <p><b>Rececionada por:</b> {req?.rececionadaPorNome || "—"} {req?.rececionadaEm && <small>({fmtTS(req.rececionadaEm)})</small>}</p>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 25 }}>
        <h4 className="h4">Itens alocados ({itens.length})</h4>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Código</th><th>Equipamento</th><th>Descrição (interna)</th><th>Observações (internas)</th><th style={{textAlign:'right'}}>Ações</th></tr>
            </thead>
            <tbody>
              {itens.map(it => (
                <tr key={it.id}>
                  <td className="mono">{it.codigoCompleto}</td>
                  <td>{it.nome}</td>
                  <td><input className="input" placeholder="Descrição..." value={tempData[it.id]?.descInterna ?? it.descInterna ?? ""} onChange={e => handleEdit(it.id, 'descInterna', e.target.value)} /></td>
                  <td><input className="input" placeholder="Observações..." value={tempData[it.id]?.obsInternas ?? it.obsInternas ?? ""} onChange={e => handleEdit(it.id, 'obsInternas', e.target.value)} /></td>
                  <td style={{textAlign:'right', whiteSpace:'nowrap'}}>
                    <button className="btn-secondary" style={{padding: '4px 8px', marginRight: 4}} onClick={() => updateDoc(doc(db, "requisicoes", id, "itens", it.id), tempData[it.id] || {}).then(()=>alert("Guardado"))}>Guardar</button>
                    <button className="btn" style={{background:'#fee2e2', color:'#991b1b', padding:'4px 8px'}} onClick={async () => {
                      const batch = writeBatch(db);
                      batch.delete(doc(db, "requisicoes", id, "itens", it.id));
                      batch.update(doc(db, "equipamentos", it.equipamentoId), { estado: "DISPONIVEL" });
                      await batch.commit(); load();
                    }}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        
    {req?.estado === "EM_PREPARACAO" && (
      <div className="card">
        <h4 className="h4">Equipamentos disponíveis</h4>
        
        <div className="row" style={{ gap: 10, margin: '15px 0' }}>
          {/* Seletor de Utilização: Usa u.id para o Código (01, 02...) */}
          <select className="select" style={{ width: 180 }} value={fUtil} onChange={e => { setFUtil(e.target.value); setFTipo(""); }}>
            <option value="">Utilização (todas)</option>
            {listaUtils.map(u => (
              <option key={u.id} value={u.id}>{u.id} - {u.nome}</option>
            ))}
          </select>

          {/* Seletor de Tipo: Usa t.Codigo para o valor (01, 02...) */}
          <select className="select" style={{ width: 180 }} value={fTipo} onChange={e => setFTipo(e.target.value)} disabled={!fUtil}>
            <option value="">Tipo (todos)</option>
            {tiposFiltrados.map(t => (
              <option key={t.id} value={t.Codigo}>{t.Codigo} - {t.nome}</option>
            ))}
          </select>

          <input className="input" style={{ flex: 1 }} placeholder="Pesquisar (código/nome/descrição...)" value={qEquip} onChange={e => setQEquip(e.target.value)} />
          <button className="btn-secondary" onClick={() => { setFUtil(""); setFTipo(""); setQEquip(""); }}>Limpar</button>
        </div>       
        <div className="table-wrap" style={{ maxHeight: 450 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Código</th><th>Nome</th><th>Última requisição</th>
                <th>Descrição (interna)</th><th>Observações (internas)</th>
                <th style={{ textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredEquip.map(e => (
                <tr key={e.id}>
                  <td className="mono">{e.codigoCompleto}</td>
                  <td>{e.nome}</td>
                  <td style={{ fontSize: 11 }}>{fmtTS(e.ultimaRequisicaoEm)}</td>
                  <td><input className="input" value={tempData[e.id]?.descInterna ?? e.descInterna ?? ""} onChange={el => handleEdit(e.id, 'descInterna', el.target.value)} /></td>
                  <td><input className="input" value={tempData[e.id]?.obsInternas ?? e.obsInternas ?? ""} onChange={el => handleEdit(e.id, 'obsInternas', el.target.value)} /></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn-secondary" style={{ padding: '4px 8px', marginRight: 5 }} onClick={() => updateDoc(doc(db, "equipamentos", e.id), tempData[e.id] || {}).then(() => alert("Guardado"))}>Guardar</button>
                    <button className="btn" style={{ padding: '4px 8px' }} onClick={() => alocar(e)}>Adicionar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
    </AppLayout>
  );
}