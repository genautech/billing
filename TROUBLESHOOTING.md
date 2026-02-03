# Troubleshooting - Guia de Resolução de Problemas

Este documento contém soluções para problemas comuns encontrados durante o deploy e uso do sistema.

## Problemas de Deploy no Cloud Run

### Erro: "Service account does not exist"

**Sintoma:**

```bash
ERROR: Service account 510465863297@cloudbuild.gserviceaccount.com does not exist.
```

**Causa:** A service account do Cloud Build ainda não foi criada.

**Solução:**

```bash
# Habilitar Cloud Build API (cria a service account automaticamente)
gcloud services enable cloudbuild.googleapis.com --project=YOUR_PROJECT_ID

# Aguardar 1-2 minutos para a service account ser criada
# Depois, configurar permissões normalmente
```

---

### Erro: "Permission denied on secret"

**Sintoma:**

```bash
ERROR: Permission denied on secret: projects/.../secrets/gemini-api-key/versions/latest 
for Revision service account ...-compute@developer.gserviceaccount.com
```

**Causa:** A service account do Cloud Run não tem permissão para acessar o secret.

**Solução:**

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

# Dar permissão ao Cloud Build
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=YOUR_PROJECT_ID

# Dar permissão ao Cloud Run (IMPORTANTE!)
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=YOUR_PROJECT_ID
```

---

### Erro: "Container failed to start and listen on PORT"

**Sintoma:**

```bash
ERROR: The user-provided container failed to start and listen on the port defined 
provided by the PORT=8080 environment variable within the allocated timeout.
```

**Causa:** O Nginx está configurado para escutar na porta 80, mas o Cloud Run espera a porta definida pela variável `PORT` (geralmente 8080).

**Solução:**

O problema foi resolvido criando um script `entrypoint.sh` que configura o Nginx dinamicamente:

```bash
#!/bin/sh
PORT=${PORT:-8080}
sed -i "s/listen 80;/listen ${PORT};/g" /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
```

E atualizando o `Dockerfile` para usar este script como entrypoint.

**Verificar:** Certifique-se de que o `Dockerfile` inclui:

- Cópia do `entrypoint.sh`
- `ENTRYPOINT ["/entrypoint.sh"]`
- `EXPOSE 8080`

---

### Erro: "Setting IAM policy failed" / HTTP 403

**Sintoma:**
```
Setting IAM policy failed, try "gcloud beta run services add-iam-policy-binding..."
```

**Causa:** O serviço não tem permissão de acesso público configurada.

**Solução:**
```bash
gcloud run services add-iam-policy-binding billing-app \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --project=YOUR_PROJECT_ID
```

**Nota:** Isso já está configurado automaticamente no `cloudbuild.yaml` atual.

---

### Erro: "Image not found"

**Sintoma:**

```bash
ERROR: Image gcr.io/.../billing-app:... not found
```

**Causa:** A imagem não foi construída ou enviada corretamente.

**Solução:**
1. Verifique se o build foi concluído:
   ```bash
   gcloud builds list --project=YOUR_PROJECT_ID --limit=5
   ```

2. Verifique se a imagem existe:
   ```bash
   gcloud container images list --repository=gcr.io/YOUR_PROJECT_ID
   ```

3. Se necessário, reconstrua:
   ```bash
   docker build -t gcr.io/YOUR_PROJECT_ID/billing-app:latest .
   gcloud auth configure-docker
   docker push gcr.io/YOUR_PROJECT_ID/billing-app:latest
   ```

---

## Problemas de Build

### Erro: "npm ci failed"

**Sintoma:**

```bash
ERROR: npm ci --only=production=false failed
```

**Causa:** Dependências não estão sincronizadas ou há problemas no `package-lock.json`.

**Solução:**
1. Verifique se o `package-lock.json` está commitado
2. Tente atualizar localmente:
   ```bash
   npm install
   git add package-lock.json
   git commit -m "fix: Atualizar package-lock.json"
   git push origin main
   ```

---

### Erro: "Build timeout"

**Sintoma:**

```bash
ERROR: Build timeout after 1200s
```

**Causa:** O build está demorando muito (geralmente no passo de build do Docker).

**Solução:**
1. Aumente o timeout no `cloudbuild.yaml`:
   ```yaml
   timeout: '1800s'  # 30 minutos
   ```

2. Ou otimize o Dockerfile usando cache de layers:
   ```dockerfile
   # Copiar package.json primeiro para usar cache
   COPY package*.json ./
   RUN npm ci
   # Depois copiar o resto do código
   COPY . .
   ```

---

## Problemas de Runtime

### Erro: "Firebase config is not set!"

**Sintoma:**

```text
Firebase config is not set!
```

Console mostra aviso sobre configuração do Firebase.

**Causa:** As credenciais do Firebase não estão configuradas corretamente.

**Solução:**
1. Verifique o arquivo `services/firebase.ts`
2. Certifique-se de que as credenciais estão corretas
3. Verifique se o projeto Firebase existe e está ativo

---

### Erro: "GEMINI_API_KEY not found"

**Sintoma:**
Funcionalidades de IA não funcionam.

**Causa:** A variável de ambiente `GEMINI_API_KEY` não está configurada.

**Solução:**

**Em desenvolvimento:**
```bash
# Criar .env.local
echo "GEMINI_API_KEY=your_key_here" > .env.local
```

**Em produção (Cloud Run):**
```bash
# Verificar se o secret existe
gcloud secrets list --project=YOUR_PROJECT_ID

# Se não existir, criar
echo -n "your_key_here" | gcloud secrets create gemini-api-key \
  --data-file=- \
  --replication-policy="automatic" \
  --project=YOUR_PROJECT_ID

# Verificar se está configurado no serviço
gcloud run services describe billing-app \
  --region us-central1 \
  --project=YOUR_PROJECT_ID \
  --format="value(spec.template.spec.containers[0].env)"
```

---

### Erro: "Missing or insufficient permissions" (Firestore)

**Sintoma:**
Erro ao acessar dados do Firestore.

**Causa:** Regras de segurança do Firestore não estão configuradas corretamente.

**Solução:**
1. Acesse [Firestore Rules](https://console.firebase.google.com/project/_/firestore/rules)
2. Configure as regras conforme `FIREBASE_SETUP.md`
3. Para desenvolvimento, pode usar regras permissivas temporariamente

---

### Erro: "The query requires an index"

**Sintoma:**

```text
ERROR: The query requires an index
```

**Causa:** Query composta precisa de índice no Firestore.

**Solução:**
1. O Firestore mostrará um link no console do navegador
2. Clique no link para criar o índice automaticamente
3. Ou crie manualmente em [Firestore Indexes](https://console.firebase.google.com/project/_/firestore/indexes)

---

## Problemas de Geração de Faturas

### Fatura com valor total zerado

**Sintoma:**
Fatura é gerada mas valorTotal é 0, mesmo havendo detalhes de envio.

**Causa:**
- Tabela de preços sem itens correspondentes
- Colunas do CSV sem match na tabela de preços
- Item de preço com precoVenda = 0

**Solução:**
1. Verifique o console do navegador para os logs de processamento
2. Procure por mensagens como:
   - `ERRO: Preço calculado é 0 para item ID...`
   - `⚠️ Match NÃO encontrado para coluna...`
   - `ERRO CRÍTICO: Fatura tem valor total zerado mas há detalhes!`
3. Verifique se a tabela de preços contém os itens necessários
4. Confirme que os itens têm `custoUnitario` e `margemLucro` válidos

---

### Nenhum pedido encontrado após processamento

**Sintoma:**
Ao processar os CSVs, nenhum pedido é encontrado ou todos aparecem como "não correspondentes".

**Causa:**
- Coluna de ID de pedido não identificada
- IDs de pedido não coincidem entre Track Report e Order Detail
- Dados filtrados pelo mês de referência incorreto

**Solução:**
1. Verifique se o Track Report tem uma coluna chamada "Número do pedido", "Numero", ou similar
2. Verifique se o Order Detail tem a mesma coluna com valores correspondentes
3. Confirme que o mês de referência selecionado corresponde às datas nos CSVs
4. Verifique os logs do console:
   - `Track Report filtrado: X linhas`
   - `Order Detail filtrado: Y linhas`
   - `Pedidos com match: Z`

---

### Colunas de custo sem correspondência

**Sintoma:**
Aviso de que algumas colunas de custo não tiveram match na tabela de preços.

**Causa:**
- Nomes das colunas no CSV não correspondem às descrições na tabela de preços
- Falta item específico na tabela de preços

**Solução:**
1. Verifique os logs para identificar quais colunas não tiveram match
2. Adicione ou edite itens na tabela de preços com descrições correspondentes
3. Use as mesmas palavras-chave presentes nas colunas do CSV

---

### Item de picking não encontrado

**Sintoma:**
Aviso: `Item de picking "pedidos contendo de 0.0 até 1.0 itens" NÃO encontrado`

**Causa:**
Tabela de preços não contém os itens de picking/packing necessários.

**Solução:**
1. Adicione à tabela de preços um item com descrição contendo:
   - "pedidos contendo de 0.0 até 1.0 itens"
   - "pedidos contendo mais de 1.0 itens"
2. Configure custoUnitario e margemLucro adequados

---

### Formato esperado dos CSVs

**Track Report (Relatório de Rastreio):**
- Colunas obrigatórias:
  - Data de envio (ou "Data de Envio", "Data")
  - Número do pedido (ou "Numero", "Order ID")
  - Rastreio (opcional, mas recomendado)

**Order Detail (Relatório de Custos):**
- Colunas obrigatórias:
  - Data do pedido (ou "Data")
  - Número do pedido (correspondente ao Track Report)
  - Total
- Colunas de custo identificadas automaticamente (qualquer coluna com "custo" no nome)
- Colunas especiais:
  - Coluna AD: Custo total de envio
  - Coluna E: Quantidade de itens (para cálculo de picking)
  - Coluna M: CEP do destino
  - Coluna O: Estado/UF do destino
  - Coluna T: Custo do picking de produtos

---

## Problemas de PDF

### PDF não gera ou está vazio

**Sintoma:**
PDF gerado está vazio ou não contém todo o conteúdo.

**Causa:** 
- Pedidos colapsados não são expandidos antes de capturar
- html2canvas não está capturando todo o conteúdo

**Solução:**
O problema foi resolvido na versão atual:
- Todos os pedidos são expandidos automaticamente antes de gerar o PDF
- Configuração melhorada do html2canvas com scale maior

**Verificar:** Certifique-se de que o código em `ClientBillDetail.tsx` expande todos os pedidos:
```typescript
const allOrderCodes = Object.keys(groupedByOrder);
setExpandedOrders(new Set(allOrderCodes));
await new Promise(resolve => setTimeout(resolve, 300));
```

---

### PDF "Como Funciona" não funciona

**Sintoma:**
Botão de gerar PDF não aparece ou não funciona.

**Causa:** Componente não foi atualizado com a funcionalidade de PDF.

**Solução:**
Verifique se `ClientBillingExplanationView.tsx` contém:
- `pdfContentRef` definido
- Função `handleGeneratePDF` implementada
- Botão "Gerar PDF Completo" na interface

---

## Problemas de Autenticação

### Não consigo fazer login como admin

**Sintoma:**
Credenciais padrão não funcionam.

**Causa:** Usuário admin não foi criado ou senha foi alterada.

**Solução:**
1. Verifique se o usuário existe no Firestore (collection `clientes`)
2. Se não existir, o sistema cria automaticamente na primeira execução
3. Credenciais padrão:
   - Email: `admin@yoobe.co`
   - Senha: `123`
4. Se ainda não funcionar, verifique os logs do console do navegador

---

## Problemas de Performance

### Aplicação lenta ao carregar

**Sintoma:**
Aplicação demora para carregar dados.

**Causa:** 
- Queries do Firestore sem índices
- Muitos dados sendo carregados de uma vez

**Solução:**
1. Verifique se há índices necessários (veja erros no console)
2. Considere implementar paginação para listas grandes
3. Use cache quando apropriado

---

## Verificação de Logs

### Como ver logs do Cloud Run

```bash
# Logs em tempo real
gcloud run services logs read billing-app \
  --region us-central1 \
  --project=YOUR_PROJECT_ID \
  --follow

# Últimas 100 linhas
gcloud run services logs read billing-app \
  --region us-central1 \
  --project=YOUR_PROJECT_ID \
  --limit 100
```

### Como ver logs do Cloud Build

```bash
# Listar builds
gcloud builds list --project=YOUR_PROJECT_ID --limit=10

# Ver logs de um build específico
gcloud builds log BUILD_ID --project=YOUR_PROJECT_ID
```

---

## Problemas com DIFAL

### DIFAL cobrado múltiplas vezes por pedido

**Sintoma:** O mesmo pedido aparece com várias cobranças de DIFAL.

**Causa:** O pedido aparece múltiplas vezes no relatório de rastreio (ex: múltiplos envios).

**Solução:** A partir da versão atual, o sistema controla automaticamente duplicações. Cada pedido é cobrado apenas uma vez por DIFAL, independente de quantas vezes apareça no relatório.

### DIFAL não aparece em alguns pedidos

**Sintoma:** Alguns pedidos não têm cobrança de DIFAL mesmo tendo envio.

**Causa:** O CSV não continha coluna de DIFAL ou o valor estava zerado.

**Solução:** O sistema agora adiciona automaticamente DIFAL de R$ 3,00 (mínimo) para pedidos que não tenham valor de DIFAL no CSV.

### Valor do DIFAL incorreto

**Sintoma:** O valor cobrado não corresponde ao esperado.

**Causa:** Confusão entre margem configurada na tabela de preços e margem fixa do DIFAL.

**Solução:** O DIFAL usa **margem fixa de 200%** (custo × 3) com **mínimo de R$ 3,00**. A margem da tabela de preços não é utilizada para DIFAL.

**Cálculo:**
- Custo CSV R$ 0,50 → R$ 3,00 (mínimo aplicado)
- Custo CSV R$ 1,00 → R$ 3,00 (1 × 3 = 3)
- Custo CSV R$ 2,00 → R$ 6,00 (2 × 3 = 6)

### XMLs de notas fiscais não alteram valor do DIFAL

**Sintoma:** Após anexar XMLs, o valor do DIFAL não mudou.

**Causa:** Isso é o comportamento esperado.

**Solução:** Os XMLs de notas de remessa são **apenas comprovantes de envio** para download. Os valores contidos neles são simbólicos (brinde) e não afetam a cobrança de DIFAL.

### DIFAL não aparece na fatura do cliente

**Sintoma:** O DIFAL foi cobrado na geração mas não aparece para o cliente.

**Causa:** Os IDs dos itens de preço da fatura não correspondem aos IDs da tabela de preços atual.

**Solução:** Este problema ocorre quando a fatura foi gerada com uma versão antiga da tabela de preços. O sistema agora:
1. Utiliza um mecanismo de fallback por descrição quando o ID não é encontrado
2. Identifica automaticamente itens DIFAL por palavras-chave na descrição
3. Exibe itens DIFAL mesmo que estejam categorizados como "Custos Internos"

**Prevenção:** Use sempre a tabela de preços do cliente (se existir) ou a global atualizada. O sistema mostra no **resumo pré-aprovação** qual tabela está sendo utilizada.

### IDs de DIFAL não correspondem à tabela de preços

**Sintoma:** Mensagem "Item não encontrado na tabela para ID" nos logs.

**Causa:** A tabela de preços foi atualizada após a geração da fatura, alterando os IDs.

**Solução:** 
1. O sistema usa fallback por descrição para encontrar itens DIFAL
2. Verifique no **resumo pré-aprovação** se a tabela correta está sendo utilizada
3. Se persistir, considere regenerar a fatura com a tabela atualizada

---

## Resumo Pré-Aprovação

### O que é o Resumo Pré-Aprovação?

Antes de salvar uma fatura, o sistema exibe um resumo detalhado com:
- **Total de pedidos únicos** processados
- **Total de envios** (valor monetário)
- **Total de DIFAL** com quantidade de cobranças
- **Total de armazenagem**
- **Outros custos logísticos**
- **Total geral da fatura**
- **Qual tabela de preços está sendo usada** (Cliente ou Global)
- **Avisos** sobre itens não encontrados
- **Pedidos sem correspondência**

### Tabela "Cliente" vs "Global"

O resumo indica qual tabela está sendo utilizada:
- **Cliente**: Tabela personalizada do cliente com margens específicas
- **Global**: Tabela padrão compartilhada por todos os clientes

**Importante:** Se o cliente tem uma tabela personalizada configurada, ela será utilizada automaticamente. Isso garante que as margens específicas do cliente sejam aplicadas.

---

## Checklist de Verificação

Antes de reportar um problema, verifique:

- [ ] APIs do GCP estão habilitadas
- [ ] Secret Manager está configurado corretamente
- [ ] Permissões IAM estão configuradas
- [ ] Firebase está configurado corretamente
- [ ] Variáveis de ambiente estão definidas
- [ ] Build mais recente foi bem-sucedido
- [ ] Logs foram verificados para erros específicos

---

## Suporte Adicional

Se o problema persistir:

1. Verifique os logs (Cloud Run e Cloud Build)
2. Verifique o console do navegador para erros JavaScript
3. Verifique as regras do Firestore
4. Abra uma issue no repositório GitHub com:
   - Descrição detalhada do problema
   - Logs relevantes
   - Passos para reproduzir
   - Versão do código (commit hash)





