import { Navigate } from 'react-router-dom'

/** Partners are now managed on each branch (Branches page). Old links land there. */
export default function FinancePartners() {
  return <Navigate to="/finance/branches" replace />
}
