import React, { useState, FormEvent } from 'react';
// FIX: Corrected import path
import { addCliente, updateCliente, deleteCliente } from '../../../services/firestoreService';
import type { Cliente } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { FormInput, FormSelect } from '../../ui/FormControls';

// --- Local Confirmation Modal Component ---
const ConfirmDeleteModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isDeleting: boolean;
    clientName: string;
}> = ({ isOpen, onClose, onConfirm, isDeleting, clientName }) => {
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
                        Tem certeza que deseja excluir o cliente <strong>{clientName}</strong>? Esta ação é permanente.
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


interface ClientManagementViewProps {
    clientes: Cliente[];
    onUpdate: () => void;
}

const ClientManagementView: React.FC<ClientManagementViewProps> = ({ clientes, onUpdate }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [current, setCurrent] = useState<Omit<Cliente, 'id'>>({ nome: '', cnpj: '', email: '', emailFaturamento: '', role: 'client', skusAtivos: 0, unidadesEmEstoque: 0, logoUrl: '', password: '123' });
    const [currentId, setCurrentId] = useState<string | null>(null);
    const { addToast } = useToast();

    // States for delete confirmation modal
    const [isConfirmDeleteModalOpen, setIsConfirmDeleteModalOpen] = useState(false);
    const [clientToDelete, setClientToDelete] = useState<Cliente | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleAddNew = () => {
        setCurrent({ nome: '', cnpj: '', email: '', emailFaturamento: '', role: 'client', skusAtivos: 0, unidadesEmEstoque: 0, logoUrl: '', password: '123' });
        setCurrentId(null);
        setIsFormOpen(true);
    };
    const handleEdit = (cliente: Cliente) => {
        setCurrent(cliente);
        setCurrentId(cliente.id)
        setIsFormOpen(true);
    };
    
    const handleDeleteClick = (cliente: Cliente) => {
        setClientToDelete(cliente);
        setIsConfirmDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!clientToDelete) return;

        setIsDeleting(true);
        try {
            await deleteCliente(clientToDelete.id);
            addToast('Cliente excluído com sucesso.', 'success');
            onUpdate();
        } catch (error) {
            console.error("Failed to delete client:", error);
            addToast(`Erro ao excluir cliente: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setIsConfirmDeleteModalOpen(false);
            setClientToDelete(null);
            setIsDeleting(false);
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const action = currentId ? 'atualizado' : 'adicionado';
            if (currentId) {
                await updateCliente({ ...current, id: currentId });
            } else {
                await addCliente(current);
            }
            addToast(`Cliente ${action} com sucesso.`, 'success');
            onUpdate();
            setIsFormOpen(false);
        } catch (error) {
            console.error("Failed to save client:", error);
            addToast(`Erro ao salvar cliente: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setCurrent(p => ({ ...p, logoUrl: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    return (
         <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-2xl font-bold text-gray-900">Gestão de Clientes</h3>
                <button onClick={handleAddNew} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 shadow-sm font-medium">+ Novo Cliente</button>
            </div>
            {isFormOpen && (
                 <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg bg-gray-50">
                    <fieldset disabled={isSubmitting}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                            <div className="md:col-span-2"><h4 className="font-semibold text-lg">{currentId ? 'Editar Cliente' : 'Novo Cliente'}</h4></div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Nome da Empresa</label>
                                <FormInput type="text" value={current.nome} onChange={(e) => setCurrent(p => ({...p, nome: e.target.value}))} required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">CNPJ</label>
                                <FormInput type="text" value={current.cnpj} onChange={(e) => setCurrent(p => ({...p, cnpj: e.target.value}))} required />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">Email (para login)</label>
                                <FormInput type="email" value={current.email} onChange={(e) => setCurrent(p => ({...p, email: e.target.value}))} required />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">Senha</label>
                                <FormInput type="text" value={current.password || ''} onChange={(e) => setCurrent(p => ({...p, password: e.target.value}))} required />
                            </div>
                             <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Email de Faturamento (para cobrança)</label>
                                <FormInput type="email" value={current.emailFaturamento || ''} onChange={(e) => setCurrent(p => ({...p, emailFaturamento: e.target.value}))} placeholder="Opcional. Se em branco, usa o de login." />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">Função (Role)</label>
                                <FormSelect value={current.role} onChange={(e) => setCurrent(p => ({...p, role: e.target.value as 'admin' | 'client'}))}>
                                    <option value="client">Cliente</option>
                                    <option value="admin">Admin</option>
                                </FormSelect>
                            </div>
                             <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Logo do Cliente</label>
                                <input type="file" onChange={handleLogoChange} accept="image/*" className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                {current.logoUrl && <img src={current.logoUrl} alt="Preview" className="mt-2 h-16 w-auto rounded-md object-contain bg-gray-200 p-1" />}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">SKUs Ativos</label>
                                <FormInput type="number" value={current.skusAtivos} onChange={(e) => setCurrent(p => ({...p, skusAtivos: parseInt(e.target.value) || 0 }))} required />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">Unidades em Estoque</label>
                                <FormInput type="number" value={current.unidadesEmEstoque} onChange={(e) => setCurrent(p => ({...p, unidadesEmEstoque: parseInt(e.target.value) || 0 }))} required />
                            </div>
                        </div>
                    </fieldset>
                    <div className="flex justify-end space-x-3 mt-4">
                        <button type="button" onClick={() => setIsFormOpen(false)} disabled={isSubmitting} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 disabled:opacity-50">Cancelar</button>
                        <button type="submit" disabled={isSubmitting} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-green-300">
                            {isSubmitting ? 'Salvando...' : (currentId ? 'Atualizar' : 'Salvar')}
                        </button>
                    </div>
                </form>
            )}
             <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKUs</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unidades</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {clientes.map(c => (
                            <tr key={c.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{c.nome}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.email}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.skusAtivos}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.unidadesEmEstoque.toLocaleString('pt-BR')}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right space-x-2">
                                    <button onClick={() => handleEdit(c)} className="text-indigo-600 hover:text-indigo-900">Editar</button>
                                    <button onClick={() => handleDeleteClick(c)} className="text-red-600 hover:text-red-900">Excluir</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <ConfirmDeleteModal
                isOpen={isConfirmDeleteModalOpen}
                onClose={() => setIsConfirmDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
                clientName={clientToDelete?.nome || ''}
            />
        </div>
    );
};

export default ClientManagementView;