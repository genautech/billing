import React, { useState } from 'react';
import { addFaqItem, updateFaqItem, deleteFaqItem, seedNotasFiscaisFaqs } from '../../../services/firestoreService';
import type { FaqItem } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { FormInput } from '../../ui/FormControls';

interface FaqManagementViewProps {
    faqs: FaqItem[];
    onUpdate: () => void;
}

const FaqManagementView: React.FC<FaqManagementViewProps> = ({ faqs, onUpdate }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGeneratingNotasFiscais, setIsGeneratingNotasFiscais] = useState(false);
    const [current, setCurrent] = useState<Omit<FaqItem, 'id'>>({ pergunta: '', resposta: '' });
    const [currentId, setCurrentId] = useState<string | null>(null);
    const { addToast } = useToast();

    const handleAddNew = () => {
        setCurrent({ 
            pergunta: 'O que é o custo de "Itens externos recebidos"?', 
            resposta: 'Este custo é fixo e refere-se a toda a movimentação necessária para a adequação da entrada de estoque de materiais de terceiros. O valor cobre processos essenciais como: contagem, conferência de itens, etiquetagem, alocação para armazenagem e os tributos atrelados a esta operação logística.'
        });
        setCurrentId(null);
        setIsFormOpen(true);
    };
    const handleEdit = (faq: FaqItem) => {
        setCurrent(faq);
        setCurrentId(faq.id);
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir esta pergunta?')) return;
        try {
            await deleteFaqItem(id);
            addToast('Pergunta excluída com sucesso.', 'success');
            onUpdate();
        } catch (error) {
            addToast('Erro ao excluir pergunta.', 'error');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (currentId) {
                await updateFaqItem({ ...current, id: currentId });
            } else {
                await addFaqItem(current);
            }
            addToast('FAQ salvo com sucesso.', 'success');
            onUpdate();
            setIsFormOpen(false);
        } catch (error) {
            addToast('Erro ao salvar FAQ.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGenerateNotasFiscaisFaqs = async () => {
        if (!window.confirm('Isso irá gerar e adicionar FAQs sobre notas fiscais. Continuar?')) return;
        setIsGeneratingNotasFiscais(true);
        try {
            await seedNotasFiscaisFaqs();
            addToast('FAQs sobre notas fiscais geradas e adicionadas com sucesso!', 'success');
            onUpdate();
        } catch (error) {
            addToast('Erro ao gerar FAQs sobre notas fiscais.', 'error');
            console.error('Error generating notas fiscais FAQs:', error);
        } finally {
            setIsGeneratingNotasFiscais(false);
        }
    };
    
    return (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-2xl font-bold text-gray-900">Gestão de FAQ (Ajuda)</h3>
                    <p className="mt-1 text-sm text-gray-600 max-w-2xl">
                        Crie e gerencie as perguntas e respostas que aparecerão na Central de Ajuda do cliente. Use esta seção para esclarecer dúvidas comuns sobre o sistema, faturamento e processos.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleGenerateNotasFiscaisFaqs} 
                        disabled={isGeneratingNotasFiscais}
                        className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 shadow-sm font-medium flex-shrink-0 whitespace-nowrap disabled:bg-gray-400"
                        title="Gera e adiciona FAQs sobre notas fiscais automaticamente"
                    >
                        {isGeneratingNotasFiscais ? 'Gerando...' : '📄 Gerar FAQs de Notas Fiscais'}
                    </button>
                    <button onClick={handleAddNew} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 shadow-sm font-medium flex-shrink-0 whitespace-nowrap">+ Nova Pergunta</button>
                </div>
            </div>
            {isFormOpen && (
                <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg bg-gray-50">
                    <fieldset disabled={isSubmitting} className="space-y-4">
                        <h4 className="font-semibold text-lg">{currentId ? 'Editar Pergunta' : 'Nova Pergunta'}</h4>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Pergunta</label>
                            <FormInput type="text" value={current.pergunta} onChange={(e) => setCurrent(p => ({ ...p, pergunta: e.target.value }))} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Resposta</label>
                            <textarea 
                                value={current.resposta} 
                                onChange={(e) => setCurrent(p => ({ ...p, resposta: e.target.value }))} 
                                required
                                rows={5}
                                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition text-gray-900"
                            />
                        </div>
                    </fieldset>
                    <div className="flex justify-end space-x-3 mt-4">
                        <button type="button" onClick={() => setIsFormOpen(false)} disabled={isSubmitting} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300">Cancelar</button>
                        <button type="submit" disabled={isSubmitting} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700">
                            {isSubmitting ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </form>
            )}
            <div className="space-y-4">
                {faqs.map(faq => (
                    <div key={faq.id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                             <h4 className="font-semibold text-gray-800">{faq.pergunta}</h4>
                             <div className="flex-shrink-0 ml-4 space-x-2">
                                <button onClick={() => handleEdit(faq)} className="text-sm text-indigo-600 hover:text-indigo-900">Editar</button>
                                <button onClick={() => handleDelete(faq.id)} className="text-sm text-red-600 hover:text-red-900">Excluir</button>
                            </div>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{faq.resposta}</p>
                    </div>
                ))}
                 {faqs.length === 0 && <p className="text-center text-gray-500 py-4">Nenhuma pergunta frequente cadastrada.</p>}
            </div>
        </div>
    );
};
export default FaqManagementView;