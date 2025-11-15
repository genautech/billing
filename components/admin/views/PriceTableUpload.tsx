import React, { useState } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { FileInput } from '../../ui/FileInput';
import { batchUpdateTabelaPrecos } from '../../../services/firestoreService';

interface PriceTableUploadProps {
    onUpdate: () => void;
}

const PriceTableUpload: React.FC<PriceTableUploadProps> = ({ onUpdate }) => {
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvContent, setCsvContent] = useState<string>('');
    const [isUploading, setIsUploading] = useState(false);
    const { addToast } = useToast();

    const handleDownloadTemplate = () => {
        const headers = [
            "Categoria", "Subcategoria", "Descrição do Custo", "Métrica", "Custo Unitario", "Preço Unitário"
        ];
        const csvContent = headers.join(',') + '\n';
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'template_tabela_precos.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleUpload = async () => {
        if (!csvContent) {
            addToast('Por favor, selecione um arquivo CSV primeiro.', 'error');
            return;
        }
        setIsUploading(true);
        try {
            const result = await batchUpdateTabelaPrecos(csvContent);
            addToast(`Upload concluído! ${result.created} serviços criados/substituídos. ${result.deleted} antigos foram removidos.`, 'success');
            onUpdate(); // Refresh the main price table
            setCsvFile(null); // Reset file input
            setCsvContent('');
        } catch (error) {
            console.error("Failed to upload price table:", error);
            const msg = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            addToast(`Erro no upload: ${msg}`, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h4 className="text-lg font-semibold text-gray-800">Atualização em Lote via CSV</h4>
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-2">
                <p className="text-sm text-gray-500 mt-1 flex-grow">
                    Use o template para garantir o formato correto. Esta ação <span className="font-semibold text-red-600">substituirá toda</span> a tabela de preços atual. Preencha 'Custo Unitario' ou 'Preço Unitário', ou ambos para que a margem seja calculada automaticamente.
                </p>
                <button
                    onClick={handleDownloadTemplate}
                    className="flex-shrink-0 mt-2 md:mt-0 flex items-center justify-center space-x-2 text-sm bg-gray-600 text-white px-3 py-1.5 rounded-md hover:bg-gray-700 shadow-sm font-medium transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    <span>Baixar Template</span>
                </button>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-grow">
                    <FileInput
                        id="price-table-csv"
                        label="Arquivo da Tabela de Preços (.csv)"
                        file={csvFile}
                        onFileChange={setCsvFile}
                        onFileRead={setCsvContent}
                    />
                </div>
                <div className="flex-shrink-0 w-full sm:w-auto">
                    <button
                        onClick={handleUpload}
                        disabled={isUploading || !csvFile}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 shadow-sm font-medium transition-colors disabled:bg-gray-400"
                    >
                        {isUploading ? 'Enviando...' : 'Processar e Substituir'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PriceTableUpload;