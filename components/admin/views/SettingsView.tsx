import React, { useState, useMemo } from 'react';
import type { TabelaPrecoItem } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { FormInput, FormSelect } from '../../ui/FormControls';
import PriceTableUpload from './PriceTableUpload';
import PriceItemModal from './PriceItemModal';
import { addTabelaPrecoItem, updateTabelaPrecoItem, deleteTabelaPrecoItem, batchUpdatePriceMargins } from '../../../services/firestoreService';

// --- Local Confirmation Modal Component ---
const ConfirmDeleteModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isDeleting: boolean;
    itemName: string;
}> = ({ isOpen, onClose, onConfirm, isDeleting, itemName }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-6 text-center">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                        <svg className="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-lg mt-3 font-medium text-gray-900">Confirmar Exclusão</h3>
                    <p className="mt-2 text-sm text-gray-500">
                        Tem certeza que deseja excluir o item <strong>{itemName}</strong>? Esta ação é permanente.
                    </p>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 flex flex-row-reverse rounded-b-lg">
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 sm:ml-3 disabled:bg-red-300"
                    >
                        {isDeleting ? 'Excluindo...' : 'Excluir'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isDeleting}
                        className="w-full sm:w-auto mt-3 sm:mt-0 inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

const ConfirmMarginUpdateModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isUpdating: boolean;
    category: string;
    margin: string;
}> = ({ isOpen, onClose, onConfirm, isUpdating, category, margin }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-6 text-center">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-orange-100">
                        <svg className="h-6 w-6 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-lg mt-3 font-medium text-gray-900">Confirmar Atualização de Margem</h3>
                    <p className="mt-2 text-sm text-gray-500">
                        Tem certeza que deseja aplicar uma margem de <strong>{margin}%</strong> para TODOS os itens da categoria <strong>{category}</strong>?
                    </p>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 flex flex-row-reverse rounded-b-lg">
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isUpdating}
                        className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-orange-600 text-base font-medium text-white hover:bg-orange-700 sm:ml-3 disabled:bg-orange-300"
                    >
                        {isUpdating ? 'Atualizando...' : 'Confirmar e Aplicar'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isUpdating}
                        className="w-full sm:w-auto mt-3 sm:mt-0 inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};


const BulkMarginUpdater: React.FC<{ tabelaPrecos: TabelaPrecoItem[], onUpdate: () => void }> = ({ tabelaPrecos, onUpdate }) => {
    const [selectedCategory, setSelectedCategory] = useState('');
    const [newMargin, setNewMargin] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const { addToast } = useToast();
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

    const uniqueCategories = useMemo(() =>
        [...new Set(tabelaPrecos.map(item => item.categoria))].sort(),
    [tabelaPrecos]);

    React.useEffect(() => {
        if (uniqueCategories.length > 0 && !selectedCategory) {
            setSelectedCategory(uniqueCategories[0]);
        }
    }, [uniqueCategories, selectedCategory]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const marginValue = parseFloat(newMargin.replace(',', '.'));
        if (isNaN(marginValue) || marginValue < 0) {
            addToast('Por favor, insira um valor de margem válido (número positivo).', 'error');
            return;
        }
        setIsConfirmModalOpen(true);
    };
    
    const handleConfirmUpdate = async () => {
        const marginValue = parseFloat(newMargin.replace(',', '.'));
        if (isNaN(marginValue) || marginValue < 0) return;

        setIsUpdating(true);
        try {
            const count = await batchUpdatePriceMargins(selectedCategory, marginValue);
            addToast(`${count} itens na categoria "${selectedCategory}" foram atualizados com a nova margem.`, 'success');
            onUpdate();
            setNewMargin('');
        } catch (error) {
            console.error("Failed to bulk update margins:", error);
            const msg = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            addToast(`Erro ao atualizar margens: ${msg}`, 'error');
        } finally {
            setIsUpdating(false);
            setIsConfirmModalOpen(false);
        }
    };
    
    return (
        <>
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h4 className="text-lg font-semibold text-gray-800">Atualização de Margem em Lote</h4>
                <p className="text-sm text-gray-500 mt-1">Aplique uma nova margem de lucro para todos os serviços de uma categoria de uma vez.</p>
                <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-grow w-full">
                        <label className="block text-sm font-medium text-gray-700">Categoria</label>
                        <FormSelect value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                            {uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </FormSelect>
                    </div>
                     <div className="flex-grow w-full">
                        <label className="block text-sm font-medium text-gray-700">Nova Margem de Lucro (%)</label>
                        <FormInput type="text" value={newMargin} onChange={e => setNewMargin(e.target.value)} required placeholder="Ex: 25,5" />
                    </div>
                    <div className="flex-shrink-0 w-full sm:w-auto">
                        <button type="submit" disabled={isUpdating || !selectedCategory} className="w-full bg-orange-500 text-white px-4 py-2 rounded-md hover:bg-orange-600 shadow-sm font-medium transition-colors disabled:bg-gray-400">
                            {isUpdating ? 'Atualizando...' : 'Aplicar Margem'}
                        </button>
                    </div>
                </form>
            </div>
            <ConfirmMarginUpdateModal
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                onConfirm={handleConfirmUpdate}
                isUpdating={isUpdating}
                category={selectedCategory}
                margin={newMargin}
            />
        </>
    );
};


interface SettingsViewProps {
    tabelaPrecos: TabelaPrecoItem[];
    onUpdate: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ tabelaPrecos, onUpdate }) => {
    const { addToast } = useToast();
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<TabelaPrecoItem | Omit<TabelaPrecoItem, 'id'> | null>(null);
    
    // States for delete confirmation modal
    const [isConfirmDeleteModalOpen, setIsConfirmDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<TabelaPrecoItem | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleAddNew = () => {
        setEditingItem({
            categoria: '', subcategoria: '', descricao: '', metrica: 'Unidade',
            custoUnitario: 0, margemLucro: 0, precoVenda: 0
        });
        setIsModalOpen(true);
    };

    const handleEdit = (item: TabelaPrecoItem) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };

    const handleDeleteClick = (item: TabelaPrecoItem) => {
        setItemToDelete(item);
        setIsConfirmDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        try {
            await deleteTabelaPrecoItem(itemToDelete.id);
            addToast('Item excluído com sucesso!', 'success');
            onUpdate();
        } catch (error) {
            console.error("Failed to delete price item:", error);
            addToast(`Erro ao excluir: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setIsConfirmDeleteModalOpen(false);
            setItemToDelete(null);
            setIsDeleting(false);
        }
    };
    
    const handleSave = async (item: TabelaPrecoItem | Omit<TabelaPrecoItem, 'id'>) => {
        try {
            if ('id' in item) {
                await updateTabelaPrecoItem(item as TabelaPrecoItem);
                addToast('Item atualizado com sucesso!', 'success');
            } else {
                await addTabelaPrecoItem(item as Omit<TabelaPrecoItem, 'id'>);
                addToast('Item adicionado com sucesso!', 'success');
            }
            onUpdate();
            setIsModalOpen(false);
            setEditingItem(null);
        } catch (error) {
            console.error("Failed to save price item:", error);
            addToast(`Erro ao salvar: ${error instanceof Error ? error.message : String(error)}`, 'error');
            // Do not re-throw, let the modal handle its saving state
        }
    };
    
    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-bold text-gray-900">Tabela de Preços e Custos</h3>
                    <button onClick={handleAddNew} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 shadow-sm font-medium">+ Adicionar Item</button>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border">
                    <p className="text-sm text-gray-700 mb-2">
                        Gerencie todos os serviços e seus respectivos preços. As alterações aqui refletem diretamente no cálculo das faturas.
                    </p>
                    <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                        <li><b>Custo Unitário:</b> O seu custo interno para realizar o serviço.</li>
                        <li><b>Preço de Venda:</b> O valor final cobrado do cliente, calculado a partir do Custo + Margem.</li>
                        <li><b>Métrica:</b> A unidade de cobrança (ex: por item, por envio, por kg).</li>
                    </ul>
                     <p className="mt-2 text-xs text-gray-500 italic">
                       Nota: A 'Margem de Lucro' é usada para o cálculo interno e não é exibida ao cliente.
                    </p>
                </div>
            </div>

            <BulkMarginUpdater tabelaPrecos={tabelaPrecos} onUpdate={onUpdate} />

            <PriceTableUpload onUpdate={onUpdate} />

            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serviço</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Custo (R$)</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margem (%)</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Preço Venda (R$)</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {tabelaPrecos.map(item => (
                                <tr key={item.id}>
                                    <td className="px-4 py-4 whitespace-normal text-sm font-medium text-gray-900">
                                        <div>{item.descricao}</div>
                                        <div className="text-xs text-gray-500">{item.categoria} / {item.subcategoria}</div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                                        {formatCurrency(item.custoUnitario)}
                                    </td>
                                     <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                                        {Number(item.margemLucro).toFixed(2)}%
                                    </td>
                                     <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold text-right">
                                        {formatCurrency(item.precoVenda)}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-right space-x-2">
                                        <button onClick={() => handleEdit(item)} className="text-indigo-600 hover:text-indigo-900">Editar</button>
                                        <button 
                                            onClick={() => handleDeleteClick(item)} 
                                            className="text-red-600 hover:text-red-900"
                                        >
                                            Excluir
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {isModalOpen && (
                <PriceItemModal 
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSave}
                    item={editingItem}
                    tabelaPrecos={tabelaPrecos}
                />
            )}
            <ConfirmDeleteModal
                isOpen={isConfirmDeleteModalOpen}
                onClose={() => setIsConfirmDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
                itemName={itemToDelete?.descricao || ''}
            />
        </div>
    );
};

export default SettingsView;