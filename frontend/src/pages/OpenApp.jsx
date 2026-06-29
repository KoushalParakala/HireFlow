// This page is the "Open in Mobile App" landing page.
// Email clients (Gmail, Outlook, etc.) block custom URI schemes like hireflow://
// So the email sends users to an HTTPS URL like:
//   https://hireflow-web-j73x.onrender.com/open-app/{token}
// This page then immediately redirects to the native deep link:
//   hireflow://interview/{token}
// If the app is not installed, it shows a download button.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export default function OpenApp() {
  const { token } = useParams();
  const [attempted, setAttempted] = useState(false);

  const deepLink = `hireflow://interview/${token}`;
  const apkLink = `${window.location.origin}/downloads/hireflow.apk`;

  useEffect(() => {
    if (!token) return;
    // Give the browser a tiny moment to render, then fire the deep link
    const timer = setTimeout(() => {
      window.location.href = deepLink;
      setAttempted(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [token, deepLink]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f9f9ff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, Arial, sans-serif',
      padding: '24px',
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '24px',
        padding: '48px 40px',
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        border: '1px solid #dce2f3',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📱</div>
        <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#151c27', marginBottom: '12px', letterSpacing: '-0.02em' }}>
          Opening HireFlow...
        </h1>
        <p style={{ color: '#45474a', fontSize: '16px', lineHeight: '1.6', marginBottom: '32px' }}>
          {attempted
            ? 'If the app did not open, you may need to install it first.'
            : 'Redirecting you to the HireFlow mobile app...'}
        </p>

        <a
          href={deepLink}
          style={{
            display: 'block',
            padding: '16px 32px',
            background: '#fc8a40',
            color: '#672c00',
            borderRadius: '16px',
            textDecoration: 'none',
            fontWeight: '700',
            fontSize: '16px',
            marginBottom: '16px',
            boxShadow: '0 4px 20px rgba(252,138,64,0.3)',
          }}
        >
          Open in HireFlow App
        </a>

        <a
          href={apkLink}
          style={{
            display: 'block',
            padding: '14px 32px',
            background: '#ffffff',
            color: '#151c27',
            borderRadius: '16px',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '15px',
            border: '2px solid #dce2f3',
          }}
        >
          Download HireFlow App (.apk)
        </a>

        <p style={{ color: '#999', fontSize: '13px', marginTop: '24px' }}>
          Or use your interview token on the welcome screen: <br />
          <strong style={{ color: '#151c27', fontFamily: 'monospace', wordBreak: 'break-all' }}>{token}</strong>
        </p>
      </div>
    </div>
  );
}
