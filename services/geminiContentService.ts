import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Cache para conteúdo gerado
const contentCache = new Map<string, { content: string; timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

interface InfographicData {
    steps: Array<{
        title: string;
        description: string;
        icon: string;
    }>;
    difalFlow: {
        origem: string;
        destino: string;
        calculo: string;
        aplicacao: string;
    };
    estados: string[];
}

/**
 * Gera conteúdo explicativo sobre cobranças mensais usando Gemini AI
 */
export const generateBillingExplanationContent = async (): Promise<string> => {
    const cacheKey = 'billing-explanation';
    const cached = contentCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.content;
    }

    const prompt = `
        Crie um texto explicativo claro e profissional em português do Brasil sobre como funcionam as cobranças mensais em um sistema de logística da Yoobe.
        
        O texto deve explicar:
        1. Cobranças de envios - como são calculadas e quando são aplicadas
        2. Cobranças de armazenagem - como o espaço ocupado é medido e cobrado
        3. Cobranças de adicionais - quando e por que custos adicionais são aplicados
        4. Entrada de material externo - quando este custo é aplicado (quando a produção não é feita pela Yoobe) e que quando o produto é providenciado pela Yoobe este custo não é cobrado
        
        O texto deve ser direto, fácil de entender para departamentos de compras, e destacar a transparência do processo.
        Use o nome "Yoobe" ao se referir à empresa.
        Use no máximo 500 palavras.
        
        **IMPORTANTE - Formato do Conteúdo:**
        - NÃO inclua assinaturas, saudações finais (como "Atenciosamente", "Cordialmente", etc.)
        - NÃO use placeholders como [Seu Nome], [Nome da Empresa], [Seu Contato], [Email], etc.
        - NÃO inclua informações de contato ou dados fictícios
        - O conteúdo deve ser puramente informativo e terminar diretamente após a explicação
        - Use apenas informações reais da Yoobe quando necessário
        - O texto deve ser autocontido e completo, sem necessidade de fechamentos formais
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        const content = response.text;
        contentCache.set(cacheKey, { content, timestamp: Date.now() });
        return content;
    } catch (error) {
        console.error('Error generating billing explanation:', error);
        // Fallback para conteúdo estático
        return `As cobranças mensais são divididas em três categorias principais:

**Cobranças de Envios**: Refere-se aos custos de frete para transportar pedidos do nosso armazém até o destino final. O valor é calculado com base no peso, dimensões (peso cúbico) e na localidade de entrega (capital, interior, etc.). Cada etiqueta de envio gerada representa uma cobrança.

**Cobranças de Armazenagem**: Custo para manter seus produtos em nosso estoque de forma segura. É calculado com base no espaço ocupado (por posição de pallet, prateleira, bin, etc.) ou por unidade de produto, medido durante um período específico.

**Cobranças de Adicionais**: Agrupa custos adicionais como impostos (ex: DIFAL), seguro de envio, taxas de manuseio para itens frágeis ou custos de devolução (logística reversa). Cada um é detalhado na fatura quando aplicável.

Todas as cobranças são transparentes e detalhadas em suas faturas mensais, permitindo total visibilidade dos custos operacionais.`;
    }
};

/**
 * Gera explicação detalhada sobre DIFAL usando Gemini AI
 */
export const generateDIFALExplanation = async (): Promise<string> => {
    const cacheKey = 'difal-explanation';
    const cached = contentCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.content;
    }

    const prompt = `
        Crie uma explicação detalhada e clara em português do Brasil sobre o DIFAL (Diferencial de Alíquota do ICMS) no contexto de logística e e-commerce.
        
        A explicação deve cobrir:
        1. O que é o DIFAL e por que existe
        2. Como é calculado no processo de envio
        3. Quando é aplicado (origem e destino)
        4. Como a Yoobe processa e cobra o DIFAL de forma transparente
        5. Como aparece nas notas fiscais de envio
        
        O texto deve ser técnico mas acessível, adequado para departamentos de compras e contabilidade.
        Use no máximo 600 palavras.
        
        **IMPORTANTE - Formato do Conteúdo:**
        - NÃO inclua assinaturas, saudações finais (como "Atenciosamente", "Cordialmente", etc.)
        - NÃO use placeholders como [Seu Nome], [Nome da Empresa], [Seu Contato], [Email], etc.
        - NÃO inclua informações de contato ou dados fictícios
        - O conteúdo deve ser puramente informativo e terminar diretamente após a explicação
        - Use apenas informações reais da Yoobe quando necessário
        - O texto deve ser autocontido e completo, sem necessidade de fechamentos formais
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        const content = response.text;
        contentCache.set(cacheKey, { content, timestamp: Date.now() });
        return content;
    } catch (error) {
        console.error('Error generating DIFAL explanation:', error);
        // Fallback para conteúdo estático
        return `O DIFAL (Diferencial de Alíquota do ICMS) é um mecanismo tributário que garante que o estado de destino receba a diferença entre as alíquotas de ICMS quando há variação entre estados.

**Como funciona**: Quando um produto é enviado de um estado para outro, e as alíquotas de ICMS são diferentes, o DIFAL é calculado para compensar essa diferença. O estado de destino recebe a parte que lhe cabe do imposto.

**No processo da Yoobe**: 
- Calculamos o DIFAL automaticamente para cada envio baseado na origem (nossa localização) e destino (CEP do cliente final)
- O valor é incluído na nota fiscal de envio de forma transparente
- A cobrança aparece separadamente na fatura mensal, permitindo rastreabilidade completa

**Transparência**: Todos os envios incluem a nota fiscal com o DIFAL calculado, e na sua fatura mensal você pode ver exatamente quanto foi cobrado de DIFAL em cada pedido, facilitando a conciliação contábil.`;
    }
};

/**
 * Gera insights e sugestões para a calculadora de custos usando Gemini AI
 */
export const generateCalculatorInsights = async (
    quantidadeEstoque: number,
    palletsUsados: number,
    binsUsados: number,
    valorSeguro: number,
    custoTotal: number,
    quantidadeEntradaMaterial?: number,
    custoEntradaMaterial?: number
): Promise<string> => {
    const entradaMaterialText = quantidadeEntradaMaterial && quantidadeEntradaMaterial > 0
        ? `- Quantidade de entrada de material: ${quantidadeEntradaMaterial}
        - Custo de entrada de material: R$ ${(custoEntradaMaterial || 0).toFixed(2)}`
        : '';

    const entradaMaterialContext = quantidadeEntradaMaterial && quantidadeEntradaMaterial > 0
        ? `\n\nIMPORTANTE - Contexto sobre Entrada de Material Externo:
        O custo de entrada de material externo ocorre quando a produção não é realizada pela Yoobe. 
        Quando o produto é providenciado pela Yoobe, este custo não é cobrado, pois a integração elimina 
        a necessidade de processamento manual de entrada. Ao gerar insights sobre este custo, mencione 
        de forma sutil e profissional que considerar a produção pela Yoobe pode eliminar este custo 
        adicional e otimizar a operação logística. Seja educado e não insista, apenas sugira como uma 
        oportunidade de otimização.`
        : '';

    const prompt = `
        Você é um consultor especializado em logística da Yoobe. Com base nos seguintes dados de cálculo de custos de logística:
        - Quantidade em estoque: ${quantidadeEstoque}
        - Pallets usados: ${palletsUsados}
        - Bins usados: ${binsUsados}
        - Valor do seguro: R$ ${valorSeguro.toFixed(2)}
        ${entradaMaterialText}
        - Custo total estimado: R$ ${custoTotal.toFixed(2)}
        ${entradaMaterialContext}
        
        Gere insights úteis e sugestões em português do Brasil (máximo 200 palavras) sobre:
        1. Otimizações possíveis no uso de espaço
        2. Comparação com médias do setor (se aplicável)
        3. Dicas para reduzir custos de armazenagem
        4. Observações sobre o seguro
        ${quantidadeEntradaMaterial && quantidadeEntradaMaterial > 0 ? '5. Sobre custos de entrada de material externo: explique que este custo ocorre quando a produção não é feita pela Yoobe, e que quando o produto é providenciado pela Yoobe este custo não é cobrado. Sugira sutilmente considerar produção pela Yoobe para eliminar este custo adicional.' : ''}
        
        Seja objetivo, prático e profissional. Use o nome "Yoobe" ao se referir à empresa.
        
        **IMPORTANTE - Formato do Conteúdo:**
        - NÃO inclua assinaturas, saudações finais (como "Atenciosamente", "Cordialmente", etc.)
        - NÃO use placeholders como [Seu Nome], [Nome da Empresa], [Seu Contato], [Email], etc.
        - NÃO inclua informações de contato ou dados fictícios
        - O conteúdo deve ser apenas insights e sugestões práticas, terminando diretamente após os insights
        - Use apenas informações reais da Yoobe quando necessário
        - O texto deve ser autocontido e completo, sem necessidade de fechamentos formais
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        console.error('Error generating calculator insights:', error);
        const entradaMaterialFallback = quantidadeEntradaMaterial && quantidadeEntradaMaterial > 0
            ? `\n\n**Sobre Entrada de Material Externo**: O custo de entrada de material externo (R$ ${(custoEntradaMaterial || 0).toFixed(2)}) ocorre quando a produção não é realizada pela Yoobe. Quando o produto é providenciado pela Yoobe, este custo não é cobrado, pois a integração elimina a necessidade de processamento manual. Considere avaliar a possibilidade de produção pela Yoobe para eliminar este custo adicional e otimizar sua operação logística.`
            : '';

        return `Com base nos valores informados, o custo total estimado é de R$ ${custoTotal.toFixed(2)}. 
        
Para otimizar custos, considere revisar a organização do estoque para maximizar o uso de pallets e reduzir bins quando possível. O seguro representa uma proteção importante para seus produtos durante o armazenamento.${entradaMaterialFallback}`;
    }
};

/**
 * Gera estrutura de dados para o infográfico de tributação usando Gemini AI
 */
export const generateInfographicData = async (): Promise<InfographicData> => {
    const cacheKey = 'infographic-data';
    const cached = contentCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return JSON.parse(cached.content);
    }

    const prompt = `
        Crie uma estrutura JSON para um infográfico sobre o processo de tributação DIFAL no envio de produtos.
        
        A estrutura deve ter:
        1. "steps": array de objetos com {title, description, icon} representando as etapas do processo de envio até a geração do DIFAL
        2. "difalFlow": objeto com {origem, destino, calculo, aplicacao} explicando o fluxo do DIFAL
        3. "estados": array de strings com os principais estados envolvidos na tributação
        
        Responda ESTRITAMENTE em JSON válido, sem texto adicional.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        steps: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    icon: { type: Type.STRING }
                                }
                            }
                        },
                        difalFlow: {
                            type: Type.OBJECT,
                            properties: {
                                origem: { type: Type.STRING },
                                destino: { type: Type.STRING },
                                calculo: { type: Type.STRING },
                                aplicacao: { type: Type.STRING }
                            }
                        },
                        estados: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    }
                }
            }
        });

        const data = JSON.parse(response.text);
        contentCache.set(cacheKey, { content: JSON.stringify(data), timestamp: Date.now() });
        return data;
    } catch (error) {
        console.error('Error generating infographic data:', error);
        // Fallback para dados estáticos
        return {
            steps: [
                {
                    title: 'Pedido Recebido',
                    description: 'Cliente final faz pedido e o sistema identifica origem e destino',
                    icon: '📦'
                },
                {
                    title: 'Cálculo de Tributação',
                    description: 'Sistema calcula DIFAL baseado nas alíquotas de ICMS dos estados',
                    icon: '🧮'
                },
                {
                    title: 'Geração da Nota Fiscal',
                    description: 'Nota fiscal de envio é gerada incluindo o DIFAL calculado',
                    icon: '📄'
                },
                {
                    title: 'Envio e Cobrança',
                    description: 'Produto é enviado e o DIFAL aparece na fatura mensal do cliente',
                    icon: '🚚'
                }
            ],
            difalFlow: {
                origem: 'Estado de origem (onde está o armazém)',
                destino: 'Estado de destino (onde está o cliente final)',
                calculo: 'Diferença entre alíquotas de ICMS dos dois estados',
                aplicacao: 'Aplicado automaticamente em cada envio interestadual'
            },
            estados: ['SP', 'RJ', 'MG', 'RS', 'PR', 'SC', 'BA', 'GO']
        };
    }
};

