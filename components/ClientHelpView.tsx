import React, { useState } from 'react';
import type { FaqItem, GeneralSettings } from '../types';

interface ClientHelpViewProps {
    faqs: FaqItem[];
    settings: GeneralSettings | null;
}

const FaqAccordionItem: React.FC<{ faq: FaqItem }> = ({ faq }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="border-b">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex justify-between items-center w-full p-4 text-left"
            >
                <span className="font-semibold text-gray-800">{faq.pergunta}</span>
                <svg
                    className={`w-5 h-5 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isOpen && (
                <div className="p-4 pt-0">
                    <p className="text-gray-600 whitespace-pre-wrap">{faq.resposta}</p>
                </div>
            )}
        </div>
    );
};

const ClientHelpView: React.FC<ClientHelpViewProps> = ({ faqs, settings }) => {
    return (
        <div className="bg-white p-6 rounded-lg shadow-md animate-fade-in space-y-6">
            <h3 className="text-xl font-bold text-gray-900">Central de Ajuda e FAQ</h3>
            <div className="space-y-2">
                {faqs.length > 0 ? (
                    faqs.map(faq => <FaqAccordionItem key={faq.id} faq={faq} />)
                ) : (
                    <p className="text-gray-500">Nenhuma pergunta frequente foi adicionada ainda.</p>
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
