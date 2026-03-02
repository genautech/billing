/**
 * Backfill Script: Definir totalEntradaMaterial nas faturas da PRIO
 *
 * Atualiza totalEntradaMaterial para:
 * - Outubro/2025 → R$ 40.408,25 (custos de entrada na fatura como Armazenamento)
 * - Janeiro/2026 e Fevereiro/2026 → valores opcionais via env
 *
 * Execução:
 * 1. export GOOGLE_APPLICATION_CREDENTIALS="/caminho/para/serviceAccountKey.json"
 * 2. Opcional: PRIO_CLIENT_ID=xxx (se não informado, busca cliente cujo nome contém "PRIO")
 * 3. Opcional: JAN_VAL=1234.56 FEV_VAL=5678.90 (valores para Jan e Fev em reais)
 * 4. npx ts-node scripts/backfillEntradaMaterialPrio.ts
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
    initializeApp({
        credential: applicationDefault(),
        projectId: 'yoobe-billing-app'
    });
}

const db = getFirestore();

interface ClienteDoc {
    id: string;
    nome?: string;
}

interface CobrancaDoc {
    id: string;
    clienteId?: string;
    mesReferencia?: string;
}

async function backfillEntradaMaterialPrio() {
    console.log('🚀 Backfill totalEntradaMaterial - PRIO\n');

    const clienteIdFromEnv = process.env.PRIO_CLIENT_ID;
    const janVal = process.env.JAN_VAL != null ? parseFloat(process.env.JAN_VAL) : undefined;
    const fevVal = process.env.FEV_VAL != null ? parseFloat(process.env.FEV_VAL) : undefined;

    let clienteId: string;

    if (clienteIdFromEnv) {
        clienteId = clienteIdFromEnv;
        console.log(`📌 Usando PRIO_CLIENT_ID: ${clienteId}\n`);
    } else {
        const clientesSnap = await db.collection('clientes').get();
        const prio = clientesSnap.docs.find(d => {
            const data = d.data() as ClienteDoc;
            return (data.nome || '').toUpperCase().includes('PRIO');
        });
        if (!prio) {
            console.error('❌ Cliente PRIO não encontrado. Defina PRIO_CLIENT_ID ou certifique-se de existir um cliente com "PRIO" no nome.');
            process.exit(1);
        }
        clienteId = prio.id;
        console.log(`📌 Cliente PRIO encontrado: ${(prio.data() as ClienteDoc).nome} (${clienteId})\n`);
    }

    const cobrancasSnap = await db.collection('cobrancasMensais').where('clienteId', '==', clienteId).get();
    const updates: { mesReferencia: string; totalEntradaMaterial: number }[] = [
        { mesReferencia: 'Outubro/2025', totalEntradaMaterial: 40408.25 }
    ];
    if (janVal != null && !Number.isNaN(janVal)) {
        updates.push({ mesReferencia: 'Janeiro/2026', totalEntradaMaterial: janVal });
    }
    if (fevVal != null && !Number.isNaN(fevVal)) {
        updates.push({ mesReferencia: 'Fevereiro/2026', totalEntradaMaterial: fevVal });
    }

    const byMes = new Map(updates.map(u => [u.mesReferencia, u.totalEntradaMaterial]));
    let updated = 0;

    for (const doc of cobrancasSnap.docs) {
        const data = doc.data() as CobrancaDoc;
        const mes = data.mesReferencia;
        if (!mes || !byMes.has(mes)) continue;
        const value = byMes.get(mes)!;
        await doc.ref.update({ totalEntradaMaterial: value });
        updated++;
        console.log(`📝 ${doc.id} (${mes}): totalEntradaMaterial = ${value.toFixed(2)}`);
    }

    console.log('\n========================================');
    console.log('📊 RESUMO');
    console.log('========================================');
    console.log(`Faturas atualizadas: ${updated}`);
    console.log('========================================\n');
    console.log('✅ Backfill concluído.');
}

backfillEntradaMaterialPrio()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Erro:', err);
        process.exit(1);
    });
