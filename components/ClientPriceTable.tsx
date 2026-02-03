import React, { useMemo } from 'react';
import type { TabelaPrecoItem } from '../types';
import { calculatePrecoVendaForDisplay } from '../services/firestoreService';

interface ClientPriceTableProps {
    tabelaPrecos: TabelaPrecoItem[];
}

const ClientPriceTable: React.FC<ClientPriceTableProps> = ({ tabelaPrecos }) => {
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const difalBanner = (
        <div className="mb-4 p-3 rounded-md border border-purple-200 bg-purple-50 text-sm text-purple-800">
            <strong>DIFAL:</strong> Cobrança mínima de R$ 3,00 por pedido (margem de 200% sobre custo base). XMLs de notas de remessa são apenas comprovantes de envio e não alteram o valor cobrado.
        </div>
    );

    // Filter out internal template items (priced at 1.00 or 0.01) and internal costs before display
    const filteredPrecos = useMemo(() => 
        tabelaPrecos.filter(item => {
            // Filter out template items (1.00 or 0.01)
            if (item.precoVenda === 1 || item.precoVenda === 0.01) return false;
            // Filter out internal costs category
            if (item.categoria === 'Custos Internos') return false;
            // Filter out items with (TP) in description
            if (item.descricao && item.descricao.includes('(TP)')) return false;
            return true;
        }),
    [tabelaPrecos]);

    const groupedPrecos = filteredPrecos.reduce((acc, item) => {
        const { categoria, subcategoria } = item;
        if (!acc[categoria]) {
            acc[categoria] = {};
        }
        if (!acc[categoria][subcategoria]) {
            acc[categoria][subcategoria] = [];
        }
        acc[categoria][subcategoria].push(item);
        return acc;
    }, {} as Record<string, Record<string, TabelaPrecoItem[]>>);
    
    // Updated category order based on new CSV data
    const categoryOrder = ['Pick & Pack', 'Envios', 'Armazenamento', 'Retornos', 'Maquila/Entrada de material externo', 'Difal', 'Seguro de envio'];
    const sortedCategories = Object.keys(groupedPrecos).sort((a, b) => {
        const indexA = categoryOrder.indexOf(a);
        const indexB = categoryOrder.indexOf(b);
        if (indexA > -1 && indexB > -1) return indexA - indexB;
        if (indexA > -1) return -1;
        if (indexB > -1) return 1;
        return a.localeCompare(b);
    });
    
    const tooltipTextInbound = "Este custo fixo é relativo a toda a movimentação necessária para adequação da entrada de estoque: contagem, conferência, etiquetação, armazenagem e tributos atrelados à operação.";

    return (
        <div className="bg-white p-6 rounded-lg shadow-md animate-fade-in">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
                Tabela de Preços de Serviços
            </h3>
            {difalBanner}
            <div className="space-y-10">
                {sortedCategories.map(categoria => (
                    <div key={categoria}>
                        <h4 className="text-2xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">{categoria}</h4>
                        <div className="space-y-6">
                            {Object.keys(groupedPrecos[categoria]).sort().map(subcategoria => (
                                <div key={subcategoria}>
                                    <h5 className="text-lg font-semibold text-gray-700 mb-3">{subcategoria}</h5>
                                     <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                        <table className="min-w-full">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição do Serviço</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Métrica</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Preço Unitário</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {groupedPrecos[categoria][subcategoria].map(item => (
                                                    <tr key={item.id}>
                                                        <td className="px-4 py-4 whitespace-normal text-sm font-medium text-gray-800">
                                                            <div className="flex items-center gap-2">
                                                                <span>{item.descricao}</span>
                                                                {item.descricao === 'Itens externos recebidos/ unidade' && (
                                                                    <div className="relative group">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 cursor-pointer" viewBox="0 0 20 20" fill="currentColor">
                                                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                                                        </svg>
                                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                                                                            {tooltipTextInbound}
                                                                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-gray-800"></div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{item.metrica}</td>
                                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold text-right">{formatCurrency(calculatePrecoVendaForDisplay(item))}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ClientPriceTable;