/**
 * Restore PRIO Outubro/2025 invoice to R$ 47.705,65
 *
 * - Remaps orphaned tabelaPrecoItemIds on detalhesEnvio to current client table IDs
 * - Adds Maquila custo adicional for the gap
 * - Sets totalEntradaMaterial = 40408.25
 * - Sets cobrança subtotals and valorTotal = 47705.65
 *
 * Run: GOOGLE_APPLICATION_CREDENTIALS=... npx ts-node scripts/restoreOutubroPrio.ts [--apply]
 * Without --apply: dry-run only.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { DetalheEnvio, CustoAdicional, TabelaPrecoItem } from '../types';

if (getApps().length === 0) {
    initializeApp({
        credential: applicationDefault(),
        projectId: 'yoobe-billing-app'
    });
}

const db = getFirestore();

const COBRANCA_ID = '0brP2uwkbxYT4K8I2x96';
const TARGET_VALOR_TOTAL = 47705.65;
const TOTAL_ENTRADA_MATERIAL = 40408.25;

/** Map orphaned detalhe quantity -> (tabelaPrecoItemId key to find in client table by description) */
const QUANTITY_TO_ITEM: { qty: number; descricao: string }[] = [
    { qty: 6, descricao: 'Longarina' },
    { qty: 3, descricao: 'Porta pallet' },
    { qty: 62, descricao: 'Caixa bin' },
    { qty: 3, descricao: 'Pallet' },
    { qty: 6760, descricao: 'Recebimento de ítem externo' },
    { qty: 17, descricao: 'Prateleira p' },
    { qty: 332, descricao: 'Picking standard' }
];

function findItemByDescricao(itens: TabelaPrecoItem[], descricao: string): TabelaPrecoItem | undefined {
    const lower = descricao.toLowerCase();
    return itens.find(
        i =>
            (i.descricao || '').toLowerCase().includes(lower) ||
            (i.subcategoria || '').toLowerCase().includes(lower)
    );
}

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(apply ? '🔧 APPLY mode – will write to Firestore\n' : '🔍 DRY-RUN (use --apply to write)\n');

    const cobRef = db.collection('cobrancasMensais').doc(COBRANCA_ID);
    const cobSnap = await cobRef.get();
    if (!cobSnap.exists) {
        console.error('❌ Cobrança', COBRANCA_ID, 'não encontrada.');
        process.exit(1);
    }

    const clienteId = cobSnap.data()!.clienteId as string;
    const clienteSnap = await db.collection('clientes').doc(clienteId).get();
    const tabelaPrecoId = clienteSnap.data()!.tabelaPrecoId as string | undefined;
    if (!tabelaPrecoId) {
        console.error('❌ Cliente sem tabelaPrecoId.');
        process.exit(1);
    }

    const tabelaSnap = await db.collection('tabelaPrecosClientes').doc(tabelaPrecoId).get();
    const itens: TabelaPrecoItem[] = (tabelaSnap.data()?.itens || []).map((it: TabelaPrecoItem) => ({
        ...it,
        custoUnitario: it.custoUnitario ?? 0
    }));

    const detalhesSnap = await cobRef.collection('detalhesEnvio').get();
    const detalhes = detalhesSnap.docs.map(d => ({ id: d.id, ...d.data() } as DetalheEnvio));

    const custosSnap = await cobRef.collection('custosAdicionais').get();
    const custosAdicionais = custosSnap.docs.map(d => ({ id: d.id, ...d.data() } as CustoAdicional));

    if (detalhes.length !== 7) {
        console.error('❌ Esperados 7 detalhes, encontrados:', detalhes.length);
        process.exit(1);
    }

    const sortedDetalhes = [...detalhes].sort(
        (a, b) => (a.quantidade ?? 0) - (b.quantidade ?? 0) || (a.id || '').localeCompare(b.id || '')
    );
    const sortedSpecs = [...QUANTITY_TO_ITEM].sort(
        (a, b) => a.qty - b.qty || a.descricao.localeCompare(b.descricao)
    );
    const remappedDetalhes: { detalhe: DetalheEnvio; newTabelaPrecoItemId: string }[] = [];
    for (let i = 0; i < sortedDetalhes.length; i++) {
        const detalhe = sortedDetalhes[i];
        const spec = sortedSpecs[i];
        if ((detalhe.quantidade ?? 0) !== spec.qty) {
            console.error('❌ Ordem de quantidades não bate:', detalhe.quantidade, '!=', spec.qty);
            process.exit(1);
        }
        const item = findItemByDescricao(itens, spec.descricao);
        if (!item) {
            console.error('❌ Item não encontrado na tabela:', spec.descricao);
            process.exit(1);
        }
        remappedDetalhes.push({ detalhe, newTabelaPrecoItemId: item.id });
    }

    // Existing custos: 278 + 500 = 778 (both regular). totalCustosAdicionais = 33462 + 778 + maquila = 44145.30 -> maquila = 9905.30
    const maquilaValor = 9905.3;

    let totalArmazenagem = 0;
    let totalCustosAdicionaisFromLineItems = 0;
    for (const { detalhe, newTabelaPrecoItemId } of remappedDetalhes) {
        const item = itens.find(i => i.id === newTabelaPrecoItemId)!;
        const preco = item.precoVenda ?? 0;
        const qty = detalhe.quantidade ?? 0;
        const isRecebimento =
            (item.descricao || '').toLowerCase().includes('recebimento') &&
            (item.descricao || '').toLowerCase().includes('externo');
        const subtotal = preco * qty;
        if (isRecebimento) {
            totalCustosAdicionaisFromLineItems += subtotal;
        } else {
            totalArmazenagem += subtotal;
        }
    }

    const custosRegulares = custosAdicionais.filter(c => !c.isReembolso);
    const reembolsos = custosAdicionais.filter(c => c.isReembolso);
    const totalCustosAdicionaisRegulares = custosRegulares.reduce((s, c) => s + c.valor, 0) + maquilaValor;
    const totalReembolsos = reembolsos.reduce((s, c) => s + c.valor, 0);
    const totalCustosAdicionais =
        totalCustosAdicionaisFromLineItems + totalCustosAdicionaisRegulares - totalReembolsos;
    const valorTotalCalculated = totalArmazenagem + totalCustosAdicionais;

    console.log('--- Antes ---');
    console.log('valorTotal (atual):', cobSnap.data()!.valorTotal);
    console.log('totalEntradaMaterial (atual):', cobSnap.data()!.totalEntradaMaterial ?? 'undefined');
    console.log('');
    console.log('--- Depois (calculado) ---');
    console.log('totalArmazenagem:', totalArmazenagem.toFixed(2));
    console.log('totalCustosAdicionais (linhas + regulares - reembolsos):', totalCustosAdicionais.toFixed(2));
    console.log('valorTotal (calculado):', valorTotalCalculated.toFixed(2));
    console.log('totalEntradaMaterial:', TOTAL_ENTRADA_MATERIAL.toFixed(2));
    console.log('');

    if (Math.abs(valorTotalCalculated - TARGET_VALOR_TOTAL) > 0.02) {
        console.error('❌ valorTotal calculado', valorTotalCalculated.toFixed(2), '!= alvo', TARGET_VALOR_TOTAL);
        process.exit(1);
    }

    if (!apply) {
        console.log('✅ Dry-run OK. Rode com --apply para aplicar.');
        return;
    }

    const batch = db.batch();

    for (const { detalhe, newTabelaPrecoItemId } of remappedDetalhes) {
        batch.update(cobRef.collection('detalhesEnvio').doc(detalhe.id), {
            tabelaPrecoItemId: newTabelaPrecoItemId
        });
    }

    const maquilaCustoId = 'restore-maquila-outubro';
    const hasMaquila = custosAdicionais.some(c => c.id === maquilaCustoId || c.descricao?.includes('Maquila'));
    if (!hasMaquila) {
        batch.set(cobRef.collection('custosAdicionais').doc(maquilaCustoId), {
            descricao: 'Maquila / Custos adicionais Outubro',
            valor: maquilaValor
        });
    }

    batch.update(cobRef, {
        totalEnvio: 0,
        totalArmazenagem: Math.round(totalArmazenagem * 100) / 100,
        totalCustosLogisticos: 0,
        totalCustosAdicionais: Math.round(totalCustosAdicionais * 100) / 100,
        totalCustosExtras: cobSnap.data()!.totalCustosExtras ?? 0,
        totalEntradaMaterial: TOTAL_ENTRADA_MATERIAL,
        valorTotal: TARGET_VALOR_TOTAL,
        custoTotal: TARGET_VALOR_TOTAL
    });

    await batch.commit();
    console.log('✅ Firestore atualizado: detalhes remapeados, custo Maquila adicionado, totais e valorTotal definidos.');
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ Erro:', err);
        process.exit(1);
    });
