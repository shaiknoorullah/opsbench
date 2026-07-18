import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('caseFiles', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );
  return rss({
    title: 'opsbench — case files',
    description:
      'Field notes on forensic-grade AI operations: evidence discipline, policy gates, and the craft of agents that prove their work.',
    site: context.site ?? 'https://opsbench.vercel.app',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/case-files/${post.id}/`,
    })),
  });
}
