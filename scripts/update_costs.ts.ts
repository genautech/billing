import { db } from '../services/firebase';

async function updateSpecificCosts() {
    console.log('🚀 Iniciando atualização cirúrgica de custos...');
    
    // Lista de custos identificados no Order Detail (9)
    const updates = [
        { desc: 'picking', novoCusto: 5.36 },
        { desc: 'difal', novoCusto: 2.00 },
        { desc: 'entrada de material', novoCusto: 4.87 },
        { desc: 'longarina', novoCusto: 30.20 }
    ];

    const tablesSnapshot = await db.collection('tabelasPrecos').get();
    
    for (const tableDoc of tablesSnapshot.docs) {
        const tableData = tableDoc.data();
        if (!tableData.itens || !Array.isArray(tableData.itens)) continue;

        let hasChanges = false;
        const updatedItens = tableData.itens.map(item => {
            const matchingUpdate = updates.find(u => 
                item.descricao?.toLowerCase().includes(u.desc)
            );

            if (matchingUpdate) {
                console.log(`✅ Atualizando [${tableData.nome || tableDoc.id}] -> ${item.descricao}: R$ ${item.custoUnitario} -> R$ ${matchingUpdate.novoCusto}`);
                hasChanges = true;
                
                // Atualiza custo e recalcula preço de venda mantendo a margem
                const novoCusto = matchingUpdate.novoCusto;
                const margem = item.margemLucro || 0;
                const novoPrecoVenda = novoCusto * (1 + margem / 100);
                
                return {
                    ...item,
                    custoUnitario: novoCusto,
                    precoVenda: novoPrecoVenda
                };
            }
            return item;
        });

        if (hasChanges) {
            await tableDoc.ref.update({ itens: updatedItens });
            console.log(`💾 Tabela [${tableData.nome || tableDoc.id}] salva com sucesso.`);
        }
    }
    
    console.log('✨ Atualização concluída sem alterar itens não listados.');
}

updateSpecificCosts().catch(console.error);
