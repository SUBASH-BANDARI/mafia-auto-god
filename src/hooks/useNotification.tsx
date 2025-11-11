import { useState, useCallback } from 'react'
import Notification from '../components/Notification'

interface NotificationItem {
  id: string
  message: string
  type?: 'success' | 'error' | 'info' | 'warning'
}

export function useNotification() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const id = Math.random().toString(36).substring(7)
    setNotifications(prev => [...prev, { id, message, type }])
  }, [])

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const NotificationContainer = () => (
    <>
      {notifications.map(notification => (
        <Notification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </>
  )

  return { showNotification, NotificationContainer }
}

