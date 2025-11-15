import React, { useState, useEffect, useMemo } from 'react';
import type { TabelaPrecoItem, Cliente } from '../types';
import { getTabelaPrecos } from '../services/firestoreService';
import { generateCalculatorInsights } from '../services/geminiContentService';
import MarkdownRenderer from './MarkdownRenderer';

interface CostCalculatorProps {
    cliente?: Cliente;
}

const CostCalculator: React.FC<CostCalculatorProps> = ({ cliente }) => {
    const [quantidadeEstoque, setQuantidadeEstoque] = useState<number>(cliente?.unidadesEmEstoque || 0);
    const [palletsUsados, setPalletsUsados] = useState<number>(0);
    const [binsUsados, setBinsUsados] = useState<number>(0);
    const [valorSeguro, setValorSeguro] = useState<number>(0);
    const [tabelaPrecos, setTabelaPrecos] = useState<TabelaPrecoItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [insights, setInsights] = useState<string>('');
    const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

    useEffect(() => {
        const loadTabelaPrecos = async () => {
            setIsLoading(true);
            try {
                const precos = await getTabelaPrecos(cliente?.id);
                setTabelaPrecos(precos);
            } catch (error) {
                console.error('Error loading price table:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadTabelaPrecos();
    }, [cliente?.id]);

    // Encontrar preços de armazenagem
    const precoArmazenagemPallet = useMemo(() => {
        const item = tabelaPrecos.find(p => 
            p.categoria === 'Armazenamento' && 
            (p.descricao.toLowerCase().includes('pallet') || p.metrica.toLowerCase().includes('pallet'))
        );
        return item?.precoVenda || 0;
    }, [tabelaPrecos]);

    const precoArmazenagemBin = useMemo(() => {
        const item = tabelaPrecos.find(p => 
            p.categoria === 'Armazenamento' && 
            (p.descricao.toLowerCase().includes('bin') || p.metrica.toLowerCase().includes('bin'))
        );
        return item?.precoVenda || 0;
    }, [tabelaPrecos]);

    const precoSeguro = useMemo(() => {
        const item = tabelaPrecos.find(p => 
            p.categoria === 'Seguro de envio' || p.descricao.toLowerCase().includes('seguro')
        );
        return item?.precoVenda || 0;
    }, [tabelaPrecos]);

    // Calcular custos
    const custoArmazenagemPallets = useMemo(() => {
        return palletsUsados * precoArmazenagemPallet;
    }, [palletsUsados, precoArmazenagemPallet]);

    const custoArmazenagemBins = useMemo(() => {
        return binsUsados * precoArmazenagemBin;
    }, [binsUsados, precoArmazenagemBin]);

    const custoTotalArmazenagem = useMemo(() => {
        return custoArmazenagemPallets + custoArmazenagemBins;
    }, [custoArmazenagemPallets, custoArmazenagemBins]);

    const custoTotalSeguro = useMemo(() => {
        // Se valorSeguro for fornecido diretamente, usar ele
        // Caso contrário, calcular baseado no preço do seguro da tabela
        if (valorSeguro > 0) {
            return valorSeguro;
        }
        // Pode calcular baseado em quantidade ou valor do estoque
        return 0;
    }, [valorSeguro]);

    const custoTotal = useMemo(() => {
        return custoTotalArmazenagem + custoTotalSeguro;
    }, [custoTotalArmazenagem, custoTotalSeguro]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const handleGenerateInsights = async () => {
        setIsGeneratingInsights(true);
        try {
            const insightsText = await generateCalculatorInsights(
                quantidadeEstoque,
                palletsUsados,
                binsUsados,
                custoTotalSeguro,
                custoTotal
            );
            setInsights(insightsText);
        } catch (error) {
            console.error('Error generating insights:', error);
        } finally {
            setIsGeneratingInsights(false);
        }
    };

    if (isLoading) {
        return (
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="text-center text-gray-500">Carregando calculadora...</div>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Calculadora de Custos</h3>
                <p className="text-sm text-gray-600">
                    Calcule os custos estimados de armazenagem e seguro com base na sua tabela de preços.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Campos de Entrada */}
                <div className="space-y-4">
                    <div>
                        <label htmlFor="quantidade-estoque" className="block text-sm font-medium text-gray-700 mb-1">
                            Quantidade em Estoque
                        </label>
                        <input
                            id="quantidade-estoque"
                            type="number"
                            min="0"
                            value={quantidadeEstoque}
                            onChange={(e) => setQuantidadeEstoque(parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0"
                        />
                    </div>

                    <div>
                        <label htmlFor="pallets-usados" className="block text-sm font-medium text-gray-700 mb-1">
                            Pallets Usados
                        </label>
                        <input
                            id="pallets-usados"
                            type="number"
                            min="0"
                            step="0.1"
                            value={palletsUsados}
                            onChange={(e) => setPalletsUsados(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0"
                        />
                        {precoArmazenagemPallet > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                                Preço por pallet: {formatCurrency(precoArmazenagemPallet)}
                            </p>
                        )}
                    </div>

                    <div>
                        <label htmlFor="bins-usados" className="block text-sm font-medium text-gray-700 mb-1">
                            Bins Usados
                        </label>
                        <input
                            id="bins-usados"
                            type="number"
                            min="0"
                            step="0.1"
                            value={binsUsados}
                            onChange={(e) => setBinsUsados(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0"
                        />
                        {precoArmazenagemBin > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                                Preço por bin: {formatCurrency(precoArmazenagemBin)}
                            </p>
                        )}
                    </div>

                    <div>
                        <label htmlFor="valor-seguro" className="block text-sm font-medium text-gray-700 mb-1">
                            Valor do Seguro (R$)
                        </label>
                        <input
                            id="valor-seguro"
                            type="number"
                            min="0"
                            step="0.01"
                            value={valorSeguro}
                            onChange={(e) => setValorSeguro(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0.00"
                        />
                        {precoSeguro > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                                Referência da tabela: {formatCurrency(precoSeguro)}
                            </p>
                        )}
                    </div>
                </div>

                {/* Resultados */}
                <div className="space-y-4">
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Resumo dos Custos</h4>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Armazenagem (Pallets):</span>
                                <span className="font-medium text-gray-800">
                                    {formatCurrency(custoArmazenagemPallets)}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Armazenagem (Bins):</span>
                                <span className="font-medium text-gray-800">
                                    {formatCurrency(custoArmazenagemBins)}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Seguro:</span>
                                <span className="font-medium text-gray-800">
                                    {formatCurrency(custoTotalSeguro)}
                                </span>
                            </div>
                            <div className="border-t border-gray-300 pt-2 mt-2">
                                <div className="flex justify-between">
                                    <span className="font-semibold text-gray-800">Total Estimado:</span>
                                    <span className="font-bold text-lg text-blue-600">
                                        {formatCurrency(custoTotal)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleGenerateInsights}
                        disabled={isGeneratingInsights || custoTotal === 0}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                        {isGeneratingInsights ? 'Gerando insights...' : 'Gerar Insights com IA'}
                    </button>

                    {insights && (
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-5 shadow-sm">
                            <h5 className="text-sm font-semibold text-blue-900 mb-3 flex items-center">
                                <span className="mr-2 text-lg">💡</span>
                                Insights e Sugestões
                            </h5>
                            <div className="text-sm text-blue-900">
                                <MarkdownRenderer content={insights} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Informações Adicionais */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                    <strong>Nota:</strong> Os valores calculados são estimativas baseadas na sua tabela de preços atual. 
                    Valores reais podem variar conforme condições específicas de armazenagem e seguro.
                </p>
            </div>
        </div>
    );
};

export default CostCalculator;

