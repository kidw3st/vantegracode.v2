import { site } from '../data/site.ts';

/** Абсолютный адрес страницы или файла */
export const absolute = (path: string) => new URL(path, `${site.url}/`).href;

const ORG_ID = `${site.url}/#organization`;
const SITE_ID = `${site.url}/#website`;

export type JsonLdNode = Record<string, unknown>;

export function organization(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: site.name,
    url: absolute('/'),
    logo: absolute('/icon-512.png'),
    email: site.email,
    telephone: site.phone.tel,
    sameAs: [site.telegram.url, ...site.socials.map((social) => social.url)],
    areaServed: { '@type': 'Country', name: 'Россия' },
  };
}

export function website(): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: absolute('/'),
    name: site.name,
    inLanguage: 'ru-RU',
    publisher: { '@id': ORG_ID },
  };
}

export interface Crumb {
  label: string;
  href: string;
}

export function breadcrumbList(crumbs: Crumb[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: absolute(crumb.href),
    })),
  };
}

export function serviceNode(input: { name: string; description: string; path: string; price: number | null }): JsonLdNode {
  return {
    '@type': 'Service',
    name: input.name,
    description: input.description,
    url: absolute(input.path),
    provider: { '@id': ORG_ID },
    areaServed: { '@type': 'Country', name: 'Россия' },
    ...(input.price != null && {
      offers: {
        '@type': 'Offer',
        priceCurrency: 'RUB',
        priceSpecification: { '@type': 'PriceSpecification', minPrice: input.price, priceCurrency: 'RUB' },
      },
    }),
  };
}

export function faqPage(items: { q: string; a: string }[]): JsonLdNode {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function blogPosting(input: { title: string; description: string; path: string; date: Date }): JsonLdNode {
  return {
    '@type': 'BlogPosting',
    headline: input.title,
    description: input.description,
    url: absolute(input.path),
    mainEntityOfPage: absolute(input.path),
    datePublished: input.date.toISOString(),
    dateModified: input.date.toISOString(),
    inLanguage: 'ru-RU',
    image: absolute('/og/og-default.png'),
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
  };
}

export function creativeWork(input: { title: string; description: string; path: string; year: number; image: string }): JsonLdNode {
  return {
    '@type': 'CreativeWork',
    name: input.title,
    description: input.description,
    url: absolute(input.path),
    dateCreated: String(input.year),
    image: input.image,
    creator: { '@id': ORG_ID },
    inLanguage: 'ru-RU',
  };
}

/** Граф для <script type="application/ld+json"> */
export function graph(nodes: JsonLdNode[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
}
