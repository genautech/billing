import React, { useState } from 'react';

interface NotaFiscalModelViewerProps {
    className?: string;
}

const NotaFiscalModelViewer: React.FC<NotaFiscalModelViewerProps> = ({ className = '' }) => {
    const [expandedNota, setExpandedNota] = useState<string | null>(null);

    const toggleNota = (tipo: string) => {
        setExpandedNota(expandedNota === tipo ? null : tipo);
    };

    const renderNotaCard = (
        tipo: string,
        titulo: string,
        subtitulo: string,
        bgColor: string,
        hoverColor: string,
        iconColor: string,
        children: React.ReactNode
    ) => {
        return (
            <div className="border border-gray-300 rounded-lg overflow-hidden">
                <button
                    onClick={() => toggleNota(tipo)}
                    className={`w-full ${bgColor} ${hoverColor} px-4 py-3 flex items-center justify-between transition-colors`}
                >
                    <div className="flex items-center gap-3">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`h-5 w-5 ${iconColor} transition-transform ${expandedNota === tipo ? 'rotate-90' : ''}`}
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        <div className="text-left">
                            <span className="font-semibold text-gray-900">{titulo}</span>
                            {subtitulo && <span className="ml-2 text-sm text-gray-600">{subtitulo}</span>}
                        </div>
                    </div>
                </button>
                
                {expandedNota === tipo && (
                    <div className="bg-white p-6 border-t border-gray-200">
                        {children}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`space-y-6 ${className}`}>
            <h4 className="text-xl font-semibold text-gray-800 mb-4">Modelos de Notas Fiscais</h4>
            
            {/* Seção: Notas de Entrada/Venda */}
            <div>
                <h5 className="text-lg font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-300">Notas de Entrada/Venda</h5>
                <div className="space-y-4">
                    {/* Nota Fiscal de Venda para Entrega Futura */}
                    {renderNotaCard(
                        'venda-entrega-futura',
                        'Nota Fiscal de Venda para Entrega Futura',
                        'Entrada no Estoque',
                        'bg-yellow-50',
                        'hover:bg-yellow-100',
                        'text-yellow-600',
                        <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                <h5 className="font-semibold text-gray-800 mb-3">Dados da Nota Fiscal</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-gray-600">Natureza da Operação:</span>
                                        <p className="font-medium text-gray-900">Venda para entrega futura</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">CFOP:</span>
                                        <p className="font-medium text-gray-900">Conforme operação</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Destinatário:</span>
                                        <p className="font-medium text-gray-900">Cliente</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">CNPJ/CPF:</span>
                                        <p className="font-medium text-gray-900">XXX.XXX.XXX/XXXX-XX</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Momento de Emissão:</span>
                                        <p className="font-medium text-gray-900">No momento da compra/entrada do estoque</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200">
                                <p className="text-sm text-yellow-800">
                                    <strong>Propósito:</strong> Esta nota fiscal é emitida quando um produto é comprado e entra no estoque da Yoobe. 
                                    Representa a venda do produto que será entregue posteriormente.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Nota Fiscal de Venda (simples) */}
                    {renderNotaCard(
                        'venda-simples',
                        'Nota Fiscal de Venda (simples)',
                        'Vendas com Pagamento',
                        'bg-indigo-50',
                        'hover:bg-indigo-100',
                        'text-indigo-600',
                        <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                <h5 className="font-semibold text-gray-800 mb-3">Dados da Nota Fiscal</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-gray-600">Natureza da Operação:</span>
                                        <p className="font-medium text-gray-900">Venda de mercadorias</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">CFOP:</span>
                                        <p className="font-medium text-gray-900">5102 (ou conforme operação)</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Destinatário:</span>
                                        <p className="font-medium text-gray-900">Cliente que realizou a compra</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">CNPJ/CPF:</span>
                                        <p className="font-medium text-gray-900">XXX.XXX.XXX/XXXX-XX</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Envio:</span>
                                        <p className="font-medium text-gray-900">Enviada diretamente ao cliente</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Momento de Emissão:</span>
                                        <p className="font-medium text-gray-900">No momento da venda com pagamento</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-indigo-50 p-4 rounded-md border border-indigo-200">
                                <p className="text-sm text-indigo-800">
                                    <strong>Propósito:</strong> Esta nota fiscal é emitida quando existe uma venda real do produto ao cliente com pagamento. 
                                    É uma nota fiscal simples de venda que é enviada diretamente para o cliente que realizou a compra.
                                </p>
                            </div>
                            {/* Placeholder para snapshot */}
                            <div className="bg-gray-100 p-4 rounded-md border-2 border-dashed border-gray-300 text-center">
                                <p className="text-sm text-gray-500 mb-2">📄 Visualização da Nota Fiscal</p>
                                <p className="text-xs text-gray-400">Snapshot da nota será exibido aqui</p>
                            </div>
                        </div>
                    )}

                    {/* Nota Fiscal de Doação (venda com pontos) */}
                    {renderNotaCard(
                        'doacao-venda-pontos',
                        'Nota Fiscal de Doação',
                        'Vendas com Pontos',
                        'bg-pink-50',
                        'hover:bg-pink-100',
                        'text-pink-600',
                        <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                <h5 className="font-semibold text-gray-800 mb-3">Dados da Nota Fiscal</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-gray-600">Natureza da Operação:</span>
                                        <p className="font-medium text-gray-900">Remessa em bonificação, doação ou brinde</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">CFOP:</span>
                                        <p className="font-medium text-gray-900">6949</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Destinatário:</span>
                                        <p className="font-medium text-gray-900">Cliente Final</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">CNPJ/CPF:</span>
                                        <p className="font-medium text-gray-900">XXX.XXX.XXX/XXXX-XX</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Valor:</span>
                                        <p className="font-medium text-gray-900">Simbólico</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Momento de Emissão:</span>
                                        <p className="font-medium text-gray-900">Quando cliente não paga (venda com pontos)</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-pink-50 p-4 rounded-md border border-pink-200">
                                <p className="text-sm text-pink-800">
                                    <strong>Propósito:</strong> Esta nota fiscal é emitida quando o cliente não paga o pedido (venda com pontos). 
                                    Caracteriza a operação como doação ou brinde, conforme a legislação tributária brasileira.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Seção: Notas de Envio */}
            <div>
                <h5 className="text-lg font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-300">Notas de Envio (Emitidas no Momento do Envio)</h5>
                <div className="space-y-4">
                    {/* Nota Fiscal de Doação (NF-e) - Envio */}
                    {renderNotaCard(
                        'doacao-envio',
                        'Nota Fiscal de Doação (NF-e)',
                        'CFOP: 6949',
                        'bg-blue-50',
                        'hover:bg-blue-100',
                        'text-blue-600',
                        <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                <h5 className="font-semibold text-gray-800 mb-3">Dados da Nota Fiscal</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-gray-600">Natureza da Operação:</span>
                                        <p className="font-medium text-gray-900">Remessa em bonificação, doação ou brinde</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">CFOP:</span>
                                        <p className="font-medium text-gray-900">6949</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Destinatário:</span>
                                        <p className="font-medium text-gray-900">Cliente Final</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">CNPJ/CPF:</span>
                                        <p className="font-medium text-gray-900">XXX.XXX.XXX/XXXX-XX</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Valor:</span>
                                        <p className="font-medium text-gray-900">Simbólico</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Momento de Emissão:</span>
                                        <p className="font-medium text-gray-900">No momento do envio ao cliente final</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
                                <p className="text-sm text-blue-800">
                                    <strong>Propósito:</strong> Esta nota fiscal é emitida para o cliente final que receberá o produto no momento do envio, 
                                    caracterizando a operação como uma doação ou brinde, conforme a legislação tributária brasileira. 
                                    É emitida independente se houve venda com pagamento ou venda com pontos anteriormente.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Nota Fiscal de Retorno Simbólico */}
                    {renderNotaCard(
                        'retorno',
                        'Nota Fiscal de Retorno Simbólico (NF-e)',
                        'CFOP: 1949',
                        'bg-green-50',
                        'hover:bg-green-100',
                        'text-green-600',
                        <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                <h5 className="font-semibold text-gray-800 mb-3">Dados da Nota Fiscal</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-gray-600">Natureza da Operação:</span>
                                        <p className="font-medium text-gray-900">Retorno simbólico de mercadoria</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">CFOP:</span>
                                        <p className="font-medium text-gray-900">1949</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Destinatário:</span>
                                        <p className="font-medium text-gray-900">Logística (Empresa Parceira)</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">CNPJ:</span>
                                        <p className="font-medium text-gray-900">XX.XXX.XXX/XXXX-XX</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Valor:</span>
                                        <p className="font-medium text-gray-900">R$ 1,00</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Momento de Emissão:</span>
                                        <p className="font-medium text-gray-900">No momento do envio ao cliente final</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-green-50 p-4 rounded-md border border-green-200">
                                <p className="text-sm text-green-800">
                                    <strong>Propósito:</strong> Esta nota fiscal é necessária para documentar o retorno simbólico da mercadoria 
                                    para a logística, fechando o ciclo contábil da operação.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* GNRE */}
                    {renderNotaCard(
                        'gnre',
                        'GNRE (Guia Nacional de Recolhimento)',
                        'DIFAL',
                        'bg-purple-50',
                        'hover:bg-purple-100',
                        'text-purple-600',
                        <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                <h5 className="font-semibold text-gray-800 mb-3">Dados da GNRE</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-gray-600">UF Favorecida:</span>
                                        <p className="font-medium text-gray-900">Estado de Destino</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Código da Receita:</span>
                                        <p className="font-medium text-gray-900">100102</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Valor Principal:</span>
                                        <p className="font-medium text-gray-900">Valor do DIFAL calculado</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Referência:</span>
                                        <p className="font-medium text-gray-900">NF-e de origem</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-600">Momento de Emissão:</span>
                                        <p className="font-medium text-gray-900">No momento do envio ao cliente final</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-purple-50 p-4 rounded-md border border-purple-200">
                                <p className="text-sm text-purple-800 mb-2">
                                    <strong>Propósito:</strong> A GNRE é o documento utilizado para o pagamento do DIFAL 
                                    (Diferencial de Alíquota do ICMS) ao estado de destino.
                                </p>
                                <p className="text-sm text-purple-800">
                                    <strong>Pagamento Automático:</strong> O DIFAL é automaticamente calculado, cobrado e pago pela Yoobe 
                                    utilizando um gateway de pagamento integrado. O sistema cobra uma taxa fixa que é depois cobrada 
                                    na fatura mensal, de acordo com a tabela de preços. Não é necessário nenhuma ação pela empresa cliente.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotaFiscalModelViewer;
