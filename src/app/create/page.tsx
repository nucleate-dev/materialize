"use client";

import { Sandpack } from "@codesandbox/sandpack-react";
// import dynamic from "next/dynamic";
// import { useState } from "react";

// const MonacoEditor = dynamic(() => import("react-monaco-editor"), {
//   ssr: false,
// });

const code = `function App() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-blue-600">Hello World!</h1>
      <p className="mt-4 text-gray-600">
        Edit this component in the editor and see the live preview!
      </p>
    </div>
  );
}

export default App;`;

export default function CreatePage() {
  // const [code, setCode] = useState(defaultCode);

  // const handleEditorChange = (value: string) => {
  //   setCode(value);
  // };

  return (
    <div>
      <Sandpack
        template="react"
        files={{
          "/App.js": code,
        }}
        options={{
          showNavigator: false,
          showTabs: false,
          showLineNumbers: true,
          editorHeight: "100vh",
          layout: "preview",
        }}
        theme="light"
      />
    </div >
  );
}