import React, { useState, useCallback, useEffect } from 'react';
import { parseNFeXmlForDifal } from '../../services/firestoreService';
import type { ComprovanteDifal } from '../../types';

// Google Drive API configuration
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const DRIVE_FOLDER_ID = '1tJriHcIrRpABgYH_0rv7IuFEfY4TmdUh'; // Default folder for DIFAL XMLs

declare global {
    interface Window {
        google: any;
        gapi: any;
    }
}

interface GoogleDrivePickerProps {
    onFilesSelected: (comprovantes: ComprovanteDifal[]) => void;
    folderId?: string;
    disabled?: boolean;
}

const GoogleDrivePicker: React.FC<GoogleDrivePickerProps> = ({ 
    onFilesSelected, 
    folderId = DRIVE_FOLDER_ID,
    disabled = false 
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isApiLoaded, setIsApiLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);

    // Load Google API scripts
    useEffect(() => {
        const loadGoogleApis = async () => {
            // Load GAPI
            if (!window.gapi) {
                const gapiScript = document.createElement('script');
                gapiScript.src = 'https://apis.google.com/js/api.js';
                gapiScript.async = true;
                gapiScript.defer = true;
                gapiScript.onload = () => {
                    window.gapi.load('client:picker', () => {
                        setIsApiLoaded(true);
                    });
                };
                document.body.appendChild(gapiScript);
            } else {
                window.gapi.load('client:picker', () => {
                    setIsApiLoaded(true);
                });
            }

            // Load Google Identity Services
            if (!window.google?.accounts) {
                const gisScript = document.createElement('script');
                gisScript.src = 'https://accounts.google.com/gsi/client';
                gisScript.async = true;
                gisScript.defer = true;
                document.body.appendChild(gisScript);
            }
        };

        loadGoogleApis();
    }, []);

    // Get OAuth token
    const getAccessToken = useCallback((): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (accessToken) {
                resolve(accessToken);
                return;
            }

            if (!window.google?.accounts?.oauth2) {
                reject(new Error('Google Identity Services não carregado'));
                return;
            }

            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: 'https://www.googleapis.com/auth/drive.readonly',
                callback: (response: any) => {
                    if (response.access_token) {
                        setAccessToken(response.access_token);
                        resolve(response.access_token);
                    } else {
                        reject(new Error('Falha ao obter token de acesso'));
                    }
                },
            });

            tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }, [accessToken]);

    // Download file content from Drive
    const downloadFileContent = async (fileId: string, token: string): Promise<string> => {
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Erro ao baixar arquivo: ${response.status}`);
        }

        return await response.text();
    };

    // Open Google Drive Picker
    const openPicker = useCallback(async () => {
        if (!isApiLoaded || disabled) return;

        setIsLoading(true);
        setError(null);

        try {
            const token = await getAccessToken();

            // Create picker view for the specific folder
            const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
                .setParent(folderId)
                .setMimeTypes('text/xml,application/xml')
                .setSelectFolderEnabled(false);

            // Create and show picker
            const picker = new window.google.picker.PickerBuilder()
                .addView(view)
                .setOAuthToken(token)
                .setDeveloperKey(GOOGLE_API_KEY)
                .setCallback(async (data: any) => {
                    if (data.action === window.google.picker.Action.PICKED) {
                        const files = data.docs;
                        const comprovantes: ComprovanteDifal[] = [];

                        for (const file of files) {
                            try {
                                const content = await downloadFileContent(file.id, token);
                                const comprovante = parseNFeXmlForDifal(content, file.name, file.id);
                                if (comprovante) {
                                    comprovantes.push(comprovante);
                                }
                            } catch (err) {
                                console.error(`Erro ao processar arquivo ${file.name}:`, err);
                            }
                        }

                        if (comprovantes.length > 0) {
                            onFilesSelected(comprovantes);
                        } else if (files.length > 0) {
                            setError('Nenhum XML válido de NF-e encontrado nos arquivos selecionados');
                        }
                    }
                    setIsLoading(false);
                })
                .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
                .setTitle('Selecione os XMLs de comprovante DIFAL')
                .build();

            picker.setVisible(true);
        } catch (err) {
            console.error('Erro ao abrir picker:', err);
            setError(err instanceof Error ? err.message : 'Erro ao abrir seletor do Drive');
            setIsLoading(false);
        }
    }, [isApiLoaded, disabled, folderId, getAccessToken, onFilesSelected]);

    // Manual file upload fallback
    const handleManualUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setIsLoading(true);
        setError(null);

        const comprovantes: ComprovanteDifal[] = [];
        let filesProcessed = 0;

        Array.from(files).forEach((file) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target?.result as string;
                const comprovante = parseNFeXmlForDifal(content, file.name);
                if (comprovante) {
                    comprovantes.push(comprovante);
                }
                filesProcessed++;

                if (filesProcessed === files.length) {
                    if (comprovantes.length > 0) {
                        onFilesSelected(comprovantes);
                    } else {
                        setError('Nenhum XML válido de NF-e encontrado');
                    }
                    setIsLoading(false);
                }
            };
            reader.onerror = () => {
                filesProcessed++;
                if (filesProcessed === files.length) {
                    setIsLoading(false);
                }
            };
            reader.readAsText(file);
        });
    }, [onFilesSelected]);

    const hasGoogleConfig = GOOGLE_CLIENT_ID && GOOGLE_API_KEY;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {/* Google Drive Picker Button */}
                {hasGoogleConfig && (
                    <button
                        type="button"
                        onClick={openPicker}
                        disabled={disabled || isLoading || !isApiLoaded}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.71 3.5L1.15 15l3.43 5.93h13.7L21.85 15l-6.57-11.5H7.71zm-.72 1.5h2.6l5.97 10.33-1.73 3H5.77l3.22-5.57-2-3.47L4.26 15l1.73-3-1 1.73 2-3.46L9 6.5l-2.01-1.5z"/>
                        </svg>
                        {isLoading ? 'Carregando...' : 'Selecionar do Google Drive'}
                    </button>
                )}

                {/* Manual Upload Fallback */}
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 cursor-pointer transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload Manual (XML)
                    <input
                        type="file"
                        accept=".xml"
                        multiple
                        onChange={handleManualUpload}
                        disabled={disabled || isLoading}
                        className="hidden"
                    />
                </label>
            </div>

            {!hasGoogleConfig && (
                <p className="text-sm text-amber-600">
                    Integração com Google Drive não configurada. Use o upload manual.
                </p>
            )}

            {error && (
                <p className="text-sm text-red-600">{error}</p>
            )}
        </div>
    );
};

export default GoogleDrivePicker;
