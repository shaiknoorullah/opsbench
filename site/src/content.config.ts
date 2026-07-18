import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/* Case files — the opsbench blog. Every post is an exhibit: numbered,
   dated, tagged, and citable. */
const caseFiles = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/case-files' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    caseNumber: z.string(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { caseFiles };
