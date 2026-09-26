import { fetchWithTimeout } from './network';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { useSevenStore } from '../store/useSevenStore';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_TOKEN_KEY = 'SEVEN_GOOGLE_OAUTH_TOKEN_V2';
const GOOGLE_REFRESH_KEY = 'SEVEN_GOOGLE_OAUTH_REFRESH_V2';

// Scopes: read-only. Anything more would require Google security review.
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
};

class GmailService {
  private static instance: GmailService;

  private constructor() {}

  public static getInstance(): GmailService {
    if (!GmailService.instance) {
      GmailService.instance = new GmailService();
    }
    return GmailService.instance;
  }

  private getRedirectUri(): string {
    // Native: the "ultron" custom scheme registered in app.json.
    // Expo Go: falls back to the Expo Go proxy-ish URI automatically.
    return AuthSession.makeRedirectUri({
      scheme: 'ultron',
      path: 'auth/google',
    });
  }

  /**
   * Runs a REAL OAuth2 authorization-code + PKCE flow against Google.
   *
   * expo-auth-session's AuthRequest manages the PKCE verifier/challenge
   * internally (usePKCE defaults to true); the verifier is then read from
   * `authRequest.codeVerifier` for the manual token exchange.
   *
   * Requires a Google Cloud OAuth Client ID (type: Web application) with the
   * redirect URI printed in the terminal whitelisted.
   */
  public async connectGoogleOAuth(clientId: string): Promise<boolean> {
    const store = useSevenStore.getState();

    if (!clientId || clientId.trim().length < 10) {
      store.addTerminalLog(
        'Google OAuth requires a Client ID. Set it in Onboarding or Settings (Google Cloud console -> OAuth client ID).',
        'warn'
      );
      return false;
    }

    const redirectUri = this.getRedirectUri();
    store.addTerminalLog('Initiating Google OAuth2 (PKCE) flow...', 'cmd');
    store.addTerminalLog(`Redirect URI to whitelist in Google Cloud console: ${redirectUri}`, 'info');

    try {
      const authRequest = new AuthSession.AuthRequest({
        clientId: clientId.trim(),
        redirectUri,
        scopes: GMAIL_SCOPES,
        responseType: AuthSession.ResponseType.Code,
        // access_type=offline asks Google for a refresh token.
        extraParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        usePKCE: true,
      });

      const result = await authRequest.promptAsync(GOOGLE_DISCOVERY);

      if (result.type !== 'success' || !result.params?.code) {
        store.addTerminalLog(`OAuth2 flow ended without authorization: ${result.type}`, 'warn');
        return false;
      }

      const codeVerifier = authRequest.codeVerifier;
      if (!codeVerifier) {
        store.addTerminalLog('PKCE verifier missing from auth request.', 'error');
        return false;
      }

      // Exchange the authorization code for tokens (code_verifier included).
      const tokenResponse = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(result.params.code),
          client_id: clientId.trim(),
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        store.addTerminalLog(`Token exchange failed: ${errText}`, 'error');
        return false;
      }

      const tokens: any = await tokenResponse.json();
      const accessToken: string = tokens.access_token;
      const refreshToken: string | undefined = tokens.refresh_token;

      await SecureStore.setItemAsync(GOOGLE_TOKEN_KEY, accessToken);
      if (refreshToken) {
        await SecureStore.setItemAsync(GOOGLE_REFRESH_KEY, refreshToken);
      }

      // Fetch the user's email address from the userinfo endpoint.
      let email = '';
      try {
        const infoRes = await fetchWithTimeout(
          `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(accessToken)}`
        );
        if (infoRes.ok) {
          const info: any = await infoRes.json();
          email = info.email || '';
        }
      } catch {}

      store.updateGoogleState({
        connected: true,
        accountEmail: email || undefined,
        accessToken,
        lastSync: Date.now(),
      });
      store.addTerminalLog('✓ Google OAuth2 handshake complete. Token stored in SecureStore.', 'success');
      return true;
    } catch (e: any) {
      store.addTerminalLog(`OAuth2 error: ${e?.message || e}`, 'error');
      return false;
    }
  }

  /**
   * Fetches REAL unread emails via the Gmail REST API using the stored token.
   * Throws with a clear message when not connected or when the token expired.
   */
  public async fetchUnreadEmails(): Promise<string> {
    const store = useSevenStore.getState();
    const accessToken = await SecureStore.getItemAsync(GOOGLE_TOKEN_KEY);

    if (!accessToken) {
      store.addTerminalLog('Gmail read skipped: no OAuth token. Connect Google first.', 'warn');
      throw new Error('Google Workspace is not connected. Connect it in Settings.');
    }

    try {
      const listRes = await fetchWithTimeout(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (listRes.status === 401) {
        store.addTerminalLog('Gmail token expired or revoked. Reconnect Google in Settings.', 'warn');
        throw new Error('Google token expired. Reconnect Google Workspace in Settings.');
      }
      if (!listRes.ok) {
        const errText = await listRes.text();
        throw new Error(`Gmail API error: ${errText}`);
      }

      const list: any = await listRes.json();
      const messages: { id: string }[] = list.messages || [];

      if (messages.length === 0) {
        return 'No unread emails found. Inbox zero.';
      }

      // Fetch metadata for each message (parallel, capped at 5).
      const details = await Promise.all(
        messages.slice(0, 5).map(async (m) => {
          const msgRes = await fetchWithTimeout(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!msgRes.ok) return null;
          const msg: any = await msgRes.json();
          const headers: { name: string; value: string }[] = msg.payload?.headers || [];
          const from = headers.find((h) => h.name === 'From')?.value || 'Unknown';
          const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
          const snippet: string = msg.snippet || '';
          return {
            from,
            subject,
            snippet,
            date: new Date(msg.internalDate ? Number(msg.internalDate) : Date.now()).toLocaleString(),
          };
        })
      );

      const valid = details.filter(Boolean) as {
        from: string;
        subject: string;
        snippet: string;
        date: string;
      }[];

      store.updateGoogleState({
        lastSync: Date.now(),
        unreadEmailsCount: valid.length,
        recentEmails: valid.map((d, i) => ({
          id: `real-${i}-${Date.now()}`,
          from: d.from,
          subject: d.subject,
          snippet: d.snippet,
          date: d.date,
        })),
      });

      let summary = `You have ${valid.length} unread messages in your Gmail:\n\n`;
      valid.forEach((em, idx) => {
        summary += `${idx + 1}. From: ${em.from}\n   Subject: "${em.subject}"\n   Snippet: ${em.snippet} (${em.date})\n\n`;
      });
      return summary;
    } catch (e: any) {
      store.addTerminalLog(`Gmail fetch error: ${e?.message || e}`, 'error');
      throw e;
    }
  }

  /**
   * Disconnects: clears stored tokens and resets UI state.
   */
  public async disconnectGoogle(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(GOOGLE_TOKEN_KEY);
      await SecureStore.deleteItemAsync(GOOGLE_REFRESH_KEY);
    } catch {}
    const store = useSevenStore.getState();
    store.updateGoogleState({
      connected: false,
      accountEmail: undefined,
      accessToken: undefined,
      unreadEmailsCount: 0,
      recentEmails: [],
    });
  }
}

export const gmailService = GmailService.getInstance();
