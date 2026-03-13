import { useNavigate } from 'react-router-dom'
import UserDashboard from '../components/UserDashboard.jsx'

export default function AccountPage() {
  const navigate = useNavigate()

  function handleClose() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/')
  }

  return <UserDashboard pageMode onClose={handleClose} />
}
