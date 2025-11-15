# Configuração e Verificações do Firebase

Este documento contém as verificações e configurações necessárias no Firebase antes do deploy em produção.

## Estrutura do Firestore

### Collections Principais

1. **`clientes`**
   - Dados dos clientes e administradores
   - Campos: `nome`, `cnpj`, `email`, `emailFaturamento`, `role`, `skusAtivos`, `unidadesEmEstoque`, `logoUrl`, `password`, `tabelaPrecoId`

2. **`tabelaPrecos`**
   - Tabela de preços global
   - Campos: `categoria`, `subcategoria`, `descricao`, `custoUnitario`, `margemLucro`, `precoVenda`, `metrica`, etc.

3. **`tabelaPrecosClientes`**
   - Tabelas de preços personalizadas por cliente
   - Campos: `clienteId`, `itens`, `dataCriacao`, `dataAtualizacao`

4. **`cobrancasMensais`**
   - Faturas mensais
   - Campos: `clienteId`, `mesReferencia`, `dataVencimento`, `valorTotal`, `status`, etc.

5. **`configuracoes`**
   - Configurações gerais do sistema
   - Documento único com configurações globais

6. **`faq`**
   - Perguntas frequentes
   - Campos: `pergunta`, `resposta`, `ordem`

### Subcollections

1. **`cobrancasMensais/{id}/detalhesEnvio`**
   - Detalhes de cada envio da fatura
   - Campos: `data`, `rastreio`, `codigoPedido`, `estado`, `cep`, `quantidade`, `tabelaPrecoItemId`, etc.

2. **`cobrancasMensais/{id}/custosAdicionais`**
   - Custos adicionais da fatura
   - Campos: `descricao`, `valor`

## Regras de Segurança do Firestore

⚠️ **IMPORTANTE**: Configure as regras de segurança antes do deploy em produção!

### Regras Recomendadas (Modo Desenvolvimento)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir leitura/escrita para todos (APENAS PARA DESENVOLVIMENTO)
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Regras Recomendadas (Produção)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function para verificar se é admin
    function isAdmin() {
      return request.auth != null && 
             get(/databases/$(database)/documents/clientes/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Helper function para verificar se é o próprio cliente
    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }
    
    // Clientes
    match /clientes/{clienteId} {
      allow read: if isAdmin() || isOwner(clienteId);
      allow write: if isAdmin();
    }
    
    // Tabela de Preços
    match /tabelaPrecos/{itemId} {
      allow read: if true; // Todos podem ler
      allow write: if isAdmin();
    }
    
    // Tabela de Preços por Cliente
    match /tabelaPrecosClientes/{tableId} {
      allow read: if isAdmin() || 
                     resource.data.clienteId == request.auth.uid;
      allow write: if isAdmin();
    }
    
    // Cobranças Mensais
    match /cobrancasMensais/{cobrancaId} {
      allow read: if isAdmin() || 
                     resource.data.clienteId == request.auth.uid;
      allow write: if isAdmin();
      
      // Subcollections
      match /detalhesEnvio/{detalheId} {
        allow read: if isAdmin() || 
                       get(/databases/$(database)/documents/cobrancasMensais/$(cobrancaId)).data.clienteId == request.auth.uid;
        allow write: if isAdmin();
      }
      
      match /custosAdicionais/{custoId} {
        allow read: if isAdmin() || 
                       get(/databases/$(database)/documents/cobrancasMensais/$(cobrancaId)).data.clienteId == request.auth.uid;
        allow write: if isAdmin();
      }
    }
    
    // Configurações
    match /configuracoes/{configId} {
      allow read: if true; // Todos podem ler configurações
      allow write: if isAdmin();
    }
    
    // FAQ
    match /faq/{faqId} {
      allow read: if true; // Todos podem ler FAQ
      allow write: if isAdmin();
    }
  }
}
```

**Nota**: As regras acima assumem autenticação Firebase. Como o sistema atual usa autenticação customizada (email/password), você precisará adaptar as regras ou implementar Firebase Authentication.

## Índices Necessários

O Firestore pode solicitar a criação de índices compostos automaticamente quando você executar queries. Os índices mais comuns que podem ser necessários:

### Collection: `clientes`
- Campo: `email` (query: `where("email", "==", ...)`)

### Collection: `cobrancasMensais`
- Campos: `clienteId`, `mesReferencia` (query: `where("clienteId", "==", ...).where("mesReferencia", "==", ...)`)
- Campos: `clienteId`, `status` (query: `where("clienteId", "==", ...).where("status", "==", ...)`)

### Collection: `tabelaPrecosClientes`
- Campos: `clienteId`, `dataCriacao` (query: `where("clienteId", "==", ...).orderBy("dataCriacao", "desc")`)

**Como criar índices:**
1. Quando uma query falhar, o Firestore mostrará um link no console
2. Clique no link para criar o índice automaticamente
3. Ou crie manualmente no [Firestore Console](https://console.firebase.google.com/project/_/firestore/indexes)

## Usuário Admin Inicial

O sistema cria automaticamente um usuário admin na primeira execução:

- **Email**: `admin@yoobe.co`
- **Senha inicial**: `123`
- **Role**: `admin`

⚠️ **AÇÃO NECESSÁRIA**: 
1. Faça login com essas credenciais após o primeiro deploy
2. **ALTERE A SENHA IMEDIATAMENTE** através das configurações
3. Considere remover ou desabilitar a criação automática em produção

## Verificações Antes do Deploy

### ✅ Checklist

- [ ] Regras de segurança do Firestore configuradas
- [ ] Índices compostos criados (se necessário)
- [ ] Usuário admin criado e senha alterada
- [ ] Configurações do Firebase (`services/firebase.ts`) estão corretas
- [ ] Storage do Firebase configurado (se usar upload de logos)
- [ ] Backup automático habilitado (recomendado)

## Configurações Adicionais

### Firebase Storage (para logos de clientes)

Se você usar upload de logos:

1. Vá para [Firebase Storage](https://console.firebase.google.com/project/_/storage)
2. Configure regras de segurança:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /logos/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null; // Adaptar conforme sua autenticação
    }
  }
}
```

### Backup Automático

1. Vá para [Firestore Backups](https://console.firebase.google.com/project/_/firestore/backups)
2. Configure backups diários automáticos
3. Defina período de retenção (recomendado: 30 dias)

## Segurança

### ⚠️ Avisos Importantes

1. **Credenciais do Firebase**: Atualmente hardcoded em `services/firebase.ts`
   - **Recomendação**: Mover para variáveis de ambiente no futuro
   - Para produção, considere usar Firebase Admin SDK no backend

2. **Senhas**: Armazenadas em texto plano no Firestore
   - **Recomendação**: Implementar hash de senhas (bcrypt, etc.)
   - Ou migrar para Firebase Authentication

3. **API Key do Firebase**: Exposta no código do cliente
   - Isso é normal para Firebase (a API key é pública)
   - A segurança vem das regras do Firestore
   - **Importante**: Configure regras de segurança adequadas!

## Troubleshooting

### Erro: "Missing or insufficient permissions"
- Verifique as regras de segurança do Firestore
- Verifique se o usuário tem as permissões necessárias

### Erro: "The query requires an index"
- Clique no link fornecido no erro para criar o índice
- Ou crie manualmente no console do Firestore

### Erro: "Firebase config is not set!"
- Verifique se as credenciais em `services/firebase.ts` estão corretas
- Verifique se o projeto Firebase existe e está ativo

## Links Úteis

- [Firebase Console](https://console.firebase.google.com/)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firestore Indexes](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Firebase Storage Rules](https://firebase.google.com/docs/storage/security)

