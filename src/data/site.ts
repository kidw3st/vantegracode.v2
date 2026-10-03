/**
 * Контакты, условия работы, служебные номера и тексты CTA — всё в одном месте.
 *
 * Незаполненное значение — null.
 *  - Внутри готового текста (шаги, вопросы, CTA) null выводится как [ ],
 *    чтобы было видно, что заполнить.
 *  - Отдельные поля (часы связи, реквизиты, соцсети) при null не выводятся.
 *  - JSON-LD с null не формируется.
 * Значения подставляются в тексты при сборке по токенам {…} — см. src/lib/fill.ts.
 * Когда значение стоит в начале предложения, первая буква становится заглавной сама.
 */

export interface Social {
  name: string;
  url: string;
}

export interface NavItem {
  href: string;
  label: string;
}

export const site = {
  name: 'Vantegra',
  domain: 'vantegracode.ru',
  url: 'https://vantegracode.ru',
  tagline: 'Студия разработки цифровых продуктов. Работаем по всей России',
  geography: 'Работаем по всей России',

  telegram: { handle: '@vantegra', url: 'https://t.me/vantegra' },
  /** Владельцу: домен почты (vantegra.ru) отличается от домена сайта (vantegracode.ru) — проверьте */
  email: 'hello@vantegra.ru',
  phone: { display: '+7 905 788-21-77', tel: '+79057882177' },

  /** Часы связи, например: «пн–пт, 10:00–19:00 по Москве» */
  hours: null as string | null,
  /** Срок ответа на заявку, например: «в течение рабочего дня» */
  responseTime: null as string | null,
  /** Реквизиты, например: «ИП Фамилия Имя Отчество, ИНН …, ОГРНИП …» */
  requisites: null as string | null,
  /** Другие соцсети, например: [{ name: 'VK', url: 'https://vk.com/…' }] */
  socials: [] as Social[],

  /** Яндекс Метрика: номер счётчика, например 12345678 */
  metrikaId: null as number | null,
  /** Яндекс Вебмастер: код из meta-тега yandex-verification */
  webmasterCode: null as string | null,

  /** Условия работы */
  terms: {
    /** Оплата, например: «50 % перед стартом, 50 % после запуска» */
    payment: null as string | null,
    /** Закрывающие документы, например: «по каждому этапу» */
    closingDocs: null as string | null,
    /** Гарантия после запуска, например: «1 месяц — бесплатно исправляем найденные ошибки» */
    guarantee: null as string | null,
    /** Как часто показываем результат, например: «каждую неделю» */
    demoFrequency: null as string | null,
    /** Правки прототипа, например: «без ограничений до согласования» */
    prototypeEdits: null as string | null,
    /** Исходный код и доступы, например: «передаём клиенту полностью» */
    codeAccess: null as string | null,
    /** NDA, например: «подписываем по запросу» */
    nda: null as string | null,
  },

  /** Тексты и адреса призывов к действию */
  cta: {
    discuss: 'Обсудить проект',
    discussHref: '/kontakty/#form',
    footer: 'Обсудим проект',
    footerHref: '/kontakty/',
    works: 'Смотреть работы',
    worksHref: '/raboty/',
    services: 'Все услуги',
    servicesHref: '/uslugi/',
    telegram: 'Написать в Telegram',
    send: 'Отправить заявку',
    sending: 'Отправляем…',
    home: 'На главную',
  },
};

/** Порядок разделов в шапке, меню и подвале */
export const nav: NavItem[] = [
  { href: '/uslugi/', label: 'Услуги' },
  { href: '/ceny/', label: 'Цены' },
  { href: '/raboty/', label: 'Работы' },
  { href: '/o-studii/', label: 'О студии' },
  { href: '/blog/', label: 'Блог' },
  { href: '/voprosy/', label: 'Вопросы' },
  { href: '/kontakty/', label: 'Контакты' },
];
