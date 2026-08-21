'use client'
import React from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '12px' }}>页面出了点问题</h2>
          <p style={{ color: '#888', marginBottom: '20px' }}>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '8px 24px', background: '#2280af', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>重试</button>
          <button onClick={() => window.location.reload()}
            style={{ marginLeft: '12px', padding: '8px 24px', background: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>刷新页面</button>
        </div>
      )
    }
    return this.props.children
  }
}
