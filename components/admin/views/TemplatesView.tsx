import React from 'react';

const TemplatesView: React.FC = () => {
    const handleDownloadTemplate = (filename: string, headers: string[]) => {
        const csvContent = headers.join(',') + '\n';
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

    return (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <div>
                <h3 className="text-2xl font-bold text-gray-900">Templates para Importação de Dados</h3>
                <p className="mt-2 text-gray-600">Para garantir que a geração de faturas ocorra sem erros, utilize os templates abaixo para formatar seus arquivos de importação. Preencha os arquivos CSV com seus dados e depois faça o upload na seção "Gerar Nova Cobrança".</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Template Yoobe */}
                <div className="border border-gray-200 rounded-lg p-5 flex flex-col">
                    <h4 className="text-lg font-semibold text-gray-800">1. Relatório de Rastreio (Track Report)</h4>
                    <p className="text-sm text-gray-500 mt-1 flex-grow">Este arquivo lista todos os pedidos que devem ser faturados para um cliente, servindo como a "fonte da verdade".</p>
                    <div className="my-4 text-sm">
                        <p className="font-medium text-gray-700">Colunas necessárias:</p>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                            <li><code className="bg-gray-200 px-2 py-0.5 rounded text-gray-800">Numero</code> (ID do Pedido)</li>
                            <li><code className="bg-gray-200 px-2 py-0.5 rounded text-gray-800">Data</code> (Data do pedido para filtro mensal)</li>
                            <li><code className="bg-gray-200 px-2 py-0.5 rounded text-gray-800">UF</code> (Para análise de envios por estado)</li>
                             <li><code className="bg-gray-200 px-2 py-0.5 rounded text-gray-800">Destino</code> (Cidade de destino)</li>
                        </ul>
                    </div>
                    <button 
                        onClick={() => handleDownloadTemplate('template_track_report.csv', trackReportHeaders)}
                        className="w-full mt-2 flex items-center justify-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 shadow-sm font-medium transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        <span>Baixar Template</span>
                    </button>
                </div>

                {/* Template Swagtrack */}
                <div className="border border-gray-200 rounded-lg p-5 flex flex-col">
                    <h4 className="text-lg font-semibold text-gray-800">2. Relatório de Custos (Order Detail)</h4>
                    <p className="text-sm text-gray-500 mt-1 flex-grow">Este arquivo detalha todos os custos operacionais associados a cada número de pedido.</p>
                     <div className="my-4 text-sm">
                        <p className="font-medium text-gray-700">Colunas necessárias:</p>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                            <li><code className="bg-gray-200 px-2 py-0.5 rounded text-gray-800">Número do pedido</code></li>
                            <li><code className="bg-gray-200 px-2 py-0.5 rounded text-gray-800">Data do pedido</code></li>
                            <li><code className="bg-gray-200 px-2 py-0.5 rounded text-gray-800">Total</code> (Custo final consolidado do pedido)</li>
                        </ul>
                    </div>
                    <button 
                        onClick={() => handleDownloadTemplate('template_order_detail.csv', orderDetailHeaders)}
                        className="w-full mt-2 flex items-center justify-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 shadow-sm font-medium transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        <span>Baixar Template Completo</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TemplatesView;