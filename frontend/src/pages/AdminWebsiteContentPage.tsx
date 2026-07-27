import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Save, Send, Undo2 } from 'lucide-react';
import { authApi } from '../api/authApi';
import { websiteContentAdminApi } from '../api/websiteContentApi';
import type {
  BenefitItem,
  FooterContent,
  FooterLink,
  HeaderContent,
  HeroContent,
  LandingSectionItem,
  SiteIdentityContent,
  WebsiteContentAdminItem,
  WebsiteContentBundle,
  WebsiteContentVersionItem,
  WebsiteSectionKey,
  WebsiteMenuItem,
} from '../types/websiteContent';
import { DEFAULT_WEBSITE_CONTENT, mergeWebsiteContent } from '../utils/websiteContentDefaults';
import { hasPermission } from '../utils/adminPermissions';
import './AdminContentPages.css';

type TabKey = WebsiteSectionKey | 'history';
type DraftMap = Record<WebsiteSectionKey, Record<string, unknown>>;

const CONTENT_TABS: Array<{ key: WebsiteSectionKey; label: string }> = [
  { key: 'site_identity', label: 'Nhận diện' },
  { key: 'header', label: 'Header' },
  { key: 'hero', label: 'Hero' },
  { key: 'sections', label: 'Sections' },
  { key: 'footer', label: 'Footer' },
];

const EMPTY_DRAFTS: DraftMap = {
  site_identity: DEFAULT_WEBSITE_CONTENT.site_identity as unknown as Record<string, unknown>,
  header: DEFAULT_WEBSITE_CONTENT.header as unknown as Record<string, unknown>,
  hero: DEFAULT_WEBSITE_CONTENT.hero as unknown as Record<string, unknown>,
  sections: DEFAULT_WEBSITE_CONTENT.sections as unknown as Record<string, unknown>,
  footer: DEFAULT_WEBSITE_CONTENT.footer as unknown as Record<string, unknown>,
};

interface ConfirmState {
  type: 'publish' | 'rollback';
  sectionKey: WebsiteSectionKey;
  version?: number;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="admin-content-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />;
}

function SectionActions({
  canUpdate,
  canPublish,
  dirty,
  saving,
  onSave,
  onPublish,
}: {
  canUpdate: boolean;
  canPublish: boolean;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="admin-content-actions">
      {canUpdate && (
        <button type="button" className="admin-content-btn admin-content-btn--primary" disabled={saving || !dirty} onClick={onSave}>
          <Save size={15} aria-hidden="true" /> Lưu nháp
        </button>
      )}
      {canPublish && (
        <button type="button" className="admin-content-btn" disabled={saving} onClick={onPublish}>
          <Send size={15} aria-hidden="true" /> Xuất bản
        </button>
      )}
      {dirty && <span className="admin-content-muted">Có thay đổi chưa lưu</span>}
    </div>
  );
}

function SiteIdentityEditor({ value, onChange }: { value: SiteIdentityContent; onChange: (value: SiteIdentityContent) => void }) {
  return (
    <div className="admin-content-form-grid">
      <Field label="Tên website">
        <TextInput value={value.site_name || ''} onChange={(site_name) => onChange({ ...value, site_name })} />
      </Field>
      <Field label="Logo text">
        <TextInput value={value.logo_text || ''} onChange={(logo_text) => onChange({ ...value, logo_text })} />
      </Field>
      <Field label="Logo URL">
        <TextInput value={value.logo_url || ''} onChange={(logo_url) => onChange({ ...value, logo_url })} placeholder="/images/logo.png hoặc https://..." />
      </Field>
      <Field label="Favicon URL">
        <TextInput value={value.favicon_url || ''} onChange={(favicon_url) => onChange({ ...value, favicon_url })} placeholder="/favicon.svg" />
      </Field>
      <Field label="Slogan">
        <textarea rows={3} value={value.slogan || ''} onChange={(event) => onChange({ ...value, slogan: event.target.value })} />
      </Field>
    </div>
  );
}

function HeaderEditor({ value, onChange }: { value: HeaderContent; onChange: (value: HeaderContent) => void }) {
  const menu = value.menu || [];
  const updateMenu = (index: number, patch: Partial<WebsiteMenuItem>) => {
    onChange({ ...value, menu: menu.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  };
  return (
    <div className="admin-content-editor-stack">
      <div className="admin-content-form-grid">
        <Field label="Nhãn đăng nhập">
          <TextInput value={value.login_label || ''} onChange={(login_label) => onChange({ ...value, login_label })} />
        </Field>
        <Field label="CTA chính">
          <TextInput value={value.primary_cta_label || ''} onChange={(primary_cta_label) => onChange({ ...value, primary_cta_label })} />
        </Field>
        <Field label="CTA khi đã đăng nhập">
          <TextInput value={value.authenticated_cta_label || ''} onChange={(authenticated_cta_label) => onChange({ ...value, authenticated_cta_label })} />
        </Field>
      </div>
      <div className="admin-content-list-editor">
        <div className="admin-content-row-head">
          <strong>Menu</strong>
          <button type="button" className="admin-content-btn" onClick={() => onChange({ ...value, menu: [...menu, { label: 'Mục mới', href: '#section', order: menu.length + 1, visible: true }] })}>Thêm mục</button>
        </div>
        {menu.map((item, index) => (
          <div className="admin-content-row-grid admin-content-row-grid--menu" key={`${item.href}-${index}`}>
            <input value={item.label} onChange={(event) => updateMenu(index, { label: event.target.value })} aria-label="Tên mục" />
            <input value={item.href} onChange={(event) => updateMenu(index, { href: event.target.value })} aria-label="Đường dẫn" />
            <input type="number" value={item.order} onChange={(event) => updateMenu(index, { order: Number(event.target.value) })} aria-label="Thứ tự" />
            <label className="admin-content-inline-check">
              <input type="checkbox" checked={item.visible !== false} onChange={(event) => updateMenu(index, { visible: event.target.checked })} />
              Hiển thị
            </label>
            <button type="button" className="admin-content-btn admin-content-btn--danger" onClick={() => onChange({ ...value, menu: menu.filter((_, i) => i !== index) })}>Xóa</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroEditor({ value, onChange }: { value: HeroContent; onChange: (value: HeroContent) => void }) {
  const chips = value.chips || [];
  return (
    <div className="admin-content-editor-stack">
      <div className="admin-content-form-grid">
        <Field label="Tiêu đề">
          <TextInput value={value.title || ''} onChange={(title) => onChange({ ...value, title })} />
        </Field>
        <Field label="Dòng nổi bật">
          <TextInput value={value.highlight || ''} onChange={(highlight) => onChange({ ...value, highlight })} />
        </Field>
        <Field label="CTA chính">
          <TextInput value={value.primary_cta_label || ''} onChange={(primary_cta_label) => onChange({ ...value, primary_cta_label })} />
        </Field>
        <Field label="CTA phụ">
          <TextInput value={value.secondary_cta_label || ''} onChange={(secondary_cta_label) => onChange({ ...value, secondary_cta_label })} />
        </Field>
        <Field label="Sticker hoặc hình minh họa">
          <TextInput value={value.sticker_image_url || ''} onChange={(sticker_image_url) => onChange({ ...value, sticker_image_url })} />
        </Field>
        <Field label="Khung upload">
          <label className="admin-content-inline-check">
            <input type="checkbox" checked={value.upload_enabled !== false} onChange={(event) => onChange({ ...value, upload_enabled: event.target.checked })} />
            Bật upload trên trang chủ
          </label>
        </Field>
        <Field label="Mô tả">
          <textarea rows={4} value={value.description || ''} onChange={(event) => onChange({ ...value, description: event.target.value })} />
        </Field>
      </div>
      <div className="admin-content-list-editor">
        <div className="admin-content-row-head">
          <strong>Chips</strong>
          <button type="button" className="admin-content-btn" onClick={() => onChange({ ...value, chips: [...chips, 'Nhãn mới'] })}>Thêm chip</button>
        </div>
        {chips.map((chip, index) => (
          <div className="admin-content-row-grid admin-content-row-grid--simple" key={`${chip}-${index}`}>
            <input value={chip} onChange={(event) => onChange({ ...value, chips: chips.map((item, i) => (i === index ? event.target.value : item)) })} aria-label="Chip" />
            <button type="button" className="admin-content-btn admin-content-btn--danger" onClick={() => onChange({ ...value, chips: chips.filter((_, i) => i !== index) })}>Xóa</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionsEditor({ value, onChange }: { value: WebsiteContentBundle['sections']; onChange: (value: WebsiteContentBundle['sections']) => void }) {
  const items = value.items || [];
  const benefits = value.benefits || [];
  const updateItem = (index: number, patch: Partial<LandingSectionItem>) => {
    onChange({ ...value, items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  };
  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    onChange({ ...value, items: reordered.map((item, i) => ({ ...item, order: i + 1 })) });
  };
  const updateBenefit = (index: number, patch: Partial<BenefitItem>) => {
    onChange({ ...value, benefits: benefits.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  };
  return (
    <div className="admin-content-editor-stack">
      <div className="admin-content-list-editor">
        <div className="admin-content-row-head">
          <strong>Section</strong>
          <button type="button" className="admin-content-btn" onClick={() => onChange({ ...value, items: [...items, { key: `section_${items.length + 1}`, title: 'Section mới', eyebrow: 'Nhãn', description: 'Mô tả', enabled: true, order: items.length + 1 }] })}>Thêm section</button>
        </div>
        {items.map((item, index) => (
          <div className="admin-content-section-row" key={`${item.key}-${index}`}>
            <div className="admin-content-row-grid admin-content-row-grid--section">
              <input value={item.key} onChange={(event) => updateItem(index, { key: event.target.value })} aria-label="Section key" />
              <input value={item.eyebrow} onChange={(event) => updateItem(index, { eyebrow: event.target.value })} aria-label="Eyebrow" />
              <input type="number" value={item.order} onChange={(event) => updateItem(index, { order: Number(event.target.value) })} aria-label="Thứ tự" />
              <label className="admin-content-inline-check">
                <input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateItem(index, { enabled: event.target.checked })} />
                Hiển thị
              </label>
              <div className="admin-content-actions">
                <button type="button" className="admin-content-btn" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label="Di chuyển lên">↑</button>
                <button type="button" className="admin-content-btn" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)} aria-label="Di chuyển xuống">↓</button>
              </div>
            </div>
            <input value={item.title} onChange={(event) => updateItem(index, { title: event.target.value })} aria-label="Tiêu đề section" />
            <textarea rows={2} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} aria-label="Mô tả section" />
          </div>
        ))}
      </div>
      <div className="admin-content-list-editor">
        <div className="admin-content-row-head">
          <strong>Lợi ích</strong>
          <button type="button" className="admin-content-btn" onClick={() => onChange({ ...value, benefits: [...benefits, { title: 'Lợi ích mới', description: 'Mô tả' }] })}>Thêm lợi ích</button>
        </div>
        {benefits.map((item, index) => (
          <div className="admin-content-row-grid admin-content-row-grid--benefit" key={`${item.title}-${index}`}>
            <input value={item.title} onChange={(event) => updateBenefit(index, { title: event.target.value })} aria-label="Tên lợi ích" />
            <input value={item.description} onChange={(event) => updateBenefit(index, { description: event.target.value })} aria-label="Mô tả lợi ích" />
            <button type="button" className="admin-content-btn admin-content-btn--danger" onClick={() => onChange({ ...value, benefits: benefits.filter((_, i) => i !== index) })}>Xóa</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FooterEditor({ value, onChange }: { value: FooterContent; onChange: (value: FooterContent) => void }) {
  const updateLinks = (group: 'socials' | 'policies', index: number, patch: Partial<FooterLink>) => {
    onChange({ ...value, [group]: (value[group] || []).map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  };
  const renderLinks = (group: 'socials' | 'policies', title: string) => {
    const links = value[group] || [];
    return (
      <div className="admin-content-list-editor">
        <div className="admin-content-row-head">
          <strong>{title}</strong>
          <button type="button" className="admin-content-btn" onClick={() => onChange({ ...value, [group]: [...links, { label: 'Liên kết mới', href: '#', visible: true }] })}>Thêm</button>
        </div>
        {links.map((item, index) => (
          <div className="admin-content-row-grid admin-content-row-grid--menu" key={`${group}-${item.href}-${index}`}>
            <input value={item.label} onChange={(event) => updateLinks(group, index, { label: event.target.value })} aria-label="Tên liên kết" />
            <input value={item.href} onChange={(event) => updateLinks(group, index, { href: event.target.value })} aria-label="URL" />
            <label className="admin-content-inline-check">
              <input type="checkbox" checked={item.visible !== false} onChange={(event) => updateLinks(group, index, { visible: event.target.checked })} />
              Hiển thị
            </label>
            <button type="button" className="admin-content-btn admin-content-btn--danger" onClick={() => onChange({ ...value, [group]: links.filter((_, i) => i !== index) })}>Xóa</button>
          </div>
        ))}
      </div>
    );
  };
  return (
    <div className="admin-content-editor-stack">
      <div className="admin-content-form-grid">
        <Field label="Nhãn liên hệ">
          <TextInput value={value.contact_label || ''} onChange={(contact_label) => onChange({ ...value, contact_label })} />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={value.email || ''} onChange={(email) => onChange({ ...value, email })} />
        </Field>
        <Field label="Bản quyền">
          <textarea rows={3} value={value.copyright || ''} onChange={(event) => onChange({ ...value, copyright: event.target.value })} />
        </Field>
      </div>
      {renderLinks('socials', 'Mạng xã hội')}
      {renderLinks('policies', 'Chính sách')}
    </div>
  );
}

function WebsitePreview({ content }: { content: WebsiteContentBundle }) {
  const nav = (content.header.menu || []).filter((item) => item.visible !== false).sort((a, b) => a.order - b.order);
  const sections = (content.sections.items || []).filter((item) => item.enabled !== false).sort((a, b) => a.order - b.order);
  return (
    <aside className="admin-content-preview" aria-label="Live preview nội dung website">
      <div className="admin-content-preview-header">
        <strong>{content.site_identity.logo_text || content.site_identity.site_name}</strong>
        <div>{nav.map((item) => <span key={item.href}>{item.label}</span>)}</div>
      </div>
      <div className="admin-content-preview-hero">
        <span>{content.site_identity.slogan}</span>
        <h2>{content.hero.title} <em>{content.hero.highlight}</em></h2>
        <p>{content.hero.description}</p>
        <div>
          <button type="button">{content.hero.primary_cta_label}</button>
          <button type="button">{content.hero.secondary_cta_label}</button>
        </div>
      </div>
      <div className="admin-content-preview-sections">
        {sections.map((section) => (
          <article key={section.key}>
            <span>{section.eyebrow}</span>
            <strong>{section.title}</strong>
            <p>{section.description}</p>
          </article>
        ))}
      </div>
      <footer>{content.footer.copyright}</footer>
    </aside>
  );
}

function HistoryPanel({
  sectionKey,
  versions,
  loading,
  onSectionChange,
  onRollback,
}: {
  sectionKey: WebsiteSectionKey;
  versions: WebsiteContentVersionItem[];
  loading: boolean;
  onSectionChange: (sectionKey: WebsiteSectionKey) => void;
  onRollback: (sectionKey: WebsiteSectionKey, version: number) => void;
}) {
  return (
    <section className="admin-content-panel">
      <div className="admin-content-row-head">
        <h2>Lịch sử phiên bản</h2>
        <select value={sectionKey} onChange={(event) => onSectionChange(event.target.value as WebsiteSectionKey)}>
          {CONTENT_TABS.map((tab) => <option key={tab.key} value={tab.key}>{tab.label}</option>)}
        </select>
      </div>
      {loading && <p className="admin-content-muted">Đang tải lịch sử...</p>}
      {!loading && versions.length === 0 && <div className="admin-content-state">Chưa có lịch sử phiên bản.</div>}
      {versions.length > 0 && (
        <div className="admin-content-table-wrap">
          <table className="admin-content-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Nguồn</th>
                <th>Người tạo</th>
                <th>Thời gian</th>
                <th>Lý do</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((item) => (
                <tr key={item.id}>
                  <td>v{item.version}</td>
                  <td><span className="admin-content-badge">{item.source}</span></td>
                  <td>{item.created_by || '-'}</td>
                  <td>{new Date(item.created_at).toLocaleString('vi-VN')}</td>
                  <td>{item.reason || '-'}</td>
                  <td>
                    <button type="button" className="admin-content-btn" onClick={() => onRollback(sectionKey, item.version)}>
                      <Undo2 size={14} aria-hidden="true" /> Hoàn tác
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AdminWebsiteContentPage() {
  const [items, setItems] = useState<WebsiteContentAdminItem[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>(EMPTY_DRAFTS);
  const [activeTab, setActiveTab] = useState<TabKey>('site_identity');
  const [historySection, setHistorySection] = useState<WebsiteSectionKey>('site_identity');
  const [versions, setVersions] = useState<WebsiteContentVersionItem[]>([]);
  const [dirtyKeys, setDirtyKeys] = useState<WebsiteSectionKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [reason, setReason] = useState('');
  const [canUpdate, setCanUpdate] = useState(false);
  const [canPublish, setCanPublish] = useState(false);

  const contentBundle = useMemo(() => mergeWebsiteContent(drafts), [drafts]);

  const load = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([websiteContentAdminApi.list(ctrl.signal), authApi.getMe()])
      .then(([data, me]) => {
        setItems(data.items);
        setDrafts({
          ...EMPTY_DRAFTS,
          ...Object.fromEntries(data.items.map((item) => [item.section_key, item.draft_content])),
        } as DraftMap);
        setDirtyKeys([]);
        setCanUpdate(hasPermission(me.role, 'website_content.update', me.permissions_override || []));
        setCanPublish(hasPermission(me.role, 'website_content.publish', me.permissions_override || []));
      })
      .catch((err) => {
        if (err?.name !== 'CanceledError') setError('Không thể tải nội dung website.');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  const loadVersions = useCallback((sectionKey: WebsiteSectionKey) => {
    const ctrl = new AbortController();
    setHistoryLoading(true);
    websiteContentAdminApi.versions(sectionKey, ctrl.signal)
      .then((data) => setVersions(data.items))
      .catch(() => setVersions([]))
      .finally(() => setHistoryLoading(false));
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);

  useEffect(() => {
    if (activeTab !== 'history') return undefined;
    let cleanup: (() => void) | undefined;
    queueMicrotask(() => {
      cleanup = loadVersions(historySection);
    });
    return () => cleanup?.();
  }, [activeTab, historySection, loadVersions]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyKeys.length === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirtyKeys.length]);

  const updateDraft = <T extends Record<string, unknown>,>(sectionKey: WebsiteSectionKey, value: T) => {
    setDrafts((prev) => ({ ...prev, [sectionKey]: value }));
    setDirtyKeys((prev) => (prev.includes(sectionKey) ? prev : [...prev, sectionKey]));
  };

  const saveDraft = (sectionKey: WebsiteSectionKey) => {
    setSaving(true);
    websiteContentAdminApi.updateDraft(sectionKey, drafts[sectionKey])
      .then((item) => {
        setItems((prev) => prev.map((existing) => (existing.section_key === sectionKey ? item : existing)));
        setDrafts((prev) => ({ ...prev, [sectionKey]: item.draft_content }));
        setDirtyKeys((prev) => prev.filter((key) => key !== sectionKey));
      })
      .catch((err) => setError(err?.response?.data?.detail || 'Không lưu được bản nháp.'))
      .finally(() => setSaving(false));
  };

  const submitConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirm) return;
    setSaving(true);
    const action = confirm.type === 'publish'
      ? websiteContentAdminApi.publish(confirm.sectionKey, reason)
      : websiteContentAdminApi.rollback(confirm.sectionKey, confirm.version || 1, reason);
    action
      .then((item) => {
        setItems((prev) => prev.map((existing) => (existing.section_key === confirm.sectionKey ? item : existing)));
        setDrafts((prev) => ({ ...prev, [confirm.sectionKey]: item.draft_content }));
        setDirtyKeys((prev) => prev.filter((key) => key !== confirm.sectionKey));
        setConfirm(null);
        setReason('');
        if (activeTab === 'history') loadVersions(confirm.sectionKey);
      })
      .catch((err) => setError(err?.response?.data?.detail || 'Không thực hiện được thao tác.'))
      .finally(() => setSaving(false));
  };

  const renderEditor = (sectionKey: WebsiteSectionKey) => {
    if (sectionKey === 'site_identity') {
      return <SiteIdentityEditor value={drafts.site_identity as unknown as SiteIdentityContent} onChange={(value) => updateDraft('site_identity', value as unknown as Record<string, unknown>)} />;
    }
    if (sectionKey === 'header') {
      return <HeaderEditor value={drafts.header as unknown as HeaderContent} onChange={(value) => updateDraft('header', value as unknown as Record<string, unknown>)} />;
    }
    if (sectionKey === 'hero') {
      return <HeroEditor value={drafts.hero as unknown as HeroContent} onChange={(value) => updateDraft('hero', value as unknown as Record<string, unknown>)} />;
    }
    if (sectionKey === 'sections') {
      return <SectionsEditor value={drafts.sections as unknown as WebsiteContentBundle['sections']} onChange={(value) => updateDraft('sections', value as unknown as Record<string, unknown>)} />;
    }
    return <FooterEditor value={drafts.footer as unknown as FooterContent} onChange={(value) => updateDraft('footer', value as unknown as Record<string, unknown>)} />;
  };

  const activeItem = activeTab !== 'history' ? items.find((item) => item.section_key === activeTab) : null;

  return (
    <div className="admin-content-page admin-website-page">
      <header className="admin-content-header">
        <div>
          <h1>Website Content</h1>
          <p>Chỉnh nội dung trang chủ bằng bản nháp, preview an toàn và xuất bản có audit log.</p>
        </div>
        <span className="admin-content-badge">{dirtyKeys.length ? `${dirtyKeys.length} nhóm chưa lưu` : 'Đã đồng bộ'}</span>
      </header>

      <nav className="admin-content-tabs" aria-label="Website content tabs">
        {CONTENT_TABS.map((tab) => (
          <button key={tab.key} type="button" className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
        <button type="button" className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>
          Lịch sử phiên bản
        </button>
      </nav>

      {error && <div className="panel-error" role="alert">{error}</div>}
      {loading && <div className="admin-content-state">Đang tải nội dung website...</div>}

      {!loading && activeTab !== 'history' && (
        <div className="admin-content-cms-layout">
          <section className="admin-content-panel">
            <div className="admin-content-row-head">
              <div>
                <h2>{CONTENT_TABS.find((tab) => tab.key === activeTab)?.label}</h2>
                <p className="admin-content-muted">
                  Version {activeItem?.version || 1} · trạng thái {activeItem?.status || 'draft'}
                </p>
              </div>
              <SectionActions
                canUpdate={canUpdate}
                canPublish={canPublish}
                dirty={dirtyKeys.includes(activeTab)}
                saving={saving}
                onSave={() => saveDraft(activeTab)}
                onPublish={() => setConfirm({ type: 'publish', sectionKey: activeTab })}
              />
            </div>
            {renderEditor(activeTab)}
          </section>
          <WebsitePreview content={contentBundle} />
        </div>
      )}

      {!loading && activeTab === 'history' && (
        <HistoryPanel
          sectionKey={historySection}
          versions={versions}
          loading={historyLoading}
          onSectionChange={setHistorySection}
          onRollback={(sectionKey, version) => setConfirm({ type: 'rollback', sectionKey, version })}
        />
      )}

      {confirm && (
        <div className="admin-content-modal-backdrop" role="presentation">
          <form className="admin-content-modal" role="dialog" aria-modal="true" onSubmit={submitConfirm}>
            <h3>{confirm.type === 'publish' ? 'Xuất bản nội dung' : 'Hoàn tác phiên bản'}</h3>
            <p className="admin-content-muted">
              Nhóm ảnh hưởng: <strong>{CONTENT_TABS.find((tab) => tab.key === confirm.sectionKey)?.label}</strong>
              {confirm.version ? ` · phiên bản v${confirm.version}` : ''}
            </p>
            <Field label="Lý do">
              <textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={1} maxLength={500} />
            </Field>
            <div className="admin-content-actions admin-content-modal-actions">
              <button type="button" className="admin-content-btn" onClick={() => { setConfirm(null); setReason(''); }}>Hủy</button>
              <button type="submit" className="admin-content-btn admin-content-btn--primary" disabled={saving || !reason.trim()}>
                Xác nhận
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
