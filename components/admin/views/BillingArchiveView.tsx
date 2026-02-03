import React, { useState, useMemo } from 'react';
import { 
    getDetalhesByCobrancaId, 
    getCustosAdicionaisByCobrancaId, 
    generateInvoiceAnalysis, 
    deleteCobranca, 
    salvarCobrancaEditada, 
    updateCobrancaStatus, 
    calculatePrecoVenda, 
    calculatePrecoVendaForDisplay, 
    isTemplateItem, 
    getShareableUrl, 
    uploadFileToStorage, 
    updateCobrancaWithNotaFiscal, 
    deleteFileFromStorage,
    getCostCategoryGroup 
} from '../../../services/firestoreService';
import type { CobrancaMensal, Cliente, TabelaPrecoItem, DetalheEnvio, CustoAdicional } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { FormInput, FormSelect } from '../../ui/FormControls';
import { FileUpload } from '../../ui/FileUpload';


// --- Invoice Editing Modal Component ---
interface EditInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (cobranca: CobrancaMensal, detalhes: DetalheEnvio[], custosAdicionais: CustoAdicional[]) => Promise<void>;
    cobranca: CobrancaMensal;
    cliente: Cliente | undefined;
    tabelaPrecos: TabelaPrecoItem[];
}

const EditInvoiceModal: React.FC<EditInvoiceModalProps> = ({ isOpen, onClose, onSave, cobranca: initialCobranca, cliente, tabelaPrecos }) => {
    const manualCostCategories: NonNullable<CustoAdicional['categoria']>[] = ['Armazenagem', 'Maquila/Entrada', 'Estoque', 'Logístico', 'Outro'];
    const [cobranca, setCobranca] = useState<CobrancaMensal>(initialCobranca);
    const [detalhes, setDetalhes] = useState<DetalheEnvio[]>([]);
    const [custosAdicionais, setCustosAdicionais] = useState<CustoAdicional[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [notaFiscalFile, setNotaFiscalFile] = useState<File | null>(null);
    const [isUploadingNotaFiscal, setIsUploadingNotaFiscal] = useState(false);
    const { addToast } = useToast();

    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    const recalculateTotals = (currentDetalhes: DetalheEnvio[], currentCustosAdicionais: CustoAdicional[]) => {
        let totalEnvio = 0;
        let totalArmazenagem = 0;
        let totalCustosLogisticos = 0;
        let custoTotalItens = 0;

        currentDetalhes.forEach(detalhe => {
            if (!detalhe.tabelaPrecoItemId) return;
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (itemPreco) {
                // Special handling for non-template shipping items
                // Use getCostCategoryGroup for consistent category matching
                const group = getCostCategoryGroup(itemPreco.categoria);
                const isShippingItem = group === 'envio';
                const isTemplate = isTemplateItem(itemPreco);
                const isNonTemplateShipping = isShippingItem && !isTemplate;
                
                let precoVendaCalculado: number;
                let quantidadeUsada: number;
                
                if (isNonTemplateShipping) {
                    // For non-template shipping: quantity = 1, price = value from CSV (stored in quantidade)
                    quantidadeUsada = 1;
                    precoVendaCalculado = detalhe.quantidade; // Use stored CSV value as price
                } else {
                    // Use calculatePrecoVendaForDisplay to handle templates of specific costs correctly
                    precoVendaCalculado = calculatePrecoVendaForDisplay(itemPreco);
                    quantidadeUsada = detalhe.quantidade;
                }
                
                const subtotalVenda = precoVendaCalculado * quantidadeUsada;

                // FIX: Correctly calculate cost for pass-through items vs standard items.
                const isPassThrough = isTemplateItem(itemPreco);
                const subtotalCusto = isPassThrough ? detalhe.quantidade : (isNonTemplateShipping ? detalhe.quantidade : itemPreco.custoUnitario * detalhe.quantidade);
                custoTotalItens += subtotalCusto;

                // Use already calculated 'group' variable for categorization
                if (group === 'armazenagem') {
                    totalArmazenagem += subtotalVenda;
                } else if (group === 'envio') {
                    totalEnvio += subtotalVenda;
                } else {
                    totalCustosLogisticos += subtotalVenda;
                }
            }
        });

        const totalCustosAdicionais = currentCustosAdicionais.reduce((sum, custo) => sum + custo.valor, 0);
        const totalCustosExtras = initialCobranca.totalCustosExtras || 0;
        
        // Assume 0 margin for additional/extra costs
        const custoTotal = custoTotalItens + totalCustosAdicionais + totalCustosExtras;
        const valorTotal = totalEnvio + totalArmazenagem + totalCustosLogisticos + totalCustosAdicionais + totalCustosExtras;
        
        setCobranca(prev => ({ ...prev, totalEnvio, totalArmazenagem, totalCustosLogisticos, totalCustosAdicionais, totalCustosExtras, valorTotal, custoTotal }));
    };

    React.useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            Promise.all([
                getDetalhesByCobrancaId(initialCobranca.id),
                getCustosAdicionaisByCobrancaId(initialCobranca.id)
            ]).then(([detalhesData, custosData]) => {
                setDetalhes(detalhesData);
                setCustosAdicionais(custosData);
            }).finally(() => setIsLoading(false));
            setCobranca(initialCobranca);
        }
    }, [isOpen, initialCobranca]);

    const handleDetalheChange = (detalheId: string, field: keyof DetalheEnvio, value: any) => {
        const newDetalhes = detalhes.map(d => {
            if (d.id === detalheId) {
                const updatedValue = field === 'quantidade' ? parseFloat(value) || 0 : value;
                return { ...d, [field]: updatedValue };
            }
            return d;
        });
        setDetalhes(newDetalhes);
        recalculateTotals(newDetalhes, custosAdicionais);
    };

    const handleDeleteDetalhe = (detalheId: string) => {
        const newDetalhes = detalhes.filter(d => d.id !== detalheId);
        setDetalhes(newDetalhes);
        recalculateTotals(newDetalhes, custosAdicionais);
    };

    const handleAddDetalhe = () => {
        const newItem: DetalheEnvio = {
            id: `new_${Date.now()}`,
            cobrancaId: cobranca.id,
            data: new Date().toISOString().split('T')[0],
            rastreio: '',
            codigoPedido: '',
            tabelaPrecoItemId: null,
            quantidade: 1,
        };
        const newDetalhes = [...detalhes, newItem];
        setDetalhes(newDetalhes);
        recalculateTotals(newDetalhes, custosAdicionais);
    };
    
    const handleCustoAdicionalChange = (id: string, field: keyof CustoAdicional, value: any) => {
        const newCustos = custosAdicionais.map(c => {
            if (c.id === id) {
                const updatedValue = field === 'valor' ? parseFloat(value) || 0 : value;
                return { ...c, [field]: updatedValue };
            }
            return c;
        });
        setCustosAdicionais(newCustos);
        recalculateTotals(detalhes, newCustos);
    };

    const handleAddCustoAdicional = () => {
        const newCusto: CustoAdicional = {
            id: `new_custo_${Date.now()}`,
            descricao: '',
            valor: 0,
            categoria: 'Outro'
        };
        const newCustos = [...custosAdicionais, newCusto];
        setCustosAdicionais(newCustos);
        recalculateTotals(detalhes, newCustos);
    };

    const handleDeleteCustoAdicional = (id: string) => {
        const newCustos = custosAdicionais.filter(c => c.id !== id);
        setCustosAdicionais(newCustos);
        recalculateTotals(detalhes, newCustos);
    };

    const handleUploadNotaFiscal = async () => {
        if (!notaFiscalFile) {
            addToast('Selecione um arquivo de nota fiscal.', 'error');
            return;
        }

        setIsUploadingNotaFiscal(true);
        try {
            const path = `notas-fiscais/${cobranca.clienteId}/${cobranca.id}/${Date.now()}_${notaFiscalFile.name}`;
            const url = await uploadFileToStorage(notaFiscalFile, path);
            await updateCobrancaWithNotaFiscal(cobranca.id, url, notaFiscalFile.name);
            setCobranca(prev => ({ ...prev, notaFiscalUrl: url, notaFiscalFileName: notaFiscalFile.name }));
            setNotaFiscalFile(null);
            addToast('Nota fiscal anexada com sucesso!', 'success');
        } catch (error) {
            console.error("Failed to upload nota fiscal:", error);
            addToast('Erro ao anexar nota fiscal.', 'error');
        } finally {
            setIsUploadingNotaFiscal(false);
        }
    };

    const handleRemoveNotaFiscal = async () => {
        if (!cobranca.notaFiscalUrl) return;

        if (!confirm('Tem certeza que deseja remover a nota fiscal?')) return;

        try {
            await deleteFileFromStorage(cobranca.notaFiscalUrl);
            setCobranca(prev => ({ ...prev, notaFiscalUrl: undefined, notaFiscalFileName: undefined }));
            addToast('Nota fiscal removida com sucesso!', 'success');
        } catch (error) {
            console.error("Failed to remove nota fiscal:", error);
            addToast('Erro ao remover nota fiscal.', 'error');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        await onSave(cobranca, detalhes, custosAdicionais);
        setIsSaving(false);
    }
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-semibold text-gray-800">Editar Fatura: {cliente?.nome} - {cobranca.mesReferencia}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>
                <main className="flex-1 p-4 overflow-y-auto">
                    {isLoading ? <p>Carregando detalhes...</p> : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 p-4 border rounded-lg bg-gray-50">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Data de Vencimento</label>
                                    <FormInput type="date" value={cobranca.dataVencimento} onChange={e => setCobranca(p => ({...p, dataVencimento: e.target.value}))} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Status</label>
                                    <FormSelect value={cobranca.status} onChange={e => setCobranca(p => ({...p, status: e.target.value as CobrancaMensal['status']}))}>
                                        <option value="Pendente">Pendente</option>
                                        <option value="Enviada">Enviada</option>
                                        <option value="Paga">Paga</option>
                                        <option value="Vencido">Vencido</option>
                                    </FormSelect>
                                </div>
                                <div className="sm:col-span-3">
                                    <label className="block text-sm font-medium text-gray-700">URL Planilha Conferência (Opcional)</label>
                                    <FormInput type="url" value={cobranca.urlPlanilhaConferencia || ''} onChange={e => setCobranca(p => ({...p, urlPlanilhaConferencia: e.target.value}))} placeholder="https://docs.google.com/spreadsheets/..." />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-6">
                                <div className="bg-gray-100 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600">Total Envios</p>
                                    <p className="text-xl font-bold">{formatCurrency(cobranca.totalEnvio)}</p>
                                    {cobranca.quantidadeEnvios !== undefined && cobranca.quantidadeEnvios > 0 && (
                                        <p className="text-xs text-gray-500 mt-1">{cobranca.quantidadeEnvios} envio(s)</p>
                                    )}
                                </div>
                                <div className="bg-gray-100 p-4 rounded-lg"><p className="text-sm text-gray-600">Total Logística</p><p className="text-xl font-bold">{formatCurrency(cobranca.totalCustosLogisticos)}</p></div>
                                <div className="bg-gray-100 p-4 rounded-lg"><p className="text-sm text-gray-600">Total Armazenagem</p><p className="text-xl font-bold">{formatCurrency(cobranca.totalArmazenagem)}</p></div>
                                <div className="bg-gray-100 p-4 rounded-lg"><p className="text-sm text-gray-600">Custos Adicionais</p><p className="text-xl font-bold">{formatCurrency(cobranca.totalCustosAdicionais || 0)}</p></div>
                                <div className="bg-blue-100 p-4 rounded-lg border border-blue-200"><p className="text-sm text-blue-700">Valor Total</p><p className="text-xl font-bold text-blue-800">{formatCurrency(cobranca.valorTotal)}</p></div>
                            </div>
                            <div className="overflow-x-auto">
                                <h4 className="font-semibold text-gray-700 mb-2">Itens da Tabela de Preços</h4>
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rastreio / Pedido</th>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serviço</th>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qtd.</th>
                                            <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                                            <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {detalhes.map(d => {
                                            const itemPreco = tabelaPrecos.find(c => c.id === d.tabelaPrecoItemId);
                                            // Special handling for non-template shipping items
                                            let subtotal = 0;
                                            if (itemPreco) {
                                                const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
                                                const isTemplate = isTemplateItem(itemPreco);
                                                const isNonTemplateShipping = isShippingItem && !isTemplate;
                                                
                                                if (isNonTemplateShipping) {
                                                    // For non-template shipping: quantity = 1, price = value from CSV (stored in quantidade)
                                                    subtotal = d.quantidade * 1; // quantidade stores CSV value, use as price, qty = 1
                                                } else {
                                                    // Use calculatePrecoVendaForDisplay to handle templates of specific costs correctly
                                                    subtotal = calculatePrecoVendaForDisplay(itemPreco) * d.quantidade;
                                                }
                                            }
                                            return (
                                                <tr key={d.id} className={!d.tabelaPrecoItemId ? 'bg-yellow-50' : ''}>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm"><FormInput type="text" value={d.rastreio} onChange={(e) => handleDetalheChange(d.id, 'rastreio', e.target.value)} placeholder="Rastreio/Info" className="w-40 text-xs p-1" /></td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm"><FormSelect onChange={(e) => handleDetalheChange(d.id, 'tabelaPrecoItemId', e.target.value)} className={`w-full text-xs p-1 ${!d.tabelaPrecoItemId ? 'border-yellow-400' : ''}`} value={d.tabelaPrecoItemId || ""}><option value="" disabled>Selecione um serviço...</option>{tabelaPrecos.map(c => <option key={c.id} value={c.id}>{`${c.subcategoria} - ${c.descricao}`}</option>)}</FormSelect></td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm"><FormInput type="number" value={d.quantidade} onChange={(e) => handleDetalheChange(d.id, 'quantidade', e.target.value)} className="w-20 text-xs p-1 text-right" step="0.01"/></td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-800 font-semibold text-right">{formatCurrency(subtotal)}</td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm text-center">
                                                        <button type="button" onClick={() => handleDeleteDetalhe(d.id)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg></button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                                <button type="button" onClick={handleAddDetalhe} className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-md transition-colors flex items-center space-x-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    <span>Adicionar Item da Tabela</span>
                                </button>
                            </div>
                            <div className="mt-6 pt-6 border-t">
                                <h4 className="font-semibold text-gray-700 mb-2">Custos Adicionais / Manuais</h4>
                                 <div className="space-y-2">
                                    {custosAdicionais.map((custo) => (
                                        <div key={custo.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                                            <FormInput type="text" value={custo.descricao} onChange={(e) => handleCustoAdicionalChange(custo.id, 'descricao', e.target.value)} placeholder="Descrição do Custo" className="flex-grow text-sm"/>
                                            <FormSelect
                                                value={custo.categoria || 'Outro'}
                                                onChange={(e) => handleCustoAdicionalChange(custo.id, 'categoria', e.target.value)}
                                                className="w-40 text-sm"
                                            >
                                                {manualCostCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                            </FormSelect>
                                            <FormInput type="number" value={custo.valor} onChange={(e) => handleCustoAdicionalChange(custo.id, 'valor', e.target.value)} placeholder="Valor (R$)" className="w-32 text-sm text-right" step="0.01"/>
                                            <button type="button" onClick={() => handleDeleteCustoAdicional(custo.id)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg></button>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" onClick={handleAddCustoAdicional} className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-md transition-colors flex items-center space-x-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    <span>Adicionar Custo Adicional</span>
                                </button>
                            </div>
                            <div className="mt-6 pt-6 border-t">
                                <h4 className="font-semibold text-gray-700 mb-4">Documentos e Pagamento</h4>
                                <div className="space-y-4">
                                    <div>
                                        <FileUpload
                                            id="nota-fiscal-edit"
                                            label="Nota Fiscal"
                                            accept="application/pdf,image/*"
                                            maxSizeMB={10}
                                            onFileSelect={setNotaFiscalFile}
                                            file={notaFiscalFile}
                                            isUploading={isUploadingNotaFiscal}
                                        />
                                        {cobranca.notaFiscalUrl && (
                                            <div className="mt-2 p-3 bg-green-50 rounded-md flex items-center justify-between">
                                                <div className="flex items-center space-x-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{cobranca.notaFiscalFileName || 'Nota fiscal anexada'}</p>
                                                        <a href={cobranca.notaFiscalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800">Ver arquivo</a>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleRemoveNotaFiscal}
                                                    className="text-red-600 hover:text-red-800 text-sm"
                                                >
                                                    Remover
                                                </button>
                                            </div>
                                        )}
                                        {notaFiscalFile && (
                                            <button
                                                type="button"
                                                onClick={handleUploadNotaFiscal}
                                                disabled={isUploadingNotaFiscal}
                                                className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                                            >
                                                {isUploadingNotaFiscal ? 'Enviando...' : 'Anexar Nota Fiscal'}
                                            </button>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Link de Pagamento (Opcional)</label>
                                        <FormInput
                                            type="url"
                                            value={cobranca.urlLinkPagamento || ''}
                                            onChange={e => setCobranca(p => ({...p, urlLinkPagamento: e.target.value}))}
                                            placeholder="https://..."
                                        />
                                        <p className="mt-1 text-xs text-gray-500">URL para página de pagamento ou boleto</p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </main>
                <footer className="flex justify-end space-x-3 bg-gray-50 p-4 border-t">
                    <button type="button" onClick={onClose} disabled={isSaving} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 font-medium">Cancelar</button>
                    <button type="button" onClick={handleSave} disabled={isSaving || isLoading} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-medium disabled:bg-green-300">
                        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </footer>
            </div>
        </div>
    );
}

// --- Local Confirmation Modal Component ---
const ConfirmDeleteModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isDeleting: boolean;
    cobranca: CobrancaMensal | null;
    clienteNome: string | undefined;
}> = ({ isOpen, onClose, onConfirm, isDeleting, cobranca, clienteNome }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-6 text-center">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                        <svg className="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-lg mt-3 font-medium text-gray-900">Confirmar Exclusão</h3>
                    <p className="mt-2 text-sm text-gray-500">
                        Tem certeza que deseja excluir a fatura de <strong>{cobranca?.mesReferencia}</strong> para o cliente <strong>{clienteNome}</strong>? Esta ação é permanente.
                    </p>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 flex flex-row-reverse rounded-b-lg">
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 sm:ml-3 disabled:bg-red-300"
                    >
                        {isDeleting ? 'Excluindo...' : 'Excluir'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isDeleting}
                        className="w-full sm:w-auto mt-3 sm:mt-0 inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Main View Component ---
interface BillingArchiveViewProps {
    cobrancas: CobrancaMensal[];
    clientes: Cliente[];
    tabelaPrecos: TabelaPrecoItem[];
    onUpdate: () => void;
}

const BillingArchiveView: React.FC<BillingArchiveViewProps> = ({ cobrancas, clientes, tabelaPrecos, onUpdate }) => {
    const [editingCobranca, setEditingCobranca] = useState<CobrancaMensal | null>(null);
    const [cobrancaToDelete, setCobrancaToDelete] = useState<CobrancaMensal | null>(null);
    const [isConfirmDeleteModalOpen, setIsConfirmDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [filters, setFilters] = useState({ clientId: 'all', month: 'all' });
    const { addToast } = useToast();
    
    const monthMap: { [key: string]: number } = { 'janeiro': 0, 'fevereiro': 1, 'março': 2, 'abril': 3, 'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11 };

    const sortedCobrancas = useMemo(() => 
        cobrancas.sort((a, b) => new Date(b.dataVencimento).getTime() - new Date(a.dataVencimento).getTime()), 
    [cobrancas]);

    const availableMonths = useMemo(() =>
        [...new Set(cobrancas.map(c => c.mesReferencia).filter(Boolean))]
        .sort((a: string, b: string) => {
            try {
                const [mesA, anoA] = a.split('/');
                const [mesB, anoB] = b.split('/');
                const monthIndexA = monthMap[mesA.toLowerCase()];
                const monthIndexB = monthMap[mesB.toLowerCase()];

                if (monthIndexA === undefined || monthIndexB === undefined) {
                    return a.localeCompare(b);
                }

                const dateA = new Date(parseInt(anoA), monthIndexA, 1);
                const dateB = new Date(parseInt(anoB), monthIndexB, 1);
                
                if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                    return a.localeCompare(b);
                }

                return dateB.getTime() - dateA.getTime();
            } catch (e) {
                console.error(`Error sorting month strings "${a}" and "${b}":`, e);
                return a.localeCompare(b);
            }
        }),
    [cobrancas]);

    const filteredCobrancas = useMemo(() => {
        return sortedCobrancas.filter(c => {
            const clientMatch = filters.clientId === 'all' || c.clienteId === filters.clientId;
            const monthMatch = filters.month === 'all' || c.mesReferencia === filters.month;
            return clientMatch && monthMatch;
        });
    }, [sortedCobrancas, filters]);

    const handleEdit = (cobranca: CobrancaMensal) => {
        setEditingCobranca(cobranca);
    };

    const handleSaveEdit = async (cobranca: CobrancaMensal, detalhes: DetalheEnvio[], custosAdicionais: CustoAdicional[]) => {
        try {
            await salvarCobrancaEditada(cobranca, detalhes, custosAdicionais);
            addToast('Fatura atualizada com sucesso!', 'success');
            onUpdate();
            setEditingCobranca(null);
        } catch (error) {
            console.error("Failed to save edited invoice:", error);
            addToast(`Erro ao salvar: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
    };

    const handleStatusChange = async (cobrancaId: string, newStatus: CobrancaMensal['status']) => {
        try {
            await updateCobrancaStatus(cobrancaId, newStatus);
            addToast('Status da fatura atualizado.', 'success');
            onUpdate();
        } catch (error) {
            console.error('Failed to update status:', error);
            addToast('Erro ao atualizar status.', 'error');
        }
    };
    
    const handleDeleteClick = (cobranca: CobrancaMensal) => {
        setCobrancaToDelete(cobranca);
        setIsConfirmDeleteModalOpen(true);
    };
    
     const handleCopyLink = (url: string) => {
        navigator.clipboard.writeText(url).then(() => {
            addToast('Link copiado para a área de transferência!', 'success');
        }, (err) => {
            addToast('Falha ao copiar o link.', 'error');
            console.error('Could not copy text: ', err);
        });
    };

    const handleConfirmDelete = async () => {
        if (!cobrancaToDelete) return;
        setIsDeleting(true);
        try {
            await deleteCobranca(cobrancaToDelete.id);
            addToast('Fatura excluída com sucesso!', 'success');
            onUpdate();
        } catch (error) {
            console.error("Failed to delete invoice:", error);
            addToast(`Erro ao excluir: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setIsConfirmDeleteModalOpen(false);
            setCobrancaToDelete(null);
            setIsDeleting(false);
        }
    };

    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

    const statusStyles: Record<CobrancaMensal['status'], { selectBg: string }> = {
        'Paga': { selectBg: 'bg-green-100' },
        'Pendente': { selectBg: 'bg-yellow-100' },
        'Vencido': { selectBg: 'bg-red-100' },
        'Enviada': { selectBg: 'bg-blue-100' },
    };


    return (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <h3 className="text-2xl font-bold text-gray-900">Arquivo de Cobranças</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormSelect value={filters.clientId} onChange={e => setFilters(f => ({...f, clientId: e.target.value}))}>
                    <option value="all">Todos os Clientes</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </FormSelect>
                <FormSelect value={filters.month} onChange={e => setFilters(f => ({...f, month: e.target.value}))}>
                    <option value="all">Todos os Meses</option>
                    {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </FormSelect>
            </div>
             <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mês/Ano</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Link</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredCobrancas.map(c => {
                            const cliente = clientes.find(cli => cli.id === c.clienteId);
                            return (
                                <tr key={c.id}>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cliente?.nome || 'N/A'}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{c.mesReferencia}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold text-right">{formatCurrency(c.valorTotal)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-center">
                                         <FormSelect 
                                            value={c.status} 
                                            onChange={(e) => handleStatusChange(c.id, e.target.value as CobrancaMensal['status'])}
                                            className={`text-xs p-1 rounded-md border-gray-300 focus:ring-blue-500 focus:border-blue-500 font-medium ${statusStyles[c.status].selectBg}`}
                                        >
                                            <option value="Pendente">Pendente</option>
                                            <option value="Enviada">Enviada</option>
                                            <option value="Paga">Paga</option>
                                            <option value="Vencido">Vencido</option>
                                        </FormSelect>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-center">
                                        {(() => {
                                            // Generate link dynamically if not saved in database
                                            const shareLink = c.urlCompartilhamento || getShareableUrl(c.clienteId, c.id);
                                            return (
                                                <button onClick={() => handleCopyLink(shareLink)} className="text-blue-600 hover:text-blue-800 p-1.5 rounded-md hover:bg-blue-50 transition-colors" title="Copiar link de compartilhamento">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M8 4a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" /><path d="M6 3a2 2 0 012-2h4a2 2 0 012 2v2a2 2 0 01-2 2H8a2 2 0 01-2-2V3z" /><path d="M9 9a1 1 0 00-1 1v6a1 1 0 102 0v-6a1 1 0 00-1-1z" /><path d="M9 7a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" /></svg>
                                                </button>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-right space-x-2">
                                        <span className="text-gray-500">{formatDate(c.dataVencimento)}</span>
                                        <button onClick={() => handleEdit(c)} className="text-indigo-600 hover:text-indigo-900">Editar</button>
                                        <button onClick={() => handleDeleteClick(c)} className="text-red-600 hover:text-red-900">Excluir</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {editingCobranca && (
                <EditInvoiceModal
                    isOpen={!!editingCobranca}
                    onClose={() => setEditingCobranca(null)}
                    onSave={handleSaveEdit}
                    cobranca={editingCobranca}
                    cliente={clientes.find(c => c.id === editingCobranca.clienteId)}
                    tabelaPrecos={tabelaPrecos}
                />
            )}
            
            <ConfirmDeleteModal 
                isOpen={isConfirmDeleteModalOpen}
                onClose={() => setIsConfirmDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
                cobranca={cobrancaToDelete}
                clienteNome={clientes.find(c => c.id === cobrancaToDelete?.clienteId)?.nome}
            />
        </div>
    );
};

export default BillingArchiveView;