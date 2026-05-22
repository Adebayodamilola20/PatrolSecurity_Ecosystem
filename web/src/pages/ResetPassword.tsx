import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { api } from '../services/api'

export default function ResetPassword() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      setError('Reset token is missing')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await api.auth.resetPassword(token, password)
      setMessage(res.message)
      window.setTimeout(() => navigate('/login'), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-primary shadow-lg shadow-primary/25">
            <KeyRound className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Choose a new password</h1>
          <p className="text-sm text-muted-foreground mt-1">Use a strong password with at least 8 characters.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xl">
          {error && <div className="p-3 rounded-lg text-sm bg-destructive/15 text-destructive border border-destructive/20">{error}</div>}
          {message && <div className="p-3 rounded-lg text-sm bg-success/15 text-success border border-success/20">{message}</div>}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">New password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm bg-background border border-input focus:outline-none focus:ring-2 focus:ring-ring/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Confirm password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-input focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? 'Resetting password...' : 'Reset password'}
          </button>

          <div className="pt-2 border-t border-border text-center">
            <Link to="/login" className="text-sm text-primary hover:underline">Back to sign in</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
