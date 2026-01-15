import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Nucleate",
  description: "Nucleate Terms of Service",
};

export default function TermsPage() {
  return (
    <article className="prose prose-gray dark:prose-invert max-w-none">
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: January 15, 2026</p>

      <p>
        Welcome to Nucleate. These Terms of Service (&quot;Terms&quot;) govern your access to and
        use of the Nucleate platform and services (&quot;Service&quot;). By using the Service, you
        agree to be bound by these Terms.
      </p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By creating an account or using the Service, you agree to these Terms and our
        Privacy Policy. If you are using the Service on behalf of an organization, you
        represent that you have authority to bind that organization to these Terms.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        Nucleate provides a platform for building, prototyping, and deploying web and
        mobile applications using AI assistance. The Service includes:
      </p>
      <ul>
        <li>AI-powered code generation and editing</li>
        <li>Real-time application preview</li>
        <li>Deployment and hosting capabilities</li>
        <li>Integration with third-party services</li>
      </ul>

      <h2>3. Account Registration</h2>
      <p>
        You must provide accurate and complete information when creating an account. You
        are responsible for maintaining the security of your account credentials and for
        all activities that occur under your account.
      </p>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Violate any applicable laws or regulations</li>
        <li>Infringe on intellectual property rights</li>
        <li>Upload malicious code or content</li>
        <li>Attempt to gain unauthorized access to the Service</li>
        <li>Interfere with the operation of the Service</li>
        <li>Use the Service to build applications that harm others</li>
        <li>Resell or redistribute the Service without authorization</li>
      </ul>

      <h2>5. User Content</h2>
      <p>
        You retain ownership of content you create using the Service. By using the
        Service, you grant us a license to host, store, and process your content solely
        to provide the Service. You are responsible for ensuring you have the rights to
        any content you upload.
      </p>

      <h2>6. Subscription and Payment</h2>
      <p>
        Some features require a paid subscription. By subscribing, you agree to pay the
        applicable fees. Subscriptions automatically renew unless canceled. Refunds are
        provided in accordance with our refund policy.
      </p>

      <h2>7. Third-Party Services</h2>
      <p>
        The Service integrates with third-party services (GitHub, Vercel, Stripe, etc.).
        Your use of these services is subject to their respective terms. We are not
        responsible for third-party services.
      </p>

      <h2>8. Intellectual Property</h2>
      <p>
        The Service, including its design, features, and content (excluding User Content),
        is owned by Nucleate and protected by intellectual property laws. You may not
        copy, modify, or create derivative works of the Service.
      </p>

      <h2>9. Disclaimer of Warranties</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. WE DO NOT
        GUARANTEE THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, NUCLEATE SHALL NOT BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM
        YOUR USE OF THE SERVICE.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless Nucleate from any claims, damages, or
        expenses arising from your use of the Service or violation of these Terms.
      </p>

      <h2>12. Termination</h2>
      <p>
        We may suspend or terminate your access to the Service at any time for violation
        of these Terms. You may terminate your account at any time. Upon termination,
        your right to use the Service ceases.
      </p>

      <h2>13. Changes to Terms</h2>
      <p>
        We may modify these Terms at any time. Material changes will be communicated via
        email or in-app notification. Continued use of the Service after changes
        constitutes acceptance of the modified Terms.
      </p>

      <h2>14. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the United States. Any disputes will be
        resolved in the courts of [Your Jurisdiction].
      </p>

      <h2>15. Contact</h2>
      <p>
        For questions about these Terms, contact us at{" "}
        <a href="mailto:legal@nucleate.dev">legal@nucleate.dev</a>.
      </p>
    </article>
  );
}
