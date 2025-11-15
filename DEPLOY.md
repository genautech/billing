# Guia de Deploy - Cloud Run

Este documento contém instruções detalhadas para fazer deploy da aplicação no Google Cloud Run.

## Pré-requisitos

1. **Conta Google Cloud Platform** com projeto criado
2. **Google Cloud SDK** instalado e configurado
3. **APIs habilitadas**:
   - Cloud Run API
   - Container Registry API
   - Cloud Build API (se usar Cloud Build)

## Opção 1: Deploy Automático com Cloud Build

### Passo 1: Habilitar APIs Necessárias

```bash
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com
```

### Passo 2: Configurar Cloud Build Trigger

1. Acesse o [Cloud Build Console](https://console.cloud.google.com/cloud-build/triggers)
2. Clique em "Create Trigger"
3. Conecte ao repositório GitHub: `genautech/billing`
4. Configure:
   - **Name**: `deploy-billing-app`
   - **Event**: Push to a branch
   - **Branch**: `^main$`
   - **Configuration**: Cloud Build configuration file (yaml)
   - **Location**: `cloudbuild.yaml`

### Passo 3: Configurar Secret Manager (Recomendado)

Para maior segurança, use o Secret Manager para a API key do Gemini:

```bash
# Criar o secret
echo -n "sua_api_key_aqui" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --replication-policy="automatic"

# Dar permissão ao Cloud Build para acessar o secret
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Passo 4: Atualizar cloudbuild.yaml para usar Secret Manager

Se optar por usar Secret Manager, atualize o `cloudbuild.yaml`:

```yaml
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'billing-app'
      - '--image'
      - 'gcr.io/$PROJECT_ID/billing-app:$SHORT_SHA'
      - '--region'
      - 'us-central1'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'
      - '--memory'
      - '512Mi'
      - '--cpu'
      - '1'
      - '--timeout'
      - '300'
      - '--concurrency'
      - '80'
      - '--max-instances'
      - '10'
      - '--set-secrets'
      - 'GEMINI_API_KEY=gemini-api-key:latest'
```

### Passo 5: Fazer Push

Agora, sempre que você fizer push para a branch `main`, o Cloud Build irá automaticamente:
1. Construir a imagem Docker
2. Fazer push para Container Registry
3. Fazer deploy no Cloud Run

```bash
git push origin main
```

## Opção 2: Deploy Manual com gcloud CLI

### Passo 1: Configurar o Projeto

```bash
gcloud config set project YOUR_PROJECT_ID
```

### Passo 2: Habilitar APIs

```bash
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com
```

### Passo 3: Construir e Fazer Push da Imagem

```bash
# Build da imagem
docker build -t gcr.io/YOUR_PROJECT_ID/billing-app:latest .

# Autenticar Docker no GCP
gcloud auth configure-docker

# Push para Container Registry
docker push gcr.io/YOUR_PROJECT_ID/billing-app:latest
```

### Passo 4: Deploy no Cloud Run

#### Usando Variável de Ambiente (Simples)

```bash
gcloud run deploy billing-app \
  --image gcr.io/YOUR_PROJECT_ID/billing-app:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 80 \
  --max-instances 10 \
  --set-env-vars GEMINI_API_KEY=your_api_key_here
```

#### Usando Secret Manager (Recomendado)

```bash
# Criar o secret (se ainda não criou)
echo -n "sua_api_key_aqui" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --replication-policy="automatic"

# Deploy com secret
gcloud run deploy billing-app \
  --image gcr.io/YOUR_PROJECT_ID/billing-app:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 80 \
  --max-instances 10 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

### Passo 5: Verificar Deploy

```bash
# Obter URL do serviço
gcloud run services describe billing-app \
  --region us-central1 \
  --format="value(status.url)"
```

## Configurações Recomendadas do Cloud Run

| Configuração | Valor | Descrição |
|-------------|-------|-----------|
| **Região** | `us-central1` | Escolha a região mais próxima dos usuários |
| **Memória** | `512Mi` | Suficiente para app React estático |
| **CPU** | `1` | CPU compartilhada é suficiente |
| **Timeout** | `300s` | 5 minutos para requests longos |
| **Concorrência** | `80` | Requests simultâneos por instância |
| **Máximo de Instâncias** | `10` | Ajuste conforme necessidade |
| **Mínimo de Instâncias** | `0` | Escala para zero quando não usado |

## Atualizar Variáveis de Ambiente

Para atualizar a API key após o deploy:

```bash
# Usando variável de ambiente
gcloud run services update billing-app \
  --region us-central1 \
  --set-env-vars GEMINI_API_KEY=nova_api_key

# Ou usando secret
gcloud run services update billing-app \
  --region us-central1 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

## Verificar Logs

```bash
# Ver logs em tempo real
gcloud run services logs read billing-app \
  --region us-central1 \
  --follow

# Ver últimas 100 linhas
gcloud run services logs read billing-app \
  --region us-central1 \
  --limit 100
```

## Troubleshooting

### Erro: "Permission denied"
- Verifique se as APIs estão habilitadas
- Verifique se você tem as permissões necessárias (Cloud Run Admin, Service Account User)

### Erro: "Image not found"
- Verifique se a imagem foi construída e enviada corretamente
- Verifique o nome do projeto no caminho da imagem

### Erro: "API key not found"
- Verifique se a variável de ambiente `GEMINI_API_KEY` está configurada
- Verifique se o secret existe e tem as permissões corretas

### App não carrega
- Verifique os logs do Cloud Run
- Verifique se o Firebase está configurado corretamente
- Verifique se o build foi feito corretamente (verifique a pasta `dist/`)

## Custos Estimados

Com as configurações recomendadas:
- **Cloud Run**: ~$0.40 por milhão de requests + $0.00002400 por GB-segundo
- **Container Registry**: Primeiros 0.5 GB grátis, depois $0.026 por GB/mês
- **Cloud Build**: Primeiros 120 minutos/dia grátis, depois $0.003 por minuto

Para um app com tráfego moderado, os custos devem ser muito baixos (menos de $10/mês).

## Próximos Passos

1. Configurar domínio customizado (opcional)
2. Configurar SSL/TLS (automático com Cloud Run)
3. Configurar monitoramento e alertas
4. Configurar CI/CD completo
5. Mover configurações do Firebase para variáveis de ambiente

## Links Úteis

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Container Registry Pricing](https://cloud.google.com/container-registry/pricing)

