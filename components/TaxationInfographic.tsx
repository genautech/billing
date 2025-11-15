import React, { useEffect, useState } from 'react';
import { generateInfographicData } from '../services/geminiContentService';
import IconRenderer from './IconRenderer';

interface InfographicData {
    steps: Array<{
        title: string;
        description: string;
        icon: string;
    }>;
    difalFlow: {
        origem: string;
        destino: string;
        calculo: string;
        aplicacao: string;
    };
    estados: string[];
}

const TaxationInfographic: React.FC = () => {
    const [data, setData] = useState<InfographicData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const infographicData = await generateInfographicData();
                setData(infographicData);
            } catch (error) {
                console.error('Error loading infographic data:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    if (isLoading) {
        return (
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="text-center text-gray-500">Carregando infográfico...</div>
            </div>
        );
    }

    if (!data) {
        return null;
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Como Funciona a Tributação DIFAL</h3>
            
            {/* Fluxo de Etapas */}
            <div className="space-y-4">
                <h4 className="text-lg font-semibold text-gray-800">Processo de Envio e Tributação</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data.steps.map((step, index) => (
                        <div key={index} className="relative">
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-5 h-full hover:shadow-lg transition-shadow duration-200">
                                <div className="flex justify-center mb-3">
                                    <IconRenderer iconName={step.icon} className="w-12 h-12 text-blue-600" />
                                </div>
                                <h5 className="font-semibold text-gray-800 mb-2 text-center">{step.title}</h5>
                                <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
                            </div>
                            {index < data.steps.length - 1 && (
                                <div className="hidden lg:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                                    <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Fluxo DIFAL */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Fluxo do DIFAL</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <div className="flex items-start">
                            <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                                1
                            </div>
                            <div>
                                <h5 className="font-semibold text-gray-800">Origem</h5>
                                <p className="text-sm text-gray-600">{data.difalFlow.origem}</p>
                            </div>
                        </div>
                        <div className="flex items-start">
                            <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                                2
                            </div>
                            <div>
                                <h5 className="font-semibold text-gray-800">Destino</h5>
                                <p className="text-sm text-gray-600">{data.difalFlow.destino}</p>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-start">
                            <div className="flex-shrink-0 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                                3
                            </div>
                            <div>
                                <h5 className="font-semibold text-gray-800">Cálculo</h5>
                                <p className="text-sm text-gray-600">{data.difalFlow.calculo}</p>
                            </div>
                        </div>
                        <div className="flex items-start">
                            <div className="flex-shrink-0 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                                4
                            </div>
                            <div>
                                <h5 className="font-semibold text-gray-800">Aplicação</h5>
                                <p className="text-sm text-gray-600">{data.difalFlow.aplicacao}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Estados Principais */}
            <div>
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Estados com Maior Movimentação</h4>
                <div className="flex flex-wrap gap-2">
                    {data.estados.map((estado, index) => (
                        <span
                            key={index}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium border border-gray-300"
                        >
                            {estado}
                        </span>
                    ))}
                </div>
            </div>

            {/* Diagrama Visual Simplificado */}
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg p-6 border-2 border-gray-200 shadow-sm">
                <h4 className="text-lg font-semibold text-gray-800 mb-6">Transparência no Processo</h4>
                <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-4">
                    <div className="flex-1 text-center p-5 bg-white rounded-lg border-2 border-blue-300 shadow-sm hover:shadow-md transition-shadow">
                        <div className="text-4xl mb-3">📦</div>
                        <p className="text-sm font-semibold text-gray-800">Pedido Enviado</p>
                        <p className="text-xs text-gray-600 mt-1">Com nota fiscal</p>
                    </div>
                    <div className="text-blue-500 text-3xl font-bold hidden md:block">→</div>
                    <div className="flex-1 text-center p-5 bg-white rounded-lg border-2 border-purple-300 shadow-sm hover:shadow-md transition-shadow">
                        <div className="text-4xl mb-3">🧮</div>
                        <p className="text-sm font-semibold text-gray-800">DIFAL Calculado</p>
                        <p className="text-xs text-gray-600 mt-1">Automaticamente</p>
                    </div>
                    <div className="text-purple-500 text-3xl font-bold hidden md:block">→</div>
                    <div className="flex-1 text-center p-5 bg-white rounded-lg border-2 border-green-300 shadow-sm hover:shadow-md transition-shadow">
                        <div className="text-4xl mb-3">📄</div>
                        <p className="text-sm font-semibold text-gray-800">Na Fatura Mensal</p>
                        <p className="text-xs text-gray-600 mt-1">Totalmente transparente</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaxationInfographic;

