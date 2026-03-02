/**
 * Backfill Script: Normalizar valores monetários das faturas para 2 casas decimais
 *
 * Atualiza em todas as cobranças existentes:
 * - Cobrança: totalEnvio, totalArmazenagem, totalCustosLogisticos, totalCustosAdicionais,
 *   totalCustosExtras, valorTotal, custoTotal, totalEntradaMaterial
 * - Detalhes: precoUnitarioManual (quando existir)
 * - Custos adicionais: valor
 *
 * Execução: npx ts-node scripts/backfillInvoiceDecimals.ts
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

async function backfillInvoiceDecimals() {
    console.log('🚀 Iniciando backfill de decimais (2 casas) nas faturas...\n');

    const cobrancasRef = db.collection('cobrancasMensais');
    const snapshot = await cobrancasRef.get();

    let totalCobrancas = 0;
    let updatedCobrancas = 0;
    let updatedDetalhes = 0;
    let updatedCustos = 0;

    for (const doc of snapshot.docs) {
        totalCobrancas++;
        const data = doc.data() as Record<string, unknown>;

        const cobrancaUpdates: Record<string, number> = {};
        const monetaryFields = [
            'totalEnvio',
            'totalArmazenagem',
            'totalCustosLogisticos',
            'totalCustosAdicionais',
            'totalCustosExtras',
            'valorTotal',
            'custoTotal',
            'totalEntradaMaterial'
        ] as const;

        for (const field of monetaryFields) {
            const v = data[field];
            if (typeof v === 'number' && !Number.isNaN(v)) {
                const rounded = round2(v);
                if (rounded !== v) cobrancaUpdates[field] = rounded;
            }
        }

        if (Object.keys(cobrancaUpdates).length > 0) {
            await doc.ref.update(cobrancaUpdates);
            updatedCobrancas++;
            console.log(`📝 Cobrança ${doc.id}: atualizados ${Object.keys(cobrancaUpdates).length} campos`);
        }

        const detalhesSnap = await doc.ref.collection('detalhesEnvio').get();
        for (const d of detalhesSnap.docs) {
            const dData = d.data() as Record<string, unknown>;
            const manual = dData.precoUnitarioManual;
            if (typeof manual === 'number' && !Number.isNaN(manual)) {
                const rounded = round2(manual);
                if (rounded !== manual) {
                    await d.ref.update({ precoUnitarioManual: rounded });
                    updatedDetalhes++;
                }
            }
        }

        const custosSnap = await doc.ref.collection('custosAdicionais').get();
        for (const c of custosSnap.docs) {
            const cData = c.data() as Record<string, unknown>;
            const valor = cData.valor;
            if (typeof valor === 'number' && !Number.isNaN(valor)) {
                const rounded = round2(valor);
                if (rounded !== valor) {
                    await c.ref.update({ valor: rounded });
                    updatedCustos++;
                }
            }
        }
    }

    console.log('\n========================================');
    console.log('📊 RESUMO DO BACKFILL DE DECIMAIS');
    console.log('========================================');
    console.log(`Total de faturas: ${totalCobrancas}`);
    console.log(`Faturas com totais atualizados: ${updatedCobrancas}`);
    console.log(`Detalhes (precoUnitarioManual) atualizados: ${updatedDetalhes}`);
    console.log(`Custos adicionais (valor) atualizados: ${updatedCustos}`);
    console.log('========================================\n');
    console.log('✅ Backfill concluído.');
}

backfillInvoiceDecimals()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Erro:', err);
        process.exit(1);
    });
