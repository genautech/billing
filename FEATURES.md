# Features e Funcionalidades - Yoobe Billing System

Documentação completa de todas as funcionalidades do sistema de faturamento.

## 🎯 Visão Geral

Sistema completo de gestão de faturamento e cobranças para logística, com interface administrativa e portal do cliente.

## 👨‍💼 Área Administrativa

### Dashboard

- **Visão geral**: Estatísticas gerais do sistema
- **Métricas principais**:
  - Total de faturas
  - Total de clientes
  - Faturas pendentes
  - Receita total
- **Gráficos e visualizações**: Análise de tendências

### Gestão de Clientes

- **CRUD completo de clientes**
  - Criar, editar, excluir clientes
  - Campos: nome, CNPJ, email, email de faturamento, logo, etc.
- **Tabelas de preços personalizadas**
  - Cada cliente pode ter sua própria tabela de preços
  - Gestão de tabelas por cliente
- **Visualização de estoque**: Unidades em estoque por cliente

### Geração de Faturas

- **Processamento automático de CSVs**
  - Upload de relatórios de rastreio (Track Report)
  - Upload de relatórios de custos (Order Detail)
  - Matching automático entre relatórios
- **Análise com IA (Gemini)**
  - Análise inteligente dos dados antes de processar
  - Sugestões e validações automáticas
- **Matching dinâmico de custos**
  - Mapeamento automático de colunas CSV para tabela de preços
  - Suporte a templates e itens específicos
  - Cálculo automático de picking/packing baseado em quantidade de itens
- **Cálculo de DIFAL**
  - Cálculo automático baseado em origem e destino
  - Inclusão na fatura de forma transparente
- **Custos adicionais**
  - Adicionar custos manuais à fatura
  - Descrição e valor customizáveis

### Arquivo de Faturas

- **Visualização de todas as faturas**
  - Filtros por cliente, mês, status
  - Ordenação por data, valor, status
- **Edição de faturas**
  - Editar valores e detalhes
  - Adicionar/remover custos adicionais
- **Gestão de status**
  - Pendente, Enviada, Paga, Vencido
  - Atualização de status
- **Exclusão de faturas**
  - Exclusão completa com subcollections

### Tabela de Preços

- **Gestão completa de preços**
  - CRUD de itens de preço
  - Categorias: Envios, Custos Logísticos, Armazenamento, etc.
  - Subcategorias para organização
- **Cálculo de margem de lucro**
  - Margem configurável por item
  - Cálculo automático de preço de venda
- **Templates**
  - Itens template para cálculos internos
  - Ocultos da visualização do cliente
- **Upload de CSV**
  - Importação em massa de itens de preço
  - Validação e processamento automático

### Configurações Gerais

- **Configurações do sistema**
  - Email de contato
  - Outras configurações globais
- **Gestão de FAQ**
  - Criar, editar, excluir perguntas frequentes
  - Ordenação customizável
- **Alteração de senha**
  - Admin pode alterar sua senha

## 👥 Portal do Cliente

### Dashboard do Cliente

- **Visão geral personalizada**
  - Faturas do cliente
  - Status de pagamentos
  - Gráficos de custos ao longo do tempo
- **Análise de custos**
  - Distribuição por categoria
  - Análise mensal
  - Comparativos

### Visualização de Faturas

- **Detalhamento completo**
  - Todos os itens da fatura
  - Agrupamento por pedido
  - Visualização em tabela ou por categoria
- **Filtros e busca**
  - Filtrar por categoria, pedido, data
  - Busca por rastreio ou código de pedido
- **Exportação**
  - **PDF completo**: Inclui todos os pedidos expandidos
  - **CSV**: Dados estruturados para análise
- **Análise inteligente com IA**
  - Análise detalhada da fatura
  - Insights e explicações
  - Sugestões de otimização
- **Custo por pedido**
  - Análise de custo médio por pedido
  - Estatísticas de pedidos únicos

### Relatórios

- **Relatório de envios**
  - Análise por região/estado
  - Distribuição geográfica
  - Custos por localidade
- **Gráficos interativos**
  - Visualizações de dados
  - Comparativos mensais

### Tabela de Preços

- **Visualização da tabela**
  - Tabela de preços aplicável ao cliente
  - Filtros por categoria
  - Busca de itens

### Como Funciona

- **Documentação completa**
  - Explicação de cobranças mensais
  - Explicação de DIFAL e tributação
  - Infográficos interativos
  - Calculadora de custos
- **Exportação em PDF**
  - PDF completo de toda a documentação
  - Inclui calculadora, infográficos, explicações

### Central de Ajuda

- **FAQ**
  - Perguntas frequentes
  - Respostas detalhadas
- **Contato**
  - Email de suporte
  - Informações de contato

## 📄 Geração de PDFs

### PDF de Faturas

- **Conteúdo completo**
  - Todos os pedidos expandidos automaticamente
  - Detalhamento completo de itens
  - Custos adicionais
  - Resumo por categoria
  - Informações do cliente e fatura
- **Multi-página**
  - Suporte automático a múltiplas páginas
  - Paginação inteligente
- **Qualidade**
  - Alta resolução (scale 2x)
  - Logos e imagens preservadas

### PDF "Como Funciona"

- **Documentação completa**
  - Todas as seções explicativas
  - Infográficos de tributação
  - Calculadora (capturada como imagem)
  - Fluxos e processos
- **Formatação profissional**
  - Layout otimizado
  - Multi-página automático

## 🤖 Inteligência Artificial (Gemini)

### Análise de Faturas

- **Análise pré-processamento**
  - Validação de dados antes de processar
  - Identificação de inconsistências
  - Sugestões de correção
- **Análise pós-processamento**
  - Análise detalhada para o cliente
  - Insights e explicações
  - Destaques importantes

### Geração de Conteúdo

- **Conteúdo explicativo**
  - Geração automática de explicações sobre cobranças
  - Explicações de DIFAL
  - Conteúdo sempre atualizado
- **Infográficos**
  - Geração de dados para infográficos
  - Estrutura JSON para visualizações

### Insights da Calculadora

- **Sugestões inteligentes**
  - Otimizações de custos
  - Comparações com médias
  - Dicas práticas

## 🔐 Segurança e Autenticação

### Autenticação

- **Login por email/senha**
  - Autenticação customizada
  - Diferenciação admin/cliente
- **Usuário admin inicial**
  - Criação automática na primeira execução
  - Credenciais padrão: `admin@yoobe.co` / `123`
  - **IMPORTANTE**: Alterar senha após primeiro login

### Controle de Acesso

- **Roles**
  - Admin: Acesso completo
  - Cliente: Acesso apenas aos próprios dados
- **Visualização como cliente**
  - Admin pode visualizar como qualquer cliente
  - Útil para suporte e testes

## 📊 Relatórios e Análises

### Dashboard Administrativo

- **Métricas gerais**
  - Total de faturas
  - Total de clientes
  - Receita total
  - Faturas pendentes
- **Gráficos**
  - Evolução de receita
  - Distribuição por cliente
  - Status de faturas

### Dashboard do Cliente

- **Métricas pessoais**
  - Total de faturas
  - Valor total pago
  - Faturas pendentes
- **Gráficos personalizados**
  - Evolução de custos
  - Distribuição por categoria
  - Análise mensal

### Relatórios de Envios

- **Análise geográfica**
  - Envios por estado
  - Custos por região
  - Distribuição geográfica
- **Análise temporal**
  - Evolução ao longo do tempo
  - Comparativos mensais

## 🔧 Funcionalidades Técnicas

### Matching Dinâmico

- **Mapeamento inteligente**
  - Matching automático de colunas CSV
  - Suporte a variações de nomes
  - Priorização de itens não-template
- **Cálculo de picking/packing**
  - Lógica especial para itens <= 1
  - Cálculo de itens adicionais para > 1
  - Uso de coluna T (custo base) quando disponível

### Processamento de CSVs

- **Validação automática**
  - Detecção de formato
  - Validação de colunas necessárias
  - Tratamento de erros
- **Filtragem por mês**
  - Filtro automático por mês de referência
  - Suporte a múltiplos formatos de data

### Compartilhamento

- **Links compartilháveis**
  - URLs únicas por fatura
  - Acesso direto sem login (se configurado)
  - Suporte a deep linking

## 🚀 Deploy e Infraestrutura

### Deploy Automático

- **Cloud Build Trigger**
  - Deploy automático a cada push para `main`
  - Build, push e deploy em um pipeline
- **Configuração via Secret Manager**
  - API keys seguras
  - Sem exposição de credenciais

### Containerização

- **Docker multi-stage**
  - Build otimizado
  - Imagem final pequena
- **Nginx para produção**
  - Servidor web otimizado
  - Configuração para SPA
  - Headers de segurança

### Cloud Run

- **Escalabilidade automática**
  - Escala para zero quando não usado
  - Escala automática conforme demanda
- **Configurações otimizadas**
  - Memória: 512Mi
  - CPU: 1
  - Timeout: 300s
  - Concorrência: 80

## 📱 Responsividade

- **Design responsivo**
  - Funciona em desktop, tablet e mobile
  - Layout adaptativo
  - Componentes otimizados para mobile

## 🎨 Interface do Usuário

### Componentes Reutilizáveis

- **FormControls**: Inputs, selects, etc.
- **StatCard**: Cards de estatísticas
- **MonthPicker**: Seletor de mês
- **FileInput**: Upload de arquivos
- **MarkdownRenderer**: Renderização de markdown

### Feedback Visual

- **Toast notifications**
  - Sucesso, erro, aviso
  - Notificações não intrusivas
- **Loading states**
  - Indicadores de carregamento
  - Feedback durante operações

## 🔄 Atualizações e Melhorias Recentes

### Versão Atual

- ✅ Geração de PDFs melhorada (faturas e "Como Funciona")
- ✅ Deploy automático configurado
- ✅ Secret Manager integrado
- ✅ Correção de problemas de porta no Cloud Run
- ✅ Configuração automática de acesso público
- ✅ Expansão automática de pedidos no PDF

## 📝 Notas de Implementação

### Limitações Conhecidas

- Firebase config hardcoded (considerar mover para env vars)
- Senhas em texto plano (considerar hash)
- Autenticação customizada (considerar Firebase Auth)

### Melhorias Futuras

- [ ] Migrar Firebase config para variáveis de ambiente
- [ ] Implementar hash de senhas
- [ ] Migrar para Firebase Authentication
- [ ] Adicionar testes automatizados
- [ ] Implementar cache mais agressivo
- [ ] Adicionar paginação para listas grandes

