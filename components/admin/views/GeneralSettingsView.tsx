import React, { useState, useEffect } from 'react';
import { updateGeneralSettings, updateCliente } from '../../../services/firestoreService';
import type { GeneralSettings, Cliente } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { FormInput } from '../../ui/FormControls';

interface GeneralSettingsViewProps {
    onUpdate: () => void;
    settings: GeneralSettings | null;
    adminUser: Cliente;
}

const GeneralSettingsView: React.FC<GeneralSettingsViewProps> = ({ onUpdate, settings, adminUser }) => {
    const [currentSettings, setCurrentSettings] = useState<GeneralSettings>({ id: 'general', contactEmail: '', logoUrl: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { addToast } = useToast();
    
    // State for password change form
    const [passwords, setPasswords] = useState({ current: '', newPass: '', confirmPass: '' });
    const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

    useEffect(() => {
        if (settings) {
            setCurrentSettings(settings);
        }
    }, [settings]);

    const handleSettingsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await updateGeneralSettings(currentSettings);
            addToast('Configurações salvas com sucesso!', 'success');
            onUpdate();
        } catch (error) {
            console.error("Failed to save settings:", error);
            addToast('Erro ao salvar configurações.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwords.newPass !== passwords.confirmPass) {
            addToast('As novas senhas não coincidem.', 'error');
            return;
        }
        if (!adminUser.password || adminUser.password !== passwords.current) {
            addToast('A senha atual está incorreta.', 'error');
            return;
        }
        if (passwords.newPass.length < 3) {
            addToast('A nova senha deve ter pelo menos 3 caracteres.', 'error');
            return;
        }

        setIsPasswordSubmitting(true);
        try {
            await updateCliente({ ...adminUser, password: passwords.newPass });
            addToast('Senha alterada com sucesso!', 'success');
            setPasswords({ current: '', newPass: '', confirmPass: '' });
            onUpdate(); // Refreshes the admin user data in the parent component
        } catch (error) {
            console.error("Failed to change password:", error);
            addToast('Erro ao alterar a senha.', 'error');
        } finally {
            setIsPasswordSubmitting(false);
        }
    };


    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setCurrentSettings(p => ({ ...p, logoUrl: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Configurações Gerais</h3>
                <form onSubmit={handleSettingsSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email de Contato</label>
                        <FormInput 
                            type="email" 
                            value={currentSettings.contactEmail || ''} 
                            onChange={(e) => setCurrentSettings(p => ({...p, contactEmail: e.target.value}))}
                            placeholder="contato@suaempresa.com"
                        />
                        <p className="mt-1 text-xs text-gray-500">Este e-mail será exibido na área de ajuda do cliente.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Logo da Empresa</label>
                        <input type="file" onChange={handleLogoChange} accept="image/*" className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                        {currentSettings.logoUrl && <img src={currentSettings.logoUrl} alt="Preview" className="mt-2 h-16 w-auto rounded-md object-contain bg-gray-200 p-1" />}
                        <p className="mt-1 text-xs text-gray-500">Este logo aparecerá no cabeçalho da aplicação.</p>
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-300">
                            {isSubmitting ? 'Salvando...' : 'Salvar Configurações'}
                        </button>
                    </div>
                </form>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Segurança</h3>
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Senha Atual</label>
                        <FormInput 
                            type="password" 
                            value={passwords.current}
                            onChange={(e) => setPasswords(p => ({ ...p, current: e.target.value }))}
                            required
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
                        <FormInput 
                            type="password" 
                            value={passwords.newPass}
                            onChange={(e) => setPasswords(p => ({ ...p, newPass: e.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Confirmar Nova Senha</label>
                        <FormInput 
                            type="password" 
                            value={passwords.confirmPass}
                            onChange={(e) => setPasswords(p => ({ ...p, confirmPass: e.target.value }))}
                            required
                        />
                    </div>
                     <div className="flex justify-end">
                        <button type="submit" disabled={isPasswordSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-300">
                            {isPasswordSubmitting ? 'Alterando...' : 'Alterar Senha'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default GeneralSettingsView;