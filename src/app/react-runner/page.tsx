'use client';

import Editor from '@monaco-editor/react';
import { useState } from 'react';
import { useRunner } from 'react-runner';

const initialCode = `function Demo() {
  const [count, setCount] = React.useState(0)
  
  return (
    <div className="p-4 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">
        React Counter Demo
      </h2>
      <div className="flex items-center space-x-4">
        <button 
          onClick={() => setCount(count - 1)}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          -
        </button>
        <span className="text-xl font-mono text-gray-700">{count}</span>
        <button 
          onClick={() => setCount(count + 1)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          +
        </button>
      </div>
    </div>
  )
}

export default Demo`;

export default function ReactRunnerPage() {
  const [code, setCode] = useState(initialCode);

  const scope = {
    useState: useState,
  };

  const { element, error } = useRunner({ code, scope });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">React Runner Playground</h1>

        <div className="grid grid-cols-2 gap-6 h-[calc(100vh-200px)]">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-gray-800 text-white px-4 py-2 text-sm font-medium">
              Code Editor
            </div>
            <Editor
              height="100%"
              defaultLanguage="javascript"
              value={code}
              onChange={(value) => setCode(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>

          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-2 text-sm font-medium">
              Live Preview
            </div>
            <div className="p-4 h-full overflow-auto">
              {error ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="text-red-800 font-medium mb-2">Error:</h3>
                  <pre className="text-red-700 text-sm whitespace-pre-wrap">
                    {error}
                  </pre>
                </div>
              ) : (
                <div className="h-full">
                  {element}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-800 mb-2">💡 Tips:</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Edit the code on the left to see live changes on the right</li>
            <li>• Use React hooks like useState, useEffect by adding them to the scope</li>
            <li>• Export your component as default or return JSX directly</li>
            <li>• Tailwind CSS classes are available for styling</li>
          </ul>
        </div>
      </div>
    </div>
  );
}