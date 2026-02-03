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
    categoria?: 'Armazenagem' | 'Maquila/Entrada' | 'Estoque' | 'Logístico' | 'Outro';
    isReembolso?: boolean; // Marca este custo como reembolso (valor será subtraído do total)
    motivoReembolso?: string; // Justificativa do reembolso
}

export interface CustoManualPreset {
    id: string;
    descricao: string;
    valor: number;
    categoria: 'Armazenagem' | 'Maquila/Entrada' | 'Estoque' | 'Logístico' | 'Outro';
    ativo?: boolean;
    createdAt?: string;
    updatedAt?: string;
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
    posicoesLongarina?: number;
    posicoesPrateleira?: number;
    posicoesPrateleiraM?: number;
    posicoesPrateleiraP?: number;
    posicoesPallet?: number;
    posicoesCesto?: number;
    posicoesCaixaBin?: number;
    posicoesMiniCaixote?: number;
    posicoesDamaged?: number;
    posicoesPickingStandard?: number;
    posicoesPortaPallet?: number;
    skusEntradaMaterial?: number;
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
    quantidadeEnvios?: number; // Total number of shipments charged
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
    notaFiscalUrl?: string; // URL do arquivo no Storage
    notaFiscalFileName?: string; // Nome original do arquivo
    explicacaoNotaFiscal?: string; // Explicação gerada pelo Gemini
    comprovantesDifal?: ComprovanteDifal[]; // Comprovantes de pagamento DIFAL extraídos de XMLs
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
    paymentBankName?: string;
    paymentBankAgency?: string;
    paymentBankAccount?: string;
    paymentBankAccountType?: string; // 'corrente' | 'poupanca'
    paymentPixKey?: string;
    paymentContactName?: string;
    paymentContactEmail?: string;
    paymentContactPhone?: string;
}

export interface DocumentoPedido {
    id: string;
    cobrancaId: string;
    clienteId: string;
    mesReferencia: string;
    fileName: string;
    fileUrl: string;
    uploadDate: string;
    tipo: 'pedido' | 'nota-fiscal';
}

// Item resumido de custo adicional para exibição no resumo
export interface CustoAdicionalResumo {
    descricao: string;
    valor: number;
    categoria?: string;
    isReembolso?: boolean;
    motivoReembolso?: string;
}

// Item resumido de entrada de material para exibição no resumo
export interface EntradaMaterialResumo {
    descricao: string;
    quantidade: number;
    valorTotal: number;
}

// Resumo pré-aprovação da fatura gerada
export interface InvoiceSummary {
    totalPedidosEncontrados: number;
    totalPedidosUnicos: number;
    totalEnvios: number;
    quantidadeEnvios: number; // Total number of shipments charged
    totalDifal: number;
    quantidadeDifal: number;
    totalArmazenagem: number;
    totalCustosLogisticos: number;
    totalGeral: number;
    periodoDetectado: string;
    tabela: 'cliente' | 'global';
    clienteNome: string;
    mesReferencia: string;
    pedidosSemMatch: string[];
    warnings: string[];
    // Novos campos para detalhamento
    custosAdicionaisDetalhados?: CustoAdicionalResumo[]; // Lista de custos adicionais individuais
    entradasMaterial?: EntradaMaterialResumo[]; // Lista de entradas de material
    totalReembolsos?: number; // Total de reembolsos (valores negativos)
    quantidadeReembolsos?: number; // Quantidade de itens de reembolso
}

// Comprovante de DIFAL extraído de XML de NF-e
export interface ComprovanteDifal {
    id: string;
    cobrancaId: string;
    clienteId?: string;
    chaveNFe: string; // 44 dígitos da chave de acesso
    dataEmissao: string; // dhEmi do XML
    valorNF: number; // vNF do XML
    valorICMSUFDest: number; // vICMSUFDest do XML
    valorFCPUFDest?: number; // vFCPUFDest do XML
    nomeDestinatario?: string; // xNome do destinatário
    pedidoRelacionado?: string; // Pedido que originou o DIFAL (opcional)
    emailRelacionado?: string; // Email associado (opcional)
    xmlFileName: string; // Nome do arquivo original
    xmlDriveId?: string; // ID do arquivo no Google Drive (se aplicável)
    uploadDate: string;
}
