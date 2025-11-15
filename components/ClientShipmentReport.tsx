import React, { useState, useMemo, useEffect } from 'react';
import type { CobrancaMensal } from '../types';
import { filterCSVByMonth } from '../services/firestoreService';

interface ClientShipmentReportProps {
    clientCobrancas: CobrancaMensal[];
    selectedCobranca: CobrancaMensal | null;
    onCobrancaChange: (cobranca: CobrancaMensal | null) => void;
}

const formElementClasses = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition text-gray-900";

const UNWANTED_COLUMNS = ['variantes', 'previsao de entrega', 'previsão de entrega', 'data de envio', 'datade envio', 'status'];
const ITEMS_PER_PAGE = 20;

const BarChart: React.FC<{ data: { label: string; value: number }[]; valueFormatter: (value: number) => string; }> = ({ data, valueFormatter }) => {
    const maxValue = useMemo(() => Math.max(...data.map(d => d.value), 0), [data]);
    if (data.length === 0) return <div className="text-center text-gray-500 p-4 h-64 flex items-center justify-center">Dados insuficientes para o gráfico.</div>

    return (
        <div className="flex justify-around items-end h-64 bg-gray-50 p-4 rounded-lg">
            {data.map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center w-full text-center" style={{ maxWidth: '60px' }}>
                    <div
                        className="w-4/5 bg-blue-500 rounded-t-md hover:bg-blue-600 transition-colors"
                        style={{ height: `${maxValue > 0 ? (value / maxValue) * 100 : 0}%` }}
                        title={`${label}: ${valueFormatter(value)}`}
                    />
                    <span className="text-xs text-gray-600 mt-2">{label}</span>
                </div>
            ))}
        </div>
    );
};

const ClientShipmentReport: React.FC<ClientShipmentReportProps> = ({ clientCobrancas, selectedCobranca, onCobrancaChange }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    
    // Effect to ensure a selection exists if possible, especially on initial load.
    useEffect(() => {
        if (!selectedCobranca && clientCobrancas.length > 0) {
            onCobrancaChange(clientCobrancas[0]);
        }
    }, [selectedCobranca, clientCobrancas, onCobrancaChange]);

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newId = e.target.value;
        const newSelection = clientCobrancas.find(c => c.id === newId) || null;
        onCobrancaChange(newSelection);
        setCurrentPage(1); // Reset page on new selection
    };

    const reportData = useMemo(() => {
        if (!selectedCobranca?.relatorioRastreioCSV) return { headers: [], rows: [] };
    
        // Filter CSV to show only shipments from the invoice month
        let csvContent = filterCSVByMonth(selectedCobranca.relatorioRastreioCSV, selectedCobranca.mesReferencia);
        csvContent = csvContent.startsWith('\ufeff') ? csvContent.substring(1) : csvContent;
        const allLines = csvContent.trim().replace(/\r/g, '').split('\n');
        if (allLines.length < 1) return { headers: [], rows: [] };
    
        let headerIndex = -1;
        let headerLine = '';
        let delimiter = ',';
    
        // Find the first line that looks like a header (has multiple columns)
        for (let i = 0; i < allLines.length; i++) {
            const line = allLines[i];
            // Check for semicolon first as it's often a specific choice
            if (line.split(';').length > 1) {
                headerIndex = i;
                headerLine = line;
                delimiter = ';';
                break;
            }
            // Fallback to comma
            if (line.split(',').length > 1) {
                headerIndex = i;
                headerLine = line;
                delimiter = ',';
                break;
            }
        }
    
        if (headerIndex === -1) {
            // If no valid multi-column header is found, the file is considered invalid or empty for table display.
            return { headers: [], rows: [] };
        }
    
        const dataLines = allLines.slice(headerIndex + 1);
        const regex = new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
    
        const rawHeaders = headerLine.split(delimiter);
        const keptColumnIndices: number[] = [];
        const finalHeaders = rawHeaders.filter((header, index) => {
            const normalizedHeader = header.trim().toLowerCase().replace(/"/g, '');
            if (normalizedHeader && !UNWANTED_COLUMNS.includes(normalizedHeader)) {
                keptColumnIndices.push(index);
                return true;
            }
            return false;
        }).map(h => h.trim().replace(/"/g, ''));
    
        const dateColumnIndex = rawHeaders.findIndex(h => h.trim().toLowerCase().replace(/"/g, '') === 'data');
    
        const rows = dataLines.map(line => {
            if (!line.trim()) return null;
            const fullRow = line.split(regex);
            // Ensure the row has enough columns to avoid errors, padding with empty strings if necessary
            while (fullRow.length < rawHeaders.length) {
                fullRow.push('');
            }
            const filteredRow = keptColumnIndices.map(index => fullRow[index]?.trim().replace(/^"|"$/g, '') || '');
    
            const keptDateIndex = keptColumnIndices.indexOf(dateColumnIndex);
            if (keptDateIndex !== -1 && filteredRow[keptDateIndex]) {
                try {
                    let date;
                    if (filteredRow[keptDateIndex].includes('/')) {
                        const parts = filteredRow[keptDateIndex].split('/');
                        date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    } else {
                        date = new Date(filteredRow[keptDateIndex]);
                    }
                    if (!isNaN(date.getTime())) {
                        filteredRow[keptDateIndex] = date.toLocaleDateString('pt-BR');
                    }
                } catch (e) { /* Ignore parsing errors */ }
            }
            return filteredRow;
        }).filter((row): row is string[] => row !== null && row.some(cell => cell.trim() !== ''));
    
        return { headers: finalHeaders, rows };
    }, [selectedCobranca]);

    const filteredRows = useMemo(() => {
        setCurrentPage(1); // Reset page on search
        if (!searchTerm) return reportData.rows;
        return reportData.rows.filter(row => 
            row.some(cell => cell.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [searchTerm, reportData.rows]);
    
    // Pagination Logic
    const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE);
    const paginatedRows = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [currentPage, filteredRows]);

    const handleDownload = () => {
        // FIX: Corrected property name from relatorioEnviosCSV to relatorioRastreioCSV.
        if (!selectedCobranca?.relatorioRastreioCSV) return;
        // Filter CSV to download only shipments from the invoice month
        const filteredCSV = filterCSVByMonth(selectedCobranca.relatorioRastreioCSV, selectedCobranca.mesReferencia);
        const blob = new Blob([filteredCSV], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        const safeMonth = selectedCobranca.mesReferencia.replace(/[^a-z0-9]/gi, '-');
        const fileName = `relatorio-envios-${safeMonth}.csv`;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Parse CSV for state data extraction
    const robustCSVParser = (csvContent: string): { headers: string[]; dataLines: string[]; delimiter: string } | null => {
        if (!csvContent) return null;
        csvContent = csvContent.startsWith('\ufeff') ? csvContent.substring(1) : csvContent;
        const allLines = csvContent.trim().replace(/\r/g, '').split('\n');
        if (allLines.length < 1) return null;
    
        let headerIndex = -1;
        let headerLine = '';
        let delimiter = ',';
    
        // Find the first line that looks like a header (has multiple columns)
        for (let i = 0; i < allLines.length; i++) {
            const line = allLines[i];
            // Check for semicolon first as it's often a specific choice
            if (line.split(';').length > 1) {
                headerIndex = i;
                headerLine = line;
                delimiter = ';';
                break;
            }
            // Fallback to comma
            if (line.split(',').length > 1) {
                headerIndex = i;
                headerLine = line;
                delimiter = ',';
                break;
            }
        }
    
        if (headerIndex === -1) return null; // No valid header found
    
        const dataLines = allLines.slice(headerIndex + 1);
        const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g, ''));
        return { headers, dataLines, delimiter };
    };

    // Calculate shipments by state for the selected invoice
    const shipmentsByStateData = useMemo(() => {
        if (!selectedCobranca?.relatorioRastreioCSV) return [];
        
        // Filter CSV to show only shipments from the invoice month
        const filteredCSV = filterCSVByMonth(selectedCobranca.relatorioRastreioCSV, selectedCobranca.mesReferencia);
        
        const regionCounts: Record<string, number> = {};
        const parsed = robustCSVParser(filteredCSV);
        if (!parsed) return [];
        
        const { headers, dataLines, delimiter } = parsed;
        
        // Search for multiple possible state/UF column headers
        const possibleUfHeaders = ['uf', 'estado', 'tipo de envio'];
        const ufHeaderFound = possibleUfHeaders.find(h => headers.includes(h));
        const ufColumnIndex = ufHeaderFound ? headers.indexOf(ufHeaderFound) : -1;
       
        if (ufColumnIndex === -1) return [];

        const regex = new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
        dataLines.forEach(line => {
            const row = line.split(regex);
            const region = row[ufColumnIndex]?.trim().toUpperCase().replace(/"/g, '');
            if (region) {
                regionCounts[region] = (regionCounts[region] || 0) + 1;
            }
        });

        if (Object.keys(regionCounts).length === 0) return [];
        
        return Object.entries(regionCounts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);

    }, [selectedCobranca]);

    return (
        <div className="bg-white p-6 rounded-lg shadow-md animate-fade-in space-y-6">
             <div>
                <h3 className="text-xl font-bold text-gray-900">Relatórios de Envio</h3>
                <p className="text-sm text-gray-500">Consulte os detalhes de envio para cada fatura.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">Selecione a Fatura</label>
                     <select 
                        value={selectedCobranca?.id || ''} 
                        onChange={handleSelectChange}
                        className={formElementClasses}
                    >
                        {clientCobrancas.map(c => <option key={c.id} value={c.id}>{c.mesReferencia}</option>)}
                    </select>
                </div>
                 <div className="flex-1">
                     <label className="block text-sm font-medium text-gray-700">Buscar no relatório</label>
                      <input 
                        type="text"
                        placeholder="Filtrar por rastreio, pedido, etc..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className={formElementClasses}
                    />
                </div>
                <div className="flex-shrink-0">
                    <button 
                        onClick={handleDownload}
                        // FIX: Corrected property name from relatorioEnviosCSV to relatorioRastreioCSV.
                        disabled={!selectedCobranca?.relatorioRastreioCSV}
                        className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 shadow-sm font-medium transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        <span>Baixar Relatório (CSV)</span>
                    </button>
                </div>
            </div>

            {reportData.rows.length > 0 ? (
                <>
                 {/* Charts Section */}
                 {shipmentsByStateData.length > 0 && (
                    <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Envios por Estado - {selectedCobranca?.mesReferencia}</h3>
                        <BarChart data={shipmentsByStateData} valueFormatter={(v) => `${v.toLocaleString('pt-BR')} envios`} />
                    </div>
                 )}
                 
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                {reportData.headers.map(header => (
                                    <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                           {paginatedRows.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                    {row.map((cell, cellIndex) => (
                                        <td key={cellIndex} className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">{cell}</td>
                                    ))}
                                </tr>
                           ))}
                        </tbody>
                    </table>
                </div>
                 <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-gray-700">Página {currentPage} de {totalPages}</span>
                    <div className="space-x-2">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">Anterior</button>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">Próximo</button>
                    </div>
                </div>
                </>
            ) : (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
                    <p className="text-gray-500">Relatório de envio detalhado não disponível para esta fatura.</p>
                    <p className="text-xs text-gray-400 mt-1">O administrador pode anexar o relatório na área de gestão de cobranças.</p>
                </div>
            )}
        </div>
    );
};

export default ClientShipmentReport;