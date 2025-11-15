
import React, { useState, useEffect, useMemo } from 'react';
import { getTabelaPrecos, getFaqs } from '../services/firestoreService';
import type { TabelaPrecoItem, FaqItem } from '../types';

const FaqAccordionItem: React.FC<{ faq: FaqItem }> = ({ faq }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="border-b border-gray-200">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex justify-between items-center w-full p-4 text-left transition-colors duration-200 hover:bg-gray-50"
            >
                <span className="font-semibold text-gray-800">{faq.pergunta}</span>
                <svg
                    className={`w-5 h-5 text-gray-500 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isOpen && (
                <div className="p-4 pt-0 animate-fade-in">
                    <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{faq.resposta}</p>
                </div>
            )}
        </div>
    );
};

const LandingPage: React.FC = () => {
    const [tabelaPrecos, setTabelaPrecos] = useState<TabelaPrecoItem[]>([]);
    const [faqs, setFaqs] = useState<FaqItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const whatsappUrl = "https://wa.me/5541987607512?text=Ol%C3%A1!%20Gostaria%20de%20saber%20mais%20sobre%20os%20servi%C3%A7os%20de%20log%C3%ADstica%20da%20Yoobe.";

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [precosData, faqsData] = await Promise.all([
                    getTabelaPrecos(),
                    getFaqs(),
                ]);
                setTabelaPrecos(precosData);
                setFaqs(faqsData);
            } catch (error) {
                console.error("Failed to fetch landing page data:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    const filteredPrecos = useMemo(() => 
        tabelaPrecos.filter(item => item.precoVenda !== 1),
    [tabelaPrecos]);

    const groupedPrecos = useMemo(() => filteredPrecos.reduce((acc, item) => {
        const { categoria, subcategoria } = item;
        if (!acc[categoria]) acc[categoria] = {};
        if (!acc[categoria][subcategoria]) acc[categoria][subcategoria] = [];
        acc[categoria][subcategoria].push(item);
        return acc;
    }, {} as Record<string, Record<string, TabelaPrecoItem[]>>), [filteredPrecos]);

    const categoryOrder = ['Pick & Pack', 'Envios', 'Armazenamento', 'Retornos', 'Maquila/Entrada de material externo', 'Difal', 'Seguro de envio'];
    const sortedCategories = useMemo(() => Object.keys(groupedPrecos).sort((a, b) => {
        const indexA = categoryOrder.indexOf(a);
        const indexB = categoryOrder.indexOf(b);
        if (indexA > -1 && indexB > -1) return indexA - indexB;
        if (indexA > -1) return -1;
        if (indexB > -1) return 1;
        return a.localeCompare(b);
    }), [groupedPrecos]);
    
    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50">Carregando...</div>;
    }

    return (
        <div className="bg-gray-50 font-sans text-gray-800">
            <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-12">
                <header className="text-center">
                    <img src="https://catalogo.yoobe.co/yoobe-logo-header.svg" alt="Yoobe Logo" className="mx-auto h-16 w-auto object-contain mb-4" />
                    <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Nossos Preços e Serviços de Logística</h1>
                    <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600">Transparência total nos custos para impulsionar o seu negócio.</p>
                </header>
                
                <section id="precos">
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <div className="space-y-10">
                            {sortedCategories.map(categoria => (
                                <div key={categoria}>
                                    <h2 className="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">{categoria}</h2>
                                    <div className="space-y-6">
                                        {Object.keys(groupedPrecos[categoria]).sort().map(subcategoria => (
                                            <div key={subcategoria}>
                                                <h3 className="text-lg font-semibold text-gray-700 mb-3">{subcategoria}</h3>
                                                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                                    <table className="min-w-full">
                                                        <thead className="bg-gray-100">
                                                            <tr>
                                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição do Serviço</th>
                                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Métrica</th>
                                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Preço Unitário</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {groupedPrecos[categoria][subcategoria].map(item => (
                                                                <tr key={item.id}>
                                                                    <td className="px-4 py-4 whitespace-normal text-sm font-medium text-gray-800">{item.descricao}</td>
                                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{item.metrica}</td>
                                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold text-right">{formatCurrency(item.precoVenda)}</td>
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
                </section>
                
                <section id="faq">
                     <h2 className="text-3xl font-bold text-center text-gray-900">Perguntas Frequentes</h2>
                     <div className="mt-6 bg-white rounded-lg shadow-md">
                        {faqs.map(faq => <FaqAccordionItem key={faq.id} faq={faq} />)}
                     </div>
                </section>

                <section id="contato" className="text-center bg-white p-8 rounded-lg shadow-md">
                    <h2 className="text-3xl font-bold text-gray-900">Vamos conversar?</h2>
                    <p className="mt-3 text-lg text-gray-600">Nossa equipe está pronta para entender suas necessidades e oferecer a melhor solução logística.</p>
                    <a 
                        href={whatsappUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-6 inline-flex items-center gap-3 bg-green-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-green-600 transition-transform transform hover:scale-105"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.487 5.235 3.487 8.413 0 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.447-4.433-9.886-9.888-9.886-5.448 0-9.886 4.434-9.889 9.885-.002 2.02.634 3.933 1.787 5.665l-1.19 4.355 4.464-1.176z" /></svg>
                        Fale conosco no WhatsApp
                    </a>
                </section>
            </div>
             <a 
                href={whatsappUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="fixed bottom-6 right-6 bg-green-500 text-white p-4 rounded-full shadow-lg hover:bg-green-600 transition-transform transform hover:scale-110"
                aria-label="Fale conosco no WhatsApp"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.487 5.235 3.487 8.413 0 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.447-4.433-9.886-9.888-9.886-5.448 0-9.886 4.434-9.889 9.885-.002 2.02.634 3.933 1.787 5.665l-1.19 4.355 4.464-1.176z" /></svg>
            </a>
        </div>
    );
};

export default LandingPage;
