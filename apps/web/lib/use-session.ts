'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { AuthSession } from '@kithlink/contracts';
import { apiFetch, ClientApiError } from '@/lib/client-api';

export type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: AuthSession }
  | { status: 'error'; message: string };

export function useSession(): SessionState {
  const router = useRouter();
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    apiFetch<AuthSession>('/app/v1/auth/session')
      .then(session => {
        if (active) setState({ status: 'ready', session });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ClientApiError && error.status === 401) {
          router.replace('/login');
          return;
        }
        setState({
          status: 'error',
          message:
            error instanceof ClientApiError
              ? error.message
              : 'Something went wrong. Please try again later.',
        });
      });
    return () => {
      active = false;
    };
  }, [router]);

  return state;
}
