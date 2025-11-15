import React, { useState, useEffect } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { 
    getClientes, 
    getTabelaPrecos, 
    getAllTabelasPrecoClientes,
    createTabelaPrecoCliente,
    updateTabelaPrecoCliente,
    deleteTabelaPrecoCliente,
    duplicateTabelaPrecoCliente,
    getTabelaPrecoCliente
} from '../../../services/firestoreService';
import type { Cliente, TabelaPrecoItem, TabelaPrecoCliente } from '../../../types';
import { FileInput } from '../../ui/FileInput';
import PriceItemModal from './PriceItemModal';

const ClientPriceTableManagementView: React.FC = () => {
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [tabelasClientes, setTabelasClientes] = useState<TabelaPrecoCliente[]>([]);
    const [tabelaPadrao, setTabelaPadrao] = useState<TabelaPrecoItem[]>([]);
    const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
    const [selectedTabela, setSelectedTabela] = useState<TabelaPrecoCliente | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvContent, setCsvContent] = useState<string>('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<TabelaPrecoItem | Omit<TabelaPrecoItem, 'id'> | null>(null);
    const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
    const [isConfirmDeleteModalOpen, setIsConfirmDeleteModalOpen] = useState(false);
    const [itemToDeleteIndex, setItemToDeleteIndex] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const { addToast } = useToast();

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [clientesData, tabelasData, tabelaPadraoData] = await Promise.all([
                    getClientes(),
                    getAllTabelasPrecoClientes(),
                    getTabelaPrecos()
                ]);
                setClientes(clientesData.filter(c => c.role === 'client'));
                setTabelasClientes(tabelasData);
                setTabelaPadrao(tabelaPadraoData);
            } catch (error) {
                console.error('Error loading data:', error);
                addToast('Erro ao carregar dados', 'error');
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [addToast]);

    const getTabelaDoCliente = (cliente: Cliente): TabelaPrecoCliente | null => {
        if (!cliente.tabelaPrecoId) return null;
        return tabelasClientes.find(t => t.id === cliente.tabelaPrecoId) || null;
    };

    const handleCreateTabela = async (cliente: Cliente, nome: string) => {
        setIsCreating(true);
        try {
            const tabelaId = await createTabelaPrecoCliente(cliente.id, nome);
            addToast(`Tabela personalizada criada para ${cliente.nome}`, 'success');
            
            // Recarregar dados
            const [tabelasData, clientesData] = await Promise.all([
                getAllTabelasPrecoClientes(),
                getClientes()
            ]);
            setTabelasClientes(tabelasData);
            setClientes(clientesData.filter(c => c.role === 'client'));
            
            // Automaticamente selecionar a tabela recém-criada para edição
            const novaTabela = await getTabelaPrecoCliente(tabelaId);
            if (novaTabela) {
                setSelectedCliente(cliente);
                setSelectedTabela(novaTabela);
                // Scroll para a seção de edição
                setTimeout(() => {
                    const editSection = document.getElementById('edit-table-section');
                    if (editSection) {
                        editSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 100);
            }
        } catch (error) {
            console.error('Error creating table:', error);
            addToast('Erro ao criar tabela personalizada', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteTabela = async (tabelaId: string) => {
        if (!confirm('Tem certeza que deseja remover a tabela personalizada? O cliente voltará a usar a tabela padrão.')) {
            return;
        }
        try {
            await deleteTabelaPrecoCliente(tabelaId);
            addToast('Tabela personalizada removida', 'success');
            // Recarregar dados
            const [tabelasData, clientesData] = await Promise.all([
                getAllTabelasPrecoClientes(),
                getClientes()
            ]);
            setTabelasClientes(tabelasData);
            setClientes(clientesData.filter(c => c.role === 'client'));
            if (selectedTabela?.id === tabelaId) {
                setSelectedTabela(null);
                setSelectedCliente(null);
            }
        } catch (error) {
            console.error('Error deleting table:', error);
            addToast('Erro ao remover tabela personalizada', 'error');
        }
    };

    const handleDuplicateTabela = async (fromCliente: Cliente, toCliente: Cliente) => {
        try {
            await duplicateTabelaPrecoCliente(fromCliente.id, toCliente.id);
            addToast(`Tabela duplicada de ${fromCliente.nome} para ${toCliente.nome}`, 'success');
            // Recarregar dados
            const [tabelasData, clientesData] = await Promise.all([
                getAllTabelasPrecoClientes(),
                getClientes()
            ]);
            setTabelasClientes(tabelasData);
            setClientes(clientesData.filter(c => c.role === 'client'));
        } catch (error) {
            console.error('Error duplicating table:', error);
            addToast('Erro ao duplicar tabela', 'error');
        }
    };

    // Funções auxiliares para gerenciar itens da tabela personalizada
    const handleAddItem = () => {
        setEditingItem({
            categoria: '', 
            subcategoria: '', 
            descricao: '', 
            metrica: 'Unidade',
            custoUnitario: 0, 
            margemLucro: 0, 
            precoVenda: 0
        });
        setEditingItemIndex(null);
        setIsModalOpen(true);
    };

    const handleEditItem = (item: TabelaPrecoItem, index: number) => {
        // Criar uma cópia do item com um ID temporário baseado no índice para validação
        const itemWithTempId = { ...item, id: `temp-${index}` };
        setEditingItem(itemWithTempId);
        setEditingItemIndex(index);
        setIsModalOpen(true);
    };

    const handleDeleteItem = (index: number) => {
        setItemToDeleteIndex(index);
        setIsConfirmDeleteModalOpen(true);
    };

    const handleConfirmDeleteItem = async () => {
        if (itemToDeleteIndex === null || !selectedTabela) return;
        
        setIsDeleting(true);
        try {
            const updatedItens = selectedTabela.itens.filter((_, idx) => idx !== itemToDeleteIndex);
            await updateTabelaPrecoCliente(selectedTabela.id, updatedItens);
            addToast('Item excluído com sucesso!', 'success');
            
            // Recarregar tabela
            const tabelaAtualizada = await getTabelaPrecoCliente(selectedTabela.id);
            if (tabelaAtualizada) {
                setSelectedTabela(tabelaAtualizada);
            }
        } catch (error) {
            console.error('Error deleting item:', error);
            addToast('Erro ao excluir item', 'error');
        } finally {
            setIsDeleting(false);
            setIsConfirmDeleteModalOpen(false);
            setItemToDeleteIndex(null);
        }
    };

    const handleSaveItem = async (item: TabelaPrecoItem | Omit<TabelaPrecoItem, 'id'>) => {
        if (!selectedTabela) return;

        try {
            // Remover ID temporário se existir
            const { id, ...itemWithoutId } = item as any;
            const cleanItem = itemWithoutId as Omit<TabelaPrecoItem, 'id'>;

            let updatedItens: TabelaPrecoItem[];
            
            if (editingItemIndex !== null) {
                // Atualizar item existente
                updatedItens = [...selectedTabela.itens];
                updatedItens[editingItemIndex] = cleanItem as TabelaPrecoItem;
                addToast('Item atualizado com sucesso!', 'success');
            } else {
                // Adicionar novo item
                updatedItens = [...selectedTabela.itens, cleanItem as TabelaPrecoItem];
                addToast('Item adicionado com sucesso!', 'success');
            }

            await updateTabelaPrecoCliente(selectedTabela.id, updatedItens);
            
            // Recarregar tabela
            const tabelaAtualizada = await getTabelaPrecoCliente(selectedTabela.id);
            if (tabelaAtualizada) {
                setSelectedTabela(tabelaAtualizada);
            }
            
            setIsModalOpen(false);
            setEditingItem(null);
            setEditingItemIndex(null);
        } catch (error) {
            console.error('Error saving item:', error);
            addToast('Erro ao salvar item', 'error');
        }
    };

    const handleUploadCSV = async () => {
        if (!csvContent || !selectedTabela) {
            addToast('Por favor, selecione um arquivo CSV e uma tabela personalizada', 'error');
            return;
        }
        try {
            // Parse CSV manualmente (mesma lógica do firestoreService)
            const parseCSV = (csv: string): Record<string, string>[] => {
                csv = csv.startsWith('\ufeff') ? csv.substring(1) : csv;
                const allLines = csv.trim().replace(/\r/g, '').split('\n');
                if (allLines.length < 1) return [];
                
                let headerIndex = allLines.findIndex(line => line.includes(',') || line.includes(';'));
                if (headerIndex === -1) {
                    headerIndex = allLines.findIndex(line => line.trim().length > 0);
                    if (headerIndex === -1) return [];
                }
                
                const headerLine = allLines[headerIndex];
                const dataLines = allLines.slice(headerIndex + 1);
                const commaCount = (headerLine.match(/,/g) || []).length;
                const semicolonCount = (headerLine.match(/;/g) || []).length;
                const delimiter = semicolonCount > commaCount ? ';' : ',';
                const regex = new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
                const headers = headerLine.split(regex).map(h => h.trim().replace(/^"|"$/g, ''));
                
                return dataLines.map(line => {
                    const values = line.split(regex).map(v => v.trim().replace(/^"|"$/g, ''));
                    const row: Record<string, string> = {};
                    headers.forEach((header, i) => {
                        row[header] = values[i] || '';
                    });
                    return row;
                });
            };
            
            const parsedData = parseCSV(csvContent);
            const itens: TabelaPrecoItem[] = parsedData.map((row: any, index: number) => {
                let custoUnitario = 0;
                let precoVenda = 0;
                let margemLucro = 0;

                const custoStr = row['Custo Unitario'] || row['Custo Unitário'];
                const precoStr = row['Preço Unitário'] || row['Preco Unitario'];

                if (custoStr) {
                    custoUnitario = parseFloat(custoStr.replace(',', '.')) || 0;
                }
                if (precoStr) {
                    precoVenda = parseFloat(precoStr.replace(',', '.')) || 0;
                }

                if (custoUnitario > 0 && precoVenda > 0) {
                    margemLucro = ((precoVenda - custoUnitario) / custoUnitario) * 100;
                } else if (custoUnitario > 0 && precoVenda === 0) {
                    precoVenda = custoUnitario;
                    margemLucro = 0;
                } else if (precoVenda > 0 && custoUnitario === 0) {
                    custoUnitario = precoVenda;
                    margemLucro = 0;
                }

                return {
                    id: `temp-${index}`,
                    categoria: row['Categoria'] || '',
                    subcategoria: row['Subcategoria'] || '',
                    descricao: row['Descrição do Custo'] || row['Descrição'] || '',
                    metrica: row['Métrica'] || row['Metrica'] || '',
                    custoUnitario,
                    margemLucro,
                    precoVenda,
                } as TabelaPrecoItem;
            });

            await updateTabelaPrecoCliente(selectedTabela.id, itens);
            addToast('Tabela personalizada atualizada com sucesso', 'success');
            setCsvFile(null);
            setCsvContent('');
            // Recarregar tabela
            const tabelaAtualizada = await getTabelaPrecoCliente(selectedTabela.id);
            if (tabelaAtualizada) {
                setSelectedTabela(tabelaAtualizada);
            }
        } catch (error) {
            console.error('Error uploading CSV:', error);
            addToast('Erro ao atualizar tabela personalizada', 'error');
        }
    };

    if (isLoading) {
        return <div className="text-center p-10">Carregando...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Gerenciamento de Tabelas de Preços por Cliente</h3>
                <p className="text-gray-600 mb-6">
                    Gerencie tabelas de preços personalizadas para cada cliente. Clientes sem tabela personalizada usam a tabela padrão.
                </p>

                {/* Lista de Clientes */}
                <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-gray-800">Clientes</h4>
                    <div className="overflow-x-auto">
                        <table className="min-w-full border border-gray-200 rounded-lg">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tabela</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {clientes.map(cliente => {
                                    const tabelaCliente = getTabelaDoCliente(cliente);
                                    return (
                                        <tr key={cliente.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm font-medium text-gray-800">{cliente.nome}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                {tabelaCliente ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                        {tabelaCliente.nome}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                        Padrão
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm space-x-2">
                                                {!tabelaCliente ? (
                                                    <button
                                                        onClick={() => {
                                                            const nome = prompt('Nome da tabela personalizada:', `Tabela ${cliente.nome}`);
                                                            if (nome) {
                                                                handleCreateTabela(cliente, nome);
                                                            }
                                                        }}
                                                        disabled={isCreating}
                                                        className="text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400"
                                                    >
                                                        Criar Personalizada
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedCliente(cliente);
                                                                setSelectedTabela(tabelaCliente);
                                                            }}
                                                            className="text-blue-600 hover:text-blue-800 font-medium"
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteTabela(tabelaCliente.id)}
                                                            className="text-red-600 hover:text-red-800 font-medium"
                                                        >
                                                            Remover
                                                        </button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Edição de Tabela Personalizada */}
            {selectedTabela && selectedCliente && (
                <div id="edit-table-section" className="bg-white p-6 rounded-lg shadow-md">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h4 className="text-lg font-semibold text-gray-800">
                                Editando Tabela: {selectedTabela.nome}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">Cliente: {selectedCliente.nome}</p>
                        </div>
                        <button
                            onClick={() => {
                                setSelectedTabela(null);
                                setSelectedCliente(null);
                                setCsvFile(null);
                                setCsvContent('');
                            }}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="text-sm text-gray-700 space-y-1">
                            <p><strong>Total de itens:</strong> {selectedTabela.itens.length}</p>
                            <p><strong>Baseada em:</strong> {selectedTabela.baseadaEm === 'padrao' ? 'Tabela Padrão' : 'Outra tabela'}</p>
                            <p className="text-xs text-gray-600 mt-2">
                                Esta tabela foi criada com base na tabela padrão. Você pode editar os itens diretamente na tabela, adicionar novos serviços ou atualizar via CSV.
                            </p>
                        </div>
                    </div>

                    {/* Visualização da Tabela */}
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-3">
                            <h5 className="text-md font-semibold text-gray-800">Itens da Tabela ({selectedTabela.itens.length})</h5>
                            <button
                                onClick={handleAddItem}
                                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 shadow-sm font-medium text-sm"
                            >
                                + Adicionar Item
                            </button>
                        </div>
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Custo Unit.</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margem</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Preço Venda</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {selectedTabela.itens.length > 0 ? (
                                        selectedTabela.itens.map((item, index) => (
                                            <tr key={item.id || index} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 text-sm text-gray-900">{item.descricao}</td>
                                                <td className="px-4 py-3 text-sm text-gray-600">{item.categoria} / {item.subcategoria}</td>
                                                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custoUnitario)}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                                                    {Number(item.margemLucro).toFixed(2)}%
                                                </td>
                                                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.precoVenda)}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-medium text-right space-x-2">
                                                    <button 
                                                        onClick={() => handleEditItem(item, index)}
                                                        className="text-indigo-600 hover:text-indigo-900"
                                                    >
                                                        Editar
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteItem(index)}
                                                        className="text-red-600 hover:text-red-900"
                                                    >
                                                        Excluir
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                                Nenhum item na tabela. Clique em "+ Adicionar Item" para começar.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Upload CSV */}
                    <div className="border-t border-gray-200 pt-6">
                        <h5 className="text-md font-semibold text-gray-800 mb-3">Atualizar via CSV</h5>
                        <div className="space-y-4">
                            <FileInput
                                id="custom-table-csv"
                                label="Selecione um arquivo CSV para atualizar a tabela"
                                file={csvFile}
                                onFileChange={setCsvFile}
                                onFileRead={setCsvContent}
                            />
                            {csvContent && (
                                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <p className="text-sm text-green-800">
                                        ✓ Arquivo CSV carregado com sucesso. Clique em "Atualizar Tabela" para aplicar as alterações.
                                    </p>
                                </div>
                            )}
                            <button
                                onClick={handleUploadCSV}
                                disabled={!csvContent}
                                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
                            >
                                Atualizar Tabela
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Edição de Item */}
            {isModalOpen && selectedTabela && (
                <PriceItemModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setEditingItem(null);
                        setEditingItemIndex(null);
                    }}
                    onSave={handleSaveItem}
                    item={editingItem}
                    tabelaPrecos={selectedTabela.itens}
                />
            )}

            {/* Modal de Confirmação de Exclusão */}
            {isConfirmDeleteModalOpen && itemToDeleteIndex !== null && selectedTabela && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setIsConfirmDeleteModalOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="p-6 text-center">
                            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                                <svg className="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-lg mt-3 font-medium text-gray-900">Confirmar Exclusão</h3>
                            <p className="mt-2 text-sm text-gray-500">
                                Tem certeza que deseja excluir o item <strong>{selectedTabela.itens[itemToDeleteIndex]?.descricao}</strong>? Esta ação é permanente.
                            </p>
                        </div>
                        <div className="bg-gray-50 px-4 py-3 sm:px-6 flex flex-row-reverse rounded-b-lg">
                            <button
                                type="button"
                                onClick={handleConfirmDeleteItem}
                                disabled={isDeleting}
                                className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 sm:ml-3 disabled:bg-red-300"
                            >
                                {isDeleting ? 'Excluindo...' : 'Excluir'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsConfirmDeleteModalOpen(false);
                                    setItemToDeleteIndex(null);
                                }}
                                disabled={isDeleting}
                                className="w-full sm:w-auto mt-3 sm:mt-0 inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientPriceTableManagementView;

