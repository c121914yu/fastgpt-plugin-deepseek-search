import { createToolHandler, defineTool } from '@fastgpt-plugin/sdk-factory';

import { inputSchema, outputSchema, secretSchema } from './src/schemas';
import { search } from './src/search';

export default defineTool({
  manifest: {
    pluginId: 'deepSeekSearch',
    version: '0.1.0',
    description: {
      en: 'Search the web with DeepSeek and return summaries, sources, relevance scores, and optional page content.',
      'zh-CN': '通过 DeepSeek 搜索网页，返回摘要、来源、相关性评分及可选的网页正文。'
    },
    name: {
      en: 'DeepSeek Search',
      'zh-CN': 'DeepSeek 搜索'
    },
    versionDescription: {
      en: 'Initial release with the official DeepSeek Search API.',
      'zh-CN': '首个版本，接入 DeepSeek 官方 Search API。'
    }
  },
  handler: createToolHandler({
    inputSchema,
    outputSchema,
    secretSchema,
    handler: async (input, ctx) => search(input, ctx.secrets)
  })
});
