// FIX: Removed circular dependency import.

export interface TabelaPrecoItem {
    id: string;
    categoria: string;
    subcategoria: string;
    descricao: string; // "Descrição do Custo" from CSV
    metrica: string; // "Métrica" from CSV
    custoUnitario: number; // The base cost of the service
    margemLucro: number; // Profit margin in percentage (e.g., 20 for 20%)
    precoVenda: number; // "Preço Unitário" from CSV, becomes the final sale price
}

export interface CustoAdicional {
    id: string;
    descricao: string;
    valor: number;
}


export interface Cliente {
    id: string;
    nome: string;
    cnpj: string;
    email: string; // Used for login
    emailFaturamento?: string; // Used for invoice matching
    role: 'admin' | 'client';
    skusAtivos: number;
    unidadesEmEstoque: number;
    logoUrl?: string;
    password?: string;
    tabelaPrecoId?: string; // ID da tabela de preços personalizada (se existir)
}

export interface TabelaPrecoCliente {
    id: string;
    clienteId: string;
    nome: string; // Nome descritivo da tabela
    itens: TabelaPrecoItem[];
    baseadaEm: 'padrao' | string; // ID da tabela base ou 'padrao'
    dataCriacao: string;
    dataAtualizacao: string;
}

export interface CobrancaMensal {
    id: string;
    clienteId: string;
    mesReferencia: string; // e.g., "Agosto/2024"
    dataVencimento: string; // e.g., "2024-09-10"
    valorTotal: number;
    totalEnvio: number;
    totalArmazenagem: number;
    totalCustosLogisticos: number; // Added to separate operational costs from shipping
    totalCustosAdicionais?: number;
    custoTotal: number; // Based on the new model, this will mirror valorTotal.
    status: 'Pendente' | 'Enviada' | 'Paga' | 'Vencido';
    confirmadaPeloCliente?: boolean;
    totalCustosExtras?: number; // Added for costs from CSV 'Total' not covered by itemization
    urlLinkPagamento?: string;
    urlNotaFiscal?: string;
    urlCompartilhamento?: string; // Shareable link for the client portal view
    urlPlanilhaConferencia?: string; // Link to a verification spreadsheet or other documents
    relatorioRastreioCSV?: string; // Renamed from relatorioEnviosCSV
    relatorioCustosCSV?: string; // Added for audit purposes
}

export interface DetalheEnvio {
    id: string;
    cobrancaId: string;
    data: string; // e.g., "2024-08-15"
    rastreio: string;
    codigoPedido: string;
    tabelaPrecoItemId: string | null;
    quantidade: number;
    cep?: string; // CEP do destino (coluna M do CSV de custos)
    estado?: string; // Estado/UF do destino (coluna O do CSV de custos)
}

export interface AIAnalysis {
    summary: string;
    trackReportRows: number;
    orderDetailRows: number;
    clientOrdersFound: number;
    unmatchedTrackOrderIds: string[];
    unmatchedDetailOrderIds: string[];
    totalValueFromMatchedOrders: number;
    error?: string;
}

export interface FaqItem {
    id: string;
    pergunta: string;
    resposta: string;
    ordem?: number;
}

export interface GeneralSettings {
    id: 'general'; // Singleton document
    logoUrl?: string;
    contactEmail?: string;
}
