import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
    processarFatura,
    salvarCobrancaProcessada,
    runAIBillingAnalysis,
    calculatePrecoVenda,
    calculatePrecoVendaForDisplay,
    isTemplateItem,
// FIX: Corrected import path
} from '../../../services/firestoreService';
import type { TabelaPrecoItem, CobrancaMensal, DetalheEnvio, Cliente, AIAnalysis, CustoAdicional } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { FileInput } from '../../ui/FileInput';
import { FormInput, FormSelect } from '../../ui/FormControls';
import { MonthPicker } from '../../ui/MonthPicker';
import { AIAnalysisModal } from './AIAnalysisModal';

interface InvoiceGenerationViewProps {
    clientes: Cliente[];
    tabelaPrecos: TabelaPrecoItem[];
    onUpdate: () => void;
}

const InvoiceGenerationView: React.FC<InvoiceGenerationViewProps> = ({ clientes, tabelaPrecos, onUpdate }) => {
    const [clientId, setClientId] = useState<string>(clientes[0]?.id || '');
    const [month, setMonth] = useState<string>('Outubro/2025');
    const [storageStartDate, setStorageStartDate] = useState<string>('');
    const [trackReportFile, setTrackReportFile] = useState<File | null>(null);
    const [orderDetailFile, setOrderDetailFile] = useState<File | null>(null);
    const [trackReportFileContent, setTrackReportFileContent] = useState<string>('');
    const [orderDetailFileContent, setOrderDetailFileContent] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const { addToast } = useToast();
    
    // UI/Stage states
    const [generationStage, setGenerationStage] = useState<'setup' | 'edit'>('setup');
    const [savedInvoiceForModal, setSavedInvoiceForModal] = useState<CobrancaMensal | null>(null);

    // Draft states
    const [draftCobranca, setDraftCobranca] = useState<CobrancaMensal | null>(null);
    const [draftDetalhes, setDraftDetalhes] = useState<DetalheEnvio[]>([]);
    const [draftCustosAdicionais, setDraftCustosAdicionais] = useState<CustoAdicional[]>([]);
    const [detectedDateRange, setDetectedDateRange] = useState<string>('');
    
    // AI Modal states
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [analysisStep, setAnalysisStep] = useState<'analyzing' | 'review'>('analyzing');
    const [analysisData, setAnalysisData] = useState<AIAnalysis | null>(null);

    // State for view toggle in preview
    const [viewMode, setViewMode] = useState<'categorized' | 'table'>('categorized');
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

    const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
    const monthPickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (monthPickerRef.current && !monthPickerRef.current.contains(event.target as Node)) {
                setIsMonthPickerOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [monthPickerRef]);

    const monthMap: { [key: string]: number } = { 'janeiro': 0, 'fevereiro': 1, 'março': 2, 'abril': 3, 'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11 };

    const selectedClient = useMemo(() => clientes.find(c => c.id === clientId), [clientes, clientId]);
    const isClientEmailMissing = !selectedClient?.email && !selectedClient?.emailFaturamento;
    const canProcess = !isProcessing && !isAiProcessing && !!trackReportFileContent && !!orderDetailFileContent && !isClientEmailMissing;


    useEffect(() => {
        const [mesNome, ano] = month.toLowerCase().split('/');
        const mesNumero = monthMap[mesNome];
        if (mesNumero !== undefined && ano) {
            const firstDay = new Date(parseInt(ano), mesNumero, 1);
            setStorageStartDate(firstDay.toISOString().split('T')[0]);
        }
    }, [month]);
    
    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    // Filter out template items for display (but keep them in calculations)
    const filteredDraftDetalhes = useMemo(() => {
        return draftDetalhes.filter(detalhe => {
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (!itemPreco) return true; // Keep items without price table match
            return !isTemplateItem(itemPreco); // Filter out templates
        });
    }, [draftDetalhes, tabelaPrecos]);

    // Group draft details by order code and then by category (using filtered details)
    const groupedByOrder = useMemo(() => {
        const grouped: Record<string, Record<string, DetalheEnvio[]>> = {};
        
        filteredDraftDetalhes.forEach(detalhe => {
            const orderCode = detalhe.codigoPedido || 'Sem Pedido';
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            const category = itemPreco?.categoria || 'Outros';
            
            if (!grouped[orderCode]) {
                grouped[orderCode] = {};
            }
            if (!grouped[orderCode][category]) {
                grouped[orderCode][category] = [];
            }
            grouped[orderCode][category].push(detalhe);
        });
        
        return grouped;
    }, [filteredDraftDetalhes, tabelaPrecos]);

    // Group shipping costs by state/region
    const shippingByState = useMemo(() => {
        const byState: Record<string, { detalhes: DetalheEnvio[], total: number }> = {};
        
        filteredDraftDetalhes.forEach(detalhe => {
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (!itemPreco) return;
            
            const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
            if (!isShippingItem) return;
            
            const estado = detalhe.estado || 'Não informado';
            if (!byState[estado]) {
                byState[estado] = { detalhes: [], total: 0 };
            }
            
            byState[estado].detalhes.push(detalhe);
            
            const isTemplate = isTemplateItem(itemPreco);
            const isNonTemplateShipping = isShippingItem && !isTemplate;
            
            let subtotal = 0;
            if (isNonTemplateShipping) {
                subtotal = detalhe.quantidade * 1;
            } else {
                subtotal = calculatePrecoVendaForDisplay(itemPreco) * detalhe.quantidade;
            }
            
            byState[estado].total += subtotal;
        });
        
        return byState;
    }, [filteredDraftDetalhes, tabelaPrecos]);

    // Calculate totals for each order
    const orderTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        
        Object.entries(groupedByOrder).forEach(([orderCode, categories]) => {
            let orderTotal = 0;
            Object.values(categories).flat().forEach(detalhe => {
                const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
                if (!itemPreco) return;
                
                const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
                const isTemplate = isTemplateItem(itemPreco);
                const isNonTemplateShipping = isShippingItem && !isTemplate;
                
                let subtotal = 0;
                if (isNonTemplateShipping) {
                    subtotal = detalhe.quantidade * 1;
                } else {
                    // Use calculatePrecoVendaForDisplay to handle templates of specific costs correctly
                    subtotal = calculatePrecoVendaForDisplay(itemPreco) * detalhe.quantidade;
                }
                
                orderTotal += subtotal;
            });
            totals[orderCode] = orderTotal;
        });
        
        return totals;
    }, [groupedByOrder, tabelaPrecos]);

    const toggleOrder = (orderCode: string) => {
        setExpandedOrders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(orderCode)) {
                newSet.delete(orderCode);
            } else {
                newSet.add(orderCode);
            }
            return newSet;
        });
    };

    // Expand all orders by default
    React.useEffect(() => {
        const allOrderCodes = Object.keys(groupedByOrder);
        setExpandedOrders(new Set(allOrderCodes));
    }, [groupedByOrder]);

    const recalculateDraftTotals = (detalhes: DetalheEnvio[], custosAdicionais: CustoAdicional[]): Omit<CobrancaMensal, 'id' | 'clienteId' | 'mesReferencia' | 'dataVencimento' | 'status'> => {
        let totalEnvio = 0;
        let totalArmazenagem = 0;
        let totalCustosLogisticos = 0;
        let custoTotalItens = 0; // Renamed to avoid confusion
        
        const envioCats = ['Envios', 'Retornos'];

        detalhes.forEach(detalhe => {
            if (!detalhe.tabelaPrecoItemId) return;
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (itemPreco) {
                // Special handling for non-template shipping items
                const isShippingItem = envioCats.includes(itemPreco.categoria);
                const isTemplate = itemPreco.precoVenda === 1 && 
                                  (itemPreco.descricao?.toLowerCase().includes('(template)') || 
                                   itemPreco.descricao?.toLowerCase().includes('template'));
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
                
                if (itemPreco.categoria === 'Armazenamento') {
                    totalArmazenagem += subtotalVenda;
                } else if (envioCats.includes(itemPreco.categoria)) {
                    totalEnvio += subtotalVenda;
                } else {
                    totalCustosLogisticos += subtotalVenda;
                }
            }
        });
        
        const totalCustosAdicionais = custosAdicionais.reduce((sum, custo) => sum + custo.valor, 0);
        const totalCustosExtras = draftCobranca?.totalCustosExtras || 0;

        // Assume 0 margin for additional/extra costs, so their cost is equal to their value. This ensures profit is calculated correctly.
        const custoTotal = custoTotalItens + totalCustosAdicionais + totalCustosExtras;
        const valorTotal = totalEnvio + totalArmazenagem + totalCustosLogisticos + totalCustosExtras + totalCustosAdicionais;
        
        return { totalEnvio, totalArmazenagem, totalCustosLogisticos, totalCustosAdicionais, totalCustosExtras, valorTotal, custoTotal };
    };

    const handleProcess = async () => {
        if (!clientId || !month || !storageStartDate || !trackReportFileContent || !orderDetailFileContent) {
            addToast('Por favor, preencha todos os campos e selecione ambos os arquivos CSV.', 'error');
            return;
        }
        setIsProcessing(true);
        try {
            const { cobranca, detalhes, detectedDateRange } = await processarFatura(clientId, month, storageStartDate, clientes, trackReportFileContent, orderDetailFileContent);
            setDraftCobranca(cobranca);
            setDraftDetalhes(detalhes);
            setDraftCustosAdicionais([]);
            setDetectedDateRange(detectedDateRange);
            setGenerationStage('edit');
            addToast('Arquivos processados. Revise a fatura antes de salvar.', 'info');
        } catch(error) {
            console.error("Failed to process invoice:", error);
            addToast(`Erro ao processar fatura: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleProcessWithAI = async () => {
         if (!canProcess) {
            addToast('Por favor, preencha todos os campos e selecione ambos os arquivos CSV.', 'error');
            return;
        }
        setIsAiProcessing(true);
        setIsAnalysisModalOpen(true);
        setAnalysisStep('analyzing');
        setAnalysisData(null);

        try {
            const result = await runAIBillingAnalysis(clientId, month, clientes, trackReportFileContent, orderDetailFileContent);
            setAnalysisData(result);
            setAnalysisStep('review');
        } catch(error) {
            console.error("Failed to process invoice with AI:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
             setAnalysisData({
                summary: "Ocorreu um erro durante a análise.",
                error: `Erro ao processar com IA: ${errorMessage}`,
                trackReportRows: 0, orderDetailRows: 0, clientOrdersFound: 0, unmatchedTrackOrderIds: [], unmatchedDetailOrderIds: [], totalValueFromMatchedOrders: 0
            });
            setAnalysisStep('review');
            setIsAiProcessing(false);
        }
    };

    const handleConfirmAIInvoice = async () => {
        if (!analysisData || analysisData.clientOrdersFound === 0) {
            addToast('A análise da IA não encontrou pedidos correspondentes. Nenhuma fatura será gerada.', 'info');
            closeAnalysisModal();
            return;
        }
    
        setIsAiProcessing(true); // Keep spinner active while saving
    
        try {
            // Re-run the deterministic manual process to ensure financial accuracy
            const { cobranca, detalhes } = await processarFatura(
                clientId,
                month,
                storageStartDate,
                clientes,
                trackReportFileContent,
                orderDetailFileContent
            );

            // Save the reliable, programmatically generated invoice
            const savedInvoice = await salvarCobrancaProcessada(cobranca, detalhes, [], trackReportFileContent, orderDetailFileContent);
            
            setSavedInvoiceForModal(savedInvoice);
            closeAnalysisModal();
        } catch (error) {
            console.error("Failed to process and save AI-confirmed invoice:", error);
            addToast(`Erro ao gerar a fatura final: ${error instanceof Error ? error.message : String(error)}`, 'error');
            setIsAiProcessing(false); // Ensure spinner stops on error
        }
    };

     const closeAnalysisModal = () => {
        setIsAnalysisModalOpen(false);
        setIsAiProcessing(false);
        setAnalysisData(null);
    };

    const handleCreateManualDraft = () => {
        if (!clientId || !month) {
            addToast('Por favor, selecione um cliente e um mês de referência.', 'error');
            return;
        }
        const today = new Date();
        const dueDate = new Date();
        dueDate.setDate(today.getDate() + 15);

        const newCobranca: CobrancaMensal = {
            id: `draft_${Date.now()}`,
            clienteId: clientId,
            mesReferencia: month,
            dataVencimento: dueDate.toISOString().split('T')[0],
            status: 'Pendente',
            urlLinkPagamento: '',
            urlNotaFiscal: '',
            urlPlanilhaConferencia: '',
            valorTotal: 0,
            totalEnvio: 0,
            totalArmazenagem: 0,
            totalCustosLogisticos: 0,
            totalCustosAdicionais: 0,
            custoTotal: 0,
        };

        setDraftCobranca(newCobranca);
        setDraftDetalhes([]); // Ensure it starts with an empty list of details
        setDraftCustosAdicionais([]);
        setDetectedDateRange('');
        setGenerationStage('edit');
    };

    const handleCancel = () => {
        setDraftCobranca(null);
        setDraftDetalhes([]);
        setDraftCustosAdicionais([]);
        setTrackReportFile(null);
        setOrderDetailFile(null);
        setTrackReportFileContent('');
        setOrderDetailFileContent('');
        setDetectedDateRange('');
        setGenerationStage('setup');
    };
    
    const closeSuccessModalAndReset = () => {
        setSavedInvoiceForModal(null);
        handleCancel();
        onUpdate();
        setIsProcessing(false);
    };

    const handleSave = async () => {
        if (!draftCobranca || !draftDetalhes) return;
        setIsProcessing(true);
        try {
            const savedInvoice = await salvarCobrancaProcessada(draftCobranca, draftDetalhes, draftCustosAdicionais, trackReportFileContent, orderDetailFileContent);
            setSavedInvoiceForModal(savedInvoice);
            // Don't show toast here, modal is better UX
        } catch (error) {
            console.error("Failed to save invoice:", error);
            addToast(`Erro ao salvar a fatura: ${error instanceof Error ? error.message : String(error)}`, 'error');
            setIsProcessing(false); // only set here on error, success modal will handle it
        }
    };

    const handleDetalheChange = (detalheId: string, field: keyof DetalheEnvio, value: any) => {
        const newDetalhes = draftDetalhes.map(d => {
            if (d.id === detalheId) {
                const updatedValue = field === 'quantidade' ? parseFloat(value) || 0 : value;
                return { ...d, [field]: updatedValue };
            }
            return d;
        });
        setDraftDetalhes(newDetalhes);

        if (draftCobranca) {
            const updatedTotais = recalculateDraftTotals(newDetalhes, draftCustosAdicionais);
            setDraftCobranca(prev => prev ? { ...prev, ...updatedTotais } : null);
        }
    };

    const handleDeleteDetalhe = (detalheId: string) => {
        const newDetalhes = draftDetalhes.filter(d => d.id !== detalheId);
        setDraftDetalhes(newDetalhes);

        if (draftCobranca) {
            const updatedTotais = recalculateDraftTotals(newDetalhes, draftCustosAdicionais);
            setDraftCobranca(prev => prev ? { ...prev, ...updatedTotais } : null);
        }
    };

    const handleAddDetalhe = () => {
        if (!draftCobranca) return;
        const newItem: DetalheEnvio = {
            id: `draft_item_${Date.now()}`,
            cobrancaId: draftCobranca.id,
            data: new Date().toISOString().split('T')[0],
            rastreio: '',
            codigoPedido: '',
            tabelaPrecoItemId: null,
            quantidade: 1,
        };
        const newDetalhes = [...draftDetalhes, newItem];
        setDraftDetalhes(newDetalhes);
        const updatedTotais = recalculateDraftTotals(newDetalhes, draftCustosAdicionais);
        setDraftCobranca(prev => prev ? { ...prev, ...updatedTotais } : null);
    };
    
    const handleCustoAdicionalChange = (id: string, field: keyof CustoAdicional, value: any) => {
        const newCustos = draftCustosAdicionais.map(c => {
            if (c.id === id) {
                const updatedValue = field === 'valor' ? parseFloat(value) || 0 : value;
                return { ...c, [field]: updatedValue };
            }
            return c;
        });
        setDraftCustosAdicionais(newCustos);
        if (draftCobranca) {
            const updatedTotals = recalculateDraftTotals(draftDetalhes, newCustos);
            setDraftCobranca(prev => prev ? { ...prev, ...updatedTotals } : null);
        }
    };

    const handleAddCustoAdicional = () => {
        const newCusto: CustoAdicional = {
            id: `draft_custo_${Date.now()}`,
            descricao: '',
            valor: 0,
        };
        const newCustos = [...draftCustosAdicionais, newCusto];
        setDraftCustosAdicionais(newCustos);
        if (draftCobranca) {
            const updatedTotals = recalculateDraftTotals(draftDetalhes, newCustos);
            setDraftCobranca(prev => prev ? { ...prev, ...updatedTotals } : null);
        }
    };

    const handleDeleteCustoAdicional = (id: string) => {
        const newCustos = draftCustosAdicionais.filter(c => c.id !== id);
        setDraftCustosAdicionais(newCustos);
        if (draftCobranca) {
            const updatedTotals = recalculateDraftTotals(draftDetalhes, newCustos);
            setDraftCobranca(prev => prev ? { ...prev, ...updatedTotals } : null);
        }
    };

    const renderSetup = () => (
        <div className="p-4 border rounded-lg bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Cliente</label>
                    <FormSelect value={clientId} onChange={e => setClientId(e.target.value)}>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </FormSelect>
                     {isClientEmailMissing && (
                        <div className="mt-2 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 text-sm rounded-r-lg">
                            <p><strong>Atenção:</strong> Este cliente não possui um e-mail de login ou faturamento. Por favor, vá para a <strong>Gestão de Clientes</strong> para adicionar um e-mail.</p>
                        </div>
                    )}
                     {selectedClient && !isClientEmailMissing && (
                        <div className="mt-2 text-xs text-gray-600 bg-gray-100 p-2 rounded-md">
                            <p><b>Email de cobrança:</b> {selectedClient.emailFaturamento || `${selectedClient.email} (padrão)`}</p>
                            <p><b>SKUs Ativos:</b> {selectedClient.skusAtivos}</p>
                            <p><b>Unidades em Estoque:</b> {selectedClient.unidadesEmEstoque.toLocaleString('pt-BR')}</p>
                        </div>
                    )}
                </div>
                <div className="relative" ref={monthPickerRef}>
                    <label className="block text-sm font-medium text-gray-700">Mês de Referência</label>
                    <button
                        type="button"
                        onClick={() => setIsMonthPickerOpen(!isMonthPickerOpen)}
                        className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-left flex justify-between items-center focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition text-gray-900"
                    >
                        <span>{month}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                        </svg>
                    </button>
                    {isMonthPickerOpen && (
                        <MonthPicker
                            selectedMonth={month}
                            onSelectMonth={(newMonth) => {
                                setMonth(newMonth);
                                setIsMonthPickerOpen(false);
                            }}
                        />
                    )}
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Início da Cobrança de Armazenagem</label>
                    <FormInput type="date" value={storageStartDate} onChange={e => setStorageStartDate(e.target.value)} />
                </div>
                <div className="md:col-span-2 space-y-3">
                    <div className="bg-blue-50 border-l-4 border-blue-400 p-3 text-sm text-blue-800 rounded-r-lg">
                        <p>Para garantir a compatibilidade, use os arquivos modelo disponíveis na seção <strong>'Templates e Imports'</strong>.</p>
                    </div>
                    <FileInput id="track-report-file" label="Relatório de Rastreio (Track Report)" file={trackReportFile} onFileChange={setTrackReportFile} onFileRead={setTrackReportFileContent} />
                    <FileInput id="order-detail-file" label="Relatório de Custos (Order Detail)" file={orderDetailFile} onFileChange={setOrderDetailFile} onFileRead={setOrderDetailFileContent}/>
                </div>
            </div>
             <div className="md:col-span-2 pt-4 mt-4 border-t border-gray-200 space-y-4">
                <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-gray-300" />
                    </div>
                    <div className="relative flex justify-center">
                        <span className="bg-gray-50 px-2 text-sm text-gray-500">Opções de Geração</span>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <button 
                        onClick={handleProcess} 
                        disabled={!canProcess} 
                        className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-md hover:bg-blue-700 transition-colors shadow-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? 'Processando...' : 'Processar Arquivos'}
                    </button>
                    <button 
                        onClick={handleProcessWithAI}
                        disabled={!canProcess}
                        className="w-full bg-purple-600 text-white px-4 py-2.5 rounded-md hover:bg-purple-700 transition-colors shadow-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                        {isAiProcessing ? 'Analisando...' : 'Analisar com IA'}
                    </button>
                </div>
                 <div className="text-center">
                    <button 
                        onClick={handleCreateManualDraft} 
                        disabled={isProcessing || isAiProcessing}
                        className="text-sm font-medium text-gray-600 hover:text-blue-600 py-1"
                    >
                        ou, criar uma fatura manual do zero
                    </button>
                </div>
            </div>
        </div>
    );

    const renderSuccessModal = () => {
        if (!savedInvoiceForModal) return null;
        const clientName = clientes.find(c => c.id === savedInvoiceForModal.clienteId)?.nome;
        return (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg space-y-4">
                    <div className="flex items-start space-x-3">
                        <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                            <svg className="h-6 w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div>
                            <h4 className="text-xl font-semibold text-gray-900">Fatura Salva com Sucesso!</h4>
                            <p className="text-sm text-gray-500 mt-1">A fatura foi gerada e já está disponível na área do cliente.</p>
                        </div>
                    </div>
                    
                    <div className="space-y-3 pt-3 border-t">
                        <p><strong>Cliente:</strong> {clientName}</p>
                        <p><strong>Mês de Referência:</strong> {savedInvoiceForModal.mesReferencia}</p>
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mt-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-blue-800">Valor Total da Fatura</span>
                                <span className="text-xl font-bold text-blue-800">{formatCurrency(savedInvoiceForModal.valorTotal)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end pt-4">
                        <button onClick={closeSuccessModalAndReset} className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            OK
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderEdit = () => (
        <div className="mt-6 animate-fade-in">
            <div className="flex justify-between items-start">
                <h4 className="font-semibold text-lg mb-4 text-purple-800">Revisão da Fatura (Rascunho): {clientes.find(c => c.id === draftCobranca!.clienteId)?.nome} - {draftCobranca!.mesReferencia}</h4>
                {detectedDateRange && (
                     <p className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-md">
                        Período detectado: <span className="font-bold text-gray-800">{detectedDateRange}</span>
                    </p>
                )}
            </div>
            {/* FIX: Changed grid to 4 columns and added display for logistic costs for better consistency. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="bg-gray-100 p-4 rounded-lg"><p className="text-sm text-gray-600">Total Envios</p><p className="text-xl font-bold">{formatCurrency(draftCobranca!.totalEnvio)}</p></div>
                <div className="bg-gray-100 p-4 rounded-lg"><p className="text-sm text-gray-600">Total Logística</p><p className="text-xl font-bold">{formatCurrency(draftCobranca!.totalCustosLogisticos)}</p></div>
                <div className="bg-gray-100 p-4 rounded-lg"><p className="text-sm text-gray-600">Total Armazenagem</p><p className="text-xl font-bold">{formatCurrency(draftCobranca!.totalArmazenagem)}</p></div>
                 <div className="bg-gray-100 p-4 rounded-lg"><p className="text-sm text-gray-600">Custos Adicionais</p><p className="text-xl font-bold">{formatCurrency(draftCobranca!.totalCustosAdicionais || 0)}</p></div>
                <div className="bg-blue-100 p-4 rounded-lg border border-blue-200"><p className="text-sm text-blue-700">Valor Total</p><p className="text-xl font-bold text-blue-800">{formatCurrency(draftCobranca!.valorTotal)}</p></div>
            </div>
            
            {/* Shipping costs by state/region summary */}
            {Object.keys(shippingByState).length > 0 && (
                <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <h4 className="text-md font-semibold text-gray-700 mb-3">Custos de Envio por Estado/Região</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {Object.entries(shippingByState)
                            .sort(([, a], [, b]) => b.total - a.total)
                            .map(([estado, data]) => (
                                <div key={estado} className="bg-white p-3 rounded border border-gray-200">
                                    <p className="text-xs text-gray-500 uppercase">{estado}</p>
                                    <p className="text-sm font-bold text-gray-800">{formatCurrency(data.total)}</p>
                                    <p className="text-xs text-gray-400 mt-1">{data.detalhes.length} {data.detalhes.length === 1 ? 'envio' : 'envios'}</p>
                                </div>
                            ))}
                    </div>
                </div>
            )}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg bg-gray-50">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Data de Vencimento</label>
                    <FormInput type="date" value={draftCobranca!.dataVencimento} onChange={e => setDraftCobranca(p => p ? {...p, dataVencimento: e.target.value} : null)} />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <FormSelect value={draftCobranca!.status} onChange={e => setDraftCobranca(p => p ? {...p, status: e.target.value as CobrancaMensal['status']} : null)}>
                        <option value="Pendente">Pendente</option>
                        <option value="Enviada">Enviada</option>
                        <option value="Paga">Paga</option>
                        <option value="Vencido">Vencido</option>
                    </FormSelect>
                </div>
                 <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700">URL da Planilha de Conferência (Opcional)</label>
                    <FormInput type="url" value={draftCobranca!.urlPlanilhaConferencia || ''} onChange={e => setDraftCobranca(p => p ? {...p, urlPlanilhaConferencia: e.target.value} : null)} placeholder="https://docs.google.com/spreadsheets/..." />
                </div>
            </div>
            
            {/* View Toggle */}
            <div className="mb-4 flex items-center justify-between">
                <h4 className="text-md font-semibold text-gray-700">Detalhamento dos Itens</h4>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setViewMode('categorized')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                            viewMode === 'categorized'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        Por Pedido
                    </button>
                    <button
                        onClick={() => setViewMode('table')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                            viewMode === 'table'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        Tabela Simples
                    </button>
                </div>
            </div>

            {viewMode === 'categorized' ? (
                <div className="space-y-4">
                    {Object.entries(groupedByOrder).map(([orderCode, categories]) => {
                        const isExpanded = expandedOrders.has(orderCode);
                        const orderTotal = orderTotals[orderCode] || 0;
                        
                        return (
                            <div key={orderCode} className="border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => toggleOrder(orderCode)}
                                    className="w-full bg-gray-50 hover:bg-gray-100 px-4 py-3 flex items-center justify-between transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className={`h-5 w-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                        </svg>
                                        <div className="text-left">
                                            <span className="font-semibold text-gray-900">Pedido: {orderCode}</span>
                                            <span className="ml-2 text-sm text-gray-500">
                                                ({Object.keys(categories).length} {Object.keys(categories).length === 1 ? 'categoria' : 'categorias'})
                                            </span>
                                        </div>
                                    </div>
                                    <span className="font-bold text-gray-900">{formatCurrency(orderTotal)}</span>
                                </button>
                                
                                {isExpanded && (
                                    <div className="bg-white">
                                        {Object.entries(categories).map(([category, categoryDetails]) => {
                                            const categoryTotal = categoryDetails.reduce((sum, detalhe) => {
                                                const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
                                                if (!itemPreco) return sum;
                                                
                                                const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
                                                const isTemplate = itemPreco.precoVenda === 1 && 
                                                                  (itemPreco.descricao?.toLowerCase().includes('(template)') || 
                                                                   itemPreco.descricao?.toLowerCase().includes('template'));
                                                const isNonTemplateShipping = isShippingItem && !isTemplate;
                                                
                                                let subtotal = 0;
                                                if (isNonTemplateShipping) {
                                                    subtotal = detalhe.quantidade * 1;
                                                } else {
                                                    // Use calculatePrecoVendaForDisplay to handle templates of specific costs correctly
                                                    subtotal = calculatePrecoVendaForDisplay(itemPreco) * detalhe.quantidade;
                                                }
                                                
                                                return sum + subtotal;
                                            }, 0);
                                            
                                            return (
                                                <div key={category} className="border-t border-gray-100">
                                                    <div className="bg-gray-50 px-4 py-2 flex justify-between items-center">
                                                        <span className="font-medium text-gray-700">{category}</span>
                                                        <span className="text-sm font-semibold text-gray-800">{formatCurrency(categoryTotal)}</span>
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full divide-y divide-gray-200">
                                                            <thead className="bg-gray-50">
                                                                <tr>
                                                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rastreio</th>
                                                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Serviço</th>
                                                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qtd.</th>
                                                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                                                                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                                                                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white divide-y divide-gray-200">
                                                                {categoryDetails.map(d => {
                                                                    const itemPreco = tabelaPrecos.find(c => c.id === d.tabelaPrecoItemId);
                                                                    let subtotal = 0;
                                                                    if (itemPreco) {
                                                                        const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
                                                                        const isTemplate = itemPreco.precoVenda === 1 && 
                                                                                          (itemPreco.descricao?.toLowerCase().includes('(template)') || 
                                                                                           itemPreco.descricao?.toLowerCase().includes('template'));
                                                                        const isNonTemplateShipping = isShippingItem && !isTemplate;
                                                                        
                                                                        if (isNonTemplateShipping) {
                                                                            subtotal = d.quantidade * 1;
                                                                        } else {
                                                                            // Use calculatePrecoVendaForDisplay to handle templates of specific costs correctly
                                                                            subtotal = calculatePrecoVendaForDisplay(itemPreco) * d.quantidade;
                                                                        }
                                                                    }
                                                                    return (
                                                                        <tr key={d.id} className={!d.tabelaPrecoItemId ? 'bg-yellow-50' : ''}>
                                                                            <td className="px-2 py-2 whitespace-nowrap text-sm">
                                                                                <FormInput type="text" value={d.rastreio} onChange={(e) => handleDetalheChange(d.id, 'rastreio', e.target.value)} placeholder="Rastreio" className="w-32 text-xs p-1" />
                                                                            </td>
                                                                            <td className="px-2 py-2 whitespace-nowrap text-sm">
                                                                                <FormSelect onChange={(e) => handleDetalheChange(d.id, 'tabelaPrecoItemId', e.target.value)} className={`w-full text-xs p-1 ${!d.tabelaPrecoItemId ? 'border-yellow-400' : ''}`} value={d.tabelaPrecoItemId || ""}><option value="" disabled>Selecione um serviço...</option>{tabelaPrecos.map(c => <option key={c.id} value={c.id}>{`${c.subcategoria} - ${c.descricao}`}</option>)}</FormSelect>
                                                                            </td>
                                                                            <td className="px-2 py-2 whitespace-nowrap text-sm"><FormInput type="number" value={d.quantidade} onChange={(e) => handleDetalheChange(d.id, 'quantidade', e.target.value)} className="w-20 text-xs p-1 text-right" step="0.01"/></td>
                                                                            <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-600">
                                                                                {d.estado || '-'}
                                                                                {d.cep && <span className="text-xs text-gray-400 ml-1">({d.cep})</span>}
                                                                            </td>
                                                                            <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-800 font-semibold text-right">{formatCurrency(subtotal)}</td>
                                                                            <td className="px-2 py-2 whitespace-nowrap text-sm text-center">
                                                                                <button type="button" onClick={() => handleDeleteDetalhe(d.id)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100">
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rastreio & Pedido</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serviço</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qtd.</th>
                                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {draftDetalhes.map(d => {
                                const itemPreco = tabelaPrecos.find(c => c.id === d.tabelaPrecoItemId);
                                // Special handling for non-template shipping items
                                let subtotal = 0;
                                if (itemPreco) {
                                    const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
                                    const isTemplate = itemPreco.precoVenda === 1 && 
                                                      (itemPreco.descricao?.toLowerCase().includes('(template)') || 
                                                       itemPreco.descricao?.toLowerCase().includes('template'));
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
                                        <td className="px-2 py-2 whitespace-nowrap text-sm">
                                            <FormInput type="text" value={d.rastreio} onChange={(e) => handleDetalheChange(d.id, 'rastreio', e.target.value)} placeholder="Rastreio" className="w-40 text-xs p-1" />
                                            <FormInput type="text" value={d.codigoPedido} onChange={(e) => handleDetalheChange(d.id, 'codigoPedido', e.target.value)} placeholder="Pedido" className="w-40 text-xs p-1 mt-1" />
                                        </td>
                                        <td className="px-2 py-2 whitespace-nowrap text-sm">
                                             <FormSelect onChange={(e) => handleDetalheChange(d.id, 'tabelaPrecoItemId', e.target.value)} className={`w-full text-xs p-1 ${!d.tabelaPrecoItemId ? 'border-yellow-400' : ''}`} value={d.tabelaPrecoItemId || ""}><option value="" disabled>Selecione um serviço...</option>{tabelaPrecos.map(c => <option key={c.id} value={c.id}>{`${c.subcategoria} - ${c.descricao}`}</option>)}</FormSelect>
                                        </td>
                                        <td className="px-2 py-2 whitespace-nowrap text-sm"><FormInput type="number" value={d.quantidade} onChange={(e) => handleDetalheChange(d.id, 'quantidade', e.target.value)} className="w-20 text-xs p-1 text-right" step="0.01"/></td>
                                        <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-600">
                                            {d.estado || '-'}
                                            {d.cep && <span className="text-xs text-gray-400 ml-1">({d.cep})</span>}
                                        </td>
                                        <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-800 font-semibold text-right">{formatCurrency(subtotal)}</td>
                                        <td className="px-2 py-2 whitespace-nowrap text-sm text-center">
                                            <button type="button" onClick={() => handleDeleteDetalhe(d.id)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            
            {/* Note about hidden template items */}
            {draftDetalhes.length > filteredDraftDetalhes.length && (
                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-600">
                        <span className="font-semibold">Nota:</span> {draftDetalhes.length - filteredDraftDetalhes.length} item(ns) de template foram ocultados da visualização (informação interna).
                    </p>
                </div>
            )}
            
             <div className="mt-4">
                <button type="button" onClick={handleAddDetalhe} className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-md transition-colors flex items-center space-x-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    <span>Adicionar Item da Tabela</span>
                </button>
            </div>
             <div className="mt-6 pt-6 border-t">
                <h4 className="font-semibold text-gray-700 mb-2">Custos Adicionais / Manuais</h4>
                 <div className="space-y-2">
                    {draftCustosAdicionais.map((custo, index) => (
                        <div key={custo.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                            <FormInput 
                                type="text" 
                                value={custo.descricao} 
                                onChange={(e) => handleCustoAdicionalChange(custo.id, 'descricao', e.target.value)} 
                                placeholder="Descrição do Custo" 
                                className="flex-grow text-sm"
                            />
                            <FormInput 
                                type="number" 
                                value={custo.valor} 
                                onChange={(e) => handleCustoAdicionalChange(custo.id, 'valor', e.target.value)} 
                                placeholder="Valor (R$)" 
                                className="w-32 text-sm text-right"
                                step="0.01"
                            />
                            <button type="button" onClick={() => handleDeleteCustoAdicional(custo.id)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                            </button>
                        </div>
                    ))}
                </div>
                 <button type="button" onClick={handleAddCustoAdicional} className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-md transition-colors flex items-center space-x-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    <span>Adicionar Custo Adicional</span>
                </button>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
                <button onClick={handleCancel} disabled={isProcessing} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 font-medium">Cancelar</button>
                <button onClick={handleSave} disabled={isProcessing} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-medium disabled:bg-green-300">
                    {isProcessing ? 'Salvando...' : 'Salvar e Finalizar Fatura'}
                </button>
            </div>
        </div>
    );
    
    const renderContent = () => {
        switch(generationStage) {
            case 'setup':
                return renderSetup();
            case 'edit':
                return renderEdit();
            default:
                return renderSetup();
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md mt-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Geração da Cobrança</h3>
            {renderContent()}
            {renderSuccessModal()}
            <AIAnalysisModal 
                isOpen={isAnalysisModalOpen}
                onClose={closeAnalysisModal}
                onConfirm={handleConfirmAIInvoice}
                step={analysisStep}
                data={analysisData}
            />
        </div>
    );
};

export default InvoiceGenerationView;