/**
 * Sign in or create an account, as the whole of a place somebody went to in
 * order to do it — building_blocks_rn's `LoginPage`, the web `LoginPage`'s
 * counterpart: the app's name, a heading that follows the form's mode, the
 * form, its own scrolling and keyboard avoidance.
 *
 * **Page or modal is the family's rule, as on the web.** Somewhere a reader
 * *navigates to* in order to sign in — Settings' Account pane while signed
 * out, the Projects window's Connect pane — is this page. Where an account is
 * needed in the middle of something else (a gated list, the credit balance),
 * `SignInModal` opens over that screen instead, and signing in leaves the
 * reader where they were.
 *
 * Both places today are the detail pane of a split view, which has cleared
 * the screen's edges already: inside one (`useEmbedded`) the page clears
 * none, and as a screen of its own it clears the sides and bottom the one
 * rule names (`useSafeEdgeList`), leaving the top to the navigator — the same
 * division `ScreenScaffold` makes.
 */
import { useTranslation } from 'react-i18next';
import { SafeAreaEdgesProvider } from '@sudobility/components-rn';
import { LoginPage } from '@sudobility/building_blocks_rn';
import { CONSTANTS } from '@/config/constants';
import { useSidesHandled } from '@/components/layout/EmbeddedScreen';
import { useSafeEdgeList } from '@/platform/safe-edges';
import type { Edge } from '@/platform/safe-edges';
import { useSignInForm } from './useSignInForm';

const SCREEN_EDGES: readonly Edge[] = ['left', 'right', 'bottom'];
const NO_EDGES: readonly Edge[] = [];

export type SignInPageProps = {
  /**
   * Somebody signed in, or made their account. Optional: the places this
   * page sits re-render on their own once `useAuth` reports a user.
   */
  onSuccess?: () => void;
};

export function SignInPage({ onSuccess }: SignInPageProps) {
  const { t } = useTranslation();
  const form = useSignInForm();
  const sidesHandled = useSidesHandled();
  const screenEdges = useSafeEdgeList(SCREEN_EDGES);
  return (
    <SafeAreaEdgesProvider edges={sidesHandled ? NO_EDGES : screenEdges}>
      <LoginPage
        appName={CONSTANTS.APP_NAME}
        onEmailSignIn={form.onEmailSignIn}
        onEmailSignUp={form.onEmailSignUp}
        onPasswordReset={form.onPasswordReset}
        onGoogleSignIn={form.onGoogleSignIn}
        onAppleSignIn={form.onAppleSignIn}
        showGoogleSignIn={form.showGoogleSignIn}
        showAppleSignIn={form.showAppleSignIn}
        appleLogoTone={form.appleLogoTone}
        onSuccess={onSuccess ?? noop}
        text={{
          ...form.text,
          signInToAccount: t('auth.signInToAccount'),
          createAccount: t('auth.createAccount'),
          resetPassword: t('auth.resetPassword'),
        }}
      />
    </SafeAreaEdgesProvider>
  );
}

function noop() {}
