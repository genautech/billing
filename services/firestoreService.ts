// FIX: Rewrote Firestore calls to use the v8 compatibility API to resolve import errors.
import { db, storage, firebaseConfig } from './firebase';
import type { Cliente, TabelaPrecoItem, CobrancaMensal, DetalheEnvio, AIAnalysis, CustoAdicional, CustoManualPreset, GeneralSettings, FaqItem, TabelaPrecoCliente, DocumentoPedido, ComprovanteDifal, InvoiceSummary, CustoAdicionalResumo, EntradaMaterialResumo } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Firestore Collection References ---
const clientesCol = db.collection('clientes');
const tabelaPrecosCol = db.collection('tabelaPrecos');
const tabelaPrecosClientesCol = db.collection('tabelaPrecosClientes');
const cobrancasCol = db.collection('cobrancasMensais');
const configuracoesCol = db.collection('configuracoes');
const faqCol = db.collection('faq');
const documentosCol = db.collection('documentosPedidos');


// --- Admin User Seeding ---
export const seedAdminUser = async () => {
    const adminEmail = 'admin@yoobe.co';
    const q = clientesCol.where("email", "==", adminEmail);
    const querySnapshot = await q.get();

    if (querySnapshot.empty) {
        // Admin doesn't exist, create it with a default password.
        console.log(`Admin user '${adminEmail}' not found. Seeding admin user...`);
        try {
            await clientesCol.add({
                nome: 'Administrador Yoobe',
                cnpj: '00.000.000/0001-00',
                email: adminEmail,
                emailFaturamento: '',
                role: 'admin',
                skusAtivos: 0,
                unidadesEmEstoque: 0,
                logoUrl: '',
                password: '123' // Default initial password
            });
            console.log(`Admin user created with default password '123'. You can now log in and change it.`);
        } catch (error) {
            console.error("Error seeding admin user:", error);
        }
    }
    // If the user exists, we do nothing here. The password recovery logic is in LoginModal.
};


// --- Track Report Layout Types ---
type TrackReportLayout = 'legacy' | 'lojaprio';

interface TrackReportSchema {
    layout: TrackReportLayout;
    dateColumn: string | null;
    orderIdColumn: string | null;
    emailColumn: string | null;
    trackingColumn: string | null;
    statusColumn: string | null;
}

// --- Helper to detect Track Report CSV format (Legacy or Universal Flexible) ---
const detectTrackReportLayout = (data: Record<string, string>[]): TrackReportLayout => {
    if (!data || data.length === 0) return 'legacy';
    
    const columns = Object.keys(data[0]).map(c => c.toLowerCase());
    
    // The "Universal Flexible" format (modeled after LojaPrio) has these distinctive columns
    const indicators = ['number', 'email', 'placed at', 'status', 'currency', 'subtotal'];
    const matchCount = indicators.filter(indicator => 
        columns.some(col => col.toLowerCase() === indicator.toLowerCase())
    ).length;
    
    // If we find at least 4 of the 6 indicators, it's the Flexible format
    const isFlexible = matchCount >= 4;
    
    console.log(`🔍 Track Report Layout Detection: Found ${matchCount}/6 Flexible indicators → ${isFlexible ? 'Flexible (Universal)' : 'Legacy'} format`);
    if (isFlexible) {
        console.log('   Flexible columns detected:', columns.filter(c => 
            indicators.some(ind => c.toLowerCase() === ind.toLowerCase())
        ));
    }
    
    return isFlexible ? 'lojaprio' : 'legacy';
};

// --- Helper to build schema for track report based on layout ---
const buildTrackReportSchema = (data: Record<string, string>[], layout: TrackReportLayout): TrackReportSchema => {
    if (!data || data.length === 0) {
        return { layout, dateColumn: null, orderIdColumn: null, emailColumn: null, trackingColumn: null, statusColumn: null };
    }
    
    let dateColumn: string | null = null;
    let orderIdColumn: string | null = null;
    let emailColumn: string | null = null;
    let trackingColumn: string | null = null;
    let statusColumn: string | null = null;
    
    if (layout === 'lojaprio') {
        // LojaPrio format column mappings
        dateColumn = findColumnName(data, [
            'Placed at',
            'placed at',
            'Shipped at',
            'shipped at'
        ]);
        
        orderIdColumn = findColumnName(data, [
            'Number',
            'number'
        ]);
        
        emailColumn = findColumnName(data, [
            'Email',
            'email'
        ]);
        
        statusColumn = findColumnName(data, [
            'Status',
            'status'
        ]);
        
        // LojaPrio doesn't have a tracking column in standard exports
        trackingColumn = null;
        
        console.log('📋 LojaPrio Schema:', { dateColumn, orderIdColumn, emailColumn, statusColumn });
    } else {
        // Legacy format column mappings
        const availableColumns = Object.keys(data[0] || {});
        console.log('📋 Legacy format - Colunas disponíveis:', JSON.stringify(availableColumns));
        console.log('📋 Legacy format - Primeiras 10 colunas:', JSON.stringify(availableColumns.slice(0, 10)));
        
        dateColumn = findColumnName(data, [
            'Data de envio',
            'Data de Envio',
            'Data do envio',
            'Data do Envio',
            'Data',
            'Date',
            'Envio Date',
            'Data de criação',
            'Data de Criação',
            'Data criação',
            'Created at',
            'created at',
            'Data de Entrega',
            'Data de entrega',
            'Shipped at',
            'shipped at',
            'Placed at',
            'placed at',
            'Data do pedido',
            'Data do Pedido'
        ]);
        
        orderIdColumn = findColumnName(data, [
            'Número do pedido',
            'Número do Pedido',
            'Numero do pedido',
            'Numero',
            'Número',
            'Number',
            'number',
            'Order ID',
            'OrderId',
            'Order_ID',
            'order_id',
            'Pedido',
            'Order Number',
            'order_number',
            'OrderNumber',
            'ID do Pedido',
            'id_pedido',
            'N° do pedido',
            'Nº do pedido',
            'N° Pedido',
            'Nº Pedido',
            'ID',
            'id',
            'Order',
            'order',
            'Cod Pedido',
            'Código Pedido',
            'Codigo Pedido'
        ]);
        
        trackingColumn = findColumnName(data, [
            'Rastreio',
            'Rastreamento',
            'Tracking',
            'Código de Rastreio',
            'Código de rastreio',
            'Tracking Number',
            'tracking_number'
        ]);
        
        emailColumn = findColumnName(data, [
            'Email',
            'email',
            'E-mail',
            'e-mail',
            'Email do cliente',
            'Customer Email'
        ]);
        
        statusColumn = findColumnName(data, [
            'Status',
            'status',
            'Estado',
            'State'
        ]);
        
        console.log('📋 Legacy Schema:', { dateColumn, orderIdColumn, emailColumn, trackingColumn, statusColumn });
        
        // Fallback: if dateColumn still not found, try to find any column with "data" or "date" in the name
        if (!dateColumn && data.length > 0) {
            const availableCols = Object.keys(data[0]);
            const potentialDateCol = availableCols.find(col => {
                const lower = col.toLowerCase();
                // Must contain "data" or "date" but NOT be "status" or other false positives
                if (lower === 'status' || lower === 'state' || lower === 'estado') return false;
                return lower.includes('data') || lower.includes('date') || 
                       (lower.includes(' at') && !lower.startsWith('st')); // "placed at", "created at" but not "status"
            });
            if (potentialDateCol) {
                console.log('📋 Fallback: Using detected date column:', potentialDateCol);
                dateColumn = potentialDateCol;
            }
        }
        
        // Fallback for orderIdColumn if not found
        if (!orderIdColumn && data.length > 0) {
            const availableCols = Object.keys(data[0]);
            const potentialOrderCol = availableCols.find(col => {
                const lower = col.toLowerCase();
                return lower.includes('pedido') || lower.includes('order') || 
                       lower.includes('numero') || lower.includes('número') ||
                       lower === 'id' || lower === 'number';
            });
            if (potentialOrderCol) {
                console.log('📋 Fallback: Using detected order ID column:', potentialOrderCol);
                orderIdColumn = potentialOrderCol;
            }
        }
    }
    
    return { layout, dateColumn, orderIdColumn, emailColumn, trackingColumn, statusColumn };
};

// --- Helper to filter data by month (Universal & Timezone Robust) ---
const filterDataByMonth = (data: Record<string, string>[], dateColumn: string, month: string): Record<string, string>[] => {
    const [monthName, year] = month.toLowerCase().split('/');
    if (!monthName || !year) return data;

    const targetMonth = monthMap[monthName];
    const targetYear = parseInt(year, 10);

    if (targetMonth === undefined || isNaN(targetYear)) {
        console.warn(`Mês de referência inválido: ${month}`);
        return [];
    }
    
    const filtered = data.filter(row => {
        const dateStr = row[dateColumn];
        if (!dateStr) return false;
        
        try {
            const date = new Date(dateStr);
            const isISO = /^\d{4}-\d{2}-\d{2}/.test(dateStr);
            const isUTC = dateStr.includes('UTC');
            
            const m = (isISO || isUTC) ? date.getUTCMonth() : date.getMonth();
            const y = (isISO || isUTC) ? date.getUTCFullYear() : date.getFullYear();
            
            const matches = m === targetMonth && y === targetYear;
            return matches;
        } catch (e) {
            console.error(`Formato de data inválido na coluna ${dateColumn}: ${dateStr}`);
            return false;
        }
    });

    return filtered;
};

// --- Helper to filter data by date range ---
const filterDataByDateRange = (
    data: Record<string, string>[], 
    dateColumn: string, 
    startDate: string, 
    endDate: string
): Record<string, string>[] => {
    if (!startDate || !endDate) return data;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Set end to end of day
    end.setHours(23, 59, 59, 999);
    
    console.log(`Filtrando por intervalo de datas: ${start.toISOString()} - ${end.toISOString()}`);
    
    const filtered = data.filter(row => {
        const dateStr = row[dateColumn];
        if (!dateStr) return false;
        
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return false;
            
            return date >= start && date <= end;
        } catch (e) {
            console.error(`Formato de data inválido na coluna ${dateColumn}: ${dateStr}`);
            return false;
        }
    });
    
    console.log(`Intervalo de datas: ${data.length} rows -> ${filtered.length} após filtro`);
    return filtered;
};

// --- Helper to find column name with variations ---
const findColumnName = (data: Record<string, string>[], possibleNames: string[]): string | null => {
    if (!data || data.length === 0) return null;
    
    const availableColumns = Object.keys(data[0]);
    
    // First, try exact match (case sensitive)
    for (const name of possibleNames) {
        if (availableColumns.includes(name)) {
            return name;
        }
    }
    
    // Then, try case-insensitive match
    for (const name of possibleNames) {
        const found = availableColumns.find(col => col.toLowerCase() === name.toLowerCase());
        if (found) {
            return found;
        }
    }
    
    // Finally, try partial match (contains)
    for (const name of possibleNames) {
        const found = availableColumns.find(col => 
            col.toLowerCase().includes(name.toLowerCase()) || 
            name.toLowerCase().includes(col.toLowerCase())
        );
        if (found) {
            return found;
        }
    }
    
    return null;
};

// --- Helper to sanitize strings for Firestore ---
const sanitizeForFirestore = (value: string): string => {
    if (!value || typeof value !== 'string') return '';
    
    // Remove BOM if present
    let sanitized = value.startsWith('\ufeff') ? value.substring(1) : value;
    
    // Normalize whitespace (replace multiple spaces/tabs/newlines with single space)
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    // Remove null bytes and other control characters (except newlines and tabs in some contexts)
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    
    return sanitized;
};

// --- Helper to sanitize document IDs for Firestore ---
const sanitizeDocumentId = (id: string): string => {
    if (!id || typeof id !== 'string') return '';
    
    // Firestore document ID restrictions:
    // - Cannot contain: /, \, spaces (consecutive), or start/end with .
    // - Max length: 1500 bytes
    let sanitized = id
        .replace(/\//g, '_')  // Replace / with _
        .replace(/\\/g, '_')  // Replace \ with _
        .replace(/\.\./g, '_') // Replace consecutive dots
        .replace(/^\.+|\.+$/g, '') // Remove leading/trailing dots
        .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single space
        .trim();
    
    // Limit length to avoid issues (1500 bytes is the limit, but we'll use 500 chars as safe limit)
    if (sanitized.length > 500) {
        sanitized = sanitized.substring(0, 500);
    }
    
    return sanitized || 'unknown';
};

// --- Helper to parse CSV ---
const parseCSV = (csv: string): Record<string, string>[] => {
    // Handle Byte Order Mark (BOM)
    csv = csv.startsWith('\ufeff') ? csv.substring(1) : csv;
    const allLines = csv.trim().replace(/\r/g, '').split('\n');
    if (allLines.length < 1) return [];

    // Find the actual header line by looking for the first line with a common delimiter.
    // This handles files that may have a title row before the header.
    let headerIndex = allLines.findIndex(line => line.includes(',') || line.includes(';'));
    
    // If no line with delimiters is found, it might be a single-column file or malformed.
    // We'll fall back to using the first non-empty line as the header.
    if (headerIndex === -1) {
        headerIndex = allLines.findIndex(line => line.trim().length > 0);
        if (headerIndex === -1) return []; // The file is effectively empty.
    }
    
    const headerLine = allLines[headerIndex];
    const dataLines = allLines.slice(headerIndex + 1);

    // Determine delimiter by counting occurrences in the identified header line.
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';
    
    // Regex to split by delimiter but ignore delimiter inside double quotes
    const regex = new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`);

    const headers = headerLine.split(delimiter).map(h => h.trim().replace(/"/g, ''));

    return dataLines.map(line => {
        if (!line.trim()) return null; // Skip empty lines
        const values = line.split(regex);
        const obj: Record<string, string> = {};
        headers.forEach((header, index) => {
            // Trim and remove quotes from each value, then sanitize for Firestore
            const rawValue = values[index]?.trim().replace(/^"|"$/g, '') || '';
            obj[header] = sanitizeForFirestore(rawValue);
        });
        return obj;
    }).filter((obj): obj is Record<string, string> => obj !== null);
};

// --- Helper to convert column letter to index (A=0, B=1, ..., AD=29, etc.) ---
const columnLetterToIndex = (letter: string): number => {
    let result = 0;
    for (let i = 0; i < letter.length; i++) {
        result = result * 26 + (letter.charCodeAt(i) - 64); // A=1, B=2, etc.
    }
    return result - 1; // Convert to 0-based index
};

// --- Helper to identify column by letter (e.g., 'AD', 'M', 'O') ---
const findColumnByLetter = (csvData: Record<string, string>[], columnLetter: string): string | null => {
    if (!csvData || csvData.length === 0) return null;
    
    const allColumns = Object.keys(csvData[0]);
    const targetIndex = columnLetterToIndex(columnLetter.toUpperCase());
    
    // Try by index first (if column letter is valid)
    if (targetIndex >= 0 && targetIndex < allColumns.length) {
        return allColumns[targetIndex];
    }
    
    // Fallback: try to find by name containing the letter
    const normalizedLetter = columnLetter.toUpperCase();
    const found = allColumns.find(col => 
        col.toUpperCase().includes(normalizedLetter) || 
        col.toUpperCase() === normalizedLetter
    );
    
    return found || null;
};

// --- Helper to identify cost columns in CSV ---
const identifyCostColumns = (csvData: Record<string, string>[]): string[] => {
    if (!csvData || csvData.length === 0) return [];
    
    const allColumns = Object.keys(csvData[0]);
    
    // Columns to exclude (not cost columns)
    const excludeColumns = [
        'Número do pedido', 'Numero', 'Número do Pedido', 'Numero do pedido',
        'Order ID', 'OrderId', 'Pedido',
        'Data', 'Data do pedido', 'Data de envio', 'Data de Envio',
        'Date', 'Total', 'total', 'Valor Total', 'Custo Total',
        'Rastreio', 'Rastreamento', 'Tracking',
        'CEP', 'Cep', 'cep', // Exclude CEP column
        'Estado', 'UF', 'uf', 'estado' // Exclude Estado column
    ];
    
    // Find columns that are likely cost columns
    const costColumns = allColumns.filter(column => {
        const lowerColumn = column.toLowerCase();
        
        // Exclude known non-cost columns
        if (excludeColumns.some(exclude => 
            column.toLowerCase() === exclude.toLowerCase() || 
            lowerColumn.includes(exclude.toLowerCase())
        )) {
            return false;
        }
        
        // Include columns that contain "custo" or "cost"
        return lowerColumn.includes('custo') || lowerColumn.includes('cost');
    });
    
    return costColumns;
};

// --- Helper to match CSV column to TabelaPrecoItem ---
const matchCsvColumnToTabelaPreco = (csvColumnName: string, tabelaPrecos: TabelaPrecoItem[]): TabelaPrecoItem | null => {
    if (!csvColumnName || !tabelaPrecos || tabelaPrecos.length === 0) return null;
    
    const normalizedColumn = csvColumnName.toLowerCase().trim();
    
    // Extract keywords from column name (remove "custo", "de", "do", "da", etc.)
    const stopWords = ['custo', 'de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'cost', 'the', 'of'];
    const keywords = normalizedColumn
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word));
    
    // Special case: shipping cost
    if (normalizedColumn.includes('envio') || normalizedColumn.includes('shipping') || normalizedColumn.includes('frete')) {
        // Extract service description keywords from column name (remove "custo", "de", "envio", etc.)
        const shippingStopWords = ['custo', 'de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'cost', 'the', 'of', 'envio', 'shipping', 'frete'];
        const serviceKeywords = normalizedColumn
            .split(/\s+/)
            .filter(word => word.length > 2 && !shippingStopWords.includes(word));
        
        // PRIORITY 1: Try exact match with description (NON-template first)
        let match = tabelaPrecos.find(item => 
            item.categoria === 'Envios' && 
            !isTemplateItem(item) &&
            item.descricao && 
            item.descricao.toLowerCase() === normalizedColumn
        );
        if (match) {
            console.log(`✅ Match exato (não-template) encontrado para "${csvColumnName}": "${match.descricao}"`);
            return match;
        }
        
        // PRIORITY 2: Try exact match with subcategoria (NON-template first)
        match = tabelaPrecos.find(item => 
            item.categoria === 'Envios' && 
            !isTemplateItem(item) &&
            item.subcategoria && 
            item.subcategoria.toLowerCase() === normalizedColumn
        );
        if (match) {
            console.log(`✅ Match exato por subcategoria (não-template) encontrado para "${csvColumnName}": "${match.subcategoria} - ${match.descricao}"`);
            return match;
        }
        
        // PRIORITY 3: Try partial match with full description/subcategoria (NON-template first)
        // This handles cases like "Custo de Coleta no Armazém / Etiqueta Externa"
        match = tabelaPrecos.find(item => {
            if (!item.descricao || item.categoria !== 'Envios' || isTemplateItem(item)) return false;
            const itemDesc = item.descricao.toLowerCase();
            const itemSubcat = item.subcategoria?.toLowerCase() || '';
            const fullItemText = `${itemSubcat} ${itemDesc}`.trim();
            // Check if column contains item description or vice versa
            return normalizedColumn.includes(itemDesc) || 
                   normalizedColumn.includes(itemSubcat) ||
                   itemDesc.includes(normalizedColumn) ||
                   itemSubcat.includes(normalizedColumn);
        });
        if (match) {
            console.log(`✅ Match por descrição completa (não-template) encontrado para "${csvColumnName}": "${match.descricao}"`);
            return match;
        }
        
        // PRIORITY 4: Try partial match with description (NON-template first, using keywords)
        if (serviceKeywords.length > 0) {
            match = tabelaPrecos.find(item => {
                if (!item.descricao || item.categoria !== 'Envios' || isTemplateItem(item)) return false;
                const itemDesc = item.descricao.toLowerCase();
                const itemSubcat = item.subcategoria?.toLowerCase() || '';
                return serviceKeywords.some(keyword => 
                    itemDesc.includes(keyword) || itemSubcat.includes(keyword)
                );
            });
            if (match) {
                console.log(`✅ Match parcial por palavras-chave (não-template) encontrado para "${csvColumnName}": "${match.descricao}"`);
                return match;
            }
        }
        
        // PRIORITY 5: Try any NON-template item in "Envios" category (fallback to any non-template)
        match = tabelaPrecos.find(item => 
            item.categoria === 'Envios' && 
            !isTemplateItem(item)
        );
        if (match) {
            console.log(`⚠️ Item não-template genérico encontrado para "${csvColumnName}": "${match.descricao}"`);
            return match;
        }
        
        // PRIORITY 6: Fallback to template item (only if no specific item found)
        match = tabelaPrecos.find(item => 
            item.precoVenda === 1 && 
            item.descricao && 
            (item.descricao.toLowerCase().includes('(template)') || item.descricao.toLowerCase().includes('template')) &&
            (item.descricao.toLowerCase().includes('envio') || item.categoria === 'Envios')
        );
        if (match) {
            console.warn(`⚠️ Fallback para template de envio para "${csvColumnName}": "${match.descricao}"`);
            return match;
        }
        
        // PRIORITY 7: Last resort - any item in "Envios" category
        match = tabelaPrecos.find(item => item.categoria === 'Envios');
        if (match) {
            console.warn(`⚠️ Último recurso: Item de envio encontrado para "${csvColumnName}": "${match.descricao}" (precoVenda: ${match.precoVenda})`);
            return match;
        }
    }
    
    // Try exact match (case-insensitive) with description
    let match = tabelaPrecos.find(item => 
        item.descricao && 
        item.descricao.toLowerCase() === normalizedColumn
    );
    if (match) return match;
    
    // Try partial match with description (contains)
    match = tabelaPrecos.find(item => 
        item.descricao && 
        item.descricao.toLowerCase().includes(normalizedColumn)
    );
    if (match) return match;
    
    // Try reverse: description contains column name
    match = tabelaPrecos.find(item => 
        item.descricao && 
        normalizedColumn.includes(item.descricao.toLowerCase())
    );
    if (match) return match;
    
    // Try matching by keywords
    if (keywords.length > 0) {
        // For specific costs like Difal, Seguro, etc., prioritize NON-template items
        const isSpecificCost = normalizedColumn.includes('difal') || 
                               normalizedColumn.includes('seguro') || 
                               normalizedColumn.includes('ajuste');
        
        if (isSpecificCost) {
            // PRIORITY 1: Find NON-template item matching keywords
            match = tabelaPrecos.find(item => {
                if (!item.descricao) return false;
                const itemDesc = item.descricao.toLowerCase();
                return !isTemplateItem(item) && keywords.some(keyword => itemDesc.includes(keyword));
            });
            if (match) {
                console.log(`✅ Item não-template encontrado para "${csvColumnName}": "${match.descricao}"`);
                return match;
            }
            
            // PRIORITY 2: Find any item matching keywords (fallback, even if template)
            match = tabelaPrecos.find(item => {
                if (!item.descricao) return false;
                const itemDesc = item.descricao.toLowerCase();
                return keywords.some(keyword => itemDesc.includes(keyword));
            });
            if (match) {
                console.warn(`⚠️ Apenas item template encontrado para "${csvColumnName}": "${match.descricao}"`);
                return match;
            }
        } else {
            // For other costs (not envio, not specific costs), prioritize NON-template items
            // PRIORITY 1: Find NON-template item matching keywords
            match = tabelaPrecos.find(item => {
                if (!item.descricao) return false;
                const itemDesc = item.descricao.toLowerCase();
                return !isTemplateItem(item) && keywords.some(keyword => itemDesc.includes(keyword));
            });
            if (match) return match;
            
            // PRIORITY 2: Find template item matching keywords (fallback)
            match = tabelaPrecos.find(item => {
                if (!item.descricao) return false;
                const itemDesc = item.descricao.toLowerCase();
                return isTemplateItem(item) && keywords.some(keyword => itemDesc.includes(keyword));
            });
            if (match) return match;
            
            // PRIORITY 3: Find any item matching keywords (last resort)
            match = tabelaPrecos.find(item => {
                if (!item.descricao) return false;
                const itemDesc = item.descricao.toLowerCase();
                return keywords.some(keyword => itemDesc.includes(keyword));
            });
            if (match) return match;
        }
    }
    
    return null;
};

const monthMap: { [key: string]: number } = { 'janeiro': 0, 'fevereiro': 1, 'março': 2, 'abril': 3, 'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11 };

// --- Helper to filter CSV string by month ---
export const filterCSVByMonth = (csvContent: string, month: string): string => {
    if (!csvContent || !month) return csvContent;
    
    // Parse CSV
    const data = parseCSV(csvContent);
    if (data.length === 0) return csvContent;
    
    // Find date column with variations
    const dateColumn = findColumnName(data, [
        'Data de envio',
        'Data de Envio',
        'Data do envio',
        'Data',
        'Date',
        'Envio Date',
        'Data do pedido',
        'Data do Pedido'
    ]);
    
    if (!dateColumn) {
        console.warn('Coluna de data não encontrada no CSV, retornando CSV original');
        return csvContent;
    }
    
    // Filter by month
    const filteredData = filterDataByMonth(data, dateColumn, month);
    
    // Convert back to CSV string
    return stringifyCSV(filteredData);
};

// --- Helper to count shipments in CSV for a specific month ---
export const countShipmentsInMonth = (csvContent: string, month: string): number => {
    if (!csvContent || !month) return 0;
    
    // Parse CSV
    const data = parseCSV(csvContent);
    if (data.length === 0) return 0;
    
    // Find date column with variations
    const dateColumn = findColumnName(data, [
        'Data de envio',
        'Data de Envio',
        'Data do envio',
        'Data',
        'Date',
        'Envio Date',
        'Data do pedido',
        'Data do Pedido'
    ]);
    
    if (!dateColumn) {
        console.warn('Coluna de data não encontrada no CSV');
        return 0;
    }
    
    // Filter by month and return count
    const filteredData = filterDataByMonth(data, dateColumn, month);
    return filteredData.length;
};

const stringifyCSV = (data: Record<string, string>[]): string => {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const headerRow = headers.join(',');
    const rows = data.map(row => 
        headers.map(header => `"${(row[header] || '').replace(/"/g, '""')}"`).join(',')
    );
    return [headerRow, ...rows].join('\n');
}

// --- Clientes ---
export const getClientes = async (): Promise<Cliente[]> => {
    const snapshot = await clientesCol.get();
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data
        } as Cliente;
    });
};

export const getClienteById = async (clienteId: string): Promise<Cliente | null> => {
    try {
        const doc = await clientesCol.doc(clienteId).get();
        if (!doc.exists) {
            return null;
        }
        const data = doc.data();
        return {
            id: doc.id,
            ...data
        } as Cliente;
    } catch (error) {
        console.error(`Error fetching cliente ${clienteId}:`, error);
        return null;
    }
};

export const addCliente = async (cliente: Omit<Cliente, 'id'>) => {
    console.log('Adicionando cliente com dados:', cliente);
    const clienteData = {
        ...cliente,
        password: cliente.password || '123'
    };
    return await clientesCol.add(clienteData);
};

export const updateCliente = async (cliente: Cliente) => {
    console.log('Atualizando cliente com dados:', cliente);
    const docRef = clientesCol.doc(cliente.id);
    const { id, ...dataToUpdate } = cliente;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:updateCliente',message:'Executando update no Firestore',data:{clientId: id, dataToUpdate},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    try {
        const result = await docRef.update(dataToUpdate);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:updateCliente',message:'Update concluído com sucesso',data:{clientId: id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        
        return result;
    } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:updateCliente',message:'Erro no update do Firestore',data:{clientId: id, error: error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        throw error;
    }
};

export const deleteCliente = async (id: string) => {
    const docRef = clientesCol.doc(id);
    return await docRef.delete();
};

// --- Tabela de Preços ---

// Helper function para carregar tabela global (evita dependência circular)
const getGlobalTabelaPrecos = async (): Promise<TabelaPrecoItem[]> => {
    const snapshot = await tabelaPrecosCol.get();
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            categoria: data.categoria,
            subcategoria: data.subcategoria,
            descricao: data.descricao,
            metrica: data.metrica,
            custoUnitario: data.custoUnitario,
            margemLucro: data.margemLucro,
            precoVenda: data.precoVenda,
        } as TabelaPrecoItem
    });
};

// Migra IDs temporários (temp-X) para IDs reais - inline na própria função de carregamento
const migrateAndReloadClientTable = async (
    tabelaId: string, 
    clientTable: TabelaPrecoCliente
): Promise<TabelaPrecoItem[]> => {
    console.log(`🔧 Detectados IDs temporários na tabela ${tabelaId}. Migrando...`);
    
    // Carregar tabela global diretamente
    const globalTable = await getGlobalTabelaPrecos();
    
    // Criar mapeamento por descrição+categoria normalizado
    const globalByDescCat: Record<string, TabelaPrecoItem> = {};
    globalTable.forEach(item => {
        const key = `${item.descricao.toLowerCase().trim()}|${item.categoria.toLowerCase().trim()}`;
        globalByDescCat[key] = item;
    });
    
    // Mapear descrição apenas como fallback
    const globalByDesc: Record<string, TabelaPrecoItem> = {};
    globalTable.forEach(item => {
        const key = item.descricao.toLowerCase().trim();
        if (!globalByDesc[key]) {
            globalByDesc[key] = item;
        }
    });
    
    // Criar set de IDs globais para verificação rápida
    const globalIds = new Set(globalTable.map(item => item.id));
    
    let migratedCount = 0;
    const migratedItens = clientTable.itens.map((item, index) => {
        // Se já tem um ID válido que existe na tabela global, manter
        if (item.id && !item.id.startsWith('temp-') && globalIds.has(item.id)) {
            return item;
        }
        
        const descKey = item.descricao?.toLowerCase().trim() || '';
        const catKey = item.categoria?.toLowerCase().trim() || '';
        const fullKey = `${descKey}|${catKey}`;
        
        // Tentar match exato primeiro
        let globalItem = globalByDescCat[fullKey];
        // Fallback: match por descrição apenas
        if (!globalItem && descKey) {
            globalItem = globalByDesc[descKey];
        }
        
        if (globalItem) {
            if (item.id !== globalItem.id) {
                console.log(`  ✅ Migrando "${item.descricao}": ${item.id || 'undefined'} → ${globalItem.id}`);
                migratedCount++;
            }
            return {
                ...item,
                id: globalItem.id, // Usar ID real do Firestore
            };
        }
        
        // Se não encontrou correspondência, gerar um ID único para evitar undefined
        const fallbackId = `unmatched-${Date.now()}-${index}`;
        console.warn(`  ⚠️ Sem correspondência global para "${item.descricao}" (${item.id || 'undefined'}) - usando ${fallbackId}`);
        migratedCount++;
        return {
            ...item,
            id: fallbackId,
        };
    });
    
    if (migratedCount > 0) {
        // Salvar diretamente no Firestore
        const docRef = tabelaPrecosClientesCol.doc(tabelaId);
        await docRef.update({
            itens: migratedItens,
            dataAtualizacao: new Date().toISOString(),
        });
        console.log(`🔧 Migração concluída: ${migratedCount} itens atualizados`);
    }
    
    return migratedItens.sort((a, b) => 
        a.categoria.localeCompare(b.categoria) || a.subcategoria.localeCompare(b.subcategoria)
    );
};

export const getTabelaPrecos = async (clienteId?: string): Promise<TabelaPrecoItem[]> => {
    // Se clienteId fornecido, verificar se tem tabela personalizada
    if (clienteId) {
        const cliente = await getClienteById(clienteId);
        
        if (cliente?.tabelaPrecoId) {
            const tabelaPersonalizada = await getTabelaPrecoCliente(cliente.tabelaPrecoId);
            
            if (tabelaPersonalizada) {
                // Verificar se há IDs temporários OU itens sem ID (undefined)
                // IMPORTANTE: Verificar se id existe antes de chamar startsWith
                const hasTempIds = tabelaPersonalizada.itens.some(item => !item.id || item.id.startsWith('temp-'));
                
                // NOVO: Verificar se os IDs da tabela do cliente correspondem à tabela global
                // Carregar IDs da tabela global para comparação
                const globalTable = await getGlobalTabelaPrecos();
                const globalIds = new Set(globalTable.map(item => item.id));
                
                // Verificar se há IDs desconhecidos (que não existem na tabela global)
                const hasUnknownIds = tabelaPersonalizada.itens.some(item => 
                    item.id && !item.id.startsWith('temp-') && !item.id.startsWith('unmatched-') && !globalIds.has(item.id)
                );
                
                if (hasTempIds || hasUnknownIds) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:getTabelaPrecos',message:'Migrating client table IDs',data:{clienteId,hasTempIds,hasUnknownIds,sampleClientIds:tabelaPersonalizada.itens.slice(0,5).map(i=>i.id),sampleGlobalIds:globalTable.slice(0,5).map(i=>i.id)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4-MIGRATE'})}).catch(()=>{});
                    // #endregion
                    
                    // Usar migração inline que retorna os itens já corrigidos
                    const migratedItens = await migrateAndReloadClientTable(cliente.tabelaPrecoId, tabelaPersonalizada);
                    return migratedItens;
                }
                
                // #region agent log
                const sortedItens = tabelaPersonalizada.itens.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.subcategoria.localeCompare(b.subcategoria));
                fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:getTabelaPrecos',message:'Using CLIENT table',data:{clienteId,tabelaPrecoId:cliente.tabelaPrecoId,itemCount:sortedItens.length,sampleIds:sortedItens.slice(0,10).map(i=>i.id),tableType:'CLIENT'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4-TABLE'})}).catch(()=>{});
                // #endregion
                return sortedItens;
            }
        }
    }
    
    // Retorna tabela padrão
    const snapshot = await tabelaPrecosCol.get();
    const globalItems = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            categoria: data.categoria,
            subcategoria: data.subcategoria,
            descricao: data.descricao,
            metrica: data.metrica,
            custoUnitario: data.custoUnitario,
            margemLucro: data.margemLucro,
            precoVenda: data.precoVenda,
        } as TabelaPrecoItem
    }).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.subcategoria.localeCompare(b.subcategoria));
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:getTabelaPrecos',message:'Using GLOBAL table',data:{clienteId,itemCount:globalItems.length,sampleIds:globalItems.slice(0,10).map(i=>i.id),tableType:'GLOBAL'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4-TABLE'})}).catch(()=>{});
    // #endregion
    
    return globalItems;
};

export const addTabelaPrecoItem = async (item: Omit<TabelaPrecoItem, 'id'>) => {
    return await tabelaPrecosCol.add(item);
};

export const updateTabelaPrecoItem = async (item: TabelaPrecoItem) => {
    const docRef = tabelaPrecosCol.doc(item.id);
    const { id, ...dataToUpdate } = item;
    return await docRef.update(dataToUpdate);
};

export const deleteTabelaPrecoItem = async (id: string) => {
    const docRef = tabelaPrecosCol.doc(id);
    return await docRef.delete();
};

// Utility function to update margins for all TP (template/variable cost) items
export const updateTPItemsMargin = async (newMargin: number): Promise<{ updated: number; errors: number }> => {
    const allItems = await getTabelaPrecos();
    let updated = 0;
    let errors = 0;
    
    for (const item of allItems) {
        // Identify TP items by description suffix
        const isTPItem = item.descricao && item.descricao.includes('(TP)');
        
        if (isTPItem) {
            try {
                // Calculate new precoVenda based on custoUnitario and new margin
                const newPrecoVenda = item.custoUnitario * (1 + newMargin / 100);
                
                await updateTabelaPrecoItem({
                    ...item,
                    margemLucro: newMargin,
                    precoVenda: newPrecoVenda
                });
                
                console.log(`✅ Atualizado: ${item.descricao} - Margem: ${newMargin}%, Preço Venda: R$ ${newPrecoVenda.toFixed(2)}`);
                updated++;
            } catch (error) {
                console.error(`❌ Erro ao atualizar ${item.descricao}:`, error);
                errors++;
            }
        }
    }
    
    console.log(`Atualização concluída: ${updated} itens atualizados, ${errors} erros`);
    return { updated, errors };
};

// --- Tabelas de Preços Personalizadas por Cliente ---
export const getTabelaPrecoCliente = async (tabelaId: string): Promise<TabelaPrecoCliente | null> => {
    try {
        const doc = await tabelaPrecosClientesCol.doc(tabelaId).get();
        if (!doc.exists) return null;
        
        const data = doc.data();
        return {
            id: doc.id,
            clienteId: data.clienteId,
            nome: data.nome,
            itens: data.itens || [],
            baseadaEm: data.baseadaEm || 'padrao',
            dataCriacao: data.dataCriacao,
            dataAtualizacao: data.dataAtualizacao,
        } as TabelaPrecoCliente;
    } catch (error) {
        console.error(`Error fetching tabela preco cliente ${tabelaId}:`, error);
        return null;
    }
};

export const getAllTabelasPrecoClientes = async (): Promise<TabelaPrecoCliente[]> => {
    const snapshot = await tabelaPrecosClientesCol.get();
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            clienteId: data.clienteId,
            nome: data.nome,
            itens: data.itens || [],
            baseadaEm: data.baseadaEm || 'padrao',
            dataCriacao: data.dataCriacao,
            dataAtualizacao: data.dataAtualizacao,
        } as TabelaPrecoCliente;
    });
};

export const createTabelaPrecoCliente = async (
    clienteId: string, 
    nome: string, 
    itens?: TabelaPrecoItem[]
): Promise<string> => {
    // Se itens não fornecidos, replicar da tabela padrão (sem clienteId para evitar loop)
    const itensParaSalvar = itens || await getTabelaPrecos(undefined);
    
    const now = new Date().toISOString();
    const docRef = await tabelaPrecosClientesCol.add({
        clienteId,
        nome,
        itens: itensParaSalvar,
        baseadaEm: 'padrao',
        dataCriacao: now,
        dataAtualizacao: now,
    });
    
    // Atualizar cliente para referenciar a tabela personalizada
    const cliente = await getClienteById(clienteId);
    if (cliente) {
        await updateCliente({
            ...cliente,
            tabelaPrecoId: docRef.id,
        });
    }
    
    return docRef.id;
};

export const updateTabelaPrecoCliente = async (
    tabelaId: string, 
    itens: TabelaPrecoItem[]
): Promise<void> => {
    const docRef = tabelaPrecosClientesCol.doc(tabelaId);
    await docRef.update({
        itens,
        dataAtualizacao: new Date().toISOString(),
    });
};

export const deleteTabelaPrecoCliente = async (tabelaId: string): Promise<void> => {
    // Encontrar cliente que usa esta tabela
    const snapshot = await clientesCol.where('tabelaPrecoId', '==', tabelaId).get();
    const batch = db.batch();
    
    // Remover referência do cliente
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const { tabelaPrecoId, ...rest } = data;
        batch.update(doc.ref, rest);
    });
    
    // Deletar tabela
    batch.delete(tabelaPrecosClientesCol.doc(tabelaId));
    
    await batch.commit();
};

export const duplicateTabelaPrecoCliente = async (
    fromClienteId: string, 
    toClienteId: string
): Promise<string> => {
    const clienteFrom = await getClienteById(fromClienteId);
    if (!clienteFrom?.tabelaPrecoId) {
        throw new Error('Cliente origem não possui tabela personalizada');
    }
    
    const tabelaFrom = await getTabelaPrecoCliente(clienteFrom.tabelaPrecoId);
    if (!tabelaFrom) {
        throw new Error('Tabela origem não encontrada');
    }
    
    // Criar nova tabela para o cliente destino
    return await createTabelaPrecoCliente(
        toClienteId,
        `${tabelaFrom.nome} (cópia)`,
        tabelaFrom.itens
    );
};

export const batchUpdateTabelaPrecos = async (csvContent: string): Promise<{ created: number, deleted: number }> => {
    const parsedData = parseCSV(csvContent);
    if (parsedData.length === 0) {
        throw new Error("CSV está vazio ou em formato inválido.");
    }

    const batch = db.batch();

    // 1. Delete all existing documents
    const existingDocsSnapshot = await tabelaPrecosCol.get();
    existingDocsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    const deletedCount = existingDocsSnapshot.size;

    // 2. Add all new documents from CSV
    let createdCount = 0;
    parsedData.forEach(row => {
        let custoUnitario = 0;
        let precoVenda = 0;
        let margemLucro = 0;

        // More robust column finding
        const getColumnValue = (names: string[]) => {
            for (const name of names) {
                if (row[name] !== undefined) return row[name];
                // Also try case-insensitive
                const foundKey = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
                if (foundKey) return row[foundKey];
            }
            return undefined;
        };

        const custoStr = getColumnValue(['Custo Unitario', 'Custo Unitário', 'Custo Unitário (Cubbo)', 'Custo Unitario (Cubbo)']);
        const precoStr = getColumnValue(['Preço Unitário', 'Preco Unitario', 'Preço Unitário (Yoobe)', 'Preco Unitario (Yoobe)']);
        const margemStr = getColumnValue(['Margem de Lucro (%)', 'Margem', 'Margem (%)', 'Margem de Lucro']);

        if (custoStr) {
            custoUnitario = parseFloat(custoStr.replace(',', '.')) || 0;
        }
        if (precoStr) {
            precoVenda = parseFloat(precoStr.replace(',', '.')) || 0;
        }
        if (margemStr) {
            margemLucro = parseFloat(margemStr.replace(',', '.')) || 0;
        }

        // Determine the final values based on what's provided
        if (custoStr && precoStr) {
            // Both provided, calculate margin if not provided
            if (!margemStr && custoUnitario > 0) {
                margemLucro = ((precoVenda / custoUnitario) - 1) * 100;
            }
        } else if (custoStr && margemStr) {
            // Cost and margin provided, calculate price
            precoVenda = custoUnitario * (1 + margemLucro / 100);
        } else if (precoStr && margemStr) {
            // Price and margin provided, calculate cost
            custoUnitario = precoVenda / (1 + margemLucro / 100);
        } else if (custoStr && !precoStr) {
            // Only cost, assume 0 margin
            precoVenda = custoUnitario;
        } else if (!custoStr && precoStr) {
            // Only price, assume 0 margin
            custoUnitario = precoVenda;
            }

        const dataToWrite: Omit<TabelaPrecoItem, 'id'> = {
            categoria: row.Categoria || row.categoria || "Geral",
            subcategoria: row.Subcategoria || row.subcategoria || "Geral",
            descricao: row['Descrição do Custo'] || row['Descricao'] || row['descricao'] || "-",
            metrica: row.Métrica || row.metrica || "Unidade",
            custoUnitario,
            margemLucro,
            precoVenda,
        };
        const docRef = tabelaPrecosCol.doc(); // Create a new doc with a new ID
        batch.set(docRef, dataToWrite);
        createdCount++;
    });

    await batch.commit();
    return { created: createdCount, deleted: deletedCount };
};

export const batchUpdatePriceMargins = async (category: string, newMargin: number): Promise<number> => {
    if (typeof newMargin !== 'number' || newMargin < 0) {
        throw new Error("A margem deve ser um número positivo.");
    }
    
    const q = tabelaPrecosCol.where("categoria", "==", category);
    const snapshot = await q.get();
    
    if (snapshot.empty) {
        throw new Error(`Nenhum item encontrado para a categoria "${category}".`);
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        const item = doc.data() as TabelaPrecoItem;
        const custoStr = String(item.custoUnitario).replace(',', '.'); // Standardize decimal separator
        const custo = parseFloat(custoStr.replace(/[^0-9.-]/g, '')) || 0; // Remove garbage, then parse

        const novoPreco = custo * (1 + newMargin / 100);
        batch.update(doc.ref, { 
            margemLucro: newMargin,
            precoVenda: novoPreco,
            custoUnitario: custo // Sanitize data by writing back the parsed number
        });
    });

    await batch.commit();
    return snapshot.size;
};


// --- Cobranças e Detalhes ---
export const getCobrancasMensais = async (clienteId?: string): Promise<CobrancaMensal[]> => {
    const q = clienteId ? cobrancasCol.where("clienteId", "==", clienteId) : cobrancasCol;
    const snapshot = await q.get();
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CobrancaMensal));
};

export const getDetalhesByCobrancaId = async (cobrancaId: string): Promise<DetalheEnvio[]> => {
    const detalhesCol = cobrancasCol.doc(cobrancaId).collection('detalhesEnvio');
    const snapshot = await detalhesCol.get();
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as DetalheEnvio));
};

export const getCustosAdicionaisByCobrancaId = async (cobrancaId: string): Promise<CustoAdicional[]> => {
    const custosCol = cobrancasCol.doc(cobrancaId).collection('custosAdicionais');
    const snapshot = await custosCol.get();
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CustoAdicional));
};

// --- Custos manuais por cliente (presets) ---
export const getCustosManuaisByCliente = async (clienteId: string): Promise<CustoManualPreset[]> => {
    if (!clienteId) return [];
    const custosCol = clientesCol.doc(clienteId).collection('custosManuais');
    const snapshot = await custosCol.get();
    return snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as CustoManualPreset))
        .filter(c => c.ativo !== false);
};

export const addCustoManualPreset = async (clienteId: string, data: Omit<CustoManualPreset, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustoManualPreset> => {
    const now = new Date().toISOString();
    const custosCol = clientesCol.doc(clienteId).collection('custosManuais');
    const docRef = await custosCol.add({ ...data, ativo: true, createdAt: now, updatedAt: now });
    return { id: docRef.id, ...data, ativo: true, createdAt: now, updatedAt: now };
};

export const updateCustoManualPreset = async (clienteId: string, presetId: string, updates: Partial<CustoManualPreset>): Promise<void> => {
    const custosCol = clientesCol.doc(clienteId).collection('custosManuais');
    await custosCol.doc(presetId).update({ ...updates, updatedAt: new Date().toISOString() });
};

export const deleteCustoManualPreset = async (clienteId: string, presetId: string): Promise<void> => {
    const custosCol = clientesCol.doc(clienteId).collection('custosManuais');
    await custosCol.doc(presetId).delete();
};

// --- Helper function to extract storage quantities from last invoice ---
export const getLastInvoiceStorageQuantities = async (clienteId: string): Promise<{ pallets: number; bins: number; prateleiras?: number }> => {
    try {
        // Get all invoices for the client, sorted by date (most recent first)
        const cobrancas = await getCobrancasMensais(clienteId);
        if (cobrancas.length === 0) {
            return { pallets: 0, bins: 0, prateleiras: 0 };
        }

        // Get the most recent invoice
        const lastInvoice = cobrancas.sort((a, b) => new Date(b.dataVencimento).getTime() - new Date(a.dataVencimento).getTime())[0];
        
        // Get details from the last invoice
        const detalhes = await getDetalhesByCobrancaId(lastInvoice.id);
        
        // Get price table to identify storage items
        const tabelaPrecos = await getTabelaPrecos(clienteId);
        
        let pallets = 0;
        let bins = 0;
        let prateleiras = 0;

        detalhes.forEach(detalhe => {
            if (!detalhe.tabelaPrecoItemId) return;
            
            const itemPreco = tabelaPrecos.find(p => p.id === detalhe.tabelaPrecoItemId);
            if (!itemPreco || itemPreco.categoria !== 'Armazenamento') return;

            const descricaoLower = itemPreco.descricao.toLowerCase();
            const metricaLower = itemPreco.metrica.toLowerCase();

            // Identify pallets, bins, or prateleiras by description/metric
            if (descricaoLower.includes('pallet') || metricaLower.includes('pallet')) {
                pallets += detalhe.quantidade;
            } else if (descricaoLower.includes('bin') || metricaLower.includes('bin')) {
                bins += detalhe.quantidade;
            } else if (descricaoLower.includes('prateleira') || metricaLower.includes('prateleira') || 
                       descricaoLower.includes('caixa') || metricaLower.includes('caixa')) {
                prateleiras += detalhe.quantidade;
            }
        });

        return { pallets, bins, prateleiras };
    } catch (error) {
        console.error('Error getting last invoice storage quantities:', error);
        return { pallets: 0, bins: 0, prateleiras: 0 };
    }
};

export const confirmarRecebimentoFatura = async (cobrancaId: string) => {
    const docRef = cobrancasCol.doc(cobrancaId);
    return await docRef.update({ 
        confirmadaPeloCliente: true,
        status: 'Enviada' // Assume confirmation implies the invoice is "sent" or "acknowledged"
    });
};

export const updateCobrancaStatus = async (cobrancaId: string, status: CobrancaMensal['status']) => {
    const docRef = cobrancasCol.doc(cobrancaId);
    return await docRef.update({ status });
};

export const deleteCobranca = async (cobrancaId: string) => {
    const detalhesCol = cobrancasCol.doc(cobrancaId).collection('detalhesEnvio');
    const custosAdicionaisCol = cobrancasCol.doc(cobrancaId).collection('custosAdicionais');
    
    const [detalhesSnapshot, custosAdicionaisSnapshot] = await Promise.all([
        detalhesCol.get(),
        custosAdicionaisCol.get()
    ]);


    // Firestore batches can handle up to 500 operations.
    // We create multiple batches if the subcollection is large.
    const MAX_BATCH_SIZE = 499; // Leave one operation for the main doc
    let batch = db.batch();
    let operationCount = 0;
    const batches = [batch];

    const allDocsToDelete = [...detalhesSnapshot.docs, ...custosAdicionaisSnapshot.docs];

    // Add delete operations for subcollection documents to batches
    allDocsToDelete.forEach((doc, index) => {
        batch.delete(doc.ref);
        operationCount++;
        // If the batch is full, create a new one
        if (operationCount >= MAX_BATCH_SIZE && index < allDocsToDelete.length - 1) {
            batch = db.batch();
            batches.push(batch);
            operationCount = 0;
        }
    });

    // Add the main document delete operation to the last batch
    const cobrancaRef = cobrancasCol.doc(cobrancaId);
    batch.delete(cobrancaRef);

    // Commit all batches in parallel
    await Promise.all(batches.map(b => b.commit()));
};

export const getShareableUrl = (clienteId: string, cobrancaId: string) => {
    // Use a simple and robust hash format: #share-clienteId-cobrancaId
    // This format is more reliable than query parameters in hash and works better with SPA routing
    const baseUrl = `https://${firebaseConfig.projectId}.web.app`;
    return `${baseUrl}/#share-${clienteId}-${cobrancaId}`;
}

export const salvarCobrancaProcessada = async (cobranca: CobrancaMensal, detalhes: DetalheEnvio[], custosAdicionais: CustoAdicional[], trackReportContent: string, orderDetailContent: string): Promise<CobrancaMensal> => {
    const batch = db.batch();
    
    const newCobrancaRef = cobrancasCol.doc();
    const finalCobranca = { ...cobranca, id: newCobrancaRef.id };
    
    const urlCompartilhamento = getShareableUrl(cobranca.clienteId, newCobrancaRef.id);
    
    // #region agent log
    const sampleDetailIds = detalhes.slice(0, 10).map(d => ({ tabelaPrecoItemId: d.tabelaPrecoItemId, pedido: d.codigoPedido, quantidade: d.quantidade }));
    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:salvarCobrancaProcessada',message:'Saving invoice with detail IDs',data:{clienteId:cobranca.clienteId,cobrancaId:newCobrancaRef.id,totalDetalhes:detalhes.length,sampleDetailIds},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'SAVE-IDS'})}).catch(()=>{});
    // #endregion
    
    const { id: _cobrancaId, ...cobrancaToSave } = cobranca;
    batch.set(newCobrancaRef, {
        ...cobrancaToSave,
        urlCompartilhamento,
        relatorioRastreioCSV: trackReportContent,
        relatorioCustosCSV: orderDetailContent
    });

    detalhes.forEach(detalhe => {
        const newDetalheRef = newCobrancaRef.collection('detalhesEnvio').doc();
        const { id: _detalheId, ...detalheToSave } = detalhe;
        batch.set(newDetalheRef, { ...detalheToSave, cobrancaId: newCobrancaRef.id });
    });
    
    custosAdicionais.forEach(custo => {
        const newCustoRef = newCobrancaRef.collection('custosAdicionais').doc();
        const { id: _custoId, ...custoToSave } = custo;
        batch.set(newCustoRef, custoToSave);
    });

    await batch.commit();
    return finalCobranca;
};

export const salvarCobrancaEditada = async (cobranca: CobrancaMensal, detalhes: DetalheEnvio[], custosAdicionais: CustoAdicional[]) => {
    const batch = db.batch();
    
    const cobrancaRef = cobrancasCol.doc(cobranca.id);
    const urlCompartilhamento = getShareableUrl(cobranca.clienteId, cobranca.id);
    
    const { id: _cobrancaId, ...cobrancaToUpdate } = cobranca;
    batch.update(cobrancaRef, { ...cobrancaToUpdate, urlCompartilhamento });
    
    // Manage 'detalhesEnvio' subcollection
    const existingDetalhes = await getDetalhesByCobrancaId(cobranca.id);
    existingDetalhes.forEach(d => {
        const detalheRef = cobrancaRef.collection('detalhesEnvio').doc(d.id);
        batch.delete(detalheRef);
    });

    detalhes.forEach(detalhe => {
        const newDetalheRef = cobrancaRef.collection('detalhesEnvio').doc();
        const { id: _detalheId, ...detalheToSave } = detalhe;
        batch.set(newDetalheRef, { ...detalheToSave, cobrancaId: cobranca.id });
    });
    
    // Manage 'custosAdicionais' subcollection
    const existingCustosAdicionais = await getCustosAdicionaisByCobrancaId(cobranca.id);
    existingCustosAdicionais.forEach(c => {
        const custoRef = cobrancaRef.collection('custosAdicionais').doc(c.id);
        batch.delete(custoRef);
    });

    custosAdicionais.forEach(custo => {
        const newCustoRef = cobrancaRef.collection('custosAdicionais').doc();
        const { id: _custoId, ...custoToSave } = custo;
        batch.set(newCustoRef, custoToSave);
    });


    await batch.commit();
};

export const getCostCategoryGroup = (category: string): 'envio' | 'armazenagem' | 'logistico' => {
    const catLower = category.toLowerCase();
    const envioCats = ['envios', 'retornos'];
    
    if (envioCats.some(c => catLower.includes(c))) return 'envio';
    if (catLower.includes('armazenamento') || catLower.includes('armazenagem')) return 'armazenagem';
    return 'logistico';
};

// Helper function to identify if an item is a template (dynamic cost)
// Templates are items where the base cost comes from the CSV (variable) 
// instead of being fixed in the price table.
export const isTemplateItem = (item: TabelaPrecoItem): boolean => {
    if (!item) return false;
    
    // Items with precoVenda === 1 or 0.01 are indicators of dynamic/variable costs
    const isDynamicIndicator = item.precoVenda === 1 || item.precoVenda === 0.01;
    
    const isShipping = (item.categoria === 'Envios' || item.categoria === 'Retornos');
    const isDifal = item.categoria === 'Difal';
    
    const hasTemplateInDescription = item.descricao && 
        (item.descricao.toLowerCase().includes('(template)') || 
         item.descricao.toLowerCase().includes('template'));
    
    return isDynamicIndicator && (isShipping || isDifal || hasTemplateInDescription);
};

// Helper function to calculate sale price based on cost and margin
// Always recalculates to ensure margin changes are reflected in invoices
export const calculatePrecoVenda = (item: TabelaPrecoItem, baseCost?: number): number => {
    if (!item) {
        console.error('calculatePrecoVenda: item is null or undefined');
        return 0;
    }
    
    // Check if this is DIFAL
    const isDifal = item.descricao?.toLowerCase().includes('difal');
    const DIFAL_MIN_PRICE = 3.00;
    
    // #region agent log
    if (isDifal) {
        fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:calculatePrecoVenda:ENTRY',message:'DIFAL item detected',data:{itemId:item.id,descricao:item.descricao,categoria:item.categoria,precoVenda:item.precoVenda,custoUnitario:item.custoUnitario,margemLucro:item.margemLucro,baseCost,isTemplate:isTemplateItem(item)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-DIFAL'})}).catch(()=>{});
    }
    // #endregion
    
    // For pass-through items (template items with price = 1), always return 1
    // UNLESS a baseCost is provided (e.g. for shipping cost in CSV)
    // EXCEPTION: DIFAL always returns minimum R$ 3,00
    if (isTemplateItem(item) && baseCost === undefined) {
        if (isDifal) {
            return DIFAL_MIN_PRICE; // DIFAL minimum
        }
        return 1; // Always return 1 for other template items
    }
    
    // For normal items, always recalculate based on current cost and margin
    // Formula: precoVenda = custoUnitario * (1 + margemLucro / 100)
    const costToUse = baseCost !== undefined ? baseCost : item.custoUnitario;
    
    if (costToUse > 0) {
        let calculatedPrice = costToUse * (1 + (item.margemLucro || 0) / 100);
        
        // DIFAL: Apply minimum price of R$ 3,00
        if (isDifal && calculatedPrice < DIFAL_MIN_PRICE) {
            calculatedPrice = DIFAL_MIN_PRICE;
        }
        
        // Ensure we never return 0 or negative values
        if (calculatedPrice > 0) {
            return calculatedPrice;
        }
    }
    
    // Fallback to stored price if cost is 0 or invalid, but ensure it's not 0
    if (item.precoVenda > 0 && baseCost === undefined) {
        // Still apply DIFAL minimum
        if (isDifal && item.precoVenda < DIFAL_MIN_PRICE) {
            return DIFAL_MIN_PRICE;
        }
        return item.precoVenda;
    }
    
    // For DIFAL, never return less than minimum
    if (isDifal) {
        return DIFAL_MIN_PRICE;
    }
    
    return baseCost || 0;
};

// Helper function to calculate sale price for display and calculations
// Handles templates of specific costs (Difal, Seguro, etc.) correctly
// For templates of specific costs, uses custoUnitario + margemLucro instead of pass-through
// DIFAL: Applies minimum price of R$ 3,00
export const calculatePrecoVendaForDisplay = (item: TabelaPrecoItem): number => {
    if (!item) {
        console.error('calculatePrecoVendaForDisplay: item is null or undefined');
        return 0;
    }
    
    // Check if this is DIFAL
    const isDifal = item.descricao?.toLowerCase().includes('difal');
    
    // Check if this is a specific cost (Difal, Seguro, Ajustes)
    const isSpecificCost = isDifal || 
                          item.descricao?.toLowerCase().includes('seguro') || 
                          item.descricao?.toLowerCase().includes('ajuste');
    
    // For templates of specific costs, use price table value (custoUnitario + margemLucro)
    // Templates with pass-through are only for shipping, not for specific costs
    if (isTemplateItem(item) && isSpecificCost && item.custoUnitario > 0) {
        let calculatedPrice = item.custoUnitario * (1 + (item.margemLucro || 0) / 100);
        
        // DIFAL: Apply minimum price of R$ 3,00
        if (isDifal) {
            const DIFAL_MIN_PRICE = 3.00;
            if (calculatedPrice < DIFAL_MIN_PRICE) {
                calculatedPrice = DIFAL_MIN_PRICE;
            }
        }
        
        if (calculatedPrice > 0) {
            return calculatedPrice;
        }
    }
    
    // For DIFAL items that are NOT template items, still apply minimum
    if (isDifal) {
        const DIFAL_MIN_PRICE = 3.00;
        let basePrice = calculatePrecoVenda(item);
        if (basePrice < DIFAL_MIN_PRICE) {
            return DIFAL_MIN_PRICE;
        }
        return basePrice;
    }
    
    // For all other cases, use standard calculatePrecoVenda
    return calculatePrecoVenda(item);
};

// Keywords that identify digital/voucher items (no logistics cost)
// Note: Removed '%' as it caused false positives (e.g., "100% algodão")
const DIGITAL_VOUCHER_KEYWORDS = ['voucher', 'vale presente', 'giftcard', 'gift card', 'cupom', 'cupão', 'e-gift', 'egift', 'vale-presente', 'cartão presente', 'cartao presente'];

// Shipping methods that indicate digital products (no logistics)
const DIGITAL_SHIPPING_METHODS = ['produto digital', 'digital product', 'digital', 'e-delivery', 'download'];

// Helper function to check if an order row is PURELY digital/voucher (no physical products)
// A mixed order (voucher + physical) should NOT be skipped because there are shipping costs
// Orders with shipping method "Produto Digital" are always considered digital (no logistics)
export const isDigitalVoucherOrder = (orderRow: Record<string, string>): boolean => {
    // FIRST: Check shipping method - if "Produto Digital", always skip (no logistics)
    const shippingMethodColumns = [
        'Shipping Method', 'shipping method', 'Shipping method',
        'Método de envio', 'Metodo de envio', 'método de envio',
        'Shipping Mode', 'shipping mode', 'Mode', 'Modalidade'
    ];
    
    for (const col of shippingMethodColumns) {
        const value = orderRow[col];
        if (value) {
            const lower = value.toLowerCase().trim();
            if (DIGITAL_SHIPPING_METHODS.some(method => lower.includes(method))) {
                // Shipping method is digital - skip this order entirely
                return true;
            }
        }
    }
    
    // Check if there's any shipping cost - if yes, this order has physical products
    const shippingCostColumns = [
        'Custo de envio', 'Custo de Envio', 'Custo Envio', 'Shipping Cost', 'shipping_cost',
        'Frete', 'frete', 'Shipping', 'shipping'
    ];
    
    for (const col of shippingCostColumns) {
        const value = orderRow[col];
        if (value) {
            const numValue = parseFloat(value.replace(',', '.').replace(/[^\d.-]/g, ''));
            if (!isNaN(numValue) && numValue > 0) {
                // Has shipping cost = has physical products, do NOT skip this order
                return false;
            }
        }
    }
    
    // Also check for products shipped count - if > 0, has physical products
    const productsShippedColumns = ['Produtos enviados', 'Products shipped', 'Items shipped', 'Itens enviados'];
    for (const col of productsShippedColumns) {
        const value = orderRow[col];
        if (value) {
            const numValue = parseInt(value.replace(/[^\d]/g, ''), 10);
            if (!isNaN(numValue) && numValue > 0) {
                // Has products shipped = has physical products, do NOT skip
                return false;
            }
        }
    }
    
    // No shipping cost and no products shipped - check if it's a voucher/digital item
    const itemNameColumns = ['Item name', 'item name', 'Nome do item', 'Nome do produto', 'Product name', 'Produto', 'Title', 'Título'];
    const skuColumns = ['SKU', 'sku', 'Product SKU', 'product sku', 'product_sku', 'Sku'];
    
    const matchesKeyword = (value?: string) => {
        if (!value) return false;
        const lower = value.toLowerCase().trim();
        return DIGITAL_VOUCHER_KEYWORDS.some(keyword => lower.includes(keyword));
    };
    
    const checkColumns = (cols: string[]) => cols.some(col => matchesKeyword(orderRow[col]));
    
    // Only return true (skip order) if it matches voucher keywords AND has no shipping
    if (checkColumns(itemNameColumns)) return true;
    if (checkColumns(skuColumns)) return true;

    return false;
};

// --- Helper to validate and detect duplicates in multiple CSV contents ---
export interface MultiCSVValidationResult {
    isValid: boolean;
    totalRows: number;
    duplicateOrders: string[];
    warnings: string[];
    fileStats: { fileName: string; rowCount: number; period: string }[];
}

export const validateMultipleOrderDetailCSVs = (csvContents: string[]): MultiCSVValidationResult => {
    const result: MultiCSVValidationResult = {
        isValid: true,
        totalRows: 0,
        duplicateOrders: [],
        warnings: [],
        fileStats: []
    };
    
    if (csvContents.length === 0) {
        result.isValid = false;
        result.warnings.push('Nenhum arquivo selecionado');
        return result;
    }
    
    const allParsed = csvContents.map((content, idx) => ({
        data: parseCSV(content),
        index: idx
    }));
    
    // Check for order column
    const orderColumns = ['Number', 'Pedido', 'Order', 'Código do Pedido', 'Numero do Pedido'];
    
    // Find all order IDs across all files
    const orderIdCounts: Map<string, number> = new Map();
    
    for (const { data, index } of allParsed) {
        if (data.length === 0) {
            result.warnings.push(`Arquivo ${index + 1} está vazio ou inválido`);
            continue;
        }
        
        result.totalRows += data.length;
        
        // Find order column
        const orderColumn = orderColumns.find(col => 
            Object.keys(data[0] || {}).some(h => h.toLowerCase().includes(col.toLowerCase()))
        );
        
        if (orderColumn) {
            const actualColumn = Object.keys(data[0] || {}).find(h => 
                h.toLowerCase().includes(orderColumn.toLowerCase())
            );
            
            if (actualColumn) {
                for (const row of data) {
                    const orderId = row[actualColumn]?.trim();
                    if (orderId) {
                        orderIdCounts.set(orderId, (orderIdCounts.get(orderId) || 0) + 1);
                    }
                }
            }
        }
    }
    
    // Find duplicates
    for (const [orderId, count] of orderIdCounts) {
        if (count > 1) {
            result.duplicateOrders.push(orderId);
        }
    }
    
    if (result.duplicateOrders.length > 0) {
        result.warnings.push(`${result.duplicateOrders.length} pedido(s) duplicado(s) entre arquivos: ${result.duplicateOrders.slice(0, 5).join(', ')}${result.duplicateOrders.length > 5 ? '...' : ''}`);
    }
    
    return result;
};

// --- Helper to combine multiple CSV contents for multi-month billing ---
const combineCSVContents = (csvContents: string[]): string => {
    if (csvContents.length === 0) return '';
    if (csvContents.length === 1) return csvContents[0];
    
    // Parse all CSVs
    const allParsed = csvContents.map(content => parseCSV(content)).filter(arr => arr.length > 0);
    
    if (allParsed.length === 0) return '';
    if (allParsed.length === 1) return csvContents[0];
    
    // Use headers from first non-empty CSV
    const firstData = allParsed[0];
    const headers = Object.keys(firstData[0] || {});
    
    if (headers.length === 0) return csvContents[0];
    
    // Combine all rows from all CSVs
    const allRows: Record<string, string>[] = allParsed.flat();
    
    // Check for duplicate orders and log warning
    const orderColumns = ['Number', 'Pedido', 'Order', 'Código do Pedido', 'Numero do Pedido'];
    const orderColumn = orderColumns.find(col => 
        headers.some(h => h.toLowerCase().includes(col.toLowerCase()))
    );
    
    if (orderColumn) {
        const actualColumn = headers.find(h => h.toLowerCase().includes(orderColumn.toLowerCase()));
        if (actualColumn) {
            const orderIds = allRows.map(r => r[actualColumn]?.trim()).filter(Boolean);
            const uniqueOrderIds = new Set(orderIds);
            if (orderIds.length !== uniqueOrderIds.size) {
                const duplicateCount = orderIds.length - uniqueOrderIds.size;
                console.warn(`⚠️ combineCSVContents: ${duplicateCount} pedidos duplicados detectados entre arquivos`);
            }
        }
    }
    
    console.log(`combineCSVContents: Combinados ${allParsed.length} arquivos, total de ${allRows.length} linhas`);
    
    // Convert back to CSV string
    const headerLine = headers.map(h => `"${h}"`).join(',');
    const dataLines = allRows.map(row => 
        headers.map(h => {
            const val = row[h] || '';
            // Escape quotes in value
            return `"${val.replace(/"/g, '""')}"`;
        }).join(',')
    );
    
    return [headerLine, ...dataLines].join('\n');
};

// --- Local Processing Logic ---

export const processarFatura = async (
    clientId: string,
    month: string,
    storageStartDate: string,
    clientes: Cliente[],
    trackReportContent: string,
    orderDetailContent: string | string[], // Accept single string or array of strings for multi-month support
    ignoreMonthFilter: boolean = false,
    dateRange?: { start: string; end: string } // Custom date range for filtering orders
): Promise<{ cobranca: CobrancaMensal, detalhes: DetalheEnvio[], detectedDateRange: string, summary: InvoiceSummary }> => {
    
    console.log('=== INÍCIO processarFatura ===');
    console.log('Cliente ID:', clientId);
    console.log('Mês de referência:', month);
    console.log('Intervalo de datas personalizado:', dateRange ? `${dateRange.start} a ${dateRange.end}` : 'não definido');
    
    // Handle multi-file Order Detail: combine multiple CSV contents
    const orderDetailContentsArray = Array.isArray(orderDetailContent) ? orderDetailContent : [orderDetailContent];
    console.log('Order Detail: recebidos', orderDetailContentsArray.length, 'arquivo(s)');
    
    // Combine CSVs: parse each, merge data rows (using first CSV's headers as reference)
    const combinedOrderDetailContent = combineCSVContents(orderDetailContentsArray);
    
    // Try to use client's price table first (with their custom margins)
    // If client has no custom table, fall back to global table
    // IMPORTANT: Client table items must have IDs that match global table!
    let tabelaPrecos = await getTabelaPrecos(clientId);
    const isClientTable = !!(await getClienteById(clientId))?.tabelaPrecoId;
    
    // If client table is empty or has issues, fall back to global
    if (tabelaPrecos.length === 0) {
        console.log('⚠️ Tabela do cliente vazia, usando tabela global');
        tabelaPrecos = await getTabelaPrecos(); // Global fallback
    }
    
    console.log('Tabela de preços carregada:', isClientTable ? 'CLIENTE' : 'GLOBAL', '-', tabelaPrecos.length, 'itens');
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:tabelaPrecos',message:'Price table loaded',data:{source:isClientTable?'client':'global',clientId,count:tabelaPrecos.length,sampleIds:tabelaPrecos.slice(0,5).map(i=>({id:i.id,desc:i.descricao}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'TABLE-SOURCE'})}).catch(()=>{});
    // #endregion
    
    if (tabelaPrecos.length === 0) {
        console.error('ERRO: Tabela de preços está vazia! Não é possível processar a fatura.');
        throw new Error("Tabela de preços está vazia. Por favor, carregue a tabela de preços primeiro.");
    }
    
    const cliente = clientes.find(c => c.id === clientId);
    if (!cliente) {
        console.error('ERRO: Cliente não encontrado com ID:', clientId);
        throw new Error("Cliente não encontrado");
    }

    console.log('Cliente encontrado:', cliente.nome);

    // --- START: Robust Pre-filtering ---
    const rawTrackReport = parseCSV(trackReportContent);
    const rawOrderDetail = parseCSV(combinedOrderDetailContent);
    
    const hasTrackReport = rawTrackReport.length > 0 && !!trackReportContent.trim();
    
    console.log('CSV Track Report parseado:', rawTrackReport.length, 'linhas');
    console.log('CSV Order Detail parseado (combinado):', rawOrderDetail.length, 'linhas');
    
    if (rawTrackReport.length > 0) {
        console.log('Colunas disponíveis no Track Report:', JSON.stringify(Object.keys(rawTrackReport[0])));
    }
    if (rawOrderDetail.length > 0) {
        console.log('Colunas disponíveis no Order Detail:', JSON.stringify(Object.keys(rawOrderDetail[0])));
    }
    
    if (rawTrackReport.length === 0) {
        console.warn('AVISO: Track Report CSV está vazio ou não foi parseado corretamente. Prosseguindo apenas com Order Detail.');
    }
    if (rawOrderDetail.length === 0) {
        console.warn('AVISO: Order Detail CSV está vazio ou não foi parseado corretamente');
    }

    // Check if the "Track Report" is actually a valid shipment tracking report
    // or if it's a different type of file (like a product catalog)
    const isValidTrackReport = (data: Record<string, string>[]): boolean => {
        if (!data || data.length === 0) return false;
        const columns = Object.keys(data[0]).map(c => c.toLowerCase());
        
        // A valid track report should have at least one of these shipment-related columns
        const trackReportIndicators = [
            'data de envio', 'data do envio', 'rastreio', 'rastreamento', 'tracking',
            'número do pedido', 'numero do pedido', 'pedido', 'order',
            'placed at', 'shipped at', 'email', 'number', 'status',
            'data do pedido', 'data de criação'
        ];
        
        const matchCount = trackReportIndicators.filter(indicator => 
            columns.some(col => col.includes(indicator))
        ).length;
        
        // If it has at least 2 indicators, it's likely a valid track report
        return matchCount >= 2;
    };
    
    const trackReportIsValid = isValidTrackReport(rawTrackReport);
    
    if (!trackReportIsValid && rawTrackReport.length > 0) {
        console.warn('⚠️ AVISO: O arquivo carregado como Track Report não parece ser um relatório de rastreio válido.');
        console.warn('   Colunas detectadas sugerem que é um catálogo de produtos ou outro tipo de arquivo.');
        console.warn('   Prosseguindo apenas com Order Detail para processamento.');
    }
    
    // Only use track report if it's valid
    const effectiveHasTrackReport = hasTrackReport && trackReportIsValid;

    // Detect track report layout and build schema
    const trackReportLayout = effectiveHasTrackReport ? detectTrackReportLayout(rawTrackReport) : 'legacy';
    const trackReportSchema = effectiveHasTrackReport ? buildTrackReportSchema(rawTrackReport, trackReportLayout) : null;
    
    // Use schema for date column
    const trackReportDateColumn = trackReportSchema?.dateColumn || null;
    
    if (effectiveHasTrackReport && !trackReportDateColumn) {
        console.error('ERRO: Não foi possível encontrar coluna de data no Track Report. Colunas disponíveis:', rawTrackReport.length > 0 ? JSON.stringify(Object.keys(rawTrackReport[0])) : 'N/A');
        throw new Error("Coluna de data não encontrada no Track Report CSV. Verifique se o arquivo contém uma coluna de data.");
    }
    if (trackReportDateColumn) {
        console.log('Coluna de data encontrada no Track Report:', trackReportDateColumn, `(Layout: ${trackReportLayout})`);
    }
    
    // Find date column in orderDetail (should be 'Data do pedido' but check for variations)
    const orderDetailDateColumn = findColumnName(rawOrderDetail, [
        'Data do pedido',
        'Data do Pedido',
        'Data',
        'Date'
    ]) || 'Data do pedido'; // Fallback to expected name
    
    console.log('Coluna de data usada no Order Detail:', orderDetailDateColumn);

    // Filter data based on:
    // 1. Custom date range (if provided)
    // 2. Month filter (if not ignoring)
    // 3. No filter (if ignoring month filter)
    let trackReport: Record<string, string>[];
    let orderDetail: Record<string, string>[];
    let filterDescription: string;
    
    if (dateRange) {
        // Use custom date range
        trackReport = trackReportDateColumn 
            ? filterDataByDateRange(rawTrackReport, trackReportDateColumn, dateRange.start, dateRange.end)
            : rawTrackReport;
        orderDetail = filterDataByDateRange(rawOrderDetail, orderDetailDateColumn, dateRange.start, dateRange.end);
        filterDescription = `Intervalo personalizado: ${dateRange.start} a ${dateRange.end}`;
    } else if (ignoreMonthFilter) {
        // Use all data
        trackReport = rawTrackReport;
        orderDetail = rawOrderDetail;
        filterDescription = 'Sem filtro de data (todos os dados)';
    } else {
        // Filter by month (default)
        trackReport = trackReportDateColumn 
            ? filterDataByMonth(rawTrackReport, trackReportDateColumn, month)
            : rawTrackReport;
        orderDetail = filterDataByMonth(rawOrderDetail, orderDetailDateColumn, month);
        filterDescription = `Mês de referência: ${month}`;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:processarFatura',message:'Filtro de data aplicado',data:{filterDescription,dateRange,ignoreMonthFilter,trackReportRows:trackReport.length,orderDetailRows:orderDetail.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DATE-FILTER'})}).catch(()=>{});
    // #endregion
    
    console.log(filterDescription);
    console.log(`Track Report filtrado: ${trackReport.length} linhas (Coluna: ${trackReportDateColumn || 'N/A'})`);
    console.log(`Order Detail filtrado: ${orderDetail.length} linhas (Coluna: ${orderDetailDateColumn})`);
    
    // Debug first few rows of Order Detail to verify date parsing
    if (orderDetail.length === 0 && rawOrderDetail.length > 0) {
        console.warn('⚠️ DEBUG: Order Detail filtering resulted in 0 rows.');
        console.log('Exemplos de valores na coluna de data:', rawOrderDetail.slice(0, 3).map(r => r[orderDetailDateColumn]));
    }
    
    if (trackReport.length === 0) {
        console.warn('AVISO: Nenhum dado encontrado no Track Report para o mês', month);
    }
    if (orderDetail.length === 0) {
        console.error('ERRO: Nenhum dado encontrado no Order Detail para o mês', month);
        throw new Error("Order Detail está vazio ou não contém dados para o mês selecionado. Envie o arquivo de custos para continuar.");
    }
    // --- END: Robust Pre-filtering ---

    // --- START: Dynamic Cost Column Identification and Matching ---
    // Identify column for shipping cost (prefer 'Custo de envio' name, fallback to letter 'Z' or 'AD')
    const columnShipping = findColumnName(rawOrderDetail, [
        'Custo de envio',
        'Custo de Envio',
        'Custo Envio',
        'Shipping Cost',
        'Frete'
    ]) || findColumnByLetter(rawOrderDetail, 'Z') || findColumnByLetter(rawOrderDetail, 'AD');
    
    const columnAD = columnShipping;
    console.log('Coluna de custo de envio encontrada:', columnAD || 'NÃO ENCONTRADA');
    
    // Identify columns M (CEP), O (Estado), E (Quantidade de itens), and T (Custo do picking)
    const columnM = findColumnByLetter(rawOrderDetail, 'M');
    const columnO = findColumnByLetter(rawOrderDetail, 'O');
    // Column E: search by name first, then by position
    const columnE = findColumnName(rawOrderDetail, [
        'Produtos enviados',
        'Products shipped',
        'Item quantity',
        'Quantidade de itens',
        'Items shipped',
        'Itens enviados'
    ]) || findColumnByLetter(rawOrderDetail, 'E');
    const columnT = findColumnByLetter(rawOrderDetail, 'T');
    console.log('Coluna M (CEP) encontrada:', columnM || 'NÃO ENCONTRADA');
    console.log('Coluna O (Estado) encontrada:', columnO || 'NÃO ENCONTRADA');
    console.log('Coluna E (Quantidade de itens) encontrada:', columnE || 'NÃO ENCONTRADA');
    console.log('Coluna T (Custo do picking de produtos) encontrada:', columnT || 'NÃO ENCONTRADA');
    
    // Find shipping item from price table for column AD
    let shippingItemForAD: TabelaPrecoItem | null = null;
    if (columnAD) {
        shippingItemForAD = matchCsvColumnToTabelaPreco(columnAD, tabelaPrecos);
        if (!shippingItemForAD) {
            // Try to find any shipping item in Envios category
            shippingItemForAD = tabelaPrecos.find(item => 
                (item.categoria === 'Envios' || item.categoria === 'Retornos') && !isTemplateItem(item)
            ) || tabelaPrecos.find(item => item.categoria === 'Envios');
            
            if (shippingItemForAD) {
                console.log(`✅ Item de envio encontrado para coluna AD: "${shippingItemForAD.descricao}"`);
            } else {
                console.error(`ERRO: Nenhum item de envio encontrado na tabela de preços para coluna AD!`);
            }
        } else {
            console.log(`✅ Match encontrado para coluna AD: "${shippingItemForAD.descricao}"`);
        }
    }

    // Find picking items in price table
    // Item for orders with 0-1 items
    const pickingItem01 = tabelaPrecos.find(item => {
        const descLower = item.descricao?.toLowerCase() || '';
        return descLower.includes('pedidos contendo de 0.0 até 1.0 itens') ||
               descLower.includes('pedidos contendo de 0 até 1') ||
               descLower.includes('0.0 até 1.0 itens') ||
               (descLower.includes('até 1.0') && descLower.includes('itens'));
    });
    
    if (pickingItem01) {
        console.log(`✅ Item de picking (0-1 itens) encontrado: "${pickingItem01.descricao}" (ID: ${pickingItem01.id})`);
    } else {
        console.error(`❌ ERRO: Item de picking "pedidos contendo de 0.0 até 1.0 itens" NÃO encontrado na tabela de preços!`);
        console.error(`   Por favor, adicione um item com essa descrição para processar custos de picking corretamente.`);
    }
    
    // Item for additional items (more than 1 item)
    const additionalItemCostItem = tabelaPrecos.find(item => {
        const descLower = item.descricao?.toLowerCase() || '';
        return descLower.includes('pedidos contendo mais de') || 
               descLower.includes('mais de 1.0 itens') ||
               descLower.includes('mais de 1.0 item') ||
               descLower.includes('item adicional') ||
               (descLower.includes('mais de') && descLower.includes('item'));
    });
    
    if (additionalItemCostItem) {
        console.log(`✅ Item de custo adicional encontrado: "${additionalItemCostItem.descricao}" (ID: ${additionalItemCostItem.id})`);
    } else {
        console.error(`❌ ERRO: Item de custo adicional "pedidos contendo mais de 1.0 itens" NÃO encontrado na tabela de preços!`);
        console.error(`   Por favor, adicione um item com essa descrição para processar custos de itens adicionais corretamente.`);
    }

    // Helper function to check if item is picking/packing
    const isPickingPackingItem = (item: TabelaPrecoItem): boolean => {
        if (!item) return false;
        const categoriaLower = item.categoria?.toLowerCase() || '';
        const descLower = item.descricao?.toLowerCase() || '';
        const subcategoriaLower = item.subcategoria?.toLowerCase() || '';
        
        return categoriaLower.includes('pick') || 
               categoriaLower.includes('pack') ||
               descLower.includes('pick') ||
               descLower.includes('pack') ||
               subcategoriaLower.includes('pick') ||
               subcategoriaLower.includes('pack');
    };
    
    // Identify other cost columns (excluding AD and shipping-related columns)
    const costColumns = identifyCostColumns(rawOrderDetail);
    // Filter out column AD and other shipping columns (we'll process AD separately)
    const otherCostColumns = costColumns.filter(col => {
        const lowerCol = col.toLowerCase();
        // Exclude column AD and other shipping columns (they're already summed in AD)
        return col !== columnAD && 
               !lowerCol.includes('envio') && 
               !lowerCol.includes('shipping') && 
               !lowerCol.includes('frete');
    });
    
    console.log('Colunas de custo (excluindo envio/AD) identificadas:', otherCostColumns);
    console.log('Total de colunas de custo (excluindo envio):', otherCostColumns.length);
    
    // Create dynamic mapping: CSV column -> TabelaPrecoItem (for non-shipping costs)
    const costColumnToItemMap = new Map<string, TabelaPrecoItem>();
    const unmatchedColumns: string[] = [];
    // Track which items are mapped to by multiple columns (potential duplicate source)
    const itemToColumnsMap = new Map<string, string[]>();
    
    otherCostColumns.forEach(csvColumn => {
        const matchedItem = matchCsvColumnToTabelaPreco(csvColumn, tabelaPrecos);
        if (matchedItem) {
            costColumnToItemMap.set(csvColumn, matchedItem);
            console.log(`✅ Match encontrado: "${csvColumn}" → "${matchedItem.descricao}" (${matchedItem.categoria})`);
            
            // Track columns that map to the same item
            const existingColumns = itemToColumnsMap.get(matchedItem.id) || [];
            existingColumns.push(csvColumn);
            itemToColumnsMap.set(matchedItem.id, existingColumns);
        } else {
            unmatchedColumns.push(csvColumn);
            console.warn(`⚠️ Match NÃO encontrado para coluna: "${csvColumn}"`);
        }
    });
    
    // #region agent log
    const duplicateMappings = Array.from(itemToColumnsMap.entries()).filter(([_, cols]) => cols.length > 1);
    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:columnMapping',message:'Column to item mapping complete',data:{totalColumns:otherCostColumns.length,mappedColumns:costColumnToItemMap.size,unmatchedCount:unmatchedColumns.length,duplicateMappings:duplicateMappings.map(([id,cols])=>({itemId:id,columns:cols}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H3'})}).catch(()=>{});
    // #endregion
    
    // Warn about duplicate mappings
    duplicateMappings.forEach(([itemId, columns]) => {
        const item = tabelaPrecos.find(p => p.id === itemId);
        console.warn(`⚠️ MÚLTIPLAS COLUNAS mapeiam para o mesmo item: "${item?.descricao}" ← [${columns.join(', ')}]`);
    });
    
    if (unmatchedColumns.length > 0) {
        const unmatchedPercentage = (unmatchedColumns.length / otherCostColumns.length) * 100;
        console.warn(`ATENÇÃO: ${unmatchedColumns.length} de ${otherCostColumns.length} colunas de custo (${unmatchedPercentage.toFixed(1)}%) não tiveram match na tabela de preços:`, unmatchedColumns);
        console.log('Itens disponíveis na tabela de preços (para referência):');
        tabelaPrecos.slice(0, 10).forEach(item => {
            console.log(`  - ${item.descricao} (${item.categoria}, precoVenda: ${item.precoVenda})`);
        });
        
        // Block processing if more than 50% of cost columns have no match
        if (unmatchedPercentage > 50) {
            throw new Error(`Muitas colunas de custo sem correspondência na tabela de preços (${unmatchedPercentage.toFixed(1)}%). Por favor, verifique se a tabela de preços contém os itens necessários: ${unmatchedColumns.join(', ')}`);
        }
    }
    
    // Find ajustes item (for discrepancies)
    const ajustesItem = tabelaPrecos.find(p => 
        (p.descricao && (p.descricao.toLowerCase().includes('ajuste') || p.descricao.toLowerCase().includes('custos adicionais'))) && 
        (p.precoVenda === 1 || p.precoVenda === 0.01)
    ) || tabelaPrecos.find(p => p.descricao === 'Ajustes e Custos Adicionais' && (p.precoVenda === 1 || p.precoVenda === 0.01));
    
    if (!ajustesItem) {
        console.warn("Item de preço para 'Ajustes e Custos Adicionais' com preço de venda R$1,00 não encontrado. Discrepâncias de custos não serão faturadas.");
    }
    // --- END: Dynamic Cost Column Identification and Matching ---

    // Find order ID column in orderDetail
    const orderDetailOrderIdColumn = findColumnName(rawOrderDetail, [
        'Número do pedido',
        'Número do Pedido',
        'Numero do pedido',
        'Numero',
        'Order ID',
        'OrderId',
        'Pedido'
    ]) || 'Número do pedido'; // Fallback to expected name
    
    console.log('Coluna de Order ID usada no Order Detail:', orderDetailOrderIdColumn);
    
    // Use schema for order ID column (from detected layout)
    const trackReportOrderIdColumn = trackReportSchema?.orderIdColumn || null;
    
    if (effectiveHasTrackReport && !trackReportOrderIdColumn) {
        console.error('ERRO: Não foi possível encontrar coluna de número do pedido no Track Report. Colunas disponíveis:', rawTrackReport.length > 0 ? Object.keys(rawTrackReport[0]) : 'N/A');
        throw new Error("Coluna de número do pedido não encontrada no Track Report CSV. Verifique se o arquivo contém uma coluna com o número do pedido.");
    }
    if (trackReportOrderIdColumn) {
        console.log('Coluna de Order ID encontrada no Track Report:', trackReportOrderIdColumn, `(Layout: ${trackReportLayout})`);
    } else {
        console.warn('AVISO: Track Report não enviado ou inválido. Usando apenas Order Detail como fonte de pedidos.');
    }
    
    // Use schema for tracking column (may be null for LojaPrio format)
    const trackReportRastreioColumn = trackReportSchema?.trackingColumn || null;
    
    if (trackReportRastreioColumn) {
        console.log('Coluna de Rastreio encontrada no Track Report:', trackReportRastreioColumn);
    } else if (effectiveHasTrackReport && trackReportLayout === 'lojaprio') {
        console.log('📋 LojaPrio format detected: Using order number as tracking identifier (no separate tracking column)');
    }
    
    // Email column for enhanced matching (LojaPrio uses email-based matching)
    const trackReportEmailColumn = trackReportSchema?.emailColumn || null;
    if (trackReportEmailColumn) {
        console.log('Coluna de Email encontrada no Track Report:', trackReportEmailColumn, `(Layout: ${trackReportLayout})`);
    }
    
    // Find Total column in orderDetail
    const orderDetailTotalColumn = findColumnName(rawOrderDetail, [
        'Total',
        'total',
        'Valor Total',
        'Custo Total'
    ]) || 'Total'; // Fallback to expected name
    
    console.log('Coluna de Total encontrada no Order Detail:', orderDetailTotalColumn);
    
    // Find shipping cost column in orderDetail
    const orderDetailShippingColumn = findColumnName(rawOrderDetail, [
        'Custo de envio',
        'Custo de Envio',
        'Custo Envio',
        'Shipping Cost',
        'Frete'
    ]) || 'Custo de envio'; // Fallback to expected name
    
    console.log('Coluna de Custo de envio encontrada no Order Detail:', orderDetailShippingColumn);

    const orderIdToTotalCostMap = new Map<string, number>();
    const orderDetailMap = new Map<string, Record<string, string>>();
    // Email-based index for LojaPrio matching (email -> array of order rows)
    const orderDetailEmailMap = new Map<string, Record<string, string>[]>();
    
    // Find email column in order detail for email-based matching
    const orderDetailEmailColumn = findColumnName(rawOrderDetail, [
        'Email',
        'email',
        'E-mail',
        'e-mail',
        'Customer Email',
        'Email do cliente'
    ]);
    
    orderDetail.forEach((row, index) => {
        const orderId = row[orderDetailOrderIdColumn];
        if (orderId) {
            // Sanitize orderId before using as map key
            const sanitizedOrderId = sanitizeForFirestore(orderId);
            orderDetailMap.set(sanitizedOrderId, row);
            const totalCostStr = row[orderDetailTotalColumn] || row['Total'] || '0';
            const totalCost = parseFloat(totalCostStr.replace(',', '.')) || 0;
            if (totalCost > 0) {
                orderIdToTotalCostMap.set(sanitizedOrderId, totalCost);
            }
            
            // Also index by email for LojaPrio matching
            if (orderDetailEmailColumn) {
                const email = (row[orderDetailEmailColumn] || '').toLowerCase().trim();
                if (email) {
                    const existingOrders = orderDetailEmailMap.get(email) || [];
                    existingOrders.push(row);
                    orderDetailEmailMap.set(email, existingOrders);
                }
            }
            
            // Log first few orders for debugging
            if (index < 3) {
                console.log(`Order Detail exemplo ${index + 1}:`, {
                    orderId: sanitizedOrderId,
                    email: orderDetailEmailColumn ? (row[orderDetailEmailColumn] || 'N/A') : 'N/A',
                    totalColumn: orderDetailTotalColumn,
                    totalValue: totalCostStr,
                    totalParsed: totalCost,
                    shippingColumn: orderDetailShippingColumn,
                    shippingValue: row[orderDetailShippingColumn] || row['Custo de envio'] || 'N/A'
                });
            }
        }
    });
    
    console.log('Order Detail Map criado com', orderDetailMap.size, 'pedidos');
    console.log('Order ID to Total Cost Map criado com', orderIdToTotalCostMap.size, 'pedidos com custo > 0');
    if (orderDetailEmailColumn) {
        console.log('Order Detail Email Map criado com', orderDetailEmailMap.size, 'emails únicos (para matching LojaPrio)');
    }

    const matchedDetails: DetalheEnvio[] = [];
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    let ordersProcessed = 0;
    let ordersMatched = 0;
    let ordersNotMatched = 0;
    let ordersDigitalSkipped = 0;
    
    // Track processed orders to avoid duplicate DIFAL charges
    // Key: orderId, Value: true if DIFAL already charged for this order
    const ordersDifalProcessed = new Set<string>();
    // Track fully processed orders to avoid duplicate processing of non-shipping costs
    const ordersFullyProcessed = new Set<string>();

    console.log('Iniciando processamento de pedidos...');
    console.log('Total de pedidos no Track Report:', effectiveHasTrackReport ? trackReport.length : 0);
    console.log('Total de pedidos no Order Detail Map:', orderDetailMap.size);
    
    const trackRows = effectiveHasTrackReport ? trackReport : orderDetail;
    const trackOrderIdCol = effectiveHasTrackReport ? trackReportOrderIdColumn : orderDetailOrderIdColumn;
    const trackRastreioCol = effectiveHasTrackReport ? trackReportRastreioColumn : null;
    let warnedMissingState = false;
    let warnedMissingRastreio = false;

    // #region agent log - Count how many times each orderId appears in Track Report
    const orderIdCounts = new Map<string, number>();
    trackRows.forEach(row => {
        const rawId = trackOrderIdCol ? row[trackOrderIdCol] : undefined;
        if (rawId) {
            const sanitized = sanitizeForFirestore(rawId);
            orderIdCounts.set(sanitized, (orderIdCounts.get(sanitized) || 0) + 1);
        }
    });
    const duplicateOrderIds = Array.from(orderIdCounts.entries()).filter(([_, count]) => count > 1);
    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:trackRowsAnalysis',message:'Track Report orderId analysis',data:{totalRows:trackRows.length,uniqueOrderIds:orderIdCounts.size,duplicateCount:duplicateOrderIds.length,sampleDuplicates:duplicateOrderIds.slice(0,10).map(([id,c])=>({orderId:id,count:c}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4-DUP'})}).catch(()=>{});
    // #endregion

    if (effectiveHasTrackReport) {
        trackRows.slice(0, 3).forEach((row, index) => {
            console.log(`Track Report exemplo ${index + 1}:`, {
                orderIdColumn: trackOrderIdCol,
                orderId: trackOrderIdCol ? row[trackOrderIdCol] : 'N/A',
                rastreioColumn: trackRastreioCol,
                rastreio: trackRastreioCol ? (row[trackRastreioCol] || 'N/A') : 'N/A',
                dateColumn: trackReportDateColumn,
                date: trackReportDateColumn ? (row[trackReportDateColumn] || 'N/A') : 'N/A'
            });
        });
    }

    trackRows.forEach((trackRow, index) => {
        const rawOrderId = trackOrderIdCol ? trackRow[trackOrderIdCol] : undefined;
        if (!rawOrderId) {
            ordersNotMatched++;
            if (index < 3) {
                console.warn(`Linha ${index + 1}: Order ID vazio ou não encontrado na coluna "${trackOrderIdCol || 'N/D'}"`);
            }
            return;
        }
        ordersProcessed++;
        
        // Sanitize orderId before matching
        const orderId = sanitizeForFirestore(rawOrderId);
        
        // Primary matching: by order ID
        let orderDetailRow = orderDetailMap.get(orderId);
        let matchMethod = 'orderId';
        
        // Fallback matching for LojaPrio: try email-based matching with month priority
        if (!orderDetailRow && trackReportLayout === 'lojaprio' && trackReportEmailColumn) {
            const trackEmail = (trackRow[trackReportEmailColumn] || '').toLowerCase().trim();
            if (trackEmail) {
                const emailOrders = orderDetailEmailMap.get(trackEmail);
                if (emailOrders && emailOrders.length > 0) {
                    // Get the track row date for month-based matching
                    const trackDateStr = trackReportDateColumn ? trackRow[trackReportDateColumn] : null;
                    let trackDate: Date | null = null;
                    if (trackDateStr) {
                        const datePart = trackDateStr.split(' ')[0];
                        trackDate = new Date(datePart);
                    }
                    
                    // Find best match by date (same month preferred)
                    if (trackDate && !isNaN(trackDate.getTime())) {
                        const trackMonth = trackDate.getMonth();
                        const trackYear = trackDate.getFullYear();
                        
                        // Find order with matching month
                        const matchingOrder = emailOrders.find(order => {
                            const orderDateStr = order[orderDetailDateColumn] || order['Data do pedido'];
                            if (!orderDateStr) return false;
                            const orderDate = new Date(orderDateStr);
                            return orderDate.getMonth() === trackMonth && orderDate.getFullYear() === trackYear;
                        });
                        
                        if (matchingOrder) {
                            orderDetailRow = matchingOrder;
                            matchMethod = 'email+month';
                        } else if (emailOrders.length === 1) {
                            // If only one order for this email, use it regardless of month
                            orderDetailRow = emailOrders[0];
                            matchMethod = 'email-only';
                        }
                    } else {
                        // No valid track date, use first order for email
                        orderDetailRow = emailOrders[0];
                        matchMethod = 'email-fallback';
                    }
                    
                    if (orderDetailRow && index < 5) {
                        console.log(`📧 LojaPrio email match: ${trackEmail} → Order via ${matchMethod}`);
                    }
                }
            }
        }
        
        if (index < 3) {
            console.log(`Processando linha ${index + 1}:`, {
                rawOrderId,
                sanitizedOrderId: orderId,
                email: trackReportEmailColumn ? (trackRow[trackReportEmailColumn] || 'N/A') : 'N/A',
                foundInOrderDetail: !!orderDetailRow,
                matchMethod: orderDetailRow ? matchMethod : 'none',
                source: effectiveHasTrackReport ? 'Track Report' : 'Order Detail'
            });
        }

        if (orderDetailRow) {
            // Skip digital/voucher orders (no logistics cost)
            if (isDigitalVoucherOrder(orderDetailRow)) {
                ordersDigitalSkipped++;
                if (ordersDigitalSkipped <= 5) {
                    console.log(`🎫 Pedido ${orderId} ignorado: produto digital/voucher detectado`);
                }
                return; // Skip this order entirely
            }
            
            // #region agent log
            const wasAlreadyProcessed = ordersFullyProcessed.has(orderId);
            if (index < 10) {
                fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:orderProcessing',message:'Processing order',data:{orderId,index,wasAlreadyProcessed,totalProcessedSoFar:ordersFullyProcessed.size},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
            }
            // #endregion
            
            // Check if order was already fully processed (avoid duplicate charges)
            if (ordersFullyProcessed.has(orderId)) {
                if (index < 10) {
                    console.log(`⏭️ Pedido ${orderId} já foi processado, ignorando duplicação`);
                }
                return; // Skip duplicate order
            }
            
            ordersFullyProcessed.add(orderId);
            ordersMatched++;
            const orderDateStr = orderDetailRow[orderDetailDateColumn] || orderDetailRow['Data do pedido'];
            const orderDate = orderDateStr ? new Date(orderDateStr) : new Date();
             if (!isNaN(orderDate.getTime())) {
                if (!minDate || orderDate < minDate) minDate = orderDate;
                if (!maxDate || orderDate > maxDate) maxDate = orderDate;
            }
            const dateStr = orderDate.toISOString().split('T')[0];
            const currentOrderDetails: DetalheEnvio[] = [];

            // Extract CEP, Estado, and Quantidade de itens from columns M, O, and E
            const cep = columnM ? (orderDetailRow[columnM] || '').trim() : undefined;
            const estado = columnO ? (orderDetailRow[columnO] || '').trim().toUpperCase() : undefined;
            const quantidadeItensStr = columnE ? (orderDetailRow[columnE] || '0').trim() : '0';
            const quantidadeItens = parseFloat(quantidadeItensStr.replace(',', '.')) || 0;
            const columnTValueStr = columnT ? (orderDetailRow[columnT] || '0').trim() : '0';
            const columnTValue = parseFloat(columnTValueStr.replace(',', '.')) || 0;
            
            if (!estado && !warnedMissingState) {
                console.warn('AVISO: Estado/UF ausente em pedidos; relatórios por estado podem ficar incompletos.');
                warnedMissingState = true;
            }
            // For LojaPrio format, use order number as tracking identifier
            const rastreioValue = trackRastreioCol 
                ? (trackRow[trackRastreioCol] || '') 
                : (trackReportLayout === 'lojaprio' ? orderId : '');
            const hasRastreioValue = !!rastreioValue;
            if (!hasRastreioValue && !warnedMissingRastreio && trackReportLayout !== 'lojaprio') {
                console.warn('AVISO: Rastreio ausente; campo será deixado vazio para os pedidos sem rastreio.');
                warnedMissingRastreio = true;
            }
            
            if (index < 3 && columnT) {
                console.log(`📊 Coluna T (Custo do picking) extraída: R$ ${columnTValue.toFixed(2)}, Quantidade de itens (coluna E): ${quantidadeItens}`);
            }

            // --- Process Column AD (Total Shipping Cost) ---
            if (columnAD && shippingItemForAD) {
                const shippingCostStr = orderDetailRow[columnAD] || '0';
                const shippingCost = parseFloat(shippingCostStr.replace(',', '.')) || 0;
                
                if (shippingCost > 0) {
                    // For shipping: quantity = 1, price = value from CSV (stored in quantidade)
                    const quantidade = shippingCost; // Store CSV value here, will be used as price in calculation
                    
            currentOrderDetails.push({
                id: `draft_${orderId}_envio_ad`,
                cobrancaId: '',
                data: dateStr,
                rastreio: sanitizeForFirestore(rastreioValue || orderId || ''),
                codigoPedido: orderId,
                tabelaPrecoItemId: shippingItemForAD.id,
                quantidade: quantidade,
                cep: cep,
                estado: estado
            });
                    
                    if (index < 3) {
                        console.log(`🚚 Custo de ENVIO (coluna AD) processado:`, {
                            orderId: orderId,
                            coluna: columnAD,
                            valorCSV: shippingCost,
                            item: shippingItemForAD.descricao,
                            cep: cep,
                            estado: estado
                        });
                    }
                }
            }

            // --- Process Other Cost Columns (DIFAL, Logística, etc.) ---
            // Process all other cost columns dynamically (excluding shipping)
            // Track processed cost types per order to avoid duplicates
            const processedCostTypes = new Set<string>();
            
            otherCostColumns.forEach(csvColumn => {
                const costValueStr = orderDetailRow[csvColumn] || '0';
                const costValue = parseFloat(costValueStr.replace(',', '.')) || 0;
                
                if (costValue > 0) {
                    const matchedItem = costColumnToItemMap.get(csvColumn);
                    
                    // #region agent log
                    if (index < 5) {
                        fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:otherCostColumns',message:'Processing cost column',data:{orderId,csvColumn,costValue,matchedItemId:matchedItem?.id,matchedItemDesc:matchedItem?.descricao,matchedItemCat:matchedItem?.categoria,alreadyProcessed:processedCostTypes.has(matchedItem?.id || '')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H3'})}).catch(()=>{});
                    }
                    // #endregion
                    
                    if (matchedItem) {
                        const isTemplate = isTemplateItem(matchedItem);
                        
                        // Determine quantity and price based on item type
                        // For non-shipping costs (DIFAL, Logística, etc.): use price from price table, quantity = 1 per order
                        // Examples: Difal, Seguro, etc. are costs per order/shipment
                        // The CSV value represents the total cost for that order, but we use the price table value
                        
                        // Check if this is a specific cost (Difal, Seguro, etc.)
                        const isSpecificCost = csvColumn.toLowerCase().includes('difal') || 
                                               csvColumn.toLowerCase().includes('seguro') || 
                                               csvColumn.toLowerCase().includes('ajuste');
                        
                        let quantidade: number;
                        let precoUsado: number;
                        // Create a variable to hold the final item to use (can be reassigned for picking/packing)
                        let itemToUse: TabelaPrecoItem | undefined = undefined;
                        
                        // Initialize itemToUse with matchedItem (will be overridden for picking/packing if needed)
                        itemToUse = matchedItem;
                        
                        // For specific costs (Difal, Seguro, Ajustes) or templates:
                        // Use quantidade = 1 per order, and preço = custo CSV × (1 + margem/100)
                        // This makes the display clearer (1 DIFAL per order at calculated price)
                        const isDifal = csvColumn.toLowerCase().includes('difal');
                        
                        // Skip DIFAL if already charged for this order (avoid duplicate charges)
                        // #region agent log - Log DIFAL check for specific problem orders
                        const targetOrders = ['R358777238', 'R695760258', 'R929648532', 'R193508918'];
                        if (isDifal && targetOrders.some(t => orderId.includes(t))) {
                            fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:DIFAL_CHECK',message:'DIFAL check for target order',data:{orderId,csvColumn,costValue,isInSet:ordersDifalProcessed.has(orderId),setSize:ordersDifalProcessed.size,setContents:[...ordersDifalProcessed].slice(0,20),trackRowIndex:index},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H-TARGET'})}).catch(()=>{});
                        }
                        // #endregion
                        
                        if (isDifal && ordersDifalProcessed.has(orderId)) {
                            if (index < 50) {
                                console.log(`⏭️ DIFAL já cobrado para pedido ${orderId}, ignorando duplicação`);
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:DIFAL_SKIP',message:'DIFAL skipped - already processed',data:{orderId,csvColumn,setSize:ordersDifalProcessed.size},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DIFAL-DUP'})}).catch(()=>{});
                                // #endregion
                            }
                            return; // Skip this cost column for this order
                        }
                        
                        // #region agent log
                        if (isDifal) {
                            fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:DIFAL_NEW',message:'DIFAL first charge for order',data:{orderId,csvColumn,costValue,setSize:ordersDifalProcessed.size,trackRowIndex:index},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DIFAL-NEW'})}).catch(()=>{});
                        }
                        // #endregion
                        
                        if (isSpecificCost || isTemplate) {
                            // DIFAL: Use price from price table, minimum R$3.00, quantity = 1
                            const DIFAL_MIN_PRICE = 3.00;
                            
                            if (isDifal) {
                                // Mark DIFAL as processed for this order
                                ordersDifalProcessed.add(orderId);
                                
                                // Get DIFAL price from the price table (precoVenda)
                                // This reads the configured price from client's price table
                                let difalPrice = matchedItem.precoVenda;
                                
                                // If precoVenda is 0.01 or 1 (template marker), calculate from cost
                                if (difalPrice <= 1) {
                                    const margin = matchedItem.margemLucro || 0;
                                    difalPrice = costValue * (1 + margin / 100);
                                }
                                
                                // Apply minimum price
                                if (difalPrice < DIFAL_MIN_PRICE) {
                                    if (index < 5) {
                                        console.log(`💰 DIFAL: Preço R$ ${difalPrice.toFixed(2)} < mínimo R$ ${DIFAL_MIN_PRICE.toFixed(2)}, aplicando mínimo`);
                                    }
                                    difalPrice = DIFAL_MIN_PRICE;
                                }
                                
                                // DIFAL: quantity = 1 per order, price = from table (min R$3.00)
                                        quantidade = 1;
                                precoUsado = difalPrice;
                                
                                // #region agent log
                                if (index < 10) {
                                    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:DIFAL',message:'DIFAL calculation fixed',data:{orderId,costValueCSV:costValue,precoTabela:matchedItem.precoVenda,precoFinal:precoUsado,quantidade,margem:matchedItem.margemLucro},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DIFAL-FIX'})}).catch(()=>{});
                                }
                                // #endregion
                                
                                if (index < 5) {
                                    console.log(`💰 DIFAL processado: Pedido ${orderId} - Preço da Tabela: R$ ${matchedItem.precoVenda.toFixed(2)}, Preço Final: R$ ${precoUsado.toFixed(2)} (mín: R$ ${DIFAL_MIN_PRICE.toFixed(2)}), Qtd: ${quantidade}`);
                                        }
                                    } else {
                                // For non-DIFAL specific costs: use margin from price table, quantity = 1
                                        quantidade = 1;
                                const margin = matchedItem.margemLucro || 0;
                                precoUsado = costValue * (1 + margin / 100);
                                        
                                if (index < 5) {
                                    console.log(`💰 Custo específico processado: "${csvColumn}" - Custo CSV: R$ ${costValue.toFixed(2)}, Margem: ${margin}%, Preço Final: R$ ${precoUsado.toFixed(2)}`);
                                        }
                                    }
                                } else {
                            // For non-template items: check if it's picking/packing
                            const isPickingPacking = isPickingPackingItem(matchedItem);
                            
                            // NEW PICKING LOGIC:
                            // - Up to 2 items: use pickingItem01 price (R$ 7,65 from table)
                            // - 3+ items: base price + R$ 1,33 per additional item (from 3rd item onwards)
                            
                            if (isPickingPacking && columnE) {
                                // Get base price for picking (up to 2 items)
                                const precoBase = pickingItem01 
                                    ? calculatePrecoVendaForDisplay(pickingItem01) 
                                    : calculatePrecoVenda(matchedItem);
                                
                                if (quantidadeItens <= 2) {
                                    // Up to 2 items: use base picking price (R$ 7,65)
                                        quantidade = 1;
                                    precoUsado = precoBase;
                                    if (pickingItem01) itemToUse = pickingItem01;
                                        
                                    // #region agent log
                                    if (index < 10) {
                                        fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:PICKING',message:'Picking up to 2 items',data:{orderId,quantidadeItens,precoBase,quantidade,precoUsado},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'PICKING-FIX'})}).catch(()=>{});
                                        }
                                    // #endregion
                                        
                                        if (index < 3) {
                                        console.log(`📦 Picking (até 2 itens): ${quantidadeItens} item(ns) - Preço base: R$ ${precoUsado.toFixed(2)}`);
                                    }
                                } else {
                                    // 3+ items: base price + additional cost per item from 3rd onwards
                                    const itensAdicionais = quantidadeItens - 2; // Items beyond 2
                                    
                                    let custoAdicionalTotal = 0;
                                    if (additionalItemCostItem && itensAdicionais > 0) {
                                        const precoItemAdicional = calculatePrecoVendaForDisplay(additionalItemCostItem);
                                        custoAdicionalTotal = itensAdicionais * precoItemAdicional;
                                        
                                        if (index < 3) {
                                            console.log(`➕ Picking adicional: ${itensAdicionais} item(ns) × R$ ${precoItemAdicional.toFixed(2)} = R$ ${custoAdicionalTotal.toFixed(2)}`);
                                        }
                                        
                                        // Create additional item detail for the extra items
                                        currentOrderDetails.push({
                                            id: `draft_${orderId}_item_adicional_${csvColumn.replace(/\s+/g, '_')}`,
                                            cobrancaId: '',
                                            data: dateStr,
                                            rastreio: sanitizeForFirestore(rastreioValue || orderId || ''),
                                            codigoPedido: orderId,
                                            tabelaPrecoItemId: additionalItemCostItem.id,
                                            quantidade: itensAdicionais,
                                            cep: cep,
                                            estado: estado
                                        });
                                    }
                                    
                                    // Final picking price = base (R$ 7,65) + additional
                                    const precoFinalPicking = precoBase + custoAdicionalTotal;
                                    quantidade = 1;
                                    precoUsado = precoFinalPicking;
                                    if (pickingItem01) itemToUse = pickingItem01;
                                    
                                    // #region agent log
                                    if (index < 10) {
                                        fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:PICKING',message:'Picking 3+ items',data:{orderId,quantidadeItens,itensAdicionais,precoBase,custoAdicionalTotal,precoFinalPicking,quantidade},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'PICKING-FIX'})}).catch(()=>{});
                                    }
                                    // #endregion
                                    
                                    if (index < 3) {
                                        console.log(`📦 Picking (${quantidadeItens} itens): Base R$ ${precoBase.toFixed(2)} + Adicional R$ ${custoAdicionalTotal.toFixed(2)} = R$ ${precoFinalPicking.toFixed(2)}`);
                                    }
                                }
                            } else if (isPickingPacking && !columnE) {
                                // Fallback: no item quantity column found
                                quantidade = 1;
                                precoUsado = pickingItem01 
                                    ? calculatePrecoVendaForDisplay(pickingItem01) 
                                    : calculatePrecoVenda(matchedItem);
                                if (pickingItem01) itemToUse = pickingItem01;
                                    
                                if (index < 3) {
                                    console.warn(`⚠️ Picking sem coluna de quantidade - Usando preço base: R$ ${precoUsado.toFixed(2)}`);
                                }
                            } else {
                                // For other non-template items: quantity = 1 (one order/shipment), price = from price table
                                const precoCalculado = calculatePrecoVenda(matchedItem);
                                quantidade = 1;
                                precoUsado = precoCalculado;
                                
                                // Log for debugging if CSV value differs significantly from price table
                                if (Math.abs(costValue - precoCalculado) > 0.01) {
                                    console.log(`ℹ️ Custo não-envio processado: "${csvColumn}" - Valor CSV: R$ ${costValue.toFixed(2)}, Preço Tabela: R$ ${precoCalculado.toFixed(2)}, Qtd: ${quantidade}`);
                                }
                            }
                        }
                        
                        // Determine category for routing: DIFAL goes to DIFAL, others to Logística
                        // (isDifal already defined earlier in this block)
                        // Use itemToUse if it was set (for picking/packing), otherwise use matchedItem
                        const baseItem = itemToUse !== undefined ? itemToUse : matchedItem;
                        const targetCategory = isDifal ? 'Difal' : baseItem.categoria;
                        
                        // If item category doesn't match target, try to find item in target category
                        let finalItem = baseItem;
                        if (isDifal && baseItem.categoria !== 'Difal') {
                            const difalItem = tabelaPrecos.find(item => 
                                item.categoria === 'Difal' && 
                                (item.descricao?.toLowerCase().includes('difal') || 
                                 item.descricao?.toLowerCase().includes('icms'))
                            );
                            if (difalItem) {
                                finalItem = difalItem;
                                console.log(`🔄 Item DIFAL encontrado: "${difalItem.descricao}" para coluna "${csvColumn}"`);
                            }
                        } else if (!isDifal && baseItem.categoria !== 'Difal' && 
                                   baseItem.categoria !== 'Armazenamento' && 
                                   baseItem.categoria !== 'Envios' && 
                                   baseItem.categoria !== 'Retornos') {
                            // Route other costs to Logística if not already in a specific category
                            const logisticaItem = tabelaPrecos.find(item => 
                                item.categoria === 'Maquila/Entrada de material externo' || 
                                item.categoria.toLowerCase().includes('logística') ||
                                item.categoria.toLowerCase().includes('logistica')
                            );
                            if (logisticaItem && baseItem.categoria !== logisticaItem.categoria) {
                                finalItem = logisticaItem;
                                console.log(`🔄 Item de Logística encontrado: "${logisticaItem.descricao}" para coluna "${csvColumn}"`);
                            }
                        }
                        
                        // Check if this cost type was already added for this order (avoid duplicates)
                        const costTypeKey = `${finalItem.id}_${finalItem.categoria}`;
                        const isDuplicateCostType = processedCostTypes.has(costTypeKey);
                        
                        // #region agent log
                        if (index < 5) {
                            fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:pushCostDetail',message:'Pushing cost detail',data:{orderId,csvColumn,costTypeKey,isDuplicateCostType,finalItemId:finalItem.id,finalItemDesc:finalItem.descricao,finalItemCat:finalItem.categoria,quantidade,precoUsado},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2-H3'})}).catch(()=>{});
                        }
                        // #endregion
                        
                        // Skip if this exact cost type was already processed for this order
                        if (isDuplicateCostType && !isDifal) {
                            if (index < 5) {
                                console.log(`⏭️ Custo duplicado ignorado para pedido ${orderId}: ${finalItem.descricao} (coluna: ${csvColumn})`);
                            }
                            return; // Skip duplicate
                        }
                        
                        processedCostTypes.add(costTypeKey);
                        
                        currentOrderDetails.push({ 
                            id: `draft_${orderId}_${finalItem.id}_${csvColumn.replace(/\s+/g, '_')}`, 
                            cobrancaId: '', 
                            data: dateStr, 
                            rastreio: sanitizeForFirestore(rastreioValue || orderId || ''), 
                            codigoPedido: orderId, 
                            tabelaPrecoItemId: finalItem.id, 
                            quantidade: quantidade,
                            cep: cep,
                            estado: estado
                        });
                        
                        if (index < 3) {
                            console.log(`    Custo processado: "${csvColumn}" = R$ ${costValue} → Item: ${finalItem.descricao} (${finalItem.categoria})`);
                        }
                    } else {
                        // Column has value but no match - log warning
                        if (index < 3) {
                            console.warn(`    AVISO: Coluna "${csvColumn}" tem valor R$ ${costValue} mas não teve match na tabela de preços`);
                        }
                    }
                }
            });
            
            const subtotalCalculado = currentOrderDetails.reduce((sum, detalhe) => {
                const item = tabelaPrecos.find(p => p.id === detalhe.tabelaPrecoItemId);
                if (item) {
                    // Special handling for non-template shipping items and DIFAL
                    const isShippingItem = item.categoria === 'Envios' || item.categoria === 'Retornos';
                    const isDifalItem = item.categoria === 'Difal' || item.descricao?.toLowerCase().includes('difal');
                    const isTemplate = isTemplateItem(item);
                    const isNonTemplateShipping = isShippingItem && !isTemplate;
                    
                    let precoVendaCalculado: number;
                    let quantidadeUsada: number;
                    
                    if (isNonTemplateShipping || isDifalItem) {
                        // For non-template shipping and DIFAL: quantity = 1, price = value stored in quantidade
                        quantidadeUsada = 1;
                        precoVendaCalculado = detalhe.quantidade; // Use stored calculated value as price
                        if (index < 3) {
                            const tipoItem = isDifalItem ? 'DIFAL' : 'ENVIO (não-template)';
                            console.log(`    Detalhe ${tipoItem}: ${item.descricao} - Qtd: ${quantidadeUsada}, Preço: R$ ${precoVendaCalculado.toFixed(2)}, Total: R$ ${(precoVendaCalculado * quantidadeUsada).toFixed(2)}`);
                        }
                    } else {
                        // For template items or other costs: use display calculation (handles templates of specific costs correctly)
                        precoVendaCalculado = calculatePrecoVendaForDisplay(item);
                        quantidadeUsada = detalhe.quantidade;
                        if (index < 3) {
                            console.log(`    Detalhe: ${item.descricao} - Preço: R$ ${precoVendaCalculado.toFixed(2)}, Qtd: ${quantidadeUsada}, Total: R$ ${(precoVendaCalculado * quantidadeUsada).toFixed(2)}`);
                        }
                    }
                    
                    const detalheTotal = precoVendaCalculado * quantidadeUsada;
                    return sum + detalheTotal;
                } else {
                    if (index < 3) {
                        console.warn(`    AVISO: Item de tabela de preços não encontrado para ID: ${detalhe.tabelaPrecoItemId}`);
                    }
                }
                return sum;
            }, 0);

            const totalReal = orderIdToTotalCostMap.get(orderId) || 0;
            const discrepancy = totalReal - subtotalCalculado;
            
            if (index < 3) {
                console.log(`  Pedido ${orderId} - Resumo:`, {
                    detalhesCriados: currentOrderDetails.length,
                    subtotalCalculado: subtotalCalculado.toFixed(2),
                    totalReal: totalReal.toFixed(2),
                    discrepancy: discrepancy.toFixed(2),
                    adicionarAjuste: discrepancy > 0.10 && !!ajustesItem
                });
            }

            // Discrepancy threshold: R$0.10 (prevents micro-discrepancies from accumulating)
            const DISCREPANCY_THRESHOLD = 0.10;
            if (discrepancy > DISCREPANCY_THRESHOLD && ajustesItem) {
                currentOrderDetails.push({
                    id: `draft_${orderId}_ajuste`,
                    cobrancaId: '', data: dateStr,
                    rastreio: sanitizeForFirestore(rastreioValue || orderId || ''),
                    codigoPedido: orderId,
                    tabelaPrecoItemId: ajustesItem.id,
                    quantidade: discrepancy
                });
                
                if (index < 5) {
                    console.log(`💰 Ajuste adicionado para pedido ${orderId}: R$ ${discrepancy.toFixed(2)} (diferença entre valor real R$ ${totalReal.toFixed(2)} e calculado R$ ${subtotalCalculado.toFixed(2)})`);
                }
            } else if (discrepancy > 0 && discrepancy <= DISCREPANCY_THRESHOLD) {
                // Log small discrepancies that are being ignored
                if (index < 3) {
                    console.log(`ℹ️ Pequena discrepância ignorada para pedido ${orderId}: R$ ${discrepancy.toFixed(4)} (abaixo do threshold de R$ ${DISCREPANCY_THRESHOLD.toFixed(2)})`);
                }
            }
            
            // --- Ensure DIFAL is charged for ALL shipments ---
            // If DIFAL wasn't already added for this order (from CSV), add it with minimum price
            if (!ordersDifalProcessed.has(orderId)) {
                // Find DIFAL item in price table
                const difalItem = tabelaPrecos.find(item => 
                    item.categoria === 'Difal' || 
                    item.descricao?.toLowerCase().includes('difal') ||
                    item.descricao?.toLowerCase().includes('icms')
                );
                
                if (difalItem) {
                    const DIFAL_MIN_PRICE = 3.00;
                    ordersDifalProcessed.add(orderId); // Mark as processed
                    
                    currentOrderDetails.push({
                        id: `draft_${orderId}_difal_auto`,
                        cobrancaId: '',
                        data: dateStr,
                        rastreio: sanitizeForFirestore(rastreioValue || orderId || ''),
                        codigoPedido: orderId,
                        tabelaPrecoItemId: difalItem.id,
                        quantidade: 1, // FIXED: Use 1 as quantity, price comes from price table (min R$3.00)
                        cep: cep,
                        estado: estado
                    });
                    
                    if (index < 5) {
                        console.log(`📌 DIFAL automático adicionado para pedido ${orderId}: R$ ${DIFAL_MIN_PRICE.toFixed(2)} (não estava no CSV, usando mínimo)`);
                    }
                } else {
                    if (index < 3) {
                        console.warn(`⚠️ Item DIFAL não encontrado na tabela de preços para pedido ${orderId}`);
                    }
                }
            }

            matchedDetails.push(...currentOrderDetails);
        } else {
            ordersNotMatched++;
            console.warn(`Pedido ${orderId} do Track Report não foi encontrado no Order Detail`);
        }
    });

    console.log('Processamento de pedidos concluído:');
    console.log('- Pedidos processados:', ordersProcessed);
    console.log('- Pedidos com match:', ordersMatched);
    console.log('- Pedidos sem match:', ordersNotMatched);
    console.log('- Pedidos digitais ignorados:', ordersDigitalSkipped);
    console.log('- Total de detalhes criados:', matchedDetails.length);

    // --- START: Process Storage and Manual Costs ---
    const storageItems = tabelaPrecos.filter(p => {
        const cat = p.categoria.toLowerCase();
        return cat.includes('armazenamento') || cat.includes('armazenagem');
    });
    const maquilaItems = tabelaPrecos.filter(p => {
        const cat = p.categoria.toLowerCase();
        return cat.includes('maquila') || cat.includes('entrada de material');
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:processarFatura',message:'Iniciando Armazenagem Fixa',data:{clienteId:cliente.id,unidadesEmEstoque:cliente.unidadesEmEstoque,posicoesLongarina:cliente.posicoesLongarina,storageItemsCount:storageItems.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'S1'})}).catch(()=>{});
    // #endregion

    // Helper to find storage item by flexible name
    const findStorageItem = (keywords: string[]) => {
        const matches = storageItems.filter(i => {
            const desc = i.descricao?.toLowerCase() || '';
            return keywords.every(kw => desc.includes(kw.toLowerCase()));
        });

        if (matches.length === 0) return null;

        // Prioritize exact match if possible, otherwise shortest description (most generic)
        const sorted = matches.sort((a, b) => {
            const descA = a.descricao?.toLowerCase() || '';
            const descB = b.descricao?.toLowerCase() || '';
            const exactA = keywords.some(kw => descA === kw.toLowerCase());
            const exactB = keywords.some(kw => descB === kw.toLowerCase());
            
            if (exactA && !exactB) return -1;
            if (!exactA && exactB) return 1;
            return descA.length - descB.length;
        });

        const bestMatch = sorted[0];
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:processarFatura',message:'Melhor match encontrado',data:{keywords,desc:bestMatch.descricao,itemId:bestMatch.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'S2'})}).catch(()=>{});
        // #endregion
        
        return bestMatch;
    };

    // 1. Storage by Unit (Automatic based on unidadesEmEstoque)
    const storageByUnitItem = findStorageItem(['unidade']) || findStorageItem(['peça']) || findStorageItem(['sku']);
    if (cliente.unidadesEmEstoque > 0 && storageByUnitItem) {
        matchedDetails.push({
            id: `draft_storage_unit_${cliente.id}`, cobrancaId: '', data: storageStartDate,
            rastreio: 'ARMAZENAGEM', codigoPedido: 'ARMAZENAGEM (Unidades)',
            tabelaPrecoItemId: storageByUnitItem.id, quantidade: cliente.unidadesEmEstoque
        });
    } else if (cliente.unidadesEmEstoque > 0) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:processarFatura',message:'Item Unidade não encontrado',data:{unidades:cliente.unidadesEmEstoque},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'S3'})}).catch(()=>{});
        // #endregion
    }

    // 2. Storage items mapping (Dynamic from client record)
    const storageMapping = [
        { field: 'posicoesLongarina', keywords: ['longarina'], label: 'Longarina' },
        { field: 'posicoesPrateleira', keywords: ['prateleira'], label: 'Prateleira' },
        { field: 'posicoesPrateleiraM', keywords: ['prateleira m'], label: 'Prateleira M' },
        { field: 'posicoesPrateleiraP', keywords: ['prateleira p'], label: 'Prateleira P' },
        { field: 'posicoesPallet', keywords: ['pallet'], label: 'Pallet' },
        { field: 'posicoesCesto', keywords: ['cesto'], label: 'Cesto' },
        { field: 'posicoesCaixaBin', keywords: ['caixa bin'], label: 'Caixa Bin' },
        { field: 'posicoesMiniCaixote', keywords: ['mini caixote'], label: 'Mini Caixote' },
        { field: 'posicoesDamaged', keywords: ['damaged'], label: 'Damaged' },
        { field: 'posicoesPickingStandard', keywords: ['picking standard'], label: 'Picking Standard' },
        { field: 'posicoesPortaPallet', keywords: ['porta pallet'], label: 'Porta Pallet' }
    ];

    storageMapping.forEach(mapping => {
        const value = (cliente as any)[mapping.field];
        if (value && value > 0) {
            const item = findStorageItem(mapping.keywords);
            if (item) {
                matchedDetails.push({
                    id: `draft_storage_${mapping.field}_${cliente.id}`, cobrancaId: '', data: storageStartDate,
                    rastreio: 'ARMAZENAGEM', codigoPedido: `ARMAZENAGEM (${mapping.label})`,
                    tabelaPrecoItemId: item.id, quantidade: value
                });
            } else {
                console.warn(`⚠️ Item de preço para "${mapping.label}" não encontrado na categoria Armazenamento.`);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:processarFatura',message:'Mapping: Item não encontrado',data:{mapping,value},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'S4'})}).catch(()=>{});
                // #endregion
            }
        }
    });

    // 4. External Material Entry (Manual from Client Config)
    const materialEntryItem = [...maquilaItems, ...storageItems].find(i => 
        i.descricao?.toLowerCase().includes('entrada') && 
        i.descricao?.toLowerCase().includes('material')
    );
    if (cliente.skusEntradaMaterial && cliente.skusEntradaMaterial > 0 && materialEntryItem) {
        matchedDetails.push({
            id: `draft_entry_material_${cliente.id}`, cobrancaId: '', data: storageStartDate,
            rastreio: 'LOGÍSTICA', codigoPedido: 'ENTRADA DE MATERIAL',
            tabelaPrecoItemId: materialEntryItem.id, quantidade: cliente.skusEntradaMaterial
        });
    }
    // --- END: Process Storage and Manual Costs ---
    
    let totalEnvio = 0, totalArmazenagem = 0, totalCustosLogisticos = 0, custoTotal = 0;
    let totalDifal = 0, quantidadeDifal = 0;
    let quantidadeEnvios = 0; // Count of shipments charged
    let itemsFound = 0;
    let itemsNotFound = 0;
    const warnings: string[] = [];
    
    matchedDetails.forEach((d, index) => {
        if (!d.tabelaPrecoItemId) {
            itemsNotFound++;
            return;
        }
        
        const item = tabelaPrecos.find(c => c.id === d.tabelaPrecoItemId);
        if (item) {
            itemsFound++;
            
            const isTemplate = isTemplateItem(item);
            const isDifal = item.descricao?.toLowerCase().includes('difal') || item.categoria === 'Difal';
            const isVariableCost = isTemplate || item.categoria === 'Envios' || item.categoria === 'Retornos' || isDifal;
            
            let precoVendaCalculado: number;
            let quantidadeUsada: number;
            
            if (isVariableCost) {
                quantidadeUsada = 1;
                precoVendaCalculado = calculatePrecoVenda(item, d.quantidade);
            } else {
                precoVendaCalculado = calculatePrecoVendaForDisplay(item);
                quantidadeUsada = d.quantidade;
            }
            
            const subtotalVenda = precoVendaCalculado * quantidadeUsada;
            const isPassThrough = isTemplateItem(item);
            const subtotalCusto = isPassThrough ? d.quantidade : (isVariableCost ? d.quantidade : item.custoUnitario * d.quantidade);
            custoTotal += subtotalCusto;

            // Separar DIFAL dos outros custos
            if (isDifal) {
                totalDifal += subtotalVenda;
                quantidadeDifal++;
            } else {
            const group = getCostCategoryGroup(item.categoria);
            if (group === 'armazenagem') {
                totalArmazenagem += subtotalVenda;
            } else if (group === 'envio') {
                totalEnvio += subtotalVenda;
                quantidadeEnvios++; // Count shipments
            } else {
                totalCustosLogisticos += subtotalVenda;
                }
            }
        } else {
            itemsNotFound++;
            if (itemsNotFound <= 5) {
                warnings.push(`Item não encontrado na tabela: ${d.tabelaPrecoItemId} (pedido: ${d.codigoPedido})`);
            }
        }
    });
    
    // Add DIFAL to totalCustosLogisticos for the cobranca total
    totalCustosLogisticos += totalDifal;

    const cobranca: CobrancaMensal = {
        id: `draft_${Date.now()}`,
        clienteId: clientId, mesReferencia: month,
        dataVencimento: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'Pendente',
        confirmadaPeloCliente: false,
        totalEnvio, quantidadeEnvios, totalArmazenagem, totalCustosLogisticos, custoTotal,
        totalCustosExtras: 0,
        totalCustosAdicionais: 0,
        valorTotal: totalArmazenagem + totalEnvio + totalCustosLogisticos,
        urlPlanilhaConferencia: '',
    };
    
    const detectedDateRange = (minDate && maxDate) 
        ? `${minDate.toLocaleDateString('pt-BR')} - ${maxDate.toLocaleDateString('pt-BR')}`
        : "N/A";

    // #region agent log - Final DIFAL count analysis
    const difalDetails = matchedDetails.filter(d => {
        const item = tabelaPrecos.find(p => p.id === d.tabelaPrecoItemId);
        return item?.descricao?.toLowerCase().includes('difal');
    });
    const difalByOrder = new Map<string, number>();
    difalDetails.forEach(d => {
        // Use codigoPedido, not orderId (orderId doesn't exist in DetalheEnvio)
        difalByOrder.set(d.codigoPedido, (difalByOrder.get(d.codigoPedido) || 0) + 1);
    });
    const ordersWithMultipleDifal = Array.from(difalByOrder.entries()).filter(([_, count]) => count > 1);
    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:FINAL',message:'Final DIFAL analysis',data:{totalDetails:matchedDetails.length,totalDifalDetails:difalDetails.length,uniqueOrdersWithDifal:difalByOrder.size,ordersWithMultipleDifal:ordersWithMultipleDifal.slice(0,20).map(([id,c])=>({orderId:id,difalCount:c})),setFinalSize:ordersDifalProcessed.size,sampleDifalDetails:difalDetails.slice(0,5).map(d=>({codigoPedido:d.codigoPedido,quantidade:d.quantidade}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'FINAL'})}).catch(()=>{});
    // #endregion

    // --- Create InvoiceSummary for pre-approval review ---
    // Get unique order codes (excluding storage/logistics codes)
    const uniqueOrders = new Set<string>();
    const pedidosSemMatch: string[] = [];
    
    matchedDetails.forEach(d => {
        if (d.codigoPedido && 
            !d.codigoPedido.startsWith('ARMAZENAGEM') && 
            !d.codigoPedido.startsWith('ENTRADA') &&
            !d.codigoPedido.startsWith('LOGÍSTICA')) {
            uniqueOrders.add(d.codigoPedido);
        }
    });
    
    // Get unmatched orders from the CSV (orders without any matching)
    if (itemsNotFound > 0 && warnings.length > 0) {
        pedidosSemMatch.push(...warnings.slice(0, 10));
    }
    
    // Add warning about digital orders skipped (no logistics cost)
    if (ordersDigitalSkipped > 0) {
        warnings.push(`${ordersDigitalSkipped} pedido(s) digital(is) ignorado(s) - não passam pela logística`);
    }
    
    // Extract entradas de material from matchedDetails
    const entradasMaterial: EntradaMaterialResumo[] = matchedDetails
        .filter(d => d.codigoPedido === 'ENTRADA DE MATERIAL')
        .map(d => {
            const item = tabelaPrecos.find(p => p.id === d.tabelaPrecoItemId);
            const precoVenda = item ? calculatePrecoVendaForDisplay(item) : 0;
            return {
                descricao: item?.descricao || 'Entrada de Material',
                quantidade: d.quantidade,
                valorTotal: precoVenda * d.quantidade
            };
        });
    
    const summary: InvoiceSummary = {
        totalPedidosEncontrados: ordersMatched,
        totalPedidosUnicos: uniqueOrders.size,
        totalEnvios: totalEnvio,
        quantidadeEnvios: quantidadeEnvios,
        totalDifal: totalDifal,
        quantidadeDifal: quantidadeDifal,
        totalArmazenagem: totalArmazenagem,
        totalCustosLogisticos: totalCustosLogisticos - totalDifal, // Subtract DIFAL since it's counted separately
        totalGeral: cobranca.valorTotal,
        periodoDetectado: detectedDateRange,
        tabela: isClientTable ? 'cliente' : 'global',
        clienteNome: cliente.nome,
        mesReferencia: month,
        pedidosSemMatch: pedidosSemMatch,
        warnings: warnings,
        // Novos campos para detalhamento
        entradasMaterial: entradasMaterial.length > 0 ? entradasMaterial : undefined,
        custosAdicionaisDetalhados: [], // Será preenchido pelo frontend ao adicionar custos manuais
        totalReembolsos: 0,
        quantidadeReembolsos: 0
    };
    
    // #region agent log - Summary created
    fetch('http://127.0.0.1:7242/ingest/a9ef296b-8240-4113-a518-0e1e56e2ff45',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'firestoreService.ts:SUMMARY',message:'Invoice summary created',data:{summary,isClientTable,tabelaPrecosCount:tabelaPrecos.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-SUMMARY'})}).catch(()=>{});
    // #endregion

    return { cobranca, detalhes: matchedDetails, detectedDateRange, summary };
};

// --- General Settings & FAQ ---

export const getGeneralSettings = async (): Promise<GeneralSettings | null> => {
    const docRef = configuracoesCol.doc('general');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        return { ...docSnap.data(), id: 'general' } as GeneralSettings;
    }
    return null;
};

export const updateGeneralSettings = async (settings: GeneralSettings) => {
    const docRef = configuracoesCol.doc('general');
    const { id, ...dataToSave } = settings;
    return await docRef.set(dataToSave, { merge: true }); // Use set with merge to create/update
};

export const getFaqs = async (): Promise<FaqItem[]> => {
    const q = faqCol.orderBy('pergunta');
    const snapshot = await q.get();
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FaqItem));
};

export const addFaqItem = async (faq: Omit<FaqItem, 'id'>) => {
    return await faqCol.add(faq);
};

export const updateFaqItem = async (faq: FaqItem) => {
    const docRef = faqCol.doc(faq.id);
    const { id, ...dataToUpdate } = faq;
    return await docRef.update(dataToUpdate);
};

export const deleteFaqItem = async (id: string) => {
    const docRef = faqCol.doc(id);
    return await docRef.delete();
};


// --- Gemini AI Functions ---

const generatePromptForAnalysis = (cobranca: CobrancaMensal, detalhes: DetalheEnvio[], tabelaPrecos: TabelaPrecoItem[], cliente: Cliente) => {
    // Group shipping costs by state
    const shippingByState: Record<string, { count: number; total: number }> = {};
    detalhes.forEach(d => {
        const item = tabelaPrecos.find(c => c.id === d.tabelaPrecoItemId);
        if (item && (item.categoria === 'Envios' || item.categoria === 'Retornos') && d.estado) {
            const estado = d.estado.toUpperCase();
            if (!shippingByState[estado]) {
                shippingByState[estado] = { count: 0, total: 0 };
            }
            const isTemplate = isTemplateItem(item);
            const isNonTemplateShipping = (item.categoria === 'Envios' || item.categoria === 'Retornos') && !isTemplate;
            const subtotal = isNonTemplateShipping ? d.quantidade * 1 : calculatePrecoVendaForDisplay(item) * d.quantidade;
            shippingByState[estado].count += 1;
            shippingByState[estado].total += subtotal;
        }
    });

    const stateDistribution = Object.entries(shippingByState)
        .map(([estado, data]) => `${estado}: ${data.count} envio(s), total R$ ${data.total.toFixed(2)}`)
        .join('; ');

    const detailsSummary = detalhes.slice(0, 15).map(d => {
        const item = tabelaPrecos.find(c => c.id === d.tabelaPrecoItemId);
        const estadoInfo = d.estado ? `, Estado: ${d.estado}${d.cep ? ` (CEP: ${d.cep})` : ''}` : '';
        return `- Item: ${item?.subcategoria || 'N/A'} - ${item?.descricao || 'N/A'}, Qtd: ${d.quantidade}, Pedido: ${d.codigoPedido}${estadoInfo}`;
    }).join('\n');

    let specialInstructions = '';
    if (cliente.nome.toLowerCase().includes('prio forte') && cobranca.mesReferencia.toLowerCase().includes('outubro')) {
        specialInstructions = `
        **Observação Específica para a PRIO FORTE (Fatura de Outubro):**
        Explique de forma simples e compreensível que o custo elevado neste primeiro mês foi uma situação pontual devido à grande entrada inicial de materiais no estoque. Deixe claro que este valor será drasticamente reduzido nos próximos meses.
        Detalhe que os custos de entrada de produtos da própria Yoobe não são cobrados devido à integração, incidindo custos apenas na "entrada maquila" (materiais de terceiros), etiquetagem e, claro, na armazenagem subsequente. Reforce que as entradas de materiais externos geraram custos logísticos acima da média, mas que isso é parte do processo de setup inicial.
        `;
    }

    // Verificar se há custos de entrada de material externo
    const temEntradaMaterial = detalhes.some(d => {
        const item = tabelaPrecos.find(c => c.id === d.tabelaPrecoItemId);
        return item && item.categoria === 'Maquila/Entrada de material externo';
    });

    const entradaMaterialContext = temEntradaMaterial ? `
        **Contexto sobre Entrada de Material Externo:**
        Se houver custos de "Entrada de Material" ou "Maquila/Entrada de material externo" na fatura, explique que:
        - Este custo ocorre quando a produção não é realizada pela Yoobe
        - Quando o produto é providenciado pela Yoobe, este custo não é cobrado, pois a integração elimina a necessidade de processamento manual
        - Seja sutil ao mencionar que considerar produção pela Yoobe pode eliminar este custo adicional, mas não insista - apenas sugira como uma oportunidade de otimização
        ` : '';

    return `
        Você é um analista financeiro especializado em logística da Yoobe. Analise a seguinte fatura para o cliente "${cliente.nome}" referente a ${cobranca.mesReferencia}.

        Dados da Fatura:
        - Valor Total: R$ ${cobranca.valorTotal.toFixed(2)}
        - Total de Envios: R$ ${cobranca.totalEnvio.toFixed(2)}
        - Total de Custos Logísticos (P&P, etc): R$ ${cobranca.totalCustosLogisticos.toFixed(2)}
        - Total de Armazenagem: R$ ${cobranca.totalArmazenagem.toFixed(2)}
        - Total de Custos Adicionais: R$ ${(cobranca.totalCustosAdicionais || 0).toFixed(2)}
        - Total de Custos Extras: R$ ${(cobranca.totalCustosExtras || 0).toFixed(2)}
        - Status: ${cobranca.status}
        - Itens em estoque do cliente neste período: ${cliente.unidadesEmEstoque}

        Amostra de Itens Cobrados (até 15 itens):
        ${detailsSummary}
        ${detalhes.length > 15 ? `\n... e mais ${detalhes.length - 15} outros itens.` : ''}

        ${entradaMaterialContext}

        ${specialInstructions}

        **Instruções Importantes:**
        - Esta análise é para o CLIENTE FINAL. Não mencione detalhes técnicos do sistema, templates, margem de lucro, ou como os preços são calculados internamente.
        - Foque apenas nos valores da fatura e nos componentes do custo que são relevantes para o cliente.
        - Seja claro, objetivo e profissional. Use linguagem simples e acessível.
        - Não invente dados que não foram fornecidos.
        - Use o nome "Yoobe" ao se referir à empresa.

        Sua tarefa é gerar um resumo conciso e informativo para o cliente, em português do Brasil, usando markdown.
        O resumo deve:
        1.  Começar com uma saudação amigável.
        2.  Explicar os principais componentes do custo (envio, custos logísticos, armazenagem, custos adicionais e extras, se houver).
        3.  ${stateDistribution ? `Mencionar a distribuição de custos de envio por estado/região: ${stateDistribution}. Se houver concentração em determinadas regiões, destacar isso.` : ''}
        4.  Se houver custos de "pedidos contendo mais de 1.0 itens" ou itens adicionais, explicar que este custo é aplicado quando um pedido contém mais de 1 item no pacote. O custo de picking é calculado com base no custo base (coluna T) mais um custo adicional por cada item extra além do primeiro, sendo que cada item adicional tem sua margem aplicada conforme a tabela de preços.
        5.  Apontar qualquer observação interessante, como a relação entre o número de itens em estoque e o custo de armazenagem.
        6.  Se houver custos adicionais, mencioná-los de forma clara e explicar que são custos específicos adicionados à fatura.
        7.  Finalizar com uma nota positiva.

        **IMPORTANTE:** Não mencione templates, margem de lucro, matching dinâmico, ou qualquer detalhe técnico do sistema. Foque apenas na análise da fatura e nos valores apresentados. Quando mencionar custos de envio por estado, explique de forma clara e útil para o cliente entender a distribuição geográfica dos seus envios. Quando mencionar custos de itens adicionais, explique de forma simples que é um custo por item extra no pacote.
        
        **IMPORTANTE - Formato do Conteúdo:**
        - NÃO inclua assinaturas formais (como "Atenciosamente", "Cordialmente", etc.)
        - NÃO use placeholders como [Seu Nome], [Nome da Empresa], [Seu Contato], [Email], etc.
        - NÃO inclua informações de contato ou dados fictícios
        - O conteúdo deve ser apenas a análise da fatura, terminando diretamente após a nota positiva final
        - Use apenas informações reais da Yoobe quando necessário
        - O texto deve ser autocontido e completo, sem necessidade de fechamentos formais ou assinaturas
    `;
};


export const generateClientInvoiceAnalysis = async (cobranca: CobrancaMensal, detalhes: DetalheEnvio[], tabelaPrecos: TabelaPrecoItem[], cliente: Cliente): Promise<string> => {
    const prompt = generatePromptForAnalysis(cobranca, detalhes, tabelaPrecos, cliente);
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text;
};

export const generateInvoiceAnalysis = generateClientInvoiceAnalysis; // Alias for admin use

// Gemini function for initial processing
export const runAIBillingAnalysis = async (
    clientId: string,
    month: string,
    clientes: Cliente[],
    trackReportContent: string,
    orderDetailContent: string
): Promise<AIAnalysis> => {
    const cliente = clientes.find(c => c.id === clientId);
    if (!cliente) throw new Error("Cliente não foi encontrado.");

    // --- START: Robust Pre-filtering ---
    const rawTrackReport = parseCSV(trackReportContent);
    const rawOrderDetail = parseCSV(orderDetailContent);

    // Detect track report layout and build schema
    const trackReportLayout = detectTrackReportLayout(rawTrackReport);
    const trackReportSchema = buildTrackReportSchema(rawTrackReport, trackReportLayout);
    
    // Use schema for date column or fallback to legacy defaults
    const trackDateColumn = trackReportSchema.dateColumn || 'Data';
    const orderDetailDateColumn = findColumnName(rawOrderDetail, [
        'Data do pedido',
        'Data do Pedido',
        'Data',
        'Date'
    ]) || 'Data do pedido';

    // Filter track report based on layout (Universal robust filtering)
    const filteredTrackData = filterDataByMonth(rawTrackReport, trackDateColumn, month);
    const filteredOrderDetailData = filterDataByMonth(rawOrderDetail, orderDetailDateColumn, month);

    const filteredTrackContent = stringifyCSV(filteredTrackData);
    const filteredOrderDetailContent = stringifyCSV(filteredOrderDetailData);
    
    console.log(`AI Analysis: Track Report layout=${trackReportLayout}, filtered ${filteredTrackData.length} track rows, ${filteredOrderDetailData.length} order rows for ${month}`);
    // --- END: Robust Pre-filtering ---

    const prompt = `
        **Tarefa:** Analise os dois relatórios CSV de logística fornecidos para o mês de referência de ${month} e gere uma análise JSON detalhada.

        **Contexto:**
        - Cliente: ${cliente.nome}
        - Mês de Referência para Faturamento: ${month}

        **Arquivos Fornecidos (já pré-filtrados para o mês de ${month}):**
        1.  **Relatório de Rastreio (formato: ${trackReportLayout}):** Este é o arquivo principal que define QUAIS pedidos devem ser faturados. 
            ${trackReportLayout === 'lojaprio' 
                ? 'Use a coluna "Number" como ID do pedido e "Email" para matching secundário. Este é o formato LojaPrio.'
                : 'Use a coluna "Numero" como ID do pedido.'}
            \`\`\`csv
            ${filteredTrackContent}
            \`\`\`
        2.  **Relatório de Custos:** Este arquivo contém os detalhes dos custos para cada pedido. Use a coluna "Número do pedido" como ID.
            \`\`\`csv
            ${filteredOrderDetailContent}
            \`\`\`
        
        **Como o Sistema Funciona:**
        O sistema utiliza **matching dinâmico** entre as colunas do 'Relatório de Custos' e a Tabela de Preços:
        - A coluna AD do CSV de custos contém o custo total de envio (soma de todos os custos de envio já calculada na planilha)
        - As colunas M (CEP) e O (Estado) do CSV de custos são capturadas e associadas a cada envio para análise geográfica
        - A coluna E do CSV de custos contém a quantidade de itens do pacote, usada para calcular picking e packing
        - A coluna T do CSV de custos contém o "Custo do picking de produtos" - custo do picking para 1 unidade
        - **Para picking e packing:**
          - Se quantidade de itens (coluna E) <= 1: usa o item da tabela de preços "pedidos contendo de 0.0 até 1.0 itens" com margem aplicada, quantidade = 1
          - Se quantidade de itens (coluna E) >= 2: 
            * Custo base = valor da coluna T (custo do picking para 1 unidade)
            * Quantidade adicional = quantidade de itens - 1 (itens acima do primeiro)
            * Preço unitário adicional = preço do item "pedidos contendo mais de 1.0 itens" com margem aplicada
            * Custo adicional total = quantidade adicional × preço unitário adicional
            * Preço final do picking = custo base (coluna T) + custo adicional total
            * Quantidade = 1 (valor total já calculado)
            * Um item adicional separado é criado com quantidade = quantidade adicional
        - Todas as colunas que contêm "custo" (exceto envio) são identificadas automaticamente
        - Cada coluna de custo é mapeada dinamicamente para um item na Tabela de Preços
        - O matching é feito por descrição (case-insensitive, parcial), categoria, e palavras-chave
        - O preço final é calculado usando: custo unitário + margem de lucro da Tabela de Preços
        - Não há valores fixos hardcoded - tudo é baseado na Tabela de Preços atual
        
        **Importante sobre Templates e Matching:**
        - Itens template (precoVenda === 1 com "template" na descrição) são usados nos cálculos mas ocultos da visualização do cliente (informação interna)
        - O matching prioriza itens não-template para custos específicos como Difal, Seguro e Ajustes
        - Para custos de envio, a coluna AD é usada como custo total (não processa outras colunas de envio individualmente)
        - Para picking e packing: 
          * Quantidade vem da coluna E (quantidade de itens do pacote)
          * Coluna T contém o custo do picking para 1 unidade
          * Se quantidade <= 1: usa item "pedidos contendo de 0.0 até 1.0 itens" com margem
          * Se quantidade >= 2: usa coluna T + (quantidade adicional × preço item adicional com margem)
          * O custo adicional usa o item "pedidos contendo mais de 1.0 itens" da tabela de preços com margem aplicada
        - Custos de DIFAL são direcionados para categoria DIFAL
        - Outros custos relacionados são direcionados para categoria Logística
        - Custos adicionais são custos manuais adicionados separadamente e não vêm da tabela de preços
        
        **Instruções de Análise (SIGA ESTRITAMENTE):**
        1.  **Cruzamento de Pedidos (Passo Fundamental):** Para cada pedido no 'Relatório de Rastreio', você DEVE encontrar uma linha correspondente no 'Relatório de Custos' usando o ID do pedido. O 'Relatório de Rastreio' é a fonte da verdade.
            - **Se um pedido do Rastreio existe nos Custos:** O pedido é válido e será processado com matching dinâmico das colunas de custo.
            - **Se um pedido do Rastreio NÃO existe nos Custos:** O pedido não pode ser faturado. Adicione seu ID à lista 'unmatchedTrackOrderIds'.
            - **Se um pedido dos Custos NÃO existe no Rastreio:** Este pedido não pertence a esta fatura. Adicione seu ID à lista 'unmatchedDetailOrderIds'.
        2.  **Preenchimento da Análise:** Com base no cruzamento, preencha CUIDADOSAMENTE todos os campos do objeto 'analysis' no schema. Seja explícito no 'summary' sobre o que foi encontrado ou não. Se nenhum pedido foi cruzado, explique o porquê (ex: "nenhum ID de pedido correspondeu entre os dois arquivos").

        **Formato de Saída:** Responda ESTRITAMENTE com o objeto JSON definido no schema. Não adicione nenhum texto ou explicação fora do JSON.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    summary: { type: Type.STRING, description: "Um resumo claro e em português sobre o resultado do cruzamento. Ex: 'Foram encontrados X pedidos correspondentes. Y pedidos do rastreio não tinham custo e Z pedidos de custo foram ignorados.' Se for 0, diga: 'Nenhum pedido do 'Relatório de Rastreio' pôde ser encontrado no 'Relatório de Custos', resultando em 0 pedidos válidos para faturamento.'" },
                    trackReportRows: { type: Type.INTEGER, description: "Número EXATO de linhas de dados no 'Relatório de Rastreio' fornecido no prompt." },
                    orderDetailRows: { type: Type.INTEGER, description: "Número EXATO de linhas de dados no 'Relatório de Custos' fornecido no prompt." },
                    clientOrdersFound: { type: Type.INTEGER, description: "Número de pedidos do 'Relatório de Rastreio' que tiveram uma correspondência EXATA de ID no 'Relatório de Custos'." },
                    unmatchedTrackOrderIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lista de IDs do 'Relatório de Rastreio' que NÃO foram encontrados no 'Relatório de Custos'. Não invente IDs, liste apenas os que não tiveram par." },
                    unmatchedDetailOrderIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lista de IDs do 'Relatório de Custos' que foram ignorados por NÃO estarem no 'Relatório de Rastreio'. Não invente IDs." },
                    totalValueFromMatchedOrders: { type: Type.NUMBER, description: "Soma da coluna 'Total' do 'Relatório de Custos' APENAS para os pedidos que foram cruzados com sucesso. Se nenhum pedido foi encontrado, este valor DEVE ser 0." },
                }
            }
        }
    });

    const jsonStr = response.text.trim();
    const result: AIAnalysis = JSON.parse(jsonStr);

    return result;
};


export const seedInitialFaqs = async () => {
    const faqSnapshot = await faqCol.get();
    if (!faqSnapshot.empty) {
        // Data already exists, no need to seed.
        return;
    }

    console.log("FAQ collection is empty. Seeding initial data with Gemini...");

    const prompt = `
        Crie uma lista de perguntas e respostas (FAQ) para um sistema de faturamento de logística chamado "Yoobe Logistics Billing".
        As respostas devem ser claras, objetivas e úteis para o cliente final, em português do Brasil.
        Aborde os seguintes tópicos:
        1. O que é o sistema e para que serve.
        2. Uma explicação detalhada sobre como os custos são calculados. Inclua os seguintes pontos:
           - O cliente só paga pelo que usa e a tabela de preços é uma referência.
           - Os valores de frete são dinâmicos, podem variar diariamente com base em ofertas de transportadoras, rotas e preços, e o valor final pode ser maior ou menor que o de referência.
           - O que significa o custo "Itens externos recebidos/unidade", explicando que é um custo fixo que cobre toda a movimentação de entrada (contagem, conferência, etiquetação, armazenagem e tributos da operação).
        3. O que significa "Confirmar Recebimento da Fatura".
        4. Como exportar os dados para CSV e para que serve.
        5. O que fazer se houver uma divergência na fatura.
        6. Crie múltiplas FAQs específicas sobre notas fiscais com explicações simples e diretas:
           
           a) "Quais são os tipos de notas fiscais emitidas pela Yoobe?"
              - Explicação simples sobre os 3 tipos principais: Venda para Entrega Futura, Venda Simples, e Doação
              - Quando cada uma é emitida de forma resumida
           
           b) "O que é Nota Fiscal de Venda para Entrega Futura?"
              - Explicação simples: emitida quando produto entra no estoque
              - Para que serve de forma clara
           
           c) "O que é Nota Fiscal de Venda (simples)?"
              - Explicação simples: emitida em vendas com pagamento
              - Como é enviada ao cliente
           
           d) "O que é Nota Fiscal de Doação?"
              - Explicação simples: emitida em vendas com pontos (quando cliente não paga)
              - Por que é necessária
           
           e) "Quais notas fiscais são emitidas no momento do envio?"
              - Explicação simples das 3 notas: Nota de Doação NF-e (CFOP 6949), Nota de Retorno Simbólico NF-e (CFOP 1949), e GNRE para DIFAL
              - Por que são emitidas simultaneamente
           
           f) "O que é DIFAL e como funciona?"
              - Explicação simples do que é DIFAL (Diferencial de Alíquota do ICMS)
              - Como é calculado automaticamente
              - Como é pago (via gateway integrado pela Yoobe)
              - Taxa fixa cobrada na fatura mensal
              - Não requer ação do cliente
           
           g) "Preciso fazer algo para receber as notas fiscais?"
              - Explicação simples: processo totalmente automatizado
              - Não requer nenhuma ação do cliente
              - Todas as notas são geradas e processadas automaticamente
           
           IMPORTANTE: Todas as respostas devem ser:
           - Simples e diretas (máximo 3-4 parágrafos por resposta)
           - Escritas em linguagem acessível para qualquer pessoa
           - Sem jargões técnicos desnecessários
           - Focadas em responder a dúvida específica da pergunta

        **IMPORTANTE - Formato das Respostas:**
        - NÃO inclua assinaturas, saudações finais, ou placeholders como [Seu Nome], [Nome da Empresa], [Seu Contato], [Email], etc.
        - NÃO inclua informações de contato ou dados fictícios
        - As respostas devem ser puramente informativas e diretas
        - Use apenas informações reais da Yoobe quando necessário

        Responda ESTRITAMENTE no formato JSON, como definido no schema abaixo. Não adicione nenhum texto ou formatação fora do JSON.
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        faqs: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    pergunta: { type: Type.STRING },
                                    resposta: { type: Type.STRING }
                                },
                                required: ["pergunta", "resposta"]
                            }
                        }
                    },
                    required: ["faqs"]
                }
            }
        });

        const jsonStr = response.text.trim();
        const result = JSON.parse(jsonStr);
        
        const faqsToSeed: Omit<FaqItem, 'id'>[] = result.faqs;

        if (faqsToSeed && faqsToSeed.length > 0) {
            const batch = db.batch();
            faqsToSeed.forEach(faq => {
                const docRef = faqCol.doc();
                batch.set(docRef, faq);
            });
            await batch.commit();
            console.log(`${faqsToSeed.length} FAQ items seeded successfully.`);
        }
    } catch (error) {
        console.error("Error seeding FAQ data with Gemini:", error);
    }
};

/**
 * Adiciona FAQs específicas sobre notas fiscais, mesmo se já existirem outras FAQs
 */
export const seedNotasFiscaisFaqs = async () => {
    console.log("Generating notas fiscais FAQs with Gemini...");

    const prompt = `
        Crie uma lista de perguntas e respostas (FAQ) específicas sobre notas fiscais para um sistema de faturamento de logística chamado "Yoobe Logistics Billing".
        As respostas devem ser claras, objetivas, simples e úteis para o cliente final, em português do Brasil.
        
        Crie as seguintes FAQs específicas sobre notas fiscais com explicações simples e diretas:
        
        1. "Quais são os tipos de notas fiscais emitidas pela Yoobe?"
           - Explicação simples sobre os 3 tipos principais: Venda para Entrega Futura, Venda Simples, e Doação
           - Quando cada uma é emitida de forma resumida
           - Máximo 3-4 parágrafos
        
        2. "O que é Nota Fiscal de Venda para Entrega Futura?"
           - Explicação simples: emitida quando produto entra no estoque
           - Para que serve de forma clara
           - Máximo 2-3 parágrafos
        
        3. "O que é Nota Fiscal de Venda (simples)?"
           - Explicação simples: emitida em vendas com pagamento
           - Como é enviada ao cliente
           - Máximo 2-3 parágrafos
        
        4. "O que é Nota Fiscal de Doação?"
           - Explicação simples: emitida em vendas com pontos (quando cliente não paga)
           - Por que é necessária
           - Máximo 2-3 parágrafos
        
        5. "Quais notas fiscais são emitidas no momento do envio?"
           - Explicação simples das 3 notas: Nota de Doação NF-e (CFOP 6949), Nota de Retorno Simbólico NF-e (CFOP 1949), e GNRE para DIFAL
           - Por que são emitidas simultaneamente
           - Máximo 3-4 parágrafos
        
        6. "O que é DIFAL e como funciona?"
           - Explicação simples do que é DIFAL (Diferencial de Alíquota do ICMS)
           - Como é calculado automaticamente
           - Como é pago (via gateway integrado pela Yoobe)
           - Taxa fixa cobrada na fatura mensal
           - Não requer ação do cliente
           - Máximo 3-4 parágrafos
        
        7. "Preciso fazer algo para receber as notas fiscais?"
           - Explicação simples: processo totalmente automatizado
           - Não requer nenhuma ação do cliente
           - Todas as notas são geradas e processadas automaticamente
           - Máximo 2-3 parágrafos
        
        **IMPORTANTE - Formato das Respostas:**
        - NÃO inclua assinaturas, saudações finais, ou placeholders
        - NÃO inclua informações de contato ou dados fictícios
        - As respostas devem ser puramente informativas e diretas
        - Use linguagem simples e acessível
        - Sem jargões técnicos desnecessários
        - Focadas em responder a dúvida específica da pergunta
        
        Responda ESTRITAMENTE no formato JSON, como definido no schema abaixo. Não adicione nenhum texto ou formatação fora do JSON.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        faqs: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    pergunta: { type: Type.STRING },
                                    resposta: { type: Type.STRING }
                                },
                                required: ["pergunta", "resposta"]
                            }
                        }
                    },
                    required: ["faqs"]
                }
            }
        });

        const jsonStr = response.text.trim();
        const result = JSON.parse(jsonStr);
        
        const faqsToAdd: Omit<FaqItem, 'id'>[] = result.faqs;

        if (faqsToAdd && faqsToAdd.length > 0) {
            // Verificar quais FAQs já existem para evitar duplicatas
            const existingFaqs = await getFaqs();
            const existingPerguntas = new Set(existingFaqs.map(faq => faq.pergunta.toLowerCase().trim()));
            
            const batch = db.batch();
            let addedCount = 0;
            
            faqsToAdd.forEach(faq => {
                // Verificar se a pergunta já existe (case-insensitive)
                if (!existingPerguntas.has(faq.pergunta.toLowerCase().trim())) {
                    const docRef = faqCol.doc();
                    batch.set(docRef, faq);
                    addedCount++;
                }
            });
            
            if (addedCount > 0) {
                await batch.commit();
                console.log(`${addedCount} notas fiscais FAQ items added successfully.`);
            } else {
                console.log("All notas fiscais FAQs already exist.");
            }
        }
    } catch (error) {
        console.error("Error generating notas fiscais FAQ data with Gemini:", error);
    }
};

// --- Firebase Storage Functions ---

export const uploadFileToStorage = async (file: File, path: string): Promise<string> => {
    const storageRef = storage.ref();
    const fileRef = storageRef.child(path);
    const snapshot = await fileRef.put(file);
    return await snapshot.ref.getDownloadURL();
};

export const deleteFileFromStorage = async (url: string): Promise<void> => {
    try {
        const fileRef = storage.refFromURL(url);
        await fileRef.delete();
    } catch (error) {
        console.error("Error deleting file from storage:", error);
        throw error;
    }
};

// --- Documentos Pedidos Functions ---

export const getDocumentosByCobrancaId = async (cobrancaId: string): Promise<DocumentoPedido[]> => {
    const q = documentosCol.where('cobrancaId', '==', cobrancaId);
    const snapshot = await q.get();
    const docs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as DocumentoPedido));
    // Sort by uploadDate descending manually
    return docs.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
};

export const getDocumentosByClienteAndMonth = async (clienteId: string, mesReferencia: string): Promise<DocumentoPedido[]> => {
    const q = documentosCol.where('clienteId', '==', clienteId)
        .where('mesReferencia', '==', mesReferencia);
    const snapshot = await q.get();
    const docs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as DocumentoPedido));
    // Sort by uploadDate descending manually since we can't use orderBy with multiple where clauses without index
    return docs.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
};

export const saveDocumentoPedido = async (documento: Omit<DocumentoPedido, 'id'>): Promise<string> => {
    const docRef = documentosCol.doc();
    await docRef.set(documento);
    return docRef.id;
};

export const deleteDocumentoPedido = async (documentoId: string): Promise<void> => {
    const docRef = documentosCol.doc(documentoId);
    const doc = await docRef.get();
    if (doc.exists) {
        const data = doc.data() as DocumentoPedido;
        // Delete file from storage if exists
        if (data.fileUrl) {
            try {
                await deleteFileFromStorage(data.fileUrl);
            } catch (error) {
                console.error("Error deleting file from storage:", error);
            }
        }
        await docRef.delete();
    }
};

export const updateCobrancaWithNotaFiscal = async (cobrancaId: string, notaFiscalUrl: string, fileName: string): Promise<void> => {
    const cobrancaRef = cobrancasCol.doc(cobrancaId);
    await cobrancaRef.update({
        notaFiscalUrl,
        notaFiscalFileName: fileName
    });
};

// --- NF-e XML Parsing Functions for DIFAL Comprovantes ---

// Extract value from XML using tag name (simple regex-based extraction)
const extractXMLValue = (xml: string, tagName: string): string | null => {
    const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
};

// Parse NF-e XML content and extract DIFAL comprovante fields
export const parseNFeXmlForDifal = (xmlContent: string, fileName: string, driveFileId?: string): ComprovanteDifal | null => {
    try {
        // Extract chave NFe from infNFe Id attribute
        const chaveMatch = xmlContent.match(/Id="NFe(\d{44})"/i);
        const chaveNFe = chaveMatch ? chaveMatch[1] : null;
        
        if (!chaveNFe) {
            console.error('Chave NFe não encontrada no XML');
            return null;
        }
        
        // Extract data de emissão (dhEmi)
        const dhEmi = extractXMLValue(xmlContent, 'dhEmi');
        const dataEmissao = dhEmi ? dhEmi.split('T')[0] : new Date().toISOString().split('T')[0];
        
        // Extract valor NF (vNF)
        const vNFStr = extractXMLValue(xmlContent, 'vNF');
        const valorNF = vNFStr ? parseFloat(vNFStr.replace(',', '.')) : 0;
        
        // Extract ICMS UF Destino (vICMSUFDest) - this is the DIFAL value
        const vICMSUFDestStr = extractXMLValue(xmlContent, 'vICMSUFDest');
        const valorICMSUFDest = vICMSUFDestStr ? parseFloat(vICMSUFDestStr.replace(',', '.')) : 0;
        
        // Extract FCP UF Destino (vFCPUFDest) - optional
        const vFCPUFDestStr = extractXMLValue(xmlContent, 'vFCPUFDest');
        const valorFCPUFDest = vFCPUFDestStr ? parseFloat(vFCPUFDestStr.replace(',', '.')) : undefined;
        
        // Extract destinatário name (xNome inside dest)
        const destMatch = xmlContent.match(/<dest>[\s\S]*?<xNome>([^<]*)<\/xNome>[\s\S]*?<\/dest>/i);
        const nomeDestinatario = destMatch ? destMatch[1].trim() : undefined;
        const emailMatch = xmlContent.match(/<dest>[\s\S]*?<email>([^<]*)<\/email>[\s\S]*?<\/dest>/i);
        const emailRelacionado = emailMatch ? emailMatch[1].trim() : undefined;
        
        const comprovante: ComprovanteDifal = {
            id: `difal_${chaveNFe.substring(25, 34)}_${Date.now()}`,
            cobrancaId: '', // Will be set when saving
            chaveNFe,
            dataEmissao,
            valorNF,
            valorICMSUFDest,
            valorFCPUFDest,
            nomeDestinatario,
            emailRelacionado,
            xmlFileName: fileName,
            xmlDriveId: driveFileId,
            uploadDate: new Date().toISOString()
        };
        
        console.log('📄 XML NFe parseado:', {
            chaveNFe,
            dataEmissao,
            valorNF,
            valorICMSUFDest,
            nomeDestinatario
        });
        
        return comprovante;
    } catch (error) {
        console.error('Erro ao parsear XML de NFe:', error);
        return null;
    }
};

// Parse multiple XML files and return array of comprovantes
export const parseMultipleNFeXmls = (xmlFiles: Array<{ content: string; fileName: string; driveId?: string }>): ComprovanteDifal[] => {
    const comprovantes: ComprovanteDifal[] = [];
    
    for (const file of xmlFiles) {
        const comprovante = parseNFeXmlForDifal(file.content, file.fileName, file.driveId);
        if (comprovante) {
            comprovantes.push(comprovante);
        }
    }
    
    return comprovantes;
};

// Add DIFAL comprovantes to a cobrança
export const addComprovantesDifalToCobranca = async (cobrancaId: string, comprovantes: ComprovanteDifal[], clienteId?: string): Promise<void> => {
    const cobrancaRef = cobrancasCol.doc(cobrancaId);
    const cobrancaDoc = await cobrancaRef.get();
    
    if (!cobrancaDoc.exists) {
        throw new Error('Cobrança não encontrada');
    }
    
    const currentData = cobrancaDoc.data() as CobrancaMensal;
    const existingComprovantes = currentData.comprovantesDifal || [];
    
    // Add cobrancaId to each comprovante and merge
    const newComprovantes = comprovantes.map(c => ({ ...c, cobrancaId, clienteId: clienteId || currentData.clienteId }));
    const mergedComprovantes = [...existingComprovantes, ...newComprovantes];
    
    // Remove duplicates by chaveNFe
    const uniqueComprovantes = mergedComprovantes.reduce((acc: ComprovanteDifal[], curr) => {
        if (!acc.find(c => c.chaveNFe === curr.chaveNFe)) {
            acc.push(curr);
        }
        return acc;
    }, []);
    
    await cobrancaRef.update({
        comprovantesDifal: uniqueComprovantes
    });
    
    console.log(`✅ ${newComprovantes.length} comprovantes DIFAL adicionados à cobrança ${cobrancaId}`);
};

// Remove a DIFAL comprovante from a cobrança
export const removeComprovanteDifal = async (cobrancaId: string, chaveNFe: string): Promise<void> => {
    const cobrancaRef = cobrancasCol.doc(cobrancaId);
    const cobrancaDoc = await cobrancaRef.get();
    
    if (!cobrancaDoc.exists) {
        throw new Error('Cobrança não encontrada');
    }
    
    const currentData = cobrancaDoc.data() as CobrancaMensal;
    const existingComprovantes = currentData.comprovantesDifal || [];
    
    const filteredComprovantes = existingComprovantes.filter(c => c.chaveNFe !== chaveNFe);
    
    await cobrancaRef.update({
        comprovantesDifal: filteredComprovantes
    });
};

// Get summary of DIFAL comprovantes for a cobrança
export const getDifalComprovantesSummary = async (cobrancaId: string): Promise<{
    totalComprovantes: number;
    totalValorICMS: number;
    totalValorFCP: number;
    comprovantes: ComprovanteDifal[];
}> => {
    const cobrancaRef = cobrancasCol.doc(cobrancaId);
    const cobrancaDoc = await cobrancaRef.get();
    
    if (!cobrancaDoc.exists) {
        return { totalComprovantes: 0, totalValorICMS: 0, totalValorFCP: 0, comprovantes: [] };
    }
    
    const data = cobrancaDoc.data() as CobrancaMensal;
    const comprovantes = data.comprovantesDifal || [];
    
    const totalValorICMS = comprovantes.reduce((sum, c) => sum + c.valorICMSUFDest, 0);
    const totalValorFCP = comprovantes.reduce((sum, c) => sum + (c.valorFCPUFDest || 0), 0);
    
    return {
        totalComprovantes: comprovantes.length,
        totalValorICMS,
        totalValorFCP,
        comprovantes
    };
};
