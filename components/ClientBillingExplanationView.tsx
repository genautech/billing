import React, { useState, useEffect, useRef } from 'react';
import type { Cliente } from '../types';
import { generateBillingExplanationContent, generateDIFALExplanation } from '../services/geminiContentService';
import TaxationInfographic from './TaxationInfographic';
import CostCalculator from './CostCalculator';
import MarkdownRenderer from './MarkdownRenderer';

// These will be available on the window object from the CDN scripts
declare const jspdf: any;
declare const html2canvas: any;

interface ClientBillingExplanationViewProps {
    cliente?: Cliente;
}

const ClientBillingExplanationView: React.FC<ClientBillingExplanationViewProps> = ({ cliente }) => {
    const [billingExplanation, setBillingExplanation] = useState<string>('');
    const [difalExplanation, setDifalExplanation] = useState<string>('');
    const [isLoadingBilling, setIsLoadingBilling] = useState(true);
    const [isLoadingDifal, setIsLoadingDifal] = useState(true);
    const [isPdfLoading, setIsPdfLoading] = useState(false);
    const pdfContentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadContent = async () => {
            setIsLoadingBilling(true);
            setIsLoadingDifal(true);
            try {
                const [billing, difal] = await Promise.all([
                    generateBillingExplanationContent(),
                    generateDIFALExplanation()
                ]);
                setBillingExplanation(billing);
                setDifalExplanation(difal);
            } catch (error) {
                console.error('Error loading explanation content:', error);
            } finally {
                setIsLoadingBilling(false);
                setIsLoadingDifal(false);
            }
        };
        loadContent();
    }, []);

    const handleGeneratePDF = async () => {
        if (!pdfContentRef.current) return;
        setIsPdfLoading(true);

        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        
        pdf.setFontSize(10);
        pdf.setTextColor(150);
        pdf.text("Yoobe Logistics", 15, 15);

        if (cliente?.logoUrl) {
            try {
                const img = new Image();
                img.crossOrigin = "Anonymous"; 
                img.src = cliente.logoUrl;
                await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                pdf.addImage(dataUrl, 'PNG', 150, 10, 45, 15, undefined, 'FAST');
            } catch (e) { console.error("Error adding client logo to PDF", e); }
        }
        
        pdf.setLineWidth(0.5);
        pdf.line(15, 28, 195, 28);
        pdf.setFontSize(18);
        pdf.setTextColor(0);
        pdf.text("Como Funcionam as Cobranças", 15, 40);
        pdf.setFontSize(10);
        if (cliente?.nome) {
            pdf.text(`Cliente: ${cliente.nome}`, 15, 48);
        }

        // Wait a bit to ensure all content is loaded
        await new Promise(resolve => setTimeout(resolve, 500));

        // Capture with higher quality
        const canvas = await html2canvas(pdfContentRef.current, { 
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: pdfContentRef.current.scrollWidth,
            windowHeight: pdfContentRef.current.scrollHeight
        });
        const imgData = canvas.toDataURL('image/png');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pdfWidth - 30;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

        // Handle multi-page PDF if content is too long
        const startY = 60;
        const pageHeight = pdfHeight - 20;
        const availableHeight = pageHeight - (startY - 20);
        
        if (imgHeight <= availableHeight) {
            // Content fits on one page
            pdf.addImage(imgData, 'PNG', 15, startY, imgWidth, imgHeight);
        } else {
            // Content spans multiple pages
            let heightLeft = imgHeight;
            let position = startY;
            
            pdf.addImage(imgData, 'PNG', 15, position, imgWidth, imgHeight);
            heightLeft -= availableHeight;
            
            while (heightLeft > 0) {
                position = 20 - (imgHeight - heightLeft);
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 15, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
        }
        
        const safeClientName = cliente?.nome?.toLowerCase().replace(/\s+/g, '-') || 'cliente';
        pdf.save(`como-funciona-${safeClientName}.pdf`);
        setIsPdfLoading(false);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* PDF Export Button */}
            <div className="bg-white p-4 rounded-lg shadow-md flex justify-end">
                <button 
                    onClick={handleGeneratePDF} 
                    disabled={isPdfLoading || isLoadingBilling || isLoadingDifal}
                    className="flex items-center justify-center space-x-2 text-white px-4 py-2 rounded-md shadow-sm font-medium transition-colors bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                    </svg>
                    <span>{isPdfLoading ? 'Gerando PDF...' : 'Gerar PDF Completo'}</span>
                </button>
            </div>

            <div ref={pdfContentRef}>
            {/* Seção: Cobranças Mensais */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Como Funcionam as Cobranças Mensais</h3>
                {isLoadingBilling ? (
                    <div className="text-center text-gray-500 py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <p className="mt-2">Gerando conteúdo explicativo...</p>
                    </div>
                ) : (
                    <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg p-6 border border-gray-200">
                        <MarkdownRenderer content={billingExplanation} />
                    </div>
                )}

                {/* Cards informativos sobre os três tipos de cobrança */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                        <div className="text-3xl mb-2">🚚</div>
                        <h4 className="font-semibold text-gray-800 mb-2">Cobranças de Envios</h4>
                        <p className="text-sm text-gray-600">
                            Custos de frete calculados por peso, dimensões e localidade de entrega. Cada etiqueta de envio gerada representa uma cobrança.
                        </p>
                    </div>
                    <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                        <div className="text-3xl mb-2">📦</div>
                        <h4 className="font-semibold text-gray-800 mb-2">Cobranças de Armazenagem</h4>
                        <p className="text-sm text-gray-600">
                            Custo para manter produtos em estoque seguro. Calculado por espaço ocupado (pallets, bins, prateleiras) ou por unidade.
                        </p>
                    </div>
                    <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
                        <div className="text-3xl mb-2">➕</div>
                        <h4 className="font-semibold text-gray-800 mb-2">Cobranças de Adicionais</h4>
                        <p className="text-sm text-gray-600">
                            Custos extras como DIFAL, seguro de envio, taxas de manuseio ou custos de devolução. Detalhados na fatura quando aplicáveis.
                        </p>
                    </div>
                </div>
            </div>

            {/* Seção: DIFAL e Tributação */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">DIFAL e Tributação</h3>
                {isLoadingDifal ? (
                    <div className="text-center text-gray-500 py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <p className="mt-2">Gerando explicação sobre DIFAL...</p>
                    </div>
                ) : (
                    <div className="bg-gradient-to-br from-blue-50 to-white rounded-lg p-6 border border-blue-200 mb-6">
                        <MarkdownRenderer content={difalExplanation} />
                    </div>
                )}

                {/* Infográfico */}
                <TaxationInfographic />
            </div>

            {/* Seção: Transparência no Processo */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Transparência no Processo de Envio</h3>
                <div className="space-y-4">
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
                            <span className="mr-2">📄</span>
                            Nota Fiscal de Envio
                        </h4>
                        <p className="text-gray-700 text-sm">
                            Cada pedido enviado inclui uma nota fiscal completa que detalha todos os custos, incluindo o DIFAL calculado automaticamente. 
                            A nota fiscal é gerada no momento do envio e está disponível para download e consulta.
                        </p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
                            <span className="mr-2">🧮</span>
                            Geração Automática do DIFAL
                        </h4>
                        <p className="text-gray-700 text-sm">
                            O DIFAL é calculado automaticamente pelo sistema baseado na origem (nossa localização) e destino (CEP do cliente final). 
                            O cálculo considera as alíquotas de ICMS de ambos os estados e aplica a diferença quando necessário.
                        </p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
                            <span className="mr-2">📊</span>
                            Rastreabilidade Completa
                        </h4>
                        <p className="text-gray-700 text-sm">
                            Na sua fatura mensal, você pode ver exatamente quanto foi cobrado de DIFAL em cada pedido, 
                            facilitando a conciliação contábil e o entendimento dos custos. Todos os valores são transparentes e auditáveis.
                        </p>
                    </div>
                </div>

                {/* Fluxo visual do processo */}
                <div className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border-2 border-blue-200 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-6 text-lg">Fluxo do Processo</h4>
                    <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-3 lg:space-x-4">
                        <div className="flex-1 text-center w-full">
                            <div className="bg-white rounded-lg p-5 border-2 border-blue-300 shadow-sm hover:shadow-md transition-shadow">
                                <div className="text-4xl mb-3">📦</div>
                                <p className="text-sm font-semibold text-gray-800">Pedido Recebido</p>
                            </div>
                        </div>
                        <div className="text-blue-500 text-3xl font-bold hidden md:block">→</div>
                        <div className="flex-1 text-center w-full">
                            <div className="bg-white rounded-lg p-5 border-2 border-blue-300 shadow-sm hover:shadow-md transition-shadow">
                                <div className="text-4xl mb-3">🧮</div>
                                <p className="text-sm font-semibold text-gray-800">DIFAL Calculado</p>
                            </div>
                        </div>
                        <div className="text-blue-500 text-3xl font-bold hidden md:block">→</div>
                        <div className="flex-1 text-center w-full">
                            <div className="bg-white rounded-lg p-5 border-2 border-blue-300 shadow-sm hover:shadow-md transition-shadow">
                                <div className="text-4xl mb-3">📄</div>
                                <p className="text-sm font-semibold text-gray-800">Nota Fiscal Gerada</p>
                            </div>
                        </div>
                        <div className="text-blue-500 text-3xl font-bold hidden md:block">→</div>
                        <div className="flex-1 text-center w-full">
                            <div className="bg-white rounded-lg p-5 border-2 border-green-300 shadow-sm hover:shadow-md transition-shadow">
                                <div className="text-4xl mb-3">🚚</div>
                                <p className="text-sm font-semibold text-gray-800">Envio Realizado</p>
                            </div>
                        </div>
                        <div className="text-green-500 text-3xl font-bold hidden md:block">→</div>
                        <div className="flex-1 text-center w-full">
                            <div className="bg-white rounded-lg p-5 border-2 border-green-300 shadow-sm hover:shadow-md transition-shadow">
                                <div className="text-4xl mb-3">📊</div>
                                <p className="text-sm font-semibold text-gray-800">Na Fatura Mensal</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Seção: Calculadora de Custos */}
            <CostCalculator cliente={cliente} />

            {/* Informação Final */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
                <h4 className="font-semibold text-blue-900 mb-2">💡 Informação Importante</h4>
                <p className="text-blue-800 text-sm">
                    Esta área foi criada para esclarecer aos departamentos de compras como funcionam nossas cobranças. 
                    Todos os valores são calculados de forma transparente e aparecem detalhadamente em suas faturas mensais. 
                    Se tiver dúvidas, entre em contato conosco através do portal de ajuda.
                </p>
            </div>
            </div>
        </div>
    );
};

export default ClientBillingExplanationView;

