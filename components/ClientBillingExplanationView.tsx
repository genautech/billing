import React, { useState, useEffect, useRef } from 'react';
import type { Cliente } from '../types';
import { generateBillingExplanationContent, generateDIFALExplanation, generateProcessoNotasFiscaisExplanation } from '../services/geminiContentService';
import TaxationInfographic from './TaxationInfographic';
import CostCalculator from './CostCalculator';
import MarkdownRenderer from './MarkdownRenderer';
import NotaFiscalModelViewer from './NotaFiscalModelViewer';
import ProcessoNotasFiscaisFlow from './ProcessoNotasFiscaisFlow';

// These will be available on the window object from the CDN scripts
declare const jspdf: any;
declare const html2canvas: any;

interface ClientBillingExplanationViewProps {
    cliente?: Cliente;
}

const summaryCards = [
    {
        title: 'Você paga pelo uso real',
        description: 'Os valores acompanham a operação do mês: envios, armazenagem, entradas e custos adicionais quando aplicáveis.',
        style: 'border-blue-200 bg-blue-50'
    },
    {
        title: 'Tudo aparece detalhado',
        description: 'A fatura mostra os itens cobrados de forma separada para facilitar conferência, aprovação e conciliação.',
        style: 'border-emerald-200 bg-emerald-50'
    },
    {
        title: 'Impostos são tratados no fluxo',
        description: 'Quando houver DIFAL ou documentos fiscais relacionados, o processo é calculado e processado automaticamente.',
        style: 'border-amber-200 bg-amber-50'
    }
] as const;

const billingPillars = [
    {
        icon: '🚚',
        title: 'Envios',
        description: 'Cada envio gera cobrança conforme serviço, peso, dimensões, destino e regras da tabela aplicada.'
    },
    {
        icon: '📦',
        title: 'Armazenagem',
        description: 'A cobrança considera o espaço ocupado ou a estrutura utilizada no período, conforme a configuração contratada.'
    },
    {
        icon: '🧾',
        title: 'Custos adicionais',
        description: 'Incluem itens como DIFAL, seguro, retornos, manuseios extras e outras ocorrências do mês.'
    }
] as const;

const howItWorksSteps = [
    { title: '1. Operação do mês', description: 'Pedidos, movimentações e armazenagem são registrados ao longo do período.' },
    { title: '2. Consolidação da cobrança', description: 'Os eventos do mês são agrupados e transformados em uma fatura detalhada.' },
    { title: '3. Documentos fiscais', description: 'Quando necessário, notas e tributos são gerados dentro do fluxo operacional.' },
    { title: '4. Conferência e pagamento', description: 'Você visualiza os detalhes, baixa os arquivos e valida a cobrança com mais clareza.' }
] as const;

const transparencyHighlights = [
    {
        title: 'Nota fiscal vinculada ao envio',
        description: 'Quando o pedido exige documentação fiscal, o registro acompanha a operação e pode ser consultado depois.'
    },
    {
        title: 'DIFAL tratado automaticamente',
        description: 'O sistema identifica a necessidade, calcula o valor e inclui o custo correspondente na cobrança mensal.'
    },
    {
        title: 'Rastreabilidade para conferência',
        description: 'Os valores ficam organizados para facilitar auditoria, entendimento e alinhamento com o financeiro.'
    }
] as const;

const LoadingBlock: React.FC<{ message: string }> = ({ message }) => (
    <div className="text-center text-gray-500 py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-2">{message}</p>
    </div>
);

const InfoSection: React.FC<{
    title: string;
    description?: string;
    children: React.ReactNode;
}> = ({ title, description, children }) => (
    <section className="bg-white p-6 rounded-lg shadow-md space-y-5">
        <div>
            <h3 className="text-2xl font-bold text-gray-900">{title}</h3>
            {description && <p className="mt-2 text-sm text-gray-600 max-w-3xl">{description}</p>}
        </div>
        {children}
    </section>
);

const ClientBillingExplanationView: React.FC<ClientBillingExplanationViewProps> = ({ cliente }) => {
    const [billingExplanation, setBillingExplanation] = useState<string>('');
    const [difalExplanation, setDifalExplanation] = useState<string>('');
    const [processoNotasFiscaisExplanation, setProcessoNotasFiscaisExplanation] = useState<string>('');
    const [isLoadingBilling, setIsLoadingBilling] = useState(true);
    const [isLoadingDifal, setIsLoadingDifal] = useState(true);
    const [isLoadingProcessoNotasFiscais, setIsLoadingProcessoNotasFiscais] = useState(true);
    const [isPdfLoading, setIsPdfLoading] = useState(false);
    const pdfContentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadContent = async () => {
            setIsLoadingBilling(true);
            setIsLoadingDifal(true);
            setIsLoadingProcessoNotasFiscais(true);
            try {
                const [billing, difal, processoNotasFiscais] = await Promise.all([
                    generateBillingExplanationContent(),
                    generateDIFALExplanation(),
                    generateProcessoNotasFiscaisExplanation()
                ]);
                setBillingExplanation(billing);
                setDifalExplanation(difal);
                setProcessoNotasFiscaisExplanation(processoNotasFiscais);
            } catch (error) {
                console.error('Error loading explanation content:', error);
            } finally {
                setIsLoadingBilling(false);
                setIsLoadingDifal(false);
                setIsLoadingProcessoNotasFiscais(false);
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
            <div className="bg-white p-4 rounded-lg shadow-md flex justify-end">
                <button 
                    onClick={handleGeneratePDF} 
                    disabled={isPdfLoading || isLoadingBilling || isLoadingDifal || isLoadingProcessoNotasFiscais}
                    className="flex items-center justify-center space-x-2 text-white px-4 py-2 rounded-md shadow-sm font-medium transition-colors bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                    </svg>
                    <span>{isPdfLoading ? 'Gerando PDF...' : 'Gerar PDF Completo'}</span>
                </button>
            </div>

            <div ref={pdfContentRef}>
                <section className="bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-800 rounded-lg shadow-md text-white p-6">
                    <div className="max-w-4xl">
                        <p className="text-sm uppercase tracking-[0.2em] text-blue-100">Como Funciona</p>
                        <h2 className="mt-2 text-3xl font-bold">Entenda a cobrança sem precisar interpretar a operação inteira</h2>
                        <p className="mt-3 text-sm text-blue-50">
                            Esta área resume como a Yoobe consolida custos, trata notas fiscais e apresenta tudo de forma conferível na sua fatura mensal.
                        </p>
                        {cliente?.nome && (
                            <p className="mt-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-sm text-white/90">
                                Cliente: {cliente.nome}
                            </p>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        {summaryCards.map(card => (
                            <div key={card.title} className={`rounded-lg border p-4 ${card.style} text-gray-900`}>
                                <h3 className="font-semibold">{card.title}</h3>
                                <p className="mt-2 text-sm text-gray-700">{card.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <InfoSection
                    title="Visão rápida do processo"
                    description="A lógica abaixo resume a jornada da cobrança do início da operação até a fatura final."
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        {howItWorksSteps.map(step => (
                            <div key={step.title} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                                <h4 className="font-semibold text-gray-900">{step.title}</h4>
                                <p className="mt-2 text-sm text-gray-600">{step.description}</p>
                            </div>
                        ))}
                    </div>
                </InfoSection>

                <InfoSection
                    title="Como as cobranças são montadas"
                    description="Primeiro os custos são classificados por tipo para que a leitura da fatura fique mais simples."
                >
                    {isLoadingBilling ? (
                        <LoadingBlock message="Gerando conteúdo explicativo..." />
                    ) : (
                        <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg p-6 border border-gray-200">
                            <MarkdownRenderer content={billingExplanation} />
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {billingPillars.map(item => (
                            <div key={item.title} className="rounded-lg border border-gray-200 bg-white p-4">
                                <div className="text-3xl">{item.icon}</div>
                                <h4 className="mt-3 font-semibold text-gray-900">{item.title}</h4>
                                <p className="mt-2 text-sm text-gray-600">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </InfoSection>

                <InfoSection
                    title="DIFAL e tributação"
                    description="Quando há diferença de alíquota entre estados, o processo fiscal entra no fluxo de forma automática."
                >
                    {isLoadingDifal ? (
                        <LoadingBlock message="Gerando explicação sobre DIFAL..." />
                    ) : (
                        <div className="bg-gradient-to-br from-blue-50 to-white rounded-lg p-6 border border-blue-200">
                            <MarkdownRenderer content={difalExplanation} />
                        </div>
                    )}
                    <TaxationInfographic />
                </InfoSection>

                <InfoSection
                    title="Notas fiscais no envio"
                    description="Aqui está a parte mais operacional do processo, organizada em fluxo e depois em exemplos visuais."
                >
                    {isLoadingProcessoNotasFiscais ? (
                        <LoadingBlock message="Gerando explicação do processo..." />
                    ) : (
                        <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg p-6 border border-gray-200">
                            <MarkdownRenderer content={processoNotasFiscaisExplanation} />
                        </div>
                    )}
                    <ProcessoNotasFiscaisFlow />
                    <div className="mt-2">
                        <NotaFiscalModelViewer />
                    </div>
                </InfoSection>

                <InfoSection
                    title="O que você consegue conferir com facilidade"
                    description="Em vez de navegar por textos longos, use estes pontos como referência ao validar a fatura."
                >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {transparencyHighlights.map(item => (
                            <div key={item.title} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                                <h4 className="font-semibold text-gray-900">{item.title}</h4>
                                <p className="mt-2 text-sm text-gray-600">{item.description}</p>
                            </div>
                        ))}
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <p className="text-sm text-blue-900">
                            O objetivo desta área é reduzir dúvida operacional. Para simular valores, conferir cenários e entender impactos no cálculo, use a calculadora abaixo.
                        </p>
                    </div>
                </InfoSection>

                <CostCalculator cliente={cliente} />

                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mt-6">
                    <h4 className="font-semibold text-blue-900 mb-2">Resumo final</h4>
                    <p className="text-blue-800 text-sm">
                        A intenção desta área é deixar o processo mais objetivo: o que aconteceu no mês, como isso vira cobrança e onde cada valor pode ser conferido.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ClientBillingExplanationView;
