import { QueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/auth';

export const queryClient = new QueryClient();

// Cached answers (friends, messages, plan, admin lists) belong to one account. When the signed-in user changes or signs
// out, forget them all, so the next person on this browser never sees the previous person's data.
useAuth.subscribe((state, prev) => {
  if (state.user?.id !== prev.user?.id) queryClient.clear();
});
