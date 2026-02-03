import React from 'react';

const CicloNotaFiscalInfographic: React.FC = () => {
    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Ciclo de Notas Fiscais - Fluxo Visual</h3>
            
            {/* Fluxo de Produtos */}
            <div className="mb-8">
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Fluxo de Produtos</h4>
                <div className="flex flex-wrap items-center justify-center gap-4">
                    {/* Step 1: Produto */}
                    <div className="flex flex-col items-center">
                        <div className="bg-blue-100 rounded-full p-4 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-700 text-center">Produto</p>
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
                        <p className="text-sm font-medium text-gray-700 text-center">Armazenamento<br/>na Logística</p>
                    </div>
                    
                    {/* Arrow */}
                    <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                    
                    {/* Step 3: Nota Inicial (varia conforme situação) */}
                    <div className="flex flex-col items-center">
                        <div className="bg-yellow-100 rounded-full p-4 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-700 text-center">Nota Inicial<br/><span className="text-xs text-gray-500">(varia conforme situação)</span></p>
                    </div>
                    
                    {/* Arrow */}
                    <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                    
                    {/* Step 4: Envio */}
                    <div className="flex flex-col items-center">
                        <div className="bg-purple-100 rounded-full p-4 mb-2 relative">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">DIFAL</div>
                        </div>
                        <p className="text-sm font-medium text-gray-700 text-center">Envio<br/><span className="text-xs text-red-600 font-bold">DIFAL Pago</span></p>
                    </div>
                    
                    {/* Arrow */}
                    <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                    
                    {/* Step 5: Nota Brinde */}
                    <div className="flex flex-col items-center">
                        <div className="bg-indigo-100 rounded-full p-4 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-700 text-center">Nota Fiscal<br/>Brinde Cliente</p>
                    </div>
                </div>
                <div className="mt-4 p-3 bg-blue-50 rounded-md border border-blue-200">
                    <p className="text-sm text-blue-800 text-center mb-2">
                        <strong>Notas Iniciais:</strong> Podem ser Nota de Venda para Entrega Futura (entrada estoque), Nota Fiscal de Venda (venda com pagamento), ou Nota de Doação (venda com pontos)
                    </p>
                    <p className="text-sm text-blue-800 text-center">
                        <strong>Ciclo Fechado:</strong> A nota de brinde no envio fecha o ciclo da nota inicial
                    </p>
                </div>
            </div>
            
            {/* Fluxo de Serviços */}
            <div className="border-t pt-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Fluxo de Serviços Mensais</h4>
                <div className="flex flex-wrap items-center justify-center gap-4">
                    {/* Step 1: Serviços Mensais */}
                    <div className="flex flex-col items-center">
                        <div className="bg-orange-100 rounded-full p-4 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-700 text-center">Serviços<br/>Mensais</p>
                    </div>
                    
                    {/* Arrow */}
                    <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                    
                    {/* Step 2: Nota Fiscal Mensal */}
                    <div className="flex flex-col items-center">
                        <div className="bg-teal-100 rounded-full p-4 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-700 text-center">Nota Fiscal<br/>Mensal</p>
                    </div>
                    
                    {/* Arrow */}
                    <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                    
                    {/* Step 3: Reembolso DIFAL */}
                    <div className="flex flex-col items-center">
                        <div className="bg-green-100 rounded-full p-4 mb-2 relative">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">✓</div>
                        </div>
                        <p className="text-sm font-medium text-gray-700 text-center">Reembolso<br/>DIFAL</p>
                    </div>
                </div>
                <div className="mt-4 p-3 bg-green-50 rounded-md border border-green-200">
                    <p className="text-sm text-green-800 text-center">
                        <strong>Reembolso:</strong> O DIFAL pago no envio é reembolsado junto com a nota fiscal mensal de serviços
                    </p>
                </div>
            </div>
            
            {/* Legenda */}
            <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Legenda:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                        <span className="text-gray-600">DIFAL pago no momento do envio</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                        <span className="text-gray-600">Reembolso na nota mensal</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CicloNotaFiscalInfographic;


