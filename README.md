# Área de Entregas – Produtos Yuba — versão 0.6.1

## Correções

- Corrigido o erro de RLS no painel administrativo:
  o sistema agora usa `UPDATE ... WHERE id = ...`, sem tentar inserir uma nova linha.
- Melhor diagnóstico quando o arquivo GeoJSON não está publicado.
- Inclui novamente as pastas completas:
  - `dados`
  - `imagens`
  - `css`
  - `js`

## Publicação no GitHub

Envie TODO o conteúdo deste ZIP para a raiz do repositório e substitua os arquivos existentes.

A estrutura precisa ficar exatamente assim:

```
index.html
admin.html
supabase_setup.sql
css/style.css
js/app.js
js/admin.js
js/config.js
dados/delivery_regions.geojson
imagens/logo_produto_yuba.png
```

Depois aguarde o GitHub Pages e use `Ctrl + F5`.

## Verificação direta

Abra estas URLs no navegador:

- `SEU_SITE/imagens/logo_produto_yuba.png`
- `SEU_SITE/dados/delivery_regions.geojson`

A primeira deve mostrar o logo.
A segunda deve mostrar um arquivo JSON grande começando com `FeatureCollection`.
