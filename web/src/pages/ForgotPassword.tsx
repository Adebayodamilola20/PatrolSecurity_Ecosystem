import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Mail } from 'lucide-react'
import { api } from '../services/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await api.auth.forgotPassword(email)
      setMessage(res.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-primary shadow-lg shadow-primary/25">
            <Mail className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Reset password</h1>
          <p className="text-sm text-muted-foreground mt-1">Request a secure reset link for your control-center account.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xl">
          {error && <div className="p-3 rounded-lg text-sm bg-destructive/15 text-destructive border border-destructive/20">{error}</div>}
          {message && <div className="p-3 rounded-lg text-sm bg-success/15 text-success border border-success/20">{message}</div>}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Company email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@securecorp.com"
              className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-input focus:outline-none focus:ring-2 focus:ring-ring/50 placeholder:text-muted-foreground"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? 'Sending reset link...' : 'Send reset link'}
          </button>

          <div className="pt-2 border-t border-border space-y-2 text-center">
            <Link to="/login" className="text-sm text-primary hover:underline">Back to sign in</Link>
            <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
              <Building2 className="w-3.5 h-3.5" />
              Password reset works only for existing active company accounts.
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
