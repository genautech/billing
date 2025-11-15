import React from 'react';
import type { GeneralSettings } from '../types';

interface HeaderProps {
    userType: 'admin' | 'client';
    activeView: 'admin' | 'client';
    settings: GeneralSettings | null;
    onViewChange: (view: 'admin' | 'client') => void;
    onLogout: () => void;
}

const NavLink: React.FC<{
    isActive: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ isActive, onClick, children }) => {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-blue-100 hover:text-blue-700'
            }`}
        >
            {children}
        </button>
    );
};


const Header: React.FC<HeaderProps> = ({ userType, activeView, settings, onViewChange, onLogout }) => {
    
    const handleNavClick = (targetView: 'admin' | 'client') => {
        if (userType === 'admin') {
            onViewChange(targetView);
        } else { // userType is 'client'
            // A client is logged out if they try to access the admin panel
            if (targetView === 'admin') {
                onLogout();
            }
            // If they click their own area, do nothing.
        }
    };

    return (
        <header className="bg-white shadow-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <div className="flex items-center space-x-2">
                        {settings?.logoUrl ? (
                            <img src={settings.logoUrl} alt="Company Logo" className="h-10 w-auto object-contain" />
                        ) : (
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14 18V21H10V18H14M12 2C17.52 2 22 6.48 22 12C22 17.52 17.52 22 12 22C6.48 22 2 17.52 2 12C2 6.48 6.48 2 12 2M12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20C16.42 20 20 16.42 20 12C20 7.58 16.42 4 12 4M12 6C10.69 6 9.58 6.43 8.77 7.23L16.77 15.23C17.57 14.42 18 13.31 18 12C18 8.69 15.31 6 12 6M7.23 8.77L15.23 16.77C14.42 17.57 13.31 18 12 18C8.69 18 6 15.31 6 12C6 10.69 6.43 9.58 7.23 8.77Z" />
                            </svg>
                        )}
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
                            Yoobe Logistics Billing
                        </h1>
                    </div>
                    <div className="flex items-center space-x-4">
                        {userType === 'admin' && (
                            <nav className="flex items-center bg-gray-100 p-1 rounded-lg">
                                <NavLink isActive={activeView === 'client'} onClick={() => handleNavClick('client')}>
                                    Área do Cliente
                                </NavLink>
                                <NavLink isActive={activeView === 'admin'} onClick={() => handleNavClick('admin')}>
                                    Admin
                                </NavLink>
                            </nav>
                        )}
                        <button
                            onClick={onLogout}
                            className="px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 text-red-500 hover:bg-red-100"
                            title="Sair da sessão atual"
                        >
                            Sair
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;