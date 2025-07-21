"use client";

import PremiumHeader from "@/components/PremiumHeader";
import {
  ChatBubbleLeftIcon,
  PaperAirplaneIcon
} from "@heroicons/react/24/outline";
import { useState } from "react";
import {
  CustomEmbedDefinition,
  DEFAULT_EMBED_DEFINITIONS,
  DefaultEmbedDefinitionType,
  Tldraw
} from "tldraw";
import "tldraw/tldraw.css";

// Custom embed definition for Google and other websites
const customWebsiteEmbed: CustomEmbedDefinition = {
  type: 'website',
  title: 'Website',
  hostnames: ['google.com', 'github.com', 'stackoverflow.com', 'docs.google.com'], // Add more as needed
  minWidth: 300,
  minHeight: 300,
  width: 800,
  height: 600,
  doesResize: true,
  toEmbedUrl: (url) => {
    // For most websites, we can embed them directly
    // Note: Some sites like Google may block iframe embedding due to X-Frame-Options
    return url;
  },
  fromEmbedUrl: (url) => {
    return url;
  },
  icon: '🌐', // Generic web icon
};

// Custom embed definition for JSFiddle
const jsfiddleEmbed: CustomEmbedDefinition = {
  type: 'jsfiddle',
  title: 'JSFiddle',
  hostnames: ['jsfiddle.net'],
  minWidth: 300,
  minHeight: 300,
  width: 720,
  height: 500,
  doesResize: true,
  toEmbedUrl: (url) => {
    const urlObj = new URL(url);
    const matches = urlObj.pathname.match(/\/([^/]+)\/([^/]+)\/(\d+)\/embedded/);
    if (matches) {
      return `https://jsfiddle.net/${matches[1]}/${matches[2]}/embedded/`;
    }
    return;
  },
  fromEmbedUrl: (url) => {
    const urlObj = new URL(url);
    const matches = urlObj.pathname.match(/\/([^/]+)\/([^/]+)\/(\d+)\/embedded/);
    if (matches) {
      return `https://jsfiddle.net/${matches[1]}/${matches[2]}/`;
    }
    return;
  },
  icon: 'https://jsfiddle.net/img/favicon.png',
};

// Custom embed definition for HTML snippets
const htmlSnippetEmbed: CustomEmbedDefinition = {
  type: 'html-snippet',
  title: 'HTML Snippet',
  hostnames: ['data:'], // Using data URLs for HTML content
  minWidth: 200,
  minHeight: 150,
  width: 600,
  height: 400,
  doesResize: true,
  toEmbedUrl: (url) => {
    // Check if it's already a data URL with HTML
    if (url.startsWith('data:text/html')) {
      return url;
    }
    // If it's raw HTML, convert to data URL
    if (url.includes('<') && url.includes('>')) {
      const encodedHtml = encodeURIComponent(url);
      return `data:text/html;charset=utf-8,${encodedHtml}`;
    }
    return;
  },
  fromEmbedUrl: (url) => {
    if (url.startsWith('data:text/html')) {
      try {
        const htmlContent = decodeURIComponent(url.split(',')[1]);
        return htmlContent;
      } catch {
        return url;
      }
    }
    return url;
  },
  icon: '📄', // HTML document icon
};

// Keep some default embeds and add our custom one
const defaultEmbedTypesToKeep: DefaultEmbedDefinitionType[] = ['tldraw', 'youtube'];
const defaultEmbedsToKeep = DEFAULT_EMBED_DEFINITIONS.filter((embed) =>
  defaultEmbedTypesToKeep.includes(embed.type)
);

const embeds = [...defaultEmbedsToKeep, customWebsiteEmbed, jsfiddleEmbed, htmlSnippetEmbed];


export default function CanvasPage() {
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [messages, setMessages] = useState([
    { id: 1, text: "Welcome to the canvas! Draw a UI mockup and click 'Make Real' to convert it to working code.", sender: "assistant", timestamp: new Date() },
  ]);
  const [newMessage, setNewMessage] = useState("");
  const [currentEmbedUrl, setCurrentEmbedUrl] = useState("https://google.com");

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const userMessage = {
      id: messages.length + 1,
      text: newMessage,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages([...messages, userMessage]);
    setNewMessage("");

    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage = {
        id: messages.length + 2,
        text: "I see you're working on something interesting! How can I help you with your design?",
        sender: "assistant",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    }, 1000);
  };

  return (
    <div className="h-screen bg-black flex flex-col">
      <PremiumHeader />

      <div className="flex-1 flex relative">
        {/* Main Canvas Area */}
        <div className={`flex-1 transition-all duration-300 ${isChatOpen ? 'mr-80' : 'mr-0'}`}>
          <div className="h-full w-full">
            <Tldraw
              embeds={embeds}
            />
          </div>
        </div>

        {/* Chat Window */}
        <div className={`fixed right-0 top-0 h-full bg-gray-900 border-l border-gray-700 transition-all duration-300 ${isChatOpen ? 'w-80 translate-x-0' : 'w-80 translate-x-full'}`} style={{ top: '73px' }}>
          {/* Chat Header */}
          <div className="p-4 border-b border-gray-700 bg-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChatBubbleLeftIcon className="w-5 h-5 text-white" />
                <h3 className="text-white font-semibold">Canvas Assistant</h3>
              </div>
              <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {isChatOpen ? '→' : '←'}
              </button>
            </div>



            {/* URL Control Section */}
            <div className="mt-3 pt-3 border-t border-gray-600">
              <label className="block text-sm text-gray-300 mb-2">Embed URL:</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={currentEmbedUrl}
                  onChange={(e) => setCurrentEmbedUrl(e.target.value)}
                  placeholder="https://google.com"
                  className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={() => {
                    setMessages(prev => [...prev, {
                      id: prev.length + 1,
                      text: `URL updated to: ${currentEmbedUrl}. To add this to canvas, use the embed tool and paste this URL.`,
                      sender: "assistant",
                      timestamp: new Date()
                    }]);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors"
                >
                  Update
                </button>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 p-4 space-y-4 h-full overflow-y-auto" style={{ height: 'calc(100vh - 73px - 200px)' }}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${message.sender === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-100'
                    }`}
                >
                  <p className="text-sm">{message.text}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Message Input */}
          <div className="p-4 border-t border-gray-700 bg-gray-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask about your design..."
                className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={handleSendMessage}
                className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Chat Toggle Button (when closed) */}
        {!isChatOpen && (
          <button
            onClick={() => setIsChatOpen(true)}
            className="fixed right-4 bottom-4 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors z-50"
          >
            <ChatBubbleLeftIcon className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}