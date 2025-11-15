# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [2025-11-15] - Deploy para Produção

### 🚀 Deploy e Infraestrutura

#### Adicionado
- ✅ Deploy automático configurado no Google Cloud Run
- ✅ Cloud Build Trigger (`deploy-billing-app`) configurado
- ✅ Secret Manager integrado para API keys
- ✅ Dockerfile multi-stage otimizado
- ✅ Nginx configurado para produção
- ✅ Script `entrypoint.sh` para configuração dinâmica de porta
- ✅ Configuração automática de acesso público no deploy
- ✅ Documentação completa de deploy (DEPLOY.md, CLOUD_BUILD_SETUP.md)

#### Corrigido
- 🔧 Permissões do Secret Manager para Cloud Build e Cloud Run
- 🔧 Configuração de porta do Nginx para Cloud Run (variável PORT)
- 🔧 Acesso público ao serviço (HTTP 403 resolvido)
- 🔧 Inconsistências de variáveis de ambiente (GEMINI_API_KEY)

#### Melhorado
- 📝 Documentação completa atualizada
- 📝 Guia de troubleshooting criado
- 📝 Documentação de features criada
- 📝 README.md atualizado com status atual do deploy

### 📄 Geração de PDFs

#### Adicionado
- ✅ Geração de PDF completo de faturas (todos os pedidos expandidos)
- ✅ Botão de gerar PDF na seção "Como Funciona"
- ✅ Suporte a múltiplas páginas em PDFs
- ✅ Expansão automática de pedidos antes de gerar PDF

#### Melhorado
- 📈 Qualidade de imagem no PDF (scale 2x)
- 📈 Configuração otimizada do html2canvas
- 📈 Paginação automática para conteúdo longo

### 📚 Documentação

#### Adicionado
- ✅ FEATURES.md - Documentação completa de todas as funcionalidades
- ✅ TROUBLESHOOTING.md - Guia de resolução de problemas
- ✅ CHANGELOG.md - Este arquivo
- ✅ Scripts de configuração (setup-cloud-build.sh, monitor-deploy.sh)
- ✅ .env.example - Template de variáveis de ambiente
- ✅ .dockerignore - Otimização de build

#### Atualizado
- 📝 README.md - Status atual, features detalhadas, links para documentação
- 📝 DEPLOY.md - Status atual do deploy, problemas resolvidos, troubleshooting
- 📝 CLOUD_BUILD_SETUP.md - Informações do projeto atual
- 📝 FIREBASE_SETUP.md - Já estava completo

### 🔧 Configuração

#### Adicionado
- ✅ cloudbuild.yaml - Pipeline de deploy automático
- ✅ Dockerfile - Build otimizado para produção
- ✅ nginx.conf - Configuração de servidor web
- ✅ entrypoint.sh - Script de inicialização dinâmica

#### Modificado
- 🔧 vite.config.ts - Suporte melhorado para variáveis de ambiente
- 🔧 .gitignore - Adicionado arquivos .env

## Funcionalidades Principais do Sistema

### Área Administrativa
- Dashboard com métricas e gráficos
- Gestão completa de clientes
- Geração automática de faturas a partir de CSVs
- Análise inteligente com IA (Gemini)
- Gestão de tabelas de preços
- Arquivo de faturas com edição
- Configurações gerais e FAQ

### Portal do Cliente
- Dashboard personalizado
- Visualização detalhada de faturas
- Exportação de PDFs e CSV
- Análise inteligente de faturas
- Relatórios e análises
- Calculadora de custos
- Documentação "Como Funciona"
- Central de ajuda

### Tecnologias
- React 19 + TypeScript
- Firebase Firestore
- Google Gemini AI
- Google Cloud Run
- Docker + Nginx
- Cloud Build (CI/CD)

## Próximas Melhorias Planejadas

### Segurança
- [ ] Migrar Firebase config para variáveis de ambiente
- [ ] Implementar hash de senhas
- [ ] Migrar para Firebase Authentication

### Performance
- [ ] Implementar cache mais agressivo
- [ ] Adicionar paginação para listas grandes
- [ ] Otimizar queries do Firestore

### Funcionalidades
- [ ] Adicionar testes automatizados
- [ ] Implementar notificações por email
- [ ] Adicionar exportação de relatórios em Excel

## Notas de Versão

### Versão Atual: 1.0.0 (Produção)

- ✅ Sistema completo funcional
- ✅ Deploy em produção
- ✅ Documentação completa
- ✅ Deploy automático configurado

### Problemas Conhecidos

- Firebase config hardcoded (não crítico, mas deve ser movido para env vars)
- Senhas em texto plano (deve implementar hash)
- Autenticação customizada (considerar migrar para Firebase Auth)

### Limitações

- Sem testes automatizados ainda
- Sem notificações por email
- Sem exportação Excel (apenas PDF e CSV)

