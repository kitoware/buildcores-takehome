import { useState } from 'react'
import './App.css'
import ProductSearch from './components/ProductSearch'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <img src="/buildcores-logo.png" alt="BuildCores Logo" className="logo" />
          <h1>BuildCores</h1>
        </div>
      </header>
      <main>
        <ProductSearch />
      </main>
    </div>
  )
}

export default App
