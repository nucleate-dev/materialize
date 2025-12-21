import fs from "fs";
import path from "path";
import matter from "gray-matter";

const docsDirectory = path.join(process.cwd(), "src/content/docs");

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  content: string;
  section: string;
  order: number;
}

export interface DocFrontmatter {
  title: string;
  description: string;
  section: string;
  order: number;
}

export interface DocSection {
  title: string;
  slug: string;
  pages: DocPage[];
}

// Define the section order and titles
export const SECTION_CONFIG: Record<string, { title: string; order: number }> = {
  "getting-started": { title: "Getting Started", order: 1 },
  "build-with-ai": { title: "Build with AI", order: 2 },
  "guides": { title: "Guides", order: 3 },
  "deploy": { title: "Deploy", order: 4 },
  "troubleshooting": { title: "Troubleshooting", order: 5 },
  "reference": { title: "Reference", order: 6 },
};

export function getAllDocs(): DocPage[] {
  if (!fs.existsSync(docsDirectory)) {
    return [];
  }

  const allDocs: DocPage[] = [];

  // Read all section directories
  const sections = fs.readdirSync(docsDirectory);

  for (const section of sections) {
    const sectionPath = path.join(docsDirectory, section);
    const stat = fs.statSync(sectionPath);

    if (stat.isDirectory()) {
      const files = fs.readdirSync(sectionPath);

      for (const fileName of files) {
        if (fileName.endsWith(".mdx")) {
          const slug = fileName.replace(/\.mdx$/, "");
          const fullPath = path.join(sectionPath, fileName);
          const fileContents = fs.readFileSync(fullPath, "utf8");
          const matterResult = matter(fileContents);
          const frontmatter = matterResult.data as DocFrontmatter;

          allDocs.push({
            slug: `${section}/${slug}`,
            title: frontmatter.title,
            description: frontmatter.description,
            content: matterResult.content,
            section: frontmatter.section || section,
            order: frontmatter.order || 0,
          });
        }
      }
    }
  }

  return allDocs;
}

export function getDocBySlug(slug: string): DocPage | null {
  try {
    const fullPath = path.join(docsDirectory, `${slug}.mdx`);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const matterResult = matter(fileContents);
    const frontmatter = matterResult.data as DocFrontmatter;

    // Extract section from slug
    const section = slug.split("/")[0];

    return {
      slug,
      title: frontmatter.title,
      description: frontmatter.description,
      content: matterResult.content,
      section: frontmatter.section || section,
      order: frontmatter.order || 0,
    };
  } catch {
    return null;
  }
}

export function getDocsSidebar(): DocSection[] {
  const allDocs = getAllDocs();
  const sectionsMap = new Map<string, DocPage[]>();

  // Group docs by section
  for (const doc of allDocs) {
    const sectionSlug = doc.slug.split("/")[0];
    if (!sectionsMap.has(sectionSlug)) {
      sectionsMap.set(sectionSlug, []);
    }
    sectionsMap.get(sectionSlug)!.push(doc);
  }

  // Convert to array and sort
  const sections: DocSection[] = [];

  for (const [sectionSlug, pages] of sectionsMap) {
    const config = SECTION_CONFIG[sectionSlug];
    sections.push({
      title: config?.title || sectionSlug,
      slug: sectionSlug,
      pages: pages.sort((a, b) => a.order - b.order),
    });
  }

  // Sort sections by their configured order
  return sections.sort((a, b) => {
    const orderA = SECTION_CONFIG[a.slug]?.order || 999;
    const orderB = SECTION_CONFIG[b.slug]?.order || 999;
    return orderA - orderB;
  });
}

export function getFirstDocSlug(): string | null {
  const sections = getDocsSidebar();
  if (sections.length > 0 && sections[0].pages.length > 0) {
    return sections[0].pages[0].slug;
  }
  return null;
}
