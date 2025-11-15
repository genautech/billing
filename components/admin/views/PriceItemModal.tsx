import React, { useState, useMemo } from 'react';
import type { TabelaPrecoItem } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { FormInput } from '../../ui/FormControls';

// --- Price Item Modal Component ---
interface PriceItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: TabelaPrecoItem | Omit<TabelaPrecoItem, 'id'>) => Promise<void>;
    item: TabelaPrecoItem | Omit<TabelaPrecoItem, 'id'> | null;
    tabelaPrecos: TabelaPrecoItem[]; // Pass all price items for filtering
}

const PriceItemModal: React.FC<PriceItemModalProps> = ({ isOpen, onClose, onSave, item: initialItem, tabelaPrecos }) => {
    const [item, setItem] = useState<TabelaPrecoItem | Omit<TabelaPrecoItem, 'id'> | null>(initialItem);
    const [isSaving, setIsSaving] = useState(false);
    const { addToast } = useToast();

    React.useEffect(() => {
        setItem(initialItem);
    }, [initialItem]);

    const uniqueCategories = useMemo(() =>
        [...new Set(tabelaPrecos.map(item => item.categoria))].sort()
    , [tabelaPrecos]);

    const filteredSubcategories = useMemo(() => {
        if (!item?.categoria) {
            // If no category is typed, show all unique subcategories for discovery
            return [...new Set(tabelaPrecos.map(p => p.subcategoria))].sort();
        }
        // Filter price items by the currently typed category, get their subcategories, make them unique, and sort.
        const relevantSubcategories = tabelaPrecos
            .filter(p => p.categoria.toLowerCase() === item.categoria.toLowerCase())
            .map(p => p.subcategoria);
        
        return [...new Set(relevantSubcategories)].sort();
    }, [item?.categoria, tabelaPrecos]);


    if (!isOpen || !item) return null;

    const isEditing = 'id' in item;

    const handleChange = (field: keyof Omit<TabelaPrecoItem, 'id'>, value: string | number) => {
        if (!item) return;

        const updatedItem = { ...item } as TabelaPrecoItem & Omit<TabelaPrecoItem, 'id'>;
        const numericValue = parseFloat(String(value).replace(',', '.')) || 0;

        switch (field) {
            case 'custoUnitario':
                updatedItem.custoUnitario = numericValue;
                // Recalculate precoVenda, keeping margin constant
                updatedItem.precoVenda = updatedItem.custoUnitario * (1 + updatedItem.margemLucro / 100);
                break;
            case 'margemLucro':
                updatedItem.margemLucro = numericValue;
                // Recalculate precoVenda, keeping cost constant
                updatedItem.precoVenda = updatedItem.custoUnitario * (1 + updatedItem.margemLucro / 100);
                break;
            case 'precoVenda':
                updatedItem.precoVenda = numericValue;
                // Recalculate margemLucro, keeping cost constant
                if (updatedItem.custoUnitario > 0) {
                    updatedItem.margemLucro = ((updatedItem.precoVenda / updatedItem.custoUnitario) - 1) * 100;
                } else {
                    // If cost is 0, margin can't be calculated meaningfully.
                    updatedItem.margemLucro = 0;
                }
                break;
            default:
                // Handle string fields like 'descricao', 'categoria', etc.
                (updatedItem as any)[field] = value;
                break;
        }
        setItem(updatedItem);
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // FIX: Add validation to prevent duplicate entries on save.
        // Para tabelas personalizadas, os IDs podem ser temporários (temp-X), então comparamos por índice
        const duplicateCheck = tabelaPrecos.find((p, idx) => {
            const isSameDescription = p.descricao.trim().toLowerCase() === item.descricao.trim().toLowerCase();
            const isSameCategory = p.categoria.trim().toLowerCase() === item.categoria.trim().toLowerCase();
            
            if (!isSameDescription || !isSameCategory) return false;
            
            // Se estamos editando (tem ID), verificar se não é o mesmo item
            if ('id' in item && item.id) {
                // Se o ID começa com 'temp-', é um índice temporário
                if (typeof item.id === 'string' && item.id.startsWith('temp-')) {
                    const tempIndex = parseInt(item.id.replace('temp-', ''));
                    return idx !== tempIndex;
                }
                // Caso contrário, comparar IDs normalmente
                return p.id !== item.id;
            }
            
            // Se estamos adicionando novo item, qualquer duplicata é problema
            return true;
        });

        if (duplicateCheck) {
            addToast('Já existe um item com a mesma descrição e categoria.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            await onSave(item);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit}>
                    <header className="p-4 border-b">
                        <h2 className="text-xl font-semibold text-gray-800">{isEditing ? 'Editar Item de Preço' : 'Adicionar Novo Item'}</h2>
                    </header>
                    <main className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700">Descrição do Serviço</label>
                            <FormInput type="text" value={item.descricao} onChange={e => handleChange('descricao', e.target.value)} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Categoria</label>
                            <FormInput type="text" value={item.categoria} onChange={e => handleChange('categoria', e.target.value)} required list="categories-datalist" />
                             <datalist id="categories-datalist">
                                {uniqueCategories.map(cat => <option key={cat} value={cat} />)}
                            </datalist>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Subcategoria</label>
                            <FormInput type="text" value={item.subcategoria} onChange={e => handleChange('subcategoria', e.target.value)} required list="subcategories-datalist" />
                            <datalist id="subcategories-datalist">
                                {filteredSubcategories.map(sub => <option key={sub} value={sub} />)}
                            </datalist>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Métrica</label>
                            <FormInput type="text" value={item.metrica} onChange={e => handleChange('metrica', e.target.value)} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Custo Unitário (R$)</label>
                            <FormInput type="number" step="0.0001" value={item.custoUnitario} onChange={e => handleChange('custoUnitario', e.target.value)} required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Margem de Lucro (%)</label>
                            <FormInput type="number" step="0.01" value={item.margemLucro} onChange={e => handleChange('margemLucro', e.target.value)} required />
                        </div>
                         <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700">Preço de Venda Final (R$)</label>
                            <FormInput type="number" step="0.01" value={item.precoVenda} onChange={e => handleChange('precoVenda', e.target.value)} required />
                            <p className="mt-1 text-xs text-gray-500">
                                Alterar o preço de venda recalculará a margem de lucro. Alterar a margem ou o custo recalculará o preço de venda.
                            </p>
                        </div>
                    </main>
                    <footer className="flex justify-end space-x-3 bg-gray-50 p-4 border-t">
                        <button type="button" onClick={onClose} disabled={isSaving} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 font-medium disabled:opacity-50">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-medium disabled:bg-green-300">
                            {isSaving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </footer>
                </form>
            </div>
        </div>
    );
};

export default PriceItemModal;

