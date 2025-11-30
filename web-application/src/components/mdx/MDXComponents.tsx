import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle, Info, Lightbulb } from "lucide-react";

// Custom components for MDX
const MDXComponents = {
  // Typography
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1
      className="text-4xl font-bold mb-6 text-black dark:text-white"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className="text-3xl font-bold mb-4 mt-8 text-black dark:text-white"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      className="text-2xl font-semibold mb-3 mt-6 text-black dark:text-white"
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4
      className="text-xl font-semibold mb-2 mt-4 text-black dark:text-white"
      {...props}
    >
      {children}
    </h4>
  ),
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p
      className="mb-4 leading-relaxed text-gray-700 dark:text-gray-300"
      {...props}
    >
      {children}
    </p>
  ),

  // Lists
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul
      className="list-disc list-inside mb-4 space-y-2 text-gray-700 dark:text-gray-300"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol
      className="list-decimal list-inside mb-4 space-y-2 text-gray-700 dark:text-gray-300"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="mb-1" {...props}>
      {children}
    </li>
  ),

  // Code
  code: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <code
      className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono"
      {...props}
    >
      {children}
    </code>
  ),
  pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 overflow-x-auto mb-6"
      {...props}
    >
      {children}
    </pre>
  ),

  // Links
  a: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      className="text-primary hover:text-primary/80 underline transition-colors"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    >
      {children}
    </a>
  ),

  // Images
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="rounded-lg mb-6 max-w-full h-auto shadow-lg"
      {...props}
    />
  ),

  // Blockquotes
  blockquote: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-4 border-primary pl-4 py-2 mb-6 italic text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 rounded-r-lg"
      {...props}
    >
      {children}
    </blockquote>
  ),

  // Horizontal Rule
  hr: ({ ...props }: React.HTMLAttributes<HTMLHRElement>) => (
    <Separator className="my-8" {...props} />
  ),

  // Custom Components
  Callout: ({
    type = "info",
    children,
    ...props
  }: {
    type?: "info" | "warning" | "success" | "tip";
    children: React.ReactNode;
  }) => {
    const icons = {
      info: <Info className="w-5 h-5" />,
      warning: <AlertCircle className="w-5 h-5" />,
      success: <CheckCircle className="w-5 h-5" />,
      tip: <Lightbulb className="w-5 h-5" />,
    };

    const colors = {
      info: "bg-blue-950/50 border-blue-800 text-blue-200",
      warning: "bg-yellow-950/50 border-yellow-800 text-yellow-200",
      success: "bg-green-950/50 border-green-800 text-green-200",
      tip: "bg-purple-950/50 border-purple-800 text-purple-200",
    };

    return (
      <div
        className={`p-4 rounded-lg border-2 mb-6 ${colors[type]}`}
        {...props}
      >
        <div className="flex items-start gap-3">
          {icons[type]}
          <div className="flex-1">{children}</div>
        </div>
      </div>
    );
  },

  CodeBlock: ({
    language,
    children,
  }: {
    language?: string;
    children: React.ReactNode;
  }) => (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-mono text-gray-600 dark:text-gray-400">
            {language || "code"}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="bg-gray-50 dark:bg-gray-900 rounded p-4 overflow-x-auto">
          <code className="text-sm font-mono">{children}</code>
        </pre>
      </CardContent>
    </Card>
  ),

  // Tables
  table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="overflow-x-auto mb-6">
      <table
        className="min-w-full border border-gray-200 dark:border-gray-700 rounded-lg"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  th: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLTableHeaderCellElement>) => (
    <th
      className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 text-left font-semibold"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLTableDataCellElement>) => (
    <td
      className="border-b border-gray-200 dark:border-gray-700 px-4 py-2"
      {...props}
    >
      {children}
    </td>
  ),
};

export default MDXComponents;
