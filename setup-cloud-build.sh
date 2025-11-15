#!/bin/bash

# Script para configurar Cloud Build Trigger automaticamente
# Execute este script após configurar o gcloud CLI

set -e

echo "🚀 Configurando Cloud Build para deploy automático..."
echo ""

# Verificar se gcloud está instalado
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI não está instalado. Por favor, instale primeiro:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Obter projeto atual
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Nenhum projeto GCP configurado."
    echo "   Execute: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📋 Projeto GCP: $PROJECT_ID"
echo ""

# Habilitar APIs necessárias
echo "🔧 Habilitando APIs necessárias..."
gcloud services enable \
    run.googleapis.com \
    containerregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    --project=$PROJECT_ID

echo "✅ APIs habilitadas"
echo ""

# Verificar se o repositório está conectado
echo "🔗 Verificando conexão com GitHub..."
echo "   Se ainda não conectou, você precisará:"
echo "   1. Ir para: https://console.cloud.google.com/cloud-build/triggers"
echo "   2. Conectar seu repositório GitHub"
echo "   3. Autorizar o acesso"
echo ""

# Perguntar sobre Secret Manager
read -p "Deseja usar Secret Manager para GEMINI_API_KEY? (s/n): " use_secret

if [ "$use_secret" = "s" ] || [ "$use_secret" = "S" ]; then
    echo ""
    read -sp "Digite sua GEMINI_API_KEY (não será exibida): " api_key
    echo ""
    
    # Criar secret
    echo "🔐 Criando secret no Secret Manager..."
    echo -n "$api_key" | gcloud secrets create gemini-api-key \
        --data-file=- \
        --replication-policy="automatic" \
        --project=$PROJECT_ID 2>/dev/null || \
    echo -n "$api_key" | gcloud secrets versions add gemini-api-key \
        --data-file=- \
        --project=$PROJECT_ID
    
    # Obter número do projeto
    PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
    
    # Dar permissão ao Cloud Build
    echo "🔑 Configurando permissões..."
    gcloud secrets add-iam-policy-binding gemini-api-key \
        --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor" \
        --project=$PROJECT_ID
    
    echo "✅ Secret criado e configurado"
    echo ""
    echo "📝 IMPORTANTE: Atualize o cloudbuild.yaml para usar Secret Manager:"
    echo "   Substitua: --set-env-vars GEMINI_API_KEY=\${_GEMINI_API_KEY}"
    echo "   Por: --set-secrets GEMINI_API_KEY=gemini-api-key:latest"
else
    echo ""
    read -sp "Digite sua GEMINI_API_KEY para configurar no trigger: " api_key
    echo ""
    echo "📝 Você precisará configurar esta variável no Cloud Build Trigger:"
    echo "   Nome da variável: _GEMINI_API_KEY"
    echo "   Valor: $api_key"
    echo ""
fi

echo "✅ Configuração básica concluída!"
echo ""
echo "📋 Próximos passos:"
echo ""
echo "1. Conecte o repositório GitHub (se ainda não fez):"
echo "   https://console.cloud.google.com/cloud-build/triggers"
echo ""
echo "2. Crie o trigger:"
echo "   - Nome: deploy-billing-app"
echo "   - Event: Push to a branch"
echo "   - Branch: ^main$"
echo "   - Configuration: Cloud Build configuration file (yaml)"
echo "   - Location: cloudbuild.yaml"
echo ""
if [ "$use_secret" = "s" ] || [ "$use_secret" = "S" ]; then
    echo "3. Atualize o cloudbuild.yaml para usar Secret Manager"
    echo "   (veja instruções acima)"
else
    echo "3. Configure a substituição _GEMINI_API_KEY com sua API key"
fi
echo ""
echo "4. Faça push para o repositório:"
echo "   git push origin main"
echo ""
echo "🎉 O deploy será automático!"

