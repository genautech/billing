# Configuração do Cloud Build - Deploy Automático

Este guia passo a passo irá ajudá-lo a configurar o deploy automático usando Cloud Build.

## Pré-requisitos

1. **Conta Google Cloud Platform** com projeto criado
2. **Google Cloud SDK** instalado e configurado
3. **Acesso ao repositório GitHub**: `genautech/billing`

## Passo 1: Configurar gcloud CLI

Se ainda não configurou:

```bash
# Instalar gcloud (se necessário)
# macOS: brew install google-cloud-sdk
# Ou baixe de: https://cloud.google.com/sdk/docs/install

# Fazer login
gcloud auth login

# Configurar projeto
gcloud config set project YOUR_PROJECT_ID

# Verificar configuração
gcloud config list
```

## Passo 2: Executar Script de Configuração

Execute o script de configuração:

```bash
./setup-cloud-build.sh
```

O script irá:
- ✅ Habilitar APIs necessárias
- ✅ Criar secret no Secret Manager (opcional)
- ✅ Configurar permissões

**OU** configure manualmente seguindo os passos abaixo.

## Passo 3: Habilitar APIs Necessárias

```bash
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

## Passo 4: Conectar Repositório GitHub

1. Acesse o [Cloud Build Console](https://console.cloud.google.com/cloud-build/triggers)
2. Clique em **"Connect Repository"**
3. Selecione **"GitHub (Cloud Build GitHub App)"**
4. Autorize o acesso ao GitHub
5. Selecione o repositório: `genautech/billing`
6. Clique em **"Connect"**

## Passo 5: Criar Secret no Secret Manager (Recomendado)

Para maior segurança, use o Secret Manager:

```bash
# Criar o secret
echo -n "sua_gemini_api_key_aqui" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --replication-policy="automatic"

# Obter número do projeto
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

# Dar permissão ao Cloud Build para acessar o secret
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Passo 6: Atualizar cloudbuild.yaml para usar Secret Manager

Se você optou por usar Secret Manager, atualize o arquivo `cloudbuild.yaml`:

**Substitua esta linha:**
```yaml
- '--set-env-vars'
- 'GEMINI_API_KEY=${_GEMINI_API_KEY}'
```

**Por:**
```yaml
- '--set-secrets'
- 'GEMINI_API_KEY=gemini-api-key:latest'
```

E remova a seção `substitutions` do final do arquivo.

## Passo 7: Criar Cloud Build Trigger

### Opção A: Via Console (Mais Fácil)

1. Acesse [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Clique em **"Create Trigger"**
3. Configure:
   - **Name**: `deploy-billing-app`
   - **Event**: `Push to a branch`
   - **Source**: Selecione o repositório `genautech/billing`
   - **Branch**: `^main$` (regex para branch main)
   - **Configuration**: `Cloud Build configuration file (yaml)`
   - **Location**: `cloudbuild.yaml`

4. **Se NÃO usar Secret Manager**, adicione substituição:
   - Clique em **"Show included and ignored files"** → **"Substitution variables"**
   - Adicione:
     - **Variable**: `_GEMINI_API_KEY`
     - **Value**: Sua API key do Gemini

5. Clique em **"Create"**

### Opção B: Via gcloud CLI

```bash
gcloud builds triggers create github \
  --name="deploy-billing-app" \
  --repo-name="billing" \
  --repo-owner="genautech" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --substitutions="_GEMINI_API_KEY=sua_api_key_aqui"
```

**Nota**: Se usar Secret Manager, não precisa da substituição `_GEMINI_API_KEY`.

## Passo 8: Testar o Deploy

Faça um pequeno commit e push para testar:

```bash
# Fazer uma pequena mudança (ex: atualizar README)
echo "" >> README.md
git add README.md
git commit -m "test: Testar deploy automático"
git push origin main
```

## Passo 9: Verificar o Deploy

1. Acesse [Cloud Build History](https://console.cloud.google.com/cloud-build/builds)
2. Você verá o build em execução
3. Clique no build para ver os logs em tempo real
4. Quando concluir, acesse [Cloud Run](https://console.cloud.google.com/run) para ver o serviço

## Verificar URL do Serviço

Após o deploy, obtenha a URL:

```bash
gcloud run services describe billing-app \
  --region us-central1 \
  --format="value(status.url)"
```

Ou acesse o [Cloud Run Console](https://console.cloud.google.com/run) e clique no serviço `billing-app`.

## Troubleshooting

### Erro: "Permission denied"
```bash
# Verificar permissões
gcloud projects get-iam-policy $(gcloud config get-value project)

# Dar permissões necessárias ao Cloud Build
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"
```

### Erro: "Secret not found"
- Verifique se o secret foi criado: `gcloud secrets list`
- Verifique se as permissões estão corretas
- Verifique se o nome do secret no `cloudbuild.yaml` está correto

### Erro: "Image not found"
- Verifique se o Container Registry está habilitado
- Verifique se o build foi concluído com sucesso
- Verifique os logs do Cloud Build

### Build falha
- Verifique os logs do Cloud Build
- Verifique se todas as dependências estão no `package.json`
- Verifique se o `Dockerfile` está correto

## Atualizar API Key

### Se usar Secret Manager:
```bash
echo -n "nova_api_key" | gcloud secrets versions add gemini-api-key --data-file=-
```

### Se usar substituição no trigger:
1. Vá para [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Clique no trigger `deploy-billing-app`
3. Edite e atualize a variável `_GEMINI_API_KEY`

## Próximos Passos

Após o deploy bem-sucedido:

1. ✅ Teste a aplicação na URL fornecida
2. ✅ Configure domínio customizado (opcional)
3. ✅ Configure monitoramento e alertas
4. ✅ Revise as regras de segurança do Firestore (veja `FIREBASE_SETUP.md`)

## Links Úteis

- [Cloud Build Console](https://console.cloud.google.com/cloud-build)
- [Cloud Run Console](https://console.cloud.google.com/run)
- [Secret Manager Console](https://console.cloud.google.com/security/secret-manager)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)

