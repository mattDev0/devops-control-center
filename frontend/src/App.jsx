import { useState, useEffect } from 'react'
import { Server, Activity, Clock, Terminal } from 'lucide-react'

function App() {
  const [serverData, setServerData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      // Because of our vite proxy, this routes to http://localhost:8080/api/servers/health
      const response = await fetch('/api/servers/health')
      if (!response.ok) throw new Error("Failed to fetch from orchestrator")
      
      const data = await response.json()
      setServerData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8 flex items-center gap-3">
        <Terminal className="w-8 h-8 text-emerald-400" />
        <h1 className="text-3xl font-bold text-white">DevOps Control Center</h1>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Server Card */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-semibold">Local WSL Agent</h2>
            </div>
            {/* Status Indicator */}
            <span className="flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-3 w-3 rounded-full opacity-75 ${serverData && !error ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${serverData && !error ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            </span>
          </div>

          {loading ? (
            <p className="text-slate-400">Pinging orchestrator...</p>
          ) : error ? (
            <p className="text-red-400 text-sm">{error}</p>
          ) : serverData?.error ? (
             <p className="text-red-400 text-sm">Agent unreachable. Is Rust running?</p>
          ) : (
            <div className="space-y-4 mt-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400 flex items-center gap-2"><Activity className="w-4 h-4"/> OS</span>
                <span className="font-mono bg-slate-900 px-2 py-1 rounded text-emerald-400">
                  {serverData.os_name} {serverData.os_version}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400 flex items-center gap-2"><Clock className="w-4 h-4"/> Uptime</span>
                <span className="font-mono bg-slate-900 px-2 py-1 rounded text-emerald-400">
                  {formatUptime(serverData.uptime_seconds)}
                </span>
              </div>
            </div>
          )}

          <button 
            onClick={fetchHealth}
            className="mt-6 w-full bg-slate-700 hover:bg-slate-600 transition-colors py-2 rounded-lg text-sm font-semibold"
          >
            Refresh Status
          </button>
        </div>
      </main>
    </div>
  )
}

export default App