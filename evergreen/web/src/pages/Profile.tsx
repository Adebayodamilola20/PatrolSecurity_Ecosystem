import { useState } from 'react'
import { User, Shield, Mail, Phone, Calendar, Save } from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'

export default function Profile() {
  const { user, updateProfile } = useAuthStore()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    updateProfile({ name, phone })
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Your account information</p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-8 flex flex-col items-center bg-gradient-to-br from-primary to-info">
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold text-white mb-3 ring-4 ring-white/30">
            {user.name.split(' ').map((n) => n[0]).join('')}
          </div>
          <h2 className="text-xl font-bold text-white">{user.name}</h2>
          <p className="text-sm text-white/80 capitalize">{user.role}</p>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Account Details</h3>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="text-sm text-primary hover:text-primary/80 font-medium"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditing(false); setName(user.name); setPhone(user.phone) }}
                  className="text-sm text-muted-foreground hover:text-foreground font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium"
                >
                  {saved ? 'Saved!' : <><Save className="w-3.5 h-3.5" /> Save</>}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/50">
              <User className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Full Name</p>
                {editing ? (
                  <input
                    type="text" value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                ) : (
                  <p className="text-sm font-medium text-foreground">{user.name}</p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/50">
              <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm text-foreground">{user.email}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/50">
              <Phone className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Phone</p>
                {editing ? (
                  <input
                    type="text" value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                ) : (
                  <p className="text-sm text-foreground">{user.phone || 'Not set'}</p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/50">
              <Shield className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Role</p>
                <p className="text-sm font-medium text-foreground capitalize">{user.role}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              Company account · Managed by system administrator
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
