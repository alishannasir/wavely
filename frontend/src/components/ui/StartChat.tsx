import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RulesModal from '../RulesModal';
import { startGuestSession } from '../../lib/guest';
import { isSessionExpired, useAuth } from '../../store/auth';

/**
 * The "Start chatting" flow used by every call-to-action: a signed-in user (account or live guest
 * session) goes straight to the chat; anyone else sees the rules/18+ notice and gets a guest session.
 * Render `modal` once next to the buttons that call `start`.
 */
export function useStartChat(target = '/chat'): { start: () => void; modal: ReactNode } {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const sessionExpiresAt = useAuth((s) => s.sessionExpiresAt);
  const [showRules, setShowRules] = useState(false);

  const start = () => {
    if (user && !isSessionExpired(sessionExpiresAt)) {
      navigate(target);
      return;
    }
    useAuth.getState().logout(); // drop an expired session
    setShowRules(true);
  };

  const modal = showRules ? (
    <RulesModal
      onCancel={() => setShowRules(false)}
      onAccept={async () => {
        await startGuestSession();
        setShowRules(false);
        navigate(target);
      }}
    />
  ) : null;

  return { start, modal };
}
