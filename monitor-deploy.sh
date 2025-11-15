#!/bin/bash

PROJECT_ID="gen-lang-client-0296053913"
BUILD_ID="74da36af-8eb6-44fa-9c74-059db21ba0de"

echo "🔍 Monitorando deploy..."
echo ""

while true; do
    STATUS=$(gcloud builds describe $BUILD_ID --project=$PROJECT_ID --format="value(status)" 2>/dev/null)
    
    if [ "$STATUS" = "SUCCESS" ]; then
        echo "✅ Build concluído com sucesso!"
        echo ""
        echo "📦 Verificando serviço Cloud Run..."
        gcloud run services list --project=$PROJECT_ID --region us-central1
        echo ""
        echo "🌐 URL do serviço:"
        gcloud run services describe billing-app \
            --region us-central1 \
            --project=$PROJECT_ID \
            --format="value(status.url)" 2>/dev/null || echo "Serviço ainda não disponível"
        break
    elif [ "$STATUS" = "FAILURE" ] || [ "$STATUS" = "CANCELLED" ] || [ "$STATUS" = "EXPIRED" ]; then
        echo "❌ Build falhou com status: $STATUS"
        echo ""
        echo "📋 Últimos logs:"
        gcloud builds log $BUILD_ID --project=$PROJECT_ID | tail -30
        break
    elif [ "$STATUS" = "WORKING" ] || [ "$STATUS" = "QUEUED" ]; then
        echo "⏳ Status: $STATUS - Aguardando..."
        sleep 10
    else
        echo "ℹ️  Status: $STATUS"
        sleep 10
    fi
done

