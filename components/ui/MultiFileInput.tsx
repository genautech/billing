import React, { useRef, useState, useEffect } from 'react';

interface FileWithContent {
    file: File;
    content: string;
    detectedPeriod?: string;
    rowCount?: number;
}

interface MultiFileInputProps {
    id: string;
    label: string;
    files: File[];
    onFilesChange: (files: File[]) => void;
    onContentsRead: (contents: string[]) => void;
    maxFiles?: number;
}

// Helper to detect period from CSV content
const detectPeriodFromCSV = (content: string): { period: string; rowCount: number } => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return { period: 'N/A', rowCount: 0 };
    
    const headers = lines[0].toLowerCase();
    const dateColumnIndex = headers.split(',').findIndex(h => 
        h.includes('data do pedido') || h.includes('data') || h.includes('date')
    );
    
    if (dateColumnIndex === -1) return { period: 'N/A', rowCount: lines.length - 1 };
    
    const dates: Date[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols[dateColumnIndex]) {
            const dateStr = cols[dateColumnIndex].replace(/"/g, '').trim();
            // Try parsing different date formats
            let parsed: Date | null = null;
            
            // DD/MM/YYYY format
            const brMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (brMatch) {
                parsed = new Date(parseInt(brMatch[3]), parseInt(brMatch[2]) - 1, parseInt(brMatch[1]));
            }
            
            // YYYY-MM-DD format
            if (!parsed || isNaN(parsed.getTime())) {
                const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (isoMatch) {
                    parsed = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
                }
            }
            
            if (parsed && !isNaN(parsed.getTime())) {
                dates.push(parsed);
            }
        }
    }
    
    if (dates.length === 0) return { period: 'N/A', rowCount: lines.length - 1 };
    
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    const formatMonth = (d: Date) => `${monthNames[d.getMonth()]}/${d.getFullYear()}`;
    
    if (minDate.getMonth() === maxDate.getMonth() && minDate.getFullYear() === maxDate.getFullYear()) {
        return { period: formatMonth(minDate), rowCount: lines.length - 1 };
    }
    
    return { period: `${formatMonth(minDate)} - ${formatMonth(maxDate)}`, rowCount: lines.length - 1 };
};

export const MultiFileInput: React.FC<MultiFileInputProps> = ({ 
    id, 
    label, 
    files, 
    onFilesChange, 
    onContentsRead,
    maxFiles = 12 
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [filesWithContent, setFilesWithContent] = useState<FileWithContent[]>([]);

    // Read files and detect periods
    useEffect(() => {
        const readFiles = async () => {
            const results: FileWithContent[] = [];
            const contents: string[] = [];
            
            for (const file of files) {
                const content = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target?.result as string || '');
                    reader.onerror = () => resolve('');
                    reader.readAsText(file);
                });
                
                const { period, rowCount } = detectPeriodFromCSV(content);
                results.push({ file, content, detectedPeriod: period, rowCount });
                contents.push(content);
            }
            
            setFilesWithContent(results);
            onContentsRead(contents);
        };
        
        if (files.length > 0) {
            readFiles();
        } else {
            setFilesWithContent([]);
            onContentsRead([]);
        }
    }, [files, onContentsRead]);

    const handleFiles = (newFiles: FileList | null) => {
        if (!newFiles) return;
        
        const csvFiles = Array.from(newFiles).filter(f => 
            f.type === 'text/csv' || f.name.toLowerCase().endsWith('.csv')
        );
        
        if (csvFiles.length === 0) {
            console.warn('Nenhum arquivo CSV válido selecionado.');
            return;
        }
        
        const combined = [...files, ...csvFiles].slice(0, maxFiles);
        onFilesChange(combined);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFiles(e.target.files);
        // Reset input to allow selecting same file again
        if (inputRef.current) inputRef.current.value = '';
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
        handleFiles(e.dataTransfer.files);
    };

    const removeFile = (index: number) => {
        const newFiles = files.filter((_, i) => i !== index);
        onFilesChange(newFiles);
    };

    const clearAll = () => {
        onFilesChange([]);
    };

    // Calculate combined period from all files
    const combinedPeriod = filesWithContent.length > 0 
        ? filesWithContent.map(f => f.detectedPeriod).filter(p => p !== 'N/A').join(', ')
        : '';
    
    const totalRows = filesWithContent.reduce((sum, f) => sum + (f.rowCount || 0), 0);

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-md p-4 transition-colors ${
                    isDragging 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'
                }`}
            >
                <div 
                    className="flex items-center justify-center cursor-pointer"
                    onClick={() => inputRef.current?.click()}
                >
                    <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="mt-1 text-sm text-gray-600">
                            {files.length === 0 
                                ? 'Arraste e solte ou clique para escolher CSVs'
                                : 'Adicionar mais arquivos'
                            }
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            Múltiplos arquivos permitidos (máx. {maxFiles})
                        </p>
                    </div>
                </div>
                <input
                    id={id}
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".csv"
                    multiple
                />
            </div>

            {/* File List */}
            {filesWithContent.length > 0 && (
                <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">
                            {filesWithContent.length} arquivo(s) selecionado(s)
                        </span>
                        <button
                            type="button"
                            onClick={clearAll}
                            className="text-xs text-red-600 hover:text-red-800"
                        >
                            Remover todos
                        </button>
                    </div>
                    
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {filesWithContent.map((fwc, index) => (
                            <div 
                                key={`${fwc.file.name}-${index}`}
                                className="flex items-center justify-between bg-gray-50 p-2 rounded-md border border-gray-200"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 truncate">
                                        {fwc.file.name}
                                    </p>
                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                        {fwc.detectedPeriod && fwc.detectedPeriod !== 'N/A' && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                                                {fwc.detectedPeriod}
                                            </span>
                                        )}
                                        {fwc.rowCount !== undefined && fwc.rowCount > 0 && (
                                            <span>{fwc.rowCount} linhas</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeFile(index)}
                                    className="ml-2 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                    
                    {/* Summary */}
                    {filesWithContent.length > 1 && (
                        <div className="mt-2 p-2 bg-indigo-50 border border-indigo-200 rounded-md">
                            <p className="text-xs text-indigo-800">
                                <strong>Total combinado:</strong> {totalRows} linhas
                                {combinedPeriod && (
                                    <span className="ml-2">| <strong>Períodos:</strong> {combinedPeriod}</span>
                                )}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
