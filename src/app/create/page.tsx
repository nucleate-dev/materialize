"use client";

import { SandpackCodeEditor, SandpackLayout, SandpackPreview, SandpackProvider } from "@codesandbox/sandpack-react";



// import dynamic from "next/dynamic";
// import { useState } from "react";

// const MonacoEditor = dynamic(() => import("react-monaco-editor"), {
//   ssr: false,
// });

// const code = `function App() {
//   return (
//     <div className="p-4">
//       <h1 className="text-2xl font-bold text-blue-600">Hello World!</h1>
//       <p className="mt-4 text-gray-600">
//         Edit this component in the editor and see the live preview!
//       </p>
//     </div>
//   );
// }

// export default App;`;

export default function CreatePage() {
  // const [code, setCode] = useState(defaultCode);

  // const handleEditorChange = (value: string) => {
  //   setCode(value);
  // };

  return (
    <SandpackProvider template="react"
      options={{ bundlerURL: "https://sandpack-bundler.codesandbox.io" }}
    >
      <SandpackLayout>
        <SandpackCodeEditor
          showTabs
          showLineNumbers={false}
          showInlineErrors
          wrapContent
          closableTabs
        />
        <SandpackPreview />
      </SandpackLayout>
    </SandpackProvider>
  );
}