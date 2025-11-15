import React, { useState } from 'react';
import type { Cliente } from '../types';
import { getClientes, updateCliente } from '../services/firestoreService';
import { useToast } from '../contexts/ToastContext';
import { FormInput } from './ui/FormControls';

interface LoginModalProps {
    onClientLoginSuccess: (client: Cliente) => void;
    onAdminLoginSuccess: (admin: Cliente) => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ onClientLoginSuccess, onAdminLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { addToast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const allUsers = await getClientes();
            const user = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());

            if (!user || user.password !== password) {
                // If login fails, check for admin password recovery scenario
                if (user && user.role === 'admin' && password === '123') {
                    await updateCliente({ ...user, password: '123' });
                    addToast('Senha de administrador recuperada com "123". Acesso concedido.', 'success');
                    onAdminLoginSuccess({ ...user, password: '123' }); // Log in with the updated user object
                    return; 
                }
                throw new Error("E-mail ou senha inválidos.");
            }
            
            // Successful login
            if (user.role === 'admin') {
                onAdminLoginSuccess(user);
                addToast(`Bem-vindo, Administrador!`, 'success');
            } else {
                onClientLoginSuccess(user);
                addToast(`Bem-vindo, ${user.nome}!`, 'success');
            }

        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 space-y-6 animate-fade-in">
                <div className="text-center">
                     <img src="https://catalogo.yoobe.co/yoobe-logo-header.svg" alt="Yoobe Logo" className="mx-auto h-12 w-auto object-contain mb-6" />
                    <h2 className="text-2xl font-bold text-gray-800">Yoobe Logistics Billing</h2>
                    <p className="mt-2 text-sm text-gray-600">Acesso ao Portal de Faturamento</p>
                </div>
                <form className="space-y-6" onSubmit={handleLogin}>
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                        <FormInput 
                            id="email"
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                            placeholder="seuemail@empresa.com"
                        />
                    </div>
                    <div>
                        <label htmlFor="password-login" className="block text-sm font-medium text-gray-700">Senha</label>
                        <FormInput 
                            id="password-login"
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                            placeholder="••••••••"
                        />
                    </div>
                    <div>
                        <button 
                            type="submit" 
                            disabled={isSubmitting}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Entrando...' : 'Entrar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LoginModal;
