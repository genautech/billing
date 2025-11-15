// FIX: Rewrote Firestore calls to use the v8 compatibility API to resolve import errors.
import { db, storage, firebaseConfig } from './firebase';
import type { Cliente, TabelaPrecoItem, CobrancaMensal, DetalheEnvio, AIAnalysis, CustoAdicional, GeneralSettings, FaqItem, TabelaPrecoCliente, DocumentoPedido } from '../types';
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

// --- Helper to filter data by month ---
const filterDataByMonth = (data: Record<string, string>[], dateColumn: string, month: string): Record<string, string>[] => {
    const [monthName, year] = month.toLowerCase().split('/');
    if (!monthName || !year) return data;

    const targetMonth = monthMap[monthName];
    const targetYear = parseInt(year, 10);

    if (targetMonth === undefined || isNaN(targetYear)) {
        console.warn(`Mês de referência inválido: ${month}`);
        return [];
    }
    
    return data.filter(row => {
        const dateStr = row[dateColumn];
        if (!dateStr) return false;
        try {
            const date = new Date(dateStr);
            return date.getMonth() === targetMonth && date.getFullYear() === targetYear;
        } catch (e) {
            console.error(`Formato de data inválido na coluna ${dateColumn}: ${dateStr}`);
            return false;
        }
    });
};

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
            nome: data.nome,
            cnpj: data.cnpj,
            email: data.email,
            emailFaturamento: data.emailFaturamento,
            role: data.role,
            skusAtivos: data.skusAtivos,
            unidadesEmEstoque: data.unidadesEmEstoque,
            logoUrl: data.logoUrl,
            password: data.password,
            tabelaPrecoId: data.tabelaPrecoId,
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
            nome: data.nome,
            cnpj: data.cnpj,
            email: data.email,
            emailFaturamento: data.emailFaturamento,
            role: data.role,
            skusAtivos: data.skusAtivos,
            unidadesEmEstoque: data.unidadesEmEstoque,
            logoUrl: data.logoUrl,
            password: data.password,
            tabelaPrecoId: data.tabelaPrecoId,
        } as Cliente;
    } catch (error) {
        console.error(`Error fetching cliente ${clienteId}:`, error);
        return null;
    }
};

export const addCliente = async (cliente: Omit<Cliente, 'id'>) => {
    const clienteData = {
        ...cliente,
        password: cliente.password || '123'
    };
    return await clientesCol.add(clienteData);
};

export const updateCliente = async (cliente: Cliente) => {
    const docRef = clientesCol.doc(cliente.id);
    const { id, ...dataToUpdate } = cliente;
    return await docRef.update(dataToUpdate);
};

export const deleteCliente = async (id: string) => {
    const docRef = clientesCol.doc(id);
    return await docRef.delete();
};

// --- Tabela de Preços ---
export const getTabelaPrecos = async (clienteId?: string): Promise<TabelaPrecoItem[]> => {
    // Se clienteId fornecido, verificar se tem tabela personalizada
    if (clienteId) {
        const cliente = await getClienteById(clienteId);
        if (cliente?.tabelaPrecoId) {
            const tabelaPersonalizada = await getTabelaPrecoCliente(cliente.tabelaPrecoId);
            if (tabelaPersonalizada) {
                return tabelaPersonalizada.itens.sort((a, b) => 
                    a.categoria.localeCompare(b.categoria) || a.subcategoria.localeCompare(b.subcategoria)
                );
            }
        }
    }
    
    // Retorna tabela padrão
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
    }).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.subcategoria.localeCompare(b.subcategoria));
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

        const custoStr = row['Custo Unitario'] || row['Custo Unitário'];
        const precoStr = row['Preço Unitário'] || row['Preco Unitario'];

        if (custoStr) {
            custoUnitario = parseFloat(custoStr.replace(',', '.')) || 0;
        }
        if (precoStr) {
            precoVenda = parseFloat(precoStr.replace(',', '.')) || 0;
        }

        // Determine the final values based on what's provided
        if (custoStr && !precoStr) {
            // Only cost is provided, assume 0 margin
            precoVenda = custoUnitario;
        } else if (!custoStr && precoStr) {
            // Only price is provided, assume 0 margin, cost equals price
            custoUnitario = precoVenda;
        } else if (custoStr && precoStr) {
            // Both provided, calculate margin
            if (custoUnitario > 0) {
                margemLucro = ((precoVenda / custoUnitario) - 1) * 100;
            }
        }
        // If neither is provided, all remain 0.

        const dataToWrite: Omit<TabelaPrecoItem, 'id'> = {
            categoria: row.Categoria || "Geral",
            subcategoria: row.Subcategoria || "Geral",
            descricao: row['Descrição do Custo'] || "-",
            metrica: row.Métrica || "Unidade",
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

const getCostCategoryGroup = (category: string): 'envio' | 'armazenagem' | 'logistico' => {
    const envioCats = ['Envios', 'Retornos'];
    if (envioCats.includes(category)) return 'envio';
    if (category === 'Armazenamento') return 'armazenagem';
    return 'logistico';
};

// Helper function to identify if an item is a template
// Templates are items with precoVenda === 1 AND description contains "template"
// Exception: shipping items with precoVenda === 1 are treated as templates even without "template" in description
export const isTemplateItem = (item: TabelaPrecoItem): boolean => {
    if (!item) return false;
    
    const hasTemplateInDescription = item.descricao && 
        (item.descricao.toLowerCase().includes('(template)') || 
         item.descricao.toLowerCase().includes('template'));
    
    // Shipping items with precoVenda === 1 are treated as templates
    const isShippingTemplate = (item.categoria === 'Envios' || item.categoria === 'Retornos') && item.precoVenda === 1;
    
    // Template: precoVenda === 1 AND (has "template" in description OR is shipping item)
    return item.precoVenda === 1 && (hasTemplateInDescription || isShippingTemplate);
};

// Helper function to calculate sale price based on cost and margin
// Always recalculates to ensure margin changes are reflected in invoices
export const calculatePrecoVenda = (item: TabelaPrecoItem): number => {
    if (!item) {
        console.error('calculatePrecoVenda: item is null or undefined');
        return 0;
    }
    
    // For pass-through items (template items with price = 1), always return 1
    // These items don't apply margin as they pass costs directly
    if (isTemplateItem(item)) {
        if (item.categoria === 'Envios' && !item.descricao?.toLowerCase().includes('template')) {
            console.log(`📦 Item de envio tratado como template (precoVenda=1): "${item.descricao}" - retornando preço = 1`);
        }
        return 1; // Always return 1 for template items
    }
    
    // For normal items, always recalculate based on current cost and margin
    // Formula: precoVenda = custoUnitario * (1 + margemLucro / 100)
    if (item.custoUnitario > 0) {
        const calculatedPrice = item.custoUnitario * (1 + (item.margemLucro || 0) / 100);
        // Ensure we never return 0 or negative values
        if (calculatedPrice > 0) {
            return calculatedPrice;
        }
    }
    
    // Fallback to stored price if cost is 0 or invalid, but ensure it's not 0
    if (item.precoVenda > 0) {
        return item.precoVenda;
    }
    
    // Last resort: return 0 and log error
    console.error(`calculatePrecoVenda: Invalid item data - custoUnitario: ${item.custoUnitario}, margemLucro: ${item.margemLucro}, precoVenda: ${item.precoVenda}, descricao: ${item.descricao}`);
    return 0;
};

// Helper function to calculate sale price for display and calculations
// Handles templates of specific costs (Difal, Seguro, etc.) correctly
// For templates of specific costs, uses custoUnitario + margemLucro instead of pass-through
export const calculatePrecoVendaForDisplay = (item: TabelaPrecoItem): number => {
    if (!item) {
        console.error('calculatePrecoVendaForDisplay: item is null or undefined');
        return 0;
    }
    
    // Check if this is a specific cost (Difal, Seguro, Ajustes)
    const isSpecificCost = item.descricao?.toLowerCase().includes('difal') || 
                          item.descricao?.toLowerCase().includes('seguro') || 
                          item.descricao?.toLowerCase().includes('ajuste');
    
    // For templates of specific costs, use price table value (custoUnitario + margemLucro)
    // Templates with pass-through are only for shipping, not for specific costs
    if (isTemplateItem(item) && isSpecificCost && item.custoUnitario > 0) {
        const calculatedPrice = item.custoUnitario * (1 + (item.margemLucro || 0) / 100);
        if (calculatedPrice > 0) {
            return calculatedPrice;
        }
    }
    
    // For all other cases, use standard calculatePrecoVenda
    return calculatePrecoVenda(item);
};

// --- Local Processing Logic ---

export const processarFatura = async (
    clientId: string,
    month: string,
    storageStartDate: string,
    clientes: Cliente[],
    trackReportContent: string,
    orderDetailContent: string
): Promise<{ cobranca: CobrancaMensal, detalhes: DetalheEnvio[], detectedDateRange: string }> => {
    
    console.log('=== INÍCIO processarFatura ===');
    console.log('Cliente ID:', clientId);
    console.log('Mês de referência:', month);
    
    const tabelaPrecos = await getTabelaPrecos();
    console.log('Tabela de preços carregada:', tabelaPrecos.length, 'itens');
    
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
    const rawOrderDetail = parseCSV(orderDetailContent);
    
    console.log('CSV Track Report parseado:', rawTrackReport.length, 'linhas');
    console.log('CSV Order Detail parseado:', rawOrderDetail.length, 'linhas');
    
    if (rawTrackReport.length > 0) {
        console.log('Colunas disponíveis no Track Report:', Object.keys(rawTrackReport[0]));
    }
    if (rawOrderDetail.length > 0) {
        console.log('Colunas disponíveis no Order Detail:', Object.keys(rawOrderDetail[0]));
    }
    
    if (rawTrackReport.length === 0) {
        console.warn('AVISO: Track Report CSV está vazio ou não foi parseado corretamente');
    }
    if (rawOrderDetail.length === 0) {
        console.warn('AVISO: Order Detail CSV está vazio ou não foi parseado corretamente');
    }

    // Find date column in trackReport with variations
    const trackReportDateColumn = findColumnName(rawTrackReport, [
        'Data de envio',
        'Data de Envio',
        'Data do envio',
        'Data',
        'Date',
        'Envio Date'
    ]);
    
    if (!trackReportDateColumn) {
        console.error('ERRO: Não foi possível encontrar coluna de data no Track Report. Colunas disponíveis:', rawTrackReport.length > 0 ? Object.keys(rawTrackReport[0]) : 'N/A');
        throw new Error("Coluna de data não encontrada no Track Report CSV. Verifique se o arquivo contém uma coluna de data.");
    }
    console.log('Coluna de data encontrada no Track Report:', trackReportDateColumn);
    
    // Find date column in orderDetail (should be 'Data do pedido' but check for variations)
    const orderDetailDateColumn = findColumnName(rawOrderDetail, [
        'Data do pedido',
        'Data do Pedido',
        'Data',
        'Date'
    ]) || 'Data do pedido'; // Fallback to expected name
    
    console.log('Coluna de data usada no Order Detail:', orderDetailDateColumn);

    const trackReport = filterDataByMonth(rawTrackReport, trackReportDateColumn, month);
    const orderDetail = filterDataByMonth(rawOrderDetail, orderDetailDateColumn, month);
    
    console.log('Após filtro de mês:', month);
    console.log('Track Report filtrado:', trackReport.length, 'linhas');
    console.log('Order Detail filtrado:', orderDetail.length, 'linhas');
    
    if (trackReport.length === 0) {
        console.warn('AVISO: Nenhum dado encontrado no Track Report para o mês', month);
    }
    if (orderDetail.length === 0) {
        console.warn('AVISO: Nenhum dado encontrado no Order Detail para o mês', month);
    }
    // --- END: Robust Pre-filtering ---

    // --- START: Dynamic Cost Column Identification and Matching ---
    // Identify column AD (total shipping cost) - this is the sum of all shipping costs
    const columnAD = findColumnByLetter(rawOrderDetail, 'AD');
    console.log('Coluna AD (custo total de envio) encontrada:', columnAD || 'NÃO ENCONTRADA');
    
    // Identify columns M (CEP), O (Estado), E (Quantidade de itens), and T (Custo do picking)
    const columnM = findColumnByLetter(rawOrderDetail, 'M');
    const columnO = findColumnByLetter(rawOrderDetail, 'O');
    const columnE = findColumnByLetter(rawOrderDetail, 'E');
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
        console.warn(`⚠️ Item de picking "pedidos contendo de 0.0 até 1.0 itens" NÃO encontrado na tabela de preços!`);
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
        console.warn(`⚠️ Item de custo adicional "pedidos contendo mais de 1.0 itens" NÃO encontrado na tabela de preços!`);
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
    
    otherCostColumns.forEach(csvColumn => {
        const matchedItem = matchCsvColumnToTabelaPreco(csvColumn, tabelaPrecos);
        if (matchedItem) {
            costColumnToItemMap.set(csvColumn, matchedItem);
            console.log(`✅ Match encontrado: "${csvColumn}" → "${matchedItem.descricao}" (${matchedItem.categoria})`);
        } else {
            unmatchedColumns.push(csvColumn);
            console.warn(`⚠️ Match NÃO encontrado para coluna: "${csvColumn}"`);
        }
    });
    
    if (unmatchedColumns.length > 0) {
        console.warn(`ATENÇÃO: ${unmatchedColumns.length} colunas de custo não tiveram match na tabela de preços:`, unmatchedColumns);
        console.log('Itens disponíveis na tabela de preços (para referência):');
        tabelaPrecos.slice(0, 10).forEach(item => {
            console.log(`  - ${item.descricao} (${item.categoria}, precoVenda: ${item.precoVenda})`);
        });
    }
    
    // Find ajustes item (for discrepancies)
    const ajustesItem = tabelaPrecos.find(p => 
        (p.descricao && (p.descricao.toLowerCase().includes('ajuste') || p.descricao.toLowerCase().includes('custos adicionais'))) && 
        p.precoVenda === 1
    ) || tabelaPrecos.find(p => p.descricao === 'Ajustes e Custos Adicionais' && p.precoVenda === 1);
    
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
    
    // Find order ID column in trackReport
    const trackReportOrderIdColumn = findColumnName(rawTrackReport, [
        'Número do pedido',
        'Número do Pedido',
        'Numero do pedido',
        'Numero',
        'Order ID',
        'OrderId',
        'Pedido'
    ]);
    
    if (!trackReportOrderIdColumn) {
        console.error('ERRO: Não foi possível encontrar coluna de número do pedido no Track Report. Colunas disponíveis:', rawTrackReport.length > 0 ? Object.keys(rawTrackReport[0]) : 'N/A');
        throw new Error("Coluna de número do pedido não encontrada no Track Report CSV. Verifique se o arquivo contém uma coluna com o número do pedido.");
    }
    console.log('Coluna de Order ID encontrada no Track Report:', trackReportOrderIdColumn);
    
    // Find tracking column in trackReport
    const trackReportRastreioColumn = findColumnName(rawTrackReport, [
        'Rastreio',
        'Rastreamento',
        'Tracking',
        'Código de Rastreio',
        'Código de rastreio'
    ]) || 'Rastreio'; // Fallback to expected name
    
    console.log('Coluna de Rastreio encontrada no Track Report:', trackReportRastreioColumn);
    
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
            // Log first few orders for debugging
            if (index < 3) {
                console.log(`Order Detail exemplo ${index + 1}:`, {
                    orderId: sanitizedOrderId,
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

    const matchedDetails: DetalheEnvio[] = [];
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    let ordersProcessed = 0;
    let ordersMatched = 0;
    let ordersNotMatched = 0;

    console.log('Iniciando processamento de pedidos...');
    console.log('Total de pedidos no Track Report:', trackReport.length);
    console.log('Total de pedidos no Order Detail Map:', orderDetailMap.size);
    
    // Log first few track report rows for debugging
    trackReport.slice(0, 3).forEach((row, index) => {
        console.log(`Track Report exemplo ${index + 1}:`, {
            orderIdColumn: trackReportOrderIdColumn,
            orderId: row[trackReportOrderIdColumn],
            rastreioColumn: trackReportRastreioColumn,
            rastreio: row[trackReportRastreioColumn] || 'N/A',
            dateColumn: trackReportDateColumn,
            date: row[trackReportDateColumn] || 'N/A'
        });
    });

    trackReport.forEach((trackRow, index) => {
        const rawOrderId = trackRow[trackReportOrderIdColumn];
        if (!rawOrderId) {
            ordersNotMatched++;
            if (index < 3) {
                console.warn(`Track Report linha ${index + 1}: Order ID vazio ou não encontrado na coluna "${trackReportOrderIdColumn}"`);
            }
            return;
        }
        ordersProcessed++;
        
        // Sanitize orderId before matching
        const orderId = sanitizeForFirestore(rawOrderId);
        const orderDetailRow = orderDetailMap.get(orderId);
        
        if (index < 3) {
            console.log(`Processando Track Report linha ${index + 1}:`, {
                rawOrderId,
                sanitizedOrderId: orderId,
                foundInOrderDetail: !!orderDetailRow
            });
        }

        if (orderDetailRow) {
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
                        rastreio: sanitizeForFirestore(trackRow[trackReportRastreioColumn] || orderId),
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
            otherCostColumns.forEach(csvColumn => {
                const costValueStr = orderDetailRow[csvColumn] || '0';
                const costValue = parseFloat(costValueStr.replace(',', '.')) || 0;
                
                if (costValue > 0) {
                    const matchedItem = costColumnToItemMap.get(csvColumn);
                    
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
                        
                        // For specific costs, always use price table value, even if template
                        // Templates with pass-through are only for shipping, not for specific costs
                        if (isSpecificCost) {
                            // Use price from table (custoUnitario + margemLucro), not pass-through
                            const precoCalculado = calculatePrecoVenda(matchedItem);
                            
                            // If it's a template, we need to calculate from custoUnitario directly
                            // because calculatePrecoVenda returns 1 for templates
                            if (isTemplate && matchedItem.custoUnitario > 0) {
                                // Use custoUnitario + margemLucro for templates of specific costs
                                precoUsado = matchedItem.custoUnitario * (1 + (matchedItem.margemLucro || 0) / 100);
                            } else {
                                precoUsado = precoCalculado;
                            }
                            
                            quantidade = 1; // One order/shipment
                            
                            // Log for debugging if CSV value differs significantly from price table
                            if (Math.abs(costValue - precoUsado) > 0.01) {
                                console.log(`ℹ️ Custo específico processado: "${csvColumn}" - Valor CSV: R$ ${costValue.toFixed(2)}, Preço Tabela: R$ ${precoUsado.toFixed(2)}, Qtd: ${quantidade}, Template: ${isTemplate}`);
                            }
                        } else if (isTemplate) {
                            // For other template costs (not specific): pass-through, quantity = costValue, price = 1
                            quantidade = costValue;
                            precoUsado = 1;
                        } else {
                            // For non-template items: check if it's picking/packing
                            const isPickingPacking = isPickingPackingItem(matchedItem);
                            
                            if (isPickingPacking && columnE && columnT) {
                                // For picking/packing: use new logic with column T
                                
                                if (quantidadeItens <= 1) {
                                    // Quantity <= 1: use "pedidos contendo de 0.0 até 1.0 itens" item with margin
                                    if (pickingItem01) {
                                        quantidade = 1;
                                        precoUsado = calculatePrecoVendaForDisplay(pickingItem01);
                                        itemToUse = pickingItem01; // Use pickingItem01 for this order
                                        
                                        if (index < 3) {
                                            console.log(`📦 Picking/Packing (<=1 item) processado: "${csvColumn}" - Quantidade de itens: ${quantidadeItens}, Preço (com margem): R$ ${precoUsado.toFixed(2)}`);
                                        }
                                    } else {
                                        // Fallback to original logic if pickingItem01 not found
                                        quantidade = 1;
                                        const precoCalculado = calculatePrecoVenda(matchedItem);
                                        precoUsado = precoCalculado;
                                        
                                        if (index < 3) {
                                            console.warn(`⚠️ Item de picking (0-1) não encontrado, usando item padrão: "${csvColumn}" - Preço: R$ ${precoCalculado.toFixed(2)}`);
                                        }
                                    }
                                } else {
                                    // Quantity >= 2: use column T value + additional cost
                                    const custoBase = columnTValue; // Cost for 1 unit from column T
                                    const itensAdicionais = quantidadeItens - 1; // Items beyond the first one
                                    
                                    let custoAdicionalTotal = 0;
                                    if (additionalItemCostItem && itensAdicionais > 0) {
                                        const precoItemAdicional = calculatePrecoVendaForDisplay(additionalItemCostItem);
                                        custoAdicionalTotal = itensAdicionais * precoItemAdicional;
                                        
                                        if (index < 3) {
                                            console.log(`➕ Custo adicional calculado: ${itensAdicionais} item(ns) × R$ ${precoItemAdicional.toFixed(2)} = R$ ${custoAdicionalTotal.toFixed(2)}`);
                                        }
                                        
                                        // Create additional item detail for the extra items
                                        currentOrderDetails.push({
                                            id: `draft_${orderId}_item_adicional_${csvColumn.replace(/\s+/g, '_')}`,
                                            cobrancaId: '',
                                            data: dateStr,
                                            rastreio: sanitizeForFirestore(trackRow[trackReportRastreioColumn] || orderId),
                                            codigoPedido: orderId,
                                            tabelaPrecoItemId: additionalItemCostItem.id,
                                            quantidade: itensAdicionais,
                                            cep: cep,
                                            estado: estado
                                        });
                                    }
                                    
                                    // Final picking price = base cost (column T) + additional cost total
                                    const precoFinalPicking = custoBase + custoAdicionalTotal;
                                    quantidade = 1; // Total value already calculated
                                    precoUsado = precoFinalPicking;
                                    
                                    if (index < 3) {
                                        console.log(`📦 Picking/Packing (>=2 itens) processado: "${csvColumn}" - Quantidade de itens: ${quantidadeItens}, Custo base (coluna T): R$ ${custoBase.toFixed(2)}, Custo adicional: R$ ${custoAdicionalTotal.toFixed(2)}, Preço final: R$ ${precoFinalPicking.toFixed(2)}`);
                                    }
                                }
                            } else if (isPickingPacking && columnE && !columnT) {
                                // Fallback: column T not found, use original logic
                                quantidade = quantidadeItens > 0 ? quantidadeItens : 1;
                                const precoCalculado = calculatePrecoVenda(matchedItem);
                                precoUsado = precoCalculado;
                                
                                if (index < 3) {
                                    console.warn(`⚠️ Coluna T não encontrada, usando lógica padrão para picking/packing: "${csvColumn}" - Quantidade: ${quantidade}, Preço: R$ ${precoCalculado.toFixed(2)}`);
                                }
                                
                                // If quantity >= 2, add additional item cost
                                if (quantidade >= 2 && additionalItemCostItem) {
                                    const itensAdicionais = quantidade - 1;
                                    const precoItemAdicional = calculatePrecoVendaForDisplay(additionalItemCostItem);
                                    
                                    if (index < 3) {
                                        console.log(`➕ Custo adicional aplicado: ${itensAdicionais} item(ns) adicional(is) × R$ ${precoItemAdicional.toFixed(2)} = R$ ${(precoItemAdicional * itensAdicionais).toFixed(2)}`);
                                    }
                                    
                                    currentOrderDetails.push({
                                        id: `draft_${orderId}_item_adicional_${csvColumn.replace(/\s+/g, '_')}`,
                                        cobrancaId: '',
                                        data: dateStr,
                                        rastreio: sanitizeForFirestore(trackRow[trackReportRastreioColumn] || orderId),
                                        codigoPedido: orderId,
                                        tabelaPrecoItemId: additionalItemCostItem.id,
                                        quantidade: itensAdicionais,
                                        cep: cep,
                                        estado: estado
                                    });
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
                        const isDifal = csvColumn.toLowerCase().includes('difal');
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
                        
                        currentOrderDetails.push({ 
                            id: `draft_${orderId}_${finalItem.id}_${csvColumn.replace(/\s+/g, '_')}`, 
                            cobrancaId: '', 
                            data: dateStr, 
                            rastreio: sanitizeForFirestore(trackRow[trackReportRastreioColumn] || orderId), 
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
                    // Special handling for non-template shipping items
                    const isShippingItem = item.categoria === 'Envios' || item.categoria === 'Retornos';
                    const isTemplate = isTemplateItem(item);
                    const isNonTemplateShipping = isShippingItem && !isTemplate;
                    
                    let precoVendaCalculado: number;
                    let quantidadeUsada: number;
                    
                    if (isNonTemplateShipping) {
                        // For non-template shipping: quantity = 1, price = value from CSV (stored in quantidade)
                        quantidadeUsada = 1;
                        precoVendaCalculado = detalhe.quantidade; // Use stored CSV value as price
                        if (index < 3) {
                            console.log(`    Detalhe ENVIO (não-template): ${item.descricao} - Qtd: ${quantidadeUsada}, Preço (do CSV): ${precoVendaCalculado}, Total: ${precoVendaCalculado * quantidadeUsada}`);
                        }
                    } else {
                        // For template items or other costs: use display calculation (handles templates of specific costs correctly)
                        precoVendaCalculado = calculatePrecoVendaForDisplay(item);
                        quantidadeUsada = detalhe.quantidade;
                        if (index < 3) {
                            console.log(`    Detalhe: ${item.descricao} - Preço: ${precoVendaCalculado}, Qtd: ${quantidadeUsada}, Total: ${precoVendaCalculado * quantidadeUsada}`);
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
                    subtotalCalculado,
                    totalReal,
                    discrepancy,
                    adicionarAjuste: discrepancy > 0.01 && !!ajustesItem
                });
            }

            if (discrepancy > 0.01 && ajustesItem) {
                currentOrderDetails.push({
                    id: `draft_${orderId}_ajuste`,
                    cobrancaId: '', data: dateStr,
                    rastreio: sanitizeForFirestore(trackRow[trackReportRastreioColumn] || orderId),
                    codigoPedido: orderId,
                    tabelaPrecoItemId: ajustesItem.id,
                    quantidade: discrepancy
                });
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
    console.log('- Total de detalhes criados:', matchedDetails.length);

    const storageItem = tabelaPrecos.find(p => p.categoria === 'Armazenamento');
    if (cliente.unidadesEmEstoque > 0 && storageItem) {
        matchedDetails.push({
            id: `draft_storage_${cliente.id}`, cobrancaId: '', data: storageStartDate,
            rastreio: 'ARMAZENAGEM', codigoPedido: 'ARMAZENAGEM',
            tabelaPrecoItemId: storageItem.id, quantidade: cliente.unidadesEmEstoque
        });
    }
    
    let totalEnvio = 0, totalArmazenagem = 0, totalCustosLogisticos = 0, custoTotal = 0;
    let itemsFound = 0;
    let itemsNotFound = 0;
    
    console.log('Iniciando cálculo de totais...');
    console.log('Total de detalhes para processar:', matchedDetails.length);
    
    // Log first few details for debugging
    matchedDetails.slice(0, 5).forEach((d, index) => {
        console.log(`Detalhe exemplo ${index + 1}:`, {
            id: d.id,
            tabelaPrecoItemId: d.tabelaPrecoItemId,
            quantidade: d.quantidade,
            codigoPedido: d.codigoPedido
        });
    });
    
    matchedDetails.forEach((d, index) => {
        if (!d.tabelaPrecoItemId) {
            itemsNotFound++;
            console.warn(`Detalhe ${index} não tem tabelaPrecoItemId:`, d);
            return;
        }
        
        const item = tabelaPrecos.find(c => c.id === d.tabelaPrecoItemId);
        if (item) {
            itemsFound++;
            
            // Special handling for non-template shipping items
            const isShippingItem = item.categoria === 'Envios' || item.categoria === 'Retornos';
            const isTemplate = isTemplateItem(item);
            const isNonTemplateShipping = isShippingItem && !isTemplate;
            
            let precoVendaCalculado: number;
            let quantidadeUsada: number;
            
            if (isNonTemplateShipping) {
                // For non-template shipping: quantity = 1, price = value from CSV (stored in quantidade)
                quantidadeUsada = 1;
                precoVendaCalculado = d.quantidade; // Use stored CSV value as price
            } else {
                // For template items or other costs: use display calculation (handles templates of specific costs correctly)
                precoVendaCalculado = calculatePrecoVendaForDisplay(item);
                quantidadeUsada = d.quantidade;
            }
            
            const subtotalVenda = precoVendaCalculado * quantidadeUsada;
            
            if (precoVendaCalculado === 0) {
                console.error(`ERRO: Preço calculado é 0 para item ID ${item.id}, descrição: ${item.descricao}, custoUnitario: ${item.custoUnitario}, margemLucro: ${item.margemLucro}`);
            }
            
            // FIX: Correctly calculate cost for pass-through items vs standard items.
            // For pass-through items (price=1, template in desc), the cost *is* the quantity (which holds the value from CSV).
            // For standard items, cost is custoUnitario * quantidade.
            // For non-template shipping, cost is the CSV value (stored in quantidade)
            const isPassThrough = isTemplateItem(item);
            const subtotalCusto = isPassThrough ? d.quantidade : (isNonTemplateShipping ? d.quantidade : item.custoUnitario * d.quantidade);
            custoTotal += subtotalCusto;

            const group = getCostCategoryGroup(item.categoria);
            if (group === 'armazenagem') {
                totalArmazenagem += subtotalVenda;
            } else if (group === 'envio') {
                totalEnvio += subtotalVenda;
            } else {
                totalCustosLogisticos += subtotalVenda;
            }
        } else {
            itemsNotFound++;
            console.error(`ERRO: Item não encontrado na tabela de preços para ID: ${d.tabelaPrecoItemId}, detalhe:`, d);
        }
    });
    
    console.log('Cálculo de totais concluído:');
    console.log('- Itens encontrados:', itemsFound);
    console.log('- Itens não encontrados:', itemsNotFound);
    console.log('- Total Envio:', totalEnvio);
    console.log('- Total Armazenagem:', totalArmazenagem);
    console.log('- Total Custos Logísticos:', totalCustosLogisticos);
    console.log('- Custo Total:', custoTotal);
    
    if (matchedDetails.length > 0 && itemsNotFound > 0) {
        console.error(`ATENÇÃO: ${itemsNotFound} de ${matchedDetails.length} detalhes não tiveram itens encontrados na tabela de preços!`);
    }
    
    if (matchedDetails.length === 0) {
        console.error('ERRO CRÍTICO: Nenhum detalhe foi criado! A fatura terá valores zerados.');
    }

    const cobranca: CobrancaMensal = {
        id: `draft_${Date.now()}`,
        clienteId: clientId, mesReferencia: month,
        dataVencimento: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'Pendente',
        confirmadaPeloCliente: false,
        totalEnvio, totalArmazenagem, totalCustosLogisticos, custoTotal,
        totalCustosExtras: 0,
        totalCustosAdicionais: 0,
        valorTotal: totalArmazenagem + totalEnvio + totalCustosLogisticos,
        urlPlanilhaConferencia: '',
    };
    
    const detectedDateRange = (minDate && maxDate) 
        ? `${minDate.toLocaleDateString('pt-BR')} - ${maxDate.toLocaleDateString('pt-BR')}`
        : "N/A";

    console.log('=== FIM processarFatura ===');
    console.log('Fatura gerada:');
    console.log('- Valor Total:', cobranca.valorTotal);
    console.log('- Total Envio:', cobranca.totalEnvio);
    console.log('- Total Armazenagem:', cobranca.totalArmazenagem);
    console.log('- Total Custos Logísticos:', cobranca.totalCustosLogisticos);
    console.log('- Total de detalhes:', matchedDetails.length);
    console.log('- Range de datas:', detectedDateRange);
    
    if (cobranca.valorTotal === 0 && matchedDetails.length > 0) {
        console.error('ERRO CRÍTICO: Fatura tem valor total zerado mas há detalhes! Verifique os logs acima para identificar o problema.');
    }

    return { cobranca, detalhes: matchedDetails, detectedDateRange };
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

    const filteredTrackData = filterDataByMonth(rawTrackReport, 'Data', month);
    const filteredOrderDetailData = filterDataByMonth(rawOrderDetail, 'Data do pedido', month);

    const filteredTrackContent = stringifyCSV(filteredTrackData);
    const filteredOrderDetailContent = stringifyCSV(filteredOrderDetailData);
    // --- END: Robust Pre-filtering ---

    const prompt = `
        **Tarefa:** Analise os dois relatórios CSV de logística fornecidos para o mês de referência de ${month} e gere uma análise JSON detalhada.

        **Contexto:**
        - Cliente: ${cliente.nome}
        - Mês de Referência para Faturamento: ${month}

        **Arquivos Fornecidos (já pré-filtrados para o mês de ${month}):**
        1.  **Relatório de Rastreio:** Este é o arquivo principal que define QUAIS pedidos devem ser faturados. Use a coluna "Numero" como ID do pedido.
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