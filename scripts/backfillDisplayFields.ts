/**
 * Backfill Script: Preencher campos display em faturas existentes
 * 
 * Este script preenche:
 * - quantidadeEnviosDisplay = quantidadeEnvios (se não existir)
 * - periodoCobranca = mesReferencia (se não existir)
 * 
 * Execução:
 * 1. Defina a variável de ambiente: export GOOGLE_APPLICATION_CREDENTIALS="/caminho/para/serviceAccountKey.json"
 * 2. Execute: npx ts-node scripts/backfillDisplayFields.ts
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin with application default credentials
if (getApps().length === 0) {
    initializeApp({
        credential: applicationDefault(),
        projectId: 'yoobe-billing-app'
    });
}

const db = getFirestore();

interface CobrancaMensal {
    id: string;
    mesReferencia?: string;
    quantidadeEnvios?: number;
    quantidadeEnviosDisplay?: number;
    periodoCobranca?: string;
}

async function backfillDisplayFields() {
    console.log('🚀 Iniciando backfill de campos display...\n');
    
    const cobrancasRef = db.collection('cobrancasMensais');
    const snapshot = await cobrancasRef.get();
    
    let total = 0;
    let updated = 0;
    let skipped = 0;
    
    console.log(`📋 Encontradas ${snapshot.docs.length} faturas para processar\n`);
    
    for (const doc of snapshot.docs) {
        total++;
        const data = doc.data() as CobrancaMensal;
        const updates: Record<string, any> = {};
        
        // Se quantidadeEnviosDisplay não existe, copiar de quantidadeEnvios
        if (data.quantidadeEnviosDisplay === undefined || data.quantidadeEnviosDisplay === null) {
            updates.quantidadeEnviosDisplay = data.quantidadeEnvios ?? 0;
        }
        
        // Se periodoCobranca não existe, copiar de mesReferencia
        if (!data.periodoCobranca && data.mesReferencia) {
            updates.periodoCobranca = data.mesReferencia;
        }
        
        // Se há algo para atualizar
        if (Object.keys(updates).length > 0) {
            await doc.ref.update(updates);
            updated++;
            console.log(`📝 ${doc.id}: quantidadeEnviosDisplay=${updates.quantidadeEnviosDisplay ?? 'N/A'}, periodoCobranca=${updates.periodoCobranca ?? 'N/A'}`);
        } else {
            skipped++;
            console.log(`⏭️  ${doc.id}: Campos já preenchidos, pulando...`);
        }
    }
    
    console.log('\n========================================');
    console.log('📊 RESUMO DO BACKFILL');
    console.log('========================================');
    console.log(`Total de faturas: ${total}`);
    console.log(`Atualizadas: ${updated}`);
    console.log(`Já preenchidas (ignoradas): ${skipped}`);
    console.log('========================================\n');
    
    console.log('✅ Backfill concluído com sucesso!');
}

// Executar
backfillDisplayFields()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Erro durante backfill:', error);
        process.exit(1);
    });
