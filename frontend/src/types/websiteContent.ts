export type WebsiteSectionKey = 'site_identity' | 'header' | 'hero' | 'sections' | 'footer';

export interface WebsiteMenuItem {
  label: string;
  href: string;
  order: number;
  visible: boolean;
}

export interface SiteIdentityContent {
  site_name: string;
  logo_text: string;
  logo_url?: string;
  favicon_url?: string;
  slogan: string;
}

export interface HeaderContent {
  menu: WebsiteMenuItem[];
  login_label: string;
  primary_cta_label: string;
  authenticated_cta_label: string;
}

export interface HeroContent {
  title: string;
  highlight: string;
  description: string;
  primary_cta_label: string;
  secondary_cta_label: string;
  sticker_image_url?: string;
  upload_enabled: boolean;
  chips: string[];
}

export interface LandingSectionItem {
  key: string;
  title: string;
  eyebrow: string;
  description: string;
  enabled: boolean;
  order: number;
}

export interface BenefitItem {
  title: string;
  description: string;
}

export interface SectionsContent {
  items: LandingSectionItem[];
  benefits: BenefitItem[];
}

export interface FooterLink {
  label: string;
  href: string;
  visible: boolean;
}

export interface FooterContent {
  contact_label: string;
  email: string;
  socials: FooterLink[];
  policies: FooterLink[];
  copyright: string;
}

export interface WebsiteContentBundle {
  site_identity: SiteIdentityContent;
  header: HeaderContent;
  hero: HeroContent;
  sections: SectionsContent;
  footer: FooterContent;
}

export interface WebsiteContentPublicItem {
  section_key: WebsiteSectionKey;
  content: Record<string, unknown>;
  version: number;
  published_at: string | null;
}

export interface WebsiteContentPublicResponse {
  items: WebsiteContentPublicItem[];
  generated_at: string;
}

export interface WebsiteContentAdminItem {
  id: string;
  section_key: WebsiteSectionKey;
  draft_content: Record<string, unknown>;
  published_content: Record<string, unknown>;
  status: 'draft' | 'published';
  version: number;
  updated_by: string | null;
  updated_at: string | null;
  published_by: string | null;
  published_at: string | null;
}

export interface WebsiteContentVersionItem {
  id: string;
  section_key: WebsiteSectionKey;
  version: number;
  content: Record<string, unknown>;
  source: 'draft' | 'published' | 'rollback';
  created_by: string | null;
  created_at: string;
  reason: string | null;
}

export interface WebsiteContentVersionResponse {
  items: WebsiteContentVersionItem[];
  total: number;
  generated_at: string;
}
