import { DEFAULT_WEBSITE_CONTENT, mergeWebsiteContent } from '../utils/websiteContentDefaults';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const fallback = mergeWebsiteContent({});
assert(fallback.site_identity.site_name === DEFAULT_WEBSITE_CONTENT.site_identity.site_name, 'Empty CMS response should keep default site identity');
assert(fallback.hero.title === DEFAULT_WEBSITE_CONTENT.hero.title, 'Empty CMS response should keep default hero title');
assert(fallback.sections.items.length > 0, 'Empty CMS response should keep default sections');

const merged = mergeWebsiteContent({
  hero: {
    title: 'Hero từ CMS',
    highlight: 'đã xuất bản',
  },
});

assert(merged.hero.title === 'Hero từ CMS', 'Published hero title should override fallback');
assert(merged.hero.highlight === 'đã xuất bản', 'Published hero highlight should override fallback');
assert(merged.hero.primary_cta_label === DEFAULT_WEBSITE_CONTENT.hero.primary_cta_label, 'Partial CMS hero should preserve default CTA');
assert(merged.footer.copyright === DEFAULT_WEBSITE_CONTENT.footer.copyright, 'Partial CMS response should preserve default footer');

console.log('Website content fallback tests passed.');
