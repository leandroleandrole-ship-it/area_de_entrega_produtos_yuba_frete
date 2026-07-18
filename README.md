# Área de Entregas – Produtos Yuba — versão 0.6.2

## Correção da página inicial

Esta versão corrige o problema em que nenhum botão respondia.

A causa era o carregamento inicial das áreas: quando o GeoJSON ou a consulta ao Supabase apresentava uma falha, o JavaScript era interrompido antes de registrar os eventos dos botões.

## Correções incluídas

- os botões continuam funcionando mesmo se o carregamento das áreas falhar;
- mensagens de erro mais claras;
- tratamento melhor da busca de endereço;
- tratamento completo da geolocalização;
- botão “Como funciona?” compatível com mais navegadores;
- atualização em tempo real protegida contra erros;
- nova versão de cache `v=62`.

## Publicação

Envie todo o conteúdo deste ZIP para a raiz do repositório, substituindo os arquivos atuais. Depois aguarde o GitHub Pages e pressione `Ctrl + F5`.

Confirme também estas URLs:

- `SEU_SITE/js/app.js?v=62`
- `SEU_SITE/dados/delivery_regions.geojson`
- `SEU_SITE/imagens/logo_produto_yuba.png`
