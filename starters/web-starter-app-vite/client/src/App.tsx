import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="flex gap-8 mb-8">
        <a href="https://vite.dev" target="_blank" rel="noreferrer">
          <img
            src={viteLogo}
            className="h-24 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#646cffaa]"
            alt="Vite logo"
          />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img
            src={reactLogo}
            className="h-24 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#61dafbaa] animate-[spin_20s_linear_infinite]"
            alt="React logo"
          />
        </a>
      </div>
      <h1 className="text-5xl font-bold mb-8">Vite + React</h1>
      <div className="p-8 rounded-lg bg-card border border-border mb-4">
        <button
          onClick={() => setCount((count) => count + 1)}
          className="rounded-lg border border-transparent px-5 py-2.5 text-base font-medium bg-primary text-primary-foreground cursor-pointer transition-colors hover:bg-primary/90"
        >
          count is {count}
        </button>
        <p className="mt-4 text-muted-foreground">
          Edit <code className="bg-muted px-1.5 py-0.5 rounded text-sm">src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="text-muted-foreground">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  )
}

export default App
