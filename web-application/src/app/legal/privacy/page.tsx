import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Nucleate",
  description: "Nucleate Privacy Policy - How we collect, use, and protect your data",
};

export default function PrivacyPolicyPage() {
  return (
    <article className="prose prose-gray dark:prose-invert max-w-none">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: January 15, 2026</p>

      <p>
        Nucleate (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your
        privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard
        your information when you use our platform and services.
      </p>

      <h2>1. Information We Collect</h2>

      <h3>Information You Provide</h3>
      <ul>
        <li>Account information (name, email address, password)</li>
        <li>Profile information</li>
        <li>Payment information (processed securely by Stripe)</li>
        <li>Content you create (code, projects, assets)</li>
        <li>Communications with us</li>
      </ul>

      <h3>Information Collected Automatically</h3>
      <ul>
        <li>Device information (browser type, operating system)</li>
        <li>Usage data (features used, pages visited)</li>
        <li>Log data (IP address, access times)</li>
        <li>Cookies and similar technologies</li>
      </ul>

      <h3>Information from Third Parties</h3>
      <ul>
        <li>Authentication providers (Google, GitHub)</li>
        <li>Connected services (GitHub, Vercel)</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide, maintain, and improve our services</li>
        <li>Process transactions and send related information</li>
        <li>Send technical notices and support messages</li>
        <li>Respond to your comments and questions</li>
        <li>Analyze usage patterns to improve user experience</li>
        <li>Detect, prevent, and address technical issues</li>
        <li>Protect against fraudulent or illegal activity</li>
      </ul>

      <h2>3. Information Sharing</h2>
      <p>We may share your information with:</p>
      <ul>
        <li>
          <strong>Service Providers:</strong> Third parties that perform services on our
          behalf (hosting, analytics, payment processing)
        </li>
        <li>
          <strong>Connected Services:</strong> When you authorize integrations (GitHub,
          Vercel), we share necessary data with those services
        </li>
        <li>
          <strong>Legal Requirements:</strong> When required by law or to protect our
          rights
        </li>
        <li>
          <strong>Business Transfers:</strong> In connection with a merger, acquisition,
          or sale of assets
        </li>
      </ul>

      <h2>4. Third-Party Integrations</h2>
      <p>
        Our service integrates with third-party platforms including GitHub and Vercel.
        When you connect these services:
      </p>
      <ul>
        <li>We access only the data necessary to provide the integration</li>
        <li>OAuth tokens are encrypted at rest</li>
        <li>You can disconnect integrations at any time</li>
        <li>Third-party services have their own privacy policies</li>
      </ul>

      <h2>5. Data Security</h2>
      <p>
        We implement appropriate technical and organizational measures to protect your
        data, including:
      </p>
      <ul>
        <li>Encryption of data in transit (TLS) and at rest (AES-256)</li>
        <li>Regular security assessments</li>
        <li>Access controls and authentication</li>
        <li>Secure development practices</li>
      </ul>

      <h2>6. Data Retention</h2>
      <p>
        We retain your information for as long as your account is active or as needed to
        provide services. You can request deletion of your data at any time by contacting
        us.
      </p>

      <h2>7. Your Rights</h2>
      <p>Depending on your location, you may have the right to:</p>
      <ul>
        <li>Access the personal information we hold about you</li>
        <li>Request correction of inaccurate data</li>
        <li>Request deletion of your data</li>
        <li>Object to or restrict processing</li>
        <li>Data portability</li>
        <li>Withdraw consent</li>
      </ul>

      <h2>8. Cookies</h2>
      <p>
        We use cookies and similar technologies to enhance your experience. You can
        control cookies through your browser settings. Essential cookies are required for
        the service to function.
      </p>

      <h2>9. Children&apos;s Privacy</h2>
      <p>
        Our service is not intended for children under 13. We do not knowingly collect
        information from children under 13.
      </p>

      <h2>10. International Data Transfers</h2>
      <p>
        Your information may be transferred to and processed in countries other than your
        own. We ensure appropriate safeguards are in place for such transfers.
      </p>

      <h2>11. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of any
        changes by posting the new policy on this page and updating the &quot;Last updated&quot;
        date.
      </p>

      <h2>12. Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy, please contact us at{" "}
        <a href="mailto:privacy@nucleate.dev">privacy@nucleate.dev</a>.
      </p>
    </article>
  );
}
