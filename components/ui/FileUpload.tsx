import React, { useRef, useState } from 'react';

interface FileUploadProps {
    id: string;
    label: string;
    accept?: string;
    maxSizeMB?: number;
    onFileSelect: (file: File | null) => void;
    file: File | null;
    isUploading?: boolean;
    uploadProgress?: number;
    error?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
    id,
    label,
    accept = 'application/pdf,image/*',
    maxSizeMB = 10,
    onFileSelect,
    file,
    isUploading = false,
    uploadProgress = 0,
    error
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFile = (selectedFile: File | null) => {
        if (!selectedFile) {
            onFileSelect(null);
            return;
        }

        // Validate file size
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        if (selectedFile.size > maxSizeBytes) {
            alert(`O arquivo é muito grande. Tamanho máximo: ${maxSizeMB}MB`);
            return;
        }

        // Validate file type
        const acceptedTypes = accept.split(',').map(t => t.trim());
        const fileType = selectedFile.type;
        const isValidType = acceptedTypes.some(type => {
            if (type.endsWith('/*')) {
                const baseType = type.split('/')[0];
                return fileType.startsWith(baseType + '/');
            }
            return fileType === type;
        });

        if (!isValidType) {
            alert(`Tipo de arquivo não permitido. Tipos aceitos: ${accept}`);
            return;
        }

        onFileSelect(selectedFile);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFile(e.target.files ? e.target.files[0] : null);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files && e.dataTransfer.files[0] ? e.dataTransfer.files[0] : null;
        if (droppedFile) {
            handleFile(droppedFile);
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    isDragging
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                } ${error ? 'border-red-500' : ''}`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    id={id}
                    accept={accept}
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={isUploading}
                />
                {file ? (
                    <div className="space-y-2">
                        <div className="flex items-center justify-center space-x-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="text-left">
                                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                            </div>
                        </div>
                        {isUploading && (
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                        )}
                        {!isUploading && (
                            <button
                                type="button"
                                onClick={() => {
                                    onFileSelect(null);
                                    if (inputRef.current) inputRef.current.value = '';
                                }}
                                className="text-sm text-red-600 hover:text-red-800"
                            >
                                Remover arquivo
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-sm text-gray-600">
                            Arraste e solte um arquivo aqui, ou{' '}
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                                disabled={isUploading}
                            >
                                clique para selecionar
                            </button>
                        </p>
                        <p className="text-xs text-gray-500">Tamanho máximo: {maxSizeMB}MB</p>
                    </div>
                )}
                {error && (
                    <p className="mt-2 text-sm text-red-600">{error}</p>
                )}
            </div>
        </div>
    );
};

