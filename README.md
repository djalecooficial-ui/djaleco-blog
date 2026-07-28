# Blog D.Jaleco (estático)

Site estático gerado a partir do conteúdo do WordPress em `blog.djaleco.com.br`, para substituir a hospedagem WordPress na Hostinger.

## Regenerar o conteúdo

```
node scripts/build.mjs
```

Isso busca os posts via API pública do WordPress (`/wp-json/wp/v2/posts`), baixa as imagens referenciadas para `assets/images/`, e gera um arquivo `index.html` estático por post, preservando as URLs originais (`/<slug>/`).

## Deploy

Site 100% estático (HTML puro), sem build step. Deploy direto na Vercel como projeto "Other" / estático.
