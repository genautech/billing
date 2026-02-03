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
  - Order Detail (custos) **obrigatório**
  - Track Report (rastreio) **opcional**: se não enviado, a fatura é gerada apenas com o Order Detail; rastreio pode ficar vazio e relatórios por estado dependem da coluna de UF no Order Detail.
  - Matching automático entre relatórios (quando ambos existem)
  - Filtragem automática por mês de referência
- **Resumo Pré-Aprovação** ✨ **NOVO**
  - Exibe resumo detalhado antes de salvar a fatura
  - Mostra total de pedidos, envios, DIFAL, armazenagem e outros custos separadamente
  - Indica qual tabela de preços está sendo utilizada (Cliente ou Global)
  - Lista avisos e pedidos sem correspondência
  - Permite validação visual antes da confirmação
- **Análise com IA (Gemini)**
  - Requer Track Report para melhor qualidade de análise
  - Sugestões e validações automáticas
  - Identificação de pedidos não correspondentes
- **Matching dinâmico de custos**
  - Mapeamento automático de colunas CSV para tabela de preços
  - Suporte a templates e itens específicos
  - Cálculo automático de picking/packing baseado em quantidade de itens
  - Priorização de itens não-template sobre templates
- **Cálculo de DIFAL**
  - Cálculo automático baseado em origem e destino
  - Inclusão na fatura de forma transparente
  - DIFAL associado diretamente a cada pedido
  - Preço mínimo garantido de R$ 3,00 por pedido
- **Custos adicionais**
  - Adicionar custos manuais à fatura
  - Descrição e valor customizáveis
- **Validações e logs**
  - Order Detail é obrigatório; Track Report opcional
  - Logs extensivos em console para debug
  - Alertas para colunas sem correspondência
  - Bloqueio se mais de 50% das colunas de custo não tiverem match
  - Bloqueio se valor total zerado com detalhes
- **Tabela de Preços do Cliente**
  - Sistema automaticamente utiliza tabela personalizada do cliente quando disponível
  - Fallback para tabela global se cliente não tem tabela própria
  - Indicação visual no resumo pré-aprovação

#### Formato dos CSVs para Geração de Faturas

**Track Report (Relatório de Rastreio) — opcional (requerido apenas se quiser rastreio e análise IA):**

O sistema aceita dois formatos de Track Report:

**Formato Legado:**

| Coluna          | Obrigatório | Descrição                                    |
| --------------- | ----------- | -------------------------------------------- |
| Data de envio   | Sim         | Data do envio (formatos: YYYY-MM-DD, DD/MM/YYYY) |
| Número do pedido| Sim         | ID único do pedido                          |
| Rastreio        | Não         | Código de rastreamento                      |

**Formato LojaPrio (detecção automática):**

| Coluna          | Obrigatório | Descrição                                    |
| --------------- | ----------- | -------------------------------------------- |
| Number          | Sim         | ID único do pedido                          |
| Email           | Sim         | Email do cliente (usado para matching)      |
| Placed at       | Sim         | Data do pedido (formato: YYYY-MM-DD HH:MM:SS) |
| Shipped at      | Não         | Data de envio (alternativa para data)       |
| Status          | Não         | Status do pedido (ex: complete)             |

**Matching para LojaPrio:**
- O sistema detecta automaticamente o formato LojaPrio pelas colunas características
- O matching principal é por número do pedido (Number)
- Se não encontrar match por número, tenta matching por email + mês
- A prioridade é sempre o mês: pedidos são agrupados pelo mês de referência solicitado
- O número do pedido é usado como identificador de rastreio quando não há coluna de rastreio

**Order Detail (Relatório de Custos) — obrigatório:**

| Coluna           | Obrigatório | Descrição                                |
| ---------------- | ----------- | ---------------------------------------- |
| Data do pedido   | Sim         | Data do pedido                           |
| Número do pedido | Sim         | Deve corresponder ao Track Report        |
| Total            | Sim         | Valor total do pedido                    |
| Coluna AD        | Sim         | Custo total de envio                     |
| Coluna E         | Não         | Quantidade de itens (para picking)       |
| Coluna M         | Não         | CEP do destino                           |
| Coluna O         | Não         | Estado/UF do destino                     |
| Coluna T         | Não         | Custo do picking por unidade             |
| Colunas de custo | Não         | Qualquer coluna com "custo" no nome      |

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

---

## 📎 Notas de Remessa de Envio (XML NF-e)

Sistema de anexação de notas fiscais de remessa de envio (brinde/doação) diretamente de arquivos XML de Nota Fiscal Eletrônica.

### Funcionalidades

- **Upload de XMLs**: Selecione múltiplos arquivos XML de NF-e
- **Integração com Google Drive**: Selecione XMLs diretamente de uma pasta do Drive
- **Extração automática**: O sistema extrai automaticamente:
  - Chave NFe (44 dígitos)
  - Data de emissão
  - Valor total da NF (vNF) - valor simbólico, não usado no cálculo
  - Nome do destinatário
- **Visualização**: Tabela resumida das notas de remessa na fatura com link para download

**Importante**: Os XMLs de notas de remessa são **apenas comprovantes de envio** com valores simbólicos. O DIFAL é cobrado separadamente conforme regras abaixo.

---

## 💰 Cobrança de DIFAL

O sistema aplica a cobrança de DIFAL para **cada pedido** com as seguintes regras:

### Cálculo do Preço

- **Margem fixa**: 200% sobre o custo base do CSV
- **Fórmula**: `preço = custo CSV × 3`
- **Preço mínimo**: R$ 3,00 por pedido (se o cálculo resultar em valor menor)
- **Quantidade**: 1 por pedido (não duplica mesmo que haja múltiplos envios do mesmo pedido)

### Garantia de Cobrança

- Se o pedido não tiver valor de DIFAL no CSV, o sistema **adiciona automaticamente** a cobrança mínima de R$ 3,00
- Cada pedido é cobrado apenas uma vez, mesmo que apareça múltiplas vezes no relatório de rastreio

### Exemplo de Cálculo

| Custo CSV | Cálculo (×3) | Preço Final |
|-----------|--------------|-------------|
| R$ 0,50   | R$ 1,50      | R$ 3,00 (mínimo) |
| R$ 1,00   | R$ 3,00      | R$ 3,00     |
| R$ 2,00   | R$ 6,00      | R$ 6,00     |
| N/A       | -            | R$ 3,00 (automático) |

### Configuração do Google Drive Picker (Opcional)

Para habilitar a integração com Google Drive, configure as variáveis de ambiente:

```env
VITE_GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=sua-api-key
```

**Passos para configurar:**

1. Acesse https://console.cloud.google.com/
2. Crie ou selecione um projeto
3. Ative as APIs: **Google Drive API** e **Google Picker API**
4. Vá em APIs & Services > Credentials
5. Crie um **OAuth 2.0 Client ID** (tipo: Web application)
   - Adicione `http://localhost:8001` em Authorized JavaScript origins
   - Adicione seu domínio de produção também
6. Crie uma **API Key**
   - Restrinja para as APIs necessárias (Drive, Picker)
7. Configure as variáveis no arquivo `.env.local`

**Sem configuração do Google:** O sistema ainda funciona com upload manual de arquivos XML.





