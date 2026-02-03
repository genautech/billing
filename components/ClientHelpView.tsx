import React, { useState, useMemo } from 'react';
import type { FaqItem, GeneralSettings } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

interface ClientHelpViewProps {
    faqs: FaqItem[];
    settings: GeneralSettings | null;
}

const FaqAccordionItem: React.FC<{ faq: FaqItem }> = ({ faq }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="border-b border-gray-200 last:border-b-0">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex justify-between items-center w-full p-5 text-left hover:bg-gray-50 transition-colors rounded-t-lg"
            >
                <span className="font-semibold text-gray-900 text-base pr-4">{faq.pergunta}</span>
                <svg
                    className={`w-5 h-5 text-gray-500 flex-shrink-0 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isOpen && (
                <div className="px-5 pb-5 pt-2 bg-gray-50 border-t border-gray-100 animate-fade-in">
                    <div className="prose prose-sm max-w-none">
                        <MarkdownRenderer 
                            content={faq.resposta} 
                            className="text-gray-700 leading-relaxed"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

const ClientHelpView: React.FC<ClientHelpViewProps> = ({ faqs, settings }) => {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredFaqs = useMemo(() => {
        if (!searchQuery.trim()) {
            return faqs;
        }

        const query = searchQuery.toLowerCase().trim();
        return faqs.filter(faq => 
            faq.pergunta.toLowerCase().includes(query) ||
            faq.resposta.toLowerCase().includes(query)
        );
    }, [faqs, searchQuery]);

    return (
        <div className="bg-white p-6 rounded-lg shadow-md animate-fade-in space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h3 className="text-xl font-bold text-gray-900">Central de Ajuda e FAQ</h3>
                {faqs.length > 0 && (
                    <div className="relative flex-1 sm:max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar tópicos..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                    </div>
                )}
            </div>

            {searchQuery && (
                <div className="text-sm text-gray-600">
                    {filteredFaqs.length === 0 ? (
                        <p className="text-gray-500">Nenhum resultado encontrado para "{searchQuery}".</p>
                    ) : (
                        <p className="text-gray-700">
                            {filteredFaqs.length} {filteredFaqs.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
                        </p>
                    )}
                </div>
            )}

            <div className="space-y-0 bg-white rounded-lg border border-gray-200 overflow-hidden">
                {filteredFaqs.length > 0 ? (
                    filteredFaqs.map(faq => <FaqAccordionItem key={faq.id} faq={faq} />)
                ) : faqs.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-gray-500">Nenhuma pergunta frequente foi adicionada ainda.</p>
                    </div>
                ) : (
                    <div className="p-8 text-center">
                        <p className="text-gray-500">Nenhum resultado encontrado.</p>
                    </div>
                )}
            </div>
            {settings?.contactEmail && (
                <div className="mt-8 pt-6 border-t text-center">
                     <h4 className="text-lg font-semibold text-gray-800">Ainda com dúvidas?</h4>
                     <p className="text-gray-600 mt-2">
                        Entre em contato conosco através do e-mail: <a href={`mailto:${settings.contactEmail}`} className="font-medium text-blue-600 hover:underline">{settings.contactEmail}</a>
                    </p>
                </div>
            )}
        </div>
    );
};

export default ClientHelpView;
