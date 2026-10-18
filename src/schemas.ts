import { isIP } from 'node:net';

import type {
  InputSchemaMetaType,
  OutputSchemaMetaType,
  SecretSchemaMetaType
} from '@fastgpt-plugin/sdk-factory';
import z from 'zod';

// The API counts Unicode code points; Zod's string length counts UTF-16 code units.
const searchText = z.string().min(1).refine(
  (value) => Array.from(value).length <= 128,
  'Must contain at most 128 Unicode characters'
);

export const inputSchema = z.object({
  query: searchText.refine((value) => value.trim().length > 0, 'Query cannot be blank').meta({
    title: '搜索词 / Query',
    maxLength: 128,
    description: '1–128 个 Unicode 字符，支持 site:、-site:、lang:、after:、before: 和精确短语。',
    toolDescription: 'Search query, 1–128 Unicode characters. Supports site:, -site:, lang:, after:, before:, excluded terms, and quoted exact phrases. Query operators are forwarded unchanged.',
    isToolParam: true
  } satisfies InputSchemaMetaType),
  count: z.number().int().min(1).max(50).default(10).optional().meta({
    title: '结果数量 / Result count',
    description: '返回 1–50 条结果，默认 10 条。',
    isToolParam: true
  } satisfies InputSchemaMetaType),
  oriQuestion: searchText.nullish().meta({
    title: '原始问题 / Original question',
    maxLength: 128,
    description: '可选，触发搜索的原始问题，1–128 个 Unicode 字符；null 表示不提供。',
    isToolParam: true
  } satisfies InputSchemaMetaType),
  localization: z.string().refine(
    (value) => value === '' || isIP(value) !== 0,
    'Localization must be an IPv4 or IPv6 address, or empty'
  ).default('').optional().meta({
    title: '本地化 IP / Localization IP',
    description: '可选，IPv4 或 IPv6 地址，用于优先返回本地化结果；默认留空。',
    isToolParam: false
  } satisfies InputSchemaMetaType),
  needContent: z.boolean().default(false).optional().meta({
    title: '返回正文 / Include page content',
    description: '是否返回网页正文，默认关闭；开启后响应内容可能较大。',
    isToolParam: true
  } satisfies InputSchemaMetaType)
});

export const secretSchema = z.object({
  apiKey: z.string().trim().min(1, 'DeepSeek API Key is required').meta({
    title: 'DeepSeek API Key',
    description: '在 https://platform.deepseek.com/api_keys 创建 API Key。',
    isSecret: true
  } satisfies SecretSchemaMetaType)
});

export const outputSchema = z.object({
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
    summary: z.string(),
    content: z.string(),
    rerank_score: z.number().min(0).max(3),
    authority: z.number().int().min(-1).max(4),
    site_name: z.string().nullable(),
    site_icon: z.string().nullable(),
    date: z.string().nullable()
  })).meta({
    title: '搜索结果 / Search results',
    description: '网页标题、链接、短摘要、长摘要、正文、相关性评分、权威等级及站点信息；无匹配时为空数组。'
  } satisfies OutputSchemaMetaType)
});
