# Unfollow seguro para Instagram e X (Twitter)

Scripts do [Tampermonkey](https://www.tampermonkey.net/) que deixam de seguir contas em massa **com atrasos, pausas e limite diário**, para reduzir o risco de a conta ser limitada.

> **Leia antes de usar:** automatizar ações no Instagram e no X vai contra os termos de uso das duas plataformas. Os scripts imitam um ritmo humano e param sozinhos se aparecer aviso de bloqueio, mas **não existe garantia de que a conta não será limitada**. Use por sua conta e risco.

## O que tem aqui

| Arquivo | Site | O que faz |
|---|---|---|
| `instagram-unfollow-seguro.user.js` | instagram.com | Salva a lista dos seus seguidores, deixa de seguir em massa e pula quem te segue de volta |
| `twitter-unfollow-seguro.user.js` | x.com / twitter.com | Deixa de seguir em massa e pula quem te segue de volta |

**Requisitos:** computador (os scripts não funcionam no aplicativo do celular), navegador com Tampermonkey e a conta aberta e logada no site. No Instagram, a conta precisa estar em **português ou inglês**, porque o script reconhece os botões "Seguindo/Following" e "Deixar de seguir/Unfollow".

---

## 1. Instalar o Tampermonkey

1. Instale a extensão **Tampermonkey** no seu navegador (Chrome, Edge, Firefox ou Safari) pela loja oficial de extensões.
2. **Chrome e Edge:** abra `chrome://extensions` (ou `edge://extensions`), entre nos **Detalhes** do Tampermonkey e ative **"Permitir scripts de usuário"**. Em algumas versões é preciso ativar o **Modo do desenvolvedor** (canto superior direito da página). Sem isso, nenhum script roda e o painel não aparece.

## 2. Instalar os scripts

**Opção A (mais fácil):**
1. Abra o arquivo `.user.js` aqui no GitHub e clique em **Raw**.
2. O Tampermonkey abre uma tela de instalação. Clique em **Instalar**.

**Opção B (copiar e colar):**
1. Clique no ícone do Tampermonkey e depois em **Criar um novo script**.
2. Apague todo o conteúdo que já vem no editor.
3. Cole o código do arquivo `.user.js` e aperte **Ctrl+S**.

Depois de instalar, **recarregue a página** do Instagram ou do X (F5). O ícone do Tampermonkey deve mostrar um número (1) quando o script estiver ativo na página, e um painel escuro aparece no **canto inferior direito**.

---

## 3. Usar no Instagram

O Instagram não mostra quem te segue de volta na lista "seguindo". Por isso o processo tem **duas etapas**: primeiro o script salva a lista dos seus seguidores, depois ele deixa de seguir todo mundo que não estiver nessa lista.

### Antes de começar

- Abra `instagram.com` no computador e entre na sua conta.
- Confira se o painel **"Unfollow seguro (Instagram)"** aparece no canto inferior direito. Se não aparecer, veja a seção [Se algo der errado](#6-se-algo-der-errado).
- Durante o uso, **mantenha a aba aberta e visível**. Se você trocar de aba ou minimizar a janela, o navegador pausa a rolagem e o carregamento, e o script trava.
- **Teste primeiro com a lista de proteção.** Se há contas que você nunca quer deixar de seguir, coloque os nomes de usuário na `whitelist` do script (veja [Configuração](#5-configuração)).

### Etapa 1: salvar a lista dos seus seguidores

Escolha **um** dos dois jeitos.

#### Jeito A: coletar pela tela

1. Clique na sua foto ou em **Perfil** para abrir o seu perfil.
2. Clique no número de **"seguidores"** (atenção: não é "seguindo"). Abre uma janela com a lista, e o endereço da página termina em `/followers/`.
3. No painel do canto inferior direito, clique em **1) Coletar meus seguidores**. O botão azul passa a mostrar **Parar**.
4. Espere, sem mexer na lista (não role, não feche, não troque de aba). O painel mostra o progresso, por exemplo `Coletando seguidores... 850 de ~1234`. Pode levar de alguns minutos a mais de dez, dependendo de quantos seguidores você tem.
5. Quando terminar, o painel mostra `Pronto: 1234 seguidores salvos (perfil: 1234)` e a linha **"Seguidores salvos: N (data e hora)"** é atualizada.

**Como o script garante que pegou todo mundo:** ele lê o total de seguidores do seu perfil e só salva a lista se tiver coletado **pelo menos 97%** desse total. Se pegar menos, mostra algo como `Coletou só 900 de ~1234 (73%). Não salvei...`. Nesse caso, tente de novo (com a aba visível) ou use o Jeito B. Se o perfil não mostrar o total, o script encerra a coleta depois de 20 segundos sem aparecer ninguém novo, e aí vale conferir se o número salvo bate com o do seu perfil.

#### Jeito B: importar o arquivo oficial do Instagram

Esse jeito não faz nenhuma requisição ao Instagram, então não tem risco de bloqueio. A desvantagem é que o Instagram pode demorar para preparar o arquivo.

1. No Instagram, abra **Configurações** e vá em **Central de Contas**, depois **Suas informações e permissões** e **Baixar suas informações**. Os nomes dos menus mudam de vez em quando.
2. Escolha a sua conta e selecione **Seguidores e seguindo** (ou "Alguns dos seus dados").
3. Em **formato**, escolha **JSON** (não HTML). Em **intervalo de datas**, escolha **Todo o período**.
4. Confirme o pedido. O Instagram avisa por e-mail quando o arquivo estiver pronto, o que pode levar de minutos a horas.
5. Baixe o arquivo ZIP e extraia. O arquivo que você precisa se chama `followers_1.json` e costuma ficar na pasta `connections/followers_and_following`. Se existirem `followers_2.json`, `followers_3.json` e assim por diante, use todos.
6. No Instagram, no painel do script, clique em **ou importar followers_1.json** e selecione o arquivo (para vários arquivos, segure Ctrl e clique em cada um).
7. O painel mostra `Importados N seguidores do arquivo`.

Use o arquivo de **seguidores** (`followers`), não o `following.json`. O script recusa o de "seguindo" para evitar erro.

### Etapa 2: deixar de seguir

1. Feche a lista de seguidores (no X da janela, ou clicando fora dela).
2. No seu perfil, clique em **"seguindo"** (o endereço da página termina em `/following/`) e espere a lista carregar.
3. Confira no painel:
   - a linha **"Seguidores salvos: N"** mostra a lista que você salvou na etapa 1;
   - a caixa **"Pular quem me segue de volta"** está marcada (vem marcada por padrão).
4. Clique em **2) Iniciar**. O botão passa a mostrar **Parar**.
5. Acompanhe pelo painel. Ele mostra qual conta está sendo removida (`Deixando de seguir @usuario...`) e os contadores `Sessão: N | Hoje: N/150 | Pulados: N`. "Pulados" são as contas que o script deixou de remover porque te seguem de volta ou estão na `whitelist`.
6. **Dica:** na primeira vez, deixe rodar uns minutos e confira se ele está pulando quem te segue. Se algo parecer errado, clique em **Parar**.
7. Deixe a aba aberta e visível até o fim. Para interromper a qualquer momento, clique em **Parar**.

**Como ele trabalha:**
- espera cerca de 3 segundos por conta (2 segundos de espera mais o tempo dos cliques);
- faz no máximo **49 unfollows a cada 10 minutos**. Quando completa 49, o painel mostra `Próximo lote: retomando em 6m40s` e espera a janela acabar;
- respeita o limite de **150 por dia**. O contador fica salvo e zera à meia-noite, então 150 unfollows levam cerca de 30 minutos;
- para sozinho se o Instagram mostrar "Ação bloqueada" ou "Tente novamente mais tarde".

Se sobrarem contas para o dia seguinte, abra a lista "seguindo" de novo e clique em **Iniciar**. A lista de seguidores salva continua valendo, mas se já passou bastante tempo, colete de novo antes.

### O que cada mensagem do painel significa

| Mensagem | O que fazer |
|---|---|
| `Abra seu perfil e clique em "seguidores" primeiro.` | Abra a lista de seguidores antes de clicar em **Coletar**. |
| `Essa é a lista "seguindo". Abra a lista "seguidores".` | Você abriu a lista errada para coletar. Abra "seguidores". |
| `Não achei a lista. Abra seu perfil, clique em "seguindo"...` | A lista "seguindo" não está aberta. Abra e clique em **Iniciar** de novo. |
| `Essa é a lista "seguidores". Abra a lista "seguindo"...` | Você abriu a lista errada para deixar de seguir. Abra "seguindo". |
| `Primeiro colete seus seguidores (ou importe o arquivo)...` | Faça a Etapa 1, ou desmarque "Pular quem me segue de volta" se quiser remover todos. |
| `Coletou só X de ~Y... Não salvei...` | A coleta ficou incompleta. Tente de novo ou importe o arquivo. |
| `Coleta interrompida. Nada foi salvo.` | Você clicou em **Parar** durante a coleta. Uma lista incompleta nunca é salva. |
| `Próximo lote: retomando em ...` | Normal. O script está esperando a janela de 10 minutos. |
| `Fim da lista (ou nada mais a processar).` | Terminou. Não há mais contas para remover. |
| `Limite diário (150) atingido. Continue amanhã.` | O teto do dia foi alcançado. |
| `O Instagram mostrou aviso de bloqueio/limite. Parei...` | Espere pelo menos 24 horas antes de tentar de novo. |
| `Várias falhas seguidas. Parei por segurança.` | O Instagram pode ter mudado a página ou estar travando. Veja [Se algo der errado](#6-se-algo-der-errado). |
| `A lista foi fechada. Parei.` | Você fechou a lista durante o processo. Abra "seguindo" e clique em **Iniciar**. |

---

## 4. Usar no X (Twitter)

1. Entre na sua conta e abra `x.com/SEU_USUARIO/following` (a lista de quem você segue).
2. No canto inferior direito aparece o painel **Unfollow seguro**.
3. Deixe marcado **"Pular quem me segue de volta"** se não quiser deixar de seguir quem também te segue (vem marcado por padrão). No X o script reconhece isso sozinho, sem precisar salvar nada antes.
4. Clique em **Iniciar**.
5. Deixe a aba aberta e visível. Para parar a qualquer momento, clique em **Parar**.

O script faz sozinho:
- espera um tempo aleatório de 4 a 9 segundos entre cada unfollow;
- faz uma pausa de cerca de 1 minuto a cada lote de 25;
- respeita um limite diário de 250 (o contador fica salvo entre sessões e zera todo dia);
- para se o X mostrar aviso de erro ou limite, ou se falhar várias vezes seguidas.

---

## 5. Configuração

No início de cada arquivo existe um bloco `CFG`. Para mudar, abra o script no Tampermonkey (ícone da extensão, **Painel de controle**, clique no script), edite os valores e salve com Ctrl+S. Os tempos estão em milissegundos (1000 = 1 segundo).

### Instagram (`instagram-unfollow-seguro.user.js`)

| Opção | Padrão | O que faz |
|---|---|---|
| `delayMin` / `delayMax` | 2000 / 2000 | Espera entre cada unfollow |
| `batchSize` | 49 | Máximo de unfollows por janela |
| `batchWindow` | 10 minutos | Tempo mínimo entre o início de um lote e o do próximo |
| `dailyCap` | 150 | Máximo de unfollows por dia |
| `whitelist` | [] | Contas que nunca serão removidas. Ex.: `['nasa', 'fulano']` |
| `collectDelayMin` / `collectDelayMax` | 500 / 900 | Espera entre rolagens na coleta, enquanto aparecem seguidores novos |
| `collectIdleMs` | 20000 | Se o total não for conhecido, fim da coleta após esse tempo sem ninguém novo |
| `collectStallMs` | 45000 | Se o total for conhecido, só desiste após esse tempo sem ninguém novo |
| `minCompleteRatio` | 0.97 | Fração mínima do total de seguidores que a coleta precisa pegar para salvar a lista |

### X (`twitter-unfollow-seguro.user.js`)

| Opção | Padrão | O que faz |
|---|---|---|
| `delayMin` / `delayMax` | 4000 / 9000 | Espera aleatória entre cada unfollow |
| `batchSize` | 25 | Quantos unfollows antes de uma pausa maior |
| `batchPauseMin` / `batchPauseMax` | 55000 / 65000 | Duração da pausa entre lotes |
| `dailyCap` | 250 | Máximo de unfollows por dia |
| `skipFollowBack` | true | Pula quem te segue de volta |
| `whitelist` | [] | Contas que nunca serão removidas |

**Contas novas ou pouco usadas** costumam ter limites menores, principalmente no Instagram. Se for o seu caso, diminua o `dailyCap`, aumente os atrasos e reduza o `batchSize`.

---

## 6. Se algo der errado

- **O painel não aparece:** confira se o Tampermonkey está com "Permitir scripts de usuário" ativo (passo 1), se o script está ligado no painel do Tampermonkey e recarregue a página. Aperte F12 e abra o **Console**: deve aparecer `[Unfollow IG] script carregado` (Instagram) ou `[Unfollow seguro] script carregado` (X). Se aparecer um erro em vermelho, abra uma issue com o texto.
- **O script não acha os botões ou as listas:** o Instagram e o X mudam a estrutura das páginas de vez em quando e isso pode quebrar o script. Abra uma issue descrevendo o que acontece e em qual etapa.
- **Parou sozinho com aviso de limite ou bloqueio:** espere pelo menos 24 horas antes de tentar de novo e diminua o ritmo (atrasos maiores, lotes menores, `dailyCap` menor). Insistir pode estender a restrição por dias.
- **A coleta de seguidores terminou com menos de 97%:** tente de novo com a aba visível, sem mexer na lista, ou use a importação do arquivo.
- **Quer parar:** clique em **Parar** no painel ou desative o script no Tampermonkey.

## 7. Cuidados

- Instale scripts só de fontes que você confia e **leia o código antes**. Um userscript tem acesso a tudo o que aparece na página.
- Este projeto não tem relação com o Instagram, o X, a Meta ou o Tampermonkey.
- O código é fornecido como está, sem garantias.
