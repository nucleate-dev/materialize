"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { useState } from "react";

export default function BlogSubscribe() {
  const [email, setEmail] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubscribing(true);
    
    // Simulate subscription process
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsSubscribed(true);
    setIsSubscribing(false);
    setEmail("");
  };

  if (isSubscribed) {
    return (
      <Card className="max-w-2xl mx-auto bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-2 border-green-200 dark:border-green-800">
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-2xl font-bold mb-3 text-black dark:text-white">Thank you!</h3>
          <p className="text-gray-600 dark:text-gray-300">
            You've been successfully subscribed to our blog updates.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-2 border-blue-200 dark:border-blue-800">
      <CardContent className="p-8">
        <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-2xl font-bold mb-3 text-black dark:text-white text-center">Stay Updated</h3>
        <p className="text-gray-600 dark:text-gray-300 mb-6 text-center">
          Get the latest insights on React Native development and AI-powered prototyping delivered to your inbox.
        </p>
        <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
          <Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
            required
            disabled={isSubscribing}
          />
          <Button 
            type="submit"
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
            disabled={isSubscribing || !email.trim()}
          >
            {isSubscribing ? "Subscribing..." : "Subscribe"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}