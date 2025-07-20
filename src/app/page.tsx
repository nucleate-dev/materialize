import {
  ArrowsPointingOutIcon,
  CodeBracketIcon,
  DevicePhoneMobileIcon,
  EyeIcon,
  PaintBrushIcon,
  PlayIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";

export default function Home() {
  return (
    <main className="bg-black overflow-hidden">
      <Header />
      <HeroSection />
      <FeaturesSection />
    </main>
  );
}

function Header() {
  return (
    <header className="relative z-50 bg-black/50 backdrop-blur-xl border-b border-white/5">
      <div className="container mx-auto px-6 py-4">
        <nav className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-gray-400 to-white rounded-lg flex items-center justify-center">
              <SparklesIcon className="w-5 h-5 text-black" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Materialize
            </span>
          </div>

          {/* Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-gray-300 hover:text-white transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">
              Pricing
            </a>
            <a href="#about" className="text-gray-300 hover:text-white transition-colors">
              About
            </a>
          </div>

          {/* CTA Button */}
          <button className="bg-gradient-to-r from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900 text-white px-6 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-lg shadow-gray-500/25 hover:shadow-gray-500/40">
            Get started
          </button>
        </nav>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-gray-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gray-500/10 rounded-full blur-3xl"></div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-conic from-gray-500/5 via-transparent to-gray-500/5 rounded-full blur-2xl"></div>

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:100px_100px]"></div>

      <div className="relative z-10 container mx-auto px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-2 mt-8 mb-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full">
          <span className="text-sm text-gray-300">Speed of Thought Prototyping</span>
        </div>

        {/* Main Heading */}
        <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold mb-8 leading-tight">
          <span className="block bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent relative">
            Materialize
            <div className="absolute inset-0 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent opacity-50 blur-sm"></div>
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl text-gray-400 max-w-4xl mx-auto mb-12 leading-relaxed">
          Materialize helps you prototype your ideas, workshop new designs, and build out high-quality user flows at the speed of thought. Start with an infinite canvas to protoshop React and React Native components fast and connect them directly to your app.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <button className="group relative px-8 py-4 bg-gradient-to-r from-gray-600 to-gray-800 text-white font-semibold rounded-xl shadow-2xl shadow-gray-500/25 hover:shadow-gray-500/40 transition-all duration-300 hover:scale-105">
            <span className="relative z-10">Get started</span>
            <div className="absolute inset-0 bg-gradient-to-r from-gray-700 to-gray-900 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </button>
        </div>

        {/* Demo Video Placeholder */}
        <div className="relative max-w-6xl mx-auto">
          <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
            {/* Video Player Mock */}
            <div className="aspect-video bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
              <div className="w-20 h-20 bg-white/10 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-colors cursor-pointer group">
                <PlayIcon className="w-8 h-8 text-white ml-1 group-hover:scale-110 transition-transform" />
              </div>
            </div>

            {/* Floating UI Elements */}
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-xl border border-white/10 rounded-lg px-3 py-2">
              <span className="text-white text-sm font-medium">● Infinite Canvas</span>
            </div>

            <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-xl border border-white/10 rounded-lg px-4 py-2">
              <span className="text-gray-300 text-sm">React + React Native</span>
            </div>
          </div>

          {/* Glow Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-gray-500/10 to-gray-500/10 rounded-2xl blur-3xl -z-10 scale-105"></div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: <ArrowsPointingOutIcon className="w-8 h-8" />,
      title: "Infinite Canvas & Flow Branching",
      description: "Compare 5–10 UX ideas side-by-side in one space—no file/version sprawl, faster convergence.",
      gradient: "from-gray-400 to-gray-600"
    },
    {
      icon: <PaintBrushIcon className="w-8 h-8" />,
      title: "Taste-Trained AI Variants",
      description: "One click produces polished, best-practice screens (onboarding, checkout, empty states) so you skip blank-canvas lag.",
      gradient: "from-gray-500 to-gray-700"
    },
    {
      icon: <EyeIcon className="w-8 h-8" />,
      title: "Dive-In Component Editing",
      description: "Double-click to tweak props, layout, or copy with instant live re-render—stay in creative flow.",
      gradient: "from-gray-600 to-gray-800"
    },
    {
      icon: <DevicePhoneMobileIcon className="w-8 h-8" />,
      title: "React + React Native Preview",
      description: "Prototype web and mobile flows together; reuse patterns and decide platform nuances early.",
      gradient: "from-gray-700 to-gray-900"
    },
    {
      icon: <CodeBracketIcon className="w-8 h-8" />,
      title: "One-Click Code Export",
      description: "Output clean JSX / RN Web or open a sandbox—eliminates hand-off rebuild time and accelerates implementation.",
      gradient: "from-gray-800 to-white"
    }
  ];

  return (
    <section className="relative py-32 bg-gradient-to-b from-black to-gray-900">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(75,85,99,0.1),transparent_70%)]"></div>

      <div className="relative z-10 container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Materialize's Core
            </span>
            <br />
            <span className="bg-gradient-to-r from-gray-400 to-white bg-clip-text text-transparent">
              Features & Capabilities
            </span>
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Build high-quality user flows at the speed of thought with infinite canvas prototyping.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {features.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, description, gradient }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}) {
  return (
    <div className="group relative">
      {/* Card Background */}
      <div className="relative bg-gradient-to-br from-white/5 to-white/2 backdrop-blur-xl border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-all duration-300">
        {/* Icon */}
        <div className={`inline-flex p-3 bg-gradient-to-r ${gradient} rounded-xl mb-6 shadow-lg`}>
          <div className="text-white">
            {icon}
          </div>
        </div>

        {/* Content */}
        <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-gray-100 transition-colors">
          {title}
        </h3>
        <p className="text-gray-400 text-lg leading-relaxed group-hover:text-gray-300 transition-colors">
          {description}
        </p>

        {/* Hover Glow */}
        <div className={`absolute inset-0 bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300 pointer-events-none`}></div>
      </div>

      {/* Background Glow */}
      <div className={`absolute inset-0 bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-10 rounded-2xl blur-xl transition-opacity duration-300 -z-10 scale-105`}></div>
    </div>
  );
}