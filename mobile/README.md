# Controle de Notas — app mobile

App Expo (React Native) do `controle-notas`. Compartilha a lógica de negócio com
o app web pela pasta `../shared` — **o repositório inteiro precisa estar
clonado**, não só esta pasta. O alias está em `metro.config.js`.

## Por que o SDK está preso no 54

O aparelho alvo é um **iPhone sem conta paga do Apple Developer Program**. Nesse
cenário, a única forma gratuita de rodar o app é o **Expo Go da App Store**, e o
Expo Go só carrega projetos do **mesmo SDK da sua própria versão**.

Em julho de 2026, a versão publicada na App Store estava no **SDK 54** — as
versões de SDK 55, 56 e 57 ficaram presas na fila de aprovação da Apple
(https://expo.dev/changelog/expo-go-and-app-store-may-2026). Subir o SDK aqui
faria o Expo Go recusar o projeto com *"Project is incompatible with this
version of Expo Go"*.

### Quando a App Store publicar um Expo Go mais novo

O app parado no SDK 54 vai deixar de abrir. Para retargetar:

```bash
cd mobile
npx expo install expo@~<NOVO_SDK>.0.0
rm -rf node_modules package-lock.json && npm install   # evita árvore suja
npx expo install --fix
npx expo-doctor
npx expo export --platform ios                        # pega incompatibilidade sem precisar do aparelho
```

**Atenção ao `plugins` do `app.json`.** O `expo-sharing` foi removido de lá de
propósito: na versão do SDK 54 (`14.0.8`) ele não tem config plugin, e deixar a
entrada faz `expo config` falhar em silêncio. Se em um SDK futuro ele voltar a
ter, o `npx expo install` readiciona sozinho.

## Publicar (EAS Update)

O app é carregado da nuvem da Expo — não precisa de servidor rodando na máquina
de desenvolvimento. Isso é proposital: a máquina é WSL2, cuja rede NAT impede o
celular de alcançar o Metro local.

```bash
npx eas-cli@latest update --branch preview --message "descricao da versao"
```

Depois é abrir o QR do update na página do projeto em expo.dev, pelo Expo Go do
iPhone. O projeto já está criado e configurado
(`@hugosergio/controle-notas`, channel `preview`).

### O `runtimeVersion` precisa ser `exposdk:<SDK>` — não mexa nisso sem ler

O `eas update:configure` grava `"runtimeVersion": {"policy": "appVersion"}`, que
resolve para a versão do app (`1.0.0`). **O Expo Go nunca acha um update assim**,
porque ele se identifica pelo SDK. Isso falha em silêncio: o update publica com
sucesso e o aparelho simplesmente não recebe nada.

Dá para verificar sem precisar do celular, batendo no endpoint de manifesto com
o runtime que o Expo Go usaria:

```bash
U=https://u.expo.dev/644597b9-422d-4ef5-a2fd-8d837e95006c
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'expo-platform: ios' -H 'expo-channel-name: preview' \
  -H 'expo-protocol-version: 1' -H 'expo-api-version: 1' \
  -H 'accept: multipart/mixed' -H 'expo-runtime-version: exposdk:54.0.0' "$U"
```

`200` = o Expo Go recebe o update. `204` = existe update publicado, mas nenhum
casa com esse runtime (foi o que acontecia com a política `appVersion`).
`404` = o channel não existe — channel e branch são coisas distintas, e o
endpoint serve por **channel** (`npx eas-cli@latest channel:create <nome>`).

Por isso o `app.json` fixa `"runtimeVersion": "exposdk:54.0.0"` na mão. **Ao
retargetar o SDK, esse valor tem de mudar junto.**

> **Ressalva que continua valendo.** A Expo documenta o carregamento de updates
> no Expo Go como pré-visualização (*"only simulates what an update will look
> like in your app"*) e recomenda development builds para uso real. O arranjo
> aqui funciona, mas está fora do caminho suportado.

## Desenvolvimento local

Se um dia fizer sentido rodar o Metro localmente, na WSL2 é preciso túnel
(`npx expo start --tunnel`, que exige `@expo/ngrok`), porque o IP anunciado é o
da rede interna da WSL e o celular não o alcança. Alternativa: `networkingMode=mirrored`
no `.wslconfig` do Windows.

## Estrutura

```
App.js                 estado (notas, aba, meta) e persistência
theme.js               as cores do app web
lib/storage.js         AsyncStorage com a mesma interface do storage.js do web
lib/exportXlsx.js      gera o .xlsx e abre a folha de compartilhamento
components/            TornCard, Barcode, StatBox, ErrorBoundary, gráficos em SVG
screens/               NotasScreen, AddScreen, AnaliseScreen
```

Os gráficos são desenhados à mão em `react-native-svg`: o recharts do app web é
baseado em DOM e não roda em RN.

## O que ainda não existe aqui

Leitura de PDF por OCR — o `pdf.js` precisa de canvas e o `tesseract.js` de
WebAssembly com workers, nada disso disponível no runtime do RN. Por enquanto, a
aba Adicionar aceita colar o texto da nota ou lançar os itens manualmente; o OCR
continua só na versão web.
