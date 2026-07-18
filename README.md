# Produtos Yuba — versão 1.0.0

## Nova implementação

Esta versão adiciona o **Editor Visual de Áreas** no painel administrativo.

Agora é possível:

- criar uma nova área desenhando o polígono no mapa;
- editar os vértices de uma área existente;
- alterar nome, frete, cor, status e tipo;
- criar áreas de risco;
- excluir uma área;
- publicar alterações imediatamente para todos os clientes;
- deixar de depender do My Maps depois da importação inicial.

## Instalação

### 1. Supabase

Abra o **SQL Editor** e execute:

`supabase_migration_v1.sql`

Esse arquivo adiciona:

- coluna `geometry`;
- coluna `color`;
- permissão para inserir áreas;
- permissão para editar áreas;
- permissão para excluir áreas.

### 2. GitHub

Envie todos os arquivos deste pacote para a raiz do repositório, substituindo os existentes.

Depois aguarde o GitHub Pages e pressione:

`Ctrl + F5`

### 3. Primeira importação

Entre em:

`admin.html`

Depois clique em:

**Importar áreas atuais**

Esse procedimento copia os polígonos do arquivo GeoJSON atual para o Supabase.

Ele precisa ser feito apenas uma vez.

## Criar uma nova área

1. Clique em **Nova área**.
2. Clique na ferramenta de polígono no canto superior direito do mapa.
3. Desenhe a área.
4. Preencha nome, rótulo, frete e cor.
5. Clique em **Salvar área**.

A nova área passa a funcionar imediatamente na página inicial.

## Editar uma área

1. Clique na área na lista ou no mapa.
2. Use a ferramenta de edição do mapa.
3. Arraste os vértices.
4. Clique em **Salvar área**.

## Observação

A página inicial usa os polígonos do Supabase quando eles existem. Antes da primeira importação, ela continua usando o GeoJSON local como segurança.
