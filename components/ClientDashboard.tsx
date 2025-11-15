import React, { useMemo, useEffect, useState } from 'react';
import type { CobrancaMensal, Cliente, DetalheEnvio, TabelaPrecoItem } from '../types';
import { countShipmentsInMonth, filterCSVByMonth, getDetalhesByCobrancaId, getTabelaPrecos, calculatePrecoVendaForDisplay, isTemplateItem, getLastInvoiceStorageQuantities } from '../services/firestoreService';

interface ClientDashboardProps {
    clientCobrancas: CobrancaMensal[];
    client: Cliente | undefined;
}

const StatCard: React.FC<{ title: string; value: string; }> = ({ title, value }) => (
    <div className="bg-white p-6 rounded-lg shadow">
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
);

const BarChart: React.FC<{ data: { label: string; value: number }[]; valueFormatter: (value: number) => string; }> = ({ data, valueFormatter }) => {
    const maxValue = useMemo(() => {
        const values = data.map(d => d.value).filter(v => v > 0);
        return values.length > 0 ? Math.max(...values) : 0;
    }, [data]);

    // Filter out items with zero or negative values
    const validData = data.filter(d => d.value > 0);

    if (validData.length === 0) {
        return (
            <div className="text-center text-gray-500 p-4 h-64 flex items-center justify-center">
                <div>
                    <p className="text-sm">Dados insuficientes para o gráfico.</p>
                    <p className="text-xs text-gray-400 mt-1">Não há dados válidos para exibir.</p>
                </div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="text-center text-gray-500 p-4 h-64 flex items-center justify-center">
                <div>
                    <p className="text-sm">Nenhum dado disponível.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex justify-around items-end h-64 bg-gray-50 p-4 rounded-lg">
            {validData.map(({ label, value }, index) => {
                const heightPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
                return (
                    <div key={`${label}-${index}`} className="flex flex-col items-center w-full text-center" style={{ maxWidth: '60px' }}>
                        <div
                            className="w-4/5 bg-blue-500 rounded-t-md hover:bg-blue-600 transition-colors min-h-[4px]"
                            style={{ height: `${Math.max(heightPercent, 2)}%` }}
                            title={`${label}: ${valueFormatter(value)}`}
                        />
                        <span className="text-xs text-gray-600 mt-2 font-medium">{label}</span>
                        <span className="text-xs text-gray-500 mt-1">{valueFormatter(value)}</span>
                    </div>
                );
            })}
        </div>
    );
};

const PieChart: React.FC<{ data: { label: string; value: number, color: string }[] }> = ({ data }) => {
    const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);
    if (total === 0) return <div className="text-center text-gray-500 p-4">Sem dados para este período.</div>;

    let cumulativePercentage = 0;
    const gradients = data.map(item => {
        const percentage = (item.value / total) * 100;
        const start = cumulativePercentage;
        cumulativePercentage += percentage;
        const end = cumulativePercentage;
        return `${item.color} ${start}% ${end}%`;
    });
    
    return (
         <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-40 h-40 rounded-full" style={{ background: `conic-gradient(${gradients.join(', ')})` }} />
            <div className="space-y-2">
                {data.map(item => (
                    <div key={item.label} className="flex items-center">
                        <span className="w-4 h-4 rounded-sm mr-2" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-gray-700">{item.label} ({((item.value / total) * 100).toFixed(1)}%)</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ClientDashboard: React.FC<ClientDashboardProps> = ({ clientCobrancas, client }) => {
    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    const [allDetalhes, setAllDetalhes] = useState<DetalheEnvio[]>([]);
    const [tabelaPrecos, setTabelaPrecos] = useState<TabelaPrecoItem[]>([]);
    const [previewData, setPreviewData] = useState<{
        armazenagemEstimada: number;
        palletsEstimados: number;
        binsEstimados: number;
        isLoading: boolean;
    }>({
        armazenagemEstimada: 0,
        palletsEstimados: 0,
        binsEstimados: 0,
        isLoading: true
    });

    // Fetch all details and price table
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [precosData, ...detalhesArrays] = await Promise.all([
                    getTabelaPrecos(client?.id),
                    ...clientCobrancas.map(c => getDetalhesByCobrancaId(c.id))
                ]);
                setTabelaPrecos(precosData);
                const allDetalhesFlat = detalhesArrays.flat();
                setAllDetalhes(allDetalhesFlat);
                
                // Debug log
                const detalhesComEstado = allDetalhesFlat.filter(d => d.estado).length;
                console.log('📊 Dashboard Data Loaded:', {
                    totalCobrancas: clientCobrancas.length,
                    totalDetalhes: allDetalhesFlat.length,
                    detalhesComEstado,
                    totalPrecos: precosData.length
                });
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            }
        };
        if (clientCobrancas.length > 0) {
            fetchData();
        }
    }, [clientCobrancas, client?.id]);

    // Calculate preview for November invoice
    useEffect(() => {
        const calculatePreview = async () => {
            if (!client?.id || clientCobrancas.length === 0) {
                setPreviewData({ armazenagemEstimada: 0, palletsEstimados: 0, binsEstimados: 0, isLoading: false });
                return;
            }

            setPreviewData(prev => ({ ...prev, isLoading: true }));

            try {
                // Get storage quantities from last invoice
                const lastStorage = await getLastInvoiceStorageQuantities(client.id);
                
                // Get price table to find storage prices
                const precos = await getTabelaPrecos(client.id);
                
                const precoPallet = precos.find(p => 
                    p.categoria === 'Armazenamento' && 
                    (p.descricao.toLowerCase().includes('pallet') || p.metrica.toLowerCase().includes('pallet'))
                )?.precoVenda || 0;

                const precoBin = precos.find(p => 
                    p.categoria === 'Armazenamento' && 
                    (p.descricao.toLowerCase().includes('bin') || p.metrica.toLowerCase().includes('bin'))
                )?.precoVenda || 0;

                // Get last invoice to find previous stock (if available)
                const lastInvoice = clientCobrancas.sort((a, b) => new Date(b.dataVencimento).getTime() - new Date(a.dataVencimento).getTime())[0];
                const lastInvoiceDetalhes = await getDetalhesByCobrancaId(lastInvoice.id);
                
                // Try to estimate previous stock from last invoice details
                // If we can't find it, use current stock as reference
                const estoqueAtual = client.unidadesEmEstoque || 0;
                
                // Calculate proportion based on last invoice storage quantities
                // If we have storage quantities from last invoice, use them to estimate
                let palletsEstimados = 0;
                let binsEstimados = 0;

                if (lastStorage.pallets > 0 || lastStorage.bins > 0) {
                    // Use the quantities from last invoice as base
                    // For simplicity, we'll use the same quantities (assuming similar stock levels)
                    // In a more sophisticated version, we could calculate proportion based on stock change
                    palletsEstimados = lastStorage.pallets;
                    binsEstimados = lastStorage.bins;
                }

                // Calculate estimated storage cost
                const armazenagemEstimada = (palletsEstimados * precoPallet) + (binsEstimados * precoBin);

                setPreviewData({
                    armazenagemEstimada,
                    palletsEstimados,
                    binsEstimados,
                    isLoading: false
                });
            } catch (error) {
                console.error('Error calculating preview:', error);
                setPreviewData({ armazenagemEstimada: 0, palletsEstimados: 0, binsEstimados: 0, isLoading: false });
            }
        };

        calculatePreview();
    }, [client?.id, client?.unidadesEmEstoque, clientCobrancas]);

    const robustCSVParser = (csvContent: string): { headers: string[]; dataLines: string[]; delimiter: string } | null => {
        if (!csvContent) return null;
        csvContent = csvContent.startsWith('\ufeff') ? csvContent.substring(1) : csvContent;
        const allLines = csvContent.trim().replace(/\r/g, '').split('\n');
        if (allLines.length < 1) return null;
    
        let headerIndex = -1;
        let headerLine = '';
        let delimiter = ',';
    
        // Find the first line that looks like a header (has multiple columns)
        for (let i = 0; i < allLines.length; i++) {
            const line = allLines[i];
            // Check for semicolon first as it's often a specific choice
            if (line.split(';').length > 1) {
                headerIndex = i;
                headerLine = line;
                delimiter = ';';
                break;
            }
            // Fallback to comma
            if (line.split(',').length > 1) {
                headerIndex = i;
                headerLine = line;
                delimiter = ',';
                break;
            }
        }
    
        if (headerIndex === -1) return null; // No valid header found
    
        const dataLines = allLines.slice(headerIndex + 1);
        const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g, ''));
        return { headers, dataLines, delimiter };
    };

    const latestInvoice = clientCobrancas[0];

    const monthlyChartData = useMemo(() => {
        const data = clientCobrancas
            .slice(0, 6)
            .reverse()
            .map(c => ({
                label: c.mesReferencia.split('/')[0].substring(0, 3),
                value: c.valorTotal
            }));

        console.log('📊 Monthly Chart Data Debug:', {
            totalCobrancas: clientCobrancas.length,
            mesesNoGrafico: data.length,
            dados: data
        });

        return data;
    }, [clientCobrancas]);

    const breakdownChartData = useMemo(() => {
        if (!latestInvoice) return [];
        const data = [];
        if (latestInvoice.totalEnvio > 0) {
            data.push({ label: 'Custos de Envio', value: latestInvoice.totalEnvio, color: '#3b82f6' }); // blue-500
        }
        if (latestInvoice.totalCustosLogisticos > 0) {
            data.push({ label: 'Custos Logísticos', value: latestInvoice.totalCustosLogisticos, color: '#8b5cf6' }); // violet-500
        }
        if (latestInvoice.totalArmazenagem > 0) {
            data.push({ label: 'Armazenagem', value: latestInvoice.totalArmazenagem, color: '#a855f7' }); // purple-500
        }
        if (latestInvoice.totalCustosExtras && latestInvoice.totalCustosExtras > 0) {
            data.push({ label: 'Custos Extras', value: latestInvoice.totalCustosExtras, color: '#f97316' }); // orange-500
        }
        if (latestInvoice.totalCustosAdicionais && latestInvoice.totalCustosAdicionais > 0) {
            data.push({ label: 'Custos Adicionais', value: latestInvoice.totalCustosAdicionais, color: '#f59e0b' }); // amber-500
        }
        return data;
    }, [latestInvoice]);
    
    const shipmentsByRegionData = useMemo(() => {
        // Use invoice details instead of CSV parsing for more reliable data
        const regionCounts: Record<string, number> = {};
        let totalEnvios = 0;

        allDetalhes.forEach(detalhe => {
            if (!detalhe.estado || !detalhe.tabelaPrecoItemId) return;
            
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (!itemPreco) return;

            const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
            if (!isShippingItem) return;

            totalEnvios++;
            // Normalize estado: extract just the state code if it contains additional info
            let estado = detalhe.estado.toUpperCase().trim();
            const estadoMatch = estado.match(/\b([A-Z]{2})\b/);
            if (estadoMatch) {
                estado = estadoMatch[1];
            } else if (estado.length > 2) {
                estado = estado.substring(0, 2);
            }

            regionCounts[estado] = (regionCounts[estado] || 0) + 1;
        });

        console.log('📊 Shipments by Region Debug:', {
            totalEnvios,
            estadosEncontrados: Object.keys(regionCounts).length,
            estados: Object.keys(regionCounts)
        });

        if (Object.keys(regionCounts).length === 0) return [];
        
        return Object.entries(regionCounts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);

    }, [allDetalhes, tabelaPrecos]);

    // Shipping costs by state from invoice details
    const shippingCostsByStateData = useMemo(() => {
        const stateCosts: Record<string, number> = {};
        let detalhesComEstado = 0;
        let detalhesEnvio = 0;
        let detalhesSemItem = 0;

        allDetalhes.forEach(detalhe => {
            if (!detalhe.estado || !detalhe.tabelaPrecoItemId) {
                if (detalhe.tabelaPrecoItemId && !detalhe.estado) {
                    detalhesComEstado++; // Count those missing estado
                }
                return;
            }
            
            detalhesComEstado++;
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (!itemPreco) {
                detalhesSemItem++;
                return;
            }

            const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
            if (!isShippingItem) return;

            detalhesEnvio++;
            const isTemplate = isTemplateItem(itemPreco);
            const isNonTemplateShipping = isShippingItem && !isTemplate;

            let subtotal = 0;
            if (isNonTemplateShipping) {
                subtotal = detalhe.quantidade * 1;
            } else {
                subtotal = calculatePrecoVendaForDisplay(itemPreco) * detalhe.quantidade;
            }

            // Normalize estado: extract just the state code if it contains additional info
            let estado = detalhe.estado.toUpperCase().trim();
            // If estado contains space or other info, try to extract just the state code (2 letters)
            const estadoMatch = estado.match(/\b([A-Z]{2})\b/);
            if (estadoMatch) {
                estado = estadoMatch[1];
            } else if (estado.length > 2) {
                // If it's a full state name or region, keep first 2 chars or use as is
                estado = estado.substring(0, 2);
            }

            stateCosts[estado] = (stateCosts[estado] || 0) + subtotal;
        });

        console.log('📊 Shipping Costs by State Debug:', {
            totalDetalhes: allDetalhes.length,
            detalhesComEstado,
            detalhesEnvio,
            detalhesSemItem,
            estadosEncontrados: Object.keys(stateCosts).length,
            estados: Object.keys(stateCosts)
        });

        if (Object.keys(stateCosts).length === 0) return [];
        
        return Object.entries(stateCosts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);

    }, [allDetalhes, tabelaPrecos]);

    const costByRegionData = useMemo(() => {
        // Use invoice details instead of CSV parsing for more reliable data
        const regionCosts: Record<string, number> = {};
        let totalItens = 0;
        let itensComEstado = 0;

        allDetalhes.forEach(detalhe => {
            if (!detalhe.estado || !detalhe.tabelaPrecoItemId) return;
            
            totalItens++;
            itensComEstado++;
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (!itemPreco) return;

            const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
            const isTemplate = isTemplateItem(itemPreco);
            const isNonTemplateShipping = isShippingItem && !isTemplate;

            let subtotal = 0;
            if (isNonTemplateShipping) {
                subtotal = detalhe.quantidade * 1;
            } else {
                subtotal = calculatePrecoVendaForDisplay(itemPreco) * detalhe.quantidade;
            }

            // Normalize estado: extract just the state code if it contains additional info
            let estado = detalhe.estado.toUpperCase().trim();
            const estadoMatch = estado.match(/\b([A-Z]{2})\b/);
            if (estadoMatch) {
                estado = estadoMatch[1];
            } else if (estado.length > 2) {
                estado = estado.substring(0, 2);
            }

            regionCosts[estado] = (regionCosts[estado] || 0) + subtotal;
        });

        console.log('📊 Total Costs by Region Debug:', {
            totalItens: allDetalhes.length,
            itensComEstado,
            estadosEncontrados: Object.keys(regionCosts).length,
            estados: Object.keys(regionCosts)
        });

        if (Object.keys(regionCosts).length === 0) return [];
        
        return Object.entries(regionCosts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);

    }, [allDetalhes, tabelaPrecos]);

    const { averageOperationalCost, averageTotalValuePerShipment } = useMemo(() => {
        let totalShipmentCount = 0;
        let totalOperationalCost = 0;
        let totalBilledValue = 0;

        clientCobrancas.forEach(cobranca => {
            if (cobranca.relatorioRastreioCSV) {
                // Count only shipments from the invoice month
                const shipmentCountInInvoice = countShipmentsInMonth(cobranca.relatorioRastreioCSV, cobranca.mesReferencia);
                
                if(shipmentCountInInvoice > 0) {
                    totalShipmentCount += shipmentCountInInvoice;
                    totalOperationalCost += (cobranca.totalEnvio || 0) + (cobranca.totalCustosLogisticos || 0);
                    totalBilledValue += cobranca.valorTotal;
                }
            }
        });

        const averageOpCost = totalShipmentCount > 0 ? formatCurrency(totalOperationalCost / totalShipmentCount) : 'N/A';
        const averageTotalVal = totalShipmentCount > 0 ? formatCurrency(totalBilledValue / totalShipmentCount) : 'N/A';

        return { averageOperationalCost: averageOpCost, averageTotalValuePerShipment: averageTotalVal };
    }, [clientCobrancas]);


    return (
        <div className="space-y-6 animate-fade-in">
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                 <StatCard title="Fatura Mais Recente" value={latestInvoice ? formatCurrency(latestInvoice.valorTotal) : 'N/A'} />
                 <StatCard title="Valor Médio por Envio" value={averageTotalValuePerShipment} />
                 <StatCard title="Custo Operacional Médio" value={averageOperationalCost} />
                 <StatCard title="Unidades em Estoque" value={client?.unidadesEmEstoque?.toLocaleString('pt-BR') || '0'} />
            </div>

            {/* Prévia da Fatura - Novembro/2025 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-6 shadow-md">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Prévia da Fatura - Novembro/2025</h3>
                {previewData.isLoading ? (
                    <div className="text-center text-gray-500 py-4">Calculando prévia...</div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-white rounded-lg p-4 border border-blue-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-gray-600 mb-1">Armazenagem Estimada</p>
                                    <p className="text-2xl font-bold text-blue-700">
                                        {formatCurrency(previewData.armazenagemEstimada)}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Baseado em {client?.unidadesEmEstoque?.toLocaleString('pt-BR') || '0'} unidades em estoque
                                    </p>
                                    {(previewData.palletsEstimados > 0 || previewData.binsEstimados > 0) && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            {previewData.palletsEstimados > 0 && `${previewData.palletsEstimados} pallet(s)`}
                                            {previewData.palletsEstimados > 0 && previewData.binsEstimados > 0 && ' • '}
                                            {previewData.binsEstimados > 0 && `${previewData.binsEstimados} bin(s)`}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600 mb-1">Total Parcial</p>
                                    <p className="text-2xl font-bold text-gray-900">
                                        {formatCurrency(previewData.armazenagemEstimada)}
                                    </p>
                                    <p className="text-xs text-yellow-600 mt-2 font-medium">
                                        ⚠️ Os custos de envio serão atualizados no final do mês
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <p className="text-sm text-yellow-800">
                                <strong>Nota:</strong> Esta prévia mostra apenas os custos de armazenagem baseados na quantidade atual em estoque. 
                                Os custos de envio e outros serviços realizados durante o mês serão incluídos quando a fatura for fechada no final de novembro.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Histórico de Faturamento (Últimos 6 meses)</h3>
                    <BarChart data={monthlyChartData} valueFormatter={formatCurrency} />
                </div>
                 <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow">
                     <h3 className="text-lg font-semibold text-gray-800 mb-4">Detalhamento de Custos ({latestInvoice?.mesReferencia || ''})</h3>
                     <PieChart data={breakdownChartData} />
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Envios por Estado (todas as faturas)</h3>
                    <BarChart data={shipmentsByRegionData} valueFormatter={(v) => `${v.toLocaleString('pt-BR')} envios`} />
                </div>
                 <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Custos de Envio por Estado</h3>
                    <BarChart data={shippingCostsByStateData} valueFormatter={formatCurrency} />
                </div>
                 <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Custo Total por Estado (todas as faturas)</h3>
                    <BarChart data={costByRegionData} valueFormatter={formatCurrency} />
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Entendendo sua Fatura</h3>
                <div className="space-y-4 text-sm text-gray-600">
                    <div>
                        <h4 className="font-semibold text-gray-800">Pick & Pack</h4>
                        <p>Refere-se a todo o processo de preparação do seu pedido. Inclui a coleta (picking) dos produtos no estoque, a embalagem (packing) em caixas ou sacos, e o material de proteção utilizado (plástico bolha, etc.). A métrica pode ser por item ou por pedido.</p>
                    </div>
                    <div>
                        <h4 className="font-semibold text-gray-800">Envios</h4>
                        <p>Este é o custo do frete para transportar o pedido do nosso armazém até o destino final. O valor é calculado com base no peso, dimensões (peso cúbico) e na localidade de entrega (capital, interior, etc.). A métrica é por etiqueta de envio gerada.</p>
                    </div>
                     <div>
                        <h4 className="font-semibold text-gray-800">Armazenamento</h4>
                        <p>Custo para manter seus produtos em nosso estoque de forma segura. É calculado com base no espaço ocupado (por posição de pallet, prateleira, etc.) ou por unidade de produto, medido durante um período específico.</p>
                    </div>
                     <div>
                        <h4 className="font-semibold text-gray-800">Outros Custos</h4>
                        <p>Agrupa custos adicionais como impostos (ex: Difal), seguro de envio, taxas de manuseio para itens frágeis ou custos de devolução (logística reversa). Cada um é detalhado na fatura quando aplicável.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientDashboard;