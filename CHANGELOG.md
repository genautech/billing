# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [2026-01-04] - Verificação, Correções e Documentação do Sistema de Faturas

### 🐛 Correções de Bugs

#### Corrigido
- ✅ **Coluna T não encontrada**: Agora usa o preço do item de picking (0-1 itens) como base em vez de lógica incorreta
- ✅ **Item de picking não encontrado**: Mensagem de erro mais clara e uso de logs de erro (não apenas warning)
- ✅ **Colunas sem match**: Agora bloqueia processamento se mais de 50% das colunas não tiverem correspondência
- ✅ **Discrepâncias pequenas**: Aumentado threshold de R$0.01 para R$0.10 para evitar micro-ajustes
- ✅ **Valor total zerado**: Agora lança erro bloqueando o processamento se a fatura tem valor zero mas contém detalhes
- ✅ **Nenhum pedido processado**: Agora lança erro se nenhum pedido do Track Report foi encontrado no Order Detail

### 📝 Documentação

#### Adicionado
- ✅ Seção de troubleshooting específica para geração de faturas em TROUBLESHOOTING.md
- ✅ Documentação do formato esperado dos CSVs
- ✅ Documentação das colunas de custo e matching dinâmico
- ✅ Tabela de formato dos CSVs em FEATURES.md

### 🔍 Análise do Sistema de Faturas

#### Verificado e Funcionando
- ✅ Função `processarFatura()` - lógica de processamento principal
- ✅ Função `salvarCobrancaProcessada()` - persistência no Firestore
- ✅ Matching dinâmico de colunas CSV para tabela de preços
- ✅ Cálculo de preço de venda com margem (`calculatePrecoVenda`)
- ✅ Cálculo especial para templates (`calculatePrecoVendaForDisplay`)
- ✅ Validações de entrada (tabela vazia, cliente não encontrado, colunas faltando)
- ✅ Logs extensivos para debug
- ✅ Tratamento de casos extremos (CSVs vazios, colunas faltando)

#### Melhorias Implementadas
- ✅ Melhor fallback quando coluna T não é encontrada
- ✅ Validação mais rigorosa para colunas sem match (bloqueia se >50%)
- ✅ Threshold de discrepância aumentado para R$0.10
- ✅ Bloqueio de processamento quando valor total é zero

#### Potenciais Melhorias Futuras
- [ ] Adicionar validação mais estrita para formato de datas
- [ ] Implementar modo de preview antes de salvar fatura
- [ ] Adicionar testes automatizados para a função processarFatura

---

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





