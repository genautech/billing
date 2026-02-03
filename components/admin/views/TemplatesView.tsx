import React, { useState, useEffect } from 'react';
import { getTabelaPrecos } from '../../../services/firestoreService';
import { TabelaPrecoItem } from '../../../types';

const TemplatesView: React.FC = () => {
    const [currentItems, setCurrentItems] = useState<TabelaPrecoItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadItems = async () => {
            try {
                const items = await getTabelaPrecos();
                setCurrentItems(items);
            } catch (error) {
                console.error("Failed to load price items for templates:", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadItems();
    }, []);

    const handleDownloadTemplate = (filename: string, headers: string[]) => {
        // If headers[0] contains newlines, it's already a full CSV content
        const csvContent = headers[0].includes('\n') ? headers[0] : headers.join(',') + '\n';
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    
    const trackReportHeaders = [
        "Numero", "Data", "Comprador", "Email", "Produto", "UF", "Destino"
    ];

    const orderDetailHeaders = [
        "Número do pedido", "Data do pedido", "Produtos enviados", "Items promocionales enviados",
        "Produtos enviados com controle de saída", "Pacotes utilizados", "Tipo de embalagem",
        "Peso de envio", "Material de empacotamento", "Destino", "CEP", "Tipo de envio",
        "Valor total do pedido", "Custo do picking de produtos", "Custo de adicionar item promocional",
        "Custo do picking de produtos com controle de saída", "Custo de embalagem",
        "Custo de material de empacotamento", "Custo da embalagem do pacote frágil",
        "Custo de envio", "Custo de zona estendida", "Custo de seguro de envio", "Custo de Difal", "Total"
    ];

    const flexibleTrackReportHeaders = [
        "Number", "Email", "Status", "Currency", "Subtotal", "Total", "Item Name", "Billing City", "Billing Zip", "Placed at"
    ];

    const priceTableManagerHeaders = [
        "Categoria", "Subcategoria", "Descrição do Custo", "Métrica", "Custo Unitário", "Margem de Lucro (%)", "Preço Unitário"
    ];

    const handleDownloadPriceTableTemplate = (isAdmin: boolean) => {
        const headers = priceTableManagerHeaders.join(',');
        
        let rows: string[] = [];
        
        if (currentItems.length > 0) {
            // Export actual items from database
            rows = currentItems.map(item => {
                const values = [
                    item.categoria || '',
                    item.subcategoria || '',
                    `"${item.descricao || ''}"`, // Wrap in quotes to handle commas
                    item.metrica || '',
                    (item.custoUnitario || 0).toString(),
                    (item.margemLucro || 0).toString(),
                    (item.precoVenda || 0).toString()
                ];
                return values.join(',');
            });
        } else {
            // Fallback to examples if database is empty
            rows = [
                `Envios,LOGGI,Ground RJ Capital,Envio,18.63,20,22.36`,
                `Envios,LOGGI,Ground SP Capital,Envio,9.99,20,11.99`,
                `Envios,CORREIOS,Express RJ Capital,Envio,40.49,15,46.56`,
                `Pick & Pack,Cubbo,pedidos contendo de 0.0 até 1.0 itens,Unidade,4.50,70,7.65`,
                `Pick & Pack,Cubbo,pedidos contendo mais de 1.0 itens,Unidade,0.31,100,0.62`,
                `Armazenamento,Cubbo,Armazenamento - Longarina,Pallet,30.20,100,60.41`,
                `Armazenamento,Cubbo,Armazenamento - SKU,SKU,4.50,50,6.75`,
                `Difal,Cubbo,Custo de Difal,Envio,2.00,50,3.00`,
                `Maquila/Entrada de material externo,Cubbo,Entrada de Material Externo,SKU,4.87,50,7.31`
            ];
        }
        
        const csvContent = [headers, ...rows].join('\n') + '\n';
        handleDownloadTemplate(isAdmin ? 'tabela_precos_admin_atualizada.csv' : 'tabela_precos_gestor_atualizada.csv', [csvContent]);
    };

    // Update handleDownloadTemplate to accept raw content if needed
    const downloadCSV = (filename: string, content: string) => {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <div>
                <h3 className="text-2xl font-bold text-gray-900">Templates e Tabelas de Preços Sugeridas</h3>
                <p className="mt-2 text-gray-600">Utilize os templates abaixo para importar dados ou atualizar as tabelas de preços com as margens e custos atuais baseados no histórico da Cubbo.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Coluna 1: Importação de Pedidos */}
                <div className="space-y-6">
                    <h4 className="text-lg font-bold text-blue-800 border-b pb-2">1. Importação de Pedidos / Custos</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Template Flexível */}
                        <div className="border border-purple-200 bg-purple-50 rounded-lg p-5 flex flex-col shadow-sm">
                            <h4 className="text-md font-semibold text-purple-900">Track Report (Flexível)</h4>
                            <p className="text-xs text-purple-700 mt-1 flex-grow">Modelo LojaPrio. Permite cruzamento inteligente por Email e Mês.</p>
                            <button 
                                onClick={() => handleDownloadTemplate('template_track_report_flexivel.csv', flexibleTrackReportHeaders)}
                                className="w-full mt-4 flex items-center justify-center space-x-2 bg-purple-600 text-white px-3 py-2 rounded-md hover:bg-purple-700 transition-colors text-sm font-medium"
                            >
                                <span>Baixar Template</span>
                            </button>
                        </div>

                        {/* Template Order Detail */}
                        <div className="border border-gray-200 rounded-lg p-5 flex flex-col">
                            <h4 className="text-md font-semibold text-gray-800">Relatório de Custos</h4>
                            <p className="text-xs text-gray-500 mt-1 flex-grow">Arquivo obrigatório detalhando todos os custos operacionais (Cubbo). Inclui coluna de <strong>Custo de Difal</strong>.</p>
                            <button 
                                onClick={() => handleDownloadTemplate('template_order_detail.csv', orderDetailHeaders)}
                                className="w-full mt-4 flex items-center justify-center space-x-2 bg-gray-600 text-white px-3 py-2 rounded-md hover:bg-gray-700 transition-colors text-sm font-medium"
                            >
                                <span>Baixar Template</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Coluna 2: Tabelas de Preços */}
                <div className="space-y-6">
                    <h4 className="text-lg font-bold text-green-800 border-b pb-2">2. Tabelas de Preços Sugeridas</h4>
                    
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg mb-3">
                        <p className="text-sm text-yellow-800">
                            <strong>Nota Financeira:</strong> Os custos base abaixo foram extraídos do relatório <i>Order Detail (9)</i> da Cubbo. As margens aplicadas são as configuradas para a Yoobe.
                        </p>
                    </div>
                    <div className="bg-purple-50 border-l-4 border-purple-400 p-4 rounded-r-lg">
                        <p className="text-sm text-purple-800">
                            <strong>DIFAL:</strong> A cobrança de DIFAL utiliza margem fixa de 200% (custo × 3) com <strong>mínimo de R$ 3,00</strong> por pedido. Cada pedido é cobrado uma única vez, independente de quantos envios tenha.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Tabela Gestor */}
                        <div className="border border-green-200 bg-green-50 rounded-lg p-5 flex flex-col shadow-sm">
                            <h4 className="text-md font-semibold text-green-900">Visão Gestor</h4>
                            <p className="text-xs text-green-700 mt-1 flex-grow">Contém a descrição dos itens e a **Margem de Lucro** aplicada.</p>
                            <button 
                                onClick={() => handleDownloadPriceTableTemplate(false)}
                                disabled={isLoading}
                                className={`w-full mt-4 flex items-center justify-center space-x-2 px-3 py-2 rounded-md transition-colors text-sm font-medium ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                            >
                                <span>{isLoading ? 'Carregando Itens...' : 'Baixar Tabela Gestor'}</span>
                            </button>
                        </div>

                        {/* Tabela Admin */}
                        <div className="border border-blue-200 bg-blue-50 rounded-lg p-5 flex flex-col shadow-sm">
                            <h4 className="text-md font-semibold text-blue-900">Visão Admin Completa</h4>
                            <p className="text-xs text-blue-700 mt-1 flex-grow">Inclui Custo Base (Cubbo), Margem Yoobe e Preço Final de Venda.</p>
                            <button 
                                onClick={() => handleDownloadPriceTableTemplate(true)}
                                disabled={isLoading}
                                className={`w-full mt-4 flex items-center justify-center space-x-2 px-3 py-2 rounded-md transition-colors text-sm font-medium ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                            >
                                <span>{isLoading ? 'Carregando Itens...' : 'Baixar Tabela Admin'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TemplatesView;