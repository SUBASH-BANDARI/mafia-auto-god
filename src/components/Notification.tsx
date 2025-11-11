import { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'

interface NotificationProps {
  message: string
  type?: 'success' | 'error' | 'info' | 'warning'
  duration?: number
  onClose?: () => void
}

export default function Notification({ message, type = 'info', duration = 3000, onClose }: NotificationProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onClose?.(), 300) // Wait for fade out animation
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const colors = {
    success: { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#34d399' },
    error: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#f87171' },
    info: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#60a5fa' },
    warning: { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#fbbf24' },
  }

  const color = colors[type]

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: visible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(100px)',
        zIndex: 9999,
        minWidth: '280px',
        maxWidth: '90%',
        p: 1.5,
        borderRadius: 2,
        background: `linear-gradient(135deg, ${color.bg} 0%, rgba(26, 26, 26, 0.95) 100%)`,
        border: `1px solid ${color.border}40`,
        boxShadow: `0 4px 12px rgba(0, 0, 0, 0.4), 0 0 0 1px ${color.border}20`,
        opacity: visible ? 1 : 0,
        transition: 'all 0.3s ease',
        backdropFilter: 'blur(10px)',
      }}
    >
      <Typography
        variant="body2"
        sx={{
          color: color.text,
          fontWeight: 500,
          textAlign: 'center',
          fontSize: '0.85rem',
        }}
      >
        {message}
      </Typography>
    </Box>
  )
}

