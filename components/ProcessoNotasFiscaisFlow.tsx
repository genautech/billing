import React from 'react';

const ProcessoNotasFiscaisFlow: React.FC = () => {
    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Fluxo do Processo de Notas Fiscais no Envio</h3>
            
            {/* Fluxo Principal */}
            <div className="mb-8">
                <div className="flex flex-wrap items-center justify-center gap-4">
                    {/* Step 1: Entrada de Material */}
                    <div className="flex flex-col items-center">
                        <div className="bg-blue-100 rounded-full p-4 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-700 text-center max-w-[120px]">Entrada / Venda<br/><span className="text-xs text-gray-500">(varia conforme situação)</span></p>
                    </div>
                    
                    {/* Arrow */}
                    <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                    
                    {/* Step 2: Armazenamento */}
                    <div className="flex flex-col items-center">
                        <div className="bg-green-100 rounded-full p-4 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-700 text-center max-w-[120px]">Armazenamento na Logística</p>
                    </div>
                    
                    {/* Arrow */}
                    <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                    
                    {/* Step 3: Momento do Envio - 3 Notas */}
                    <div className="flex flex-col items-center">
                        <div className="bg-yellow-100 rounded-full p-4 mb-2 relative">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold">3</div>
                        </div>
                        <p className="text-sm font-medium text-gray-700 text-center max-w-[120px]">Momento do Envio<br/><span className="text-xs text-red-600 font-bold">3 Notas Emitidas</span></p>
                    </div>
                    
                    {/* Arrow */}
                    <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                    
                    {/* Step 4: Fatura Mensal */}
                    <div className="flex flex-col items-center">
                        <div className="bg-purple-100 rounded-full p-4 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-700 text-center max-w-[120px]">Fatura Mensal<br/>de Serviços</p>
                    </div>
                </div>
            </div>

            {/* Detalhamento das 3 Notas no Momento do Envio */}
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-6 border-2 border-yellow-200">
                <h4 className="text-lg font-semibold text-gray-800 mb-4 text-center">3 Notas Fiscais Emitidas Simultaneamente no Envio</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Nota de Doação */}
                    <div className="bg-white rounded-lg p-4 border-2 border-blue-300 shadow-sm">
                        <div className="text-center mb-3">
                            <div className="text-3xl mb-2">🎁</div>
                            <h5 className="font-semibold text-gray-800 text-sm">Nota Fiscal de Doação</h5>
                            <p className="text-xs text-gray-600">NF-e - CFOP 6949</p>
                        </div>
                        <div className="text-xs text-gray-700 space-y-1">
                            <p><strong>Destinatário:</strong> Cliente Final</p>
                            <p><strong>Natureza:</strong> Remessa em bonificação, doação ou brinde</p>
                        </div>
                    </div>

                    {/* Nota de Retorno Simbólico */}
                    <div className="bg-white rounded-lg p-4 border-2 border-green-300 shadow-sm">
                        <div className="text-center mb-3">
                            <div className="text-3xl mb-2">↩️</div>
                            <h5 className="font-semibold text-gray-800 text-sm">Retorno Simbólico</h5>
                            <p className="text-xs text-gray-600">NF-e - CFOP 1949</p>
                        </div>
                        <div className="text-xs text-gray-700 space-y-1">
                            <p><strong>Destinatário:</strong> Logística</p>
                            <p><strong>Natureza:</strong> Retorno simbólico de mercadoria</p>
                            <p><strong>Valor:</strong> R$ 1,00</p>
                        </div>
                    </div>

                    {/* GNRE */}
                    <div className="bg-white rounded-lg p-4 border-2 border-purple-300 shadow-sm">
                        <div className="text-center mb-3">
                            <div className="text-3xl mb-2">📋</div>
                            <h5 className="font-semibold text-gray-800 text-sm">GNRE</h5>
                            <p className="text-xs text-gray-600">DIFAL</p>
                        </div>
                        <div className="text-xs text-gray-700 space-y-1">
                            <p><strong>Finalidade:</strong> Pagamento do DIFAL</p>
                            <p><strong>UF Destino:</strong> Estado de destino</p>
                            <p><strong>Pagamento:</strong> Automático via gateway</p>
                        </div>
                    </div>
                </div>
                <div className="mt-4 p-3 bg-yellow-100 rounded-md border border-yellow-300">
                    <p className="text-sm text-yellow-900 text-center">
                        <strong>Importante:</strong> Todas as 3 notas são emitidas automaticamente no momento do envio. 
                        O DIFAL é pago automaticamente pela Yoobe via gateway de pagamento integrado.
                    </p>
                </div>
            </div>

            {/* Legenda */}
            <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Legenda:</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                        <span className="text-gray-600">Entrada/Venda (Venda para Entrega Futura, Venda Simples, ou Doação)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                        <span className="text-gray-600">Armazenamento na logística</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
                        <span className="text-gray-600">3 notas emitidas no envio</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-purple-500 rounded-full"></div>
                        <span className="text-gray-600">Fatura mensal de serviços</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                        <span className="text-gray-600">DIFAL pago automaticamente</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProcessoNotasFiscaisFlow;

