import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Tooltip } from 'recharts';
import type { CobrancaMensal, DetalheEnvio, TabelaPrecoItem, Cliente, CustoAdicional, DocumentoPedido, GeneralSettings, ComprovanteDifal } from '../types';
// FIX: Corrected import path
import { generateClientInvoiceAnalysis, confirmarRecebimentoFatura, calculatePrecoVenda, calculatePrecoVendaForDisplay, isTemplateItem, getCostCategoryGroupForItem, getDisplayDescriptionForPriceItem, getDocumentosByCobrancaId, getGeneralSettings, createFindItemPreco } from '../services/firestoreService';
import { generateCicloNotaFiscalExplanation } from '../services/geminiContentService';
import { useToast } from '../contexts/ToastContext';
import MarkdownRenderer from './MarkdownRenderer';
import CicloNotaFiscalInfographic from './CicloNotaFiscalInfographic';

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
    settings?: GeneralSettings | null;
}



// Componente auxiliar para seções colapsáveis
const CollapsibleSection: React.FC<{
    title: string;
    defaultExpanded?: boolean;
    actionButton?: React.ReactNode;
    children: React.ReactNode;
}> = ({ title, defaultExpanded = false, actionButton, children }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
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
                    <h5 className="text-lg font-semibold text-gray-800">{title}</h5>
                </div>
                {actionButton && (
                    <div onClick={(e) => e.stopPropagation()}>
                        {actionButton}
                    </div>
                )}
            </button>
            {isExpanded && (
                <div className="bg-white p-6 border-t border-gray-200">
                    {children}
                </div>
            )}
        </div>
    );
};

const ClientBillDetail: React.FC<ClientBillDetailProps> = ({ cobranca, detalhes, custosAdicionais, tabelaPrecos, client, onUpdate, settings: initialSettings }) => {
    const [isPdfLoading, setIsPdfLoading] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const pdfContentRef = useRef<HTMLDivElement>(null);
    const pdfTemplateRef = useRef<HTMLDivElement>(null);
    const { addToast } = useToast();
    
    // State for Modals
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [isCostPerUserModalOpen, setIsCostPerUserModalOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState('');
    
    // State for view toggle
    const [viewMode, setViewMode] = useState<'byCategory' | 'categorized' | 'table'>('byCategory');
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    
    // State for Documents and Payment
    const [documentos, setDocumentos] = useState<DocumentoPedido[]>([]);
    const [settings, setSettings] = useState<GeneralSettings | null>(initialSettings || null);
    const [cicloExplanation, setCicloExplanation] = useState<string>('');
    const [isLoadingCicloExplanation, setIsLoadingCicloExplanation] = useState(false);
    
    useEffect(() => {
        loadDocumentos();
        if (!initialSettings) {
            loadSettings();
        }
    }, [cobranca.id]);

    const handleGeneratePDF = async () => {
        const target = pdfTemplateRef.current || pdfContentRef.current;
        if (!target) return;
        setIsPdfLoading(true);

        try {
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

        // Calculate optimal scale to avoid exceeding browser canvas limits (max ~16384px)
        const MAX_CANVAS_HEIGHT = 16000;
        const contentHeight = target.scrollHeight;
        const contentWidth = target.scrollWidth;
        let scale = 2; // Default high quality
        
        // If content would exceed max height at scale 2, reduce scale
        if (contentHeight * scale > MAX_CANVAS_HEIGHT) {
            scale = Math.max(0.5, MAX_CANVAS_HEIGHT / contentHeight);
        }
        
        // Capture with optimized scale to avoid exceeding browser limits
        const canvas = await html2canvas(target, { 
            scale: scale,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: contentWidth,
            windowHeight: contentHeight
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

        const downloadLinks: { label: string; url: string }[] = [];
        if (cobranca.trackReportDownloadUrl) downloadLinks.push({ label: 'Relatório de Rastreio (Track Report)', url: cobranca.trackReportDownloadUrl });
        if (cobranca.orderDetailListagemDownloadUrl) downloadLinks.push({ label: 'Relatório de Envios (Order Detail – listagem)', url: cobranca.orderDetailListagemDownloadUrl });
        (cobranca.arquivosComplementares || []).forEach((arq) => downloadLinks.push({ label: arq.nome, url: arq.url }));

        if (downloadLinks.length > 0) {
            const marginLeft = 15;
            const marginTop = 15;
            pdf.addPage();
            pdf.setFontSize(14);
            pdf.text('Arquivos complementares', marginLeft, marginTop + 10);
            pdf.setFontSize(10);
            let y = marginTop + 20;
            for (const item of downloadLinks) {
                pdf.setTextColor(0, 0, 0);
                pdf.text(`${item.label}: `, marginLeft, y);
                const labelWidth = pdf.getTextWidth(`${item.label}: `);
                if (typeof pdf.textWithLink === 'function') {
                    pdf.setTextColor(0, 0, 255);
                    pdf.textWithLink('Download', marginLeft + labelWidth, y, { url: item.url });
                    pdf.setTextColor(0, 0, 0);
                } else {
                    pdf.text(`Download (${item.url})`, marginLeft + labelWidth, y);
                }
                y += 8;
            }
        }
        
        const safeMonth = cobranca.mesReferencia.replace(/[^a-z0-9]/gi, '-');
        pdf.save(`fatura-${client?.nome?.toLowerCase().replace(' ','-')}-${safeMonth}.pdf`);
        
        addToast('PDF gerado com sucesso! Verifique sua pasta de downloads.', 'success');
        setIsPdfLoading(false);
        } catch (error) {
            console.error("PDF generation error:", error);
            addToast('Erro ao gerar PDF. Tente novamente.', 'error');
            setIsPdfLoading(false);
        }
    };
    
    const handleExportCSV = () => {
        const headers = ['Data', 'Rastreio', 'CodigoPedido', 'Categoria', 'Subcategoria', 'Servico', 'Quantidade', 'PrecoUnitario', 'Subtotal'];
        const rows = detalhes.map(detalhe => {
            const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId);
            if (!itemPreco) {
                return [
                    formatDate(detalhe.data),
                    detalhe.rastreio,
                    detalhe.codigoPedido,
                    'N/A',
                    'N/A',
                    'Serviço não encontrado',
                    detalhe.quantidade,
                    '0',
                    '0'
                ].join(',');
            }
            
            const precoUnitario = getPrecoUnitarioDetalhe(detalhe, itemPreco);
            const quantidadeExibida = getQuantidadeExibida(detalhe, itemPreco);
            const subtotal = precoUnitario * quantidadeExibida;

            return [
                formatDate(detalhe.data),
                detalhe.rastreio,
                detalhe.codigoPedido,
                itemPreco.categoria,
                itemPreco.subcategoria,
                getDisplayDescriptionForPriceItem(itemPreco.descricao),
                quantidadeExibida,
                precoUnitario.toFixed(2),
                subtotal.toFixed(2)
            ].join(',');
        });
        
        // Separate custos adicionais from reembolsos
        const additionalCostRows = custosAdicionais
            .filter(custo => !custo.isReembolso)
            .map(custo => 
                ['-', '-', '-', 'Custo Adicional', custo.categoria || '-', getDisplayDescriptionForPriceItem(custo.descricao), 1, custo.valor.toFixed(2), custo.valor.toFixed(2)].join(',')
            );
        
        const reembolsoRows = custosAdicionais
            .filter(custo => custo.isReembolso)
            .map(custo => 
                ['-', '-', '-', 'Reembolso', custo.motivoReembolso || '-', getDisplayDescriptionForPriceItem(custo.descricao), 1, (-custo.valor).toFixed(2), (-custo.valor).toFixed(2)].join(',')
            );

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows, ...additionalCostRows, ...reembolsoRows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        const safeMonth = cobranca.mesReferencia.replace(/[^a-z0-9]/gi, '-');
        link.setAttribute("download", `detalhes-fatura-${client?.nome?.toLowerCase().replace(' ','-')}-${safeMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
    // getPrecoItemInfo is defined after findItemPreco below

    const categoryTotals = useMemo(() => {
        const totals: Record<string, number> = {
            'Envios': cobranca.totalEnvio,
            'Custos Logísticos': cobranca.totalCustosLogisticos,
            'Armazenamento': cobranca.totalArmazenagem,
        };

        if (cobranca.totalCustosExtras && cobranca.totalCustosExtras > 0) {
            totals['Custos Extras do Pedido'] = cobranca.totalCustosExtras;
        }

        // Calculate custos adicionais and reembolsos from the custosAdicionais prop
        const custosRegulares = custosAdicionais.filter(c => !c.isReembolso);
        const reembolsos = custosAdicionais.filter(c => c.isReembolso);
        const totalCustosRegulares = custosRegulares.reduce((sum, c) => sum + c.valor, 0);
        const totalReembolsos = reembolsos.reduce((sum, c) => sum + c.valor, 0);

        const custosAdicionaisTotal = cobranca.totalCustosAdicionais ?? totalCustosRegulares;
        if (custosAdicionaisTotal > 0) {
            totals['Custos Adicionais'] = custosAdicionaisTotal;
        }

        if (totalReembolsos > 0) {
            totals['Reembolsos'] = -totalReembolsos; // Negative to show as discount
        }
        
        // Filter out categories with 0 total and sort
        return Object.entries(totals)
            .filter(([, total]) => Math.abs(total) > 0.001) // Use a small epsilon to handle floating point issues
            .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));
            
    }, [cobranca, custosAdicionais]);
    
    const costPerOrderAnalysis = useMemo(() => {
        const uniqueOrders = new Set(detalhes.map(d => d.codigoPedido).filter(id => id && id !== 'ARMAZENAGEM'));
        const orderCount = uniqueOrders.size;
        const costPerOrder = orderCount > 0 ? cobranca.valorTotal / orderCount : 0;
        return { orderCount, costPerOrder };
    }, [detalhes, cobranca.valorTotal]);

    // Resolve price item by ID with fallback for unknown/obsolete IDs (shared with dashboard)
    const findItemPreco = useMemo(() => createFindItemPreco(tabelaPrecos), [tabelaPrecos]);

    // Helper function using findItemPreco with fallback (without context)
    const getPrecoItemInfo = (id: string | null, context?: { codigoPedido?: string; quantidade?: number }) => 
        id ? findItemPreco(id, context) : undefined;

    // Effective unit price: manual override or calculated from table (used for client display)
    const getPrecoUnitarioDetalhe = (detalhe: DetalheEnvio, itemPreco: TabelaPrecoItem | undefined): number => {
        if (!itemPreco) return 0;
        if (detalhe.precoUnitarioManual != null) return Number(detalhe.precoUnitarioManual);
        const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
        const isDifalItem = itemPreco.categoria === 'Difal' || itemPreco.descricao?.toLowerCase().includes('difal');
        const isTemplate = isTemplateItem(itemPreco);
        const DIFAL_MIN_PRICE = 3.00;
        if (isDifalItem) return Math.max(calculatePrecoVenda(itemPreco, detalhe.quantidade), DIFAL_MIN_PRICE);
        if (isTemplate || isShippingItem || isDifalItem) return calculatePrecoVenda(itemPreco, detalhe.quantidade);
        return calculatePrecoVendaForDisplay(itemPreco);
    };

    const getQuantidadeExibida = (detalhe: DetalheEnvio, itemPreco: TabelaPrecoItem | undefined): number => {
        if (!itemPreco) return 0;
        const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
        const isTemplate = isTemplateItem(itemPreco);
        const isDifalItem = itemPreco.categoria === 'Difal' || itemPreco.descricao?.toLowerCase().includes('difal');
        if (isDifalItem || (isShippingItem && !isTemplate)) return 1;
        return detalhe.quantidade;
    };

    // Extract storage breakdown from invoice details for transparent display
    const storageBreakdown = useMemo(() => {
        return detalhes
            .filter(d => d.codigoPedido?.includes('ARMAZENAGEM'))
            .map(d => {
                const itemPreco = findItemPreco(d.tabelaPrecoItemId, { quantidade: d.quantidade });
                const label = d.codigoPedido?.replace('ARMAZENAGEM (', '').replace(')', '') || 'Item';
                const precoUnitario = getPrecoUnitarioDetalhe(d, itemPreco);
                const qty = getQuantidadeExibida(d, itemPreco);
                const subtotal = precoUnitario * qty;
                return {
                    label,
                    quantidade: d.quantidade,
                    precoUnitario,
                    subtotal
                };
            })
            .filter(item => item.quantidade > 0);
    }, [detalhes, findItemPreco]);

    // Filter out internal costs but KEEP shipping items (even if template) for display
    const filteredDetalhes = useMemo(() => {
        console.log('🔍 ClientBillDetail - Total detalhes recebidos:', detalhes.length);
        console.log('🔍 ClientBillDetail - Primeiros 3 detalhes:', detalhes.slice(0, 3));
        console.log('🔍 ClientBillDetail - TabelaPrecos count:', tabelaPrecos.length);
        
        const filtered = detalhes.filter(detalhe => {
            const itemPreco = findItemPreco(detalhe.tabelaPrecoItemId, { 
                codigoPedido: detalhe.codigoPedido, 
                quantidade: detalhe.quantidade 
            });
            if (!itemPreco) {
                console.log('❌ Item não encontrado na tabela para ID:', detalhe.tabelaPrecoItemId);
                return true; // Keep items without price table match
            }
            
            // Always keep shipping items (Envios, Retornos) - they need to be displayed
            const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
            if (isShippingItem) return true;
            
            // Always keep storage items (Armazenamento/Armazenagem)
            const catLower = itemPreco.categoria.toLowerCase();
            if (catLower.includes('armazenamento') || catLower.includes('armazenagem')) return true;
            
            // Always keep DIFAL items - they should appear on client invoice
            const isDifalItem = itemPreco.categoria === 'Difal' || 
                itemPreco.descricao?.toLowerCase().includes('difal');
            if (isDifalItem) return true;
            
            // Filter out templates for non-essential items
            if (isTemplateItem(itemPreco)) return false;
            
            // Filter out "Custos Internos" category (except DIFAL which was already kept)
            if (itemPreco.categoria === 'Custos Internos') return false;
            
            // Filter out items with "(TP)" in description (except shipping/DIFAL which were already kept)
            if (itemPreco.descricao && itemPreco.descricao.includes('(TP)')) return false;
            
            return true;
        });
        
        console.log('🔍 ClientBillDetail - Detalhes após filtro:', filtered.length);
        return filtered;
    }, [detalhes, tabelaPrecos]);

    // Group details by order code and then by category (using filtered details)
    const groupedByOrder = useMemo(() => {
        const grouped: Record<string, Record<string, DetalheEnvio[]>> = {};
        
        filteredDetalhes.forEach(detalhe => {
            const orderCode = detalhe.codigoPedido || 'Sem Pedido';
            const itemPreco = findItemPreco(detalhe.tabelaPrecoItemId, { 
                codigoPedido: detalhe.codigoPedido, 
                quantidade: detalhe.quantidade 
            });
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
    }, [filteredDetalhes, findItemPreco]);

    // Calculate totals for each order
    const orderTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        let debugCount = 0;
        
        Object.entries(groupedByOrder).forEach(([orderCode, categories]) => {
            let orderTotal = 0;
            Object.values(categories).flat().forEach(detalhe => {
                const itemPreco = findItemPreco(detalhe.tabelaPrecoItemId, { 
                    codigoPedido: detalhe.codigoPedido, 
                    quantidade: detalhe.quantidade 
                });
                if (!itemPreco) {
                    if (debugCount < 3) console.log('❌ orderTotals - Item não encontrado:', detalhe.tabelaPrecoItemId);
                    return;
                }
                
                const precoUnitario = getPrecoUnitarioDetalhe(detalhe, itemPreco);
                const quantidadeExibida = getQuantidadeExibida(detalhe, itemPreco);
                const subtotal = precoUnitario * quantidadeExibida;
                debugCount++;
                orderTotal += subtotal;
            });
            totals[orderCode] = orderTotal;
        });
        
        console.log('📊 orderTotals - Totais calculados:', Object.keys(totals).length, 'pedidos');
        console.log('📊 orderTotals - Primeiros 3:', Object.entries(totals).slice(0, 3));
        
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

    const toggleCategory = (category: string) => {
        setExpandedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(category)) {
                newSet.delete(category);
            } else {
                newSet.add(category);
            }
            return newSet;
        });
    };

    // Group details by category only (aggregating same items within each category)
    interface AggregatedItem {
        descricao: string;
        subcategoria: string;
        quantidade: number;
        subtotal: number;
        precoUnitario: number;
        tabelaPrecoItemId: string | null;
    }

    const groupedByCategory = useMemo(() => {
        const grouped: Record<string, { items: AggregatedItem[]; total: number }> = {};
        
        filteredDetalhes.forEach(detalhe => {
            const itemPreco = findItemPreco(detalhe.tabelaPrecoItemId, { 
                codigoPedido: detalhe.codigoPedido, 
                quantidade: detalhe.quantidade 
            });
            if (!itemPreco) return;
            
            const category = getCostCategoryGroupForItem(itemPreco) === 'custosAdicionais' ? 'Custos Adicionais' : (itemPreco.categoria || 'Outros');
            
            if (!grouped[category]) {
                grouped[category] = { items: [], total: 0 };
            }
            
            const precoUnitario = getPrecoUnitarioDetalhe(detalhe, itemPreco);
            const quantidadeExibida = getQuantidadeExibida(detalhe, itemPreco);
            const subtotal = precoUnitario * quantidadeExibida;

            // Find if this item already exists in the category (aggregate by display description)
            const displayDesc = getDisplayDescriptionForPriceItem(itemPreco.descricao);
            const existingItem = grouped[category].items.find(
                item => item.descricao === displayDesc && item.subcategoria === itemPreco.subcategoria
            );
            
            if (existingItem) {
                existingItem.quantidade += quantidadeExibida;
                existingItem.subtotal += subtotal;
            } else {
                grouped[category].items.push({
                    descricao: displayDesc,
                    subcategoria: itemPreco.subcategoria,
                    quantidade: quantidadeExibida,
                    subtotal,
                    precoUnitario,
                    tabelaPrecoItemId: detalhe.tabelaPrecoItemId
                });
            }
            
            grouped[category].total += subtotal;
        });
        
        // Sort categories by total (descending)
        return Object.entries(grouped)
            .sort(([, a], [, b]) => b.total - a.total)
            .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {} as Record<string, { items: AggregatedItem[]; total: number }>);
    }, [filteredDetalhes, findItemPreco, tabelaPrecos]);

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
    
    const loadDocumentos = async () => {
        try {
            const docs = await getDocumentosByCobrancaId(cobranca.id);
            setDocumentos(docs);
        } catch (error) {
            console.error("Failed to load documentos:", error);
        }
    };

    const loadSettings = async () => {
        try {
            const settingsData = await getGeneralSettings();
            setSettings(settingsData);
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
    };

    const handleLoadCicloExplanation = async () => {
        setIsLoadingCicloExplanation(true);
        try {
            const explanation = await generateCicloNotaFiscalExplanation();
            setCicloExplanation(explanation);
        } catch (error) {
            console.error("Failed to load ciclo explanation:", error);
            addToast('Erro ao carregar explicação do ciclo.', 'error');
        } finally {
            setIsLoadingCicloExplanation(false);
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
                    {/* Seção 1 - Fatura em Destaque */}
                    <div className="border-b border-gray-200 pb-6 mb-6">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900">Fatura - {cobranca.mesReferencia}</h3>
                                <p className="text-sm text-gray-500 mt-1">Resumo dos serviços prestados</p>
                                <div className="flex flex-wrap gap-3 mt-2">
                                    {(cobranca.periodoCobranca || cobranca.mesReferencia) && (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            {cobranca.periodoCobranca || cobranca.mesReferencia}
                                        </span>
                                    )}
                                    {(cobranca.quantidadeEnviosDisplay ?? cobranca.quantidadeEnvios) != null && (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                            </svg>
                                            {(cobranca.quantidadeEnviosDisplay ?? cobranca.quantidadeEnvios)?.toLocaleString('pt-BR')} envios
                                        </span>
                                    )}
                                </div>
                                {client?.unidadesEmEstoque && (
                                    <p className="text-xs text-gray-400 mt-2">{client.unidadesEmEstoque.toLocaleString('pt-BR')} itens em estoque neste período.</p>
                                )}
                            </div>
                            <div className="w-full sm:w-auto sm:min-w-[280px] space-y-4">
                               <div className="border border-gray-200 p-3 rounded-lg space-y-2">
                                    <h4 className="text-sm font-semibold text-gray-700">Resumo por Categoria</h4>
                                    {(() => {
                                        const totalVal = categoryTotals.reduce((s, [, v]) => s + Math.abs(v), 0);
                                        const chartColors: Record<string, string> = {
                                            'Envios': '#3b82f6',
                                            'Custos Logísticos': '#8b5cf6',
                                            'Armazenamento': '#a855f7',
                                            'Custos Extras do Pedido': '#f97316',
                                            'Custos Adicionais': '#f59e0b',
                                            'Reembolsos': '#10b981'
                                        };
                                        const chartData = categoryTotals.map(([categoria, total]) => ({
                                            name: categoria,
                                            value: Math.abs(total),
                                            color: chartColors[categoria] ?? '#6b7280'
                                        })).filter(d => d.value > 0.001);
                                        return (
                                            <div className="flex flex-col sm:flex-row gap-4 items-start">
                                                {chartData.length > 0 && totalVal > 0 && (
                                                    <div className="flex-shrink-0" style={{ width: '140px', height: '140px' }}>
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <RechartsPieChart>
                                                                <Pie
                                                                    data={chartData}
                                                                    cx="50%"
                                                                    cy="50%"
                                                                    innerRadius={40}
                                                                    outerRadius={65}
                                                                    paddingAngle={2}
                                                                    dataKey="value"
                                                                >
                                                                    {chartData.map((entry, index) => (
                                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                                    ))}
                                                                </Pie>
                                                                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                                            </RechartsPieChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    {categoryTotals.map(([categoria, total]) => {
                                                        const isReembolso = categoria === 'Reembolsos';
                                                        return (
                                                            <div key={categoria} className={`flex justify-between items-center text-xs ${isReembolso ? 'bg-emerald-50 -mx-2 px-2 py-1 rounded' : ''}`}>
                                                                <span className={isReembolso ? 'text-emerald-600 font-medium' : 'text-gray-500'}>
                                                                    {categoria}
                                                                </span>
                                                                <span className={`font-medium ${isReembolso ? 'text-emerald-700' : 'text-gray-800'}`}>
                                                                    {isReembolso ? `- ${formatCurrency(Math.abs(total))}` : formatCurrency(total)}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                               </div>
                               
                               {/* Storage Breakdown Detail */}
                               {storageBreakdown.length > 0 && (
                                   <div className="border border-amber-200 bg-amber-50 p-3 rounded-lg">
                                       <h5 className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                                           <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                           </svg>
                                           Detalhamento Armazenagem
                                       </h5>
                                       <div className="space-y-1.5">
                                           {storageBreakdown.map((item, idx) => (
                                               <div key={idx} className="flex justify-between items-center text-xs gap-2">
                                                   <span className="text-amber-700 flex-shrink-0">{item.label}</span>
                                                   <span className="text-amber-600 text-[10px] flex-grow text-center border-b border-dotted border-amber-300"></span>
                                                   <span className="text-amber-800 text-[10px] flex-shrink-0">
                                                       {item.quantidade} × {formatCurrency(item.precoUnitario)}
                                                   </span>
                                                   <span className="text-amber-900 font-semibold flex-shrink-0 min-w-[80px] text-right">
                                                       = {formatCurrency(item.subtotal)}
                                                   </span>
                                               </div>
                                           ))}
                                           <div className="border-t-2 border-amber-400 pt-2 mt-2 flex justify-between items-center text-xs">
                                               <span className="text-amber-800 font-bold">Total Armazenagem</span>
                                               <span className="text-amber-900 font-bold text-sm">
                                                   {formatCurrency(storageBreakdown.reduce((sum, item) => sum + item.subtotal, 0))}
                                               </span>
                                           </div>
                                       </div>
                                   </div>
                               )}
                                <div className="bg-blue-50 border-2 border-blue-300 p-5 rounded-lg text-right shadow-sm">
                                    <p className="text-sm text-blue-600 font-medium">Valor Total</p>
                                    <p className="text-3xl font-extrabold text-blue-600">{formatCurrency(cobranca.valorTotal)}</p>
                                    <p className="text-sm text-red-600 font-medium mt-2">Vencimento: {formatDate(cobranca.dataVencimento)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    
                    {/* Seção 2.5 - Notas de Remessa de Envio (se houver) */}
                    {cobranca.comprovantesDifal && cobranca.comprovantesDifal.length > 0 && (
                        <div className="mb-6 pb-6 border-b border-gray-200 print:hidden">
                            <h4 className="text-md font-semibold text-gray-700 mb-3">Notas de Remessa de Envio</h4>
                            <p className="text-sm text-gray-500 mb-3">
                                Notas fiscais de remessa de envio (brinde/doação) anexadas a esta fatura. Estes XMLs são comprovantes de envio com valores simbólicos, disponíveis para download. O DIFAL é cobrado separadamente (mín. R$ 3,00 por pedido).
                            </p>
                            <div className="bg-purple-50 border border-purple-200 rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-purple-100">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-purple-800">Chave NFe</th>
                                            <th className="px-3 py-2 text-left font-medium text-purple-800">Data</th>
                                            <th className="px-3 py-2 text-left font-medium text-purple-800">Pedido</th>
                                            <th className="px-3 py-2 text-left font-medium text-purple-800">Email</th>
                                            <th className="px-3 py-2 text-left font-medium text-purple-800">Download</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-purple-100">
                                        {cobranca.comprovantesDifal
                                            .filter((comp: ComprovanteDifal) => {
                                                // Filtra por cliente
                                                if (comp.clienteId && comp.clienteId !== cobranca.clienteId) return false;
                                                // Se tiver pedidoRelacionado, mostrar apenas se existir nos detalhes
                                                if (comp.pedidoRelacionado) {
                                                    const hasPedido = detalhes.some(d => d.codigoPedido === comp.pedidoRelacionado);
                                                    if (!hasPedido) return false;
                                                }
                                                // Se tiver emailRelacionado, mostrar se bater com email do cliente
                                                if (comp.emailRelacionado) {
                                                    const clientEmails = [client?.email, client?.emailFaturamento].filter(Boolean).map(e => e!.toLowerCase());
                                                    if (!clientEmails.includes(comp.emailRelacionado.toLowerCase())) return false;
                                                }
                                                return true;
                                            })
                                            .map((comp: ComprovanteDifal, idx: number) => (
                                            <tr key={comp.chaveNFe} className={idx % 2 === 0 ? 'bg-white' : 'bg-purple-50/50'}>
                                                <td className="px-3 py-2 font-mono text-xs truncate max-w-[200px]" title={comp.chaveNFe}>
                                                    {comp.chaveNFe.substring(0, 6)}...{comp.chaveNFe.substring(38)}
                                                </td>
                                                <td className="px-3 py-2">{formatDate(comp.dataEmissao)}</td>
                                                <td className="px-3 py-2 truncate max-w-[150px]" title={comp.pedidoRelacionado || '-'}>
                                                    {comp.pedidoRelacionado || '-'}
                                                </td>
                                                <td className="px-3 py-2 truncate max-w-[180px]" title={comp.emailRelacionado || '-'}>
                                                    {comp.emailRelacionado || '-'}
                                                </td>
                                                <td className="px-3 py-2 text-left">
                                                    {comp.xmlDriveId ? (
                                                        <a
                                                            href={`https://drive.google.com/file/d/${comp.xmlDriveId}/view?usp=drivesdk`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 underline"
                                                        >
                                                            Abrir no Drive
                                                        </a>
                                                    ) : (
                                                        <span className="text-gray-500">{comp.xmlFileName}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    
                    {/* Seção 3 - Detalhamento */}
                    <div className="mb-6">
                        <div className="mb-4 flex items-center justify-between">
                            <h4 className="text-lg font-semibold text-gray-800">Detalhamento dos Itens</h4>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setViewMode('byCategory')}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                        viewMode === 'byCategory'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    }`}
                                >
                                    Por Categoria
                                </button>
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

                    {viewMode === 'byCategory' ? (
                        <div className="space-y-4">
                            {Object.entries(groupedByCategory).map(([category, data]) => {
                                const { items, total } = data as { items: AggregatedItem[]; total: number };
                                const isExpanded = expandedCategories.has(category);
                                
                                return (
                                    <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                                        <button
                                            onClick={() => toggleCategory(category)}
                                            className="w-full bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 px-4 py-3 flex items-center justify-between transition-colors"
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
                                                    <span className="font-semibold text-gray-900">{category}</span>
                                                    <span className="ml-2 text-sm text-gray-500">
                                                        ({items.length} {items.length === 1 ? 'item' : 'itens'})
                                                    </span>
                                                </div>
                                            </div>
                                            <span className="font-bold text-gray-900">{formatCurrency(total)}</span>
                                        </button>
                                        
                                        {isExpanded && (
                                            <div className="bg-white">
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead className="bg-gray-50">
                                                            <tr>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Serviço</th>
                                                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd.</th>
                                                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Unit.</th>
                                                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {items.map((item, idx) => (
                                                                <tr key={`${item.descricao}-${idx}`}>
                                                                    <td className="px-4 py-3 whitespace-normal text-sm text-gray-700">
                                                                        <span className="font-medium">{item.subcategoria}</span>
                                                                        <span className="text-gray-500"> - {item.descricao}</span>
                                                                    </td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-right">{item.quantidade}</td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-right">{formatCurrency(item.precoUnitario)}</td>
                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 font-semibold text-right">{formatCurrency(item.subtotal)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                        <tfoot className="bg-gray-50">
                                                            <tr>
                                                                <td colSpan={3} className="px-4 py-2 text-right text-sm font-medium text-gray-700">Total {category}</td>
                                                                <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">{formatCurrency(total)}</td>
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : viewMode === 'categorized' ? (
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
                                                        const precoUnitario = getPrecoUnitarioDetalhe(detalhe, itemPreco);
                                                        const quantidadeExibida = getQuantidadeExibida(detalhe, itemPreco);
                                                        return sum + precoUnitario * quantidadeExibida;
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
                                                                        {categoryDetails.map((detalhe, di) => {
                                                                            const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId);
                                                                            if (!itemPreco) return null;
                                                                            const precoUnitario = getPrecoUnitarioDetalhe(detalhe, itemPreco);
                                                                            const quantidadeExibida = getQuantidadeExibida(detalhe, itemPreco);
                                                                            const subtotal = precoUnitario * quantidadeExibida;
                                                                            return (
                                                                                <tr key={`detalhe-${di}-${detalhe.id}`}>
                                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{formatDate(detalhe.data)}</td>
                                                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-medium">{detalhe.rastreio}</td>
                                                                                    <td className="px-4 py-3 whitespace-normal text-sm text-gray-500">{`${itemPreco.subcategoria} - ${getDisplayDescriptionForPriceItem(itemPreco.descricao)}`}</td>
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
                                    {filteredDetalhes.map((detalhe, di) => {
                                        const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId);
                                        if (!itemPreco) return null;
                                        const precoUnitario = getPrecoUnitarioDetalhe(detalhe, itemPreco);
                                        const quantidadeExibida = getQuantidadeExibida(detalhe, itemPreco);
                                        const subtotal = precoUnitario * quantidadeExibida;
                                        return (
                                            <tr key={`detalhe-${di}-${detalhe.id}`}>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(detalhe.data)}</td>
                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                    <div>{detalhe.rastreio}</div>
                                                    <div className="text-xs text-gray-500">{detalhe.codigoPedido}</div>
                                                </td>
                                                <td className="px-4 py-4 whitespace-normal text-sm text-gray-500">{`${itemPreco.subcategoria} - ${getDisplayDescriptionForPriceItem(itemPreco.descricao)}`}</td>
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

                    {/* Entradas de Material */}
                    {filteredDetalhes.filter(d => d.codigoPedido === 'ENTRADA DE MATERIAL').length > 0 && (
                        <div className="mt-6 pt-4 border-t border-dashed">
                            <h4 className="text-md font-semibold text-indigo-700 mb-2 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                                </svg>
                                Entradas de Material
                            </h4>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-indigo-100">
                                    <thead className="bg-indigo-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-indigo-600 uppercase">Descrição</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-indigo-600 uppercase">Quantidade</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-indigo-600 uppercase">Valor Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-indigo-50">
                                        {filteredDetalhes
                                            .filter(d => d.codigoPedido === 'ENTRADA DE MATERIAL')
                                            .map((detalhe, di) => {
                                                const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId);
                                                const precoUnitario = getPrecoUnitarioDetalhe(detalhe, itemPreco);
                                                const quantidadeExibida = getQuantidadeExibida(detalhe, itemPreco);
                                                const subtotal = precoUnitario * quantidadeExibida;
                                                return (
                                                    <tr key={`detalhe-entrada-${di}-${detalhe.id}`}>
                                                        <td className="px-4 py-3 whitespace-normal text-sm text-gray-700">{getDisplayDescriptionForPriceItem(itemPreco?.descricao ?? '') || 'Entrada de Material'}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-right">{detalhe.quantidade}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-indigo-800 font-semibold text-right">{formatCurrency(subtotal)}</td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Custos Adicionais (excluindo reembolsos) */}
                    {custosAdicionais.filter(c => !c.isReembolso).length > 0 && (
                        <div className="mt-6 pt-4 border-t border-dashed">
                            <h4 className="text-md font-semibold text-amber-700 mb-2 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                                </svg>
                                Custos Adicionais
                            </h4>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-amber-100">
                                    <thead className="bg-amber-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-amber-600 uppercase">Descrição</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-amber-600 uppercase">Categoria</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-amber-600 uppercase">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-amber-50">
                                        {custosAdicionais.filter(c => !c.isReembolso).map((custo, ci) => (
                                            <tr key={`custo-${ci}-${custo.id}`}>
                                                <td className="px-4 py-3 whitespace-normal text-sm text-gray-700">{getDisplayDescriptionForPriceItem(custo.descricao)}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{custo.categoria || '-'}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-amber-800 font-semibold text-right">{formatCurrency(custo.valor)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Reembolsos */}
                    {custosAdicionais.filter(c => c.isReembolso).length > 0 && (
                        <div className="mt-6 pt-4 border-t border-dashed">
                            <h4 className="text-md font-semibold text-emerald-700 mb-2 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                Reembolsos / Descontos
                            </h4>
                            <p className="text-xs text-emerald-600 mb-3">Valores subtraídos do total da fatura:</p>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-emerald-100">
                                    <thead className="bg-emerald-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-emerald-600 uppercase">Descrição</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-emerald-600 uppercase">Motivo</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-emerald-600 uppercase">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-emerald-50">
                                        {custosAdicionais.filter(c => c.isReembolso).map((custo, ci) => (
                                            <tr key={`custo-reemb-${ci}-${custo.id}`} className="bg-emerald-50/50">
                                                <td className="px-4 py-3 whitespace-normal text-sm text-emerald-800 font-medium">{getDisplayDescriptionForPriceItem(custo.descricao)}</td>
                                                <td className="px-4 py-3 whitespace-normal text-sm text-gray-500">{custo.motivoReembolso || '-'}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-emerald-700 font-bold text-right">- {formatCurrency(custo.valor)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-emerald-100">
                                        <tr>
                                            <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-emerald-800">Total de Reembolsos</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-emerald-800 font-bold text-right">
                                                - {formatCurrency(custosAdicionais.filter(c => c.isReembolso).reduce((sum, c) => sum + c.valor, 0))}
                                            </td>
                                        </tr>
                                    </tfoot>
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
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Links Úteis</h4>
                            <a 
                                href={cobranca.urlPlanilhaConferencia} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="inline-flex items-center space-x-2 text-blue-600 bg-blue-100 hover:bg-blue-200 px-4 py-2 rounded-md font-medium transition-colors text-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                                </svg>
                                <span>Acessar Planilha de Conferência</span>
                            </a>
                        </div>
                    )}
                    </div>

            {/* Seção 4 - Explicações e Documentos (colapsáveis) */}
            <div className="mt-8 pt-8 border-t border-gray-300 print:hidden">
                {/* Ciclo de Notas Fiscais - Colapsável */}
                <div className="mb-6">
                    <CollapsibleSection
                        title="Ciclo de Notas Fiscais"
                        defaultExpanded={false}
                        actionButton={
                            <button
                                onClick={handleLoadCicloExplanation}
                                disabled={isLoadingCicloExplanation}
                                className="text-xs bg-purple-600 text-white px-2 py-1 rounded-md hover:bg-purple-700 disabled:bg-gray-400"
                            >
                                {isLoadingCicloExplanation ? 'Carregando...' : 'Atualizar'}
                            </button>
                        }
                    >
                        <CicloNotaFiscalInfographic />
                        {cicloExplanation && (
                            <div className="mt-4 p-4 bg-gray-50 rounded-md border">
                                <div className="prose prose-sm max-w-none">
                                    <MarkdownRenderer content={cicloExplanation} />
                                </div>
                            </div>
                        )}
                    </CollapsibleSection>
                </div>
                
                {/* Arquivos para download - área única e sempre visível */}
                <div className="mb-8">
                    <h5 className="text-lg font-semibold text-gray-800 mb-2">Arquivos para download</h5>
                    <p className="text-sm text-gray-600 mb-4">Documentos e relatórios anexados a esta fatura. Também disponíveis no PDF da fatura.</p>
                    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
                        {cobranca.notaFiscalUrl ? (
                            <div className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200">
                                <div className="flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="font-medium text-gray-900">Nota Fiscal</span>
                                    {cobranca.notaFiscalFileName && <span className="text-sm text-gray-500 truncate max-w-[200px]">{cobranca.notaFiscalFileName}</span>}
                                </div>
                                <a href={cobranca.notaFiscalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap">Download</a>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200 text-gray-500">
                                <div className="flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span>Nota Fiscal</span>
                                </div>
                                <span className="text-sm">Não anexado</span>
                            </div>
                        )}
                        {documentos.filter(d => d.tipo === 'pedido').map((doc, di) => (
                            <div key={`doc-${di}-${doc.id}`} className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200">
                                <div className="flex items-center gap-3 min-w-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="font-medium text-gray-900 truncate">Pedido: {doc.fileName}</span>
                                </div>
                                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap ml-2">Download</a>
                            </div>
                        ))}
                        {cobranca.trackReportDownloadUrl ? (
                            <div className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200">
                                <div className="flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l7.414 7.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="font-medium text-gray-900">Relatório de Rastreio (Track Report)</span>
                                </div>
                                <a href={cobranca.trackReportDownloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap">Download</a>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200 text-gray-500">
                                <div className="flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l7.414 7.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span>Relatório de Rastreio (Track Report)</span>
                                </div>
                                <span className="text-sm">Não anexado</span>
                            </div>
                        )}
                        {cobranca.orderDetailListagemDownloadUrl ? (
                            <div className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200">
                                <div className="flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l7.414 7.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="font-medium text-gray-900">Relatório de Envios (Order Detail – listagem)</span>
                                </div>
                                <a href={cobranca.orderDetailListagemDownloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap">Download</a>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200 text-gray-500">
                                <div className="flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l7.414 7.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span>Relatório de Envios (Order Detail – listagem)</span>
                                </div>
                                <span className="text-sm">Não anexado</span>
                            </div>
                        )}
                        {cobranca.arquivosComplementares?.map((arq, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200">
                                <div className="flex items-center gap-3 min-w-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    <span className="font-medium text-gray-900 truncate">{arq.nome}</span>
                                </div>
                                <a href={arq.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap ml-2">Download</a>
                            </div>
                        ))}
                    </div>
                    {cobranca.explicacaoNotaFiscal && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-md border">
                            <h6 className="font-semibold text-gray-700 mb-2">Explicação da Nota Fiscal</h6>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{cobranca.explicacaoNotaFiscal}</p>
                        </div>
                    )}
                </div>
                
                {/* Dados para Pagamento */}
                <div>
                    <h5 className="text-lg font-semibold text-gray-800 mb-4">Dados para Pagamento</h5>
                    {settings && (
                        <div className="bg-white p-6 rounded-lg border space-y-4">
                            {settings.paymentBankName && (
                                <div>
                                    <p className="text-sm font-medium text-gray-700">Banco</p>
                                    <p className="text-gray-900">{settings.paymentBankName}</p>
                                </div>
                            )}
                            {(settings.paymentBankAgency || settings.paymentBankAccount) && (
                                <div className="grid grid-cols-2 gap-4">
                                    {settings.paymentBankAgency && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-700">Agência</p>
                                            <p className="text-gray-900">{settings.paymentBankAgency}</p>
                                        </div>
                                    )}
                                    {settings.paymentBankAccount && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-700">Conta</p>
                                            <p className="text-gray-900">{settings.paymentBankAccount} {settings.paymentBankAccountType && `(${settings.paymentBankAccountType === 'corrente' ? 'Corrente' : 'Poupança'})`}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            {settings.paymentPixKey && (
                                <div>
                                    <p className="text-sm font-medium text-gray-700">Chave PIX</p>
                                    <p className="text-gray-900 font-mono">{settings.paymentPixKey}</p>
                                </div>
                            )}
                            {(settings.paymentContactName || settings.paymentContactEmail || settings.paymentContactPhone) && (
                                <div className="border-t pt-4">
                                    <p className="text-sm font-medium text-gray-700 mb-2">Contato para Pagamento</p>
                                    {settings.paymentContactName && <p className="text-gray-900">{settings.paymentContactName}</p>}
                                    {settings.paymentContactEmail && <p className="text-gray-900">{settings.paymentContactEmail}</p>}
                                    {settings.paymentContactPhone && <p className="text-gray-900">{settings.paymentContactPhone}</p>}
                                </div>
                            )}
                        </div>
                    )}
                    {cobranca.urlLinkPagamento && (
                        <div className="mt-4">
                            <a
                                href={cobranca.urlLinkPagamento}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center space-x-2 text-white bg-green-600 hover:bg-green-700 px-6 py-3 rounded-md font-medium transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                                </svg>
                                <span>Acessar Link de Pagamento</span>
                            </a>
                        </div>
                    )}
                </div>
            </div>

            </div>

            {/* Template invisível para PDF: layout limpo sem botões */}
            <div
                ref={pdfTemplateRef}
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    left: '-9999px',
                    top: 0,
                    width: '900px',
                    pointerEvents: 'none',
                    opacity: 0
                }}
                className="bg-white text-gray-900"
            >
                <div className="p-6 space-y-6">
                    <header className="border-b pb-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs text-gray-500">Yoobe Logistics</p>
                                <h1 className="text-2xl font-bold">Fatura - {cobranca.mesReferencia}</h1>
                                <p className="text-sm text-gray-600">Cliente: {client?.nome || 'N/A'} • CNPJ: {client?.cnpj || 'N/A'}</p>
                                <p className="text-sm text-gray-600">Vencimento: {formatDate(cobranca.dataVencimento)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-semibold text-gray-700">Valor Total</p>
                                <p className="text-3xl font-extrabold text-blue-700">{formatCurrency(cobranca.valorTotal)}</p>
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                            {categoryTotals.map(([categoria, total]) => (
                                <div key={categoria} className="flex justify-between border rounded px-2 py-1 bg-gray-50">
                                    <span className="text-gray-600">{categoria}</span>
                                    <span className="font-semibold text-gray-800">
                                        {categoria === 'Reembolsos'
                                            ? `- ${formatCurrency(Math.abs(total))}`
                                            : formatCurrency(total)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </header>

                    {/* Detalhamento simples */}
                    <section className="space-y-2">
                        <h2 className="text-lg font-semibold text-gray-800">Detalhamento dos Itens</h2>
                        <table className="w-full text-xs border border-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-2 py-2 text-left font-medium text-gray-600">Data</th>
                                    <th className="px-2 py-2 text-left font-medium text-gray-600">Pedido</th>
                                    <th className="px-2 py-2 text-left font-medium text-gray-600">Serviço</th>
                                    <th className="px-2 py-2 text-right font-medium text-gray-600">Qtd.</th>
                                    <th className="px-2 py-2 text-right font-medium text-gray-600">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredDetalhes.map((detalhe, detalheIdx) => {
                                    const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId);
                                    if (!itemPreco) return null;
                                    const precoUnitario = getPrecoUnitarioDetalhe(detalhe, itemPreco);
                                    const quantidadeExibida = getQuantidadeExibida(detalhe, itemPreco);
                                    const subtotal = precoUnitario * quantidadeExibida;
                                    return (
                                        <tr key={`detalhe-print-${detalheIdx}-${detalhe.id}`}>
                                            <td className="px-2 py-2 text-gray-600">{formatDate(detalhe.data)}</td>
                                            <td className="px-2 py-2 text-gray-800">{detalhe.codigoPedido}</td>
                                            <td className="px-2 py-2 text-gray-700">{`${itemPreco.subcategoria} - ${getDisplayDescriptionForPriceItem(itemPreco.descricao)}`}</td>
                                            <td className="px-2 py-2 text-right text-gray-700">{quantidadeExibida}</td>
                                            <td className="px-2 py-2 text-right font-semibold text-gray-900">{formatCurrency(subtotal)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </section>

                    {/* Custos adicionais e reembolsos */}
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <h3 className="text-md font-semibold text-amber-800">Custos Adicionais</h3>
                            <table className="w-full text-xs border border-amber-200">
                                <thead className="bg-amber-50">
                                    <tr>
                                        <th className="px-2 py-2 text-left text-amber-700">Descrição</th>
                                        <th className="px-2 py-2 text-left text-amber-700">Categoria</th>
                                        <th className="px-2 py-2 text-right text-amber-700">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-amber-100">
                                    {custosAdicionais.filter(c => !c.isReembolso).map((custo, ci) => (
                                        <tr key={`custo-print-${ci}-${custo.id}`}>
                                            <td className="px-2 py-2 text-gray-800">{getDisplayDescriptionForPriceItem(custo.descricao)}</td>
                                            <td className="px-2 py-2 text-gray-600">{custo.categoria || '-'}</td>
                                            <td className="px-2 py-2 text-right font-semibold text-amber-800">{formatCurrency(custo.valor)}</td>
                                        </tr>
                                    ))}
                                    {custosAdicionais.filter(c => !c.isReembolso).length === 0 && (
                                        <tr><td className="px-2 py-2 text-gray-500" colSpan={3}>Nenhum custo adicional.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-md font-semibold text-emerald-800">Reembolsos / Entradas</h3>
                            <table className="w-full text-xs border border-emerald-200">
                                <thead className="bg-emerald-50">
                                    <tr>
                                        <th className="px-2 py-2 text-left text-emerald-700">Descrição</th>
                                        <th className="px-2 py-2 text-left text-emerald-700">Motivo / Tipo</th>
                                        <th className="px-2 py-2 text-right text-emerald-700">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-emerald-100">
                                    {custosAdicionais.filter(c => c.isReembolso).map((custo, ci) => (
                                        <tr key={`custo-reemb-print-${ci}-${custo.id}`}>
                                            <td className="px-2 py-2 text-emerald-800 font-medium">{getDisplayDescriptionForPriceItem(custo.descricao)}</td>
                                            <td className="px-2 py-2 text-gray-600">{custo.motivoReembolso || '-'}</td>
                                            <td className="px-2 py-2 text-right font-bold text-emerald-800">- {formatCurrency(custo.valor)}</td>
                                        </tr>
                                    ))}
                                    {filteredDetalhes.filter(d => d.codigoPedido === 'ENTRADA DE MATERIAL').map((detalhe, di) => {
                                        const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId);
                                        const precoUnitario = getPrecoUnitarioDetalhe(detalhe, itemPreco);
                                        const quantidadeExibida = getQuantidadeExibida(detalhe, itemPreco);
                                        const subtotal = precoUnitario * quantidadeExibida;
                                        return (
                                            <tr key={`detalhe-entrada-print-${di}-${detalhe.id}`}>
                                                <td className="px-2 py-2 text-indigo-800 font-medium">{getDisplayDescriptionForPriceItem(itemPreco?.descricao ?? '') || 'Entrada de Material'}</td>
                                                <td className="px-2 py-2 text-gray-600">Entrada de Material</td>
                                                <td className="px-2 py-2 text-right font-semibold text-indigo-800">{formatCurrency(subtotal)}</td>
                                            </tr>
                                        );
                                    })}
                                    {custosAdicionais.filter(c => c.isReembolso).length === 0 && filteredDetalhes.filter(d => d.codigoPedido === 'ENTRADA DE MATERIAL').length === 0 && (
                                        <tr><td className="px-2 py-2 text-gray-500" colSpan={3}>Nenhum reembolso ou entrada.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Arquivos complementares */}
                    {(cobranca.trackReportDownloadUrl || cobranca.orderDetailListagemDownloadUrl || (cobranca.arquivosComplementares && cobranca.arquivosComplementares.length > 0)) && (
                        <section className="space-y-2">
                            <h3 className="text-md font-semibold text-gray-800">Arquivos complementares</h3>
                            <div className="text-sm text-gray-700 border border-gray-200 rounded-lg p-3 bg-gray-50">
                                {cobranca.trackReportDownloadUrl && (
                                    <p className="mb-1">
                                        Relatório de Rastreio (Track Report):{' '}
                                        <a href={cobranca.trackReportDownloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Download</a>
                                    </p>
                                )}
                                {cobranca.orderDetailListagemDownloadUrl && (
                                    <p className="mb-1">
                                        Relatório de Envios (Order Detail – listagem):{' '}
                                        <a href={cobranca.orderDetailListagemDownloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Download</a>
                                    </p>
                                )}
                                {cobranca.arquivosComplementares?.map((arq, i) => (
                                    <p key={i} className="mb-1">
                                        {arq.nome}: <a href={arq.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Download</a>
                                    </p>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Notas */}
                    <section className="text-sm text-gray-700">
                        <h3 className="text-md font-semibold text-gray-800 mb-1">Notas</h3>
                        <p>Os valores de envio variam conforme rota, peso e ofertas de transportadoras. Custos adicionais e reembolsos já estão considerados no total.</p>
                    </section>
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