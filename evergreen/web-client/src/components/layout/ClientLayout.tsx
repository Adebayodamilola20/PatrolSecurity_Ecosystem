import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { CardSkeleton, LoadingNote } from '../ui/Skeleton'
import Sidebar from './Sidebar'
import Header from './Header'

export default function ClientLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Pages arrive on demand now, so there is a moment between the
              tap and the page. A blank panel there reads as a broken tap. */}
          <Suspense
            fallback={
              <div className="space-y-3">
                <LoadingNote label="Loading…" />
                <CardSkeleton />
                <CardSkeleton />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
