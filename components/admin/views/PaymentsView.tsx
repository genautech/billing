import React, { useState, useEffect, useMemo } from 'react';
import { 
    getCobrancasMensais, 
    getClientes, 
    uploadFileToStorage, 
    getDocumentosByCobrancaId,
    saveDocumentoPedido,
    deleteDocumentoPedido,
    updateCobrancaWithNotaFiscal,
    getDocumentosByClienteAndMonth
} from '../../../services/firestoreService';
import { generateNotaFiscalExplanation } from '../../../services/geminiContentService';
import type { CobrancaMensal, Cliente, DocumentoPedido } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { FormSelect } from '../../ui/FormControls';
import { FileUpload } from '../../ui/FileUpload';

interface PaymentsViewProps {
    onUpdate: () => void;
}

const PaymentsView: React.FC<PaymentsViewProps> = ({ onUpdate }) => {
    const [cobrancas, setCobrancas] = useState<CobrancaMensal[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [documentos, setDocumentos] = useState<DocumentoPedido[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCobranca, setSelectedCobranca] = useState<CobrancaMensal | null>(null);
    const [notaFiscalFile, setNotaFiscalFile] = useState<File | null>(null);
    const [pedidoFiles, setPedidoFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [explicacao, setExplicacao] = useState<string>('');
    const [isGeneratingExplanation, setIsGeneratingExplanation] = useState(false);
    const [filters, setFilters] = useState({ clientId: 'all', month: 'all' });
    const { addToast } = useToast();

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (selectedCobranca) {
            loadDocumentos();
            if (selectedCobranca.explicacaoNotaFiscal) {
                setExplicacao(selectedCobranca.explicacaoNotaFiscal);
            }
        }
    }, [selectedCobranca]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [cobrancasData, clientesData] = await Promise.all([
                getCobrancasMensais(),
                getClientes()
            ]);
            setCobrancas(cobrancasData);
            setClientes(clientesData);
        } catch (error) {
            console.error("Failed to fetch data:", error);
            addToast('Erro ao carregar dados.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadDocumentos = async () => {
        if (!selectedCobranca) return;
        try {
            const docs = await getDocumentosByCobrancaId(selectedCobranca.id);
            setDocumentos(docs);
        } catch (error) {
            console.error("Failed to load documentos:", error);
            addToast('Erro ao carregar documentos.', 'error');
        }
    };

    const availableMonths = useMemo(() => {
        const months = [...new Set(cobrancas.map(c => c.mesReferencia).filter(Boolean))];
        return months.sort((a, b) => {
            const [mesA, anoA] = a.split('/');
            const [mesB, anoB] = b.split('/');
            const dateA = new Date(parseInt(anoA), parseInt(mesA) - 1);
            const dateB = new Date(parseInt(anoB), parseInt(mesB) - 1);
            return dateB.getTime() - dateA.getTime();
        });
    }, [cobrancas]);

    const filteredCobrancas = useMemo(() => {
        return cobrancas.filter(c => {
            const clientMatch = filters.clientId === 'all' || c.clienteId === filters.clientId;
            const monthMatch = filters.month === 'all' || c.mesReferencia === filters.month;
            return clientMatch && monthMatch;
        });
    }, [cobrancas, filters]);

    const handleUploadNotaFiscal = async () => {
        if (!selectedCobranca || !notaFiscalFile) {
            addToast('Selecione uma cobrança e um arquivo de nota fiscal.', 'error');
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const path = `notas-fiscais/${selectedCobranca.clienteId}/${selectedCobranca.id}/${Date.now()}_${notaFiscalFile.name}`;
            const url = await uploadFileToStorage(notaFiscalFile, path);
            
            await updateCobrancaWithNotaFiscal(selectedCobranca.id, url, notaFiscalFile.name);
            
            // Also save as documento
            await saveDocumentoPedido({
                cobrancaId: selectedCobranca.id,
                clienteId: selectedCobranca.clienteId,
                mesReferencia: selectedCobranca.mesReferencia,
                fileName: notaFiscalFile.name,
                fileUrl: url,
                uploadDate: new Date().toISOString(),
                tipo: 'nota-fiscal'
            });

            addToast('Nota fiscal enviada com sucesso!', 'success');
            setNotaFiscalFile(null);
            await fetchData();
            await loadDocumentos();
        } catch (error) {
            console.error("Failed to upload nota fiscal:", error);
            addToast('Erro ao enviar nota fiscal.', 'error');
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleUploadPedidos = async () => {
        if (!selectedCobranca || pedidoFiles.length === 0) {
            addToast('Selecione uma cobrança e pelo menos um arquivo de pedido.', 'error');
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const totalFiles = pedidoFiles.length;
            let uploaded = 0;

            for (const file of pedidoFiles) {
                const path = `pedidos/${selectedCobranca.clienteId}/${selectedCobranca.id}/${Date.now()}_${file.name}`;
                const url = await uploadFileToStorage(file, path);
                
                await saveDocumentoPedido({
                    cobrancaId: selectedCobranca.id,
                    clienteId: selectedCobranca.clienteId,
                    mesReferencia: selectedCobranca.mesReferencia,
                    fileName: file.name,
                    fileUrl: url,
                    uploadDate: new Date().toISOString(),
                    tipo: 'pedido'
                });

                uploaded++;
                setUploadProgress((uploaded / totalFiles) * 100);
            }

            addToast(`${uploaded} pedido(s) enviado(s) com sucesso!`, 'success');
            setPedidoFiles([]);
            await loadDocumentos();
        } catch (error) {
            console.error("Failed to upload pedidos:", error);
            addToast('Erro ao enviar pedidos.', 'error');
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleGenerateExplanation = async () => {
        if (!selectedCobranca) {
            addToast('Selecione uma cobrança primeiro.', 'error');
            return;
        }

        setIsGeneratingExplanation(true);
        try {
            // Try to extract text from nota fiscal if available
            // For now, we'll use a simplified approach
            const notaFiscalText = selectedCobranca.notaFiscalUrl 
                ? `Nota fiscal anexada: ${selectedCobranca.notaFiscalFileName || 'Arquivo anexado'}`
                : 'Informações da cobrança mensal';

            const explanation = await generateNotaFiscalExplanation(notaFiscalText, selectedCobranca);
            setExplicacao(explanation);

            // Save explanation to cobranca
            const { db } = await import('../../../services/firebase');
            const cobrancaRef = db.collection('cobrancasMensais').doc(selectedCobranca.id);
            await cobrancaRef.update({ explicacaoNotaFiscal: explanation });

            addToast('Explicação gerada com sucesso!', 'success');
            await fetchData();
        } catch (error) {
            console.error("Failed to generate explanation:", error);
            addToast('Erro ao gerar explicação.', 'error');
        } finally {
            setIsGeneratingExplanation(false);
        }
    };

    const handleDeleteDocumento = async (docId: string) => {
        if (!confirm('Tem certeza que deseja excluir este documento?')) return;

        try {
            await deleteDocumentoPedido(docId);
            addToast('Documento excluído com sucesso!', 'success');
            await loadDocumentos();
        } catch (error) {
            console.error("Failed to delete documento:", error);
            addToast('Erro ao excluir documento.', 'error');
        }
    };

    if (loading) {
        return <div className="text-center p-10">Carregando...</div>;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Gestão de Pagamentos e Documentos</h2>

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Cliente</label>
                        <FormSelect 
                            value={filters.clientId} 
                            onChange={e => setFilters(f => ({...f, clientId: e.target.value}))}
                        >
                            <option value="all">Todos os Clientes</option>
                            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </FormSelect>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Mês/Ano</label>
                        <FormSelect 
                            value={filters.month} 
                            onChange={e => setFilters(f => ({...f, month: e.target.value}))}
                        >
                            <option value="all">Todos os Meses</option>
                            {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                        </FormSelect>
                    </div>
                </div>
            </div>

            {/* Cobranças List */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Cobranças</h3>
                <div className="space-y-2">
                    {filteredCobrancas.map(c => {
                        const cliente = clientes.find(cli => cli.id === c.clienteId);
                        return (
                            <div
                                key={c.id}
                                onClick={() => setSelectedCobranca(c)}
                                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                                    selectedCobranca?.id === c.id
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-medium text-gray-900">{cliente?.nome || 'N/A'}</p>
                                        <p className="text-sm text-gray-500">{c.mesReferencia}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-gray-900">R$ {c.valorTotal.toFixed(2)}</p>
                                        <p className="text-xs text-gray-500">{c.status}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Upload and Documents Section */}
            {selectedCobranca && (
                <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
                    <h3 className="text-xl font-semibold text-gray-800">
                        Documentos - {clientes.find(c => c.id === selectedCobranca.clienteId)?.nome} - {selectedCobranca.mesReferencia}
                    </h3>

                    {/* Upload Nota Fiscal */}
                    <div>
                        <FileUpload
                            id="nota-fiscal-upload"
                            label="Nota Fiscal"
                            accept="application/pdf,image/*"
                            maxSizeMB={10}
                            onFileSelect={setNotaFiscalFile}
                            file={notaFiscalFile}
                            isUploading={isUploading}
                            uploadProgress={uploadProgress}
                        />
                        <button
                            onClick={handleUploadNotaFiscal}
                            disabled={!notaFiscalFile || isUploading}
                            className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {isUploading ? 'Enviando...' : 'Enviar Nota Fiscal'}
                        </button>
                    </div>

                    {/* Upload Pedidos */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Pedidos</label>
                        <input
                            type="file"
                            multiple
                            accept="application/pdf,image/*"
                            onChange={(e) => setPedidoFiles(Array.from(e.target.files || []))}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {pedidoFiles.length > 0 && (
                            <div className="mt-2">
                                <p className="text-sm text-gray-600">{pedidoFiles.length} arquivo(s) selecionado(s)</p>
                            </div>
                        )}
                        <button
                            onClick={handleUploadPedidos}
                            disabled={pedidoFiles.length === 0 || isUploading}
                            className="mt-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                        >
                            {isUploading ? 'Enviando...' : 'Enviar Pedidos'}
                        </button>
                    </div>

                    {/* Documents List */}
                    <div>
                        <h4 className="font-semibold text-gray-700 mb-2">Documentos Anexados</h4>
                        <div className="space-y-2">
                            {documentos.map(doc => (
                                <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                                    <div className="flex items-center space-x-3">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{doc.fileName}</p>
                                            <p className="text-xs text-gray-500">{doc.tipo === 'nota-fiscal' ? 'Nota Fiscal' : 'Pedido'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <a
                                            href={doc.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800"
                                        >
                                            Ver
                                        </a>
                                        <button
                                            onClick={() => handleDeleteDocumento(doc.id)}
                                            className="text-red-600 hover:text-red-800"
                                        >
                                            Excluir
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {documentos.length === 0 && (
                                <p className="text-sm text-gray-500">Nenhum documento anexado ainda.</p>
                            )}
                        </div>
                    </div>

                    {/* Explanation Section */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-semibold text-gray-700">Explicação da Nota Fiscal</h4>
                            <button
                                onClick={handleGenerateExplanation}
                                disabled={isGeneratingExplanation}
                                className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:bg-gray-400 text-sm"
                            >
                                {isGeneratingExplanation ? 'Gerando...' : 'Gerar Explicação'}
                            </button>
                        </div>
                        {explicacao ? (
                            <div className="p-4 bg-gray-50 rounded-md">
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{explicacao}</p>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">Clique em "Gerar Explicação" para criar uma explicação da nota fiscal.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentsView;

