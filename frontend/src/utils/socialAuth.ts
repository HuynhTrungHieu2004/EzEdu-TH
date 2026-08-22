type GoogleCredential = { credential: string };
type GoogleAccounts = {
  id: {
    initialize(options: { client_id: string; callback: (response: GoogleCredential) => void }): void;
    renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
  };
};
type FacebookResponse = { authResponse?: { accessToken?: string } };

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
    FB?: {
      init(options: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
      login(callback: (response: FacebookResponse) => void, options: { scope: string }): void;
    };
  }
}

function loadScript(id: string, src: string): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === 'true') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    script.id = id;
    script.async = true;
    script.defer = true;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error('Không tải được SDK đăng nhập.'));
    if (!existing) { script.src = src; document.head.appendChild(script); }
  });
}

export async function renderGoogleButton(
  parent: HTMLElement,
  clientId: string,
  onCredential: (credential: string) => void,
): Promise<void> {
  await loadScript('google-identity-services', 'https://accounts.google.com/gsi/client');
  if (!window.google) throw new Error('Google Identity Services không khả dụng.');
  parent.replaceChildren();
  window.google.accounts.id.initialize({ client_id: clientId, callback: (response) => onCredential(response.credential) });
  window.google.accounts.id.renderButton(parent, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: 260, locale: 'vi' });
}

export async function loginWithFacebook(appId: string): Promise<string> {
  await loadScript('facebook-jssdk', 'https://connect.facebook.net/vi_VN/sdk.js');
  if (!window.FB) throw new Error('Facebook SDK không khả dụng.');
  window.FB.init({ appId, cookie: true, xfbml: false, version: 'v21.0' });
  return new Promise((resolve, reject) => {
    window.FB!.login((response) => {
      const token = response.authResponse?.accessToken;
      if (token) resolve(token);
      else reject(new Error('Bạn chưa cấp quyền đăng nhập Facebook.'));
    }, { scope: 'public_profile,email' });
  });
}
