# Área de Entregas — Produto Yuba

Projeto completo das Fases 1 e 2:

- **Fase 1:** aplicação web responsiva/PWA para consultar frete, salvar histórico/favoritos e editar preços localmente.
- **Fase 2:** aplicativo Android nativo que incorpora a mesma aplicação web, com geração automática do APK pelo GitHub Actions.

## Publicar sem instalar programas

1. Envie todos os arquivos deste projeto para o repositório GitHub.
2. No GitHub, abra **Settings → Pages → Source** e escolha **GitHub Actions**.
3. Abra **Actions**, execute **Publicar site**. O endereço do site aparecerá no resultado.
4. Abra **Actions**, execute **Gerar APK Android**. Ao terminar, baixe o arquivo em **Artifacts → Entregas-Yuba-APK**.

## Administração

PIN inicial: `2468`.

Os preços editados são armazenados apenas no aparelho/navegador. Use **Exportar JSON** para backup. Para sincronização entre vários aparelhos será necessária uma etapa futura com servidor/banco de dados.

## Desenvolvimento opcional

```bash
npm test
npx serve web
```

## Dados

Os polígonos e preços iniciais vieram do KMZ fornecido pelo proprietário do mapa. O motor geométrico funciona localmente. A pesquisa de endereço usa o serviço público Nominatim/OpenStreetMap e deve ser usada em baixo volume, com atribuição mantida.
