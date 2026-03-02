/**
 * Backfill: Recalcular totais das faturas com "entrada de itens externos" em Custos Adicionais.
 *
 * Para cada cobrança: carrega detalhes, custos e tabela do cliente; recalcula totais
 * (recebimento itens externos agora classificado como custosAdicionais); atualiza o documento.
 *
 * Execução: npx ts-node --esm scripts/backfillEntradaItensExternosCategoria.ts
 * Usa scripts/firebase-service-account.json se GOOGLE_APPLICATION_CREDENTIALS não estiver definida.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, 'firebase-service-account.json');
}

if (getApps().length === 0) {
    initializeApp({
        credential: applicationDefault(),
        projectId: 'yoobe-billing-app'
    });
}

const db = getFirestore();

const round2 = (n: number) => Math.round(n * 100) / 100;

// Duplicate grouping logic (entrada itens externos -> custosAdicionais) so script needs no app imports
interface TabelaPrecoItemLike {
    id: string;
    categoria?: string;
    subcategoria?: string;
    descricao?: string;
    precoVenda?: number;
}

function isRecebimentoItensExternosDesc(desc: string): boolean {
    const d = (desc ?? '').toLowerCase();
    return d.includes('recebimento') && (d.includes('ítem externo') || d.includes('item externo') || d.includes('itens externos') || d.includes('material externo'));
}

function isItensRecebidosOuEntrada(item: TabelaPrecoItemLike): boolean {
    if (!item) return false;
    if (isRecebimentoItensExternosDesc(item.descricao ?? '')) return true;
    const desc = (item.descricao ?? '').toLowerCase();
    const sub = (item.subcategoria ?? '').toLowerCase();
    const cat = (item.categoria ?? '').toLowerCase();
    if (cat.includes('retornos') && (desc.includes('itens recebidos') || desc.includes('entrada'))) return true;
    if (desc.includes('itens recebidos') || sub.includes('itens recebidos')) return true;
    if (cat.includes('maquila') && (desc.includes('entrada') || sub.includes('entrada'))) return true;
    if (desc.includes('entrada de material') || desc.includes('entrada de itens')) return true;
    return false;
}

function getCostCategoryGroup(category: string): 'envio' | 'armazenagem' | 'logistico' {
    const catLower = (category ?? '').toLowerCase();
    if (['envios', 'retornos'].some(c => catLower.includes(c))) return 'envio';
    if (catLower.includes('armazenamento') || catLower.includes('armazenagem')) return 'armazenagem';
    return 'logistico';
}

function getCostCategoryGroupForItem(item: TabelaPrecoItemLike): 'envio' | 'armazenagem' | 'logistico' | 'custosAdicionais' {
    if (!item) return 'logistico';
    if (isItensRecebidosOuEntrada(item)) return 'custosAdicionais';
    return getCostCategoryGroup(item.categoria ?? '');
}

interface DetalheLike {
    tabelaPrecoItemId: string | null;
    quantidade: number;
    precoUnitarioManual?: number;
    grupoManual?: 'envio' | 'armazenagem' | 'logistico' | 'custosAdicionais';
}

interface CustoLike {
    valor: number;
    isReembolso?: boolean;
}

function recalcTotals(
    detalhes: DetalheLike[],
    custosAdicionais: CustoLike[],
    tabelaPrecos: TabelaPrecoItemLike[],
    existingTotalCustosExtras: number
): { totalEnvio: number; totalArmazenagem: number; totalCustosLogisticos: number; totalCustosAdicionais: number; totalCustosExtras: number; valorTotal: number; custoTotal: number } {
    let totalEnvio = 0;
    let totalArmazenagem = 0;
    let totalCustosLogisticos = 0;
    let totalCustosAdicionaisFromLineItems = 0;

    detalhes.forEach(d => {
        if (!d.tabelaPrecoItemId) return;
        const item = tabelaPrecos.find(c => c.id === d.tabelaPrecoItemId);
        if (!item) return;

        const group = d.grupoManual ?? getCostCategoryGroupForItem(item);
        const isShipping = (item.categoria === 'Envios' || item.categoria === 'Retornos');
        const precoUnitario = d.precoUnitarioManual != null ? d.precoUnitarioManual : (item.precoVenda ?? 0);
        const quantidadeUsada = isShipping ? 1 : d.quantidade;
        const subtotal = precoUnitario * quantidadeUsada;

        if (group === 'custosAdicionais') totalCustosAdicionaisFromLineItems += subtotal;
        else if (group === 'armazenagem') totalArmazenagem += subtotal;
        else if (group === 'envio') totalEnvio += subtotal;
        else totalCustosLogisticos += subtotal;
    });

    const custosRegulares = custosAdicionais.filter(c => !c.isReembolso);
    const reembolsos = custosAdicionais.filter(c => c.isReembolso);
    const totalCustosRegulares = custosRegulares.reduce((s, c) => s + c.valor, 0);
    const totalReembolsos = reembolsos.reduce((s, c) => s + c.valor, 0);
    const totalCustosAdicionais = totalCustosAdicionaisFromLineItems + totalCustosRegulares - totalReembolsos;
    const totalCustosExtras = existingTotalCustosExtras;
    const valorTotal = totalEnvio + totalArmazenagem + totalCustosLogisticos + totalCustosExtras + totalCustosAdicionais;
    const custoTotal = valorTotal; // simplified for backfill

    return {
        totalEnvio,
        totalArmazenagem,
        totalCustosLogisticos,
        totalCustosAdicionais,
        totalCustosExtras,
        valorTotal,
        custoTotal
    };
}

async function getTabelaPrecosWithAdmin(clienteId: string): Promise<TabelaPrecoItemLike[]> {
    const clienteSnap = await db.collection('clientes').doc(clienteId).get();
    const cliente = clienteSnap.data();
    const tabelaPrecoId = cliente?.tabelaPrecoId;

    if (tabelaPrecoId) {
        const tabelaSnap = await db.collection('tabelaPrecosClientes').doc(tabelaPrecoId).get();
        const tabela = tabelaSnap.data();
        const itens = (tabela?.itens ?? []) as TabelaPrecoItemLike[];
        if (itens.length > 0) return itens;
    }

    const snapshot = await db.collection('tabelaPrecos').get();
    return snapshot.docs.map(doc => {
        const d = doc.data();
        return {
            id: doc.id,
            categoria: d.categoria,
            subcategoria: d.subcategoria,
            descricao: d.descricao,
            precoVenda: d.precoVenda
        };
    });
}

async function backfillEntradaItensExternosCategoria() {
    console.log('🚀 Backfill: Reclassificar entrada itens externos -> Custos Adicionais e recalcular totais...\n');

    const cobrancasSnap = await db.collection('cobrancasMensais').get();
    let updated = 0;
    let errors = 0;

    for (const doc of cobrancasSnap.docs) {
        const cobrancaData = doc.data();
        const clienteId = cobrancaData.clienteId as string;
        if (!clienteId) {
            console.warn(`⏭️  ${doc.id}: sem clienteId, pulando`);
            continue;
        }

        try {
            const [detalhesSnap, custosSnap] = await Promise.all([
                doc.ref.collection('detalhesEnvio').get(),
                doc.ref.collection('custosAdicionais').get()
            ]);

            const detalhes: DetalheLike[] = detalhesSnap.docs.map(d => {
                const data = d.data();
                return {
                    tabelaPrecoItemId: data.tabelaPrecoItemId ?? null,
                    quantidade: Number(data.quantidade ?? 0),
                    precoUnitarioManual: data.precoUnitarioManual != null ? Number(data.precoUnitarioManual) : undefined,
                    grupoManual: data.grupoManual
                };
            });
            const custosAdicionais: CustoLike[] = custosSnap.docs.map(c => {
                const data = c.data();
                return { valor: Number(data.valor ?? 0), isReembolso: data.isReembolso };
            });

            const tabelaPrecos = await getTabelaPrecosWithAdmin(clienteId);
            const existingTotalCustosExtras = Number(cobrancaData.totalCustosExtras ?? 0);

            const totals = recalcTotals(detalhes, custosAdicionais, tabelaPrecos, existingTotalCustosExtras);

            const updates: Record<string, number> = {
                totalEnvio: round2(totals.totalEnvio),
                totalArmazenagem: round2(totals.totalArmazenagem),
                totalCustosLogisticos: round2(totals.totalCustosLogisticos),
                totalCustosAdicionais: round2(totals.totalCustosAdicionais),
                totalCustosExtras: round2(totals.totalCustosExtras),
                valorTotal: round2(totals.valorTotal),
                custoTotal: round2(totals.custoTotal)
            };

            const prevArm = round2(Number(cobrancaData.totalArmazenagem ?? 0));
            const prevAdic = round2(Number(cobrancaData.totalCustosAdicionais ?? 0));
            const changed = updates.totalArmazenagem !== prevArm || updates.totalCustosAdicionais !== prevAdic || updates.valorTotal !== round2(Number(cobrancaData.valorTotal ?? 0));

            if (changed) {
                await doc.ref.update(updates);
                updated++;
                console.log(`📝 ${doc.id}: Armazenagem ${prevArm} -> ${updates.totalArmazenagem}, CustosAdic ${prevAdic} -> ${updates.totalCustosAdicionais}, Total ${updates.valorTotal}`);
            }
        } catch (err) {
            errors++;
            console.error(`❌ ${doc.id}:`, err);
        }
    }

    console.log('\n========================================');
    console.log('📊 RESUMO');
    console.log('========================================');
    console.log(`Total cobranças: ${cobrancasSnap.docs.length}`);
    console.log(`Atualizadas: ${updated}`);
    if (errors > 0) console.log(`Erros: ${errors}`);
    console.log('========================================\n');
    console.log('✅ Backfill concluído.');
}

backfillEntradaItensExternosCategoria()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Erro:', err);
        process.exit(1);
    });
