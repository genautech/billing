import React, { useEffect, useState } from 'react';
import { getCobrancasMensais, getDetalhesByCobrancaId, getTabelaPrecos, getCustosAdicionaisByCobrancaId, getClientes } from '../services/firestoreService';
import type { Cliente, CobrancaMensal, DetalheEnvio, TabelaPrecoItem, CustoAdicional, GeneralSettings, FaqItem } from '../types';
import ClientBillDetail from './ClientBillDetail';
import ClientPriceTable from './ClientPriceTable';
import ClientDashboard from './ClientDashboard';
import ClientShipmentReport from './ClientShipmentReport';
import ClientHelpView from './ClientHelpView';
import ClientBillingExplanationView from './ClientBillingExplanationView';
import { FormSelect } from './ui/FormControls';

type ClientView = 'dashboard' | 'faturas' | 'relatorios' | 'precos' | 'ajuda' | 'como-funciona';

interface ClientPortalProps {
    isAdminViewing: boolean;
    authenticatedClient?: Cliente;
    settings: GeneralSettings | null;
    faqs: FaqItem[];
    shareLinkCobrancaId?: string | null;
}

const ClientPortal: React.FC<ClientPortalProps> = ({ isAdminViewing, authenticatedClient, settings, faqs, shareLinkCobrancaId }) => {
    const [clientView, setClientView] = useState<ClientView>('dashboard');
    
    // State for admin view
    const [allClients, setAllClients] = useState<Cliente[]>([]);
    const [selectedClientByAdmin, setSelectedClientByAdmin] = useState<Cliente | null>(null);

    // Common data states
    const [clientCobrancas, setClientCobrancas] = useState<CobrancaMensal[]>([]);
    const [tabelaPrecos, setTabelaPrecos] = useState<TabelaPrecoItem[]>([]);
    const [selectedCobranca, setSelectedCobranca] = useState<CobrancaMensal | null>(null);
    const [selectedDetalhes, setSelectedDetalhes] = useState<DetalheEnvio[]>([]);
    const [selectedCustosAdicionais, setSelectedCustosAdicionais] = useState<CustoAdicional[]>([]);
    
    // Loading states
    const [isInitialLoading, setIsInitialLoading] = useState(false);
    const [isCobrancasLoading, setIsCobrancasLoading] = useState(false);
    const [isDetalhesLoading, setIsDetalhesLoading] = useState(false);

    const currentClient = isAdminViewing ? selectedClientByAdmin : authenticatedClient;
    
    const fetchInvoices = async (clientId: string) => {
        setIsCobrancasLoading(true);
        try {
            const cobrancasData = await getCobrancasMensais(clientId);
            const sorted = cobrancasData.sort((a, b) => new Date(b.dataVencimento).getTime() - new Date(a.dataVencimento).getTime());
            setClientCobrancas(sorted);
            
            // If a cobranca was already selected, find its updated version in the new list. Otherwise, select the first one.
            const updatedSelectedCobranca = sorted.find(c => c.id === selectedCobranca?.id) || sorted[0] || null;
            setSelectedCobranca(updatedSelectedCobranca);
        } catch (error) {
            console.error(`Failed to fetch invoices for client ${clientId}:`, error);
            setClientCobrancas([]);
            setSelectedCobranca(null);
        } finally {
            setIsCobrancasLoading(false);
        }
    };

    // Initial load for all clients (if admin) - only once when admin view is enabled
    useEffect(() => {
        if (!isAdminViewing) {
            setIsInitialLoading(false);
            return;
        }
        
        setIsInitialLoading(true);
        const fetchClients = async () => {
            try {
                const clientsData = await getClientes();
                // Filtrar apenas clientes (não admins) e ordenar
                const clientesOnly = clientsData.filter(c => c.role === 'client');
                const sortedClients = clientesOnly.sort((a, b) => a.nome.localeCompare(b.nome));
                setAllClients(sortedClients);
                // Só definir o primeiro cliente se ainda não houver um selecionado
                if (sortedClients.length > 0 && !selectedClientByAdmin) {
                    setSelectedClientByAdmin(sortedClients[0]);
                }
            } catch (error) {
                console.error("Failed to fetch clients:", error);
            } finally {
                setIsInitialLoading(false);
            }
        };
        fetchClients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdminViewing]);

    // Load price table when client changes
    useEffect(() => {
        const loadPriceTable = async () => {
            if (!currentClient) return;
            try {
                const precosData = await getTabelaPrecos(currentClient.id);
                setTabelaPrecos(precosData);
            } catch (error) {
                console.error("Failed to fetch price table:", error);
            }
        };
        loadPriceTable();
    }, [currentClient?.id]);
    
    // Fetch invoices when the current client (either selected by admin or authenticated) changes
    useEffect(() => {
        if (!currentClient) {
            setClientCobrancas([]);
            setSelectedCobranca(null);
            return;
        }
        fetchInvoices(currentClient.id);
    }, [currentClient]);
    
    // Auto-select invoice from share link
    useEffect(() => {
        if (!shareLinkCobrancaId) {
            console.log('📄 No shareLinkCobrancaId provided');
            return;
        }

        console.log('📄 Attempting to select invoice from share link:', {
            shareLinkCobrancaId,
            clientCobrancasCount: clientCobrancas.length,
            cobrancaIds: clientCobrancas.map(c => c.id)
        });

        if (clientCobrancas.length > 0) {
            const targetCobranca = clientCobrancas.find(c => c.id === shareLinkCobrancaId);
            if (targetCobranca) {
                console.log('📄 Invoice found, selecting:', targetCobranca.id);
                setSelectedCobranca(targetCobranca);
                setClientView('faturas');
            } else {
                console.warn('📄 Invoice not found in clientCobrancas:', shareLinkCobrancaId);
            }
        } else {
            console.log('📄 clientCobrancas not loaded yet, will retry...');
        }
    }, [shareLinkCobrancaId, clientCobrancas]);

    // Retry mechanism: If invoice wasn't found initially, retry after a short delay
    useEffect(() => {
        if (!shareLinkCobrancaId || clientCobrancas.length === 0) return;

        const targetCobranca = clientCobrancas.find(c => c.id === shareLinkCobrancaId);
        if (!targetCobranca && selectedCobranca?.id !== shareLinkCobrancaId) {
            console.log('📄 Retrying invoice selection after delay...');
            const retryTimeout = setTimeout(() => {
                const retryCobranca = clientCobrancas.find(c => c.id === shareLinkCobrancaId);
                if (retryCobranca) {
                    console.log('📄 Invoice found on retry, selecting:', retryCobranca.id);
                    setSelectedCobranca(retryCobranca);
                    setClientView('faturas');
                }
            }, 500);

            return () => clearTimeout(retryTimeout);
        }
    }, [shareLinkCobrancaId, clientCobrancas, selectedCobranca]);

    // Fetch details when an invoice is selected
     useEffect(() => {
        if (selectedCobranca) {
            const fetchDetails = async () => {
                setIsDetalhesLoading(true);
                try {
                    const [detalhesData, custosAdicionaisData] = await Promise.all([
                        getDetalhesByCobrancaId(selectedCobranca.id),
                        getCustosAdicionaisByCobrancaId(selectedCobranca.id)
                    ]);
                    setSelectedDetalhes(detalhesData);
                    setSelectedCustosAdicionais(custosAdicionaisData);
                } catch (error) {
                    console.error(`Failed to fetch invoice details for ${selectedCobranca.id}:`, error);
                } finally {
                    setIsDetalhesLoading(false);
                }
            };
            fetchDetails();
        } else {
            setSelectedDetalhes([]);
            setSelectedCustosAdicionais([]);
        }
    }, [selectedCobranca]);

    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

    if (isInitialLoading) {
        return <div className="text-center p-10">Carregando portal do cliente...</div>;
    }
    
    const ViewToggle: React.FC<{ label: string; viewName: ClientView; }> = ({ label, viewName }) => (
         <button
            onClick={() => setClientView(viewName)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                clientView === viewName
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
        >
            {label}
        </button>
    );

    const StatusBadge: React.FC<{ status: CobrancaMensal['status'] }> = ({ status }) => {
        const styles: Record<CobrancaMensal['status'], string> = { 
            'Paga': 'bg-green-100 text-green-800', 
            'Pendente': 'bg-yellow-100 text-yellow-800', 
            'Vencido': 'bg-red-100 text-red-800',
            'Enviada': 'bg-blue-100 text-blue-800'
        };
        return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[status]}`}>{status}</span>;
    };

    const renderView = () => {
        if (!currentClient) {
             return (
                <div className="text-center p-10 bg-white rounded-lg shadow-md">
                    <p className="text-gray-600">
                        {isAdminViewing ? "Selecione um cliente para visualizar os dados." : "Carregando dados do cliente..."}
                    </p>
                </div>
            );
        }

        switch (clientView) {
            case 'dashboard':
                return <ClientDashboard clientCobrancas={clientCobrancas} client={currentClient} />;
            case 'faturas':
                return (
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 bg-white p-6 rounded-lg shadow-md">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Faturas Mensais</h3>
                            <div className="space-y-3 max-h-[600px] overflow-y-auto">
                                {isCobrancasLoading ? <p>Carregando faturas...</p> : clientCobrancas.length > 0 ? clientCobrancas.map(cobranca => (
                                    <div key={cobranca.id} onClick={() => setSelectedCobranca(cobranca)}
                                        className={`p-4 rounded-lg cursor-pointer border-2 transition-all duration-200 ${
                                            selectedCobranca?.id === cobranca.id
                                                ? 'bg-blue-50 border-blue-500 shadow-lg'
                                                : 'bg-gray-50 border-gray-200 hover:border-blue-300 hover:bg-white'
                                        }`}>
                                        <div className="flex justify-between items-center">
                                            <p className="font-semibold text-gray-700">{cobranca.mesReferencia}</p>
                                            <StatusBadge status={cobranca.status} />
                                        </div>
                                        <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(cobranca.valorTotal)}</p>
                                        <p className="text-xs text-gray-500 mt-2">Vencimento: {formatDate(cobranca.dataVencimento)}</p>
                                    </div>
                                )) : <p className="text-sm text-gray-500">Nenhuma fatura encontrada para este cliente.</p>}
                            </div>
                        </div>
                        <div className="lg:col-span-2">
                            {isDetalhesLoading ? (
                                <div className="bg-white h-full flex items-center justify-center p-6 rounded-lg shadow-md"><p>Carregando detalhes...</p></div>
                            ) : selectedCobranca ? (
                                <ClientBillDetail 
                                    cobranca={selectedCobranca} 
                                    detalhes={selectedDetalhes} 
                                    custosAdicionais={selectedCustosAdicionais}
                                    tabelaPrecos={tabelaPrecos} 
                                    client={currentClient}
                                    onUpdate={() => fetchInvoices(currentClient.id)}
                                />
                            ) : (
                                <div className="bg-white h-full flex items-center justify-center p-6 rounded-lg shadow-md">
                                     <div className="text-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 8.812A9.025 9.025 0 019 8.25a9.025 9.025 0 015.813.562" /></svg>
                                        <h3 className="mt-2 text-sm font-medium text-gray-900">Selecione uma fatura</h3>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'relatorios':
                return <ClientShipmentReport 
                            clientCobrancas={clientCobrancas} 
                            selectedCobranca={selectedCobranca}
                            onCobrancaChange={setSelectedCobranca}
                        />;
            case 'precos':
                return <ClientPriceTable tabelaPrecos={tabelaPrecos} />;
            case 'ajuda':
                return <ClientHelpView faqs={faqs} settings={settings} />;
            case 'como-funciona':
                return <ClientBillingExplanationView cliente={currentClient} />;
            default: return null;
        }
    }

    return (
        <div className="space-y-6">
            {isAdminViewing && allClients.length > 0 && (
                <div className="bg-white p-4 rounded-lg shadow-md">
                    <label htmlFor="admin-client-selector" className="block text-sm font-medium text-gray-700 mb-1">Visualizando como cliente:</label>
                    <FormSelect
                        id="admin-client-selector"
                        value={selectedClientByAdmin?.id || ''}
                        onChange={(e) => {
                            const client = allClients.find(c => c.id === e.target.value);
                            setSelectedClientByAdmin(client || null);
                        }}
                    >
                        {allClients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </FormSelect>
                </div>
            )}

            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                     <div className="flex items-center gap-4">
                        {currentClient?.logoUrl ? (
                            <img src={currentClient.logoUrl} alt={`${currentClient.nome} logo`} className="h-12 w-auto object-contain" />
                        ) : (
                            <div className="h-12 w-12 bg-gray-200 rounded-md flex items-center justify-center text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                        )}
                        <h2 className="text-2xl font-bold text-gray-900">
                            Portal do Cliente: <span className="text-blue-600">{currentClient?.nome}</span>
                        </h2>
                    </div>
                </div>
            </div>

            <div className="flex items-center space-x-2 bg-gray-200 p-1 rounded-lg self-start flex-wrap">
                <ViewToggle label="Dashboard" viewName="dashboard" />
                <ViewToggle label="Faturas" viewName="faturas" />
                <ViewToggle label="Relatórios" viewName="relatorios" />
                <ViewToggle label="Tabela de Preços" viewName="precos" />
                <ViewToggle label="Como Funciona" viewName="como-funciona" />
                <ViewToggle label="Ajuda" viewName="ajuda" />
            </div>
            
            <div>{renderView()}</div>
        </div>
    );
};

export default ClientPortal;