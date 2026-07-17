# Área de Entregas – Produtos Yuba — versão 0.6 (Supabase)

## O que mudou

- Novo visual responsivo em duas colunas.
- Novo logo.
- Mapa interativo com Leaflet e as áreas do KMZ.
- Banco de dados Supabase para nomes, preços e status.
- Login administrativo com Supabase Auth.
- Alterações visíveis para todos os clientes.
- Atualização em tempo real quando os dados mudam.
- Fallback para os dados do GeoJSON enquanto o Supabase não estiver configurado.

## Configuração do Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute `supabase_setup.sql`.
4. Em Authentication > Users, crie o usuário administrador com e-mail e senha.
5. Abra Project Settings > API.
6. Copie:
   - Project URL
   - chave pública `anon`
7. Cole esses dados em `js/config.js`.
8. Publique todos os arquivos no GitHub Pages.
9. Abra `admin.html` para entrar e editar os preços.

## Segurança

A chave `anon` pode ficar no site. A segurança é feita pelas políticas RLS:
- visitantes podem apenas ler;
- usuários autenticados podem atualizar;
- a chave `service_role` nunca deve ser colocada no navegador.

## Observação

Antes da publicação definitiva, ajuste em `js/config.js` o endereço e as coordenadas exatas do Centro de Distribuição.
