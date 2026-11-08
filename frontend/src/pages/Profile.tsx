import { ReactNode, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AppShell from '../components/nav/AppShell';
import VerifyBanner from '../components/VerifyBanner';
import ChunkyButton from '../components/ui/ChunkyButton';
import { BlockedModal, FiltersModal, GenderModal, SettingsModal, genderEmoji } from '../components/chat/modals';
import { useBillingStatus } from '../lib/billing';
import { flagEmoji } from '../lib/flag';
import { countryName } from '../lib/countries';
import Avatar from '../components/ui/Avatar';
import EditProfileModal from '../components/profile/EditProfileModal';
import { useAuth, useSignedInUser } from '../store/auth';
import { useFilters } from '../store/filters';

function Row({ label, value, onClick, to }: { label: string; value?: ReactNode; onClick?: () => void; to?: string }) {
  const cls = 'flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left';
  const inner = (
    <>
      <span className="font-semibold">{label}</span>
      <span className="flex items-center gap-2 text-sm text-muted">
        {value}
        <span aria-hidden className="text-lg">›</span>
      </span>
    </>
  );
  return to ? (
    <Link to={to} className={cls}>{inner}</Link>
  ) : (
    <button onClick={onClick} className={cls}>{inner}</button>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line overflow-hidden rounded-2xl bg-white shadow-sm">{children}</div>;
}

/** Profile tab: who you are, your plan, preferences, help, log out. */
export default function Profile() {
  const navigate = useNavigate();
  const user = useSignedInUser();
  const { data: billing } = useBillingStatus(Boolean(user));
  const filters = useFilters();
  const [showGender, setShowGender] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  if (!user) return <Navigate to="/" replace />;

  const plan = user.isGuest ? 'Guest' : billing?.plan === 'MONTHLY' || billing?.plan === 'ANNUAL' ? 'Premium' : billing?.plan === 'TRIAL' ? 'Free trial' : 'Free';

  return (
    <AppShell title="Profile">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <div className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
          <Avatar name={user.displayName} src={user.avatarUrl} size={64} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-semibold">{user.displayName ?? 'You'}</p>
            <p className="truncate text-sm text-muted">{user.email ?? 'Guest session'}</p>
            <span className="mt-1 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand">{plan}</span>
          </div>
          <ChunkyButton size="sm" variant="neutral" onClick={() => setShowEdit(true)}>Edit</ChunkyButton>
        </div>

        <VerifyBanner />

        {user.isGuest && (
          <div className="rounded-2xl bg-brand p-4 text-white">
            <p className="font-display text-lg font-semibold">Create a free account</p>
            <p className="mb-3 text-sm text-white/90">Add friends, message them and use filters. Your guest session carries over.</p>
            <ChunkyButton to="/signup" variant="neutral" size="sm">Create an account</ChunkyButton>
          </div>
        )}

        <Group>
          <Row label="I am" value={<span className="text-xl">{genderEmoji(user.gender)}</span>} onClick={() => setShowGender(true)} />
          <Row label="Country filter" value={filters.preferredCountry ? `${flagEmoji(filters.preferredCountry)} ${countryName(filters.preferredCountry)}` : 'Anywhere'} onClick={() => setShowFilters(true)} />
          <Row label="Camera & microphone" onClick={() => setShowDevices(true)} />
          <Row label="Blocked people" onClick={() => setShowBlocked(true)} />
          <Row label="Account & security" to="/account" />
        </Group>

        {(user.role === 'MODERATOR' || user.role === 'ADMIN') && (
          <Group>
            <Row label="Moderation" value={user.role} to="/admin" />
          </Group>
        )}

        <Group>
          {!user.isGuest && <Row label="Friends" to="/friends" />}
          <Row label="Premium" value={plan === 'Premium' ? 'Active' : undefined} to="/upgrade" />
        </Group>

        <Group>
          <Row label="Chat rules" to="/rules" />
          <Row label="Terms" to="/terms" />
          <Row label="Privacy" to="/privacy" />
          <Row label="FAQ" to="/faq" />
        </Group>

        <button
          onClick={() => {
            useAuth.getState().logout();
            navigate('/');
          }}
          className="min-h-[52px] rounded-2xl bg-white font-display text-lg font-semibold text-danger shadow-sm"
        >
          Log out
        </button>
      </div>

      {showEdit && <EditProfileModal open onClose={() => setShowEdit(false)} user={user} />}
      <GenderModal open={showGender} onClose={() => setShowGender(false)} />
      <FiltersModal open={showFilters} onClose={() => setShowFilters(false)} filtersEnabled={Boolean(billing?.filtersEnabled) && !user.isGuest} />
      <BlockedModal open={showBlocked} onClose={() => setShowBlocked(false)} />
      <SettingsModal open={showDevices} onClose={() => setShowDevices(false)} onDevicesChanged={() => undefined} />
    </AppShell>
  );
}
