import React, { useEffect, useState } from 'react';
import { getTabelaPrecos, getCobrancasMensais, getClientes } from '../services/firestoreService';
import type { TabelaPrecoItem, CobrancaMensal, Cliente, GeneralSettings, FaqItem } from '../types';
import { useToast } from '../contexts/ToastContext';

import DashboardView from './admin/views/DashboardView';
import ClientManagementView from './admin/views/ClientManagementView';
import InvoiceGenerationView from './admin/views/InvoiceGenerationView';
import BillingArchiveView from './admin/views/BillingArchiveView';
import SettingsView from './admin/views/SettingsView';
import TemplatesView from './admin/views/TemplatesView';
import GeneralSettingsView from './admin/views/GeneralSettingsView';
import FaqManagementView from './admin/views/FaqManagementView';
import ClientPriceTableManagementView from './admin/views/ClientPriceTableManagementView';
import PaymentsView from './admin/views/PaymentsView';


type AdminView = 'dashboard' | 'clients' | 'billing' | 'archive' | 'settings' | 'templates' | 'general-settings' | 'faq' | 'client-price-tables' | 'payments';

interface AdminDashboardProps {
    adminUser: Cliente;
    settings: GeneralSettings | null;
    faqs: FaqItem[];
    onDataUpdate: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ adminUser, settings, faqs, onDataUpdate }) => {
    const [view, setView] = useState<AdminView>('dashboard');
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();
    
    // Data states are kept in the parent to be passed down to children
    const [tabelaPrecos, setTabelaPrecos] = useState<TabelaPrecoItem[]>([]);
    const [cobrancas, setCobrancas] = useState<CobrancaMensal[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    
    const fetchData = async () => {
        setLoading(true);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdminDashboard.tsx:fetchData:start',message:'Iniciando fetchData',data:{loading:true},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        try {
            const [precosData, cobrancasData, clientesData] = await Promise.all([
                getTabelaPrecos(), getCobrancasMensais(), getClientes()
            ]);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdminDashboard.tsx:fetchData:success',message:'Dados carregados com sucesso',data:{precosCount:precosData.length,cobrancasCount:cobrancasData.length,clientesCount:clientesData.length,sampleClientes:clientesData.slice(0,3).map(c=>({id:c.id,nome:c.nome}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H2'})}).catch(()=>{});
            // #endregion
            setTabelaPrecos(precosData);
            setCobrancas(cobrancasData);
            setClientes(clientesData);
        } catch (error) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdminDashboard.tsx:fetchData:error',message:'Erro ao carregar dados',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
            // #endregion
            console.error("Failed to fetch initial data:", error);
            addToast("Não foi possível carregar os dados. Verifique a configuração do Firebase e sua conexão.", 'error');
        } finally {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdminDashboard.tsx:fetchData:finally',message:'fetchData finalizado',data:{loading:false},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
            // #endregion
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);
    
    const handleSubViewUpdate = () => {
        fetchData(); // Refreshes prices, clients, invoices
        onDataUpdate(); // Refreshes global settings, faqs
    };

    const NavItem: React.FC<{ viewName: AdminView; label: string; icon: React.ReactNode }> = ({ viewName, label, icon }) => (
        <button
            onClick={() => setView(viewName)}
            className={`flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-medium w-full text-left transition-colors ${
                view === viewName ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'
            }`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
    
    const renderView = () => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AdminDashboard.tsx:renderView',message:'Renderizando view',data:{view,clientesCount:clientes.length,tabelaPrecosCount:tabelaPrecos.length,cobrancasCount:cobrancas.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H5'})}).catch(()=>{});
        // #endregion
        switch (view) {
            case 'dashboard': return <DashboardView cobrancas={cobrancas} clientes={clientes} />;
            case 'clients': return <ClientManagementView clientes={clientes} onUpdate={fetchData} />;
            case 'billing': return <InvoiceGenerationView clientes={clientes} tabelaPrecos={tabelaPrecos} onUpdate={fetchData} />;
            case 'archive': return <BillingArchiveView cobrancas={cobrancas} clientes={clientes} tabelaPrecos={tabelaPrecos} onUpdate={fetchData} />;
            case 'settings': return <SettingsView tabelaPrecos={tabelaPrecos} onUpdate={fetchData} />;
            case 'templates': return <TemplatesView />;
            case 'general-settings': return <GeneralSettingsView adminUser={adminUser} settings={settings} onUpdate={onDataUpdate} />;
            case 'faq': return <FaqManagementView faqs={faqs} onUpdate={onDataUpdate} />;
            case 'client-price-tables': return <ClientPriceTableManagementView />;
            case 'payments': return <PaymentsView onUpdate={fetchData} />;
            default: return <DashboardView cobrancas={cobrancas} clientes={clientes} />;
        }
    };

    if (loading) {
        return <div className="text-center p-10">Carregando dados do Admin...</div>;
    }

    return (
        <div className="flex flex-col md:flex-row gap-8">
            <aside className="md:w-64 flex-shrink-0">
                <div className="bg-gray-100 p-4 rounded-lg h-full">
                    <h2 className="text-lg font-bold text-gray-800 mb-6 px-2">Menu</h2>
                    <nav className="space-y-2">
                         <NavItem viewName="dashboard" label="Dashboard" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>} />
                         <NavItem viewName="clients" label="Gestão de Clientes" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg>} />
                         <NavItem viewName="templates" label="Templates e Imports" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>} />
                         <NavItem viewName="billing" label="Gerar Nova Cobrança" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4zm1 4a1 1 0 000 2h10a1 1 0 100-2H5zm0 4a1 1 0 100 2h10a1 1 0 100-2H5z" clipRule="evenodd" /></svg>} />
                         <NavItem viewName="archive" label="Arquivo de Cobranças" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" /><path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" /></svg>} />
                         <NavItem viewName="settings" label="Tabela de Preços" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>} />
                         <NavItem viewName="client-price-tables" label="Tabelas por Cliente" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>} />
                         <NavItem viewName="faq" label="Gestão de FAQ" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>} />
                         <NavItem viewName="payments" label="Pagamentos" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" /></svg>} />
                         <NavItem viewName="general-settings" label="Configurações Gerais" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" /></svg>} />
                    </nav>
                </div>
            </aside>
            <main className="flex-1">
                {renderView()}
            </main>
        </div>
    );
};

export default AdminDashboard;