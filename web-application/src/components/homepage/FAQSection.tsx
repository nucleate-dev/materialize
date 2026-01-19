/**
 * FAQ SECTION - Server Component
 * Static frequently asked questions
 */
export default function FAQSection() {
  const featuredFAQs = [
    {
      q: "How does repo sync work?",
      a: "You never have to do manual syncing. Nucleate's agents will always stay up to date on your repo's latest state.",
    },
    {
      q: "Does it use our existing components?",
      a: "Yes. Unlike generic AI tools, Nucleate prioritizes using your existing library. If you have a 'Button' or 'Card' component, Nucleate will use them instead of generating new ones.",
    },
    {
      q: "How does the PR workflow work?",
      a: "After you're happy with a prototype, you can click 'Open PR'. Nucleate will branch from your main, commit the new screens and components, and create a Pull Request for your review.",
    },
    {
      q: "Is our code sent externally?",
      a: "We only send the necessary context (component signatures and tokens) to the model to generate the UI. Your source code is never used to train models.",
    },
  ];

  return (
    <section className="py-24 bg-background border-t border-border">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-medium text-foreground mb-4">
            Questions?
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 max-w-4xl mx-auto">
          {featuredFAQs.map((faq, index) => (
            <div
              key={index}
              className="bg-card border border-border rounded-2xl p-6 hover:border-border/80 transition-all hover:-translate-y-1 animate-fade-in-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <h3 className="text-lg font-medium text-foreground mb-3">
                {faq.q}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
