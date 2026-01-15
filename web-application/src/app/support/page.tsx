import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support | Nucleate",
  description: "Get help with Nucleate - contact support, documentation, and resources",
};

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link
            href="/"
            className="text-xl font-semibold text-foreground hover:text-primary transition-colors"
          >
            Nucleate
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-12">
        <article className="prose prose-gray dark:prose-invert max-w-none">
          <h1>Support</h1>
          <p className="text-muted-foreground text-lg">
            We&apos;re here to help you get the most out of Nucleate.
          </p>

          <h2>Contact Support</h2>
          <p>
            For technical issues, billing questions, or general inquiries, reach out to our
            support team:
          </p>
          <ul>
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:support@nucleate.dev">support@nucleate.dev</a>
            </li>
            <li>
              <strong>Response time:</strong> We typically respond within 24 hours on business
              days
            </li>
          </ul>

          <h2>Documentation</h2>
          <p>
            Browse our documentation for guides, tutorials, and reference materials:
          </p>
          <ul>
            <li>
              <Link href="/docs">Getting Started Guide</Link>
            </li>
            <li>
              <Link href="/docs/integrations/github">GitHub Integration</Link>
            </li>
            <li>
              <Link href="/docs/integrations/vercel">Vercel Integration</Link>
            </li>
          </ul>

          <h2>Common Issues</h2>

          <h3>Account & Billing</h3>
          <ul>
            <li>
              <strong>Reset password:</strong> Use the &quot;Forgot password&quot; link on the
              login page
            </li>
            <li>
              <strong>Update billing:</strong> Go to Dashboard → Team Settings → Billing
            </li>
            <li>
              <strong>Cancel subscription:</strong> Contact support at{" "}
              <a href="mailto:billing@nucleate.dev">billing@nucleate.dev</a>
            </li>
          </ul>

          <h3>Integrations</h3>
          <ul>
            <li>
              <strong>GitHub not connecting:</strong> Ensure you have admin access to the
              repositories you want to connect
            </li>
            <li>
              <strong>Vercel deployment failing:</strong> Check that your GitHub repository is
              properly linked and contains a valid project
            </li>
          </ul>

          <h3>Editor & Projects</h3>
          <ul>
            <li>
              <strong>Preview not loading:</strong> Try refreshing the page or clearing your
              browser cache
            </li>
            <li>
              <strong>Changes not saving:</strong> Check your internet connection and try again
            </li>
          </ul>

          <h2>Security Issues</h2>
          <p>
            If you discover a security vulnerability, please report it responsibly to{" "}
            <a href="mailto:security@nucleate.dev">security@nucleate.dev</a>. Do not disclose
            security issues publicly until we&apos;ve had a chance to address them.
          </p>

          <h2>Legal</h2>
          <p>
            Review our policies and agreements:
          </p>
          <ul>
            <li>
              <Link href="/legal/terms">Terms of Service</Link>
            </li>
            <li>
              <Link href="/legal/privacy">Privacy Policy</Link>
            </li>
            <li>
              <Link href="/legal/eula">End User License Agreement</Link>
            </li>
          </ul>
        </article>
      </main>
      <footer className="border-t border-border mt-12">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <Link href="/legal/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/legal/eula" className="hover:text-foreground transition-colors">
              EULA
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
