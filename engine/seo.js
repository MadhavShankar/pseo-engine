/**
 * SEOModule — generates <head> blocks and JSON-LD structured data for every page.
 */
export class SEOModule {
  constructor(siteConfig = {}) {
    this.site = siteConfig;
  }

  /**
   * Build the complete <head> block for a page.
   */
  buildHead(context, manifest, slots) {
    const { baseUrl, name: siteName, defaultOgImage, locales = [] } = this.site;
    const { urlSlug, primaryKeyword } = context;
    const canonical = `${baseUrl}/${urlSlug}`;
    const title = slots.meta_title || `${primaryKeyword} — ${siteName}`;
    const description = slots.meta_description || '';
    const ogImage = `${baseUrl}${defaultOgImage || '/og-image.png'}`;
    const robotsMeta = context.noindex ? 'noindex,nofollow' : 'index,follow';

    const hreflangTags = locales.length > 1
      ? locales.map(loc => `  <link rel="alternate" hreflang="${loc}" href="${baseUrl}/${loc}/${urlSlug}" />`).join('\n')
      : '';

    return `  <title>${this._escape(title)}</title>
  <meta name="description" content="${this._escape(description)}" />
  <link rel="canonical" href="${canonical}" />
  <meta name="robots" content="${robotsMeta}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${this._escape(title)}" />
  <meta property="og:description" content="${this._escape(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:site_name" content="${this._escape(siteName)}" />
  <meta property="og:image" content="${ogImage}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${this._escape(title)}" />
  <meta name="twitter:description" content="${this._escape(description)}" />
  <meta name="twitter:image" content="${ogImage}" />
${hreflangTags ? '\n' + hreflangTags + '\n' : ''}`;
  }

  /**
   * Build JSON-LD structured data block.
   */
  buildStructuredData(context, manifest, slots) {
    const schemas = [];
    const schemaType = manifest.schemaType || 'Service';

    // Primary schema
    const primary = this._buildSchema(schemaType, context, slots);
    if (primary) schemas.push(primary);

    // Always add BreadcrumbList if we have a URL slug
    const breadcrumb = this._buildBreadcrumb(context);
    if (breadcrumb) schemas.push(breadcrumb);

    // Add FAQPage alongside primary if faq_block slot exists
    if (slots.faq_block && schemaType !== 'FAQPage') {
      const faq = this._buildFaqSchema(slots.faq_block);
      if (faq) schemas.push(faq);
    }

    return schemas.map(s =>
      `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`
    ).join('\n');
  }

  _buildSchema(type, context, slots) {
    const { baseUrl, name: siteName } = this.site;
    const { urlSlug, primaryModifier, secondaryModifier } = context;
    const url = `${baseUrl}/${urlSlug}`;

    switch (type) {
      case 'Service':
        return {
          '@context': 'https://schema.org',
          '@type': 'Service',
          'name': slots.h1 || slots.meta_title || '',
          'description': slots.meta_description || '',
          'provider': { '@type': 'Organization', 'name': siteName, 'url': baseUrl },
          'areaServed': primaryModifier || 'India',
          'serviceType': secondaryModifier || slots.h1 || ''
        };

      case 'Article':
        return {
          '@context': 'https://schema.org',
          '@type': 'Article',
          'headline': slots.meta_title || slots.h1 || '',
          'description': slots.meta_description || '',
          'author': { '@type': 'Person', 'name': slots.author || siteName },
          'datePublished': slots.publish_date || new Date().toISOString().split('T')[0],
          'dateModified': slots.publish_date || new Date().toISOString().split('T')[0],
          'publisher': { '@type': 'Organization', 'name': siteName, 'url': baseUrl },
          'mainEntityOfPage': { '@type': 'WebPage', '@id': url }
        };

      case 'Product':
        return {
          '@context': 'https://schema.org',
          '@type': 'Product',
          'name': slots.product_name || slots.h1 || '',
          'description': slots.meta_description || '',
          'offers': {
            '@type': 'Offer',
            'price': slots.price || '0',
            'priceCurrency': slots.currency || 'INR',
            'availability': slots.availability || 'https://schema.org/InStock'
          }
        };

      case 'LocalBusiness':
        return {
          '@context': 'https://schema.org',
          '@type': 'LocalBusiness',
          'name': `${siteName} — ${slots.city || primaryModifier || ''}`,
          'description': slots.meta_description || '',
          'url': url,
          'address': {
            '@type': 'PostalAddress',
            'addressLocality': slots.city || primaryModifier || '',
            'addressRegion': slots.region || secondaryModifier || '',
            'addressCountry': slots.country || 'IN'
          },
          'telephone': slots.phone || '',
          'openingHours': slots.business_hours || ''
        };

      case 'SoftwareApplication':
        return {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          'name': slots.app_name || siteName,
          'operatingSystem': slots.platform || primaryModifier || 'Web',
          'applicationCategory': 'BusinessApplication',
          ...(slots.rating ? {
            'aggregateRating': {
              '@type': 'AggregateRating',
              'ratingValue': slots.rating,
              'reviewCount': slots.review_count || '10'
            }
          } : {}),
          'offers': {
            '@type': 'Offer',
            'price': slots.price || '0',
            'priceCurrency': slots.currency || 'INR'
          }
        };

      case 'FAQPage':
        return this._buildFaqSchema(slots.faq_block);

      default:
        return null;
    }
  }

  _buildFaqSchema(faqHtml) {
    if (!faqHtml) return null;

    const questions = [];
    const dtPattern = /<dt[^>]*>([\s\S]*?)<\/dt>/g;
    const ddPattern = /<dd[^>]*>([\s\S]*?)<\/dd>/g;

    const dts = [...faqHtml.matchAll(dtPattern)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    const dds = [...faqHtml.matchAll(ddPattern)].map(m => m[1].replace(/<[^>]+>/g, '').trim());

    for (let i = 0; i < dts.length; i++) {
      if (dts[i] && dds[i]) {
        questions.push({
          '@type': 'Question',
          'name': dts[i],
          'acceptedAnswer': { '@type': 'Answer', 'text': dds[i] }
        });
      }
    }

    if (questions.length === 0) return null;

    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': questions
    };
  }

  _buildBreadcrumb(context) {
    const { baseUrl, name: siteName } = this.site;
    const { urlSlug } = context;
    if (!urlSlug) return null;

    const parts = urlSlug.split('/').filter(Boolean);
    const items = [
      { '@type': 'ListItem', 'position': 1, 'name': siteName, 'item': baseUrl }
    ];

    let cumulativePath = '';
    for (let i = 0; i < parts.length; i++) {
      cumulativePath += '/' + parts[i];
      items.push({
        '@type': 'ListItem',
        'position': i + 2,
        'name': this._slugToTitle(parts[i]),
        'item': baseUrl + cumulativePath
      });
    }

    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': items
    };
  }

  _buildBreadcrumbHtml(context) {
    const { baseUrl, name: siteName } = this.site;
    const { urlSlug } = context;
    const parts = urlSlug.split('/').filter(Boolean);

    const items = [`<li><a href="${baseUrl}">Home</a></li>`];
    let cumulativePath = '';
    for (const part of parts) {
      cumulativePath += '/' + part;
      items.push(`<li><a href="${baseUrl}${cumulativePath}">${this._slugToTitle(part)}</a></li>`);
    }

    return `<nav aria-label="Breadcrumb"><ol class="pseo-breadcrumbs">${items.join('')}</ol></nav>`;
  }

  _slugToTitle(slug) {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  _escape(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
