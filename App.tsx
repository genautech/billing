
import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import AdminDashboard from './components/AdminDashboard';
import ClientPortal from './components/ClientPortal';
import LoginModal from './components/LoginModal';
import LandingPage from './components/LandingPage'; // Import the new component
import { ToastProvider, useToast } from './contexts/ToastContext';
import { getGeneralSettings, getFaqs, seedInitialFaqs, seedAdminUser, getClienteById } from './services/firestoreService';
import type { Cliente, GeneralSettings, FaqItem } from './types';

const AppContent: React.FC = () => {
    const [authenticatedUser, setAuthenticatedUser] = useState<Cliente | null>(null);
    const [activeView, setActiveView] = useState<'admin' | 'client'>('admin');
    const [settings, setSettings] = useState<GeneralSettings | null>(null);
    const [faqs, setFaqs] = useState<FaqItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLandingPageView, setIsLandingPageView] = useState(false); // State for the new landing page
    const [shareLinkCobrancaId, setShareLinkCobrancaId] = useState<string | null>(null); // Store cobrancaId from share link
    const [shareLinkProcessed, setShareLinkProcessed] = useState(false); // Track if share link has been processed
    const { addToast } = useToast();

    // Check for landing page hash on initial load
    useEffect(() => {
        if (window.location.hash === '#custos') {
            setIsLandingPageView(true);
        }
    }, []);

    const handleClientLoginSuccess = useCallback((client: Cliente) => {
        setAuthenticatedUser(client);
        setActiveView('client');
    }, []);
    
    const handleAdminLoginSuccess = useCallback((admin: Cliente) => {
        setAuthenticatedUser(admin);
        setActiveView('admin');
    }, []);

    // Process share link parameters (clienteId and cobrancaId)
    const processShareLink = useCallback(async () => {
        if (shareLinkProcessed) {
            console.log('🔗 Share link already processed, skipping...');
            return;
        }

        const hash = window.location.hash;
        console.log('🔗 Checking hash for share link:', hash);
        
        if (!hash || hash === '#custos') return;

        // Parse hash format: #share-clienteId-cobrancaId
        if (hash.startsWith('#share-')) {
            console.log('🔗 Share link detected, parsing...');
            const parts = hash.substring(7).split('-'); // Remove '#share-' and split by '-'
            if (parts.length >= 2) {
                const clienteId = parts[0];
                // Join remaining parts in case cobrancaId contains '-' characters
                const cobrancaId = parts.slice(1).join('-');
                
                console.log('🔗 Parsed share link:', { clienteId, cobrancaId, authenticatedUser: !!authenticatedUser });

                if (clienteId && cobrancaId) {
                    // Process even if user is already authenticated (to switch to the shared invoice)
                    try {
                        const cliente = await getClienteById(clienteId);
                        if (cliente) {
                            console.log('🔗 Cliente found, processing share link...');
                            
                            // If user is not authenticated or is a different user, auto-login
                            if (!authenticatedUser || authenticatedUser.id !== clienteId) {
                                handleClientLoginSuccess(cliente);
                            }
                            
                            // Store cobrancaId for ClientPortal to use
                            setShareLinkCobrancaId(cobrancaId);
                            setShareLinkProcessed(true);
                            
                            // Clear hash to avoid reprocessing
                            window.history.replaceState(null, '', window.location.pathname);
                            addToast(`Acessando fatura compartilhada...`, 'info');
                        } else {
                            console.error('🔗 Cliente not found for ID:', clienteId);
                            addToast('Link de compartilhamento inválido. Cliente não encontrado.', 'error');
                            setShareLinkProcessed(true); // Mark as processed to avoid retrying
                        }
                    } catch (error) {
                        console.error('🔗 Error processing share link:', error);
                        addToast('Erro ao processar link de compartilhamento.', 'error');
                        setShareLinkProcessed(true); // Mark as processed to avoid retrying
                    }
                }
            }
        }
    }, [shareLinkProcessed, authenticatedUser, addToast, handleClientLoginSuccess]);

    // Process share link on mount
    useEffect(() => {
        processShareLink();
    }, [processShareLink]);

    const fetchGlobalData = useCallback(async () => {
        try {
            // These functions check if seeding is needed and run it. Safe to call every time.
            await seedInitialFaqs();
            await seedAdminUser();
            
            const [settingsData, faqsData] = await Promise.all([
                getGeneralSettings(),
                getFaqs(),
            ]);
            setSettings(settingsData);
            setFaqs(faqsData);
        } catch (error) {
            console.error("Failed to fetch global settings/FAQ:", error);
            addToast("Não foi possível carregar as configurações globais.", 'error');
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);
    
    useEffect(() => {
        // Don't fetch auth-related data if we are on the landing page
        if (!isLandingPageView) {
            fetchGlobalData();
        } else {
            setIsLoading(false);
        }
    }, [fetchGlobalData, isLandingPageView]);

    // Fallback: Process share link when loading is complete (in case it wasn't processed on mount)
    useEffect(() => {
        if (!isLoading && !shareLinkProcessed) {
            console.log('🔗 Loading complete, retrying share link processing...');
            processShareLink();
        }
    }, [isLoading, shareLinkProcessed, processShareLink]);

    // Auto-login removed for security reasons - users must authenticate explicitly

    useEffect(() => {
        const handleToastEvent = (e: Event) => {
            const { message, type } = (e as CustomEvent).detail;
            addToast(message, type);
        };
        window.addEventListener('add-toast', handleToastEvent);
        
        return () => {
            window.removeEventListener('add-toast', handleToastEvent);
        };
    }, [addToast]);

    const handleLogout = () => {
        setAuthenticatedUser(null);
        addToast('Você foi desconectado.', 'info');
    };
    
    // Render landing page if hash is detected
    if (isLandingPageView) {
        return <LandingPage />;
    }
    
    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center">Carregando...</div>
    }

    if (!authenticatedUser) {
        return <LoginModal onClientLoginSuccess={handleClientLoginSuccess} onAdminLoginSuccess={handleAdminLoginSuccess} />;
    }

    const userType = authenticatedUser.role;

    const renderContent = () => {
        if (userType === 'admin') {
            const adminDashboard = <AdminDashboard
                adminUser={authenticatedUser}
                settings={settings}
                faqs={faqs}
                onDataUpdate={fetchGlobalData}
            />;
            const clientPortalAsAdmin = <ClientPortal 
                isAdminViewing={true}
                settings={settings}
                faqs={faqs}
            />;
            return activeView === 'admin' ? adminDashboard : clientPortalAsAdmin;
        }
        
        // userType is 'client'
        return <ClientPortal 
                    isAdminViewing={false} 
                    authenticatedClient={authenticatedUser}
                    settings={settings}
                    faqs={faqs}
                    shareLinkCobrancaId={shareLinkCobrancaId}
                />;
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
            <Header 
                userType={userType}
                activeView={activeView}
                settings={settings}
                onViewChange={setActiveView}
                onLogout={handleLogout}
            />
            <main className="p-4 sm:p-6 lg:p-8">
                {renderContent()}
            </main>
        </div>
    );
};

const App: React.FC = () => {
    return (
        <ToastProvider>
            <AppContent />
        </ToastProvider>
    );
};


export default App;
