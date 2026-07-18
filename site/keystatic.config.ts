/* Keystatic — git-backed CMS, dev-mode only. Content lives in the repo;
   every edit is a commit, so the content history is its own custody log.
   Run the editor with:  npm run cms  ->  http://localhost:4321/keystatic */

import { collection, config, fields } from '@keystatic/core';

export default config({
  storage: { kind: 'local' },
  ui: {
    brand: { name: 'opsbench case files' },
  },
  collections: {
    caseFiles: collection({
      label: 'Case files',
      slugField: 'title',
      path: 'src/content/case-files/*',
      entryLayout: 'content',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        description: fields.text({ label: 'Description', multiline: true }),
        date: fields.date({ label: 'Date' }),
        caseNumber: fields.text({
          label: 'Case number',
          description: 'e.g. CF-003 — shown as the exhibit stamp',
        }),
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags',
          itemLabel: (props) => props.value,
        }),
        draft: fields.checkbox({ label: 'Draft', defaultValue: false }),
        content: fields.mdx({ label: 'Content' }),
      },
    }),
  },
});
