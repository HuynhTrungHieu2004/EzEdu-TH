import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Save, Send, Undo2 } from 'lucide-react';
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
import {
  Badge,
  Button,
  Card,
  CardBody,
  Checkbox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  PageHeader,
  SectionHeader,
  Select,
  SkeletonText,
  Tabs,
  Textarea,
} from '../components/ui';
import type { DataTableColumn, TabItem } from '../components/ui';
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

const TAB_ITEMS: TabItem[] = [
  ...CONTENT_TABS.map((tab) => ({ id: tab.key, label: tab.label })),
  { id: 'history', label: 'Lịch sử phiên bản' },
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
    <div className="ez-row ez-row-wrap">
      {canUpdate && (
        <Button
          variant="primary"
          disabled={saving || !dirty}
          onClick={onSave}
          leadingIcon={<Save size={15} aria-hidden="true" />}
        >
          Lưu nháp
        </Button>
      )}
      {canPublish && (
        <Button
          variant="secondary"
          disabled={saving}
          onClick={onPublish}
          leadingIcon={<Send size={15} aria-hidden="true" />}
        >
          Xuất bản
        </Button>
      )}
      {dirty && <span className="ez-muted">Có thay đổi chưa lưu</span>}
    </div>
  );
}

/** Hàng chỉnh sửa trong danh sách: khung có viền nhẹ + lưới trường responsive. */
function EditorRow({ children }: { children: ReactNode }) {
  return (
    <Card variant="muted">
      <CardBody className="ez-grid ez-grid-3">{children}</CardBody>
    </Card>
  );
}

function SiteIdentityEditor({ value, onChange }: { value: SiteIdentityContent; onChange: (value: SiteIdentityContent) => void }) {
  return (
    <div className="ez-grid ez-grid-2">
      <FormField label="Tên website">
        <Input value={value.site_name || ''} onChange={(event) => onChange({ ...value, site_name: event.target.value })} />
      </FormField>
      <FormField label="Logo text">
        <Input value={value.logo_text || ''} onChange={(event) => onChange({ ...value, logo_text: event.target.value })} />
      </FormField>
      <FormField label="Logo URL">
        <Input value={value.logo_url || ''} onChange={(event) => onChange({ ...value, logo_url: event.target.value })} placeholder="/images/logo.png hoặc https://..." />
      </FormField>
      <FormField label="Favicon URL">
        <Input value={value.favicon_url || ''} onChange={(event) => onChange({ ...value, favicon_url: event.target.value })} placeholder="/favicon.svg" />
      </FormField>
      <FormField label="Slogan">
        <Textarea rows={3} value={value.slogan || ''} onChange={(event) => onChange({ ...value, slogan: event.target.value })} />
      </FormField>
    </div>
  );
}

function HeaderEditor({ value, onChange }: { value: HeaderContent; onChange: (value: HeaderContent) => void }) {
  const menu = value.menu || [];
  const updateMenu = (index: number, patch: Partial<WebsiteMenuItem>) => {
    onChange({ ...value, menu: menu.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  };
  return (
    <div className="ez-stack">
      <div className="ez-grid ez-grid-2">
        <FormField label="Nhãn đăng nhập">
          <Input value={value.login_label || ''} onChange={(event) => onChange({ ...value, login_label: event.target.value })} />
        </FormField>
        <FormField label="CTA chính">
          <Input value={value.primary_cta_label || ''} onChange={(event) => onChange({ ...value, primary_cta_label: event.target.value })} />
        </FormField>
        <FormField label="CTA khi đã đăng nhập">
          <Input value={value.authenticated_cta_label || ''} onChange={(event) => onChange({ ...value, authenticated_cta_label: event.target.value })} />
        </FormField>
      </div>
      <div className="ez-stack">
        <SectionHeader
          title="Menu"
          titleAs="h3"
          actions={(
            <Button variant="outline" onClick={() => onChange({ ...value, menu: [...menu, { label: 'Mục mới', href: '#section', order: menu.length + 1, visible: true }] })}>
              Thêm mục
            </Button>
          )}
        />
        {menu.map((item, index) => (
          <EditorRow key={`${item.href}-${index}`}>
            <Input value={item.label} onChange={(event) => updateMenu(index, { label: event.target.value })} aria-label="Tên mục" />
            <Input value={item.href} onChange={(event) => updateMenu(index, { href: event.target.value })} aria-label="Đường dẫn" />
            <Input type="number" value={item.order} onChange={(event) => updateMenu(index, { order: Number(event.target.value) })} aria-label="Thứ tự" />
            <div className="ez-row ez-row-wrap">
              <Checkbox
                label="Hiển thị"
                checked={item.visible !== false}
                onChange={(event) => updateMenu(index, { visible: event.target.checked })}
              />
              <Button variant="danger" size="sm" onClick={() => onChange({ ...value, menu: menu.filter((_, i) => i !== index) })}>Xóa</Button>
            </div>
          </EditorRow>
        ))}
      </div>
    </div>
  );
}

function HeroEditor({ value, onChange }: { value: HeroContent; onChange: (value: HeroContent) => void }) {
  const chips = value.chips || [];
  return (
    <div className="ez-stack">
      <p className="ez-muted">
        Tiêu đề chính (H1) của trang chủ hiện cố định trong mã nguồn, không chỉnh được ở đây. Các trường bên dưới vẫn áp dụng ngay trên trang chủ.
      </p>
      <div className="ez-grid ez-grid-2">
        <FormField label="CTA chính">
          <Input value={value.primary_cta_label || ''} onChange={(event) => onChange({ ...value, primary_cta_label: event.target.value })} />
        </FormField>
        <FormField label="CTA phụ">
          <Input value={value.secondary_cta_label || ''} onChange={(event) => onChange({ ...value, secondary_cta_label: event.target.value })} />
        </FormField>
        <FormField label="Sticker hoặc hình minh họa">
          <Input value={value.sticker_image_url || ''} onChange={(event) => onChange({ ...value, sticker_image_url: event.target.value })} />
        </FormField>
        <FormField label="Khung upload">
          <Checkbox
            label="Bật upload trên trang chủ"
            checked={value.upload_enabled !== false}
            onChange={(event) => onChange({ ...value, upload_enabled: event.target.checked })}
          />
        </FormField>
        <FormField label="Mô tả">
          <Textarea rows={4} value={value.description || ''} onChange={(event) => onChange({ ...value, description: event.target.value })} />
        </FormField>
      </div>
      <div className="ez-stack">
        <SectionHeader
          title="Chips"
          titleAs="h3"
          actions={(
            <Button variant="outline" onClick={() => onChange({ ...value, chips: [...chips, 'Nhãn mới'] })}>Thêm chip</Button>
          )}
        />
        {chips.map((chip, index) => (
          <EditorRow key={`${chip}-${index}`}>
            <Input value={chip} onChange={(event) => onChange({ ...value, chips: chips.map((item, i) => (i === index ? event.target.value : item)) })} aria-label="Chip" />
            <div className="ez-row ez-row-wrap">
              <Button variant="danger" size="sm" onClick={() => onChange({ ...value, chips: chips.filter((_, i) => i !== index) })}>Xóa</Button>
            </div>
          </EditorRow>
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
    <div className="ez-stack">
      <div className="ez-stack">
        <SectionHeader
          title="Section"
          titleAs="h3"
          actions={(
            <Button variant="outline" onClick={() => onChange({ ...value, items: [...items, { key: `section_${items.length + 1}`, title: 'Section mới', eyebrow: 'Nhãn', description: 'Mô tả', enabled: true, order: items.length + 1 }] })}>
              Thêm section
            </Button>
          )}
        />
        {items.map((item, index) => (
          <Card variant="muted" key={`${item.key}-${index}`}>
            <CardBody className="ez-stack">
              <div className="ez-grid ez-grid-3">
                <Input value={item.key} onChange={(event) => updateItem(index, { key: event.target.value })} aria-label="Section key" />
                <Input value={item.eyebrow} onChange={(event) => updateItem(index, { eyebrow: event.target.value })} aria-label="Eyebrow" />
                <Input type="number" value={item.order} onChange={(event) => updateItem(index, { order: Number(event.target.value) })} aria-label="Thứ tự" />
                <div className="ez-row ez-row-wrap">
                  <Checkbox
                    label="Hiển thị"
                    checked={item.enabled !== false}
                    onChange={(event) => updateItem(index, { enabled: event.target.checked })}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    iconOnly
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                    aria-label="Di chuyển lên"
                    title="Di chuyển lên"
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    iconOnly
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, 1)}
                    aria-label="Di chuyển xuống"
                    title="Di chuyển xuống"
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <Input value={item.title} onChange={(event) => updateItem(index, { title: event.target.value })} aria-label="Tiêu đề section" />
              <Textarea rows={2} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} aria-label="Mô tả section" />
            </CardBody>
          </Card>
        ))}
      </div>
      <div className="ez-stack">
        <SectionHeader
          title="Lợi ích"
          titleAs="h3"
          actions={(
            <Button variant="outline" onClick={() => onChange({ ...value, benefits: [...benefits, { title: 'Lợi ích mới', description: 'Mô tả' }] })}>
              Thêm lợi ích
            </Button>
          )}
        />
        {benefits.map((item, index) => (
          <EditorRow key={`${item.title}-${index}`}>
            <Input value={item.title} onChange={(event) => updateBenefit(index, { title: event.target.value })} aria-label="Tên lợi ích" />
            <Input value={item.description} onChange={(event) => updateBenefit(index, { description: event.target.value })} aria-label="Mô tả lợi ích" />
            <div className="ez-row ez-row-wrap">
              <Button variant="danger" size="sm" onClick={() => onChange({ ...value, benefits: benefits.filter((_, i) => i !== index) })}>Xóa</Button>
            </div>
          </EditorRow>
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
      <div className="ez-stack">
        <SectionHeader
          title={title}
          titleAs="h3"
          actions={(
            <Button variant="outline" onClick={() => onChange({ ...value, [group]: [...links, { label: 'Liên kết mới', href: '#', visible: true }] })}>Thêm</Button>
          )}
        />
        {links.map((item, index) => (
          <EditorRow key={`${group}-${item.href}-${index}`}>
            <Input value={item.label} onChange={(event) => updateLinks(group, index, { label: event.target.value })} aria-label="Tên liên kết" />
            <Input value={item.href} onChange={(event) => updateLinks(group, index, { href: event.target.value })} aria-label="URL" />
            <div className="ez-row ez-row-wrap">
              <Checkbox
                label="Hiển thị"
                checked={item.visible !== false}
                onChange={(event) => updateLinks(group, index, { visible: event.target.checked })}
              />
              <Button variant="danger" size="sm" onClick={() => onChange({ ...value, [group]: links.filter((_, i) => i !== index) })}>Xóa</Button>
            </div>
          </EditorRow>
        ))}
      </div>
    );
  };
  return (
    <div className="ez-stack">
      <div className="ez-grid ez-grid-2">
        <FormField label="Nhãn liên hệ">
          <Input value={value.contact_label || ''} onChange={(event) => onChange({ ...value, contact_label: event.target.value })} />
        </FormField>
        <FormField label="Email">
          <Input type="email" value={value.email || ''} onChange={(event) => onChange({ ...value, email: event.target.value })} />
        </FormField>
        <FormField label="Bản quyền">
          <Textarea rows={3} value={value.copyright || ''} onChange={(event) => onChange({ ...value, copyright: event.target.value })} />
        </FormField>
      </div>
      {renderLinks('socials', 'Mạng xã hội')}
      {renderLinks('policies', 'Chính sách')}
    </div>
  );
}

/**
 * Khung xem trước mô phỏng trang chủ thật — không phải form, nên vẫn dùng CSS
 * riêng của trang (không có primitive nào trong design system tương đương một
 * "ảnh chụp trang web thu nhỏ"). Các nút bên trong đã chuyển sang Button.
 */
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
        <h2>Biến học liệu thành <em>trải nghiệm học tập thông minh</em></h2>
        <p>{content.hero.description}</p>
        <div>
          <Button variant="outline" size="sm">{content.hero.primary_cta_label}</Button>
          <Button variant="outline" size="sm">{content.hero.secondary_cta_label}</Button>
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
  const columns: DataTableColumn<WebsiteContentVersionItem>[] = [
    { key: 'version', label: 'Version', render: (item) => `v${item.version}` },
    { key: 'source', label: 'Nguồn', render: (item) => <Badge>{item.source}</Badge> },
    { key: 'created_by', label: 'Người tạo', render: (item) => item.created_by || '-' },
    { key: 'created_at', label: 'Thời gian', render: (item) => new Date(item.created_at).toLocaleString('vi-VN') },
    { key: 'reason', label: 'Lý do', render: (item) => item.reason || '-' },
    {
      key: 'actions',
      label: 'Hành động',
      render: (item) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRollback(sectionKey, item.version)}
          leadingIcon={<Undo2 size={14} aria-hidden="true" />}
        >
          Hoàn tác
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardBody className="ez-stack">
        <SectionHeader
          title="Lịch sử phiên bản"
          actions={(
            <Select
              aria-label="Nhóm nội dung"
              value={sectionKey}
              onChange={(event) => onSectionChange(event.target.value as WebsiteSectionKey)}
              options={CONTENT_TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
            />
          )}
        />
        {loading && <p className="ez-muted">Đang tải lịch sử...</p>}
        {!loading && versions.length === 0 && <EmptyState title="Chưa có lịch sử phiên bản." compact />}
        {versions.length > 0 && (
          <DataTable
            columns={columns}
            data={versions}
            rowKey={(item) => item.id}
            minWidth={860}
          />
        )}
      </CardBody>
    </Card>
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

  const submitConfirm = () => {
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
    <div className="ez-admin-page">
      <PageHeader
        title="Nội dung website"
        description="Chỉnh nội dung trang chủ bằng bản nháp, xem trước an toàn và xuất bản có nhật ký."
        actions={
          <Badge variant={dirtyKeys.length ? 'warning' : 'success'}>
            {dirtyKeys.length ? `${dirtyKeys.length} nhóm chưa lưu` : 'Đã đồng bộ'}
          </Badge>
        }
      />

      <Tabs
        items={TAB_ITEMS}
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabKey)}
        ariaLabel="Website content tabs"
      >
        <div className="ez-stack">
          {error && <ErrorState title="Không tải được nội dung website" description={error} compact />}
          {loading && <SkeletonText lines={6} />}

          {!loading && activeTab !== 'history' && (
            <div className="ez-grid ez-grid-2" style={{ alignItems: 'start' }}>
              <Card>
                <CardBody className="ez-stack">
                  <SectionHeader
                    title={CONTENT_TABS.find((tab) => tab.key === activeTab)?.label ?? ''}
                    description={`Version ${activeItem?.version || 1} · trạng thái ${activeItem?.status || 'draft'}`}
                    actions={(
                      <SectionActions
                        canUpdate={canUpdate}
                        canPublish={canPublish}
                        dirty={dirtyKeys.includes(activeTab)}
                        saving={saving}
                        onSave={() => saveDraft(activeTab)}
                        onPublish={() => setConfirm({ type: 'publish', sectionKey: activeTab })}
                      />
                    )}
                  />
                  {renderEditor(activeTab)}
                </CardBody>
              </Card>
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
        </div>
      </Tabs>

      {confirm && (
        <ConfirmDialog
          open
          onClose={saving ? () => undefined : () => { setConfirm(null); setReason(''); }}
          onConfirm={submitConfirm}
          title={confirm.type === 'publish' ? 'Xuất bản nội dung' : 'Hoàn tác phiên bản'}
          description={`Nhóm ảnh hưởng: ${CONTENT_TABS.find((tab) => tab.key === confirm.sectionKey)?.label ?? confirm.sectionKey}${confirm.version ? ` · phiên bản v${confirm.version}` : ''}. Thao tác này thay đổi nội dung công khai và được ghi nhật ký.`}
          confirmLabel={confirm.type === 'publish' ? 'Xuất bản' : 'Hoàn tác'}
          confirmDisabled={!reason.trim()}
          busy={saving}
        >
          <FormField label="Lý do">
            <Textarea
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={1}
              maxLength={500}
            />
          </FormField>
        </ConfirmDialog>
      )}
    </div>
  );
}
