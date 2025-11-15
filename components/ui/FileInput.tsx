import React, { useRef, useState } from 'react';

export const FileInput: React.FC<{ id: string; label: string; file: File | null; onFileChange: (file: File | null) => void; onFileRead: (content: string) => void; }> = ({ id, label, file, onFileChange, onFileRead }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFile = (selectedFile: File | null) => {
        onFileChange(selectedFile);
        if (selectedFile) {
            const reader = new FileReader();
            reader.onload = (event) => {
                onFileRead(event.target?.result as string);
            };
            reader.readAsText(selectedFile);
        } else {
            onFileRead('');
        }
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
        if (droppedFile && droppedFile.type === 'text/csv') {
            handleFile(droppedFile);
        } else {
            console.warn("Invalid file type dropped. Please use a CSV file.");
        }
    };
    
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex items-center justify-between border-2 border-dashed rounded-md p-3 cursor-pointer transition-colors ${
                    isDragging 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'
                }`}
                onClick={() => inputRef.current?.click()}
            >
                <span className={`text-sm ${file ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                    {file ? file.name : 'Arraste e solte ou clique para escolher'}
                </span>
                <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-md text-xs font-medium">Escolher</span>
                <input
                    id={id}
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".csv"
                />
            </div>
        </div>
    );
};
