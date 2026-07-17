# Área de Entregas – Produtos Yuba — versão 0.4

Aplicação estática em HTML, CSS e JavaScript.

## Publicação no GitHub

1. Extraia o ZIP.
2. Envie **o conteúdo da pasta** para a raiz do repositório:
   - `index.html`
   - pasta `css`
   - pasta `js`
   - pasta `dados`
3. Substitua os arquivos existentes.
4. Faça o commit.
5. Aguarde o GitHub Pages publicar a atualização.
6. Atualize o site com `Ctrl + F5`.

## Funcionamento

- Converte o endereço em latitude/longitude usando Nominatim/OpenStreetMap.
- Carrega 26 polígonos extraídos do KMZ fornecido.
- Prioriza as áreas de risco.
- Em polígonos sobrepostos, usa a menor área, correspondente à zona mais específica.
- Mostra o frete real cadastrado no nome do polígono.
