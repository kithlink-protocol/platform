'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { apiFetch, ClientApiError } from '@/lib/client-api';

type VerifyState =
  | { status: 'loading' }
  | { status: 'ok' }
  | { status: 'fail'; message: string };

function VerifyEmailStatus() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<VerifyState>({ status: 'loading' });

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState({ status: 'fail', message: 'This verification link is missing its token.' });
      return;
    }
    let active = true;
    apiFetch(`/app/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => {
        if (active) setState({ status: 'ok' });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setState({
          status: 'fail',
          message:
            err instanceof ClientApiError
              ? err.message
              : 'Something went wrong. Please try again later.',
        });
      });
    return () => {
      active = false;
    };
  }, [searchParams]);

  if (state.status === 'loading') {
    return <p className="muted">Verifying your email…</p>;
  }

  if (state.status === 'ok') {
    return (
      <>
        <p role="alert" className="alert alert-ok">
          Your email is verified. Thanks!
        </p>
        <p className="section-gap">
          <Link href="/dashboard">Continue to dashboard</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <p role="alert" className="alert alert-danger">
        {state.message} You can request a new link from your dashboard.
      </p>
      <p className="section-gap">
        <Link href="/dashboard">Continue to dashboard</Link>
      </p>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <main id="main-content" className="container prose">
      <h1 className="t-title">Verify your email</h1>
      <Suspense fallback={<p className="muted">Verifying your email…</p>}>
        <VerifyEmailStatus />
      </Suspense>
    </main>
  );
}
