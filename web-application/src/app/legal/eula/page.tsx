import { Metadata } from "next";

export const metadata: Metadata = {
  title: "End User License Agreement | Nucleate",
  description: "Nucleate End User License Agreement (EULA)",
};

export default function EULAPage() {
  return (
    <article className="prose prose-gray dark:prose-invert max-w-none">
      <h1>End User License Agreement</h1>
      <p className="text-muted-foreground">Last updated: January 15, 2026</p>

      <p>
        This End User License Agreement (&quot;Agreement&quot;) is a legal agreement between you
        (&quot;User&quot; or &quot;you&quot;) and Nucleate (&quot;Company,&quot; &quot;we,&quot; or &quot;us&quot;) for the use of
        the Nucleate platform and related services (&quot;Service&quot;).
      </p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using the Service, you agree to be bound by this Agreement. If you
        do not agree to these terms, do not use the Service.
      </p>

      <h2>2. License Grant</h2>
      <p>
        Subject to the terms of this Agreement, we grant you a limited, non-exclusive,
        non-transferable, revocable license to access and use the Service for your
        personal or business purposes.
      </p>

      <h2>3. Restrictions</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Copy, modify, or distribute the Service or its content</li>
        <li>Reverse engineer, decompile, or disassemble the Service</li>
        <li>Use the Service for any unlawful purpose</li>
        <li>Interfere with or disrupt the Service or servers</li>
        <li>Attempt to gain unauthorized access to any part of the Service</li>
        <li>Use the Service to develop competing products</li>
      </ul>

      <h2>4. Intellectual Property</h2>
      <p>
        The Service and its original content, features, and functionality are owned by
        Nucleate and are protected by international copyright, trademark, patent, trade
        secret, and other intellectual property laws.
      </p>

      <h2>5. User Content</h2>
      <p>
        You retain ownership of any code, content, or materials you create using the
        Service (&quot;User Content&quot;). You grant us a license to host, store, and display
        your User Content solely for the purpose of providing the Service.
      </p>

      <h2>6. Third-Party Integrations</h2>
      <p>
        The Service may integrate with third-party services such as GitHub, Vercel, and
        others. Your use of these integrations is subject to the respective third-party
        terms of service. We are not responsible for any third-party services.
      </p>

      <h2>7. Disclaimer of Warranties</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY
        KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES
        OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        IN NO EVENT SHALL NUCLEATE BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
        CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS,
        DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
      </p>

      <h2>9. Termination</h2>
      <p>
        We may terminate or suspend your access to the Service immediately, without prior
        notice or liability, for any reason, including breach of this Agreement. Upon
        termination, your right to use the Service will cease immediately.
      </p>

      <h2>10. Changes to Agreement</h2>
      <p>
        We reserve the right to modify this Agreement at any time. We will notify users of
        any material changes by posting the new Agreement on this page. Your continued use
        of the Service after changes constitutes acceptance of the modified Agreement.
      </p>

      <h2>11. Governing Law</h2>
      <p>
        This Agreement shall be governed by and construed in accordance with the laws of
        the United States, without regard to its conflict of law provisions.
      </p>

      <h2>12. Contact Us</h2>
      <p>
        If you have any questions about this Agreement, please contact us at{" "}
        <a href="mailto:legal@nucleate.dev">legal@nucleate.dev</a>.
      </p>
    </article>
  );
}
