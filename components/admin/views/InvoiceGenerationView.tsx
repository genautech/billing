import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
    processarFatura,
    salvarCobrancaProcessada,
    runAIBillingAnalysis,
    calculatePrecoVenda,
    calculatePrecoVendaForDisplay,
    isTemplateItem,
    getCostCategoryGroup,
    addComprovantesDifalToCobranca,
    getCustosManuaisByCliente,
    validateMultipleOrderDetailCSVs
} from '../../../services/firestoreService';
import type { TabelaPrecoItem, CobrancaMensal, DetalheEnvio, Cliente, AIAnalysis, CustoAdicional, CustoManualPreset, ComprovanteDifal, InvoiceSummary, CustoAdicionalResumo } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { FileInput } from '../../ui/FileInput';
import { MultiFileInput } from '../../ui/MultiFileInput';
import { FormInput, FormSelect } from '../../ui/FormControls';
import { MonthPicker } from '../../ui/MonthPicker';
import { AIAnalysisModal } from './AIAnalysisModal';
import GoogleDrivePicker from '../../ui/GoogleDrivePicker';

interface InvoiceGenerationViewProps {
    clientes: Cliente[];
    tabelaPrecos: TabelaPrecoItem[];
    onUpdate: () => void;
}

const InvoiceGenerationView: React.FC<InvoiceGenerationViewProps> = ({ clientes, tabelaPrecos, onUpdate }) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceGenerationView.tsx:init',message:'Componente inicializado',data:{clientesCount:clientes.length,tabelaPrecosCount:tabelaPrecos.length,primeiroCliente:clientes[0]?.id||'NENHUM'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    const manualCostCategories: NonNullable<CustoAdicional['categoria']>[] = ['Armazenagem', 'Maquila/Entrada', 'Estoque', 'Logístico', 'Outro'];
    const [clientId, setClientId] = useState<string>(clientes[0]?.id || '');
    const [month, setMonth] = useState<string>('Outubro/2025');
    const [storageStartDate, setStorageStartDate] = useState<string>('');
    const [trackReportFile, setTrackReportFile] = useState<File | null>(null);
    const [orderDetailFiles, setOrderDetailFiles] = useState<File[]>([]);
    const [trackReportFileContent, setTrackReportFileContent] = useState<string>('');
    const [orderDetailFileContents, setOrderDetailFileContents] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [ignoreMonthFilter, setIgnoreMonthFilter] = useState(false);
    
    // Date range for invoice period (when to search for orders in CSV)
    const [useDateRange, setUseDateRange] = useState(false);
    const [dateRangeStart, setDateRangeStart] = useState<string>('');
    const [dateRangeEnd, setDateRangeEnd] = useState<string>('');
    
    const { addToast } = useToast();
    
    // UI/Stage states
    const [generationStage, setGenerationStage] = useState<'setup' | 'edit'>('setup');
    const [savedInvoiceForModal, setSavedInvoiceForModal] = useState<CobrancaMensal | null>(null);

    // Draft states
    const [draftCobranca, setDraftCobranca] = useState<CobrancaMensal | null>(null);
    const [draftDetalhes, setDraftDetalhes] = useState<DetalheEnvio[]>([]);
    const [draftCustosAdicionais, setDraftCustosAdicionais] = useState<CustoAdicional[]>([]);
    const [detectedDateRange, setDetectedDateRange] = useState<string>('');
    const [manualCostPresets, setManualCostPresets] = useState<CustoManualPreset[]>([]);
    const [isLoadingPresets, setIsLoadingPresets] = useState(false);
    
    // AI Modal states
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [analysisStep, setAnalysisStep] = useState<'analyzing' | 'review'>('analyzing');
    const [analysisData, setAnalysisData] = useState<AIAnalysis | null>(null);
    
    // DIFAL Comprovantes state
    const [draftComprovantesDifal, setDraftComprovantesDifal] = useState<ComprovanteDifal[]>([]);
    
    // Invoice Summary for pre-approval review
    const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary | null>(null);

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
    const hasTrack = !!trackReportFileContent;
    const hasOrderDetail = orderDetailFileContents.length > 0 && orderDetailFileContents.some(c => !!c);
    // Combine all order detail contents for processing
    const combinedOrderDetailContent = orderDetailFileContents.join('\n');
    const canProcessManual = !isProcessing && !isAiProcessing && hasOrderDetail && !isClientEmailMissing;
    const canProcessAI = canProcessManual && hasTrack;
    
    // Validate multiple CSVs for duplicates
    const csvValidation = useMemo(() => {
        if (orderDetailFileContents.length === 0) return null;
        return validateMultipleOrderDetailCSVs(orderDetailFileContents);
    }, [orderDetailFileContents]);


    useEffect(() => {
        const [mesNome, ano] = month.toLowerCase().split('/');
        const mesNumero = monthMap[mesNome];
        if (mesNumero !== undefined && ano) {
            const firstDay = new Date(parseInt(ano), mesNumero, 1);
            setStorageStartDate(firstDay.toISOString().split('T')[0]);
        }
    }, [month]);

    useEffect(() => {
        const loadPresets = async () => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceGenerationView.tsx:loadPresets',message:'Iniciando loadPresets',data:{clientId:clientId||'VAZIO'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
            // #endregion
            if (!clientId) {
                setManualCostPresets([]);
                return;
            }
            setIsLoadingPresets(true);
            try {
                const presets = await getCustosManuaisByCliente(clientId);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceGenerationView.tsx:loadPresets:success',message:'Presets carregados',data:{presetsCount:presets.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
                // #endregion
                setManualCostPresets(presets);
            } catch (error) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceGenerationView.tsx:loadPresets:error',message:'Erro ao carregar presets',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
                // #endregion
                console.error('Failed to load manual cost presets:', error);
                addToast('Não foi possível carregar os custos fixos do cliente.', 'error');
            } finally {
                setIsLoadingPresets(false);
            }
        };
        loadPresets();
    }, [clientId, addToast]);
    
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
                // Apply margin to non-template shipping cost using standard function
                subtotal = calculatePrecoVenda(itemPreco, detalhe.quantidade);
            } else {
                subtotal = calculatePrecoVendaForDisplay(itemPreco) * detalhe.quantidade;
            }
            
            byState[estado].total += subtotal;
        });
        
        return byState;
    }, [filteredDraftDetalhes, tabelaPrecos]);

    const manualPresetsByCategory = useMemo(() => {
        return manualCostPresets.reduce<Record<string, CustoManualPreset[]>>((acc, preset) => {
            const cat = preset.categoria || 'Outro';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(preset);
            return acc;
        }, {});
    }, [manualCostPresets]);

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

    // Recalculate totals grouped by category
    const totalsByCategory = useMemo(() => {
        const categories: Record<string, { total: number, count: number }> = {};
        
        draftDetalhes.forEach(detalhe => {
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (!itemPreco) return;
            
            const category = itemPreco.categoria || 'Outros';
            if (!categories[category]) {
                categories[category] = { total: 0, count: 0 };
            }
            
            const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
            const isTemplate = isTemplateItem(itemPreco);
            const isNonTemplateShipping = isShippingItem && !isTemplate;
            
            let subtotal = 0;
            if (isNonTemplateShipping) {
                subtotal = calculatePrecoVenda(itemPreco, detalhe.quantidade);
            } else {
                subtotal = calculatePrecoVendaForDisplay(itemPreco) * detalhe.quantidade;
            }
            
            categories[category].total += subtotal;
            categories[category].count += 1;
        });
        
        return categories;
    }, [draftDetalhes, tabelaPrecos]);

    const recalculateDraftTotals = (detalhes: DetalheEnvio[], custosAdicionais: CustoAdicional[]): Omit<CobrancaMensal, 'id' | 'clienteId' | 'mesReferencia' | 'dataVencimento' | 'status'> => {
        let totalEnvio = 0;
        let totalArmazenagem = 0;
        let totalCustosLogisticos = 0;
        let custoTotalItens = 0; // Renamed to avoid confusion
        let quantidadeEnvios = 0; // Count of shipments
        
        const envioCats = ['Envios', 'Retornos'];

        detalhes.forEach(detalhe => {
            if (!detalhe.tabelaPrecoItemId) return;
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (itemPreco) {
                const isTemplate = isTemplateItem(itemPreco);
                const isDifalItem = itemPreco.categoria === 'Difal' || itemPreco.descricao?.toLowerCase().includes('difal');
                const isVariableCost = isTemplate || envioCats.includes(itemPreco.categoria) || isDifalItem;
                
                let precoVendaCalculado: number;
                let quantidadeUsada: number;
                let subtotalCusto: number;
                
                if (isDifalItem) {
                    // DIFAL: quantidade already contains the final price with 200% margin and R$3 minimum
                    precoVendaCalculado = detalhe.quantidade; // Use directly, no additional margin
                    quantidadeUsada = 1;
                    subtotalCusto = detalhe.quantidade / 3; // Estimate base cost (remove 200% margin)
                } else if (isVariableCost) {
                    // For other variable costs: quantity field stores the base cost from CSV
                    // We apply the margin to get the final sale price
                    precoVendaCalculado = calculatePrecoVenda(itemPreco, detalhe.quantidade);
                    quantidadeUsada = 1;
                    subtotalCusto = detalhe.quantidade;
                } else {
                    // For fixed costs: use the sale price from price table
                    precoVendaCalculado = calculatePrecoVendaForDisplay(itemPreco);
                    quantidadeUsada = detalhe.quantidade;
                    subtotalCusto = itemPreco.custoUnitario * detalhe.quantidade;
                }
                
                const subtotalVenda = precoVendaCalculado * quantidadeUsada;
                custoTotalItens += subtotalCusto;
                
                const group = getCostCategoryGroup(itemPreco.categoria);
                if (group === 'armazenagem') {
                    totalArmazenagem += subtotalVenda;
                } else if (group === 'envio') {
                    totalEnvio += subtotalVenda;
                    quantidadeEnvios++; // Count shipments
                } else {
                    totalCustosLogisticos += subtotalVenda;
                }
            }
        });
        
        // Separate reembolsos from regular costs
        const custosRegulares = custosAdicionais.filter(c => !c.isReembolso);
        const reembolsos = custosAdicionais.filter(c => c.isReembolso);
        
        const totalCustosAdicionaisRegulares = custosRegulares.reduce((sum, custo) => sum + custo.valor, 0);
        const totalReembolsos = reembolsos.reduce((sum, custo) => sum + custo.valor, 0);
        const totalCustosAdicionais = totalCustosAdicionaisRegulares - totalReembolsos; // Reembolsos são subtraídos
        const totalCustosExtras = draftCobranca?.totalCustosExtras || 0;

        // Assume 0 margin for additional/extra costs, so their cost is equal to their value. This ensures profit is calculated correctly.
        const custoTotal = custoTotalItens + totalCustosAdicionaisRegulares + totalCustosExtras - totalReembolsos;
        const valorTotal = totalEnvio + totalArmazenagem + totalCustosLogisticos + totalCustosExtras + totalCustosAdicionaisRegulares - totalReembolsos;
        
        return { totalEnvio, quantidadeEnvios, totalArmazenagem, totalCustosLogisticos, totalCustosAdicionais, totalCustosExtras, valorTotal, custoTotal };
    };

    const handleProcess = async () => {
        if (!clientId || !month || !storageStartDate || !hasOrderDetail) {
            addToast('Por favor, selecione o Order Detail e preencha cliente e datas.', 'error');
            return;
        }
        
        // Validate date range if using custom range
        if (useDateRange && (!dateRangeStart || !dateRangeEnd)) {
            addToast('Por favor, preencha as datas inicial e final do intervalo.', 'error');
            return;
        }
        
        setIsProcessing(true);
        try {
            const dateRangeOptions = useDateRange 
                ? { start: dateRangeStart, end: dateRangeEnd }
                : undefined;
            
            const { cobranca, detalhes, detectedDateRange, summary } = await processarFatura(
                clientId, month, storageStartDate, clientes, 
                trackReportFileContent, orderDetailFileContents, 
                ignoreMonthFilter, dateRangeOptions
            );
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceGenerationView.tsx:handleProcess',message:'Invoice processed with summary',data:{hasSummary:!!summary,summaryData:summary,cobrancaValorTotal:cobranca.valorTotal,detalhesCount:detalhes.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2-VIEW'})}).catch(()=>{});
            // #endregion
            
            setDraftCobranca(cobranca);
            setDraftDetalhes(detalhes);
            setDraftCustosAdicionais([]);
            setDetectedDateRange(detectedDateRange);
            setInvoiceSummary(summary);
            setGenerationStage('edit');
            addToast('Arquivos processados. Revise o resumo e a fatura antes de salvar.', 'info');
        } catch(error) {
            console.error("Failed to process invoice:", error);
            addToast(`Erro ao processar fatura: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleProcessWithAI = async () => {
         if (!canProcessAI) {
            addToast('Para análise com IA, selecione cliente, mês e ambos os CSVs (Track Report e Order Detail).', 'error');
            return;
        }
        setIsAiProcessing(true);
        setIsAnalysisModalOpen(true);
        setAnalysisStep('analyzing');
        setAnalysisData(null);

        try {
            const result = await runAIBillingAnalysis(clientId, month, clientes, trackReportFileContent, combinedOrderDetailContent);
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
                combinedOrderDetailContent
            );

            // Save the reliable, programmatically generated invoice
            const savedInvoice = await salvarCobrancaProcessada(cobranca, detalhes, [], trackReportFileContent, combinedOrderDetailContent);
            
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
        setOrderDetailFiles([]);
        setTrackReportFileContent('');
        setOrderDetailFileContents([]);
        setDetectedDateRange('');
        setInvoiceSummary(null);
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
            const savedInvoice = await salvarCobrancaProcessada(draftCobranca, draftDetalhes, draftCustosAdicionais, trackReportFileContent, combinedOrderDetailContent);
            
            // Save DIFAL comprovantes if any
            if (draftComprovantesDifal.length > 0 && savedInvoice.id) {
                try {
                    await addComprovantesDifalToCobranca(
                        savedInvoice.id, 
                        draftComprovantesDifal.map(c => ({
                            ...c,
                            clienteId: savedInvoice.clienteId
                        })),
                        savedInvoice.clienteId
                    );
                    console.log(`✅ ${draftComprovantesDifal.length} comprovantes DIFAL salvos`);
                } catch (difalError) {
                    console.error("Failed to save DIFAL comprovantes:", difalError);
                    addToast('Fatura salva, mas houve erro ao salvar comprovantes DIFAL', 'warning');
                }
            }
            
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

    const presetAlreadyAdded = (preset: CustoManualPreset) => 
        draftCustosAdicionais.some(c => c.descricao === preset.descricao && c.valor === preset.valor && c.categoria === preset.categoria);

    const addPresetsToDraft = (presets: CustoManualPreset[]) => {
        const additions = presets
            .filter(p => !presetAlreadyAdded(p))
            .map(p => ({
                id: `preset_${p.id}`,
                descricao: p.descricao,
                valor: p.valor,
                categoria: p.categoria
            } as CustoAdicional));
        
        if (additions.length === 0) return;
        const newCustos = [...draftCustosAdicionais, ...additions];
        setDraftCustosAdicionais(newCustos);
        if (draftCobranca) {
            const updatedTotals = recalculateDraftTotals(draftDetalhes, newCustos);
            setDraftCobranca(prev => prev ? { ...prev, ...updatedTotals } : null);
        }
    };

    const handleAddPreset = (preset: CustoManualPreset) => addPresetsToDraft([preset]);
    const handleAddPresetCategory = (categoria: CustoManualPreset['categoria']) => {
        const presets = manualCostPresets.filter(p => p.categoria === categoria);
        addPresetsToDraft(presets);
    };
    const handleAddAllPresets = () => addPresetsToDraft(manualCostPresets);

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
            categoria: 'Outro'
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

    const renderSetup = () => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceGenerationView.tsx:renderSetup',message:'Renderizando setup',data:{clientId,clientesLength:clientes.length,tabelaPrecosLength:tabelaPrecos.length,isLoadingPresets,generationStage},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
        return (
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
                    {/* Date Range Selection */}
                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                        <div className="flex items-center space-x-2 mb-3">
                            <input
                                type="checkbox"
                                id="use-date-range"
                                checked={useDateRange}
                                onChange={(e) => {
                                    setUseDateRange(e.target.checked);
                                    if (e.target.checked) {
                                        setIgnoreMonthFilter(false); // Mutually exclusive
                                    }
                                }}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <label htmlFor="use-date-range" className="text-sm font-semibold text-indigo-800">
                                Usar Intervalo de Datas Personalizado
                            </label>
                        </div>
                        {useDateRange && (
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div>
                                    <label className="block text-xs font-medium text-indigo-700 mb-1">Data Inicial</label>
                                    <input
                                        type="date"
                                        value={dateRangeStart}
                                        onChange={(e) => setDateRangeStart(e.target.value)}
                                        className="w-full px-3 py-2 border border-indigo-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-indigo-700 mb-1">Data Final</label>
                                    <input
                                        type="date"
                                        value={dateRangeEnd}
                                        onChange={(e) => setDateRangeEnd(e.target.value)}
                                        className="w-full px-3 py-2 border border-indigo-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                    />
                                </div>
                            </div>
                        )}
                        <p className="text-xs text-indigo-600 mt-2">
                            {useDateRange 
                                ? 'Os pedidos serão filtrados entre as datas selecionadas.' 
                                : 'Por padrão, filtra pelo mês de referência selecionado acima.'}
                        </p>
                    </div>
                    
                    <div className="flex items-center space-x-2 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                        <input
                            type="checkbox"
                            id="ignore-month-filter"
                            checked={ignoreMonthFilter}
                            onChange={(e) => {
                                setIgnoreMonthFilter(e.target.checked);
                                if (e.target.checked) {
                                    setUseDateRange(false); // Mutually exclusive
                                }
                            }}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="ignore-month-filter" className="text-sm font-medium text-yellow-800">
                            Ignorar filtro de mês (Usar todos os dados presentes no arquivo)
                        </label>
                    </div>
                    <div className="bg-blue-50 border-l-4 border-blue-400 p-3 text-sm text-blue-800 rounded-r-lg">
                        <p>Para garantir a compatibilidade, use os arquivos modelo disponíveis na seção <strong>'Templates e Imports'</strong>.</p>
                    </div>
                    <FileInput id="track-report-file" label="Relatório de Rastreio (Track Report) — opcional" file={trackReportFile} onFileChange={setTrackReportFile} onFileRead={setTrackReportFileContent} />
                    <div className="text-xs text-gray-600 bg-gray-100 p-2 rounded space-y-1">
                        <p><strong>Sem Track Report?</strong> Usaremos apenas o Order Detail. Campos de rastreio podem ficar vazios e relatórios por estado dependerão da coluna de UF no Order Detail.</p>
                        <p><strong>Formatos aceitos:</strong> Formato Tradicional (Data de envio, Pedido, Rastreio) ou Formato Flexível (Number, Email, Placed at). O sistema detecta automaticamente o padrão e usa Email + Mês/Ano para cruzamento inteligente em qualquer cliente.</p>
                    </div>
                    <MultiFileInput 
                        id="order-detail-files" 
                        label="Relatório de Custos (Order Detail) — obrigatório (múltiplos meses permitidos)" 
                        files={orderDetailFiles} 
                        onFilesChange={setOrderDetailFiles} 
                        onContentsRead={setOrderDetailFileContents}
                    />
                    
                    {/* Validation warnings for multiple CSVs */}
                    {csvValidation && csvValidation.warnings.length > 0 && (
                        <div className="mt-2 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                            <div className="flex items-start gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <div>
                                    <p className="text-sm font-semibold text-yellow-800">Atenção</p>
                                    <ul className="text-xs text-yellow-700 mt-1 space-y-0.5">
                                        {csvValidation.warnings.map((warning, idx) => (
                                            <li key={idx}>• {warning}</li>
                                        ))}
                                    </ul>
                                    {csvValidation.duplicateOrders.length > 0 && (
                                        <p className="text-xs text-yellow-600 mt-2 italic">
                                            Pedidos duplicados serão processados normalmente. Verifique se os arquivos são de períodos diferentes.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Success indicator when multiple files are valid */}
                    {csvValidation && csvValidation.warnings.length === 0 && orderDetailFiles.length > 1 && (
                        <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <p className="text-sm text-green-800">
                                    <strong>{orderDetailFiles.length} arquivos</strong> selecionados com <strong>{csvValidation.totalRows} linhas</strong> no total. Sem duplicatas detectadas.
                                </p>
                            </div>
                        </div>
                    )}
                    
                    {/* Notas de Remessa de Envio Section */}
                    <div className="mt-4 p-4 border border-purple-200 rounded-lg bg-purple-50">
                        <h4 className="text-sm font-semibold text-purple-800 mb-2">Notas de Remessa de Envio (XML de NF-e)</h4>
                        <p className="text-xs text-purple-700 mb-3">
                            Selecione os XMLs de notas fiscais de remessa de envio (brinde/doação). Estes são armazenados apenas como comprovantes para download. 
                            <strong className="block mt-1">O DIFAL é cobrado separadamente (mín. R$ 3,00 por pedido).</strong>
                        </p>
                        <GoogleDrivePicker
                            onFilesSelected={(comprovantes) => {
                                setDraftComprovantesDifal(prev => {
                                    const merged = [...prev, ...comprovantes.map(c => ({
                                        ...c,
                                        pedidoRelacionado: '',
                                        emailRelacionado: c.emailRelacionado || ''
                                    }))];
                                    // Remove duplicates by chaveNFe
                                    return merged.reduce((acc: ComprovanteDifal[], curr) => {
                                        if (!acc.find(c => c.chaveNFe === curr.chaveNFe)) {
                                            acc.push(curr);
                                        }
                                        return acc;
                                    }, []);
                                });
                                addToast(`${comprovantes.length} nota(s) de remessa adicionada(s)`, 'success');
                            }}
                            disabled={isProcessing}
                        />
                        
                        {/* List of added comprovantes */}
                        {draftComprovantesDifal.length > 0 && (
                            <div className="mt-3">
                                <p className="text-xs font-medium text-purple-700 mb-2">
                                    {draftComprovantesDifal.length} comprovante(s) selecionado(s):
                                </p>
                                <div className="space-y-2 max-h-72 overflow-y-auto">
                                    {draftComprovantesDifal.map((c, idx) => (
                                        <div key={c.chaveNFe} className="flex items-center justify-between bg-white p-2 rounded border border-purple-100 text-xs">
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <p className="font-mono truncate" title={c.chaveNFe}>{c.chaveNFe}</p>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                                                    <div>
                                                        <label className="text-[11px] text-gray-500">Pedido</label>
                                                        <select
                                                            className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                                            value={c.pedidoRelacionado || ''}
                                                            onChange={(e) => setDraftComprovantesDifal(prev => {
                                                                const next = [...prev];
                                                                next[idx] = { ...next[idx], pedidoRelacionado: e.target.value };
                                                                return next;
                                                            })}
                                                        >
                                                            <option value="">(opcional)</option>
                                                            {Array.from(new Set(draftDetalhes.map(d => d.codigoPedido))).map(p => (
                                                                <option key={p} value={p}>{p}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[11px] text-gray-500">Email</label>
                                                        <input
                                                            className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                                            placeholder="email relacionado (opcional)"
                                                            value={c.emailRelacionado || ''}
                                                            onChange={(e) => setDraftComprovantesDifal(prev => {
                                                                const next = [...prev];
                                                                next[idx] = { ...next[idx], emailRelacionado: e.target.value };
                                                                return next;
                                                            })}
                                                        />
                                                    </div>
                                                    <div className="text-[11px] text-gray-500">
                                                        <span>{c.nomeDestinatario || 'Destinatário não informado'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setDraftComprovantesDifal(prev => prev.filter((_, i) => i !== idx))}
                                                className="ml-2 text-red-500 hover:text-red-700"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-2 pt-2 border-t border-purple-200 text-xs text-purple-800">
                                    <span className="text-gray-500 italic">{draftComprovantesDifal.length} nota(s) de remessa anexadas (valores simbólicos, apenas para download)</span>
                                </div>
                            </div>
                        )}
                    </div>
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
                        disabled={!canProcessManual} 
                        className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-md hover:bg-blue-700 transition-colors shadow-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? 'Processando...' : 'Processar Arquivos (Order Detail obrigatório)'}
                    </button>
                    <button 
                        onClick={handleProcessWithAI}
                        disabled={!canProcessAI}
                        className="w-full bg-purple-600 text-white px-4 py-2.5 rounded-md hover:bg-purple-700 transition-colors shadow-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                        {isAiProcessing ? 'Analisando...' : 'Analisar com IA (requer Track Report)'}
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
    )};

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

    // Render the pre-approval summary component
    const renderInvoiceSummary = () => {
        if (!invoiceSummary) return null;
        
        return (
            <div className="mb-6 p-5 border-2 border-green-300 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-green-100 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-green-800">Resumo Pré-Aprovação</h3>
                        <p className="text-sm text-green-600">
                            {invoiceSummary.clienteNome} • {invoiceSummary.mesReferencia} • 
                            Tabela: <span className="font-semibold">{invoiceSummary.tabela === 'cliente' ? 'Personalizada do Cliente' : 'Global'}</span>
                        </p>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                    <div className="bg-white p-3 rounded-lg border border-green-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-medium">Pedidos Únicos</p>
                        <p className="text-2xl font-bold text-gray-900">{invoiceSummary.totalPedidosUnicos}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-blue-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-medium">Envios ({invoiceSummary.quantidadeEnvios})</p>
                        <p className="text-lg font-bold text-blue-700">{formatCurrency(invoiceSummary.totalEnvios)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-purple-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-medium">DIFAL ({invoiceSummary.quantidadeDifal})</p>
                        <p className="text-lg font-bold text-purple-700">{formatCurrency(invoiceSummary.totalDifal)}</p>
                        <p className="text-[10px] text-purple-500">Mín. R$ 3,00/pedido</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-orange-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-medium">Armazenagem</p>
                        <p className="text-lg font-bold text-orange-700">{formatCurrency(invoiceSummary.totalArmazenagem)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                        <p className="text-xs text-gray-500 uppercase font-medium">Outros Custos</p>
                        <p className="text-lg font-bold text-gray-700">{formatCurrency(invoiceSummary.totalCustosLogisticos)}</p>
                    </div>
                    <div className="bg-green-100 p-3 rounded-lg border-2 border-green-400 shadow-sm">
                        <p className="text-xs text-green-700 uppercase font-semibold">Total Geral</p>
                        <p className="text-xl font-bold text-green-800">{formatCurrency(invoiceSummary.totalGeral)}</p>
                    </div>
                </div>
                
                {/* Period detected */}
                {invoiceSummary.periodoDetectado && invoiceSummary.periodoDetectado !== 'N/A' && (
                    <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                            <span className="font-semibold">📅 Período detectado nos CSVs:</span> {invoiceSummary.periodoDetectado}
                        </p>
                    </div>
                )}
                
                {/* Warnings */}
                {invoiceSummary.warnings.length > 0 && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                        <p className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Avisos ({invoiceSummary.warnings.length})</p>
                        <ul className="text-xs text-yellow-700 space-y-1 max-h-24 overflow-y-auto">
                            {invoiceSummary.warnings.slice(0, 5).map((warning, idx) => (
                                <li key={idx} className="truncate">• {warning}</li>
                            ))}
                            {invoiceSummary.warnings.length > 5 && (
                                <li className="text-yellow-600 italic">... e mais {invoiceSummary.warnings.length - 5} avisos</li>
                            )}
                        </ul>
                    </div>
                )}
                
                {/* Unmatched orders */}
                {invoiceSummary.pedidosSemMatch.length > 0 && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm font-semibold text-red-800 mb-2">❌ Pedidos sem correspondência ({invoiceSummary.pedidosSemMatch.length})</p>
                        <p className="text-xs text-red-600 mb-2">Estes pedidos não foram encontrados ou não puderam ser processados:</p>
                        <div className="flex flex-wrap gap-2">
                            {invoiceSummary.pedidosSemMatch.slice(0, 10).map((pedido, idx) => (
                                <span key={idx} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-mono">{pedido}</span>
                            ))}
                            {invoiceSummary.pedidosSemMatch.length > 10 && (
                                <span className="text-xs text-red-500 italic">+{invoiceSummary.pedidosSemMatch.length - 10} mais</span>
                            )}
                        </div>
                    </div>
                )}
                
                {/* Entradas de Material */}
                {invoiceSummary.entradasMaterial && invoiceSummary.entradasMaterial.length > 0 && (
                    <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                        <p className="text-sm font-semibold text-indigo-800 mb-2">📦 Entradas de Material ({invoiceSummary.entradasMaterial.length})</p>
                        <div className="space-y-1">
                            {invoiceSummary.entradasMaterial.map((entrada, idx) => (
                                <div key={idx} className="flex justify-between items-center text-xs bg-white px-2 py-1.5 rounded border border-indigo-100">
                                    <span className="text-indigo-700">{entrada.descricao}</span>
                                    <div className="flex gap-3">
                                        <span className="text-gray-500">{entrada.quantidade} un.</span>
                                        <span className="font-semibold text-indigo-800">{formatCurrency(entrada.valorTotal)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Custos Adicionais (do draft) */}
                {draftCustosAdicionais.filter(c => !c.isReembolso).length > 0 && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm font-semibold text-amber-800 mb-2">➕ Custos Adicionais ({draftCustosAdicionais.filter(c => !c.isReembolso).length})</p>
                        <div className="space-y-1">
                            {draftCustosAdicionais.filter(c => !c.isReembolso).map((custo, idx) => (
                                <div key={custo.id} className="flex justify-between items-center text-xs bg-white px-2 py-1.5 rounded border border-amber-100">
                                    <span className="text-amber-700">{custo.descricao || 'Sem descrição'}</span>
                                    <div className="flex gap-3">
                                        <span className="text-gray-500">{custo.categoria || 'Outro'}</span>
                                        <span className="font-semibold text-amber-800">{formatCurrency(custo.valor)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Reembolsos */}
                {draftCustosAdicionais.filter(c => c.isReembolso).length > 0 && (
                    <div className="mt-3 p-3 bg-emerald-50 border border-emerald-300 rounded-lg">
                        <p className="text-sm font-semibold text-emerald-800 mb-2">💰 Reembolsos ({draftCustosAdicionais.filter(c => c.isReembolso).length})</p>
                        <p className="text-xs text-emerald-600 mb-2">Valores que serão subtraídos do total da fatura:</p>
                        <div className="space-y-1">
                            {draftCustosAdicionais.filter(c => c.isReembolso).map((custo, idx) => (
                                <div key={custo.id} className="flex justify-between items-center text-xs bg-white px-2 py-1.5 rounded border border-emerald-200">
                                    <div className="flex flex-col">
                                        <span className="text-emerald-700 font-medium">{custo.descricao || 'Sem descrição'}</span>
                                        {custo.motivoReembolso && (
                                            <span className="text-gray-500 text-[10px]">{custo.motivoReembolso}</span>
                                        )}
                                    </div>
                                    <span className="font-bold text-emerald-700">- {formatCurrency(custo.valor)}</span>
                                </div>
                            ))}
                            <div className="flex justify-between items-center text-sm font-bold bg-emerald-100 px-2 py-2 rounded mt-2">
                                <span className="text-emerald-800">Total Reembolsos</span>
                                <span className="text-emerald-800">- {formatCurrency(draftCustosAdicionais.filter(c => c.isReembolso).reduce((sum, c) => sum + c.valor, 0))}</span>
                            </div>
                        </div>
                    </div>
                )}
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
            
            {/* Pre-approval Summary */}
            {renderInvoiceSummary()}
            
            {/* FIX: Changed grid to 4 columns and added display for logistic costs for better consistency. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="bg-gray-100 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Total Envios</p>
                    <p className="text-xl font-bold">{formatCurrency(draftCobranca!.totalEnvio)}</p>
                    {draftCobranca!.quantidadeEnvios !== undefined && draftCobranca!.quantidadeEnvios > 0 && (
                        <p className="text-xs text-gray-500 mt-1">{draftCobranca!.quantidadeEnvios} envio(s)</p>
                    )}
                </div>
                <div className="bg-gray-100 p-4 rounded-lg"><p className="text-sm text-gray-600">Total Logística</p><p className="text-xl font-bold">{formatCurrency(draftCobranca!.totalCustosLogisticos)}</p></div>
                <div className="bg-gray-100 p-4 rounded-lg"><p className="text-sm text-gray-600">Total Armazenagem</p><p className="text-xl font-bold">{formatCurrency(draftCobranca!.totalArmazenagem)}</p></div>
                 <div className="bg-gray-100 p-4 rounded-lg"><p className="text-sm text-gray-600">Custos Adicionais</p><p className="text-xl font-bold">{formatCurrency(draftCobranca!.totalCustosAdicionais || 0)}</p></div>
                <div className="bg-blue-100 p-4 rounded-lg border border-blue-200"><p className="text-sm text-blue-700">Valor Total</p><p className="text-xl font-bold text-blue-800">{formatCurrency(draftCobranca!.valorTotal)}</p></div>
            </div>

            {/* Resumo por Categoria */}
            <div className="mb-6 p-4 border border-purple-200 rounded-lg bg-purple-50">
                <h4 className="text-md font-semibold text-purple-800 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
                    </svg>
                    Resumo por Categoria
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Object.entries(totalsByCategory)
                        .sort(([, a], [, b]) => (b as any).total - (a as any).total)
                        .map(([category, data]) => (
                            <div key={category} className="bg-white p-3 rounded-md shadow-sm border border-purple-100">
                                <p className="text-xs text-purple-600 font-semibold uppercase truncate" title={category}>{category}</p>
                                <div className="flex justify-between items-end mt-1">
                                    <p className="text-lg font-bold text-gray-900">{formatCurrency((data as any).total)}</p>
                                    <p className="text-xs text-gray-500">{(data as any).count} itens</p>
                                </div>
                            </div>
                        ))}
                </div>
            </div>
            
            {/* Shipping costs by state/region summary */}
            {Object.keys(shippingByState).length > 0 && (
                <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <h4 className="text-md font-semibold text-gray-700 mb-3">Custos de Envio por Estado/Região</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {Object.entries(shippingByState)
                            .sort(([, a], [, b]) => (b as any).total - (a as any).total)
                            .map(([estado, data]) => (
                                <div key={estado} className="bg-white p-3 rounded border border-gray-200">
                                    <p className="text-xs text-gray-500 uppercase">{estado}</p>
                                    <p className="text-sm font-bold text-gray-800">{formatCurrency((data as any).total)}</p>
                                    <p className="text-xs text-gray-400 mt-1">{(data as any).detalhes.length} {(data as any).detalhes.length === 1 ? 'envio' : 'envios'}</p>
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
                                                
                                                const isTemplate = isTemplateItem(itemPreco);
                                                const isDifalItem = itemPreco.categoria === 'Difal' || itemPreco.descricao?.toLowerCase().includes('difal');
                                                const isVariableCost = isTemplate || itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos' || isDifalItem;
                                                
                                                let subtotal = 0;
                                                if (isDifalItem) {
                                                    // DIFAL: quantidade already contains final price
                                                    subtotal = detalhe.quantidade;
                                                } else if (isVariableCost) {
                                                    subtotal = calculatePrecoVenda(itemPreco, detalhe.quantidade);
                                                } else {
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
                                                                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd/Custo</th>
                                                                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">Margem</th>
                                                                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Unit.</th>
                                                                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                                                                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                                                                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white divide-y divide-gray-200">
                                                                {categoryDetails.map(d => {
                                                                    const itemPreco = tabelaPrecos.find(c => c.id === d.tabelaPrecoItemId);
                                                                    let subtotal = 0;
                                                                    let precoVenda = 0;
                                                                    let margem: number | undefined = undefined;
                                                                    if (itemPreco) {
                                                                        const isTemplate = isTemplateItem(itemPreco);
                                                                        const isDifalItem = itemPreco.categoria === 'Difal' || itemPreco.descricao?.toLowerCase().includes('difal');
                                                                        const isVariableCost = isTemplate || itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos' || isDifalItem;
                                                                        
                                                                        if (isDifalItem) {
                                                                            // DIFAL: Apply minimum R$ 3,00
                                                                            const DIFAL_MIN_PRICE = 3.00;
                                                                            const calculatedPrice = calculatePrecoVenda(itemPreco, d.quantidade);
                                                                            precoVenda = Math.max(calculatedPrice, DIFAL_MIN_PRICE);
                                                                            subtotal = precoVenda;
                                                                            margem = itemPreco.margemLucro || 200;
                                                                        } else if (isVariableCost) {
                                                                            precoVenda = calculatePrecoVenda(itemPreco, d.quantidade);
                                                                            subtotal = precoVenda;
                                                                            margem = itemPreco.margemLucro;
                                                                        } else {
                                                                            precoVenda = calculatePrecoVendaForDisplay(itemPreco);
                                                                            subtotal = precoVenda * d.quantidade;
                                                                            margem = itemPreco.margemLucro;
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
                                                                            <td className="px-2 py-2 whitespace-nowrap text-sm">
                                                                                <FormInput type="number" value={d.quantidade} onChange={(e) => handleDetalheChange(d.id, 'quantidade', e.target.value)} className="w-20 text-xs p-1 text-right" step="0.01"/>
                                                                            </td>
                                                                            <td className="px-2 py-2 whitespace-nowrap text-sm text-center text-gray-600 font-medium">
                                                                                {margem !== undefined ? `${margem.toFixed(1)}%` : '-'}
                                                                            </td>
                                                                            <td className="px-2 py-2 whitespace-nowrap text-sm text-right text-gray-700">
                                                                                {formatCurrency(precoVenda)}
                                                                            </td>
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
                                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qtd/Custo</th>
                                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">Margem</th>
                                <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase">Preço Unit.</th>
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
                                let precoVenda = 0;
                                let margem: number | undefined = undefined;
                                
                                    if (itemPreco) {
                                        const isTemplate = isTemplateItem(itemPreco);
                                        const isDifalItem = itemPreco.categoria === 'Difal' || itemPreco.descricao?.toLowerCase().includes('difal');
                                        const isVariableCost = isTemplate || itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos' || isDifalItem;
                                        
                                        if (isDifalItem) {
                                            // DIFAL: Apply minimum R$ 3,00
                                            const DIFAL_MIN_PRICE = 3.00;
                                            const calculatedPrice = calculatePrecoVenda(itemPreco, d.quantidade);
                                            precoVenda = Math.max(calculatedPrice, DIFAL_MIN_PRICE);
                                            subtotal = precoVenda;
                                            margem = itemPreco.margemLucro || 200;
                                        } else if (isVariableCost) {
                                            precoVenda = calculatePrecoVenda(itemPreco, d.quantidade);
                                            subtotal = precoVenda;
                                            margem = itemPreco.margemLucro;
                                        } else {
                                            precoVenda = calculatePrecoVendaForDisplay(itemPreco);
                                            subtotal = precoVenda * d.quantidade;
                                            margem = itemPreco.margemLucro;
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
                                        <td className="px-2 py-2 whitespace-nowrap text-sm">
                                            <FormInput type="number" value={d.quantidade} onChange={(e) => handleDetalheChange(d.id, 'quantidade', e.target.value)} className="w-20 text-xs p-1 text-right" step="0.01"/>
                                        </td>
                                        <td className="px-2 py-2 whitespace-nowrap text-sm text-center text-gray-600 font-medium">
                                            {margem !== undefined ? `${margem.toFixed(1)}%` : '-'}
                                        </td>
                                        <td className="px-2 py-2 whitespace-nowrap text-sm text-right text-gray-700">
                                            {formatCurrency(precoVenda)}
                                        </td>
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

            {isLoadingPresets && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
                    Carregando custos fixos do cliente...
                </div>
            )}

            {!isLoadingPresets && manualCostPresets.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                            <h4 className="font-semibold text-blue-900">Custos fixos do cliente</h4>
                            <p className="text-xs text-blue-800">Adicione em massa armazenagem, maquila/entrada e outros custos que não dependem de pedidos.</p>
                        </div>
                        <button
                            type="button"
                            onClick={handleAddAllPresets}
                            className="self-start bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-700"
                        >
                            Selecionar todos
                        </button>
                    </div>
                    <div className="mt-3 space-y-3">
                        {Object.entries(manualPresetsByCategory).map(([categoria, presets]) => (
                            <div key={categoria} className="bg-white rounded-md border border-blue-100 p-3 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="font-semibold text-sm text-gray-800">{categoria}</div>
                                    <button
                                        type="button"
                                        onClick={() => handleAddPresetCategory(categoria as CustoManualPreset['categoria'])}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                        Selecionar categoria
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {presets.map(preset => (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() => handleAddPreset(preset)}
                                            className="flex items-center justify-between px-3 py-2 text-left text-sm border rounded-md hover:border-blue-400 hover:bg-blue-50 transition"
                                            disabled={presetAlreadyAdded(preset)}
                                        >
                                            <span className="text-gray-800">{preset.descricao}</span>
                                            <span className="text-blue-700 font-semibold">{formatCurrency(preset.valor)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
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
                        <div key={custo.id} className={`p-3 rounded-md border ${custo.isReembolso ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="flex items-center gap-2">
                                <FormInput 
                                    type="text" 
                                    value={custo.descricao} 
                                    onChange={(e) => handleCustoAdicionalChange(custo.id, 'descricao', e.target.value)} 
                                    placeholder="Descrição do Custo" 
                                    className="flex-grow text-sm"
                                />
                                <FormSelect
                                    value={custo.categoria || 'Outro'}
                                    onChange={(e) => handleCustoAdicionalChange(custo.id, 'categoria', e.target.value)}
                                    className="w-44 text-sm"
                                >
                                    {manualCostCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </FormSelect>
                                <FormInput 
                                    type="number" 
                                    value={custo.valor} 
                                    onChange={(e) => handleCustoAdicionalChange(custo.id, 'valor', e.target.value)} 
                                    placeholder="Valor (R$)" 
                                    className={`w-32 text-sm text-right ${custo.isReembolso ? 'text-green-700 font-semibold' : ''}`}
                                    step="0.01"
                                />
                                <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={custo.isReembolso || false}
                                        onChange={(e) => handleCustoAdicionalChange(custo.id, 'isReembolso', e.target.checked)}
                                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                                    />
                                    <span className="text-xs text-gray-600">Reembolso</span>
                                </label>
                                <button type="button" onClick={() => handleDeleteCustoAdicional(custo.id)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                </button>
                            </div>
                            {custo.isReembolso && (
                                <div className="mt-2">
                                    <FormInput 
                                        type="text" 
                                        value={custo.motivoReembolso || ''} 
                                        onChange={(e) => handleCustoAdicionalChange(custo.id, 'motivoReembolso', e.target.value)} 
                                        placeholder="Motivo do reembolso (ex: Erro de cobrança, Devolução, etc.)" 
                                        className="w-full text-sm bg-white"
                                    />
                                </div>
                            )}
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