<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Yoobe Logistics Billing System

Sistema de faturamento e gestão de cobranças para logística, desenvolvido com React, TypeScript, Firebase e Gemini AI.

## Características

### Área Administrativa
- 📊 Dashboard administrativo completo com métricas e gráficos
- 👥 Gestão completa de clientes (CRUD)
- 💰 Geração automática de faturas mensais a partir de CSVs
- 🤖 Análise inteligente com IA (Gemini) antes e depois do processamento
- 📋 Gestão de tabelas de preços (global e por cliente)
- 📦 Upload e processamento de CSVs (Track Report e Order Detail)
- 🔄 Matching dinâmico de custos com tabela de preços
- 📊 Arquivo de faturas com edição e gestão de status
- ⚙️ Configurações gerais e gestão de FAQ
- 🔐 Sistema de autenticação e controle de acesso

### Portal do Cliente
- 📊 Dashboard personalizado com métricas do cliente
- 📄 Visualização detalhada de faturas
- 📄 Exportação de PDFs completos (todos os pedidos expandidos)
- 📄 Exportação de CSV para análise
- 🤖 Análise inteligente de faturas com IA
- 📈 Relatórios de envios e análises geográficas
- 💰 Calculadora de custos interativa
- 📚 Documentação completa "Como Funciona" com PDF exportável
- ❓ Central de ajuda e FAQ
- 🔍 Busca e filtros avançados

### Funcionalidades Técnicas
- 🚀 Deploy automático no Google Cloud Run
- 🔐 Secret Manager para API keys
- 📦 Containerização com Docker e Nginx
- 🔄 CI/CD completo com Cloud Build
- 📱 Design responsivo (desktop, tablet, mobile)

## Tecnologias

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Firebase Firestore
- **IA**: Google Gemini AI
- **Deploy**: Google Cloud Run, Docker, Nginx

## Pré-requisitos

- Node.js 20 ou superior
- npm ou yarn
- Conta Firebase com projeto configurado
- API Key do Gemini AI

## Instalação Local

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/genautech/billing.git
   cd billing
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente:**
   
   Crie um arquivo `.env.local` na raiz do projeto:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   
   Você pode usar o arquivo `.env.example` como referência:
   ```bash
   cp .env.example .env.local
   ```
   
   Edite `.env.local` e adicione sua API key do Gemini.

4. **Configure o Firebase:**
   
   As configurações do Firebase estão em `services/firebase.ts`. 
   Certifique-se de que as credenciais estão corretas para seu projeto.

5. **Execute o projeto:**
   ```bash
   npm run dev
   ```
   
   O app estará disponível em `http://localhost:8000`

## Estrutura do Firebase

### Collections

- `clientes` - Dados dos clientes e administradores
- `tabelaPrecos` - Tabela de preços global
- `tabelaPrecosClientes` - Tabelas de preços personalizadas por cliente
- `cobrancasMensais` - Faturas mensais
- `configuracoes` - Configurações gerais do sistema
- `faq` - Perguntas frequentes

### Subcollections

- `cobrancasMensais/{id}/detalhesEnvio` - Detalhes de cada envio
- `cobrancasMensais/{id}/custosAdicionais` - Custos adicionais da fatura

### Usuário Admin Inicial

O sistema cria automaticamente um usuário admin na primeira execução:
- **Email**: `admin@yoobe.co`
- **Senha inicial**: `123`
- **Ação recomendada**: Alterar a senha após o primeiro login

## Deploy para Produção

### ✅ Status Atual

- **URL de Produção**: https://billing-app-saisynpc3a-uc.a.run.app
- **Projeto GCP**: `gen-lang-client-0296053913`
- **Deploy Automático**: ✅ Configurado - qualquer push para `main` dispara deploy automático
- **Documentação Completa**: Veja [DEPLOY.md](./DEPLOY.md) para instruções detalhadas

### Opção 1: Deploy no Google Cloud Run (Recomendado) ✅ CONFIGURADO

#### Pré-requisitos

- Conta Google Cloud Platform
- Google Cloud SDK instalado
- Projeto GCP criado
- Container Registry habilitado
- Cloud Run API habilitada

#### Usando Cloud Build (Automático)

1. **Configure o Cloud Build Trigger:**
   
   - Acesse o Cloud Build no console do GCP
   - Crie um novo trigger conectado ao repositório GitHub
   - Configure as substituições:
     - `_GEMINI_API_KEY`: Sua API key do Gemini (ou use Secret Manager)

2. **Faça push para o repositório:**
   ```bash
   git push origin main
   ```
   
   O Cloud Build irá automaticamente:
   - Construir a imagem Docker
   - Fazer push para Container Registry
   - Fazer deploy no Cloud Run

#### Usando gcloud CLI (Manual)

1. **Configure o projeto:**
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Configure a API key como variável de ambiente:**
   ```bash
   export GEMINI_API_KEY=your_api_key_here
   ```

3. **Construa e faça deploy:**
   ```bash
   # Build da imagem
   docker build -t gcr.io/YOUR_PROJECT_ID/billing-app:latest .
   
   # Push para Container Registry
   docker push gcr.io/YOUR_PROJECT_ID/billing-app:latest
   
   # Deploy no Cloud Run
   gcloud run deploy billing-app \
     --image gcr.io/YOUR_PROJECT_ID/billing-app:latest \
     --region us-central1 \
     --platform managed \
     --allow-unauthenticated \
     --memory 512Mi \
     --cpu 1 \
     --timeout 300 \
     --set-env-vars GEMINI_API_KEY=$GEMINI_API_KEY
   ```

#### Configurações Recomendadas do Cloud Run

- **Região**: `us-central1` (ou escolha a mais próxima dos usuários)
- **Memória**: `512Mi`
- **CPU**: `1`
- **Timeout**: `300s`
- **Concorrência**: `80`
- **Máximo de instâncias**: `10`

#### Usando Secret Manager (Recomendado para Produção)

Para maior segurança, use o Secret Manager ao invés de variáveis de ambiente:

1. **Crie o secret:**
   ```bash
   echo -n "your_gemini_api_key" | gcloud secrets create gemini-api-key --data-file=-
   ```

2. **Atualize o cloudbuild.yaml:**
   ```yaml
   - '--set-secrets'
   - 'GEMINI_API_KEY=gemini-api-key:latest'
   ```

### Opção 2: Deploy Manual com Docker

1. **Construa a imagem:**
   ```bash
   docker build -t billing-app .
   ```

2. **Execute o container:**
   ```bash
   docker run -p 8080:80 -e GEMINI_API_KEY=your_key billing-app
   ```

## Variáveis de Ambiente

### Desenvolvimento

Crie um arquivo `.env.local`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### Produção (Cloud Run)

Configure via console do GCP ou gcloud CLI:

```bash
gcloud run services update billing-app \
  --set-env-vars GEMINI_API_KEY=your_api_key \
  --region us-central1
```

## Scripts Disponíveis

- `npm run dev` - Inicia servidor de desenvolvimento
- `npm run build` - Cria build de produção
- `npm run preview` - Preview do build de produção

## Estrutura do Projeto

```
billing/
├── components/          # Componentes React
│   ├── admin/         # Componentes administrativos
│   ├── ui/            # Componentes de UI reutilizáveis
│   └── ...            # Outros componentes
├── contexts/          # Contextos React (Toast, etc.)
├── services/          # Serviços (Firebase, Gemini, etc.)
├── types.ts           # Definições de tipos TypeScript
├── App.tsx            # Componente principal
├── index.tsx          # Ponto de entrada
└── vite.config.ts     # Configuração do Vite
```

## Segurança

- ⚠️ **Importante**: As configurações do Firebase estão atualmente hardcoded em `services/firebase.ts`
- 🔐 Para produção, considere mover as credenciais do Firebase para variáveis de ambiente
- 🔑 A API key do Gemini está configurada como secret no Cloud Run (Secret Manager)
- 🛡️ Configure as regras de segurança do Firestore adequadamente (veja [FIREBASE_SETUP.md](./FIREBASE_SETUP.md))
- 🔒 Secret Manager configurado para armazenar API keys de forma segura
- 🌐 Acesso público configurado no Cloud Run (pode ser restrito se necessário)

## Documentação Adicional

- **[DEPLOY.md](./DEPLOY.md)**: Guia completo de deploy no Cloud Run
- **[CLOUD_BUILD_SETUP.md](./CLOUD_BUILD_SETUP.md)**: Configuração do deploy automático
- **[FIREBASE_SETUP.md](./FIREBASE_SETUP.md)**: Configuração e verificações do Firebase
- **[FEATURES.md](./FEATURES.md)**: Documentação completa de todas as funcionalidades
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)**: Guia de resolução de problemas

## Suporte

Para dúvidas ou problemas:
1. Consulte a documentação acima
2. Verifique [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) para problemas comuns
3. Abra uma issue no repositório GitHub com detalhes do problema

## Licença

Este projeto é privado e proprietário da Yoobe Logistics.



