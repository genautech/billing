import React, { useState, useRef, useMemo } from 'react';
import type { CobrancaMensal, DetalheEnvio, TabelaPrecoItem, Cliente, CustoAdicional } from '../types';
// FIX: Corrected import path
import { generateClientInvoiceAnalysis, confirmarRecebimentoFatura, calculatePrecoVenda, calculatePrecoVendaForDisplay, isTemplateItem } from '../services/firestoreService';
import { useToast } from '../contexts/ToastContext';
import MarkdownRenderer from './MarkdownRenderer';

// These will be available on the window object from the CDN scripts
declare const jspdf: any;
declare const html2canvas: any;

interface ClientBillDetailProps {
    cobranca: CobrancaMensal;
    detalhes: DetalheEnvio[];
    custosAdicionais: CustoAdicional[];
    tabelaPrecos: TabelaPrecoItem[];
    client: Cliente | undefined;
    onUpdate: () => void;
}



const ClientBillDetail: React.FC<ClientBillDetailProps> = ({ cobranca, detalhes, custosAdicionais, tabelaPrecos, client, onUpdate }) => {
    const [isPdfLoading, setIsPdfLoading] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const pdfContentRef = useRef<HTMLDivElement>(null);
    const { addToast } = useToast();
    
    // State for Modals
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [isCostPerUserModalOpen, setIsCostPerUserModalOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState('');
    
    // State for view toggle
    const [viewMode, setViewMode] = useState<'categorized' | 'table'>('categorized');
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

    const handleGeneratePDF = async () => {
        if (!pdfContentRef.current) return;
        setIsPdfLoading(true);

        // Expand all orders before capturing to ensure complete content in PDF (only if in categorized mode)
        if (viewMode === 'categorized') {
            const allOrderCodes = Object.keys(groupedByOrder);
            if (allOrderCodes.length > 0) {
                setExpandedOrders(new Set(allOrderCodes));
                // Wait for React to render the expanded content
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        
        pdf.setFontSize(10);
        pdf.setTextColor(150);
        pdf.text("Yoobe Logistics", 15, 15);

        if (client?.logoUrl) {
            try {
                const img = new Image();
                img.crossOrigin = "Anonymous"; 
                img.src = client.logoUrl;
                await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                pdf.addImage(dataUrl, 'PNG', 150, 10, 45, 15, undefined, 'FAST');
            } catch (e) { console.error("Error adding client logo to PDF", e); }
        }
        
        pdf.setLineWidth(0.5);
        pdf.line(15, 28, 195, 28);
        pdf.setFontSize(18);
        pdf.setTextColor(0);
        pdf.text(`Fatura: ${cobranca.mesReferencia}`, 15, 40);
        pdf.setFontSize(10);
        pdf.text(`Cliente: ${client?.nome || 'N/A'}`, 15, 48);
        pdf.text(`CNPJ: ${client?.cnpj || 'N/A'}`, 15, 53);
        pdf.text(`Vencimento: ${formatDate(cobranca.dataVencimento)}`, 15, 58);
        if (cobranca.status) {
            pdf.text(`Status: ${cobranca.status}`, 15, 63);
        }

        // Capture with higher quality and better options for complete content
        const canvas = await html2canvas(pdfContentRef.current, { 
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: pdfContentRef.current.scrollWidth,
            windowHeight: pdfContentRef.current.scrollHeight
        });
        const imgData = canvas.toDataURL('image/png');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pdfWidth - 30;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

        // Handle multi-page PDF if content is too long
        const startY = 70;
        const pageHeight = pdfHeight - 20;
        const availableHeight = pageHeight - (startY - 20);
        
        if (imgHeight <= availableHeight) {
            // Content fits on one page
            pdf.addImage(imgData, 'PNG', 15, startY, imgWidth, imgHeight);
        } else {
            // Content spans multiple pages
            let heightLeft = imgHeight;
            let position = startY;
            
            pdf.addImage(imgData, 'PNG', 15, position, imgWidth, imgHeight);
            heightLeft -= availableHeight;
            
            while (heightLeft > 0) {
                position = 20 - (imgHeight - heightLeft);
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 15, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
        }
        
        const safeMonth = cobranca.mesReferencia.replace(/[^a-z0-9]/gi, '-');
        pdf.save(`fatura-${client?.nome?.toLowerCase().replace(' ','-')}-${safeMonth}.pdf`);
        setIsPdfLoading(false);
    };
    
    const handleExportCSV = () => {
        const headers = ['Data', 'Rastreio', 'CodigoPedido', 'Categoria', 'Subcategoria', 'Servico', 'Quantidade', 'PrecoUnitario', 'Subtotal'];
        const rows = detalhes.map(detalhe => {
            const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId);
            const precoUnitario = itemPreco ? calculatePrecoVendaForDisplay(itemPreco) : 0;
            const subtotal = precoUnitario * detalhe.quantidade;
            return [
                formatDate(detalhe.data),
                detalhe.rastreio,
                detalhe.codigoPedido,
                itemPreco?.categoria || 'N/A',
                itemPreco?.subcategoria || 'N/A',
                itemPreco?.descricao || 'Serviço não encontrado',
                detalhe.quantidade,
                precoUnitario.toFixed(4),
                subtotal.toFixed(4)
            ].join(',');
        });
        
        const additionalCostRows = custosAdicionais.map(custo => 
            ['-', '-', '-', 'Custo Adicional', '-', custo.descricao, 1, custo.valor.toFixed(4), custo.valor.toFixed(4)].join(',')
        );

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows, ...additionalCostRows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        const safeMonth = cobranca.mesReferencia.replace(/[^a-z0-9]/gi, '-');
        link.setAttribute("download", `detalhes-fatura-${client?.nome?.toLowerCase().replace(' ','-')}-${safeMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
    const getPrecoItemInfo = (id: string | null) => id ? tabelaPrecos.find(c => c.id === id) : undefined;

    const categoryTotals = useMemo(() => {
        const totals: Record<string, number> = {
            'Envios': cobranca.totalEnvio,
            'Custos Logísticos': cobranca.totalCustosLogisticos,
            'Armazenamento': cobranca.totalArmazenagem,
        };

        if (cobranca.totalCustosExtras && cobranca.totalCustosExtras > 0) {
            totals['Custos Extras do Pedido'] = cobranca.totalCustosExtras;
        }

        if (cobranca.totalCustosAdicionais && cobranca.totalCustosAdicionais > 0) {
            totals['Custos Adicionais'] = cobranca.totalCustosAdicionais;
        }
        
        // Filter out categories with 0 total and sort
        return Object.entries(totals)
            .filter(([, total]) => total > 0.001) // Use a small epsilon to handle floating point issues
            .sort(([, a], [, b]) => b - a);
            
    }, [cobranca]);
    
    const costPerOrderAnalysis = useMemo(() => {
        const uniqueOrders = new Set(detalhes.map(d => d.codigoPedido).filter(id => id && id !== 'ARMAZENAGEM'));
        const orderCount = uniqueOrders.size;
        const costPerOrder = orderCount > 0 ? cobranca.valorTotal / orderCount : 0;
        return { orderCount, costPerOrder };
    }, [detalhes, cobranca.valorTotal]);

    // Filter out template items, internal costs, and items with (TP) for display (but keep them in calculations)
    const filteredDetalhes = useMemo(() => {
        return detalhes.filter(detalhe => {
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (!itemPreco) return true; // Keep items without price table match
            
            // Filter out templates
            if (isTemplateItem(itemPreco)) return false;
            
            // Filter out "Custos Internos" category
            if (itemPreco.categoria === 'Custos Internos') return false;
            
            // Filter out items with "(TP)" in description
            if (itemPreco.descricao && itemPreco.descricao.includes('(TP)')) return false;
            
            return true;
        });
    }, [detalhes, tabelaPrecos]);

    // Group details by order code and then by category (using filtered details)
    const groupedByOrder = useMemo(() => {
        const grouped: Record<string, Record<string, DetalheEnvio[]>> = {};
        
        filteredDetalhes.forEach(detalhe => {
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
    }, [filteredDetalhes, tabelaPrecos]);

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
                
                let precoUnitario: number;
                let quantidadeExibida: number;
                
                if (isNonTemplateShipping) {
                    quantidadeExibida = 1;
                    precoUnitario = detalhe.quantidade;
                } else {
                    // Use calculatePrecoVendaForDisplay to handle templates of specific costs correctly
                    precoUnitario = calculatePrecoVendaForDisplay(itemPreco);
                    quantidadeExibida = detalhe.quantidade;
                }
                
                orderTotal += precoUnitario * quantidadeExibida;
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

    // Orders start collapsed (not expanded) by default
    // Removed automatic expansion - users can expand orders manually if needed

    const handleAiAnalysis = async () => {
        setIsAiModalOpen(true);
        setIsAnalyzing(true);
        setAnalysisResult('');
        try {
            if (!client) throw new Error("Dados do cliente não encontrados.");
            const result = await generateClientInvoiceAnalysis(cobranca, detalhes, tabelaPrecos, client);
            setAnalysisResult(result);
        } catch (error) {
            const msg = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            setAnalysisResult(`**Erro ao gerar análise:**\n\n${msg}`);
        } finally {
            setIsAnalyzing(false);
        }
    };
    
    const handleConfirmReceipt = async () => {
        setIsConfirming(true);
        try {
            await confirmarRecebimentoFatura(cobranca.id);
            addToast('Recebimento confirmado com sucesso!', 'success');
            onUpdate();
        } catch (error) {
            console.error("Failed to confirm receipt:", error);
            addToast('Erro ao confirmar o recebimento.', 'error');
        } finally {
            setIsConfirming(false);
        }
    };


    return (
        <>
            <div className="bg-white p-6 rounded-lg shadow-md animate-fade-in" >
                 <div ref={pdfContentRef}>
                    <div className="border-b border-gray-200 pb-4 mb-4">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Detalhes da Fatura - {cobranca.mesReferencia}</h3>
                                <p className="text-sm text-gray-500">Resumo dos serviços prestados</p>
                            </div>
                            <div className="w-full sm:w-auto sm:min-w-[280px] space-y-4">
                               <div className="border border-gray-200 p-3 rounded-lg space-y-2">
                                    <h4 className="text-sm font-semibold text-gray-700">Resumo por Categoria</h4>
                                    {categoryTotals.map(([categoria, total]) => (
                                        <div key={categoria} className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500">{categoria}</span>
                                            <span className="font-medium text-gray-800">{formatCurrency(total)}</span>
                                        </div>
                                    ))}
                               </div>
                                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-right">
                                    <p className="text-sm text-blue-600 font-medium">Valor Total</p>
                                    <p className="text-3xl font-extrabold text-blue-600">{formatCurrency(cobranca.valorTotal)}</p>
                                    <p className="text-sm text-red-600 font-medium mt-1">Vencimento: {formatDate(cobranca.dataVencimento)}</p>
                                </div>
                            </div>
                        </div>
                         {client?.unidadesEmEstoque && ( <p className="text-xs text-gray-400 mt-2">{client.unidadesEmEstoque.toLocaleString('pt-BR')} itens em estoque neste período.</p>)}
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
                                                        const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId);
                                                        if (!itemPreco) return sum;
                                                        
                                                        const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
                                                        const isTemplate = itemPreco.precoVenda === 1 && 
                                                                          (itemPreco.descricao?.toLowerCase().includes('(template)') || 
                                                                           itemPreco.descricao?.toLowerCase().includes('template'));
                                                        const isNonTemplateShipping = isShippingItem && !isTemplate;
                                                        
                                                        let precoUnitario: number;
                                                        let quantidadeExibida: number;
                                                        
                                                        if (isNonTemplateShipping) {
                                                            quantidadeExibida = 1;
                                                            precoUnitario = detalhe.quantidade;
                                                        } else {
                                                            // Use calculatePrecoVendaForDisplay to handle templates of specific costs correctly
                                                            precoUnitario = calculatePrecoVendaForDisplay(itemPreco);
                                                            quantidadeExibida = detalhe.quantidade;
                                                        }
                                                        
                                                        return sum + (precoUnitario * quantidadeExibida);
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
                                                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                                                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rastreio</th>
                                                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Serviço</th>
                                                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                                                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd.</th>
                                                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Unit.</th>
                                                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                                        {categoryDetails.map(detalhe => {
                                                                            const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId);
                                                                            if (!itemPreco) return null;
                                                                            
                                                                            const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
                                                                            const isTemplate = itemPreco.precoVenda === 1 && 
                                                                                              (itemPreco.descricao?.toLowerCase().includes('(template)') || 
                                                                                               itemPreco.descricao?.toLowerCase().includes('template'));
                                                                            const isNonTemplateShipping = isShippingItem && !isTemplate;
                                                                            
                                                                            let precoUnitario: number;
                                                                            let quantidadeExibida: number;
                                                                            
                                                                            if (isNonTemplateShipping) {
                                                                                quantidadeExibida = 1;
                                                                                precoUnitario = detalhe.quantidade;
                                                                            } else {
                                                                                // Use calculatePrecoVendaForDisplay to handle templates of specific costs correctly
                                                                                precoUnitario = calculatePrecoVendaForDisplay(itemPreco);
                                                                                quantidadeExibida = detalhe.quantidade;
                                                                            }
                                                                            
                                                                            const subtotal = precoUnitario * quantidadeExibida;
                                                                            
                                                                            return (
                                                                                <tr key={detalhe.id}>
                                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{formatDate(detalhe.data)}</td>
                                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-medium">{detalhe.rastreio}</td>
                                                                                    <td className="px-4 py-3 whitespace-normal text-sm text-gray-500">{`${itemPreco.subcategoria} - ${itemPreco.descricao}`}</td>
                                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                                                                        {detalhe.estado ? (
                                                                                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
                                                                                                {detalhe.estado}
                                                                                                {detalhe.cep && <span className="ml-1 text-blue-500">({detalhe.cep})</span>}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-gray-400">-</span>
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">{quantidadeExibida}</td>
                                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">{formatCurrency(precoUnitario)}</td>
                                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 font-semibold text-right">{formatCurrency(subtotal)}</td>
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
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rastreio / Pedido</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serviço</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qtd.</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Preço Unit.</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredDetalhes.map(detalhe => {
                                        const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId);
                                        if (!itemPreco) return null;
                                        
                                        // Special handling for non-template shipping items
                                        const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
                                        const isTemplate = itemPreco.precoVenda === 1 && 
                                                          (itemPreco.descricao?.toLowerCase().includes('(template)') || 
                                                           itemPreco.descricao?.toLowerCase().includes('template'));
                                        const isNonTemplateShipping = isShippingItem && !isTemplate;
                                        
                                        let precoUnitario: number;
                                        let quantidadeExibida: number;
                                        
                                        if (isNonTemplateShipping) {
                                            // For non-template shipping: quantity = 1, price = value from CSV (stored in quantidade)
                                            quantidadeExibida = 1;
                                            precoUnitario = detalhe.quantidade; // Use stored CSV value as price
                                        } else {
                                            // Use calculatePrecoVendaForDisplay to handle templates of specific costs correctly
                                            precoUnitario = calculatePrecoVendaForDisplay(itemPreco);
                                            quantidadeExibida = detalhe.quantidade;
                                        }
                                        
                                        const subtotal = precoUnitario * quantidadeExibida;
                                        
                                        return (
                                            <tr key={detalhe.id}>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(detalhe.data)}</td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                    <div>{detalhe.rastreio}</div>
                                                    <div className="text-xs text-gray-500">{detalhe.codigoPedido}</div>
                                                </td>
                                                <td className="px-4 py-4 whitespace-normal text-sm text-gray-500">{`${itemPreco.subcategoria} - ${itemPreco.descricao}`}</td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                                                    {detalhe.estado ? (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
                                                            {detalhe.estado}
                                                            {detalhe.cep && <span className="ml-1 text-blue-500">({detalhe.cep})</span>}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{quantidadeExibida}</td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{formatCurrency(precoUnitario)}</td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold text-right">{formatCurrency(subtotal)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {custosAdicionais.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-dashed">
                             <h4 className="text-md font-semibold text-gray-700 mb-2">Custos Adicionais</h4>
                             <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {custosAdicionais.map(custo => (
                                            <tr key={custo.id}>
                                                <td className="px-4 py-4 whitespace-normal text-sm text-gray-500">{custo.descricao}</td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold text-right">{formatCurrency(custo.valor)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 text-center">
                        <p className="text-xs text-gray-500 italic">
                            Nota: Os valores de envio dependem de múltiplos fatores (rota, peso, ofertas da transportadora) e os preços na tabela de referência podem ser maiores ou menores que o valor final cobrado.
                        </p>
                    </div>
                </div>

                {cobranca.urlPlanilhaConferencia && (
                    <div className="mt-6 pt-6 border-t">
                        <h4 className="text-md font-semibold text-gray-700 mb-3">Links Úteis</h4>
                        <a 
                            href={cobranca.urlPlanilhaConferencia} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center space-x-2 text-blue-600 bg-blue-100 hover:bg-blue-200 px-4 py-2 rounded-md font-medium transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
                            <span>Acessar Planilha de Conferência</span>
                        </a>
                    </div>
                )}


                <div className="mt-6 pt-6 border-t">
                    <h4 className="text-md font-semibold text-gray-700 mb-3">Análises e Ações</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <button onClick={handleAiAnalysis} className="flex items-center justify-center space-x-2 text-white px-4 py-2 rounded-md shadow-sm font-medium transition-colors w-full bg-purple-600 hover:bg-purple-700 text-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg><span>Analise inteligente da sua fatura</span></button>
                        <button onClick={() => setIsCostPerUserModalOpen(true)} className="flex items-center justify-center space-x-2 text-white px-4 py-2 rounded-md shadow-sm font-medium transition-colors w-full bg-blue-600 hover:bg-blue-700 text-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg><span>Custo por Pedido</span></button>
                        <button onClick={handleExportCSV} className="flex items-center justify-center space-x-2 text-gray-700 bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-md shadow-sm font-medium transition-colors w-full text-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg><span>Exportar CSV</span></button>
                        <button onClick={handleGeneratePDF} disabled={isPdfLoading} className="flex items-center justify-center space-x-2 text-white px-4 py-2 rounded-md shadow-sm font-medium transition-colors w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" /></svg><span>{isPdfLoading ? 'Gerando...' : 'Baixar PDF'}</span></button>
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t bg-gray-50 p-4 rounded-lg">
                    {cobranca.confirmadaPeloCliente || cobranca.status === 'Paga' ? (
                         <div className="flex items-center gap-2 text-green-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            <span className="font-medium">Recebimento da fatura confirmado.</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            <p className="text-sm text-gray-700">Ao clicar no botão ao lado, você confirma que recebeu e está ciente desta fatura.</p>
                            <button 
                                onClick={handleConfirmReceipt}
                                disabled={isConfirming}
                                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 shadow-sm font-medium transition-colors disabled:bg-gray-400 whitespace-nowrap"
                            >
                                {isConfirming ? 'Confirmando...' : 'Confirmar Recebimento'}
                            </button>
                        </div>
                    )}
                </div>

            </div>

            {/* AI Analysis Modal */}
            {isAiModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setIsAiModalOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <header className="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
                            <div className="flex items-center gap-3">
                                <div className="bg-purple-600 rounded-lg p-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-gray-900">Análise Inteligente da Fatura</h2>
                            </div>
                            <button 
                                onClick={() => setIsAiModalOpen(false)} 
                                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </header>
                        <div className="flex-1 p-6 overflow-y-auto bg-gray-50">
                            {isAnalyzing ? (
                                <div className="text-center py-12">
                                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
                                    <p className="text-gray-600 font-medium">Analisando dados da fatura...</p>
                                    <p className="text-sm text-gray-500 mt-2">Isso pode levar alguns segundos</p>
                                </div>
                            ) : analysisResult ? (
                                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                                    <div className="prose prose-lg max-w-none">
                                        <MarkdownRenderer content={analysisResult} />
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-gray-500">
                                    <p>Nenhuma análise disponível. Clique no botão para gerar uma análise inteligente.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Cost Per User Modal */}
            {isCostPerUserModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setIsCostPerUserModalOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <header className="flex justify-between items-center p-4 border-b"><h2 className="text-lg font-semibold text-gray-800">Análise de Custo por Pedido</h2><button onClick={() => setIsCostPerUserModalOpen(false)} className="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></header>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">Esta análise calcula o custo logístico médio para cada pedido único enviado no período de <span className="font-semibold">{cobranca.mesReferencia}</span>.</p>
                            <div className="bg-gray-50 p-4 rounded-lg border">
                                <div className="flex justify-between items-center"><span className="text-gray-600">Total de Pedidos Únicos</span><span className="font-bold text-lg">{costPerOrderAnalysis.orderCount}</span></div>
                                <div className="flex justify-between items-center mt-2"><span className="text-gray-600">Valor Total da Fatura</span><span className="font-bold text-lg">{formatCurrency(cobranca.valorTotal)}</span></div>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 text-center">
                                <p className="text-sm text-blue-800">Custo Médio por Pedido</p>
                                <p className="text-3xl font-extrabold text-blue-600">{formatCurrency(costPerOrderAnalysis.costPerOrder)}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ClientBillDetail;