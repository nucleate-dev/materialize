import {
  ShieldCheckIcon,
  BoltIcon,
  CogIcon,
  ChatBubbleBottomCenterIcon,
  CloudArrowUpIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";
import { ProductKeys } from "@/GlobalConstants";
import { PricingCard } from "./landing_components/Pricing";
import Header from "./landing_components/Header";
import { FAQItem } from "./landing_components/Faqs";

export default function Home() {
  return (
    <main className="bg-slate-50">
      <Header />
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      <TestimonialSection />
      <FAQSection />
      <footer className="bg-gray-800 text-white text-center p-4">
        <p>&copy; 2024 MyApp. All rights reserved.</p>
      </footer>
    </main>
  );
}

function HeroSection() {
  return (
    <section className="relative bg-gradient-to-b from-gray-900 to-gray-800 py-24">
      <div className="container mx-auto text-center px-4 sm:px-6 lg:px-8">
        {/* Title */}
        <h1 className="text-5xl font-extraboldleading-tight mb-6">
          Shaping a world with <br /> reimagination.
        </h1>
        {/* Subtitle */}
        <p className="text-lg text-gray-300 max-w-2xl mx-auto mb-10">
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Odio incidunt
          nam itaque sed eius modi error totam sit illum. Voluptas doloribus
          asperiores quaerat aperiam. Quidem harum omnis beatae ipsum soluta!
        </p>
        {/* Buttons */}
        <div className="flex justify-center space-x-4 mb-12">
          <a
            href="#pricing"
            className="inline-block px-8 py-3 text-base font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg"
          >
            Get started
          </a>
          <a
            href="#features"
            className="inline-block px-8 py-3 text-base font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg"
          >
            Learn more
          </a>
        </div>
        {/* Features Section */}
        {/* Logos Section */}
        <div className="mt-16 text-center">
          {/* Trusted by Heading */}
          <h4 className="text-lg font-semibold text-gray-300">Trusted by</h4>
          <div className="mt-8 flex justify-center items-center space-x-20 opacity-70">
            <Image
              src="https://logo.clearbit.com/microsoft.com"
              alt="Microsoft"
              className="h-10"
              height={40}
              width={40}
            />
            <Image
              src="https://logo.clearbit.com/airbnb.com"
              alt="Airbnb"
              className="h-10"
              height={40}
              width={40}
            />
            <Image
              src="https://logo.clearbit.com/google.com"
              alt="Google"
              className="h-10"
              height={40}
              width={40}
            />
            <Image
              src="https://logo.clearbit.com/netflix.com"
              alt="Netflix"
              className="h-10"
              height={40}
              width={40}
            />
            <Image
              src="https://logo.clearbit.com/cloud.google.com"
              alt="Google Cloud"
              className="h-10"
              height={40}
              width={40}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-gray-50">
      <div className="container mx-auto text-center">
        <h2 className="text-4xl font-bold mb-12">Why Choose Us?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-12">
          <FeatureCard
            icon={<ShieldCheckIcon className="w-12 h-12 text-purple-500" />}
            title="Advanced Security"
            description="Your data is safe with our top-notch security systems."
          />
          <FeatureCard
            icon={<BoltIcon className="w-12 h-12 text-purple-500" />}
            title="Fast Performance"
            description="Experience blazing fast performance with our optimized platform."
          />
          <FeatureCard
            icon={<CogIcon className="w-12 h-12 text-purple-500" />}
            title="Customizable"
            description="Easily customize features to fit your specific needs."
          />
          <FeatureCard
            icon={
              <ChatBubbleBottomCenterIcon className="w-12 h-12 text-purple-500" />
            }
            title="24/7 Support"
            description="Our support team is available anytime to assist you."
          />
          <FeatureCard
            icon={<CloudArrowUpIcon className="w-12 h-12 text-purple-500" />}
            title="Cloud Integration"
            description="Seamlessly integrate with all your favorite cloud services."
          />
          <FeatureCard
            icon={<LockClosedIcon className="w-12 h-12 text-purple-500" />}
            title="Privacy Focused"
            description="We prioritize privacy with our end-to-end encryption."
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: JSX.Element;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 bg-white rounded-lg shadow-lg text-center hover:shadow-xl transition-shadow duration-300">
      <div className="mb-4 flex justify-center">{icon}</div>
      <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="py-20 bg-gray-50">
      <div className="container mx-auto text-center">
        <h2 className="text-4xl font-bold mb-12">Our Pricing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          <PricingCard
            title="Basic Plan"
            price="$99"
            features={["Feature 1", "Feature 2", "Feature 3"]}
            popular={false}
            productKey={ProductKeys.BASE_SUBSCRIPTION}
          />
          <PricingCard
            title="Pro Plan"
            price="$129"
            features={["Feature 1", "Feature 2", "Feature 3", "Feature 4"]}
            popular={true} // Mark this plan as the most popular
            productKey={ProductKeys.PRO_SUBSCRIPTION}
          />
          <PricingCard
            title="Premium Plan"
            price="$250"
            features={[
              "Feature 1",
              "Feature 2",
              "Feature 3",
              "Feature 4",
              "Feature 5",
            ]}
            popular={false}
            productKey={ProductKeys.PRO_SUBSCRIPTION}
          />
        </div>
      </div>
    </section>
  );
}

function TestimonialSection() {
  const testimonials = [
    {
      name: "Daniella Doe",
      role: "Mobile Dev",
      image: "https://randomuser.me/api/portraits/women/1.jpg",
      testimony:
        "Lorem ipsum dolor sit amet consectetur adipisicing elit. Illum aliquid quo eum quae quos illo earum ipsam.",
    },
    {
      name: "Yanick Doe",
      role: "Developer",
      image: "https://randomuser.me/api/portraits/men/1.jpg",
      testimony:
        "Lorem ipsum dolor sit amet consectetur, adipisicing elit. Architecto laboriosam deleniti aperiam ab veniam sint.",
    },
    {
      name: "Andy Doe",
      role: "Manager",
      image: "https://randomuser.me/api/portraits/men/2.jpg",
      testimony:
        "Lorem ipsum dolor sit amet consectetur, adipisicing elit. Architecto laboriosam deleniti aperiam ab veniam sint.",
    },
    {
      name: "Jane Doe",
      role: "Marketing",
      image: "https://randomuser.me/api/portraits/women/2.jpg",
      testimony:
        "Lorem ipsum dolor sit amet laboriosam deleniti aperiam ab veniam sint non cumque quis tempore cupiditate.",
    },
    {
      name: "Jane Doe",
      role: "Mobile Dev",
      image: "https://randomuser.me/api/portraits/women/3.jpg",
      testimony:
        "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Architecto laboriosam deleniti aperiam ab veniam sint.",
    },
    {
      name: "Yanny Doe",
      role: "Mobile Dev",
      image: "https://randomuser.me/api/portraits/men/3.jpg",
      testimony:
        "Lorem ipsum dolor sit amet consectetur, adipisicing elit. Architecto laboriosam deleniti aperiam ab veniam sint.",
    },
  ];

  return (
    <section id="testimonials" className="py-20 bg-gray-900">
      <div className="container mx-auto px-4">
        <h2 className="text-4xl font-bold text-center mb-12">
          We have some fans.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <TestimonialCard key={index} testimonial={testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({
  testimonial,
}: {
  testimonial: { name: string; role: string; image: string; testimony: string };
}) {
  return (
    <div className="p-6 bg-gray-800 rounded-xl shadow-lg">
      <div className="flex items-center mb-4">
        <Image
          src={testimonial.image}
          alt={testimonial.name}
          className="rounded-full mr-4"
          height={48}
          width={48}
        />
        <div>
          <h3 className="text-lg font-semibold">{testimonial.name}</h3>
          <p className="text-sm text-gray-400">{testimonial.role}</p>
        </div>
      </div>
      <p className="text-gray-300">{testimonial.testimony}</p>
    </div>
  );
}

function FAQSection() {
  const faqs = [
    {
      question: "What is MyApp?",
      answer:
        "MyApp is a complete dev starter pack designed to help developers build apps quickly and efficiently with pre-built templates and features.",
    },
    {
      question: "How does billing work?",
      answer:
        "We offer both one-time payments and subscription options, allowing you to choose the best plan that fits your needs.",
    },
    {
      question: "Can I cancel my subscription?",
      answer:
        "Yes, you can cancel your subscription at any time from your account dashboard without any additional charges.",
    },
    {
      question: "Do you offer customer support?",
      answer:
        "Yes, we provide 24/7 customer support. You can contact us via email or our live chat support.",
    },
    {
      question: "Is there a free trial available?",
      answer:
        "Yes, we offer a 14-day free trial so you can explore all the features before committing to a subscription plan.",
    },
  ];

  return (
    <section id="faq" className="py-20 bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-800">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-gray-600 mt-4">
            Here are some of the most common questions we receive.
          </p>
        </div>
        <div className="max-w-4xl mx-auto divide-y divide-slate-300">
          {faqs.map((faq, index) => (
            <FAQItem key={index} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </div>
    </section>
  );
}
