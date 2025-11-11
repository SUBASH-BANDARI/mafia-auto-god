import React from 'react'
import { Card, CardContent, Typography, Button, Stack } from '@mui/material'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6" color="error">
                Something went wrong
              </Typography>
              <Typography variant="body2">
                {this.state.error?.message || 'An unexpected error occurred'}
              </Typography>
              <Button 
                variant="contained" 
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                  window.location.reload()
                }}
              >
                Reload Page
              </Button>
              <Typography variant="caption" color="text.secondary">
                Check the browser console (F12) for more details
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}

