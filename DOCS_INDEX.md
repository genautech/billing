# Índice de Documentação - Yoobe Billing System

Guia rápido para encontrar a documentação que você precisa.

## 📚 Documentação Principal

### [README.md](./README.md)
**Documento principal** - Visão geral do projeto, instalação, características principais e links para outras documentações.

### [FEATURES.md](./FEATURES.md)
**Documentação completa de funcionalidades** - Lista detalhada de todas as features do sistema, organizadas por área (Admin, Cliente, Técnico).

### [CHANGELOG.md](./CHANGELOG.md)
**Histórico de mudanças** - Todas as alterações, melhorias e correções do sistema.

## 🚀 Deploy e Infraestrutura

### [DEPLOY.md](./DEPLOY.md)
**Guia completo de deploy** - Instruções detalhadas para fazer deploy no Google Cloud Run, incluindo status atual do deploy em produção.

### [CLOUD_BUILD_SETUP.md](./CLOUD_BUILD_SETUP.md)
**Configuração do deploy automático** - Passo a passo para configurar Cloud Build Trigger e deploy automático.

### [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
**Guia de resolução de problemas** - Soluções para problemas comuns de deploy, runtime e uso do sistema.

## 🔥 Firebase

### [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)
**Configuração do Firebase** - Estrutura do Firestore, regras de segurança, índices necessários e verificações antes do deploy.

## 🗂️ Estrutura da Documentação

```
billing/
├── README.md                 # Documento principal
├── FEATURES.md              # Funcionalidades completas
├── CHANGELOG.md             # Histórico de mudanças
├── DEPLOY.md                # Guia de deploy
├── CLOUD_BUILD_SETUP.md     # Setup do Cloud Build
├── TROUBLESHOOTING.md       # Resolução de problemas
├── FIREBASE_SETUP.md        # Configuração Firebase
└── DOCS_INDEX.md            # Este arquivo
```

## 🎯 Guia Rápido por Objetivo

### Quero fazer deploy pela primeira vez
1. Leia [DEPLOY.md](./DEPLOY.md)
2. Siga [CLOUD_BUILD_SETUP.md](./CLOUD_BUILD_SETUP.md)
3. Configure Firebase conforme [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)

### Encontrei um erro durante o deploy
1. Consulte [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Verifique os logs do Cloud Build e Cloud Run
3. Verifique se todas as permissões estão configuradas

### Quero entender todas as funcionalidades
1. Leia [FEATURES.md](./FEATURES.md)
2. Explore o [README.md](./README.md) para visão geral

### Quero configurar o Firebase
1. Leia [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)
2. Configure regras de segurança
3. Crie índices necessários

### Quero saber o que mudou
1. Consulte [CHANGELOG.md](./CHANGELOG.md)
2. Veja o histórico de commits no GitHub

## 📋 Status Atual do Sistema

### Deploy
- ✅ **URL de Produção**: https://billing-app-saisynpc3a-uc.a.run.app
- ✅ **Projeto GCP**: `gen-lang-client-0296053913`
- ✅ **Deploy Automático**: Configurado e funcionando
- ✅ **Secret Manager**: Configurado (`gemini-api-key`)

### Funcionalidades
- ✅ Área administrativa completa
- ✅ Portal do cliente completo
- ✅ Geração de PDFs (faturas e documentação)
- ✅ Análise inteligente com IA
- ✅ Relatórios e dashboards

### Documentação
- ✅ README.md atualizado
- ✅ Guias de deploy completos
- ✅ Documentação de features
- ✅ Guia de troubleshooting
- ✅ Configuração do Firebase

## 🔗 Links Úteis

### Produção
- **Aplicação**: https://billing-app-saisynpc3a-uc.a.run.app
- **Cloud Run Console**: https://console.cloud.google.com/run?project=gen-lang-client-0296053913
- **Cloud Build Console**: https://console.cloud.google.com/cloud-build?project=gen-lang-client-0296053913

### Desenvolvimento
- **Repositório GitHub**: https://github.com/genautech/billing
- **Firebase Console**: https://console.firebase.google.com/project/yoobe-billing-app

### Documentação Externa
- [Cloud Run Docs](https://cloud.google.com/run/docs)
- [Cloud Build Docs](https://cloud.google.com/build/docs)
- [Firebase Docs](https://firebase.google.com/docs)
- [React Docs](https://react.dev)

## 📞 Suporte

1. **Consulte a documentação** - A maioria dos problemas tem solução documentada
2. **Verifique TROUBLESHOOTING.md** - Problemas comuns e soluções
3. **Verifique os logs** - Cloud Run e Cloud Build têm logs detalhados
4. **Abra uma issue no GitHub** - Se o problema persistir

## 🎓 Para Novos Desenvolvedores

### Começando
1. Leia [README.md](./README.md) para visão geral
2. Configure ambiente local conforme instruções
3. Explore [FEATURES.md](./FEATURES.md) para entender funcionalidades

### Fazendo Deploy
1. Leia [DEPLOY.md](./DEPLOY.md)
2. Siga [CLOUD_BUILD_SETUP.md](./CLOUD_BUILD_SETUP.md)
3. Consulte [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) se encontrar problemas

### Entendendo o Código
1. Explore a estrutura em [README.md](./README.md)
2. Veja [FEATURES.md](./FEATURES.md) para entender o que cada parte faz
3. Consulte [CHANGELOG.md](./CHANGELOG.md) para ver mudanças recentes

