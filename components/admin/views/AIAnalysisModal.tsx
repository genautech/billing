import React from 'react';
import type { AIAnalysis } from '../../../types';

interface AIAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    step: 'analyzing' | 'review';
    data: AIAnalysis | null;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const renderAnalyzing = () => (
    <div className="flex flex-col items-center justify-center p-8">
        <svg className="animate-spin h-10 w-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="mt-4 text-lg font-medium text-gray-700">Analisando arquivos...</p>
        <p className="text-sm text-gray-500">A IA está cruzando os dados de rastreio e custos. Isso pode levar um momento.</p>
    </div>
);

const renderReview = (data: AIAnalysis, onClose: () => void, onConfirm: () => void) => {
    const analysis = data;
    const hasError = !!analysis.error;
    const canConfirm = !hasError && analysis.clientOrdersFound > 0;
    
    const StatItem: React.FC<{ label: string, value: string | number }> = ({ label, value }) => (
        <div className="flex justify-between items-center py-2 border-b">
            <dt className="text-sm text-gray-600">{label}</dt>
            <dd className="text-sm font-semibold text-gray-900">{value}</dd>
        </div>
    );
    
    const MismatchList: React.FC<{ title: string, ids: string[] }> = ({ title, ids }) => (
         <div>
            <h4 className="text-sm font-medium text-gray-800 mt-3">{title} ({ids.length})</h4>
            {ids.length > 0 ? (
                <div className="mt-1 max-h-20 overflow-y-auto bg-gray-100 p-2 rounded text-xs text-gray-600 space-x-1">
                    {ids.slice(0, 10).map(id => <span key={id} className="bg-gray-200 px-1.5 py-0.5 rounded-full">{id}</span>)}
                    {ids.length > 10 && <span>...e mais {ids.length - 10}</span>}
                </div>
            ) : <p className="text-xs text-gray-500 mt-1">Nenhuma divergência encontrada.</p>}
        </div>
    );

    return (
        <>
            <div className="flex-grow overflow-y-auto px-6 py-4">
                 {hasError ? (
                     <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
                        <h3 className="text-lg font-bold text-red-800">Erro na Análise</h3>
                        <p className="mt-2 text-sm text-red-700">{analysis.error}</p>
                    </div>
                 ) : (
                    <>
                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                            <p className="text-sm text-blue-800 leading-relaxed">{analysis.summary}</p>
                        </div>
                        <dl className="mt-4 space-y-1">
                            <StatItem label="Linhas no Relatório de Rastreio" value={analysis.trackReportRows} />
                            <StatItem label="Linhas no Relatório de Custos" value={analysis.orderDetailRows} />
                            <StatItem label="Pedidos do Cliente Encontrados" value={analysis.clientOrdersFound} />
                            <StatItem label="Valor Total dos Pedidos Válidos" value={formatCurrency(analysis.totalValueFromMatchedOrders)} />
                        </dl>
                        <div className="mt-2">
                             <MismatchList title="Pedidos no rastreio sem custo correspondente" ids={analysis.unmatchedTrackOrderIds} />
                             <MismatchList title="Pedidos no custo sem rastreio correspondente" ids={analysis.unmatchedDetailOrderIds} />
                        </div>
                    </>
                 )}
            </div>
            <div className="flex justify-end space-x-3 bg-gray-50 px-6 py-3 border-t">
                <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-medium">Cancelar</button>
                <button 
                    type="button" 
                    onClick={onConfirm}
                    disabled={!canConfirm}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                   {canConfirm ? 'Confirmar e Gerar Fatura' : 'Geração Indisponível'}
                </button>
            </div>
        </>
    );
};

export const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({ isOpen, onClose, onConfirm, step, data }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-xl font-bold text-gray-900">Analise inteligente de Faturamento</h3>
                     <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>
                {step === 'analyzing' && renderAnalyzing()}
                {step === 'review' && data && renderReview(data, onClose, onConfirm)}
            </div>
        </div>
    );
};